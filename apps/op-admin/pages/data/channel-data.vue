<template>
  <div class="channel-data-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">渠道数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看各渠道的用户注册、充值等数据统计</p>
        </div>
      </div>
    </div>



    <!-- 统计汇总卡片 -->
    <div v-if="channelData.length > 0" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 mb-3">{{ formatNumber(totalStats.totalRegisterUsers) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">总注册用户</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-cyan-600 mb-3">{{ formatNumber(totalStats.totalValidRegisterUsers) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-user-plus" class="w-5 h-5 text-cyan-500" />
            <span class="text-sm text-gray-600">总真实注册</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-yellow-600 mb-3">{{ formatNumber(totalStats.totalHighValueUsers) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-star" class="w-5 h-5 text-yellow-500" />
            <span class="text-sm text-gray-600">总优质用户</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 mb-3">¥{{ totalStats.totalRechargeAmount }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">总充值金额</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="filter-content">
        <div class="filter-row">
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

          <!-- 一级渠道选择 -->
          <UFormGroup label="一级渠道" class="flex-1">
            <USelect 
              v-model="filters.primaryChannelCode" 
              placeholder="请选择一级渠道"
              :options="primaryChannelOptions"
              icon="i-heroicons-building-office"
              @change="onPrimaryChannelChange"
            />
          </UFormGroup>

          <!-- 二级渠道选择 -->
          <UFormGroup label="二级渠道" class="flex-1">
            <USelect 
              v-model="filters.secondaryChannelCode" 
              placeholder="请选择二级渠道"
              :options="secondaryChannelOptions"
              icon="i-heroicons-building-office-2"
              :disabled="!filters.primaryChannelCode"
            />
          </UFormGroup>

          <!-- 游戏选择 -->
          <UFormGroup label="游戏" class="flex-1">
            <USelect 
              v-model="filters.gameId" 
              placeholder="请选择游戏"
              :options="gameOptions"
              icon="i-heroicons-puzzle-piece"
            />
          </UFormGroup>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3 mt-6 pt-6 border-t">
          <UButton 
            @click="loadChannelData" 
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
            @click="exportData"
            :loading="exportLoading"
            icon="i-heroicons-arrow-down-tray"
          >
            导出Excel
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 数据表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">渠道数据详情</h3>
            <UBadge v-if="channelData.length > 0" :label="`${channelData.length}条记录`" variant="soft" size="xs" />
          </div>
          <div class="flex items-center gap-2">
            <UButton 
              v-if="adminLevel > 0" 
              variant="soft" 
              color="yellow" 
              size="xs"
              icon="i-heroicons-exclamation-triangle"
            >
              代理权限数据
            </UButton>
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
          :rows="channelData" 
          :columns="columns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-chart-bar', 
            label: '暂无渠道数据',
            description: '请调整筛选条件后重新查询' 
          }"
          class="w-full uniform-table"
        >
        <template #stat_date-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-gray-400" />
            <span class="font-medium">{{ formatDate(row.stat_date) }}</span>
          </div>
        </template>

        <template #register_users-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-plus" class="w-4 h-4 text-blue-500" />
            <span class="font-medium text-blue-600">{{ formatNumber(row.register_users) }}</span>
          </div>
        </template>

        <template #valid_register_users-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-group" class="w-4 h-4 text-cyan-500" />
            <span class="font-medium text-cyan-600">{{ formatNumber(row.valid_register_users) }}</span>
          </div>
        </template>

        <template #character_count-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-purple-500" />
            <span class="font-medium text-purple-600">{{ formatNumber(row.character_count) }}</span>
          </div>
        </template>

        <template #high_value_users_200-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-star" class="w-4 h-4 text-yellow-500" />
            <span class="font-medium text-yellow-600">{{ formatNumber(row.high_value_users_200) }}</span>
          </div>
        </template>

        <template #recharge_times-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-trending-up" class="w-4 h-4 text-indigo-500" />
            <span class="font-medium text-indigo-600">{{ formatNumber(row.recharge_times) }}</span>
          </div>
        </template>

        <template #recharge_users-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ formatNumber(row.recharge_users) }}</span>
          </div>
        </template>

        <template #real_recharge_amount-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ formatAmount(row.real_recharge_amount) }}</span>
          </div>
        </template>

        <template #high_value_recharge_amount-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-orange-500" />
            <span class="font-medium text-orange-600">{{ formatAmount(row.high_value_recharge_amount) }}</span>
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
        <div v-else class="text-xs text-gray-500">
          所有数据已显示
        </div>
      </div>
    </UCard>



    <!-- 统计周期显示 -->
    <div class="text-center mt-6">
      <UAlert
        icon="i-heroicons-information-circle"
        color="blue"
        variant="soft"
        size="sm"
        :title="`统计周期：${filters.startDate} 至 ${filters.endDate}`"
        :description="adminLevel > 0 ? '显示当前代理权限范围内的数据' : '显示全平台数据'"
      />
    </div>

    <!-- 通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '~/store/auth';

