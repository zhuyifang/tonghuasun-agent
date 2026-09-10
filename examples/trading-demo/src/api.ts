import type {
  AccessPoint,
  ApiErrorBody,
  AssetsResponse,
  Broker,
  LoginRequest,
  LoginResponse,
  PositionsResponse,
  TradingMode,
} from './types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export interface ApiTrace {
  id: number
  method: string
  path: string
  status: number | null
  durationMs: number
  responseBody: unknown
}

let traceSequence = 0
let traceListener: ((trace: ApiTrace) => void) | null = null

export function setApiTraceListener(listener: (trace: ApiTrace) => void) {
  traceListener = listener
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const startedAt = performance.now()
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    traceListener?.({
      id: ++traceSequence,
      method: init?.method ?? 'GET',
      path,
      status: null,
      durationMs: Math.round(performance.now() - startedAt),
      responseBody: { code: 'API_UNAVAILABLE', message: '无法连接本机交易服务' },
    })
    throw new ApiError('API_UNAVAILABLE', '无法连接本机交易服务，请确认服务已经启动')
  }

  const responseText = await response.text()
  let body: unknown = null
  try {
    body = responseText ? JSON.parse(responseText) : null
  } catch {
    body = responseText
  }
  traceListener?.({
    id: ++traceSequence,
    method: init?.method ?? 'GET',
    path,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    responseBody: body,
  })

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null
    throw new ApiError(
      errorBody?.code ?? 'REQUEST_FAILED',
      errorBody?.message ?? '请求未成功，请稍后重试',
      response.status,
    )
  }
  return body as T
}

export function getBrokers(): Promise<Broker[]> {
  return request('/v1/trading/brokers')
}

export function getAccessPoints(brokerId: string): Promise<AccessPoint[]> {
  return request(`/v1/trading/brokers/${encodeURIComponent(brokerId)}/access-points`)
}

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return request('/v1/trading/sessions/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getAssets(
  sessionId: string,
  accountId: string,
  tradingMode: TradingMode,
): Promise<AssetsResponse> {
  const query = new URLSearchParams({ sessionId, accountId, tradingMode })
  return request(`/v1/trading/assets?${query}`)
}

export function getPositions(
  sessionId: string,
  accountId: string,
  tradingMode: TradingMode,
): Promise<PositionsResponse> {
  const query = new URLSearchParams({ sessionId, accountId, tradingMode })
  return request(`/v1/trading/positions?${query}`)
}
