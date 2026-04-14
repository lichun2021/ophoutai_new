<template>
  <div class="recharge-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1>充值记录</h1>
      <p>查看您的所有充值记录和充值明细</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-icon">
          <UIcon name="i-heroicons-banknotes" />
        </div>
                  <div class="stat-content">
            <h3>累计充值</h3>
            <p class="stat-value">¥{{ formatBalance(totalRecharge) }}</p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">
            <UIcon name="i-heroicons-credit-card" />
          </div>
          <div class="stat-content">
            <h3>充值次数</h3>
            <p class="stat-value">{{ rechargeCount }}次</p>
          </div>
      </div>
    </div>

    <!-- 筛选条件 -->
    <div class="filters">
      <div class="filter-group">
        <label>充值状态：</label>
        <USelectMenu 
          v-model="statusFilter" 
          :options="statusOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="选择状态"
          class="filter-select"
        >
          <template #label>
            {{ statusOptions.find(opt => opt.value === statusFilter)?.label || '选择状态' }}
          </template>
        </USelectMenu>
      </div>
      
      <div class="filter-group">
        <label>时间范围：</label>
        <USelectMenu 
          v-model="timeFilter" 
          :options="timeOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="选择时间"
          class="filter-select"
        >
          <template #label>
            {{ timeOptions.find(opt => opt.value === timeFilter)?.label || '选择时间' }}
          </template>
        </USelectMenu>
      </div>
    </div>

    <!-- 充值记录列表 -->
    <div class="recharge-list">
      <div v-if="loading" class="loading-state">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        <p>加载中...</p>
      </div>

      <div v-else-if="filteredRecords.length === 0" class="empty-state">
        <UIcon name="i-heroicons-credit-card" />
        <h3>暂无充值记录</h3>
        <p>您还没有任何充值记录</p>
        <UButton @click="goToRecharge" color="primary">
          立即充值
        </UButton>
      </div>

      <div v-else class="records-grid">
        <div 
          v-for="record in filteredRecords" 
          :key="record.id" 
          class="record-card"
        >
          <div class="record-header">
            <div class="record-info">
              <h4>{{ record.item_name }}</h4>
              <p class="record-id">订单号：{{ record.order_id }}</p>
            </div>
            <div class="record-status">
              <span class="status-badge" :class="getStatusClass(record.payment_status)">
                {{ getStatusText(record.payment_status) }}
              </span>
            </div>
          </div>

          <div class="record-details">
            <div class="detail-item">
              <span class="label">充值金额：</span>
              <span class="value amount">¥{{ formatBalance(record.amount) }}</span>
            </div>
            
            <div class="detail-item">
              <span class="label">支付方式：</span>
              <span class="value">{{ record.payment_method || '线上支付' }}</span>
            </div>
            
            <div class="detail-item">
              <span class="label">充值时间：</span>
              <span class="value">{{ formatDateTime(record.created_at) }}</span>
            </div>

            <div v-if="record.completed_at" class="detail-item">
              <span class="label">完成时间：</span>
              <span class="value">{{ formatDateTime(record.completed_at) }}</span>
            </div>
          </div>

          <div v-if="record.payment_status !== 3" class="record-actions">
            <UButton 
              @click="queryOrderStatus(record.order_id)" 
              size="md" 
              color="primary"
              :disabled="isQueryCooldown(record.order_id)"
              :loading="queryLoading[record.order_id]"
              icon="i-heroicons-arrow-path"
              class="query-button"
            >
              <template v-if="isQueryCooldown(record.order_id)">
                {{ getQueryCooldownText(record.order_id) }}
              </template>
              <template v-else>
                刷新
              </template>
            </UButton>
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

// 页面元数据
definePageMeta({
  middleware: 'auth',
  layout: 'user'
});

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

// 响应式数据
const rechargeRecords = ref([]);
const loading = ref(false);
const statusFilter = ref('all');
const timeFilter = ref('all');

// 查询订单相关状态
const queryLoading = ref({}); // 查询加载状态
const queryCooldowns = ref({}); // 冷却时间对象 { orderId: endTime }
const cooldownTimers = ref({}); // 倒计时定时器

// 状态选项 - 根据 payment_status 字段定义
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '未完成', value: '0' },
  { label: '处理中', value: '1' },
  { label: '失败', value: '2' },
  { label: '已完成', value: '3' }
];

// 时间选项
const timeOptions = [
  { label: '全部时间', value: 'all' },
  { label: '最近7天', value: '7days' },
  { label: '最近30天', value: '30days' },
  { label: '最近3个月', value: '3months' }
];

// 计算属性
const totalRecharge = computed(() => {
  return rechargeRecords.value
    .filter(record => record.payment_status === 3) // 已完成的记录
    .reduce((total, record) => total + parseFloat(record.amount || 0), 0);
});

const rechargeCount = computed(() => {
  return rechargeRecords.value.filter(record => record.payment_status === 3).length;
});

