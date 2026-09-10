import type {
  MarketSecurity,
  OrderFlowDataMode,
  OrderFlowFallbackReason,
  OrderFlowQuote,
  OrderFlowRecord,
  OrderFlowRecordKind,
  OrderFlowSide,
  OrderFlowWatchConnection,
  OrderFlowWatchListener,
  OrderFlowWatchService
} from "@/shared/contracts";
import type { DataServiceConnection } from "@/shared/dataService";
import {
  FqgateHttpClient,
  toFqgateWebSocketUrl,
  type FqgateHttpClientOptions
} from "./FqgateHttpClient";

interface FqgateMarketHealth {
  status: string;
  network_ready: boolean;
  connected: boolean;
  level2_permission: boolean | null;
  login_method?: string | null;
  reason?: string;
}

interface FqgateSearchData {
  items: Array<{
    code: string;
    name: string;
    market: string;
    ths_code: string;
  }>;
}

interface FqgateStreamMessage {
  event?: "subscribed" | "unsubscribed" | "data" | "notice" | "pong";
  subscription_id?: number;
  kind?: FqgateStreamKind;
  code?: number;
  message?: string;
  data?: unknown;
}

type FqgateStreamKind = "quote" | "order_detail" | "buy_cancel" | "sell_cancel";
type JsonObject = Record<string, unknown>;

export interface FqgateOrderFlowServiceOptions extends FqgateHttpClientOptions {
  webSocketFactory?: (url: string) => WebSocket;
}

/**
 * FQGate 实时逐笔适配器。权限检测、WebSocket 协议及 Level-2 降级都在
 * 适配层收口，界面组件无需了解不同数据提供方的协议差异。
 */
export class FqgateOrderFlowService implements OrderFlowWatchService {
  readonly kind = "fqgate-local-api";

  private readonly client: FqgateHttpClient;
  private readonly baseUrl: string;
  private readonly webSocketFactory: (url: string) => WebSocket;

  constructor(options: FqgateOrderFlowServiceOptions = {}) {
    this.client = new FqgateHttpClient(options);
    this.baseUrl = this.client.baseUrl;
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
  }

  get connection() {
    return this.client.connection;
  }

  async searchSecurities(pattern: string): Promise<MarketSecurity[]> {
    const result = await this.client.post<FqgateSearchData>(
      "/v1/market/catalog/search-symbols",
      { pattern: pattern.trim() }
    );
    return result.items.map((item) => ({
      market: item.market,
      code: item.code,
      name: item.name,
      fullCode: item.ths_code
    }));
  }

  async connect(
    security: MarketSecurity,
    listener: OrderFlowWatchListener,
    signal?: AbortSignal
  ): Promise<OrderFlowWatchConnection> {
    throwIfAborted(signal);
    listener.onConnectionState("connecting", "正在连接实时数据…");
    const health = await this.client.get<FqgateMarketHealth>("/v1/market/health");
    throwIfAborted(signal);
    if (!health.network_ready) {
      throw new Error(health.reason || "实时数据接口不可用，请确认 FQGate 已正常启动。");
    }

    const mode: OrderFlowDataMode = health.level2_permission === true ? "level2" : "basic";
    const fallbackReason = fallbackReasonFromHealth(health.level2_permission);
    listener.onModeChange({ mode, fallbackReason });

    const connection = new FqgateOrderFlowConnection(
      toFqgateWebSocketUrl(this.baseUrl, "/v1/market/stream"),
      security,
      mode,
      listener,
      this.webSocketFactory,
      this.client.connection
    );
    await connection.open(signal);
    void this.loadInitialQuote(security, listener, signal);
    return connection;
  }

  private async loadInitialQuote(
    security: MarketSecurity,
    listener: OrderFlowWatchListener,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const data = await this.client.post<unknown>("/v1/market/realtime/quote", {
        securities: [{ market: security.market, code: security.code }],
        fields: [5, 55, 10, 6]
      }, signal);
      const quote = parseQuote(data);
      if (quote && !signal?.aborted) listener.onQuote(quote);
    } catch {
      // WebSocket 仍是主数据通道；快照失败时继续等待下一次实时推送。
    }
  }
}

class FqgateOrderFlowConnection implements OrderFlowWatchConnection {
  private socket?: WebSocket;
  private manuallyClosed = false;
  private mode: OrderFlowDataMode;
  private readonly subscriptionKinds = new Map<number, FqgateStreamKind>();

