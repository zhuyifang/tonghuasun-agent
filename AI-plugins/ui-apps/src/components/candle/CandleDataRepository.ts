import type { CandleData, CandleQuery, CandleService } from "@/shared/contracts";

interface ServiceCache {
  entries: Map<string, CandleData>;
  pending: Map<string, Promise<CandleData>>;
}

const serviceCaches = new WeakMap<CandleService, ServiceCache>();

/**
 * 在同一个数据服务实例内复用已经取得的真实行情，并合并相同的在途请求。
 * 组件卸载后缓存仍跟随服务实例保留，返回组件时无需重复等待冷查询。
 */
export class CandleDataRepository {
  private readonly cache: ServiceCache;

  constructor(private readonly service: CandleService) {
    this.cache = cacheFor(service);
  }

  peek(query: CandleQuery): CandleData | undefined {
    return this.cache.entries.get(queryKey(query));
  }

  load(query: CandleQuery, force = false): Promise<CandleData> {
    const key = queryKey(query);
    const pending = this.cache.pending.get(key);
    if (pending) return pending;

    const cached = this.cache.entries.get(key);
    if (!force && cached) return Promise.resolve(cached);

    const request = this.service.getCandles(query)
      .then((result) => {
        this.cache.entries.set(key, result);
        return result;
      })
      .finally(() => {
        if (this.cache.pending.get(key) === request) this.cache.pending.delete(key);
      });
    this.cache.pending.set(key, request);
    return request;
  }
}

function cacheFor(service: CandleService): ServiceCache {
  const existing = serviceCaches.get(service);
  if (existing) return existing;
  const created: ServiceCache = { entries: new Map(), pending: new Map() };
  serviceCaches.set(service, created);
  return created;
}

function queryKey(query: CandleQuery): string {
  return [
    query.security.market,
    query.security.code,
    query.interval,
    query.count,
    query.adjustment ?? ""
  ].join(":");
}
