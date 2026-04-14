<template>
  <div class="payment-data-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">订单支付数据</h2>
    </div>

    <!-- 统计卡片 -->
    <div class="mb-6 relative">
      <!-- 今日统计卡片（无标题） -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-green-600 mb-2">{{ formatNumber(todayStats.successCount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
              <span class="text-xs text-gray-600">今日成功订单</span>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-emerald-600 mb-2">¥{{ formatAmount(todayStats.successAmount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-emerald-500" />
              <span class="text-xs text-gray-600">今日成功总额</span>
            </div>
          </div>
        </UCard>

        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-blue-600 mb-2">{{ formatNumber(todayStats.totalCount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-blue-500" />
              <span class="text-xs text-gray-600">今日总订单</span>
            </div>
          </div>
        </UCard>

        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-purple-600 mb-2">{{ getTodaySuccessRate() }}%</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-purple-500" />
              <span class="text-xs text-gray-600">今日订单成功率</span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 当前查询统计卡片（无标题） -->
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-green-600 mb-2">{{ formatNumber(queryStats.successCount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
              <span class="text-xs text-gray-600">总成功订单</span>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-emerald-600 mb-2">¥{{ formatAmount(queryStats.successAmount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-emerald-500" />
              <span class="text-xs text-gray-600">总成功总额</span>
            </div>
          </div>
        </UCard>

        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-blue-600 mb-2">{{ formatNumber(queryStats.totalCount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-blue-500" />
              <span class="text-xs text-gray-600">总订单</span>
            </div>
          </div>
        </UCard>

        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-purple-600 mb-2">{{ getQuerySuccessRate() }}%</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-purple-500" />
              <span class="text-xs text-gray-600">总订单成功率</span>
            </div>
          </div>
        </UCard>

        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-indigo-600 mb-2">{{ formatNumber(currentQueryStats.count) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 text-indigo-500" />
              <span class="text-xs text-gray-600">当前查询订单</span>
            </div>
          </div>
        </UCard>

        <UCard class="p-3">
          <div class="text-center">
            <div class="text-xl font-bold text-cyan-600 mb-2">¥{{ formatAmount(currentQueryStats.amount) }}</div>
            <div class="flex items-center justify-center gap-1">
              <UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-cyan-500" />
              <span class="text-xs text-gray-600">当前查询总额</span>
            </div>
          </div>
        </UCard>
      </div>
      
      <!-- 查询时间范围提示 -->
      <div class="absolute bottom-0 right-0 -mb-1">
        <UBadge 
          variant="soft" 
          color="gray" 
          size="xs"
          class="text-xs"
        >
          <UIcon name="i-heroicons-calendar-days" class="w-3 h-3 mr-1" />
          {{ getDateRangeText() }}
        </UBadge>
      </div>
    </div>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="filter-content">
        <div class="filter-row">
          <!-- 交易ID -->
          <UFormGroup label="交易ID" class="flex-1">
            <UInput 
              v-model="filters.transaction_id" 
              placeholder="请输入交易ID"
              icon="i-heroicons-hashtag"
              @keyup.enter="searchPayments"
            />
          </UFormGroup>

          <!-- 用户ID -->
          <UFormGroup label="ID" class="flex-1">
            <UInput 
              v-model="filters.user_id" 
              placeholder="请输入用户ID/子账号ID/游戏账号ID/游戏角色ID"
              icon="i-heroicons-user"
              @keyup.enter="searchPayments"
            />
          </UFormGroup>

          <!-- 订单号 -->
          <UFormGroup label="订单号" class="flex-1">
            <UInput 
              v-model="filters.mch_order_id" 
              placeholder="请输入订单号"
              icon="i-heroicons-document-text"
              @keyup.enter="searchPayments"
            />
          </UFormGroup>

          <!-- 支付状态 -->
          <UFormGroup label="支付状态" class="flex-1">
            <USelect 
              v-model="filters.payment_status" 
              placeholder="选择状态"
              :options="statusOptions"
              icon="i-heroicons-check-circle"
            />
          </UFormGroup>

          <!-- 支付方式 -->
          <UFormGroup label="支付方式" class="flex-1">
            <USelect 
              v-model="filters.payment_method" 
              placeholder="选择支付方式"
              :options="paymentMethodOptions"
              icon="i-heroicons-credit-card"
            />
          </UFormGroup>

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
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3 mt-6 pt-6 border-t">
          <UButton 
            @click="searchPayments" 
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
            color="green" 
            variant="outline" 
            @click="exportPayments"
            :loading="exportLoading"
            icon="i-heroicons-arrow-down-tray"
          >
            导出Excel
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 充值记录表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">充值记录</h3>
            <UBadge v-if="payments.length > 0" :label="`${payments.length}条记录`" variant="soft" size="xs" />
          </div>
          <div class="flex items-center gap-2">
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
          :rows="payments" 
          :columns="paymentColumns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-credit-card', 
            label: '暂无充值记录'
          }"
          class="w-full uniform-table"
        >
        <template #user_id-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(row.user_id || '-')" :title="`${row.user_id || '-'}`">
            <span class="font-medium truncate" :title="row.user_id || '-'">{{ row.user_id || '-' }}</span>
          </div>
        </template>

        <template #sub_user_id-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(row.sub_user_id || '-')" :title="`${row.sub_user_id || '-'}`">
            <span class="font-medium truncate" :title="row.sub_user_id || '-'">{{ row.sub_user_id || '-' }}</span>
          </div>
        </template>

        <template #role_name-data="{ row }">
          <div v-if="row.role_name" class="font-medium text-blue-600 truncate cursor-pointer" :title="row.role_name" @dblclick="copyToClipboard(row.role_name)">
            {{ row.role_name }}
          </div>
          <div v-else-if="row.role_id" class="text-gray-500 text-xs truncate cursor-pointer" :title="row.role_id" @dblclick="copyToClipboard(row.role_id)">
            {{ row.role_id }}
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #product_name-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(row.product_name || '-')" :title="`${row.product_name || '-'}`">
            <span class="font-medium truncate" :title="row.product_name || '-'">{{ row.product_name || '-' }}</span>
          </div>
        </template>

        <template #amount-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(formatAmount(row.amount))" :title="`${formatAmount(row.amount)}`">
            <span class="font-medium text-green-600">{{ formatAmount(row.amount) }}</span>
          </div>
        </template>

        <!-- 平台币变化列（紧凑，差异着色：Δ 正红/负绿/0绿，after 蓝） -->
        <template #platform_coins-data="{ row }">
          <div v-if="hasPtbChange(row)" class="inline-flex items-center gap-2 px-2 py-0.5 min-w-[280px] text-sm font-mono">
            <span class="text-gray-600">{{ formatCoins(row.ptb_before) }}</span>
            <span :class="toNum(row.ptb_change) > 0 ? 'text-red-600' : 'text-emerald-600'">{{ signedCoins(row.ptb_change) }}</span>
            <span class="text-gray-400">=</span>
            <span class="text-blue-600">{{ formatCoins(row.ptb_after) }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #payment_way-data="{ row }">
          <div v-if="row.payment_way" class="cursor-pointer" @dblclick="copyToClipboard(row.payment_way)" :title="`${row.payment_way}`">
            <span class="font-medium text-blue-600 truncate" :title="row.payment_way">{{ row.payment_way }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #channel_code-data="{ row }">
          <div v-if="row.channel_code" class="cursor-pointer" @dblclick="copyToClipboard(row.channel_code)" :title="`${row.channel_code}`">
            <span class="font-medium text-indigo-600 truncate" :title="row.channel_code">{{ row.channel_code }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #payment_status-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon 
              :name="getStatusIcon(row.payment_status)" 
              :class="getStatusIconClass(row.payment_status)"
            />
            <span :class="getStatusTextClass(row.payment_status)">
              {{ getStatusText(row.payment_status) }}
            </span>
          </div>
        </template>

        <template #mch_order_id-data="{ row }">
          <div class="cursor-pointer" v-if="row.mch_order_id" @dblclick="copyToClipboard(row.mch_order_id)" :title="`${row.mch_order_id}`">
            <span class="font-mono text-sm truncate" :title="row.mch_order_id">{{ row.mch_order_id }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #created_at-data="{ row }">
          <div class="cursor-pointer" @dblclick="copyToClipboard(formatDateTime(row.created_at))" :title="`${formatDateTime(row.created_at)}`">
            <span class="text-sm truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
          </div>
        </template>

        <template #notify_at-data="{ row }">
          <div v-if="row.notify_at" class="cursor-pointer" @dblclick="copyToClipboard(formatDateTime(row.notify_at))" :title="`${formatDateTime(row.notify_at)}`">
            <span class="text-sm text-green-600 truncate" :title="formatDateTime(row.notify_at)">{{ formatDateTime(row.notify_at) }}</span>
          </div>
          <span v-else class="text-gray-400 text-xs">-</span>
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
        <div v-else class="text-xs text-gray-500">
          所有数据已显示
        </div>
      </div>
    </UCard>

    <!-- 通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, watch } from 'vue';
import { useAuthStore } from '~/store/auth';

// 页面元数据
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();
const toast = useToast();

// 辅助函数：获取过去N天的日期
const getPastDate = (days) => {
  const date = new Date();
  // 要得到N天的数据（包含今天），应该减去 (N-1) 天
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().split('T')[0];
};

// 辅助函数：获取当前日期
const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

// 响应式数据
const loading = ref(false);
const exportLoading = ref(false);
const payments = ref([]);
// 手动到账功能已注释
// const confirmingPayments = ref({});

// 日期选择器数据
const selected = ref({ 
  start: null, 
  end: null 
});

// 日期范围选项
const dateRanges = [
  { label: '最近7天', days: 7 },
  { label: '最近14天', days: 14 },
  { label: '最近30天', days: 30 },
  { label: '最近60天', days: 60 },
  { label: '最近90天', days: 90 }
];

// 表格列定义
const paymentColumns = [
  {
    key: 'user_id',
    label: '用户ID',
    sortable: true
  },
  {
    key: 'sub_user_id',
    label: '子账号ID',
    sortable: true
  },
  {
    key: 'role_name',
    label: '角色',
    sortable: false
  },
  {
    key: 'product_name',
    label: '商品名',
    sortable: true
  },
  {
    key: 'amount',
    label: '金额',
    sortable: true
  },
  {
    key: 'platform_coins',
    label: '平台币变化',
    sortable: false,
    class: 'min-w-[280px]'
  },
  {
    key: 'payment_way',
    label: '支付方式',
    sortable: true
  },
  {
    key: 'channel_code',
    label: '渠道ID',
    sortable: true
  },
  {
    key: 'payment_status',
    label: '支付状态',
    sortable: true
  },
  {
    key: 'mch_order_id',
    label: '订单号',
    sortable: true
  },
  {
    key: 'created_at',
    label: '创建时间',
    sortable: true
  },
  {
    key: 'notify_at',
    label: '到账时间',
    sortable: true
  }
];

// 今日统计数据
const todayStats = ref({
  successCount: 0,      // 今日成功订单数
  successAmount: '0.00', // 今日成功总额
  totalCount: 0,        // 今日总订单数
  totalAmount: '0.00'   // 今日总金额
});

// 当前查询统计数据
const queryStats = ref({
  successCount: 0,      // 查询范围内成功订单数
  successAmount: '0.00', // 查询范围内成功总额
  totalCount: 0,        // 查询范围内总订单数
  totalAmount: '0.00'   // 查询范围内总金额
});

// 当前查询的实际结果统计
const currentQueryStats = ref({
  count: 0,            // 当前查询返回的订单数
  amount: '0.00'       // 当前查询返回的订单总额
});

// 状态选项
const statusOptions = ref([
  { value: '', label: '全部状态' },
  { value: '0', label: '支付失败' },
  { value: '1', label: '待支付' },
  { value: '2', label: '支付中' },
  { value: '3', label: '支付成功' }
]);

// 支付方式选项 - 更新以匹配数据库中的实际值
const paymentMethodOptions = ref([
  { value: '', label: '全部支付方式' },
  { value: '支付宝+微信', label: '支付宝+微信' },
  { value: '支付宝', label: '支付宝' },
  { value: '微信', label: '微信' },
  { value: '平台币', label: '平台币' }
]);

const filters = reactive({
  transaction_id: '',
  user_id: '',
  mch_order_id: '',
  payment_status: '',
  payment_method: '',
  startDate: '',
  endDate: ''
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
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
  if (!startDate || !endDate) return '不限时间（点击选择时间区间）';
  return `${startDate} ~ ${endDate}`;
};

// 格式化数字
const formatNumber = (value) => {
  return Number(value || 0).toLocaleString();
};

// 方法
const formatDateTime = (dateTimeString) => {
  if (!dateTimeString) return '-';
  const date = new Date(dateTimeString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai'
  });
};

const formatAmount = (amount) => {
  if (!amount) return '0.00';
  return parseFloat(amount).toFixed(2);
};

// 平台币变化辅助
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const hasPtbChange = (row) => {
  return toNum(row?.ptb_before) !== 0 || toNum(row?.ptb_change) !== 0 || toNum(row?.ptb_after) !== 0;
};
const formatCoins = (v) => toNum(v).toFixed(2);
const signedCoins = (v) => {
  const n = toNum(v);
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
};

const getStatusText = (status) => {
  const statusMap = {
    0: '支付失败',
    1: '待支付',
    2: '支付中', 
    3: '支付成功'
  };
  return statusMap[status] || '未知';
};

const getStatusColor = (status) => {
  const colorMap = {
    0: 'red',
    1: 'yellow',
    2: 'blue',
    3: 'green'
  };
  return colorMap[status] || 'gray';
};

// 支付状态图标
const getStatusIcon = (status) => {
  const iconMap = {
    0: 'i-heroicons-x-circle',
    1: 'i-heroicons-clock',
    2: 'i-heroicons-arrow-path',
    3: 'i-heroicons-check-circle'
  };
  return iconMap[status] || 'i-heroicons-question-mark-circle';
};

// 支付状态图标样式
const getStatusIconClass = (status) => {
  const classMap = {
    0: 'w-4 h-4 text-red-500',
    1: 'w-4 h-4 text-yellow-500',
    2: 'w-4 h-4 text-blue-500',
    3: 'w-4 h-4 text-green-500'
  };
  return classMap[status] || 'w-4 h-4 text-gray-500';
};

// 支付状态文字样式
const getStatusTextClass = (status) => {
  const classMap = {
    0: 'font-medium text-red-600',
    1: 'font-medium text-yellow-600',
    2: 'font-medium text-blue-600',
    3: 'font-medium text-green-600'
  };
  return classMap[status] || 'font-medium text-gray-600';
};

// 搜索支付记录（重置到第1页）
const searchPayments = () => {
  pagination.page = 1;
  loadPayments();
};

// 加载充值记录
const loadPayments = async () => {
  try {
    loading.value = true;
    console.log('加载支付记录，页码:', pagination.page);
    console.log('当前筛选条件:', filters);

    const params = new URLSearchParams({
      page: pagination.page.toString(),
      pageSize: pagination.pageSize.toString()
    });

    if (filters.transaction_id) params.append('transaction_id', filters.transaction_id);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.mch_order_id) params.append('mch_order_id', filters.mch_order_id);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    if (filters.payment_method) params.append('payment_method', filters.payment_method);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    console.log('请求参数:', params.toString());
    const response = await $fetch(`/api/admin/payments?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success) {
      payments.value = response.data.payments;
      pagination.total = response.data.pagination.total;
      pagination.totalPages = response.data.pagination.totalPages;
      
      // 使用后端返回的当前查询统计数据
      if (response.data.currentQueryStats) {
        currentQueryStats.value = {
          count: response.data.currentQueryStats.count,
          amount: response.data.currentQueryStats.amount
        };
      }
      
      console.log('分页信息:', {
        total: pagination.total,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(pagination.total / pagination.pageSize),
        currentPage: pagination.page
      });
      
      // 同时加载查询统计数据
      await loadQueryStats();
      
      toast.add({
        title: '数据加载成功',
        description: `当前页 ${payments.value.length} 条记录，查询范围共 ${currentQueryStats.value.count} 条，总额 ¥${currentQueryStats.value.amount}`,
        color: 'green'
      });
    } else {
      throw new Error(response.message || '获取支付记录失败');
    }
  } catch (error) {
    console.error('加载支付记录失败:', error);
    toast.add({
      title: '数据加载失败',
      description: error.message || '请检查网络连接后重试',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

// 加载今日统计数据
const loadTodayStats = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await $fetch(`/api/admin/payments?startDate=${today}&endDate=${today}&statsOnly=true`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });
    
    if (response.success) {
      todayStats.value = {
        successCount: response.data.todaySuccessCount || 0,
        successAmount: response.data.todaySuccessAmount || '0.00',
        totalCount: response.data.todayTotalCount || 0,
        totalAmount: response.data.todayTotalAmount || '0.00'
      };
    }
  } catch (error) {
    console.error('加载今日统计失败:', error);
  }
};

// 加载查询统计数据
const loadQueryStats = async () => {
  try {
    const params = new URLSearchParams({
      statsOnly: 'true'
    });

    if (filters.transaction_id) params.append('transaction_id', filters.transaction_id);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.mch_order_id) params.append('mch_order_id', filters.mch_order_id);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    if (filters.payment_method) params.append('payment_method', filters.payment_method);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/payments?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });
    
    if (response.success) {
      queryStats.value = {
        successCount: response.data.querySuccessCount || 0,
        successAmount: response.data.querySuccessAmount || '0.00',
        totalCount: response.data.queryTotalCount || 0,
        totalAmount: response.data.queryTotalAmount || '0.00'
      };
    }
  } catch (error) {
    console.error('加载查询统计失败:', error);
  }
};

// 手动到账功能已注释 - 不能随意使用
// 判断订单是否可以手动到账
// const canManualConfirm = (row) => {
//   // 支付方式包含"微信"或"支付宝"，且支付状态不是成功(3)
//   const paymentWay = String(row.payment_way || '').toLowerCase();
//   const isThirdPartyPayment = paymentWay.includes('微信') || paymentWay.includes('支付宝') || paymentWay.includes('wechat') || paymentWay.includes('alipay');
//   const isNotCompleted = row.payment_status !== 3;
//   
//   if (!isThirdPartyPayment || !isNotCompleted) {
//     return false;
//   }
//   
//   // 1. 平台币充值订单
//   const productName = String(row.product_name || '').toLowerCase();
//   const isPlatformCoinRecharge = productName.includes('平台币') || productName.includes('充值') || productName.includes('ptb');
//   
//   // 2. 礼包购买订单（通过 server_url 判断）
//   const serverUrl = String(row.server_url || '');
//   const isGiftOrder = serverUrl.startsWith('gift://');
//   
//   // 平台币充值订单或礼包购买订单都可以手动到账
//   return isPlatformCoinRecharge || isGiftOrder;
// };

// 确认支付（手动补单）- 已注释，不能随意使用
/* const confirmPayment = async (payment) => {
  // 判断订单类型
  const serverUrl = String(payment.server_url || '');
  const isGiftOrder = serverUrl.startsWith('gift://');
  const productName = String(payment.product_name || '');
  
  let orderTypeText = '游戏充值';
  let orderTypeIcon = '🎮';
  if (isGiftOrder) {
    orderTypeText = '礼包购买';
    orderTypeIcon = '🎁';
  } else if (productName.includes('平台币') || productName.includes('充值') || productName.includes('ptb')) {
    orderTypeText = '平台币充值';
    orderTypeIcon = '💰';
  }
  
  // 弹窗确认
  const confirmed = await new Promise((resolve) => {
    // 使用 UNotification 实现确认对话框
    toast.add({
      id: `confirm-${payment.id}`,
      title: '⚠️ 确认手动补单',
      description: `${orderTypeIcon} 订单类型：${orderTypeText}\n📝 交易ID：${payment.transaction_id}\n📦 商品：${payment.product_name || '-'}\n💵 金额：¥${formatAmount(payment.amount)}\n\n⚡ 补单后将立即到账，请确认订单信息无误！`,
      color: 'amber',
      timeout: 0,
      actions: [
        {
          label: '取消',
          color: 'gray',
          click: () => {
            resolve(false);
          }
        },
        {
          label: '确认补单',
          color: 'green',
          click: () => {
            resolve(true);
          }
        }
      ]
    });
  });
  
  if (!confirmed) {
    return;
  }
  
  try {
    confirmingPayments.value[payment.id] = true;
    
    const response = await $fetch('/api/admin/payment/confirm', {
      method: 'POST',
      body: {
        transaction_id: payment.transaction_id
      }
    });
    
    if (response.success) {
      toast.add({
        title: '✅ 补单成功',
        description: response.message || `交易ID: ${payment.transaction_id}`,
        color: 'green',
        timeout: 5000
      });
      
      // 更新当前行的数据（而不是重新加载整个列表）
      const index = payments.value.findIndex(p => p.id === payment.id);
      if (index !== -1) {
        // 更新支付状态为成功
        payments.value[index].payment_status = 3;
        
        // 如果返回了平台币信息，更新平台币变化
        if (response.data?.platform_coins_added) {
          payments.value[index].ptb_change = response.data.platform_coins_added;
          payments.value[index].ptb_after = response.data.new_balance;
          payments.value[index].ptb_before = response.data.new_balance - response.data.platform_coins_added;
        }
        
        // 更新完成时间
        payments.value[index].completed_at = new Date().toISOString();
        payments.value[index].notify_at = new Date().toISOString();
        
        console.log('订单状态已更新:', payments.value[index]);
      }
      
      // 同时更新统计数据
      await Promise.all([
        loadTodayStats(),
        loadQueryStats()
      ]);
    } else {
      throw new Error(response.message || '确认失败');
    }
  } catch (error) {
    console.error('确认支付失败:', error);
    toast.add({
      title: '❌ 补单失败',
      description: error.message || '操作过程中发生错误',
      color: 'red',
      timeout: 5000
    });
  } finally {
    confirmingPayments.value[payment.id] = false;
  }
}; */

// 重置筛选条件
const resetFilters = () => {
  filters.transaction_id = '';
  filters.user_id = '';
  filters.mch_order_id = '';
  filters.payment_status = '';
  filters.payment_method = '';
  filters.startDate = '';
  filters.endDate = '';
  pagination.page = 1;
  
  // 重置日期选择器
  selected.value = {
    start: null,
    end: null
  };
  
  loadPayments();
  
  toast.add({
    title: '条件已重置',
    description: '筛选条件已重置为默认值',
    color: 'blue'
  });
};

// 获取可见的页码
const getVisiblePages = () => {
  const totalPages = Math.ceil(pagination.total / pagination.pageSize);
  const currentPage = pagination.page;
  const maxVisible = 7;
  
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }
  
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

// 处理分页变化
const handlePageChange = (page) => {
  console.log('分页变化:', page);
  console.log('分页变化时的筛选条件:', filters);
  pagination.page = page;
  loadPayments();
};

// 导出数据
const exportPayments = async () => {
  exportLoading.value = true;
  try {
    // 获取所有支付数据（不分页）
    const params = new URLSearchParams({
      page: '1',
      pageSize: '10000'
    });

    if (filters.transaction_id) params.append('transaction_id', filters.transaction_id);
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.mch_order_id) params.append('mch_order_id', filters.mch_order_id);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    if (filters.payment_method) params.append('payment_method', filters.payment_method);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/payments?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success && response.data.payments) {
      // 转换数据格式
      const exportData = response.data.payments.map(item => ({
        '用户ID': item.user_id || '',
        '子账号ID': item.sub_user_id || '',
        '游戏账号ID': item.role_id || '',
        '游戏角色ID': item.role_name || '',
        '商品名': item.product_name || '',
        '支付金额': formatAmount(item.amount),
        '支付方式': item.payment_way || '-',
        '渠道ID': item.channel_code || '-',
        '支付状态': getStatusText(item.payment_status),
        '订单号': item.mch_order_id || '-',
        '创建时间': formatDateTime(item.created_at),
        '到账时间': item.notify_at ? formatDateTime(item.notify_at) : '-'
      }));

      if (exportData.length === 0) {
        throw new Error('没有数据可导出');
      }

      // 动态导入xlsx库
      const XLSX = await import('xlsx');
      
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // 设置列宽
      const colWidths = [
        { wch: 10 }, // 用户ID
        { wch: 8 }, // 子账号ID
        { wch: 8 }, // 游戏账号ID
        { wch: 12 }, // 游戏角色ID
        { wch: 12 }, // 商品名
        { wch: 20 }, // 支付金额
        { wch: 8 }, // 支付方式
        { wch: 8 }, // 渠道ID
        { wch: 8 }, // 支付状态
        { wch: 12 }, // 订单号
        { wch: 18 }, // 创建时间
        { wch: 18 }  // 到账时间
      ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, '支付数据');
      
      // 生成文件名
      const fileName = `支付数据_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // 下载文件
      XLSX.writeFile(wb, fileName);
      
      toast.add({
        title: '导出成功',
        description: `已导出 ${exportData.length} 条记录`,
        color: 'green'
      });
    } else {
      throw new Error('没有数据可导出');
    }
  } catch (error) {
    console.error('导出失败:', error);
    toast.add({
      title: '导出失败',
      description: error.message || '导出过程中发生错误',
      color: 'red'
    });
  } finally {
    exportLoading.value = false;
  }
};

// 计算今日订单成功率
const getTodaySuccessRate = () => {
  if (todayStats.value.totalCount === 0) return '0.00';
  const rate = (todayStats.value.successCount / todayStats.value.totalCount) * 100;
  return rate.toFixed(2);
};

// 计算查询订单成功率
const getQuerySuccessRate = () => {
  if (queryStats.value.totalCount === 0) return '0.00';
  const rate = (queryStats.value.successCount / queryStats.value.totalCount) * 100;
  return rate.toFixed(2);
};

// 获取日期范围文本
const getDateRangeText = () => {
  if (!filters.startDate || !filters.endDate) return '查询范围：不限时间';
  return `${filters.startDate} 至 ${filters.endDate}`;
};

// 检查订单是否超过24小时
const isOrderExpired = (createdAt) => {
  if (!createdAt) return false;
  const orderTime = new Date(createdAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - orderTime.getTime()) / (1000 * 60 * 60);
  return hoursDiff > 48;
};

// 手动到账功能已注释 - 不能随意使用
// 操作菜单选项
// const getActionOptions = (row) => {
//   const isExpired = isOrderExpired(row.created_at);
//   
//   return [
//     {
//       label: '手动到账',
//       icon: 'i-heroicons-check',
//       color: 'green',
//       action: 'manual_confirm',
//       disabled: isExpired,
//       tooltip: isExpired ? '订单超过48小时无法到账，请重新发起支付' : ''
//     }
//   ];
// };

// 处理操作菜单点击
// const handleActionClick = async (action, row) => {
//   switch (action) {
//     case 'manual_confirm':
//       const isExpired = isOrderExpired(row.created_at);
//       if (isExpired) {
//         toast.add({
//           id: 'expired-order',
//           title: '订单已过期',
//           description: '订单超过48小时无法到账，请重新发起支付',
//           color: 'red',
//           timeout: 5000
//         });
//         return;
//       }
//       await confirmPayment(row);
//       break;
//   }
// };

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast.add({
        title: '复制成功',
        description: '内容已复制到剪贴板',
        color: 'green',
        timeout: 2000
      });
    } else {
      // 备用方案：使用传统的 document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        toast.add({
          title: '复制成功',
          description: '内容已复制到剪贴板',
          color: 'green',
          timeout: 2000
        });
      } else {
        throw new Error('复制失败');
      }
    }
  } catch (error) {
    console.error('复制失败:', error);
    toast.add({
      title: '复制失败',
      description: '请手动复制内容',
      color: 'red',
      timeout: 2000
    });
  }
};

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadTodayStats(),
    loadPayments() // loadPayments会自动调用loadQueryStats
  ]);
});
</script>

<style scoped>
.payment-data-page {
  @apply space-y-6;
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
  border: 1px solid #f1f5f9; /* 添加表格外边框 */
}

.uniform-table :deep(th) {
  text-align: center;
  padding: 12px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9; /* 添加底部边框 */
  background-color: #f8fafc; /* 表头灰色背景 */
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
  border-bottom: 1px solid #f1f5f9; /* 添加底部边框 */
}

.uniform-table :deep(th:last-child),
.uniform-table :deep(td:last-child) {
  border-right: none;
}

/* 移动端表格列样式 */
@media (max-width: 768px) {
  .uniform-table :deep(th),
  .uniform-table :deep(td) {
    min-width: 120px; /* 确保列有最小宽度 */
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

.uniform-table :deep(td .cursor-pointer span) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  
  /* 移动端统计卡片调整为2列 */
  .grid-cols-2.md\\:grid-cols-6 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.table-scroll-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .table-scroll-container table {
    min-width: 800px;
  }
}
</style> 