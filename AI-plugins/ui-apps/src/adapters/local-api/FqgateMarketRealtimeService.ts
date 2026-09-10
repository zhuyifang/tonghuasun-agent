import type {
  MarketDepthFallbackReason,
  MarketDepthMode,
  MarketRealtimeConnection,
  MarketRealtimeListener,
  MarketRealtimeService,
  MarketSecurity
} from "@/shared/contracts";
import type { DataServiceConnection } from "@/shared/dataService";
import {
  FqgateHttpClient,
  toFqgateWebSocketUrl,
  type FqgateHttpClientOptions
} from "./FqgateHttpClient";
import {
  parseBasicDepth,
  parseBasicTransactions,
  parseLevel2Depth,
  parseLevel2Transactions,
  parseRealtimePoints,
  parseRealtimeQuote,
  type FqgateMarketDataPayload
} from "./FqgateMarketDataParsers";

interface FqgateMarketHealth {
  connected: boolean;
  network_ready: boolean;
  level2_permission: boolean | null;
  reason?: string;
}

type FqgateStreamKind =
  | "quote"
  | "intraday"
  | "depth"
  | "transaction"
  | "level2_depth"
  | "transaction_detail";

interface FqgateStreamMessage {
  event?: "subscribed" | "unsubscribed" | "data" | "notice" | "pong";
  subscription_id?: number;
  kind?: FqgateStreamKind;
  code?: number;
  message?: string;
  resync_required?: boolean;
  data?: FqgateMarketDataPayload & { resync_required?: boolean };
}

export interface FqgateMarketRealtimeServiceOptions extends FqgateHttpClientOptions {
  webSocketFactory?: (url: string) => WebSocket;
}

/**
 * 个股行情统一实时适配器。一条连接同时承载报价、分时、盘口和成交，
 * 权限选择与动态降级留在数据层，避免界面依赖 FQGate 的字段编号。
 */
export class FqgateMarketRealtimeService implements MarketRealtimeService {
  readonly kind = "fqgate-local-api";
  private readonly client: FqgateHttpClient;
  private readonly webSocketFactory: (url: string) => WebSocket;

  constructor(options: FqgateMarketRealtimeServiceOptions = {}) {
    this.client = new FqgateHttpClient(options);
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
  }

  get connection() {
    return this.client.connection;
  }

  async connect(
    security: MarketSecurity,
    listener: MarketRealtimeListener,
    signal?: AbortSignal
  ): Promise<MarketRealtimeConnection> {
    throwIfAborted(signal);
    listener.onConnectionState("connecting", "正在连接实时行情…");
    const health = await this.client.get<FqgateMarketHealth>("/v1/market/health", signal);
    throwIfAborted(signal);
    if (!health.connected || !health.network_ready) {
      throw new Error(health.reason || "实时行情不可用，请确认已完成行情登录。");
    }

    const mode: MarketDepthMode = health.level2_permission === true ? "level2" : "basic";
    listener.onModeChange(mode, fallbackReasonFromHealth(health.level2_permission));
    const connection = new FqgateMarketRealtimeConnection(
      toFqgateWebSocketUrl(this.client.baseUrl, "/v1/market/stream"),
      security,
      mode,
      listener,
      this.webSocketFactory,
      this.client.connection
    );
    await connection.open(signal);
    return connection;
  }
}

class FqgateMarketRealtimeConnection implements MarketRealtimeConnection {
  private socket?: WebSocket;
  private manuallyClosed = false;
  private mode: MarketDepthMode;
  private pingTimer?: number;
  private readonly subscriptionKinds = new Map<number, FqgateStreamKind>();

  constructor(
    private readonly url: string,
    private readonly security: MarketSecurity,
    initialMode: MarketDepthMode,
    private readonly listener: MarketRealtimeListener,
    private readonly webSocketFactory: (url: string) => WebSocket,
    private readonly dataServiceConnection: DataServiceConnection
  ) {
    this.mode = initialMode;
  }

  open(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }

      let settled = false;
      const socket = this.webSocketFactory(this.url);
      this.socket = socket;
      const handleAbort = (): void => {
        this.manuallyClosed = true;
        this.stopHeartbeat();
        if (socket.readyState === 0 || socket.readyState === 1) socket.close(1000, "panel hidden");
        if (!settled) {
          settled = true;
          reject(abortError());
        }
      };
      signal?.addEventListener("abort", handleAbort, { once: true });

