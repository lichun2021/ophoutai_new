<template>
  <div class="platform-coin-admin-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>代理平台币管理</h2>
    </div>

    <!-- 余额卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-3xl font-bold text-blue-600">{{ formatCurrency(balance.available_platform_coins) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">可用平台币</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-3xl font-bold text-green-600">{{ formatCurrency(balance.platform_coins) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">平台币总额</span>
          </div>
        </div>
      </UCard>

      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-purple-600">{{ getLevelText(currentUserLevel) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">当前权限</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 代理转账 -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold">代理转账</h3>
      </template>
      
      <UForm :state="transferForm" @submit="submitTransfer" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <UFormGroup :label="getFirstLevelLabel()" required>
            <USelect
              v-model="transferForm.first_level_agent"
              :options="firstLevelAgents"
              :placeholder="getFirstLevelPlaceholder()"
              :disabled="transferLoading"
              @change="onFirstLevelChange"
            />
          </UFormGroup>
          
          <UFormGroup :label="getSecondLevelLabel()">
            <USelect
              v-model="transferForm.second_level_agent"
              :options="secondLevelAgents"
              :placeholder="getSecondLevelPlaceholder()"
              :disabled="transferLoading || !transferForm.first_level_agent"
              @change="onSecondLevelChange"
            />
          </UFormGroup>
          
          <UFormGroup label="转账金额" required>
            <div class="relative">
              <UInput 
                v-model="transferForm.amount" 
                type="number" 
                step="0.01"
                :placeholder="getAmountPlaceholder()"
                :disabled="transferLoading"
                min="-999999999"
                max="999999999"
              />
              <div v-if="amountLimits.show_limits && (amountLimits.max_negative > 0 || amountLimits.max_positive > 0)" class="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs pointer-events-none bg-white pl-1">
                <template v-if="amountLimits.max_negative > 0 && amountLimits.max_positive > 0">
                  <span class="text-red-500 font-medium">-{{ Math.floor(amountLimits.max_negative) }}</span>
                  <span class="text-gray-400 mx-1">~</span>
                  <span class="text-green-500 font-medium">{{ Math.floor(amountLimits.max_positive) }}</span>
                </template>
                <template v-else-if="amountLimits.max_positive > 0">
                  <span class="text-gray-500">0~</span>
                  <span class="text-green-500 font-medium">{{ Math.floor(amountLimits.max_positive) }}</span>
                </template>
                <template v-else-if="amountLimits.max_negative > 0">
                  <span class="text-red-500 font-medium">-{{ Math.floor(amountLimits.max_negative) }}</span>
                  <span class="text-gray-500">~0</span>
                </template>
              </div>
            </div>
          </UFormGroup>
          
          <UFormGroup label="备注">
            <UInput 
              v-model="transferForm.remark" 
              placeholder="备注（可选）"
              :disabled="transferLoading"
            />
          </UFormGroup>
          
          <div class="flex items-end">
            <UButton 
              type="submit" 
              color="primary" 
              :loading="transferLoading"
              :disabled="!isTransferFormValid"
            >
              确认转账
            </UButton>
          </div>
        </div>
        
        <!-- 转账目标提示 -->
        <div v-if="transferForm.first_level_agent" class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-600" />
            <span class="text-sm text-blue-800">
              <strong>转账目标：</strong>
              <span v-if="transferForm.second_level_agent && transferForm.second_level_agent.trim()">
                {{ transferForm.second_level_agent }} （{{ getSecondLevelLabel().replace('选择', '') }}）
              </span>
              <span v-else>
                {{ transferForm.first_level_agent }} （{{ getFirstLevelLabel().replace('选择', '') }}）
              </span>
            </span>
          </div>
        </div>
      </UForm>
    </UCard>

    <!-- 转账记录 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">转账记录</h3>
          <UButton @click="refreshTransactions" size="sm" variant="outline">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
            刷新
          </UButton>
        </div>
      </template>

      <!-- 查询筛选 -->
      <UCard class="mb-4">
        <div class="flex items-end gap-4 p-4">
          <!-- 第一级代理 -->
          <UFormGroup :label="getFirstLevelSearchLabel()" class="flex-1">
            <USelect
              v-model="searchForm.first_level_agent"
              :options="searchFirstLevelAgents"
              :placeholder="getFirstLevelSearchPlaceholder()"
              @change="onSearchFirstLevelChange"
            />
          </UFormGroup>

          <!-- 第二级代理 -->
          <UFormGroup :label="getSecondLevelSearchLabel()" class="flex-1">
            <USelect
              v-model="searchForm.second_level_agent"
              :options="searchSecondLevelAgents"
              :placeholder="getSecondLevelSearchPlaceholder()"
              @change="searchTransactions"
            />
          </UFormGroup>

          <!-- 操作按钮 -->
          <div class="flex gap-2 shrink-0">
            <UButton 
              @click="searchTransactions" 
              :loading="loading"
              icon="i-heroicons-magnifying-glass"
            >
              查询
            </UButton>
            <UButton 
              color="gray" 
              variant="outline" 
              @click="resetSearch"
              icon="i-heroicons-arrow-path"
            >
              重置
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- 转账统计 -->
      <UCard v-if="transactions.length > 0" class="mb-4">
        <template #header>
          <h4 class="text-base font-medium">转账统计</h4>
        </template>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">{{ transactionStats.total_count }}</div>
            <div class="text-sm text-gray-500">总笔数</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ formatCurrency(transactionStats.total_in) }}</div>
            <div class="text-sm text-gray-500">转入金额 ({{ transactionStats.count_in }}笔)</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-red-600">{{ formatCurrency(transactionStats.total_out) }}</div>
            <div class="text-sm text-gray-500">转出金额 ({{ transactionStats.count_out }}笔)</div>
          </div>
        </div>
      </UCard>

      <div class="overflow-x-auto mobile-table-wrapper">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-3 px-4 font-medium text-gray-900">时间</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">类型</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">发送方</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">接收方</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">金额</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">余额变化</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="transaction in transactions" :key="transaction.id" class="border-b border-gray-100">
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ formatDateTime(transaction.created_at) }}
              </td>
              <td class="py-3 px-4">
                <UBadge 
                  :color="getTransactionTypeColor(transaction, currentChannelCode)" 
                  variant="subtle"
                >
                  {{ getTransactionType(transaction, currentChannelCode) }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm">
                <div>{{ transaction.from_admin_name }}</div>
                <div class="text-xs text-gray-500">{{ transaction.from_channel_code }}</div>
              </td>
              <td class="py-3 px-4 text-sm">
                <div>{{ transaction.to_admin_name }}</div>
                <div class="text-xs text-gray-500">{{ transaction.to_channel_code }}</div>
              </td>
              <td class="py-3 px-4 text-sm font-medium">
                <span :class="{
                  'text-green-600': parseFloat(transaction.amount) > 0,
                  'text-red-600': parseFloat(transaction.amount) < 0,
                  'text-gray-600': parseFloat(transaction.amount) === 0
                }">
                  {{ formatAmount(transaction.amount) }}
                </span>
              </td>
              <td class="py-3 px-4 text-sm">
                <div v-if="transaction.from_channel_code === currentChannelCode" class="text-red-600">
                  {{ formatCurrency(transaction.from_balance_before) }} → {{ formatCurrency(transaction.from_balance_after) }}
                </div>
                <div v-else class="text-green-600">
                  {{ formatCurrency(transaction.to_balance_before) }} → {{ formatCurrency(transaction.to_balance_after) }}
                </div>
              </td>
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ transaction.remark || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="transactions.length === 0" class="text-center py-8 text-gray-500">
          暂无转账记录
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="pagination.total > 0" class="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
        <div class="text-sm text-gray-600">
          共 {{ pagination.total }} 条记录，第 {{ pagination.page }} / {{ Math.ceil(pagination.total / pagination.pageSize) }} 页
        </div>
        <UPagination 
          v-model="pagination.page"
          :total="pagination.total"
          :page-count="pagination.pageSize"
          size="sm"
          show-last 
          show-first
          @update:model-value="changePage"
        />
      </div>
    </UCard>

    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '~/store/auth'

