import type {
  CandleBar,
  CandleData,
  CandleLatest,
  KlineInterval,
  MarketRealtimePoint,
  MarketRealtimeQuote
} from "@/shared/contracts";
import { isLineKlineInterval } from "@/shared/kline";

export interface RealtimeCandleCursor {
  dayKey?: string;
  volume?: number | null;
  amount?: number | null;
}

export function applyRealtimeQuote(data: CandleData, quote: MarketRealtimeQuote): CandleData {
  const price = quote.latestPrice;
  if (price === null) return data;
  const bars = [...data.bars];
  const latestIndex = bars.length - 1;

  if (data.interval === "day") {
    const dayTime = chinaTradingDayTime(quote.updatedAt);
    const previous = bars.at(-1);
    const current: CandleBar = previous && chinaDateKey(previous.time * 1_000) === chinaDateKey(quote.updatedAt)
      ? mergeQuoteIntoBar(previous, quote, true)
      : createQuoteBar(dayTime, quote);
    if (previous && previous.time === current.time) bars[latestIndex] = current;
    else bars.push(current);
  } else if ((data.interval === "week" || data.interval === "month") && latestIndex >= 0) {
    bars[latestIndex] = mergeQuoteIntoBar(bars[latestIndex]!, quote, false);
  }

  const source = bars.at(-1) ?? data.latest;
  const latest = quoteLatest(source, quote);
  return trimRealtimeData({
    ...data,
    fetchedAt: new Date(quote.updatedAt).toISOString(),
    latest,
    bars
  });
}

/**
 * 分时推送里的量额是当日累计值；分钟 K 需要先计算相邻推送的增量，
 * 再写入当前时间桶，避免每次推送都把累计成交量重复叠加。
 */
export function applyRealtimePoints(
  data: CandleData,
  points: MarketRealtimePoint[],
  previousClose: number | null,
  cursor: RealtimeCandleCursor
): CandleData {
  if (!points.length || data.interval === "day" || data.interval === "week" || data.interval === "month") {
    return data;
  }
  const bars = [...data.bars];
  for (const point of points) {
    if (isLineKlineInterval(data.interval)) {
      upsertLinePoint(bars, point, data.interval);
    } else {
      upsertMinutePoint(bars, point, data.interval, cursor);
    }
    updateCumulativeCursor(cursor, point);
  }

  const current = bars.at(-1);
  if (!current) return data;
  const latest = isLineKlineInterval(data.interval)
    ? createLineLatest(bars, current, previousClose)
    : createLatest(current, previousClose);
  latest.turnoverRate = data.latest.turnoverRate;
  return trimRealtimeData({
    ...data,
    fetchedAt: new Date(points.at(-1)!.timestamp).toISOString(),
    latest,
    bars
  });
}

export function initializeRealtimeCursor(
  cursor: RealtimeCandleCursor,
  quote: MarketRealtimeQuote
): void {
  const dayKey = chinaDateKey(quote.updatedAt);
  if (cursor.dayKey === dayKey && cursor.volume !== undefined) return;
  cursor.dayKey = dayKey;
  cursor.volume = quote.volume;
  cursor.amount = quote.amount;
}

function mergeQuoteIntoBar(
  bar: CandleBar,
  quote: MarketRealtimeQuote,
  replaceDayTotals: boolean
): CandleBar {
  const close = quote.latestPrice ?? bar.close;
  return {
    ...bar,
    open: quote.open ?? bar.open,
    high: Math.max(bar.high, quote.high ?? close, close),
    low: Math.min(bar.low, quote.low ?? close, close),
    close,
    volume: replaceDayTotals ? quote.volume ?? bar.volume : bar.volume,
    amount: replaceDayTotals ? quote.amount ?? bar.amount : bar.amount,
    turnoverRate: quote.turnoverRate ?? bar.turnoverRate
  };
}

function createQuoteBar(time: number, quote: MarketRealtimeQuote): CandleBar {
  const close = quote.latestPrice!;
  const open = quote.open ?? close;
  return {
    time,
    label: formatLabel(time, false),
    open,
    high: Math.max(quote.high ?? close, open, close),
    low: Math.min(quote.low ?? close, open, close),
    close,
    volume: quote.volume ?? 0,
    amount: quote.amount ?? 0,
    turnoverRate: quote.turnoverRate
  };
}

function quoteLatest(bar: CandleBar, quote: MarketRealtimeQuote): CandleLatest {
  const close = quote.latestPrice ?? bar.close;
  const previousClose = quote.previousClose;
  const change = previousClose === null ? null : close - previousClose;
  return {
    ...bar,
    open: quote.open ?? bar.open,
    high: quote.high ?? Math.max(bar.high, close),
    low: quote.low ?? Math.min(bar.low, close),
    close,
    volume: quote.volume ?? bar.volume,
    amount: quote.amount ?? bar.amount,
    turnoverRate: quote.turnoverRate ?? bar.turnoverRate,
    change,
    changePercent: previousClose === null || previousClose === 0
      ? null
      : (close - previousClose) / previousClose * 100
  };
}

