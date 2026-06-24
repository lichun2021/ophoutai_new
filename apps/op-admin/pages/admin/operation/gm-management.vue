<template>
  <div class="role-data-page">
    <div class="page-header">
      <div class="flex items-center gap-3 mb-4">
        <UIcon name="i-heroicons-command-line" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">游戏运营</h2>
          <p class="text-sm text-gray-600 mt-1">查询游戏角色，执行封号、发放道具邮件等GM操作</p>
        </div>
      </div>
    </div>

    <!-- ===== 游戏服切换栏 ===== -->
    <UCard class="mb-4">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2 shrink-0">
          <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-gray-500" />
          <span class="text-sm font-medium text-gray-700">当前游戏服：</span>
        </div>

        <!-- 加载中 -->
        <div v-if="serversLoading" class="flex items-center gap-2 text-gray-400 text-sm">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          加载服务器列表...
        </div>

        <!-- 下拉选择器 -->
        <div v-else class="flex items-center gap-2 flex-1 min-w-0">
          <USelectMenu
            v-model="activeServerOption"
            :options="serverSelectOptions"
            option-attribute="label"
            value-attribute="value"
            :searchable="serverList.length > 5"
            searchable-placeholder="搜索区服名称..."
            placeholder="选择游戏服..."
            class="w-56"
            @change="onServerOptionChange"
          >
            <template #leading>
              <UIcon name="i-heroicons-server" class="w-4 h-4 text-gray-400" />
            </template>
            <template #option="{ option }">
              <div class="flex items-center gap-2">
                <UIcon
                  :name="option.value === '__all__' ? 'i-heroicons-globe-alt' : 'i-heroicons-server'"
                  class="w-3.5 h-3.5 shrink-0"
                  :class="option.value === '__all__' ? 'text-blue-500' : 'text-gray-400'"
                />
                <span class="truncate">{{ option.label }}</span>
                <UBadge v-if="option.serverId" :label="`#${option.serverId}`" size="xs" variant="soft" color="gray" class="ml-auto" />
              </div>
            </template>
          </USelectMenu>

          <!-- 当前服信息徽章 -->
          <div v-if="activeServer" class="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-1.5">
            <UIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5 text-green-500" />
            <span><b class="text-gray-700">{{ activeServer.name }}</b></span>
            <span v-if="activeServer.server_id" class="text-gray-400">/ server_id: {{ activeServer.server_id }}</span>
            <span class="text-gray-400">/ bname: {{ activeServer.bname }}</span>
          </div>
          <span v-else class="text-sm text-gray-400">显示全部区服角色</span>

          <!-- 没有服务器 -->
          <p v-if="serverList.length === 0" class="text-sm text-gray-400 italic">
            暂无服务器配置，请先在「服务器列表」中添加。
          </p>
        </div>

        <div class="ml-auto">
          <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-arrow-path" @click="loadServers">刷新</UButton>
        </div>
      </div>
    </UCard>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="filter-content">
        <div class="filter-row">
          <UFormGroup label="用户ID" class="flex-1">
            <UInput v-model="filters.user_id" placeholder="请输入用户ID" icon="i-heroicons-hashtag" @keyup.enter="doSearch" />
          </UFormGroup>
          <UFormGroup label="小号ID" class="flex-1">
            <UInput v-model="filters.subuser_id" placeholder="请输入小号ID" icon="i-heroicons-user" @keyup.enter="doSearch" />
          </UFormGroup>
          <UFormGroup label="角色名称" class="flex-1">
            <UInput v-model="filters.character_name" placeholder="请输入角色名称" icon="i-heroicons-user-circle" @keyup.enter="doSearch" />
          </UFormGroup>
          <UFormGroup label="角色UUID" class="flex-1">
            <UInput v-model="filters.uuid" placeholder="请输入角色UUID" icon="i-heroicons-key" @keyup.enter="doSearch" />
          </UFormGroup>
        </div>
        <div class="flex gap-3 mt-4 pt-4 border-t">
          <UButton @click="doSearch" :loading="loading" icon="i-heroicons-magnifying-glass">查询</UButton>
          <UButton color="gray" variant="outline" @click="resetFilters" icon="i-heroicons-arrow-path">重置</UButton>
        </div>
      </div>
    </UCard>

    <!-- 角色列表 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
            <h3 class="text-base font-medium">角色列表</h3>
            <UBadge v-if="pagination.total > 0" :label="`${pagination.total}条记录`" variant="soft" size="xs" />
            <UBadge v-if="activeServer" :label="activeServer.name" color="blue" variant="soft" size="xs" />
            <UBadge v-if="selectedRows.length > 0" :label="`已选 ${selectedRows.length} 人`" color="blue" variant="solid" size="xs" />
          </div>
          <!-- 批量操作 -->
          <div class="flex items-center gap-2">
            <template v-if="selectedRows.length > 0">
              <UButton size="sm" color="primary" icon="i-heroicons-envelope" @click="openBatchMail">
                批量发邮件（{{ selectedRows.length }}人）
              </UButton>
              <UButton size="sm" color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="clearSelection">
                取消选择
              </UButton>
            </template>
          </div>
        </div>
      </template>

      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-500 animate-spin" />
        <p class="mt-2 text-gray-600">正在加载数据...</p>
      </div>

      <div v-else class="mobile-table-wrapper">
        <table class="uniform-raw-table">
          <thead>
            <tr>
              <th class="col-check">
                <input type="checkbox" :checked="isAllSelected" :indeterminate="isIndeterminate" @change="toggleSelectAll" class="cursor-pointer w-4 h-4" />
              </th>
              <th>用户ID</th>
              <th>小号ID</th>
              <th>用户名</th>
              <th>角色名称</th>
              <th>角色UUID</th>
              <th>游戏</th>
              <th>等级</th>
              <th>服务器</th>
              <th>渠道</th>
              <th>最后登录</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="characters.length === 0">
              <td colspan="13" class="empty-cell">
                <div class="flex flex-col items-center py-8 text-gray-400">
                  <UIcon name="i-heroicons-user-circle" class="w-10 h-10 mb-2" />
                  <p>暂无角色记录，请调整筛选条件后重新查询</p>
                </div>
              </td>
            </tr>
            <tr
              v-for="row in characters"
              :key="row.id"
              :class="['hover:bg-gray-50 transition-colors', isSelected(row) ? 'bg-blue-50' : '']"
            >
              <td class="col-check">
                <input type="checkbox" :checked="isSelected(row)" @change="toggleRow(row)" class="cursor-pointer w-4 h-4" />
              </td>
              <td>{{ row.user_id || '-' }}</td>
              <td><span class="font-medium text-green-600">{{ row.subuser_id || '-' }}</span></td>
              <td>{{ row.username || '-' }}</td>
              <td><span class="font-medium text-purple-600">{{ row.character_name || '-' }}</span></td>
              <td>
                <span v-if="row.uuid" class="font-mono text-sm cursor-pointer" :title="row.uuid" @click="copyText(row.uuid)">
                  {{ row.uuid.slice(0,8) }}...{{ row.uuid.slice(-4) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td>
                <UBadge v-if="row.game_name" :label="row.game_name" color="indigo" variant="soft" />
                <span v-else class="text-gray-400">-</span>
              </td>
              <td>{{ row.character_level ?? '-' }}</td>
              <td>
                <!-- 显示服务器名称（优先用 server_list 反查） -->
                <UBadge
                  :label="resolveServerName(row.server_id)"
                  :color="row.server_id ? 'gray' : 'red'"
                  variant="soft"
                />
              </td>
              <td>{{ row.channel_code || '-' }}</td>
              <td class="text-sm">{{ fmtTime(row.last_login_at) }}</td>
              <td class="text-sm">{{ fmtTime(row.created_at) }}</td>
              <td>
                <UDropdown :items="getActions(row)">
                  <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" size="xs" />
                </UDropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div v-if="pagination.total > 0" class="flex justify-between items-center mt-6 pt-4 border-t">
        <div class="text-sm text-gray-600">共 {{ pagination.total }} 条，第 {{ pagination.page }}/{{ Math.ceil(pagination.total/pagination.pageSize) }} 页</div>
        <div class="flex items-center gap-2">
          <UButton v-if="pagination.page > 1" @click="goPage(pagination.page-1)" variant="outline" size="sm" icon="i-heroicons-chevron-left" :disabled="loading">上一页</UButton>
          <UButton v-for="p in visiblePages" :key="p" @click="goPage(p)" :variant="p===pagination.page?'solid':'outline'" size="sm" :disabled="loading">{{ p }}</UButton>
          <UButton v-if="pagination.page < Math.ceil(pagination.total/pagination.pageSize)" @click="goPage(pagination.page+1)" variant="outline" size="sm" icon="i-heroicons-chevron-right" :disabled="loading">下一页</UButton>
        </div>
      </div>
    </UCard>

    <!-- 封号对话框 -->
    <UModal v-model="banModal.show">
      <UCard>
        <template #header><h3 class="text-base font-semibold">封号操作</h3></template>
        <div class="space-y-4">
          <div class="p-3 bg-gray-50 rounded-lg text-sm grid grid-cols-2 gap-2">
            <div>角色名: {{ banModal.row?.character_name }}</div>
            <div>UUID: {{ banModal.row?.uuid?.slice(0,12) }}...</div>
            <div>小号ID: {{ banModal.row?.subuser_id }}</div>
            <div>服务器: {{ resolveServerName(banModal.row?.server_id) }}</div>
          </div>
          <UFormGroup label="封号时长" required>
            <USelectMenu v-model="banModal.duration" :options="banDurations" value-attribute="value" option-attribute="label" placeholder="选择时长" />
          </UFormGroup>
          <UFormGroup label="平台" required>
            <USelectMenu v-model="banModal.platform" :options="platformOptions" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UFormGroup label="封号原因" required>
            <UTextarea v-model="banModal.reason" placeholder="请输入封号原因" :rows="3" />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="banModal.show=false">取消</UButton>
            <UButton color="red" @click="confirmBan" :loading="banModal.loading" :disabled="!banModal.duration||!banModal.reason">确认封号</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 单个发邮件对话框 -->
    <UModal v-model="mailModal.show" :ui="{width:'sm:max-w-2xl'}" :prevent-close="mailModal.loading">
      <UCard>
        <template #header><h3 class="text-base font-semibold">发送邮件（含道具）</h3></template>
        <div class="space-y-4">
          <div class="p-3 bg-gray-50 rounded-lg text-sm grid grid-cols-2 gap-2">
            <div>角色名: {{ mailModal.row?.character_name }}</div>
            <div>小号ID: {{ mailModal.row?.subuser_id }}</div>
            <div>UUID: {{ mailModal.row?.uuid?.slice(0,12) }}...</div>
            <div>服务器: {{ resolveServerName(mailModal.row?.server_id) }}</div>
          </div>
          <UFormGroup label="平台">
            <USelectMenu v-model="mailModal.platform" :options="platformOptions" value-attribute="value" option-attribute="label" class="w-40" />
          </UFormGroup>
          <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-gift" class="text-blue-600" />
              <label class="text-sm font-medium text-blue-900">快速选择礼包（可选）</label>
            </div>
            <div class="flex gap-2">
              <USelectMenu v-model="selectedPkg" :options="pkgOptions" value-attribute="value" option-attribute="label" :searchable="searchPkgs" searchable-placeholder="搜索礼包" placeholder="选择礼包" class="flex-1" @click="loadPkgs" />
              <UButton @click="applyPkg(mailModal)" :disabled="!selectedPkg" size="sm" color="blue" variant="soft">应用</UButton>
            </div>
          </div>
          <UFormGroup label="邮件标题" required>
            <UInput v-model="mailModal.title" placeholder="输入邮件标题" />
          </UFormGroup>
          <UFormGroup label="邮件内容" required>
            <UTextarea v-model="mailModal.content" placeholder="输入邮件内容" :rows="3" />
          </UFormGroup>
          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium">道具列表（不填则发纯文本邮件）</label>
              <UButton size="xs" variant="soft" icon="i-heroicons-plus" @click="mailModal.items.push({ ItemId:'', ItemNum:1 })">添加道具</UButton>
            </div>
            <div class="space-y-2">
              <div v-for="(item,i) in mailModal.items" :key="i" class="flex gap-2 items-center">
                <USelectMenu v-model="item.ItemId" :options="itemOptions" value-attribute="value" option-attribute="label" :searchable="searchItems" searchable-placeholder="搜索道具" placeholder="选择道具" class="flex-1" />
                <UInput v-model.number="item.ItemNum" type="number" placeholder="数量" class="w-20" min="1" />
                <UButton color="red" variant="ghost" size="xs" icon="i-heroicons-trash" @click="mailModal.items.splice(i,1)" />
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="mailModal.show=false" :disabled="mailModal.loading">取消</UButton>
            <UButton color="primary" @click="confirmSendMail" :loading="mailModal.loading" :disabled="!mailModal.title||!mailModal.content">确认发送</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 批量发邮件对话框 -->
    <UModal v-model="batchMailModal.show" :ui="{width:'sm:max-w-2xl'}" :prevent-close="batchMailModal.loading">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-envelope-open" class="text-primary-500" />
            <h3 class="text-base font-semibold">批量发送邮件</h3>
            <UBadge :label="`${selectedRows.length} 名角色`" color="blue" variant="solid" size="sm" />
          </div>
        </template>
        <div class="space-y-4">
          <div class="p-3 bg-gray-50 rounded-lg border">
            <p class="text-xs font-medium text-gray-500 mb-2">已选角色（{{ selectedRows.length }}人）</p>
            <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              <UBadge v-for="row in selectedRows" :key="row.id" :label="row.character_name || row.uuid?.slice(0,8) || row.subuser_id" color="gray" variant="soft" size="xs" />
            </div>
            <p v-if="crossServerCount > 1" class="text-xs text-amber-600 mt-2">
              ⚠ 已选角色跨 {{ crossServerCount }} 个区服，将分批自动发送
            </p>
          </div>
          <UFormGroup label="平台">
            <USelectMenu v-model="batchMailModal.platform" :options="platformOptions" value-attribute="value" option-attribute="label" class="w-40" />
          </UFormGroup>
          <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-gift" class="text-blue-600" />
              <label class="text-sm font-medium text-blue-900">快速选择礼包（可选）</label>
            </div>
            <div class="flex gap-2">
              <USelectMenu v-model="batchSelectedPkg" :options="pkgOptions" value-attribute="value" option-attribute="label" :searchable="searchPkgs" searchable-placeholder="搜索礼包" placeholder="选择礼包" class="flex-1" @click="loadPkgs" />
              <UButton @click="applyPkg(batchMailModal)" :disabled="!batchSelectedPkg" size="sm" color="blue" variant="soft">应用</UButton>
            </div>
          </div>
          <UFormGroup label="邮件标题" required>
            <UInput v-model="batchMailModal.title" placeholder="输入邮件标题" />
          </UFormGroup>
          <UFormGroup label="邮件内容" required>
            <UTextarea v-model="batchMailModal.content" placeholder="输入邮件内容" :rows="3" />
          </UFormGroup>
          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium">道具列表（不填则发纯文本邮件）</label>
              <UButton size="xs" variant="soft" icon="i-heroicons-plus" @click="batchMailModal.items.push({ ItemId:'', ItemNum:1 })">添加道具</UButton>
            </div>
            <div class="space-y-2">
              <div v-for="(item,i) in batchMailModal.items" :key="i" class="flex gap-2 items-center">
                <USelectMenu v-model="item.ItemId" :options="itemOptions" value-attribute="value" option-attribute="label" :searchable="searchItems" searchable-placeholder="搜索道具" placeholder="选择道具" class="flex-1" />
                <UInput v-model.number="item.ItemNum" type="number" placeholder="数量" class="w-20" min="1" />
                <UButton color="red" variant="ghost" size="xs" icon="i-heroicons-trash" @click="batchMailModal.items.splice(i,1)" />
              </div>
            </div>
          </div>
          <div v-if="batchMailModal.loading" class="p-3 bg-blue-50 rounded-lg">
            <p class="text-sm text-blue-700">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin inline mr-1" />正在发送中，请勿关闭页面...
            </p>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="batchMailModal.show=false" :disabled="batchMailModal.loading">取消</UButton>
            <UButton color="primary" icon="i-heroicons-paper-airplane" @click="confirmBatchMail" :loading="batchMailModal.loading" :disabled="!batchMailModal.title||!batchMailModal.content">
              确认发送给全部 {{ selectedRows.length }} 人
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <UNotifications />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useAuthStore } from '~/store/auth';

definePageMeta({ layout: 'default' });

const authStore = useAuthStore();
const toast = useToast();
const authH = () => ({ authorization: String(authStore.id || '') });

// ===== 服务器列表 =====
const serverList    = ref([]);
const serversLoading = ref(false);
const activeServer  = ref(null); // null = 全部

// 下拉选项：首项"全部" + 各区服
const serverSelectOptions = computed(() => [
  { label: '全部区服', value: '__all__', serverId: null },
  ...serverList.value.map(srv => ({
    label: srv.server_id ? `${srv.name}  (${srv.server_id})` : srv.name,
    value: srv.bname,
    serverId: srv.server_id,
    _srv: srv
  }))
]);

// 双向绑定：选中的 value（'__all__' 或 bname）
const activeServerOption = computed({
  get: () => activeServer.value ? activeServer.value.bname : '__all__',
  set: (val) => {
    if (val === '__all__') {
      activeServer.value = null;
    } else {
      const found = serverList.value.find(s => s.bname === val);
      activeServer.value = found || null;
    }
  }
});

const onServerOptionChange = () => {
  pagination.page = 1;
  clearSelection();
  loadCharacters();
};

const loadServers = async () => {
  serversLoading.value = true;
  try {
    const res = await $fetch('/api/gm/servers', { headers: authH() });
    if (res?.success) serverList.value = res.data || [];
  } catch(e) {
    toast.add({ title: '获取服务器列表失败', description: e.message, color: 'red' });
  } finally { serversLoading.value = false; }
};

// server_id → 显示名称（优先用 serverList 反查，找不到就显示 ID）
const resolveServerName = (serverId) => {
  if (!serverId) return '未知';
  const srv = serverList.value.find(s => String(s.server_id) === String(serverId));
  return srv ? `${srv.name}` : `服务器${serverId}`;
};

// ===== 筛选 & 数据 =====
const loading    = ref(false);
const characters = ref([]);
const filters    = reactive({ user_id:'', subuser_id:'', character_name:'', uuid:'' });
const pagination = reactive({ page:1, pageSize:20, total:0 });

// ===== 多选 =====
const selectedRows = ref([]);
const isSelected   = (row) => selectedRows.value.some(r => r.id === row.id);
const isAllSelected  = computed(() => characters.value.length > 0 && characters.value.every(r => isSelected(r)));
const isIndeterminate = computed(() => selectedRows.value.length > 0 && !isAllSelected.value);

const toggleRow = (row) => {
  if (isSelected(row)) selectedRows.value = selectedRows.value.filter(r => r.id !== row.id);
  else selectedRows.value = [...selectedRows.value, row];
};
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    const ids = new Set(characters.value.map(r => r.id));
    selectedRows.value = selectedRows.value.filter(r => !ids.has(r.id));
  } else {
    const ids = new Set(selectedRows.value.map(r => r.id));
    selectedRows.value = [...selectedRows.value, ...characters.value.filter(r => !ids.has(r.id))];
  }
};
const clearSelection = () => { selectedRows.value = []; };

