<template>
  <div class="gift-package-records-page">
    <!-- 页面标题 -->
    <div class="page-header mb-6">
      <h1 class="text-2xl font-semibold text-gray-900 mb-4">玩家礼包发放记录</h1>
      <div class="flex flex-wrap gap-2">
        <UButton @click="exportAllData" :loading="exportLoading" color="green">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-2" />
          导出数据
        </UButton>
        <UButton @click="refreshData" :loading="loading" color="gray">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
          刷新数据
        </UButton>
      </div>
    </div>

    <!-- 筛选条件卡片 -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-gray-500" />
          <h2 class="text-base font-medium">查询条件</h2>
        </div>
      </template>

      <div class="filter-content">
        <!-- 第一行筛选条件 -->
        <div class="filter-row">
          <UFormGroup label="用户ID">
            <UInput 
              v-model="filters.user_id" 
              placeholder="请输入用户ID"
              icon="i-heroicons-user"
            />
          </UFormGroup>
          
          <UFormGroup label="角色ID">
            <UInput 
              v-model="filters.thirdparty_uid" 
              placeholder="请输入角色ID"
              icon="i-heroicons-identification"
            />
          </UFormGroup>
          
          <UFormGroup label="商户订单号">
            <UInput 
              v-model="filters.mch_order_id" 
              placeholder="请输入商户订单号"
              icon="i-heroicons-document-text"
            />
          </UFormGroup>
          
          <UFormGroup label="礼包类型">
            <USelect 
              v-model="filters.packageType" 
              :options="packageTypeOptions"
              placeholder="选择礼包类型"
            />
          </UFormGroup>
          
          <UFormGroup label="支付状态">
            <USelect 
              v-model="filters.status" 
              :options="statusOptions"
              placeholder="选择支付状态"
            />
          </UFormGroup>
        </div>

        <!-- 第二行筛选条件 -->
        <div class="filter-row">
          <UFormGroup label="发放状态">
            <USelect 
              v-model="filters.game_delivery_status" 
              :options="deliveryStatusOptions"
              placeholder="选择发放状态"
            />
          </UFormGroup>
          
          <UFormGroup label="时间区间" style="flex: 2;">
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
          
          <UFormGroup label="礼包名称">
            <UInput 
              v-model="filters.package_name" 
              placeholder="请输入礼包名称"
              icon="i-heroicons-gift"
            />
          </UFormGroup>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3 mt-6 pt-6 border-t">
          <UButton 
            @click="searchData" 
            :loading="loading"
            icon="i-heroicons-magnifying-glass"
          >
            查询数据
          </UButton>
          <UButton 
            color="gray" 
            variant="outline" 
            @click="resetFilters"
            icon="i-heroicons-arrow-path"
          >
            重置条件
          </UButton>
          <UButton 
            color="orange" 
            variant="outline" 
            @click="loadTodayData"
            icon="i-heroicons-clock"
          >
            今日数据
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 统计信息卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-gift" class="w-8 h-8 text-blue-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">总记录数</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ formatNumber(stats.totalRecords) }}</dd>
          </div>
        </div>
      </UCard>
      
      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-currency-yen" class="w-8 h-8 text-green-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">总金额</dt>
            <dd class="text-2xl font-semibold text-gray-900">¥{{ formatAmount(stats.totalAmount) }}</dd>
          </div>
        </div>
      </UCard>
      
      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">已发放</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ formatNumber(stats.deliveredCount) }}</dd>
          </div>
        </div>
      </UCard>
      
      <UCard>
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <UIcon name="i-heroicons-users" class="w-8 h-8 text-purple-600" />
          </div>
          <div class="ml-4">
            <dt class="text-sm font-medium text-gray-500">涉及用户</dt>
            <dd class="text-2xl font-semibold text-gray-900">{{ formatNumber(stats.uniqueUsers) }}</dd>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 礼包记录表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">礼包发放记录</h3>
            <UBadge v-if="giftPackages.length > 0" :label="`${giftPackages.length}条记录`" variant="soft" size="xs" />
          </div>
          <div class="flex items-center gap-2">
            <UBadge 
              v-if="currentAdminLevel > 0" 
              label="代理权限数据" 
              color="orange" 
              variant="soft" 
              size="xs" 
            />
            <UBadge :label="`第${pagination.page}/${Math.ceil(pagination.total / pagination.pageSize)}页`" variant="outline" size="xs" />
          </div>
        </div>
      </template>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-500 animate-spin" />
        <p class="mt-2 text-gray-600">正在加载数据...</p>
      </div>

      <!-- 数据表格 -->
      <div v-else class="mobile-table-wrapper">
        <UTable 
          :rows="giftPackages" 
          :columns="giftPackageColumns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-gift', 
            label: '暂无礼包记录',
            description: '请调整筛选条件后重新查询' 
          }"
          class="w-full uniform-table"
        >
        
        <template #id-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-hashtag" class="w-4 h-4 text-gray-400" />
            <span class="font-medium">{{ row.id }}</span>
          </div>
        </template>

        <template #user_id-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(row.user_id)" :title="`${row.user_id}`">
            <span class="font-medium text-blue-600">{{ row.user_id }}</span>
          </div>
        </template>

        <template #thirdparty_uid-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(row.thirdparty_uid)" :title="`${row.thirdparty_uid}`">
            <span class="font-medium font-mono text-sm truncate">{{ row.thirdparty_uid }}</span>
          </div>
        </template>

        <template #mch_order_id-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(row.mch_order_id)" :title="`${row.mch_order_id || '无'}`">
            <span v-if="row.mch_order_id" class="font-medium font-mono text-sm text-gray-700 truncate">{{ row.mch_order_id }}</span>
            <span v-else class="text-gray-400 text-sm">-</span>
          </div>
        </template>

        <template #package_name-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-gift" class="w-4 h-4 text-purple-500" />
            <span class="font-medium text-purple-600 truncate" :title="row.package_name">{{ row.package_name }}</span>
          </div>
        </template>

        <template #gift_type-data="{ row }">
          <div class="flex items-center justify-center">
            <UBadge 
              :label="getGiftTypeText(row.gift_type)"
              :color="getGiftTypeColor(row.gift_type)"
              variant="soft"
              size="sm"
            />
          </div>
        </template>

        <template #quantity-data="{ row }">
          <div class="flex items-center gap-1 justify-center">
            <UIcon name="i-heroicons-cube" class="w-4 h-4 text-blue-500" />
            <span class="font-medium text-blue-600">{{ row.quantity || 1 }}</span>
          </div>
        </template>

        <template #total_amount-data="{ row }">
          <div class="flex items-center gap-1 justify-center">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ formatAmount(row.total_amount || 0) }}</span>
          </div>
        </template>

        <template #server_info-data="{ row }">
          <div v-if="row.server_info" class="flex items-center gap-2 justify-center">
            <UIcon name="i-heroicons-server" class="w-4 h-4 text-indigo-500" />
            <span class="font-medium text-indigo-600">{{ row.server_info }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #status-data="{ row }">
          <div class="flex items-center justify-center">
            <UBadge 
              :label="getStatusText(row.status)"
              :color="getStatusColor(row.status)"
              variant="soft"
              size="sm"
            />
          </div>
        </template>

        <template #game_delivery_status-data="{ row }">
          <div class="flex items-center justify-center">
            <UBadge 
              :label="getDeliveryStatusText(row.game_delivery_status)"
              :color="getDeliveryStatusColor(row.game_delivery_status)"
              variant="soft"
              size="sm"
            />
          </div>
        </template>

        <template #channel_code-data="{ row }">
          <div v-if="row.channel_code" class="flex items-center gap-2 justify-center">
            <UIcon name="i-heroicons-building-office" class="w-4 h-4 text-orange-500" />
            <span class="font-medium text-orange-600">{{ row.channel_code }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #created_at-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(formatDateTime(row.created_at))" :title="`${formatDateTime(row.created_at)}`">
            <span class="text-sm truncate">{{ formatDateTime(row.created_at) }}</span>
          </div>
        </template>

        <template #remark-data="{ row }">
          <div class="cursor-pointer max-w-xs" @dblclick="copyToClipboard(row.remark)" :title="`${row.remark}`">
            <span class="text-sm truncate">{{ truncateText(row.remark || '-', 30) }}</span>
          </div>
        </template>

        </UTable>
      </div>

      <!-- 分页 -->
      <div v-if="pagination.total > 0" class="flex justify-between items-center mt-6 pt-4 border-t">
        <div class="text-sm text-gray-600">
          共 {{ pagination.total }} 条记录，第 {{ pagination.page }} / {{ Math.ceil(pagination.total / pagination.pageSize) }} 页
        </div>
        <div v-if="Math.ceil(pagination.total / pagination.pageSize) > 1" class="flex items-center gap-2">
          <UButton
            v-if="pagination.page > 1"
            @click="handlePageChange(pagination.page - 1)"
            variant="outline"
            size="sm"
            icon="i-heroicons-chevron-left"
            :disabled="loading"
          >
            上一页
          </UButton>
          
          <div class="flex items-center gap-1">
            <UButton
              v-for="page in getVisiblePages()"
              :key="page"
              @click="handlePageChange(page)"
              :variant="page === pagination.page ? 'solid' : 'outline'"
              size="sm"
              :disabled="loading"
            >
              {{ page }}
            </UButton>
          </div>
          
          <UButton
            v-if="pagination.page < Math.ceil(pagination.total / pagination.pageSize)"
            @click="handlePageChange(pagination.page + 1)"
            variant="outline"
            size="sm"
            icon="i-heroicons-chevron-right"
            :disabled="loading"
          >
            下一页
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup>
// 页面配置
definePageMeta({
  layout: 'default'
})

// 导入身份验证store
import { useAuthStore } from '~/store/auth'
import { watch } from 'vue'

// 响应式数据
const loading = ref(false)
const exportLoading = ref(false)
const giftPackages = ref([])
const authStore = useAuthStore()

// 辅助函数：获取当前日期（本地时区）
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

// 日期选择器数据（默认不选择）
const selected = ref(null);

// 日期范围选项
const dateRanges = [
  { label: '最近3天', days: 3 },
  { label: '最近7天', days: 7 },
  { label: '最近14天', days: 14 },
  { label: '最近30天', days: 30 },
  { label: '最近60天', days: 60 },
  { label: '最近90天', days: 90 }
];

// 筛选条件
const filters = ref({
  user_id: '',
  thirdparty_uid: '',
  mch_order_id: '',
  packageType: 'all',
  status: 'all',
  game_delivery_status: 'all',
  startDate: '',
  endDate: '',
  package_name: ''
})

// 分页
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0
})

