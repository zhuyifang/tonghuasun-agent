<script setup lang="ts">
import { computed } from 'vue'
import { datePresets, presetRange, type DatePreset } from '../date-range'
import DateRangeInput from './DateRangeInput.vue'

const props = defineProps<{ startDate: string; endDate: string; disabled?: boolean }>()
const emit = defineEmits<{
  'update:startDate': [value: string]
  'update:endDate': [value: string]
  apply: []
}>()
const selected = computed(() => datePresets.find(({ key }) => {
  const range = presetRange(key)
  return range.startDate === props.startDate && range.endDate === props.endDate
})?.key)

function choose(key: DatePreset) {
  const range = presetRange(key)
  apply(range.startDate, range.endDate)
}
function apply(start: string, end: string) {
  emit('update:startDate', start)
  emit('update:endDate', end)
  emit('apply')
}
</script>

<template>
  <div class="date-range-picker">
    <div class="date-shortcuts" role="group" aria-label="快捷时间范围">
      <button v-for="preset in datePresets" :key="preset.key" type="button"
        :class="{ active: selected === preset.key }" :aria-pressed="selected === preset.key"
        :disabled="disabled" @click="choose(preset.key)">{{ preset.label }}</button>
    </div>
    <DateRangeInput :start-date="startDate" :end-date="endDate" :disabled="disabled" @change="apply" />
  </div>
</template>

<style scoped>
.date-range-picker { display: flex; flex: 1 1 auto; flex-flow: row nowrap; align-items: center; gap: 24px; min-width: 0; overflow-x: auto; }
.date-shortcuts { display: flex; flex: 0 0 auto; flex-wrap: nowrap; gap: 22px; }
.date-shortcuts button { padding: 8px 0; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; color: #536279; font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; }
.date-shortcuts button:hover:not(:disabled), .date-shortcuts button.active { color: #3487ff; }
.date-shortcuts button.active { border-bottom-color: #3487ff; }
.date-shortcuts button:disabled { opacity: .6; cursor: wait; }
.date-shortcuts button:focus-visible { outline: 2px solid #3487ff; outline-offset: 4px; }
</style>
