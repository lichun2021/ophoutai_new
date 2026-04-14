<template>
  <div :class="sidebarContainerClass">
    <!-- Logo 区域 -->
    <div class="sidebar-header">
      <div class="logo-container">
        <img src="/logo.svg" alt="Logo" class="logo" />
        <span v-if="!collapsed" class="brand-name">量子发行</span>
      </div>
      

    </div>

    <!-- 导航菜单 -->
    <div class="sidebar-nav">
      <nav class="nav-menu">
        <!-- 手风琴菜单 -->
        <UAccordion 
          :items="accordionItems" 
          multiple
          :default-open="[0, 1, 2, 3, 4, 5]"
          :ui="accordionUI"
          open-icon="i-heroicons-chevron-right"
          close-icon="i-heroicons-chevron-down"
        >
          <template #home>
            <div class="nav-submenu">
              <UButton 
                :to="'/home'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/home' }"
                class="nav-subitem"
                justify="start"
                size="sm"
                @click="handleNavClick"
              >
                <template #leading>
                  <UIcon name="i-heroicons-chart-pie" class="w-4 h-4" />
                </template>
                概览
              </UButton>
            </div>
          </template>

          <template #promoter>
            <div class="nav-submenu">
              <UButton 
                :to="'/promoter-info'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/promoter-info' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-user" class="w-4 h-4" />
                </template>
                代理信息
              </UButton>
            </div>
          </template>

          <template #report>
            <div class="nav-submenu">
              <UButton 
                :to="'/data/overview-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/overview-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4" />
                </template>
                数据概览
              </UButton>
              
              <UButton 
                :to="'/data/daily-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/daily-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-calendar-days" class="w-4 h-4" />
                </template>
                日报数据
              </UButton>
              
              <UButton 
                :to="'/data/ltv-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/ltv-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-arrow-trending-up" class="w-4 h-4" />
                </template>
                LTV数据
              </UButton>
              
              <UButton 
                :to="'/data/channel-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/channel-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-megaphone" class="w-4 h-4" />
                </template>
                渠道数据
              </UButton>
              
              <UButton 
                :to="'/data/user-register-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/user-register-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-user-plus" class="w-4 h-4" />
                </template>
                注册数据
              </UButton>
              
              <UButton 
                :to="'/data/role-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/role-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-users" class="w-4 h-4" />
                </template>
                角色数据
              </UButton>
              
              <UButton 
                :to="'/data/payment-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/payment-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-credit-card" class="w-4 h-4" />
                </template>
                支付数据
              </UButton>
              
              <UButton 
                :to="'/data/login-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/login-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-key" class="w-4 h-4" />
                </template>
                登录数据
              </UButton>
              
              <UButton 
                :to="'/data/channel-settlement-data'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/data/channel-settlement-data' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-calculator" class="w-4 h-4" />
                </template>
                渠道结算数据
              </UButton>
              
            </div>
          </template>

          <template #game>
            <div class="nav-submenu">
              <UButton 
                :to="'/game-list'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/game-list' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
                </template>
                游戏列表
              </UButton>
            </div>
          </template>

          <template #channel>
            <div class="nav-submenu">
              <UButton 
                :to="'/channel-list'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/channel-list' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
                </template>
                代理列表
              </UButton>
            </div>
          </template>

          <template #operation>
            <div class="nav-submenu">
              <UButton 
                v-if="canAccessOperation"
                :to="'/admin/operation/server-status'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/server-status' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-signal" class="w-4 h-4" />
                </template>
                在线玩家
              </UButton>
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/game-permissions'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/game-permissions' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-key" class="w-4 h-4" />
                </template>
                游戏授权
              </UButton>
              <UButton 
                :to="'/admin/operation/platform-coin-admin'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/platform-coin-admin' }"
                class="nav-subitem"
                justify="start"
                size="sm"
                v-if="isSuperAdmin"
              >
                <template #leading>
                  <UIcon name="i-heroicons-banknotes" class="w-4 h-4" />
                </template>
                代理发放
              </UButton>
              <UButton 
                :to="'/admin/operation/platform-coin-player'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/platform-coin-player' }"
                class="nav-subitem"
                justify="start"
                size="sm"
                v-if="isSuperAdmin"
              >
                <template #leading>
                  <UIcon name="i-heroicons-gift" class="w-4 h-4" />
                </template>
                玩家发放
              </UButton>
              <!-- 支付管理 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/payment-settings'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/payment-settings' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-credit-card" class="w-4 h-4" />
                </template>
                支付管理
              </UButton>
              <!-- 渠道支付数据 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/payment-channel-stats'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/payment-channel-stats' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-chart-bar" class="w-4 h-4" />
                </template>
                渠道支付数据
              </UButton>
              <!-- 支付路由 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/payment-routing'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/payment-routing' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-arrows-right-left" class="w-4 h-4" />
                </template>
                支付路由
              </UButton>
              <!-- 玩家详情 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/player-detail'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/player-detail' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
                </template>
                玩家详情
              </UButton>
              <!-- 系统参数 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/system-params'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/system-params' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-cog-8-tooth" class="w-4 h-4" />
                </template>
                系统参数
              </UButton>
              <!-- 服务器配置 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/game-servers'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/game-servers' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-server-stack" class="w-4 h-4" />
                </template>
                服务器列表
              </UButton>
              <!-- <UButton 
                :to="'/admin/operation/settlement-submit'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/settlement-submit' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-document-plus" class="w-4 h-4" />
                </template>
                结算提交
              </UButton>
              <UButton 
                :to="'/admin/operation/settlement-manage'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/settlement-manage' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-clipboard-document-check" class="w-4 h-4" />
                </template>
                结算管理
              </UButton> -->
              
              <!-- 商城礼包管理 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/gift-packages'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/gift-packages' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-gift" class="w-4 h-4" />
                </template>
                礼包配置
              </UButton>
              
              <!-- 礼包销售统计 - 只有超级管理员可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/gift-package-sales'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/gift-package-sales' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4" />
                </template>
                礼包销售
              </UButton>
              
              <!-- 玩家礼包发放记录 -->
              <UButton
                v-if="isSuperAdmin"
                :to="'/admin/operation/gift-package-records'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/gift-package-records' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
                </template>
                礼包发放
              </UButton>


              
              <!-- CDK 管理 -->
              <UButton 
                :to="'/admin/operation/cdk-management'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/cdk-management' }"
                class="nav-subitem"
                justify="start"
                size="sm"
                v-if="isSuperAdmin"
              >
                <template #leading>
                  <UIcon name="i-heroicons-qr-code" class="w-4 h-4" />
                </template>
                CDK管理
              </UButton>
              
              <!-- 游戏GM管理 - 只有超级管理员和一级代理可见 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/gm-management'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/gm-management' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-command-line" class="w-4 h-4" />
                </template>
                游戏运营
              </UButton>

              <!-- 实际到账查询 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/game-checkorder'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/game-checkorder' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-banknotes" class="w-4 h-4" />
                </template>
                游戏内购
              </UButton>

                            <!-- GM 操作日志 -->
              <UButton 
                v-if="isSuperAdmin"
                :to="'/admin/operation/gm-logs'"
                variant="ghost" 
                color="gray"
                :class="{ 'nav-active': route.path === '/admin/operation/gm-logs' }"
                class="nav-subitem"
                justify="start"
                size="sm"
              >
                <template #leading>
                  <UIcon name="i-heroicons-rectangle-stack" class="w-4 h-4" />
                </template>
                操作日志
              </UButton>
            </div>
          </template>
        </UAccordion>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '~/store/auth';

