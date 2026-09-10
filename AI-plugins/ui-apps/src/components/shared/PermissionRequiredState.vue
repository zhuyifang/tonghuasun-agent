<script setup lang="ts">
withDefaults(defineProps<{
  description?: string;
  actionLabel?: string;
}>(), {
  description: "当前账号没有相应权限，无法获取数据",
  actionLabel: "登录同花顺"
});

defineEmits<{
  action: [];
}>();
</script>

<template>
  <div class="permission-required-state" role="status">
    <a-empty :description="description" />
    <a-button type="primary" @click="$emit('action')">{{ actionLabel }}</a-button>
  </div>
</template>

<style scoped>
.permission-required-state {
  display: flex;
  padding: 16px 0;
  align-items: center;
  flex-direction: column;
  gap: 10px;
}
</style>