// 页面元数据
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();
const toast = useToast();

// 加载状态
const loading = ref(false);
const exportLoading = ref(false);

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

// 筛选条件
const filters = ref({
  startDate: getPastDate(7),
  endDate: getCurrentDate(),
  primaryChannelCode: '',
  secondaryChannelCode: '',
  gameId: ''
});

// 日期选择器数据（参考官方demo格式）
const selected = ref({ 
  start: new Date(getPastDate(7)), 
  end: new Date(getCurrentDate()) 
});

// 渠道数据
const channelData = ref([]);

// 分页数据
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
});

// 下拉选项
const primaryChannelOptions = ref([]);
const secondaryChannelOptions = ref([]);
const gameOptions = ref([]);

// 日期范围选项
const dateRanges = [
  { label: '最近7天', days: 7 },
  { label: '最近14天', days: 14 },
  { label: '最近30天', days: 30 },
  { label: '最近60天', days: 60 },
  { label: '最近90天', days: 90 }
];

// 表格列定义
const columns = [
  {
    key: 'stat_date',
    label: '日期',
    sortable: true
  },
  {
    key: 'register_users',
    label: '注册',
    sortable: true
  },
  {
    key: 'valid_register_users',
    label: '真实注册',
    sortable: true
  },
  {
    key: 'character_count',
    label: '角色数',
    sortable: true
  },
  {
    key: 'high_value_users_200',
    label: '优质用户(充值超过200)',
    sortable: true
  },
  {
    key: 'recharge_times',
    label: '充值次数',
    sortable: true
  },
  {
    key: 'recharge_users',
    label: '充值人数',
    sortable: true
  },
  {
    key: 'real_recharge_amount',
    label: '充值总额',
    sortable: true
  },
  {
    key: 'high_value_recharge_amount',
    label: '优质用户充值总额',
    sortable: true
  }
];

// 计算属性
const currentAdminId = computed(() => {
  if (authStore.isUser) {
    return authStore.userInfo?.id || '';
  } else {
    return authStore.id || '';
  }
});

const currentAdminLevel = computed(() => {
  if (authStore.isUser) {
    return authStore.userInfo?.level || 0;
  } else {
    return authStore.permissions?.level || 0;
  }
});

const adminLevel = computed(() => currentAdminLevel.value);

// 统计汇总
const totalStats = computed(() => {
  const stats = {
    totalRegisterUsers: 0,
    totalValidRegisterUsers: 0,
    totalHighValueUsers: 0,
    totalRechargeAmount: '0.00'
  };

  if (channelData.value.length > 0) {
    let totalRecharge = 0;
    channelData.value.forEach(item => {
      stats.totalRegisterUsers += Number(item.register_users || 0);
      stats.totalValidRegisterUsers += Number(item.valid_register_users || 0);
      stats.totalHighValueUsers += Number(item.high_value_users_200 || 0);
      totalRecharge += Number(item.real_recharge_amount || 0);
    });
    stats.totalRechargeAmount = totalRecharge.toFixed(2);
  }

  return stats;
});

// 监听DatePicker选择变化
watch(selected, (newSelected) => {
  if (newSelected.start && newSelected.end) {
    filters.value.startDate = newSelected.start.toISOString().split('T')[0];
    filters.value.endDate = newSelected.end.toISOString().split('T')[0];
  }
}, { deep: true });

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadPrimaryChannelOptions(),
    loadGameOptions(),
    loadChannelData()
  ]);
});

// 设置日期范围
const setDateRange = (days) => {
  const endDate = getCurrentDate();
  const startDate = getPastDate(days);
  
  // 更新filters
  filters.value.endDate = endDate;
  filters.value.startDate = startDate;
  
  // 更新selected（DatePicker需要Date对象）
  selected.value = {
    start: new Date(startDate),
    end: new Date(endDate)
  };
};