const crossServerCount = computed(() => new Set(selectedRows.value.map(r => r.server_id)).size);

const visiblePages = computed(() => {
  const total = Math.ceil(pagination.total / pagination.pageSize);
  const cur = pagination.page, max = 7;
  if (total <= max) return Array.from({length:total},(_,i)=>i+1);
  let start = Math.max(1, cur-3), end = Math.min(total, start+max-1);
  if (end-start+1 < max) start = Math.max(1, end-max+1);
  return Array.from({length: end-start+1}, (_,i)=>start+i);
});

const loadCharacters = async () => {
  loading.value = true;
  try {
    const p = new URLSearchParams({ page: pagination.page, pageSize: pagination.pageSize });
    if (filters.user_id)        p.append('user_id', filters.user_id);
    if (filters.subuser_id)     p.append('subuser_id', filters.subuser_id);
    if (filters.character_name) p.append('character_name', filters.character_name);
    if (filters.uuid)           p.append('uuid', filters.uuid);
    // 当前激活服务器：用 server_id 过滤
    if (activeServer.value?.server_id != null) p.append('server_id', activeServer.value.server_id);
    const res = await $fetch(`/api/admin/characters?${p}`, { headers: authH() });
    if (res.success) {
      characters.value = res.data.characters || [];
      pagination.total = res.data.pagination?.total || 0;
    }
  } catch(e) {
    toast.add({ title:'加载失败', description: e.message, color:'red' });
  } finally { loading.value = false; }
};

