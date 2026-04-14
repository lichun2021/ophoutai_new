<template>
  <div class="channel-settlement-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-calculator" class="w-6 h-6 text-green-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">渠道结算数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看下级代理的流水和结算数据统计（基于代理的所有下级渠道）</p>
        </div>
      </div>
      
      <!-- 重要说明 -->
      <UAlert
        icon="i-heroicons-information-circle"
        color="blue"
        variant="soft"
        title="数据说明"
        description="流水统计范围：每个代理的流水包含其all_channel_codes字段中的所有下级渠道的支付总额，不包含平台币消费。结算金额 = 流水 × 分成比例。"
        class="mb-4"
      />
    </div>

    <!-- 当前管理员信息 -->
    <div v-if="currentAdmin" class="mb-6">
      <UCard class="p-4">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">当前管理员：</span>
            <span class="font-semibold">{{ currentAdmin.name }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">级别：</span>
            <span class="font-semibold">{{ currentAdmin.level }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-percent-badge" class="w-5 h-5 text-yellow-500" />
            <span class="text-sm text-gray-600">分成比例：</span>
            <span class="font-semibold">{{ currentAdmin.divide_rate }}%</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 汇总统计卡片 -->
    <div v-if="settlementData.length > 0" class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 mb-3">¥{{ totalStats.yesterdayAmount }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">昨日总流水</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 mb-3">¥{{ totalStats.yesterdaySettlement }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">昨日总结算</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-cyan-600 mb-3">¥{{ totalStats.todayAmount }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-cyan-500" />
            <span class="text-sm text-gray-600">今日总流水</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-emerald-600 mb-3">¥{{ totalStats.todaySettlement }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-emerald-500" />
            <span class="text-sm text-gray-600">今日总结算</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600 mb-3">¥{{ totalStats.totalAmount }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">历史总流水</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="p-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-orange-600 mb-3">¥{{ totalStats.totalSettlement }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-wallet" class="w-5 h-5 text-orange-500" />
            <span class="text-sm text-gray-600">历史总结算</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 数据表格 -->
    <UCard>
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">下级代理结算明细</h3>
          <UButton 
            @click="refreshData" 
            :loading="loading" 
            icon="i-heroicons-arrow-path"
            variant="outline"
            size="sm"
          >
            刷新数据
          </UButton>
        </div>

        <div v-if="loading" class="flex justify-center items-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500" />
          <span class="ml-2 text-gray-600">加载中...</span>
        </div>

        <div v-else-if="settlementData.length === 0" class="text-center py-12">
          <UIcon name="i-heroicons-inbox" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">暂无下级代理数据</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-200">
                <th class="text-left py-3 px-4 font-semibold text-gray-700">代理名称</th>
                <th class="text-left py-3 px-4 font-semibold text-gray-700">渠道代码</th>
                <th class="text-left py-3 px-4 font-semibold text-gray-700">涵盖渠道</th>
                <th class="text-left py-3 px-4 font-semibold text-gray-700">分成比例</th>
                <th class="text-right py-3 px-4 font-semibold text-gray-700">昨日流水</th>
                <th class="text-right py-3 px-4 font-semibold text-gray-700">昨日结算</th>
                <th class="text-right py-3 px-4 font-semibold text-gray-700">今日流水</th>
                <th class="text-right py-3 px-4 font-semibold text-gray-700">今日结算</th>
                <th class="text-right py-3 px-4 font-semibold text-gray-700">总流水</th>
                <th class="text-right py-3 px-4 font-semibold text-gray-700">总结算</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="item in settlementData" 
                :key="item.agent_id"
                class="border-b border-gray-100 hover:bg-gray-50"
              >
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
                    <span class="font-medium">{{ item.agent_name }}</span>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <UBadge color="blue" variant="soft">{{ item.channel_code }}</UBadge>
                </td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <UBadge color="purple" variant="soft">{{ item.channel_count || 1 }}个渠道</UBadge>
                    <UPopover v-if="item.covered_channels && item.covered_channels.length > 1" mode="hover">
                      <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                      <template #panel>
                        <div class="p-3 max-w-sm">
                          <div class="text-sm font-medium mb-2">涵盖的渠道列表：</div>
                          <div class="text-xs text-gray-600 space-y-1">
                            <div v-for="channel in item.covered_channels" :key="channel" class="text-xs">
                              {{ channel }}
                            </div>
                          </div>
                        </div>
                      </template>
                    </UPopover>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <UBadge color="yellow" variant="soft">{{ item.divide_rate }}%</UBadge>
                </td>
                <td class="py-3 px-4 text-right font-mono">
                  <span class="text-blue-600">¥{{ formatAmount(item.yesterday_amount) }}</span>
                </td>
                <td class="py-3 px-4 text-right font-mono">
                  <span class="text-green-600">¥{{ formatAmount(item.yesterday_settlement) }}</span>
                </td>
                <td class="py-3 px-4 text-right font-mono">
                  <span class="text-cyan-600">¥{{ formatAmount(item.today_amount) }}</span>
                </td>
                <td class="py-3 px-4 text-right font-mono">
                  <span class="text-emerald-600">¥{{ formatAmount(item.today_settlement) }}</span>
                </td>
                <td class="py-3 px-4 text-right font-mono">
                  <span class="text-purple-600">¥{{ formatAmount(item.total_amount) }}</span>
                </td>
                <td class="py-3 px-4 text-right font-mono">
                  <span class="text-orange-600 font-semibold">¥{{ formatAmount(item.total_settlement) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/store/auth';

// 页面元数据
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();

// 响应式数据
const loading = ref(false);
const settlementData = ref([]);
const currentAdmin = ref(null);

// 计算汇总统计
const totalStats = computed(() => {
  if (settlementData.value.length === 0) {
    return {
      yesterdayAmount: '0.00',
      yesterdaySettlement: '0.00',
      todayAmount: '0.00',
      todaySettlement: '0.00',
      totalAmount: '0.00',
      totalSettlement: '0.00'
    };
  }

  const stats = settlementData.value.reduce((acc, item) => {
    acc.yesterdayAmount += item.yesterday_amount;
    acc.yesterdaySettlement += item.yesterday_settlement;
    acc.todayAmount += item.today_amount;
    acc.todaySettlement += item.today_settlement;
    acc.totalAmount += item.total_amount;
    acc.totalSettlement += item.total_settlement;
    return acc;
  }, {
    yesterdayAmount: 0,
    yesterdaySettlement: 0,
    todayAmount: 0,
    todaySettlement: 0,
    totalAmount: 0,
    totalSettlement: 0
  });

  return {
    yesterdayAmount: formatAmount(stats.yesterdayAmount),
    yesterdaySettlement: formatAmount(stats.yesterdaySettlement),
    todayAmount: formatAmount(stats.todayAmount),
    todaySettlement: formatAmount(stats.todaySettlement),
    totalAmount: formatAmount(stats.totalAmount),
    totalSettlement: formatAmount(stats.totalSettlement)
  };
});

// 格式化金额
const formatAmount = (amount) => {
  return parseFloat(amount || 0).toFixed(2);
};

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    // 正确获取管理员ID：管理员使用authStore.id，普通用户使用authStore.userInfo?.id
    const adminId = authStore.isUser ? authStore.userInfo?.id : authStore.id;
    if (!adminId) {
      throw new Error('未获取到管理员ID');
    }

    const response = await $fetch('/api/admin/channel-settlement-data', {
      query: { admin_id: adminId }
    });

    if (response.success) {
      settlementData.value = response.data.settlement_data || [];
      currentAdmin.value = response.data.current_admin || null;
    } else {
      throw new Error(response.message || '获取数据失败');
    }
  } catch (error) {
    console.error('加载渠道结算数据失败:', error);
    // 这里可以添加错误提示
  } finally {
    loading.value = false;
  }
};

// 刷新数据
const refreshData = () => {
  loadData();
};

// 页面加载时获取数据
onMounted(() => {
  loadData();
});
</script>

<style scoped>
.channel-settlement-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  color: #1f2937;
  font-weight: 600;
}

.page-header p {
  color: #6b7280;
  margin-top: 4px;
}

/* 表格样式优化 */
table {
  border-collapse: separate;
  border-spacing: 0;
}

th {
  background-color: #f9fafb;
  font-weight: 600;
  color: #374151;
  font-size: 14px;
}

td {
  font-size: 14px;
  vertical-align: middle;
}

tbody tr:hover {
  background-color: #f9fafb;
}

/* 金额显示样式 */
.font-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .channel-settlement-page {
    padding: 16px;
  }
  
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
  
  .overflow-x-auto {
    font-size: 12px;
  }
  
  th, td {
    padding: 8px 4px;
  }
}
</style>