import type {
  DataServiceConnection,
  DataServiceConnectionListener,
  DataServiceConnectionSnapshot
} from "@/shared/dataService";

const DEFAULT_RECONNECT_INTERVAL_MS = 3_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;

interface HealthEnvelope {
  code?: number;
}

interface FqgateConnectionMonitorOptions {
  baseUrl: string;
  fetcher: typeof globalThis.fetch;
  reconnectIntervalMs?: number;
  healthTimeoutMs?: number;
}

const monitorsByFetcher = new WeakMap<
  typeof globalThis.fetch,
  Map<string, FqgateConnectionMonitor>
>();

/**
 * 同一个 FQGate 地址只保留一个探活循环。HTTP 与 WebSocket 适配器都把
 * 不可达事件汇总到这里，组件只订阅状态和恢复事件。
 */
export class FqgateConnectionMonitor implements DataServiceConnection {
  private state: DataServiceConnectionSnapshot = {
    state: "connected",
    recoveryRevision: 0
  };
  private readonly listeners = new Set<DataServiceConnectionListener>();
  private readonly reconnectIntervalMs: number;
  private readonly healthTimeoutMs: number;
  private reconnectTimer: number | undefined;
  private checking = false;

  constructor(private readonly options: FqgateConnectionMonitorOptions) {
    this.reconnectIntervalMs = Math.max(
      1_000,
      options.reconnectIntervalMs ?? DEFAULT_RECONNECT_INTERVAL_MS
    );
    this.healthTimeoutMs = Math.max(1_000, options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
  }

  getSnapshot(): DataServiceConnectionSnapshot {
    return { ...this.state };
  }

  subscribe(listener: DataServiceConnectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reportUnavailable(): void {
    if (this.state.state === "reconnecting") return;
    this.state = { ...this.state, state: "reconnecting" };
    this.notify();
    this.scheduleHealthCheck();
  }

  private scheduleHealthCheck(): void {
    if (this.reconnectTimer !== undefined || this.checking || this.state.state !== "reconnecting") {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.checkHealth();
    }, this.reconnectIntervalMs);
  }

  private async checkHealth(): Promise<void> {
    if (this.checking || this.state.state !== "reconnecting") return;
    this.checking = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.healthTimeoutMs);
    try {
      const response = await this.options.fetcher(
        new URL("/v1/market/health", this.options.baseUrl),
        { method: "GET", signal: controller.signal }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as HealthEnvelope;
      if (payload.code !== 0) throw new Error("健康接口尚未恢复");
      this.state = {
        state: "connected",
        recoveryRevision: this.state.recoveryRevision + 1
      };
      this.notify();
    } catch {
      // 服务仍不可达时继续等待下一轮，不把短暂网络错误扩散到每个组件。
    } finally {
      window.clearTimeout(timeout);
      this.checking = false;
      this.scheduleHealthCheck();
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function getFqgateConnectionMonitor(
  options: FqgateConnectionMonitorOptions
): FqgateConnectionMonitor {
  let monitors = monitorsByFetcher.get(options.fetcher);
  if (!monitors) {
    monitors = new Map();
    monitorsByFetcher.set(options.fetcher, monitors);
  }
  const key = normalizeBaseUrl(options.baseUrl);
  let monitor = monitors.get(key);
  if (!monitor) {
    monitor = new FqgateConnectionMonitor({ ...options, baseUrl: key });
    monitors.set(key, monitor);
  }
  return monitor;
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}
