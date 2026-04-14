<template>
  <div class="settlement-manage-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>结算管理</h2>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-3xl font-bold text-blue-600">{{ childAgents.length }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">下级代理数</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-green-600">{{ totalSettledCount }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500" />
            <span class="text-sm text-gray-600">已结算申请</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-orange-600">{{ totalPendingCount }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-5 h-5 text-orange-500" />
            <span class="text-sm text-gray-600">待审核申请</span>
          </div>
        </div>
      </UCard>
      
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-purple-600">{{ formatCurrency(totalSettledAmount) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-purple-500" />
            <span class="text-sm text-gray-600">累计结算金额</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 搜索筛选 -->
    <UCard class="mb-6">
      <div class="flex items-end gap-4 p-4">
        <!-- 代理选择 -->
        <UFormGroup label="选择代理" class="flex-1">
          <USelect
            v-model="searchForm.selected_agent"
            :options="agentOptions"
            placeholder="选择要查看的代理"
            @change="onAgentChange"
          />
        </UFormGroup>

        <!-- 结算状态 -->
        <UFormGroup label="结算状态" class="flex-1">
          <USelect
            v-model="searchForm.status"
            :options="statusOptions"
            placeholder="选择状态"
            @change="searchSettlements"
          />
        </UFormGroup>

        <!-- 操作按钮 -->
        <div class="flex gap-2 shrink-0">
          <UButton 
            @click="searchSettlements" 
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

    <!-- 代理结算汇总 -->
    <UCard v-if="searchForm.selected_agent" class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold">{{ selectedAgentName }} - 结算汇总</h3>
      </template>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600">{{ formatCurrency(agentSummary.total_settled) }}</div>
          <div class="text-sm text-gray-500">累计已结算金额</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-orange-600">{{ agentSummary.settled_count }}</div>
          <div class="text-sm text-gray-500">已结算次数</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600">{{ formatCurrency(agentSummary.pending_amount) }}</div>
          <div class="text-sm text-gray-500">待审核金额</div>
        </div>
      </div>
    </UCard>

    <!-- 结算申请列表 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">结算申请列表</h3>
          <UButton @click="refreshList" size="sm" variant="outline">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
            刷新
          </UButton>
        </div>
      </template>

      <div class="overflow-x-auto mobile-table-wrapper">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-3 px-4 font-medium text-gray-900">提交时间</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">代理信息</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">申请金额</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">分成比例</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">结算方式</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">U地址</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">状态</th>
              <th class="text-left py-3 px-4 font-medium text-gray-900">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="settlement in settlements" :key="settlement.id" class="border-b border-gray-100">
              <td class="py-3 px-4 text-sm text-gray-600">
                {{ formatDateTime(settlement.created_at) }}
              </td>
              <td class="py-3 px-4 text-sm">
                <div>{{ settlement.admin_name }}</div>
                <div class="text-xs text-gray-500">{{ settlement.channel_code }}</div>
              </td>
              <td class="py-3 px-4 text-sm font-medium text-green-600">
                {{ formatCurrency(settlement.settlement_amount) }}
              </td>
              <td class="py-3 px-4 text-sm">
                {{ settlement.divide_rate }}%
              </td>
              <td class="py-3 px-4 text-sm">
                <UBadge color="indigo" variant="subtle" size="sm">
                  {{ settlement.settlement_method || 'U' }}
                </UBadge>
              </td>
              <td class="py-3 px-4 text-sm font-mono">
                <div class="max-w-32 truncate" :title="settlement.u_address">
                  {{ settlement.u_address || '-' }}
                </div>
              </td>
              <td class="py-3 px-4">
                <UBadge 
                  :color="getStatusColor(settlement.status)" 
                  variant="subtle"
                  size="sm"
                >
                  {{ getStatusText(settlement.status) }}
                </UBadge>
              </td>
              <td class="py-3 px-4">
                <div v-if="settlement.status === 0" class="flex gap-2">
                  <UButton 
                    @click="approveSettlement(settlement)"
                    color="green"
                    size="xs"
                    :loading="processing[settlement.id]"
                  >
                    通过
                  </UButton>
                  <UButton 
                    @click="rejectSettlement(settlement)"
                    color="red" 
                    size="xs"
                    :loading="processing[settlement.id]"
                  >
                    拒绝
                  </UButton>
                </div>
                <div v-else class="text-xs text-gray-500">
                  {{ settlement.settlement_date ? formatDateTime(settlement.settlement_date) : '-' }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="settlements.length === 0" class="text-center py-8 text-gray-500">
          暂无结算申请
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

    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '~/store/auth'

const authStore = useAuthStore()

// 响应式数据
const settlements = ref([])
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0
})

const searchForm = ref({
  selected_agent: '',
  status: ''
})

const childAgents = ref([])
const agentSummary = ref({
  total_settled: 0,
  settled_count: 0,
  pending_amount: 0
})

const loading = ref(false)
const processing = ref({})

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '待审核', value: 0 },
  { label: '已通过', value: 1 },
  { label: '已拒绝', value: 2 }
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

const agentOptions = computed(() => {
  return [
    { label: '全部代理', value: '' },
    ...childAgents.value.map(agent => ({
      label: `${agent.channel_name || agent.name || agent.channel_code} (${agent.channel_code})`,
      value: agent.channel_code
    }))
  ]
});

