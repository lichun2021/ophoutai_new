// middleware/auth.global.ts - 用户中心版本
import { useAuthStore } from '~/store/auth';

export default defineNuxtRouteMiddleware((to, from) => {
  // 只在客户端执行
  if (process.server) return;
  
  const auth = useAuthStore();
  
  // 免认证页面列表（用户中心专用）
  const publicPaths = [
    '/user/login', 
    '/user/register', 
    '/user/cdk-redeem',
    '/user/payment-success',
    '/user/qrcode',
    '/user/customer-service-payment',
    '/user/balance-insufficient',
    '/'
  ];
  
  // 检查是否为免认证页面
  if (publicPaths.includes(to.path)) {
    return;
  }
  
  // 初始化 store
  if (!auth.id && !auth.isLoggedIn) {
    auth.init();
  }
  
  // 未登录 → 跳转到用户登录
  if (!auth.isLoggedIn) {
    return navigateTo('/user/login');
  }
  
  // 管理员误入用户中心 → 跳转到用户首页（用户中心只服务普通用户）
  if (auth.isLoggedIn && !auth.isUser) {
    return navigateTo('/user/login');
  }
});