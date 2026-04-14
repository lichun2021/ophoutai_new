<template>
  <div class="game-permissions-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>游戏授权管理</h2>
    </div>

    <!-- 无权限提示 -->
    <UCard v-if="!hasPermission" class="mb-4">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">🚫</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">无权限访问</h3>
        <p class="text-gray-600">只有超级管理员、1级代理和有下级代理关系的管理员可以编辑游戏权限</p>
      </div>
    </UCard>

    <!-- 权限状态卡片 -->
    <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-blue-600">{{ getLevelText(currentUserLevel) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-blue-500" />
            <span class="text-sm text-gray-600">当前权限</span>
          </div>
        </div>
      </UCard>

      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-green-600">{{ admins.length }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" class="w-4 h-4 text-green-500" />
            <span class="text-sm text-gray-600">可管理代理</span>
          </div>
        </div>
      </UCard>

      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-purple-600">{{ games.length }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-puzzle-piece" class="w-4 h-4 text-purple-500" />
            <span class="text-sm text-gray-600">游戏总数</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 筛选条件 -->
    <UCard v-if="hasPermission" class="mb-6">
      <div class="flex items-end gap-4 p-4">
        <!-- 代理名称 -->
        <UFormGroup label="代理名称" class="flex-1">
          <UInput
            v-model="searchForm.name"
            placeholder="请输入代理名称"
            icon="i-heroicons-user"
            @keyup.enter="searchAdmins"
          />
        </UFormGroup>

        <!-- 渠道代码 -->
        <UFormGroup label="渠道代码" class="flex-1">
          <UInput
            v-model="searchForm.channel_code"
            placeholder="请输入渠道代码"
            icon="i-heroicons-hashtag"
            @keyup.enter="searchAdmins"
          />
        </UFormGroup>

        <!-- 代理等级 -->
        <UFormGroup label="代理等级" class="flex-1">
          <USelect
            v-model="searchForm.level"
            :options="levelOptions"
            placeholder="选择等级"
            icon="i-heroicons-star"
          />
        </UFormGroup>

        <!-- 操作按钮 -->
        <div class="flex gap-2 shrink-0">
          <UButton 
            @click="searchAdmins" 
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

    <!-- 游戏授权列表 -->
    <UCard v-if="hasPermission" class="game-permissions-card">
      <template #header>
        <div class="card-header">
          <h3>游戏授权管理</h3>
          <UBadge color="primary" variant="subtle">
            {{ currentUserLevel === 0 ? '超级管理员' : `${currentUserLevel}级代理` }}
          </UBadge>
        </div>
      </template>

      <!-- 说明文字 -->
      <div class="permission-hint mb-6">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-500 mr-2" />
        <span class="text-sm text-gray-600">
          {{ 
            currentUserLevel === 0 ? '超级管理员可管理所有代理（1-4级），可授权所有游戏' : 
            currentUserLevel === 1 ? '1级代理可管理2级代理，只能授权自己拥有权限的游戏' : 
            currentUserLevel === 2 ? '2级代理可管理3级代理，只能授权自己拥有权限的游戏' :
            currentUserLevel === 3 ? '3级代理可管理4级代理，只能授权自己拥有权限的游戏' :
            '仅可管理直接下级代理，只能授权自己拥有权限的游戏' 
          }}
        </span>
      </div>

      <div class="table-container mobile-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>代理名称</th>
              <th>等级</th>
              <th>渠道代码</th>
              <th>已授权游戏</th>
              <th>授权数量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="admin in filteredAdmins" :key="admin.id">
              <td>{{ admin.id }}</td>
              <td>{{ admin.name }}</td>
              <td>
                <span class="level-badge" :class="getLevelClass(admin.level)">
                  {{ getLevelText(admin.level) }}
                </span>
              </td>
              <td>{{ admin.channel_code || '-' }}</td>
              <td>
                <div class="game-tags">
                  <UBadge
                    v-for="gameName in getAdminGameNames(admin)"
                    :key="gameName"
                    color="primary"
                    variant="subtle"
                    size="sm"
                    class="game-tag"
                  >
                    {{ gameName }}
                  </UBadge>
                  <span v-if="getAdminGameNames(admin).length === 0" class="no-games">
                    未授权任何游戏
                  </span>
                </div>
              </td>
              <td>
                <span class="permission-count">
                  {{ getAdminGameIds(admin).length }} / {{ games.length }}
                </span>
              </td>
              <td>
                <div class="action-buttons">
                  <UButton size="xs" color="blue" @click="editPermissions(admin)">
                    编辑权限
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 无数据提示 -->
      <div v-if="filteredAdmins.length === 0" class="no-data">
        <div class="text-center py-8">
          <div class="text-4xl mb-4">📋</div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">暂无数据</h3>
          <p class="text-gray-600">暂无可管理的代理</p>
        </div>
      </div>
    </UCard>

    <!-- 游戏权限编辑模态框 -->
    <UModal v-model="showEditModal" :ui="{ width: 'w-full max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3>编辑游戏权限 - {{ currentAdmin?.name }}</h3>
            <UBadge :color="getLevelColor(currentAdmin?.level)" variant="subtle">
              Level {{ currentAdmin?.level }}
            </UBadge>
          </div>
        </template>

        <div v-if="currentAdmin" class="space-y-4">
          <!-- 代理信息 -->
          <div class="admin-info">
            <div class="info-grid">
              <div class="info-item">
                <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400 mr-2" />
                <span class="text-sm text-gray-600">代理名称：</span>
                <span class="text-sm font-medium">{{ currentAdmin.name }}</span>
              </div>
              <div class="info-item">
                <UIcon name="i-heroicons-hashtag" class="w-4 h-4 text-gray-400 mr-2" />
                <span class="text-sm text-gray-600">渠道代码：</span>
                <UBadge color="gray" variant="subtle" size="sm">
                  {{ currentAdmin.channel_code || '无渠道' }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- 权限说明 -->
          <div v-if="currentUserLevel !== 0" class="permission-notice">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-amber-500 mr-2" />
            <span class="text-sm text-gray-600">
              您只能从自己拥有权限的游戏中选择授权给下级（共{{ availableGames.length }}款游戏）
            </span>
          </div>
          <div v-else class="permission-notice">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
            <span class="text-sm text-gray-600">
              作为超级管理员，您可以任意授权所有游戏（共{{ availableGames.length }}款游戏）
            </span>
          </div>

          <!-- 操作按钮 -->
          <div class="permission-actions">
            <UButton
              @click="selectAllGames"
              size="sm"
              color="blue"
              variant="ghost"
              icon="i-heroicons-check-circle"
            >
              全选
            </UButton>
            <UButton
              @click="clearAllGames"
              size="sm"
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-circle"
            >
              清空
            </UButton>
          </div>

          <!-- 游戏列表 -->
          <div class="games-grid">
            <div
              v-for="game in availableGames"
              :key="game.id"
              class="game-item"
              :class="{
                'selected': selectedGames.includes(game.id),
                'disabled': !game.is_active
              }"
            >
              <UCheckbox
                :model-value="selectedGames.includes(game.id)"
                @update:model-value="(checked) => toggleGame(game.id, checked)"
                :disabled="!game.is_active || loading"
                class="game-checkbox"
              />
              <div class="game-info">
                <div class="game-name">
                  {{ game.game_name }}
                </div>
                <div class="game-code">
                  {{ game.game_code }}
                </div>
                <UBadge
                  v-if="!game.is_active"
                  color="red"
                  variant="subtle"
                  size="sm"
                  class="status-badge"
                >
                  已下架
                </UBadge>
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="modal-actions">
            <UButton
              @click="resetPermissions"
              color="gray"
              variant="outline"
              icon="i-heroicons-arrow-uturn-left"
              :disabled="loading"
            >
              重置
            </UButton>
            <UButton
              @click="closeModal"
              color="gray"
              variant="outline"
            >
              取消
            </UButton>
            <UButton
              @click="savePermissions"
              color="primary"
              icon="i-heroicons-check"
              :loading="loading"
              :disabled="!hasChanges"
            >
              {{ loading ? '保存中...' : '保存权限' }}
            </UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- 消息通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '~/store/auth'

