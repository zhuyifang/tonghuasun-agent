<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, getAssets, getPositions } from '../api'
import type { AssetsResponse, Position, TradingAccount } from '../types'
import ScrollTable from './ScrollTable.vue'
import RecordsPanel from './RecordsPanel.vue'
import OperationForm from './OperationForm.vue'
import type { TableColumn } from '../types'

const props = defineProps<{ account: TradingAccount; sessionId: string; brokerName: string }>()
const activeTab = ref(props.account.tradingMode === 'credit' ? '持仓' : '交易')
const tradeTab = ref('买入')
const tabs = ['交易', '持仓', '委托记录', '成交记录', '资金流水', '交割单']
const assets = ref<AssetsResponse | null>(null)
const positions = ref<Position[]>([])
const positionColumns = ref<TableColumn[]>([])
const assetsLoading = ref(false)
const positionsLoading = ref(false)
const positionsLoaded = ref(false)
const assetError = ref<ApiError | null>(null)
const queryError = ref<ApiError | null>(null)
const extraAction = ref('')
const extraTab = ref('查询')
const extraDialog = ref<HTMLDialogElement | null>(null)
const isCredit = computed(() => props.account.tradingMode === 'credit')
const modeName = computed(() => isCredit.value ? '信用账户' : '普通账户')
const assetFields = computed(() => [
  ['总资产', assets.value?.totalAssets], ['证券市值', assets.value?.securitiesMarketValue],
  ['资金余额', assets.value?.cashBalance], ['可用资金', assets.value?.availableCash],
  ['可取资金', assets.value?.withdrawableCash], ['冻结资金', assets.value?.frozenCash],
] as const)
const creditAssetFields = computed(() => isCredit.value ? [
  ['净资产', assets.value?.netAssets], ['总负债', assets.value?.totalLiabilities],
  ['可用保证金', assets.value?.availableMargin], ['维持担保比例', assets.value?.maintenanceRatio],
].filter(([, value]) => value != null) : [])
const recordPaths: Record<string, string> = { 委托记录: '/v1/trading/orders', 成交记录: '/v1/trading/trades', 资金流水: '/v1/trading/funds/flows', 交割单: '/v1/trading/settlements' }
const orderPaths: Record<string, string> = { 买入: '/v1/trading/accounts/{accountId}/orders', 卖出: '/v1/trading/accounts/{accountId}/orders', 撤单: '/v1/trading/orders/cancel' }
const extras: Record<string, { query: string; submit: string; history?: string; quota?: string }> = {
  新股申购: { query: '/v1/trading/ipo/securities', submit: '/v1/trading/ipo/subscriptions', quota: '/v1/trading/ipo/quotas' },
  银证转账: { query: '/v1/trading/bank-accounts', submit: '/v1/trading/bank-transfers', history: '/v1/trading/bank-transfers' },
  担保品划转: { query: '/v1/trading/credit/collateral-securities', submit: '/v1/trading/credit/collateral-transfers', history: '/v1/trading/credit/collateral-transfer-flows' },
}

function money(value: number | null | undefined, precision = 2) {
  return value == null ? '—' : value.toLocaleString('zh-CN', { minimumFractionDigits: precision, maximumFractionDigits: precision })
}
function percent(value: number | null) { return value == null ? '—' : `${value.toFixed(2)}%` }
function positionCell(item: Position, key: string) {
  const value = key === 'xd_2167' ? item.marketCode : item.rawFields[key]
  return value == null || value === '' ? '—' : value
}
function errorFor(reason: unknown) {
  return reason instanceof ApiError ? reason : new ApiError('QUERY_FAILED', '查询未成功，请稍后重试')
}
function verifyAccount(result: { accountId: string; tradingMode: string }) {
  if (result.accountId !== props.account.accountId || result.tradingMode !== props.account.tradingMode) {
    throw new ApiError('ACCOUNT_MISMATCH', '返回账户与所选账户不一致，请重新查询')
  }
}

