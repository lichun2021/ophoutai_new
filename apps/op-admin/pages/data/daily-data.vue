<template>
  <div class="daily-data-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-calendar-days" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">日报数据</h2>
          <p class="text-sm text-gray-600 mt-1">查看按日期统计的用户活跃、付费等核心数据指标</p>
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
          统计时间：{{ formatDateRange(filters.startDate, filters.endDate) }}
        </UBadge>
      </div>
      
      <div class="stats-grid mb-6">
      <!-- 用户相关指标 -->
      <UCard class="p-4 relative">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 mb-3">{{ formatNumber(overviewData.activeUsers) }}</div>
          <div class="flex items-center justify-center gap-2">
            <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-blue-500" />
            <span class="text-sm text-gray-600">活跃用户数</span>
            <UPopover mode="hover">
              <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
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
              <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
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
              <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 text-gray-400 cursor-help" />
              <template #panel>
                <div class="p-3 max-w-xs">
                  <div class="text-xs text-gray-600 mb-2">统计期间内有付费行为的去重用户数</div>
                  <div class="text-xs text-red-600">⚠️ 不包含平台币消费</div>
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
                  <div class="text-xs text-red-600">⚠️ 不包含平台币消费</div>
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
                  <div class="text-xs text-red-600">⚠️ 不包含平台币消费</div>
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
                  <div class="text-xs text-red-600">⚠️ 不包含平台币消费</div>
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
                  <div class="text-xs text-gray-600 mb-2">付费用户数 ÷ 活跃用户数 × 100%</div>
                  <div class="text-xs text-red-600">⚠️ 不包含平台币消费</div>
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
                  <div class="text-xs text-gray-600 mb-2">新增付费用户数 ÷ 新增用户数 × 100%</div>
                  <div class="text-xs text-red-600">⚠️ 不包含平台币消费</div>
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
                  <div class="text-xs text-gray-600 mb-2">新增付费金额 ÷ 新增付费用户数</div>
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
            @click="loadDailyReportData" 
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

    <!-- 日报详细数据表格 -->
    <div class="table-section">
      <UCard>
        <template #header>
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
              <h3 class="text-base font-medium">日报详细数据</h3>
              <UBadge v-if="dailyStatsData.length > 0" :label="`${dailyStatsData.length}天数据`" variant="soft" size="xs" />
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
        <div v-else class="w-full">
          <div v-if="paginatedData.length === 0" class="empty-state">
            <UIcon name="i-heroicons-calendar-days" class="empty-state-icon" />
            <h3 class="text-lg font-medium text-gray-900 mb-2">暂无日报数据</h3>
            <p class="text-gray-500">请调整筛选条件后重新查询</p>
          </div>
          
          <!-- 表格外层容器 -->
          <div v-else class="table-wrapper">
            <!-- 表格滚动容器 -->
            <div class="table-scroll-container">
              <table class="daily-report-table">
                <thead>
                  <tr>
                    <th v-for="column in dailyColumns" :key="column.key" 
                        class="table-header" 
                        :class="{ 'sticky-date-header': column.key === 'date' }"
                        :style="column.key === 'date' ? 'width: 150px;' : 'width: 125px;'">
                      {{ column.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in paginatedData" :key="row.date" class="table-row">
                    <!-- 日期列 -->
                    <td class="table-cell sticky-date-cell" style="width: 150px;">
                      <div class="flex items-center gap-2">
                        <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-gray-400" />
                        <span class="font-medium">{{ formatDate(row.date) }}</span>
                      </div>
                    </td>
                    
                    <!-- 活跃用户数 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.activeUsers || 0)" color="blue" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 注册数 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.registerUsers || 0)" color="purple" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 有效注册数 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.validRegisterUsers || 0)" color="violet" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 新增用户 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.newUsers || 0)" color="green" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 昨日留存 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="`${row.yesterdayRetention || '0'}%`" color="amber" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 充值人数 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.payUsers || 0)" color="orange" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 新增充值人数 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.newPayUsers || 0)" color="red" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 充值次数 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.rechargeTimes || 0)" color="indigo" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 充值超100用户 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="formatNumber(row.highValueUsers || 0)" color="pink" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 消费流水 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-currency-yen" class="w-4 h-4 text-red-500" />
                        <span class="font-medium text-red-600">{{ formatAmount(row.consumeAmount) }}</span>
                      </div>
                    </td>
                    
                    <!-- 真实流水 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-green-500" />
                        <span class="font-medium text-green-600">{{ formatAmount(row.realRechargeAmount) }}</span>
                      </div>
                    </td>
                    
                    <!-- 新增用户充值 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-arrow-trending-up" class="w-4 h-4 text-emerald-500" />
                        <span class="font-medium text-emerald-600">{{ formatAmount(row.newUserRecharge) }}</span>
                      </div>
                    </td>
                    
                    <!-- 付费率 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="`${row.payRate || '0'}%`" color="cyan" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 新增付费率 -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex justify-center">
                        <UBadge :label="`${row.newPayRate || '0'}%`" color="teal" variant="soft" />
                      </div>
                    </td>
                    
                    <!-- 活跃ARPU -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-calculator" class="w-4 h-4 text-yellow-500" />
                        <span class="font-medium text-yellow-600">{{ formatAmount(row.activeArpu) }}</span>
                      </div>
                    </td>
                    
                    <!-- 付费ARPU -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-scale" class="w-4 h-4 text-orange-500" />
                        <span class="font-medium text-orange-600">{{ formatAmount(row.payArpu) }}</span>
                      </div>
                    </td>
                    
                    <!-- 新增ARPU -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-presentation-chart-line" class="w-4 h-4 text-violet-500" />
                        <span class="font-medium text-violet-600">{{ formatAmount(row.newArpu) }}</span>
                      </div>
                    </td>
                    
                    <!-- 新增付费ARPU -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-pink-500" />
                        <span class="font-medium text-pink-600">{{ formatAmount(row.newPayArpu) }}</span>
                      </div>
                    </td>
                    
                    <!-- LTV(2天) -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-blue-500" />
                        <span class="font-medium text-blue-600">{{ formatAmount(row.ltv2) }}</span>
                      </div>
                    </td>
                    
                    <!-- LTV(3天) -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-green-500" />
                        <span class="font-medium text-green-600">{{ formatAmount(row.ltv3) }}</span>
                      </div>
                    </td>
                    
                    <!-- LTV(5天) -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-purple-500" />
                        <span class="font-medium text-purple-600">{{ formatAmount(row.ltv5) }}</span>
                      </div>
                    </td>
                    
                    <!-- LTV(7天) -->
                    <td class="table-cell" style="width: 125px;">
                      <div class="flex items-center justify-center gap-1">
                        <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-red-500" />
                        <span class="font-medium text-red-600">{{ formatAmount(row.ltv7) }}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="pagination.total > 0" class="flex justify-between items-center mt-6 pt-4 border-t">
            <div class="text-sm text-gray-600">
              共 {{ pagination.total }} 条记录，第 {{ pagination.page }} / {{ Math.ceil(pagination.total / pagination.pageSize) }} 页
            </div>
            <div v-if="Math.ceil(pagination.total / pagination.pageSize) > 1" class="flex items-center gap-2">
              <UButton
                v-if="pagination.page > 1"
                @click="handlePageChange(pagination.page - 1)"
                variant="outline"
                size="sm"
                icon="i-heroicons-chevron-left"
                :disabled="loading"
              >
                上一页
              </UButton>
              
              <div class="flex items-center gap-1">
                <UButton
                  v-for="page in getVisiblePages()"
                  :key="page"
                  @click="handlePageChange(page)"
                  :variant="page === pagination.page ? 'solid' : 'outline'"
                  size="sm"
                  :disabled="loading"
                >
                  {{ page }}
                </UButton>
              </div>
              
              <UButton
                v-if="pagination.page < Math.ceil(pagination.total / pagination.pageSize)"
                @click="handlePageChange(pagination.page + 1)"
                variant="outline"
                size="sm"
                icon="i-heroicons-chevron-right"
                :disabled="loading"
              >
                下一页
              </UButton>
            </div>
            <div v-else class="text-xs text-gray-500">
              所有数据已显示
            </div>
          </div>
        </div>
      </UCard>
    </div>



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

