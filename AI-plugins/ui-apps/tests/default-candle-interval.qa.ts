import { defaultCandleInterval } from "../src/components/candle/defaultCandleInterval";

const cases = [
  "2026-09-10T01:29:00Z", "2026-09-10T01:30:00Z", "2026-09-10T03:30:00Z",
  "2026-09-10T05:00:00Z", "2026-09-10T07:00:00Z", "2026-09-12T02:00:00Z"
] as const;

const NativeDate = globalThis.Date;
try {
  for (const timestamp of cases) {
    globalThis.Date = class extends NativeDate {
      constructor() { super(timestamp); }
      static now() { return NativeDate.parse(timestamp); }
    } as DateConstructor;
    if (defaultCandleInterval() !== "intraday") {
      throw new Error(`默认周期不应随时间变化：${timestamp}`);
    }
  }
} finally {
  globalThis.Date = NativeDate;
}

process.stdout.write("开盘前、盘中、午休、收盘后和周末均默认分时，验收通过。\n");
