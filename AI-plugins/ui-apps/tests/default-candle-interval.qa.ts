import { defaultCandleInterval } from "../src/components/candle/defaultCandleInterval";

const security = { market: "USHA" };
const cases = [
  ["2026-09-10T01:29:00Z", "day"],
  ["2026-09-10T01:30:00Z", "intraday"],
  ["2026-09-10T03:29:00Z", "intraday"],
  ["2026-09-10T03:30:00Z", "day"],
  ["2026-09-10T04:59:00Z", "day"],
  ["2026-09-10T05:00:00Z", "intraday"],
  ["2026-09-10T06:59:00Z", "intraday"],
  ["2026-09-10T07:00:00Z", "day"],
  ["2026-09-12T02:00:00Z", "day"]
] as const;

for (const [timestamp, expected] of cases) {
  const actual = defaultCandleInterval(security, new Date(timestamp));
  if (actual !== expected) {
    throw new Error(`默认行情周期判断错误：${timestamp} expected=${expected} actual=${actual}`);
  }
}

if (defaultCandleInterval({ market: "UNKNOWN" }, new Date("2026-09-10T02:00:00Z")) !== "day") {
  throw new Error("未知市场必须保守使用日 K。");
}

process.stdout.write("交易时段默认分时、非交易时段默认日 K 验收通过。\n");