const filteredRecords = computed(() => {
  let filtered = rechargeRecords.value;

  // 状态筛选
  if (statusFilter.value !== 'all') {
    const statusValue = parseInt(statusFilter.value);
    filtered = filtered.filter(record => record.payment_status === statusValue);
  }

  // 时间筛选
  if (timeFilter.value !== 'all') {
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeFilter.value) {
      case '7days':
        cutoff.setDate(now.getDate() - 7);
        break;
      case '30days':
        cutoff.setDate(now.getDate() - 30);
        break;
      case '3months':
        cutoff.setMonth(now.getMonth() - 3);
        break;
    }
    
    filtered = filtered.filter(record => new Date(record.created_at) >= cutoff);
  }

  return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
});

// 方法
const formatBalance = (amount) => {
  if (!amount) return '0.00';
  return parseFloat(amount).toFixed(2);
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
};

const getStatusText = (paymentStatus) => {
  const statusMap = {
    0: '未完成',
    1: '处理中',
    2: '失败',
    3: '已完成'
  };
  return statusMap[paymentStatus] || '未知';
};

const getStatusClass = (paymentStatus) => {
  const classMap = {
    0: 'pending',
    1: 'processing', 
    2: 'failed',
    3: 'completed'
  };
  return classMap[paymentStatus] || 'unknown';
};

const goToRecharge = () => {
  router.push('/user/cashier');
};

// 查询订单状态
const queryOrderStatus = async (orderId) => {
  if (isQueryCooldown(orderId)) {
    tips.warning('请等待冷却时间结束');
    return;
  }
  
  queryLoading.value[orderId] = true;
  
  try {
    console.log(`[手动查询] 开始查询充值订单: ${orderId}`);
    
    const response = await $fetch('/api/user/payment/query', {
      method: 'POST',
      body: { transaction_id: orderId }
    });
    
    console.log(`[手动查询] 查询结果:`, response);
    
    if (response.code === 200) {
      const status = response.data?.status;
      
      if (status === 1) {
        // 支付成功
        console.log(`[手动查询] ✅ 充值订单${orderId}支付成功`);
        tips.success('充值成功！平台币已到账，刷新记录中...');
        
        // 启动冷却时间
        startQueryCooldown(orderId);
        
        // 刷新充值记录
        setTimeout(() => {
          loadRechargeRecords();
        }, 1000);
        
        // 刷新用户信息（余额）
        if (authStore.userInfo) {
          try {
            await authStore.fetchUserInfo();
          } catch (e) {
            console.error('[手动查询] 刷新用户信息失败:', e);
          }
        }
      } else if (status === 0) {
        // 未支付
        console.log(`[手动查询] 充值订单${orderId}尚未支付`);
        tips.info('订单尚未支付完成');
        
        // 启动冷却时间
        startQueryCooldown(orderId);
      } else {
        tips.warning('订单状态未知，请稍后再试');
        startQueryCooldown(orderId);
      }
    } else {
      tips.error(response.msg || '查询失败');
      // 查询失败也启动冷却（较短），防止频繁失败请求
      startQueryCooldown(orderId, 30); // 失败时只冷却30秒
    }
  } catch (error) {
    console.error(`[手动查询] 查询异常:`, error);
    tips.error('查询失败，请检查网络后重试');
    startQueryCooldown(orderId, 30); // 异常时只冷却30秒
  } finally {
    queryLoading.value[orderId] = false;
  }
};

// 启动查询冷却时间
const startQueryCooldown = (orderId, seconds = 99) => {
  const endTime = Date.now() + (seconds * 1000);
  queryCooldowns.value[orderId] = endTime;
  
  // 清除旧的定时器
  if (cooldownTimers.value[orderId]) {
    clearInterval(cooldownTimers.value[orderId]);
  }
  
  // 启动新的定时器，每秒更新一次
  cooldownTimers.value[orderId] = setInterval(() => {
    const remaining = queryCooldowns.value[orderId] - Date.now();
    if (remaining <= 0) {
      // 冷却结束
      clearInterval(cooldownTimers.value[orderId]);
      delete cooldownTimers.value[orderId];
      delete queryCooldowns.value[orderId];
    }
  }, 1000);
  
  console.log(`[查询CD] 充值订单 ${orderId} 启动 ${seconds}秒 冷却时间`);
};

// 检查是否在冷却中
const isQueryCooldown = (orderId) => {
  if (!queryCooldowns.value[orderId]) return false;
  return queryCooldowns.value[orderId] > Date.now();
};

// 获取冷却时间文本
const getQueryCooldownText = (orderId) => {
  if (!queryCooldowns.value[orderId]) return '刷新';
  
  const remaining = Math.ceil((queryCooldowns.value[orderId] - Date.now()) / 1000);
  if (remaining <= 0) return '刷新';
  
  return `${remaining}s`;
};