const authStore = useAuthStore()

// 响应式数据
const balance = ref({
  platform_coins: 0,
  available_platform_coins: 0
})

const transactions = ref([])
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0
})

const transferForm = ref({
  first_level_agent: '',
  second_level_agent: '',
  to_channel_code: '',
  amount: '',
  remark: ''
})

const searchForm = ref({
  first_level_agent: '',
  second_level_agent: ''
})

const transactionStats = ref({
  total_count: 0,
  total_in: 0,
  total_out: 0,
  count_in: 0,
  count_out: 0
})

const firstLevelAgents = ref([])
const secondLevelAgents = ref([])
const searchFirstLevelAgents = ref([{ label: '全部', value: '' }])
const searchSecondLevelAgents = ref([{ label: '全部', value: '' }])
const gameOptions = ref([{ label: '全部游戏', value: '' }])

const transferLoading = ref(false)
const loading = ref(false)
const currentUserLevel = ref(0)
const currentChannelCode = ref('')

// 转账金额限制信息
const amountLimits = ref({
  max_positive: 0, // 最大正数（当前代理可用余额）
  max_negative: 0, // 最大负数（目标代理余额）
  target_balance: 0, // 目标代理当前余额
  show_limits: false // 是否显示限制提示
})

// Toast通知
const toast = useToast()

