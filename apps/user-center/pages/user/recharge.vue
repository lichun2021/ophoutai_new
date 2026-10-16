<template>
  <div class="recharge-page">
    <!-- 顶部统计 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg,var(--primary),var(--primary-container))">💰</div>
        <div>
          <p class="stat-label">{{ tt('累计充值', 'Total Top-Up') }}</p>
          <p class="stat-value">¥{{ formatBalance(totalRecharge) }}</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg,var(--secondary-dim),var(--secondary))">📊</div>
        <div>
          <p class="stat-label">{{ tt('充值次数', 'Top-Up Count') }}</p>
          <p class="stat-value">{{ rechargeCount }}<small>{{ tt('次', '') }}</small></p>
        </div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-group">
        <label class="filter-label">{{ tt('状态', 'Status') }}</label>
        <USelectMenu v-model="statusFilter" :options="statusOptions" value-attribute="value" option-attribute="label" class="filter-select">
          <template #label>{{ statusOptions.find(o => o.value === statusFilter)?.label || tt('全部', 'All') }}</template>
        </USelectMenu>
      </div>
      <div class="filter-group">
        <label class="filter-label">{{ tt('时间', 'Time') }}</label>
        <USelectMenu v-model="timeFilter" :options="timeOptions" value-attribute="value" option-attribute="label" class="filter-select">
          <template #label>{{ timeOptions.find(o => o.value === timeFilter)?.label || tt('全部', 'All') }}</template>
        </USelectMenu>
      </div>
    </div>

    <!-- 记录列表 -->
    <div class="record-area">
      <div v-if="loading" class="center-box">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin" style="color:var(--primary-container)" />
        <p>{{ tt('加载中...', 'Loading...') }}</p>
      </div>
      <div v-else-if="filteredRecords.length === 0" class="center-box">
        <span style="font-size:48px">📭</span>
        <p>{{ tt('暂无充值记录', 'No top-up records found') }}</p>
        <button class="mini-btn" @click="goToRecharge">{{ tt('立即充值', 'Top Up Now') }}</button>
      </div>
      <div v-else class="record-list">
        <div v-for="record in filteredRecords" :key="record.id" class="record-card">
          <div class="rc-top">
            <div>
              <h4 class="rc-name">{{ record.item_name }}</h4>
              <p class="rc-id">{{ record.order_id }}</p>
            </div>
            <span class="status-badge" :class="getStatusClass(record.payment_status)">{{ getStatusText(record.payment_status) }}</span>
          </div>
          <div class="rc-details">
            <div class="rc-row"><span class="rc-key">{{ tt('充值金额', 'Amount') }}</span><span class="rc-val amount">¥{{ formatBalance(record.amount) }}</span></div>
            <div class="rc-row"><span class="rc-key">{{ tt('支付方式', 'Method') }}</span><span class="rc-val">{{ record.payment_method || tt('线上支付', 'Online Pay') }}</span></div>
            <div class="rc-row"><span class="rc-key">{{ tt('充值时间', 'Time') }}</span><span class="rc-val">{{ formatDateTime(record.created_at) }}</span></div>
            <div v-if="record.completed_at" class="rc-row"><span class="rc-key">{{ tt('完成时间', 'Completed') }}</span><span class="rc-val">{{ formatDateTime(record.completed_at) }}</span></div>
          </div>
          <div v-if="record.payment_status !== 3" class="rc-action">
            <button class="query-btn" :disabled="isQueryCooldown(record.order_id) || queryLoading[record.order_id]" @click="queryOrderStatus(record.order_id)">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" :class="{ 'animate-spin': queryLoading[record.order_id] }" />
              <span>{{ isQueryCooldown(record.order_id) ? getQueryCooldownText(record.order_id) : tt('刷新状态', 'Refresh Status') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';
import { useI18n } from '~/composables/useI18n';

definePageMeta({ middleware: 'auth', layout: 'user' });

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();
const { isEn, tt } = useI18n();

const rechargeRecords = ref([]);
const loading = ref(false);
const statusFilter = ref('all');
const timeFilter = ref('all');
const queryLoading = ref({});
const queryCooldowns = ref({});
const cooldownTimers = ref({});

const statusOptions = computed(() => [
  { label: tt('全部状态', 'All Status'), value: 'all' },
  { label: tt('未完成', 'Unpaid'), value: '0' },
  { label: tt('处理中', 'Processing'), value: '1' },
  { label: tt('失败', 'Failed'), value: '2' },
  { label: tt('已完成', 'Completed'), value: '3' }
]);

const timeOptions = computed(() => [
  { label: tt('全部时间', 'All Time'), value: 'all' },
  { label: tt('最近7天', 'Last 7 Days'), value: '7days' },
  { label: tt('最近30天', 'Last 30 Days'), value: '30days' },
  { label: tt('最近3个月', 'Last 3 Months'), value: '3months' }
]);

const totalRecharge = computed(() =>
  rechargeRecords.value.filter(r => r.payment_status === 3).reduce((t, r) => t + parseFloat(r.amount || 0), 0)
);
const rechargeCount = computed(() => rechargeRecords.value.filter(r => r.payment_status === 3).length);

const filteredRecords = computed(() => {
  let f = rechargeRecords.value;
  if (statusFilter.value !== 'all') {
    const v = parseInt(statusFilter.value);
    f = f.filter(r => r.payment_status === v);
  }
  if (timeFilter.value !== 'all') {
    const now = new Date(); const cutoff = new Date();
    if (timeFilter.value === '7days') cutoff.setDate(now.getDate() - 7);
    else if (timeFilter.value === '30days') cutoff.setDate(now.getDate() - 30);
    else if (timeFilter.value === '3months') cutoff.setMonth(now.getMonth() - 3);
    f = f.filter(r => new Date(r.created_at) >= cutoff);
  }
  return f.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
});

const formatBalance = (v) => { if (!v) return '0.00'; return parseFloat(v).toFixed(2); };
const formatDateTime = (d) => { if (!d) return '-'; return new Date(d).toLocaleString(isEn.value ? 'en-US' : 'zh-CN'); };
const getStatusText = (s) => ({
  0: tt('未完成', 'Unpaid'),
  1: tt('处理中', 'Processing'),
  2: tt('失败', 'Failed'),
  3: tt('已完成', 'Completed')
}[s] || tt('未知', 'Unknown'));
const getStatusClass = (s) => ({ 0: 'pending', 1: 'processing', 2: 'failed', 3: 'completed' }[s] || 'unknown');
const goToRecharge = () => router.push('/user/cashier');

const queryOrderStatus = async (orderId) => {
  if (isQueryCooldown(orderId)) { tips.warning(tt('请等待冷却时间结束', 'Please wait for cooldown')); return; }
  queryLoading.value[orderId] = true;
  try {
    const res = await $fetch('/api/user/payment/query', { method: 'POST', body: { transaction_id: orderId } });
    if (res.code === 200) {
      const status = res.data?.status;
      if (status === 1) {
        tips.success(tt('充值成功！平台币已到账', 'Top-up successful! Coins credited'));
        startQueryCooldown(orderId);
        setTimeout(() => { loadRechargeRecords(); }, 1000);
        if (authStore.userInfo) { try { await authStore.fetchUserInfo(); } catch {} }
      } else if (status === 0) {
        tips.info(tt('订单尚未支付完成', 'Order is not paid yet'));
        startQueryCooldown(orderId);
      } else {
        tips.warning(tt('订单状态未知', 'Unknown order status'));
        startQueryCooldown(orderId);
      }
    } else {
      tips.error(res.msg || tt('查询失败', 'Query failed'));
      startQueryCooldown(orderId, 30);
    }
  } catch {
    tips.error(tt('查询失败，请检查网络', 'Query failed, please check your connection'));
    startQueryCooldown(orderId, 30);
  } finally {
    queryLoading.value[orderId] = false;
  }
};

const startQueryCooldown = (orderId, seconds = 99) => {
  const endTime = Date.now() + seconds * 1000;
  queryCooldowns.value[orderId] = endTime;
  if (cooldownTimers.value[orderId]) clearInterval(cooldownTimers.value[orderId]);
  cooldownTimers.value[orderId] = setInterval(() => {
    if ((queryCooldowns.value[orderId] - Date.now()) <= 0) {
      clearInterval(cooldownTimers.value[orderId]);
      delete cooldownTimers.value[orderId];
      delete queryCooldowns.value[orderId];
    }
  }, 1000);
};
const isQueryCooldown = (orderId) => !!(queryCooldowns.value[orderId] && queryCooldowns.value[orderId] > Date.now());
const getQueryCooldownText = (orderId) => {
  if (!queryCooldowns.value[orderId]) return tt('刷新', 'Refresh');
  const r = Math.ceil((queryCooldowns.value[orderId] - Date.now()) / 1000);
  return r <= 0 ? tt('刷新', 'Refresh') : `${r}s`;
};

const loadRechargeRecords = async () => {
  loading.value = true;
  try {
    const userId = authStore.userInfo?.id || authStore.id;
    if (!userId) { tips.error(tt('用户信息获取失败', 'Failed to load user info')); return; }
    const res = await $fetch('/api/client/recharge-history', { query: { user_id: userId, page: 1, pageSize: 100 } });
    if (res.code === 200) {
      rechargeRecords.value = (res.data.records || []).map(r => ({
        id: r.id,
        order_id: r.mch_order_id || r.transaction_id,
        item_name: r.product_name,
        amount: r.amount,
        payment_status: r.payment_status,
        payment_method: r.payment_way || tt('线上支付', 'Online Pay'),
        created_at: r.created_at,
        completed_at: r.payment_status === 3 ? r.notify_at || r.created_at : null
      }));
    } else {
      tips.error(res.message || tt('获取充值记录失败', 'Failed to load top-up history'));
      rechargeRecords.value = [];
    }
  } catch {
    tips.error(tt('加载充值记录失败', 'Failed to load top-up history'));
    rechargeRecords.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(() => { loadRechargeRecords(); });
onUnmounted(() => {
  Object.keys(cooldownTimers.value).forEach(id => {
    if (cooldownTimers.value[id]) clearInterval(cooldownTimers.value[id]);
  });
  cooldownTimers.value = {}; queryCooldowns.value = {};
});
</script>

<style scoped>
.recharge-page { display: flex; flex-direction: column; gap: 16px; }

.stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.stat-card {
  background: var(--surface-container); /* no-line rule */;
  border-radius: 16px; padding: 18px;
  display: flex; align-items: center; gap: 14px;
}
.stat-icon {
  width: 46px; height: 46px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
}
.stat-label { margin: 0 0 4px; font-size: 12px; color: var(--on-surface-variant); }
.stat-value { margin: 0; font-size: 22px; font-weight: 800; color: var(--on-surface); }
.stat-value small { font-size: 13px; font-weight: 500; color: var(--on-surface-variant); margin-left: 2px; }

.filter-bar {
  background: var(--surface-container); /* no-line rule */;
  border-radius: 16px; padding: 16px 20px;
  display: flex; gap: 20px; flex-wrap: wrap;
}
.filter-group { display: flex; align-items: center; gap: 10px; }
.filter-label { font-size: 13px; color: var(--on-surface-variant); font-weight: 500; white-space: nowrap; }
.filter-select { min-width: 140px; }

.record-area { display: flex; flex-direction: column; gap: 12px; }

.center-box {
  background: var(--surface-container); /* no-line rule */;
  border-radius: var(--radius-lg); padding: 60px 24px;
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; text-align: center; color: var(--on-surface-variant);
}
.center-box p { margin: 0; }

.mini-btn {
  padding: 8px 24px;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  border: none; border-radius: var(--radius-lg);
  color: var(--on-primary); font-size: 13px; font-weight: 600;
  cursor: pointer; margin-top: 4px;
}

.record-list { display: flex; flex-direction: column; gap: 12px; }

.record-card {
  background: var(--surface-container); /* no-line rule */;
  border-radius: 16px; padding: 18px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.record-card:hover { border-color: rgba(168,50,6,0.3); box-shadow: 0 4px 20px rgba(168,50,6,0.1); }

.rc-top {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 14px; padding-bottom: 14px;
  border-bottom: 1px solid var(--outline-variant);
}
.rc-name { margin: 0 0 6px; font-size: 15px; font-weight: 700; color: var(--on-surface); }
.rc-id { margin: 0; font-size: 11px; color: var(--on-surface-variant); font-family: monospace; word-break: break-all; }

.status-badge {
  font-size: 11px; padding: 4px 12px; border-radius: var(--radius-lg);
  font-weight: 700; flex-shrink: 0; margin-left: 8px;
}
.status-badge.completed { background: rgba(127,230,219,0.15); color: var(--secondary); }
.status-badge.processing { background: rgba(168,50,6,0.15); color: var(--primary); }
.status-badge.pending { background: rgba(162,155,254,0.15); color: var(--primary-container); }
.status-badge.failed { background: rgba(186,26,26,0.15); color: var(--error); }
.status-badge.unknown { background: var(--outline-variant); color: var(--on-surface-variant); }

.rc-details { display: flex; flex-direction: column; gap: 10px; }
.rc-row { display: flex; justify-content: space-between; align-items: center; }
.rc-key { font-size: 13px; color: var(--on-surface-variant); }
.rc-val { font-size: 13px; color: var(--on-surface); font-weight: 500; }
.rc-val.amount { font-size: 16px; font-weight: 800; color: var(--secondary-dim); }

.rc-action {
  margin-top: 14px; padding-top: 14px;
  border-top: 1px solid var(--outline-variant);
  display: flex; justify-content: flex-end;
}
.query-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 20px;
  background: rgba(168,50,6,0.15);
  border: 1px solid rgba(168,50,6,0.3);
  border-radius: 10px;
  color: var(--primary-container); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.query-btn:hover:not(:disabled) { background: rgba(168,50,6,0.25); }
.query-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 480px) {
  .stats-row { grid-template-columns: 1fr 1fr; }
  .filter-bar { flex-direction: column; gap: 12px; }
  .filter-group { width: 100%; justify-content: space-between; }
  .filter-select { flex: 1; }
}
</style>