<template>
  <div class="user-register-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-user-plus" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">用户注册数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看用户注册记录和统计信息</p>
        </div>
      </div>
    </div>

    <!-- 统计汇总卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 mb-3">{{ formatNumber(todayStats.registerCount) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-user-plus" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">今日注册用户</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 mb-3">{{ formatNumber(todayStats.totalUsers) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">总注册用户</span>
          </div>
        </div>
      </UCard>

      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600 mb-3">{{ pagination.total }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">当前查询注册用户({{ getDateRangeText() }})</span>
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
              type="number"
            />
          </UFormGroup>

          <!-- 用户名 -->
          <UFormGroup label="用户名" class="flex-1">
            <UInput 
              v-model="filters.username" 
              placeholder="请输入用户名"
              icon="i-heroicons-user"
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
            @click="loadUsers" 
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
            @click="exportUsers"
            :loading="exportLoading"
            icon="i-heroicons-arrow-down-tray"
          >
            导出Excel
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 用户注册表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">用户注册记录</h3>
            <UBadge v-if="users.length > 0" :label="`${users.length}条记录`" variant="soft" size="xs" />
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
          :rows="users" 
          :columns="userColumns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-user-plus', 
            label: '暂无用户注册记录',
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

        <template #username-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user" class="w-4 h-4 text-blue-400" />
            <span class="font-medium">{{ row.username || '-' }}</span>
          </div>
        </template>

        

        

        <template #channel_code-data="{ row }">
          <div v-if="row.channel_code">
            <span class="font-medium text-orange-600">{{ row.channel_code }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #platform_coins-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-yellow-500" />
            <span class="font-medium text-yellow-600">{{ formatNumber(row.platform_coins || 0) }}</span>
          </div>
        </template>

        <template #status-data="{ row }">
          <div class="flex items-center justify-center gap-2">
            <UBadge 
              :label="getStatusText(row.status)"
              :color="getStatusColor(row.status)"
              variant="soft"
              size="sm"
            />
          </div>
        </template>

        <template #created_at-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400" />
            <span class="text-sm">{{ formatDateTime(row.created_at) }}</span>
          </div>
        </template>

        <template #actions-data="{ row }">
          <div class="flex items-center justify-center gap-2">
            <UButton
              v-if="canBanUser && row.status !== 1"
              @click="confirmBanUser(row)"
              color="red"
              variant="ghost"
              size="xs"
              icon="i-heroicons-no-symbol"
              :loading="row.id === actionLoading"
            >
              封号
            </UButton>
            <UButton
              v-if="canBanUser && row.status === 1"
              @click="confirmUnbanUser(row)"
              color="green"
              variant="ghost"
              size="xs"
              icon="i-heroicons-check-circle"
              :loading="row.id === actionLoading"
            >
              解封
            </UButton>
            <UDropdown :items="getActionMenuItems(row)" :popper="{ placement: 'bottom-end' }">
              <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-ellipsis-horizontal" />
            </UDropdown>
            <span v-if="!canBanUser" class="text-gray-400 text-xs">无权限</span>
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

    <!-- 修改密码弹窗 -->
    <UModal v-model="showChangePassword">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-key" class="w-5 h-5 text-blue-600" />
            <h3 class="text-base font-semibold">修改密码</h3>
          </div>
        </template>
        <div class="space-y-3">
          <UFormGroup label="新密码" required>
            <UInput v-model="changePwdForm.new_password" type="password" placeholder="请输入新密码" />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showChangePassword = false">取消</UButton>
            <UButton color="primary" :loading="changePwdLoading" @click="submitChangePassword">确定</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, computed, watch } from 'vue';
import { useAuthStore } from '~/store/auth';
import { useToast } from '#imports';

// 页面元数据
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();
const toast = useToast();

// 权限检查 - 只有超级管理员可以封号
const canBanUser = computed(() => {
  return authStore.permissions && authStore.permissions.level === 0;
});

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
const actionLoading = ref(null); // 用于跟踪哪个用户的操作正在进行中
const users = ref([]);
const showChangePassword = ref(false);
const changePwdForm = ref({ user_id: null, new_password: '' });
const changePwdLoading = ref(false);

// 今日统计数据
const todayStats = ref({
  registerCount: 0,
  totalUsers: 0
});

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
const userColumns = [
  {
    key: 'id',
    label: '用户ID',
    sortable: true
  },
  {
    key: 'username',
    label: '用户名',
    sortable: true
  },
  
  
  {
    key: 'channel_code',
    label: '渠道代码',
    sortable: true
  },
  {
    key: 'platform_coins',
    label: '平台币',
    sortable: true
  },
  {
    key: 'status',
    label: '用户状态',
    sortable: true
  },
  {
    key: 'created_at',
    label: '注册时间',
    sortable: true
  },
  {
    key: 'actions',
    label: '操作'
  }
];

// 下拉选项数据
const channelOptions = ref([
  { value: '', label: '全部渠道' }
]);

const filters = reactive({
  user_id: '',
  username: '',
  iphone: '',
  
  channel_code: '',
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
  
  // 更新filters
  filters.endDate = endDate;
  filters.startDate = startDate;
  
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
const formatDateTime = (dateTimeString) => {
  if (!dateTimeString) return '-';
  // 如果是 MySQL 常见格式 "YYYY-MM-DD HH:mm:ss"，直接返回，避免被浏览器当作 UTC 解析
  if (typeof dateTimeString === 'string' && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(dateTimeString)) {
    return dateTimeString;
  }
  // 其它情况（ISO 字符串或 Date 对象）强制以东八区显示
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

// 获取状态文本
const getStatusText = (status) => {
  const statusNum = parseInt(status) || 0;
  return statusNum === 1 ? '已封号' : '正常';
};

// 获取状态颜色
const getStatusColor = (status) => {
  const statusNum = parseInt(status) || 0;
  return statusNum === 1 ? 'red' : 'green';
};

// 加载用户注册记录
const loadUsers = async () => {
  try {
    loading.value = true;

    const params = new URLSearchParams({
      page: pagination.page.toString(),
      pageSize: pagination.pageSize.toString()
    });

    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.username) params.append('username', filters.username);
    if (filters.iphone) params.append('iphone', filters.iphone);
    
    if (filters.channel_code) params.append('channel_code', filters.channel_code);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/users?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success) {
      users.value = response.data.users;
      pagination.total = response.data.pagination.total;
      pagination.totalPages = response.data.pagination.totalPages;
      
      toast.add({
        title: '数据加载成功',
        description: `共加载 ${users.value.length} 条用户记录`,
        color: 'green'
      });
    } else {
      throw new Error(response.message || '获取用户数据失败');
    }
  } catch (error) {
    console.error('加载用户数据失败:', error);
    toast.add({
      title: '数据加载失败',
      description: error.message || '请检查网络连接后重试',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

const openChangePassword = (user) => {
  changePwdForm.value = { user_id: user.id, new_password: '' };
  showChangePassword.value = true;
};

const submitChangePassword = async () => {
  if (!changePwdForm.value.user_id || !changePwdForm.value.new_password) return;
  changePwdLoading.value = true;
  try {
    await $fetch('/api/admin/users/change-password', {
      method: 'POST',
      headers: { 'authorization': String(authStore.id) },
      body: { user_id: changePwdForm.value.user_id, new_password: changePwdForm.value.new_password }
    });
    showChangePassword.value = false;
    changePwdForm.value = { user_id: null, new_password: '' };
    toast.add({ title: '修改成功', description: '用户密码已更新', color: 'green' });
  } catch (e) {
    toast.add({ title: '修改失败', description: e?.message || '请稍后重试', color: 'red' });
  } finally {
    changePwdLoading.value = false;
  }
};

const getActionMenuItems = (row) => [
  [
    { label: '修改密码', icon: 'i-heroicons-key', click: () => openChangePassword(row) }
  ]
];

// 加载渠道选项
const loadChannelOptions = async () => {
  try {
    // 获取当前登录管理员信息
    const authStore = useAuthStore();
    const currentPermissions = authStore.permissions;
    
    if (!currentPermissions) {
      console.error('无法获取当前管理员权限信息');
      return;
    }
    
    const currentLevel = currentPermissions.level;
    const currentChannelCode = currentPermissions.channel_code;

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
  } catch (error) {
    console.error('加载渠道选项失败:', error);
  }
};

// 加载今日统计数据
const loadTodayStats = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await $fetch(`/api/admin/users?startDate=${today}&endDate=${today}&statsOnly=true`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });
    
    if (response.success) {
      todayStats.value = {
        registerCount: response.data.todayRegisterCount || 0,
        totalUsers: response.data.totalUsers || 0
      };
    }
  } catch (error) {
    console.error('加载今日统计失败:', error);
  }
};

// 重置筛选条件
const resetFilters = () => {
  filters.user_id = '';
  filters.username = '';
  filters.iphone = '';
  filters.channel_code = '';
  filters.startDate = '';
  filters.endDate = '';
  pagination.page = 1;
  
  // 重置日期选择器
  selected.value = {
    start: null,
    end: null
  };
  
  loadUsers();
  
  toast.add({
    title: '条件已重置',
    description: '筛选条件已重置为默认值',
    color: 'blue'
  });
};

// 获取日期范围文本
const getDateRangeText = () => {
  if (!filters.startDate || !filters.endDate) return '注册时间';
  return `注册时间: ${filters.startDate} 至 ${filters.endDate}`;
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
  loadUsers();
};

// 导出数据
const exportUsers = async () => {
  exportLoading.value = true;
  try {
    // 获取所有用户数据（不分页）
    const params = new URLSearchParams({
      page: '1',
      pageSize: '10000'
    });

    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.username) params.append('username', filters.username);
    if (filters.iphone) params.append('iphone', filters.iphone);
    
    if (filters.channel_code) params.append('channel_code', filters.channel_code);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await $fetch(`/api/admin/users?${params.toString()}`, {
      headers: {
        'authorization': authStore.id.toString()
      }
    });

    if (response.success && response.data.users) {
      // 转换数据格式
      const exportData = response.data.users.map(item => ({
        '用户ID': item.id || '',
        '用户名': item.username || '-',
        '手机号': item.iphone || '-',
        
        '渠道代码': item.channel_code || '-',
        '平台币': item.platform_coins || 0,
        '用户状态': getStatusText(item.status),
        '注册时间': formatDateTime(item.created_at)
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
        { wch: 15 }, // 用户名
        { wch: 15 }, // 手机号
        { wch: 20 }, // 密码
        { wch: 12 }, // 渠道代码
        { wch: 10 }, // 平台币
        { wch: 10 }, // 用户状态
        { wch: 18 }  // 注册时间
      ];
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, '用户注册数据');
      
      // 生成文件名
      const fileName = `用户注册数据_${new Date().toISOString().split('T')[0]}.xlsx`;
      
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

// 确认封号
const confirmBanUser = (user) => {
  if (confirm(`确定要封号用户 "${user.username}" 吗？封号后该用户将无法登录系统。`)) {
    banUser(user);
  }
};

// 确认解封
const confirmUnbanUser = (user) => {
  if (confirm(`确定要解封用户 "${user.username}" 吗？解封后该用户将恢复正常登录权限。`)) {
    unbanUser(user);
  }
};

// 封号用户
const banUser = async (user) => {
  try {
    actionLoading.value = user.id;
    
    const response = await $fetch('/api/user/ban', {
      method: 'POST',
      body: {
        user_id: user.id,
        status: 1, // 封号
        admin_id: authStore.id
      }
    });
    
    if (response.status === 'success') {
      // 更新本地数据
      const userIndex = users.value.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        users.value[userIndex].status = 1;
      }
      
      toast.add({
        title: '封号成功',
        description: `用户 "${user.username}" 已被封号`,
        color: 'red'
      });
    } else {
      throw new Error(response.message || '封号失败');
    }
  } catch (error) {
    console.error('封号失败:', error);
    toast.add({
      title: '封号失败',
      description: error.message || '操作过程中发生错误',
      color: 'red'
    });
  } finally {
    actionLoading.value = null;
  }
};

// 解封用户
const unbanUser = async (user) => {
  try {
    actionLoading.value = user.id;
    
    const response = await $fetch('/api/user/ban', {
      method: 'POST',
      body: {
        user_id: user.id,
        status: 0, // 解封
        admin_id: authStore.id
      }
    });
    
    if (response.status === 'success') {
      // 更新本地数据
      const userIndex = users.value.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        users.value[userIndex].status = 0;
      }
      
      toast.add({
        title: '解封成功',
        description: `用户 "${user.username}" 已被解封`,
        color: 'green'
      });
    } else {
      throw new Error(response.message || '解封失败');
    }
  } catch (error) {
    console.error('解封失败:', error);
    toast.add({
      title: '解封失败',
      description: error.message || '操作过程中发生错误',
      color: 'red'
    });
  } finally {
    actionLoading.value = null;
  }
};

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadChannelOptions(),
    loadTodayStats(),
    loadUsers()
  ]);
});
</script>

<style scoped>
.user-register-page {
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