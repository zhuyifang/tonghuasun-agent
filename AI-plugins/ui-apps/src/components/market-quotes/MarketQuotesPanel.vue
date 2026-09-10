<script setup lang="ts">
import type { TableColumnData } from "@arco-design/web-vue";
import { computed, onBeforeUnmount, ref, toRef, watch } from "vue";

import ComponentFrame from "@/components/shared/ComponentFrame.vue";
import type { ComponentConnectionState } from "@/components/shared/contracts";
import { useDataServiceReconnect } from "@/composables/useDataServiceReconnect";
import { useDelayedVisibility } from "@/composables/useDelayedVisibility";
import type { MarketSecurity } from "@/shared/contracts";
import type {
  MarketQuotePatch,
  MarketQuoteService,
  MarketQuoteSubscription,
  QuoteConnectionState
} from "./contracts";
import { marketSecurityKey } from "./contracts";
import MarketSparkline from "./MarketSparkline.vue";

interface QuoteRow extends MarketQuotePatch {
  key: string;
  trend: number[];
}

const props = withDefaults(defineProps<{
  service: MarketQuoteService;
  securities: readonly MarketSecurity[];
  active?: boolean;
  hiddenDelayMs?: number;
}>(), {
  active: true,
  hiddenDelayMs: 10_000
});

const root = ref<HTMLElement>();
const streamEnabled = useDelayedVisibility(root, toRef(props, "active"), props.hiddenDelayMs);
const rows = ref<QuoteRow[]>([]);
const loading = ref(false);
const connectionState = ref<QuoteConnectionState>("closed");
const errorText = ref("");
let loadEpoch = 0;
let subscription: MarketQuoteSubscription | undefined;
let requestController: AbortController | undefined;
let updateFrame: number | undefined;
const pendingUpdates = new Map<string, MarketQuotePatch>();

const {
  reconnecting: dataServiceReconnecting,
  connectionLoading: dataServiceLoading,
  handleServiceError
} = useDataServiceReconnect({
  service: props.service,
  onRecovered: () => {
    if (streamEnabled.value) return loadQuotes();
  }
});

const virtualListProps = {
  height: 520,
  threshold: 50,
  fixedSize: true,
  estimatedSize: 52,
  buffer: 8
};

const columns: TableColumnData[] = [
  { title: "证券", dataIndex: "name", slotName: "security", width: 160, fixed: "left" },
  { title: "日内走势", dataIndex: "trend", slotName: "trend", width: 190 },
  numberColumn("最新价", "latestPrice", "price", 110),
  numberColumn("涨跌幅", "changePercent", "changePercent", 110),
  numberColumn("涨跌额", "change", "change", 110),
  numberColumn("今开", "openPrice", "openPrice", 100),
  numberColumn("最高", "highPrice", "highPrice", 100),
  numberColumn("最低", "lowPrice", "lowPrice", 100),
  numberColumn("成交量", "volume", "volume", 120),
  numberColumn("成交额", "amount", "amount", 130),
  { title: "更新时间", dataIndex: "receivedAt", slotName: "receivedAt", width: 110, align: "right" }
];

const componentConnectionState = computed<ComponentConnectionState>(() => {
  if (dataServiceReconnecting.value) return "reconnecting";
  if (connectionState.value === "connected" && !errorText.value) return "connected";
  if (connectionState.value === "connecting" || connectionState.value === "reconnecting") {
    return "reconnecting";
  }
  return "disconnected";
});
const connectionLoading = computed(() => (
  streamEnabled.value
  && (dataServiceLoading.value
    || loading.value
    || connectionState.value === "connecting"
    || connectionState.value === "reconnecting")
));
const connectionLoadingTip = computed(() => (
  dataServiceLoading.value ? "正在重连数据服务" : "正在连接实时行情"
));

function numberColumn(
  title: string,
  dataIndex: string,
  slotName: string,
  width: number
): TableColumnData {
  return {
    title,
    dataIndex,
    slotName,
    width,
    align: "right",
    sortable: {
      sortDirections: ["ascend", "descend"],
      sorter: (left, right) => sortableNumber(rowNumber(left as QuoteRow, dataIndex))
        - sortableNumber(rowNumber(right as QuoteRow, dataIndex))
    }
  };
}

function rowNumber(row: QuoteRow, dataIndex: string): number | undefined {
  if (dataIndex === "change") return quoteChange(row);
  if (dataIndex === "changePercent") return quoteChangePercent(row);
  const value = row[dataIndex as keyof QuoteRow];
  return typeof value === "number" ? value : undefined;
}

