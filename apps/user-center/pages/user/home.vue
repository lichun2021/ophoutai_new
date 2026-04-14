<template>
  <div class="user-home">
    <!-- 用户欢迎栏 -->
    <div class="welcome-bar">
      <div class="welcome-top-row">
        <div class="user-info">
          <div class="avatar">
            <UIcon name="i-heroicons-user-circle" />
          </div>
          <h2 class="username">{{ authStore.userInfo?.username || '用户' }}</h2>
        </div>
        <div class="user-actions">
          <UButton @click="logout" color="red" variant="ghost" size="sm" icon="i-heroicons-arrow-right-on-rectangle">
            退出
          </UButton>
        </div>
      </div>

    </div>

    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 平台币卡片 -->
      <div class="balance-card">
        <div class="balance-header">
          <div class="balance-title-row">
            <h2>平台币余额</h2>
            <UButton 
              @click="refreshBalance" 
              :loading="refreshing"
              color="white" 
              variant="soft" 
              size="xs" 
              icon="i-heroicons-arrow-path"
              square
            />
          </div>
          <div class="balance-amount">
            <img src="/platform-coin.svg" alt="平台币" class="currency-icon" />
            <span class="amount">{{ formatBalance(authStore.userInfo?.platform_coins) }}</span>
          </div>
        </div>
        
        <div class="balance-actions">
          <UButton @click="recharge" color="primary" icon="i-heroicons-plus-circle">
            平台币充值
          </UButton>
          <UButton @click="goToMall" color="green" icon="i-heroicons-gift">
            礼包商城
          </UButton>
          <UButton @click="goToRechargeRecords" color="blue" icon="i-heroicons-document-text">
            充值记录
          </UButton>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">
            <UIcon name="i-heroicons-credit-card" />
          </div>
          <div class="stat-content">
            <h4>累计充值</h4>
            <p class="stat-value">¥{{ formatRecharge(stats.totalRecharge) }}</p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">
            <UIcon name="i-heroicons-shopping-bag" />
          </div>
          <div class="stat-content">
            <h4>购买次数</h4>
            <p class="stat-value">{{ stats.purchaseCount }}次</p>
          </div>
        </div>
      </div>

      <!-- 最近订单 -->
      <div class="recent-orders">
        <div class="section-header">
          <h3>最近订单</h3>
          <span class="order-note">(仅显示最近3笔)</span>
        </div>
        
        <!-- 有订单时显示列表 -->
        <div v-if="recentOrders.length > 0" class="orders-list">
          <div v-for="order in recentOrders" :key="order.id" class="order-item">
            <div class="order-info">
              <h4>{{ order.item_name || '平台幣充值' }}</h4>
              <p>{{ formatDate(order.created_at) }}</p>
              <span class="order-status" :class="order.status">{{ getOrderStatusText(order.status) }}</span>
            </div>
            <div class="order-amount">
              <img src="/platform-coin.svg" alt="平台币" class="order-coin-icon" />
              {{ formatBalance(order.amount) }}
            </div>
          </div>
        </div>
        
        <!-- 没有订单时显示空状态 -->
        <div v-else class="empty-orders">
          <div class="empty-orders-content">
            <UIcon name="i-heroicons-shopping-bag" class="empty-orders-icon" />
            <h4>暂无购买记录</h4>
            <p>您还没有任何购买记录，快去商城看看吧！</p>
            <div class="empty-orders-actions">
              <UButton @click="goToMall" color="primary" size="sm" icon="i-heroicons-gift">
                前往商城
              </UButton>
            </div>
          </div>
        </div>
        
        <div class="view-all-orders">
          <UButton variant="ghost" @click="viewAllOrders">查看全部购买记录</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';

// 检查登录状态
definePageMeta({
  middleware: 'auth',
  layout: 'user'
});

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

// 响应式数据
const stats = ref({
  totalRecharge: 0,
  purchaseCount: 0
});

const recentOrders = ref([]);
const refreshing = ref(false);

// 刷新余额
const refreshBalance = async () => {
  refreshing.value = true;
  try {
    const success = await authStore.refreshBalance();
    if (success) {
      tips.success('余额已刷新');
    } else {
      tips.warning('刷新失败，请重试');
    }
  } catch (error) {
    console.error('刷新余额失败:', error);
    tips.error('刷新失败');
  } finally {
    refreshing.value = false;
  }
};

// 方法
const formatBalance = (amount) => {
  if (!amount) return '0';
  return Math.floor(parseFloat(amount)).toString();
};

const formatRecharge = (amount) => {
  if (!amount) return '0.00';
  return parseFloat(amount).toFixed(2);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN');
};

const recharge = () => {
  router.push('/user/cashier');
};

const goToMall = () => {
  router.push('/user/mall');
};

const goToRechargeRecords = () => {
  router.push('/user/recharge');
};

const viewAllOrders = () => {
  router.push('/user/orders');
};

// 退出登录
const logout = async () => {
  try {
    // 清除登录状态 - 注意方法名是 logOut
    authStore.logOut();
    // 显示退出成功提示
    tips.success('已成功退出登录');
  } catch (error) {
    console.error('退出登录失败:', error);
    tips.error('退出登录失败');
  }
};

