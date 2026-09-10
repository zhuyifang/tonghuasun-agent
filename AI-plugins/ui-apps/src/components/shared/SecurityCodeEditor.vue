<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { InputInstance } from "@arco-design/web-vue";
import { IconCheck } from "@arco-design/web-vue/es/icon";
import type { MarketSecurity, SecuritySearchService } from "@/shared/contracts";
import { matchingSecurityCodes, securitySearchPattern } from "./securityCode";

const props = defineProps<{
  security: MarketSecurity; name: string; service: SecuritySearchService;
}>();
const emit = defineEmits<{ change: [security: MarketSecurity] }>();
const input = ref<InputInstance>();
const trigger = ref<HTMLButtonElement>();
const editing = ref(false);
const draft = ref("");
const busy = ref(false);
const error = ref("");
const candidates = ref<MarketSecurity[]>([]);
let revision = 0;
let request: AbortController | undefined;

async function beginEdit(): Promise<void> {
  draft.value = props.security.code;
  error.value = "";
  editing.value = true;
  await nextTick();
  input.value?.focus();
  input.value?.inputRef?.select();
}

function cancelEdit(restoreFocus = false): void {
  revision += 1;
  request?.abort();
  request = undefined;
  editing.value = false;
  busy.value = false;
  error.value = "";
  candidates.value = [];
  if (restoreFocus) void nextTick(() => trigger.value?.focus());
}

function selectSecurity(security: MarketSecurity): void {
  emit("change", security);
  cancelEdit(true);
}

async function confirm(): Promise<void> {
  if (busy.value) return;
  if (!draft.value.trim()) { error.value = "请输入股票代码。"; return; }
  const version = ++revision;
  const controller = new AbortController();
  request = controller;
  busy.value = true;
  error.value = "";
  candidates.value = [];
  try {
    const results = await props.service.searchSecurities(securitySearchPattern(draft.value), controller.signal);
    if (version !== revision || controller.signal.aborted) return;
    const matches = matchingSecurityCodes(draft.value, results);
    if (matches.length === 0) throw new Error("未找到该股票代码，请核对后重试。");
    if (matches.length === 1) selectSecurity(matches[0]!);
    else candidates.value = matches;
  } catch (reason) {
    if (version === revision && !controller.signal.aborted) {
      error.value = reason instanceof Error ? reason.message : "股票代码校验失败，请重试。";
    }
  } finally {
    if (version === revision) busy.value = false;
  }
}

function handleFocusOut(event: FocusEvent): void {
  const form = event.currentTarget as HTMLFormElement;
  if (!form.contains(event.relatedTarget as Node | null)) cancelEdit();
}

watch(() => [props.security.market, props.security.code], () => cancelEdit());
onBeforeUnmount(() => cancelEdit());
</script>

<template>
  <div class="security-editor" :class="{ 'is-editing': editing }">
    <!-- 查看态一直参与尺寸计算；编辑层覆盖相同位置，边框和加载态不会撑高。 -->
    <button
      ref="trigger" class="security-display" type="button"
      :tabindex="editing ? -1 : 0" :aria-hidden="editing"
      :aria-label="`修改股票代码：${name} ${security.code}`" @click="beginEdit"
    >
      <span class="security-name">{{ name }}</span>
      <span class="security-code">{{ security.code }}</span>
    </button>
    <form v-if="editing" class="security-form" @submit.prevent="confirm" @focusout="handleFocusOut" @keydown.esc.prevent="cancelEdit(true)">
      <a-input
        ref="input" v-model="draft" size="small"
        :readonly="busy" :error="Boolean(error)"
        :input-attrs="{ 'aria-label': '股票代码', 'aria-busy': busy, autocomplete: 'off', spellcheck: false }"
        @input="error = ''; candidates = []"
      >
        <template #suffix>
          <a-button type="text" size="mini" aria-label="确认股票代码" :loading="busy" @mousedown.prevent @click="confirm">
            <template #icon><IconCheck /></template>
          </a-button>
        </template>
      </a-input>
      <div v-if="error" class="security-error" role="alert"><a-alert type="error">{{ error }}</a-alert></div>
      <a-card v-if="candidates.length" class="security-candidates" size="small" title="请选择证券">
        <a-space direction="vertical" fill size="mini" role="group" aria-label="同代码证券">
          <a-button
            v-for="candidate in candidates" :key="`${candidate.market}${candidate.code}`"
            type="text" size="small" long html-type="button"
            @mousedown.prevent @click="selectSecurity(candidate)"
          >{{ candidate.name }} {{ candidate.code }}</a-button>
        </a-space>
      </a-card>
    </form>
  </div>
</template>

<style scoped>
.security-editor { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); max-width: 100%; height: 28px; }
.security-display {
  box-sizing: border-box; display: flex; align-items: center; gap: 9px;
  width: 100%; min-width: 0; max-width: 100%; height: 28px; padding: 0 4px; border: 1px solid transparent;
  border-radius: var(--border-radius-small); background: transparent;
  color: var(--color-text-1); font: inherit; white-space: nowrap; cursor: text;
}
.security-display:hover { border-color: var(--color-border-3); }
.security-display:focus-visible { outline: 2px solid rgb(var(--primary-6)); outline-offset: 1px; }
.security-name { overflow: hidden; text-overflow: ellipsis; font-size: 16px; font-weight: 500; }
.security-code { flex-shrink: 0; color: var(--color-text-2); font-size: 14px; }
.is-editing .security-display { visibility: hidden; }
.security-form { position: absolute; inset: 0; margin: 0; }
.security-form :deep(.arco-input-wrapper) { box-sizing: border-box; width: 100%; height: 28px; padding-right: 2px; }
.security-form :deep(.arco-input-suffix) { margin-left: 2px; }
.security-error { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; width: max-content; max-width: min(300px, 80vw); }
.security-candidates { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; min-width: 100%; width: max-content; max-width: min(300px, 80vw); max-height: 240px; overflow: auto; }
</style>
