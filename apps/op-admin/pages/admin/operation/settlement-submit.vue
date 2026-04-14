<template>
  <div class="settlement-submit-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>结算提交</h2>
    </div>

    <!-- 可提现金额显示 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-3xl font-bold text-green-600">{{ formatCurrency(withdrawableData.withdrawable_amount) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">可提现金额</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-blue-600">{{ formatCurrency(withdrawableData.total_amount) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">总流水</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-purple-600">{{ formatCurrency(withdrawableData.available_amount) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">可结算流水</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-xl font-bold text-orange-600">{{ withdrawableData.divide_rate }}%</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chart-pie" class="w-5 h-5 text-orange-500" />
            <span class="text-sm text-gray-600">分成比例</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 结算申请 -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold">提交结算申请</h3>
      </template>
      
      <UForm :state="settlementForm" @submit="submitSettlement" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <UFormGroup label="结算金额" required>
            <UInput 
              v-model="settlementForm.settlement_amount" 
              type="number" 
              step="0.01"
              min="0"
              :max="withdrawableData.withdrawable_amount"
              :placeholder="`最大可提现: ${formatCurrency(withdrawableData.withdrawable_amount)}`"
              :disabled="submitLoading"
            />
          </UFormGroup>
          
          <UFormGroup label="U地址(USDT)" required>
            <div class="relative">
              <UInput 
                v-model="settlementForm.u_address" 
                placeholder="请输入USDT钱包地址"
                :disabled="submitLoading"
              />
              <UButton 
                v-if="!uAddressInfo.has_u_address"
                @click="saveUAddress"
                size="xs"
                color="gray"
                variant="outline"
                class="absolute right-1 top-1"
              >
                保存
              </UButton>
            </div>
          </UFormGroup>
          
          <UFormGroup label="结算方式">
            <USelect
              v-model="settlementForm.settlement_method"
              :options="settlementMethods"
              :disabled="submitLoading"
            />
          </UFormGroup>
          
          <UFormGroup label="备注">
            <UInput 
              v-model="settlementForm.remark" 
              placeholder="备注信息（可选）"
              :disabled="submitLoading"
            />
          </UFormGroup>
          
          <div class="flex items-end">
            <UButton 
              type="submit" 
              color="primary" 
              :loading="submitLoading"
              :disabled="!settlementForm.settlement_amount || !settlementForm.u_address || withdrawableData.available_amount <= 0"
            >
              提交结算申请
            </UButton>
          </div>
        </div>
        
        <div v-if="addressWarning" class="text-xs text-orange-500 mt-1">
          {{ addressWarning }}
        </div>
      </UForm>
    </UCard>

    <!-- 结算记录 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">结算记录</h3>
          <UButton @click="refreshRecords" size="sm" variant="outline">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
            刷新
          </UButton>
        </div>
      </template>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-3 px-4 font-medium text-gray-900">提交时间</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">类型</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">代理</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">申请金额</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">分成比例</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">结算方式</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">U地址</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">状态</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">结算时间</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in records" :key="record.id" class="border-b border-gray-100">
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ formatDateTime(record.created_at) }}
              </td>
              <td class="py-3 px-4">
                <UBadge 
                  :color="record.is_own ? 'blue' : 'gray'" 
                  variant="subtle"
                  size="sm"
                >
                  {{ record.is_own ? '自己的' : '下级的' }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm">
                <div>{{ record.admin_name }}</div>
                <div class="text-xs text-gray-500">{{ record.channel_code }}</div>
              </td>
              <td class="py-3 px-4 text-sm font-medium text-green-600">
                {{ formatCurrency(record.settlement_amount) }}
              </td>
              <td class="py-3 px-4 text-sm">
                {{ record.divide_rate }}%
              </td>
              <td class="py-3 px-4 text-sm">
                <UBadge color="indigo" variant="subtle" size="sm">
                  {{ record.settlement_method || 'U' }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm font-mono">
                <div class="max-w-32 truncate" :title="record.u_address">
                  {{ record.u_address || '-' }}
                </div>
              </td>
              <td class="py-3 px-4">
                <UBadge 
                  :color="getStatusColor(record.status)" 
                  variant="subtle"
                  size="sm"
                >
                  {{ getStatusText(record.status) }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ record.settlement_date ? formatDateTime(record.settlement_date) : '-' }}
              </td>
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ record.remark || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="records.length === 0" class="text-center py-8 text-gray-500">
          暂无结算记录
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

    <!-- 地址确认弹窗 -->
    <UModal v-model="showAddressConfirm">
      <div class="p-6">
        <h3 class="text-lg font-semibold mb-4">地址确认警告</h3>
        <div class="mb-4">
          <UAlert 
            :icon="uAddressInfo.has_u_address ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
            :color="uAddressInfo.has_u_address ? 'orange' : 'blue'"
            variant="subtle"
            :title="addressWarning"
          />
        </div>
        <div class="flex justify-end gap-3">
          <UButton color="gray" variant="outline" @click="showAddressConfirm = false">
            取消
          </UButton>
          <UButton color="primary" @click="confirmSubmit">
            确认提交
          </UButton>
        </div>
      </div>
    </UModal>

    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '~/store/auth'

const authStore = useAuthStore()

// 响应式数据
const withdrawableData = ref({
  total_amount: 0,
  settled_amount: 0,
  available_amount: 0,
  own_channel_amount: 0,
  child_channels_amount: 0,
  own_channel_commission: 0,
  child_channels_commission: 0,
  withdrawable_amount: 0,
  divide_rate: 0
})

const uAddressInfo = ref({
  u_address: '',
  has_u_address: false
})

const settlementForm = ref({
  settlement_amount: '',
  u_address: '',
  settlement_method: 'U',
  remark: ''
})

const records = ref([])
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0
})