// 资产不随 Tab 切换清空；每张卡独立请求自己的账户，避免跨卡串数据。
async function loadAssets() {
  if (assetsLoading.value) return
  assetsLoading.value = true
  assetError.value = null
  try {
    const result = await getAssets(props.sessionId, props.account.accountId, props.account.tradingMode)
    verifyAccount(result)
    assets.value = result
  } catch (reason) { assets.value = null; assetError.value = errorFor(reason) }
  finally { assetsLoading.value = false }
}
async function loadPositions() {
  if (positionsLoading.value) return
  positionsLoading.value = true
  queryError.value = null
  try {
    const result = await getPositions(props.sessionId, props.account.accountId, props.account.tradingMode)
    verifyAccount(result)
    positions.value = result.items
    positionColumns.value = result.columns ?? []
    positionsLoaded.value = true
  } catch (reason) { positions.value = []; positionsLoaded.value = false; queryError.value = errorFor(reason) }
  finally { positionsLoading.value = false }
}
function selectTab(name: string) {
  activeTab.value = name
  if (name === '持仓' && !positionsLoaded.value) void loadPositions()
}
function openExtra(name: string) {
  extraAction.value = name
  extraTab.value = '查询'
  extraDialog.value?.showModal()
}
onMounted(async () => {
  await loadAssets()
  if (activeTab.value === '持仓') await loadPositions()
})
</script>

