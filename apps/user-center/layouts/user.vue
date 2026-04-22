<!-- layouts/user.vue - DESIGN.md 暖色风格布局 -->
<template>
  <div class="user-layout">
    <!-- PC端侧边栏 -->
    <aside class="pc-sidebar">
      <div class="sidebar-brand">
        <div class="brand-logo">
          <img src="/logo-warm.svg" alt="logo" class="brand-icon" />
        </div>
        <span class="brand-name">会员中心</span>
      </div>

      <!-- 用户信息卡片 -->
      <div class="sidebar-user-card">
        <div class="user-avatar">{{ userInitial }}</div>
        <div class="user-meta">
          <p class="user-name">{{ userDisplayName }}</p>
          <div class="user-balance-row">
            <img src="/logo-warm.svg" alt="coin" class="coin-sm" />
            <span class="user-coins">{{ formatBalance(userBalance) }}</span>
          </div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <NuxtLink to="/user/home" class="sn-item" :class="{ active: $route.path === '/user/home' }">
          <span class="sn-icon">🏠</span>
          <span>首页</span>
        </NuxtLink>
        <NuxtLink to="/user/cashier" class="sn-item" :class="{ active: $route.path === '/user/cashier' }">
          <span class="sn-icon">💳</span>
          <span>充值</span>
        </NuxtLink>
        <NuxtLink to="/user/recharge" class="sn-item" :class="{ active: $route.path === '/user/recharge' }">
          <span class="sn-icon">📋</span>
          <span>充值记录</span>
        </NuxtLink>
        <NuxtLink to="/user/mall" class="sn-item" :class="{ active: $route.path === '/user/mall' }">
          <span class="sn-icon">🎁</span>
          <span>礼包商城</span>
        </NuxtLink>
        <NuxtLink to="/user/orders" class="sn-item" :class="{ active: $route.path === '/user/orders' }">
          <span class="sn-icon">📦</span>
          <span>购买记录</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-bottom">
        <button class="logout-btn" @click="handleLogout">
          <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>

    <!-- 主容器 -->
    <div class="main-wrap">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <div class="top-bar-left">
          <button class="mobile-menu-btn" @click="toggleMobileMenu">
            <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
          </button>
          <span class="top-title">{{ pageTitle }}</span>
        </div>
        <div class="top-bar-right">
          <div class="balance-chip">
            <img src="/logo-warm.svg" alt="coin" class="chip-coin" />
            <span>{{ formatBalance(userBalance) }}</span>
          </div>
          <div class="top-avatar">{{ userInitial }}</div>
        </div>
      </header>

      <!-- 内容区 -->
      <main class="main-content">
        <NuxtPage />
      </main>
    </div>

    <!-- 移动底部导航 -->
    <nav class="bottom-nav">
      <NuxtLink to="/user/home" class="bn-item" :class="{ active: $route.path === '/user/home' }">
        <span class="bn-icon">🏠</span>
        <span class="bn-label">首页</span>
      </NuxtLink>
      <NuxtLink to="/user/cashier" class="bn-item" :class="{ active: $route.path === '/user/cashier' }">
        <span class="bn-icon">💳</span>
        <span class="bn-label">充值</span>
      </NuxtLink>
      <NuxtLink to="/user/mall" class="bn-item bn-center" :class="{ active: $route.path === '/user/mall' }">
        <span class="bn-icon-center">🎁</span>
        <span class="bn-label">商城</span>
      </NuxtLink>
      <NuxtLink to="/user/orders" class="bn-item" :class="{ active: $route.path === '/user/orders' }">
        <span class="bn-icon">📦</span>
        <span class="bn-label">记录</span>
      </NuxtLink>
      <NuxtLink to="/user/profile" class="bn-item" :class="{ active: $route.path === '/user/profile' }">
        <span class="bn-icon">👤</span>
        <span class="bn-label">我的</span>
      </NuxtLink>
    </nav>

    <!-- 移动端菜单抽屉 -->
    <Transition name="drawer">
      <div v-if="mobileMenuOpen" class="drawer-overlay" @click="closeMobileMenu">
        <div class="drawer" @click.stop>
          <div class="drawer-header">
            <div class="drawer-user">
              <div class="drawer-avatar">{{ userInitial }}</div>
              <div>
                <p class="drawer-name">{{ userDisplayName }}</p>
                <div class="drawer-coins">
                  <img src="/logo-warm.svg" alt="coin" class="coin-sm" />
                  <span>{{ formatBalance(userBalance) }}</span>
                </div>
              </div>
            </div>
            <button class="drawer-close" @click="closeMobileMenu">
              <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
            </button>
          </div>
          <div class="drawer-body">
            <NuxtLink v-for="item in menuItems" :key="item.to" :to="item.to"
              class="drawer-item" :class="{ active: $route.path === item.to }"
              @click="closeMobileMenu">
              <span>{{ item.emoji }}</span>
              <span>{{ item.label }}</span>
            </NuxtLink>
            <div class="drawer-sep"></div>
            <button class="drawer-item danger" @click="handleLogout">
              <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '~/store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const mobileMenuOpen = ref(false);

