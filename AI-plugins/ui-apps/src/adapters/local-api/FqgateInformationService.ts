import type {
  InformationCategory,
  InformationData,
  InformationItem,
  InformationQuery,
  InformationService,
  MarketSecurity
} from "@/shared/contracts";
import { FqgateHttpClient, type FqgateHttpClientOptions } from "./FqgateHttpClient";

interface FqgateInformationData {
  items?: unknown;
}

type RawInformationItem = Record<string, unknown>;

const categoryTextIds: Record<InformationCategory, number> = {
  market: 14356,
  security: 14339,
  announcement: 14341
};

export type FqgateInformationServiceOptions = FqgateHttpClientOptions;

/** 把 FQGate 资讯字段整理成不依赖数据来源的通用资讯结构。 */
export class FqgateInformationService implements InformationService {
  readonly kind = "fqgate-local-api";

  private readonly client: FqgateHttpClient;

  constructor(options: FqgateInformationServiceOptions = {}) {
    this.client = new FqgateHttpClient({ ...options, timeoutMs: options.timeoutMs ?? 32_000 });
  }

  get connection() {
    return this.client.connection;
  }

  async getInformation(query: InformationQuery, signal?: AbortSignal): Promise<InformationData> {
    const data = await this.client.post<FqgateInformationData>(
      "/v1/market/information/news",
      {
        market: query.security.market,
        code: query.security.code,
        text_id: categoryTextIds[query.category],
        last_text_time: 0,
        summary: true
      },
      signal,
      30_000
    );
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems
      .map((item, index) => toInformationItem(item, index))
      .filter((item): item is InformationItem => item !== null)
      .sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0));

    return {
      security: completeSecurity(query.security),
      category: query.category,
      fetchedAt: new Date().toISOString(),
      items
    };
  }
}

function toInformationItem(
  value: unknown,
  index: number
): InformationItem | null {
  if (!isRecord(value)) return null;
  const properties = isRecord(value.properties) ? value.properties : {};
  const title = stringValue(value.title);
  const summary = stringValue(properties.summ);
  if (!title && !summary) return null;
  const publishedAt = epochMilliseconds(value.time) ?? epochMilliseconds(properties.ctime);
  const identifier = stringValue(value.id) || `${publishedAt ?? "unknown"}-${index}`;

  return {
    id: `information-${identifier}`,
    title: title || summary.slice(0, 48),
    summary,
    source: stringValue(properties.source),
    publishedAt,
    url: safeHttpUrl(value.url),
    securityCode: stringValue(value.stock) || stringValue(value.code)
  };
}

function completeSecurity(security: MarketSecurity): Required<MarketSecurity> {
  return {
    market: security.market,
    code: security.code,
    name: security.name?.trim() || security.code,
    fullCode: security.fullCode?.trim() || `${security.market}${security.code}`
  };
}

function epochMilliseconds(value: unknown): number | null {
  const parsed = Number(stringValue(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed > 10_000_000_000 ? Math.floor(parsed) : Math.floor(parsed * 1000);
}

function safeHttpUrl(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function isRecord(value: unknown): value is RawInformationItem {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