// 页面标题
const authStore = useAuthStore()

// 响应式数据
const hasPermission = ref(false)
const admins = ref([])
const games = ref([])
const selectedGames = ref([])
const originalGames = ref([])
const loading = ref(false)
const currentUserLevel = ref(0)
const currentAdmin = ref(null)
const showEditModal = ref(false)
const currentUserGameIds = ref([])

// 搜索表单
const searchForm = ref({
  name: '',
  channel_code: '',
  level: ''
})

// Toast通知
const toast = useToast()

// 等级选项
const levelOptions = [
  { label: '全部等级', value: '' },
  { label: '一级代理', value: 1 },
  { label: '二级代理', value: 2 },
  { label: '三级代理', value: 3 },
  { label: '四级代理', value: 4 }
]

// 计算属性
const hasChanges = computed(() => {
  const currentGameIds = getAdminGameIds(currentAdmin.value)
  if (currentGameIds.length !== selectedGames.value.length) {
    return true
  }
  
  const sorted1 = [...currentGameIds].sort()
  const sorted2 = [...selectedGames.value].sort()
  
  return !sorted1.every((id, index) => id === sorted2[index])
})

const availableGames = computed(() => {
  // 只有超级管理员可以任意授权所有游戏
  if (currentUserLevel.value === 0) {
    return games.value
  }
  
  // 1级代理和其他等级都只能从自己有权限的游戏中选择
  return games.value.filter(game => currentUserGameIds.value.includes(game.id))
})