const selectedAgentName = computed(() => {
  if (!searchForm.value.selected_agent) return '';
  const agent = childAgents.value.find(a => a.channel_code === searchForm.value.selected_agent);
  return agent ? (agent.channel_name || agent.name || agent.channel_code) : '';
});

const totalSettledCount = computed(() => {
  return settlements.value.filter(s => s.status === 1).length;
});

const totalPendingCount = computed(() => {
  return settlements.value.filter(s => s.status === 0).length;
});

const totalSettledAmount = computed(() => {
  return settlements.value
    .filter(s => s.status === 1)
    .reduce((sum, s) => sum + parseFloat(s.settlement_amount || 0), 0);
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
    0: '待审核',
    1: '已通过',
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
const loadChildAgents = async () => {
  try {
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: { adminId: currentAdminId.value }
    });

    if (response.success) {
      // 过滤掉无效的代理数据
      childAgents.value = (response.data || []).filter(agent => 
        agent && agent.channel_code && (agent.channel_name || agent.name || agent.channel_code)
      );
    }
  } catch (error) {
    console.error('加载下级代理失败:', error);
    childAgents.value = [];
  }
}

const loadSettlements = async () => {
  loading.value = true;
  try {
    // 准备请求参数，包含筛选条件
    const requestBody = {
      admin_id: currentAdminId.value,
      page: pagination.value.page,
      page_size: pagination.value.pageSize
    };
    
    // 添加筛选参数
    if (searchForm.value.selected_agent) {
      requestBody.selected_agent = searchForm.value.selected_agent;
    }
    
    if (searchForm.value.status !== '') {
      requestBody.status = parseInt(searchForm.value.status);
    }
    
    console.log('发送筛选参数:', requestBody);
    
    const response = await $fetch('/api/admin/child-settlement-requests', {
      method: 'POST',
      body: requestBody
    })
    
    if (response.success) {
      settlements.value = response.data.data;
      pagination.value.total = response.data.total;
      
      console.log('筛选结果:', settlements.value.length, '条记录，总计:', pagination.value.total);
    }
  } catch (error) {
    console.error('加载结算申请失败:', error);
    toast.add({
      title: '错误',
      description: '加载结算申请失败',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
}

const loadAgentSummary = async (channelCode) => {
  if (!channelCode) {
    agentSummary.value = {
      total_settled: 0,
      settled_count: 0,
      pending_amount: 0
    };
    return;
  }
  
  try {
    // 计算该代理的汇总数据
    const allSettlements = settlements.value.filter(s => s.channel_code === channelCode);
    
    agentSummary.value = {
      total_settled: allSettlements
        .filter(s => s.status === 1)
        .reduce((sum, s) => sum + parseFloat(s.settlement_amount || 0), 0),
      settled_count: allSettlements.filter(s => s.status === 1).length,
      pending_amount: allSettlements
        .filter(s => s.status === 0)
        .reduce((sum, s) => sum + parseFloat(s.settlement_amount || 0), 0)
    };
  } catch (error) {
    console.error('计算代理汇总失败:', error);
  }
}

const onAgentChange = () => {
  loadAgentSummary(searchForm.value.selected_agent);
  searchSettlements();
}

const searchSettlements = async () => {
  pagination.value.page = 1;
  await loadSettlements();
}

const resetSearch = () => {
  searchForm.value = {
    selected_agent: '',
    status: ''
  };
  agentSummary.value = {
    total_settled: 0,
    settled_count: 0,
    pending_amount: 0
  };
  searchSettlements();
}

const approveSettlement = async (settlement) => {
  processing.value[settlement.id] = true;
  try {
    const response = await $fetch('/api/admin/review-settlement-request', {
      method: 'POST',
      body: {
        settlement_id: settlement.id,
        status: 1,
        remark: '审核通过'
      }
    });
    
    if (response.success) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      });
      
      await loadSettlements();
      if (searchForm.value.selected_agent) {
        await loadAgentSummary(searchForm.value.selected_agent);
      }
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: error.data?.message || '审核失败',
      color: 'red'
    });
  } finally {
    processing.value[settlement.id] = false;
  }
}

const rejectSettlement = async (settlement) => {
  processing.value[settlement.id] = true;
  try {
    const response = await $fetch('/api/admin/review-settlement-request', {
      method: 'POST',
      body: {
        settlement_id: settlement.id,
        status: 2,
        remark: '审核拒绝'
      }
    });
    
    if (response.success) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      });
      
      await loadSettlements();
      if (searchForm.value.selected_agent) {
        await loadAgentSummary(searchForm.value.selected_agent);
      }
    }
  } catch (error) {
    toast.add({
      title: '错误',
      description: error.data?.message || '审核失败',
      color: 'red'
    });
  } finally {
    processing.value[settlement.id] = false;
  }
}

const refreshList = async () => {
  pagination.value.page = 1;
  await loadSettlements();
}

const changePage = async (page) => {
  pagination.value.page = page;
  await loadSettlements();
}

// 页面初始化
onMounted(async () => {
  if (currentAdminId.value) {
    await Promise.all([
      loadChildAgents(),
      loadSettlements()
    ]);
  }
})
</script>

<style scoped>
.settlement-manage-page {
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