<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">游戏运营</h1>
      <div class="page-description">管理游戏玩家账号，执行封号、发放物资等GM操作</div>
    </div>

    <!-- 服务器选择 -->
    <div class="mb-6">
      <UCard>
        <div class="flex items-center gap-4">
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
          
          <UButton
            v-if="selectedServer"
            @click="loadPlayers"
            :loading="loadingPlayers"
            icon="i-heroicons-arrow-path"
            variant="soft"
          >
            刷新玩家列表
          </UButton>
          
          <UButton
            v-if="selectedServer && filteredPlayers.length > 0"
            @click="openServerWideItemModal"
            :loading="loadingPlayers"
            icon="i-heroicons-globe-alt"
            color="amber"
          >
            全服发送物资
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- 搜索栏 -->
    <div class="mb-6" v-if="selectedServer">
      <UCard>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UFormGroup label="玩家ID">
            <UInput
              v-model="searchForm.playerId"
              placeholder="输入玩家ID"
              icon="i-heroicons-magnifying-glass"
            />
          </UFormGroup>
          
          <UFormGroup label="OpenID">
            <UInput
              v-model="searchForm.openId"
              placeholder="输入OpenID"
              icon="i-heroicons-identification"
            />
          </UFormGroup>
          
          <UFormGroup label="玩家名称">
            <UInput
              v-model="searchForm.playerName"
              placeholder="输入玩家名称"
              icon="i-heroicons-user"
            />
          </UFormGroup>
        </div>
        
        <div class="mt-4 flex gap-2">
          <UButton
            @click="searchPlayers"
            icon="i-heroicons-magnifying-glass"
            :loading="loadingPlayers"
          >
            搜索
          </UButton>
          
          <UButton
            @click="resetSearch"
            variant="ghost"
            icon="i-heroicons-arrow-path"
          >
            重置
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- 玩家列表 -->
    <div v-if="selectedServer">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h3 class="text-base font-semibold">玩家列表</h3>
              <UBadge color="gray" variant="soft">共 {{ filteredPlayers.length }} 人</UBadge>
              <UBadge v-if="selectedIds.length > 0" color="primary" variant="soft">已选 {{ selectedIds.length }}</UBadge>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="selectedIds.length > 0"
                color="primary"
                icon="i-heroicons-gift"
                @click="openBatchItemModal"
              >批量发放物资</UButton>
              <UButton
                v-if="selectedIds.length > 0"
                color="gray"
                variant="soft"
                icon="i-heroicons-x-mark"
                @click="clearSelection"
              >清空选择</UButton>
            </div>
          </div>
        </template>

        <UTable
          :rows="paginatedPlayers"
          :columns="columns"
          :loading="loadingPlayers"
          :ui="{ td: { padding: 'py-2 px-3' } }"
        >
          <template #select-data="{ row }">
            <UCheckbox
              :model-value="selectedIds.includes(row.id)"
              @update:model-value="(val: boolean) => toggleSelect(row.id, val)"
            />
          </template>
          <template #name-data="{ row }">
            <div class="flex items-center gap-2">
              <UAvatar
                :alt="row.name"
                size="xs"
                :ui="{ rounded: 'rounded-full' }"
              />
              <span class="font-medium">{{ row.name }}</span>
            </div>
          </template>

          <template #vipLevel-data="{ row }">
            <UBadge v-if="row.vipLevel > 0" color="amber" variant="soft">
              VIP {{ row.vipLevel }}
            </UBadge>
            <span v-else class="text-gray-400">-</span>
          </template>

          <template #status-data="{ row }">
            <UBadge
              :color="getStatusColor(row)"
              variant="soft"
            >
              {{ getStatusText(row) }}
            </UBadge>
          </template>

          <template #loginTime-data="{ row }">
            <span class="text-sm">{{ formatDate(row.loginTime) }}</span>
          </template>

          <template #createTime-data="{ row }">
            <span class="text-sm">{{ formatDate(row.createTime) }}</span>
          </template>

          <template #actions-data="{ row }">
            <div class="flex items-center gap-1">
              <UDropdown :items="getActionItems(row)">
                <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" />
              </UDropdown>
            </div>
          </template>
        </UTable>

        <!-- 分页 -->
        <div class="mt-4 flex justify-between items-center">
          <div class="text-sm text-gray-500">
            显示第 {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredPlayers.length) }} 条，共 {{ filteredPlayers.length }} 条
          </div>
          <UPagination
            v-model="currentPage"
            :page-count="pageSize"
            :total="filteredPlayers.length"
          />
        </div>
      </UCard>
    </div>

    <!-- 封号对话框 -->
    <UModal v-model="banModal.show">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">封号操作</h3>
        </template>

        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600">玩家信息</p>
            <div class="mt-2 p-3 bg-gray-50 rounded-lg">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>ID: {{ banModal.player?.id }}</div>
                <div>名称: {{ banModal.player?.name }}</div>
                <div>OpenID: {{ banModal.player?.openid }}</div>
                <div>平台: {{ banModal.player?.platform || 'Unknown' }}</div>
              </div>
            </div>
          </div>

          <UFormGroup label="封号时长" required>
            <USelectMenu
              v-model="banModal.duration"
              :options="banDurationOptions"
              placeholder="选择封号时长"
              value-attribute="value"
              option-attribute="label"
            />
          </UFormGroup>

          <UFormGroup label="封号原因" required>
            <UTextarea
              v-model="banModal.reason"
              placeholder="请输入封号原因"
              :rows="3"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="banModal.show = false"
            >
              取消
            </UButton>
            <UButton
              color="red"
              @click="confirmBan"
              :loading="banModal.loading"
              :disabled="!banModal.duration || !banModal.reason"
            >
              确认封号
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 发放物资对话框 -->
    <UModal v-model="itemModal.show" :ui="{ width: 'sm:max-w-2xl' }" :prevent-close="itemModal.loading">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">发放物资</h3>
        </template>

        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600">玩家信息</p>
            <div class="mt-2 p-3 bg-gray-50 rounded-lg">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>ID: {{ itemModal.player?.id }}</div>
                <div>名称: {{ itemModal.player?.name }}</div>
                <div>OpenID: {{ itemModal.player?.openid }}</div>
                <div>角色ID: {{ itemModal.player?.id }}</div>
              </div>
            </div>
          </div>

          <!-- 礼包选择 -->
          <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-gift" class="text-blue-600" />
              <label class="text-sm font-medium text-blue-900">快速选择礼包</label>
            </div>
            <div class="flex gap-2 items-center">
              <USelectMenu
                v-model="selectedPackageId"
                :options="packageOptions"
                value-attribute="value"
                option-attribute="label"
                :searchable="searchPackages"
                searchable-placeholder="输入礼包名称或代码搜索"
                placeholder="选择礼包（可输入搜索）"
                class="flex-1"
                @click="loadGiftPackages"
              />
              <UButton
                @click="applyPackageToItems"
                :disabled="!selectedPackageId"
                size="sm"
                color="blue"
                variant="soft"
              >
                应用礼包
              </UButton>
            </div>
            <p class="text-xs text-blue-600 mt-2">💡 选择礼包后点击"应用礼包"，将自动填充该礼包的所有物品</p>
            <p v-if="lastItemSelection && lastItemSelection.length > 0 && !selectedPackageId" class="text-xs text-green-600 mt-1">
              ✓ 已自动加载上一次的物品选择（{{ lastItemSelection.length }} 个物品）
            </p>
          </div>

          <UFormGroup label="邮件标题" required>
            <UInput
              v-model="itemModal.title"
              placeholder="输入邮件标题"
            />
          </UFormGroup>

          <UFormGroup label="邮件内容" required>
            <UTextarea
              v-model="itemModal.content"
              placeholder="输入邮件内容"
              :rows="3"
            />
          </UFormGroup>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium">物品列表</label>
              <UButton
                size="xs"
                variant="soft"
                icon="i-heroicons-plus"
                @click="addItem"
              >
                添加物品
              </UButton>
            </div>
            
            <div class="space-y-2">
              <div
                v-for="(item, index) in itemModal.items"
                :key="index"
                class="flex flex-col gap-2"
              >
                <div class="flex gap-2 items-center">
                  <USelectMenu
                    v-model.number="item.ItemId"
                    :options="itemOptions"
                    value-attribute="value"
                    option-attribute="label"
                    :searchable="searchItems"
                    searchable-placeholder="按ID或名称搜索"
                    placeholder="选择物品（可搜索）"
                    class="flex-1"
                  />
                  <UInput
                    v-model.number="item.ItemNum"
                    type="number"
                    placeholder="数量"
                    class="w-20"
                    min="1"
                  />
                  <UButton
                    color="red"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-trash"
                    @click="removeItem(index)"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <!-- 发送进度显示 -->
          <div v-if="itemModal.loading && sendProgress.total > 0" class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
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
            <UButton
              variant="ghost"
              @click="itemModal.show = false"
              :disabled="itemModal.loading"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              @click="confirmSendItems"
              :loading="itemModal.loading"
              :disabled="!itemModal.title || !itemModal.content || !hasValidItems"
            >
              确认发放
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 批量发放物资对话框 -->
    <UModal v-model="batchItemModal.show" :ui="{ width: 'sm:max-w-2xl' }" :prevent-close="batchItemModal.loading">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">
            {{ isServerWideSend ? `全服发送物资 - ${getServerLabel(selectedServer)}` : '批量发放物资' }}
          </h3>
        </template>

        <div class="space-y-4">
          <!-- 全服发送警告 -->
          <div v-if="isServerWideSend" class="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-exclamation-triangle" class="text-amber-600 mt-0.5 flex-shrink-0" />
              <div class="text-sm text-amber-800">
                <p class="font-semibold">全服发送警告</p>
                <p>将向当前服务器的所有玩家（共 {{ filteredPlayers.length }} 人）发送物资，请谨慎操作！</p>
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-2 text-sm text-gray-600">
            <span>目标玩家：</span>
            <UBadge color="primary" variant="soft">
              {{ isServerWideSend ? filteredPlayers.length : selectedIds.length }} 人
            </UBadge>
          </div>

          <!-- 礼包选择 -->
          <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-gift" class="text-blue-600" />
              <label class="text-sm font-medium text-blue-900">快速选择礼包</label>
            </div>
            <div class="flex gap-2 items-center">
              <USelectMenu
                v-model="selectedBatchPackageId"
                :options="packageOptions"
                value-attribute="value"
                option-attribute="label"
                :searchable="searchPackages"
                searchable-placeholder="输入礼包名称或代码搜索"
                placeholder="选择礼包（可输入搜索）"
                class="flex-1"
                @click="loadGiftPackages"
              />
              <UButton
                @click="applyPackageToBatchItems"
                :disabled="!selectedBatchPackageId"
                size="sm"
                color="blue"
                variant="soft"
              >
                应用礼包
              </UButton>
            </div>
            <p class="text-xs text-blue-600 mt-2">💡 选择礼包后点击"应用礼包"，将自动填充该礼包的所有物品</p>
            <p v-if="lastBatchItemSelection && lastBatchItemSelection.length > 0 && !selectedBatchPackageId" class="text-xs text-green-600 mt-1">
              ✓ 已自动加载上一次的物品选择（{{ lastBatchItemSelection.length }} 个物品）
            </p>
          </div>

          <UFormGroup label="邮件标题" required>
            <UInput v-model="batchItemModal.title" placeholder="输入邮件标题" />
          </UFormGroup>

          <UFormGroup label="邮件内容" required>
            <UTextarea v-model="batchItemModal.content" placeholder="输入邮件内容" :rows="3" />
          </UFormGroup>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium">物品列表</label>
              <UButton size="xs" variant="soft" icon="i-heroicons-plus" @click="addBatchItem">添加物品</UButton>
            </div>

            <div class="space-y-2">
              <div v-for="(item, index) in batchItemModal.items" :key="'b_'+index" class="flex flex-col gap-2">
                <div class="flex gap-2 items-center">
                  <USelectMenu
                    v-model.number="item.ItemId"
                    :options="itemOptions"
                    value-attribute="value"
                    option-attribute="label"
                    :searchable="searchItems"
                    searchable-placeholder="按ID或名称搜索"
                    placeholder="选择物品（可搜索）"
                    class="flex-1"
                  />
                  <UInput v-model.number="item.ItemNum" type="number" placeholder="数量" class="w-20" min="1" />
                  <UButton color="red" variant="ghost" size="xs" icon="i-heroicons-trash" @click="removeBatchItem(index)" />
                </div>
              </div>
            </div>
          </div>
          
          <!-- 发送进度显示 -->
          <div v-if="batchItemModal.loading && sendProgress.total > 0" class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
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
            <UButton variant="ghost" @click="batchItemModal.show = false" :disabled="batchItemModal.loading">取消</UButton>
            <UButton color="primary" @click="confirmSendItemsBatch" :loading="batchItemModal.loading" :disabled="!batchItemModal.title || !batchItemModal.content || !hasValidBatchItems">确认发放</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- GM充值对话框 -->
    <UModal v-model="rechargeModal.show">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">GM充值</h3>
        </template>

        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600">玩家信息</p>
            <div class="mt-2 p-3 bg-gray-50 rounded-lg">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>ID: {{ rechargeModal.player?.id }}</div>
                <div>名称: {{ rechargeModal.player?.name }}</div>
                <div>OpenID: {{ rechargeModal.player?.openid }}</div>
                <div>当前VIP: {{ rechargeModal.player?.vipLevel || 0 }}</div>
              </div>
            </div>
          </div>

          <UFormGroup label="充值钻石数量" required>
            <UInput
              v-model.number="rechargeModal.diamond"
              type="number"
              placeholder="输入钻石数量"
              min="1"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="rechargeModal.show = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              @click="confirmRecharge"
              :loading="rechargeModal.loading"
              :disabled="!rechargeModal.diamond || rechargeModal.diamond <= 0"
            >
              确认充值
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 发送邮件对话框 -->
    <UModal v-model="mailModal.show">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">发送邮件</h3>
        </template>

        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600">玩家信息</p>
            <div class="mt-2 p-3 bg-gray-50 rounded-lg">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>ID: {{ mailModal.player?.id }}</div>
                <div>名称: {{ mailModal.player?.name }}</div>
                <div>OpenID: {{ mailModal.player?.openid }}</div>
                <div>VIP等级: {{ mailModal.player?.vipLevel }}</div>
              </div>
            </div>
          </div>

          <UFormGroup label="邮件标题" required>
            <UInput
              v-model="mailModal.title"
              placeholder="输入邮件标题"
            />
          </UFormGroup>

          <UFormGroup label="邮件内容" required>
            <UTextarea
              v-model="mailModal.content"
              placeholder="输入邮件内容"
              :rows="4"
            />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="mailModal.show = false"
            >
              取消
            </UButton>
            <UButton
              @click="confirmSendMail"
              :loading="mailModal.loading"
              :disabled="!mailModal.title || !mailModal.content"
            >
              发送邮件
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 迁移平台对话框 -->
    <UModal v-model="migratePlatformModal.show">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">迁移平台</h3>
        </template>

        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600">玩家信息</p>
            <div class="mt-2 p-3 bg-gray-50 rounded-lg">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>ID: {{ migratePlatformModal.player?.id }}</div>
                <div>名称: {{ migratePlatformModal.player?.name }}</div>
                <div>OpenID: {{ migratePlatformModal.player?.openid }}</div>
                <div>当前平台: {{ migratePlatformModal.player?.platform || 'Unknown' }}</div>
              </div>
            </div>
          </div>

          <!-- 目标账号已存在警告 -->
          <div v-if="migratePlatformModal.needConfirm && migratePlatformModal.existingPlayer" class="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-exclamation-circle" class="text-red-600 mt-0.5 flex-shrink-0" />
              <div class="text-sm text-red-900">
                <p class="font-bold mb-2">⚠️ 警告：目标账号已存在！</p>
                <div class="bg-white p-3 rounded border border-red-200 mb-2">
                  <p class="font-medium mb-1">已存在的账号信息：</p>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div>ID: <span class="font-mono">{{ migratePlatformModal.existingPlayer.id }}</span></div>
                    <div>名称: <span class="font-semibold">{{ migratePlatformModal.existingPlayer.name }}</span></div>
                    <div>VIP等级: <span class="font-semibold">VIP {{ migratePlatformModal.existingPlayer.vipLevel }}</span></div>
                    <div>战力: <span class="font-semibold">{{ migratePlatformModal.existingPlayer.battlePoint }}</span></div>
                  </div>
                </div>
                <p class="text-xs">
                  继续迁移将会<strong class="text-red-700">覆盖</strong>该账号的数据，原账号数据将<strong class="text-red-700">永久丢失</strong>！
                </p>
              </div>
            </div>
          </div>

          <div class="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-exclamation-triangle" class="text-amber-600 mt-0.5" />
              <div class="text-sm text-amber-900">
                <p class="font-medium mb-1">注意事项：</p>
                <ul class="list-disc list-inside space-y-1 text-xs">
                  <li>迁移平台将修改玩家的 <code class="bg-amber-100 px-1 rounded">puid</code> 和 <code class="bg-amber-100 px-1 rounded">platform</code> 字段</li>
                  <li>目标平台：<strong>{{ migratePlatformModal.targetPlatform?.toUpperCase() }}</strong></li>
                  <li>puid 将从 <code class="bg-amber-100 px-1 rounded">{{ migratePlatformModal.player?.openid }}#{{ migratePlatformModal.player?.platform }}</code> 改为 <code class="bg-amber-100 px-1 rounded">{{ migratePlatformModal.player?.openid }}#{{ migratePlatformModal.targetPlatform }}</code></li>
                  <li>此操作不可逆，请谨慎操作</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="migratePlatformModal.show = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              @click="confirmMigratePlatform"
              :loading="migratePlatformModal.loading"
            >
              确认迁移
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useToast } from '#imports';
import { useAuthStore } from '~/store/auth';