const doSearch = () => { pagination.page = 1; loadCharacters(); };
const goPage   = (p) => { pagination.page = p; loadCharacters(); };
const resetFilters = () => {
  Object.assign(filters, { user_id:'', subuser_id:'', character_name:'', uuid:'' });
  pagination.page = 1;
  loadCharacters();
};

// ===== 辅助 =====
const fmtTime = (s) => s ? new Date(s).toLocaleString('zh-CN') : '-';
const copyText = async (t) => {
  try { await navigator.clipboard.writeText(t); toast.add({ title:'已复制', color:'green' }); } catch {}
};

// ===== 道具 =====
const allItems   = ref([]);
// value 保留原始字符串，兼容纯数字 ID 和 gid+level 格式（如 "67240092_1"）
const itemOptions = computed(() => allItems.value.map(it => ({ value: it.id, label:`${it.id} - ${it.name}` })));
const searchItems = (q) => {
  const lq = (q||'').toLowerCase();
  // 无搜索词时返回全量（最多500），有词时在全量中过滤，避免 数字_数字 物品因排序靠后而不显示
  return lq ? itemOptions.value.filter(o=>o.label.toLowerCase().includes(lq)).slice(0,500) : itemOptions.value.slice(0,500);
};

onMounted(async () => {
  await loadServers();
  try { const r = await $fetch('/api/items'); allItems.value = r?.data||[]; } catch {}
  loadCharacters();
});

