import type { DataServiceConnection } from "@/shared/dataService";
import {
  DataServiceUnavailableError,
  isDataServiceUnavailableError
} from "@/shared/dataService";
import { getFqgateConnectionMonitor } from "./FqgateConnectionMonitor";

const defaultFqgateFetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);

export interface FqgateHttpClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

interface FqgateResponse<T> {
  code: number;
  message: string;
  data: T;
  warnings?: unknown[];
}

export class FqgateApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "FqgateApiError";
  }
}

/**
 * 本机 FQGate HTTP 公共客户端。所有本机 API 适配器共用这里的超时、
 * 空响应和错误响应处理，避免各组件出现不一致的错误提示。
 */
export class FqgateHttpClient {
  readonly baseUrl: string;
  readonly connection: DataServiceConnection;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: FqgateHttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? resolveFqgateBaseUrl();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetcher = options.fetch ?? defaultFqgateFetch;
    this.connection = getFqgateConnectionMonitor({
      baseUrl: this.baseUrl,
      fetcher: this.fetcher
    });
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "GET" }, signal);
  }

  async post<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
    serverTimeoutMs?: number
  ): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serverTimeoutMs ? { "X-Request-Timeout-Ms": String(serverTimeoutMs) } : {})
      },
      body: JSON.stringify(body)
    }, signal);
  }

  private async request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    if (this.connection.getSnapshot().state === "reconnecting") {
      throw new DataServiceUnavailableError("数据服务正在重连，请稍候。");
    }
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetcher(new URL(path, this.baseUrl), {
        ...init,
        signal: controller.signal
      });
      const responseText = await response.text();
      if (!responseText.trim()) {
        if (!response.ok) throw new DataServiceUnavailableError();
        throw new Error("FQGate 返回了空响应，请稍后重试。");
      }

      let payload: FqgateResponse<T>;
      try {
        payload = JSON.parse(responseText) as FqgateResponse<T>;
      } catch {
        if (response.status >= 500) throw new DataServiceUnavailableError();
        throw new Error(`FQGate 返回格式异常（HTTP ${response.status}）。`);
      }
      if (!response.ok || payload.code !== 0) {
        throw new FqgateApiError(
          payload.message || `请求失败（HTTP ${response.status}）`,
          payload.code,
          response.status
        );
      }
      return payload.data;
    } catch (error) {
      let normalizedError = error;
      if (error instanceof DOMException && error.name === "AbortError") {
        normalizedError = timedOut
          ? new DataServiceUnavailableError("连接 FQGate 超时，正在等待服务恢复。")
          : new Error("请求已取消。");
      } else if (error instanceof TypeError) {
        normalizedError = new DataServiceUnavailableError();
      }
      if (isDataServiceUnavailableError(normalizedError)) this.connection.reportUnavailable();
      throw normalizedError;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

export function resolveFqgateBaseUrl(): string {
  const origin = globalThis.location?.origin;
  return origin && /^https?:\/\//.test(origin) ? origin : "http://127.0.0.1:17281";
}

export function toFqgateWebSocketUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