const toast = useToast();
const authStore = useAuthStore();

const getAuthHeaders = () => ({
  authorization: String(authStore.id || localStorage.getItem('auth_id') || '')
});

// 定义玩家类型
interface Player {
  id: string;
  openid: string;
  name: string;
  vipLevel: number;
  vipExp: number;
  platform: string;
  channel: string;
  forbidenTime: number;
  loginTime: number;
  createTime: number;
  battlePoint: number;
}

// 服务器列表
const selectedServer = ref('');
const serverOptions = ref<{ label: string; value: string }[]>([]);
const loadingServers = ref(false);

// 玩家列表
const players = ref<Player[]>([]);
const loadingPlayers = ref(false);

// 搜索表单
const searchForm = ref({
  playerId: '',
  openId: '',
  playerName: ''
});

// 分页
const currentPage = ref(1);
const pageSize = ref(20);

// 表格列配置
const columns = [
  { key: 'select', label: '' },
  { key: 'id', label: '玩家ID', sortable: true },
  { key: 'name', label: '玩家名称' },
  { key: 'openid', label: 'OpenID' },
  { key: 'vipLevel', label: 'VIP等级', sortable: true },
  { key: 'battlePoint', label: '战力', sortable: true },
  { key: 'platform', label: '平台' },
  { key: 'status', label: '状态' },
  { key: 'loginTime', label: '最后登录' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作' }
];

// 封号对话框
const banModal = ref({
  show: false,
  player: null as Player | null,
  duration: '',
  reason: '',
  loading: false
});

// 封号时长选项
const banDurationOptions = [
  { label: '1小时', value: 3600 },
  { label: '12小时', value: 43200 },
  { label: '1天', value: 86400 },
  { label: '3天', value: 259200 },
  { label: '7天', value: 604800 },
  { label: '30天', value: 2592000 },
  { label: '永久封号', value: 315360000 } // 10年
];

// 发放物资对话框
const itemModal = ref({
  show: false,
  player: null as Player | null,
  title: '',
  content: '',
  items: [{ ItemId: 0, ItemNum: 1 }],
  loading: false
});

// 批量发放物资对话框
const batchItemModal = ref({
  show: false,
  title: '',
  content: '',
  items: [{ ItemId: 0, ItemNum: 1 }],
  loading: false
});

// 全服发送标记
const isServerWideSend = ref(false);

// 发送进度跟踪
const sendProgress = ref({
  current: 0,
  total: 0,
  success: 0,
  failed: 0
});

// 全量物品 + 本地下拉过滤
const availableItems = ref<Array<{ id: string | number; name: string }>>([]);
const itemOptions = computed(() => availableItems.value.map(it => ({ value: Number(it.id), label: `${it.id} - ${it.name}` })));
function searchItems(query: string) {
  const q = (query || '').trim().toLowerCase();
  const opts = itemOptions.value || [];
  if (!q) return opts.slice(0, 20);
  return opts.filter(o => o.label.toLowerCase().includes(q)).slice(0, 200);
}
async function loadItems() {
  try {
    const res: any = await $fetch('/api/items');
    availableItems.value = res?.data || [];
  } catch {}
}

// 礼包列表
const availablePackages = ref<Array<any>>([]);
const packageOptions = computed(() => availablePackages.value.map(pkg => ({ 
  value: pkg.id, 
  label: `${pkg.package_name} (${pkg.package_code})`,
  package: pkg
})));

// 礼包搜索函数
function searchPackages(query: string) {
  const q = (query || '').trim().toLowerCase();
  const packages = availablePackages.value || [];
  
  if (!q) {
    // 无搜索词时只显示前20个
    return packageOptions.value.slice(0, 20);
  }
  
  // 搜索匹配礼包名称、礼包代码、礼包ID或描述
  const filtered = packages.filter(pkg => {
    const name = (pkg.package_name || '').toLowerCase();
    const code = (pkg.package_code || '').toLowerCase();
    const id = String(pkg.id || '');
    const desc = (pkg.description || '').toLowerCase();
    
    return name.includes(q) || 
           code.includes(q) || 
           id.includes(q) || 
           desc.includes(q);
  });
  
  // 转换为选项格式并限制返回数量
  return filtered.slice(0, 100).map(pkg => ({
    value: pkg.id,
    label: `${pkg.package_name} (${pkg.package_code})`,
    package: pkg
  }));
}

// 加载礼包列表（首次点击下拉框时自动加载）
const packagesLoaded = ref(false);
async function loadGiftPackages() {
  if (packagesLoaded.value) return; // 避免重复加载
  
  try {
    const res: any = await $fetch('/api/admin/gift-packages', {
      query: {
        page: 1,
        pageSize: 1000, // 加载所有礼包用于选择
        is_active: 'true' // 只加载启用的礼包
      },
      headers: getAuthHeaders()
    });
    if (res?.success) {
      availablePackages.value = res?.data?.list || [];
      packagesLoaded.value = true;
      console.log(`礼包列表加载成功: ${availablePackages.value.length} 个礼包`);
    }
  } catch (error) {
    console.error('加载礼包列表失败:', error);
    // 静默失败，不影响其他功能
  }
}

// 选中的礼包（用于发放物资）
const selectedPackageId = ref<number | undefined>(undefined);
// 选中的礼包（用于批量发放）
const selectedBatchPackageId = ref<number | undefined>(undefined);

// 记录上一次的物品选择（用于下次默认填充）
const lastItemSelection = ref<Array<{ ItemId: number; ItemNum: number }> | null>(null);
const lastBatchItemSelection = ref<Array<{ ItemId: number; ItemNum: number }> | null>(null);

// 解析礼包物品
function parseGiftPackageItems(giftItems: any): Array<{ ItemId: number; ItemNum: number }> {
  try {
    if (typeof giftItems === 'string') {
      const parsed = JSON.parse(giftItems);
      return parsed.map((item: any) => ({
        ItemId: Number(item.i),
        ItemNum: Number(item.a)
      }));
    } else if (Array.isArray(giftItems)) {
      return giftItems.map((item: any) => ({
        ItemId: Number(item.i),
        ItemNum: Number(item.a)
      }));
    }
    return [];
  } catch (error) {
    console.error('解析礼包物品失败:', error);
    return [];
  }
}

// 应用礼包到物品列表（发放物资）
function applyPackageToItems() {
  if (!selectedPackageId.value) return;
  
  const selectedPackage = availablePackages.value.find(pkg => pkg.id === selectedPackageId.value);
  if (!selectedPackage) return;
  
  const packageItems = parseGiftPackageItems(selectedPackage.gift_items);
  if (packageItems.length > 0) {
    itemModal.value.items = packageItems;
    // 清空上一次的物品记录（因为使用了礼包）
    lastItemSelection.value = null;
    // 清空礼包选择
    selectedPackageId.value = undefined;
    // 自动填充邮件标题和内容
    if (!itemModal.value.title) {
      itemModal.value.title = `GM发放-${selectedPackage.package_name}`;
    }
    if (!itemModal.value.content) {
      itemModal.value.content = selectedPackage.description || `这是GM发放的${selectedPackage.package_name}，请查收！`;
    }
    toast.add({
      title: '已应用礼包',
      description: `已加载 ${packageItems.length} 个物品`,
      color: 'green'
    });
  }
}

// 应用礼包到批量物品列表
function applyPackageToBatchItems() {
  if (!selectedBatchPackageId.value) return;
  
  const selectedPackage = availablePackages.value.find(pkg => pkg.id === selectedBatchPackageId.value);
  if (!selectedPackage) return;
  
  const packageItems = parseGiftPackageItems(selectedPackage.gift_items);
  if (packageItems.length > 0) {
    batchItemModal.value.items = packageItems;
    // 清空上一次的物品记录（因为使用了礼包）
    lastBatchItemSelection.value = null;
    // 清空礼包选择
    selectedBatchPackageId.value = undefined;
    // 自动填充邮件标题和内容
    if (!batchItemModal.value.title) {
      batchItemModal.value.title = `GM发放-${selectedPackage.package_name}`;
    }
    if (!batchItemModal.value.content) {
      batchItemModal.value.content = selectedPackage.description || `这是GM发放的${selectedPackage.package_name}，请查收！`;
    }
    toast.add({
      title: '已应用礼包',
      description: `已加载 ${packageItems.length} 个物品到批量发放`,
      color: 'green'
    });
  }
}

// 检查是否有有效物品
const hasValidItems = computed(() => {
  return itemModal.value.items.some(item => item.ItemId > 0 && item.ItemNum > 0);
});

const hasValidBatchItems = computed(() => {
  return batchItemModal.value.items.some(item => item.ItemId > 0 && item.ItemNum > 0);
});

// GM充值对话框
const rechargeModal = ref({
  show: false,
  player: null as Player | null,
  diamond: 0,
  loading: false
});

// 过滤后的玩家列表
const filteredPlayers = computed(() => {
  return players.value.filter(player => {
    if (searchForm.value.playerId && !player.id.includes(searchForm.value.playerId)) {
      return false;
    }
    if (searchForm.value.openId && !player.openid.toLowerCase().includes(searchForm.value.openId.toLowerCase())) {
      return false;
    }
    if (searchForm.value.playerName && !player.name.toLowerCase().includes(searchForm.value.playerName.toLowerCase())) {
      return false;
    }
    return true;
  });
});

// 分页后的玩家列表
const paginatedPlayers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredPlayers.value.slice(start, end);
});

