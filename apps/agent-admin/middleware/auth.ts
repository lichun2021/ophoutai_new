// middleware/auth.ts - 用户认证中间件
import { useAuthStore } from '~/store/auth';

export default defineNuxtRouteMiddleware((to, from) => {
  // 只在客户端执行
  if (process.server) return;
  
  const auth = useAuthStore();
  
  console.log('🔍 用户认证中间件检查:', {
    path: to.path,
    isLoggedIn: auth.isLoggedIn,
    isUser: auth.isUser,
    userInfo: auth.userInfo
  });
  
  // 确保 store 已初始化
  if (!auth.isLoggedIn) {
    auth.init();
  }
  
  // 检查是否为用户登录状态
  if (!auth.isLoggedIn || !auth.isUser) {
    console.log('用户未登录或不是用户账号，重定向到用户登录页');
    return navigateTo('/user/login');
  }
  
  console.log('用户认证检查通过');
}); 