// ===== 礼包 =====
const allPkgs      = ref([]);
const pkgsLoaded   = ref(false);
const selectedPkg  = ref(undefined);
const batchSelectedPkg = ref(undefined);
const pkgOptions   = computed(() => allPkgs.value.map(p => ({ value:p.id, label:`${p.package_name} (${p.package_code})` })));
const searchPkgs   = (q) => {
  const lq = (q||'').toLowerCase();
  return lq ? pkgOptions.value.filter(o=>o.label.toLowerCase().includes(lq)).slice(0,100) : pkgOptions.value.slice(0,20);
};
const loadPkgs = async () => {
  if (pkgsLoaded.value) return;
  try {
    const r = await $fetch('/api/admin/gift-packages', { query:{page:1,pageSize:1000,is_active:'true'}, headers:authH() });
    if (r?.success) { allPkgs.value = r.data?.list||[]; pkgsLoaded.value = true; }
  } catch {}
};
const parsePkgItems = (items) => {
  try {
    const arr = typeof items==='string' ? JSON.parse(items) : items;
    // 统一转为字符串，避免纯数字 ID (number) 与 itemOptions 中 string value 不匹配
    return Array.isArray(arr) ? arr.map(i=>({ ItemId: String(i.i), ItemNum:Number(i.a) })) : [];
  } catch { return []; }
};
const applyPkg = (modal) => {
  const pkgId = modal === mailModal.value ? selectedPkg.value : batchSelectedPkg.value;
  const pkg   = allPkgs.value.find(p=>p.id===pkgId);
  if (!pkg) return;
  const items = parsePkgItems(pkg.gift_items);
  if (items.length) {
    modal.items = items;
    if (!modal.title)   modal.title   = `GM发放-${pkg.package_name}`;
    if (!modal.content) modal.content = pkg.description || `请查收${pkg.package_name}`;
    if (modal === mailModal.value) selectedPkg.value = undefined;
    else batchSelectedPkg.value = undefined;
    toast.add({ title:'已应用礼包', description:`${items.length}个道具`, color:'green' });
  }
};

