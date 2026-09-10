import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Ref, watch } from "vue";

/**
 * 面板真正不可见达到指定时长后才暂停数据连接。短暂切换标签页或滚动离开
 * 不会立即抖动式重连；重新可见时则立即恢复。
 */
export function useDelayedVisibility(
  target: Ref<HTMLElement | undefined>,
  active: Ref<boolean>,
  hiddenDelayMs = 10_000
): Ref<boolean> {
  const documentVisible = ref(globalThis.document?.visibilityState !== "hidden");
  const intersectsViewport = ref(false);
  const streamEnabled = ref(false);
  let observer: IntersectionObserver | undefined;
  let hiddenTimer: number | undefined;

  const currentlyVisible = computed(
    () => active.value && documentVisible.value && intersectsViewport.value
  );

  function clearHiddenTimer(): void {
    if (hiddenTimer !== undefined) globalThis.clearTimeout(hiddenTimer);
    hiddenTimer = undefined;
  }

  function applyVisibility(visible: boolean): void {
    clearHiddenTimer();
    if (visible) {
      streamEnabled.value = true;
      return;
    }
    if (!streamEnabled.value) return;
    hiddenTimer = window.setTimeout(() => {
      streamEnabled.value = false;
      hiddenTimer = undefined;
    }, hiddenDelayMs);
  }

  function measureInitialVisibility(): void {
    const element = resolveTargetElement(target.value);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    intersectsViewport.value = rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < globalThis.innerHeight
      && rect.left < globalThis.innerWidth;
  }

  function handleDocumentVisibility(): void {
    documentVisible.value = document.visibilityState !== "hidden";
  }

  watch(currentlyVisible, applyVisibility, { immediate: true });
  watch(active, async (enabled) => {
    if (!enabled) return;
    // v-show 恢复后主动测量一次，避免部分嵌入式浏览器不及时派发 IntersectionObserver 回调。
    await nextTick();
    measureInitialVisibility();
  });

  onMounted(() => {
    measureInitialVisibility();
    document.addEventListener("visibilitychange", handleDocumentVisibility);
    const element = resolveTargetElement(target.value);
    if (typeof IntersectionObserver === "function" && element) {
      observer = new IntersectionObserver(([entry]) => {
        intersectsViewport.value = Boolean(entry?.isIntersecting);
      });
      observer.observe(element);
    } else {
      intersectsViewport.value = true;
    }
  });

  onBeforeUnmount(() => {
    clearHiddenTimer();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", handleDocumentVisibility);
  });

  return streamEnabled;
}

function resolveTargetElement(value: unknown): HTMLElement | undefined {
  if (value instanceof HTMLElement) return value;
  if (value && typeof value === "object" && "$el" in value) {
    const element = (value as { $el?: unknown }).$el;
    return element instanceof HTMLElement ? element : undefined;
  }
  return undefined;
}
