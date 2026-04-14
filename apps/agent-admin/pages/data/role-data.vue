<template>
  <div class="role-data-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-user-circle" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">角色数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看游戏角色信息和统计数据</p>
        </div>
      </div>
    </div>

    <!-- 统计汇总卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 mb-3">{{ formatNumber(todayStats.characterCount) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-plus-circle" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">今日创建角色</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 mb-3">{{ formatNumber(todayStats.totalCharacters) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-users" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">总角色数量</span>
          </div>
        </div>
      </UCard>

      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600 mb-3">{{ pagination.total }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">当前查询角色({{ getDateRangeText() }})</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="filter-content">
        <div class="filter-row">
          <!-- 用户ID -->
          <UFormGroup label="用户ID" class="flex-1">
            <UInput 
              v-model="filters.user_id" 
              placeholder="请输入用户ID"
              icon="i-heroicons-hashtag"
              @keyup.enter="loadCharacters"
            />
          </UFormGroup>

          <!-- 小号ID -->
          <UFormGroup label="小号ID" class="flex-1">
            <UInput 
              v-model="filters.subuser_id" 
              placeholder="请输入小号ID"
              icon="i-heroicons-user"
              @keyup.enter="loadCharacters"
            />
          </UFormGroup>

          <!-- 小号名称 -->
          <UFormGroup label="小号名称" class="flex-1">
            <UInput 
              v-model="filters.subuser_name" 
              placeholder="请输入小号名称"
              icon="i-heroicons-identification"
              @keyup.enter="loadCharacters"
            />
          </UFormGroup>

          <!-- 角色名称 -->
          <UFormGroup label="角色名称" class="flex-1">
            <UInput 
              v-model="filters.character_name" 
              placeholder="请输入角色名称"
              icon="i-heroicons-user-circle"
              @keyup.enter="loadCharacters"
            />
          </UFormGroup>

          <!-- 角色UUID -->
          <UFormGroup label="角色UUID" class="flex-1">
            <UInput 
              v-model="filters.uuid" 
              placeholder="请输入角色UUID"
              icon="i-heroicons-key"
              @keyup.enter="loadCharacters"
            />
          </UFormGroup>

          <!-- 游戏 -->
          <UFormGroup label="游戏" class="flex-1">
            <USelect 
              v-model="filters.game_id" 
              placeholder="选择游戏"
              :options="gameOptions"
              icon="i-heroicons-puzzle-piece"
            />
          </UFormGroup>

          <!-- 服务器ID -->
          <UFormGroup label="服务器ID" class="flex-1">
            <UInput 
              v-model="filters.server_id" 
              placeholder="请输入服务器ID"
              icon="i-heroicons-server"
              @keyup.enter="loadCharacters"
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
            @click="loadCharacters" 
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
            @click="exportCharacters"
            :loading="exportLoading"
            icon="i-heroicons-arrow-down-tray"
          >
            导出Excel
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 角色记录表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">角色查询</h3>
            <UBadge v-if="characters.length > 0" :label="`${characters.length}条记录`" variant="soft" size="xs" />
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
            :rows="characters" 
            :columns="characterColumns"
            :loading="loading"
            :empty-state="{ 
              icon: 'i-heroicons-user-circle', 
              label: '暂无角色记录',
              description: '请调整筛选条件后重新查询' 
            }"
            class="w-full uniform-table"
          >
        <template #user_id-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-hashtag" class="w-4 h-4 text-gray-400" />
            <span class="font-medium">{{ row.user_id || '-' }}</span>
          </div>
        </template>

        <template #subuser_id-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user" class="w-4 h-4 text-green-400" />
            <span class="font-medium text-green-600">{{ row.subuser_id || '-' }}</span>
          </div>
        </template>

        <template #subuser_name-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-identification" class="w-4 h-4 text-orange-400" />
            <span class="font-medium text-orange-600">{{ row.subuser_name || '-' }}</span>
          </div>
        </template>

        <template #username-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user" class="w-4 h-4 text-blue-400" />
            <span class="font-medium">{{ row.username || '-' }}</span>
          </div>
        </template>

        <template #character_name-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-purple-400" />
            <span class="font-medium text-purple-600">{{ row.character_name || '-' }}</span>
          </div>
        </template>

        <template #uuid-data="{ row }">
          <div class="flex items-center gap-2" v-if="row.uuid">
            <UIcon name="i-heroicons-key" class="w-4 h-4 text-gray-400" />
            <span 
              class="font-mono text-sm cursor-pointer" 
              :title="row.uuid"
              @click="copyToClipboard(row.uuid)"
            >
              {{ formatUuid(row.uuid) }}
            </span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #game_name-data="{ row }">
          <UBadge 
            v-if="row.game_name"
            :label="row.game_name" 
            color="indigo" 
            variant="soft"
          />
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #character_level-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-star" class="w-4 h-4 text-yellow-500" />
            <span class="font-medium text-yellow-600">{{ row.character_level || 0 }}</span>
          </div>
        </template>

        <template #gold_coins-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-yellow-500" />
            <span class="font-medium text-yellow-600">{{ formatNumber(row.gold_coins) }}</span>
          </div>
        </template>

        <template #diamond_coins-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-cube" class="w-4 h-4 text-blue-500" />
            <span class="font-medium text-blue-600">{{ formatNumber(row.diamond_coins) }}</span>
          </div>
        </template>

        <template #server_id-data="{ row }">
          <UBadge 
            v-if="row.server_id"
            :label="`服务器${row.server_id}`" 
            color="gray" 
            variant="soft"
          />
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #channel_code-data="{ row }">
          <UBadge 
            v-if="row.channel_code"
            :label="row.channel_code" 
            color="orange" 
            variant="soft"
          />
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #last_login_at-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400" />
            <span class="text-sm">{{ formatDateTime(row.last_login_at) }}</span>
          </div>
        </template>

        <template #created_at-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-calendar" class="w-4 h-4 text-gray-400" />
            <span class="text-sm">{{ formatDateTime(row.created_at) }}</span>
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
const characters = ref([]);
const gameOptions = ref([]);

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
const characterColumns = [
  {
    key: 'user_id',
    label: '用户ID',
    sortable: true
  },
  {
    key: 'subuser_id',
    label: '小号ID',
    sortable: true
  },
  {
    key: 'subuser_name',
    label: '小号名称',
    sortable: true
  },
  {
    key: 'username',
    label: '用户名',
    sortable: true
  },
  {
    key: 'character_name',
    label: '角色名称',
    sortable: true
  },
  {
    key: 'uuid',
    label: '角色UUID',
    sortable: true
  },
  {
    key: 'game_name',
    label: '游戏',
    sortable: true
  },
  {
    key: 'character_level',
    label: '等级',
    sortable: true
  },
  {
    key: 'gold_coins',
    label: '金币',
    sortable: true
  },
  {
    key: 'diamond_coins',
    label: '钻石',
    sortable: true
  },
  {
    key: 'server_id',
    label: '服务器',
    sortable: true
  },
  {
    key: 'channel_code',
    label: '渠道',
    sortable: true
  },
  {
    key: 'last_login_at',
    label: '最后登录',
    sortable: true
  },
  {
    key: 'created_at',
    label: '创建时间',
    sortable: true
  }
];

// 今日统计数据
const todayStats = ref({
  characterCount: 0,
  totalCharacters: 0
});

const filters = reactive({
  user_id: '',
  subuser_id: '',
  subuser_name: '',
  character_name: '',
  uuid: '',
  game_id: '',
  server_id: '',
  startDate: '',
  endDate: ''
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
});

// 方法
const formatDateTime = (dateTimeString) => {
  if (!dateTimeString) return '-';
  const date = new Date(dateTimeString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatUuid = (uuid) => {
  if (!uuid) return '-';
  // 显示前8位和后4位，中间用...省略
  if (uuid.length > 12) {
    return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
  }
  return uuid;
};

const formatNumber = (number) => {
  if (!number) return '0';
  return number.toLocaleString();
};

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast.add({
        title: '复制成功',
        description: 'UUID已复制到剪贴板',
        color: 'green'
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
          description: 'UUID已复制到剪贴板',
          color: 'green'
        });
      } else {
        throw new Error('复制失败');
      }
    }
  } catch (error) {
    console.error('复制失败:', error);
    toast.add({
      title: '复制失败',
      description: '请手动复制UUID',
      color: 'red'
    });
  }
};

