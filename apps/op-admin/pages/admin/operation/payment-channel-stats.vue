<template>
  <div class="payment-channel-stats-page p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-gray-900">渠道支付统计 (最近7天)</h2>
      <div class="flex gap-2">
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="outline"
          @click="loadChannelStats"
          :loading="loading"
        >
          刷新数据
        </UButton>
      </div>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2 text-sm text-gray-500">
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
          <span>统计说明：仅统计支付成功的订单，已排除平台币消费记录。</span>
        </div>
      </template>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 text-primary-500 animate-spin" />
        <p class="mt-4 text-gray-600 font-medium">正在努力计算统计数据...</p>
      </div>

      <!-- 无数据提示 -->
      <div v-else-if="channels.length === 0" class="flex flex-col items-center justify-center py-20 text-gray-500">
        <UIcon name="i-heroicons-circle-stack" class="w-12 h-12 mb-4 opacity-20" />
        <p>最近7天暂无支付流水数据</p>
      </div>

      <!-- 数据报表 -->
      <div v-else class="table-container">
        <table class="stats-table w-full border-collapse">
          <thead>
            <tr>
              <th class="sticky-col text-left">支付渠道</th>
              <th v-for="date in dates" :key="date" class="text-center">
                {{ formatDateShort(date) }}
              </th>
              <th class="text-center font-bold bg-gray-50 border-l-2">7天总计</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="channel in channels" :key="channel.id" class="hover:bg-gray-50/50 transition-colors">
              <td class="sticky-col bg-white font-medium border-b py-4">
                <div class="flex flex-col">
                  <span class="text-gray-900">{{ channel.name }}</span>
                  <span class="text-[10px] text-gray-400 font-mono tracking-tighter">ID: {{ channel.id }}</span>
                </div>
              </td>
              <td v-for="day in channel.daily" :key="day.date" class="text-center border-b p-2">
                <div class="flex flex-col items-center">
                  <div 
                    class="text-sm font-bold" 
                    :class="parseFloat(day.amount) > 0 ? 'text-emerald-600' : 'text-gray-300'"
                  >
                    ¥{{ day.amount }}
                  </div>
                  <div class="text-[10px] text-gray-400 mt-0.5">
                    {{ day.count }} 笔
                  </div>
                </div>
              </td>
              <td class="text-center border-b bg-gray-50 font-medium border-l-2">
                <div class="flex flex-col items-center">
                  <div class="text-base font-black text-primary-600">
                    ¥{{ channel.totalAmount }}
                  </div>
                  <div class="text-[10px] text-gray-500 font-bold bg-white px-2 py-0.5 rounded-full border shadow-sm mt-1">
                    {{ channel.totalCount }} 笔
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

definePageMeta({
  layout: 'default'
})

const loading = ref(false)
const channels = ref([])
const dates = ref([])

const loadChannelStats = async () => {
  try {
    loading.value = true
    const response = await $fetch('/api/admin/payment-channel-stats')
    if (response.success) {
      channels.value = response.data.channels
      dates.value = response.data.dates
    }
  } catch (error) {
    console.error('加载统计失败:', error)
    const toast = useToast()
    toast.add({
      title: '获取统计失败',
      description: error.message || '网络或服务器错误',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

const formatDateShort = (dateStr) => {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  return `${parts[1]}/${parts[2]}`
}

onMounted(() => {
  loadChannelStats()
})
</script>

<style scoped>
.table-container {
  @apply overflow-x-auto -mx-1;
}

.stats-table th {
  @apply bg-gray-50/80 backdrop-blur text-gray-600 text-xs font-bold uppercase tracking-wider py-3 px-4 border-b;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 20;
  min-width: 160px;
  box-shadow: 4px 0 8px -4px rgba(0,0,0,0.05);
}

th.sticky-col {
  background-color: #f9fafb;
}

.stats-table td {
  @apply px-4;
}

/* 移动端适配：允许横向滚动且首列固定 */
@media (max-width: 768px) {
  .payment-channel-stats-page {
    @apply p-4;
  }
  
  .sticky-col {
    min-width: 120px;
  }
}
</style>
