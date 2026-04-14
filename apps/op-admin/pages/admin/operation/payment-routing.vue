<template>
  <div class="payment-routing-page">
    <div class="page-header">
      <h2>支付路由规则管理</h2>
      <div class="header-actions" v-if="isSuperAdmin">
        <UButton
          color="primary"
          icon="i-heroicons-plus"
          @click="showAddDialog"
        >
          添加规则
        </UButton>
      </div>
    </div>

    <!-- 无权限提示 -->
    <UCard v-if="!isSuperAdmin" class="mb-4">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">🚫</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">无权限访问</h3>
        <p class="text-gray-600">只有超级管理员可以管理支付路由规则</p>
      </div>
    </UCard>

    <template v-else>
      <UCard class="mb-6">
        <template #header>
          <div class="card-header">
            <h3>路由配置</h3>
            <UButton
              color="primary"
              size="sm"
              :loading="settingsSubmitting"
              @click="saveRoutingSettings"
            >
              保存配置
            </UButton>
          </div>
        </template>

        <div v-if="routingLoading" class="loading-state">
          <div class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p class="text-gray-600">加载中...</p>
          </div>
        </div>

        <div v-else class="settings-grid">
          <UFormGroup label="启用智能路由">
            <UToggle v-model="routingSettings.payment_routing_enabled" />
          </UFormGroup>

          <UFormGroup label="路由模式">
            <USelect
              v-model="routingSettings.payment_routing_mode"
              :options="routingModeOptions"
            />
          </UFormGroup>
        </div>
      </UCard>

      <!-- 路由规则列表 -->
      <UCard class="mb-6">
        <template #header>
          <div class="card-header">
            <h3>路由规则列表</h3>
            <UBadge color="primary" variant="subtle">
              共 {{ rules.length }} 条规则
            </UBadge>
          </div>
        </template>

        <div class="table-container" v-if="!loading">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>支付渠道</th>
                <th>优先级</th>
                <th>单笔限额</th>
                <th>生效时间</th>
                <th>支持方式</th>
                <th>每日总额度</th>
                <th>已用额度</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rule in rules" :key="rule.id">
                <td>{{ rule.id }}</td>
                <td>
                  <UBadge color="indigo" variant="subtle">
                    {{ getChannelName(rule.payment_channel) }}
                  </UBadge>
                </td>
                <td>
                  <UBadge color="blue" size="sm">{{ rule.priority }}</UBadge>
                </td>
                <td>
                  <span class="text-xs">
                    {{ rule.min_amount || '0' }} - {{ rule.max_amount || '不限' }}
                  </span>
                </td>
                <td>
                  <span class="text-xs">
                    {{ rule.time_start || '全天' }} - {{ rule.time_end || '全天' }}
                  </span>
                </td>
                <td>
                  <div class="flex gap-1">
                    <UBadge :color="rule.allow_zfb === 1 ? 'blue' : 'gray'" size="xs" variant="subtle">
                      {{ rule.allow_zfb === 1 ? '支付宝' : '禁止' }}
                    </UBadge>
                    <UBadge :color="rule.allow_wx === 1 ? 'green' : 'gray'" size="xs" variant="subtle">
                      {{ rule.allow_wx === 1 ? '微信' : '禁止' }}
                    </UBadge>
                  </div>
                </td>
                <td>
                  <span class="text-xs">
                    {{ rule.daily_quota === 0 ? '不限制' : `¥${rule.daily_quota}` }}
                  </span>
                </td>
                <td>
                  <span class="text-xs">¥{{ rule.used_quota || 0 }}</span>
                </td>
                <td>
                  <UBadge 
                    :color="rule.is_enabled === 1 ? 'green' : 'gray'" 
                    size="sm"
                  >
                    {{ rule.is_enabled === 1 ? '启用' : '禁用' }}
                  </UBadge>
                </td>
                <td>
                  <div class="action-buttons">
                    <UButton
                      size="xs"
                      color="blue"
                      variant="outline"
                      @click="editRule(rule)"
                    >
                      编辑
                    </UButton>
                    <UButton
                      size="xs"
                      :color="rule.is_enabled === 1 ? 'orange' : 'green'"
                      variant="outline"
                      @click="toggleRule(rule)"
                    >
                      {{ rule.is_enabled === 1 ? '禁用' : '启用' }}
                    </UButton>
                    <UButton
                      size="xs"
                      color="red"
                      variant="outline"
                      @click="deleteRule(rule.id)"
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
        <div v-if="!loading && rules.length === 0" class="no-data">
          <div class="text-center py-8">
            <div class="text-4xl mb-4">📋</div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">暂无规则</h3>
            <p class="text-gray-600">点击"添加规则"创建第一条路由规则</p>
          </div>
        </div>
      </UCard>

      <!-- 使用说明 -->
      <UCard>
        <template #header>
          <h3>💡 使用说明</h3>
        </template>
        
        <div class="instructions">
          <h4>规则说明</h4>
          <ul>
            <li><strong>优先级：</strong>数字越大越优先，系统会从高到低匹配规则</li>
            <li><strong>金额范围：</strong>订单金额在此范围内才匹配（留空=不限制）</li>
            <li><strong>时间段：</strong>在此时间段内才匹配（留空=不限制）</li>
            <li><strong>每日额度：</strong>每天该规则最多处理的金额（0=不限制）</li>
          </ul>
        </div>
      </UCard>
    </template>

    <!-- 添加/编辑对话框 -->
    <UModal v-model="dialogVisible" :ui="{ width: 'w-full max-w-3xl' }">
      <UCard>
        <template #header>
          <h3>{{ isEdit ? '编辑规则' : '添加规则' }}</h3>
        </template>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="支付渠道" required>
              <USelect
                v-model="formData.payment_channel"
                :options="channelOptions"
                placeholder="选择要配置的渠道"
              />
            </UFormGroup>

            <UFormGroup label="优先级" required>
              <UInput
                v-model.number="formData.priority"
                type="number"
                placeholder="数字越大越优先"
                min="0"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="最小金额（元）">
              <UInput
                v-model.number="formData.min_amount"
                type="number"
                placeholder="留空=不限制"
                min="0"
                step="0.01"
              />
            </UFormGroup>

            <UFormGroup label="最大金额（元）">
              <UInput
                v-model.number="formData.max_amount"
                type="number"
                placeholder="留空=不限制"
                min="0"
                step="0.01"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="开始时间（HH:MM:SS）">
              <UInput
                v-model="formData.time_start"
                placeholder="如：08:00:00，留空=不限制"
              />
            </UFormGroup>

            <UFormGroup label="结束时间（HH:MM:SS）">
              <UInput
                v-model="formData.time_end"
                placeholder="如：22:00:00，留空=不限制"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="每日额度（元）">
              <UInput
                v-model.number="formData.daily_quota"
                type="number"
                placeholder="0=不限制"
                min="0"
                step="0.01"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-4 border-t pt-4">
            <UFormGroup label="允许支付宝">
              <UToggle v-model="formData.allow_zfb" />
            </UFormGroup>

            <UFormGroup label="允许微信">
              <UToggle v-model="formData.allow_wx" />
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
              :loading="submitting"
            >
              {{ isEdit ? '更新' : '创建' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

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

const loading = ref(false)
const submitting = ref(false)
const routingLoading = ref(false)
const settingsSubmitting = ref(false)
const rules = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)

const routingSettings = ref({
  payment_routing_enabled: false,
  payment_routing_mode: 'manual'
})

const routingModeOptions = [
  { label: '自动', value: 'auto' },
  { label: '手动', value: 'manual' }
]

const formData = ref({
  rule_name: '',
  priority: 100,
  min_amount: null,
  max_amount: null,
  time_start: null,
  time_end: null,
  payment_channel: '1',
  daily_quota: 0,
  allow_zfb: true,
  allow_wx: true
})

const channelOptions = ref([])

const getChannelName = (id) => {
  const channel = channelOptions.value.find(c => String(c.value) === String(id))
  return channel ? channel.label : `渠道${id}`
}

const loadChannels = async () => {
  try {
    const response = await $fetch('/api/admin/payment-channels')
    if (response.code === 200) {
      channelOptions.value = response.data.channels.map(c => ({
        label: c.name,
        value: c.id
      }))
    }
  } catch (error) {
    console.error('加载渠道列表失败:', error)
  }
}

const isSuperAdmin = computed(() => {
  const permissions = authStore.permissions
  return permissions && permissions.level === 0
})

onMounted(() => {
  if (!isSuperAdmin.value) {
    toast.add({
      title: '无权限访问',
      description: '只有超级管理员可以管理支付路由规则',
      color: 'red'
    })
    navigateTo('/admin')
    return
  }
  loadRoutingSettings()
  loadRules()
  loadChannels()
})

const loadRoutingSettings = async () => {
  try {
    routingLoading.value = true
    const response = await $fetch('/api/admin/payment-routing/settings')
    if (response.code === 200) {
      routingSettings.value = {
        payment_routing_enabled: !!response.data?.payment_routing_enabled,
        payment_routing_mode: response.data?.payment_routing_mode || 'manual'
      }
    } else {
      throw new Error(response.message || '加载路由配置失败')
    }
  } catch (error) {
    toast.add({
      title: '加载失败',
      description: error.message || '加载路由配置失败',
      color: 'red'
    })
  } finally {
    routingLoading.value = false
  }
}

const saveRoutingSettings = async () => {
  try {
    settingsSubmitting.value = true
    const payload = {
      payment_routing_enabled: routingSettings.value.payment_routing_enabled,
      payment_routing_mode: routingSettings.value.payment_routing_mode
    }
    const response = await $fetch('/api/admin/payment-routing/settings/update', {
      method: 'POST',
      body: payload
    })
    if (response.code === 200) {
      toast.add({
        title: '保存成功',
        description: response.message,
        color: 'green'
      })
      await loadRoutingSettings()
    } else {
      throw new Error(response.message || '保存失败')
    }
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error.message || '保存路由配置失败',
      color: 'red'
    })
  } finally {
    settingsSubmitting.value = false
  }
}

