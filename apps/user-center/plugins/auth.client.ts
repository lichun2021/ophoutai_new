// plugins/auth.client.ts
import { useAuthStore } from '~/store/auth';

export default defineNuxtPlugin(() => {
  const authStore = useAuthStore();
  
  // 在客户端初始化时恢复认证状态
  authStore.init();
  
  // 如果用户已登录，重置超时计时器
  if (authStore.isLoggedIn) {
    authStore.resetTimeout();
  }
}); 