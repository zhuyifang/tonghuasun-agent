import type { KlineInterval, MarketSecurity } from "@/shared/contracts";

interface MarketSchedule {
  timeZone: string;
  weekdays: ReadonlySet<string>;
  sessions: ReadonlyArray<readonly [number, number]>;
}

const MAINLAND_WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const MAINLAND_STOCK_SCHEDULE: MarketSchedule = {
  timeZone: "Asia/Shanghai",
  weekdays: MAINLAND_WEEKDAYS,
  sessions: [
    [9 * 60 + 30, 11 * 60 + 30],
    [13 * 60, 15 * 60]
  ]
};

const MARKET_SCHEDULES: Readonly<Record<string, MarketSchedule>> = {
  USHA: MAINLAND_STOCK_SCHEDULE,
  USHB: MAINLAND_STOCK_SCHEDULE,
  USZA: MAINLAND_STOCK_SCHEDULE,
  USZB: MAINLAND_STOCK_SCHEDULE,
  USTM: MAINLAND_STOCK_SCHEDULE
};

/**
 * 默认周期只依据证券市场的常规连续交易时段；未知市场保守使用日 K。
 * 结束时刻采用半开区间，因此 11:30 午休和 15:00 收盘后都会回到日 K。
 */
export function defaultCandleInterval(
  security: Pick<MarketSecurity, "market">,
  now: Date = new Date()
): KlineInterval {
  const schedule = MARKET_SCHEDULES[security.market.toUpperCase()];
  if (!schedule || !Number.isFinite(now.getTime())) return "day";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!schedule.weekdays.has(values.weekday ?? "")) return "day";
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  return schedule.sessions.some(([start, end]) => minutes >= start && minutes < end)
    ? "intraday"
    : "day";
}
