<template>
  <div class="dashboard-page">
    <!-- 顶部统计卡片 -->
    <div class="stats-grid">
      <UCard class="stat-card stat-red">
        <div class="stat-content">
          <div class="stat-icon">
            <UIcon name="i-heroicons-user-plus" class="w-8 h-8" />
          </div>
          <div class="stat-info">
            <div class="stat-label">今日新增人数</div>
            <div class="stat-number">{{ formatNumber(todayUsers) }}</div>
          </div>
        </div>
      </UCard>
      
      <UCard class="stat-card stat-blue">
        <div class="stat-content">
          <div class="stat-icon">
            <UIcon name="i-heroicons-users" class="w-8 h-8" />
          </div>
          <div class="stat-info">
            <div class="stat-label">今日注册人数</div>
            <div class="stat-number">{{ formatNumber(todayRegister) }}</div>
          </div>
        </div>
      </UCard>
      
      <UCard class="stat-card stat-orange">
        <div class="stat-content">
          <div class="stat-icon">
            <UIcon name="i-heroicons-banknotes" class="w-8 h-8" />
          </div>
          <div class="stat-info">
            <div class="stat-label">今日充值金额</div>
            <div class="stat-number">{{ formatAmount(todayRecharge) }}</div>
          </div>
        </div>
      </UCard>
      
      <UCard class="stat-card stat-green">
        <div class="stat-content">
          <div class="stat-icon">
            <UIcon name="i-heroicons-banknotes" class="w-8 h-8" />
          </div>
          <div class="stat-info">
            <div class="stat-label">总充值金额</div>
            <div class="stat-number">¥{{ formatAmount(totalRechargeAmount) }}</div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 概览 -->
    <UCard class="data-overview">
      <template #header>
        <div class="overview-header">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chart-pie" class="w-5 h-5 text-blue-500" />
            <h3 class="overview-title">概览</h3>
          </div>
          <UTabs v-model="activeTab" :items="tabItems" />
        </div>
      </template>

      <div class="overview-content">


        <!-- 数据表格 -->
        <UTable 
          :rows="tableData" 
          :columns="tableColumns"
          :loading="loading"
          class="mb-4"
        >
          <template #register-data="{ row }">
            <UBadge :label="formatNumber(row.register)" color="blue" variant="soft" />
          </template>
          
          <template #validRegister-data="{ row }">
            <UBadge :label="formatNumber(row.validRegister)" color="green" variant="soft" />
          </template>
          
          <template #users-data="{ row }">
            <UBadge :label="formatNumber(row.users)" color="purple" variant="soft" />
          </template>
          
          <template #rechargeUsers-data="{ row }">
            <UBadge :label="formatNumber(row.rechargeUsers)" color="orange" variant="soft" />
          </template>
          
          <template #amount-data="{ row }">
            <span class="font-semibold text-green-600">{{ row.amount }}</span>
          </template>

          <template #empty-state>
            <div class="flex flex-col items-center justify-center py-12 gap-3">
              <UIcon name="i-heroicons-chart-pie" class="w-12 h-12 text-gray-300" />
              <h3 class="text-lg font-medium text-gray-900">暂无统计数据</h3>
              <p class="text-sm text-gray-500">请等待数据加载或调整时间范围</p>
            </div>
          </template>
        </UTable>

        <!-- 统计汇总 -->
        <div class="summary-section">
          <div class="summary-text">
            总计 ({{ tableData.length }}天): 
            注册: <span class="summary-number">[ {{ formatNumber(summary.totalRegister) }} ]</span> 
            有效注册: <span class="summary-number">[ {{ formatNumber(tableData.reduce((sum, item) => sum + item.validRegister, 0)) }} ]</span> 
            活跃用户: <span class="summary-number">[ {{ formatNumber(summary.totalUsers) }} ]</span> 
            充值人数: <span class="summary-number">[ {{ formatNumber(summary.totalRecharge) }} ]</span> 
            充值金额: <span class="summary-number">[ {{ summary.totalAmount.toFixed(2) }} ]</span> 
            新用户付费人数: <span class="summary-number">[ {{ formatNumber(summary.newPayUsers) }} ]</span>
          </div>
        </div>

        <!-- 数据总计 -->
        <div class="data-summary" v-if="totalRecords > 0">
          <span class="text-sm text-gray-600">
            共 {{ totalRecords }} 天数据
          </span>
        </div>
      </div>
    </UCard>

 
  </div>
