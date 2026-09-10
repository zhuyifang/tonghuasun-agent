import type { MarketSecurity, UiDataSource } from "@/shared/contracts";

export type QuoteConnectionState = "connecting" | "connected" | "reconnecting" | "closed";

export interface MarketQuotePatch {
  security: MarketSecurity;
  name?: string;
  latestPrice?: number;
  previousClose?: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  volume?: number;
  amount?: number;
  speed?: number;
  currentVolume?: number;
  receivedAt: number;
}

export interface QuoteStreamHandlers {
  onQuote(quote: MarketQuotePatch): void;
  onStateChange(state: QuoteConnectionState): void;
  onError(error: Error): void;
}

export interface MarketQuoteSubscription {
  close(): void;
}

export interface MarketQuoteService extends UiDataSource {
  getQuotes(
    securities: readonly MarketSecurity[],
    signal?: AbortSignal
  ): Promise<MarketQuotePatch[]>;
  getIntradayTrends(
    securities: readonly MarketSecurity[],
    signal?: AbortSignal
  ): Promise<Map<string, number[]>>;
  subscribe(
    securities: readonly MarketSecurity[],
    handlers: QuoteStreamHandlers
  ): MarketQuoteSubscription;
}

export function marketSecurityKey(security: Pick<MarketSecurity, "market" | "code">): string {
  return `${security.market}:${security.code}`;
}
