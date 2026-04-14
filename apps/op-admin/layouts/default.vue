<!-- layouts/default.vue -->
<template>
  <div class="layout">
    <!-- 移动端菜单按钮 -->
    <div class="mobile-menu-toggle" v-if="isMobile">
      <UButton
        @click="toggleSidebar"
        variant="ghost"
        color="gray"
        size="sm"
        :ui="{ rounded: 'rounded-full' }"
        class="menu-btn"
      >
        <UIcon :name="sidebarCollapsed ? 'i-heroicons-bars-3' : 'i-heroicons-x-mark'" class="w-5 h-5" />
      </UButton>
    </div>

    <!-- 侧边栏遮罩层（移动端） -->
    <div 
      v-if="isMobile && !sidebarCollapsed" 
      class="sidebar-overlay"
      @click="closeSidebar"
    ></div>

    <!-- 侧边栏 -->
    <aside :class="sidebarWrapperClass">
      <Sidebar :collapsed="sidebarCollapsed" />
    </aside>

    <!-- 主要内容区域 -->
    <div :class="mainWrapperClass">
      <!-- 顶部导航栏 -->
      <header class="top-header">
        <!-- 移动端专用头部行 -->
        <div class="mobile-header-row" v-if="isMobile">
          <!-- 侧边栏按钮 -->
          <div class="mobile-menu-toggle">
            <UButton
              @click="toggleSidebar"
              variant="ghost"
              color="gray"
              size="sm"
              :ui="{ rounded: 'rounded-full' }"
              class="menu-btn"
            >
              <UIcon :name="sidebarCollapsed ? 'i-heroicons-bars-3' : 'i-heroicons-x-mark'" class="w-5 h-5" />
            </UButton>
          </div>
          <!-- 面包屑 -->
          <div class="breadcrumb-section">
            <UBreadcrumb :links="breadcrumbLinks" />
          </div>
          <!-- 用户头像 -->
          <div class="mobile-avatar">
            <UDropdown :items="userMenuItems" :popper="{ placement: 'bottom-end' }">
              <UAvatar 
                :alt="userDisplayName"
                size="sm"
                :ui="{ background: 'bg-primary-500 dark:bg-primary-400' }"
                class="cursor-pointer"
              />
            </UDropdown>
          </div>
        </div>
        <!-- 桌面端头部行 -->
        <template v-else>
          <div class="header-left">
            <UButton
              v-if="!isMobile"
              @click="toggleSidebar"
              variant="ghost"
              color="gray"
              size="sm"
              class="collapse-btn"
            >
              <UIcon :name="sidebarCollapsed ? 'i-heroicons-bars-3' : 'i-heroicons-chevron-left'" class="w-4 h-4" />
            </UButton>
            <div class="breadcrumb-section">
              <UBreadcrumb :links="breadcrumbLinks" />
            </div>
          </div>
          <div class="header-actions">
            <UDropdown :items="userMenuItems" :popper="{ placement: 'bottom-end' }">
              <UAvatar 
                :alt="userDisplayName"
                size="sm"
                :ui="{ background: 'bg-primary-500 dark:bg-primary-400' }"
                class="cursor-pointer"
              />
            </UDropdown>
          </div>
        </template>
      </header>

      <!-- 页面内容 -->
      <main class="page-content">
        <NuxtPage />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Sidebar from '~/components/Sidebar.vue';
import { useAuthStore } from '~/store/auth';
import { useAuthTimer } from '~/composables/useAuthTimer';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { remainingTime } = useAuthTimer();

// 响应式状态
const isMobile = ref(false);
const sidebarCollapsed = ref(false);

// 检查是否为移动设备
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
  if (isMobile.value) {
    sidebarCollapsed.value = true;
  }
};

// 切换侧边栏
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

// 关闭侧边栏
const closeSidebar = () => {
  if (isMobile.value) {
    sidebarCollapsed.value = true;
  }
};

// 移动端点击链接后自动关闭侧边栏
const handleLinkClick = () => {
  if (isMobile.value && !sidebarCollapsed.value) {
    setTimeout(() => {
      sidebarCollapsed.value = true;
    }, 150); // 快速关闭
  }
};

// 监听窗口大小变化
const handleResize = () => {
  checkMobile();
};

// 触摸手势支持
let touchStartX = 0;
let touchEndX = 0;

const handleTouchStart = (e) => {
  if (!isMobile.value) return;
  touchStartX = e.changedTouches[0].screenX;
};

const handleTouchEnd = (e) => {
  if (!isMobile.value) return;
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
};

