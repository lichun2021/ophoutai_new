<!-- components/Sidebar.vue -->
<template>
  <div :class="['sidebar', collapsed ? 'sidebar--collapsed' : '']">
    <!-- Logo -->
    <div class="sidebar__logo">
      <img src="/logo.svg" alt="Logo" class="sidebar__logo-img" />
      <Transition name="fade">
        <span v-if="!collapsed" class="sidebar__logo-text">后台管理</span>
      </Transition>
    </div>

    <!-- Navigation -->
    <nav class="sidebar__nav">
      <template v-for="group in navGroups" :key="group.label">
        <div class="sidebar__group">
          <Transition name="fade">
            <p v-if="!collapsed" class="sidebar__group-label">{{ group.label }}</p>
          </Transition>
          <ul class="sidebar__list">
            <li v-for="item in group.items" :key="item.to">
              <NuxtLink
                :to="item.to"
                :class="['sidebar__item', isActive(item) ? 'sidebar__item--active' : '']"
                :title="collapsed ? item.label : undefined"
                @click="handleNavClick"
              >
                <UIcon :name="item.icon" class="sidebar__icon" />
                <Transition name="fade">
                  <span v-if="!collapsed" class="sidebar__label">{{ item.label }}</span>
                </Transition>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </template>
    </nav>

    <!-- Footer -->
    <div class="sidebar__footer">
      <Transition name="fade">
        <span v-if="!collapsed" class="sidebar__version">v1.0.0</span>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router';

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
});

const route = useRoute();

const navGroups = [
  {
    label: '概览',
    items: [
      { label: '首页', to: '/home', icon: 'i-heroicons-home' },
    ],
  },
  {
    label: '数据报表',
    items: [
      { label: '数据概览',    to: '/data/overview-data',       icon: 'i-heroicons-chart-pie' },
      { label: '日报数据',    to: '/data/daily-data',          icon: 'i-heroicons-calendar-days' },
      { label: 'LTV数据',    to: '/data/ltv-data',            icon: 'i-heroicons-arrow-trending-up' },
      { label: '渠道数据',    to: '/data/channel-data',        icon: 'i-heroicons-megaphone' },
      { label: '用户注册',    to: '/data/user-register-data',  icon: 'i-heroicons-user-plus' },
      { label: '角色数据',    to: '/data/role-data',           icon: 'i-heroicons-users' },
      { label: '支付数据',    to: '/data/payment-data',        icon: 'i-heroicons-credit-card' },
      { label: '登录数据',    to: '/data/login-data',          icon: 'i-heroicons-arrow-right-on-rectangle' },
      { label: '渠道结算',    to: '/data/channel-settlement-data', icon: 'i-heroicons-calculator' },
    ],
  },
  {
    label: '代理管理',
    items: [
      { label: '代理信息', to: '/promoter-info', icon: 'i-heroicons-user' },
      { label: '修改客服', to: '/service',       icon: 'i-heroicons-chat-bubble-left-right' },
    ],
  },
  {
    label: '游戏 & 渠道',
    items: [
      { label: '游戏列表', to: '/game-list',    icon: 'i-heroicons-puzzle-piece' },
      { label: '代理列表', to: '/channel-list', icon: 'i-heroicons-list-bullet' },
    ],
  },
  {
    label: '运营管理',
    items: [
      { label: '游戏授权',   to: '/admin/operation/game-permissions',     icon: 'i-heroicons-key' },
      { label: '代理平台币', to: '/admin/operation/platform-coin-admin',  icon: 'i-heroicons-banknotes' },
      { label: '玩家发放',   to: '/admin/operation/platform-coin-player', icon: 'i-heroicons-gift' },
      { label: '支付管理',   to: '/admin/operation/payment-settings',     icon: 'i-heroicons-credit-card' },
      { label: '系统参数',   to: '/admin/operation/system-params',        icon: 'i-heroicons-cog-8-tooth' },
      { label: '结算提交',   to: '/admin/operation/settlement-submit',    icon: 'i-heroicons-document-plus' },
      { label: '结算管理',   to: '/admin/operation/settlement-manage',    icon: 'i-heroicons-clipboard-document-check' },
    ],
  },
];

const isActive = (item) => {
  if (item.to === '/home') {
    return route.path === '/home';
  }
  return route.path.startsWith(item.to);
};

// Emit close event for mobile
const handleNavClick = () => {
  document.dispatchEvent(new Event('closeSidebar'));
};
</script>

<style scoped>
/* ── Base ── */
.sidebar {
  display: flex;
  flex-direction: column;
  width: 256px;
  height: 100vh;
  background: linear-gradient(180deg, var(--surface-container-low) 0%, var(--surface-container) 60%, var(--surface-container-high) 100%);
  color: var(--on-surface);
  overflow: hidden;
  transition: width 0.2s ease-in-out;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.25);
  user-select: none;
}

.sidebar--collapsed {
  width: 64px;
}

/* ── Logo ── */
.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 80px;
  flex-shrink: 0;
}

.sidebar__logo-img {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  filter: brightness(0) invert(1);
}

.sidebar__logo-text {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
  background: linear-gradient(90deg, var(--primary-container), var(--on-surface));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Nav ── */
.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}

.sidebar__nav::-webkit-scrollbar {
  width: 4px;
}
.sidebar__nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

/* ── Group ── */
.sidebar__group {
  margin-bottom: 4px;
}

.sidebar__group-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: rgba(165, 180, 252, 0.5);
  padding: 12px 18px 4px;
  white-space: nowrap;
  margin: 0;
}

.sidebar__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* ── Item ── */
.sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 500;
  color: rgba(199, 210, 254, 0.8);
  text-decoration: none;
  cursor: pointer;
  border-radius: 0;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}

.sidebar__item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: background 0.15s ease;
  border-radius: 0 2px 2px 0;
}

.sidebar__item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--on-surface);
}

.sidebar__item--active {
  background: rgba(99, 102, 241, 0.35);
  color: #fff;
  font-weight: 600;
}

.sidebar__item--active::before {
  background: var(--primary);
}

/* ── Icon ── */
.sidebar__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.85;
}

.sidebar__item--active .sidebar__icon {
  opacity: 1;
}

/* ── Label ── */
.sidebar__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Footer ── */
.sidebar__footer {
  padding: 14px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.sidebar__version {
  font-size: 11px;
  color: rgba(165, 180, 252, 0.4);
  white-space: nowrap;
}

/* ── Transitions ── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