// 辅助函数：获取过去N天的日期 - 修复时区问题
const getPastDate = (days) => {
  const date = new Date();
  // 要得到N天的数据（包含今天），应该减去 (N-1) 天
  date.setDate(date.getDate() - (days - 1));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 辅助函数：获取当前日期 - 修复时区问题
const getCurrentDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
const dailyColumns = [
  // 基础信息组
  {
    key: 'date',
    label: '日期',
    sortable: true
  },
  {
    key: 'activeUsers',
    label: '活跃用户数',
    sortable: true
  },
  {
    key: 'registerUsers',
    label: '注册数',
    sortable: true
  },
  {
    key: 'validRegisterUsers',
    label: '有效注册数',
    sortable: true
  },
  {
    key: 'newUsers',
    label: '新增用户',
    sortable: true
  },
  {
    key: 'yesterdayRetention',
    label: '昨日留存(%)',
    sortable: true
  },
  
  // 付费用户组
  {
    key: 'payUsers',
    label: '充值人数',
    sortable: true
  },
  {
    key: 'newPayUsers',
    label: '新增充值人数',
    sortable: true
  },
  {
    key: 'rechargeTimes',
    label: '充值次数',
    sortable: true
  },
  {
    key: 'highValueUsers',
    label: '充值超100用户',
    sortable: true
  },
  
  // 流水组
  {
    key: 'consumeAmount',
    label: '消费流水',
    sortable: true
  },
  {
    key: 'realRechargeAmount',
    label: '真实流水',
    sortable: true
  },
  {
    key: 'newUserRecharge',
    label: '新增用户充值',
    sortable: true
  },
  
  // 比率组
  {
    key: 'payRate',
    label: '付费率(%)',
    sortable: true
  },
  {
    key: 'newPayRate',
    label: '新增付费率(%)',
    sortable: true
  },
  
  // ARPU组
  {
    key: 'activeArpu',
    label: '活跃ARPU',
    sortable: true
  },
  {
    key: 'payArpu',
    label: '付费ARPU',
    sortable: true
  },
  {
    key: 'newArpu',
    label: '新增ARPU',
    sortable: true
  },
  {
    key: 'newPayArpu',
    label: '新增付费ARPU',
    sortable: true
  },
  
  // LTV组
  {
    key: 'ltv2',
    label: 'LTV(2天)',
    sortable: true
  },
  {
    key: 'ltv3',
    label: 'LTV(3天)',
    sortable: true
  },
  {
    key: 'ltv5',
    label: 'LTV(5天)',
    sortable: true
  },
  {
    key: 'ltv7',
    label: 'LTV(7天)',
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

// 日报统计数据
const dailyStatsData = ref([]);

// 分页数据
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
});

// 下拉选项
const primaryChannelOptions = ref([]);
const secondaryChannelOptions = ref([]);
const gameOptions = ref([]);

// 计算属性
const currentAdminId = computed(() => {
  if (authStore.isUser) {
    return authStore.userInfo?.id || '';
  } else {
    return authStore.id || '';
  }
});

const currentAdminLevel = computed(() => {
  if (authStore.isUser) {
    return authStore.userInfo?.level || 0;
  } else {
    return authStore.permissions?.level || 0;
  }
});

// 分页数据
const paginatedData = computed(() => {
  const start = (pagination.value.page - 1) * pagination.value.pageSize;
  const end = start + pagination.value.pageSize;
  return dailyStatsData.value.slice(start, end);
});

// 监听DatePicker选择变化 - 修复时区问题
watch(selected, (newSelected) => {
  if (newSelected.start && newSelected.end) {
    // 使用本地日期，避免时区转换
    const startYear = newSelected.start.getFullYear();
    const startMonth = String(newSelected.start.getMonth() + 1).padStart(2, '0');
    const startDay = String(newSelected.start.getDate()).padStart(2, '0');
    filters.value.startDate = `${startYear}-${startMonth}-${startDay}`;
    
    const endYear = newSelected.end.getFullYear();
    const endMonth = String(newSelected.end.getMonth() + 1).padStart(2, '0');
    const endDay = String(newSelected.end.getDate()).padStart(2, '0');
    filters.value.endDate = `${endYear}-${endMonth}-${endDay}`;
  }
}, { deep: true });

// 页面初始化
onMounted(async () => {
  await Promise.all([
    loadPrimaryChannelOptions(),
    loadGameOptions(),
    loadDailyReportData()
  ]);
});

// 加载一级渠道选项
const loadPrimaryChannelOptions = async () => {
  try {
    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        adminId: currentAdminId.value
      }
    });

    if (response.success) {
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
      primaryChannelOptions.value = [];
    }
  } catch (error) {
    console.error('加载一级渠道选项失败:', error);
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

    const response = await $fetch('/api/admin/get-child-channels', {
      method: 'POST',
      body: {
        parentChannelCode: primaryChannelCode
      }
    });

    if (response.success) {
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
    
    if (currentAdminLevel.value === 0) {
      response = await $fetch('/api/admin/games');
    } else {
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: currentAdminId.value
        }
      });
    }

    if (response.success) {
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
  filters.value.secondaryChannelCode = '';
  await loadSecondaryChannelOptions(filters.value.primaryChannelCode);
};