const submitLoading = ref(false)
const showAddressConfirm = ref(false)
const addressWarning = ref('')

const settlementMethods = [
  { label: 'USDT(U)', value: 'U' },
  { label: '支付宝', value: 'Alipay' },
  { label: '微信', value: 'WeChat' },
  { label: '银行卡', value: 'Bank' }
]

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

const getStatusText = (status) => {
  const statusMap = {
    0: '待结算',
    1: '已结算',
    2: '已拒绝'
  }
  return statusMap[status] || '未知'
}

const getStatusColor = (status) => {
  const colorMap = {
    0: 'orange',
    1: 'green',
    2: 'red'
  }
  return colorMap[status] || 'gray'
}

// 方法
const loadWithdrawableAmount = async () => {
  try {
    const response = await $fetch('/api/admin/calculate-withdrawable-amount', {
      method: 'POST',
      body: { admin_id: currentAdminId.value }
    })
    
    if (response.success) {
      withdrawableData.value = response.data
    }
  } catch (error) {
    console.error('加载可提现金额失败:', error)
    toast.add({
      title: '错误',
      description: '加载可提现金额失败',
      color: 'red'
    })
  }
}

const loadUAddress = async () => {
  try {
    const response = await $fetch('/api/admin/get-u-address', {
      method: 'POST',
      body: { admin_id: currentAdminId.value }
    })
    
    if (response.success) {
      uAddressInfo.value = response.data
      if (response.data.u_address) {
        settlementForm.value.u_address = response.data.u_address
      }
    }
  } catch (error) {
    console.error('加载U地址失败:', error)
  }
}

const saveUAddress = async () => {
  if (!settlementForm.value.u_address) {
    toast.add({
      title: '错误',
      description: '请先输入U地址',
      color: 'red'
    })
    return
  }
  
  try {
    const response = await $fetch('/api/admin/update-u-address', {
      method: 'POST',
      body: { 
        admin_id: currentAdminId.value,
        u_address: settlementForm.value.u_address
      }
    })
    
    if (response.success) {
      toast.add({
        title: '成功',
        description: 'U地址保存成功',
        color: 'green'
      })
      await loadUAddress() // 重新加载
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: error.data?.message || 'U地址保存失败',
      color: 'red'
    })
  }
}

const loadRecords = async () => {
  try {
    const response = await $fetch('/api/admin/settlement-records', {
      method: 'POST',
      body: {
        admin_id: currentAdminId.value,
        page: pagination.value.page,
        page_size: pagination.value.pageSize
      }
    })
    
    if (response.success) {
      records.value = response.data.data
      pagination.value.total = response.data.total
    }
  } catch (error) {
    console.error('加载结算记录失败:', error)
    toast.add({
      title: '错误',
      description: '加载结算记录失败',
      color: 'red'
    })
  }
}

const submitSettlement = async () => {
  // 验证金额
  const amount = parseFloat(settlementForm.value.settlement_amount)
  if (isNaN(amount) || amount <= 0) {
    toast.add({
      title: '错误',
      description: '请输入有效的结算金额',
      color: 'red'
    })
    return
  }
  
  if (amount > withdrawableData.value.withdrawable_amount) {
    toast.add({
      title: '错误',
      description: `结算金额不能超过可提现金额 ${formatCurrency(withdrawableData.value.withdrawable_amount)}`,
      color: 'red'
    })
    return
  }
  
  // 检查地址警告
  let needConfirm = false
  if (uAddressInfo.value.has_u_address) {
    if (uAddressInfo.value.u_address !== settlementForm.value.u_address) {
      addressWarning.value = '提交的U地址与账户绑定地址不一致，请确认是否继续？'
      needConfirm = true
    }
  } else {
    addressWarning.value = '账户未绑定U地址，建议先保存地址到账户中'
    needConfirm = true
  }
  
  if (needConfirm) {
    showAddressConfirm.value = true
    return
  }
  
  await doSubmit()
}

const confirmSubmit = async () => {
  showAddressConfirm.value = false
  await doSubmit()
}

const doSubmit = async () => {
  submitLoading.value = true
  try {
    const response = await $fetch('/api/admin/submit-settlement-request', {
      method: 'POST',
      body: {
        admin_id: currentAdminId.value,
        settlement_amount: parseFloat(settlementForm.value.settlement_amount),
        u_address: settlementForm.value.u_address,
        settlement_method: settlementForm.value.settlement_method,
        remark: settlementForm.value.remark
      }
    })
    
    if (response.success) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      })
      
      // 重置表单
      settlementForm.value = {
        settlement_amount: '',
        u_address: uAddressInfo.value.u_address || '',
        settlement_method: 'U',
        remark: ''
      }
      
      // 刷新数据
      await Promise.all([loadWithdrawableAmount(), loadRecords()])
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: error.data?.message || '提交结算申请失败',
      color: 'red'
    })
  } finally {
    submitLoading.value = false
  }
}

const refreshRecords = async () => {
  pagination.value.page = 1
  await loadRecords()
}

const changePage = async (page) => {
  pagination.value.page = page
  await loadRecords()
}

// 页面初始化
onMounted(async () => {
  if (currentAdminId.value) {
    await Promise.all([
      loadWithdrawableAmount(),
      loadUAddress(),
      loadRecords()
    ])
  }
})
</script>

<style scoped>
.settlement-submit-page {
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