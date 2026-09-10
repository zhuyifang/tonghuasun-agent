<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type {
  MarketDepthData,
  MarketDepthLevel,
  MarketDepthSide,
  MarketTransaction
} from "@/shared/contracts";
import { formatCompact, formatPrice } from "./formatters";

const props = defineProps<{
  data?: MarketDepthData;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();

const TRANSACTION_ROW_HEIGHT = 20;
const transactionViewportElement = ref<HTMLElement>();
const transactionViewportHeight = ref(1);
const sellViewportElement = ref<HTMLElement>();
const buyViewportElement = ref<HTMLElement>();
let transactionResizeObserver: ResizeObserver | undefined;

const visibleDepthLevelCount = computed(() => props.data?.mode === "level2" ? 10 : 5);
const emptyLevels = (): MarketDepthLevel[] => Array.from({
  length: visibleDepthLevelCount.value
}, (_, index) => ({
  level: index + 1,
  price: null,
  volume: null
}));
const sellLevels = computed(() => [...(props.data?.asks ?? emptyLevels())]
  .filter((item) => item.level <= visibleDepthLevelCount.value)
  .sort((left, right) => right.level - left.level));
const buyLevels = computed(() => [...(props.data?.bids ?? emptyLevels())]
  .filter((item) => item.level <= visibleDepthLevelCount.value)
  .sort((left, right) => left.level - right.level));
const transactions = computed(() => props.data?.transactions ?? []);
const modeLabel = computed(() => props.data?.mode === "level2" ? "L2" : "普通");
const modeColor = computed(() => props.data?.mode === "level2" ? "arcoblue" : "gray");
const transactionVirtualListProps = computed(() => ({
  height: transactionViewportHeight.value,
  threshold: 10,
  fixedSize: true,
  estimatedSize: TRANSACTION_ROW_HEIGHT,
  // Arco 的缓冲区需要覆盖至少半屏数据，否则快速拖到底部时会露出虚假空白。
  buffer: Math.max(6, Math.ceil(transactionViewportHeight.value / TRANSACTION_ROW_HEIGHT / 2) + 2),
  itemKey: "id"
}));

onMounted(() => {
  const element = transactionViewportElement.value;
  if (!element) return;
  const measure = (): void => {
    transactionViewportHeight.value = Math.max(1, Math.floor(element.clientHeight));
  };
  measure();
  transactionResizeObserver = new ResizeObserver(measure);
  transactionResizeObserver.observe(element);
  alignDepthViewports();
});

onBeforeUnmount(() => transactionResizeObserver?.disconnect());

watch(
  [
    () => props.data?.mode,
    () => sellLevels.value.length,
    () => buyLevels.value.length
  ],
  alignDepthViewports,
  { flush: "post" }
);

/** 初次展示或档位数量变化时，让卖一、买一始终紧邻中间分隔线。 */
function alignDepthViewports(): void {
  void nextTick(() => {
    const sellViewport = sellViewportElement.value;
    const buyViewport = buyViewportElement.value;
    if (sellViewport) sellViewport.scrollTop = sellViewport.scrollHeight;
    if (buyViewport) buyViewport.scrollTop = 0;
  });
}

function formatTime(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function sideClass(side: MarketDepthSide): string {
  return side === "buy" ? "buy-value" : side === "sell" ? "sell-value" : "";
}

function rowKey(item: MarketTransaction): string {
  return item.id;
}
</script>

<template>
  <aside
    class="market-depth-panel"
    aria-label="买卖盘口和成交明细"
    :data-mode="data?.mode ?? 'loading'"
  >
    <section class="depth-section" aria-labelledby="depth-title">
      <header class="section-title-row">
        <a-typography-text id="depth-title" bold>盘口</a-typography-text>
        <a-tooltip v-if="data?.mode !== 'level2'" content="登录同花顺查看L2">
          <a-tag :color="modeColor">{{ modeLabel }}</a-tag>
        </a-tooltip>
        <a-tag v-else :color="modeColor">{{ modeLabel }}</a-tag>
      </header>

      <div class="data-header" aria-hidden="true">
        <span>档位</span>
        <span>价格</span>
        <span>委托量</span>
      </div>

      <div class="depth-rows">
        <div ref="sellViewportElement" class="depth-side sell-side">
          <div class="depth-side-content">
            <div v-for="item in sellLevels" :key="`sell-${item.level}`" class="data-row">
              <span class="sell-value">卖{{ item.level }}</span>
              <span>{{ formatPrice(item.price) }}</span>
              <span>{{ formatCompact(item.volume) }}</span>
            </div>
          </div>
        </div>
        <div class="depth-divider" aria-hidden="true" />
        <div ref="buyViewportElement" class="depth-side buy-side">
          <div class="depth-side-content">
            <div v-for="item in buyLevels" :key="`buy-${item.level}`" class="data-row">
              <span class="buy-value">买{{ item.level }}</span>
              <span>{{ formatPrice(item.price) }}</span>
              <span>{{ formatCompact(item.volume) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="details-section" aria-labelledby="details-title">
      <header class="section-title-row details-title-row">
        <a-typography-text id="details-title" bold>
          成交明细<span v-if="transactions.length"> {{ transactions.length }}</span>
        </a-typography-text>
        <a-tooltip v-if="data?.mode !== 'level2'" content="登录同花顺查看L2">
          <a-tag :color="modeColor">{{ modeLabel }}</a-tag>
        </a-tooltip>
        <a-tag v-else :color="modeColor">{{ modeLabel }}</a-tag>
      </header>
      <div class="data-header details-header" aria-hidden="true">
        <span>时间</span>
        <span>价格</span>
        <span>成交量</span>
      </div>
      <div ref="transactionViewportElement" class="transaction-viewport">
        <a-list
          v-if="transactions.length"
          class="transaction-rows"
          :bordered="false"
          :data="transactions"
          :split="false"
          :virtual-list-props="transactionVirtualListProps"
          scrollbar
          size="small"
        >
          <template #item="{ item }">
            <a-list-item :key="rowKey(item)" class="details-list-item">
              <div class="data-row details-row">
                <span>{{ formatTime(item.timestamp) }}</span>
                <span :class="sideClass(item.side)">{{ formatPrice(item.price) }}</span>
                <span>{{ formatCompact(item.volume) }}</span>
              </div>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else class="details-empty" description="暂无成交明细" />
      </div>
    </section>

    <div v-if="error" class="status-overlay" role="alert">
      <a-space direction="vertical" align="center">
        <a-typography-text type="danger">{{ error }}</a-typography-text>
        <a-button @click="emit('retry')">重新读取</a-button>
      </a-space>
    </div>
    <div v-else-if="loading && !data" class="status-overlay" aria-live="polite">
      <a-spin tip="正在读取盘口与成交明细…" />
    </div>
  </aside>
</template>

<style scoped>
.market-depth-panel {
  position: relative;
  box-sizing: border-box;
  display: grid;
  width: 286px;
  min-width: 286px;
  height: 540px;
  grid-template-rows: 205px minmax(0, 1fr);
  overflow: hidden;
  border-top: 1px solid var(--color-border-2);
  border-left: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}

.depth-section,
.details-section {
  min-height: 0;
}

.depth-section {
  height: 205px;
}

.details-section {
  overflow: hidden;
  border-top: 1px solid var(--color-border-2);
}

.section-title-row {
  box-sizing: border-box;
  display: flex;
  height: 30px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}

.section-title-row :deep(.arco-typography) {
  margin: 0;
  font-size: 13px;
}

.section-title-row :deep(.arco-tag) {
  height: 20px;
  line-height: 18px;
}

.data-header,
.data-row {
  display: grid;
  grid-template-columns: 52px minmax(64px, 1fr) minmax(64px, 1fr);
  align-items: center;
  padding: 0 12px;
  text-align: right;
}

.data-header {
  height: 20px;
  color: var(--color-text-3);
  background: var(--color-fill-1);
  font-size: 11px;
}

.depth-rows {
  display: grid;
  height: calc(100% - 50px);
  grid-template-rows: minmax(0, 1fr) 5px minmax(0, 1fr);
  overflow: hidden;
}

.depth-side {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.depth-side-content {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}

.sell-side .depth-side-content {
  justify-content: flex-end;
}

.depth-side .data-row {
  height: 15px;
  flex: 0 0 15px;
}

.depth-divider {
  height: 5px;
  background: var(--color-fill-2);
}

.data-header span:first-child,
.data-row span:first-child {
  text-align: left;
}

.data-row {
  height: 15px;
  color: var(--color-text-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.sell-value {
  color: rgb(var(--green-6));
}

.buy-value {
  color: rgb(var(--red-6));
}

.details-title-row {
  height: 30px;
}

.details-header,
.details-row {
  grid-template-columns: 1fr 1fr 1fr;
}

.transaction-viewport {
  height: calc(100% - 50px);
  min-height: 0;
  overflow: hidden;
}

.transaction-rows {
  height: 100%;
}

.transaction-rows :deep(.arco-list-content) {
  height: 100%;
}

.transaction-rows :deep(.arco-scrollbar) {
  height: 100%;
}

.details-list-item {
  min-height: 20px;
  padding: 0 !important;
  border: 0 !important;
}

.details-row {
  height: 20px;
}

.details-empty {
  height: 100%;
  min-height: 70px;
  padding: 8px 0;
}

.details-empty :deep(.arco-empty-image) {
  height: 34px;
}

.details-empty :deep(.arco-empty-description) {
  margin-top: 2px;
  font-size: 11px;
}

.status-overlay {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  padding: 20px;
  place-items: center;
  text-align: center;
  background: var(--color-bg-2);
}

@media (max-width: 960px) {
  .market-depth-panel {
    width: 100%;
    min-width: 0;
    height: 206px;
    min-height: 206px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: 205px;
    border-left: 0;
  }

  .details-section {
    height: 205px;
    min-height: 205px;
    border-top: 0;
    border-left: 1px solid var(--color-border-2);
  }
}

@media (max-width: 560px) {
  .market-depth-panel {
    height: 411px;
    min-height: 411px;
    grid-template-columns: 1fr;
    grid-template-rows: 205px 205px;
  }

  .details-section {
    height: 205px;
    min-height: 205px;
    border-top: 1px solid var(--color-border-2);
    border-left: 0;
  }
}
</style>
