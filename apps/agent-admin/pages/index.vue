<template>
  <div class="redirect-container">
    <!-- 右上角退出按钮 -->
    <div class="header-actions">
      <UButton 
        color="gray" 
        variant="ghost" 
        icon="i-heroicons-arrow-right-on-rectangle"
        @click="logoutToAdminLogin"
        class="logout-btn"
      >
        退出登录
      </UButton>
    </div>

    <!-- 主要内容卡片 -->
    <UCard class="loading-card">
      <div class="loading-content">
        <!-- Logo区域 -->
        <div class="logo-section">
          <div class="logo-container">
            <img src="/logo.svg" alt="Logo" class="logo-image" />
            <div class="logo-glow"></div>
          </div>
          <h1 class="brand-title">后台管理系统</h1>
        </div>

        <!-- 状态显示区域 -->
        <div class="status-section">
          <h2 class="loading-title">正在验证登录状态</h2>
          <div class="loading-progress">
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <div class="progress-dots">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
          <p class="loading-tip">系统正在为您准备，请稍候...</p>
        </div>

        <!-- 装饰元素 -->
        <div class="decoration-elements">
          <div class="floating-circle circle-1"></div>
          <div class="floating-circle circle-2"></div>
          <div class="floating-circle circle-3"></div>
        </div>
      </div>
    </UCard>


  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/store/auth';

// 设置页面布局
definePageMeta({
  layout: 'auth'
});

const router = useRouter();
const authStore = useAuthStore();

// 退出登录并返回管理员登录页
const logoutToAdminLogin = () => {
  // 清除登录状态
  authStore.logOut();
  // 跳转到管理员登录页
  router.push('/admin/login');
};

// 页面加载时检查登录状态并重定向
onMounted(() => {
  // 初始化认证状态
  authStore.init();
  
  // 添加最小显示时间，避免闪屏
  setTimeout(() => {
    // 检查登录状态并重定向
    if (authStore.isLoggedIn) {
      if (authStore.isUser) {
        // 普通用户跳转到用户主页
        router.push('/user/home');
      } else {
        // 管理员跳转到管理员首页
        router.push('/home');
      }
    } else {
      // 未登录用户默认跳转到管理员登录页
      router.push('/admin/login');
    }
  }, 1500); // 最少显示1.5秒，让用户看到美化的界面
});
</script>

<style scoped>
.redirect-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-attachment: fixed;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.redirect-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(120, 119, 198, 0.2) 0%, transparent 50%);
  animation: backgroundShift 15s ease-in-out infinite;
}

@keyframes backgroundShift {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 右上角退出按钮 */
.header-actions {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 10;
}

.logout-btn {
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white !important;
  transition: all 0.3s ease;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

/* 主卡片 */
.loading-card {
  width: 100%;
  max-width: 520px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 
    0 25px 50px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  border-radius: 24px;
  overflow: hidden;
  position: relative;
  z-index: 2;
  animation: cardAppear 0.8s ease-out;
}

@keyframes cardAppear {
  0% {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.loading-content {
  text-align: center;
  padding: 60px 40px;
  position: relative;
  overflow: hidden;
}

/* Logo区域 */
.logo-section {
  margin-bottom: 40px;
  position: relative;
}

.logo-container {
  position: relative;
  display: inline-block;
  margin-bottom: 16px;
}

.logo-image {
  height: 80px;
  width: auto;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
  animation: logoFloat 3s ease-in-out infinite;
  position: relative;
  z-index: 2;
}

.logo-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.4) 0%, transparent 70%);
  border-radius: 50%;
  animation: logoGlow 2s ease-in-out infinite alternate;
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}

@keyframes logoGlow {
  0% { 
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0.3;
  }
  100% { 
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.6;
  }
}

.brand-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

/* 状态显示区域 */
.status-section {
  margin-bottom: 24px;
}

.loading-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 32px;
  color: #1f2937;
  letter-spacing: -0.3px;
}

.loading-progress {
  margin: 32px 0;
}

.progress-bar {
  width: 200px;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  margin: 0 auto 20px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 2px;
  animation: progressFlow 2s ease-in-out infinite;
}

@keyframes progressFlow {
  0% {
    width: 0%;
    transform: translateX(0);
  }
  50% {
    width: 100%;
    transform: translateX(0);
  }
  100% {
    width: 100%;
    transform: translateX(100%);
  }
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  animation: dotBounce 1.5s ease-in-out infinite;
}

.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotBounce {
  0%, 80%, 100% {
    transform: scale(0.8);
    background: #cbd5e1;
  }
  40% {
    transform: scale(1.2);
    background: #667eea;
  }
}

.loading-tip {
  color: #64748b;
  font-size: 16px;
  margin: 0;
  opacity: 0.8;
  font-weight: 400;
}

/* 装饰元素 */
.decoration-elements {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: hidden;
}

.floating-circle {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
  animation: float 6s ease-in-out infinite;
}

.circle-1 {
  width: 60px;
  height: 60px;
  top: 10%;
  left: 10%;
  animation-delay: 0s;
}

.circle-2 {
  width: 40px;
  height: 40px;
  top: 20%;
  right: 15%;
  animation-delay: 2s;
}

.circle-3 {
  width: 30px;
  height: 30px;
  bottom: 20%;
  left: 20%;
  animation-delay: 4s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px) rotate(0deg);
    opacity: 0.3;
  }
  50% {
    transform: translateY(-20px) rotate(180deg);
    opacity: 0.6;
  }
}

/* 底部信息 */
.footer-info {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}

.copyright {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  margin: 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(5px);
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

/* 响应式适配 */
@media (max-width: 768px) {
  .redirect-container {
    padding: 16px;
  }
  
  .header-actions {
    top: 16px;
    right: 16px;
  }
  
  .loading-content {
    padding: 40px 32px;
  }
  
  .logo-image {
    height: 64px;
  }
  
  .brand-title {
    font-size: 24px;
  }
  
  .loading-title {
    font-size: 20px;
  }
  
  .footer-info {
    bottom: 16px;
  }
  
  .copyright {
    font-size: 12px;
    padding: 6px 12px;
  }
}

@media (max-width: 480px) {
  .loading-content {
    padding: 32px 24px;
  }
  
  .logo-image {
    height: 56px;
  }
  
  .brand-title {
    font-size: 20px;
  }
  
  .loading-title {
    font-size: 18px;
  }
  
  .loading-tip {
    font-size: 14px;
  }
  
  .progress-bar {
    width: 160px;
  }
  
  .floating-circle {
    display: none;
  }
}

/* 高对比度和深色模式适配 */
@media (prefers-color-scheme: dark) {
  .loading-card {
    background: rgba(17, 24, 39, 0.95);
    color: #f9fafb;
  }
  
  .loading-title {
    color: #f9fafb;
  }
  
  .loading-tip {
    color: #d1d5db;
  }
}

/* 减少动画（用户偏好设置） */
@media (prefers-reduced-motion: reduce) {
  .logo-image,
  .logo-glow,
  .floating-circle,
  .progress-fill,
  .dot {
    animation: none;
  }
  
  .loading-card {
    animation: none;
  }
}
</style>
