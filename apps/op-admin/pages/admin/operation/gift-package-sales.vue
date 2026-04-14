<template>
  <div class="gift-package-sales-page">
    <!-- 页面标题 -->
    <div class="page-header mb-6">
      <h1 class="text-2xl font-semibold text-gray-900">礼包销售统计</h1>
      <p class="text-sm text-gray-500 mt-1">查看礼包的销售数据和趋势分析</p>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-gift" class="w-8 h-8 text-blue-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">当天礼包总数</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ stats.todayTotal }}</dd>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-chart-bar" class="w-8 h-8 text-green-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">查询期间总数</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ stats.queryTotal }}</dd>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-tag" class="w-8 h-8 text-indigo-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">{{ currentCategoryLabel }}</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ stats.categoryTotal }}</dd>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-currency-yen" class="w-8 h-8 text-purple-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">查询期间总金额</dt>
            <dd class="text-2xl font-semibold text-gray-900">¥{{ formatAmount(stats.queryAmount) }}</dd>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-users" class="w-8 h-8 text-orange-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">购买用户数</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ stats.uniqueUsers }}</dd>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 查询条件 -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-base font-semibold">查询条件</h3>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <!-- 时间区间选择 -->
        <UFormGroup label="时间区间" class="flex-1">
          <UPopover :popper="{ placement: 'bottom-start' }">
            <UButton 
              variant="outline" 
              icon="i-heroicons-calendar-days"
              class="w-full justify-start"
            >
              {{ formatDateRange(filters.startDate, filters.endDate) }}
            </UButton>
            <template #panel="{ close }">
              <div class="flex divide-x divide-gray-200 dark:divide-gray-800">
                <!-- 快捷选择面板 -->
                <div class="flex flex-col py-4">
                  <UButton
                    v-for="range in dateRanges"
                    :key="range.label"
                    :label="range.label"
                    color="gray"
                    variant="ghost"
                    class="rounded-none px-6 text-sm justify-start"
                    :class="[isRangeSelected(range.days) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
                    @click="setDateRange(range.days)"
                  />
                </div>
                
                <!-- 日历组件 -->
                <DatePicker v-model="selected" @close="close" />
              </div>
            </template>
          </UPopover>
        </UFormGroup>

        <UFormGroup label="礼包类型">
          <USelect v-model="filters.category" :options="categoryOptions" />
        </UFormGroup>

        <UFormGroup label="礼包名称">
          <UInput v-model="filters.packageName" placeholder="输入礼包名称搜索" />
        </UFormGroup>

        <UFormGroup class="flex items-end">
          <div class="flex gap-2 w-full">
            <UButton @click="loadSalesData" color="primary" block :loading="loading">
              <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 mr-1" />
              查询
            </UButton>
            <UButton @click="resetFilters" color="gray" variant="outline">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
            </UButton>
          </div>
        </UFormGroup>
      </div>

      <!-- 日期范围提示 -->
      <div v-if="dateRangeError" class="mt-3 text-sm text-red-600 flex items-center gap-2">
        <UIcon name="i-heroicons-exclamation-triangle" />
        <span>{{ dateRangeError }}</span>
      </div>
      <div v-else-if="filters.startDate && filters.endDate" class="mt-3 text-sm text-blue-600 flex items-center gap-2">
        <UIcon name="i-heroicons-information-circle" />
        <span>查询天数: {{ daysDiff }} 天</span>
      </div>
    </UCard>

    <!-- 销售数据表格 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold">礼包销售明细</h3>
          <UButton @click="exportData" size="sm" variant="outline" :disabled="salesData.length === 0">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            导出数据
          </UButton>
        </div>
      </template>

      <div class="overflow-x-auto">
        <UTable
          :rows="salesData"
          :columns="columns"
          :loading="loading"
        >
          <template #package_name-data="{ row }">
            <div class="font-medium text-gray-900">{{ row.package_name }}</div>
            <div class="text-xs text-gray-500">{{ row.package_code }}</div>
          </template>

          <template #category-data="{ row }">
            <UBadge :color="getCategoryColor(row.category)" variant="soft">
              {{ getCategoryLabel(row.category) }}
            </UBadge>
          </template>

          <template #total_sales-data="{ row }">
            <span class="font-semibold text-blue-600">{{ row.total_sales }}</span>
          </template>

          <template #total_amount-data="{ row }">
            <span class="font-medium text-green-600">¥{{ formatAmount(row.total_amount) }}</span>
          </template>

          <template #unique_buyers-data="{ row }">
            <span class="text-gray-700">{{ row.unique_buyers }}</span>
          </template>

          <template #avg_price-data="{ row }">
            <span class="text-gray-600">¥{{ formatAmount(row.avg_price) }}</span>
          </template>
        </UTable>
      </div>

      <!-- 分页 -->
      <div v-if="salesData.length > 0" class="flex justify-between items-center p-4 border-t">
        <div class="text-sm text-gray-500">
          共 {{ pagination.total }} 条记录
        </div>
        <UPagination
          v-model="pagination.page"
          :page-count="pagination.pageSize"
          :total="pagination.total"
          @update:model-value="loadSalesData"
        />
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && salesData.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-chart-bar-square" class="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <p class="text-gray-500 mb-2">暂无销售数据</p>
        <p class="text-sm text-gray-400">请调整查询条件后重试</p>
      </div>
    </UCard>

    <!-- 详情弹窗 -->
    <UModal v-model="showDetailsModal" :ui="{ width: 'max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">礼包销售详情</h3>
            <UButton @click="showDetailsModal = false" size="xs" color="gray" variant="ghost" square>
              <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
            </UButton>
          </div>
        </template>

        <div v-if="selectedPackage" class="space-y-4">
          <!-- 礼包信息 -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h4 class="text-sm font-medium text-gray-700 mb-3">礼包信息</h4>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span class="text-gray-500">礼包名称：</span>
                <span class="font-medium">{{ selectedPackage.package_name }}</span>
              </div>
              <div>
                <span class="text-gray-500">礼包代码：</span>
                <span class="font-medium">{{ selectedPackage.package_code }}</span>
              </div>
              <div>
                <span class="text-gray-500">分类：</span>
                <UBadge :color="getCategoryColor(selectedPackage.category)" variant="soft">
                  {{ getCategoryLabel(selectedPackage.category) }}
                </UBadge>
              </div>
              <div>
                <span class="text-gray-500">售价：</span>
                <span class="font-medium text-green-600">¥{{ formatAmount(selectedPackage.price) }}</span>
              </div>
            </div>
          </div>

          <!-- 销售统计 -->
          <div class="grid grid-cols-3 gap-4">
            <div class="text-center p-4 bg-blue-50 rounded-lg">
              <div class="text-2xl font-bold text-blue-600">{{ selectedPackage.total_sales }}</div>
              <div class="text-sm text-gray-600 mt-1">总销量</div>
            </div>
            <div class="text-center p-4 bg-green-50 rounded-lg">
              <div class="text-2xl font-bold text-green-600">¥{{ formatAmount(selectedPackage.total_amount) }}</div>
              <div class="text-sm text-gray-600 mt-1">总金额</div>
            </div>
            <div class="text-center p-4 bg-purple-50 rounded-lg">
              <div class="text-2xl font-bold text-purple-600">{{ selectedPackage.unique_buyers }}</div>
              <div class="text-sm text-gray-600 mt-1">购买用户</div>
            </div>
          </div>

          <!-- 每日销售趋势 -->
          <div>
            <h4 class="text-sm font-medium text-gray-700 mb-3">每日销售趋势</h4>
            <div class="space-y-2">
              <div v-for="day in selectedPackage.dailyTrend" :key="day.date" 
                   class="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span class="text-sm text-gray-600">{{ day.date }}</span>
                <div class="flex items-center gap-4">
                  <span class="text-sm font-medium">销量: {{ day.sales }}</span>
                  <span class="text-sm font-medium text-green-600">¥{{ formatAmount(day.amount) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </UModal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useAuthStore } from '~/store/auth';

const authStore = useAuthStore();
const toast = useToast();

// 计算属性 - 是否是超级管理员
const isSuperAdmin = computed(() => {
  const permissions = authStore.permissions;
  return permissions && permissions.level === 0;
});

// 辅助函数：获取当前日期（本地时区，修复时差bug）
const getCurrentDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 辅助函数：获取过去N天的日期（本地时区）
const getPastDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 获取今天的日期
const today = computed(() => {
  return getCurrentDate();
});

// 获取7天前的日期
const sevenDaysAgo = computed(() => {
  return getPastDate(7);
});

// 响应式数据
const loading = ref(false);
const showDetailsModal = ref(false);
const selectedPackage = ref(null);

// 日期选择器数据
const selected = ref({ 
  start: new Date(getPastDate(7)), 
  end: new Date(getCurrentDate()) 
});

// 日期范围选项
const dateRanges = [
  { label: '最近3天', days: 3 },
  { label: '最近7天', days: 7 },
  { label: '最近14天', days: 14 },
  { label: '最近30天', days: 30 },
  { label: '最近60天', days: 60 },
  { label: '最近90天', days: 90 }
];

// 统计数据
const stats = reactive({
  todayTotal: 0,
  queryTotal: 0,
  categoryTotal: 0,  // 当前查询类型的总数
  queryAmount: 0,
  uniqueUsers: 0
});

// 当前类型标签（动态显示）
const currentCategoryLabel = computed(() => {
  if (!filters.category) {
    return '全部类型历史总数';
  }
  return `${getCategoryLabel(filters.category)}历史总数`;
});

// 查询条件
const filters = reactive({
  startDate: sevenDaysAgo.value,
  endDate: today.value,
  category: '',
  packageName: ''
});

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// 销售数据
const salesData = ref([]);

// 礼包类型选项
const categoryOptions = [
  { label: '全部类型', value: '' },
  { label: '通用礼包', value: 'general' },
  { label: '英雄超武', value: 'hero_super_weapon' },
  { label: '每日必买', value: 'daily_recharge' },
  { label: '每日消费', value: 'daily' },
  { label: '累计消费', value: 'cumulative' },
  { label: '限时礼包', value: 'limited' },
  { label: '限期礼包', value: 'scheduled' }
];

// 表格列配置
const columns = [
  { key: 'package_name', label: '礼包名称' },
  { key: 'category', label: '类型' },
  { key: 'total_sales', label: '销售数量', sortable: true },
  { key: 'total_amount', label: '销售金额', sortable: true },
  { key: 'unique_buyers', label: '购买用户', sortable: true },
  { key: 'avg_price', label: '平均单价' }
];

// 计算日期范围差异
const daysDiff = computed(() => {
  if (!filters.startDate || !filters.endDate) return 0;
  const start = new Date(filters.startDate);
  const end = new Date(filters.endDate);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
});

// 日期范围错误提示
const dateRangeError = computed(() => {
  if (!filters.startDate || !filters.endDate) {
    return '请选择开始和结束日期';
  }
  if (filters.startDate > filters.endDate) {
    return '开始日期不能大于结束日期';
  }
  return '';
});

// 获取认证头
const getAuthHeaders = () => ({
  authorization: String(authStore.id || '')
});

// 监听DatePicker选择变化
watch(selected, (newSelected) => {
  if (newSelected.start && newSelected.end) {
    filters.startDate = newSelected.start.toISOString().split('T')[0];
    filters.endDate = newSelected.end.toISOString().split('T')[0];
  }
}, { deep: true });

// 设置日期范围
const setDateRange = (days) => {
  const endDate = getCurrentDate();
  const startDate = getPastDate(days);
  
  filters.endDate = endDate;
  filters.startDate = startDate;
  
  selected.value = {
    start: new Date(startDate),
    end: new Date(endDate)
  };
};

// 检查是否选中某个日期范围
const isRangeSelected = (days) => {
  const expectedStart = getPastDate(days);
  const expectedEnd = getCurrentDate();
  return filters.startDate === expectedStart && filters.endDate === expectedEnd;
};

// 格式化日期范围显示
const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '请选择时间区间';
  return `${startDate} 至 ${endDate}`;
};

