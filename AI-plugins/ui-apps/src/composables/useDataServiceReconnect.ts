import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";

import type { DataServiceAvailability } from "@/shared/dataService";
import { isDataServiceUnavailableError } from "@/shared/dataService";

export interface DataServiceReconnectOptions {
  service: DataServiceAvailability;
  onRecovered?: () => Promise<void> | void;
}

export interface DataServiceReconnectController {
  reconnecting: Ref<boolean>;
  recovering: Ref<boolean>;
  connectionLoading: ComputedRef<boolean>;
  handleServiceError(error: unknown): boolean;
  stop(): void;
}

/**
 * 把底层共享连接状态转换成 Vue 状态。健康轮询由连接监控器统一执行，
 * 此处只负责在恢复事件后续接当前组件自己的查询或实时订阅。
 */
export function useDataServiceReconnect(
  options: DataServiceReconnectOptions
): DataServiceReconnectController {
  const initialSnapshot = options.service.connection.getSnapshot();
  const reconnecting = ref(initialSnapshot.state === "reconnecting");
  const recovering = ref(false);
  const connectionLoading = computed(() => reconnecting.value || recovering.value);
  let seenRecoveryRevision = initialSnapshot.recoveryRevision;
  let recoveryRun = 0;
  let stopped = false;

  async function recover(revision: number): Promise<void> {
    const run = ++recoveryRun;
    recovering.value = true;
    try {
      await options.onRecovered?.();
    } finally {
      if (!stopped && run === recoveryRun && revision === seenRecoveryRevision) {
        recovering.value = false;
      }
    }
  }

  const unsubscribe = options.service.connection.subscribe((snapshot) => {
    if (stopped) return;
    reconnecting.value = snapshot.state === "reconnecting";
    if (snapshot.recoveryRevision <= seenRecoveryRevision) return;
    seenRecoveryRevision = snapshot.recoveryRevision;
    void recover(snapshot.recoveryRevision);
  });

  function handleServiceError(error: unknown): boolean {
    if (!isDataServiceUnavailableError(error)) return false;
    options.service.connection.reportUnavailable();
    return true;
  }

  function stop(): void {
    stopped = true;
    recoveryRun += 1;
    reconnecting.value = false;
    recovering.value = false;
    unsubscribe();
  }

  onBeforeUnmount(stop);

  return { reconnecting, recovering, connectionLoading, handleServiceError, stop };
}
