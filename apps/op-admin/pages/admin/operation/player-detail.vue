<template>
  <div class="player-detail-page">
    <UCard class="mb-6">
      <template #header>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">玩家详情查询</h2>
            <p class="text-sm text-gray-500">支持用户ID、用户名、角色ID(playerId)、子账号ID(openId)查询</p>
          </div>
          <div class="flex items-center gap-3">
            <UFormGroup label="玩家标识">
              <UInput
                v-model="userIdInput"
                placeholder="用户ID/用户名/角色ID/子账号ID"
                type="text"
                size="md"
                class="w-64"
                @keyup.enter="handleSearch"
              />
            </UFormGroup>
            <UButton
              color="primary"
              :loading="loading"
              icon="i-heroicons-magnifying-glass"
              @click="handleSearch"
            >
              查询
            </UButton>
          </div>
        </div>
      </template>

      <div v-if="result" class="summary-grid">
        <UCard class="summary-card">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold text-gray-900">玩家信息</h3>
              <UBadge color="blue" variant="subtle">ID: {{ result.user.id }}</UBadge>
            </div>
          </template>
          <div class="summary-content">
            <div class="summary-item">
              <span class="label">用户名</span>
              <span class="value font-semibold">{{ result.user.username }}</span>
            </div>
            <div class="summary-item">
              <span class="label">用户ID</span>
              <span class="value font-semibold">{{ result.user.id }}</span>
            </div>
            <div class="summary-item">
              <span class="label">渠道代码</span>
              <div class="value password-value">
                <span class="font-semibold">{{ result.user.channelCode || '-' }}</span>
                <UButton
                  size="xs"
                  color="orange"
                  variant="outline"
                  class="ml-2"
                  @click="openChannelDialog"
                >
                  修改
                </UButton>
              </div>
            </div>
            <div class="summary-item">
              <span class="label">登录密码</span>
              <div class="value password-value">
                <span class="text-gray-400 italic">******</span>
                <UButton
                  size="xs"
                  color="blue"
                  variant="outline"
                  class="ml-2"
                  @click="openVerifyPasswordDialog"
                >
                  验证
                </UButton>
                <UButton
                  size="xs"
                  color="gray"
                  variant="outline"
                  class="ml-2"
                  @click="openPasswordDialog"
                >
                  修改
                </UButton>
              </div>
            </div>
            <div class="summary-item">
              <span class="label">账号创建时间</span>
              <span class="value">{{ formatDate(result.user.createdAt) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">支付记录数量</span>
              <span class="value">{{ result.summary.paymentsCount }}</span>
            </div>
            <div class="summary-item">
              <span class="label">第一次支付时间</span>
              <span class="value">{{ formatDate(result.summary.firstPaymentAt) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">最近一次支付</span>
              <span class="value">{{ formatDate(result.summary.lastPaymentAt) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">账号状态</span>
              <div class="value flex items-center gap-2">
                <UBadge :color="result.user.status === 1 ? 'red' : 'green'" variant="subtle">
                  {{ result.user.status === 1 ? '封号' : '正常' }}
                </UBadge>
                <span v-if="result.user.status === 1" class="text-xs text-red-500">
                  封号时间: {{ formatDate(result.user.bannedAt) }}
                </span>
              </div>
            </div>
            <div class="summary-item" style="grid-column: 1 / -1">
              <span class="label">备注</span>
              <div class="value remark-value">
                <span v-if="result.user.remark" class="remark-text">{{ result.user.remark }}</span>
                <span v-else class="text-gray-400 italic text-sm">暂无备注</span>
                <UButton
                  size="xs"
                  color="teal"
                  variant="outline"
                  class="ml-2"
                  icon="i-heroicons-pencil-square"
                  @click="openRemarkDialog"
                >
                  编辑备注
                </UButton>
              </div>
            </div>
            <div class="summary-item" style="grid-column: 1 / -1">
              <span class="label">月卡 / 终身卡</span>
              <div class="value flex items-center gap-2 flex-wrap">
                <template v-if="playerCards.length > 0">
                  <UBadge
                    v-for="card in playerCards.filter(c => c.is_active)"
                    :key="card.id"
                    :color="card.card_type === 'lifetime' ? 'purple' : 'blue'"
                    variant="subtle"
                  >
                    {{ card.card_type === 'lifetime' ? '终身卡' : '月卡' }}
                    · {{ card.daily_coins }}币/天
                    <span v-if="card.expire_date">· 至{{ card.expire_date }}</span>
                    <span v-else>· 永久</span>
                  </UBadge>
                  <span v-if="playerCards.filter(c => c.is_active).length === 0" class="text-gray-400 italic text-sm">无有效卡</span>
                </template>
                <span v-else-if="cardsLoading" class="text-gray-400 text-sm">加载中...</span>
                <span v-else class="text-gray-400 italic text-sm">暂无月卡</span>
                <UButton
                  size="xs"
                  color="violet"
                  variant="outline"
                  icon="i-heroicons-credit-card"
                  @click="openActivateCardDialog"
                >
                  激活月卡
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <UCard class="summary-card">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold text-gray-900">消费统计</h3>
              <UBadge color="green" variant="subtle">现金 & 平台币</UBadge>
            </div>
          </template>
          <div class="summary-content">
            <div class="summary-item">
              <span class="label">现金消费总额</span>
              <span class="value text-orange-600">¥{{ formatCurrency(result.summary.totalCashAmount) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">平台币消费总额</span>
              <span class="value text-indigo-600">{{ formatNumber(result.summary.totalPlatformCoinSpent) }} 币</span>
            </div>
            <div class="summary-item">
              <span class="label">礼包现金消费</span>
              <span class="value text-rose-600">¥{{ formatCurrency(result.summary.totalGiftCashSpent) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">现金充值总额</span>
              <span class="value text-emerald-600">¥{{ formatCurrency(result.summary.totalCashRecharge) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">当前平台币余额</span>
              <span class="value text-blue-600">{{ formatNumber(result.user.platformCoinsBalance) }}</span>
            </div>
            <!-- <div class="summary-item">
              <span class="label">累计消费触发值</span>
              <span class="value text-purple-600 font-semibold">{{ formatNumber(result.summary.cashbackTriggerValue) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">昨日每日消费触发值</span>
              <span class="value text-yellow-600">{{ formatNumber(result.summary.yesterdayCashbackTriggerValue) }}</span>
            </div>
            <div class="summary-item">
              <span class="label">今日每日消费触发值</span>
              <span class="value text-green-600 font-semibold">{{ formatNumber(result.summary.todayCashbackTriggerValue) }}</span>
            </div> -->

          </div>
        </UCard>
      </div>

      <div v-if="!result && !loading" class="empty-state">
        <div class="text-center py-12 text-gray-500">
          <p>请输入玩家标识并点击查询查看详情</p>
          <p class="text-xs mt-2">支持：用户ID、用户名、角色ID(playerId)、子账号ID(openId)</p>
        </div>
      </div>
    </UCard>

    <div v-if="result">
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">角色消费统计</h3>
            <p class="text-sm text-gray-500">平台币花费与礼包现金消费分角色统计</p>
          </div>
        </template>

        <div v-if="result.roleStats.length > 0" class="overflow-hidden rounded-lg border border-gray-200">
          <table class="w-full table-auto text-sm">
            <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left">角色ID</th>
                <th class="px-4 py-3 text-left">区服</th>
                <th class="px-4 py-3 text-center">等级</th>
                <th class="px-4 py-3 text-right">平台币花费</th>
                <th class="px-4 py-3 text-right">礼包现金</th>
                <th class="px-4 py-3 text-right">累计触发值</th>
                <th class="px-4 py-3 text-right">昨日触发值</th>
                <th class="px-4 py-3 text-right">今日触发值</th>
                <th class="px-4 py-3 text-right">最近消费时间</th>
                <th class="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="stat in result.roleStats" :key="stat.roleId" class="hover:bg-gray-50 transition">
                <td class="px-4 py-3 font-medium text-gray-900">
                  {{ stat.roleId }}
                </td>
                <td class="px-4 py-3 text-gray-600">
                  {{ stat.serverName }} ({{ stat.serverId }})
                </td>
                <td class="px-4 py-3 text-center text-gray-600">
                  Lv.{{ stat.level || 1 }}
                </td>
                <td class="px-4 py-3 text-right text-indigo-600">
                  {{ formatNumber(stat.platformCoinSpent) }}
                </td>
                <td class="px-4 py-3 text-right text-rose-600">
                  ¥{{ formatCurrency(stat.giftCashSpent) }}
                </td>
                <td class="px-4 py-3 text-right font-semibold text-purple-600">
                  {{ formatNumber(stat.cashbackTriggerValue) }}
                </td>
                <td class="px-4 py-3 text-right font-semibold text-orange-600">
                  {{ formatNumber(stat.yesterdayCashbackTriggerValue || 0) }}
                </td>
                <td class="px-4 py-3 text-right font-semibold text-green-600">
                  {{ formatNumber(stat.todayCashbackTriggerValue || 0) }}
                </td>
                <td class="px-4 py-3 text-right text-gray-500">
                  {{ formatDate(stat.lastPurchaseAt) }}
                </td>
                <td class="px-4 py-3 text-center">
                  <UButton
                    size="xs"
                    color="orange"
                    variant="outline"
                    @click="openRoleServerDialog(stat)"
                  >
                    修改区服
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="py-10 text-center text-gray-500">
          暂无消费记录
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">最近支付订单（最多50条）</h3>
            <p class="text-sm text-gray-500">显示最近成功订单的原始信息，便于快速排查</p>
          </div>
        </template>

        <div class="overflow-auto">
          <table class="w-full table-auto text-xs sm:text-sm">
            <thead class="bg-gray-50 text-gray-600 uppercase tracking-wide">
              <tr>
                <th class="px-3 py-2 text-left">时间</th>
                <th class="px-3 py-2 text-left">支付方式</th>
                <th class="px-3 py-2 text-left">金额</th>
                <th class="px-3 py-2 text-left">角色ID</th>
                <th class="px-3 py-2 text-left">礼包</th>
                <th class="px-3 py-2 text-left">商品</th>
                <th class="px-3 py-2 text-left">订单信息</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="record in result.records.payments" :key="record.id">
                <td class="px-3 py-2 text-gray-600">
                  {{ formatDateTime(record.created_at) }}
                </td>
                <td class="px-3 py-2 font-medium">
                  {{ record.payment_way || '-' }}
                </td>
                <td class="px-3 py-2">
                  <span v-if="isPlatformCoinPayment(record.payment_way)" class="text-indigo-600">
                    {{ formatNumber(record.amount) }} 币
                  </span>
                  <span v-else class="text-orange-600">
                    ¥{{ formatCurrency(record.amount) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-gray-600">
                  {{ record.role_id || '-' }}
                </td>
                <td class="px-3 py-2">
                  <UBadge v-if="isGiftOrder(record.server_url)" color="rose" variant="subtle">礼包</UBadge>
                  <span v-else class="text-gray-400">-</span>
                </td>
                <td class="px-3 py-2 text-gray-600">
                  {{ record.product_name || '-' }}
                </td>
                <td class="px-3 py-2 text-gray-500">
                  <div>交易号: {{ record.transaction_id || '-' }}</div>
                  <div>商户单号: {{ record.mch_order_id || '-' }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- 月卡管理卡片 -->
      <UCard class="mt-6">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">月卡 / 终身卡记录</h3>
            <UButton
              size="sm"
              color="violet"
              icon="i-heroicons-plus"
              @click="openActivateCardDialog"
            >
              手动激活
            </UButton>
          </div>
        </template>

        <div v-if="cardsLoading" class="py-8 text-center text-gray-400">加载中...</div>
        <div v-else-if="playerCards.length === 0" class="py-8 text-center text-gray-400">暂无月卡记录</div>
        <div v-else class="overflow-auto">
          <table class="w-full table-auto text-sm">
            <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
              <tr>
                <th class="px-3 py-2 text-left">ID</th>
                <th class="px-3 py-2 text-left">类型</th>
                <th class="px-3 py-2 text-right">每日赠币</th>
                <th class="px-3 py-2 text-left">开始日期</th>
                <th class="px-3 py-2 text-left">到期日期</th>
                <th class="px-3 py-2 text-center">状态</th>
                <th class="px-3 py-2 text-left">创建时间</th>
                <th class="px-3 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="card in playerCards" :key="card.id" class="hover:bg-gray-50 transition">
                <td class="px-3 py-2 text-gray-500">{{ card.id }}</td>
                <td class="px-3 py-2">
                  <UBadge :color="card.card_type === 'lifetime' ? 'purple' : 'blue'" variant="subtle">
                    {{ card.card_type === 'lifetime' ? '终身卡' : '月卡' }}
                  </UBadge>
                </td>
                <td class="px-3 py-2 text-right font-semibold text-indigo-600">{{ card.daily_coins }} 币</td>
                <td class="px-3 py-2 text-gray-600">{{ card.start_date }}</td>
                <td class="px-3 py-2 text-gray-600">{{ card.expire_date || '永久' }}</td>
                <td class="px-3 py-2 text-center">
                  <UBadge :color="card.is_active ? 'green' : 'gray'" variant="subtle">
                    {{ card.is_active ? '有效' : '已停用' }}
                  </UBadge>
                </td>
                <td class="px-3 py-2 text-gray-500">{{ formatDate(card.created_at) }}</td>
                <td class="px-3 py-2 text-center">
                  <UButton
                    v-if="card.is_active"
                    size="xs"
                    color="red"
                    variant="outline"
                    :loading="deactivatingCardId === card.id"
                    @click="handleDeactivateCard(card)"
                  >
                    停用
                  </UButton>
                  <span v-else class="text-gray-400 text-xs">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>
  </div>

  <UModal v-model="passwordDialogVisible" :ui="{ width: 'w-full max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">修改玩家密码</h3>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-gray-600">
          当前用户：<span class="font-semibold text-gray-900">{{ result?.user?.username }}</span>
        </div>
        <UFormGroup label="新密码" required>
          <UInput
            v-model="newPassword"
            type="text"
            placeholder="请输入新密码"
            autocomplete="off"
          />
        </UFormGroup>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="gray"
            variant="outline"
            @click="passwordDialogVisible = false"
            :disabled="updatingPassword"
          >
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="updatingPassword"
            @click="submitNewPassword"
          >
            确认修改
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <UModal v-model="verifyPasswordDialogVisible" :ui="{ width: 'w-full max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">验证玩家密码</h3>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-gray-600">
          当前用户：<span class="font-semibold text-gray-900">{{ result?.user?.username }}</span>
        </div>
        <UFormGroup label="待验证密码" required>
          <UInput
            v-model="verifyPasswordInput"
            type="text"
            placeholder="请输入玩家提供的密码"
            autocomplete="off"
          />
        </UFormGroup>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="gray"
            variant="outline"
            @click="verifyPasswordDialogVisible = false"
            :disabled="verifyingPassword"
          >
            取消
          </UButton>
          <UButton
            color="blue"
            :loading="verifyingPassword"
            @click="submitVerifyPassword"
          >
            开始验证
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <UModal v-model="channelDialogVisible" :ui="{ width: 'w-full max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">修改玩家渠道</h3>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-gray-600">
          当前用户：<span class="font-semibold text-gray-900">{{ result?.user?.username }}</span>
        </div>
        <UFormGroup label="新渠道代码" required>
          <USelectMenu
            v-model="newChannelCode"
            :options="channelOptions"
            searchable
            placeholder="请选择或输入关键词搜索渠道代码"
            :loading="loadingChannels"
          />
        </UFormGroup>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="gray"
            variant="outline"
            @click="channelDialogVisible = false"
            :disabled="updatingChannel"
          >
            取消
          </UButton>
          <UButton
            color="orange"
            :loading="updatingChannel"
            @click="submitNewChannel"
          >
            确认修改
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- 修改角色区服弹窗 -->
  <UModal v-model="roleServerDialogVisible" :ui="{ width: 'w-full max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">修改角色区服</h3>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-gray-600 space-y-1">
          <div>当前用户：<span class="font-semibold text-gray-900">{{ result?.user?.username }}</span></div>
          <div>角色ID：<span class="font-semibold text-gray-900">{{ selectedRoleStat?.roleId }}</span></div>
          <div>当前区服：<span class="font-semibold text-gray-900">{{ selectedRoleStat ? `${selectedRoleStat.serverName} (${selectedRoleStat.serverId})` : '-' }}</span></div>
        </div>
        <UFormGroup label="目标区服" required>
          <USelectMenu
            v-model="selectedGameServerId"
            :options="gameServerOptions"
            value-attribute="value"
            option-attribute="label"
            searchable
            placeholder="请选择目标区服"
            :loading="loadingGameServers"
          />
        </UFormGroup>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="gray"
            variant="outline"
            @click="roleServerDialogVisible = false"
            :disabled="updatingRoleServer"
          >
            取消
          </UButton>
          <UButton
            color="orange"
            :loading="updatingRoleServer"
            @click="submitRoleServer"
          >
            确认修改
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- 备注编辑弹窗 -->
  <UModal v-model="remarkDialogVisible" :ui="{ width: 'w-full max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">编辑玩家备注</h3>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-gray-600">
          当前用户：<span class="font-semibold text-gray-900">{{ result?.user?.username }}</span>
        </div>
        <UFormGroup label="备注内容">
          <UTextarea
            v-model="remarkInput"
            placeholder="请输入备注内容（最多 500 字）"
            :rows="4"
            :maxlength="500"
            autocomplete="off"
          />
        </UFormGroup>
        <div class="text-right text-xs text-gray-400">{{ remarkInput.length }} / 500</div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="gray"
            variant="outline"
            @click="remarkDialogVisible = false"
            :disabled="savingRemark"
          >
            取消
          </UButton>
          <UButton
            color="teal"
            :loading="savingRemark"
            @click="submitRemark"
          >
            保存备注
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- 激活月卡/终身卡弹窗 -->
  <UModal v-model="activateCardDialogVisible" :ui="{ width: 'w-full max-w-md' }">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900">手动激活月卡 / 终身卡</h3>
      </template>

      <div class="space-y-4">
        <div class="text-sm text-gray-600">
          当前用户：<span class="font-semibold text-gray-900">{{ result?.user?.username }}</span>
        </div>
        <UFormGroup label="卡片类型" required>
          <USelectMenu
            v-model="activateCardType"
            :options="cardTypeOptions"
            value-attribute="value"
            option-attribute="label"
          />
        </UFormGroup>
        <UFormGroup label="每日赠币数量" required>
          <UInput
            v-model.number="activateCardCoins"
            type="number"
            min="0"
            placeholder="例如：100"
          />
        </UFormGroup>
        <UFormGroup v-if="activateCardType === 'monthly'" label="有效天数" required>
          <UInput
            v-model.number="activateCardDays"
            type="number"
            min="1"
            placeholder="例如：30"
          />
          <template #hint>
            <span class="text-gray-400 text-xs">当天起算，填 30 即从今天起 30 天有效</span>
          </template>
        </UFormGroup>
        <div v-if="activateCardType === 'lifetime'" class="text-sm text-violet-600 bg-violet-50 rounded px-3 py-2">
          终身卡永久有效，无到期日期
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="gray"
            variant="outline"
            @click="activateCardDialogVisible = false"
            :disabled="activatingCard"
          >
            取消
          </UButton>
          <UButton
            color="violet"
            :loading="activatingCard"
            @click="submitActivateCard"
          >
            确认激活
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from '#imports'

definePageMeta({
  layout: 'default'
})

const toast = useToast()
const userIdInput = ref('')
const loading = ref(false)
const result = ref(null)
const passwordDialogVisible = ref(false)
const newPassword = ref('')
const updatingPassword = ref(false)
const verifyPasswordDialogVisible = ref(false)
const verifyPasswordInput = ref('')
const verifyingPassword = ref(false)
const channelDialogVisible = ref(false)
const newChannelCode = ref('')
const updatingChannel = ref(false)
const channelOptions = ref([])
const loadingChannels = ref(false)
const roleServerDialogVisible = ref(false)
const selectedRoleStat = ref(null)
const selectedGameServerId = ref('')
const gameServerOptions = ref([])
const loadingGameServers = ref(false)
const updatingRoleServer = ref(false)
const remarkDialogVisible = ref(false)
const remarkInput = ref('')
const savingRemark = ref(false)

// 月卡管理
const playerCards = ref([])
const cardsLoading = ref(false)
const activateCardDialogVisible = ref(false)
const activateCardType = ref('monthly')
const activateCardCoins = ref(0)
const activateCardDays = ref(30)
const activatingCard = ref(false)
const deactivatingCardId = ref(null)
const cardTypeOptions = [
  { label: '月卡（有时限）', value: 'monthly' },
  { label: '终身卡（永久）', value: 'lifetime' },
]

const handleSearch = async () => {
  const keyword = (userIdInput.value || '').toString().trim()
  if (!keyword) {
    toast.add({
      title: '请输入有效的玩家标识',
      description: '支持用户ID、用户名、角色ID或子账号ID',
      color: 'red'
    })
    return
  }

  try {
    loading.value = true
    result.value = null
    playerCards.value = []
    const response = await $fetch('/api/admin/player/detail', {
      method: 'POST',
      body: { user_id: keyword }
    })

    if (response.code === 200) {
      result.value = response.data
      // 同步加载月卡列表
      loadPlayerCards(response.data.user.id)
    } else {
      throw new Error(response.message || '查询失败')
    }
  } catch (error) {
    result.value = null
    toast.add({
      title: '查询失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

const loadPlayerCards = async (userId) => {
  try {
    cardsLoading.value = true
    const response = await $fetch('/api/admin/player/cards', {
      method: 'POST',
      body: { user_id: userId }
    })
    playerCards.value = response?.data || []
  } catch (error) {
    playerCards.value = []
  } finally {
    cardsLoading.value = false
  }
}



const openActivateCardDialog = () => {
  if (!result.value?.user?.id) {
    toast.add({ title: '请先查询玩家信息', color: 'red' })
    return
  }
  activateCardType.value = 'monthly'
  activateCardCoins.value = 0
  activateCardDays.value = 30
  activateCardDialogVisible.value = true
}

const submitActivateCard = async () => {
  if (activatingCard.value) return
  if (!result.value?.user?.id) return

  if (activateCardCoins.value < 0) {
    toast.add({ title: '每日赠币数量不能为负数', color: 'red' })
    return
  }
  if (activateCardType.value === 'monthly' && (!activateCardDays.value || activateCardDays.value < 1)) {
    toast.add({ title: '月卡需要填写有效天数（至少1天）', color: 'red' })
    return
  }

  try {
    activatingCard.value = true
    const body = {
      user_id: result.value.user.id,
      card_type: activateCardType.value,
      daily_coins: activateCardCoins.value,
      days: activateCardType.value === 'monthly' ? activateCardDays.value : null,
    }
    const response = await $fetch('/api/admin/player/cards/activate', {
      method: 'POST',
      body,
    })
    if (response?.success) {
      toast.add({
        title: response.message || '激活成功',
        color: 'green'
      })
      activateCardDialogVisible.value = false
      await loadPlayerCards(result.value.user.id)
    } else {
      throw new Error(response?.message || '激活失败')
    }
  } catch (error) {
    toast.add({
      title: '激活失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    activatingCard.value = false
  }
}

const handleDeactivateCard = async (card) => {
  if (deactivatingCardId.value) return
  if (!confirm(`确认停用这张${card.card_type === 'lifetime' ? '终身卡' : '月卡'}（ID: ${card.id}）？`)) return

  try {
    deactivatingCardId.value = card.id
    const response = await $fetch('/api/admin/player/cards/deactivate', {
      method: 'POST',
      body: {
        card_id: card.id,
        user_id: result.value.user.id,
      }
    })
    if (response?.success) {
      toast.add({ title: '月卡已停用', color: 'green' })
      await loadPlayerCards(result.value.user.id)
    } else {
      throw new Error(response?.message || '停用失败')
    }
  } catch (error) {
    toast.add({
      title: '停用失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    deactivatingCardId.value = null
  }
}

const openPasswordDialog = () => {
  if (!result.value?.user?.id) {
    toast.add({
      title: '请先查询玩家信息',
      color: 'red'
    })
    return
  }
  newPassword.value = ''
  passwordDialogVisible.value = true
}

const openVerifyPasswordDialog = () => {
  if (!result.value?.user?.id) {
    toast.add({
      title: '请先查询玩家信息',
      color: 'red'
    })
    return
  }
  verifyPasswordInput.value = ''
  verifyPasswordDialogVisible.value = true
}

const openChannelDialog = () => {
  if (!result.value?.user?.id) {
    toast.add({
      title: '请先查询玩家信息',
      color: 'red'
    })
    return
  }
  newChannelCode.value = result.value?.user?.channelCode || ''
  loadChannelOptions().finally(() => {
    channelDialogVisible.value = true
  })
}

const loadChannelOptions = async () => {
  try {
    loadingChannels.value = true
    const response = await $fetch('/api/admin/channel-codes')
    const options = Array.isArray(response?.data) ? response.data : []
    const currentCode = (result.value?.user?.channelCode || '').toString().trim()
    // 当前渠道可能已停用，不在列表里时补进去，避免看不到当前值
    if (currentCode && !options.includes(currentCode)) {
      options.unshift(currentCode)
    }
    channelOptions.value = options
  } catch (error) {
    channelOptions.value = []
    toast.add({
      title: '加载渠道列表失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    loadingChannels.value = false
  }
}

const loadGameServerOptions = async () => {
  try {
    loadingGameServers.value = true
    const response = await $fetch('/api/admin/servers')
    const servers = Array.isArray(response?.data) ? response.data : []
    gameServerOptions.value = servers.map(server => {
      const displayServerId = server.server_id ?? server.id
      return {
        label: `${server.name || '未命名区服'} (${displayServerId})`,
        value: String(server.id),
        serverId: displayServerId,
        name: server.name || ''
      }
    })
  } catch (error) {
    gameServerOptions.value = []
    toast.add({
      title: '加载区服列表失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    loadingGameServers.value = false
  }
}

const openRoleServerDialog = async (stat) => {
  if (!result.value?.user?.id) {
    toast.add({ title: '请先查询玩家信息', color: 'red' })
    return
  }
  selectedRoleStat.value = stat
  selectedGameServerId.value = ''
  await loadGameServerOptions()
  const currentOption = gameServerOptions.value.find(option => String(option.serverId) === String(stat.serverId))
  selectedGameServerId.value = currentOption?.value || ''
  roleServerDialogVisible.value = true
}

const submitRoleServer = async () => {
  if (updatingRoleServer.value) return
  if (!result.value?.user?.id || !selectedRoleStat.value?.roleId) {
    toast.add({ title: '未找到角色信息', color: 'red' })
    return
  }
  if (!selectedGameServerId.value) {
    toast.add({ title: '请选择目标区服', color: 'red' })
    return
  }

  try {
    updatingRoleServer.value = true
    const response = await $fetch('/api/admin/player/update-role-server', {
      method: 'POST',
      body: {
        user_id: result.value.user.id,
        role_id: selectedRoleStat.value.roleId,
        game_server_id: selectedGameServerId.value
      }
    })

    if (response?.success) {
      toast.add({
        title: '角色区服已更新',
        description: response.message || '操作成功',
        color: 'green'
      })
      roleServerDialogVisible.value = false
      await handleSearch()
    } else {
      throw new Error(response?.message || '修改失败')
    }
  } catch (error) {
    toast.add({
      title: '修改失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    updatingRoleServer.value = false
  }
}

const submitNewPassword = async () => {
  if (updatingPassword.value) return
  if (!result.value?.user?.id) {
    toast.add({
      title: '未找到玩家信息',
      color: 'red'
    })
    return
  }
  if (!newPassword.value) {
    toast.add({
      title: '请输入新密码',
      color: 'red'
    })
    return
  }

  try {
    updatingPassword.value = true
    const response = await $fetch('/api/admin/users/change-password', {
      method: 'POST',
      body: {
        user_id: result.value.user.id,
        new_password: newPassword.value
      }
    })

    if (response?.success) {
      toast.add({
        title: '密码已更新',
        description: response.message || '操作成功',
        color: 'green'
      })
      // 密码修改成功后，保持显示星号占位
      result.value.user.password = '******'
      passwordDialogVisible.value = false
    } else {
      throw new Error(response?.message || '修改失败')
    }
  } catch (error) {
    toast.add({
      title: '修改失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    updatingPassword.value = false
  }
}

const submitVerifyPassword = async () => {
  if (verifyingPassword.value) return
  if (!result.value?.user?.id) {
    toast.add({
      title: '未找到玩家信息',
      color: 'red'
    })
    return
  }
  if (!verifyPasswordInput.value) {
    toast.add({
      title: '请输入要验证的密码',
      color: 'red'
    })
    return
  }

  try {
    verifyingPassword.value = true
    const response = await $fetch('/api/admin/users/verify-password', {
      method: 'POST',
      body: {
        user_id: result.value.user.id,
        password: verifyPasswordInput.value
      }
    })

    if (response?.success && response?.matched === true) {
      toast.add({
        title: '验证通过',
        description: '玩家提供的密码正确',
        color: 'green'
      })
    } else if (response?.success && response?.matched === false) {
      toast.add({
        title: '验证失败',
        description: '玩家提供的密码不正确',
        color: 'red'
      })
    } else {
      throw new Error(response?.message || '验证失败')
    }
    verifyPasswordDialogVisible.value = false
  } catch (error) {
    toast.add({
      title: '验证失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    verifyingPassword.value = false
  }
}

const submitNewChannel = async () => {
  if (updatingChannel.value) return
  if (!result.value?.user?.id) {
    toast.add({
      title: '未找到玩家信息',
      color: 'red'
    })
    return
  }
  if (!newChannelCode.value?.trim()) {
    toast.add({
      title: '请输入新的渠道代码',
      color: 'red'
    })
    return
  }

  try {
    updatingChannel.value = true
    const response = await $fetch('/api/admin/users/change-channel', {
      method: 'POST',
      body: {
        user_id: result.value.user.id,
        new_channel_code: newChannelCode.value.trim()
      }
    })

    if (response?.success) {
      result.value.user.channelCode = newChannelCode.value.trim()
      toast.add({
        title: '渠道已更新',
        description: response.message || '操作成功',
        color: 'green'
      })
      channelDialogVisible.value = false
    } else {
      throw new Error(response?.message || '修改失败')
    }
  } catch (error) {
    toast.add({
      title: '修改失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    updatingChannel.value = false
  }
}

const openRemarkDialog = () => {
  if (!result.value?.user?.id) {
    toast.add({ title: '请先查询玩家信息', color: 'red' })
    return
  }
  remarkInput.value = result.value.user.remark || ''
  remarkDialogVisible.value = true
}

const submitRemark = async () => {
  if (savingRemark.value) return
  if (!result.value?.user?.id) {
    toast.add({ title: '未找到玩家信息', color: 'red' })
    return
  }
  try {
    savingRemark.value = true
    const response = await $fetch('/api/admin/player/update-remark', {
      method: 'POST',
      body: {
        user_id: result.value.user.id,
        remark: remarkInput.value
      }
    })
    if (response?.success) {
      result.value.user.remark = remarkInput.value
      toast.add({
        title: '备注已保存',
        color: 'green'
      })
      remarkDialogVisible.value = false
    } else {
      throw new Error(response?.message || '保存失败')
    }
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error.message || '请稍后再试',
      color: 'red'
    })
  } finally {
    savingRemark.value = false
  }
}

const formatNumber = (value) => {
  if (value === null || value === undefined) return '0'
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '0.00'
  return Number(value).toFixed(2)
}

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

const formatDateTime = (value) => formatDate(value)

const isPlatformCoinPayment = (paymentWay) => {
  const way = (paymentWay || '').toString().toLowerCase()
  if (!way) return false
  return ['平台币', '平台幣', 'ptb', 'platform'].some(keyword => way.includes(keyword.toLowerCase()))
}

const isGiftOrder = (serverUrl) => {
  if (!serverUrl) return false
  return serverUrl.startsWith('gift://')
}
</script>

<style scoped lang="postcss">
.player-detail-page {
  @apply space-y-6;
}

.summary-grid {
  @apply grid gap-6;
}

@media (min-width: 1024px) {
  .summary-grid {
    @apply grid-cols-2;
  }
}

.summary-card {
  @apply h-full;
}

.summary-content {
  @apply grid gap-4;
}

@media (min-width: 768px) {
  .summary-content {
    @apply grid-cols-2;
  }
}

.summary-item {
  @apply flex flex-col gap-1;
}

.summary-item .label {
  @apply text-xs uppercase tracking-wide text-gray-500;
}

.summary-item .value {
  @apply text-base text-gray-900;
}

.password-value {
  @apply flex items-center gap-2;
}

.remark-value {
  @apply flex items-start gap-2 flex-wrap;
}

.remark-text {
  @apply text-sm text-gray-700 whitespace-pre-wrap break-words flex-1;
}
</style>

