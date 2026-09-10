export function formatPrice(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  }).format(value!);
}

export function formatSignedPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${formatPrice(value)}`;
}

export function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "—";
  return `${value!.toFixed(2)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value!);
}

export function formatCurrency(value: number | null | undefined): string {
  const formatted = formatCompact(value);
  return formatted === "—" ? formatted : `¥${formatted}`;
}

export function formatFetchedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "刚刚更新";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}