// 统计数据
const stats = ref({
  totalRecords: 0,
  totalAmount: 0,
  deliveredCount: 0,
  uniqueUsers: 0
})

// 当前管理员级别
const currentAdminLevel = computed(() => {
  // 管理员从 permissions 获取 level
  if (authStore.isUser) {
    return authStore.userInfo?.level || 0;
  } else {
    return authStore.permissions?.level || 0;
  }
})

// 选项配置
const packageTypeOptions = [
  { label: '全部类型', value: 'all' },
  { label: '通用礼包', value: 'general' },
  { label: '英雄超武', value: 'hero_super_weapon' },
  { label: '每日必买', value: 'daily_recharge' },
  { label: '每日消费', value: 'daily' },
  { label: '累计消费', value: 'cumulative' },
  { label: '限时礼包', value: 'limited' },
  { label: '限期礼包', value: 'scheduled' }
]

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '已发放', value: 'delivered' },
  { label: '失败', value: 'failed' },
  { label: '已取消', value: 'cancelled' }
]

const deliveryStatusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '等待发放', value: 'waiting' },
  { label: '已发送', value: 'sent' },
  { label: '发放成功', value: 'success' },
  { label: '发放失败', value: 'failed' }
]

// 表格列定义
const giftPackageColumns = [
  { key: 'id', label: '记录ID', sortable: false },
  { key: 'user_id', label: '用户ID', sortable: false },
  { key: 'thirdparty_uid', label: '角色ID', sortable: false },
  { key: 'mch_order_id', label: '商户订单号', sortable: false },
  { key: 'package_name', label: '礼包名称', sortable: false },
  { key: 'gift_type', label: '类型', sortable: false },
  { key: 'quantity', label: '数量', sortable: false },
  { key: 'total_amount', label: '金额', sortable: false },
  { key: 'server_info', label: '服务器', sortable: false },
  { key: 'status', label: '支付状态', sortable: false },
  { key: 'game_delivery_status', label: '发放状态', sortable: false },
  { key: 'channel_code', label: '渠道', sortable: false },
  { key: 'created_at', label: '创建时间', sortable: false },
  { key: 'remark', label: '备注', sortable: false }
]