// 组件属性
const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();
const authStore = useAuthStore();

// 导航点击处理
const handleNavClick = () => {
  // 通过事件通知父组件关闭侧边栏
  if (window.innerWidth < 768) {
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('closeSidebar'));
    }, 100);
  }
};

// 检查是否可以访问运营管理（只有0级）
const canAccessOperation = computed(() => {
  if (!authStore.isLoggedIn || authStore.isUser) {
    return false;
  }
  
  const permissions = authStore.permissions;
  if (!permissions) {
    return false;
  }
  
  // 只有0级（超级管理员）可以访问
  return permissions.level === 0;
});

// 检查是否为超级管理员（只有0级）
const isSuperAdmin = computed(() => {
  if (!authStore.isLoggedIn || authStore.isUser) {
    return false;
  }
  
  const permissions = authStore.permissions;
  if (!permissions) {
    return false;
  }
  
  // 只有0级（超级管理员）可以访问支付管理
  return permissions.level === 0;
});

// 检查是否可以访问GM功能（0级和1级）
const canAccessGM = computed(() => {
  if (!authStore.isLoggedIn || authStore.isUser) {
    return false;
  }
  
  const permissions = authStore.permissions;
  if (!permissions) {
    return false;
  }
  
  // 0级（超级管理员）和1级（一级代理）可以访问GM功能
  return permissions.level === 0 || permissions.level === 1;
});

// 调试信息显示控制
const showDebugInfo = computed(() => {
  // 只在开发环境下显示调试信息
  return process.env.NODE_ENV === 'development';
});

// 计算侧边栏容器样式
const sidebarContainerClass = computed(() => {
  return props.collapsed ? 'sidebar-container sidebar-collapsed' : 'sidebar-container';
});

