<script setup lang="ts">
import type { TableColumnData } from "@arco-design/web-vue";
import { computed, defineAsyncComponent, onBeforeUnmount, ref, toRef, watch } from "vue";

import ComponentFrame from "@/components/shared/ComponentFrame.vue";
import PermissionRequiredState from "@/components/shared/PermissionRequiredState.vue";
import type { ComponentConnectionState } from "@/components/shared/contracts";
import { useDataServiceReconnect } from "@/composables/useDataServiceReconnect";
import { useDelayedVisibility } from "@/composables/useDelayedVisibility";
import type {
  LoginService,
  MarketSecurity,
  OrderFlowConnectionState,
  OrderFlowDataMode,
  OrderFlowQuote,
  OrderFlowRecord,
  OrderFlowWatchConnection,
  OrderFlowWatchListener,
  OrderFlowWatchService
} from "@/shared/contracts";

const props = withDefaults(defineProps<{
  service: OrderFlowWatchService;
  loginService?: LoginService;
  active?: boolean;
  initialSecurity?: MarketSecurity;
  hiddenDelayMs?: number;
}>(), {
  active: true,
  initialSecurity: undefined,
  hiddenDelayMs: 10_000
});

const emit = defineEmits<{
  requestLogin: [];
}>();
const LoginPanel = defineAsyncComponent(() => import("@/components/login/LoginPanel.vue"));

type PanelState = "idle" | "connecting" | "connected" | "paused" | "reconnecting" | "error";

const root = ref<HTMLElement>();
const streamEnabled = useDelayedVisibility(root, toRef(props, "active"), props.hiddenDelayMs);
const selectedSecurity = ref<MarketSecurity | undefined>(props.initialSecurity);
const selectedValue = ref(props.initialSecurity?.fullCode);
const searchOptions = ref<MarketSecurity[]>(props.initialSecurity ? [props.initialSecurity] : []);
const searchBusy = ref(false);
let searchTimer: number | undefined;
let searchRevision = 0;

const panelState = ref<PanelState>("idle");
const loginDialogVisible = ref(false);
const connectionMessage = ref("请选择证券后开始盯盘。");
const interfaceError = ref("");
const dataMode = ref<OrderFlowDataMode>();
const quote = ref<OrderFlowQuote>();
const orders = ref<OrderFlowRecord[]>([]);
const cancels = ref<OrderFlowRecord[]>([]);
const seenRecordIds = new Set<string>();
let connection: OrderFlowWatchConnection | undefined;
let connectController: AbortController | undefined;
let connectRevision = 0;

const {
  reconnecting: dataServiceReconnecting,
  connectionLoading: dataServiceLoading,
  handleServiceError
} = useDataServiceReconnect({
  service: props.service,
  onRecovered: () => {
    if (streamEnabled.value && selectedSecurity.value) return startConnection();
  }
});

const largeOnly = ref(false);
const largeAmountWan = ref(50);
const markEnabled = ref(false);
const markAmountWan = ref(100);

const securityLabel = computed(() => selectedSecurity.value
  ? `${selectedSecurity.value.name || ""} ${selectedSecurity.value.code}`.trim()
  : "未选择证券");
const priceText = computed(() => formatPrice(quote.value?.latestPrice));
const priceType = computed(() => {
  const latest = quote.value?.latestPrice;
  const previous = quote.value?.previousClose;
  if (latest === null || latest === undefined || previous === null || previous === undefined) return "neutral";
  return latest > previous ? "rise" : latest < previous ? "fall" : "neutral";
});
const componentConnectionState = computed<ComponentConnectionState>(() => {
  if (dataServiceReconnecting.value) return "reconnecting";
  if (panelState.value === "connected") return "connected";
  if (panelState.value === "connecting" || panelState.value === "reconnecting") {
    return "reconnecting";
  }
  return "disconnected";
});
const connectionLoading = computed(() => (
  streamEnabled.value
  && (dataServiceLoading.value
    || panelState.value === "connecting"
    || panelState.value === "reconnecting")
));
const connectionLoadingTip = computed(() => (
  dataServiceLoading.value ? "正在重连数据服务" : "正在连接实时数据"
));
const filteredOrders = computed(() => filterRecords(orders.value));
const filteredCancels = computed(() => filterRecords(cancels.value));
const streamVirtualListProps = {
  height: 360,
  threshold: 20,
  fixedSize: true,
  estimatedSize: 30,
  buffer: 5
};

