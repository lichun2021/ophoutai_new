<template>
  <div class="space-y-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">游戏运营</h1>
        <p class="mt-2 text-sm text-gray-500">查询指定区服的角色，发送文本或带附件的定向邮件。</p>
      </div>
      <UButton v-if="isSuperAdmin" to="/admin/operation/gm-logs" icon="i-heroicons-rectangle-stack" color="gray" variant="soft">
        操作日志
      </UButton>
    </div>

    <UAlert v-if="!isSuperAdmin" color="red" icon="i-heroicons-lock-closed" title="仅超级管理员可使用游戏运营功能" />

    <template v-else>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">1. 选择区服与收件人</h2>
            <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-arrow-path" :loading="loadingServers" :disabled="isSending" @click="loadServers">刷新区服</UButton>
          </div>
        </template>
        <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <UFormGroup label="游戏区服" required>
            <USelectMenu
              v-model="selectedServer"
              :options="serverOptions"
              value-attribute="value"
              option-attribute="label"
              placeholder="请选择区服"
              :loading="loadingServers"
              :disabled="isSending"
              class="w-full"
            />
          </UFormGroup>
          <UFormGroup label="角色 WUID">
            <UInput
              v-model="queryWuid"
              inputmode="numeric"
              placeholder="输入完整角色 WUID"
              :disabled="isSending || !selectedServer || !!serverConfigurationError"
              @keyup.enter="findPlayer"
            />
          </UFormGroup>
          <UButton icon="i-heroicons-magnifying-glass" :loading="loadingPlayer" :disabled="isSending || !selectedServer || !!serverConfigurationError" @click="findPlayer">
            查询角色
          </UButton>
        </div>
        <p v-if="serverError" class="mt-3 text-sm text-red-600" role="alert">{{ serverError }}</p>
        <p v-else-if="!loadingServers && serverOptions.length === 0" class="mt-3 text-sm text-gray-500">尚未配置可用区服，请先填写区服 ID 与运营接口地址。</p>
        <p v-if="serverNotice" class="mt-3 text-sm text-amber-700">{{ serverNotice }}</p>
        <UAlert v-if="serverConfigurationError" class="mt-3" color="amber" icon="i-heroicons-exclamation-triangle" title="当前区服尚未完成运营配置" :description="serverConfigurationError" />
        <p v-if="queryError" class="mt-3 text-sm text-red-600" role="alert">{{ queryError }}</p>

        <div v-if="players.length" class="mt-4 space-y-3">
          <div v-for="player in players" :key="player.wuid" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <div class="font-medium text-gray-900">{{ player.name || '未命名角色' }}</div>
              <div class="mt-1 break-all font-mono text-sm text-gray-600">WUID：{{ player.wuid }}</div>
              <div class="mt-1 flex gap-4 text-xs text-gray-500">
                <span>区服：{{ player.worldId ?? selectedServer }}</span>
                <span v-if="player.level !== undefined">等级：{{ player.level }}</span>
                <span v-if="player.vipLevel !== undefined">VIP：{{ player.vipLevel }}</span>
              </div>
            </div>
            <UButton :variant="selectedPlayer?.wuid === player.wuid ? 'solid' : 'soft'" :disabled="isSending" @click="selectPlayer(player)">
              {{ selectedPlayer?.wuid === player.wuid ? '已选为收件人' : '设为收件人' }}
            </UButton>
          </div>
        </div>

        <div class="mt-5 border-t border-gray-100 pt-5">
          <div class="flex flex-wrap gap-2">
            <UButton :variant="recipientMode === 'single' ? 'solid' : 'soft'" :disabled="isSending" @click="recipientMode = 'single'">单人邮件</UButton>
            <UButton :variant="recipientMode === 'batch' ? 'solid' : 'soft'" :disabled="isSending" @click="recipientMode = 'batch'">定向批量邮件</UButton>
          </div>
          <div v-if="recipientMode === 'single'" class="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
            <template v-if="selectedPlayer">
              <div class="font-medium">收件人：{{ selectedPlayer.name || '未命名角色' }}</div>
              <div class="mt-1 break-all font-mono text-gray-600">{{ selectedPlayer.wuid }}</div>
            </template>
            <span v-else class="text-gray-500">查询角色后，点击“设为收件人”。</span>
          </div>
          <div v-else class="mt-4 space-y-2">
            <UFormGroup label="收件人 WUID 清单" required help="每行一个完整 WUID，最多 50 名不同角色。只会发送给此清单中的角色。">
              <UTextarea v-model="batchWuids" :rows="5" placeholder="每行输入一个 WUID" :disabled="isSending || !selectedServer" />
            </UFormGroup>
            <div class="flex flex-wrap gap-3 text-sm text-gray-500">
              <span>不同收件人：{{ batchRecipients.length }} / 50</span>
              <span v-if="duplicateCount">{{ duplicateCount }} 条重复 WUID 将合并</span>
            </div>
            <p v-if="batchInputError" class="text-sm text-red-600" role="alert">{{ batchInputError }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">2. 编写邮件</h2>
        </template>
        <div class="space-y-4">
          <UFormGroup label="邮件标题" required>
            <UInput v-model="mailTitle" placeholder="输入邮件标题" :maxlength="200" :disabled="isSending" />
          </UFormGroup>
          <UFormGroup label="邮件正文" required>
            <UTextarea v-model="mailContent" placeholder="输入邮件正文" :rows="4" :maxlength="5000" :disabled="isSending" />
          </UFormGroup>

          <div class="border-t border-gray-100 pt-4">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-medium">附件物品</h3>
              <span class="text-xs text-gray-500">{{ attachments.length }} / 6 组</span>
            </div>
            <p class="mt-1 text-xs text-gray-500">可不添加附件，仅发送文本。物品名称和 ID 会一起显示。</p>
            <div v-if="attachments.length" class="mt-3 space-y-2">
              <div v-for="(item, index) in attachments" :key="item.id" class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
                <div class="min-w-0 flex-1">
                  <div class="break-words text-sm font-medium">{{ item.name }}</div>
                  <div class="font-mono text-xs text-gray-500">ID {{ item.id }}</div>
                </div>
                <UFormGroup label="数量" class="w-32">
                  <UInput v-model="item.amount" type="number" :min="1" :step="1" :disabled="isSending" />
                </UFormGroup>
                <UButton color="red" variant="ghost" icon="i-heroicons-trash" :aria-label="`移除物品 ${item.id}`" :disabled="isSending" @click="removeAttachment(index)" />
              </div>
            </div>

            <div class="mt-4 rounded-lg border border-gray-200 p-3">
              <UInput v-model="itemSearch" icon="i-heroicons-magnifying-glass" placeholder="按物品 ID 或名称搜索" :maxlength="200" :disabled="isSending" :loading="loadingItems" />
              <p v-if="itemError" class="mt-2 text-sm text-red-600" role="alert">{{ itemError }}</p>
              <div class="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto">
                <div v-for="item in itemOptions" :key="item.id" class="flex items-center gap-3 py-2">
                  <div class="min-w-0 flex-1">
                    <div class="break-words text-sm">{{ item.name }}</div>
                    <div class="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span class="font-mono">ID {{ item.id }}</span>
                      <span>{{ categoryLabel(item.category) }}</span>
                    </div>
                  </div>
                  <UButton size="xs" variant="soft" :disabled="isSending || attachments.length >= 6 || attachmentExists(item.id)" @click="addAttachment(item)">
                    {{ attachmentExists(item.id) ? '已添加' : '添加' }}
                  </UButton>
                </div>
                <p v-if="!loadingItems && !itemOptions.length && !itemError" class="py-4 text-center text-sm text-gray-500">没有找到匹配物品</p>
              </div>
              <p v-if="itemTotal > itemOptions.length" class="mt-2 text-xs text-gray-500">共 {{ itemTotal }} 项，显示前 {{ itemOptions.length }} 项；输入更多关键词缩小范围。</p>
            </div>
          </div>
          <UAlert v-if="draftError" color="red" icon="i-heroicons-exclamation-circle" :title="draftError" />
        </div>
        <template #footer>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm text-gray-500">{{ recipientMode === 'single' ? '单人邮件' : '定向批量邮件' }} · {{ recipientCount }} 名收件人 · {{ attachments.length }} 组附件</span>
            <UButton icon="i-heroicons-envelope" :disabled="isSending || !selectedServer" @click="prepareReview">核对并发送</UButton>
          </div>
        </template>
      </UCard>

      <UCard v-if="sendResults.length || sendError">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-semibold">发送结果</h2>
            <span v-if="sendResults.length" class="text-sm">成功 {{ successfulResults }}，失败或未确认 {{ sendResults.length - successfulResults }}</span>
          </div>
        </template>
        <UAlert v-if="sendError" class="mb-4" color="amber" icon="i-heroicons-exclamation-triangle" :title="sendError" />
        <p v-if="successfulResults && successfulResults < sendResults.length" class="mb-4 text-sm text-amber-700">部分邮件已发送。请先核对结果，再另行选择失败收件人，避免向成功角色重复发送。</p>
        <div class="overflow-x-auto">
          <table v-if="sendResults.length" class="w-full text-left text-sm">
            <thead class="border-b border-gray-200 text-gray-500"><tr><th class="p-2">角色 WUID</th><th class="p-2">状态</th><th class="p-2">说明</th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="result in sendResults" :key="result.playerId">
                <td class="break-all p-2 font-mono">{{ result.playerId }}</td>
                <td class="whitespace-nowrap p-2"><UBadge :color="result.success ? 'green' : result.unconfirmed ? 'amber' : 'red'" variant="soft">{{ result.success ? '成功' : result.unconfirmed ? '未确认' : '失败' }}</UBadge></td>
                <td class="min-w-40 break-words p-2">{{ result.message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UModal v-model="reviewOpen" :prevent-close="isSending" :ui="{ width: 'sm:max-w-2xl' }">
        <UCard v-if="review">
          <template #header><h2 class="font-semibold">确认发送邮件</h2></template>
          <div class="max-h-[65vh] space-y-4 overflow-y-auto">
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt class="text-gray-500">区服</dt><dd>{{ review.serverLabel }}</dd>
              <dt class="text-gray-500">发送方式</dt><dd>{{ review.mode === 'single' ? '单人邮件' : '定向批量邮件' }}</dd>
              <dt class="text-gray-500">邮件标题</dt><dd class="break-words">{{ review.title }}</dd>
              <dt class="text-gray-500">邮件正文</dt><dd class="whitespace-pre-wrap break-words">{{ review.content }}</dd>
            </dl>
            <div>
              <div class="mb-2 text-sm font-medium">收件人（{{ review.recipients.length }} 名）</div>
              <div class="max-h-36 overflow-y-auto rounded bg-gray-50 p-3 font-mono text-xs">
                <div v-for="wuid in review.recipients" :key="wuid" class="break-all py-0.5">{{ wuid }}</div>
              </div>
            </div>
            <div>
              <div class="mb-2 text-sm font-medium">附件（{{ review.items.length }} 组）</div>
              <p v-if="!review.items.length" class="text-sm text-gray-500">无附件，仅发送文本</p>
              <ul v-else class="space-y-1 text-sm">
                <li v-for="item in review.items" :key="item.i" class="break-words">{{ item.name }}（ID {{ item.i }}）× {{ item.a }}</li>
              </ul>
            </div>
            <UAlert v-if="isRepeatedAttempt" color="amber" icon="i-heroicons-exclamation-triangle" title="此内容已提交过，请先核对操作日志和游戏内邮件。再次发送可能重复发放附件。" />
            <UCheckbox v-if="isRepeatedAttempt" v-model="repeatAcknowledged" label="我已核对上次结果，确认需要再次发送此内容" :disabled="isSending" />
            <p class="text-xs text-gray-500">发送后将记录操作日志。发送结果未确认时，请先核对再手动处理。</p>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="gray" variant="ghost" :disabled="isSending" @click="reviewOpen = false">返回修改</UButton>
              <UButton :loading="isSending" :disabled="isRepeatedAttempt && !repeatAcknowledged" @click="sendReviewedMail">确认发送给 {{ review.recipients.length }} 名角色</UButton>
            </div>
          </template>
        </UCard>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '~/store/auth';

interface GameServer {
  name: string;
  bname?: string;
  server_id: number | string | null;
  is_configured?: boolean;
  configuration_error?: string;
}
interface Player {
  id: string;
  wuid: string;
  name: string;
  worldId?: number;
  level?: number;
  vipLevel?: number;
}
interface GmItem {
  id: string;
  name: string;
  category: string;
}
interface Attachment extends GmItem {
  amount: number | string;
}
interface SendResult {
  playerId: string;
  success: boolean;
  message: string;
  unconfirmed?: boolean;
}
interface MailReview {
  mode: 'single' | 'batch';
  server: string;
  serverLabel: string;
  recipients: string[];
  title: string;
  content: string;
  items: Array<{ i: number; a: number; name: string }>;
}

const authStore = useAuthStore();
const isSuperAdmin = computed(() => authStore.isLoggedIn && !authStore.isUser && authStore.permissions?.level === 0);
const selectedServer = ref('');
const servers = ref<GameServer[]>([]);
const loadingServers = ref(false);
const serverError = ref('');
const serverNotice = ref('');
const queryWuid = ref('');
const loadingPlayer = ref(false);
const queryError = ref('');
const players = ref<Player[]>([]);
const selectedPlayer = ref<Player | null>(null);
const recipientMode = ref<'single' | 'batch'>('single');
const batchWuids = ref('');
const mailTitle = ref('');
const mailContent = ref('');
const attachments = ref<Attachment[]>([]);
const itemSearch = ref('');
const itemOptions = ref<GmItem[]>([]);
const itemTotal = ref(0);
const loadingItems = ref(false);
const itemError = ref('');
const draftError = ref('');
const isSending = ref(false);
const reviewOpen = ref(false);
const review = ref<MailReview | null>(null);
const repeatAcknowledged = ref(false);
const lastAttemptFingerprint = ref('');
const sendResults = ref<SendResult[]>([]);
const sendError = ref('');
let mounted = false;
let itemSearchTimer: ReturnType<typeof setTimeout> | undefined;
let itemRequest = 0;
let playerRequest = 0;

const serverOptions = computed(() => servers.value
  .filter(server => server.server_id !== null && /^[1-9]\d*$/.test(String(server.server_id)))
  .map(server => ({ value: String(server.server_id), label: `${server.name}（区服 ${server.server_id}）` })));
const selectedServerLabel = computed(() => serverOptions.value.find(server => server.value === selectedServer.value)?.label || selectedServer.value);
const serverConfigurationError = computed(() => {
  const server = servers.value.find(server => String(server.server_id) === selectedServer.value);
  return server?.configuration_error || (server?.is_configured === false ? '请先完成该区服的运营连接配置。' : '');
});
const batchLines = computed(() => batchWuids.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
const batchRecipients = computed(() => [...new Set(batchLines.value)]);
const duplicateCount = computed(() => batchLines.value.length - batchRecipients.value.length);
const batchInputError = computed(() => {
  const invalid = batchLines.value.findIndex(wuid => !isValidWuid(wuid));
  if (invalid >= 0) return `第 ${invalid + 1} 条 WUID 无效，请填写完整的正整数角色编号。`;
  if (batchRecipients.value.length > 50) return '一次最多发送给 50 名不同角色，请拆分清单。';
  return '';
});
const recipientCount = computed(() => recipientMode.value === 'single' ? (selectedPlayer.value ? 1 : 0) : batchRecipients.value.length);
const successfulResults = computed(() => sendResults.value.filter(result => result.success).length);
const isRepeatedAttempt = computed(() => !!review.value && fingerprint(review.value) === lastAttemptFingerprint.value);

function isValidWuid(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return false;
  return value.length < 19 || value <= '9223372036854775807';
}
function errorMessage(error: any, fallback: string): string {
  return String(error?.data?.message || error?.data?.statusMessage || error?.message || fallback);
}
function categoryLabel(category: string): string {
  return ({ item: '道具', equipment: '装备', stone: '晶石', partner_fragment: '伙伴碎片', equipment_fragment: '装备碎片' } as Record<string, string>)[category] || '物品';
}
function fingerprint(value: MailReview): string {
  return JSON.stringify({ server: value.server, recipients: [...value.recipients].sort(), title: value.title, content: value.content, items: value.items.map(({ i, a }) => ({ i, a })).sort((a, b) => a.i - b.i) });
}

async function loadServers() {
  if (!isSuperAdmin.value || loadingServers.value) return;
  loadingServers.value = true;
  serverError.value = '';
  serverNotice.value = '';
  try {
    const response: any = await $fetch('/api/gm/servers', { credentials: 'include' });
    if (!response?.success || !Array.isArray(response.data)) throw new Error(response?.message || '区服加载失败');
    servers.value = response.data;
    if (Number(response.unconfiguredCount) > 0) serverNotice.value = String(response.message || '部分区服缺少有效区服 ID，请先完善配置。');
    if (selectedServer.value && !serverOptions.value.some(server => server.value === selectedServer.value)) selectedServer.value = '';
    if (servers.value.length && !serverOptions.value.length) serverError.value = '区服尚未填写有效区服 ID，请先完成配置。';
  } catch (error) {
    serverError.value = errorMessage(error, '区服加载失败，请稍后重试');
  } finally {
    loadingServers.value = false;
  }
}

async function findPlayer() {
  if (isSending.value || loadingPlayer.value || !selectedServer.value || serverConfigurationError.value) return;
  const wuid = queryWuid.value.trim();
  if (!isValidWuid(wuid)) {
    queryError.value = '请填写完整、有效的角色 WUID。';
    return;
  }
  const request = ++playerRequest;
  loadingPlayer.value = true;
  queryError.value = '';
  players.value = [];
  selectedPlayer.value = null;
  try {
    const response: any = await $fetch('/api/gm/players', { query: { server: selectedServer.value, wuid }, credentials: 'include' });
    if (request !== playerRequest) return;
    if (!response?.success || !Array.isArray(response.data)) throw new Error(response?.message || '角色查询失败');
    const normalized = response.data.map((player: any) => {
      const id = typeof player.wuid === 'string' ? player.wuid : player.id;
      if (!isValidWuid(id)) throw new Error('角色编号格式异常，请重新查询');
      if (id !== wuid) throw new Error('查询返回的角色 WUID 不一致，请核对后重新查询');
      return { ...player, id, wuid: id, name: String(player.name || '') } as Player;
    });
    players.value = normalized;
    if (!normalized.length) queryError.value = '该区服没有找到此 WUID 对应的角色。';
  } catch (error) {
    if (request === playerRequest) queryError.value = errorMessage(error, '角色查询失败');
  } finally {
    if (request === playerRequest) loadingPlayer.value = false;
  }
}

function selectPlayer(player: Player) {
  selectedPlayer.value = { ...player };
  recipientMode.value = 'single';
  draftError.value = '';
}

async function loadItemOptions() {
  if (!isSuperAdmin.value) return;
  const request = ++itemRequest;
  loadingItems.value = true;
  itemError.value = '';
  try {
    const response: any = await $fetch('/api/gm/items', { query: { search: itemSearch.value.trim(), limit: 100 }, credentials: 'include' });
    if (request !== itemRequest) return;
    if (!response?.success || !Array.isArray(response.data)) throw new Error(response?.message || '物品加载失败');
    itemOptions.value = response.data.map((item: any) => ({ id: String(item.id), name: String(item.name), category: String(item.category || 'item') }));
    itemTotal.value = Number(response.total) || itemOptions.value.length;
  } catch (error) {
    if (request === itemRequest) {
      itemOptions.value = [];
      itemError.value = errorMessage(error, '物品加载失败');
    }
  } finally {
    if (request === itemRequest) loadingItems.value = false;
  }
}
function attachmentExists(id: string) { return attachments.value.some(item => item.id === id); }
function addAttachment(item: GmItem) {
  if (isSending.value || attachments.value.length >= 6 || attachmentExists(item.id)) return;
  attachments.value.push({ ...item, amount: 1 });
  draftError.value = '';
}
function removeAttachment(index: number) {
  if (!isSending.value) attachments.value.splice(index, 1);
}

function prepareReview() {
  if (isSending.value) return;
  draftError.value = '';
  if (!selectedServer.value) return void (draftError.value = '请先选择区服。');
  if (serverConfigurationError.value) return void (draftError.value = serverConfigurationError.value);
  if (!mailTitle.value.trim() || mailTitle.value.trim().length > 200) return void (draftError.value = '请填写 1–200 字的邮件标题。');
  if (!mailContent.value.trim() || mailContent.value.trim().length > 5000) return void (draftError.value = '请填写 1–5000 字的邮件正文。');
  if (recipientMode.value === 'single' && !selectedPlayer.value) return void (draftError.value = '请先查询角色并设为收件人。');
  if (recipientMode.value === 'batch' && (batchInputError.value || !batchRecipients.value.length)) return void (draftError.value = batchInputError.value || '请填写收件人 WUID 清单。');
  if (attachments.value.length > 6) return void (draftError.value = '一封邮件最多添加 6 组附件。');
  const items = attachments.value.map(item => ({ i: Number(item.id), a: Number(item.amount), name: item.name }));
  if (items.some(item => !Number.isSafeInteger(item.i) || item.i <= 0 || !Number.isSafeInteger(item.a) || item.a <= 0)) return void (draftError.value = '物品 ID 与数量必须是有效的正整数。');
  if (new Set(items.map(item => item.i)).size !== items.length) return void (draftError.value = '请合并相同物品，避免重复附件。');
  const recipients = recipientMode.value === 'single' ? [selectedPlayer.value!.wuid] : [...batchRecipients.value];
  review.value = { mode: recipientMode.value, server: selectedServer.value, serverLabel: selectedServerLabel.value, recipients, title: mailTitle.value.trim(), content: mailContent.value.trim(), items };
  repeatAcknowledged.value = false;
  reviewOpen.value = true;
}

async function sendReviewedMail() {
  const snapshot = review.value;
  if (!snapshot || isSending.value || (isRepeatedAttempt.value && !repeatAcknowledged.value)) return;
  isSending.value = true;
  sendError.value = '';
  sendResults.value = [];
  lastAttemptFingerprint.value = fingerprint(snapshot);
  try {
    const common = { server: snapshot.server, title: snapshot.title, content: snapshot.content, items: snapshot.items.map(({ i, a }) => ({ i, a })) };
    const response: any = await $fetch(snapshot.mode === 'single' ? '/api/gm/send-mail' : '/api/gm/send-items-batch', {
      method: 'POST',
      credentials: 'include',
      retry: 0,
      body: snapshot.mode === 'single' ? { ...common, playerId: snapshot.recipients[0] } : { ...common, players: snapshot.recipients.map(playerId => ({ playerId })) },
    });
    const results = response?.data?.results;
    if (!Array.isArray(results)) throw new Error('发送结果未确认，请核对操作日志和游戏内邮件后再处理。');
    sendResults.value = snapshot.recipients.map(playerId => {
      const result = results.find((item: any) => item.playerId === playerId);
      if (!result || !['confirmed', 'failed', 'unknown'].includes(result.status)) return { playerId, success: false, unconfirmed: true, message: '此收件人的发送结果未确认，请先核对。' };
      return { playerId, success: result.success === true && result.status === 'confirmed', unconfirmed: result.status === 'unknown', message: String(result.message || (result.success ? '发送成功' : '发送失败')) };
    });
    if (!response?.success || sendResults.value.some(result => !result.success) || response?.data?.auditWarning) sendError.value = String(response?.message || '部分邮件发送失败或结果未确认，请逐条核对。');
    reviewOpen.value = false;
  } catch (error) {
    sendError.value = errorMessage(error, '发送结果未确认，请先核对后再处理。');
    sendResults.value = snapshot.recipients.map(playerId => ({ playerId, success: false, unconfirmed: true, message: '未确认，请核对操作日志和游戏内邮件后再发送。' }));
    reviewOpen.value = false;
  } finally {
    isSending.value = false;
  }
}

watch(selectedServer, () => {
  playerRequest++;
  loadingPlayer.value = false;
  queryError.value = '';
  players.value = [];
  selectedPlayer.value = null;
  batchWuids.value = '';
  reviewOpen.value = false;
});
watch(itemSearch, () => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer);
  itemRequest++;
  itemOptions.value = [];
  itemTotal.value = 0;
  loadingItems.value = true;
  itemError.value = '';
  itemSearchTimer = setTimeout(loadItemOptions, 250);
});
watch(queryWuid, () => {
  playerRequest++;
  loadingPlayer.value = false;
  queryError.value = '';
  players.value = [];
  selectedPlayer.value = null;
});
watch(isSuperAdmin, allowed => {
  if (mounted && allowed) { loadServers(); loadItemOptions(); }
  if (!allowed) { servers.value = []; selectedServer.value = ''; itemOptions.value = []; }
});
onMounted(() => {
  mounted = true;
  if (isSuperAdmin.value) { loadServers(); loadItemOptions(); }
});
onBeforeUnmount(() => {
  itemRequest++;
  playerRequest++;
  if (itemSearchTimer) clearTimeout(itemSearchTimer);
});
</script>