// 手风琴菜单项配置
const accordionItems = computed(() => {
  const baseItems = [
    {
      label: '首页',
      icon: 'i-heroicons-home',
      slot: 'home',
      defaultOpen: true // 首页默认展开
    },
    {
      label: '代理',
      icon: 'i-heroicons-user-group',
      slot: 'promoter',
      defaultOpen: true // 代理默认展开
    },
    {
      label: '数据报表',
      icon: 'i-heroicons-chart-bar',
      slot: 'report',
      defaultOpen: true // 默认展开数据报表
    },
    {
      label: '游戏管理',
      icon: 'i-heroicons-puzzle-piece',
      slot: 'game',
      defaultOpen: true // 游戏管理默认展开
    },
    {
      label: '渠道管理',
      icon: 'i-heroicons-megaphone',
      slot: 'channel',
      defaultOpen: true // 渠道管理默认展开
    }
  ];

  // 如果有运营管理权限，添加运营管理菜单
  if (canAccessOperation.value) {
    baseItems.push({
      label: '运营管理',
      icon: 'i-heroicons-cog-6-tooth',
      slot: 'operation',
      defaultOpen: true // 运营管理默认展开
    });
  }

  return baseItems;
});

// 手风琴UI配置
const accordionUI = {
  wrapper: 'w-full space-y-1',
  container: 'w-full',
  item: {
    base: '',
    size: 'text-sm',
    color: 'text-gray-500 dark:text-gray-400',
    padding: 'py-1',
    icon: 'ms-auto transform transition-transform duration-200 flex-shrink-0 w-4 h-4'
  },
  default: {
    class: 'w-full rounded-lg nav-item',
    variant: 'ghost',
    color: 'gray',
    size: 'md'
  }
};
</script>

<style scoped>
.sidebar-container {
  @apply w-64 h-full bg-white border-r border-gray-200 flex flex-col;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: width 0.3s ease-in-out;
}

.sidebar-container.sidebar-collapsed {
  @apply w-16;
}

.sidebar-collapsed .brand-name {
  @apply hidden;
}

.sidebar-collapsed .nav-submenu {
  @apply hidden;
}

.sidebar-collapsed .debug-info {
  @apply hidden;
}

.sidebar-header {
  @apply p-6 border-b border-gray-100;
  transition: padding 0.3s ease-in-out;
}

.sidebar-collapsed .sidebar-header {
  @apply p-3;
}

.logo-container {
  @apply flex items-center gap-3;
  transition: justify-content 0.3s ease-in-out;
}

.sidebar-collapsed .logo-container {
  @apply justify-center gap-0;
}

.logo {
  @apply w-8 h-8;
}

.brand-name {
  @apply text-lg font-bold text-gray-900 tracking-tight;
}

.sidebar-nav {
  @apply flex-1 p-4 overflow-y-auto;
}

.nav-menu {
  @apply space-y-1;
}

.nav-item {
  @apply w-full rounded-lg transition-all duration-200;
}

.nav-item:hover {
  @apply transform scale-[1.02];
}

.nav-active {
  @apply bg-primary-50 text-primary-700 shadow-sm;
  background: linear-gradient(135deg, rgb(239 246 255), rgb(219 234 254));
}

.nav-submenu {
  @apply flex flex-col gap-1 py-1 px-3 bg-gray-50/50 rounded-lg border-l-2 border-primary-100;
}

.nav-subitem {
  @apply w-full text-sm rounded-md flex-shrink-0 block;
}

.nav-subitem:hover {
  @apply bg-white shadow-sm transform scale-[1.01];
}

.nav-subitem.nav-active {
  @apply bg-primary-100 text-primary-800 shadow-sm;
}

/* 自定义滚动条 */
.sidebar-nav::-webkit-scrollbar {
  @apply w-2;
}

.sidebar-nav::-webkit-scrollbar-track {
  @apply bg-gray-50 rounded-full;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded-full;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .sidebar-container {
    @apply w-56;
  }
  
  .sidebar-container.sidebar-collapsed {
    @apply w-16;
  }
}

@media (max-width: 768px) {
  .sidebar-container {
    @apply w-72;
  }
  
  .sidebar-container.sidebar-collapsed {
    @apply w-72;
  }
  
  .sidebar-collapsed .brand-name,
  .sidebar-collapsed .nav-submenu,
  .sidebar-collapsed .debug-info {
    @apply block;
  }
  
  .sidebar-collapsed .logo-container {
    @apply justify-start gap-3;
  }
  
  .sidebar-collapsed .sidebar-header {
    @apply p-4;
  }
  
  .sidebar-header {
    @apply p-4;
  }
  
  .sidebar-nav {
    @apply p-3;
  }
}
</style> 