// 加载充值记录
const loadRechargeRecords = async () => {
  loading.value = true;
  try {
    const userId = authStore.userInfo?.id || authStore.id;
    if (!userId) {
      tips.error('用户信息获取失败');
      return;
    }

    // 调用真实的API从PaymentRecords表获取充值记录
    const response = await $fetch('/api/client/recharge-history', {
      query: {
        user_id: userId,
        page: 1,
        pageSize: 100 // 获取更多记录
      }
    });

    if (response.code === 200) {
      // 转换API返回的数据格式为前端需要的格式
      rechargeRecords.value = (response.data.records || []).map(record => ({
        id: record.id,
        order_id: record.mch_order_id || record.transaction_id,
        item_name: record.product_name,
        amount: record.amount,
        payment_status: record.payment_status, // 直接使用数据库的状态码
        payment_method: record.payment_way || '线上支付',
        created_at: record.created_at,
        completed_at: record.payment_status === 3 ? record.notify_at || record.created_at : null
      }));
    } else {
      console.error('获取充值记录失败:', response.message);
      tips.error(response.message || '获取充值记录失败');
      rechargeRecords.value = [];
    }
  } catch (error) {
    console.error('加载充值记录失败:', error);
    tips.error('加载充值记录失败');
    rechargeRecords.value = [];
  } finally {
    loading.value = false;
  }
};

// 页面加载时初始化
onMounted(() => {
  loadRechargeRecords();
});

// 页面卸载时清理定时器
onUnmounted(() => {
  // 清理所有冷却定时器
  Object.keys(cooldownTimers.value).forEach(orderId => {
    if (cooldownTimers.value[orderId]) {
      clearInterval(cooldownTimers.value[orderId]);
    }
  });
  cooldownTimers.value = {};
  queryCooldowns.value = {};
  console.log('[页面卸载] 充值查询定时器已清理');
});
</script>

<style scoped>
.recharge-container {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #2d3748;
}

.page-header p {
  margin: 0;
  color: #718096;
  font-size: 16px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
}

.stat-content h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #718096;
  font-weight: 500;
}

.stat-value {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  color: #2d3748;
}

.filters {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-group label {
  font-weight: 500;
  color: #4a5568;
  white-space: nowrap;
}

.filter-select {
  min-width: 180px;
  max-height: none;
}

/* 修复下拉框显示问题 */
.filter-select :deep(.ui-select-menu) {
  min-height: 200px;
  max-height: 300px;
}

.filter-select :deep(.ui-select-menu-option) {
  padding: 8px 12px;
  min-height: 40px;
  display: flex;
  align-items: center;
}

.recharge-list {
  margin-bottom: 32px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: white;
  border-radius: 12px;
}

.loading-state UIcon {
  font-size: 32px;
  color: #667eea;
  margin-bottom: 16px;
}

.empty-state UIcon {
  font-size: 64px;
  color: #cbd5e0;
  margin-bottom: 24px;
}

.empty-state h3 {
  margin: 0 0 12px;
  font-size: 20px;
  color: #2d3748;
}

.empty-state p {
  margin: 0 0 24px;
  color: #718096;
}

.records-grid {
  display: grid;
  gap: 24px;
}

.record-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s;
}

.record-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.record-info h4 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
}

.record-id {
  margin: 0 0 6px;
  font-size: 13px;
  color: #94a3b8;
  font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
}

.record-hint {
  margin: 0;
  font-size: 12px;
  color: #f59e0b;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fffbeb;
  border-radius: 6px;
  border-left: 3px solid #f59e0b;
  margin-top: 8px;
}

.hint-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.status-badge.pending {
  background: linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(108, 92, 231, 0.2);
}

.status-badge.processing {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  color: #92400e;
  box-shadow: 0 2px 8px rgba(214, 158, 46, 0.2);
}

.status-badge.completed {
  background: linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%);
  color: #166534;
  box-shadow: 0 2px 8px rgba(56, 161, 105, 0.2);
}

.status-badge.failed {
  background: linear-gradient(135deg, #ff7675 0%, #d63031 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.2);
}

.status-badge.unknown {
  background: #f1f5f9;
  color: #64748b;
}

.record-details {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-item .label {
  font-size: 14px;
  color: #718096;
}

.detail-item .value {
  font-weight: 500;
  color: #2d3748;
}

.detail-item .amount {
  font-size: 18px;
  font-weight: 700;
  color: #38a169;
}

.record-actions {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 2px solid #f1f5f9;
  justify-content: flex-end;
}

.query-button {
  min-width: 140px;
  font-weight: 600;
  transition: all 0.2s;
}

/* 查询按钮禁用状态样式 */
.record-actions :deep(button[disabled]) {
  opacity: 0.7;
  cursor: not-allowed;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}

.record-actions :deep(button[disabled]:hover) {
  transform: none;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .recharge-container {
    padding: 12px;
  }
  
  .stats-cards {
    grid-template-columns: 1fr;
  }
  
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-group {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-select {
    min-width: auto;
  }
  
  .record-header {
    flex-direction: column;
    gap: 12px;
  }
  
  .record-actions {
    justify-content: stretch;
  }
  
  .query-button {
    flex: 1;
  }

  .record-hint {
    font-size: 11px;
  }
}
</style> 