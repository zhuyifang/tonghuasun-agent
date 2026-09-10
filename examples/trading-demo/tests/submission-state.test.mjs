import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginSubmission, canSubmit, failSubmission, finishSubmission,
  getSubmissionState, startNewSubmission,
} from '../src/submission-state.ts'

let sequence = 0
const context = () => ({
  path: '/v1/trading/orders/buy', sessionId: `sample-session-${++sequence}`,
  accountId: 'sample-account', tradingMode: 'ordinary',
})
const payload = scope => ({ ...scope, securityCode: '600001', price: '12.34', quantity: '100' })

test('发送前错误重试使用相同编号与相同请求快照', () => {
  const scope = context()
  const state = getSubmissionState(scope)
  const first = beginSubmission(state, payload(scope), ['clientOrderId'])
  const id = state.requestId
  failSubmission(state, { code: 'SUBMISSION_NOT_SENT', status: 503, message: '尚未提交' })
  assert.equal(state.phase, 'not_sent')
  assert.equal(canSubmit(state), true)
  const second = beginSubmission(state, { ...payload(scope), quantity: '200' }, ['clientOrderId'])
  assert.equal(first, second)
  assert.equal(state.requestId, id)
  assert.equal(JSON.parse(second).quantity, '100')
})

test('操作编号放在请求头时仍生成并复用同一编号', () => {
  const scope = { ...context(), path: '/v1/trading/accounts/{accountId}/orders', operationKey: '买入' }
  const state = getSubmissionState(scope)
  const first = beginSubmission(state, { businessType: 'cash_buy', securityCode: '600001', price: '12.34', quantity: 100 }, [])
  const id = state.requestId
  assert.ok(id)
  assert.equal(JSON.parse(first).clientOrderId, undefined)
  failSubmission(state, { code: 'ORDER_CONTEXT_QUERY_FAILED', status: 502, message: '稍后重试' })
  const second = beginSubmission(state, { businessType: 'cash_buy', securityCode: '600001', price: '12.34', quantity: 200 }, [])
  assert.equal(second, first)
  assert.equal(state.requestId, id)
})

test('响应丢失后不允许新编号重发，切换 Tab 保留未知状态', () => {
  const scope = context()
  const state = getSubmissionState(scope)
  beginSubmission(state, payload(scope), ['clientOrderId'])
  const id = state.requestId
  failSubmission(state, { code: 'API_UNAVAILABLE', message: '连接中断' })
  assert.equal(state.phase, 'unknown')
  assert.equal(state.error.code, 'SUBMISSION_RESULT_UNKNOWN')
  assert.doesNotMatch(state.error.message, /重试|未成功/)
  const remounted = getSubmissionState({ ...scope })
  assert.equal(remounted, state)
  assert.equal(remounted.requestId, id)
  assert.equal(beginSubmission(remounted, payload(scope), ['clientOrderId']), null)
  assert.equal(startNewSubmission(remounted, false), false)
})

test('已受理操作须明确核对后才能清空表单开始新编号', () => {
  const scope = context()
  const state = getSubmissionState(scope)
  state.values = { securityCode: '600001' }
  beginSubmission(state, payload(scope), ['clientRequestId'])
  const id = state.requestId
  finishSubmission(state, { ...scope, clientRequestId: id, status: 'accepted' })
  assert.equal(state.phase, 'accepted')
  assert.equal(canSubmit(state), false)
  assert.equal(beginSubmission(state, payload(scope), ['clientRequestId']), null)
  assert.equal(startNewSubmission(state, true), true)
  assert.equal(state.phase, 'draft')
  assert.deepEqual(state.values, {})
  assert.equal(state.payload, null)
  assert.equal(state.output, null)
  assert.equal(state.requestId, null)
  beginSubmission(state, payload(scope), ['clientRequestId'])
  assert.notEqual(state.requestId, id)
})

test('处理中不能重置，明确拒绝也不能无意识再次发送', () => {
  const scope = context()
  const state = getSubmissionState(scope)
  beginSubmission(state, payload(scope), ['clientOrderId'])
  assert.equal(startNewSubmission(state, true), false)
  assert.equal(beginSubmission(state, payload(scope), ['clientOrderId']), null)
  failSubmission(state, { code: 'SUBMISSION_REJECTED', status: 422, message: '未被受理' })
  assert.equal(state.phase, 'rejected')
  assert.equal(canSubmit(state), false)
})

test('空回包、错账户、错编号或业务未知回包不能显示受理', () => {
  for (const bad of [null, 'invalid JSON', { accountId: 'other' }, { status: 'unknown' }]) {
    const scope = context()
    const state = getSubmissionState(scope)
    beginSubmission(state, payload(scope), ['clientRequestId'])
    finishSubmission(state, bad)
    assert.equal(state.phase, 'unknown')
    assert.equal(state.output, null)
  }
})

test('未知 HTTP 错误、服务端 UNKNOWN 和编号冲突都阻止盲目重试', () => {
  for (const error of [
    { code: 'REQUEST_FAILED', status: 502 },
    { code: 'SUBMISSION_RESULT_UNKNOWN', status: 502 },
    { code: 'SUBMISSION_PENDING', status: 409 },
    { code: 'REQUEST_ID_CONFLICT', status: 409 },
    new TypeError('response body stream interrupted'),
  ]) {
    const scope = context()
    const state = getSubmissionState(scope)
    beginSubmission(state, payload(scope), ['clientRequestId'])
    failSubmission(state, error)
    assert.equal(state.phase, 'unknown')
    assert.equal(canSubmit(state), false)
  }
})

test('不同账户、模式、业务或会话不共用提交状态', () => {
  const scope = context()
  const state = getSubmissionState(scope)
  beginSubmission(state, payload(scope), ['clientOrderId'])
  for (const change of [
    { accountId: 'other-account' }, { tradingMode: 'credit' },
    { path: '/v1/trading/orders/sell' }, { sessionId: 'other-session' },
  ]) {
    const independent = getSubmissionState({ ...scope, ...change })
    assert.notEqual(independent, state)
    assert.equal(independent.phase, 'draft')
    assert.equal(independent.requestId, null)
  }
})
