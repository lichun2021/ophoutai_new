<template>
  <div class="orders-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1>购买记录</h1>
      <p>查看您的所有购买记录和消费明细</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-icon">
          <UIcon name="i-heroicons-currency-dollar" />
        </div>
                  <div class="stat-content">
            <h3>累计消费(平台币)</h3>
            <p class="stat-value">
              <img src="/platform-coin.svg" alt="平台币" class="stat-coin-icon" />
              {{ formatCoins(totalSpent) }}
            </p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">
            <UIcon name="i-heroicons-shopping-cart" />
          </div>
          <div class="stat-content">
            <h3>购买次数</h3>
            <p class="stat-value">{{ purchaseCount }}次</p>
          </div>
      </div>
    </div>

    <!-- 筛选条件 -->
    <div class="filters">
      <div class="filter-group">
        <label>订单状态：</label>
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

    <!-- 购买记录列表 -->
    <div class="orders-list">
      <div v-if="loading" class="loading-state">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        <p>加载中...</p>
      </div>

      <div v-else-if="filteredOrders.length === 0" class="empty-state">
        <div class="empty-content">
          <UIcon name="i-heroicons-shopping-bag" class="empty-icon" />
          <h3>暂无购买记录</h3>
          <p>您还没有购买任何商品，快去商城看看精彩的礼包吧！</p>
          
          <!-- 推荐操作 -->
          <div class="recommend-actions">
            <div class="action-buttons">
              <UButton 
                v-if="authStore.userInfo?.platform_coins > 0" 
                @click="goToMall" 
                color="primary" 
                size="lg" 
                icon="i-heroicons-gift"
              >
                前往商城
              </UButton>
              <UButton 
                v-else
                @click="goToRecharge" 
                color="green" 
                size="lg" 
                icon="i-heroicons-credit-card"
              >
                平台币充值
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="orders-grid">
        <div 
          v-for="order in filteredOrders" 
          :key="order.id" 
          class="order-card"
        >
          <div class="order-header">
            <div class="order-info">
              <h4>{{ order.package_name }}</h4>
              <p class="order-id">订单号：{{ order.order_id }}</p>
            </div>
            <div class="order-status">
              <span class="status-badge" :class="getStatusClass(order.payment_status)">
                {{ getStatusText(order.payment_status) }}
              </span>
            </div>
          </div>

          <div class="order-content">
            <div class="order-details">
              <p class="order-description">{{ order.description }}</p>
              
              <div class="order-meta">
                <div class="meta-item">
                  <span class="label">消费金额：</span>
                  <span class="value price-value">
                    <img src="/platform-coin.svg" alt="平台币" class="coin-icon-small" />
                    {{ formatCoins(order.amount) }}
                  </span>
                  <span v-if="order.role_name" class="value" style="margin-left: 12px; color: #6b7280; font-size: 0.875rem;">
                    · {{ order.role_name }}
                  </span>
                </div>
                
                <div class="meta-item">
                  <span class="label">购买时间：</span>
                  <span class="value">{{ formatDateTime(order.created_at) }}</span>
                </div>

                <div v-if="order.completed_at" class="meta-item">
                  <span class="label">完成时间：</span>
                  <span class="value">{{ formatDateTime(order.completed_at) }}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div 
        v-if="pagination.total > pagination.pageSize" 
        class="orders-pagination"
      >
        <div class="pagination-info">
          共 {{ pagination.total }} 条记录
        </div>
        <UPagination
          v-model="pagination.page"
          :page-count="pagination.pageSize"
          :total="pagination.total"
          @update:model-value="handlePageChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
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
const purchaseOrders = ref([]);
const loading = ref(false);
const statusFilter = ref('all');
const timeFilter = ref('all');

// 状态选项 - 根据 payment_status 字段定义
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' }
];

// 时间选项
const timeOptions = [
  { label: '全部时间', value: 'all' },
  { label: '最近7天', value: '7days' },
  { label: '最近30天', value: '30days' },
  { label: '最近3个月', value: '3months' }
];

// 计算属性
const totalSpent = ref(0);
const purchaseCount = ref(0);
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1
});

const filteredOrders = computed(() => {
  let filtered = purchaseOrders.value;

  // 状态筛选（冗余校验，后端已过滤，仅防止边界情况）
  if (statusFilter.value === 'success') {
    filtered = filtered.filter(order => order.payment_status === 3);
  } else if (statusFilter.value === 'failed') {
    filtered = filtered.filter(order => order.payment_status !== 3);
  }

  // 时间筛选 - 使用 created_at
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
    
    filtered = filtered.filter(order => new Date(order.created_at) >= cutoff);
  }

  return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
});

// 方法
const formatCoins = (coins) => {
  if (!coins) return '0';
  return Math.floor(parseFloat(coins)).toString();
};