const filteredAdmins = computed(() => {
  let filtered = admins.value

  if (searchForm.value.name) {
    filtered = filtered.filter(admin => 
      admin.name.toLowerCase().includes(searchForm.value.name.toLowerCase())
    )
  }

  if (searchForm.value.channel_code) {
    filtered = filtered.filter(admin => 
      admin.channel_code && admin.channel_code.toLowerCase().includes(searchForm.value.channel_code.toLowerCase())
    )
  }

  if (searchForm.value.level !== '') {
    filtered = filtered.filter(admin => admin.level === parseInt(searchForm.value.level))
  }

  return filtered
})

// 工具函数
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

const getLevelClass = (level) => {
  const classMap = {
    0: 'super',
    1: 'level-1',
    2: 'level-2',
    3: 'level-3',
    4: 'level-4'
  }
  return classMap[level] || 'default'
}

const getLevelColor = (level) => {
  const colors = {
    0: 'red',
    1: 'orange', 
    2: 'yellow',
    3: 'gray',
    4: 'gray'
  }
  return colors[level] || 'gray'
}

const getAdminGameIds = (admin) => {
  if (!admin) return []
  const gameIds = admin.allowed_game_ids || []
  return Array.isArray(gameIds) ? gameIds : JSON.parse(gameIds || '[]')
}

const getAdminGameNames = (admin) => {
  const gameIds = getAdminGameIds(admin)
  return games.value
    .filter(game => gameIds.includes(game.id))
    .map(game => game.game_name)
}

// 检查权限
const checkPermission = async () => {
  try {
    // 从认证store获取当前管理员ID
    const adminId = authStore.id
    
    if (!adminId || adminId === 0) {
      console.error('未找到有效的管理员ID')
      hasPermission.value = false
      return
    }
    
    // 获取当前用户级别和游戏权限
    const adminInfo = await $fetch('/api/admin/list', {
      query: {
        admin_id: authStore.id // 传递当前管理员ID用于权限过滤
      }
    })
    const current = adminInfo.data.find(a => a.id == adminId)
    if (current) {
      currentUserLevel.value = current.level
      
      // 获取当前用户的游戏权限
      const userGameIds = getAdminGameIds(current)
      currentUserGameIds.value = userGameIds
      
      // 权限控制：0级和1级可以编辑，其他级别需要有下级才能编辑
      if (current.level === 0 || current.level === 1) {
        hasPermission.value = true
      } else {
        // 检查是否有直接下级
        const response = await $fetch('/api/admin/check-edit-permission', {
          method: 'POST',
          body: { admin_id: parseInt(adminId) }
        })
        hasPermission.value = response.data.can_edit
      }
    } else {
      console.error('未找到对应的管理员信息')
      hasPermission.value = false
    }
  } catch (error) {
    console.error('权限检查失败:', error)
    hasPermission.value = false
  }
}

// 加载可管理的代理
const loadAdmins = async () => {
  try {
    // 从认证store获取当前管理员ID
    const adminId = authStore.id
    
    if (!adminId || adminId === 0) {
      console.error('未找到有效的管理员ID')
      admins.value = []
      return
    }
    
    // 统一使用 manageable-admins API 获取直接下级
    const manageableResponse = await $fetch('/api/admin/manageable-admins', {
      method: 'POST',
      body: { admin_id: parseInt(adminId) }
    })
    
    if (manageableResponse && manageableResponse.data) {
      admins.value = manageableResponse.data
    } else {
      admins.value = []
    }
  } catch (error) {
    console.error('加载代理列表失败:', error)
    toast.add({
      title: '错误',
      description: '加载代理列表失败',
      color: 'red'
    })
    admins.value = []
  }
}

// 加载游戏列表
const loadGames = async () => {
  try {
    const response = await $fetch('/api/admin/games')
    if (response.success) {
      games.value = response.data
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: '加载游戏列表失败',
      color: 'red'
    })
  }
}

// 编辑权限
const editPermissions = (admin) => {
  currentAdmin.value = admin
  const gameIds = getAdminGameIds(admin)
  selectedGames.value = [...gameIds]
  originalGames.value = [...gameIds]
  showEditModal.value = true
}

