import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  LoggingMessageNotificationSchema,
  PromptListChangedNotificationSchema,
  ReadResourceRequestSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  ToolListChangedNotificationSchema,
  UnsubscribeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import {
  appendStructuredContentTextFallback,
  isStructuredContentTextCompatibilityEnabled
} from "./toolResultCompatibility.js";

type ProductConfig = {
  preferredPort?: number;
  localAccessToken?: string;
};

type RuntimeEndpoint = {
  mcpUrl?: string;
  baseUrl?: string;
  port?: number;
};

const BRIDGE_VERSION = "0.2.9";
const ACCESS_TOKEN_HEADER = "X-Tonghuasun-Codex-Token";
const TEXT_COMPATIBILITY_ENABLED = isStructuredContentTextCompatibilityEnabled(
  process.env.TONGHUASUN_MCP_TEXT_COMPATIBILITY
);

await main();

async function main(): Promise<void> {
  const connection = discoverConnection();
  const upstream = new Client({ name: "tonghuasun-agent-bridge", version: BRIDGE_VERSION });
  const upstreamTransport = new StreamableHTTPClientTransport(new URL(connection.mcpUrl), {
    requestInit: {
      headers: {
        [ACCESS_TOKEN_HEADER]: connection.accessToken
      }
    }
  });

  // SDK 1.28 的 Transport 接口与实现类在严格可选属性规则下存在类型偏差，
  // 这里仅收窄到 Client.connect 的公开参数类型，不改变实际传输对象。
  await upstream.connect(upstreamTransport as Parameters<Client["connect"]>[0]);
  const upstreamCapabilities = upstream.getServerCapabilities() ?? {};
  const downstream = new Server(
    { name: "tonghuasun-mcp", version: upstream.getServerVersion()?.version ?? BRIDGE_VERSION },
    {
      capabilities: {
        ...(upstreamCapabilities.tools ? { tools: upstreamCapabilities.tools } : {}),
        ...(upstreamCapabilities.resources ? { resources: upstreamCapabilities.resources } : {}),
        ...(upstreamCapabilities.prompts ? { prompts: upstreamCapabilities.prompts } : {}),
        ...(upstreamCapabilities.completions ? { completions: upstreamCapabilities.completions } : {}),
        ...(upstreamCapabilities.logging ? { logging: {} } : {})
      },
      instructions: "同花顺本地 MCP 的透明传输桥；工具、资源和提示词均由同花顺宿主提供。"
    }
  );

  registerForwarders(upstream, downstream, upstreamCapabilities, TEXT_COMPATIBILITY_ENABLED);
  registerNotifications(upstream, downstream);

  const stdio = new StdioServerTransport();
  const close = async () => {
    await Promise.allSettled([downstream.close(), upstream.close()]);
  };
  process.once("SIGINT", () => void close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
  process.once("uncaughtException", (error) => {
    console.error(`同花顺 MCP 传输桥异常：${formatError(error)}`);
    void close().finally(() => process.exit(1));
  });

  await downstream.connect(stdio);
}

function registerForwarders(
  upstream: Client,
  downstream: Server,
  capabilities: ReturnType<Client["getServerCapabilities"]>,
  textCompatibilityEnabled: boolean
): void {
  if (capabilities?.tools) {
    downstream.setRequestHandler(ListToolsRequestSchema, (request) => upstream.listTools(request.params));
    downstream.setRequestHandler(CallToolRequestSchema, async (request) => {
      const result = await upstream.callTool(request.params);
      return appendStructuredContentTextFallback(result, textCompatibilityEnabled);
    });
  }

  if (capabilities?.resources) {
    downstream.setRequestHandler(ListResourcesRequestSchema, (request) => upstream.listResources(request.params));
    downstream.setRequestHandler(ListResourceTemplatesRequestSchema, (request) =>
      upstream.listResourceTemplates(request.params)
    );
    downstream.setRequestHandler(ReadResourceRequestSchema, (request) => upstream.readResource(request.params));
    if (capabilities.resources.subscribe) {
      downstream.setRequestHandler(SubscribeRequestSchema, async (request) => {
        await upstream.subscribeResource(request.params);
        return {};
      });
      downstream.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
        await upstream.unsubscribeResource(request.params);
        return {};
      });
    }
  }

  if (capabilities?.prompts) {
    downstream.setRequestHandler(ListPromptsRequestSchema, (request) => upstream.listPrompts(request.params));
    downstream.setRequestHandler(GetPromptRequestSchema, (request) => upstream.getPrompt(request.params));
  }

  if (capabilities?.completions) {
    downstream.setRequestHandler(CompleteRequestSchema, (request) => upstream.complete(request.params));
  }

  if (capabilities?.logging) {
    downstream.setRequestHandler(SetLevelRequestSchema, async (request) => {
      await upstream.setLoggingLevel(request.params.level);
      return {};
    });
  }
}

function registerNotifications(upstream: Client, downstream: Server): void {
  upstream.setNotificationHandler(ToolListChangedNotificationSchema, () => downstream.sendToolListChanged());
  upstream.setNotificationHandler(ResourceListChangedNotificationSchema, () => downstream.sendResourceListChanged());
  upstream.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) =>
    downstream.sendResourceUpdated(notification.params)
  );
  upstream.setNotificationHandler(PromptListChangedNotificationSchema, () => downstream.sendPromptListChanged());
  upstream.setNotificationHandler(LoggingMessageNotificationSchema, (notification) =>
    downstream.sendLoggingMessage(notification.params)
  );
}

function discoverConnection(): { mcpUrl: string; accessToken: string } {
  const productHome = resolveProductHome();
  const config = readJson<ProductConfig>(join(productHome, "config.json"));
  if (!config) {
    throw new Error(`未找到同花顺本地配置：${join(productHome, "config.json")}`);
  }

  const accessToken = config.localAccessToken?.trim();
  if (!accessToken) {
    throw new Error("同花顺本地配置缺少访问令牌，请先运行插件配置器。 ");
  }

  const runtime = readJson<RuntimeEndpoint>(join(productHome, "runtime", "endpoint.json"));
  const fallbackPort = normalizePort(config.preferredPort) ?? 17180;
  const mcpUrl =
    runtime?.mcpUrl?.trim() ||
    (runtime?.baseUrl?.trim() ? `${runtime.baseUrl.replace(/\/$/, "")}/mcp` : undefined) ||
    `http://127.0.0.1:${normalizePort(runtime?.port) ?? fallbackPort}/mcp`;
  validateLoopbackMcpUrl(mcpUrl);
  return { mcpUrl, accessToken };
}

function resolveProductHome(): string {
  const overridden = process.env.TONGHUASUN_AGENT_HOME?.trim() || process.env.TONGHUASUN_CODEX_HOME?.trim();
  if (overridden) {
    return resolve(expandEnvironmentVariables(overridden));
  }

  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) {
    throw new Error("LOCALAPPDATA 不可用，无法发现同花顺本地配置。 ");
  }
  return join(localAppData, "TonghuasunCodex");
}

function validateLoopbackMcpUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`拒绝连接非本机 MCP 地址：${value}`);
  }
  if (parsed.pathname !== "/mcp" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`MCP 地址格式无效：${value}`);
  }
}

function normalizePort(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value! >= 1024 && value! <= 65535 ? value : undefined;
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`无法读取 JSON：${filePath}：${formatError(error)}`);
  }
}

function expandEnvironmentVariables(value: string): string {
  return value.replace(/%([^%]+)%/g, (_match, name: string) => process.env[name] ?? `%${name}%`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
