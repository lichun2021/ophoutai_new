<template>
  <div class="platform-coin-player-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>玩家平台币发放</h2>
    </div>

    <!-- 余额显示 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
          <div class="text-2xl font-bold text-purple-600">{{ getLevelText(currentUserLevel) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">当前权限</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 发放操作 -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold">玩家平台币操作（发放/扣除）</h3>
      </template>
      
      <UForm :state="grantForm" @submit="submitGrant" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <UFormGroup label="用户ID" required>
            <UInput 
              v-model="grantForm.user_id" 
              type="number"
              min="1"
              step="1"
              placeholder="请输入用户ID（数字）"
              :disabled="grantLoading"
            />
          </UFormGroup>
          
          <UFormGroup label="操作金额" required>
            <div class="relative">
              <UInput 
                v-model="grantForm.amount" 
                type="number" 
                step="0.01"
                placeholder="正数=发放 负数=扣除"
                :disabled="grantLoading"
              />
              <div class="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs pointer-events-none bg-white pl-1 text-gray-400">
                正数=发放 负数=扣除
              </div>
            </div>
          </UFormGroup>
          
          <UFormGroup label="发放备注">
            <UInput 
              v-model="grantForm.remark" 
              placeholder="备注（可选）"
              :disabled="grantLoading"
            />
          </UFormGroup>
          
          <div class="flex items-end">
            <UButton 
              type="submit" 
              color="primary" 
              :loading="grantLoading"
              :disabled="!isFormValid"
            >
              确认操作
            </UButton>
          </div>
        </div>
      </UForm>
    </UCard>

    <!-- 发放记录 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">发放记录</h3>
          <UButton @click="refreshTransactions" size="sm" variant="outline">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
            刷新
          </UButton>
        </div>
      </template>

      <!-- 发放统计 -->
      <UCard v-if="transactions.length > 0" class="mb-4">
        <template #header>
          <h4 class="text-base font-medium">发放统计</h4>
        </template>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">{{ grantStats.total_count }}</div>
            <div class="text-sm text-gray-500">总笔数</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ formatCurrency(grantStats.total_amount) }}</div>
            <div class="text-sm text-gray-500">发放总额</div>
          </div>
        </div>
      </UCard>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-3 px-4 font-medium text-gray-900">时间</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">用户ID</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">玩家渠道</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">游戏</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">发放金额</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">代理余额变化</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">玩家余额变化</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="transaction in transactions" :key="transaction.id" class="border-b border-gray-100">
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ formatDateTime(transaction.created_at) }}
              </td>
              <td class="py-3 px-4 text-sm font-mono">
                {{ transaction.user_id }}
              </td>
              <td class="py-3 px-4 text-sm">
                <UBadge color="gray" variant="subtle" size="sm">
                  {{ transaction.user_channel_code || '-' }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm">
                <UBadge color="blue" variant="subtle" size="sm">
                  {{ transaction.game_name || transaction.game_code || '-' }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm font-medium text-green-600">
                {{ formatCurrency(transaction.amount) }}
              </td>
              <td class="py-3 px-4 text-sm text-red-600">
                {{ formatCurrency(transaction.admin_balance_before) }} → {{ formatCurrency(transaction.admin_balance_after) }}
              </td>
              <td class="py-3 px-4 text-sm text-green-600">
                {{ formatCurrency(transaction.player_balance_before) }} → {{ formatCurrency(transaction.player_balance_after) }}
              </td>
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ transaction.remark || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="transactions.length === 0" class="text-center py-8 text-gray-500">
          暂无发放记录
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

const grantForm = ref({
  user_id: '',
  amount: '',
  remark: ''
})

const grantStats = ref({
  total_count: 0,
  total_amount: 0
})

const grantLoading = ref(false)
const currentUserLevel = ref(0)
const currentChannelCode = ref('')

// Toast通知
const toast = useToast()

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

const isFormValid = computed(() => {
  const userId = grantForm.value.user_id.toString().trim();
  const parsedUserId = parseInt(userId);
  const amount = parseFloat(grantForm.value.amount);
  
  // 基本验证
  if (!userId || isNaN(parsedUserId) || parsedUserId <= 0 || isNaN(amount) || amount === 0) {
    return false;
  }
  
  // 正数（发放）：检查代理余额
  if (amount > 0 && amount > balance.value.available_platform_coins) {
    return false;
  }
  
  // 负数（扣除）：总是允许（后端会检查玩家余额）
  return true;
});

// 工具函数
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY'
  }).format(amount || 0)
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

