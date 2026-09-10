import { reactive } from 'vue'

export interface SubmissionContext {
  path: string
  sessionId: string
  accountId: string
  tradingMode: string
  operationKey?: string
}

export type SubmissionPhase = 'draft' | 'submitting' | 'not_sent' | 'rejected' | 'accepted' | 'unknown'
export interface SubmissionError { code: string; message: string; status?: number }
export interface SubmissionState {
  context: SubmissionContext
  values: Record<string, string>
  phase: SubmissionPhase
  requestId: string | null
  payload: string | null
  error: SubmissionError | null
  output: unknown
}

// 只保存当前页面进程的内存状态。切换 Tab 不丢失操作编号；不写浏览器持久存储。
const submissions = new Map<string, SubmissionState>()

export function getSubmissionState(context: SubmissionContext): SubmissionState {
  const key = JSON.stringify([context.sessionId, context.accountId, context.tradingMode, context.path, context.operationKey])
  let state = submissions.get(key)
  if (!state) {
    state = reactive<SubmissionState>({
      context: { ...context }, values: {}, phase: 'draft', requestId: null,
      payload: null, error: null, output: null,
    })
    submissions.set(key, state)
  }
  return state
}

function operationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // 局域网 HTTP 页面也使用密码学随机源，不依赖安全上下文限定的 randomUUID。
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function canSubmit(state: SubmissionState): boolean {
  return state.phase === 'draft' || state.phase === 'not_sent'
}

export function beginSubmission(
  state: SubmissionState,
  payload: Record<string, unknown>,
  idFields: string[],
): string | null {
  if (!canSubmit(state)) return null
  if (state.phase === 'draft') {
    const id = operationId()
    const body = { ...payload }
    for (const field of idFields) body[field] = id
    // 保存确认时的完整请求快照；重试只能复用该快照，不能边改内容边复用编号。
    state.payload = JSON.stringify(body)
    state.requestId = id
  }
  if (!state.payload || !state.requestId) return null
  state.phase = 'submitting'
  state.error = null
  state.output = null
  return state.payload
}

function markUnknown(state: SubmissionState): void {
  state.phase = 'unknown'
  state.error = {
    code: 'SUBMISSION_RESULT_UNKNOWN',
    message: '提交结果尚未确认，可能已经受理。请先查询业务记录，不要重复提交。',
  }
}

export function finishSubmission(state: SubmissionState, response: unknown): void {
  if (state.phase !== 'submitting') return
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    markUnknown(state)
    return
  }
  const body = response as Record<string, unknown>
  const id = body.clientRequestId ?? body.clientOrderId
  if (body.sessionId !== state.context.sessionId || body.accountId !== state.context.accountId
    || body.tradingMode !== state.context.tradingMode || id !== state.requestId
    || (body.status !== undefined && body.status !== 'accepted' && body.status !== 'submitted')) {
    markUnknown(state)
    return
  }
  state.phase = 'accepted'
  state.error = null
  state.output = response
}

const notSentCodes = new Set([
  'SUBMISSION_NOT_SENT', 'BROKER_SUBMISSION_NOT_SENT', 'SESSION_BUSY', 'SESSION_NOT_FOUND',
  'ACCOUNT_MISMATCH', 'INVALID_REQUEST', 'REQUEST_INVALID', 'INVALID_REQUEST_ID',
  'TRADING_FIELDS_INVALID', 'TRADING_BUSINESS_MISMATCH', 'CREDIT_ACCOUNT_REQUIRED',
  'BUSINESS_NOT_AVAILABLE', 'SESSION_SUBMISSION_LIMIT', 'TRADING_SESSION_REQUIRED',
  'SECURITY_CODE_INVALID', 'SECURITY_MARKET_REQUIRED', 'MARKET_ACCOUNT_NOT_FOUND',
  'ORDER_CONTEXT_QUERY_FAILED',
])
const rejectedCodes = new Set(['SUBMISSION_REJECTED', 'BROKER_SUBMISSION_REJECTED'])

export function failSubmission(state: SubmissionState, reason: unknown): void {
  if (state.phase !== 'submitting') return
  const error = reason as Partial<SubmissionError> | null
  // 只有收到明确的服务端错误码才能判定“未发送”或“未受理”。连接中断、响应
  // 读取失败、未知状态码和请求编号冲突均不能解释成安全重试。
  if (error && typeof error.code === 'string' && typeof error.status === 'number'
    && error.status >= 400 && error.status < 600) {
    if (notSentCodes.has(error.code) || rejectedCodes.has(error.code)) {
      state.phase = notSentCodes.has(error.code) ? 'not_sent' : 'rejected'
      state.error = {
        code: error.code, status: error.status,
        message: error.message || (state.phase === 'not_sent' ? '本次请求尚未发送。' : '本次请求未被受理。'),
      }
      return
    }
  }
  markUnknown(state)
}

export function startNewSubmission(state: SubmissionState, recordsReviewed: boolean): boolean {
  if (!recordsReviewed || state.phase === 'submitting' || state.phase === 'draft') return false
  state.values = {}
  state.phase = 'draft'
  state.requestId = null
  state.payload = null
  state.error = null
  state.output = null
  return true
}

// 页面关闭会销毁内存记录；对尚未明确核对的操作提示浏览器离开确认。
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', event => {
    if (Array.from(submissions.values()).some(state => ['submitting', 'unknown', 'accepted'].includes(state.phase))) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
}
