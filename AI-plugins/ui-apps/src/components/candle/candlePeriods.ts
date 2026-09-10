import type { KlineInterval } from "@/shared/contracts";
import { klineIntervalLabel } from "@/shared/kline";

export interface CandlePeriodOption {
  value: KlineInterval;
  label: string;
  fullLabel: string;
}

export const primaryCandlePeriods: readonly CandlePeriodOption[] = [
  { value: "intraday", label: "分时", fullLabel: klineIntervalLabel("intraday") },
  { value: "day", label: "日K", fullLabel: klineIntervalLabel("day") },
  { value: "week", label: "周K", fullLabel: klineIntervalLabel("week") },
  { value: "month", label: "月K", fullLabel: klineIntervalLabel("month") },
  { value: "five_day", label: "五日", fullLabel: klineIntervalLabel("five_day") }
];

export const moreCandlePeriods: readonly CandlePeriodOption[] = [
  { value: "1m", label: "1分", fullLabel: klineIntervalLabel("1m") },
  { value: "5m", label: "5分", fullLabel: klineIntervalLabel("5m") },
  { value: "15m", label: "15分", fullLabel: klineIntervalLabel("15m") },
  { value: "30m", label: "30分", fullLabel: klineIntervalLabel("30m") },
  { value: "60m", label: "60分", fullLabel: klineIntervalLabel("60m") }
];
