<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, request } from '../api'
import { getContract } from '../api-contract'
import type { TradingAccount, TableResponse } from '../types'
import ScrollTable from './ScrollTable.vue'
import DateRangePicker from './DateRangePicker.vue'
import { presetRange } from '../date-range'

const props = defineProps<{ path: string; title: string; sessionId: string; account: TradingAccount }>()
const contract = ref<Awaited<ReturnType<typeof getContract>>>()
const result = ref<TableResponse | null>(null)
const loading = ref(false)
const error = ref<ApiError | null>(null)
const initialRange = presetRange('today')
const startDate = ref(initialRange.startDate)
const endDate = ref(initialRange.endDate)
const usesDates = computed(() => contract.value?.parameters.some(parameter => parameter.name === 'startDate'))
const columns = computed(() => result.value?.columns ?? [])

async function load() {
  if (loading.value || !contract.value?.available) return
  if (usesDates.value && (!startDate.value || !endDate.value || startDate.value > endDate.value)) {
    error.value = new ApiError('INVALID_DATE_RANGE', '请选择有效的开始与结束日期')
    return
  }
  loading.value = true
  error.value = null
  result.value = null
  try {
    const query = new URLSearchParams({ sessionId: props.sessionId, accountId: props.account.accountId, tradingMode: props.account.tradingMode })
    if (usesDates.value) { query.set('startDate', startDate.value); query.set('endDate', endDate.value) }
    const response = await request<TableResponse>(`${props.path}?${query}`)
    if (response.accountId !== props.account.accountId || response.tradingMode !== props.account.tradingMode) throw new ApiError('ACCOUNT_MISMATCH', '查询结果与所选账户不一致，请重新查询')
    if (!Array.isArray(response.columns) || !Array.isArray(response.items)) throw new ApiError('RESPONSE_FORMAT_ERROR', '返回数据暂时无法展示，请稍后重试')
    result.value = response
  } catch (reason) { error.value = reason instanceof ApiError ? reason : new ApiError('QUERY_FAILED', '查询未成功，请稍后重试') }
  finally { loading.value = false }
}
function cell(item: Record<string, unknown>, key: string) {
  const value = item[key] ?? (item.rawFields as Record<string, unknown> | undefined)?.[key]
  return value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
}
onMounted(async () => {
  try { contract.value = await getContract(props.path, 'get'); await load() }
  catch { error.value = new ApiError('DOCS_UNAVAILABLE', '页面加载失败，请刷新后重试') }
})
</script>

<template>
  <div>
    <form class="table-toolbar" @submit.prevent="load">
      <DateRangePicker v-if="usesDates" v-model:start-date="startDate" v-model:end-date="endDate" :disabled="loading" @apply="load" />
      <span v-else>{{ title }}<template v-if="result"> · 共 {{ result.items.length }} 条记录</template></span>
      <button class="secondary-button" :disabled="loading || !contract?.available">{{ loading ? '查询中…' : usesDates ? '查询' : '刷新' }}</button>
    </form>
    <div v-if="error" class="notice error-notice" role="alert"><strong>{{ error.message }}</strong><code>{{ error.code }}</code></div>
    <div v-if="contract !== undefined && !contract?.available" class="unavailable-panel"><strong>暂时无法查询{{ title }}</strong></div>
    <ScrollTable v-else :columns="columns.length ? columns.map(column => column.label) : [title]" :label="title" :empty="!result?.items.length" :empty-message="loading ? '正在查询…' : error ? '未取得数据' : '暂无记录'">
      <tr v-for="(item, index) in result?.items" :key="index"><td v-for="column in columns" :key="column.key">{{ cell(item, column.key) }}</td></tr>
    </ScrollTable>
  </div>
</template>