const handleSwipe = () => {
  const swipeDistance = touchEndX - touchStartX;
  const minSwipeDistance = 50;
  
  if (swipeDistance > minSwipeDistance && sidebarCollapsed.value) {
    // 右滑打开侧边栏
    sidebarCollapsed.value = false;
  } else if (swipeDistance < -minSwipeDistance && !sidebarCollapsed.value) {
    // 左滑关闭侧边栏
    sidebarCollapsed.value = true;
  }
};

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', handleResize);
  document.addEventListener('closeSidebar', handleLinkClick);
  if (isMobile.value) {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('closeSidebar', handleLinkClick);
  document.removeEventListener('touchstart', handleTouchStart);
  document.removeEventListener('touchend', handleTouchEnd);
});

// 计算侧边栏包装器样式
const sidebarWrapperClass = computed(() => {
  const baseClass = 'sidebar-wrapper';
  if (isMobile.value) {
    return `${baseClass} ${sidebarCollapsed.value ? 'sidebar-hidden' : 'sidebar-visible'}`;
  }
  return `${baseClass} ${sidebarCollapsed.value ? 'sidebar-collapsed' : ''}`;
});

// 计算主内容区域样式
const mainWrapperClass = computed(() => {
  const baseClass = 'main-wrapper';
  if (isMobile.value) {
    return `${baseClass} main-mobile`;
  }
  return `${baseClass} ${sidebarCollapsed.value ? 'main-collapsed' : ''}`;
});

// 面包屑配置
const breadcrumbLinks = computed(() => {
  const links = [{
    label: '首页',
    icon: 'i-heroicons-home',
    to: '/home'
  }];

  const pathSegments = route.path.split('/').filter(Boolean);
  
  // 根据路径构建面包屑
  if (pathSegments[0] === 'data') {
    links.push({
      label: '数据报表',
      icon: 'i-heroicons-chart-bar'
    });
    
    const dataPageMap = {
      'overview-data': '数据概览',
      'daily-data': '日报数据',
      'ltv-data': 'LTV数据',
      'channel-data': '渠道数据',
      'user-register-data': '用户注册数据',
      'role-data': '角色数据',
      'payment-data': '支付数据',
      'login-data': '登录数据',
      'channel-settlement-data': '渠道结算数据'
    };

    if (pathSegments[1] && dataPageMap[pathSegments[1]]) {
      links.push({
        label: dataPageMap[pathSegments[1]],
        icon: 'i-heroicons-document-chart-bar'
      });
    }
  } else if (route.path === '/promoter-info') {
    links.push({
      label: '代理',
      icon: 'i-heroicons-user-group'
    }, {
      label: '代理信息',
      icon: 'i-heroicons-user'
    });
  } else if (route.path === '/service') {
    links.push({
      label: '代理',
      icon: 'i-heroicons-user-group'
    }, {
      label: '修改客服',
      icon: 'i-heroicons-chat-bubble-left-right'
    });
  } else if (route.path === '/game-list') {
    links.push({
      label: '游戏管理',
      icon: 'i-heroicons-puzzle-piece'
    }, {
      label: '游戏列表',
      icon: 'i-heroicons-list-bullet'
    });
  } else if (route.path === '/channel-list') {
    links.push({
      label: '渠道管理',
      icon: 'i-heroicons-megaphone'
    }, {
      label: '代理列表',
      icon: 'i-heroicons-list-bullet'
    });
  } else if (route.path.includes('/admin/operation/')) {
    links.push({
      label: '运营管理',
      icon: 'i-heroicons-cog-6-tooth'
    });
    
    if (route.path.includes('game-permissions')) {
      links.push({
        label: '游戏授权',
        icon: 'i-heroicons-key'
      });
    } else if (route.path.includes('platform-coin-admin')) {
      links.push({
        label: '代理平台币',
        icon: 'i-heroicons-banknotes'
      });
    } else if (route.path.includes('platform-coin-player')) {
      links.push({
        label: '玩家发放',
        icon: 'i-heroicons-gift'
      });
    } else if (route.path.includes('payment-settings')) {
      links.push({
        label: '支付管理',
        icon: 'i-heroicons-credit-card'
      });
    } else if (route.path.includes('system-params')) {
      links.push({
        label: '系统参数',
        icon: 'i-heroicons-cog-8-tooth'
      });
    } else if (route.path.includes('settlement-submit')) {
      links.push({
        label: '结算提交',
        icon: 'i-heroicons-document-plus'
      });
    } else if (route.path.includes('settlement-manage')) {
      links.push({
        label: '结算管理',
        icon: 'i-heroicons-clipboard-document-check'
      });
    }
  }

  return links;
});

// 用户显示名称
const userDisplayName = computed(() => {
  if (authStore.isUser) {
    return '用户';
  }
  return '管理员';
});