const userDisplayName = computed(() => authStore.userInfo?.username || authStore.name || '用户');
const userInitial = computed(() => userDisplayName.value.charAt(0).toUpperCase() || 'U');
const userBalance = computed(() => authStore.userInfo?.platform_coins || 0);
const formatBalance = (v) => Math.floor(Number(v || 0)).toString();

const pageTitles = {
  '/user/home': '首页',
  '/user/cashier': '充值收银台',
  '/user/recharge': '充值记录',
  '/user/mall': '礼包商城',
  '/user/orders': '购买记录',
  '/user/profile': '个人资料',
};
const pageTitle = computed(() => pageTitles[route.path] || '会员中心');

const menuItems = [
  { to: '/user/home', label: '首页', emoji: '🏠' },
  { to: '/user/cashier', label: '充值收银台', emoji: '💳' },
  { to: '/user/recharge', label: '充值记录', emoji: '📋' },
  { to: '/user/mall', label: '礼包商城', emoji: '🎁' },
  { to: '/user/orders', label: '购买记录', emoji: '📦' },
  { to: '/user/profile', label: '个人资料', emoji: '👤' },
];

const toggleMobileMenu = () => { mobileMenuOpen.value = !mobileMenuOpen.value; };
const closeMobileMenu = () => { mobileMenuOpen.value = false; };
const handleLogout = () => { authStore.logOut(); closeMobileMenu(); };
</script>

<style scoped>
/* ============ 基础布局 ============ */
.user-layout {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--surface);
  color: var(--on-surface);
  font-family: var(--font-family);
}

/* ============ PC 侧边栏 ============ */
.pc-sidebar {
  width: 240px;
  min-height: 100vh;
  background: var(--surface-container-low);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0; top: 0; bottom: 0;
  z-index: 30;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 20px 20px;
}

.brand-icon { width: 32px; height: 32px; }
.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.sidebar-user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 12px 16px;
  padding: 14px;
  background: var(--surface-container);
  border-radius: var(--radius-md);
}

.user-avatar {
  width: 42px; height: 42px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700; color: var(--on-primary);
  flex-shrink: 0;
}

.user-name { font-size: 14px; font-weight: 600; color: var(--on-surface); margin: 0 0 4px; }
.user-balance-row { display: flex; align-items: center; gap: 4px; }
.coin-sm { width: 14px; height: 14px; }
.user-coins { font-size: 13px; color: var(--primary); font-weight: 600; }

.sidebar-nav {
  flex: 1;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sn-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  color: var(--on-surface-variant);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all var(--transition);
}
.sn-item:hover { background: var(--surface-container); color: var(--on-surface); }
.sn-item.active {
  background: var(--primary-container);
  color: var(--primary);
  font-weight: 600;
}
.sn-icon { font-size: 18px; }

.sidebar-bottom { padding: 12px; }
.logout-btn {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; border-radius: var(--radius-sm);
  background: transparent; color: var(--error);
  border: none;
  font-size: 14px; cursor: pointer;
  transition: all var(--transition);
  font-family: var(--font-family);
}
.logout-btn:hover { background: var(--error-container); }

