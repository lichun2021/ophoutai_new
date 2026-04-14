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

        </UAccordion>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// 组件属性
const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();

// 导航点击处理
const handleNavClick = () => {
  if (window.innerWidth < 768) {
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('closeSidebar'));
    }, 100);
  }
};

// 计算侧边栏容器样式
const sidebarContainerClass = computed(() => {
  return props.collapsed ? 'sidebar-container sidebar-collapsed' : 'sidebar-container';
});

// 手风琴菜单项配置（代理后台：无运营管理）
const accordionItems = [
  {
    label: '首页',
    icon: 'i-heroicons-home',
    slot: 'home',
    defaultOpen: true
  },
  {
    label: '代理',
    icon: 'i-heroicons-user-group',
    slot: 'promoter',
    defaultOpen: true
  },
  {
    label: '数据报表',
    icon: 'i-heroicons-chart-bar',
    slot: 'report',
    defaultOpen: true
  },
  {
    label: '游戏管理',
    icon: 'i-heroicons-puzzle-piece',
    slot: 'game',
    defaultOpen: true
  },
  {
    label: '渠道管理',
    icon: 'i-heroicons-megaphone',
    slot: 'channel',
    defaultOpen: true
  }
];

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

.sidebar-header {
  @apply p-6 border-b border-gray-100;
  transition: padding 0.3s ease-in-out;
}

.sidebar-collapsed .sidebar-header {
  @apply p-3;
}

.logo-container {
  @apply flex items-center gap-3;
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

.sidebar-nav::-webkit-scrollbar {
  @apply w-2;
}

.sidebar-nav::-webkit-scrollbar-track {
  @apply bg-gray-50 rounded-full;
}
</style>