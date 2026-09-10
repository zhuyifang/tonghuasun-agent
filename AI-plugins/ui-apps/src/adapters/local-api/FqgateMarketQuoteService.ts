import type { MarketSecurity } from "@/shared/contracts";
import type { DataServiceConnection } from "@/shared/dataService";
import type {
  MarketQuotePatch,
  MarketQuoteService,
  MarketQuoteSubscription,
  QuoteConnectionState,
  QuoteStreamHandlers
} from "@/components/market-quotes/contracts";
import { marketSecurityKey } from "@/components/market-quotes/contracts";
import {
  FqgateHttpClient,
  type FqgateHttpClientOptions,
  toFqgateWebSocketUrl
} from "./FqgateHttpClient";

type RawRecord = Record<string, unknown>;

interface FqgateMarketData {
  records?: unknown;
}

interface FqgateStreamMessage {
  event?: "subscribed" | "unsubscribed" | "data" | "notice" | "pong";
  code?: number;
  message?: string;
  data?: FqgateMarketData;
  resync_required?: boolean;
}

export interface FqgateMarketQuoteServiceOptions extends FqgateHttpClientOptions {
  webSocketFactory?: (url: string) => WebSocket;
}

const QUOTE_FIELDS = [5, 55, 10, 6, 7, 8, 9, 13, 19, 48, 49];
const MAX_TREND_POINTS = 64;
const TREND_CONCURRENCY = 4;

/** 使用 FQGate 批量快照和标准 WebSocket 订阅提供多股实时行情。 */
export class FqgateMarketQuoteService implements MarketQuoteService {
  readonly kind = "fqgate-local-api";

  private readonly client: FqgateHttpClient;
  private readonly webSocketFactory: (url: string) => WebSocket;

  constructor(options: FqgateMarketQuoteServiceOptions = {}) {
    this.client = new FqgateHttpClient(options);
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
  }

  get connection() {
    return this.client.connection;
  }

  async getQuotes(
    securities: readonly MarketSecurity[],
    signal?: AbortSignal
  ): Promise<MarketQuotePatch[]> {
    const groups = groupByMarket(securities);
    const batches = await Promise.all([...groups.values()].map(async (group) => {
      const data = await this.client.post<FqgateMarketData>("/v1/market/realtime/quote", {
        securities: group.map(({ market, code }) => ({ market, code })),
        fields: QUOTE_FIELDS
      }, signal);
      return parseQuoteRecords(data.records, group);
    }));
    return batches.flat();
  }

  async getIntradayTrends(
    securities: readonly MarketSecurity[],
    signal?: AbortSignal
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(TREND_CONCURRENCY, securities.length) },
      async () => {
        while (!signal?.aborted && nextIndex < securities.length) {
          const security = securities[nextIndex++];
          try {
            const data = await this.client.post<FqgateMarketData>(
              "/v1/market/history/intraday",
              { market: security.market, code: security.code },
              signal
            );
            const values = collectRecords(data.records)
              .map((record) => numberValue(fieldValue(record, "10")))
              .filter((value): value is number => value !== undefined);
            result.set(marketSecurityKey(security), downsample(values, MAX_TREND_POINTS));
          } catch {
            if (signal?.aborted) return;
            // 趋势属于辅助信息，单只证券失败不能阻断其余快照和实时行情。
            result.set(marketSecurityKey(security), []);
          }
        }
      }
    );
    await Promise.all(workers);
    return result;
  }

  subscribe(
    securities: readonly MarketSecurity[],
    handlers: QuoteStreamHandlers
  ): MarketQuoteSubscription {
    return new FqgateQuoteSubscription(
      toFqgateWebSocketUrl(this.client.baseUrl, "/v1/market/stream"),
      uniqueSecurities(securities),
      handlers,
      this.webSocketFactory,
      this.client.connection
    );
  }
}

