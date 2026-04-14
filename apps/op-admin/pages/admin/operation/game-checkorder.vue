<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">游戏实际到账查询</h1>
      <div class="text-sm text-gray-600">参照GM后台风格，按服务器、玩家ID与时间范围查询</div>
    </div>

    <!-- 服务器选择 -->
    <div class="mb-6">
      <UCard>
        <div class="flex flex-wrap items-end gap-4">
          <UFormGroup label="选择服务器">
            <USelectMenu
              v-model="selectedServer"
              :options="serverOptions"
              placeholder="请选择游戏服务器"
              value-attribute="value"
              option-attribute="label"
              class="w-64"
              :loading="loadingServers"
            />
          </UFormGroup>

          <UFormGroup label="玩家ID">
            <UInput
              v-model="filters.playerId"
              placeholder="输入玩家ID"
              icon="i-heroicons-user"
              class="w-64"
            />
          </UFormGroup>

          <UFormGroup label="时间区间">
            <UPopover :popper="{ placement: 'bottom-start' }">
              <UButton 
                variant="outline" 
                icon="i-heroicons-calendar-days"
                class="w-64 justify-start"
              >
                {{ formatDateRange(filters.startDate, filters.endDate) }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex divide-x divide-gray-200 dark:divide-gray-800">
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
                  <DatePicker v-model="selected" @close="close" />
                </div>
              </template>
            </UPopover>
          </UFormGroup>

          <div class="flex items-end gap-2 pb-1">
            <UButton :loading="loading" icon="i-heroicons-magnifying-glass" @click="loadData">
              查询
            </UButton>
            <UButton variant="ghost" icon="i-heroicons-arrow-path" @click="resetFilters">重置</UButton>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 表格 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">充值到账记录</h3>
            <UBadge v-if="rows.length > 0" :label="`${rows.length} 条记录`" variant="soft" size="xs" />
          </div>
          <div class="text-xs text-gray-600" v-if="selectedServer">
            当前服务器：{{ serverOptions.find(s => s.value === selectedServer)?.label || '-' }}
          </div>
        </div>
      </template>

      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-500 animate-spin" />
        <p class="mt-2 text-gray-600">正在加载数据...</p>
      </div>
      <div v-else>
        <UTable
          :rows="rows"
          :columns="columns"
          :ui="{ td: { padding: 'py-2 px-3' } }"
          :empty-state="{ icon: 'i-heroicons-document', label: '暂无数据' }"
        >
          <template #goodsId-data="{ row }">
            <span :title="row.goodsId">{{ getGoodsName(row.goodsId) }}</span>
          </template>
          <template #payMoney-data="{ row }">
            <span class="font-medium text-green-600">{{ formatAmount(row.payMoney) }}</span>
          </template>
          <template #time-data="{ row }">
            <span class="text-sm">{{ formatDateTime(row.time) }}</span>
          </template>
        </UTable>

        <div v-if="pagination.total > 0" class="flex justify-between items-center mt-6 pt-4 border-t">
          <div class="text-sm text-gray-600">
            共 {{ pagination.total }} 条记录，第 {{ pagination.page }} / {{ Math.ceil(pagination.total / pagination.pageSize) }} 页
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="pagination.page > 1"
              @click="handlePageChange(pagination.page - 1)"
              variant="outline"
              size="sm"
              icon="i-heroicons-chevron-left"
              :disabled="loading"
            >上一页</UButton>
            <UButton
              v-if="pagination.page < Math.ceil(pagination.total / pagination.pageSize)"
              @click="handlePageChange(pagination.page + 1)"
              variant="outline"
              size="sm"
              icon="i-heroicons-chevron-right"
              :disabled="loading"
            >下一页</UButton>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useToast } from '#imports'
import { useAuthStore } from '~/store/auth'

const toast = useToast()
const authStore = useAuthStore()

const getAuthHeaders = () => ({
  authorization: String(authStore.id || localStorage.getItem('auth_id') || '')
})

// 服务器选择
const selectedServer = ref('')
const serverOptions = ref<{ label: string; value: string }[]>([])
const loadingServers = ref(false)

// 物品名称缓存（goodsId -> name）
const itemNameMap = ref<Record<string, string>>({})

// 过滤条件
const filters = reactive({
  playerId: '',
  startDate: '',
  endDate: ''
})

