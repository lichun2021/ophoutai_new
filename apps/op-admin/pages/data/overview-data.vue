<template>
  <div class="overview-data-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-calendar-days" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">数据概览</h2>
          <p class="text-sm text-gray-600 mt-1">查看平台整体用户活跃、付费等核心数据指标</p>
        </div>
        <UPopover mode="hover">
          <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-gray-400 cursor-help hover:text-blue-500 ml-2" />
          <template #panel>
            <div class="p-4 max-w-md">
              <div class="space-y-4">
                <!-- 用户数量类指标 -->
                <div>
                  <h4 class="font-medium text-sm mb-2 text-blue-600">👥 用户数量类指标</h4>
                  <div class="space-y-1 text-xs text-gray-600">
                    <div><span class="font-medium">活跃用户数:</span> 统计时间段内有登录或使用行为的用户总数</div>
                    <div><span class="font-medium">新增用户数:</span> 统计时间段内新注册的用户数量</div>
                  </div>
                </div>
                
                <!-- 付费用户类指标 -->
                <div>
                  <h4 class="font-medium text-sm mb-2 text-orange-600">💳 付费用户类指标</h4>
                  <div class="space-y-1 text-xs text-gray-600">
                    <div><span class="font-medium">付费人数:</span> 统计时间段内有任何付费行为的用户数量</div>
                    <div><span class="font-medium">新增付费人数:</span> 新注册用户中产生付费行为的用户数量</div>
                  </div>
                </div>
                
                <!-- 收入类指标 -->
                <div>
                  <h4 class="font-medium text-sm mb-2 text-green-600">💰 收入类指标</h4>
                  <div class="space-y-1 text-xs text-gray-600">
                    <div><span class="font-medium">付费金额:</span> 统计时间段内所有用户的付费总金额</div>
                    <div><span class="font-medium">新增付费金额:</span> 新注册用户产生的付费总金额</div>
                  </div>
                </div>
                
                <!-- 转化率类指标 -->
                <div>
                  <h4 class="font-medium text-sm mb-2 text-purple-600">📊 转化率类指标</h4>
                  <div class="space-y-1 text-xs text-gray-600">
                    <div><span class="font-medium">付费率:</span> 付费用户数 ÷ 活跃用户数 × 100%</div>
                    <div><span class="font-medium">新增付费率:</span> 新增付费用户数 ÷ 新增用户数 × 100%</div>
                  </div>
                </div>
                
                <!-- ARPU类指标 -->
                <div>
                  <h4 class="font-medium text-sm mb-2 text-yellow-600">💎 ARPU类指标 (Average Revenue Per User)</h4>
                  <div class="space-y-1 text-xs text-gray-600">
                    <div><span class="font-medium">付费ARPU:</span> 付费金额 ÷ 付费用户数，付费用户的平均消费金额</div>
                    <div><span class="font-medium">总ARPU:</span> 付费金额 ÷ 活跃用户数，所有用户的平均贡献收入</div>
                    <div><span class="font-medium">新增ARPU:</span> 新增付费金额 ÷ 新增用户数，新增用户的平均贡献收入</div>
                    <div><span class="font-medium">新增付费ARPU:</span> 新增付费金额 ÷ 新增付费用户数，新增付费用户的平均消费金额</div>
                  </div>
                </div>
                
                <!-- 重要说明 -->
                <div class="border-t pt-3">
                  <div class="flex items-center gap-1 mb-2">
                    <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
                    <span class="text-xs font-medium text-red-700">重要说明</span>
                  </div>
                  <p class="text-xs text-red-600">所有付费相关统计数据均不包含平台币消费，仅统计真实的充值付费。</p>
                </div>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
    </div>


    <!-- 统计汇总卡片 -->
    <div v-if="overviewData" class="relative">
            <!-- 统计时间范围标题 -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          
        </div>
        <UBadge 
          color="blue" 
          variant="soft" 
          size="lg"
          class="px-3 py-1"
        >
          <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 mr-2" />
          统计时间：{{ formatDateRange(overviewData.startDate || filters.startDate, overviewData.endDate || filters.endDate) }}
        </UBadge>
      </div>
      
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
        <!-- 用户相关指标 -->
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600 mb-3">{{ formatNumber(overviewData.activeUsers) }}</div>
                        <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-blue-500" />
              <span class="text-sm text-gray-600">活跃用户数</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help align-middle" />
                <template #panel>
                  <div class="p-3 max-w-xs">
                    <div class="text-xs text-blue-600">统计期间内有登录行为的去重用户数</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600 mb-3">{{ formatNumber(overviewData.newUsers) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-user-plus" class="w-5 h-5 text-green-500" />
              <span class="text-sm text-gray-600">新增用户数</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help align-middle" />
                <template #panel>
                  <div class="p-3 max-w-xs">
                    <div class="text-xs text-blue-600">统计期间内新注册的用户数量</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <!-- 付费相关指标 -->
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-600 mb-3">{{ formatNumber(overviewData.payUsers) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-credit-card" class="w-5 h-5 text-orange-500" />
              <span class="text-sm text-gray-600">付费人数</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help question-mark-icon" />
                <template #panel>
                  <div class="p-3 max-w-xs">
                    <div class="text-xs text-gray-600 mb-2">统计期间内有付费行为的去重用户数</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600 mb-3">{{ formatNumber(overviewData.newPayUsers) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-purple-500" />
              <span class="text-sm text-gray-600">新增付费人数</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">

                    <div class="text-xs text-gray-600 mb-2">首次付费时间在统计期间内的用户数</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>

                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <!-- 金额相关指标 -->
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-emerald-600 mb-3">¥{{ formatAmount(overviewData.payAmount) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-banknotes" class="w-5 h-5 text-emerald-500" />
              <span class="text-sm text-gray-600">付费金额</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">

                    <div class="text-xs text-gray-600 mb-2">统计期间内所有成功付费金额的总和</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>

                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-cyan-600 mb-3">¥{{ formatAmount(overviewData.newPayAmount) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-arrow-trending-up" class="w-5 h-5 text-cyan-500" />
              <span class="text-sm text-gray-600">新增付费金额</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">

                    <div class="text-xs text-gray-600 mb-2">新增付费用户在统计期间内的付费总额</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>

                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <!-- 比率相关指标 -->
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-rose-600 mb-3">{{ overviewData.payRate }}%</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-rose-500" />
              <span class="text-sm text-gray-600">付费率</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">
                    <div class="text-xs text-blue-600">反映用户付费转化情况</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-indigo-600 mb-3">{{ overviewData.newPayRate }}%</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-chart-bar-square" class="w-5 h-5 text-indigo-500" />
              <span class="text-sm text-gray-600">新增付费率</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">
                    <div class="text-xs text-blue-600">反映新用户付费转化情况</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <!-- ARPU相关指标 -->
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-yellow-600 mb-3">¥{{ formatAmount(overviewData.payArpu) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-calculator" class="w-5 h-5 text-yellow-500" />
              <span class="text-sm text-gray-600">付费ARPU</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">

                    <div class="text-xs text-gray-600 mb-2">付费金额 ÷ 付费用户数</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>
                    <div class="text-xs text-blue-600">付费用户的平均消费金额</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-teal-600 mb-3">¥{{ formatAmount(overviewData.totalArpu) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-scale" class="w-5 h-5 text-teal-500" />
              <span class="text-sm text-gray-600">总ARPU</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">

                    <div class="text-xs text-gray-600 mb-2">付费金额 ÷ 活跃用户数</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>
                    <div class="text-xs text-blue-600">所有用户的平均贡献收入</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-violet-600 mb-3">¥{{ formatAmount(overviewData.newArpu) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-presentation-chart-line" class="w-5 h-5 text-violet-500" />
              <span class="text-sm text-gray-600">新增ARPU</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">

                    <div class="text-xs text-gray-600 mb-2">新增付费金额 ÷ 新增用户数</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>
                    <div class="text-xs text-blue-600">新增用户的平均贡献收入</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
        
        <UCard class="p-4 relative">
          <div class="text-center">
            <div class="text-2xl font-bold text-pink-600 mb-3">¥{{ formatAmount(overviewData.newPayArpu) }}</div>
            <div class="flex items-center justify-center gap-2">
              <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-pink-500" />
              <span class="text-sm text-gray-600">新增付费ARPU</span>
              <UPopover mode="hover">
                <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
                <template #panel>
                  <div class="p-3 max-w-xs">
                    <div class="font-medium text-sm mb-2">计算公式：</div>                    <div class="text-xs text-gray-600 mb-2">新增付费金额 ÷ 新增付费用户数</div>
                    <div class="text-xs text-red-600 mb-2">⚠️ 不包含平台币消费</div>
                    <div class="text-xs text-blue-600">新增付费用户的平均消费金额</div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
      </div>

    </div>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="filter-content">
        <div class="filter-row">
          <!-- 时间区间选择 -->
          <UFormGroup label="时间区间" class="flex-1">
            <UPopover :popper="{ placement: 'bottom-start' }">
              <UButton 
                variant="outline" 
                icon="i-heroicons-calendar-days"
                class="w-full justify-start"
              >
                {{ formatDateRange(filters.startDate, filters.endDate) }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex divide-x divide-gray-200 dark:divide-gray-800">
                  <!-- 快捷选择面板 -->
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
                  
                  <!-- 日历组件 -->
                  <DatePicker v-model="selected" @close="close" />
                </div>
              </template>
            </UPopover>
          </UFormGroup>

          <!-- 一级渠道选择 -->
          <UFormGroup label="一级渠道" class="flex-1">
            <USelect 
              v-model="filters.primaryChannelCode" 
              placeholder="请选择一级渠道"
              :options="primaryChannelOptions"
              icon="i-heroicons-building-office"
              @change="onPrimaryChannelChange"
            />
          </UFormGroup>

          <!-- 二级渠道选择 -->
          <UFormGroup label="二级渠道" class="flex-1">
            <USelect 
              v-model="filters.secondaryChannelCode" 
              placeholder="请选择二级渠道"
              :options="secondaryChannelOptions"
              icon="i-heroicons-building-office-2"
              :disabled="!filters.primaryChannelCode"
            />
          </UFormGroup>

          <!-- 游戏选择 -->
          <UFormGroup label="游戏" class="flex-1">
            <USelect 
              v-model="filters.gameId" 
              placeholder="请选择游戏"
              :options="gameOptions"
              icon="i-heroicons-puzzle-piece"
            />
          </UFormGroup>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3 mt-6 pt-6 border-t">
          <UButton 
            @click="loadOverviewData" 
            :loading="loading"
            icon="i-heroicons-magnifying-glass"
          >
            查询数据
          </UButton>
          <UButton 
            color="gray" 
            variant="outline" 
            @click="resetFilters"
            icon="i-heroicons-arrow-path"
          >
            重置条件
          </UButton>
          <UButton 
            color="green" 
            variant="outline" 
            @click="exportData"
            :loading="exportLoading"
            icon="i-heroicons-arrow-down-tray"
          >
            导出Excel
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 游戏详细数据表格 -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">游戏详细数据</h3>
            <UBadge v-if="gameStatsData.length > 0" :label="`${gameStatsData.length}个游戏`" variant="soft" size="xs" />
          </div>
          <div class="flex items-center gap-2">
            <UButton 
              v-if="currentAdminLevel > 0" 
              variant="soft" 
              color="yellow" 
              size="xs"
              icon="i-heroicons-exclamation-triangle"
            >
              代理权限数据
            </UButton>
          </div>
        </div>
      </template>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-500 animate-spin" />
        <p class="mt-2 text-gray-600">正在加载数据...</p>
      </div>

      <!-- 数据表格 -->
      <div v-else class="mobile-table-container">
        <UTable 
          :rows="gameStatsData" 
          :columns="gameColumns"
          :loading="loading"
          :empty-state="{ 
            icon: 'i-heroicons-chart-pie', 
            label: '暂无游戏数据',
            description: '请调整筛选条件后重新查询' 
          }"
          class="w-full uniform-table"
        >
        <template #gameName-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-puzzle-piece" class="w-4 h-4 text-gray-400" />
            <span class="font-medium">{{ row.gameName }}</span>
          </div>
        </template>

        <template #activeUsers-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" class="w-4 h-4 text-blue-500" />
            <span class="font-medium text-blue-600">{{ formatNumber(row.activeUsers) }}</span>
          </div>
        </template>

        <template #registerUsers-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-plus" class="w-4 h-4 text-purple-500" />
            <span class="font-medium text-purple-600">{{ formatNumber(row.registerUsers) }}</span>
          </div>
        </template>

        <template #rechargeAmount-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-green-500" />
            <span class="font-medium text-green-600">{{ formatAmount(row.rechargeAmount) }}</span>
          </div>
        </template>

        <template #payRate-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-cyan-500" />
            <span class="font-medium text-cyan-600">{{ row.payRate }}%</span>
          </div>
        </template>

        <template #arpu-data="{ row }">
          <div class="flex items-center gap-1">
            <UIcon name="i-heroicons-calculator" class="w-4 h-4 text-yellow-500" />
            <span class="font-medium text-yellow-600">{{ formatAmount(row.arpu) }}</span>
          </div>
        </template>
        </UTable>
      </div>
    </UCard>

    <!-- 通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useAuthStore } from '~/store/auth';