// 选择集
const selectedIds = ref<string[]>([]);
const toggleSelect = (id: string, checked: boolean) => {
  const idx = selectedIds.value.indexOf(id);
  if (checked) {
    if (idx === -1) selectedIds.value.push(id);
  } else {
    if (idx !== -1) selectedIds.value.splice(idx, 1);
  }
};
const clearSelection = () => { selectedIds.value = []; };

const selectedPlayers = computed(() => {
  const set = new Set(selectedIds.value);
  return players.value.filter(p => set.has(p.id));
});

// 获取状态颜色
const getStatusColor = (player: Player) => {
  const now = Date.now();
  if (player.forbidenTime > now) {
    return 'red';
  }
  return 'green';
};

// 获取状态文本
const getStatusText = (player: Player) => {
  const now = Date.now();
  if (player.forbidenTime > now) {
    return '已封号';
  }
  return '正常';
};

// 格式化日期
const formatDate = (timestamp: number) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN');
};

// 获取操作菜单项
const getActionItems = (player: Player) => {
  const now = Date.now();
  const isBanned = player.forbidenTime > now;
  
  return [
    [{
      label: isBanned ? '解封' : '封号',
      icon: isBanned ? 'i-heroicons-lock-open' : 'i-heroicons-lock-closed',
      click: () => isBanned ? unbanPlayer(player) : openBanModal(player)
    }],
    [{
      label: '发放物资',
      icon: 'i-heroicons-gift',
      click: () => openItemModal(player)
    }],
    [{
      label: 'GM充值',
      icon: 'i-heroicons-currency-dollar',
      click: () => openRechargeModal(player)
    }],
    [{
      label: '发送邮件',
      icon: 'i-heroicons-envelope',
      click: () => sendMail(player)
    }],
    [{
      label: '开罩子',
      icon: 'i-heroicons-shield-check',
      click: () => handleOpenProtectShield(player)
    }, {
      label: '删除角色',
      icon: 'i-heroicons-trash',
      click: () => handleDeletePlayer(player)
    }],
    [{
      label: '迁移到iOS',
      icon: 'i-heroicons-device-phone-mobile',
      click: () => openMigratePlatformModal(player, 'ios'),
      disabled: player.platform === 'ios'
    }, {
      label: '迁移到Android',
      icon: 'i-heroicons-device-tablet',
      click: () => openMigratePlatformModal(player, 'android'),
      disabled: player.platform === 'android'
    }]
  ];
};

