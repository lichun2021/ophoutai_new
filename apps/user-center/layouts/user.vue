<!-- layouts/user.vue - 用户页面专用布局，移动端和PC端自适应 -->
<template>
  <div class="user-layout">
    <!-- PC端侧边栏 -->
    <aside class="pc-sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <UIcon name="i-heroicons-user-circle" class="logo-icon" />
          <span class="logo-text">用户中心</span>
        </div>
      </div>
      
      <nav class="sidebar-nav">
        <NuxtLink 
          to="/user/home" 
          class="sidebar-nav-item"
          :class="{ 'active': $route.path === '/user/home' }"
        >
          <UIcon name="i-heroicons-home" class="nav-icon" />
          <span>首页</span>
        </NuxtLink>

        <NuxtLink 
          to="/user/cashier" 
          class="sidebar-nav-item"
          :class="{ 'active': $route.path === '/user/cashier' }"
        >
          <UIcon name="i-heroicons-banknotes" class="nav-icon" />
          <span>充值收银台</span>
        </NuxtLink>

        <NuxtLink 
          to="/user/recharge" 
          class="sidebar-nav-item"
          :class="{ 'active': $route.path === '/user/recharge' }"
        >
          <UIcon name="i-heroicons-credit-card" class="nav-icon" />
          <span>充值记录</span>
        </NuxtLink>

        <NuxtLink 
          to="/user/mall" 
          class="sidebar-nav-item"
          :class="{ 'active': $route.path === '/user/mall' }"
        >
          <UIcon name="i-heroicons-gift" class="nav-icon" />
          <span>礼包商城</span>
        </NuxtLink>

        <NuxtLink 
          to="/user/orders" 
          class="sidebar-nav-item"
          :class="{ 'active': $route.path === '/user/orders' }"
        >
          <UIcon name="i-heroicons-shopping-bag" class="nav-icon" />
          <span>购买记录</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <UButton 
          variant="ghost" 
          color="red" 
          block
          @click="handleLogout"
          icon="i-heroicons-arrow-right-on-rectangle"
        >
          退出登录
        </UButton>
      </div>
    </aside>

    <!-- 主容器 -->
    <div class="main-container">
      <!-- 顶部状态栏 -->
      <header class="user-header">
        <div class="header-content">
          <!-- 移动端菜单按钮 -->
          <UButton
            class="mobile-menu-btn"
            color="gray"
            variant="ghost"
            icon="i-heroicons-bars-3"
            @click="toggleMobileMenu"
          />

          <!-- 左侧用户信息 -->
          <div class="user-info">
            <div class="avatar">
              {{ userInitial }}
            </div>
                      <div class="user-details">
            <h3>{{ userDisplayName }}</h3>
            <p class="user-balance">
              <img src="/platform-coin.svg" alt="平台币" class="header-coin-icon" />
              {{ formatBalance(userBalance) }}
            </p>
          </div>
          </div>
        </div>
      </header>

      <!-- 主要内容区 -->
      <main class="user-main">
        <div class="content-wrapper">
          <NuxtPage />
        </div>
      </main>
    </div>

    <!-- 移动端底部导航栏 -->
    <nav class="bottom-nav">
      <NuxtLink 
        to="/user/home" 
        class="nav-item"
        :class="{ 'active': $route.path === '/user/home' }"
      >
        <UIcon name="i-heroicons-home" class="nav-icon" />
        <span class="nav-label">首页</span>
      </NuxtLink>

      <NuxtLink 
        to="/user/cashier" 
        class="nav-item"
        :class="{ 'active': $route.path === '/user/cashier' }"
      >
        <UIcon name="i-heroicons-banknotes" class="nav-icon" />
        <span class="nav-label">充值</span>
      </NuxtLink>

      <NuxtLink 
        to="/user/mall" 
        class="nav-item"
        :class="{ 'active': $route.path === '/user/mall' }"
      >
        <UIcon name="i-heroicons-gift" class="nav-icon" />
        <span class="nav-label">商城</span>
      </NuxtLink>

      <NuxtLink 
        to="/user/orders" 
        class="nav-item"
        :class="{ 'active': $route.path === '/user/orders' }"
      >
        <UIcon name="i-heroicons-shopping-bag" class="nav-icon" />
        <span class="nav-label">购买记录</span>
      </NuxtLink>
    </nav>

    <!-- 移动端侧边菜单遮罩 -->
    <div v-if="mobileMenuOpen" class="mobile-menu-overlay" @click="closeMobileMenu">
      <div class="mobile-menu" @click.stop>
        <div class="mobile-menu-header">
          <h3>用户菜单</h3>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="closeMobileMenu"
          />
        </div>
        <div class="mobile-menu-content">
          <NuxtLink 
            v-for="item in mobileMenuItems" 
            :key="item.to"
            :to="item.to" 
            class="mobile-menu-item"
            :class="{ 'active': $route.path === item.to }"
            @click="closeMobileMenu"
          >
            <UIcon :name="item.icon" class="menu-icon" />
            <span>{{ item.label }}</span>
          </NuxtLink>
          
          <div class="mobile-menu-separator"></div>
          
          <button class="mobile-menu-item logout-btn" @click="handleLogout">
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="menu-icon" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/store/auth';

