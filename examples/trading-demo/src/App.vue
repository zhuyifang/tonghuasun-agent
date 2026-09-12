<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AccountCard from './components/AccountCard.vue'
import './account-cards.css'
import {
  ApiError,
  getAccessPoints,
  getBrokers,
  getLoginAccountTypes,
  login,
  setApiTraceListener,
} from './api'
import type { ApiTrace } from './api'
import type {
  AccessPoint,
  Broker,
  DecryptedResponse,
  LoginAccountType,
  LoginAccountTypeOption,
  LoginResponse,
  TradingAccount,
  TradingMode,
} from './types'

const brokers = ref<Broker[]>([])
const accessPoints = ref<AccessPoint[]>([])
const accountTypes = ref<LoginAccountTypeOption[]>([])
const brokerId = ref('')
const accessPointId = ref('')
const accountType = ref<LoginAccountType>('fundAccount')
const loginAccount = ref('')
const password = ref('')
const loginMode = ref<TradingMode>('ordinary')
const loadingAccountTypes = ref(true)
const loadingBrokers = ref(true)
const loadingAccessPoints = ref(false)
const submitting = ref(false)
const error = ref<ApiError | null>(null)
const session = ref<LoginResponse | null>(null)
const apiTraces = ref<ApiTrace[]>([])
const debugHeight = ref(44)

setApiTraceListener((trace) => {
  apiTraces.value.unshift(trace)
})

const selectedBroker = computed(() => brokers.value.find((item) => item.brokerId === brokerId.value))
const selectedAccessPoint = computed(() =>
  accessPoints.value.find((item) => item.accessPointId === accessPointId.value),
)
const selectedAccountType = computed(() =>
  accountTypes.value.find((item) => item.accountType === accountType.value),
)
const accounts = computed<TradingAccount[]>(() => {
  if (!session.value) return []
  if (session.value.accounts?.length) return session.value.accounts
  return [{
    accountId: session.value.accountId,
    fundAccount: session.value.fundAccount,
    tradingMode: session.value.tradingMode,
  }]
})
const canSubmit = computed(
  () => accountType.value && brokerId.value && accessPointId.value && loginAccount.value.trim()
    && password.value && !loadingAccountTypes.value && !submitting.value,
)

onMounted(async () => {
  try {
    const result = await getLoginAccountTypes()
    accountTypes.value = result
    accountType.value = result.find((item) => item.accountType === accountType.value)?.accountType
      ?? result.find((item) => item.isDefault)?.accountType
      ?? result[0]?.accountType
      ?? 'fundAccount'
  } catch (reason) {
    showLoginError(reason)
  } finally {
    loadingAccountTypes.value = false
  }

  try {
    brokers.value = await getBrokers()
    brokerId.value = brokers.value.find((item) => item.brokerId === '339')?.brokerId ?? brokers.value[0]?.brokerId ?? ''
  } catch (reason) {
    showLoginError(reason)
  } finally {
    loadingBrokers.value = false
  }
})

watch(brokerId, async (value) => {
  accessPointId.value = ''
  accessPoints.value = []
  error.value = null
  if (!value) return

  loadingAccessPoints.value = true
  try {
    const points = await getAccessPoints(value)
    accessPoints.value = points.filter((item) => item.ports.hexin !== null)
    accessPointId.value = accessPoints.value.find((item) => item.name === '浙商杭州电信')?.accessPointId
      ?? accessPoints.value[0]?.accessPointId
      ?? ''
  } catch (reason) {
    showLoginError(reason)
  } finally {
    loadingAccessPoints.value = false
  }
})

async function submitLogin() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  try {
    const response = await login({
      tradingMode: loginMode.value,
      accountType: accountType.value,
      brokerId: brokerId.value,
      accessPointId: accessPointId.value,
      fundAccount: loginAccount.value.trim(),
      password: password.value,
    })
    session.value = response
    password.value = ''
  } catch (reason) {
    showLoginError(reason)
  } finally {
    submitting.value = false
  }
}