// 获取金额输入框的placeholder
const getAmountPlaceholder = () => {
  if (balance.value.available_platform_coins <= 0) {
    return '暂无可用余额'
  }
  
  return `最大 ${Math.floor(balance.value.available_platform_coins)}`
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

const loadTransactions = async () => {
  try {
    const response = await $fetch('/api/admin/platform-coin-to-player-transactions', {
      method: 'POST',
      body: {
        channel_code: currentChannelCode.value,
        page: pagination.value.page,
        page_size: pagination.value.pageSize
      }
    })
    
    if (response.success) {
      transactions.value = response.data.data
      pagination.value.total = response.data.total
      
      // 计算统计数据
      calculateGrantStats()
    }
  } catch (error) {
    console.error('加载发放记录失败:', error)
    toast.add({
      title: '错误',
      description: '加载发放记录失败',
      color: 'red'
    })
  }
}

// 计算发放统计
const calculateGrantStats = () => {
  const stats = {
    total_count: transactions.value.length,
    total_amount: 0
  }
  
  transactions.value.forEach(transaction => {
    const amount = parseFloat(transaction.amount || 0)
    stats.total_amount += amount
  })
  
  grantStats.value = stats
}

const submitGrant = async () => {
  // 验证用户ID
  const userId = grantForm.value.user_id.toString().trim()
  const parsedUserId = parseInt(userId)
  if (!userId || isNaN(parsedUserId) || parsedUserId <= 0) {
    toast.add({
      title: '错误',
      description: '请输入有效的用户ID',
      color: 'red'
    })
    return
  }
  
  // 验证金额
  const amount = parseFloat(grantForm.value.amount)
  if (isNaN(amount) || amount === 0) {
    toast.add({
      title: '错误',
      description: '请输入有效的金额（正数=发放，负数=扣除）',
      color: 'red'
    })
    return
  }
  
  // 检查余额：正数检查代理余额，负数不检查（后端会检查玩家余额）
  if (amount > 0 && amount > balance.value.available_platform_coins) {
    toast.add({
      title: '错误',
      description: `代理可用余额不足 ${formatCurrency(balance.value.available_platform_coins)}`,
      color: 'red'
    })
    return
  }
  
  // 验证玩家是否属于当前代理的渠道
  try {
    const userCheckResponse = await $fetch('/api/admin/check-user-channel', {
      method: 'POST',
      body: {
        user_id: parsedUserId,
        admin_channel_code: currentChannelCode.value
      }
    })
    
    if (!userCheckResponse.success) {
      toast.add({
        title: '错误',
        description: userCheckResponse.message || '该玩家不属于您的渠道',
        color: 'red'
      })
      return
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: '验证玩家渠道失败',
      color: 'red'
    })
    return
  }

  grantLoading.value = true
  try {
    const response = await $fetch('/api/admin/transfer-to-player', {
      method: 'POST',
      body: {
        admin_channel_code: currentChannelCode.value,
        user_id: parsedUserId,
        amount: amount,
        remark: grantForm.value.remark,
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
      grantForm.value = {
        user_id: '',
        amount: '',
        remark: ''
      }
      
      // 刷新数据
      await Promise.all([loadBalance(), loadTransactions()])
    }
  } catch (error) {
    // 更好的错误信息提取
    let errorMessage = '操作失败：未知错误';
    
    if (error.data?.message) {
      errorMessage = error.data.message;
    } else if (error.cause?.message) {
      errorMessage = error.cause.message;
    } else if (error.message) {
      errorMessage = error.message;
    } else {
      errorMessage = '操作失败';
    }
    
    toast.add({
      title: '错误',
      description: errorMessage,
      color: 'red'
    })
  } finally {
    grantLoading.value = false
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

// 页面初始化（使用authStore）
onMounted(async () => {
  // 使用authStore获取用户信息
  currentUserLevel.value = currentAdminLevel.value
  currentChannelCode.value = authStore.permissions?.channel_code || ''
  
  console.log('页面初始化，当前用户等级:', currentUserLevel.value, '渠道代码:', currentChannelCode.value)
  
  if (currentChannelCode.value) {
    await Promise.all([loadBalance(), loadTransactions()])
  }
})
</script>

<style scoped>
.platform-coin-player-page {
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