const router = useRouter();
const authStore = useAuthStore();

// 移动端菜单状态
const mobileMenuOpen = ref(false);

// 用户显示名称
const userDisplayName = computed(() => {
  return authStore.userInfo?.username || authStore.name || '用户';
});

// 用户头像首字母
const userInitial = computed(() => {
  const name = userDisplayName.value;
  return name ? name.charAt(0).toUpperCase() : 'U';
});

// 用户余额
const userBalance = computed(() => {
  return authStore.userInfo?.platform_coins || 0;
});

// 格式化余额显示
const formatBalance = (amount) => {
  return Math.floor(Number(amount || 0)).toString();
};

// 移动端菜单项
const mobileMenuItems = computed(() => [
  {
    to: '/user/home',
    label: '首页',
    icon: 'i-heroicons-home'
  },
  {
    to: '/user/cashier',
    label: '充值收银台',
    icon: 'i-heroicons-banknotes'
  },
  {
    to: '/user/recharge',
    label: '充值记录',
    icon: 'i-heroicons-credit-card'
  },
  {
    to: '/user/mall',
    label: '礼包商城',
    icon: 'i-heroicons-gift'
  },
  {
    to: '/user/orders',
    label: '购买记录',
    icon: 'i-heroicons-shopping-bag'
  }
]);

// 移动端菜单控制
const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};

// 退出登录
const handleLogout = () => {
  authStore.logOut();
  closeMobileMenu();
};
</script>

<style scoped>
.user-layout {
  @apply min-h-screen bg-gray-50;
  /* 确保在移动端占满屏幕 */
  min-height: 100vh;
  min-height: 100dvh; /* 动态视口高度，移动端更准确 */
  display: flex;
}

/* ==================== PC端侧边栏 ==================== */
.pc-sidebar {
  @apply bg-white border-r border-gray-200 flex flex-col;
  width: 256px;
  min-height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 30;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
}

.sidebar-header {
  @apply p-6 border-b border-gray-200;
}

.logo {
  @apply flex items-center gap-3;
}

.logo-icon {
  @apply w-8 h-8 text-blue-600;
}

.logo-text {
  @apply text-lg font-bold text-gray-900;
}

.sidebar-nav {
  @apply flex-1 p-4 space-y-2;
}

.sidebar-nav-item {
  @apply flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-all duration-200;
  text-decoration: none;
}

.sidebar-nav-item.active {
  @apply bg-blue-50 text-blue-600 font-medium;
}

.sidebar-nav-item .nav-icon {
  @apply w-5 h-5 flex-shrink-0;
}

.sidebar-footer {
  @apply p-4 border-t border-gray-200;
}

/* ==================== 主容器 ==================== */
.main-container {
  @apply flex flex-col flex-1;
  margin-left: 256px; /* PC端为侧边栏留出空间 */
}