function logout() {
  session.value = null
}

function showLoginError(reason: unknown) {
  error.value = normalizeError(reason)
}

function normalizeError(reason: unknown) {
  return reason instanceof ApiError
    ? reason
    : new ApiError('UNEXPECTED_ERROR', '操作未成功，请稍后重试')
}

function accountKey(account: TradingAccount) {
  return `${account.accountId}:${account.tradingMode}`
}

function decryptedResponses(trace: ApiTrace): DecryptedResponse[] {
  if (!trace.responseBody || typeof trace.responseBody !== 'object') return []
  const body = trace.responseBody as Record<string, unknown>
  if (Array.isArray(body.decryptedResponses)) {
    return body.decryptedResponses as DecryptedResponse[]
  }
  return body.decryptedResponse ? [body.decryptedResponse as DecryptedResponse] : []
}

function formattedResponse(body: unknown) {
  if (typeof body === 'string') return body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return JSON.stringify(body, null, 2)
  const visible = { ...(body as Record<string, unknown>) }
  delete visible.decryptedResponse
  delete visible.decryptedResponses
  return JSON.stringify(visible, null, 2)
}

function beginDebugResize(event: PointerEvent) {
  event.preventDefault()
  const startY = event.clientY
  const startHeight = debugHeight.value
  const move = (current: PointerEvent) => {
    debugHeight.value = Math.min(window.innerHeight - 100, Math.max(180, startHeight + startY - current.clientY))
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}
</script>

<template>
  <div class="application-root" :style="{ paddingBottom: `${debugHeight}px` }">
  <main v-if="!session" class="page-shell">
    <section class="login-panel">
      <header class="brand">
        <div class="brand-mark" aria-hidden="true">FQ</div>
        <div>
          <p class="eyebrow">FQGate · Fast Quant Gateway</p>
          <h1>登录券商账户</h1>
          <p class="subtitle">选择账户类别、账号类型、券商和交易站点，登录您的账户。</p>
        </div>
      </header>

      <form class="login-form" @submit.prevent="submitLogin">
        <label>
          <span>账户类别</span>
          <select v-model="loginMode" :disabled="submitting">
            <option value="ordinary">普通账户</option>
            <option value="credit">信用账户</option>
          </select>
        </label>
        <label>
          <span>账号类型</span>
          <select v-model="accountType" :disabled="loadingAccountTypes || submitting">
            <option v-if="loadingAccountTypes" value="" disabled>正在加载账号类型…</option>
            <option
              v-for="option in accountTypes"
              :key="option.accountType"
              :value="option.accountType"
            >
              {{ option.label }}
            </option>
          </select>
          <small v-if="selectedAccountType">{{ selectedAccountType.description }}</small>
        </label>
        <label>
          <span>券商</span>
          <select v-model="brokerId" :disabled="loadingBrokers || submitting">
            <option value="" disabled>{{ loadingBrokers ? '正在加载券商…' : '请选择券商' }}</option>
            <option v-for="broker in brokers" :key="broker.brokerId" :value="broker.brokerId">
              {{ broker.name }}
            </option>
          </select>
        </label>

        <label>
          <span>交易站点</span>
          <select v-model="accessPointId" :disabled="!brokerId || loadingAccessPoints || submitting">
            <option value="" disabled>{{ loadingAccessPoints ? '正在加载交易站点…' : '请选择交易站点' }}</option>
            <option v-for="point in accessPoints" :key="point.accessPointId" :value="point.accessPointId">
              {{ point.name }}
            </option>
          </select>
          <small v-if="selectedAccessPoint">
            {{ selectedAccessPoint.area }} · {{ selectedAccessPoint.carrier || '默认线路' }}
          </small>
        </label>

        <label>
          <span>{{ selectedAccountType?.label ?? '登录账号' }}</span>
          <input
            v-model="loginAccount"
            name="fundAccount"
            type="text"
            autocomplete="username"
            maxlength="32"
            :placeholder="`请输入${selectedAccountType?.label ?? '登录账号'}`"
            :disabled="submitting"
          />
        </label>

        <label>
          <span>交易密码</span>
          <input
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            maxlength="15"
            placeholder="请输入交易密码"
            :disabled="submitting"
          />
        </label>

        <div v-if="error" class="notice error-notice" role="alert">
          <strong>{{ error.message }}</strong>
          <code>{{ error.code }}</code>
        </div>

        <button class="primary-button" type="submit" :disabled="!canSubmit">
          <span v-if="submitting" class="spinner" aria-hidden="true"></span>
          {{ submitting ? '正在登录…' : '登录' }}
        </button>
      </form>

      <footer>密码仅用于本次登录，不会显示在响应中。</footer>
    </section>
  </main>

  <main v-else class="app-shell">
    <header class="app-header">
      <div class="app-brand">
        <div class="brand-mark small" aria-hidden="true">FQ</div>
        <div><strong title="Fast Quant Gateway">FQGate</strong><span>{{ selectedBroker?.name }} · {{ accounts.length }} 个已登录账户</span></div>
      </div>
      <button class="text-button" type="button" @click="logout">退出登录</button>
    </header>
    <section class="accounts-workspace" aria-label="我的交易账户">
      <div class="accounts-heading"><div><h1>我的交易账户</h1></div><span>{{ accounts.length }} 个账户</span></div>
      <AccountCard
        v-for="account in accounts"
        :key="`${session.sessionId}:${accountKey(account)}`"
        :account="account"
        :session-id="session.sessionId"
        :broker-name="selectedBroker?.name ?? session.brokerId"
      />
    </section>
  </main>

  <section class="api-debug" :class="{ collapsed: debugHeight === 44 }" :style="{ height: `${debugHeight}px` }" aria-label="接口响应">
    <div class="debug-resizer" title="拖拽调整高度" @pointerdown="beginDebugResize"></div>
    <div class="debug-heading">
      <div><h2>接口响应</h2></div>
      <div class="debug-actions">
        <button v-if="apiTraces.length && debugHeight > 44" class="text-button" type="button" @click="apiTraces = []">清空</button>
        <button class="text-button" type="button" :aria-expanded="debugHeight > 44" @click="debugHeight = debugHeight === 44 ? 360 : 44">{{ debugHeight === 44 ? '展开' : '收起' }}</button>
      </div>
    </div>
    <p v-if="!apiTraces.length" class="debug-empty">登录或查询后，可在这里查看响应内容。</p>
    <details v-for="trace in apiTraces" :key="trace.id" class="debug-call" :open="trace.id === apiTraces[0]?.id">
      <summary>
        <code>{{ trace.method }}</code>
        <strong>{{ trace.path.split('?')[0] }}</strong>
        <span :class="{ failed: trace.status === null || trace.status >= 400 }">{{ trace.status ?? '连接失败' }}</span>
        <small>{{ trace.durationMs }} ms</small>
      </summary>
      <div class="debug-body">
        <h3>原始响应</h3>
        <article v-for="(payload, index) in decryptedResponses(trace)" :key="`${trace.id}-${index}`">
          <h4>
            {{ payload.operation }}
            <small>{{ payload.tradingMode === 'credit' ? '信用账户' : payload.tradingMode === 'ordinary' ? '普通账户' : '登录' }}</small>
          </h4>
          <textarea readonly :value="payload.text"></textarea>
        </article>
        <p v-if="!decryptedResponses(trace).length" class="debug-empty inline">
          暂无原始响应。
        </p>
        <h3>API 响应</h3>
        <textarea readonly :value="formattedResponse(trace.responseBody)"></textarea>
      </div>
    </details>
  </section>
  </div>
</template>