// 加载日报数据
const loadDailyReportData = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      adminId: currentAdminId.value.toString()
    });

    const selectedChannelCode = filters.value.secondaryChannelCode || filters.value.primaryChannelCode;
    if (selectedChannelCode) {
      params.append('channelCode', selectedChannelCode);
    }

    if (filters.value.gameId) {
      params.append('gameId', filters.value.gameId);
    }

    // 首先获取概览数据
    const overviewResponse = await $fetch(`/api/admin/data-overview?${params.toString()}`);
    
    if (overviewResponse.success) {
      overviewData.value = {
        activeUsers: overviewResponse.data.activeUsers,
        newUsers: overviewResponse.data.newUsers,
        payUsers: overviewResponse.data.payUsers,
        newPayUsers: overviewResponse.data.newPayUsers,
        payAmount: overviewResponse.data.payAmount,
        newPayAmount: overviewResponse.data.newPayAmount,
        payRate: overviewResponse.data.payRate,
        newPayRate: overviewResponse.data.newPayRate,
        payArpu: overviewResponse.data.payArpu,
        totalArpu: overviewResponse.data.totalArpu,
        newArpu: overviewResponse.data.newArpu,
        newPayArpu: overviewResponse.data.newPayArpu,
        startDate: overviewResponse.data.startDate,
        endDate: overviewResponse.data.endDate,
        adminLevel: overviewResponse.data.adminLevel,
        allowedChannels: overviewResponse.data.allowedChannels
      };
    }

    // 获取日报详细数据
    params.append('groupBy', 'date');
    const dailyResponse = await $fetch(`/api/admin/daily-report-details?${params.toString()}`);
    
    if (dailyResponse.success) {
      dailyStatsData.value = dailyResponse.data.details || [];
      // 更新分页信息
      pagination.value.total = dailyStatsData.value.length;
      pagination.value.page = 1; // 重置到第一页
      
      toast.add({
        title: '数据加载成功',
        description: `共加载 ${dailyStatsData.value.length} 天数据`,
        color: 'green'
      });
    } else {
      dailyStatsData.value = [];
      throw new Error(dailyResponse.message || '获取日报详细数据失败');
    }

  } catch (error) {
    console.error('加载日报数据失败:', error);
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
  secondaryChannelOptions.value = [];
  // 重置日期选择器
  selected.value = {
    start: new Date(getPastDate(7)),
    end: new Date(getCurrentDate())
  };
  pagination.value.page = 1;
  loadDailyReportData();
  
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
    // 获取当前的日报数据
    const exportData = dailyStatsData.value.map(item => ({
      '日期': formatDate(item.date),
      '活跃用户数': item.activeUsers || 0,
      '注册数': item.registerUsers || 0,
      '有效注册数': item.validRegisterUsers || 0,
      '新增用户': item.newUsers || 0,
      '昨日留存(%)': item.yesterdayRetention || '0',
      '充值人数': item.payUsers || 0,
      '新增充值人数': item.newPayUsers || 0,
      '充值次数': item.rechargeTimes || 0,
      '充值超100用户': item.highValueUsers || 0,
      '消费流水': Number(item.consumeAmount || 0).toFixed(2),
      '真实流水': Number(item.realRechargeAmount || 0).toFixed(2),
      '新增用户充值': Number(item.newUserRecharge || 0).toFixed(2),
      '付费率(%)': item.payRate || '0',
      '新增付费率(%)': item.newPayRate || '0',
      '活跃ARPU': Number(item.activeArpu || 0).toFixed(2),
      '付费ARPU': Number(item.payArpu || 0).toFixed(2),
      '新增ARPU': Number(item.newArpu || 0).toFixed(2),
      '新增付费ARPU': Number(item.newPayArpu || 0).toFixed(2),
      'LTV(2天)': Number(item.ltv2 || 0).toFixed(2),
      'LTV(3天)': Number(item.ltv3 || 0).toFixed(2),
      'LTV(5天)': Number(item.ltv5 || 0).toFixed(2),
      'LTV(7天)': Number(item.ltv7 || 0).toFixed(2)
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
      { wch: 12 }, // 日期
      { wch: 12 }, // 活跃用户数
      { wch: 10 }, // 注册数
      { wch: 12 }, // 有效注册数
      { wch: 12 }, // 新增用户
      { wch: 12 }, // 昨日留存
      { wch: 12 }, // 充值人数
      { wch: 15 }, // 新增充值人数
      { wch: 12 }, // 充值次数
      { wch: 15 }, // 充值超100用户
      { wch: 12 }, // 消费流水
      { wch: 12 }, // 真实流水
      { wch: 15 }, // 新增用户充值
      { wch: 12 }, // 付费率
      { wch: 15 }, // 新增付费率
      { wch: 12 }, // 活跃ARPU
      { wch: 12 }, // 付费ARPU
      { wch: 12 }, // 新增ARPU
      { wch: 15 }, // 新增付费ARPU
      { wch: 12 }, // LTV(2天)
      { wch: 12 }, // LTV(3天)
      { wch: 12 }, // LTV(5天)
      { wch: 12 }  // LTV(7天)
    ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, '日数据');
    
    // 生成文件名
    const fileName = `日数据完整报表_${filters.value.startDate}_${filters.value.endDate}.xlsx`;
    
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

// 格式化日期显示 - 避免时区问题
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  
  // 如果是字符串，直接处理，避免创建Date对象
  if (typeof dateStr === 'string') {
    // 如果包含时间部分，只取日期部分
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    // 如果是纯日期格式 YYYY-MM-DD，直接返回
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }
  }
  
  // 如果是Date对象，使用本地时区的年月日，避免UTC转换
  if (dateStr instanceof Date) {
    const year = dateStr.getFullYear();
    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
    const day = String(dateStr.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return String(dateStr);
};

// 分页数据
const onPageChange = (newPage) => {
  pagination.value.page = newPage;
};

// 获取可见的页码
const getVisiblePages = () => {
  const totalPages = Math.ceil(pagination.value.total / pagination.value.pageSize);
  const visiblePages = [];
  const maxVisiblePages = 7;
  let startPage = Math.max(pagination.value.page - Math.floor(maxVisiblePages / 2), 1);
  let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(endPage - maxVisiblePages + 1, 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    visiblePages.push(i);
  }

  return visiblePages;
};

// 处理页码变化
const handlePageChange = (newPage) => {
  pagination.value.page = newPage;
};
</script>

<style scoped>
.daily-data-page {
  @apply space-y-6;
  width: 100%;
}

/* 统计卡片容器 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  width: 100%;
  margin: 0 2px; /* 左右留出边距确保边框可见 */
  padding: 2px; /* 内边距确保边框不被裁剪 */
  box-sizing: border-box;
}

@media (min-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 1280px) {
  .stats-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

/* 表格区域专门的overflow控制 */
.table-section {
  overflow-x: hidden;
  width: 100%;
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

/* 表格外层容器 */
.table-wrapper {
  width: calc(100vw - 256px - 48px - 17px - 24px); /* 桌面端: 侧边栏256px + page-content左右padding48px + 滚动条17px + 安全边距24px */
  max-width: calc(100vw - 256px - 48px - 17px - 24px);
  overflow: hidden;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  background: white;
  box-sizing: border-box;
}

/* 表格滚动容器 */
.table-scroll-container {
  width: calc(100vw - 256px - 48px - 17px - 24px);
  max-width: calc(100vw - 256px - 48px - 17px - 24px);
  overflow-x: auto;
  overflow-y: visible;
  box-sizing: border-box;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .table-wrapper {
    width: calc(100vw - 224px - 32px - 17px - 24px); /* 中等屏幕: 侧边栏224px + page-content左右padding32px + 滚动条17px + 安全边距24px */
    max-width: calc(100vw - 224px - 32px - 17px - 24px);
  }
  
  .table-scroll-container {
    width: calc(100vw - 224px - 32px - 17px - 24px);
    max-width: calc(100vw - 224px - 32px - 17px - 24px);
  }
}

@media (max-width: 768px) {
  .table-wrapper {
    width: calc(100vw - 24px); /* 移动端: 只考虑页面padding */
    max-width: calc(100vw - 24px);
  }
  
  .table-scroll-container {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
  }
}

/* 表格样式优化 */
.daily-report-table {
  width: 3025px; /* 精确计算：日期列150px + 23个普通列125px = 3025px */
  min-width: 3025px;
  border-collapse: collapse;
  background: white;
   /* 使用固定布局 */
  border: 1px solid #e5e7eb; /* 添加表格外边框 */
}

.table-header {
  background-color: #f1f5f9; /* 稍微深一点的灰色背景 */
  padding: 8px 12px;
  text-align: center;
  font-weight: 600;
  font-size: 13px;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
  border-right: 1px solid #e5e7eb; /* 添加右边框 */
  white-space: nowrap;
  width: 125px; /* 固定列宽 */
  position: sticky;
  top: 0;
  z-index: 5;
}

.table-header:last-child {
  border-right: none; /* 最后一列不显示右边框 */
}

.table-cell:last-child {
  border-right: none; /* 最后一列不显示右边框 */
}

/* 固定日期列头部 */
.sticky-date-header {
  position: sticky !important;
  left: 0;
  z-index: 15 !important;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
  background-color: #f1f5f9 !important; /* 稍微深一点的灰色背景 */
  border-right: 2px solid #e5e7eb !important; /* 确保右边框 */
  width: 150px !important; /* 日期列稍宽 */
}

/* 表格行样式 */
.table-row {
  border-bottom: 1px solid #f3f4f6;
}

.table-row:hover {
  background-color: #f9fafb;
}

/* 表格单元格样式 */
.table-cell {
  padding: 8px 12px;
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
  width: 125px; /* 固定列宽 */
  border-right: 1px solid #f3f4f6;
  border-bottom: 1px solid #f3f4f6; /* 添加底部边框 */
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 固定日期列单元格 */
.sticky-date-cell {
  position: sticky !important;
  left: 0;
  background-color: white !important;
  z-index: 10 !important;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
  border-right: 2px solid #e5e7eb !important;
  border-bottom: 1px solid #f3f4f6 !important; /* 添加底部边框 */
  font-weight: 500;
  width: 150px !important; /* 日期列稍宽 */
}

.table-row:hover .sticky-date-cell {
  background-color: #f9fafb !important;
}

/* 滚动条样式 */
.table-scroll-container::-webkit-scrollbar {
  height: 12px;
}

.table-scroll-container::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 6px;
}

.table-scroll-container::-webkit-scrollbar-thumb {
  background: #94a3b8;
  border-radius: 6px;
  border: 2px solid #f1f5f9;
}

.table-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

/* 空数据状态样式 */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: #6b7280;
}

.empty-state-icon {
  margin: 0 auto 16px;
  width: 48px;
  height: 48px;
  color: #d1d5db;
}

/* 统计卡片中问号图标对齐 */
.daily-data-page :deep(.text-center .flex) {
  align-items: center !important;
}

/* 所有问号图标的通用对齐样式 */
.daily-data-page :deep([class*="i-heroicons-question-mark-circle"]),
.daily-data-page :deep(svg[data-name="i-heroicons-question-mark-circle"]),
.daily-data-page :deep(.i-heroicons-question-mark-circle) {
  vertical-align: middle !important;
  display: inline-block !important;
  margin-top: -2px !important;
  line-height: 1 !important;
}

/* 确保Flex容器内的图标正确对齐 */
.daily-data-page :deep(.flex .i-heroicons-question-mark-circle),
.daily-data-page :deep(.flex [class*="i-heroicons-question-mark-circle"]) {
  align-self: center !important;
  flex-shrink: 0 !important;
}

/* UIcon组件内的问号图标特殊处理 */
.daily-data-page :deep(.text-center .flex svg) {
  vertical-align: middle !important;
}

.daily-data-page :deep(.text-center .gap-2) {
  align-items: center !important;
}

/* 针对具体的问号图标SVG */
.daily-data-page :deep(svg[viewBox="0 0 24 24"]) {
  vertical-align: baseline !important;
  margin-top: 1px !important;
}

/* Badge和图标的容器对齐 */
.daily-data-page :deep(.flex) {
  display: flex !important;
  align-items: center !important;
}

.daily-data-page :deep(.justify-center) {
  justify-content: center !important;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .filter-row {
    @apply flex-col gap-3;
  }
  
  .filter-row > * {
    @apply w-full;
  }
  
  .table-header {
    font-size: 12px;
    padding: 8px 10px;
    min-width: 100px;
  }
  
  .table-cell {
    font-size: 12px;
    padding: 8px 10px;
    min-width: 100px;
  }
  
  .sticky-date-header {
    min-width: 100px !important;
  }
  
  .sticky-date-cell {
    min-width: 100px !important;
  }
}
</style> 