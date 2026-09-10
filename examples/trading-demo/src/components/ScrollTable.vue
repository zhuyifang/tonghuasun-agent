<script setup lang="ts">
withDefaults(defineProps<{
  columns: string[]
  label: string
  empty?: boolean
  emptyMessage?: string
}>(), { empty: false, emptyMessage: '暂无记录' })
</script>

<template>
  <div class="scroll-table" role="region" :aria-label="label" tabindex="0">
    <table>
      <thead><tr><th v-for="column in columns" :key="column" scope="col">{{ column }}</th></tr></thead>
      <tbody>
        <tr v-if="empty"><td :colspan="columns.length" class="table-empty">{{ emptyMessage }}</td></tr>
        <slot v-else />
      </tbody>
    </table>
  </div>
</template>
