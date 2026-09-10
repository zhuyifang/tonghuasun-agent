import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";

import type { CandleBar, CandleData } from "@/shared/contracts";
import { isLineKlineInterval, isMinuteKlineInterval } from "@/shared/kline";
import { formatPrice } from "./formatters";

export type CandleHoverHandler = (bar: CandleBar | null) => void;

export class CandleChartController {
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<"Candlestick"> | null = null;
  private lineSeries: ISeriesApi<"Line"> | null = null;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private movingAverageSeries: Array<ISeriesApi<"Line">> = [];
  private data: CandleData | null = null;
  private movingAveragesVisible = true;

  constructor(
    private readonly container: HTMLElement,
    private readonly onHover: CandleHoverHandler
  ) {}

  render(data: CandleData): void {
    this.destroyChart();
    this.data = data;

    const styles = getComputedStyle(this.container);
    const textColor = cssColor(styles, "--color-text-3", "#86909c");
    const lineColor = cssColor(styles, "--color-border-2", "#e5e6eb");
    const riseColor = "#f53f3f";
    const fallColor = "#00b42a";
    const isLineChart = isLineKlineInterval(data.interval);
    this.chart = createChart(this.container, {
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight),
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor
      },
      grid: {
        vertLines: { color: lineColor },
        horzLines: { color: lineColor }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: lineColor },
      timeScale: {
        borderColor: lineColor,
        timeVisible: isMinuteKlineInterval(data.interval),
        secondsVisible: false,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => formatTickMark(time, tickMarkType)
      },
      localization: {
        locale: "zh-CN",
        priceFormatter: (price: number) => formatPrice(price),
        timeFormatter: (time: Time) => formatChartTime(time, isMinuteKlineInterval(data.interval))
      }
    });

    if (isLineChart) {
      this.lineSeries = this.chart.addSeries(LineSeries, {
        color: "#165dff",
        lineWidth: 2,
        priceLineVisible: true,
        crosshairMarkerVisible: true
      });
      this.lineSeries.setData(data.bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.close
      })));
    } else {
      this.candleSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: riseColor,
        downColor: fallColor,
        borderVisible: false,
        wickUpColor: riseColor,
        wickDownColor: fallColor,
        priceLineVisible: false
      });
      this.candleSeries.setData(data.bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      })));
    }
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false
    });
    this.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
    this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const volumes = isLineChart ? incrementalVolumes(data.bars) : data.bars.map((bar) => bar.volume);
    this.volumeSeries.setData(data.bars.map((bar, index) => ({
      time: bar.time as UTCTimestamp,
      value: volumes[index] ?? 0,
      color: `${isRisingBar(data.bars, index, isLineChart) ? riseColor : fallColor}70`
    })));

    const averageColors = ["#ff7d00", "#722ed1", "#0fc6c2"];
    this.movingAverageSeries = isLineChart
      ? []
      : [5, 10, 20].map((period, index) => this.addMovingAverage(
          data.bars,
          period,
          averageColors[index]!
        ));
    this.chart.timeScale().fitContent();
    this.chart.subscribeCrosshairMove((parameter) => this.handleCrosshair(parameter.time));
  }

  /**
   * 实时推送只更新最后一个点或追加一个点，不重建图表，避免报价到达时图表闪烁、
   * 缩放位置复位。若历史结构真的发生变化，才回退到完整 render。
   */
  update(data: CandleData): void {
    const previous = this.data;
    if (!previous || !this.chart || !isIncrementalUpdate(previous, data)) {
      this.render(data);
      return;
    }
    const bar = data.bars.at(-1);
    if (!bar || !this.volumeSeries) return;
    const isLineChart = isLineKlineInterval(data.interval);
    if (isLineChart) {
      this.lineSeries?.update({ time: bar.time as UTCTimestamp, value: bar.close });
    } else {
      this.candleSeries?.update({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      });
    }

    const barIndex = data.bars.length - 1;
    const volume = isLineChart ? incrementalVolumeAt(data.bars, barIndex) : bar.volume;
    this.volumeSeries.update({
      time: bar.time as UTCTimestamp,
      value: volume,
      color: `${isRisingBar(data.bars, barIndex, isLineChart) ? "#f53f3f" : "#00b42a"}70`
    });
    if (!isLineChart) {
      [5, 10, 20].forEach((period, index) => {
        const average = movingAverageAt(data.bars, period);
        if (average !== null) {
          this.movingAverageSeries[index]?.update({
            time: bar.time as UTCTimestamp,
            value: average
          });
        }
      });
    }
    this.data = data;
    if (data.bars.length > previous.bars.length) this.chart.timeScale().scrollToRealTime();
  }

  setMovingAveragesVisible(visible: boolean): void {
    this.movingAveragesVisible = visible;
    for (const series of this.movingAverageSeries) series.applyOptions({ visible });
  }

  resize(): void {
    this.chart?.applyOptions({
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight)
    });
  }

  destroy(): void {
    this.destroyChart();
    this.data = null;
  }

  private addMovingAverage(bars: CandleBar[], period: number, color: string): ISeriesApi<"Line"> {
    const series = this.chart!.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: this.movingAveragesVisible
    });
    const values: Array<{ time: UTCTimestamp; value: number }> = [];
    let sum = 0;
    for (let index = 0; index < bars.length; index += 1) {
      sum += bars[index]!.close;
      if (index >= period) sum -= bars[index - period]!.close;
      if (index >= period - 1) {
        values.push({ time: bars[index]!.time as UTCTimestamp, value: sum / period });
      }
    }
    series.setData(values);
    return series;
  }

  private handleCrosshair(time: Time | undefined): void {
    if (typeof time !== "number" || !this.data) {
      this.onHover(null);
      return;
    }
    this.onHover(this.data.bars.find((bar) => bar.time === time) ?? null);
  }

  private destroyChart(): void {
    this.chart?.remove();
    this.chart = null;
    this.candleSeries = null;
    this.lineSeries = null;
    this.volumeSeries = null;
    this.movingAverageSeries = [];
    this.onHover(null);
  }
}

