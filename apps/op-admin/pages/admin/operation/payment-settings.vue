<template>
  <div class="payment-settings-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>支付管理</h2>
      <div class="header-actions" v-if="isSuperAdmin">
        <UButton
          :color="apiDeliveryEnabled ? 'green' : 'gray'"
          variant="outline"
          :icon="apiDeliveryEnabled ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
          @click="toggleApiDelivery"
          :loading="apiDeliveryLoading"
        >
          API到账: {{ apiDeliveryEnabled ? '已启用' : '已禁用' }}
        </UButton>
        <UButton
          color="blue"
          variant="outline"
          icon="i-heroicons-user-circle"
          @click="showTestRoleDialog"
        >
          测试玩家配置
        </UButton>
        <UButton
          color="green"
          variant="outline"
          icon="i-heroicons-chat-bubble-left-right"
          @click="showMessageDialog"
        >
          编辑支付说明
        </UButton>
        <UButton
          color="primary"
          icon="i-heroicons-plus"
          @click="showAddDialog"
        >
          添加支付方式
        </UButton>
      </div>
    </div>

    <!-- 无权限提示 -->
    <UCard v-if="!isSuperAdmin" class="mb-4">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">🚫</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">无权限访问</h3>
        <p class="text-gray-600">只有超级管理员可以管理支付设置</p>
      </div>
    </UCard>

    <template v-else>
    <!-- 数据表格 -->
    <UCard class="payment-table-card mb-6">
      <template #header>
        <div class="card-header">
          <h3>支付方式列表</h3>
          <UBadge color="primary" variant="subtle">
            共 {{ paymentSettings.length }} 种支付方式
          </UBadge>
        </div>
      </template>

      <div class="table-container" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-id">ID</th>
              <th class="col-method">支付方式</th>
              <th class="col-channel">支付渠道</th>
              <th class="col-icon">图标URL</th>
              <th class="col-url">请求URL</th>
              <th class="col-price">最小金额</th>
              <th class="col-price">最大金额</th>
              <th class="col-sort">排序</th>
              <th class="col-status">用户中心</th>
              <th class="col-status">客户端</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="setting in paymentSettings" :key="setting.id">
              <td class="col-id">{{ setting.id }}</td>
              <td class="col-method">
                <UBadge 
                  :color="getChannelColor(setting.payment_method)" 
                  variant="subtle"
                  size="sm"
                >
                  {{ getChannelName(setting.payment_method) }}
                </UBadge>
              </td>
              <td class="col-channel">
                <span 
                  class="truncate-text" 
                  :title="setting.payment_channel"
                >
                  {{ setting.payment_channel }}
                </span>
              </td>
              <td class="col-icon">
                <div class="icon-cell">
                  <img 
                    v-if="setting.icon_url" 
                    :src="setting.icon_url" 
                    class="icon-preview" 
                    :alt="setting.payment_channel"
                    @error="handleImageError"
                  />
                  <span 
                    class="truncate-text text-xs text-gray-500" 
                    :title="setting.icon_url || '未设置'"
                  >
                    {{ setting.icon_url || '未设置' }}
                  </span>
                </div>
              </td>
              <td class="col-url">
                <span 
                  class="truncate-text text-xs text-gray-500" 
                  :title="setting.request_url || '未设置'"
                >
                  {{ setting.request_url || '未设置' }}
                </span>
              </td>
              <td class="col-price">¥{{ setting.MinPrice }}</td>
              <td class="col-price">¥{{ setting.MaxPrice }}</td>
              <td class="col-sort">{{ setting.Sort }}</td>
              <td class="col-status">
                <UBadge 
                  :color="setting.isClose === 1 ? 'green' : 'red'" 
                  variant="subtle"
                  size="sm"
                >
                  {{ setting.isClose === 1 ? '启用' : '禁用' }}
                </UBadge>
              </td>
              <td class="col-status">
                <UBadge 
                  :color="(setting.clientIsClose ?? 1) === 1 ? 'green' : 'red'" 
                  variant="subtle"
                  size="sm"
                >
                  {{ (setting.clientIsClose ?? 1) === 1 ? '启用' : '禁用' }}
                </UBadge>
              </td>
              <td class="col-actions">
                <div class="action-buttons">
                  <UButton
                    size="xs"
                    color="blue"
                    variant="outline"
                    @click="editPaymentSetting(setting)"
                  >
                    编辑
                  </UButton>
                  <UButton
                    size="xs"
                    color="red"
                    variant="outline"
                    @click="deletePaymentSetting(setting.id)"
                  >
                    删除
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="text-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p class="text-gray-600">加载中...</p>
        </div>
      </div>

      <!-- 无数据提示 -->
      <div v-if="!loading && paymentSettings.length === 0" class="no-data">
        <div class="text-center py-8">
          <div class="text-4xl mb-4">💳</div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">暂无数据</h3>
          <p class="text-gray-600">暂无支付方式配置</p>
        </div>
      </div>
    </UCard>

    <!-- 支付渠道管理 -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex justify-between items-center">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">支付渠道管理</h3>
            <p class="text-sm text-gray-500 mt-1">当前默认渠道：渠道{{ currentChannel }}</p>
          </div>
          <UBadge color="green" size="lg">共{{ channels.length }}个渠道</UBadge>
        </div>
      </template>
      
      <div class="channels-grid">
        <div 
          v-for="channel in channels" 
          :key="channel.id" 
          class="channel-card"
          :class="{ 'is-default': channel.isDefault }"
        >
          <div class="channel-header">
            <div class="flex justify-between items-center mb-2">
              <h4 class="text-base font-semibold text-gray-900">{{ channel.name }}</h4>
              <UBadge v-if="channel.isDefault" color="green" size="sm">当前使用</UBadge>
            </div>
            <div class="text-xs text-gray-500 font-mono">{{ channel.provider }}</div>
          </div>
          
          <div class="channel-body">
            <div class="info-row">
              <span class="label">商户ID:</span>
              <span class="value">{{ channel.credentials.pid || channel.credentials.merchantId || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="label">渠道状态:</span>
              <UBadge :color="channel.isOpen ? 'green' : 'red'" size="xs">
                {{ channel.isOpen ? '✓ 启用' : '✗ 禁用' }}
              </UBadge>
            </div>
            <div class="info-row">
              <span class="label">询单支持:</span>
              <UBadge :color="channel.supportQuery ? 'green' : 'gray'" size="xs">
                {{ channel.supportQuery ? '✓' : '✗' }}
              </UBadge>
            </div>
            <div class="info-row">
              <span class="label">密钥状态:</span>
              <UBadge :color="channel.credentials.hasMd5Key ? 'blue' : 'gray'" size="xs">
                {{ channel.credentials.hasMd5Key ? '已配置' : '未配置' }}
              </UBadge>
            </div>
          </div>
          
          <div class="channel-footer">
            <UButton
              color="primary"
              size="sm"
              variant="soft"
              block
              @click="openRechargeDialog(channel)"
            >
              平台币充值
            </UButton>
            <UButton 
              v-if="!channel.isDefault"
              @click="switchChannel(channel.id)"
              :loading="switching === channel.id"
              color="primary"
              size="sm"
              block
            >
              切换到此渠道
            </UButton>
            <UButton 
              v-else
              disabled
              color="gray"
              size="sm"
              block
            >
              ✓ 当前使用中
            </UButton>
          </div>
        </div>
      </div>
    </UCard>
    </template>

    <!-- 添加/编辑对话框 -->
    <UModal v-model="dialogVisible" :ui="{ width: 'w-full max-w-2xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3>{{ isEdit ? '编辑支付方式' : '添加支付方式' }}</h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="支付方式" required>
            <USelect
              v-model="formData.payment_method"
              :options="paymentMethodOptions"
              placeholder="请选择支付方式"
            />
          </UFormGroup>

          <UFormGroup label="支付渠道" required>
            <UInput
              v-model="formData.payment_channel"
              placeholder="请输入支付渠道名称，如：支付宝通道1、微信通道A等"
              icon="i-heroicons-building-storefront"
            />
          </UFormGroup>

          <UFormGroup label="图标URL">
            <UInput
              v-model="formData.icon_url"
              placeholder="请输入图标URL地址"
              icon="i-heroicons-photo"
            />
          </UFormGroup>

          <UFormGroup label="请求URL">
            <UInput
              v-model="formData.request_url"
              placeholder="请输入支付请求URL地址"
              icon="i-heroicons-link"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="最小金额" required>
              <UInput
                v-model.number="formData.MinPrice"
                type="number"
                placeholder="0"
                min="0"
                step="0.01"
              />
            </UFormGroup>

            <UFormGroup label="最大金额" required>
              <UInput
                v-model.number="formData.MaxPrice"
                type="number"
                placeholder="0"
                min="0"
                step="0.01"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="排序">
              <UInput
                v-model.number="formData.Sort"
                type="number"
                placeholder="0"
                min="0"
              />
            </UFormGroup>

            <UFormGroup label="用户中心状态">
              <USelect
                v-model="formData.isClose"
                :options="statusOptions"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="客户端状态">
              <USelect
                v-model="formData.clientIsClose"
                :options="statusOptions"
              />
            </UFormGroup>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="dialogVisible = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              @click="submitForm"
              :loading="loading"
            >
              {{ isEdit ? '更新' : '添加' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 编辑支付说明对话框 -->
    <UModal v-model="messageDialogVisible" :ui="{ width: 'w-full max-w-3xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3>编辑支付说明</h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="支付说明" required>
            <UTextarea
              v-model="messageForm.message"
              placeholder="请输入支付说明"
              :rows="6"
              maxlength="500"
              resize
            />
          </UFormGroup>

          <div class="message-preview">
            <h4 class="text-sm font-semibold text-gray-700 mb-2">预览效果：</h4>
            <div class="preview-content">
              {{ messageForm.message || '暂无内容' }}
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="messageDialogVisible = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              @click="submitMessageForm"
              :loading="loading"
            >
              保存
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 测试玩家配置对话框 -->
    <UModal v-model="testRoleDialogVisible" :ui="{ width: 'w-full max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3>测试玩家配置</h3>
          </div>
        </template>

        <div class="space-y-4">
          <div class="text-sm text-gray-600 bg-blue-50 p-3 rounded">
            <p class="mb-2">💡 配置说明：</p>
            <p>设置一个特殊的 role_id，当订单的 role_id 等于此值时，即使「API到账」开关关闭，也会强制执行API到账。</p>
            <p class="mt-2 text-blue-600">用于测试环境快速验证API到账功能。</p>
          </div>
          
          <UFormGroup label="测试玩家 Role ID" help="留空则禁用测试模式">
            <UInput
              v-model="testRoleForm.roleId"
              placeholder="输入测试玩家的 role_id"
            />
          </UFormGroup>

          <div v-if="testRoleForm.roleId" class="text-sm text-amber-600 bg-amber-50 p-3 rounded">
            ⚠️ 当前测试玩家：<code class="font-mono">{{ testRoleForm.roleId }}</code><br>
            该玩家的订单将始终触发API到账，无视全局开关。
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="testRoleDialogVisible = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              @click="submitTestRoleForm"
              :loading="testRoleLoading"
            >
              保存
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 渠道平台币充值 -->
    <UModal v-model="rechargeDialogVisible" :ui="{ width: 'w-full max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3>渠道平台币充值</h3>
            <UBadge color="primary" variant="subtle" size="sm">
              渠道 {{ rechargeForm.channelId || '-' }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="用户ID" required>
            <UInput
              v-model="rechargeForm.userId"
              type="number"
              min="1"
              placeholder="请输入用户ID"
            />
          </UFormGroup>

          <UFormGroup label="充值金额（元）" required>
            <UInput
              v-model="rechargeForm.amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="例如：100"
            />
          </UFormGroup>

          <UFormGroup label="支付方式">
            <USelect
              v-model="rechargeForm.payType"
              :options="payTypeOptions"
            />
          </UFormGroup>

          <div v-if="rechargeResult" class="recharge-result">
            <UAlert color="green" variant="subtle" icon="i-heroicons-check-circle">
              <template #title>订单已创建</template>
              <p>订单号：{{ rechargeResult.transaction_id }}</p>
              <p v-if="rechargeResult.pay_url">
                支付链接：
                <a
                  :href="rechargeResult.pay_url"
                  target="_blank"
                  rel="noopener"
                  class="recharge-link"
                >
                  点击打开
                </a>
              </p>
              <p v-if="rechargeResult.qr_page">
                二维码页面：
                <a
                  :href="rechargeResult.qr_page"
                  target="_blank"
                  rel="noopener"
                  class="recharge-link"
                >
                  点击查看
                </a>
              </p>
            </UAlert>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              color="gray"
              variant="outline"
              @click="closeRechargeDialog"
              :disabled="rechargeSubmitting"
            >
              关闭
            </UButton>
            <UButton
              color="primary"
              :loading="rechargeSubmitting"
              @click="submitManualRecharge"
            >
              创建订单
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '~/store/auth'

definePageMeta({
  layout: 'default'
})

const authStore = useAuthStore()
const toast = useToast()

// 响应式数据
const loading = ref(false)
const paymentSettings = ref([])
const dialogVisible = ref(false)
const messageDialogVisible = ref(false)
const isEdit = ref(false)
const rechargeDialogVisible = ref(false)
const rechargeSubmitting = ref(false)
const rechargeResult = ref(null)

// 渠道管理数据
const channels = ref([])
const currentChannel = ref('1')
const switching = ref(null)

// 表单数据
const formData = ref({
  payment_method: '',
  payment_channel: '',
  icon_url: '',
  request_url: '',
  MinPrice: 0,
  MaxPrice: 0,
  Sort: 0,
  isClose: 1,
  clientIsClose: 1
})

// 支付说明表单
const messageForm = ref({
  message: ''
})

// API到账开关
const apiDeliveryEnabled = ref(false)
const apiDeliveryLoading = ref(false)

// 测试玩家配置
const testRoleDialogVisible = ref(false)
const testRoleForm = ref({
  roleId: ''
})
const testRoleLoading = ref(false)

// 选项配置
const paymentMethodOptions = [
  { label: '支付宝', value: 'zfb' },
  { label: '微信支付', value: 'wx' },
  { label: '平台币', value: 'ptb' },
  { label: '代金券', value: 'djq' },
  { label: '客服', value: 'kf' }
]

const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 }
]

const payTypeOptions = [
  { label: '支付宝', value: 'alipay' },
  { label: '微信', value: 'wxpay' }
]

const rechargeForm = ref({
  channelId: '',
  userId: '',
  amount: null,
  payType: 'alipay'
})

// 计算属性
const isSuperAdmin = computed(() => {
  const permissions = authStore.permissions
  return permissions && permissions.level === 0
})

// 工具函数
const getChannelName = (channel) => {
  const channelMap = {
    'zfb': '支付宝',
    'wx': '微信支付',
    'ptb': '平台币',
    'djq': '代金券',
    'kf': '客服'
  }
  return channelMap[channel] || channel
}

const getChannelColor = (channel) => {
  const colorMap = {
    'zfb': 'blue',
    'wx': 'green',
    'ptb': 'purple',
    'djq': 'orange',
    'kf': 'pink'
  }
  return colorMap[channel] || 'gray'
}

// 页面生命周期
onMounted(() => {
  if (!isSuperAdmin.value) {
    toast.add({
      title: '无权限访问',
      description: '只有超级管理员可以管理支付设置',
      color: 'red'
    })
    navigateTo('/admin')
    return
  }
  loadPaymentSettings()
  loadChannels()
  loadApiDeliveryStatus()
})

// 加载支付设置列表
const loadPaymentSettings = async () => {
  try {
    loading.value = true
    const response = await $fetch('/api/admin/payment-settings')
    paymentSettings.value = response.data || []
  } catch (error) {
    toast.add({
      title: '加载失败',
      description: error.message || '加载支付设置失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 显示添加对话框
const showAddDialog = () => {
  isEdit.value = false
  formData.value = {
    payment_method: '',
    payment_channel: '',
    icon_url: '',
    request_url: '',
    MinPrice: 0,
    MaxPrice: 0,
    Sort: 0,
    isClose: 1,
    clientIsClose: 1
  }
  dialogVisible.value = true
}

// 编辑支付设置
const editPaymentSetting = (row) => {
  isEdit.value = true
  formData.value = { ...row }
  dialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  try {
    // 表单验证
    if (!formData.value.payment_method) {
      toast.add({
        title: '验证失败',
        description: '请选择支付方式',
        color: 'red'
      })
      return
    }

    if (!formData.value.payment_channel) {
      toast.add({
        title: '验证失败',
        description: '请输入支付渠道名称',
        color: 'red'
      })
      return
    }

    if (formData.value.MaxPrice <= formData.value.MinPrice) {
      toast.add({
        title: '验证失败',
        description: '最大金额必须大于最小金额',
        color: 'red'
      })
      return
    }

    loading.value = true
    
    const url = isEdit.value ? '/api/admin/payment-settings/update' : '/api/admin/payment-settings/create'
    const method = isEdit.value ? 'PUT' : 'POST'
    
    await $fetch(url, {
      method,
      body: formData.value
    })
    
    toast.add({
      title: '操作成功',
      description: isEdit.value ? '编辑成功' : '添加成功',
      color: 'green'
    })
    
    dialogVisible.value = false
    loadPaymentSettings()
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error.message || '操作失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 删除支付设置
const deletePaymentSetting = async (id) => {
  try {
    // 简单确认，可以用UModal替换更复杂的确认框
    if (!confirm('确定要删除这个支付方式吗？')) {
      return
    }

    loading.value = true
    
    await $fetch(`/api/admin/payment-settings/delete/${id}`, {
      method: 'DELETE'
    })
    
    toast.add({
      title: '删除成功',
      description: '支付方式已删除',
      color: 'green'
    })
    
    loadPaymentSettings()
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error.message || '删除失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 显示支付说明编辑对话框
const showMessageDialog = async () => {
  try {
    loading.value = true
    const response = await $fetch('/api/admin/payment-message')
    messageForm.value.message = response.data.message
    messageDialogVisible.value = true
  } catch (error) {
    toast.add({
      title: '获取失败',
      description: error.message || '获取支付说明失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 提交支付说明
const submitMessageForm = async () => {
  try {
    loading.value = true
    
    await $fetch('/api/admin/payment-message', {
      method: 'POST',
      body: { message: messageForm.value.message }
    })
    
    toast.add({
      title: '保存成功',
      description: '支付说明已保存',
      color: 'green'
    })
    
    messageDialogVisible.value = false
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error.message || '保存支付说明失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 图片加载错误处理
const handleImageError = (event) => {
  event.target.style.display = 'none'
}

// ========== API到账开关相关函数 ==========

// 加载API到账开关状态
const loadApiDeliveryStatus = async () => {
  try {
    const response = await $fetch('/api/admin/payment-api-delivery')
    if (response.code === 200) {
      apiDeliveryEnabled.value = response.data.enabled
    }
  } catch (error) {
    console.error('加载API到账开关状态失败:', error)
  }
}

// 切换API到账开关
const toggleApiDelivery = async () => {
  const newStatus = !apiDeliveryEnabled.value
  
  apiDeliveryLoading.value = true
  try {
    const response = await $fetch('/api/admin/payment-api-delivery', {
      method: 'POST',
      body: { enabled: newStatus }
    })
    
    if (response.code === 200) {
      apiDeliveryEnabled.value = newStatus
      toast.add({
        title: '设置成功',
        description: `API到账已${newStatus ? '启用' : '禁用'}`,
        color: 'green'
      })
    } else {
      throw new Error(response.message || '设置失败')
    }
  } catch (error) {
    toast.add({
      title: '设置失败',
      description: error.message || 'API到账开关设置失败',
      color: 'red'
    })
  } finally {
    apiDeliveryLoading.value = false
  }
}

// ========== 测试玩家配置相关函数 ==========

// 显示测试玩家配置对话框
const showTestRoleDialog = async () => {
  try {
    const response = await $fetch('/api/admin/payment-api-delivery-test-role')
    if (response.code === 200) {
      testRoleForm.value.roleId = response.data.roleId || ''
    }
  } catch (error) {
    console.error('加载测试玩家role_id失败:', error)
  }
  testRoleDialogVisible.value = true
}

// 提交测试玩家配置
const submitTestRoleForm = async () => {
  testRoleLoading.value = true
  try {
    const response = await $fetch('/api/admin/payment-api-delivery-test-role', {
      method: 'POST',
      body: { roleId: testRoleForm.value.roleId.trim() }
    })
    
    if (response.code === 200) {
      toast.add({
        title: '保存成功',
        description: response.message,
        color: 'green'
      })
      testRoleDialogVisible.value = false
    } else {
      throw new Error(response.message || '保存失败')
    }
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error.message || '测试玩家配置保存失败',
      color: 'red'
    })
  } finally {
    testRoleLoading.value = false
  }
}

// ========== 渠道管理相关函数 ==========

// 加载支付渠道
const loadChannels = async () => {
  try {
    const response = await $fetch('/api/admin/payment-channels')
    
    if (response.code === 200) {
      channels.value = response.data.channels
      currentChannel.value = response.data.currentChannel
    } else {
      toast.add({
        title: '加载失败',
        description: response.message || '获取支付渠道失败',
        color: 'red'
      })
    }
  } catch (error) {
    console.error('加载支付渠道失败:', error)
  }
}

// 切换渠道
const switchChannel = async (channelId) => {
  if (switching.value) return
  
  switching.value = channelId
  try {
    const response = await $fetch('/api/admin/payment-channels/switch', {
      method: 'POST',
      body: { channel_id: channelId }
    })
    
    if (response.code === 200) {
      toast.add({
        title: '切换成功',
        description: response.message,
        color: 'green'
      })
      
      // 重新加载渠道列表
      await loadChannels()
    } else {
      toast.add({
        title: '切换失败',
        description: response.message || '切换渠道失败',
        color: 'red'
      })
    }
  } catch (error) {
    console.error('切换渠道失败:', error)
    toast.add({
      title: '切换失败',
      description: '网络错误',
      color: 'red'
    })
  } finally {
    switching.value = null
  }
}

const openRechargeDialog = (channel) => {
  rechargeForm.value = {
    channelId: channel.id,
    userId: '',
    amount: null,
    payType: 'alipay'
  }
  rechargeResult.value = null
  rechargeDialogVisible.value = true
}

const closeRechargeDialog = () => {
  rechargeDialogVisible.value = false
}

const submitManualRecharge = async () => {
  if (rechargeSubmitting.value) return

  const channelId = rechargeForm.value.channelId
  const userId = Number(rechargeForm.value.userId)
  const amount = Number(rechargeForm.value.amount)

  if (!channelId) {
    toast.add({
      title: '缺少渠道信息',
      description: '请重新选择渠道后再试',
      color: 'red'
    })
    return
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    toast.add({
      title: '验证失败',
      description: '用户ID必须是正整数',
      color: 'red'
    })
    return
  }

  if (!amount || Number.isNaN(amount) || amount <= 0) {
    toast.add({
      title: '验证失败',
      description: '请输入大于0的充值金额',
      color: 'red'
    })
    return
  }

  try {
    rechargeSubmitting.value = true
    rechargeResult.value = null

    const response = await $fetch('/api/admin/payment-channels/manual-platform-coin', {
      method: 'POST',
      body: {
        channel_id: channelId,
        user_id: userId,
        amount,
        pay_type: rechargeForm.value.payType
      }
    })

    if (response.code === 200) {
      rechargeResult.value = response.data || null
      toast.add({
        title: '订单创建成功',
        description: `交易号：${response.data?.transaction_id || '已生成'}`,
        color: 'green'
      })

      if (process.client) {
        if (response.data?.qr_page) {
          window.open(response.data.qr_page, '_blank', 'noopener')
        } else if (response.data?.pay_url) {
          window.open(response.data.pay_url, '_blank', 'noopener')
        }
      }
    } else {
      throw new Error(response.message || '创建订单失败')
    }
  } catch (error) {
    toast.add({
      title: '创建失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    rechargeSubmitting.value = false
  }
}
</script>

<style scoped>
.payment-settings-page {
  @apply p-6;
}

.page-header {
  @apply flex justify-between items-center mb-6;
}

.page-header h2 {
  @apply text-2xl font-bold text-gray-900;
}

.header-actions {
  @apply flex gap-3;
}

@media (max-width: 768px) {
  .page-header {
    @apply flex-col items-start gap-4;
  }
  
  .page-header h2 {
    @apply text-xl;
  }
  
  .header-actions {
    @apply flex-col w-full;
  }
  
  .header-actions button {
    @apply w-full justify-center;
  }
}

.card-header {
  @apply flex justify-between items-center;
}

.card-header h3 {
  @apply text-lg font-semibold text-gray-900;
}

.table-container {
  @apply overflow-x-auto;
}

.data-table {
  @apply w-full border-collapse table-fixed;
  min-width: 1000px;
}

@media (max-width: 768px) {
  .payment-settings-page {
    @apply p-4;
  }
  
  .table-container {
    @apply -mx-4;
    border-radius: 0;
  }
  
  .data-table {
    min-width: 800px;
    font-size: 12px;
  }
  
  .data-table th,
  .data-table td {
    @apply p-2 text-xs;
  }
}

.data-table th {
  @apply text-left p-3 border-b border-gray-200 bg-gray-50 font-semibold text-gray-900 text-sm;
}

.data-table td {
  @apply p-3 border-b border-gray-200 text-sm text-gray-700;
}

/* 列宽定义 */
.col-id {
  width: 6%;
}

.col-method {
  width: 10%;
}

.col-channel {
  width: 15%;
}

.col-icon {
  width: 18%;
}

.col-url {
  width: 18%;
}

.col-price {
  width: 8%;
}

.col-sort {
  width: 6%;
}

.col-status {
  width: 8%;
}

.col-actions {
  width: 11%;
}

/* 文本截断样式 */
.truncate-text {
  @apply block truncate max-w-full;
  cursor: help;
}

.truncate-text:hover {
  @apply text-blue-600;
}

/* 图标单元格样式 */
.icon-cell {
  @apply flex items-center gap-2 min-w-0;
}

.icon-preview {
  @apply w-6 h-6 rounded flex-shrink-0 object-cover border border-gray-200;
}

.icon-preview:hover {
  @apply transform scale-110 transition-transform duration-200;
}

.action-buttons {
  @apply flex gap-2;
}

.loading-state,
.no-data {
  @apply py-8;
}

.message-preview {
  @apply mt-4;
}

.preview-content {
  @apply mt-2 p-3 bg-gray-50 border rounded-lg text-sm text-gray-700 whitespace-pre-line min-h-[60px];
}

/* 渠道管理样式 */
.channels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.channel-card {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: white;
  transition: all 0.3s;
}

.channel-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.channel-card.is-default {
  border-color: #10b981;
  background: #f0fdf4;
}

.channel-header {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.channel-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.channel-body .info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.channel-body .label {
  color: #6b7280;
  font-weight: 500;
}

.channel-body .value {
  color: #1f2937;
  font-weight: 500;
  font-family: monospace;
  font-size: 12px;
}

.channel-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recharge-result {
  @apply mt-2;
}

.recharge-link {
  @apply text-primary-600 underline;
}

@media (max-width: 768px) {
  .channels-grid {
    grid-template-columns: 1fr;
  }
}
</style> 