const orderColumns: TableColumnData[] = [
  { title: "委托时间", slotName: "time", width: 70 },
  {
    title: "方向",
    slotName: "side",
    width: 46,
    headerCellStyle: { whiteSpace: "nowrap" },
    bodyCellStyle: { whiteSpace: "nowrap" }
  },
  { title: "委托价格", slotName: "price", width: 74 },
  { title: "委托量（股）", slotName: "volume", width: 82 },
  { title: "委托金额", slotName: "amount", width: 74 }
];
const cancelColumns: TableColumnData[] = [
  { title: "委托时间", slotName: "orderTime", width: 70 },
  { title: "撤单时间", slotName: "time", width: 70 },
  {
    title: "方向",
    slotName: "side",
    width: 46,
    headerCellStyle: { whiteSpace: "nowrap" },
    bodyCellStyle: { whiteSpace: "nowrap" }
  },
  { title: "委托价格", slotName: "price", width: 74 },
  { title: "撤单量（股）", slotName: "volume", width: 82 },
  { title: "撤单金额", slotName: "amount", width: 74 }
];

function handleSearch(value: string): void {
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  const pattern = value.trim();
  if (!pattern) {
    searchOptions.value = selectedSecurity.value ? [selectedSecurity.value] : [];
    return;
  }
  searchTimer = window.setTimeout(() => void searchSecurities(pattern), 250);
}

async function searchSecurities(pattern: string): Promise<void> {
  const revision = ++searchRevision;
  searchBusy.value = true;
  try {
    const result = await props.service.searchSecurities(pattern);
    if (revision !== searchRevision) return;
    searchOptions.value = result;
    if (!result.length) {
      interfaceError.value = "没有找到匹配的证券，请换一个代码或名称。";
    } else if (interfaceError.value.startsWith("证券搜索接口不可用")) {
      interfaceError.value = "";
    }
  } catch (error) {
    if (revision !== searchRevision) return;
    interfaceError.value = `证券搜索接口不可用：${errorMessage(error)}`;
  } finally {
    if (revision === searchRevision) searchBusy.value = false;
  }
}

function selectSecurity(value: unknown): void {
  const key = typeof value === "string" ? value : "";
  selectedSecurity.value = searchOptions.value.find((item) => optionKey(item) === key);
  resetRecords();
  interfaceError.value = "";
  if (!selectedSecurity.value) {
    stopConnection();
    panelState.value = "idle";
    connectionMessage.value = "请选择证券后开始盯盘。";
  }
}

function resetRecords(): void {
  quote.value = undefined;
  orders.value = [];
  cancels.value = [];
  seenRecordIds.clear();
}

async function startConnection(): Promise<void> {
  const security = selectedSecurity.value;
  if (!security || !streamEnabled.value) return;
  stopConnection();
  const revision = ++connectRevision;
  const controller = new AbortController();
  connectController = controller;
  panelState.value = "connecting";
  interfaceError.value = "";
  connectionMessage.value = "正在连接实时数据…";

  const listener: OrderFlowWatchListener = {
    onConnectionState: (state, message) => {
      if (revision !== connectRevision) return;
      applyConnectionState(state, message);
    },
    onModeChange: (change) => {
      if (revision !== connectRevision) return;
      dataMode.value = change.mode;
      if (change.mode === "basic") {
        orders.value = [];
        cancels.value = [];
        seenRecordIds.clear();
      }
    },
    onQuote: (nextQuote) => {
      if (revision === connectRevision) quote.value = nextQuote;
    },
    onRecords: (records) => {
      if (revision === connectRevision) appendRecords(records);
    },
    onError: (message) => {
      if (revision !== connectRevision) return;
      connectionMessage.value = `实时数据接口不可用：${message}`;
      panelState.value = props.service.connection.getSnapshot().state === "reconnecting"
        ? "reconnecting"
        : "error";
    }
  };

  try {
    const nextConnection = await props.service.connect(security, listener, controller.signal);
    if (revision !== connectRevision || !streamEnabled.value) {
      nextConnection.close();
      return;
    }
    connection = nextConnection;
  } catch (error) {
    if (revision !== connectRevision || isAbortError(error)) return;
    connectionMessage.value = `实时数据接口不可用：${errorMessage(error)}`;
    const unavailable = handleServiceError(error)
      || props.service.connection.getSnapshot().state === "reconnecting";
    panelState.value = unavailable ? "reconnecting" : "error";
  }
}

function stopConnection(nextState?: PanelState): void {
  connectRevision += 1;
  connectController?.abort();
  connectController = undefined;
  connection?.close();
  connection = undefined;
  if (nextState) panelState.value = nextState;
}

function openLoginDialog(): void {
  if (!props.loginService) {
    emit("requestLogin");
    return;
  }
  loginDialogVisible.value = true;
}

