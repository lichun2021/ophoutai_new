<template>
  <div class="player-recharge-page">
    <UCard class="mb-6">
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">玩家充值排行榜</h2>
            <p class="text-sm text-gray-500">真实充值(不含平台币支付)按金额排名，默认展示总榜前10名</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <UButton
              v-for="tab in periodTabs"
              :key="tab.value"
              size="sm"
              :color="period === tab.value ? 'primary' : 'gray'"
              :variant="period === tab.value ? 'solid' : 'outline'"
              @click="selectPeriod(tab.value)"
            >
              {{ tab.label }}
            </UButton>
          </div>
        </div>
      </template>

      <!-- 自定义区间选择 -->
      <div v-if="period === 'custom'" class="flex items-center gap-2 flex-wrap mb-4">
        <UInput v-model="customStart" type="date" :max="customEnd || todayChina" class="w-44" />
        <span class="text-gray-400 text-sm">至</span>
        <UInput v-model="customEnd" type="date" :min="customStart" :max="todayChina" class="w-44" />
        <UButton
          size="sm"
          color="primary"
          icon="i-heroicons-magnifying-glass"
          :loading="loading"
          :disabled="!customStart || !customEnd"
          @click="() => loadRanking(1)"
        >
          查询
        </UButton>
      </div>

      <!-- 按用户ID定位 -->
      <div class="flex items-center gap-2 flex-wrap mb-4">
        <UInput
          v-model="focusUserInput"
          placeholder="按用户ID/用户名/角色ID/子账号ID 定位排名"
          type="text"
          class="w-64"
          @keyup.enter="handleFocusSearch"
        />
        <UButton
          size="sm"
          color="violet"
          variant="outline"
          icon="i-heroicons-magnifying-glass"
          :loading="loading"
          @click="handleFocusSearch"
        >
          定位
        </UButton>
        <UButton
          v-if="focusUserInput"
          size="sm"
          color="gray"
          variant="ghost"
          icon="i-heroicons-x-mark"
          @click="clearFocus"
        >
          清除
        </UButton>
      </div>

      <div v-if="ranking.focus_user_id" class="mb-4 rounded-lg px-4 py-3 text-sm" :class="ranking.focus_rank ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-500'">
        <template v-if="ranking.focus_rank">
          该玩家在当前区间排名第 <span class="font-bold">{{ ranking.focus_rank }}</span> 名，已自动跳转到对应页码
        </template>
        <template v-else>
          该玩家在当前区间暂无真实充值记录，未上榜
        </template>
      </div>

      <!-- 区间信息 -->
      <div class="text-sm text-gray-500 mb-3">
        统计区间：<span class="font-medium text-gray-700">{{ ranking.start_date ? `${ranking.start_date} ~ ${ranking.end_date}` : '不限时间(总榜)' }}</span>
        <span class="mx-2">·</span>
        上榜人数：<span class="font-medium text-gray-700">{{ ranking.pagination.total }}</span>
      </div>

      <!-- 每页条数 -->
      <div class="flex items-center justify-end gap-2 mb-2">
        <span class="text-xs text-gray-500">每页</span>
        <USelectMenu
          v-model="pageSize"
          :options="[10, 20, 50, 100]"
          class="w-20"
          @update:model-value="() => loadRanking(1)"
        />
        <span class="text-xs text-gray-500">条</span>
      </div>

      <!-- 批量发送金币(平台币)工具栏，仅超级管理员可见 -->
      <div v-if="isSuperAdmin" class="flex items-center justify-between flex-wrap gap-2 mb-3 rounded-lg bg-gray-50 px-3 py-2">
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <span>可用平台币：<span class="font-semibold text-blue-600">{{ formatCurrency(balance.available_platform_coins) }}</span></span>
          <UBadge v-if="selectedPlayers.length > 0" color="primary" variant="soft">已选 {{ selectedPlayers.length }} 人</UBadge>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="gray"
            variant="outline"
            size="sm"
            @click="toggleSelectPage(!isPageAllSelected)"
          >
            {{ isPageAllSelected ? '取消全选本页' : '全选本页' }}
          </UButton>
          <UButton
            color="primary"
            icon="i-heroicons-banknotes"
            size="sm"
            :disabled="selectedPlayers.length === 0"
            @click="openBatchModal"
          >
            批量发送金币
          </UButton>
          <UButton
            v-if="selectedPlayers.length > 0"
            color="gray"
            variant="soft"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="clearSelection"
          >
            清空选择
          </UButton>
        </div>
      </div>

      <div v-if="loading" class="py-8 text-center text-gray-400">加载中...</div>
      <div v-else-if="ranking.list.length === 0" class="py-8 text-center text-gray-400">该区间暂无充值排行数据</div>
      <div v-else class="overflow-auto">
        <table class="w-full table-auto text-sm">
          <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
            <tr>
              <th v-if="isSuperAdmin" class="px-3 py-2 text-center w-10">
                <UCheckbox
                  :model-value="isPageAllSelected"
                  @update:model-value="toggleSelectPage"
                />
              </th>
              <th class="px-3 py-2 text-center">排名</th>
              <th class="px-3 py-2 text-left">用户ID</th>
              <th class="px-3 py-2 text-left">用户名</th>
              <th class="px-3 py-2 text-right">累计充值</th>
              <th class="px-3 py-2 text-right">充值笔数</th>
              <th class="px-3 py-2 text-left">角色 / 区服</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="item in ranking.list"
              :key="item.user_id"
              class="hover:bg-gray-50 transition"
              :class="{ 'bg-violet-50': item.is_focus }"
            >
              <td v-if="isSuperAdmin" class="px-3 py-2 text-center">
                <UCheckbox
                  :model-value="isSelected(item.user_id)"
                  @update:model-value="(val) => toggleSelect(item, val)"
                />
              </td>
              <td class="px-3 py-2 text-center">
                <UBadge :color="rankColor(item.rank)" variant="subtle">{{ item.rank }}</UBadge>
              </td>
              <td class="px-3 py-2 text-gray-500 font-mono">{{ item.user_id }}</td>
              <td class="px-3 py-2 font-semibold text-gray-900">{{ item.username }}</td>
              <td class="px-3 py-2 text-right font-bold text-emerald-600">¥{{ formatCurrency(item.total_amount) }}</td>
              <td class="px-3 py-2 text-right text-gray-600">{{ item.recharge_count }}</td>
              <td class="px-3 py-2">
                <div v-if="item.characters.length === 0" class="text-gray-400 text-xs">暂无角色</div>
                <div v-else class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="ch in item.characters"
                    :key="ch.uuid"
                    color="blue"
                    variant="subtle"
                    size="xs"
                  >
                    {{ ch.character_name || '未知角色' }} · {{ ch.server_name || ch.server_id || '未知区服' }}
                  </UBadge>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="ranking.pagination.total > ranking.pagination.pageSize" class="flex justify-end mt-4">
        <UPagination
          v-model="page"
          :page-count="ranking.pagination.pageSize"
          :total="ranking.pagination.total"
          @update:model-value="(p) => loadRanking(p)"
        />
      </div>
    </UCard>

    <!-- 批量发送金币(平台币)对话框 -->
    <UModal v-model="batchModal.show" :prevent-close="batchModal.loading">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">批量发送金币（平台币）</h3>
        </template>

        <div class="space-y-4">
          <div class="rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-700">
            将向以下 <span class="font-bold">{{ selectedPlayers.length }}</span> 名玩家各发送相同金额：
            <div class="mt-1 flex flex-wrap gap-1">
              <UBadge v-for="p in selectedPlayers" :key="p.user_id" color="violet" variant="subtle" size="xs">
                {{ p.username }}（{{ p.user_id }}）
              </UBadge>
            </div>
          </div>

          <UFormGroup label="每人发送金额" required>
            <UInput
              v-model="batchModal.amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="请输入发送金额"
              :disabled="batchModal.loading"
            />
          </UFormGroup>

          <UFormGroup label="备注">
            <UInput
              v-model="batchModal.remark"
              placeholder="备注（可选）"
              :disabled="batchModal.loading"
            />
          </UFormGroup>

          <div v-if="batchModal.loading && sendProgress.total > 0" class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="font-semibold text-blue-900">发送进度</span>
                <span class="text-blue-700">{{ sendProgress.current }} / {{ sendProgress.total }}</span>
              </div>
              <UProgress
                :value="(sendProgress.current / sendProgress.total) * 100"
                color="blue"
              />
              <div class="flex gap-4 text-xs text-gray-600">
                <span>✅ 成功：{{ sendProgress.success }}</span>
                <span>❌ 失败：{{ sendProgress.failed }}</span>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" :disabled="batchModal.loading" @click="batchModal.show = false">取消</UButton>
            <UButton
              color="primary"
              :loading="batchModal.loading"
              :disabled="!isBatchFormValid"
              @click="confirmBatchSend"
            >
              确认发送
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'
import { useAuthStore } from '~/store/auth'