// 加载游戏选项
const loadGameOptions = async () => {
  try {
    const response = await $fetch('/api/admin/games');
    if (response.success) {
      gameOptions.value = [
        { value: '', label: '全部游戏' },
        ...response.data.map(game => ({
          value: game.id.toString(),
          label: game.game_name
        }))
      ];
    }
  } catch (error) {
    console.error('加载游戏列表失败:', error);
  }
};

// 加载角色记录
const loadCharacters = async () => {
  try {
    loading.value = true;

    const params = new URLSearchParams({
      page: pagination.page.toString(),
      pageSize: pagination.pageSize.toString()
    });

    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.subuser_id) params.append('subuser_id', filters.subuser_id);
    if (filters.subuser_name) params.append('subuser_name', filters.subuser_name);
    if (filters.character_name) params.append('character_name', filters.character_name);
    if (filters.uuid) params.append('uuid', filters.uuid);
    if (filters.game_id) params.append('game_id', filters.game_id);
    if (filters.server_id) params.append('server_id', filters.server_id);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    console.log('角色数据API请求参数:', params.toString());
    
    const response = await $fetch(`/api/admin/characters?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });
    
    console.log('角色数据API响应:', response);

    if (response.success) {
      characters.value = response.data.characters || [];
      pagination.total = response.data.pagination?.total || 0;
      pagination.totalPages = response.data.pagination?.totalPages || 0;
      
      console.log('角色数据加载结果:', {
        characters: characters.value.length,
        total: pagination.total,
        data: characters.value.slice(0, 2) // 只打印前两条用于调试
      });
      
      toast.add({
        title: '数据加载成功',
        description: `共加载 ${characters.value.length} 条角色记录，总计 ${pagination.total} 条`,
        color: 'green'
      });
    } else {
      console.error('API返回失败:', response.message);
      throw new Error(response.message || '获取角色记录失败');
    }
  } catch (error) {
    console.error('加载角色记录失败:', error);
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
    const response = await $fetch(`/api/admin/characters?startDate=${today}&endDate=${today}&statsOnly=true`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });
    
    if (response.success) {
      todayStats.value = {
        characterCount: response.data.todayCharacterCount || 0,
        totalCharacters: response.data.totalCharacters || 0
      };
    }
  } catch (error) {
    console.error('加载今日统计失败:', error);
  }
};

// 重置筛选条件
const resetFilters = () => {
  filters.user_id = '';
  filters.subuser_id = '';
  filters.subuser_name = '';
  filters.character_name = '';
  filters.uuid = '';
  filters.game_id = '';
  filters.server_id = '';
  filters.startDate = '';
  filters.endDate = '';
  pagination.page = 1;
  
  // 重置日期选择器
  selected.value = {
    start: null,
    end: null
  };
  
  loadCharacters();
  
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
  pagination.page = page;
  loadCharacters();
};

// 导出数据
const exportCharacters = async () => {
  exportLoading.value = true;
  try {
    // 获取所有角色数据（不分页）
    const params = new URLSearchParams({
      page: '1',
      pageSize: '10000'
    });

    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.subuser_id) params.append('subuser_id', filters.subuser_id);
    if (filters.subuser_name) params.append('subuser_name', filters.subuser_name);
    if (filters.character_name) params.append('character_name', filters.character_name);
    if (filters.uuid) params.append('uuid', filters.uuid);
    if (filters.game_id) params.append('game_id', filters.game_id);
    if (filters.server_id) params.append('server_id', filters.server_id);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/characters?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success && response.data.characters) {
      // 转换数据格式
      const exportData = response.data.characters.map(item => ({
        '用户ID': item.user_id || '',
        '小号ID': item.subuser_id || '',
        '小号名称': item.subuser_name || '-',
        '用户名': item.username || '-',
        '角色名称': item.character_name || '-',
        '角色UUID': item.uuid || '-',
        '游戏': item.game_name || '-',
        '等级': item.character_level || 0,
        '金币': formatNumber(item.gold_coins),
        '钻石': formatNumber(item.diamond_coins),
        '服务器': item.server_id || '-',
        '渠道': item.channel_code || '-',
        '最后登录': formatDateTime(item.last_login_at),
        '创建时间': formatDateTime(item.created_at)
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
        { wch: 12 }, // 小号ID
        { wch: 15 }, // 小号名称
        { wch: 15 }, // 用户名
        { wch: 15 }, // 角色名称
        { wch: 35 }, // 角色UUID
        { wch: 15 }, // 游戏
        { wch: 8 },  // 等级
        { wch: 12 }, // 金币
        { wch: 12 }, // 钻石
        { wch: 10 }, // 服务器
        { wch: 12 }, // 渠道
        { wch: 18 }, // 最后登录
        { wch: 18 }  // 创建时间
      ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, '角色数据');
      
      // 生成文件名
      const fileName = `角色数据_${new Date().toISOString().split('T')[0]}.xlsx`;
      
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

// 获取日期范围文本
const getDateRangeText = () => {
  if (!filters.startDate || !filters.endDate) return '创建时间';
  return `创建时间: ${filters.startDate} 至 ${filters.endDate}`;
};

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

// 页面初始化
onMounted(async () => {
  console.log('角色数据页面初始化...');
  console.log('初始化时的筛选条件:', filters);
  
  try {
    await Promise.all([
      loadGameOptions(),
      loadTodayStats(),
      loadCharacters()
    ]);
    console.log('页面初始化完成');
  } catch (error) {
    console.error('页面初始化失败:', error);
  }
});
</script>

<style scoped>
.role-data-page {
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
  min-width: 1200px; /* 因为列数较多，设置最小宽度 */
  border-collapse: collapse;
  border: 1px solid #f1f5f9; /* 添加表格外边框 */
}

.uniform-table :deep(th) {
  text-align: center;
  padding: 8px 6px; /* 列数多，减少padding */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  vertical-align: middle;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9; /* 添加底部边框 */
  background-color: #f8fafc; /* 表头灰色背景 */
  font-weight: 600;
}

.uniform-table :deep(td) {
  text-align: center;
  padding: 8px 6px; /* 列数多，减少padding */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  vertical-align: middle;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9; /* 添加底部边框 */
}

.uniform-table :deep(th:last-child),
.uniform-table :deep(td:last-child) {
  border-right: none;
}

/* 各列宽度分布 */
.uniform-table :deep(th:nth-child(1)),
.uniform-table :deep(td:nth-child(1)) {
  width: 6%; /* 用户ID */
}

.uniform-table :deep(th:nth-child(2)),
.uniform-table :deep(td:nth-child(2)) {
  width: 7%; /* 小号ID */
}

.uniform-table :deep(th:nth-child(3)),
.uniform-table :deep(td:nth-child(3)) {
  width: 8%; /* 小号名称 */
}

.uniform-table :deep(th:nth-child(4)),
.uniform-table :deep(td:nth-child(4)) {
  width: 8%; /* 用户名 */
}

.uniform-table :deep(th:nth-child(5)),
.uniform-table :deep(td:nth-child(5)) {
  width: 8%; /* 角色名称 */
}

.uniform-table :deep(th:nth-child(6)),
.uniform-table :deep(td:nth-child(6)) {
  width: 10%; /* 角色UUID */
}

.uniform-table :deep(th:nth-child(7)),
.uniform-table :deep(td:nth-child(7)) {
  width: 6%; /* 游戏 */
}

.uniform-table :deep(th:nth-child(8)),
.uniform-table :deep(td:nth-child(8)) {
  width: 5%; /* 等级 */
}

.uniform-table :deep(th:nth-child(9)),
.uniform-table :deep(td:nth-child(9)) {
  width: 6%; /* 金币 */
}

.uniform-table :deep(th:nth-child(10)),
.uniform-table :deep(td:nth-child(10)) {
  width: 6%; /* 钻石 */
}

.uniform-table :deep(th:nth-child(11)),
.uniform-table :deep(td:nth-child(11)) {
  width: 5%; /* 服务器 */
}

.uniform-table :deep(th:nth-child(12)),
.uniform-table :deep(td:nth-child(12)) {
  width: 6%; /* 渠道 */
}

.uniform-table :deep(th:nth-child(13)),
.uniform-table :deep(td:nth-child(13)) {
  width: 10%; /* 最后登录 */
}

.uniform-table :deep(th:nth-child(14)),
.uniform-table :deep(td:nth-child(14)) {
  width: 10%; /* 创建时间 */
}

/* 确保flex内容居中对齐 */
.uniform-table :deep(.flex) {
  justify-content: center;
  align-items: center;
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