function handleLoginSuccess(): void {
  loginDialogVisible.value = false;
  resetRecords();
  void startConnection();
}

function applyConnectionState(state: OrderFlowConnectionState, message: string): void {
  connectionMessage.value = message;
  if (state === "closed") {
    panelState.value = props.service.connection.getSnapshot().state === "reconnecting"
      ? "reconnecting"
      : "error";
    return;
  }
  panelState.value = state;
}

function appendRecords(records: OrderFlowRecord[]): void {
  const newOrders: OrderFlowRecord[] = [];
  const newCancels: OrderFlowRecord[] = [];
  for (const record of records) {
    if (seenRecordIds.has(record.id)) continue;
    seenRecordIds.add(record.id);
    (record.kind === "order" ? newOrders : newCancels).push(record);
  }
  if (newOrders.length) orders.value = mergeNewest(orders.value, newOrders);
  if (newCancels.length) cancels.value = mergeNewest(cancels.value, newCancels);
}

function mergeNewest(current: OrderFlowRecord[], incoming: OrderFlowRecord[]): OrderFlowRecord[] {
  return [...current, ...incoming]
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 500);
}

function filterRecords(records: OrderFlowRecord[]): OrderFlowRecord[] {
  if (!largeOnly.value) return records;
  const minimum = Math.max(0, largeAmountWan.value || 0) * 10_000;
  return records.filter((record) => (record.amount ?? 0) >= minimum);
}

function rowClass(record: OrderFlowRecord): string {
  if (!markEnabled.value) return "";
  const minimum = Math.max(0, markAmountWan.value || 0) * 10_000;
  return (record.amount ?? 0) >= minimum ? "marked-row" : "";
}

function optionKey(security: MarketSecurity): string {
  return security.fullCode || `${security.market}${security.code}`;
}

function optionLabel(security: MarketSecurity): string {
  return `${security.name || "未知名称"}　${security.code}`;
}

function sideLabel(record: OrderFlowRecord): string {
  return record.side === "buy" ? "买入" : record.side === "sell" ? "卖出" : "未知";
}

function sideClass(record: OrderFlowRecord): string {
  return record.side === "buy" ? "buy" : record.side === "sell" ? "sell" : "neutral";
}

function formatTime(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(timestamp);
}