// 用户菜单项
const userMenuItems = computed(() => [
  [{
    label: userDisplayName.value,
    slot: 'account',
    disabled: true
  }], [{
    label: '登录状态: 是',
    icon: 'i-heroicons-check-circle',
    disabled: true
  }, {
    label: `用户类型: ${authStore.isUser ? '用户' : '管理员'}`,
    icon: 'i-heroicons-user',
    disabled: true
  }, {
    label: `权限级别: ${authStore.userInfo?.level || 0}`,
    icon: 'i-heroicons-shield-check',
    disabled: true
  }, {
    label: '运营权限: 有',
    icon: 'i-heroicons-cog-6-tooth',
    disabled: true
  }, {
    label: '超管权限: 有',
    icon: 'i-heroicons-crown',
    disabled: true
  }], [{
    label: '退出登录',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    click: () => {
      authStore.logOut();
      router.push('/admin/login');
    }
  }]
]);
</script>

<style scoped>
.layout {
  @apply flex h-screen bg-gray-50 relative;
  overflow-x: hidden;
}

/* 移动端菜单按钮 */
.mobile-menu-toggle {
  @apply fixed top-4 left-4 z-50;
}

.menu-btn {
  @apply bg-white shadow-lg border border-gray-200;
}

/* 侧边栏遮罩层 */
.sidebar-overlay {
  @apply fixed inset-0 bg-black bg-opacity-50 z-40;
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 侧边栏容器 */
.sidebar-wrapper {
  @apply flex-shrink-0 z-50;
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  transition: transform 0.2s ease-in-out;
}

/* 桌面端侧边栏收起状态 */
.sidebar-wrapper.sidebar-collapsed {
  transform: translateX(-256px);
}

/* 移动端侧边栏隐藏状态 */
.sidebar-wrapper.sidebar-hidden {
  transform: translateX(-100%);
}

/* 移动端侧边栏显示状态 */
.sidebar-wrapper.sidebar-visible {
  transform: translateX(0);
}

/* 主内容容器 */
.main-wrapper {
  @apply flex flex-col flex-1;
  margin-left: 256px;
  transition: margin-left 0.2s ease-in-out;
}

/* 桌面端主内容区域收起状态 */
.main-wrapper.main-collapsed {
  margin-left: 0;
}

/* 移动端主内容区域 */
.main-wrapper.main-mobile {
  margin-left: 0;
  width: 100%;
}

/* 顶部导航栏 */
.top-header {
  @apply flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 z-20;
  height: 80px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-left {
  @apply flex items-center gap-3 flex-1;
}

.collapse-btn {
  @apply p-2 rounded-lg hover:bg-gray-100;
}

.breadcrumb-section {
  @apply flex-1;
}

.header-actions {
  @apply flex items-center gap-4;
}

.time-badge {
  @apply font-medium;
}

/* 页面内容区域 */
.page-content {
  @apply flex-1 p-6 overflow-y-auto;
  height: calc(100vh - 70px);
}

/* 全局移动端表格横向滚动支持 */
.mobile-table-wrapper,
.table-scroll-container {
  width: 100%;
}

@media (max-width: 768px) {
  .mobile-table-wrapper,
  .table-scroll-container {
    overflow-x: auto !important;
    width: 100% !important;
    -webkit-overflow-scrolling: touch;
  }
  
  .mobile-table-wrapper table,
  .table-scroll-container table {
    min-width: 800px !important;
    width: max-content !important;
  }
}

/* 滚动条样式 */
.page-content::-webkit-scrollbar {
  @apply w-2;
}

.page-content::-webkit-scrollbar-track {
  @apply bg-gray-50;
}

.page-content::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded-full;
}

.page-content::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .top-header {
    @apply px-4;
  }
  
  .page-content {
    @apply p-4;
  }
}

@media (max-width: 768px) {
  .top-header {
    display: flex;
    align-items: center;
    height: 60px;
    padding: 0 8px;
    background: #fff;
    border-bottom: 1px solid #eee;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .mobile-header-row {
    display: flex !important;
    align-items: center;
    width: 100%;
  }
  .mobile-menu-toggle {
    flex: 0 0 auto;
    margin-right: 4px;
  }
  .breadcrumb-section {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .breadcrumb-section .ubreadcrumb {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
  .mobile-avatar {
    flex: 0 0 auto;
    margin-left: 4px;
    display: flex;
    align-items: center;
  }
  .header-left, .header-actions {
    display: none !important;
  }
}
@media (min-width: 769px) {
  .mobile-header-row {
    display: none !important;
  }
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .layout {
    @apply bg-gray-900;
  }
  
  .top-header {
    @apply bg-gray-800 border-gray-700;
  }
  
  .page-content {
    @apply bg-gray-900;
  }
}

/* 高对比度适配 */
@media (prefers-contrast: high) {
  .top-header {
    @apply border-b-2 border-gray-900;
  }
}

/* 减少动画效果（用户偏好） */
@media (prefers-reduced-motion: reduce) {
  * {
    @apply transition-none;
  }
}
</style>
