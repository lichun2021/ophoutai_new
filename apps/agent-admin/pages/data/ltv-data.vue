<template>
  <div class="ltv-data-page">
    <!-- 页面标题 -->
    <div class="page-header mb-6">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">LTV数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看用户生命周期价值分析数据</p>
        </div>
      </div>
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

          <!-- 一级渠道 -->
          <UFormGroup label="一级渠道" class="flex-1">
            <USelect 
              v-model="filters.primaryChannelCode" 
              placeholder="请选择一级渠道"
              :options="primaryChannelOptions"
              icon="i-heroicons-building-office"
              @change="onPrimaryChannelChange"
            />
          </UFormGroup>

          <!-- 二级渠道 -->
          <UFormGroup label="二级渠道" class="flex-1">
            <USelect 
              v-model="filters.secondaryChannelCode" 
              placeholder="请选择二级渠道"
              :options="secondaryChannelOptions"
              icon="i-heroicons-building-office-2"
              :disabled="!filters.primaryChannelCode"
            />
          </UFormGroup>

          <!-- 游戏 -->
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
            @click="loadLTVData" 
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

    <!-- LTV详细数据表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">LTV详细数据</h3>
            <UBadge v-if="ltvData.length > 0" :label="`${ltvData.length}条记录`" variant="soft" size="xs" />
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="adminLevel > 0" label="代理权限数据" color="orange" variant="soft" size="xs" />
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
          :rows="ltvData" 
          :columns="ltvColumns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-chart-bar', 
            label: '暂无LTV数据',
            description: '请调整筛选条件后重新查询' 
          }"
          class="w-full uniform-table"
        >
        <template #stat_date-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-calendar" class="w-4 h-4 text-gray-400" />
            <span class="font-medium">{{ formatDisplayDate(row.stat_date) }}</span>
          </div>
        </template>

        <template #new_users-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" class="w-4 h-4 text-blue-400" />
            <span class="font-medium text-blue-600">{{ row.new_users || 0 }}</span>
          </div>
        </template>

        <template #ltv1_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv1_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv2_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv2_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv3_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv3_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv4_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv4_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv5_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv5_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv6_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv6_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv7_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ Number(row.ltv7_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv10_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-amber-500" />
            <span class="font-medium text-amber-600">{{ Number(row.ltv10_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv20_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-orange-500" />
            <span class="font-medium text-orange-600">{{ Number(row.ltv20_arpu || 0).toFixed(2) }}</span>
          </div>
        </template>

        <template #ltv30_arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-red-500" />
            <span class="font-medium text-red-600">{{ Number(row.ltv30_arpu || 0).toFixed(2) }}</span>
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

    <!-- 通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useAuthStore } from '~/store/auth'
import DatePicker from '~/components/DatePicker.vue'
import * as XLSX from 'xlsx'

// 页面元数据
definePageMeta({
  layout: 'default'
})

const authStore = useAuthStore()
const tips = useTips()

// 辅助函数：获取过去N天的日期
const getPastDate = (days) => {
  const date = new Date()
  // 要得到N天的数据（包含今天），应该减去 (N-1) 天
  date.setDate(date.getDate() - (days - 1))
  return date.toISOString().split('T')[0]
}

// 辅助函数：获取当前日期
const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0]
}

// 响应式数据
const loading = ref(false)
const exportLoading = ref(false)