/* ============ 主区域 ============ */
.main-wrap {
  flex: 1;
  margin-left: 240px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  background: var(--surface-container-low);
  box-shadow: 0 1px 0 var(--outline-variant);
  position: sticky; top: 0; z-index: 20;
}

.top-bar-left { display: flex; align-items: center; gap: 12px; }
.mobile-menu-btn {
  display: none;
  background: none; border: none; color: var(--on-surface);
  cursor: pointer; padding: 6px;
  border-radius: 8px;
}
.top-title { font-size: 16px; font-weight: 600; color: var(--on-surface); }

.top-bar-right { display: flex; align-items: center; gap: 12px; }

.balance-chip {
  display: flex; align-items: center; gap: 6px;
  background: var(--surface-container);
  border-radius: var(--radius-xl);
  padding: 6px 14px;
  font-size: 14px; font-weight: 600; color: var(--primary);
}
.chip-coin { width: 16px; height: 16px; }

.top-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: var(--on-primary);
}

.main-content {
  flex: 1;
  padding: 24px;
  max-width: 1100px;
  width: 100%;
  box-sizing: border-box;
}

/* ============ 底部导航（移动端） ============ */
.bottom-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  height: 68px;
  background: var(--surface-container-low);
  box-shadow: 0 -1px 0 var(--outline-variant);
  z-index: 40;
  padding-bottom: env(safe-area-inset-bottom);
  align-items: center;
  justify-content: space-around;
}

.bn-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 2px; padding: 6px 12px;
  text-decoration: none;
  color: var(--on-surface-variant);
  transition: all var(--transition);
  border-radius: var(--radius-sm);
  flex: 1;
}
.bn-item.active { color: var(--primary); }
.bn-icon { font-size: 20px; }
.bn-label { font-size: 10px; font-weight: 500; }

.bn-center {
  position: relative;
  flex: 1.2;
}
.bn-icon-center {
  font-size: 22px;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  width: 44px; height: 44px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(168,50,6,0.25);
  margin-top: -16px;
}

/* ============ 抽屉 ============ */
.drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(78,33,32,0.3);
  backdrop-filter: blur(4px);
  z-index: 50;
  display: flex;
}

.drawer {
  width: 280px;
  background: var(--surface-container-low);
  height: 100%;
  display: flex; flex-direction: column;
}

.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 16px;
}

.drawer-user { display: flex; align-items: center; gap: 12px; }
.drawer-avatar {
  width: 44px; height: 44px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700; color: var(--on-primary);
}

.drawer-name { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
.drawer-coins { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--primary); font-weight: 600; }
.drawer-close {
  background: var(--surface-container);
  border: none;
  border-radius: 8px; padding: 6px; color: var(--on-surface-variant);
  cursor: pointer;
}

.drawer-body { flex: 1; padding: 12px; overflow-y: auto; }

.drawer-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px; border-radius: var(--radius-sm);
  color: var(--on-surface-variant); text-decoration: none;
  font-size: 15px; font-weight: 500;
  transition: all var(--transition);
  width: 100%; background: none; border: none; cursor: pointer;
  margin-bottom: 4px;
  font-family: var(--font-family);
}
.drawer-item:hover { background: var(--surface-container); color: var(--on-surface); }
.drawer-item.active { background: var(--primary-container); color: var(--primary); }
.drawer-item.danger { color: var(--error); }
.drawer-item.danger:hover { background: var(--error-container); }
.drawer-sep { height: 0; margin: 12px 0; }

/* ============ 动画 ============ */
.drawer-enter-active, .drawer-leave-active { transition: opacity 0.25s; }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.25s; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer { transform: translateX(-100%); }
.drawer-leave-to .drawer { transform: translateX(-100%); }

/* ============ 响应式 ============ */
@media (max-width: 768px) {
  .pc-sidebar { display: none; }
  .main-wrap { margin-left: 0; }
  .top-bar { padding: 0 16px; }
  .mobile-menu-btn { display: flex; }
  .balance-chip { display: none; }
  .bottom-nav { display: flex; }
  .main-content {
    padding: 16px 12px;
    padding-bottom: 80px;
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .main-content { padding: 12px 10px; padding-bottom: 80px; }
}
</style>