// 计算属性
const currentAdminId = computed(() => {
  // 管理员使用 authStore.id，用户使用 authStore.userInfo?.id
  if (authStore.isUser) {
    return authStore.userInfo?.id || '';
  } else {
    return authStore.id || '';
  }
});

const currentAdminLevel = computed(() => {
  // 管理员从 permissions 获取 level
  if (authStore.isUser) {
    return authStore.userInfo?.level || 0;
  } else {
    return authStore.permissions?.level || 0;
  }
});

// 表单验证
const isTransferFormValid = computed(() => {
  const amountStr = transferForm.value.amount.toString().trim();
  const amount = parseFloat(amountStr);
  const firstLevelAgent = transferForm.value.first_level_agent?.toString()?.trim();
  
  return (
    firstLevelAgent && // 必须选择一级代理
    firstLevelAgent !== '' && // 一级代理不能为空
    amountStr && // 已输入金额
    !isNaN(amount) && // 金额是有效数字
    amount !== 0 // 金额不为0
    // to_channel_code 由逻辑自动确定，不需要在这里验证
  );
});
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY'
  }).format(amount || 0)
}

const formatAmount = (amount) => {
  const num = parseFloat(amount || 0)
  if (num > 0) {
    return '+' + formatCurrency(num)
  } else if (num < 0) {
    return formatCurrency(num) // 负号已经包含在格式化结果中
  } else {
    return formatCurrency(0)
  }
}

const formatDateTime = (dateStr) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const getLevelText = (level) => {
  const levelMap = {
    0: '超级管理员',
    1: '一级代理',
    2: '二级代理',
    3: '三级代理',
    4: '四级代理'
  }
  return levelMap[level] || '未知'
}

const getTransactionType = (transaction, channelCode) => {
  if (transaction.from_channel_code === 'SUPER_ADMIN') {
    return '系统分配'
  }
  if (transaction.from_channel_code === channelCode) {
    return '转出'
  }
  return '转入'
}

const getTransactionTypeColor = (transaction, channelCode) => {
  if (transaction.from_channel_code === 'SUPER_ADMIN') {
    return 'blue'
  }
  if (transaction.from_channel_code === channelCode) {
    return 'red'
  }
  return 'green'
}

// 根据当前用户等级获取标签
const getFirstLevelLabel = () => {
  const nextLevel = currentUserLevel.value + 1
  return `选择${getLevelText(nextLevel)}`
}

const getSecondLevelLabel = () => {
  const nextNextLevel = currentUserLevel.value + 2
  return `选择${getLevelText(nextNextLevel)}`
}

const getFirstLevelPlaceholder = () => {
  const nextLevel = currentUserLevel.value + 1
  return `请选择${getLevelText(nextLevel)}`
}

const getSecondLevelPlaceholder = () => {
  const nextNextLevel = currentUserLevel.value + 2
  return `请选择${getLevelText(nextNextLevel)}`
}