// ===== 平台 & 操作菜单 =====
const platformOptions = [
  { label:'Android', value:'android' },
  { label:'iOS', value:'ios' }
];
const getActions = (row) => [
  [{ label:'发邮件（含道具）', icon:'i-heroicons-envelope', click:()=>openMail(row) }],
  [{ label:'封号', icon:'i-heroicons-lock-closed', click:()=>openBan(row) }]
];
// 按 server_id 找到对应区服的 bname 用于 GM 接口
const getBname = (row) => row.server_id ? String(row.server_id) : '';

// ===== 封号 =====
const banModal = ref({ show:false, loading:false, row:null, duration:'', platform:'android', reason:'' });
const banDurations = [
  { label:'1小时', value:3600 }, { label:'12小时', value:43200 },
  { label:'1天', value:86400 }, { label:'3天', value:259200 },
  { label:'7天', value:604800 }, { label:'30天', value:2592000 },
  { label:'永久', value:315360000 }
];
const openBan = (row) => { banModal.value = { show:true, loading:false, row, duration:'', platform:'android', reason:'' }; };
const confirmBan = async () => {
  const { row, duration, platform, reason } = banModal.value;
  if (!row) return;
  banModal.value.loading = true;
  try {
    await $fetch('/api/gm/ban', {
      method:'POST', headers:authH(),
      body:{ server:getBname(row), playerId:row.uuid, openId:row.subuser_id, platform, duration, reason }
    });
    toast.add({ title:'封号成功', description:`角色 ${row.character_name} 已封号`, color:'green' });
    banModal.value.show = false;
  } catch(e) {
    toast.add({ title:'封号失败', description:e.message, color:'red' });
  } finally { banModal.value.loading = false; }
};