function sortableNumber(value: number | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

function blankRow(security: MarketSecurity): QuoteRow {
  return {
    key: marketSecurityKey(security),
    security: { ...security },
    name: security.name,
    trend: [],
    receivedAt: 0
  };
}

async function loadQuotes(): Promise<void> {
  if (!streamEnabled.value) return;
  const epoch = ++loadEpoch;
  requestController?.abort();
  requestController = new AbortController();
  const signal = requestController.signal;
  subscription?.close();
  subscription = undefined;
  pendingUpdates.clear();
  connectionState.value = "connecting";
  errorText.value = "";
  loading.value = true;
  const securitiesToLoad = uniqueSecurities(props.securities);
  const currentKeys = rows.value.map((row) => row.key).join("|");
  const nextKeys = securitiesToLoad.map(marketSecurityKey).join("|");
  if (currentKeys !== nextKeys) rows.value = securitiesToLoad.map(blankRow);

  if (rows.value.length === 0) {
    loading.value = false;
    connectionState.value = "closed";
    return;
  }

  try {
    const securities = rows.value.map((row) => row.security);
    const snapshots = await props.service.getQuotes(securities, signal);
    if (epoch !== loadEpoch) return;
    applyPatches(snapshots, false);
    subscription = props.service.subscribe(securities, {
      onQuote: queueQuoteUpdate,
      onStateChange: (state) => {
        if (epoch === loadEpoch) {
          connectionState.value = state;
          if (state === "connected") errorText.value = "";
        }
      },
      onError: (error) => {
        if (epoch !== loadEpoch) return;
        errorText.value = error.message;
        if (props.service.connection.getSnapshot().state === "reconnecting") {
          connectionState.value = "reconnecting";
        }
      }
    });

    // 快照已可展示时立即解除表格加载态；日内走势作为辅助数据在后台补齐。
    loading.value = false;
    const trends = await props.service.getIntradayTrends(securities, signal);
    if (epoch !== loadEpoch) return;
    rows.value = rows.value.map((row) => ({
      ...row,
      trend: trends.get(row.key) ?? row.trend
    }));
  } catch (error) {
    if (epoch !== loadEpoch) return;
    if (handleServiceError(error)) {
      connectionState.value = "reconnecting";
      errorText.value = "";
    } else {
      connectionState.value = "closed";
      errorText.value = error instanceof Error ? error.message : "行情读取失败，请稍后重试。";
    }
  } finally {
    if (epoch === loadEpoch) loading.value = false;
  }
}

function pauseQuotes(): void {
  loadEpoch += 1;
  requestController?.abort();
  requestController = undefined;
  subscription?.close();
  subscription = undefined;
  pendingUpdates.clear();
  loading.value = false;
  connectionState.value = "closed";
}

/** 高频推送先在一帧内按证券合并，再批量更新表格，避免每个行情包触发一次渲染。 */
function queueQuoteUpdate(patch: MarketQuotePatch): void {
  const key = marketSecurityKey(patch.security);
  pendingUpdates.set(key, { ...pendingUpdates.get(key), ...patch });
  if (updateFrame !== undefined) return;
  updateFrame = window.requestAnimationFrame(() => {
    updateFrame = undefined;
    const patches = [...pendingUpdates.values()];
    pendingUpdates.clear();
    applyPatches(patches, true);
  });
}

function applyPatches(patches: readonly MarketQuotePatch[], appendTrend: boolean): void {
  if (patches.length === 0) return;
  const patchByKey = new Map(patches.map((patch) => [marketSecurityKey(patch.security), patch]));
  rows.value = rows.value.map((row) => {
    const patch = patchByKey.get(row.key);
    if (!patch) return row;
    const nextTrend = appendTrend && patch.latestPrice !== undefined
      ? [...row.trend, patch.latestPrice].slice(-64)
      : row.trend;
    return { ...row, ...patch, key: row.key, trend: nextTrend };
  });
}

function uniqueSecurities(securities: readonly MarketSecurity[]): MarketSecurity[] {
  return [...new Map(securities.map((item) => [marketSecurityKey(item), item])).values()];
}

function quoteChange(row: QuoteRow): number | undefined {
  return row.latestPrice !== undefined && row.previousClose !== undefined
    ? row.latestPrice - row.previousClose
    : undefined;
}

function quoteChangePercent(row: QuoteRow): number | undefined {
  const change = quoteChange(row);
  return change !== undefined && row.previousClose
    ? change / row.previousClose * 100
    : undefined;
}

function directionClass(value: number | undefined): string {
  return value === undefined || value === 0 ? "is-flat" : value > 0 ? "is-up" : "is-down";
}

function formatPrice(value: number | undefined): string {
  return value === undefined ? "--" : value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  });
}