const loadRules = async () => {
  try {
    loading.value = true
    const response = await $fetch('/api/admin/payment-routing/rules')
    
    if (response.code === 200) {
      rules.value = response.data || []
    } else {
      throw new Error(response.message || '加载失败')
    }
  } catch (error) {
    toast.add({
      title: '加载失败',
      description: error.message || '加载规则失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

const showAddDialog = () => {
  isEdit.value = false
  formData.value = {
    rule_name: '',
    priority: 100,
    min_amount: null,
    max_amount: null,
    time_start: null,
    time_end: null,
    payment_channel: '1',
    daily_quota: 0,
    allow_zfb: true,
    allow_wx: true
  }
  dialogVisible.value = true
}

const editRule = (rule) => {
  isEdit.value = true
  formData.value = { ...rule }
  dialogVisible.value = true
}

const submitForm = async () => {
  try {
    // 验证必填字段
    if (!formData.value.payment_channel) {
      toast.add({
        title: '验证失败',
        description: '请选择支付渠道',
        color: 'red'
      })
      return
    }
    
    // 自动根据渠道名称设置规则名称
    const selectedChannel = channelOptions.value.find(c => String(c.value) === String(formData.value.payment_channel))
    formData.value.rule_name = selectedChannel ? selectedChannel.label : `渠道${formData.value.payment_channel}`
    
    submitting.value = true
    
    const url = isEdit.value 
      ? '/api/admin/payment-routing/rules/update'
      : '/api/admin/payment-routing/rules/create'
    
    const response = await $fetch(url, {
      method: 'POST',
      body: formData.value
    })
    
    if (response.code === 200) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      })
      
      dialogVisible.value = false
      await loadRules()
    } else {
      throw new Error(response.message || '操作失败')
    }
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error.message || '操作失败',
      color: 'red'
    })
  } finally {
    submitting.value = false
  }
}