const getFirstLevelSearchLabel = () => {
  const nextLevel = currentUserLevel.value + 1
  return getLevelText(nextLevel)
}

const getSecondLevelSearchLabel = () => {
  const nextNextLevel = currentUserLevel.value + 2
  return getLevelText(nextNextLevel)
}

const getFirstLevelSearchPlaceholder = () => {
  const nextLevel = currentUserLevel.value + 1
  return `选择${getLevelText(nextLevel)}`
}

const getSecondLevelSearchPlaceholder = () => {
  const nextNextLevel = currentUserLevel.value + 2
  return `选择${getLevelText(nextNextLevel)}`
}

// 获取金额输入框的placeholder
const getAmountPlaceholder = () => {
  if (!amountLimits.value.show_limits) {
    return '支持正负数'
  }
  
  const maxPos = Math.floor(amountLimits.value.max_positive)
  const maxNeg = Math.floor(amountLimits.value.max_negative)
  
  if (maxPos === 0 && maxNeg === 0) {
    return '暂无额度'
  }
  
  return '输入金额'
}

const shouldShowSecondLevel = () => {
  // 只有当当前用户等级 < 3 时才显示第二级选择（因为最高是4级代理）
  return currentUserLevel.value < 3
}

const shouldShowSecondLevelSearch = () => {
  // 只有当当前用户等级 < 3 时才显示第二级搜索
  return currentUserLevel.value < 3
}

// 方法
const loadBalance = async () => {
  try {
    const response = await $fetch('/api/admin/platform-coin-balance', {
      method: 'POST',
      body: { channel_code: currentChannelCode.value }
    })
    
    if (response.success) {
      balance.value = response.data
    }
  } catch (error) {
    console.error('加载余额失败:', error)
  }
}

// 加载一级代理选项（完全按照overview-data.vue的实现）
const loadPrimaryChannelOptions = async () => {
  try {
    // 获取当前用户的下级渠道列表（一级渠道）
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        adminId: currentAdminId.value
      }
    });

    if (response.success) {
      // 构建一级渠道选项
      const options = [];
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          });
        });
      }
      
      firstLevelAgents.value = options;
      
      // 同时用于查询
      searchFirstLevelAgents.value = [
        { label: '全部', value: '' },
        ...options
      ];
    } else {
      // 如果没有下级渠道，设置为空数组
      firstLevelAgents.value = [];
      searchFirstLevelAgents.value = [{ label: '全部', value: '' }];
    }
  } catch (error) {
    console.error('加载一级渠道选项失败:', error);
    // 发生错误时设置为空数组
    firstLevelAgents.value = [];
    searchFirstLevelAgents.value = [{ label: '全部', value: '' }];
  }
}

// 加载游戏选项（完全按照overview-data.vue的实现）
const loadGameOptions = async () => {
  try {
    let response;
    
    // 根据管理员级别决定获取哪些游戏
    if (currentAdminLevel.value === 0) {
      // 超级管理员获取所有游戏
      response = await $fetch('/api/admin/games');
    } else {
      // 普通管理员获取被授权的游戏
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: currentAdminId.value
        }
      });
    }

    if (response.success) {
      // 构建游戏选项，添加"全部"选项
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
              value: game.id.toString(),
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
}

// 转账时的一级代理变化（参考overview-data.vue的onPrimaryChannelChange）
const onFirstLevelChange = async () => {
  // 重置二级代理选择
  transferForm.value.second_level_agent = ''
  
  // 加载对应的二级代理选项
  await loadSecondaryChannelOptions(transferForm.value.first_level_agent, 'transfer')
  
  // 更新金额限制（当前只选择了一级代理）
  await updateAmountLimitsForTarget(transferForm.value.first_level_agent)
}

// 转账时的二级代理变化
const onSecondLevelChange = async () => {
  // 确定当前的转账目标：如果选择了二级代理就用二级，否则用一级
  const currentTarget = (transferForm.value.second_level_agent && transferForm.value.second_level_agent.trim()) 
    ? transferForm.value.second_level_agent 
    : transferForm.value.first_level_agent;
  
  // 更新金额限制
  await updateAmountLimitsForTarget(currentTarget)
}

