<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError, request } from '../api'
import { getContract } from '../api-contract'
import type { TradingAccount } from '../types'
import { beginSubmission, canSubmit, failSubmission, finishSubmission, getSubmissionState, startNewSubmission } from '../submission-state'

const props = defineProps<{ path: string; title: string; sessionId: string; account: TradingAccount }>()
const contract = ref<Awaited<ReturnType<typeof getContract>>>()
const documentError = ref<ApiError | null>(null)
const recordsReviewed = ref(false)
const isUnifiedOrder = computed(() => props.path === '/v1/trading/accounts/{accountId}/orders')
const state = computed(() => getSubmissionState({
  path: props.path, sessionId: props.sessionId,
  accountId: props.account.accountId, tradingMode: props.account.tradingMode, operationKey: props.title,
}))
const submitting = computed(() => state.value.phase === 'submitting')
const idFields = computed(() => ['clientOrderId', 'clientRequestId'].filter(key => contract.value?.properties[key]))
const maySubmit = computed(() => !!contract.value?.available && (isUnifiedOrder.value || idFields.value.length > 0) && canSubmit(state.value))
const recordsName = computed(() => props.path.includes('bank-transfers') ? '转账记录' : props.path.includes('collateral-transfers') ? '划转记录' : '委托记录')
const stateMessage = computed(() => ({
  draft: '请核对账户和填写的信息后提交。',
  submitting: '正在提交本笔操作，请勿重复点击。',
  not_sent: '已明确本笔请求尚未发送。可以沿用原编号重试同一笔；修改信息请先开始新操作。',
  rejected: '本笔请求未被受理。核对原因后，请通过下方入口开始新操作。',
  accepted: `券商已受理本笔操作，最终状态请以${recordsName.value}为准。`,
  unknown: `本笔操作的结果尚未确认，可能已经受理。请先查询${recordsName.value}，不要重复提交。`,
}[state.value.phase]))
const fixed = ['sessionId', 'accountId', 'tradingMode', 'clientOrderId', 'clientRequestId']
const labels: Record<string, string> = {
  securityCode: '证券代码', marketCode: '交易市场', shareholderAccount: '股东账户', businessType: '业务类型',
  orderType: '委托类型', price: '委托价格', quantity: '数量', orderId: '委托编号', contractNumber: '合同编号',
  bankId: '银行', currency: '币种', direction: '方向', amount: '金额',
}
// 文档中的枚举值用于请求；界面只展示对应业务名称，不改写提交值。
const optionLabels: Record<string, string> = {
  limit: '限价', cash_buy: '普通买入', cash_sell: '普通卖出',
  collateral_buy: '担保品买入', collateral_sell: '担保品卖出', margin_buy: '融资买入', short_sell: '融券卖出',
  buy_to_repay: '买券还券', sell_to_repay: '卖券还款',
  bank_to_securities: '银行转证券', securities_to_bank: '证券转银行',
  ordinary_to_credit: '普通账户转信用账户', credit_to_ordinary: '信用账户转普通账户',
}
function businessOptions() {
  if (!isUnifiedOrder.value) return undefined
  if (props.account.tradingMode === 'ordinary') return props.title === '买入' ? ['cash_buy'] : ['cash_sell']
  return props.title === '买入'
    ? ['collateral_buy', 'margin_buy', 'buy_to_repay']
    : ['collateral_sell', 'short_sell', 'sell_to_repay']
}
const fields = computed(() => Object.entries(contract.value?.properties ?? {})
  .filter(([key]) => !fixed.includes(key))
  .map(([key, schema]) => [key, key === 'businessType' ? { ...schema, enum: businessOptions() ?? schema.enum } : schema] as const))