function formatSigned(value: number | undefined, suffix = ""): string {
  if (value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function formatCompact(value: number | undefined): string {
  if (value === undefined) return "--";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatTime(value: number | undefined): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(value);
}

watch(
  [streamEnabled, () => props.service, () => props.securities] as const,
  ([enabled]) => {
    if (!enabled) {
      pauseQuotes();
      return;
    }
    void loadQuotes();
  },
  { immediate: true, deep: true }
);

onBeforeUnmount(() => {
  pauseQuotes();
  if (updateFrame !== undefined) window.cancelAnimationFrame(updateFrame);
});
</script>

<template>
  <section ref="root" class="market-quotes-panel-host">
    <ComponentFrame
      realtime
      :connection-state="componentConnectionState"
      :connection-loading="connectionLoading"
      :loading-tip="connectionLoadingTip"
    >
    <a-card class="market-quotes-panel" :bordered="false">
    <div class="quote-toolbar">
      <a-space class="quote-toolbar-main">
        <a-typography-title :heading="6">多股行情</a-typography-title>
        <a-tag>{{ rows.length }} 只</a-tag>
      </a-space>
    </div>

    <a-table
      class="quote-table"
      row-key="key"
      :columns="columns"
      :data="rows"
      :pagination="false"
      :bordered="{ wrapper: true, cell: false }"
      :scroll="{ x: 1_400, y: 520 }"
      :virtual-list-props="virtualListProps"
      stripe
    >
      <template #security="{ record }">
        <div class="security-cell">
          <span class="security-name">{{ record.name || record.security.name || record.security.code }}</span>
          <span class="security-code">{{ record.security.market }} · {{ record.security.code }}</span>
        </div>
      </template>
      <template #trend="{ record }">
        <MarketSparkline :values="record.trend" />
      </template>
      <template #price="{ record }">
        <span :class="directionClass(quoteChange(record))">{{ formatPrice(record.latestPrice) }}</span>
      </template>
      <template #changePercent="{ record }">
        <span :class="directionClass(quoteChangePercent(record))">
          {{ formatSigned(quoteChangePercent(record), "%") }}
        </span>
      </template>
      <template #change="{ record }">
        <span :class="directionClass(quoteChange(record))">{{ formatSigned(quoteChange(record)) }}</span>
      </template>
      <template #openPrice="{ record }">{{ formatPrice(record.openPrice) }}</template>
      <template #highPrice="{ record }">{{ formatPrice(record.highPrice) }}</template>
      <template #lowPrice="{ record }">{{ formatPrice(record.lowPrice) }}</template>
      <template #volume="{ record }">{{ formatCompact(record.volume) }}</template>
      <template #amount="{ record }">{{ formatCompact(record.amount) }}</template>
      <template #receivedAt="{ record }">{{ formatTime(record.receivedAt) }}</template>
      <template #empty>
        <a-empty description="暂无证券，请传入需要查看的证券列表" />
      </template>
    </a-table>

    </a-card>
    </ComponentFrame>
  </section>
</template>

<style scoped>
.market-quotes-panel-host,
.market-quotes-panel {
  width: 100%;
  min-width: 0;
}

.market-quotes-panel :deep(.arco-card-body) {
  padding: 0;
}

.quote-toolbar {
  box-sizing: border-box;
  display: flex;
  min-height: 52px;
  padding: 10px 16px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 16px;
  border-bottom: 1px solid var(--color-border-2);
}

.quote-toolbar-main {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
}

.quote-toolbar :deep(.arco-typography) {
  margin: 0;
}

.quote-table {
  width: 100%;
}

.quote-table :deep(.arco-table-th) {
  white-space: nowrap;
}

.security-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.security-name {
  overflow: hidden;
  color: var(--color-text-1);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.security-code {
  color: var(--color-text-3);
  font-size: 12px;
}

.is-up {
  color: rgb(var(--danger-6));
  font-variant-numeric: tabular-nums;
}

.is-down {
  color: rgb(var(--success-6));
  font-variant-numeric: tabular-nums;
}

.is-flat {
  color: var(--color-text-2);
  font-variant-numeric: tabular-nums;
}

</style>
