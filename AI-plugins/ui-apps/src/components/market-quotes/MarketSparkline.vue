<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  values: readonly number[];
}>();

const points = computed(() => props.values.filter(Number.isFinite));
const direction = computed(() => {
  const values = points.value;
  if (values.length < 2) return "flat";
  const change = values.at(-1)! - values[0];
  return change > 0 ? "up" : change < 0 ? "down" : "flat";
});
const stroke = computed(() => ({
  up: "rgb(var(--danger-6))",
  down: "rgb(var(--success-6))",
  flat: "rgb(var(--arcoblue-6))"
})[direction.value]);
const path = computed(() => {
  const values = points.value;
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = index / (values.length - 1) * 160;
    const y = 31 - (value - min) / range * 26;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
});
const lastPoint = computed(() => {
  const match = path.value.match(/L([\d.]+) ([\d.]+)$/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
});
</script>

<template>
  <svg
    v-if="path"
    class="market-sparkline"
    viewBox="0 0 160 36"
    preserveAspectRatio="none"
    role="img"
    aria-label="日内价格走势"
  >
    <line class="baseline" x1="0" y1="18" x2="160" y2="18" />
    <path :d="path" fill="none" :stroke="stroke" stroke-width="2" vector-effect="non-scaling-stroke" />
    <circle v-if="lastPoint" :cx="lastPoint.x" :cy="lastPoint.y" r="2.5" :fill="stroke" />
  </svg>
  <span v-else class="empty-trend">--</span>
</template>

<style scoped>
.market-sparkline {
  display: block;
  width: 100%;
  height: 36px;
}

.baseline {
  stroke: var(--color-border-2);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}

.empty-trend {
  color: var(--color-text-3);
}
</style>
