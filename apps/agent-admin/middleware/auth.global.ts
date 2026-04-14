// middleware/auth.global.ts
import { useAuthStore } from '~/store/auth';

export default defineNuxtRouteMiddleware((to, from) => {
  // 只在客户端执行
  if (process.server) return;
  
  const auth = useAuthStore();
  
  console.log('🔍 全局中间件检查:', {
    path: to.path,
    isLoggedIn: auth.isLoggedIn,
    authId: auth.id,
    isUser: auth.isUser,
    userInfo: auth.userInfo,
    localStorage_isLoggedIn: process.client ? localStorage.getItem('auth_isLoggedIn') : null,
    localStorage_isUser: process.client ? localStorage.getItem('auth_isUser') : null
  });
  
  // 免认证页面列表
  const publicPaths = [
    '/user/login', 
    '/user/register', 
    '/admin/login',
    '/user/cdk-redeem',
    '/user/payment-success', // 支付成功页面不需要认证
    '/user/qrcode', // 二维码页面不需要认证
    '/user/customer-service-payment', // 客服支付页面不需要认证
    '/user/balance-insufficient', // 余额不足提示页不需要认证
    '/' // 首页
  ];
  
  // 检查是否为免认证页面
  if (publicPaths.includes(to.path)) {
    console.log('访问免认证页面，跳过认证检查');
    return;
  }
  
  // 确保 store 已初始化（只对需要认证的页面）
  if (!auth.id && !auth.isLoggedIn) {
    auth.init();
  }
  
  // 检查用户是否登录
  if (!auth.isLoggedIn) {
    console.log('未登录，根据访问路径重定向到相应登录页');
    
    // 根据访问的路径判断应该跳转到哪个登录页
    if (to.path.startsWith('/admin')) {
      // 访问管理员路径，跳转到管理员登录
      return navigateTo('/admin/login');
    } else if (to.path.startsWith('/user/')) {
      // 访问用户路径（但不包括报表页面如 /user-register），跳转到用户登录
      return navigateTo('/user/login');
    } else {
      // 其他路径，默认跳转到管理员登录（因为报表页面属于管理员功能）
      return navigateTo('/admin/login');
    }
  }
  
  // 已登录用户的权限检查
  if (auth.isLoggedIn) {
    // 暂时注释掉管理员访问用户页面的重定向，允许访问报表页面
    // if (!auth.isUser && to.path.startsWith('/user/')) {
    //   console.log('管理员访问用户页面，重定向到管理员dashboard');
    //   return navigateTo('/admin/dashboard');
    // }
    
    // 普通用户访问管理员页面，跳转到用户主页
    if (auth.isUser && to.path.startsWith('/admin')) {
      console.log('普通用户访问管理员页面，重定向到用户主页');
      return navigateTo('/user/home');
    }
  }

  console.log('全局中间件检查通过');
}); 