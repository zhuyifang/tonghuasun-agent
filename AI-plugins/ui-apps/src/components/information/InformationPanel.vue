<script setup lang="ts">
import { computed } from "vue";

import ComponentFrame from "@/components/shared/ComponentFrame.vue";
import type { InformationItem } from "@/shared/contracts";

const props = withDefaults(defineProps<{
  title: string;
  items: readonly InformationItem[];
  fetchedAt?: string;
  loading?: boolean;
  connectionLoading?: boolean;
  refreshable?: boolean;
  error?: string;
  emptyText?: string;
}>(), {
  fetchedAt: "",
  loading: false,
  connectionLoading: false,
  refreshable: false,
  error: "",
  emptyText: "暂无资讯"
});

defineEmits<{
  refresh: [];
}>();

const statusText = computed(() => {
  if (props.error && props.items.length > 0) return props.error;
  const count = `${props.items.length} 条资讯`;
  return props.fetchedAt ? `${count} · ${formatFetchedAt(props.fetchedAt)}` : count;
});
const listItems = computed(() => [...props.items]);

function formatPublishedAt(value: number | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  const now = new Date();
  const sameDay = dateParts(date) === dateParts(now);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    ...(sameDay ? {} : { month: "2-digit", day: "2-digit" }),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function dateParts(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatFetchedAt(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "刚刚更新";
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed)}`;
}
</script>

<template>
  <section class="information-panel-host">
    <ComponentFrame
      :refreshable="refreshable"
      :connection-loading="connectionLoading"
      loading-tip="正在重连数据服务"
      :refreshing="loading"
      @refresh="$emit('refresh')"
    >
      <a-card class="information-panel" :bordered="false">
        <header class="information-toolbar">
          <a-typography-title :heading="6">{{ title }}</a-typography-title>
        </header>

        <section class="information-feed" aria-live="polite">
          <div v-if="items.length > 0" class="information-scroll">
            <a-list :data="listItems" :bordered="false" :split="true">
              <template #item="{ item }: { item: InformationItem }">
                <a-list-item class="information-list-item">
                  <article class="information-item">
                    <div class="information-meta">
                      <time>{{ formatPublishedAt(item.publishedAt) }}</time>
                      <span v-if="item.source" class="information-source">{{ item.source }}</span>
                      <a
                        v-if="item.url"
                        class="information-link"
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        查看原文
                      </a>
                    </div>
                    <h3 class="information-title">{{ item.title }}</h3>
                    <p v-if="item.summary" class="information-summary">{{ item.summary }}</p>
                  </article>
                </a-list-item>
              </template>
            </a-list>
          </div>

          <div v-else class="information-state">
            <a-space v-if="error" direction="vertical" align="center">
              <a-typography-text type="danger">{{ error }}</a-typography-text>
              <a-button v-if="refreshable" @click="$emit('refresh')">重新读取</a-button>
            </a-space>
            <a-empty v-else-if="!loading" :description="emptyText" />
          </div>

          <div v-if="loading" class="information-loading" role="status">
            <a-spin tip="正在读取资讯…" />
          </div>
        </section>

        <footer class="information-status" :class="{ 'is-error': Boolean(error) }">
          {{ statusText }}
        </footer>
      </a-card>
    </ComponentFrame>
  </section>
</template>

<style scoped>
.information-panel-host,
.information-panel {
  width: 100%;
  min-width: 0;
}

.information-panel :deep(.arco-card-body) {
  padding: 0;
}

.information-toolbar {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  min-height: 52px;
  padding: 10px 16px;
  align-items: center;
  border-bottom: 1px solid var(--color-border-2);
}

.information-toolbar :deep(.arco-typography) {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.information-feed {
  position: relative;
  height: 520px;
  min-height: 0;
  background: var(--color-bg-2);
}

.information-scroll {
  height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.information-list-item {
  padding: 0 !important;
}

.information-item {
  box-sizing: border-box;
  width: 100%;
  padding: 13px 16px 14px;
  transition: background-color 0.1s;
}

.information-item:hover {
  background: var(--color-fill-1);
}

.information-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--color-text-3);
  font-size: 12px;
  line-height: 18px;
}

.information-meta time {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.information-source {
  overflow: hidden;
  flex: 1 1 auto;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.information-link {
  flex: 0 0 auto;
  color: rgb(var(--arcoblue-6));
  text-decoration: none;
}

.information-link:hover {
  color: rgb(var(--arcoblue-5));
}

.information-title {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0 3px;
  color: var(--color-text-1);
  font-size: 14px;
  font-weight: 600;
  line-height: 21px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.information-summary {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--color-text-2);
  font-size: 13px;
  line-height: 20px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.information-state,
.information-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.information-loading {
  z-index: 2;
  background: var(--color-spin-layer-bg);
}

.information-status {
  box-sizing: border-box;
  min-height: 32px;
  padding: 7px 16px;
  color: var(--color-text-3);
  border-top: 1px solid var(--color-border-2);
  font-size: 11px;
  line-height: 17px;
}

.information-status.is-error {
  color: rgb(var(--danger-6));
}

@media (max-width: 760px) {
  .information-toolbar,
  .information-item,
  .information-status {
    padding-inline: 12px;
  }

  .information-feed {
    height: 480px;
  }
}
</style>