// 获取服务器显示名称
const getServerLabel = (serverValue: string) => {
  const server = serverOptions.value.find(s => s.value === serverValue);
  return server?.label || serverValue;
};

// 加载服务器列表
const loadServers = async () => {
  loadingServers.value = true;
  try {
    const { data } = await $fetch('/api/gm/servers');
    serverOptions.value = (data as Array<{ name: string; bname: string }>).map(s => ({
      label: s.name,
      value: s.bname
    }));
  } catch (error: any) {
    toast.add({
      title: '加载服务器列表失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  } finally {
    loadingServers.value = false;
  }
};

// 加载玩家列表
const loadPlayers = async () => {
  if (!selectedServer.value) return;
  
  loadingPlayers.value = true;
  try {
    const { data } = await $fetch('/api/gm/players', {
      params: {
        server: selectedServer.value
      },
      headers: getAuthHeaders()
    });
    players.value = data;
    currentPage.value = 1;
  } catch (error: any) {
    toast.add({
      title: '加载玩家列表失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  } finally {
    loadingPlayers.value = false;
  }
};

// 搜索玩家
const searchPlayers = () => {
  currentPage.value = 1;
};

// 重置搜索
const resetSearch = () => {
  searchForm.value = {
    playerId: '',
    openId: '',
    playerName: ''
  };
  currentPage.value = 1;
};

// 打开封号对话框
const openBanModal = (player: Player) => {
  banModal.value = {
    show: true,
    player,
    duration: '',
    reason: '',
    loading: false
  };
};

// 确认封号
const confirmBan = async () => {
  if (!banModal.value.player) return;
  
  banModal.value.loading = true;
  try {
    await $fetch('/api/gm/ban', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: banModal.value.player.id,
        openId: banModal.value.player.openid,
        platform: banModal.value.player.platform || '1',
        duration: banModal.value.duration,
        reason: banModal.value.reason
      }
    });
    
    toast.add({
      title: '封号成功',
      description: `玩家 ${banModal.value.player.name} 已被封号`,
      color: 'green'
    });
    
    banModal.value.show = false;
    await loadPlayers();
  } catch (error: any) {
    toast.add({
      title: '封号失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  } finally {
    banModal.value.loading = false;
  }
};

// 解封玩家
const unbanPlayer = async (player: Player) => {
  try {
    await $fetch('/api/gm/unban', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: player.id,
        openId: player.openid,
        platform: player.platform || '1'
      }
    });
    
    toast.add({
      title: '解封成功',
      description: `玩家 ${player.name} 已解封`,
      color: 'green'
    });
    
    await loadPlayers();
  } catch (error: any) {
    toast.add({
      title: '解封失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  }
};

// 打开发放物资对话框
const openItemModal = (player: Player) => {
  // 使用上一次的物品选择，如果没有则使用默认空物品
  const initialItems = lastItemSelection.value && lastItemSelection.value.length > 0
    ? JSON.parse(JSON.stringify(lastItemSelection.value)) // 深拷贝避免引用
    : [{ ItemId: 0, ItemNum: 1 }];
  
  itemModal.value = {
    show: true,
    player,
    title: 'GM物资',
    content: `亲爱的玩家 ${player.name}，这是GM为您发放的专属物资，请查收！`,
    items: initialItems,
    loading: false
  };
  // 重置礼包选择
  selectedPackageId.value = undefined;
};

// 添加物品
const addItem = () => {
  itemModal.value.items.push({ ItemId: 0, ItemNum: 1 });
};

// 移除物品
const removeItem = (index: number) => {
  itemModal.value.items.splice(index, 1);
};

const addBatchItem = () => {
  batchItemModal.value.items.push({ ItemId: 0, ItemNum: 1 });
};
const removeBatchItem = (index: number) => {
  batchItemModal.value.items.splice(index, 1);
};

// 批量弹窗打开
const openBatchItemModal = () => {
  if (!selectedServer.value) return;
  if (selectedIds.value.length === 0) return;
  if (selectedIds.value.length > 50) {
    toast.add({ title: '人数过多', description: '单次最多支持 50 人', color: 'red' });
    return;
  }
  
  // 使用上一次的物品选择，如果没有则使用默认空物品
  const initialItems = lastBatchItemSelection.value && lastBatchItemSelection.value.length > 0
    ? JSON.parse(JSON.stringify(lastBatchItemSelection.value)) // 深拷贝避免引用
    : [{ ItemId: 0, ItemNum: 1 }];
  
  isServerWideSend.value = false;
  batchItemModal.value = {
    show: true,
    title: 'GM物资',
    content: `亲爱的玩家们，这是GM为您们发放的物资，请查收！`,
    items: initialItems,
    loading: false
  };
  // 重置礼包选择
  selectedBatchPackageId.value = undefined;
};

// 全服发送弹窗打开
const openServerWideItemModal = () => {
  if (!selectedServer.value) {
    toast.add({ title: '请先选择服务器', color: 'red' });
    return;
  }
  
  if (filteredPlayers.value.length === 0) {
    toast.add({ title: '当前服务器没有玩家', color: 'red' });
    return;
  }
  
  // 使用上一次的物品选择
  const initialItems = lastBatchItemSelection.value && lastBatchItemSelection.value.length > 0
    ? JSON.parse(JSON.stringify(lastBatchItemSelection.value))
    : [{ ItemId: 0, ItemNum: 1 }];
  
  isServerWideSend.value = true;
  batchItemModal.value = {
    show: true,
    title: `全服-GM物资`,
    content: `亲爱的全体玩家，这是GM为大家发放的全服物资，感谢您的支持，请查收！`,
    items: initialItems,
    loading: false
  };
  selectedBatchPackageId.value = undefined;
};

// 确认发放物资（单个玩家，也显示进度）
const confirmSendItems = async () => {
  if (!itemModal.value.player) return;
  
  // 验证标题和内容必填
  if (!itemModal.value.title?.trim()) {
    toast.add({ title: '请填写邮件标题', color: 'red' });
    return;
  }
  if (!itemModal.value.content?.trim()) {
    toast.add({ title: '请填写邮件内容', color: 'red' });
    return;
  }
  
  // 验证物品列表
  const validItems = itemModal.value.items
    .filter(item => item.ItemId > 0 && item.ItemNum > 0)
    .map(item => ({ ItemId: item.ItemId, ItemNum: item.ItemNum }));
  
  if (validItems.length === 0) {
    toast.add({ title: '请至少添加一个有效物品', color: 'red' });
    return;
  }
  
  itemModal.value.loading = true;
  
  // 重置进度（单个玩家也显示进度）
  sendProgress.value = {
    current: 0,
    total: 1,
    success: 0,
    failed: 0
  };
  
  try {
    console.log('[前端] 开始发送物品请求...');
    
    await $fetch('/api/gm/send-items', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: itemModal.value.player.id,
        openId: itemModal.value.player.openid,
        platform: itemModal.value.player.platform || '1',
        roleId: itemModal.value.player.id,
        title: itemModal.value.title,
        content: itemModal.value.content,
        items: validItems
      }
    });
    
    sendProgress.value.success++;
    sendProgress.value.current++;
    
    console.log('[前端] 发送物品成功');
    
    // 保存本次的物品选择
    if (validItems.length > 0) {
      lastItemSelection.value = JSON.parse(JSON.stringify(validItems));
    }
    
    toast.add({
      title: '发放成功',
      description: `已向玩家 ${itemModal.value.player.name} 发放物资`,
      color: 'green'
    });
    
    itemModal.value.show = false;
  } catch (error: any) {
    console.error('[前端] 发送物品失败:', error);
    sendProgress.value.failed++;
    sendProgress.value.current++;
    
    toast.add({
      title: '发放失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  } finally {
    itemModal.value.loading = false;
  }
};

// 批量确认发放（支持全服发送）
const confirmSendItemsBatch = async () => {
  // 判断是全服发送还是普通批量发送
  const targetPlayers = isServerWideSend.value 
    ? filteredPlayers.value 
    : selectedPlayers.value;
  
  if (targetPlayers.length === 0) return;
  
  // 验证标题和内容必填
  if (!batchItemModal.value.title?.trim()) {
    toast.add({ title: '请填写邮件标题', color: 'red' });
    return;
  }
  if (!batchItemModal.value.content?.trim()) {
    toast.add({ title: '请填写邮件内容', color: 'red' });
    return;
  }
  
  // 验证物品列表
  const validItems = batchItemModal.value.items
    .filter(it => it.ItemId > 0 && it.ItemNum > 0)
    .map(it => ({ ItemId: it.ItemId, ItemNum: it.ItemNum }));
  
  if (validItems.length === 0) {
    toast.add({ title: '请至少添加一个有效物品', color: 'red' });
    return;
  }
  
  // 全服发送二次确认
  if (isServerWideSend.value) {
    const confirmed = confirm(`即将向 ${targetPlayers.length} 名玩家发送物资，是否继续？`);
    if (!confirmed) return;
  }
  
  batchItemModal.value.loading = true;
  
  // 重置进度
  sendProgress.value = {
    current: 0,
    total: targetPlayers.length,
    success: 0,
    failed: 0
  };
  
  try {
    // 逐个发送，间隔 20ms
    for (let i = 0; i < targetPlayers.length; i++) {
      const player = targetPlayers[i];
      
      try {
        await $fetch('/api/gm/send-items', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: {
            server: selectedServer.value,
            playerId: player.id,
            openId: player.openid,
            platform: player.platform || '1',
            roleId: player.id,
            title: batchItemModal.value.title,
            content: batchItemModal.value.content,
            items: validItems
          }
        });
        
        sendProgress.value.success++;
      } catch (error) {
        console.error(`发送失败 [${player.id}]:`, error);
        sendProgress.value.failed++;
      }
      
      sendProgress.value.current++;
      
      // 间隔 20ms
      if (i < targetPlayers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    
    // 保存本次的物品选择
    if (validItems.length > 0) {
      lastBatchItemSelection.value = JSON.parse(JSON.stringify(validItems));
    }
    
    toast.add({ 
      title: isServerWideSend.value ? '全服发送完成' : '批量发放完成', 
      description: `成功 ${sendProgress.value.success} 人，失败 ${sendProgress.value.failed} 人`, 
      color: sendProgress.value.failed > 0 ? 'amber' : 'green' 
    });
    
    batchItemModal.value.show = false;
    isServerWideSend.value = false;
    
    if (!isServerWideSend.value) {
      clearSelection();
    }
  } catch (error: any) {
    toast.add({ 
      title: '发送失败', 
      description: error?.message || '请稍后重试', 
      color: 'red' 
    });
  } finally {
    batchItemModal.value.loading = false;
  }
};

// 打开GM充值对话框
const openRechargeModal = (player: Player) => {
  rechargeModal.value = {
    show: true,
    player,
    diamond: 0,
    loading: false
  };
};

// 确认充值
const confirmRecharge = async () => {
  if (!rechargeModal.value.player) return;
  
  rechargeModal.value.loading = true;
  try {
    await $fetch('/api/gm/recharge', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: rechargeModal.value.player.id,
        openId: rechargeModal.value.player.openid,
        platform: rechargeModal.value.player.platform || '1',
        diamond: rechargeModal.value.diamond
      }
    });
    
    toast.add({
      title: '充值成功',
      description: `已为玩家 ${rechargeModal.value.player.name} 充值 ${rechargeModal.value.diamond} 钻石`,
      color: 'green'
    });
    
    rechargeModal.value.show = false;
  } catch (error: any) {
    toast.add({
      title: '充值失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  } finally {
    rechargeModal.value.loading = false;
  }
};

// 发送邮件
const sendMail = async (player: Player) => {
  // 弹出邮件发送对话框
  mailModal.value.player = player;
  mailModal.value.title = '';
  mailModal.value.content = '';
  mailModal.value.show = true;
};

// 邮件对话框数据
const mailModal = ref({
  show: false,
  loading: false,
  player: null as Player | null,
  title: '',
  content: ''
});

// 迁移平台对话框
const migratePlatformModal = ref({
  show: false,
  loading: false,
  player: null as Player | null,
  targetPlatform: '' as 'ios' | 'android' | '',
  existingPlayer: null as any,
  needConfirm: false
});

// 打开迁移平台对话框
const openMigratePlatformModal = async (player: Player, targetPlatform: 'ios' | 'android') => {
  // 先检查目标 puid 是否存在
  try {
    const result: any = await $fetch('/api/gm/check-target-puid', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        openId: player.openid,
        targetPlatform
      }
    });

    if (result.success && result.exists) {
      // 目标账号存在，弹窗让用户确认
      migratePlatformModal.value = {
        show: true,
        loading: false,
        player,
        targetPlatform,
        existingPlayer: result.player,
        needConfirm: true
      };
    } else {
      // 目标账号不存在，直接执行迁移
      await executeMigration(player, targetPlatform);
    }
  } catch (error: any) {
    console.error('检查目标puid失败:', error);
    toast.add({
      title: '检查失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  }
};

// 执行迁移
const executeMigration = async (player: Player, targetPlatform: 'ios' | 'android') => {
  try {
    const response: any = await $fetch('/api/gm/migrate-platform', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: player.id,
        openId: player.openid,
        platform: player.platform,  // 传递当前平台，后端会自动转换到相反平台
        areaId: 1  // 默认微信区，可选参数
      }
    });
    
    toast.add({
      title: '迁移成功',
      description: response.message || `已将玩家 ${player.name} 迁移到 ${targetPlatform.toUpperCase()}`,
      color: 'green'
    });
    
    // 刷新玩家列表
    await loadPlayers();
  } catch (error: any) {
    toast.add({
      title: '迁移失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  }
};

// 确认迁移平台（从弹窗确认）
const confirmMigratePlatform = async () => {
  if (!migratePlatformModal.value.player || !migratePlatformModal.value.targetPlatform) return;
  
  migratePlatformModal.value.loading = true;
  try {
    await executeMigration(
      migratePlatformModal.value.player, 
      migratePlatformModal.value.targetPlatform
    );
    
    migratePlatformModal.value.show = false;
  } catch (error: any) {
    // 错误已在 executeMigration 中处理
  } finally {
    migratePlatformModal.value.loading = false;
  }
};

// 确认发送邮件
const confirmSendMail = async () => {
  if (!mailModal.value.player) return;
  
  mailModal.value.loading = true;
  try {
    await $fetch('/api/gm/send-mail', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: mailModal.value.player.id,
        openId: mailModal.value.player.openid,
        platform: mailModal.value.player.platform || '1',
        roleId: mailModal.value.player.id,
        title: mailModal.value.title,
        content: mailModal.value.content
      }
    });
    
    toast.add({
      title: '发送成功',
      description: `已向玩家 ${mailModal.value.player.name} 发送邮件`,
      color: 'green'
    });
    
    mailModal.value.show = false;
  } catch (error: any) {
    toast.add({
      title: '发送失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  } finally {
    mailModal.value.loading = false;
  }
};

// 开罩子
const handleOpenProtectShield = async (player: Player) => {
  try {
    // 二次确认
    const confirmed = confirm(`确认要为玩家 ${player.name} (ID: ${player.id}) 开罩子吗？`);
    if (!confirmed) return;
    
    await $fetch('/api/gm/open-protect-shield', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: player.id
      }
    });
    
    toast.add({
      title: '开罩子成功',
      description: `已为玩家 ${player.name} 开启罩子`,
      color: 'green'
    });
  } catch (error: any) {
    toast.add({
      title: '开罩子失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  }
};

// 删除角色
const handleDeletePlayer = async (player: Player) => {
  try {
    // 二次确认（危险操作）
    const confirmed = confirm(`⚠️ 警告：确认要删除玩家 ${player.name} (ID: ${player.id}) 吗？\n\n此操作不可逆，请谨慎操作！`);
    if (!confirmed) return;
    
    await $fetch('/api/gm/delete-player', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        server: selectedServer.value,
        playerId: player.id
      }
    });
    
    toast.add({
      title: '删除成功',
      description: `已删除玩家 ${player.name}`,
      color: 'green'
    });
    
    // 刷新玩家列表
    await loadPlayers();
  } catch (error: any) {
    toast.add({
      title: '删除失败',
      description: error.message || '请稍后重试',
      color: 'red'
    });
  }
};

// 监听服务器选择变化
watch(() => selectedServer.value, (newVal) => {
  if (newVal) {
    loadPlayers();
  }
});

// 页面加载时获取服务器列表与物品
onMounted(() => {
  loadServers();
  loadItems();
  // loadGiftPackages(); // 礼包列表改为需要时手动加载
});
</script>

<style scoped>
.page-container {
  @apply p-6;
}

.page-header {
  @apply mb-6;
}

.page-title {
  @apply text-2xl font-bold text-gray-900;
}

.page-description {
  @apply mt-1 text-sm text-gray-600;
}
</style>