// 日期选择器
const getPastDate = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}
const getCurrentDate = () => new Date().toISOString().split('T')[0]
const selected = ref<{ start: Date; end: Date }>({ start: new Date(getPastDate(7)), end: new Date(getCurrentDate()) })
const dateRanges = [
  { label: '最近7天', days: 7 },
  { label: '最近14天', days: 14 },
  { label: '最近30天', days: 30 }
]
const setDateRange = (days: number) => {
  const endDate = getCurrentDate()
  const startDate = getPastDate(days)
  filters.endDate = endDate
  filters.startDate = startDate
  selected.value = { start: new Date(startDate), end: new Date(endDate) }
}
const isRangeSelected = (days: number) => filters.startDate === getPastDate(days) && filters.endDate === getCurrentDate()
watch(selected, (s) => {
  if (s.start && s.end) {
    filters.startDate = s.start.toISOString().split('T')[0]
    filters.endDate = s.end.toISOString().split('T')[0]
  }
}, { deep: true })
const formatDateRange = (s?: string, e?: string) => (s && e) ? `${s} 至 ${e}` : '请选择时间区间'

// 表格
const rows = ref<any[]>([])
const loading = ref(false)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const columns = [
  { key: 'billno', label: '订单号', sortable: true },
  { key: 'serverId', label: '服务器' },
  { key: 'playerId', label: '玩家ID' },
  { key: 'puid', label: 'PUID' },
  { key: 'goodsId', label: '商品' },
  { key: 'payMoney', label: '支付金额' },
  { key: 'diamonds', label: '钻石' },
  { key: 'currency', label: '币种' },
  { key: 'time', label: '充值时间', sortable: true }
]

const formatDateTime = (ts: number | string) => {
  const t = typeof ts === 'number' ? ts : Number(ts)
  if (!t) return '-'
  const d = new Date(t)
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}
const formatAmount = (payMoney: number) => {
  const v = Number(payMoney || 0) / 10
  return v.toFixed(2)
}
const getGoodsName = (id: string | number) => {
  const key = String(id ?? '')
  if (!key) return '-'
  return itemNameMap.value[key] || key
}

// 加载服务器
const loadServers = async () => {
  loadingServers.value = true
  try {
    const { data } = await $fetch('/api/gm/servers')
    serverOptions.value = (data as Array<{ name: string; bname: string }>).map(s => ({ label: s.name, value: s.bname }))
  } catch (e: any) {
    toast.add({ title: '加载服务器失败', description: e?.message || '请稍后重试', color: 'red' })
  } finally {
    loadingServers.value = false
  }
}

// 加载物品映射
const loadItemMap = async () => {
  try {
    const res: any = await $fetch('/api/user/item-config', { query: { action: 'list', pageSize: 20000 } })
    const list = res?.data?.list || []
    const map: Record<string, string> = {}
    list.forEach((it: any) => { map[String(it.id)] = it.cn || it.n || String(it.id) })
    itemNameMap.value = map
  } catch {}
}

// 查询数据
const loadData = async () => {
  if (!selectedServer.value) {
    toast.add({ title: '请选择服务器', color: 'red' })
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
      serverId: selectedServer.value
    })
    if (filters.playerId) params.append('playerId', filters.playerId)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)

    const resp: any = await $fetch(`/api/admin/game-checkorder?${params.toString()}`, { headers: getAuthHeaders() })
    if (resp?.success) {
      rows.value = (resp.data?.list || []).map((r: any) => ({
        ...r,
        payMoney: r.payMoney,
        goodsId: r.goodsId,
        time: r.time
      }))
      pagination.total = Number(resp.data?.pagination?.total || rows.value.length)
    } else {
      throw new Error(resp?.message || '查询失败')
    }
  } catch (e: any) {
    toast.add({ title: '查询失败', description: e?.message || '请稍后重试', color: 'red' })
  } finally {
    loading.value = false
  }
}

const handlePageChange = (page: number) => { pagination.page = page; loadData() }
const resetFilters = () => {
  filters.playerId = ''
  setDateRange(7)
  pagination.page = 1
  rows.value = []
}

onMounted(async () => {
  setDateRange(7)
  await Promise.all([loadServers(), loadItemMap()])
})
</script>

<style scoped>
.page-container { @apply p-6; }
.page-header { @apply mb-6; }
</style>