// 页面元数据
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();
const toast = useToast();

// 辅助函数：获取过去N天的日期
const getPastDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
};

// 辅助函数：获取当前日期
const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

// 响应式数据
const loading = ref(false);
const exportLoading = ref(false);

// 日期选择器数据
const selected = ref({ 
  start: new Date(getPastDate(7)), 
  end: new Date(getCurrentDate()) 
});

// 日期范围选项
const dateRanges = [
  { label: '最近7天', days: 7 },
  { label: '最近14天', days: 14 },
  { label: '最近30天', days: 30 },
  { label: '最近60天', days: 60 },
  { label: '最近90天', days: 90 }
];

// 表格列定义
const gameColumns = [
  {
    key: 'gameName',
    label: '游戏名称',
    sortable: true
  },
  {
    key: 'activeUsers',
    label: '活跃用户数',
    sortable: true
  },
  {
    key: 'registerUsers',
    label: '注册用户',
    sortable: true
  },
  {
    key: 'rechargeAmount',
    label: '真实流水(不包含平台币)',
    sortable: true
  },
  {
    key: 'payRate',
    label: '付费率',
    sortable: true
  },
  {
    key: 'arpu',
    label: 'ARPU值(元)',
    sortable: true
  }
];

// 筛选条件
const filters = ref({
  startDate: getPastDate(7),
  endDate: getCurrentDate(),
  primaryChannelCode: '',
  secondaryChannelCode: '',
  gameId: ''
});