const toggleRule = async (rule) => {
  try {
    const response = await $fetch('/api/admin/payment-routing/rules/toggle', {
      method: 'POST',
      body: { id: rule.id }
    })
    
    if (response.code === 200) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      })
      
      await loadRules()
    } else {
      throw new Error(response.message || '操作失败')
    }
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: error.message || '切换状态失败',
      color: 'red'
    })
  }
}

const deleteRule = async (id) => {
  if (!confirm('确定要删除这条规则吗？')) {
    return
  }
  
  try {
    const response = await $fetch('/api/admin/payment-routing/rules/delete', {
      method: 'POST',
      body: { id }
    })
    
    if (response.code === 200) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      })
      
      await loadRules()
    } else {
      throw new Error(response.message || '删除失败')
    }
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error.message || '删除规则失败',
      color: 'red'
    })
  }
}
</script>

<style scoped lang="postcss">
.payment-routing-page {
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
  @apply w-full border-collapse;
  min-width: 1000px;
}

.data-table th {
  @apply text-left p-3 border-b border-gray-200 bg-gray-50 font-semibold text-gray-900 text-sm;
}

.data-table td {
  @apply p-3 border-b border-gray-200 text-sm text-gray-700;
}

.action-buttons {
  @apply flex gap-2;
}

.settings-grid {
  @apply grid gap-4 md:grid-cols-2;
}

.instructions h4 {
  @apply font-semibold text-gray-900 mt-4 mb-2;
}

.instructions h4:first-child {
  @apply mt-0;
}

.instructions ul {
  @apply list-disc list-inside space-y-1 text-gray-700;
}

.instructions li {
  @apply text-sm;
}

@media (max-width: 768px) {
  .payment-routing-page {
    @apply p-4;
  }
  
  .page-header {
    @apply flex-col items-start gap-4;
  }
}
</style>

