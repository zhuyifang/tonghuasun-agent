export const datePresets = [
  { key: 'today', label: '当日' },
  { key: 'week', label: '近一周' },
  { key: 'month', label: '近一月' },
  { key: 'quarter', label: '近三月' },
  { key: 'year', label: '近一年' },
] as const

export type DatePreset = typeof datePresets[number]['key']

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function presetRange(preset: DatePreset, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'week') start.setDate(start.getDate() - 6)
  else if (preset !== 'today') {
    // 月末和闰年按目标月份最后一天取整，避免直接 setMonth 溢出到下个月。
    const months = preset === 'month' ? 1 : preset === 'quarter' ? 3 : 12
    const lastDay = new Date(start.getFullYear(), start.getMonth() - months + 1, 0).getDate()
    start.setDate(1)
    start.setMonth(start.getMonth() - months)
    start.setDate(Math.min(now.getDate(), lastDay))
  }
  return { startDate: formatDate(start), endDate: formatDate(now) }
}
