<template>
  <div class="home-page">

    <!-- 用户欢迎卡片 -->
    <div class="hero-card">
      <div class="hero-bg-orb"></div>
      <div class="hero-content">
        <div class="hero-left">
          <p class="hero-greeting">欢迎回来 👋</p>
          <h2 class="hero-username">{{ authStore.userInfo?.username || '用户' }}</h2>
          <div class="hero-balance">
            <img src="/platform-coin.svg" alt="coin" class="hero-coin" />
            <span class="hero-amount">{{ formatBalance(authStore.userInfo?.platform_coins) }}</span>
            <span class="hero-unit">平台币</span>
          </div>
        </div>
        <div class="hero-right">
          <button class="refresh-btn" @click="refreshBalance" :class="{ spinning: refreshing }">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="quick-actions">
        <button class="qa-btn primary" @click="recharge">
          <span class="qa-icon">💳</span>
          <span>充值</span>
        </button>
        <button class="qa-btn" @click="goToMall">
          <span class="qa-icon">🎁</span>
          <span>商城</span>
        </button>
        <button class="qa-btn" @click="goToRechargeRecords">
          <span class="qa-icon">📋</span>
          <span>充值记录</span>
        </button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-wrap" style="background: linear-gradient(135deg, #6c5ce7, #a29bfe);">
          <span>💰</span>
        </div>
        <div class="stat-body">
          <p class="stat-label">累计充值</p>
          <p class="stat-value">¥{{ formatRecharge(stats.totalRecharge) }}</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap" style="background: linear-gradient(135deg, #00b894, #00cec9);">
          <span>🛒</span>
        </div>
        <div class="stat-body">
          <p class="stat-label">购买次数</p>
          <p class="stat-value">{{ stats.purchaseCount }}<small>次</small></p>
        </div>
      </div>
    </div>

    <!-- 最近订单 -->
    <div class="section-card">
      <div class="section-head">
        <h3 class="section-title">最近订单</h3>
        <span class="section-hint">近3笔</span>
      </div>

      <div v-if="recentOrders.length > 0" class="order-list">
        <div v-for="order in recentOrders" :key="order.id" class="order-item">
          <div class="order-left">
            <p class="order-name">{{ order.item_name || '平台币充值' }}</p>
            <p class="order-date">{{ formatDate(order.created_at) }}</p>
            <span class="order-badge" :class="order.status">{{ getOrderStatusText(order.status) }}</span>
          </div>
          <div class="order-right">
            <img src="/platform-coin.svg" alt="coin" class="order-coin" />
            <span class="order-amount">{{ formatBalance(order.amount) }}</span>
          </div>
        </div>
      </div>

      <div v-else class="empty-block">
        <span class="empty-emoji">📭</span>
        <p>暂无购买记录</p>
        <button class="mini-btn" @click="goToMall">前往商城</button>
      </div>

      <button class="view-all-btn" @click="viewAllOrders">查看全部购买记录 →</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';

definePageMeta({ middleware: 'auth', layout: 'user' });

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

const stats = ref({ totalRecharge: 0, purchaseCount: 0 });
const recentOrders = ref([]);
const refreshing = ref(false);

const formatBalance = (v) => { if (!v) return '0'; return Math.floor(parseFloat(v)).toString(); };
const formatRecharge = (v) => { if (!v) return '0.00'; return parseFloat(v).toFixed(2); };
const formatDate = (d) => { if (!d) return '-'; return new Date(d).toLocaleDateString('zh-CN'); };
const getOrderStatusText = (s) => ({ pending: '待付款', paid: '已付款', completed: '已完成', cancelled: '已取消', failed: '支付失败' }[s] || '未知');

const refreshBalance = async () => {
  refreshing.value = true;
  try {
    const ok = await authStore.refreshBalance();
    tips[ok ? 'success' : 'warning'](ok ? '余额已刷新' : '刷新失败');
  } catch { tips.error('刷新失败'); } finally { refreshing.value = false; }
};

const recharge = () => router.push('/user/cashier');
const goToMall = () => router.push('/user/mall');
const goToRechargeRecords = () => router.push('/user/recharge');
const viewAllOrders = () => router.push('/user/orders');

const loadUserData = async () => {
  try {
    if (!authStore.userInfo?.id) return;
    const res = await $fetch('/api/client/user/home-stats', { query: { user_id: authStore.userInfo.id } });
    if (res.code === 200) {
      stats.value = { totalRecharge: res.data.totalRecharge || 0, purchaseCount: res.data.purchaseCount || 0 };
      recentOrders.value = (res.data.recentOrders || []).map(r => ({
        id: r.id,
        item_name: r.product_name,
        amount: r.amount,
        status: r.payment_status === 3 ? 'completed' : r.payment_status === 1 ? 'pending' : 'failed',
        created_at: r.created_at
      }));
    }
  } catch { stats.value = { totalRecharge: 0, purchaseCount: 0 }; recentOrders.value = []; }
};

onMounted(async () => {
  if (!authStore.isLoggedIn || !authStore.isUser) { router.push('/user/login'); return; }
  await authStore.refreshBalance();
  loadUserData();
});
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ============ Hero 卡片 ============ */
.hero-card {
  position: relative;
  background: linear-gradient(135deg, #1e1b4b 0%, #1e2235 60%, #0d2a4a 100%);
  border: 1px solid rgba(108,92,231,0.3);
  border-radius: 20px;
  padding: 28px 24px 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(108,92,231,0.2);
}

.hero-bg-orb {
  position: absolute;
  right: -40px; top: -40px;
  width: 200px; height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(108,92,231,0.3), transparent 70%);
  pointer-events: none;
}

.hero-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  position: relative;
}

.hero-greeting { margin: 0 0 4px; font-size: 13px; color: #a29bfe; font-weight: 500; }
.hero-username { margin: 0 0 14px; font-size: 22px; font-weight: 800; color: #e8eaf6; }
.hero-balance { display: flex; align-items: baseline; gap: 6px; }
.hero-coin { width: 28px; height: 28px; }
.hero-amount { font-size: 40px; font-weight: 900; color: #fdcb6e; line-height: 1; }
.hero-unit { font-size: 14px; color: rgba(253,203,110,0.7); }

.refresh-btn {
  padding: 8px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  color: #a29bfe;
  cursor: pointer;
  transition: all 0.2s;
}
.refresh-btn:hover { background: rgba(108,92,231,0.3); }
.refresh-btn.spinning :deep(svg) { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.quick-actions {
  display: flex;
  gap: 10px;
  position: relative;
}

.qa-btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px 8px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  color: #e8eaf6;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.qa-btn:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }
.qa-btn.primary {
  background: linear-gradient(135deg, rgba(108,92,231,0.5), rgba(108,92,231,0.3));
  border-color: rgba(108,92,231,0.5);
  color: #a29bfe;
}
.qa-icon { font-size: 18px; }

/* ============ 统计行 ============ */
.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-card {
  background: #1e2235;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-icon-wrap {
  width: 46px; height: 46px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.stat-label { margin: 0 0 4px; font-size: 12px; color: #8892b0; }
.stat-value {
  margin: 0; font-size: 22px; font-weight: 800; color: #e8eaf6;
}
.stat-value small { font-size: 13px; font-weight: 500; color: #8892b0; margin-left: 2px; }

/* ============ 订单区 ============ */
.section-card {
  background: #1e2235;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px;
  padding: 20px;
}

.section-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 16px;
}
.section-title { margin: 0; font-size: 16px; font-weight: 700; color: #e8eaf6; }
.section-hint {
  font-size: 11px; color: #8892b0;
  background: rgba(255,255,255,0.06);
  padding: 2px 8px; border-radius: 20px;
}

.order-list { display: flex; flex-direction: column; }

.order-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.order-item:last-child { border-bottom: none; }

.order-name { margin: 0 0 4px; font-size: 15px; color: #e8eaf6; font-weight: 600; }
.order-date { margin: 0 0 6px; font-size: 12px; color: #8892b0; }

.order-badge {
  font-size: 11px; padding: 2px 10px; border-radius: 20px; font-weight: 600;
}
.order-badge.completed { background: rgba(0,206,201,0.15); color: #00cec9; }
.order-badge.pending { background: rgba(253,203,110,0.15); color: #fdcb6e; }
.order-badge.paid { background: rgba(0,184,148,0.15); color: #00b894; }
.order-badge.cancelled, .order-badge.failed { background: rgba(255,71,87,0.15); color: #ff4757; }

.order-right { display: flex; align-items: center; gap: 4px; }
.order-coin { width: 16px; height: 16px; }
.order-amount { font-size: 16px; font-weight: 700; color: #fdcb6e; }

.empty-block {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; padding: 32px 0; text-align: center;
}
.empty-emoji { font-size: 40px; }
.empty-block p { margin: 0; color: #8892b0; font-size: 14px; }
.mini-btn {
  padding: 8px 20px;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  border: none; border-radius: 20px;
  color: white; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.mini-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(108,92,231,0.4); }

.view-all-btn {
  width: 100%; margin-top: 14px; padding: 12px;
  background: rgba(108,92,231,0.1);
  border: 1px solid rgba(108,92,231,0.25);
  border-radius: 12px;
  color: #a29bfe; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.view-all-btn:hover { background: rgba(108,92,231,0.18); }

@media (max-width: 480px) {
  .hero-amount { font-size: 36px; }
  .stats-row { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat-card { padding: 14px; }
}
</style>