// 概览数据
const overviewData = ref({
  activeUsers: 0,
  newUsers: 0,
  payUsers: 0,
  newPayUsers: 0,
  payAmount: '0.00',
  newPayAmount: '0.00',
  payRate: '0',
  newPayRate: '0',
  payArpu: '0',
  totalArpu: '0',
  newArpu: '0',
  newPayArpu: '0',
  startDate: '',
  endDate: '',
  adminLevel: 0,
  allowedChannels: null
});

// 游戏统计数据
const gameStatsData = ref([]);

// 下拉选项
const primaryChannelOptions = ref([]);

const secondaryChannelOptions = ref([]);

const gameOptions = ref([]);

// 计算属性
const currentAdminId = computed(() => {
  // 管理员使用 authStore.id，用户使用 authStore.userInfo?.id
  if (authStore.isUser) {
    return authStore.userInfo?.id || '';
  } else {
    return authStore.id || '';
  }
});

const currentAdminLevel = computed(() => {
  // 管理员从 permissions 获取 level
  if (authStore.isUser) {
    return authStore.userInfo?.level || 0;
  } else {
    return authStore.permissions?.level || 0;
  }
});

// 监听DatePicker选择变化
watch(selected, (newSelected) => {
  if (newSelected.start && newSelected.end) {
    filters.value.startDate = newSelected.start.toISOString().split('T')[0];
    filters.value.endDate = newSelected.end.toISOString().split('T')[0];
  }
}, { deep: true });

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadPrimaryChannelOptions(),
    loadGameOptions(),
    loadOverviewData()
  ]);
});

