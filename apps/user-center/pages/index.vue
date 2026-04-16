<template>
  <div class="index-redirect" aria-hidden="true" />
</template>

<script setup>
import { useAuthStore } from '~/store/auth';

// 仅客户端渲染：init 依赖 localStorage，避免 SSR 与首屏闪动
definePageMeta({
  layout: 'auth',
  ssr: false
});

const authStore = useAuthStore();

onMounted(() => {
  authStore.init();
  const path = authStore.isLoggedIn
    ? (authStore.isUser ? '/user/home' : '/home')
    : '/admin/login';
  navigateTo(path, { replace: true });
});
</script>

<style scoped>
.index-redirect {
  min-height: 100vh;
  background: #0d0f1a;
}
</style>
