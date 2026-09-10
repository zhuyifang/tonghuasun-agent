export type DataServiceConnectionState = "connected" | "reconnecting";

export interface DataServiceConnectionSnapshot {
  state: DataServiceConnectionState;
  recoveryRevision: number;
}

export type DataServiceConnectionListener = (
  snapshot: DataServiceConnectionSnapshot
) => void;

/** 所有使用同一后端的数据组件共享这一连接状态，不各自启动探活轮询。 */
export interface DataServiceConnection {
  getSnapshot(): DataServiceConnectionSnapshot;
  subscribe(listener: DataServiceConnectionListener): () => void;
  reportUnavailable(): void;
}

export interface DataServiceAvailability {
  readonly connection: DataServiceConnection;
}

/**
 * 只表示数据服务不可达、超时或网关无有效响应。
 * 已连接后端返回的业务错误仍使用普通 Error，避免组件误入无限重连。
 */
export class DataServiceUnavailableError extends Error {
  constructor(message = "无法连接本机 FQGate，请确认服务正在运行。") {
    super(message);
    this.name = "DataServiceUnavailableError";
  }
}

export function isDataServiceUnavailableError(
  error: unknown
): error is DataServiceUnavailableError {
  return error instanceof DataServiceUnavailableError;
}
