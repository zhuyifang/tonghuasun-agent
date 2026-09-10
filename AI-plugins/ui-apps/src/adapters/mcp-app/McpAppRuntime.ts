import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type AppEventMap,
  type McpUiHostContext
} from "@modelcontextprotocol/ext-apps";

export type JsonObject = Record<string, unknown>;
export type McpToolResult = AppEventMap["toolresult"];

export interface OriginatingToolSnapshot {
  name?: string;
  arguments?: JsonObject;
  result?: McpToolResult;
}

export interface OptionalHostExtensions {
  /** OpenAI 私有桥只做能力检测，业务逻辑始终使用标准 MCP Apps 协议。 */
  openaiBridge: boolean;
}

type ToolInputListener = (argumentsValue: JsonObject) => void;
type ToolResultListener = (result: McpToolResult) => void;

/**
 * 所有厂商共用的 MCP Apps 生命周期封装。这里仅处理标准 postMessage
 * 通信、宿主样式和销毁，不感知任何具体 Vue 组件或页面布局。
 */
export class McpAppRuntime {
  readonly extensions: OptionalHostExtensions;

  private readonly app: App;
  private readonly inputListeners = new Set<ToolInputListener>();
  private readonly resultListeners = new Set<ToolResultListener>();
  private latestArguments?: JsonObject;
  private latestResult?: McpToolResult;
  private connected = false;

  constructor(name: string, version = "0.1.0") {
    this.extensions = detectOptionalHostExtensions();
    this.app = new App(
      { name, version },
      {},
      { autoResize: true, strict: true, allowUnsafeEval: false }
    );

    // 一次性通知必须在 connect 前注册，避免严格宿主在握手后立即发送时丢失。
    this.app.addEventListener("toolinput", ({ arguments: value }) => {
      const argumentsValue = isJsonObject(value) ? value : {};
      this.latestArguments = argumentsValue;
      for (const listener of this.inputListeners) listener(argumentsValue);
    });
    this.app.addEventListener("toolresult", (result) => {
      this.latestResult = result;
      for (const listener of this.resultListeners) listener(result);
    });
    this.app.addEventListener("hostcontextchanged", (context) => applyHostContext(context));
    this.app.onteardown = async () => {
      this.inputListeners.clear();
      this.resultListeners.clear();
      return {};
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.app.connect();
    this.connected = true;
    applyHostContext(this.app.getHostContext());
  }

  async callTool(name: string, argumentsValue: JsonObject): Promise<McpToolResult> {
    if (!this.connected) throw new Error("MCP App 尚未完成连接。");
    return this.app.callServerTool({ name, arguments: argumentsValue });
  }

  getOriginatingToolSnapshot(): OriginatingToolSnapshot {
    return {
      name: this.app.getHostContext()?.toolInfo?.tool.name,
      arguments: this.latestArguments,
      result: this.latestResult
    };
  }

  waitForToolInput(timeoutMs = 5_000): Promise<JsonObject | undefined> {
    if (this.latestArguments) return Promise.resolve(this.latestArguments);
    return waitForFirst(this.inputListeners, timeoutMs);
  }

  waitForToolResult(timeoutMs = 2_000): Promise<McpToolResult | undefined> {
    if (this.latestResult) return Promise.resolve(this.latestResult);
    return waitForFirst(this.resultListeners, timeoutMs);
  }

  async destroy(): Promise<void> {
    this.inputListeners.clear();
    this.resultListeners.clear();
    await this.app.close();
    this.connected = false;
  }
}

function waitForFirst<T>(listeners: Set<(value: T) => void>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const listener = (value: T): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      listeners.delete(listener);
      resolve(value);
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      listeners.delete(listener);
      resolve(undefined);
    }, Math.max(0, timeoutMs));
    listeners.add(listener);
  });
}

function applyHostContext(context: Partial<McpUiHostContext> | undefined): void {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

function detectOptionalHostExtensions(): OptionalHostExtensions {
  const candidate = (globalThis as typeof globalThis & { openai?: unknown }).openai;
  return Object.freeze({ openaiBridge: candidate !== undefined && candidate !== null });
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
