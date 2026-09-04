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

      <div v-if="loading" class="py-8 text-center text-gray-400">加载中...</div>
      <div v-else-if="ranking.list.length === 0" class="py-8 text-center text-gray-400">该区间暂无充值排行数据</div>
      <div v-else class="overflow-auto">
        <table class="w-full table-auto text-sm">
          <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
            <tr>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from '#imports'

definePageMeta({
  layout: 'default'
})

const toast = useToast()

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

onMounted(() => {
  loadRanking(1)
})
</script>

<style scoped>
.player-recharge-page {
  padding: 0;
}
</style>