// 获取目标代理余额并更新金额限制
const updateAmountLimitsForTarget = async (targetChannelCode) => {
  if (!targetChannelCode || !targetChannelCode.trim()) {
    amountLimits.value.show_limits = false
    return
  }
  
  try {
    // 获取目标代理余额
    const targetResponse = await $fetch('/api/admin/platform-coin-balance', {
      method: 'POST',
      body: { channel_code: targetChannelCode.trim() }
    })
    
    if (targetResponse.success) {
      amountLimits.value.target_balance = targetResponse.data.platform_coins || 0
      amountLimits.value.max_positive = balance.value.available_platform_coins || 0
      amountLimits.value.max_negative = targetResponse.data.platform_coins || 0
      amountLimits.value.show_limits = true
    } else {
      amountLimits.value.show_limits = false
    }
  } catch (error) {
    console.error('获取目标代理余额失败:', error)
    amountLimits.value.show_limits = false
  }
}

// 查询时的一级代理变化（参考overview-data.vue的onPrimaryChannelChange）
const onSearchFirstLevelChange = async () => {
  // 重置二级代理选择
  searchForm.value.second_level_agent = ''
  
  // 加载对应的二级代理选项
  await loadSecondaryChannelOptions(searchForm.value.first_level_agent, 'search')
  
  await searchTransactions()
}

// 加载二级代理选项（完全按照overview-data.vue的实现）
const loadSecondaryChannelOptions = async (primaryChannelCode, type = 'transfer') => {
  try {
    if (!primaryChannelCode) {
      if (type === 'transfer') {
        secondLevelAgents.value = [];
      } else {
        searchSecondLevelAgents.value = [{ label: '全部', value: '' }];
      }
      return;
    }

    // 获取指定一级渠道的下级渠道列表
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        parentChannelCode: primaryChannelCode
      }
    });

    if (response.success) {
      // 构建二级渠道选项
      const options = [];
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          });
        });
      }
      
      if (type === 'transfer') {
        secondLevelAgents.value = options;
      } else {
        searchSecondLevelAgents.value = [
          { label: '全部', value: '' },
          ...options
        ];
      }
    } else {
      if (type === 'transfer') {
        secondLevelAgents.value = [];
      } else {
        searchSecondLevelAgents.value = [{ label: '全部', value: '' }];
      }
    }
  } catch (error) {
    console.error('加载二级渠道选项失败:', error);
    if (type === 'transfer') {
      secondLevelAgents.value = [];
    } else {
      searchSecondLevelAgents.value = [{ label: '全部', value: '' }];
    }
  }
}



const loadTransactions = async () => {
  try {
    const response = await $fetch('/api/admin/platform-coin-transactions', {
      method: 'POST',
      body: {
        channel_code: currentChannelCode.value,
        page: pagination.value.page,
        page_size: pagination.value.pageSize,
        first_level_agent: searchForm.value.first_level_agent,
        second_level_agent: searchForm.value.second_level_agent
      }
    })
    
    if (response.success) {
      transactions.value = response.data.data
      pagination.value.total = response.data.total
      
      // 计算统计数据
      calculateTransactionStats()
    }
  } catch (error) {
    console.error('加载转账记录失败:', error)
    toast.add({
      title: '错误',
      description: '加载转账记录失败',
      color: 'red'
    })
  }
}

// 计算转账统计
const calculateTransactionStats = () => {
  const stats = {
    total_count: transactions.value.length,
    total_in: 0,
    total_out: 0,
    count_in: 0,
    count_out: 0
  }
  
  transactions.value.forEach(transaction => {
    const amount = parseFloat(transaction.amount || 0)
    
    if (amount > 0) {
      // 正数 = 转出（给目标代理）
      stats.total_out += amount
      stats.count_out++
    } else if (amount < 0) {
      // 负数 = 转入（从目标代理收回）
      stats.total_in += Math.abs(amount)
      stats.count_in++
    }
  })
  
  transactionStats.value = stats
}

const searchTransactions = async () => {
  pagination.value.page = 1
  await loadTransactions()
}

