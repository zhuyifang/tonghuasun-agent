<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import InformationPanel from "@/components/information/InformationPanel.vue";
import { useDataServiceReconnect } from "@/composables/useDataServiceReconnect";
import type {
  InformationData,
  InformationService,
  MarketSecurity
} from "@/shared/contracts";

const props = defineProps<{
  service: InformationService;
  security: MarketSecurity;
}>();

const data = ref<InformationData>();
const loading = ref(false);
const error = ref("");
let requestVersion = 0;
let requestController: AbortController | undefined;

const { connectionLoading, handleServiceError } = useDataServiceReconnect({
  service: props.service,
  onRecovered: loadInformation
});

const title = computed(() => `${data.value?.security.name || props.security.name || props.security.code}资讯`);

async function loadInformation(): Promise<void> {
  const version = ++requestVersion;
  requestController?.abort();
  requestController = new AbortController();
  loading.value = true;
  error.value = "";
  try {
    const result = await props.service.getInformation({
      security: props.security,
      category: "security"
    }, requestController.signal);
    if (version === requestVersion) data.value = result;
  } catch (reason) {
    if (version !== requestVersion || requestController.signal.aborted) return;
    if (!handleServiceError(reason)) {
      error.value = reason instanceof Error ? reason.message : "资讯读取失败，请稍后重试。";
    }
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

watch(
  () => [props.security.market, props.security.code, props.security.name, props.security.fullCode],
  () => {
    data.value = undefined;
    void loadInformation();
  }
);

watch(
  () => props.service,
  () => {
    data.value = undefined;
    void loadInformation();
  }
);

onMounted(() => void loadInformation());

onBeforeUnmount(() => {
  requestVersion += 1;
  requestController?.abort();
});
</script>

<template>
  <InformationPanel
    :title="title"
    :items="data?.items ?? []"
    :fetched-at="data?.fetchedAt"
    :loading="loading"
    :connection-loading="connectionLoading"
    :error="error"
    refreshable
    @refresh="loadInformation"
  />
</template>