</template>

<script setup>
import { useAuthStore } from '@/store/auth';

// 使用默认布局（包含侧边栏）
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();

// 加载状态
const loading = ref(false);

// 顶部统计数据
const todayUsers = ref(0);
const todayRegister = ref(0);
const todayRecharge = ref(0);
const totalRechargeAmount = ref(0);

// 选项卡配置 - 使用 1,2,3 映射到 7日,30日,60日
const activeTab = ref(1);

// 日期映射表
const daysMapping = {
  1: 7,
  2: 30,
  3: 60
};

const tabItems = [
  { label: '7日', value: 1 },
  { label: '30日', value: 2 },
  { label: '60日', value: 3 }
];

// 数据记录数
const totalRecords = ref(0);

// 表格列配置
const tableColumns = [
  { key: 'date', label: '日期' },
  { key: 'register', label: '注册' },
  { key: 'validRegister', label: '有效注册' },
  { key: 'users', label: '活跃用户' },
  { key: 'rechargeUsers', label: '充值人数' },
  { key: 'amount', label: '充值金额' },
  { key: 'newPlayerRate', label: '新用户付费率' },
  { key: 'newPayUsers', label: '新用户付费人数' }
];

// 开发信息表格配置
const devInfoColumns = [
  { key: 'game', label: '游戏' },
  { key: 'server', label: '区服' },
  { key: 'time', label: '时间' }
];

const devInfoData = ref([
  { game: '', server: '', time: '', isEmpty: true }
]);

// 公告表格配置
const announcementColumns = [
  { key: 'announcement', label: '公告' },
  { key: 'publishTime', label: '发布时间' }
];

const announcementData = ref([
  { announcement: '', publishTime: '', isEmpty: true }
]);

// 表格数据
const tableData = ref([]);

// 统计汇总
const summary = ref({
  totalRegister: 0,
  totalLogin: 0,
  totalRecharge: 0,
  totalUsers: 0,
  totalAmount: 0,
  newPayUsers: 0
});

// 页面加载时获取数据
onMounted(async () => {
  authStore.init();
  await fetchDashboardData();
});

// 获取仪表板数据
const fetchDashboardData = async () => {
  try {
    loading.value = true;
    
    // 计算日期范围
    const endDate = new Date();
    const startDate = new Date();
    const daysToSubtract = daysMapping[activeTab.value+1] || 7;
    
    console.log('当前选中的tab:', activeTab.value);
    console.log('要减去的天数:', daysToSubtract);
    
    // 减去 (天数 - 1) 以包含今天
    startDate.setDate(endDate.getDate() - (daysToSubtract - 1));
    
    const dateRange = {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
    
    console.log('计算的日期范围:', dateRange);

    // 获取管理员信息
    const adminId = authStore.isUser ? authStore.userInfo?.id : authStore.id;
    const adminLevel = authStore.isUser ? authStore.userInfo?.level : authStore.permissions?.level;

    // 使用daily-report-details API获取每天详细数据
    const detailsResponse = await $fetch('/api/admin/daily-report-details', {
      method: 'GET',
      query: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        adminId: adminId?.toString()
      }
    });

    if (detailsResponse.success) {
      const data = detailsResponse.data;
      console.log('API返回数据:', data); // 添加调试信息
      
      // 获取今日数据用于顶部统计卡片
      const today = new Date().toISOString().split('T')[0];
      const todayData = data.details?.find(d => d.date === today);
      
      // 更新顶部统计卡片
      todayUsers.value = todayData?.activeUsers || 0; // 活跃用户数
      todayRegister.value = todayData?.registerUsers || 0; // 注册人数
      todayRecharge.value = parseFloat(todayData?.realRechargeAmount || '0'); // 充值金额(不含平台币)
      totalRechargeAmount.value = data.details?.reduce((sum, item) => sum + parseFloat(item.realRechargeAmount || '0'), 0) || 0; // 总充值金额
      
      // 更新汇总数据
      const totalRegister = data.details?.reduce((sum, item) => sum + (item.registerUsers || 0), 0) || 0;
      const totalUsers = data.details?.reduce((sum, item) => sum + (item.activeUsers || 0), 0) || 0;
      const totalRechargeUsers = data.details?.reduce((sum, item) => sum + (item.payUsers || 0), 0) || 0;
      const totalAmount = data.details?.reduce((sum, item) => sum + parseFloat(item.realRechargeAmount || '0'), 0) || 0;
      const totalNewPayUsers = data.details?.reduce((sum, item) => sum + (item.newPayUsers || 0), 0) || 0;
      
      summary.value = {
        totalRegister: totalRegister,
        totalLogin: totalUsers,
        totalRecharge: totalRechargeUsers,
        totalUsers: totalUsers,
        totalAmount: totalAmount,
        newPayUsers: totalNewPayUsers
      };
      
             // 格式化每日详细数据
       if (data.details && data.details.length > 0) {
         tableData.value = data.details.map(item => ({
           date: item.date,
           register: item.registerUsers || 0,
           validRegister: item.validRegisterUsers || 0,
           users: item.activeUsers || 0,
           rechargeUsers: item.payUsers || 0,
           amount: `¥${parseFloat(item.realRechargeAmount || '0').toFixed(2)}`,
           newPlayerRate: parseFloat(item.newPayRate || '0').toFixed(1) + '%',
           newPayUsers: item.newPayUsers || 0
                  }));
         totalRecords.value = data.details.length;
       } else {
         tableData.value = [];
         totalRecords.value = 0;
       }
    }

  } catch (error) {
    console.error('获取数据失败:', error);
    
    // 显示错误提示
    const toast = useToast();
    toast.add({
      title: '数据加载失败',
      description: '请检查网络连接或联系管理员',
      color: 'red',
      timeout: 3000
    });
    
    // 保持默认数据，避免页面崩溃
    todayUsers.value = 0;
    todayRegister.value = 0;
    todayRecharge.value = 0;
    totalRechargeAmount.value = 0;
  } finally {
    loading.value = false;
  }
};