// 获取订单状态文本
const getOrderStatusText = (status) => {
  const statusMap = {
    'pending': '待付款',
    'paid': '已付款', 
    'completed': '已完成',
    'cancelled': '已取消',
    'failed': '支付失败'
  };
  return statusMap[status] || '未知';
};

// 加载用户数据
const loadUserData = async () => {
  try {
    if (!authStore.userInfo?.id) {
      tips.error('用户信息不完整');
      return;
    }

    // 调用真实的API获取用户统计数据
    const response = await $fetch('/api/client/user/home-stats', {
      query: {
        user_id: authStore.userInfo.id
      }
    });

    if (response.code === 200) {
      // 更新统计数据
      stats.value = {
        totalRecharge: response.data.totalRecharge || 0,
        purchaseCount: response.data.purchaseCount || 0
      };

      // 转换最近订单数据格式
      recentOrders.value = (response.data.recentOrders || []).map(record => ({
        id: record.id,
        item_name: record.product_name,
        amount: record.amount,
        status: record.payment_status === 3 ? 'completed' : 
               record.payment_status === 1 ? 'pending' : 'failed',
        created_at: record.created_at
      }));
    } else {
      console.error('获取统计数据失败:', response.message);
      tips.error(response.message || '获取统计数据失败');
      // 使用默认值
      stats.value = {
        totalRecharge: 0,
        purchaseCount: 0
      };
      recentOrders.value = [];
    }

  } catch (error) {
    console.error('加载用户数据失败:', error);
    tips.error('加载用户数据失败');
    // 使用默认值
    stats.value = {
      totalRecharge: 0,
      purchaseCount: 0
    };
    recentOrders.value = [];
  }
};

// 页面加载时初始化
onMounted(async () => {
  if (!authStore.isLoggedIn || !authStore.isUser) {
    router.push('/user/login');
    return;
  }
  // 先刷新余额，再加载其他数据
  await authStore.refreshBalance();
  loadUserData();
});
</script>

<style scoped>
.user-home {
  min-height: 100vh;
  background: #f5f7fa;
}

.main-content {
  padding: 16px;
}

.balance-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 32px;
  color: white;
  margin-bottom: 32px;
}

.balance-header {
  margin-bottom: 24px;
}

.balance-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.balance-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  opacity: 0.9;
}

.balance-amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.currency-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.amount {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
}

.balance-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.balance-actions :deep(.btn) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(10px);
}

.balance-actions :deep(.btn:hover) {
  background: rgba(255, 255, 255, 0.3);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
  max-width: 600px;
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
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.stat-content h4 {
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
}

.status-active {
  color: #38a169 !important;
}

.recent-orders {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #2d3748;
  font-weight: 600;
}

.order-note {
  font-size: 12px;
  color: #718096;
  background: #f7fafc;
  padding: 4px 8px;
  border-radius: 4px;
}

.orders-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #e2e8f0;
}

.order-item:last-child {
  border-bottom: none;
}

.order-info h4 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #2d3748;
  font-weight: 500;
}

.order-info p {
  margin: 0 0 4px;
  font-size: 14px;
  color: #718096;
}

.order-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.order-status.pending {
  background: #fef5e7;
  color: #d69e2e;
}

.order-status.completed {
  background: #f0fff4;
  color: #38a169;
}

.order-status.paid {
  background: #e6fffa;
  color: #319795;
}

.order-status.cancelled {
  background: #fed7d7;
  color: #e53e3e;
}

.order-status.failed {
  background: #fed7d7;
  color: #e53e3e;
}

.order-amount {
  font-size: 16px;
  font-weight: 600;
  color: #2d3748;
  display: flex;
  align-items: center;
  gap: 4px;
}

.order-coin-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.view-all-orders {
  margin-top: 16px;
  text-align: center;
}

.empty-orders {
  padding: 32px 24px;
  text-align: center;
}

.empty-orders-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 300px;
  margin: 0 auto;
}

.empty-orders-icon {
  width: 48px;
  height: 48px;
  color: #cbd5e0;
}

.empty-orders h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
}

.empty-orders p {
  margin: 0;
  font-size: 14px;
  color: #718096;
  line-height: 1.5;
}

.empty-orders-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* 欢迎栏样式 - 只在移动端显示 */
.welcome-bar {
  background: white;
  padding: 16px;
  color: #2d3748;
  display: none; /* 桌面端隐藏 */
  flex-direction: column;
  gap: 8px;
  border-radius: 12px;
  margin: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.welcome-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f7fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #667eea;
}

.username {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
}

.user-actions {
  display: flex;
  align-items: center;
}



@media (max-width: 768px) {
  .welcome-bar {
    display: flex; /* 移动端显示 */
  }

  .main-content {
    padding: 0 12px 12px 12px;
  }
  
  .balance-card {
    padding: 20px;
    margin-bottom: 20px;
  }
  
  .balance-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .amount {
    font-size: 36px;
  }
  
  /* 统计卡片移动端优化 */
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 20px;
    max-width: none;
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

  .stat-content h4 {
    font-size: 12px;
  }

  .stat-value {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .balance-card {
    padding: 16px;
  }
  
  .balance-header h2 {
    font-size: 18px;
  }
  
  .amount {
    font-size: 32px;
  }

  /* 统计卡片小屏优化 */
  .stats-grid {
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

  .stat-content h4 {
    font-size: 10px;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 16px;
  }
  
  .currency-icon {
    width: 24px;
    height: 24px;
  }
}
</style> 