export interface Broker {
  brokerId: string
  name: string
  pinyin: string
  serviceType: string
  authMode: number
}

export interface AccessPoint {
  accessPointId: string
  brokerId: string
  name: string
  area: string
  host: string
  carrier: string
  branchId: string
  tradeType: string
  ports: {
    cert: number | null
    hexin: number | null
    ssl: number | null
    sslCert: number | null
  }
}

export interface LoginRequest {
  tradingMode: TradingMode
  accountType: LoginAccountType
  brokerId: string
  accessPointId: string
  fundAccount: string
  password: string
}

export type TradingMode = 'ordinary' | 'credit'

export type LoginAccountType =
  | 'fundAccount'
  | 'customerNumber'
  | 'shenzhenAccount'
  | 'shanghaiAccount'
  | 'fundShareAccount'
  | 'shenzhenBShareAccount'
  | 'shanghaiBShareAccount'

export interface LoginAccountTypeOption {
  accountType: LoginAccountType
  label: string
  description: string
  isDefault: boolean
}

export interface DecryptedResponse {
  operation: string
  tradingMode: TradingMode | null
  byteLength: number
  text: string
}

export interface TradingAccount {
  accountId: string
  fundAccount: string
  tradingMode: TradingMode
}

export interface LoginResponse {
  tradingMode: TradingMode
  accountType: LoginAccountType
  sessionId: string
  accountId: string
  fundAccount: string
  brokerId: string
  accessPointId: string
  cryptProtocol: string
  accounts?: TradingAccount[]
  decryptedResponses: DecryptedResponse[]
}

export interface AssetsResponse {
  tradingMode: TradingMode
  sessionId: string
  accountId: string
  fundAccount: string
  currency: string | null
  totalAssets: number | null
  securitiesMarketValue: number | null
  cashBalance: number | null
  availableCash: number | null
  withdrawableCash: number | null
  frozenCash: number | null
  netAssets: number | null
  totalLiabilities: number | null
  availableMargin: number | null
  maintenanceRatio: number | null
  columns: TableColumn[]
  rawFields: Record<string, string>
  decryptedResponse: DecryptedResponse
}

export interface Position {
  securityCode: string
  securityName: string
  market: string | null
  marketCode: string | null
  quantity: number | null
  availableQuantity: number | null
  costPrice: number | null
  currentPrice: number | null
  marketValue: number | null
  profitLoss: number | null
  profitLossRatio: number | null
  positionRatio: number | null
  rawFields: Record<string, string>
}

export interface PositionsResponse {
  tradingMode: TradingMode
  sessionId: string
  accountId: string
  fundAccount: string
  items: Position[]
  columns: TableColumn[]
  decryptedResponse: DecryptedResponse
}

export interface TableColumn { key: string; label: string }

export interface TableResponse {
  sessionId: string
  accountId: string
  fundAccount: string
  tradingMode: TradingMode
  columns: TableColumn[]
  items: Record<string, unknown>[]
  decryptedResponses?: DecryptedResponse[]
}

export interface ApiErrorBody {
  code: string
  message: string
}