// ===== 单个发邮件 =====
const mailModal = ref({ show:false, loading:false, row:null, title:'', content:'', platform:'android', items:[] });
const openMail  = (row) => {
  selectedPkg.value = undefined;
  mailModal.value = { show:true, loading:false, row, title:'', content:'', platform:'android', items:[] };
};
const confirmSendMail = async () => {
  const { row, title, content, platform, items } = mailModal.value;
  if (!row || !title.trim() || !content.trim()) return;
  // ItemId 可能是字符串（gid+level 格式），用 !! 判断非空即可
  const validItems = items.filter(it=>!!it.ItemId&&it.ItemNum>0).map(it=>({ ItemId:it.ItemId, ItemNum:it.ItemNum }));
  mailModal.value.loading = true;
  try {
    if (validItems.length > 0) {
      await $fetch('/api/gm/send-items', { method:'POST', headers:authH(),
        body:{ server:getBname(row), playerId:row.uuid, openId:row.subuser_id, platform, roleId:row.uuid, title, content, items:validItems } });
    } else {
      await $fetch('/api/gm/send-mail', { method:'POST', headers:authH(),
        body:{ server:getBname(row), playerId:row.uuid, openId:row.subuser_id, platform, roleId:row.uuid, title, content } });
    }
    toast.add({ title:'发送成功', description:`已向角色 ${row.character_name} 发送邮件${validItems.length?`（含${validItems.length}种道具）`:''}`, color:'green' });
    mailModal.value.show = false;
  } catch(e) {
    toast.add({ title:'发送失败', description:e.message||'请稍后重试', color:'red' });
  } finally { mailModal.value.loading = false; }
};