// 切换游戏选择
const toggleGame = (gameId, checked) => {
  if (checked) {
    if (!selectedGames.value.includes(gameId)) {
      selectedGames.value.push(gameId)
    }
  } else {
    selectedGames.value = selectedGames.value.filter(id => id !== gameId)
  }
}

// 全选游戏
const selectAllGames = () => {
  selectedGames.value = availableGames.value.filter(game => game.is_active).map(game => game.id)
}

// 清空游戏
const clearAllGames = () => {
  selectedGames.value = []
}

// 保存权限
const savePermissions = async () => {
  loading.value = true
  try {
    const response = await $fetch('/api/admin/update-game-permissions', {
      method: 'POST',
      body: {
        admin_id: parseInt(currentAdmin.value.id),
        game_ids: selectedGames.value
      }
    })
    
    if (response.success) {
      // 更新本地管理员数据
      const admin = admins.value.find(a => a.id == currentAdmin.value.id)
      if (admin) {
        admin.allowed_game_ids = selectedGames.value
      }
      
      originalGames.value = [...selectedGames.value]
      
      toast.add({
        title: '成功',
        description: response.message || '游戏权限更新成功',
        color: 'green'
      })
      
      // 重新加载所有管理员数据，确保UI显示最新的权限状态
      await loadAdmins()
      
      closeModal()
    } else {
      toast.add({
        title: '错误',
        description: response.message || '更新失败',
        color: 'red'
      })
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: '更新失败',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

// 重置权限
const resetPermissions = () => {
  selectedGames.value = [...originalGames.value]
}

// 关闭模态框
const closeModal = () => {
  showEditModal.value = false
  currentAdmin.value = null
  selectedGames.value = []
  originalGames.value = []
}

// 搜索功能
const searchAdmins = () => {
  // 搜索由 computed 属性 filteredAdmins 处理
}

const resetSearch = () => {
  searchForm.value = {
    name: '',
    channel_code: '',
    level: ''
  }
}

onMounted(async () => {
  // 确保authStore已初始化
  authStore.init()
  
  // 打印调试信息
  console.log('当前authStore状态:', {
    id: authStore.id,
    isLoggedIn: authStore.isLoggedIn,
    isUser: authStore.isUser,
    name: authStore.name
  })
  
  await checkPermission()
  if (hasPermission.value) {
    await Promise.all([loadAdmins(), loadGames()])
  }
})
</script>

<style scoped>
.game-permissions-page {
  width: 100%;
  max-width: 100%;
  margin: 0;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.operation-area {
  margin-bottom: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.operation-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-input {
  min-width: 200px;
  flex: 1;
}

.operation-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  align-items: center;
}

.permission-hint {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 0.5rem;
}

.table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
}

.data-table th {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.75rem;
  text-align: center;
  font-weight: 600;
  color: #374151;
  font-size: 0.875rem;
}

.data-table td {
  border: 1px solid #e2e8f0;
  padding: 0.75rem;
  text-align: center;
  vertical-align: middle;
  font-size: 0.875rem;
}

.level-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.level-badge.super { background: #fee2e2; color: #991b1b; }
.level-badge.level-1 { background: #fed7aa; color: #c2410c; }
.level-badge.level-2 { background: #fef3c7; color: #d97706; }
.level-badge.level-3 { background: #f3f4f6; color: #374151; }
.level-badge.level-4 { background: #f3f4f6; color: #6b7280; }

.game-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: center;
  max-width: 200px;
  margin: 0 auto;
}

.game-tag {
  font-size: 0.75rem !important;
}

.no-games {
  color: #9ca3af;
  font-style: italic;
  font-size: 0.75rem;
}

.permission-count {
  font-weight: 600;
  color: #059669;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.no-data {
  border-top: 1px solid #e5e7eb;
}

/* 模态框样式 */
.admin-info {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.info-item {
  display: flex;
  align-items: center;
}

.permission-notice {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.permission-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.game-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: white;
  transition: all 0.2s;
}

.game-item:hover {
  border-color: #d1d5db;
}

.game-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.game-item.disabled {
  opacity: 0.5;
  background: #f9fafb;
}

.game-checkbox {
  margin-right: 0.75rem;
}

.game-info {
  flex: 1;
  text-align: left;
}

.game-name {
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.game-code {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.status-badge {
  margin-top: 0.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .operation-row {
    flex-direction: column;
  }
  
  .operation-buttons {
    justify-content: stretch;
  }
  
  .operation-buttons button {
    flex: 1;
  }
  
  .search-input {
    min-width: auto;
  }
  
  .games-grid {
    grid-template-columns: 1fr;
  }
  
  .game-tags {
    max-width: 150px;
  }
}
</style> 