// 日期选择器数据
const selected = ref({ 
  start: new Date(getPastDate(7)), 
  end: new Date(getCurrentDate()) 
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
const ltvColumns = [
  {
    key: 'stat_date',
    label: '注册日期',
    sortable: true
  },
  {
    key: 'new_users',
    label: '注册',
    sortable: true
  },
  {
    key: 'ltv1_arpu',
    label: 'LTV1',
    sortable: true
  },
  {
    key: 'ltv2_arpu',
    label: 'LTV2',
    sortable: true
  },
  {
    key: 'ltv3_arpu',
    label: 'LTV3',
    sortable: true
  },
  {
    key: 'ltv4_arpu',
    label: 'LTV4',
    sortable: true
  },
  {
    key: 'ltv5_arpu',
    label: 'LTV5',
    sortable: true
  },
  {
    key: 'ltv6_arpu',
    label: 'LTV6',
    sortable: true
  },
  {
    key: 'ltv7_arpu',
    label: 'LTV7',
    sortable: true
  },
  {
    key: 'ltv10_arpu',
    label: 'LTV10',
    sortable: true
  },
  {
    key: 'ltv20_arpu',
    label: 'LTV20',
    sortable: true
  },
  {
    key: 'ltv30_arpu',
    label: 'LTV30',
    sortable: true
  }
]

// 筛选条件
const filters = ref({
  startDate: getPastDate(7),
  endDate: getCurrentDate(),
  primaryChannelCode: '',
  secondaryChannelCode: '',
  gameId: ''
})

// LTV数据
const ltvData = ref([])

// 分页数据
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
})

// 下拉选项
const primaryChannelOptions = ref([])
const secondaryChannelOptions = ref([])
const gameOptions = ref([])

// 计算属性
const currentAdminId = computed(() => {
  if (authStore.isUser) {
    return authStore.userInfo?.id || ''
  } else {
    return authStore.id || ''
  }
})

const currentAdminLevel = computed(() => {
  if (authStore.isUser) {
    return authStore.userInfo?.level || 0
  } else {
    return authStore.permissions?.level || 0
  }
})

const adminLevel = computed(() => currentAdminLevel.value)

// 监听DatePicker选择变化
watch(selected, (newSelected) => {
  if (newSelected.start && newSelected.end) {
    filters.value.startDate = newSelected.start.toISOString().split('T')[0];
    filters.value.endDate = newSelected.end.toISOString().split('T')[0];
  }
}, { deep: true });

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

// 格式化单个日期显示
const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  
  try {
    let date;
    
    // 处理不同的日期格式
    if (typeof dateStr === 'string') {
      if (dateStr.includes('T')) {
        // ISO时间戳格式：2025-06-24T16:00:00.000Z
        date = new Date(dateStr.split('T')[0]);
      } else if (dateStr.includes('-')) {
        // 简单日期格式：2025-06-24
        date = new Date(dateStr + 'T00:00:00');
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = new Date(dateStr);
    }
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      console.warn('无效日期:', dateStr);
      return dateStr;
    }
    
    // 格式化为：2025-06-24
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('日期格式化失败:', error, dateStr);
    return dateStr.toString();
  }
};

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadPrimaryChannelOptions(),
    loadGameOptions(),
    loadLTVData()
  ])
})

// 加载一级渠道选项
const loadPrimaryChannelOptions = async () => {
  try {
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        adminId: currentAdminId.value
      }
    })

    if (response.success) {
      const options = []
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          })
        })
      }
      
      primaryChannelOptions.value = options
    } else {
      primaryChannelOptions.value = []
    }
      } catch (error) {
    console.error('加载一级渠道选项失败:', error)
    primaryChannelOptions.value = []
    tips.add({ 
      title: '获取渠道选项失败', 
      description: '请检查网络连接后重试',
      color: 'red'
    })
  }
}

// 加载二级渠道选项
const loadSecondaryChannelOptions = async (primaryChannelCode) => {
  try {
    if (!primaryChannelCode) {
      secondaryChannelOptions.value = []
      return
    }

    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        parentChannelCode: primaryChannelCode
      }
    })

    if (response.success) {
      const options = []
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          })
        })
      }
      
      secondaryChannelOptions.value = options
    } else {
      secondaryChannelOptions.value = []
    }
  } catch (error) {
    console.error('加载二级渠道选项失败:', error)
    secondaryChannelOptions.value = []
  }
}