class FqgateQuoteSubscription implements MarketQuoteSubscription {
  private socket?: WebSocket;
  private pingTimer?: number;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly securities: MarketSecurity[],
    private readonly handlers: QuoteStreamHandlers,
    private readonly createWebSocket: (url: string) => WebSocket,
    private readonly connection: DataServiceConnection
  ) {
    this.open("connecting");
  }

  close(): void {
    this.closed = true;
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    this.socket?.close();
    this.handlers.onStateChange("closed");
  }

  private open(state: QuoteConnectionState): void {
    if (this.closed) return;
    this.handlers.onStateChange(state);
    const socket = this.createWebSocket(this.url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.closed || this.socket !== socket) return;
      this.handlers.onStateChange("connected");
      for (const { market, code } of this.securities) {
        socket.send(JSON.stringify({ action: "subscribe", kind: "quote", market, code }));
      }
      this.pingTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ action: "ping" }));
        }
      }, 15_000);
    });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("error", () => {
      this.connection.reportUnavailable();
      this.handlers.onError(new Error("实时行情连接异常，正在尝试恢复。"));
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    });
    socket.addEventListener("close", () => {
      if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
      this.pingTimer = undefined;
      if (!this.closed && this.socket === socket) {
        this.socket = undefined;
        this.handlers.onStateChange("reconnecting");
        this.connection.reportUnavailable();
      }
    });
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: FqgateStreamMessage;
    try {
      message = JSON.parse(raw) as FqgateStreamMessage;
    } catch {
      this.handlers.onError(new Error("实时行情返回格式异常。"));
      return;
    }

    if (message.event === "data" && message.code === 0) {
      for (const quote of parseQuoteRecords(message.data?.records, this.securities)) {
        this.handlers.onQuote(quote);
      }
      return;
    }
    if (message.event === "notice" || (message.code !== undefined && message.code !== 0)) {
      const suffix = message.resync_required ? " 请刷新行情重新同步。" : "";
      this.handlers.onError(new Error(`${message.message || "实时行情订阅失败。"}${suffix}`));
    }
  }
}

function groupByMarket(securities: readonly MarketSecurity[]): Map<string, MarketSecurity[]> {
  const groups = new Map<string, MarketSecurity[]>();
  for (const security of uniqueSecurities(securities)) {
    const group = groups.get(security.market) ?? [];
    group.push(security);
    groups.set(security.market, group);
  }
  return groups;
}

function uniqueSecurities(securities: readonly MarketSecurity[]): MarketSecurity[] {
  return [...new Map(securities.map((item) => [marketSecurityKey(item), { ...item }])).values()];
}

/** FQGate records 为“分段 -> 记录 -> 字段”，这里只展开含数字字段的记录。 */
function collectRecords(value: unknown, target: RawRecord[] = []): RawRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, target);
    return target;
  }
  if (!isRecord(value)) return target;
  if (Object.keys(value).some((key) => /^\d+$/.test(key))) target.push(value);
  return target;
}

function parseQuoteRecords(
  records: unknown,
  knownSecurities: readonly MarketSecurity[]
): MarketQuotePatch[] {
  const byFullCode = new Map(
    knownSecurities.map((item) => [`${item.market}${item.code}`, item] as const)
  );
  const result: MarketQuotePatch[] = [];
  for (const record of collectRecords(records)) {
    const fullCode = stringValue(fieldValue(record, "5"));
    const security = fullCode ? byFullCode.get(fullCode) : undefined;
    if (!security) continue;
    result.push(compactUndefined({
      security: { ...security, fullCode },
      name: displayNameValue(fieldValue(record, "55")),
      latestPrice: numberValue(fieldValue(record, "10")),
      previousClose: numberValue(fieldValue(record, "6")),
      openPrice: numberValue(fieldValue(record, "7")),
      highPrice: numberValue(fieldValue(record, "8")),
      lowPrice: numberValue(fieldValue(record, "9")),
      volume: numberValue(fieldValue(record, "13")),
      amount: numberValue(fieldValue(record, "19")),
      speed: numberValue(fieldValue(record, "48")),
      currentVolume: numberValue(fieldValue(record, "49")),
      receivedAt: Date.now()
    }));
  }
  return result;
}

function fieldValue(record: RawRecord, field: string): unknown {
  const raw = record[field];
  if (isRecord(raw)) {
    if (raw.type === "invalid" || raw.type === "no_update") return undefined;
    return "value" in raw ? raw.value : undefined;
  }
  return raw;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 旧版 FQGate 可能把实时推送的 GBK 名称误解为 UTF-8，不让坏值覆盖已知名称。 */
function displayNameValue(value: unknown): string | undefined {
  const name = stringValue(value);
  return name && !name.includes("\uFFFD") ? name : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function downsample(values: number[], limit: number): number[] {
  if (values.length <= limit) return values;
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(index * (values.length - 1) / (limit - 1));
    return values[sourceIndex];
  });
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