// 格式化金额
const formatAmount = (amount) => {
  return Number(amount || 0).toFixed(2);
};

// 获取分类颜色
const getCategoryColor = (category) => {
  const colorMap = {
    general: 'blue',
    hero_super_weapon: 'cyan',
    daily_recharge: 'green',
    daily: 'orange',
    cumulative: 'purple',
    limited: 'red',
    scheduled: 'pink'
  };
  return colorMap[category] || 'gray';
};

// 获取分类标签
const getCategoryLabel = (category) => {
  const labelMap = {
    general: '通用礼包',
    hero_super_weapon: '英雄超武',
    daily_recharge: '每日必买',
    daily: '每日消费',
    cumulative: '累计消费',
    limited: '限时礼包',
    scheduled: '限期礼包'
  };
  return labelMap[category] || category;
};

// 加载销售数据
const loadSalesData = async () => {
  if (dateRangeError.value) {
    toast.add({
      title: '查询条件错误',
      description: dateRangeError.value,
      color: 'red'
    });
    return;
  }

  loading.value = true;
  try {
    const response = await $fetch('/api/admin/gift-package-sales', {
      method: 'POST',
      body: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        category: filters.category,
        package_name: filters.packageName,
        page: pagination.page,
        page_size: pagination.pageSize
      },
      headers: getAuthHeaders()
    });

    if (response.success) {
      salesData.value = response.data.list || [];
      stats.todayTotal = response.data.stats?.today_total || 0;
      stats.queryTotal = response.data.stats?.query_total || 0;
      stats.categoryTotal = response.data.stats?.category_total || 0;
      stats.queryAmount = response.data.stats?.query_amount || 0;
      stats.uniqueUsers = response.data.stats?.unique_users || 0;
      pagination.total = response.data.total || 0;
    } else {
      toast.add({
        title: '加载失败',
        description: response.message || '获取销售数据失败',
        color: 'red'
      });
    }
  } catch (error) {
    console.error('加载销售数据失败:', error);
    toast.add({
      title: '加载失败',
      description: error.message || '网络错误',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

// 重置筛选条件
const resetFilters = () => {
  filters.startDate = sevenDaysAgo.value;
  filters.endDate = today.value;
  filters.category = '';
  filters.packageName = '';
  pagination.page = 1;
  loadSalesData();
};

// 查看详情
const viewDetails = async (row) => {
  try {
    const response = await $fetch('/api/admin/gift-package-sales/details', {
      method: 'POST',
      body: {
        package_id: row.package_id,
        start_date: filters.startDate,
        end_date: filters.endDate
      },
      headers: getAuthHeaders()
    });

    if (response.success) {
      selectedPackage.value = response.data;
      showDetailsModal.value = true;
    }
  } catch (error) {
    console.error('获取详情失败:', error);
    toast.add({
      title: '获取详情失败',
      description: error.message || '网络错误',
      color: 'red'
    });
  }
};

// 导出数据
const exportData = () => {
  // TODO: 实现导出功能
  toast.add({
    title: '导出功能',
    description: '导出功能开发中...',
    color: 'blue'
  });
};

// 页面初始化
onMounted(() => {
  // 权限检查
  if (!isSuperAdmin.value) {
    toast.add({
      title: '无权限访问',
      description: '只有超级管理员可以查看礼包销售统计',
      color: 'red'
    });
    navigateTo('/admin');
    return;
  }

  loadSalesData();
});
</script>

<style scoped>
.gift-package-sales-page {
  padding: 20px;
}

.page-header h1 {
  margin: 0;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .gift-package-sales-page {
    padding: 12px;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>

