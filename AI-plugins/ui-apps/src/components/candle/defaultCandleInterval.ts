import type { KlineInterval } from "@/shared/contracts";

/** 默认始终显示分时；不因开盘、午休、收盘、周末或重新连接而改变。 */
export function defaultCandleInterval(): KlineInterval {
  return "intraday";
}