function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function formatVolume(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatAmount(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请稍后重试。";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

watch([streamEnabled, selectedSecurity], ([enabled, security], [wasEnabled, previousSecurity]) => {
  if (!enabled || !security) {
    if (!enabled && wasEnabled) stopConnection("paused");
    return;
  }
  if (!wasEnabled || security !== previousSecurity) void startConnection();
}, { immediate: true });

onBeforeUnmount(() => {
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  stopConnection();
});
</script>

<template>
  <section ref="root" class="order-flow-watch-panel">
  <ComponentFrame
    realtime
    :connection-state="componentConnectionState"
    :connection-loading="connectionLoading"
    :loading-tip="connectionLoadingTip"
  >
  <a-card class="order-flow-card" :bordered="false">
    <template #title>
      <a-space>
        <span>L2 - 逐笔委托</span>
        <a-tag>{{ securityLabel }}</a-tag>
      </a-space>
    </template>
    <template #extra>
      <a-space>
        <span class="latest-label">当前价</span>
        <strong class="latest-price" :class="priceType">{{ priceText }}</strong>
        <a-tag v-if="dataMode === 'basic'">普通行情</a-tag>
        <a-tag v-else-if="dataMode === 'level2'" color="arcoblue">Level-2</a-tag>
      </a-space>
    </template>

    <div class="toolbar">
      <a-select
        v-model="selectedValue"
        class="security-select"
        allow-clear
        allow-search
        :filter-option="false"
        :loading="searchBusy"
        :error="Boolean(interfaceError)"
        :title="interfaceError || undefined"
        placeholder="输入证券代码或名称"
        @search="handleSearch"
        @change="selectSecurity"
      >
        <a-option
          v-for="security in searchOptions"
          :key="optionKey(security)"
          :value="optionKey(security)"
        >
          {{ optionLabel(security) }}
        </a-option>
      </a-select>
      <div class="filter-row">
        <div class="filter-control">
          <a-checkbox v-model="largeOnly">仅看大单</a-checkbox>
          <a-input-number v-model="largeAmountWan" :min="0" hide-button class="amount-input">
            <template #suffix>万元起</template>
          </a-input-number>
        </div>
        <div class="filter-control">
          <a-checkbox v-model="markEnabled">标记大单</a-checkbox>
          <a-input-number v-model="markAmountWan" :min="0" hide-button class="amount-input">
            <template #suffix>万元起</template>
          </a-input-number>
        </div>
      </div>
    </div>

    <div class="stream-grid">
      <a-card class="stream-card" :title="`挂单 ${filteredOrders.length}/${orders.length} 笔`" :bordered="true">
        <a-table
          :columns="orderColumns"
          :data="filteredOrders"
          :pagination="false"
          :scroll="{ y: 360 }"
          :virtual-list-props="streamVirtualListProps"
          :row-class="rowClass"
          row-key="id"
          size="small"
          table-layout-fixed
        >
          <template #time="{ record }">{{ formatTime(record.timestamp) }}</template>
          <template #side="{ record }"><span :class="sideClass(record)">{{ sideLabel(record) }}</span></template>
          <template #price="{ record }">{{ formatPrice(record.price) }}</template>
          <template #volume="{ record }">{{ formatVolume(record.volume) }}</template>
          <template #amount="{ record }">{{ formatAmount(record.amount) }}</template>
          <template #empty>
            <PermissionRequiredState
              v-if="dataMode === 'basic'"
              description="当前账号没有L2权限，无法获取数据"
              @action="openLoginDialog"
            />
            <a-empty v-else description="正在等待实时逐笔数据" />
          </template>
        </a-table>
      </a-card>

      <a-card class="stream-card" :title="`撤单 ${filteredCancels.length}/${cancels.length} 笔`" :bordered="true">
        <a-table
          :columns="cancelColumns"
          :data="filteredCancels"
          :pagination="false"
          :scroll="{ y: 360 }"
          :virtual-list-props="streamVirtualListProps"
          :row-class="rowClass"
          row-key="id"
          size="small"
          table-layout-fixed
        >
          <template #time="{ record }">{{ formatTime(record.timestamp) }}</template>
          <template #side="{ record }"><span :class="sideClass(record)">{{ sideLabel(record) }}</span></template>
          <template #price="{ record }">{{ formatPrice(record.price) }}</template>
          <template #volume="{ record }">{{ formatVolume(record.volume) }}</template>
          <template #amount="{ record }">{{ formatAmount(record.amount) }}</template>
          <template #orderTime="{ record }">{{ formatTime(record.orderTimestamp) }}</template>
          <template #empty>
            <PermissionRequiredState
              v-if="dataMode === 'basic'"
              description="当前账号没有L2权限，无法获取数据"
              @action="openLoginDialog"
            />
            <a-empty v-else description="正在等待实时逐笔数据" />
          </template>
        </a-table>
      </a-card>
    </div>
  </a-card>
  <a-modal
    v-model:visible="loginDialogVisible"
    title="登录同花顺"
    modal-class="order-flow-login-modal"
    :width="420"
    :footer="false"
    :body-style="{ padding: 0 }"
    unmount-on-close
  >
    <LoginPanel
      v-if="props.loginService"
      embedded
      :service="props.loginService"
      @success="handleLoginSuccess"
    />
  </a-modal>
  </ComponentFrame>
  </section>
</template>

<style scoped>
.order-flow-watch-panel {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.order-flow-card {
  width: 100%;
}

.toolbar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.security-select {
  width: 100%;
}

.filter-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
}

.filter-control {
  display: flex;
  min-width: 0;
  max-width: 225px;
  flex: 1 1 225px;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.filter-control :deep(.arco-checkbox) {
  flex: 0 0 auto;
}

.amount-input {
  width: auto;
  min-width: 0;
  max-width: 130px;
  flex: 1 1 130px;
}

.latest-label {
  color: var(--color-text-3);
}

.latest-price {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.rise,
.buy {
  color: rgb(var(--red-6));
}

.fall,
.sell {
  color: rgb(var(--green-6));
}

.neutral {
  color: var(--color-text-2);
}

.stream-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.stream-card {
  min-width: 0;
}

.stream-card :deep(.arco-card-body) {
  padding: 0;
}

.stream-card :deep(.arco-table-th),
.stream-card :deep(.arco-table-th .arco-table-cell),
.stream-card :deep(.arco-table-td),
.stream-card :deep(.arco-table-td .arco-table-cell),
.stream-card :deep(.arco-empty-description),
.stream-card :deep(.arco-card-header-title) {
  font-size: 12px;
}

.stream-card :deep(.arco-table-th),
.stream-card :deep(.arco-table-td) {
  padding-right: 6px;
  padding-left: 6px;
  white-space: nowrap;
}

.stream-card :deep(.marked-row .arco-table-td) {
  background: rgb(var(--orange-1));
}

:global(.order-flow-login-modal) {
  max-width: calc(100vw - 32px);
}

@media (max-width: 900px) {
  .stream-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