const handlePageChange = () => {
  loadPurchaseOrders();
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



const goToMall = () => {
  router.push('/user/mall');
};

const goToRecharge = () => {
  router.push('/user/cashier');
};

watch(statusFilter, () => {
  pagination.page = 1;
  loadPurchaseOrders();
});

watch(timeFilter, () => {
  pagination.page = 1;
  loadPurchaseOrders();
});

// 加载购买记录
const loadPurchaseOrders = async () => {
  loading.value = true;
  try {
    const userId = authStore.userInfo?.id || authStore.id;
    if (!userId) {
      tips.error('用户信息获取失败');
      return;
    }

    // 调用真实的API从PaymentRecords表获取平台币消费记录
    const response = await $fetch('/api/client/spend-history', {
      query: {
        user_id: userId,
        page: pagination.page,
        pageSize: pagination.pageSize,
        status: statusFilter.value
      }
    });

    if (response.code === 200) {
      // 转换API返回的数据格式为前端需要的格式
      purchaseOrders.value = (response.data.records || []).map(record => ({
        id: record.id,
        order_id: record.mch_order_id || record.transaction_id,
        package_name: record.product_name,
        description: record.product_des, // 使用商品描述作为描述
        amount: record.amount,
        payment_status: record.payment_status,
        icon_url: null, // PaymentRecords中没有图标信息
        created_at: record.created_at,
        completed_at: record.payment_status === 3 ? record.notify_at || record.created_at : null,
        role_name: record.role_name // 角色名字
      }));
      pagination.total = response.data.pagination?.total || 0;
      pagination.totalPages = response.data.pagination?.totalPages || 1;
      purchaseCount.value = response.data.completedCount || 0;
      totalSpent.value = response.data.totalSpent || 0;
    } else {
      console.error('获取购买记录失败:', response.message);
      tips.error(response.message || '获取购买记录失败');
      purchaseOrders.value = [];
      pagination.total = 0;
      pagination.totalPages = 1;
      purchaseCount.value = 0;
      totalSpent.value = 0;
    }
  } catch (error) {
    console.error('加载购买记录失败:', error);
    tips.error('加载购买记录失败');
    purchaseOrders.value = [];
    pagination.total = 0;
    pagination.totalPages = 1;
    purchaseCount.value = 0;
    totalSpent.value = 0;
  } finally {
    loading.value = false;
  }
};

// 页面加载时初始化
onMounted(() => {
  loadPurchaseOrders();
});
</script>

<style scoped>
.orders-container {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
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
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-content h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #718096;
  font-weight: 500;
}

.stat-value {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #2d3748;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-coin-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
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

.orders-list {
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

.empty-content {
  max-width: 600px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 64px;
  color: #cbd5e0;
  margin-bottom: 24px;
}

.empty-state h3 {
  margin: 0 0 12px;
  font-size: 24px;
  color: #2d3748;
  font-weight: 600;
}

.empty-state p {
  margin: 0 0 32px;
  color: #718096;
  font-size: 16px;
}

/* 购买引导样式 */
.purchase-guide {
  background: #f7fafc;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  text-align: left;
}

.purchase-guide h4 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #2d3748;
  font-weight: 600;
}

.guide-steps {
  display: grid;
  gap: 12px;
}

.guide-step {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-number {
  width: 24px;
  height: 24px;
  background: #667eea;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-text {
  color: #4a5568;
  font-size: 14px;
}

/* 推荐操作样式 */
.recommend-actions {
  margin-bottom: 32px;
}

.recommend-actions h4 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #2d3748;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

/* 购买说明样式 */
.purchase-info {
  background: #edf2f7;
  border-radius: 12px;
  padding: 24px;
  text-align: left;
}

.purchase-info h4 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #2d3748;
  font-weight: 600;
}

.info-list {
  margin: 0;
  padding-left: 20px;
  color: #4a5568;
}

.info-list li {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.info-list li:last-child {
  margin-bottom: 0;
}

.orders-grid {
  display: grid;
  gap: 20px;
}

.orders-pagination {
  margin-top: 24px;
  padding: 16px;
  background: white;
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pagination-info {
  font-size: 14px;
  color: #64748b;
}

.order-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid #f1f5f9;
  position: relative;
  overflow: hidden;
}

.order-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  opacity: 0;
  transition: opacity 0.3s;
}

.order-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border-color: #e2e8f0;
  transform: translateY(-2px);
}

.order-card:hover::before {
  opacity: 1;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #f7fafc;
}

.order-info h4 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: #1a202c;
  letter-spacing: -0.01em;
}

.order-id {
  margin: 0 0 6px;
  font-size: 13px;
  color: #94a3b8;
  font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
}

.order-hint {
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

.status-badge.completed {
  background: linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%);
  color: #166534;
  box-shadow: 0 2px 8px rgba(56, 161, 105, 0.2);
}

.status-badge.processing {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  color: #92400e;
  box-shadow: 0 2px 8px rgba(214, 158, 46, 0.2);
}