// 检查是否选中某个日期范围
const isRangeSelected = (days) => {
  const expectedStart = getPastDate(days);
  const expectedEnd = getCurrentDate();
  return filters.value.startDate === expectedStart && filters.value.endDate === expectedEnd;
};

// 格式化日期范围显示
const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '请选择时间区间';
  return `${startDate} 至 ${endDate}`;
};

// 格式化数字
const formatNumber = (value) => {
  return Number(value || 0).toLocaleString();
};

// 格式化金额
const formatAmount = (value) => {
  return Number(value || 0).toFixed(2);
};

// 格式化日期显示
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr instanceof Date) {
    return dateStr.toISOString().split('T')[0];
  }
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }
  return dateStr;
};

// 加载一级渠道选项
const loadPrimaryChannelOptions = async () => {
  try {
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        adminId: currentAdminId.value
      }
    });

    if (response.success) {
      const options = [];
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          });
        });
      }
      primaryChannelOptions.value = options;
    } else {
      primaryChannelOptions.value = [];
    }
  } catch (error) {
    console.error('加载一级渠道选项失败:', error);
    primaryChannelOptions.value = [];
  }
};

// 加载二级渠道选项
const loadSecondaryChannelOptions = async (primaryChannelCode) => {
  try {
    if (!primaryChannelCode) {
      secondaryChannelOptions.value = [];
      return;
    }

    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        parentChannelCode: primaryChannelCode
      }
    });

    if (response.success) {
      const options = [];
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          });
        });
      }
      secondaryChannelOptions.value = options;
    } else {
      secondaryChannelOptions.value = [];
    }
  } catch (error) {
    console.error('加载二级渠道选项失败:', error);
    secondaryChannelOptions.value = [];
  }
};

// 加载游戏选项
const loadGameOptions = async () => {
  try {
    let response;
    
    if (currentAdminLevel.value === 0) {
      response = await $fetch('/api/admin/games');
    } else {
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: currentAdminId.value
        }
      });
    }

    if (response.success) {
      const options = [
        {
          value: '',
          label: '全部游戏'
        }
      ];
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(game => {
          if (game.is_active) {
            options.push({
              value: game.game_code,
              label: game.game_name
            });
          }
        });
      }
      
      gameOptions.value = options;
    } else {
      gameOptions.value = [{ value: '', label: '全部游戏' }];
    }
  } catch (error) {
    console.error('加载游戏选项失败:', error);
    gameOptions.value = [{ value: '', label: '全部游戏' }];
  }
};

// 一级渠道变化处理
const onPrimaryChannelChange = async () => {
  filters.value.secondaryChannelCode = '';
  await loadSecondaryChannelOptions(filters.value.primaryChannelCode);
};