definePageMeta({
  layout: 'default'
})

const toast = useToast()
const authStore = useAuthStore()

const currentAdminLevel = computed(() => {
  if (authStore.isUser) return authStore.userInfo?.level ?? 99
  return authStore.permissions?.level ?? 99
})
const isSuperAdmin = computed(() => !authStore.isUser && currentAdminLevel.value === 0)
const currentChannelCode = computed(() => authStore.permissions?.channel_code || '')

const periodTabs = [
  { label: '总榜', value: 'all' },
  { label: '今日', value: 'today' },
  { label: '近3日', value: '3' },
  { label: '近7日', value: '7' },
  { label: '自定义', value: 'custom' },
]
const period = ref('all')
const todayChina = new Date().toISOString().slice(0, 10)
const customStart = ref(todayChina)
const customEnd = ref(todayChina)

const focusUserInput = ref('')
const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const ranking = ref({
  period: 'all',
  start_date: null,
  end_date: null,
  focus_user_id: null,
  focus_rank: null,
  list: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
})

const selectPeriod = (value) => {
  period.value = value
  if (value !== 'custom') loadRanking(1)
}

const handleFocusSearch = () => {
  loadRanking(1)
}

const clearFocus = () => {
  focusUserInput.value = ''
  loadRanking(1)
}

