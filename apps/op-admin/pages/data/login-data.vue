<template>
  <div class="login-data-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">登录数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看用户登录记录和登录统计信息</p>
        </div>
      </div>
    </div>

    <!-- 统计汇总卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 mb-3">{{ formatNumber(todayStats.loginCount) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-cursor-arrow-rays" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">今日登录次数</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 mb-3">{{ formatNumber(todayStats.uniqueUsers) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-users" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">今日登录玩家</span>
          </div>
        </div>
      </UCard>

      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600 mb-3">{{ pagination.total }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">当前查询登录记录({{ getDateRangeText() }})</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="filter-content">
        <div class="filter-row">
          <!-- 小号ID -->
          <UFormGroup label="小号ID" class="flex-1">
            <UInput 
              v-model="filters.sub_user_name" 
              placeholder="请输入小号ID"
              icon="i-heroicons-user"
              @keyup.enter="loadLogs"
            />
          </UFormGroup>

          <!-- 游戏 -->
          <UFormGroup label="游戏" class="flex-1">
            <USelect 
              v-model="filters.game_code" 
              placeholder="选择游戏"
              :options="gameOptions"
              icon="i-heroicons-puzzle-piece"
            />
          </UFormGroup>

          <!-- 设备IMEI -->
          <UFormGroup label="设备IMEI" class="flex-1">
            <UInput 
              v-model="filters.imei" 
              placeholder="请输入设备IMEI"
              icon="i-heroicons-device-phone-mobile"
              @keyup.enter="loadLogs"
            />
          </UFormGroup>

          <!-- 渠道 -->
          <UFormGroup label="渠道" class="flex-1">
            <USelect 
              v-model="filters.channel_code" 
              placeholder="选择渠道"
              :options="channelOptions"
              icon="i-heroicons-building-office"
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
            @click="loadLogs" 
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
            @click="exportLogs"
            :loading="exportLoading"
            icon="i-heroicons-arrow-down-tray"
          >
            导出Excel
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 登录记录表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">登录记录</h3>
            <UBadge v-if="logs.length > 0" :label="`${logs.length}条记录`" variant="soft" size="xs" />
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
          :rows="logs" 
          :columns="loginColumns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-arrow-right-on-rectangle', 
            label: '暂无登录记录',
            description: '请调整筛选条件后重新查询' 
          }"
          class="w-full uniform-table"
        >
        <template #sub_user_name-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user" class="w-4 h-4 text-blue-400" />
            <span class="font-medium">{{ row.sub_user_name || row.username || '-' }}</span>
          </div>
        </template>

        <template #game_code-data="{ row }">
          <div v-if="row.game_code" class="flex items-center gap-2">
            <UIcon name="i-heroicons-puzzle-piece" class="w-4 h-4 text-purple-500" />
            <span class="font-medium text-purple-600">{{ getGameName(row.game_code) }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #login_time-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400" />
            <span class="text-sm">{{ formatDateTime(row.login_time) }}</span>
          </div>
        </template>

        <template #imei-data="{ row }">
          <div class="flex items-center gap-2" v-if="row.imei">
            <UIcon name="i-heroicons-device-phone-mobile" class="w-4 h-4 text-green-400" />
            <span class="font-mono text-sm">{{ row.imei }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #ip_address-data="{ row }">
          <div class="flex items-center gap-2" v-if="row.ip_address">
            <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-indigo-400" />
            <span class="font-mono text-sm">{{ row.ip_address }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #device-data="{ row }">
          <div class="flex items-center gap-2" v-if="row.device">
            <UIcon name="i-heroicons-computer-desktop" class="w-4 h-4 text-gray-400" />
            <span 
              class="text-sm truncate max-w-xs" 
              :title="row.device"
            >
              {{ truncateText(row.device, 20) }}
            </span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #channel_code-data="{ row }">
          <div v-if="row.channel_code" class="flex items-center gap-2">
            <UIcon name="i-heroicons-building-office" class="w-4 h-4 text-orange-500" />
            <span class="font-medium text-orange-600">{{ row.channel_code }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
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
const logs = ref([]);
const gameMap = ref(new Map()); // 游戏代码到游戏名称的映射

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
const loginColumns = [
  {
    key: 'login_time',
    label: '登录时间',
    sortable: true
  },
  {
    key: 'sub_user_name',
    label: '小号ID',
    sortable: true
  },
  {
    key: 'game_code',
    label: '游戏',
    sortable: true
  },
  {
    key: 'imei',
    label: 'IMEI',
    sortable: true
  },
  {
    key: 'ip_address',
    label: 'IP地址',
    sortable: true
  },
  {
    key: 'device',
    label: '设备',
    sortable: true
  },
  {
    key: 'channel_code',
    label: '渠道',
    sortable: true
  }
];

// 今日统计数据
const todayStats = ref({
  loginCount: 0,
  uniqueUsers: 0
});

// 下拉选项数据
const gameOptions = ref([
  { value: '', label: '全部游戏' }
]);

const channelOptions = ref([
  { value: '', label: '全部渠道' }
]);

const filters = reactive({
  username: '',
  sub_user_name: '',
  game_code: '',
  imei: '',
  channel_code: '',
  startDate: getPastDate(7),
  endDate: getCurrentDate()
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
  if (!startDate || !endDate) return '请选择时间区间';
  return `${startDate} 至 ${endDate}`;
};

// 格式化数字
const formatNumber = (value) => {
  return Number(value || 0).toLocaleString();
};

// 方法
const formatDate = (dateTimeString) => {
  if (!dateTimeString) return '-';
  const date = new Date(dateTimeString);
  return date.toLocaleDateString('zh-CN');
};

const formatTime = (dateTimeString) => {
  if (!dateTimeString) return '-';
  const date = new Date(dateTimeString);
  return date.toLocaleTimeString('zh-CN');
};

const truncateText = (text, maxLength) => {
  if (!text) return '-';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

const formatDateTime = (dateTimeString) => {
  if (!dateTimeString) return '-';
  // MySQL 字符串 "YYYY-MM-DD HH:mm:ss" 直接显示，避免被当作 UTC 解读少8小时
  if (typeof dateTimeString === 'string' && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(dateTimeString)) {
    return dateTimeString;
  }
  const date = new Date(dateTimeString);
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai'
    }).format(date);
  } catch {
    return date.toLocaleString('zh-CN');
  }
};

// 加载登录记录
const loadLogs = async () => {
  try {
    loading.value = true;

    const params = new URLSearchParams({
      page: pagination.page.toString(),
      pageSize: pagination.pageSize.toString()
    });

    if (filters.username) params.append('username', filters.username);
    if (filters.sub_user_name) params.append('sub_user_name', filters.sub_user_name);
    if (filters.game_code) params.append('game_code', filters.game_code);
    if (filters.imei) params.append('imei', filters.imei);
    if (filters.channel_code) params.append('channel_code', filters.channel_code);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/user-login-logs?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success) {
      logs.value = response.data.logs;
      pagination.total = response.data.pagination.total;
      pagination.totalPages = response.data.pagination.totalPages;
      
      toast.add({
        title: '数据加载成功',
        description: `共加载 ${logs.value.length} 条登录记录`,
        color: 'green'
      });
    } else {
      throw new Error(response.message || '获取登录记录失败');
    }
  } catch (error) {
    console.error('加载登录记录失败:', error);
    toast.add({
      title: '数据加载失败',
      description: error.message || '请检查网络连接后重试',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

// 加载游戏列表并建立映射
const loadGameMap = async () => {
  try {
    // 获取当前登录管理员信息
    const currentPermissions = authStore.permissions;
    
    if (!currentPermissions) {
      console.error('无法获取当前管理员权限信息');
      return;
    }
    
    const currentLevel = currentPermissions.level;
    const allowedGameIds = currentPermissions.game_ids || [];
    
    console.log('当前管理员游戏权限信息:', {
      level: currentLevel,
      allowed_game_ids: allowedGameIds
    });

    // 获取游戏列表
    let response;
    if (currentLevel === 0) {
      // 超级管理员获取所有游戏
      response = await $fetch('/api/admin/games');
      console.log('超级管理员模式，获取所有游戏');
    } else {
      // 普通管理员获取被授权的游戏
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: authStore.id
        }
      });
      console.log('代理管理员模式，获取授权游戏');
    }

    if (response.success && response.data) {
      const map = new Map();
      const options = [{ value: '', label: '全部游戏' }];
      
      response.data.forEach(game => {
        if (game.game_code && game.game_name) {
          map.set(game.game_code, game.game_name);
          options.push({
            value: game.game_code,
            label: game.game_name
          });
        }
      });
      
      gameMap.value = map;
      gameOptions.value = options;
      console.log('游戏映射表加载完成:', map);
      console.log('游戏选项加载完成:', options);
    }
  } catch (error) {
    console.error('加载游戏列表失败:', error);
  }
};

// 加载渠道选项
const loadChannelOptions = async () => {
  try {
    // 获取当前登录管理员信息
    const currentPermissions = authStore.permissions;
    
    if (!currentPermissions) {
      console.error('无法获取当前管理员权限信息');
      return;
    }
    
    const currentLevel = currentPermissions.level;
    const currentChannelCode = currentPermissions.channel_code;
    
    console.log('当前管理员权限信息:', {
      level: currentLevel,
      channel_code: currentChannelCode
    });

    // 获取所有管理员列表
    const response = await $fetch('/api/admin/list', {
      query: {
        admin_id: authStore.id // 传递当前管理员ID用于权限过滤
      }
    });
    if (!response.data || !Array.isArray(response.data)) {
      return;
    }

    const options = [{ value: '', label: '全部渠道' }];
    let allowedChannelCodes = [];

    if (currentLevel === 0) {
      // 超级管理员可以查看所有渠道
      allowedChannelCodes = response.data
        .filter(admin => admin.channel_code)
        .map(admin => admin.channel_code);
      console.log('超级管理员模式，显示所有渠道');
    } else {
      // 代理管理员需要获取自己和下级的渠道代码
      if (currentChannelCode) {
        allowedChannelCodes.push(currentChannelCode);
        
        // 获取所有下级渠道代码
        try {
          const childChannelsResponse = await $fetch('/api/admin/get-child-channels', {
            method: 'POST',
            body: { channel_code: currentChannelCode }
          });
          
          if (childChannelsResponse.success && childChannelsResponse.data) {
            allowedChannelCodes = allowedChannelCodes.concat(childChannelsResponse.data);
          }
        } catch (error) {
          console.error('获取下级渠道失败:', error);
        }
      }
      
      console.log(`代理管理员模式，允许的渠道: [${allowedChannelCodes.join(', ')}]`);
    }

    // 根据权限过滤渠道选项
    response.data.forEach(admin => {
      if (admin.channel_code && (currentLevel === 0 || allowedChannelCodes.includes(admin.channel_code))) {
        options.push({
          value: admin.channel_code,
          label: `${admin.channel_code} (${admin.name})`
        });
      }
    });
    
    channelOptions.value = options;
    console.log('渠道选项加载完成:', options);
  } catch (error) {
    console.error('加载渠道选项失败:', error);
  }
};

// 根据游戏代码获取游戏名称
const getGameName = (gameCode) => {
  if (!gameCode) return '-';
  return gameMap.value.get(gameCode) || gameCode;
};

// 加载今日统计数据
const loadTodayStats = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await $fetch(`/api/admin/user-login-logs?startDate=${today}&endDate=${today}&statsOnly=true`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });
    
    if (response.success) {
      todayStats.value = {
        loginCount: response.data.totalLogs || 0,
        uniqueUsers: response.data.uniqueUsers || 0
      };
    }
  } catch (error) {
    console.error('加载今日统计失败:', error);
  }
};

// 重置筛选条件
const resetFilters = () => {
  filters.username = '';
  filters.sub_user_name = '';
  filters.game_code = '';
  filters.imei = '';
  filters.channel_code = '';
  filters.startDate = '';
  filters.endDate = '';
  pagination.page = 1;
  
  // 重置日期选择器
  selected.value = {
    start: new Date(getPastDate(7)),
    end: new Date(getCurrentDate())
  };
  
  loadLogs();
  
  toast.add({
    title: '条件已重置',
    description: '筛选条件已重置为默认值',
    color: 'blue'
  });
};

// 获取日期范围文本
const getDateRangeText = () => {
  if (!filters.startDate || !filters.endDate) return '登录时间';
  return `登录时间: ${filters.startDate} 至 ${filters.endDate}`;
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
  pagination.page = page;
  loadLogs();
};

// 导出数据
const exportLogs = async () => {
  exportLoading.value = true;
  try {
    // 获取所有登录记录数据（不分页）
    const params = new URLSearchParams({
      page: '1',
      pageSize: '10000'
    });

    if (filters.username) params.append('username', filters.username);
    if (filters.sub_user_name) params.append('sub_user_name', filters.sub_user_name);
    if (filters.game_code) params.append('game_code', filters.game_code);
    if (filters.imei) params.append('imei', filters.imei);
    if (filters.channel_code) params.append('channel_code', filters.channel_code);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/user-login-logs?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success && response.data.logs) {
      // 转换数据格式
      const exportData = response.data.logs.map(item => ({
        '登录时间': formatDateTime(item.login_time),
        '小号ID': item.sub_user_name || item.username || '',
        '游戏': getGameName(item.game_code),
        'IMEI': item.imei || '-',
        'IP地址': item.ip_address || '-',
        '设备': item.device || '-',
        '渠道': item.channel_code || '-'
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
        { wch: 18 }, // 登录时间
        { wch: 15 }, // 小号ID
        { wch: 15 }, // 游戏
        { wch: 20 }, // IMEI
        { wch: 15 }, // IP地址
        { wch: 30 }, // 设备
        { wch: 12 }  // 渠道
      ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, '登录数据');
      
      // 生成文件名
      const fileName = `登录数据_${new Date().toISOString().split('T')[0]}.xlsx`;
      
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

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadGameMap(),
    loadChannelOptions(),
    loadTodayStats(),
    loadLogs()
  ]);
});
</script>

<style scoped>
.login-data-page {
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