// 设置日期范围
const setDateRange = (days) => {
  const endDate = getCurrentDate();
  const startDate = getPastDate(days);
  
  // 更新filters
  filters.value.endDate = endDate;
  filters.value.startDate = startDate;
  
  // 更新selected（DatePicker需要Date对象）
  selected.value = {
    start: new Date(startDate),
    end: new Date(endDate)
  };
};

// 检查是否选中某个日期范围
const isRangeSelected = (days) => {
  const expectedStart = getPastDate(days);
  const expectedEnd = getCurrentDate();
  return filters.value.startDate === expectedStart && filters.value.endDate === expectedEnd;
};

// 格式化日期范围显示
const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '请选择时间区间';
  return `${startDate} 至 ${endDate}`;
};

// 格式化数字
const formatNumber = (value) => {
  return Number(value || 0).toLocaleString();
};

// 格式化金额
const formatAmount = (value) => {
  return Number(value || 0).toFixed(2);
};

// 加载一级渠道选项
const loadPrimaryChannelOptions = async () => {
  try {
    // 获取当前用户的下级渠道列表（一级渠道）
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        adminId: currentAdminId.value
      }
    });

    if (response.success) {
      // 构建一级渠道选项
      const options = [];
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          });
        });
      }
      
      primaryChannelOptions.value = options;
    } else {
      // 如果没有下级渠道，设置为空数组
      primaryChannelOptions.value = [];
    }
  } catch (error) {
    console.error('加载一级渠道选项失败:', error);
    // 发生错误时设置为空数组
    primaryChannelOptions.value = [];
  }
};

