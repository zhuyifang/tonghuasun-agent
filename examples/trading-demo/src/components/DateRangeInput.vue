<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDate } from '../date-range'

const props = defineProps<{ startDate: string; endDate: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [startDate: string, endDate: string] }>()
const control = ref<HTMLDivElement | null>(null)
const popup = ref<HTMLDivElement | null>(null)
const anchor = ref(new Date())
const draftStart = ref('')
const draftEnd = ref('')
const pickingEnd = ref(false)
const position = ref({ left: '0px', top: '0px' })
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const display = computed(() => `${props.startDate}  至  ${props.endDate}`)
const months = computed(() => [0, 1].map(offset => {
  const date = new Date(anchor.value.getFullYear(), anchor.value.getMonth() + offset, 1)
  const days: Array<string | null> = Array((date.getDay() + 6) % 7).fill(null)
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  for (let day = 1; day <= count; day++) days.push(formatDate(new Date(date.getFullYear(), date.getMonth(), day)))
  return { title: `${date.getFullYear()}年${date.getMonth() + 1}月`, days }
}))

function open() {
  if (props.disabled || !control.value || !popup.value) return
  if (popup.value.matches(':popover-open')) { popup.value.hidePopover(); return }
  const [year, month] = props.startDate.split('-').map(Number)
  anchor.value = year && month ? new Date(year, month - 1, 1) : new Date()
  draftStart.value = props.startDate
  draftEnd.value = props.endDate
  pickingEnd.value = false
  const rect = control.value.getBoundingClientRect()
  const width = Math.min(590, window.innerWidth - 24)
  position.value = {
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    top: `${Math.max(12, rect.bottom + 358 > window.innerHeight ? rect.top - 352 : rect.bottom + 6)}px`,
  }
  popup.value.showPopover()
}

function moveMonth(amount: number) {
  anchor.value = new Date(anchor.value.getFullYear(), anchor.value.getMonth() + amount, 1)
}

function selectDate(date: string) {
  if (!pickingEnd.value) {
    draftStart.value = date
    draftEnd.value = ''
    pickingEnd.value = true
    return
  }
  const [start, end] = [draftStart.value, date].sort()
  emit('change', start!, end!)
  popup.value?.hidePopover()
  control.value?.querySelector('input')?.focus()
}
</script>

<template>
  <div ref="control" class="range-input" :class="{ disabled }">
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /></svg>
    <input :value="display" aria-label="查询日期区间" aria-haspopup="dialog" readonly :disabled="disabled"
      @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open" />
  </div>
  <div ref="popup" popover="auto" class="range-calendar" :style="position" role="dialog" aria-label="选择日期区间">
    <div class="calendar-toolbar">
      <button type="button" aria-label="上个月" @click="moveMonth(-1)">‹</button>
      <span aria-live="polite">{{ pickingEnd ? '选择结束日期' : '选择开始日期' }}</span>
      <button type="button" aria-label="下个月" @click="moveMonth(1)">›</button>
    </div>
    <div class="calendar-months">
      <section v-for="month in months" :key="month.title" :aria-label="month.title">
        <h4>{{ month.title }}</h4>
        <div class="calendar-days">
          <span v-for="day in weekdays" :key="day" class="weekday">{{ day }}</span>
          <template v-for="(date, index) in month.days" :key="index">
            <button v-if="date" type="button" :aria-label="date"
              :class="{ endpoint: date === draftStart || date === draftEnd, between: draftEnd && date > draftStart && date < draftEnd }"
              :aria-pressed="date === draftStart || date === draftEnd" @click="selectDate(date)">{{ Number(date.slice(-2)) }}</button>
            <span v-else></span>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.range-input { position: relative; flex: 0 0 310px; min-width: 270px; height: 40px; border: 1px solid #dce3ee; border-radius: 6px; background: #fff; }
.range-input:focus-within { border-color: #3487ff; box-shadow: 0 0 0 2px #3487ff12; }
.range-input svg { position: absolute; top: 11px; left: 12px; width: 17px; height: 17px; fill: none; stroke: #8290a5; stroke-width: 1.5; pointer-events: none; }
.range-input input { width: 100%; height: 100%; padding: 0 10px 0 38px; border: 0; border-radius: inherit; outline: 0; background: transparent; box-shadow: none; color: #344158; font-size: 13px; cursor: pointer; font-variant-numeric: tabular-nums; }
.range-input.disabled { opacity: .65; }
.range-calendar { position: fixed; box-sizing: border-box; width: min(590px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; margin: 0; padding: 12px 16px 18px; border: 1px solid #dce3ee; border-radius: 10px; color: #344158; background: #fff; box-shadow: 0 10px 34px #27365426; }
.calendar-toolbar { display: flex; align-items: center; justify-content: space-between; color: #7c889b; font-size: 13px; }
.calendar-toolbar button { width: 30px; height: 28px; border: 0; border-radius: 4px; background: none; color: #63718a; font-size: 23px; }
.calendar-months { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.calendar-months h4 { margin: 10px 0 16px; text-align: center; font-size: 14px; font-weight: 600; }
.calendar-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); row-gap: 4px; }
.calendar-days .weekday { padding-bottom: 10px; text-align: center; color: #8b98ab; font-size: 12px; }
.calendar-days button { height: 30px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #344158; font-size: 13px; }
.calendar-days button.between { border-radius: 0; background: #edf4ff; }
.calendar-days button.endpoint { background: #3487ff; color: #fff; }
.calendar-days button:hover:not(.endpoint), .calendar-toolbar button:hover { background: #e6f0ff; color: #225ce7; }
.calendar-days button:focus-visible { outline: 2px solid #3487ff; outline-offset: 1px; }
@media (max-width: 480px) { .calendar-months { grid-template-columns: 1fr; } .calendar-months section + section { display: none; } }
</style>