// 工具函数
const tips = useTips()

// 获取礼包类型文本
const getGiftTypeText = (type) => {
  const typeMap = {
    'general': '通用',
    'hero_super_weapon': '英雄超武',
    'daily_recharge': '每日必买',
    'daily': '每日消费',
    'cumulative': '累计消费',
    'limited': '限时',
    'scheduled': '限期',
    'purchased': '购买',
    'unknown': '未知'
  }
  return typeMap[type] || '未知'
}

// 获取礼包类型颜色
const getGiftTypeColor = (type) => {
  const colorMap = {
    'general': 'blue',
    'hero_super_weapon': 'cyan',
    'daily_recharge': 'green',
    'daily': 'orange',
    'cumulative': 'purple',
    'limited': 'red',
    'scheduled': 'pink',
    'purchased': 'blue',
    'unknown': 'gray'
  }
  return colorMap[type] || 'gray'
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    'pending': '待支付',
    'paid': '已支付',
    'delivered': '已发放',
    'failed': '失败',
    'cancelled': '已取消'
  }
  return statusMap[status] || '未知'
}

// 获取状态颜色
const getStatusColor = (status) => {
  const colorMap = {
    'pending': 'yellow',
    'paid': 'blue',
    'delivered': 'green',
    'failed': 'red',
    'cancelled': 'gray'
  }
  return colorMap[status] || 'gray'
}