// ===== 批量发邮件 =====
const batchMailModal = ref({ show:false, loading:false, title:'', content:'', platform:'android', items:[] });
const openBatchMail  = () => {
  batchSelectedPkg.value = undefined;
  batchMailModal.value = { show:true, loading:false, title:'', content:'', platform:'android', items:[] };
};
const confirmBatchMail = async () => {
  const { title, content, platform, items } = batchMailModal.value;
  if (!title.trim() || !content.trim()) return;
  // ItemId 可能是字符串（gid+level 格式），用 !! 判断非空即可
  const validItems = items.filter(it=>!!it.ItemId&&it.ItemNum>0).map(it=>({ ItemId:it.ItemId, ItemNum:it.ItemNum }));
  batchMailModal.value.loading = true;

  // 按 server_id 分组
  const serverGroups = new Map();
  for (const row of selectedRows.value) {
    const srv = getBname(row);
    if (!serverGroups.has(srv)) serverGroups.set(srv, []);
    serverGroups.get(srv).push({ playerId:row.uuid, openId:row.subuser_id, roleId:row.uuid, platform });
  }

  let totalSuccess = 0, totalFail = 0;
  const errors = [];
  try {
    for (const [server, targets] of serverGroups) {
      try {
        const endpoint = validItems.length > 0 ? '/api/gm/send-items-batch' : '/api/gm/send-mail-batch';
        const body     = validItems.length > 0
          ? { server, title, content, items: validItems, targets }
          : { server, title, content, targets };
        const res = await $fetch(endpoint, { method:'POST', headers:authH(), body });
        if (res?.summary) { totalSuccess += res.summary.success||0; totalFail += res.summary.failed||0; }
        if (res?.results) res.results.filter(r=>!r.success).forEach(r=>errors.push(r.message||'发送失败'));
      } catch(e) {
        totalFail += targets.length;
        errors.push(`服务器${server}: ${e.message||'未知错误'}`);
      }
    }
    if (totalFail === 0) {
      toast.add({ title:'批量发送完成', description:`成功发送给 ${totalSuccess} 名角色${validItems.length?`（含${validItems.length}种道具）`:''}`, color:'green' });
      batchMailModal.value.show = false;
      clearSelection();
    } else {
      toast.add({ title:`批量发送部分失败`, description:`成功 ${totalSuccess} 人，失败 ${totalFail} 人。${errors[0]||''}`, color:'yellow' });
    }
  } finally { batchMailModal.value.loading = false; }
};
</script>

<style scoped>
.role-data-page { @apply space-y-4; }
.filter-content { @apply space-y-4; }
.filter-row { @apply flex gap-4 items-end w-full flex-wrap; }
.filter-row > * { @apply flex-1 min-w-40; }
.mobile-table-wrapper { @apply w-full overflow-x-auto; }

.uniform-raw-table {
  width: 100%; min-width: 1200px; border-collapse: collapse; font-size: 13px;
}
.uniform-raw-table th {
  text-align: center; padding: 8px 6px; font-weight: 600;
  background: #f8fafc; border-right: 1px solid #f1f5f9;
  border-bottom: 2px solid #e2e8f0; white-space: nowrap; color: #374151;
}
.uniform-raw-table td {
  text-align: center; padding: 8px 6px;
  border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;
  white-space: nowrap; vertical-align: middle;
}
.uniform-raw-table th:last-child, .uniform-raw-table td:last-child { border-right: none; }
.col-check { width: 40px; }
.empty-cell { text-align: center; padding: 0; }

@media (max-width:768px) { .filter-row { @apply flex-col gap-3; } }
</style>