// 监听选项卡变化
watch(activeTab, (newTab) => {
  // 重新加载数据
  fetchDashboardData();
});


// 格式化数值显示
const formatNumber = (value) => {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value.toLocaleString() : value;
};

// 格式化金额显示
const formatAmount = (value) => {
  if (value === null || value === undefined) return '0.00';
  return typeof value === 'number' ? value.toFixed(2) : value;
};
</script>

<style scoped>
.dashboard-page {
  @apply space-y-6;
}

/* 统计卡片网格 */
.stats-grid {
  @apply grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6;
}

/* 统计卡片样式 */
.stat-card {
  @apply relative overflow-hidden;
}

.stat-card.stat-red {
  background: linear-gradient(135deg, #f87171, #ef4444);
  @apply text-white;
}

.stat-card.stat-blue {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  @apply text-white;
}

.stat-card.stat-orange {
  background: linear-gradient(135deg, #fb923c, #f97316);
  @apply text-white;
}

.stat-card.stat-green {
  background: linear-gradient(135deg, #34d399, #10b981);
  @apply text-white;
}

.stat-content {
  @apply flex items-center gap-4 p-6;
}

.stat-icon {
  @apply flex-shrink-0 opacity-80;
}

.stat-info {
  @apply flex-1 min-w-0;
}

.stat-label {
  @apply text-sm font-medium opacity-90 mb-1;
}

.stat-number {
  @apply text-2xl font-bold leading-none;
}

/* 数据概览 */
.overview-header {
  @apply flex items-center justify-between;
}

.overview-title {
  @apply text-lg font-semibold text-gray-900;
}

.overview-content {
  @apply p-6;
}

/* 统计汇总 */
.summary-section {
  @apply bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200;
}

.summary-text {
  @apply text-sm font-medium text-gray-700 leading-relaxed;
}

.summary-number {
  @apply text-blue-600 font-bold;
}

/* 分页区域 */
.data-summary {
  @apply flex items-center justify-end pt-4 border-t border-gray-200;
}

/* 底部面板 */
.bottom-panels {
  @apply grid grid-cols-1 lg:grid-cols-2 gap-6;
}

.panel-header {
  @apply flex items-center gap-2;
}

.panel-header h4 {
  @apply text-lg font-semibold text-gray-900;
}

/* 信息表格 */
.info-table {
  @apply min-h-[120px];
}

/* 响应式优化 */
@media (max-width: 768px) {
  .overview-header {
    @apply flex-col items-start gap-4;
  }
  
  .data-summary {
    @apply justify-start;
  }
  
  .summary-text {
    @apply text-xs leading-loose;
  }
}

/* 空数据样式 */
:deep(.info-table tbody tr td) {
  @apply text-center text-gray-400 italic;
}
</style> 