import type {
  JsonObject,
  McpToolResult,
  OriginatingToolSnapshot
} from "@/adapters/mcp-app/McpAppRuntime";

const SET_GLOBALS_EVENT = "openai:set_globals";

interface OpenAiComponentApi {
  toolInput?: unknown;
  toolOutput?: unknown;
  toolResponseMetadata?: unknown;
  callTool?: (name: string, argumentsValue: JsonObject) => Promise<unknown>;
}

interface OpenAiWindowLike {
  openai?: OpenAiComponentApi;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface OpenAiSnapshot extends OriginatingToolSnapshot {
  available: boolean;
  canCallTool: boolean;
}

type SnapshotListener = (snapshot: OpenAiSnapshot) => void;

/**
 * OpenAI 的兼容接口适配器。公共运行时仍优先使用 MCP Apps 标准能力；
 * 这里只补齐 Codex/ChatGPT 暴露的首屏结果与工具调用别名。
 */
export class OpenAiComponentBridge {
  private readonly listeners = new Set<SnapshotListener>();
  private listening = false;

  constructor(private readonly scope: OpenAiWindowLike = window) {}

  getSnapshot(): OpenAiSnapshot {
    const api = this.scope.openai;
    if (!api) return { available: false, canCallTool: false };
    return {
      available: true,
      canCallTool: typeof api.callTool === "function",
      arguments: isJsonObject(api.toolInput) ? api.toolInput : undefined,
      result: readToolResult(api)
    };
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    if (!this.listening) {
      this.scope.addEventListener(SET_GLOBALS_EVENT, this.handleGlobalsChanged);
      this.listening = true;
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stopListening();
    };
  }

  async callTool(name: string, argumentsValue: JsonObject): Promise<McpToolResult> {
    const api = this.scope.openai;
    if (typeof api?.callTool !== "function") {
      throw new Error("当前 AI 工具没有提供界面工具调用能力。");
    }
    const rawResult = await api.callTool.call(api, name, argumentsValue);
    const result = normalizeToolResult(rawResult);
    if (!result) throw new Error("AI 工具返回的工具结果格式无效。");
    return result;
  }

  destroy(): void {
    this.listeners.clear();
    this.stopListening();
  }

  private readonly handleGlobalsChanged: EventListener = () => {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  };

  private stopListening(): void {
    if (!this.listening) return;
    this.scope.removeEventListener(SET_GLOBALS_EVENT, this.handleGlobalsChanged);
    this.listening = false;
  }
}

function readToolResult(api: OpenAiComponentApi): McpToolResult | undefined {
  if (isJsonObject(api.toolResponseMetadata)) {
    const completeResult = normalizeToolResult(api.toolResponseMetadata.mcp_tool_result);
    if (completeResult) return completeResult;
  }
  if (!isCompleteStructuredOutput(api.toolOutput)) return undefined;
  return {
    content: [],
    structuredContent: api.toolOutput
  } as McpToolResult;
}

/** FQGate 隐藏敏感结果时 toolOutput 只有状态，不可误当作可供组件消费的完整结果。 */
function isCompleteStructuredOutput(value: unknown): value is JsonObject {
  if (!isJsonObject(value)) return false;
  if (typeof value.ok !== "boolean") return true;
  return Object.hasOwn(value, "data") || Object.hasOwn(value, "error");
}

function normalizeToolResult(value: unknown): McpToolResult | undefined {
  if (!isJsonObject(value)) return undefined;
  const hasContent = Array.isArray(value.content);
  const hasStructuredContent = isJsonObject(value.structuredContent);
  const hasMetadata = isJsonObject(value._meta);
  if (!hasContent && !hasStructuredContent && !hasMetadata) return undefined;
  return {
    ...value,
    content: hasContent ? value.content : []
  } as McpToolResult;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
