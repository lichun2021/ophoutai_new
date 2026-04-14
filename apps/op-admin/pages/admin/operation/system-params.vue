<template>
  <div class="system-params-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>系统参数管理</h2>
      <div class="header-actions" v-if="isSuperAdmin">
        <UButton
          color="primary"
          icon="i-heroicons-plus"
          @click="showAddDialog"
        >
          添加参数
        </UButton>
      </div>
    </div>

    <!-- 无权限提示 -->
    <UCard v-if="!isSuperAdmin" class="mb-4">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">🚫</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">无权限访问</h3>
        <p class="text-gray-600">只有超级管理员可以管理系统参数</p>
      </div>
    </UCard>

    <!-- 数据表格 -->
    <UCard v-else class="system-params-table-card">
      <template #header>
        <div class="card-header">
          <h3>系统参数列表</h3>
          <UBadge color="primary" variant="subtle">
            共 {{ systemParams.length }} 个参数
          </UBadge>
        </div>
      </template>

      <div class="table-container mobile-table-wrapper" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-id">ID</th>
              <th class="col-key">参数键</th>
              <th class="col-content">参数值</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="param in systemParams" :key="param.id">
              <td class="col-id">{{ param.id }}</td>
              <td class="col-key">
                <UBadge 
                  color="blue" 
                  variant="subtle"
                  size="sm"
                >
                  {{ param.key }}
                </UBadge>
              </td>
              <td class="col-content">
                <span 
                  class="truncate-text" 
                  :title="param.content"
                >
                  {{ param.content }}
                </span>
              </td>
              <td class="col-actions">
                <div class="action-buttons">
                  <UButton
                    size="xs"
                    color="blue"
                    variant="outline"
                    @click="editSystemParam(param)"
                  >
                    编辑
                  </UButton>
                  <UButton
                    size="xs"
                    color="red"
                    variant="outline"
                    @click="deleteSystemParam(param.key)"
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
      <div v-if="!loading && systemParams.length === 0" class="no-data">
        <div class="text-center py-8">
          <div class="text-4xl mb-4">⚙️</div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">暂无数据</h3>
          <p class="text-gray-600">暂无系统参数配置</p>
        </div>
      </div>
    </UCard>

    <!-- 添加/编辑对话框 -->
    <UModal v-model="dialogVisible" :ui="{ width: 'w-full max-w-3xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3>{{ isEdit ? '编辑系统参数' : '添加系统参数' }}</h3>
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="参数键" required>
            <UInput
              v-model="formData.key"
              placeholder="请输入参数键，如：payment_message"
              icon="i-heroicons-key"
              :disabled="isEdit"
            />
            <template #hint>
              <span class="text-xs text-gray-500">
                参数键用于标识参数，创建后不可修改
              </span>
            </template>
          </UFormGroup>

          <UFormGroup label="参数值" required>
            <UTextarea
              v-model="formData.content"
              placeholder="请输入参数值"
              :rows="6"
              maxlength="2000"
              resize
            />
            <template #hint>
              <span class="text-xs text-gray-500">
                最多2000个字符，支持换行
              </span>
            </template>
          </UFormGroup>

          <!-- 预览区域 -->
          <div class="param-preview" v-if="formData.content">
            <h4 class="text-sm font-semibold text-gray-700 mb-2">参数值预览：</h4>
            <div class="preview-content">
              {{ formData.content }}
            </div>
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
const systemParams = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)

// 表单数据
const formData = ref({
  key: '',
  content: ''
})

// 计算属性
const isSuperAdmin = computed(() => {
  const permissions = authStore.permissions
  return permissions && permissions.level === 0
})

// 页面生命周期
onMounted(() => {
  if (!isSuperAdmin.value) {
    toast.add({
      title: '无权限访问',
      description: '只有超级管理员可以管理系统参数',
      color: 'red'
    })
    navigateTo('/admin')
    return
  }
  loadSystemParams()
})

// 加载系统参数列表
const loadSystemParams = async () => {
  try {
    loading.value = true
    const response = await $fetch('/api/admin/system-params')
    systemParams.value = response.data || []
  } catch (error) {
    toast.add({
      title: '加载失败',
      description: error.message || '加载系统参数失败',
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
    key: '',
    content: ''
  }
  dialogVisible.value = true
}

// 编辑系统参数
const editSystemParam = (param) => {
  isEdit.value = true
  formData.value = { ...param }
  dialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  try {
    // 表单验证
    if (!formData.value.key) {
      toast.add({
        title: '验证失败',
        description: '请输入参数键',
        color: 'red'
      })
      return
    }

    if (!formData.value.content) {
      toast.add({
        title: '验证失败',
        description: '请输入参数值',
        color: 'red'
      })
      return
    }

    // 参数键格式验证
    if (!/^[a-zA-Z0-9_-]+$/.test(formData.value.key)) {
      toast.add({
        title: '验证失败',
        description: '参数键只能包含字母、数字、下划线和横线',
        color: 'red'
      })
      return
    }

    loading.value = true
    
    const url = isEdit.value ? '/api/admin/system-params/update' : '/api/admin/system-params/create'
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
    loadSystemParams()
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

// 删除系统参数
const deleteSystemParam = async (key) => {
  try {
    // 重要参数确认
    const isImportantParam = ['payment_message', 'app_config', 'system_config'].includes(key)
    const confirmMessage = isImportantParam 
      ? `确定要删除重要参数 "${key}" 吗？这可能影响系统功能！`
      : `确定要删除参数 "${key}" 吗？`
    
    if (!confirm(confirmMessage)) {
      return
    }

    loading.value = true
    
    await $fetch(`/api/admin/system-params/delete/${key}`, {
      method: 'DELETE'
    })
    
    toast.add({
      title: '删除成功',
      description: '系统参数已删除',
      color: 'green'
    })
    
    loadSystemParams()
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
</script>

<style scoped>
.system-params-page {
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
  @apply w-full border-collapse table-fixed;
}

.data-table th {
  @apply text-left p-3 border-b border-gray-200 bg-gray-50 font-semibold text-gray-900 text-sm;
}

.data-table td {
  @apply p-3 border-b border-gray-200 text-sm text-gray-700;
}

/* 列宽定义 */
.col-id {
  width: 80px;
  min-width: 80px;
}

.col-key {
  width: 200px;
  min-width: 200px;
}

.col-content {
  width: 400px;
  min-width: 400px;
}

.col-actions {
  width: 120px;
  min-width: 120px;
}

/* 文本截断样式 */
.truncate-text {
  @apply block max-w-full;
  cursor: help;
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
  max-height: 4.2em; /* 3行文字 */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.truncate-text:hover {
  @apply text-blue-600;
}

/* 移动端表格优化 */
@media (max-width: 768px) {
  .data-table {
    min-width: 800px;
  }
  
  .col-content {
    width: 300px;
    min-width: 300px;
  }
  
  .truncate-text {
    font-size: 12px;
    max-height: 3.6em;
    -webkit-line-clamp: 2;
  }
}

.action-buttons {
  @apply flex gap-2;
}

.loading-state,
.no-data {
  @apply py-8;
}

.param-preview {
  @apply mt-4;
}

.preview-content {
  @apply mt-2 p-3 bg-gray-50 border rounded-lg text-sm text-gray-700 whitespace-pre-line min-h-[60px] max-h-[200px] overflow-y-auto;
}
</style> 