.status-badge.failed {
  background: linear-gradient(135deg, #ff7675 0%, #d63031 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.2);
}

.status-badge.pending {
  background: linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(108, 92, 231, 0.2);
}

.status-badge.unknown {
  background: #f1f5f9;
  color: #64748b;
}

.order-content {
  margin-bottom: 20px;
}

.order-details {
  width: 100%;
}

.order-description {
  margin: 0 0 16px;
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}

.order-meta {
  display: grid;
  gap: 12px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 12px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meta-item .label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.meta-item .value {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

.price-value {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #667eea !important;
  font-weight: 700;
  font-size: 16px;
}

.coin-icon-small {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}


/* 响应式设计 */
@media (max-width: 768px) {
  .orders-container {
    padding: 12px;
  }

  .page-header h1 {
    font-size: 24px;
  }

  .page-header {
    margin-bottom: 20px;
  }

  /* 统计卡片移动端优化 */
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }

  .stat-card {
    padding: 16px;
    gap: 12px;
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }

  .stat-content h3 {
    font-size: 12px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 20px;
    gap: 4px;
  }

  .stat-coin-icon {
    width: 16px;
    height: 16px;
  }

  /* 筛选条件移动端优化 */
  .filters {
    padding: 16px;
    gap: 16px;
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 16px;
  }
  
  .filter-group {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .filter-group label {
    font-size: 14px;
  }

  .filter-select {
    min-width: auto;
  }

  /* 订单卡片移动端优化 */
  .orders-grid {
    gap: 16px;
  }

  .order-card {
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .order-header {
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 12px;
  }

  .order-info h4 {
    font-size: 16px;
    margin-bottom: 6px;
  }

  .order-id {
    font-size: 12px;
    margin-bottom: 4px;
  }
  
  .order-hint {
    font-size: 11px;
    padding: 4px 8px;
  }
  
  .order-content {
    margin-bottom: 16px;
  }

  .order-description {
    font-size: 13px;
    margin-bottom: 12px;
  }

  .order-meta {
    gap: 10px;
    padding: 12px;
  }
  
  .meta-item {
    flex-direction: row;
    align-items: center;
  }

  .meta-item .label {
    font-size: 12px;
  }

  .meta-item .value {
    font-size: 13px;
  }

  .price-value {
    font-size: 14px;
    gap: 3px;
  }

  .coin-icon-small {
    width: 14px;
    height: 14px;
  }

  /* 空状态移动端样式 */
  .empty-state {
    padding: 32px 16px;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .empty-state h3 {
    font-size: 20px;
    margin-bottom: 8px;
  }

  .empty-state p {
    font-size: 14px;
    margin-bottom: 24px;
  }

  .purchase-guide,
  .purchase-info {
    padding: 16px;
  }

  .action-buttons {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .guide-steps {
    gap: 8px;
  }

  .step-number {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }

  .step-text {
    font-size: 13px;
  }
}

/* 小屏设备进一步优化 */
@media (max-width: 480px) {
  .orders-container {
    padding: 8px;
  }

  /* 统计卡片更紧凑 */
  .stats-cards {
    gap: 8px;
    margin-bottom: 16px;
  }

  .stat-card {
    padding: 12px;
    gap: 8px;
    flex-direction: column;
    text-align: center;
  }

  .stat-icon {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }

  .stat-content h3 {
    font-size: 10px;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 16px;
  }

  .stat-coin-icon {
    width: 14px;
    height: 14px;
  }

  /* 筛选条件更紧凑 */
  .filters {
    padding: 12px;
    gap: 12px;
    margin-bottom: 12px;
  }

  .filter-group {
    gap: 6px;
  }

  .filter-group label {
    font-size: 13px;
  }

  /* 订单卡片小屏优化 */
  .orders-grid {
    gap: 12px;
  }

  .order-card {
    padding: 12px;
    border-radius: 10px;
  }

  .order-header {
    margin-bottom: 12px;
    padding-bottom: 10px;
  }

  .order-info h4 {
    font-size: 14px;
  }

  .order-id {
    font-size: 11px;
  }

  .order-content {
    margin-bottom: 12px;
  }

  .order-description {
    font-size: 12px;
    margin-bottom: 10px;
  }

  .order-meta {
    gap: 8px;
    padding: 10px;
  }

  .meta-item .label {
    font-size: 11px;
  }

  .meta-item .value {
    font-size: 12px;
  }

  .price-value {
    font-size: 13px;
  }

  .status-badge {
    padding: 4px 10px;
    font-size: 11px;
  }

  /* 空状态小屏优化 */
  .empty-state {
    padding: 24px 12px;
  }

  .empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .empty-state h3 {
    font-size: 18px;
    margin-bottom: 6px;
  }

  .empty-state p {
    font-size: 13px;
    margin-bottom: 20px;
  }

  .action-buttons {
    gap: 10px;
  }
}
</style> 