function cssColor(styles: CSSStyleDeclaration, property: string, fallback: string): string {
  return styles.getPropertyValue(property).trim() || fallback;
}

function formatTickMark(time: Time, tickMarkType: TickMarkType): string {
  const date = chartDate(time);
  if (!date) return "";
  if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function formatChartTime(time: Time, withTime: boolean): string {
  const date = chartDate(time);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
  }).format(date);
}

function chartDate(time: Time): Date | null {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") {
    const parsed = new Date(time);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function incrementalVolumes(bars: CandleBar[]): number[] {
  return bars.map((bar, index) => {
    const previous = index > 0 ? bars[index - 1]!.volume : 0;
    const difference = bar.volume - previous;
    return difference >= 0 ? difference : bar.volume;
  });
}

function incrementalVolumeAt(bars: CandleBar[], index: number): number {
  const previous = index > 0 ? bars[index - 1]!.volume : 0;
  const difference = bars[index]!.volume - previous;
  return difference >= 0 ? difference : bars[index]!.volume;
}

function movingAverageAt(bars: CandleBar[], period: number): number | null {
  if (bars.length < period) return null;
  return bars.slice(-period).reduce((sum, bar) => sum + bar.close, 0) / period;
}

function isIncrementalUpdate(previous: CandleData, next: CandleData): boolean {
  if (previous.interval !== next.interval || next.bars.length < previous.bars.length) return false;
  if (next.bars.length - previous.bars.length > 1 || next.bars.length === 0) return false;
  const stableLength = next.bars.length > previous.bars.length
    ? previous.bars.length
    : Math.max(0, previous.bars.length - 1);
  for (let index = 0; index < stableLength; index += 1) {
    if (previous.bars[index]?.time !== next.bars[index]?.time) return false;
  }
  return next.bars.at(-1)!.time >= previous.bars.at(-1)!.time;
}

function isRisingBar(bars: CandleBar[], index: number, isIntraday: boolean): boolean {
  const bar = bars[index]!;
  if (!isIntraday || index === 0) return bar.close >= bar.open;
  return bar.close >= bars[index - 1]!.close;
}