      socket.onopen = () => {
        if (signal?.aborted) {
          handleAbort();
          return;
        }
        this.subscribeInitialChannels();
        this.startHeartbeat();
        this.listener.onConnectionState("connected", "实时行情已连接");
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        const message = "实时行情连接失败，请确认 FQGate 正在运行并已完成行情登录。";
        this.dataServiceConnection.reportUnavailable();
        this.listener.onError(message);
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };
      socket.onclose = () => {
        signal?.removeEventListener("abort", handleAbort);
        this.stopHeartbeat();
        if (!this.manuallyClosed) this.dataServiceConnection.reportUnavailable();
        this.listener.onConnectionState(
          "closed",
          this.manuallyClosed ? "实时行情已暂停" : "实时行情已断开"
        );
        if (!settled) {
          settled = true;
          reject(new Error("实时行情已断开，请确认 FQGate 正在运行。"));
        } else if (!this.manuallyClosed) {
          this.listener.onError("实时行情已断开，正在等待数据服务恢复。");
        }
      };
    });
  }

  close(): void {
    this.manuallyClosed = true;
    this.stopHeartbeat();
    const socket = this.socket;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      socket.close(1000, "panel hidden");
    }
    this.socket = undefined;
  }

  private subscribeInitialChannels(): void {
    this.sendSubscribe("quote", [5, 6, 7, 8, 9, 10, 13, 19, 1968584]);
    this.sendSubscribe("intraday", [1, 5, 10, 13, 19]);
    this.subscribeMarketChannels();
  }

  private subscribeMarketChannels(): void {
    if (this.mode === "level2") {
      this.sendSubscribe("level2_depth");
      this.sendSubscribe("transaction_detail", [
        "source_tick_id", "price", "side", "volume", "trade_time"
      ]);
      return;
    }
    this.sendSubscribe("depth");
    this.sendSubscribe("transaction");
  }

  private sendSubscribe(kind: FqgateStreamKind, fields?: Array<string | number>): void {
    this.send({
      action: "subscribe",
      kind,
      market: this.security.market,
      code: this.security.code,
      ...(fields ? { fields } : {})
    });
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(payload));
  }

  private handleMessage(raw: unknown): void {
    let message: FqgateStreamMessage;
    try {
      message = JSON.parse(String(raw)) as FqgateStreamMessage;
    } catch {
      this.listener.onError("实时行情返回格式异常，请稍后重试。");
      return;
    }

    if (message.event === "subscribed" && message.subscription_id !== undefined && message.kind) {
      this.subscriptionKinds.set(message.subscription_id, message.kind);
      return;
    }
    if (message.event === "notice") {
      this.handleNotice(message);
      return;
    }
    if (message.event !== "data" || !message.kind || !message.data) return;
    this.dispatchMarketData(message.kind, message.data);
  }

  private dispatchMarketData(kind: FqgateStreamKind, payload: FqgateMarketDataPayload): void {
    if (kind === "quote") {
      const quote = parseRealtimeQuote(payload);
      if (quote) this.listener.onQuote(quote);
      return;
    }
    if (kind === "intraday") {
      const points = parseRealtimePoints(payload);
      if (points.length) this.listener.onIntraday(points);
      return;
    }
    if (kind === "level2_depth" && this.mode === "level2") {
      const depth = parseLevel2Depth(payload);
      this.listener.onDepth(depth.bids, depth.asks);
      return;
    }
    if (kind === "depth" && this.mode === "basic") {
      const depth = parseBasicDepth(payload);
      this.listener.onDepth(depth.bids, depth.asks);
      return;
    }
    if (kind === "transaction_detail" && this.mode === "level2") {
      const transactions = parseLevel2Transactions(payload);
      if (transactions.length) this.listener.onTransactions(transactions);
      return;
    }
    if (kind === "transaction" && this.mode === "basic") {
      const transactions = parseBasicTransactions(payload);
      if (transactions.length) this.listener.onTransactions(transactions);
    }
  }

  private handleNotice(message: FqgateStreamMessage): void {
    if (message.code === 3006 && this.mode === "level2") {
      this.fallbackToBasic();
      return;
    }
    if (message.code === 1099 || message.resync_required || message.data?.resync_required) {
      this.listener.onResyncRequired();
      return;
    }
    this.listener.onError(message.message || `实时行情请求失败（${message.code ?? "未知错误"}）。`);
  }

  /**
   * 权限可能在连接期间变化。收到 3006 后只取消 Level-2 通道，保留报价与分时，
   * 再在同一条 WebSocket 上订阅普通五档与逐笔，避免整页闪断。
   */
  private fallbackToBasic(): void {
    this.mode = "basic";
    for (const [subscriptionId, kind] of this.subscriptionKinds) {
      if (kind !== "level2_depth" && kind !== "transaction_detail") continue;
      this.send({ action: "unsubscribe", subscription_id: subscriptionId });
      this.subscriptionKinds.delete(subscriptionId);
    }
    this.subscribeMarketChannels();
    this.listener.onModeChange("basic", "permission_denied");
    this.listener.onConnectionState("connected", "Level-2 权限不可用，已切换普通实时行情");
    this.listener.onResyncRequired();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => this.send({ action: "ping" }), 20_000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }
}

function fallbackReasonFromHealth(
  permission: boolean | null
): MarketDepthFallbackReason | undefined {
  if (permission === false) return "level2_not_enabled";
  if (permission === null) return "level2_unknown";
  return undefined;
}

function abortError(): DOMException {
  return new DOMException("连接已取消", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}