// 加载渠道数据
const loadChannelData = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      adminId: currentAdminId.value.toString(),
      page: pagination.value.page.toString(),
      pageSize: pagination.value.pageSize.toString()
    });

    const selectedChannelCode = filters.value.secondaryChannelCode || filters.value.primaryChannelCode;
    if (selectedChannelCode) {
      params.append('channelCode', selectedChannelCode);
    }

    if (filters.value.gameId) {
      params.append('gameId', filters.value.gameId);
    }

    const response = await $fetch(`/api/admin/channel-data?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success) {
      channelData.value = response.data.list || [];
      pagination.value = response.data.pagination || {};
      
      toast.add({
        title: '数据加载成功',
        description: `共加载 ${channelData.value.length} 条记录`,
        color: 'green'
      });
    } else {
      throw new Error(response.message || '获取数据失败');
    }
  } catch (error) {
    console.error('加载渠道数据失败:', error);
    toast.add({
      title: '数据加载失败',
      description: error.message || '请检查网络连接后重试',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

// 分页变化处理
const onPageChange = (newPage) => {
  pagination.value.page = newPage;
  loadChannelData();
};

// 重置筛选条件
const resetFilters = () => {
  filters.value = {
    startDate: getPastDate(7),
    endDate: getCurrentDate(),
    primaryChannelCode: '',
    secondaryChannelCode: '',
    gameId: ''
  };
  secondaryChannelOptions.value = [];
  pagination.value.page = 1;
  loadChannelData();
  
  toast.add({
    title: '条件已重置',
    description: '筛选条件已重置为默认值',
    color: 'blue'
  });
};

// 导出Excel功能
const exportData = async () => {
  exportLoading.value = true;
  try {
    // 获取所有数据（不分页）
    const params = new URLSearchParams({
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      adminId: currentAdminId.value.toString(),
      page: '1',
      pageSize: '10000'
    });

    const selectedChannelCode = filters.value.secondaryChannelCode || filters.value.primaryChannelCode;
    if (selectedChannelCode) {
      params.append('channelCode', selectedChannelCode);
    }

    if (filters.value.gameId) {
      params.append('gameId', filters.value.gameId);
    }

    const response = await $fetch(`/api/admin/channel-data?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success && response.data.list) {
      // 转换数据格式
      const exportData = response.data.list.map(item => ({
        '日期': formatDate(item.stat_date),
        '注册': item.register_users || 0,
        '真实注册': item.valid_register_users || 0,
        '角色数': item.character_count || 0,
        '优质用户(充值超过200)': item.high_value_users_200 || 0,
        '充值次数': item.recharge_times || 0,
        '充值人数': item.recharge_users || 0,
        '充值总额': Number(item.real_recharge_amount || 0).toFixed(2),
        '优质用户充值总额': Number(item.high_value_recharge_amount || 0).toFixed(2)
      }));

      // 动态导入xlsx库
      const XLSX = await import('xlsx');
      
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // 设置列宽
      const colWidths = [
        { wch: 12 }, // 日期
        { wch: 8 },  // 注册
        { wch: 10 }, // 真实注册
        { wch: 8 },  // 角色数
        { wch: 18 }, // 优质用户(充值超过200)
        { wch: 10 }, // 充值次数
        { wch: 10 }, // 充值人数
        { wch: 12 }, // 充值总额
        { wch: 16 }  // 优质用户充值总额
      ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, '渠道数据');
      
      // 生成文件名
      const fileName = `渠道数据_${filters.value.startDate}_${filters.value.endDate}.xlsx`;
      
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

// 自定义分页逻辑
const getVisiblePages = () => {
  const totalPages = Math.ceil(pagination.value.total / pagination.value.pageSize);
  const visiblePages = [];
  const maxVisiblePages = 5;
  const halfVisiblePages = Math.floor(maxVisiblePages / 2);

  let startPage = Math.max(pagination.value.page - halfVisiblePages, 1);
  let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(endPage - maxVisiblePages + 1, 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    visiblePages.push(i);
  }

  return visiblePages;
};

const handlePageChange = (newPage) => {
  pagination.value.page = newPage;
  loadChannelData();
};
</script>

<style scoped>
.channel-data-page {
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

/* 渠道数据表格列分布 */
.uniform-table :deep(th:nth-child(1)),
.uniform-table :deep(td:nth-child(1)) {
  width: 12%; /* 日期 */
  text-align: left; /* 日期左对齐 */
}

.uniform-table :deep(th:nth-child(2)),
.uniform-table :deep(td:nth-child(2)) {
  width: 8%; /* 注册 */
}

.uniform-table :deep(th:nth-child(3)),
.uniform-table :deep(td:nth-child(3)) {
  width: 10%; /* 真实注册 */
}

.uniform-table :deep(th:nth-child(4)),
.uniform-table :deep(td:nth-child(4)) {
  width: 8%; /* 角色数 */
}

.uniform-table :deep(th:nth-child(5)),
.uniform-table :deep(td:nth-child(5)) {
  width: 18%; /* 优质用户(充值超过200) */
}

.uniform-table :deep(th:nth-child(6)),
.uniform-table :deep(td:nth-child(6)) {
  width: 10%; /* 充值次数 */
}

.uniform-table :deep(th:nth-child(7)),
.uniform-table :deep(td:nth-child(7)) {
  width: 10%; /* 充值人数 */
}

.uniform-table :deep(th:nth-child(8)),
.uniform-table :deep(td:nth-child(8)) {
  width: 12%; /* 充值总额 */
}

.uniform-table :deep(th:nth-child(9)),
.uniform-table :deep(td:nth-child(9)) {
  width: 12%; /* 优质用户充值总额 */
}

/* 确保flex内容居中对齐 */
.uniform-table :deep(.flex) {
  justify-content: center;
  align-items: center;
}

/* 日期列的flex左对齐 */
.uniform-table :deep(td:nth-child(1) .flex) {
  justify-content: flex-start;
}

/* 移动端表格横向滚动 */
.mobile-table-wrapper {
  @apply w-full overflow-x-auto;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .filter-row {
    @apply flex-col gap-3;
  }
  
  .filter-row > * {
    @apply w-full;
  }
}
</style> 