// 获取发放状态文本
const getDeliveryStatusText = (status) => {
  const statusMap = {
    'waiting': '等待发放',
    'sent': '已发送',
    'success': '发放成功',
    'failed': '发放失败'
  }
  return statusMap[status] || '未知'
}

// 获取发放状态颜色
const getDeliveryStatusColor = (status) => {
  const colorMap = {
    'waiting': 'yellow',
    'sent': 'blue',
    'success': 'green',
    'failed': 'red'
  }
  return colorMap[status] || 'gray'
}

// 格式化数字
const formatNumber = (num) => {
  return Number(num || 0).toLocaleString()
}

// 格式化金额
const formatAmount = (amount) => {
  return Number(amount || 0).toFixed(2)
}

// 格式化日期时间
const formatDateTime = (dateTime) => {
  if (!dateTime) return '-'
  return new Date(dateTime).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 截断文本
const truncateText = (text, maxLength) => {
  if (!text) return '-'
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    tips.add({ 
      title: '复制成功', 
      description: `已复制: ${text}`,
      color: 'green'
    })
  } catch (error) {
    console.error('复制失败:', error)
    tips.add({ 
      title: '复制失败', 
      description: '请手动复制',
      color: 'red'
    })
  }
}

// 格式化日期范围显示
const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '请选择时间区间';
  return `${startDate} 至 ${endDate}`;
}

// 设置日期范围
const setDateRange = (days) => {
  const endDate = getCurrentDate();
  const startDate = getPastDate(days);
  
  filters.value.endDate = endDate;
  filters.value.startDate = startDate;
  
  selected.value = {
    start: new Date(startDate),
    end: new Date(endDate)
  };
}

// 检查是否选中某个日期范围
const isRangeSelected = (days) => {
  const expectedStart = getPastDate(days);
  const expectedEnd = getCurrentDate();
  return filters.value.startDate === expectedStart && filters.value.endDate === expectedEnd;
}