function upsertLinePoint(
  bars: CandleBar[],
  point: MarketRealtimePoint,
  interval: KlineInterval
): void {
  const time = Math.floor(point.timestamp / 1_000);
  const existingIndex = findBarIndex(bars, time);
  const previous = existingIndex >= 0 ? bars[existingIndex] : bars.at(-1);
  const open = existingIndex >= 0 ? bars[existingIndex]!.open : previous?.close ?? point.price;
  const bar: CandleBar = {
    time,
    label: formatLabel(time, true),
    open,
    high: Math.max(existingIndex >= 0 ? bars[existingIndex]!.high : point.price, point.price),
    low: Math.min(existingIndex >= 0 ? bars[existingIndex]!.low : point.price, point.price),
    close: point.price,
    volume: point.volume ?? previous?.volume ?? 0,
    amount: point.amount ?? previous?.amount ?? 0
  };
  if (existingIndex >= 0) bars[existingIndex] = bar;
  else if (interval === "five_day" || sameChinaDay(time, bars.at(-1)?.time)) bars.push(bar);
  else bars.push(bar);
}

function upsertMinutePoint(
  bars: CandleBar[],
  point: MarketRealtimePoint,
  interval: KlineInterval,
  cursor: RealtimeCandleCursor
): void {
  const bucketSeconds = minuteBucketSeconds(interval);
  const rawTime = Math.floor(point.timestamp / 1_000);
  const time = Math.floor(rawTime / bucketSeconds) * bucketSeconds;
  const existingIndex = findBarIndex(bars, time);
  const dayKey = chinaDateKey(point.timestamp);
  const sameDay = cursor.dayKey === dayKey;
  const volumeIncrement = cumulativeIncrement(point.volume, sameDay ? cursor.volume : null);
  const amountIncrement = cumulativeIncrement(point.amount, sameDay ? cursor.amount : null);
  const existing = existingIndex >= 0 ? bars[existingIndex]! : undefined;
  const bar: CandleBar = existing
    ? {
        ...existing,
        high: Math.max(existing.high, point.price),
        low: Math.min(existing.low, point.price),
        close: point.price,
        volume: existing.volume + volumeIncrement,
        amount: existing.amount + amountIncrement
      }
    : {
        time,
        label: formatLabel(time, true),
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        volume: volumeIncrement,
        amount: amountIncrement
      };
  if (existingIndex >= 0) bars[existingIndex] = bar;
  else bars.push(bar);
}

function createLineLatest(
  bars: CandleBar[],
  current: CandleBar,
  previousClose: number | null
): CandleLatest {
  const key = chinaDateKey(current.time * 1_000);
  const currentDay = bars.filter((bar) => chinaDateKey(bar.time * 1_000) === key);
  const change = previousClose === null ? null : current.close - previousClose;
  return {
    ...current,
    open: currentDay[0]?.close ?? current.close,
    high: Math.max(...currentDay.map((bar) => bar.close)),
    low: Math.min(...currentDay.map((bar) => bar.close)),
    change,
    changePercent: previousClose === null || previousClose === 0
      ? null
      : (current.close - previousClose) / previousClose * 100
  };
}

function createLatest(bar: CandleBar, previousClose: number | null): CandleLatest {
  const change = previousClose === null ? null : bar.close - previousClose;
  return {
    ...bar,
    change,
    changePercent: previousClose === null || previousClose === 0
      ? null
      : (bar.close - previousClose) / previousClose * 100
  };
}

function updateCumulativeCursor(cursor: RealtimeCandleCursor, point: MarketRealtimePoint): void {
  cursor.dayKey = chinaDateKey(point.timestamp);
  cursor.volume = point.volume;
  cursor.amount = point.amount;
}

function cumulativeIncrement(current: number | null, previous: number | null | undefined): number {
  if (current === null || previous === null || previous === undefined) return 0;
  return Math.max(0, current - previous);
}

function trimRealtimeData(data: CandleData): CandleData {
  const excess = data.bars.length - data.requestedCount;
  if (excess <= 0 || isLineKlineInterval(data.interval)) return data;
  return { ...data, bars: data.bars.slice(excess) };
}

function findBarIndex(bars: CandleBar[], time: number): number {
  const lastIndex = bars.length - 1;
  if (lastIndex >= 0 && bars[lastIndex]!.time === time) return lastIndex;
  return bars.findIndex((bar) => bar.time === time);
}

function minuteBucketSeconds(interval: KlineInterval): number {
  const minutes = Number.parseInt(interval, 10);
  return (Number.isFinite(minutes) ? minutes : 1) * 60;
}

function sameChinaDay(left: number, right: number | undefined): boolean {
  return right !== undefined && chinaDateKey(left * 1_000) === chinaDateKey(right * 1_000);
}

function chinaTradingDayTime(timestampMs: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 4) / 1_000);
}

function chinaDateKey(timestampMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestampMs));
}

function formatLabel(time: number, withTime: boolean): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
  }).format(new Date(time * 1_000));
}