/* 顶部状态栏 */
.user-header {
  @apply bg-white border-b border-gray-200 sticky top-0 z-40;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.header-content {
  @apply flex items-center px-4 py-3;
  max-width: 100%;
}

/* 移动端菜单按钮（仅移动端显示） */
.mobile-menu-btn {
  @apply hidden;
}

.user-info {
  @apply flex items-center gap-3 flex-1 min-w-0;
}

.avatar {
  @apply w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0;
}

.user-details {
  @apply min-w-0 flex-1;
}

.user-details h3 {
  @apply text-sm font-semibold text-gray-900 truncate;
}

.user-details p {
  @apply text-xs text-gray-600 mt-0.5;
}

.user-balance {
  @apply flex items-center gap-1;
}

.header-coin-icon {
  @apply w-3 h-3 flex-shrink-0;
}



/* 主要内容区 */
.user-main {
  @apply flex-1 overflow-y-auto;
}

.content-wrapper {
  @apply p-6 max-w-6xl mx-auto;
}

/* ==================== 移动端底部导航栏 ==================== */
.bottom-nav {
  @apply fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around z-40;
  height: 70px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
  /* iOS安全区域适配 */
  padding-bottom: env(safe-area-inset-bottom);
  display: none; /* PC端隐藏 */
}

.nav-item {
  @apply flex flex-col items-center justify-center py-2 px-3 rounded-lg transition-all duration-200 min-w-0 flex-1;
  text-decoration: none;
}

.nav-item:hover {
  @apply bg-gray-50;
}

.nav-item.active {
  @apply text-blue-600 bg-blue-50;
}

.nav-icon {
  @apply w-5 h-5 mb-1 flex-shrink-0;
}

.nav-label {
  @apply text-xs font-medium truncate max-w-full;
}

/* ==================== 移动端侧边菜单 ==================== */
.mobile-menu-overlay {
  @apply fixed inset-0 bg-black bg-opacity-50 z-50;
  display: none;
}

.mobile-menu {
  @apply bg-white rounded-t-3xl;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 80vh;
  overflow-y: auto;
}

.mobile-menu-header {
  @apply flex items-center justify-between p-4 border-b border-gray-200;
}

.mobile-menu-header h3 {
  @apply text-lg font-semibold text-gray-900;
}

.mobile-menu-content {
  @apply p-4;
}

.mobile-menu-item {
  @apply flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-all duration-200 w-full;
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
}

.mobile-menu-item.active {
  @apply bg-blue-50 text-blue-600;
}

.mobile-menu-item.logout-btn {
  @apply text-red-600 hover:bg-red-50;
}

.mobile-menu-item .menu-icon {
  @apply w-5 h-5 flex-shrink-0;
}

.mobile-menu-separator {
  @apply h-px bg-gray-200 my-2;
}

/* ==================== 响应式适配 ==================== */

/* 平板尺寸 */
@media (max-width: 1024px) {
  .pc-sidebar {
    width: 220px;
  }
  
  .main-container {
    margin-left: 220px;
  }
  
  .content-wrapper {
    @apply p-4;
  }
}

/* 移动端尺寸 */
@media (max-width: 768px) {
  .user-layout {
    @apply flex-col;
  }
  
  /* 隐藏PC端侧边栏 */
  .pc-sidebar {
    @apply hidden;
  }
  
  /* 隐藏移动端顶部状态栏 */
  .user-header {
    @apply hidden;
  }
  
  /* 显示移动端菜单按钮 */
  .mobile-menu-btn {
    @apply block;
  }
  
  /* 显示移动端底部导航 */
  .bottom-nav {
    @apply flex;
  }
  
  /* 显示移动端侧边菜单 */
  .mobile-menu-overlay {
    @apply block;
  }
  
  .main-container {
    margin-left: 0;
  }
  
  .user-main {
    /* 为底部导航留出空间，移动端没有顶部状态栏 */
    padding-bottom: 80px;
    padding-top: 0;
  }
  
  .content-wrapper {
    @apply p-4;
    /* 移动端内容区域顶部需要一些间距 */
    padding-top: 16px;
  }
}

/* 小屏手机 */
@media (max-width: 480px) {  
  .nav-label {
    @apply text-xs;
  }
  
  .nav-icon {
    @apply w-4 h-4;
  }
  
  .content-wrapper {
    @apply p-3;
    /* 小屏设备顶部间距 */
    padding-top: 12px;
  }
}

/* 横屏适配 */
@media (orientation: landscape) and (max-height: 500px) and (max-width: 768px) {
  .bottom-nav {
    height: 60px;
  }
  
  .user-main {
    padding-bottom: 60px;
  }
  
  .nav-item {
    @apply py-1;
  }
  
  .nav-label {
    @apply hidden;
  }
  
  .nav-icon {
    @apply mb-0;
  }
}

/* ==================== 深色模式适配 ==================== */
@media (prefers-color-scheme: dark) {
  .user-layout {
    @apply bg-gray-900;
  }
  
  .pc-sidebar,
  .user-header,
  .bottom-nav {
    @apply bg-gray-800 border-gray-700;
  }
  
  .logo-text,
  .user-details h3 {
    @apply text-white;
  }
  
  .user-details p {
    @apply text-gray-300;
  }
  
  .sidebar-nav-item {
    @apply text-gray-300 hover:bg-gray-700 hover:text-blue-400;
  }
  
  .sidebar-nav-item.active {
    @apply bg-gray-700 text-blue-400;
  }
  
  .nav-item:hover {
    @apply bg-gray-700;
  }
  
  .nav-item.active {
    @apply text-blue-400 bg-gray-700;
  }
  
  .mobile-menu {
    @apply bg-gray-800;
  }
  
  .mobile-menu-item {
    @apply text-gray-300 hover:bg-gray-700;
  }
  
  .mobile-menu-item.active {
    @apply bg-gray-700 text-blue-400;
  }
}

/* ==================== 高对比度适配 ==================== */
@media (prefers-contrast: high) {
  .pc-sidebar,
  .user-header,
  .bottom-nav {
    @apply border-2 border-gray-900;
  }
  
  .sidebar-nav-item.active,
  .nav-item.active {
    @apply bg-blue-600 text-white;
  }
}

/* ==================== 减少动画效果 ==================== */
@media (prefers-reduced-motion: reduce) {
  .sidebar-nav-item,
  .nav-item,
  .mobile-menu-item {
    @apply transition-none;
  }
}

/* ==================== PWA适配 ==================== */
@media (display-mode: standalone) {
  .user-layout {
    @apply bg-white;
  }
  
  .user-header {
    padding-top: env(safe-area-inset-top);
  }
  
  .pc-sidebar {
    padding-top: env(safe-area-inset-top);
  }
}
</style> 