// 监听DatePicker选择变化
watch(selected, (newSelected) => {
  if (newSelected.start && newSelected.end) {
    filters.value.startDate = newSelected.start.toISOString().split('T')[0];
    filters.value.endDate = newSelected.end.toISOString().split('T')[0];
  }
}, { deep: true });

// 构建查询参数
const buildQueryParams = () => {
  const params = {
    page: pagination.value.page,
    pageSize: pagination.value.pageSize
  }
  
  // 只添加非空的筛选条件
  if (filters.value.user_id.trim()) {
    params.user_id = parseInt(filters.value.user_id.trim())
  }
  if (filters.value.thirdparty_uid.trim()) {
    params.thirdparty_uid = filters.value.thirdparty_uid.trim()
  }
  if (filters.value.mch_order_id.trim()) {
    params.mch_order_id = filters.value.mch_order_id.trim()
  }
  if (filters.value.packageType !== 'all') {
    params.packageType = filters.value.packageType
  }
  if (filters.value.status !== 'all') {
    params.status = filters.value.status
  }
  if (filters.value.game_delivery_status !== 'all') {
    params.game_delivery_status = filters.value.game_delivery_status
  }
  if (filters.value.startDate) {
    params.startDate = filters.value.startDate
  }
  if (filters.value.endDate) {
    params.endDate = filters.value.endDate
  }
  if (filters.value.package_name.trim()) {
    params.package_name = filters.value.package_name.trim()
  }
  
  return params
}

// 搜索数据（重置到第一页）
const searchData = () => {
  pagination.value.page = 1
  loadGiftPackageData()
}

// 加载礼包数据
const loadGiftPackageData = async () => {
  loading.value = true
  try {
    // 构建查询参数
    const params = buildQueryParams()
    
    const response = await $fetch('/api/admin/gift-package-records', {
      method: 'GET',
      query: params,
      headers: {
        'Authorization': authStore.id
      }
    })

    if (response.success) {
      giftPackages.value = response.data.records
      pagination.value.total = response.data.pagination.total
      stats.value = response.data.stats || {
        totalRecords: response.data.pagination.total,
        totalAmount: 0,
        deliveredCount: 0,
        uniqueUsers: 0
      }
      
      if (giftPackages.value.length === 0) {
        tips.add({
          title: '查询结果',
          description: '未找到符合条件的礼包记录',
          color: 'yellow'
        })
      }
    } else {
      throw new Error(response.message || '查询失败')
    }
  } catch (error) {
    console.error('加载礼包数据失败:', error)
    tips.add({
      title: '查询失败',
      description: error.message || '请稍后重试',
      color: 'red'
    })
    giftPackages.value = []
    pagination.value.total = 0
    stats.value = {
      totalRecords: 0,
      totalAmount: 0,
      deliveredCount: 0,
      uniqueUsers: 0
    }
  } finally {
    loading.value = false
  }
}

// 重置筛选条件
const resetFilters = () => {
  filters.value = {
    user_id: '',
    thirdparty_uid: '',
    mch_order_id: '',
    packageType: 'all',
    status: 'all',
    game_delivery_status: 'all',
    startDate: '',
    endDate: '',
    package_name: ''
  }
  selected.value = null
  pagination.value.page = 1
  giftPackages.value = []
  pagination.value.total = 0
  stats.value = {
    totalRecords: 0,
    totalAmount: 0,
    deliveredCount: 0,
    uniqueUsers: 0
  }
}

// 加载今日数据
const loadTodayData = () => {
  const todayDate = getCurrentDate()
  filters.value.startDate = todayDate
  filters.value.endDate = todayDate
  selected.value = {
    start: new Date(todayDate),
    end: new Date(todayDate)
  }
  pagination.value.page = 1
  loadGiftPackageData()
}

// 刷新数据
const refreshData = () => {
  pagination.value.page = 1
  loadGiftPackageData()
}