// 加载二级渠道选项
const loadSecondaryChannelOptions = async (primaryChannelCode) => {
  try {
    if (!primaryChannelCode) {
      secondaryChannelOptions.value = [];
      return;
    }

    // 获取指定一级渠道的下级渠道列表
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        parentChannelCode: primaryChannelCode
      }
    });

    if (response.success) {
      // 构建二级渠道选项
      const options = [];
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(channel => {
          options.push({
            value: channel.channel_code,
            label: channel.channel_name || channel.channel_code
          });
        });
      }
      
      secondaryChannelOptions.value = options;
    } else {
      secondaryChannelOptions.value = [];
    }
  } catch (error) {
    console.error('加载二级渠道选项失败:', error);
    secondaryChannelOptions.value = [];
  }
};

// 加载游戏选项
const loadGameOptions = async () => {
  try {
    let response;
    
    // 根据管理员级别决定获取哪些游戏
    if (currentAdminLevel.value === 0) {
      // 超级管理员获取所有游戏
      response = await $fetch('/api/admin/games');
    } else {
      // 普通管理员获取被授权的游戏
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: currentAdminId.value
        }
      });
    }

    if (response.success) {
      // 构建游戏选项，添加"全部"选项
      const options = [
        {
          value: '',
          label: '全部游戏'
        }
      ];
      
      if (response.data && response.data.length > 0) {
        response.data.forEach(game => {
          if (game.is_active) {
            options.push({
              value: game.id.toString(),
              label: game.game_name
            });
          }
        });
      }
      
      gameOptions.value = options;
    } else {
      gameOptions.value = [{ value: '', label: '全部游戏' }];
    }
  } catch (error) {
    console.error('加载游戏选项失败:', error);
    gameOptions.value = [{ value: '', label: '全部游戏' }];
  }
};