<template>
  <article class="account-card" :class="{ 'credit-account': isCredit }" :aria-label="`${account.fundAccount} ${modeName}`">
    <header class="account-card-header">
      <div class="account-identity">
        <h2>账户 <span>{{ account.fundAccount }}</span></h2>
        <span class="account-mode">{{ modeName }}</span>
      </div>
      <div class="account-actions">
        <span class="status"><i></i>已登录</span>
        <button type="button" class="account-link" @click="openExtra('新股申购')">新股申购</button>
        <button type="button" class="account-link" @click="openExtra('银证转账')">银证转账</button>
        <button v-if="isCredit" type="button" class="account-link" @click="openExtra('担保品划转')">担保品划转</button>
      </div>
    </header>

    <section class="account-assets" aria-label="账户资产" :aria-busy="assetsLoading">
      <div class="account-asset-strip">
        <div v-for="[name, value] in assetFields" :key="name" :class="{ 'asset-total': name === '总资产' }">
          <span>{{ name }}</span><strong>{{ assetsLoading ? '…' : money(value) }}</strong>
        </div>
      </div>
      <div class="asset-caption">
        <span v-if="assetError" class="inline-error" role="alert">{{ assetError.message }} <code>{{ assetError.code }}</code></span>
        <span v-else>单位：{{ assets?.currency === 'USD' ? '美元' : assets?.currency === 'HKD' ? '港元' : '元' }}</span>
        <button class="account-link" type="button" :disabled="assetsLoading" @click="loadAssets">{{ assetsLoading ? '查询中…' : '刷新资产' }}</button>
      </div>
      <div v-if="creditAssetFields.length" class="credit-asset-strip"><span v-for="[name, value] in creditAssetFields" :key="String(name)">{{ name }} <strong>{{ name === '维持担保比例' ? value : money(Number(value)) }}</strong></span></div>
    </section>

    <div class="account-tabs" role="tablist" :aria-label="`${account.fundAccount} 账户功能`">
      <button v-for="name in tabs" :id="`${account.accountId}-${name}`" :key="name" role="tab" :aria-selected="activeTab === name" :aria-controls="`${account.accountId}-panel`" :class="{ active: activeTab === name }" @click="selectTab(name)">{{ name }}</button>
    </div>
    <section :id="`${account.accountId}-panel`" class="account-panel" role="tabpanel" :aria-labelledby="`${account.accountId}-${activeTab}`">
      <template v-if="activeTab === '交易'">
        <div class="trade-tabs" aria-label="交易功能">
          <button v-for="name in ['买入', '卖出', '撤单']" :key="name" :class="{ active: tradeTab === name }" :aria-pressed="tradeTab === name" @click="tradeTab = name">{{ name }}</button>
        </div>
        <OperationForm :key="tradeTab" :path="orderPaths[tradeTab]!" :title="tradeTab" :session-id="sessionId" :account="account" />
      </template>
      <template v-else-if="activeTab === '持仓'">
        <div class="table-toolbar"><span>{{ positionsLoaded ? `共 ${positions.length} 条持仓` : '持仓列表' }}</span><button type="button" class="secondary-button" :disabled="positionsLoading" @click="loadPositions">{{ positionsLoading ? '查询中…' : '刷新' }}</button></div>
        <div v-if="queryError" class="notice error-notice" role="alert"><strong>{{ queryError.message }}</strong><code>{{ queryError.code }}</code></div>
        <ScrollTable v-if="positionColumns.length" label="持仓数据" :columns="positionColumns.map(column => column.label)" :empty="positions.length === 0" :empty-message="positionsLoading ? '正在查询持仓…' : '暂无持仓'">
          <tr v-for="(item, index) in positions" :key="index"><td v-for="column in positionColumns" :key="column.key">{{ positionCell(item, column.key) }}</td></tr>
        </ScrollTable>
        <ScrollTable v-else label="持仓数据" :empty="positions.length === 0" :empty-message="positionsLoading ? '正在查询持仓…' : queryError ? '查询失败，尚未取得持仓数据' : '暂无持仓'" :columns="['证券代码', '证券名称', '市场', '持仓数量', '可用数量', '成本价', '现价', '持仓市值', '浮动盈亏', '盈亏比例', '仓位占比']">
          <tr v-for="(item, index) in positions" :key="`${item.market}-${item.securityCode}-${index}`">
            <td>{{ item.securityCode }}</td><td>{{ item.securityName }}</td><td>{{ item.market || '—' }}</td>
            <td class="numeric">{{ item.quantity ?? '—' }}</td><td class="numeric">{{ item.availableQuantity ?? '—' }}</td>
            <td class="numeric">{{ money(item.costPrice, 3) }}</td><td class="numeric">{{ money(item.currentPrice, 3) }}</td><td class="numeric">{{ money(item.marketValue) }}</td>
            <td class="numeric" :class="(item.profitLoss ?? 0) < 0 ? 'loss' : 'gain'">{{ money(item.profitLoss) }}</td><td class="numeric">{{ percent(item.profitLossRatio) }}</td><td class="numeric">{{ percent(item.positionRatio) }}</td>
          </tr>
        </ScrollTable>
      </template>
      <RecordsPanel v-else :key="activeTab" :path="recordPaths[activeTab]!" :title="activeTab" :session-id="sessionId" :account="account" />
    </section>

    <dialog ref="extraDialog" class="account-dialog" @click="event => { if (event.target === extraDialog) extraDialog?.close() }">
      <div class="dialog-heading"><div><h3>{{ extraAction }}</h3><p>{{ account.fundAccount }} · {{ modeName }}</p></div><button type="button" class="text-button" @click="extraDialog?.close()">关闭</button></div>
      <template v-if="extras[extraAction]">
        <div class="trade-tabs"><button v-for="name in ['查询', ...(extras[extraAction]?.quota ? ['额度'] : []), ...(extras[extraAction]?.history ? ['记录'] : []), '提交']" :key="name" :class="{ active: extraTab === name }" @click="extraTab = name">{{ name }}</button></div>
        <OperationForm v-if="extraTab === '提交'" :key="extraAction" :path="extras[extraAction]!.submit" :title="extraAction" :session-id="sessionId" :account="account" />
        <RecordsPanel v-else :key="`${extraAction}-${extraTab}`" :path="(extraTab === '记录' ? extras[extraAction]!.history : extraTab === '额度' ? extras[extraAction]!.quota : extras[extraAction]!.query)!" :title="extraAction" :session-id="sessionId" :account="account" />
      </template>
    </dialog>
  </article>
</template>