const resetSearch = () => {
  searchForm.value = {
    first_level_agent: '',
    second_level_agent: ''
  }
  searchSecondLevelAgents.value = [{ label: '全部', value: '' }]
  searchTransactions()
}

const submitTransfer = async () => {
  // 验证一级代理选择
  if (!transferForm.value.first_level_agent || transferForm.value.first_level_agent.trim() === '') {
    toast.add({
      title: '错误',
      description: '请选择一级代理',
      color: 'red'
    })
    return
  }
  
  // 确定最终的转账目标：如果有二级代理就转给二级，否则转给一级
  const finalTarget = (transferForm.value.second_level_agent && transferForm.value.second_level_agent.trim()) 
    ? transferForm.value.second_level_agent.trim()
    : transferForm.value.first_level_agent.trim();
    
  // 更新to_channel_code为最终目标
  transferForm.value.to_channel_code = finalTarget;
  
  // 验证金额
  const amountStr = transferForm.value.amount.toString().trim()
  if (!amountStr) {
    toast.add({
      title: '错误',
      description: '请输入转账金额',
      color: 'red'
    })
    return
  }
  
  const amount = parseFloat(amountStr)
  if (isNaN(amount) || amount === 0) {
    toast.add({
      title: '错误',
      description: '请输入有效的转账金额（支持正负数，不能为0）',
      color: 'red'
    })
    return
  }
  
  // 检查金额范围
  if (amountLimits.value.show_limits) {
    if (amount > 0 && amount > amountLimits.value.max_positive) {
      toast.add({
        title: '错误',
        description: `正数金额不能超过 ${formatCurrency(amountLimits.value.max_positive)}`,
        color: 'red'
      })
      return
    }
    
    if (amount < 0 && Math.abs(amount) > amountLimits.value.max_negative) {
      toast.add({
        title: '错误',
        description: `负数金额不能超过 ${formatCurrency(amountLimits.value.max_negative)}`,
        color: 'red'
      })
      return
    }
  }

  transferLoading.value = true
  try {
    const response = await $fetch('/api/admin/transfer-platform-coins', {
      method: 'POST',
      body: {
        from_channel_code: currentChannelCode.value,
        to_channel_code: finalTarget,
        amount: amount,
        remark: transferForm.value.remark,
        operator_channel_code: currentChannelCode.value
      }
    })
    
    if (response.success) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      })
      
      // 重置表单
      transferForm.value = {
        first_level_agent: '',
        second_level_agent: '',
        to_channel_code: '',
        amount: '',
        remark: ''
      }
      secondLevelAgents.value = []
      amountLimits.value.show_limits = false
      
      // 刷新数据
      await Promise.all([loadBalance(), loadTransactions()])
    }
  } catch (error) {
    // 更好的错误信息提取
    let errorMessage = '转账失败：未知错误';
    
    if (error.data?.message) {
      errorMessage = error.data.message;
    } else if (error.cause?.message) {
      errorMessage = error.cause.message;
    } else if (error.message) {
      errorMessage = error.message;
    } else {
      errorMessage = '转账失败';
    }
    
    toast.add({
      title: '错误',
      description: errorMessage,
      color: 'red'
    })
  } finally {
    transferLoading.value = false
  }
}

const refreshTransactions = async () => {
  pagination.value.page = 1
  await loadTransactions()
}

const changePage = async (page) => {
  pagination.value.page = page
  await loadTransactions()
}

// 页面初始化（完全按照overview-data.vue的方式）
onMounted(async () => {
  // 使用authStore获取用户信息，不使用localStorage
  currentUserLevel.value = currentAdminLevel.value
  currentChannelCode.value = authStore.permissions?.channel_code || ''
  
  console.log('页面初始化，当前用户等级:', currentUserLevel.value, '渠道代码:', currentChannelCode.value)
  
  // 并行加载所有数据
  await Promise.all([
    loadPrimaryChannelOptions(),
    loadGameOptions()
  ])
  
  if (currentChannelCode.value) {
    await Promise.all([
      loadBalance(), 
      loadTransactions()
    ])
  }
})
</script>

<style scoped>
.platform-coin-admin-page {
  width: 100%;
  max-width: 100%;
  margin: 0;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
}
</style> 