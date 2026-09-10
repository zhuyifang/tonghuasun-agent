import { DataServiceUnavailableError } from "@/shared/dataService";
import type { JsonObject, McpToolResult, OriginatingToolSnapshot } from "./McpAppRuntime";
import { McpAppRuntime } from "./McpAppRuntime";

const FQGATE_MCP_ROUTES = {
  "GET /v1/market/health": "fqgate_market_market_health",
  "POST /v1/market/session/qr/begin": "fqgate_market_qr_login_begin",
  "POST /v1/market/session/qr/poll": "fqgate_market_qr_login_poll",
  "POST /v1/market/session/sms/begin": "fqgate_market_sms_login_begin",
  "POST /v1/market/session/sms/send-code": "fqgate_market_sms_login_send_code",
  "POST /v1/market/session/sms/complete": "fqgate_market_sms_login_complete",
  "POST /v1/market/history/klines": "fqgate_market_klines",
  "POST /v1/market/history/intraday": "fqgate_market_intraday",
  "POST /v1/market/history/minute-snapshot": "fqgate_market_minute_snapshot",
  "POST /v1/market/history/depth": "fqgate_market_depth",
  "POST /v1/market/history/tick": "fqgate_market_tick",
  "POST /v1/market/level2/depth": "fqgate_market_level2_depth",
  "POST /v1/market/level2/transactions": "fqgate_market_level2_transactions",
  "POST /v1/market/realtime/quote": "fqgate_market_quote",
  "POST /v1/market/information/news": "fqgate_market_news",
  "POST /v1/market/catalog/search-symbols": "fqgate_market_search_symbols"
} as const;

type RouteKey = keyof typeof FQGATE_MCP_ROUTES;

interface FqgateMcpEnvelope {
  ok: boolean;
  httpStatus: number;
  data?: unknown;
  error?: unknown;
}

interface InitialResultCache {
  toolName: string;
  argumentsValue: JsonObject;
  result?: McpToolResult;
}

/**
 * 把现有 FQGate HTTP Service 的 fetch 调用转换为标准 MCP Apps 工具调用。
 * 这样数据解析和 Vue 组件都继续只有一份，不为 Codex 复制业务实现。
 */
export class McpFqgateFetch {
  readonly fetch: typeof globalThis.fetch;

  private initialResult?: InitialResultCache;

  constructor(
    private readonly runtime: McpAppRuntime,
    initialSnapshot: OriginatingToolSnapshot = runtime.getOriginatingToolSnapshot()
  ) {
    if (initialSnapshot.name) {
      this.initialResult = {
        toolName: initialSnapshot.name,
        argumentsValue: initialSnapshot.arguments ?? {},
        result: initialSnapshot.result
      };
    }
    this.fetch = (input, init) => this.handleFetch(input, init);
  }

  private async handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    if (request.signal.aborted) throw new DOMException("请求已取消。", "AbortError");
    const toolName = resolveFqgateMcpToolName(request.method, new URL(request.url).pathname);
    if (!toolName) {
      return errorResponse(501, 1004, `MCP App 尚未适配接口：${request.method} ${new URL(request.url).pathname}`);
    }

    const argumentsValue = await requestArguments(request);
    try {
      const initialResult = await this.takeInitialResult(toolName, argumentsValue, request.signal);
      const result = initialResult
        ?? await abortable(this.runtime.callTool(toolName, argumentsValue), request.signal);
      return toolResultResponse(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new DataServiceUnavailableError(
        error instanceof Error && error.message
          ? `通过 AI 工具连接 FQGate 失败：${error.message}`
          : "通过 AI 工具连接 FQGate 失败。"
      );
    }
  }

  private async takeInitialResult(
    toolName: string,
    argumentsValue: JsonObject,
    signal: AbortSignal
  ): Promise<McpToolResult | undefined> {
    const cached = this.initialResult;
    if (!cached || cached.toolName !== toolName) return undefined;
    if (stableJson(normalizeArguments(cached.argumentsValue)) !== stableJson(normalizeArguments(argumentsValue))) {
      return undefined;
    }
    this.initialResult = undefined;
    if (cached.result) return cached.result;
    return abortable(this.runtime.waitForToolResult(30_000), signal);
  }
}

export function resolveFqgateMcpToolName(method: string, pathname: string): string | undefined {
  const key = `${method.toUpperCase()} ${pathname}` as RouteKey;
  return FQGATE_MCP_ROUTES[key];
}

async function requestArguments(request: Request): Promise<JsonObject> {
  const result: JsonObject = {};
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.clone().text();
    if (text.trim()) {
      const parsed = JSON.parse(text) as unknown;
      if (!isJsonObject(parsed)) throw new Error("FQGate MCP 工具参数必须是对象。");
      Object.assign(result, parsed);
    }
  }
  const timeout = request.headers.get("x-request-timeout-ms");
  if (timeout && Number.isFinite(Number(timeout))) result.requestTimeoutMs = Number(timeout);
  return result;
}

function toolResultResponse(result: McpToolResult): Response {
  const envelope = readEnvelope(result);
  if (!envelope) return errorResponse(502, 1099, "FQGate MCP 工具返回格式异常。");
  const status = validHttpStatus(envelope.httpStatus) ? envelope.httpStatus : envelope.ok ? 200 : 500;
  const body = envelope.ok ? envelope.data : envelope.error;
  if (body === undefined) return errorResponse(status, 1099, "FQGate MCP 工具未返回数据。");
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function readEnvelope(result: McpToolResult): FqgateMcpEnvelope | undefined {
  const uiResult = isJsonObject(result._meta) ? result._meta["fqgate/uiResult"] : undefined;
  const candidate = uiResult ?? result.structuredContent;
  if (!isJsonObject(candidate) || typeof candidate.ok !== "boolean") return undefined;
  const httpStatus = Number(candidate.httpStatus);
  return {
    ok: candidate.ok,
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : candidate.ok ? 200 : 500,
    data: candidate.data,
    error: candidate.error
  };
}

function errorResponse(status: number, code: number, message: string): Response {
  return new Response(JSON.stringify({ code, message, data: null }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function validHttpStatus(value: number): boolean {
  return Number.isInteger(value) && value >= 200 && value <= 599;
}

function normalizeArguments(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([key, item]) => (
      key !== "requestTimeoutMs"
      && !(key === "cache_credentials" && item === false)
      && !(key === "adjust" && item === "")
    ))
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isJsonObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("请求已取消。", "AbortError"));
  return new Promise((resolve, reject) => {
    const handleAbort = (): void => reject(new DOMException("请求已取消。", "AbortError"));
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      }
    );
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
