// plugins/auth.client.ts
import { useAuthStore } from '~/store/auth';

export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore();
  
  // 在客户端初始化时恢复认证状态
  authStore.init();
  
  if (!authStore.isLoggedIn) return;
  if (authStore.isUser) {
    authStore.resetTimeout();
    return;
  }

  try {
    await $fetch('/api/admin/session', { timeout: 3000, retry: 0 });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) authStore.clearAuthState();
  }
});