  constructor(
    private readonly url: string,
    private readonly security: MarketSecurity,
    initialMode: OrderFlowDataMode,
    private readonly listener: OrderFlowWatchListener,
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
        socket.close(1000, "panel hidden");
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
        this.listener.onConnectionState("connected", "实时数据已连接");
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        const message = "实时数据接口连接失败，请确认 FQGate 正在运行并已完成行情登录。";
        this.dataServiceConnection.reportUnavailable();
        this.listener.onError(message);
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };
      socket.onclose = () => {
        signal?.removeEventListener("abort", handleAbort);
        if (!this.manuallyClosed) this.dataServiceConnection.reportUnavailable();
        this.listener.onConnectionState("closed", this.manuallyClosed ? "实时连接已暂停" : "实时连接已断开");
        if (!settled) {
          settled = true;
          reject(new Error("实时数据接口已断开，请确认 FQGate 正在运行。"));
        } else if (!this.manuallyClosed) {
          this.listener.onError("实时数据接口已断开，请确认 FQGate 正在运行后重试。");
        }
      };
    });
  }

  close(): void {
    this.manuallyClosed = true;
    const socket = this.socket;
    if (!socket) return;
    if (socket.readyState === 0 || socket.readyState === 1) socket.close(1000, "panel hidden");
    this.socket = undefined;
  }

  private subscribeInitialChannels(): void {
    this.sendSubscribe("quote", [5, 55, 10, 6]);
    if (this.mode === "level2") {
      this.sendSubscribe("order_detail", [
        "order_no", "price", "side", "volume", "amount", "order_time", "request_time"
      ]);
      const cancelFields = [
        "order_no", "latest_price", "price", "volume", "amount", "request_time", "cancel_time"
      ];
      this.sendSubscribe("buy_cancel", cancelFields);
      this.sendSubscribe("sell_cancel", cancelFields);
    }
  }

  private sendSubscribe(kind: FqgateStreamKind, fields: Array<string | number>): void {
    this.send({
      action: "subscribe",
      kind,
      market: this.security.market,
      code: this.security.code,
      fields
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
      this.listener.onError("实时数据返回格式异常，请稍后重试。");
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
    if (message.kind === "quote") {
      const quote = parseQuote(message.data);
      if (quote) this.listener.onQuote(quote);
      return;
    }
    if (this.mode !== "level2") return;

    const kind: OrderFlowRecordKind = message.kind === "order_detail" ? "order" : "cancel";
    const records = parseLevel2Records(message.data, kind, message.kind);
    if (records.length) this.listener.onRecords(records);
  }

  private handleNotice(message: FqgateStreamMessage): void {
    if (message.code === 3006) {
      if (this.mode === "level2") this.fallbackToBasic();
      return;
    }
    this.listener.onError(message.message || `实时数据请求失败（${message.code ?? "未知错误"}）。`);
  }

  private fallbackToBasic(): void {
    this.mode = "basic";
    for (const [subscriptionId, kind] of this.subscriptionKinds) {
      if (kind === "quote") continue;
      this.send({ action: "unsubscribe", subscription_id: subscriptionId });
      this.subscriptionKinds.delete(subscriptionId);
    }
    this.listener.onModeChange({ mode: "basic", fallbackReason: "permission_denied" });
    this.listener.onConnectionState("connected", "已回退到普通实时行情");
  }
}

function parseQuote(data: unknown): OrderFlowQuote | undefined {
  const record = firstRawRecord(data);
  if (!record) return undefined;
  return {
    latestPrice: fieldNumber(record, "10"),
    previousClose: fieldNumber(record, "6"),
    updatedAt: Date.now()
  };
}

function parseLevel2Records(
  data: unknown,
  kind: OrderFlowRecordKind,
  streamKind: FqgateStreamKind
): OrderFlowRecord[] {
  const semanticBatches = asObject(data)?.semantic_records;
  if (!Array.isArray(semanticBatches)) return [];
  const records: OrderFlowRecord[] = [];
  for (const batch of semanticBatches) {
    if (!Array.isArray(batch)) continue;
    for (const item of batch) {
      const semantic = asObject(item);
      const values = asObject(semantic?.values);
      const derived = asObject(semantic?.derived);
      if (!values || !derived) continue;
      const price = fieldValueNumber(values.price)
        ?? fieldValueNumber(values.latest_price);
      const volume = fieldValueNumber(values.volume);
      const amount = fieldValueNumber(values.amount)
        ?? (price !== null && volume !== null ? price * volume : null);
      const timestamp = derivedTimestamp(derived)
        ?? strictTimestamp(fieldValueNumber(values.cancel_time))
        ?? strictTimestamp(fieldValueNumber(values.order_time));
      const orderTimestamp = kind === "cancel"
        ? strictTimestamp(fieldValueNumber(values.request_time))
        : null;
      const side = derivedSide(derived, streamKind);
      const orderNumber = fieldValue(values.order_no);
      records.push({
        id: [kind, orderNumber, timestamp, price, volume].join(":"),
        kind,
        side,
        timestamp,
        price,
        volume,
        amount,
        orderTimestamp
      });
    }
  }
  return records;
}

function firstRawRecord(data: unknown): JsonObject | undefined {
  const batches = asObject(data)?.records;
  if (!Array.isArray(batches)) return undefined;
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    for (const record of batch) {
      const object = asObject(record);
      if (object) return object;
    }
  }
  return undefined;
}

function fieldNumber(record: JsonObject, fieldId: string): number | null {
  return fieldValueNumber(record[fieldId]);
}

function fieldValue(value: unknown): string | number | null {
  const object = asObject(value);
  const payload = object && "value" in object ? object.value : value;
  return typeof payload === "string" || typeof payload === "number" ? payload : null;
}

function fieldValueNumber(value: unknown): number | null {
  const payload = fieldValue(value);
  if (payload === null) return null;
  const number = typeof payload === "number" ? payload : Number(payload);
  return Number.isFinite(number) ? number : null;
}

function derivedTimestamp(derived: JsonObject): number | null {
  const timestamp = asObject(derived.timestamp);
  return strictTimestamp(typeof timestamp?.unix_milliseconds === "number"
    ? timestamp.unix_milliseconds
    : null);
}

function strictTimestamp(value: number | null): number | null {
  if (value === null) return null;
  if (value >= 1_000_000_000_000) return value;
  if (value >= 1_000_000_000) return value * 1_000;
  return null;
}

function derivedSide(derived: JsonObject, streamKind: FqgateStreamKind): OrderFlowSide {
  if (streamKind === "buy_cancel") return "buy";
  if (streamKind === "sell_cancel") return "sell";
  const side = derived.side;
  return side === "buy" || side === "sell" ? side : "unknown";
}

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function fallbackReasonFromHealth(permission: boolean | null): OrderFlowFallbackReason | undefined {
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
