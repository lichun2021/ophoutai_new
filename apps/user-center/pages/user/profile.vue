<template>
  <div class="profile-page">
    <!-- 用户信息卡片 -->
    <div class="info-card">
      <div class="info-header">
        <div class="avatar-lg">{{ userInitial }}</div>
        <div class="info-meta">
          <h2 class="info-name">{{ authStore.userInfo?.username || authStore.name || '未设置' }}</h2>
          <p class="info-uid">UID: {{ authStore.userInfo?.thirdparty_uid || '-' }}</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">用户ID</span>
          <span class="info-value">{{ authStore.userInfo?.id || authStore.id }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">手机号</span>
          <span class="info-value">{{ authStore.userInfo?.iphone || '未绑定' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">渠道</span>
          <span class="info-value badge">{{ authStore.userInfo?.channel_code || '默认' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">注册时间</span>
          <span class="info-value">{{ formatDate(authStore.userInfo?.created_at) }}</span>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card stat-primary">
        <span class="stat-emoji">💰</span>
        <div>
          <p class="stat-label">平台币余额</p>
          <p class="stat-value">{{ formatBalance(authStore.userInfo?.platform_coins) }}</p>
        </div>
      </div>
      <div class="stat-card stat-secondary">
        <span class="stat-emoji">📊</span>
        <div>
          <p class="stat-label">总充值</p>
          <p class="stat-value">¥{{ formatAmount(userStats?.total_recharge || 0) }}</p>
        </div>
      </div>
      <div class="stat-card stat-accent">
        <span class="stat-emoji">🎁</span>
        <div>
          <p class="stat-label">购买次数</p>
          <p class="stat-value">{{ userStats?.total_purchases || 0 }}<small>次</small></p>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="actions-card">
      <h3 class="card-title">快捷操作</h3>
      <div class="actions-grid">
        <button class="action-item" @click="goToRecharge">
          <span class="action-icon">💳</span>
          <span class="action-text">充值平台币</span>
        </button>
        <button class="action-item" @click="goToGiftShop">
          <span class="action-icon">🎁</span>
          <span class="action-text">礼包商店</span>
        </button>
        <button class="action-item" @click="viewOrders">
          <span class="action-icon">📦</span>
          <span class="action-text">我的订单</span>
        </button>
      </div>
    </div>

    <FeatureNotReady v-model="showFeatureNotReady" :message="featureMessage" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';
import FeatureNotReady from '@/components/FeatureNotReady.vue';

definePageMeta({ middleware: 'auth', layout: 'user' });

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

const userStats = ref<{ total_recharge?: number; total_purchases?: number }>({});
const loading = ref(false);
const showFeatureNotReady = ref(false);
const featureMessage = ref('');

const userInitial = computed(() => (authStore.userInfo?.username || authStore.name || 'U').charAt(0).toUpperCase());

const fetchUserStats = async () => {
  loading.value = true;
  try {
    const userId = authStore.userInfo?.id || authStore.id;
    if (!userId) return;
    const response = await fetch(`/api/client/user/stats/${userId}`, { headers: { 'Authorization': userId.toString() } });
    if (response.ok) {
      const result = await response.json();
      if (result.code === 200 && result.data) {
        userStats.value = { total_recharge: result.data.total_recharge || 0, total_purchases: result.data.total_purchases || 0 };
      }
    }
  } catch (error) { console.error('获取用户统计信息出错:', error); }
  finally { loading.value = false; }
};

const formatBalance = (v: any) => { if (!v) return '0'; return Math.floor(Number(v)).toString(); };
const formatAmount = (v: any) => { if (!v) return '0.00'; return Number(v).toFixed(2); };
const formatDate = (d: any) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('zh-CN'); } catch { return '-'; } };

const goToRecharge = () => router.push('/user/cashier');
const goToGiftShop = () => router.push('/user/mall');
const viewOrders = () => router.push('/user/orders');

onMounted(() => { authStore.init(); fetchUserStats(); });
</script>

<style scoped>
.profile-page { display: flex; flex-direction: column; gap: 16px; }

/* ============ 用户信息卡片 ============ */
.info-card {
  background: var(--surface-container);
  border-radius: var(--radius-lg);
  padding: 24px;
}
.info-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.avatar-lg {
  width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 800; color: var(--on-primary);
  flex-shrink: 0;
}
.info-name { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: var(--on-surface); }
.info-uid { margin: 0; font-size: 12px; color: var(--on-surface-variant); font-family: 'Courier New', monospace; }

.info-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.info-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px;
  background: var(--surface-container-low);
  border-radius: var(--radius-sm);
}
.info-label { font-size: 12px; color: var(--on-surface-variant); }
.info-value { font-size: 14px; font-weight: 600; color: var(--on-surface); }
.info-value.badge {
  display: inline-block; width: fit-content;
  background: var(--primary-container); color: var(--primary);
  padding: 2px 10px; border-radius: var(--radius-xl); font-size: 12px;
}

/* ============ 统计卡片 ============ */
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-card {
  display: flex; align-items: center; gap: 12px;
  padding: 18px 16px;
  border-radius: var(--radius-md);
}
.stat-primary { background: linear-gradient(135deg, var(--primary), var(--primary-dim)); color: #fff; }
.stat-secondary { background: var(--surface-container); }
.stat-accent { background: var(--surface-container); }
.stat-emoji { font-size: 28px; flex-shrink: 0; }
.stat-label { margin: 0 0 2px; font-size: 12px; opacity: 0.8; }
.stat-value { margin: 0; font-size: 20px; font-weight: 800; }
.stat-primary .stat-value { color: #fff; }
.stat-value small { font-size: 12px; font-weight: 500; margin-left: 2px; }

/* ============ 操作卡片 ============ */
.actions-card {
  background: var(--surface-container);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.card-title { margin: 0 0 16px; font-size: 16px; font-weight: 700; color: var(--on-surface); }
.actions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.action-item {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 20px 12px;
  background: var(--surface-container-low);
  border-radius: var(--radius-md); border: none;
  cursor: pointer; transition: all 0.2s;
  font-family: var(--font-family);
}
.action-item:hover { background: var(--primary-container); transform: translateY(-2px); }
.action-icon { font-size: 28px; }
.action-text { font-size: 13px; font-weight: 600; color: var(--on-surface); }

@media (max-width: 480px) {
  .info-grid { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: 1fr; }
  .actions-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>