const loadRanking = async (targetPage) => {
  if (period.value === 'custom' && (!customStart.value || !customEnd.value)) return
  if (period.value === 'custom' && customStart.value > customEnd.value) {
    toast.add({ title: '开始日期不能晚于结束日期', color: 'red' })
    return
  }

  page.value = targetPage || 1
  loading.value = true
  try {
    const query = {
      period: period.value,
      page: page.value,
      pageSize: pageSize.value,
    }
    if (period.value === 'custom') {
      query.start_date = customStart.value
      query.end_date = customEnd.value
    }
    const keyword = (focusUserInput.value || '').toString().trim()
    if (keyword) {
      query.user_id = keyword
    }
    const response = await $fetch('/api/admin/player/recharge-ranking', { query })
    if (response.code === 200) {
      ranking.value = response.data
      page.value = response.data.pagination.page
    } else {
      toast.add({ title: response.message || '获取排行榜失败', color: 'red' })
    }
  } catch (error) {
    toast.add({
      title: '查询失败',
      description: error.data?.message || error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

const rankColor = (rank) => {
  if (rank === 1) return 'yellow'
  if (rank === 2) return 'gray'
  if (rank === 3) return 'orange'
  return 'blue'
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '0.00'
  return Number(value).toFixed(2)
}

// ==================== 批量发送金币(平台币) ====================
// 仅超级管理员可见/可用：直接使用当前登录态（authStore）调用发放接口，无需二次登录校验

// 代理可用平台币余额（发送前展示与校验，避免超额发送）
const balance = ref({ platform_coins: 0, available_platform_coins: 0 })
const loadBalance = async () => {
  if (!currentChannelCode.value) return
  try {
    const response = await $fetch('/api/admin/platform-coin-balance', {
      method: 'POST',
      body: { channel_code: currentChannelCode.value }
    })
    if (response.success) balance.value = response.data
  } catch (error) {
    console.error('加载余额失败:', error)
  }
}

// 多选：跨分页保留选中的玩家（记录 user_id + username 用于弹窗展示）
const selectedPlayers = ref([])
const isSelected = (userId) => selectedPlayers.value.some(p => p.user_id === userId)

const toggleSelect = (item, checked) => {
  if (checked) {
    if (!isSelected(item.user_id)) {
      selectedPlayers.value.push({ user_id: item.user_id, username: item.username })
    }
  } else {
    selectedPlayers.value = selectedPlayers.value.filter(p => p.user_id !== item.user_id)
  }
}

const clearSelection = () => {
  selectedPlayers.value = []
}

const isPageAllSelected = computed(() => {
  return ranking.value.list.length > 0 && ranking.value.list.every(item => isSelected(item.user_id))
})

const toggleSelectPage = (checked) => {
  if (checked) {
    ranking.value.list.forEach(item => {
      if (!isSelected(item.user_id)) {
        selectedPlayers.value.push({ user_id: item.user_id, username: item.username })
      }
    })
  } else {
    const pageIds = new Set(ranking.value.list.map(item => item.user_id))
    selectedPlayers.value = selectedPlayers.value.filter(p => !pageIds.has(p.user_id))
  }
}

const batchModal = ref({ show: false, amount: '', remark: '', loading: false })
const sendProgress = ref({ current: 0, total: 0, success: 0, failed: 0 })

const isBatchFormValid = computed(() => {
  const amount = parseFloat(batchModal.value.amount)
  return selectedPlayers.value.length > 0 && !isNaN(amount) && amount > 0
})

const openBatchModal = () => {
  if (selectedPlayers.value.length === 0) return
  batchModal.value = { show: true, amount: '', remark: '', loading: false }
  sendProgress.value = { current: 0, total: 0, success: 0, failed: 0 }
}

const confirmBatchSend = async () => {
  const amount = parseFloat(batchModal.value.amount)
  if (isNaN(amount) || amount <= 0) {
    toast.add({ title: '请输入有效的发送金额', color: 'red' })
    return
  }

  const targets = selectedPlayers.value
  if (targets.length === 0) return

  const totalNeeded = amount * targets.length
  if (totalNeeded > balance.value.available_platform_coins) {
    toast.add({
      title: '代理可用余额不足',
      description: `本次共需 ${formatCurrency(totalNeeded)}，当前可用 ${formatCurrency(balance.value.available_platform_coins)}`,
      color: 'red'
    })
    return
  }

  batchModal.value.loading = true
  sendProgress.value = { current: 0, total: targets.length, success: 0, failed: 0 }

  try {
    // 逐个发送，间隔 20ms，避免瞬时并发过高
    for (let i = 0; i < targets.length; i++) {
      const player = targets[i]
      try {
        await $fetch('/api/admin/transfer-to-player', {
          method: 'POST',
          body: {
            admin_channel_code: currentChannelCode.value,
            user_id: player.user_id,
            amount,
            remark: batchModal.value.remark || '充值排行榜批量发放',
            operator_channel_code: currentChannelCode.value
          }
        })
        sendProgress.value.success++
      } catch (error) {
        console.error(`发送失败 [${player.user_id}]:`, error)
        sendProgress.value.failed++
      }
      sendProgress.value.current++

      if (i < targets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }

    toast.add({
      title: '批量发送完成',
      description: `成功 ${sendProgress.value.success} 人，失败 ${sendProgress.value.failed} 人`,
      color: sendProgress.value.failed > 0 ? 'amber' : 'green'
    })

    batchModal.value.show = false
    clearSelection()
    await loadBalance()
  } finally {
    batchModal.value.loading = false
  }
}

onMounted(() => {
  loadRanking(1)
  if (isSuperAdmin.value) loadBalance()
})
</script>

<style scoped>
.player-recharge-page {
  padding: 0;
}
</style>