// 加载游戏选项
const loadGameOptions = async () => {
  try {
    let response
    
    if (currentAdminLevel.value === 0) {
      response = await $fetch('/api/admin/games')
    } else {
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: currentAdminId.value
        }
      })
    }

    if (response.success) {
      const options = [
        {
          value: '',
          label: '全部游戏'
        }
      ]
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(game => {
          if (game.is_active) {
            options.push({
              value: game.game_code,
              label: game.game_name
            })
          }
        })
      }
      
      gameOptions.value = options
    } else {
      gameOptions.value = [{ value: '', label: '全部游戏' }]
    }
  } catch (error) {
    console.error('加载游戏选项失败:', error)
    gameOptions.value = [{ value: '', label: '全部游戏' }]
  }
}

// 一级渠道变化处理
const onPrimaryChannelChange = async () => {
  filters.value.secondaryChannelCode = ''
  await loadSecondaryChannelOptions(filters.value.primaryChannelCode)
}

// 加载LTV数据
const loadLTVData = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      adminId: currentAdminId.value.toString(),
      page: pagination.value.page.toString(),
      pageSize: pagination.value.pageSize.toString()
    })

    const selectedChannelCode = filters.value.secondaryChannelCode || filters.value.primaryChannelCode
    if (selectedChannelCode) {
      params.append('channelCode', selectedChannelCode)
    }

    if (filters.value.gameId) {
      params.append('gameId', filters.value.gameId)
    }

    console.log('LTV数据查询参数:', params.toString())
    const response = await $fetch(`/api/admin/ltv-data?${params.toString()}`)
    console.log('LTV数据API响应:', response)

    if (response.success) {
      ltvData.value = response.data.list || []
      pagination.value = response.data.pagination || {}
      console.log('LTV数据加载成功，数据量:', ltvData.value.length)
      console.log('分页信息:', pagination.value)
      console.log('LTV数据结构:', ltvData.value.slice(0, 2)) // 只打印前两条数据用于调试
    } else {
      console.error('API返回失败:', response.message)
      tips.add({ 
        title: '获取LTV数据失败', 
        description: response.message || '请检查筛选条件后重试',
        color: 'red'
      })
    }
  } catch (error) {
    console.error('加载LTV数据失败:', error)
    tips.add({ 
      title: '加载LTV数据失败', 
      description: '网络连接异常，请稍后重试',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 分页变化处理
const onPageChange = (newPage) => {
  pagination.value.page = newPage
  loadLTVData()
}

// 重置筛选条件
const resetFilters = () => {
  filters.value = {
    startDate: getPastDate(7),
    endDate: getCurrentDate(),
    primaryChannelCode: '',
    secondaryChannelCode: '',
    gameId: ''
  }
  secondaryChannelOptions.value = []
  pagination.value.page = 1
  loadLTVData()
}

// 导出数据
const exportData = async () => {
  if (ltvData.value.length === 0) {
    tips.add({ 
      title: '没有数据可导出', 
      description: '请先查询数据',
      color: 'yellow'
    })
    return
  }

  exportLoading.value = true
  try {
    // 准备导出数据
    const exportData = ltvData.value.map((item, index) => ({
      '序号': index + 1,
      '注册日期': formatDisplayDate(item.stat_date),
      '注册用户': item.new_users || 0,
      'LTV1': Number(item.ltv1_arpu || 0).toFixed(2),
      'LTV2': Number(item.ltv2_arpu || 0).toFixed(2),
      'LTV3': Number(item.ltv3_arpu || 0).toFixed(2),
      'LTV4': Number(item.ltv4_arpu || 0).toFixed(2),
      'LTV5': Number(item.ltv5_arpu || 0).toFixed(2),
      'LTV6': Number(item.ltv6_arpu || 0).toFixed(2),
      'LTV7': Number(item.ltv7_arpu || 0).toFixed(2),
      'LTV10': Number(item.ltv10_arpu || 0).toFixed(2),
      'LTV20': Number(item.ltv20_arpu || 0).toFixed(2),
      'LTV30': Number(item.ltv30_arpu || 0).toFixed(2),
      '渠道代码': item.channel_code || '',
      '游戏代码': item.game_code || ''
    }))

    // 创建工作簿和工作表
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)

    // 设置列宽
    const colWidths = [
      { wch: 6 },  // 序号
      { wch: 15 }, // 注册日期
      { wch: 12 }, // 注册用户
      { wch: 10 }, // LTV1
      { wch: 10 }, // LTV2
      { wch: 10 }, // LTV3
      { wch: 10 }, // LTV4
      { wch: 10 }, // LTV5
      { wch: 10 }, // LTV6
      { wch: 10 }, // LTV7
      { wch: 10 }, // LTV10
      { wch: 10 }, // LTV20
      { wch: 10 }, // LTV30
      { wch: 15 }, // 渠道代码
      { wch: 15 }  // 游戏代码
    ]
    ws['!cols'] = colWidths

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, 'LTV数据')

    // 生成文件名
    const fileName = `LTV数据_${filters.value.startDate}_${filters.value.endDate}.xlsx`

    // 导出文件
    XLSX.writeFile(wb, fileName)

    tips.add({ 
      title: '导出成功', 
      description: `已导出 ${exportData.length} 条数据`,
      color: 'green'
    })
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
  loadLTVData()
}
</script>

<style scoped>
.ltv-data-page {
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
  min-width: 1200px; /* LTV表格需要最小宽度 */
  font-size: 13px; /* 12列数据，稍微缩小字体 */
  border: 1px solid #f1f5f9; /* 添加表格外边框 */
}

.uniform-table :deep(th) {
  text-align: center;
  padding: 12px 6px; /* 稍微减少水平padding */
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
  padding: 12px 6px; /* 稍微减少水平padding */
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

/* LTV数据表格列分布（12列） */
.uniform-table :deep(th:nth-child(1)),
.uniform-table :deep(td:nth-child(1)) {
  width: 12%; /* 注册日期 */
  text-align: left; /* 日期左对齐 */
}

.uniform-table :deep(th:nth-child(2)),
.uniform-table :deep(td:nth-child(2)) {
  width: 8%; /* 注册 */
}

.uniform-table :deep(th:nth-child(3)),
.uniform-table :deep(td:nth-child(3)) {
  width: 8%; /* LTV1 */
}

.uniform-table :deep(th:nth-child(4)),
.uniform-table :deep(td:nth-child(4)) {
  width: 8%; /* LTV2 */
}

.uniform-table :deep(th:nth-child(5)),
.uniform-table :deep(td:nth-child(5)) {
  width: 8%; /* LTV3 */
}

.uniform-table :deep(th:nth-child(6)),
.uniform-table :deep(td:nth-child(6)) {
  width: 8%; /* LTV4 */
}

.uniform-table :deep(th:nth-child(7)),
.uniform-table :deep(td:nth-child(7)) {
  width: 8%; /* LTV5 */
}

.uniform-table :deep(th:nth-child(8)),
.uniform-table :deep(td:nth-child(8)) {
  width: 8%; /* LTV6 */
}

.uniform-table :deep(th:nth-child(9)),
.uniform-table :deep(td:nth-child(9)) {
  width: 8%; /* LTV7 */
}

.uniform-table :deep(th:nth-child(10)),
.uniform-table :deep(td:nth-child(10)) {
  width: 8%; /* LTV10 */
}

.uniform-table :deep(th:nth-child(11)),
.uniform-table :deep(td:nth-child(11)) {
  width: 8%; /* LTV20 */
}

.uniform-table :deep(th:nth-child(12)),
.uniform-table :deep(td:nth-child(12)) {
  width: 8%; /* LTV30 */
}

/* 确保flex内容居中对齐 */
.uniform-table :deep(.flex) {
  justify-content: center;
  align-items: center;
}

/* 注册日期列的flex左对齐 */
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