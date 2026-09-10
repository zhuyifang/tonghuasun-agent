import type { KlineInterval } from "./contracts";

const intervalLabels: Record<KlineInterval, string> = {
  intraday: "分时",
  five_day: "五日",
  "1m": "1 分钟",
  "5m": "5 分钟",
  "15m": "15 分钟",
  "30m": "30 分钟",
  "60m": "60 分钟",
  day: "日 K",
  week: "周 K",
  month: "月 K"
};

export function klineIntervalLabel(interval: KlineInterval): string {
  return intervalLabels[interval];
}

export function isMinuteKlineInterval(interval: KlineInterval): boolean {
  return interval === "intraday" || interval === "five_day" || interval.endsWith("m");
}

export function isLineKlineInterval(interval: KlineInterval): boolean {
  return interval === "intraday" || interval === "five_day";
}