// 导出全部数据
const exportAllData = async () => {
  exportLoading.value = true
  try {
    // 获取全部数据
    const params = buildQueryParams()
    params.page = 1
    params.pageSize = 10000 // 获取大量数据
    
    const response = await $fetch('/api/admin/gift-package-records', {
      method: 'GET',
      query: params,
      headers: {
        'Authorization': authStore.id
      }
    })

    if (response.success && response.data.records.length > 0) {
      // 准备导出数据
      const exportData = response.data.records.map(item => ({
        '记录ID': item.id,
        '用户ID': item.user_id,
        '角色ID': item.thirdparty_uid,
        '礼包名称': item.package_name,
        '礼包类型': getGiftTypeText(item.gift_type),
        '数量': item.quantity || 1,
        '金额': formatAmount(item.total_amount || 0),
        '服务器': item.server_info || '-',
        '支付状态': getStatusText(item.status),
        '发放状态': getDeliveryStatusText(item.game_delivery_status),
        '渠道代码': item.channel_code || '-',
        '创建时间': formatDateTime(item.created_at),
        '备注': item.remark || '-'
      }))

      // 使用动态导入
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '礼包发放记录')
      
      // 生成文件名
      const fileName = `礼包发放记录_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      tips.add({
        title: '导出成功',
        description: `已导出 ${exportData.length} 条数据`,
        color: 'green'
      })
    } else {
      tips.add({
        title: '导出失败',
        description: '没有可导出的数据',
        color: 'red'
      })
    }
  } catch (error) {
    console.error('导出失败:', error)
    tips.add({
      title: '导出失败',
      description: '请稍后重试',
      color: 'red'
    })
  } finally {
    exportLoading.value = false
  }
}

// 获取可见的页码
const getVisiblePages = () => {
  const totalPages = Math.ceil(pagination.value.total / pagination.value.pageSize)
  const visiblePages = []
  const maxVisiblePages = 7
  let startPage = Math.max(pagination.value.page - Math.floor(maxVisiblePages / 2), 1)
  let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages)

  if (endPage > totalPages) {
    endPage = totalPages
    startPage = Math.max(endPage - maxVisiblePages + 1, 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    visiblePages.push(i)
  }

  return visiblePages
}

// 处理页码变化
const handlePageChange = (newPage) => {
  pagination.value.page = newPage
  loadGiftPackageData()
}

// 获取管理员信息
const fetchAdminInfo = async () => {
  try {
    // 管理员信息已经通过authStore获取，无需额外请求
    console.log('当前管理员级别:', currentAdminLevel.value)
  } catch (error) {
    console.error('获取管理员信息失败:', error)
  }
}

// 页面加载时
onMounted(() => {
  fetchAdminInfo()
})

// 页面标题
useHead({
  title: '玩家礼包发放记录 - 运营管理'
})
</script>

<style scoped>
.gift-package-records-page {
  @apply space-y-6;
}

.page-header {
  @apply flex justify-between items-center;
}

.filter-content {
  @apply space-y-4;
}

.filter-row {
  @apply flex gap-4 items-end w-full;
}

.filter-row > * {
  @apply flex-1;
}

/* 统一表格样式 */
.uniform-table :deep(table) {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #f1f5f9;
}

.uniform-table :deep(th) {
  text-align: center;
  padding: 12px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9;
  background-color: #f8fafc;
  font-weight: 600;
}

.uniform-table :deep(td) {
  text-align: center;
  padding: 12px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9;
}

.uniform-table :deep(th:last-child),
.uniform-table :deep(td:last-child) {
  border-right: none;
}

/* 移动端表格列样式 */
@media (max-width: 768px) {
  .uniform-table :deep(th),
  .uniform-table :deep(td) {
    min-width: 120px;
    white-space: nowrap;
  }
}

/* 确保flex内容居中对齐 */
.uniform-table :deep(.flex) {
  justify-content: center;
  align-items: center;
}

/* 添加省略号样式 */
.uniform-table :deep(.truncate) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* 确保表格单元格内容正确显示 */
.uniform-table :deep(td) {
  position: relative;
}

.uniform-table :deep(td .cursor-pointer) {
  width: 100%;
  max-width: 100%;
  display: block;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .filter-row {
    @apply flex-col gap-3;
  }
  
  .filter-row > * {
    @apply w-full;
  }
  
  .page-header {
    @apply flex-col gap-4 items-start;
  }
}
</style> 