function initializeValues() {
  for (const [key, schema] of fields.value) {
    if (!(key in state.value.values)) state.value.values[key] = String(schema.default ?? (schema.enum?.length === 1 ? schema.enum[0] : ''))
  }
}
watch(state, async selected => {
  contract.value = undefined
  documentError.value = null
  recordsReviewed.value = false
  try {
    const result = await getContract(selected.context.path, 'post')
    if (state.value !== selected) return
    contract.value = result
    initializeValues()
  } catch {
    if (state.value === selected) documentError.value = new ApiError('DOCS_UNAVAILABLE', '交易信息暂时无法加载，请稍后重试。')
  }
}, { immediate: true })
async function submit() {
  if (!maySubmit.value) return
  const selected = state.value
  const confirmation = selected.phase === 'not_sent'
    ? `确认沿用原操作编号重试同一笔“${props.title}”？本次不会修改请求内容。`
    : `确认使用账户 ${props.account.fundAccount} 办理“${props.title}”？请核对填写的信息。`
  if (!window.confirm(confirmation)) return
  const payload: Record<string, unknown> = isUnifiedOrder.value
    ? {}
    : { sessionId: props.sessionId, accountId: props.account.accountId, tradingMode: props.account.tradingMode }
  for (const [key, schema] of fields.value) {
    const value = selected.values[key]
    if (value !== '') payload[key] = schema.type === 'integer' || schema.type === 'number' ? Number(value) : value
  }
  const body = beginSubmission(selected, payload, idFields.value)
  if (!body) return
  recordsReviewed.value = false
  const path = isUnifiedOrder.value
    ? props.path.replace('{accountId}', encodeURIComponent(props.account.accountId))
    : props.path
  const headers = isUnifiedOrder.value
    ? { Authorization: `Bearer ${props.sessionId}`, 'Idempotency-Key': selected.requestId! }
    : undefined
  try { finishSubmission(selected, await request(path, { method: 'POST', headers, body })) }
  catch (reason) { failSubmission(selected, reason) }
}
function startNew() {
  if (!recordsReviewed.value || submitting.value) return
  if (!window.confirm(`确认已经核对${recordsName.value}，并开始新的一笔“${props.title}”？此操作不会撤销上一笔提交，也不会自动再次发送。`)) return
  if (startNewSubmission(state.value, true)) {
    recordsReviewed.value = false
    initializeValues()
  }
}
</script>

<template>
  <form class="operation-form" @submit.prevent="submit">
    <p class="placeholder-note" aria-live="polite">{{ state.phase !== 'draft' || contract?.available ? stateMessage : `暂时无法办理${title}。` }}</p>
    <p v-if="state.requestId" class="operation-reference">本笔操作编号：<code>{{ state.requestId }}</code></p>
    <fieldset :disabled="!contract?.available || state.phase !== 'draft'" class="operation-fields">
      <label v-for="[key, schema] in fields" :key="key">
        <span>{{ labels[key] ?? key }}<span v-if="contract?.required.includes(key)" class="required-mark"> *</span></span>
        <select v-if="schema.enum" v-model="state.values[key]" :required="contract?.required.includes(key)"><option value="">请选择</option><option v-for="option in schema.enum" :key="option" :value="option">{{ optionLabels[option] ?? option }}</option></select>
        <input v-else v-model="state.values[key]" :type="schema.type === 'integer' || schema.type === 'number' ? 'number' : 'text'" :placeholder="labels[key] ?? key" :required="contract?.required.includes(key)" />
      </label>
    </fieldset>
    <div v-if="documentError" class="notice error-notice" role="alert"><strong>{{ documentError.message }}</strong><code>{{ documentError.code }}</code></div>
    <div v-if="state.error" class="notice error-notice" role="alert"><strong>{{ state.error.message }}</strong><code>{{ state.error.code }}</code></div>
    <p v-if="contract?.available && !isUnifiedOrder && !idFields.length" class="placeholder-note">当前无法提交，请稍后重试。</p>
    <button type="submit" class="primary-button operation-submit" :disabled="!maySubmit">{{ submitting ? '正在提交…' : state.phase === 'not_sent' ? '沿用编号重试本笔' : state.phase === 'draft' ? title : '请先核对记录' }}</button>
    <div v-if="state.phase !== 'draft' && !submitting" class="submission-review">
      <label><input v-model="recordsReviewed" type="checkbox" />我已核对{{ recordsName }}及本笔操作结果，确认需要开始新的一笔操作。</label>
      <button type="button" class="secondary-button" :disabled="!recordsReviewed" @click="startNew">已核对记录，开始新操作</button>
      <p>新操作会清空表单并使用新编号，不会撤销或重复发送上一笔。切换 Tab 保留本笔状态；关闭或刷新整个页面不会保存。</p>
    </div>
    <textarea v-if="state.output" class="operation-output" readonly :value="JSON.stringify(state.output, null, 2)"></textarea>
  </form>
</template>

<style scoped>
.operation-reference { font-size: 12px; color: #59677d; overflow-wrap: anywhere; }
.submission-review { display: grid; justify-items: start; gap: 12px; margin-top: 18px; padding: 16px; border: 1px solid #d9e1ed; border-radius: 8px; }
.submission-review label { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.6; }
.submission-review input[type='checkbox'] { width: 16px; height: 16px; margin: 3px 0 0; flex: 0 0 auto; }
.submission-review p { margin: 0; font-size: 12px; color: #68778d; line-height: 1.6; }
</style>