// 一级渠道变化处理
const onPrimaryChannelChange = async () => {
  // 重置二级渠道选择
  filters.value.secondaryChannelCode = '';
  
  // 加载对应的二级渠道选项
  await loadSecondaryChannelOptions(filters.value.primaryChannelCode);
};

// 加载概览数据和游戏详细数据
const loadOverviewData = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      adminId: currentAdminId.value.toString()
    });

    // 优先使用二级渠道，如果没有则使用一级渠道
    const selectedChannelCode = filters.value.secondaryChannelCode || filters.value.primaryChannelCode;
    if (selectedChannelCode) {
      params.append('channelCode', selectedChannelCode);
    }

    // 添加游戏ID参数
    if (filters.value.gameId) {
      params.append('gameId', filters.value.gameId);
    }

    const response = await $fetch(`/api/admin/data-overview?${params.toString()}`);

    if (response.success) {
      // 更新概览统计数据
      overviewData.value = {
        activeUsers: response.data.activeUsers,
        newUsers: response.data.newUsers,
        payUsers: response.data.payUsers,
        newPayUsers: response.data.newPayUsers,
        payAmount: response.data.payAmount,
        newPayAmount: response.data.newPayAmount,
        payRate: response.data.payRate,
        newPayRate: response.data.newPayRate,
        payArpu: response.data.payArpu,
        totalArpu: response.data.totalArpu,
        newArpu: response.data.newArpu,
        newPayArpu: response.data.newPayArpu,
        startDate: response.data.startDate,
        endDate: response.data.endDate,
        adminLevel: response.data.adminLevel,
        allowedChannels: response.data.allowedChannels
      };
      
      // 更新游戏详细数据
      gameStatsData.value = response.data.gameStats || [];
      
      toast.add({
        title: '数据加载成功',
        description: `共加载 ${gameStatsData.value.length} 个游戏数据`,
        color: 'green'
      });
    } else {
      throw new Error(response.message || '获取概览数据失败');
    }
  } catch (error) {
    console.error('加载概览数据失败:', error);
    toast.add({
      title: '数据加载失败',
      description: error.message || '请检查网络连接后重试',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

// 重置筛选条件
const resetFilters = () => {
  filters.value = {
    startDate: getPastDate(7),
    endDate: getCurrentDate(),
    primaryChannelCode: '',
    secondaryChannelCode: '',
    gameId: ''
  };
  // 重置二级渠道选项
  secondaryChannelOptions.value = [];
  // 重置日期选择器
  selected.value = {
    start: new Date(getPastDate(7)),
    end: new Date(getCurrentDate())
  };
  loadOverviewData();
  
  toast.add({
    title: '条件已重置',
    description: '筛选条件已重置为默认值',
    color: 'blue'
  });
};

// 导出数据
const exportData = async () => {
  exportLoading.value = true;
  try {
    // 获取当前的概览和游戏数据
    const exportData = gameStatsData.value.map(item => ({
      '游戏名称': item.gameName || '',
      '活跃用户数': item.activeUsers || 0,
      '注册用户': item.registerUsers || 0,
      '真实流水(不包含平台币)': Number(item.rechargeAmount || 0).toFixed(2),
      '付费率': `${item.payRate || '0'}%`,
      'ARPU值(元)': Number(item.arpu || 0).toFixed(2)
    }));

    if (exportData.length === 0) {
      throw new Error('没有数据可导出');
    }

    // 动态导入xlsx库
    const XLSX = await import('xlsx');
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
          // 设置列宽
      const colWidths = [
        { wch: 15 }, // 游戏名称
        { wch: 12 }, // 活跃用户数
        { wch: 10 }, // 注册用户
        { wch: 18 }, // 真实流水(不包含平台币)
        { wch: 10 }, // 付费率
        { wch: 12 }  // ARPU值
      ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, '数据概览');
    
    // 生成文件名
    const fileName = `数据概览_${filters.value.startDate}_${filters.value.endDate}.xlsx`;
    
    // 下载文件
    XLSX.writeFile(wb, fileName);
    
    toast.add({
      title: '导出成功',
      description: `已导出 ${exportData.length} 条记录`,
      color: 'green'
    });
  } catch (error) {
    console.error('导出失败:', error);
    toast.add({
      title: '导出失败',
      description: error.message || '导出过程中发生错误',
      color: 'red'
    });
  } finally {
    exportLoading.value = false;
  }
};

</script>

<style scoped>
.overview-data-page {
  @apply space-y-6;
}

.filter-content {
  @apply space-y-4;
}

.filter-row {
  @apply flex gap-4 items-end w-full;
}

.filter-row > * {
  @apply flex-1;
}

@media (max-width: 768px) {
  .filter-row {
    @apply flex-col gap-3 items-stretch;
  }
  
  .filter-row > * {
    @apply w-full;
  }
}

/* 移动端表格容器 */
.mobile-table-container {
  @apply w-full;
}

/* 统一表格样式 */
.uniform-table :deep(table) {
  
  width: 100%;
}

@media (max-width: 768px) {
  .overview-data-page {
    @apply space-y-4;
  }
  
  .mobile-table-container {
    @apply overflow-x-auto;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }
  
  .uniform-table {
    @apply overflow-visible;
  }
  
  .uniform-table :deep(table) {
    min-width: 800px;
    width: max-content;
  }
  
  .uniform-table :deep(th),
  .uniform-table :deep(td) {
    @apply text-xs px-3 py-2;
    white-space: nowrap;
    min-width: 100px;
  }
  
  .uniform-table :deep(th:first-child),
  .uniform-table :deep(td:first-child) {
    min-width: 120px;
  }
  
  .uniform-table :deep(table) {
    border-collapse: collapse;
    border: 1px solid #f1f5f9;
  }

  .uniform-table :deep(th) {
    text-align: center;
    padding: 12px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
    border-right: 1px solid #f1f5f9;
    border-bottom: 1px solid #f1f5f9;
    background-color: #f8fafc;
    font-weight: 600;
  }

  .uniform-table :deep(td) {
    text-align: center;
    padding: 12px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
    border-right: 1px solid #f1f5f9;
    border-bottom: 1px solid #f1f5f9;
  }

  .uniform-table :deep(th:last-child),
  .uniform-table :deep(td:last-child) {
    border-right: none;
  }

  .uniform-table :deep(th:nth-child(1)),
  .uniform-table :deep(td:nth-child(1)) {
    width: 20%;
    text-align: left;
  }

  .uniform-table :deep(th:nth-child(2)),
  .uniform-table :deep(td:nth-child(2)) {
    width: 15%;
  }

  .uniform-table :deep(th:nth-child(3)),
  .uniform-table :deep(td:nth-child(3)) {
    width: 15%;
  }

  .uniform-table :deep(th:nth-child(4)),
  .uniform-table :deep(td:nth-child(4)) {
    width: 25%;
  }

  .uniform-table :deep(th:nth-child(5)),
  .uniform-table :deep(td:nth-child(5)) {
    width: 12%;
  }

  .uniform-table :deep(th:nth-child(6)),
  .uniform-table :deep(td:nth-child(6)) {
    width: 13%;
  }

  .uniform-table :deep(.flex) {
    justify-content: center;
    align-items: center;
  }

  .uniform-table :deep(td:nth-child(1) .flex) {
    justify-content: flex-start;
  }
}
</style>