import type { MarketSecurity } from "@/shared/contracts";

export function securitySearchPattern(code: string): string {
  const normalized = code.trim().toUpperCase();
  return /^[A-Z]{4}\d+$/.test(normalized) ? normalized.slice(4) : normalized;
}

/** 用户只需输入股票代码；同码证券保留为候选，由名称选择，市场标识随结果传递。 */
export function matchingSecurityCodes(code: string, results: MarketSecurity[]): MarketSecurity[] {
  const normalized = code.trim().toUpperCase();
  const matches = results.filter((security) => [
    security.code, security.fullCode, `${security.market}${security.code}`
  ].some((value) => value?.toUpperCase() === normalized));
  const unique = new Map(matches.map((security) => [
    `${security.market}${security.code}`.toUpperCase(), security
  ]));
  return [...unique.values()];
}
