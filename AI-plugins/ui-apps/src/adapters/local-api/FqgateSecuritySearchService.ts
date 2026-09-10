import type { MarketSecurity, SecuritySearchService } from "@/shared/contracts";
import { FqgateHttpClient, type FqgateHttpClientOptions } from "./FqgateHttpClient";

interface FqgateSearchData {
  items: Array<{ code: string; name: string; market: string; ths_code: string }>;
}

/** 共用真实证券目录查询；组件不自行推断证券市场或名称。 */
export class FqgateSecuritySearchService implements SecuritySearchService {
  readonly kind = "fqgate-local-api";
  private readonly client: FqgateHttpClient;
  constructor(options: FqgateHttpClientOptions = {}) { this.client = new FqgateHttpClient(options); }
  get connection() { return this.client.connection; }
  searchSecurities(pattern: string, signal?: AbortSignal): Promise<MarketSecurity[]> {
    return searchFqgateSecurities(this.client, pattern, signal);
  }
}

export async function searchFqgateSecurities(
  client: FqgateHttpClient, pattern: string, signal?: AbortSignal
): Promise<MarketSecurity[]> {
  const result = await client.post<FqgateSearchData>(
    "/v1/market/catalog/search-symbols", { pattern: pattern.trim() }, signal
  );
  return result.items.map((item) => ({
    market: item.market, code: item.code, name: item.name, fullCode: item.ths_code
  }));
}
