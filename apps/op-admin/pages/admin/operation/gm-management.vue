<template>
  <div class="role-data-page">
    <div class="page-header">
      <div class="flex items-center gap-3 mb-6">
        <UIcon name="i-heroicons-command-line" class="w-6 h-6 text-blue-500" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">游戏运营</h2>
          <p class="text-sm text-gray-600 mt-1">查询游戏角色，执行封号、发放道具邮件等GM操作</p>
        </div>
      </div>
    </div>

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
          <UFormGroup label="服务器ID" class="flex-1">
            <UInput v-model="filters.server_id" placeholder="请输入服务器ID" icon="i-heroicons-server" @keyup.enter="doSearch" />
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
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-500" />
          <h3 class="text-base font-medium">角色列表</h3>
          <UBadge v-if="characters.length > 0" :label="`${pagination.total}条记录`" variant="soft" size="xs" />
        </div>
      </template>

      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-500 animate-spin" />
        <p class="mt-2 text-gray-600">正在加载数据...</p>
      </div>

      <div v-else class="mobile-table-wrapper">
        <UTable
          :rows="characters"
          :columns="columns"
          :empty-state="{ icon: 'i-heroicons-user-circle', label: '暂无角色记录', description: '请调整筛选条件后重新查询' }"
          class="w-full uniform-table"
        >
          <template #subuser_id-data="{ row }">
            <span class="font-medium text-green-600">{{ row.subuser_id || '-' }}</span>
          </template>
          <template #character_name-data="{ row }">
            <span class="font-medium text-purple-600">{{ row.character_name || '-' }}</span>
          </template>
          <template #uuid-data="{ row }">
            <span v-if="row.uuid" class="font-mono text-sm cursor-pointer" :title="row.uuid" @click="copyText(row.uuid)">
              {{ row.uuid.slice(0,8) }}...{{ row.uuid.slice(-4) }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
          <template #game_name-data="{ row }">
            <UBadge v-if="row.game_name" :label="row.game_name" color="indigo" variant="soft" />
            <span v-else class="text-gray-400">-</span>
          </template>
          <template #server_id-data="{ row }">
            <UBadge v-if="row.server_id" :label="`服务器${row.server_id}`" color="gray" variant="soft" />
            <span v-else class="text-gray-400">-</span>
          </template>
          <template #last_login_at-data="{ row }">
            <span class="text-sm">{{ fmtTime(row.last_login_at) }}</span>
          </template>
          <template #created_at-data="{ row }">
            <span class="text-sm">{{ fmtTime(row.created_at) }}</span>
          </template>
          <template #actions-data="{ row }">
            <UDropdown :items="getActions(row)">
              <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" size="xs" />
            </UDropdown>
          </template>
        </UTable>
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
            <div>服务器: {{ banModal.row?.server_id }}</div>
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

    <!-- 发道具邮件对话框 -->
    <UModal v-model="mailModal.show" :ui="{width:'sm:max-w-2xl'}" :prevent-close="mailModal.loading">
      <UCard>
        <template #header><h3 class="text-base font-semibold">发送邮件（含道具）</h3></template>
        <div class="space-y-4">
          <div class="p-3 bg-gray-50 rounded-lg text-sm grid grid-cols-2 gap-2">
            <div>角色名: {{ mailModal.row?.character_name }}</div>
            <div>小号ID: {{ mailModal.row?.subuser_id }}</div>
            <div>UUID: {{ mailModal.row?.uuid?.slice(0,12) }}...</div>
            <div>服务器: {{ mailModal.row?.server_id }}</div>
          </div>

          <!-- 平台选择 -->
          <UFormGroup label="平台">
            <USelectMenu v-model="mailModal.platform" :options="platformOptions" value-attribute="value" option-attribute="label" class="w-40" />
          </UFormGroup>

          <!-- 快速礼包 -->
          <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-gift" class="text-blue-600" />
              <label class="text-sm font-medium text-blue-900">快速选择礼包（可选）</label>
            </div>
            <div class="flex gap-2">
              <USelectMenu v-model="selectedPkg" :options="pkgOptions" value-attribute="value" option-attribute="label" :searchable="searchPkgs" searchable-placeholder="搜索礼包" placeholder="选择礼包" class="flex-1" @click="loadPkgs" />
              <UButton @click="applyPkg" :disabled="!selectedPkg" size="sm" color="blue" variant="soft">应用</UButton>
            </div>
          </div>

          <UFormGroup label="邮件标题" required>
            <UInput v-model="mailModal.title" placeholder="输入邮件标题" />
          </UFormGroup>
          <UFormGroup label="邮件内容" required>
            <UTextarea v-model="mailModal.content" placeholder="输入邮件内容" :rows="3" />
          </UFormGroup>

          <!-- 道具列表 -->
          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium">道具列表（不填则发纯文本邮件）</label>
              <UButton size="xs" variant="soft" icon="i-heroicons-plus" @click="addItem">添加道具</UButton>
            </div>
            <div class="space-y-2">
              <div v-for="(item,i) in mailModal.items" :key="i" class="flex gap-2 items-center">
                <USelectMenu v-model.number="item.ItemId" :options="itemOptions" value-attribute="value" option-attribute="label" :searchable="searchItems" searchable-placeholder="搜索道具" placeholder="选择道具" class="flex-1" />
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

// ===== 筛选 & 数据 =====
const loading = ref(false);
const characters = ref([]);
const filters = reactive({ user_id:'', subuser_id:'', character_name:'', uuid:'', server_id:'' });
const pagination = reactive({ page:1, pageSize:20, total:0 });

const columns = [
  { key:'user_id', label:'用户ID', sortable:true },
  { key:'subuser_id', label:'小号ID', sortable:true },
  { key:'username', label:'用户名' },
  { key:'character_name', label:'角色名称', sortable:true },
  { key:'uuid', label:'角色UUID' },
  { key:'game_name', label:'游戏' },
  { key:'character_level', label:'等级', sortable:true },
  { key:'server_id', label:'服务器' },
  { key:'channel_code', label:'渠道' },
  { key:'last_login_at', label:'最后登录', sortable:true },
  { key:'created_at', label:'创建时间', sortable:true },
  { key:'actions', label:'操作' }
];

const visiblePages = computed(() => {
  const total = Math.ceil(pagination.total / pagination.pageSize);
  const cur = pagination.page, max = 7;
  if (total <= max) return Array.from({length:total},(_,i)=>i+1);
  let start = Math.max(1, cur - 3), end = Math.min(total, start + max - 1);
  if (end - start + 1 < max) start = Math.max(1, end - max + 1);
  return Array.from({length: end-start+1}, (_,i)=>start+i);
});

const loadCharacters = async () => {
  loading.value = true;
  try {
    const p = new URLSearchParams({ page: pagination.page, pageSize: pagination.pageSize });
    if (filters.user_id) p.append('user_id', filters.user_id);
    if (filters.subuser_id) p.append('subuser_id', filters.subuser_id);
    if (filters.character_name) p.append('character_name', filters.character_name);
    if (filters.uuid) p.append('uuid', filters.uuid);
    if (filters.server_id) p.append('server_id', filters.server_id);
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
const goPage = (p) => { pagination.page = p; loadCharacters(); };
const resetFilters = () => {
  Object.assign(filters, { user_id:'', subuser_id:'', character_name:'', uuid:'', server_id:'' });
  pagination.page = 1;
  loadCharacters();
};

// ===== 辅助 =====
const fmtTime = (s) => s ? new Date(s).toLocaleString('zh-CN') : '-';
const copyText = async (t) => {
  try { await navigator.clipboard.writeText(t); toast.add({ title:'已复制', color:'green' }); } catch {}
};

// ===== 道具 =====
const allItems = ref([]);
const itemOptions = computed(() => allItems.value.map(it => ({ value:Number(it.id), label:`${it.id} - ${it.name}` })));
const searchItems = (q) => {
  const lq = (q||'').toLowerCase();
  return lq ? itemOptions.value.filter(o=>o.label.toLowerCase().includes(lq)).slice(0,200) : itemOptions.value.slice(0,20);
};
onMounted(async () => {
  try { const r = await $fetch('/api/items'); allItems.value = r?.data||[]; } catch {}
  loadCharacters();
});

// ===== 礼包 =====
const allPkgs = ref([]);
const pkgsLoaded = ref(false);
const selectedPkg = ref(undefined);
const pkgOptions = computed(() => allPkgs.value.map(p => ({ value:p.id, label:`${p.package_name} (${p.package_code})` })));
const searchPkgs = (q) => {
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
    return Array.isArray(arr) ? arr.map(i=>({ ItemId:Number(i.i), ItemNum:Number(i.a) })) : [];
  } catch { return []; }
};
const applyPkg = () => {
  const pkg = allPkgs.value.find(p=>p.id===selectedPkg.value);
  if (!pkg) return;
  const items = parsePkgItems(pkg.gift_items);
  if (items.length) {
    mailModal.value.items = items;
    if (!mailModal.value.title) mailModal.value.title = `GM发放-${pkg.package_name}`;
    if (!mailModal.value.content) mailModal.value.content = pkg.description || `请查收${pkg.package_name}`;
    selectedPkg.value = undefined;
    toast.add({ title:'已应用礼包', description:`${items.length}个道具`, color:'green' });
  }
};

// ===== 操作菜单 =====
const platformOptions = [
  { label:'Android', value:'android' },
  { label:'iOS', value:'ios' }
];

const getActions = (row) => [
  [{ label:'发邮件（含道具）', icon:'i-heroicons-envelope', click:()=>openMail(row) }],
  [{ label:'封号', icon:'i-heroicons-lock-closed', click:()=>openBan(row) }]
];

// server identifier：直接用 server_id 数字，让后端 getByWorldId 按 server_id 查找
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

// ===== 发邮件 =====
const mailModal = ref({ show:false, loading:false, row:null, title:'', content:'', platform:'android', items:[] });
const addItem = () => mailModal.value.items.push({ ItemId:0, ItemNum:1 });
const openMail = (row) => {
  selectedPkg.value = undefined;
  mailModal.value = { show:true, loading:false, row, title:'', content:'', platform:'android', items:[] };
};
const confirmSendMail = async () => {
  const { row, title, content, platform, items } = mailModal.value;
  if (!row || !title.trim() || !content.trim()) return;
  const validItems = items.filter(it=>it.ItemId>0&&it.ItemNum>0).map(it=>({ ItemId:it.ItemId, ItemNum:it.ItemNum }));
  mailModal.value.loading = true;
  try {
    if (validItems.length > 0) {
      await $fetch('/api/gm/send-items', {
        method:'POST', headers:authH(),
        body:{ server:getBname(row), playerId:row.uuid, openId:row.subuser_id, platform, roleId:row.uuid, title, content, items:validItems }
      });
    } else {
      await $fetch('/api/gm/send-mail', {
        method:'POST', headers:authH(),
        body:{ server:getBname(row), playerId:row.uuid, openId:row.subuser_id, platform, roleId:row.uuid, title, content }
      });
    }
    toast.add({
      title:'发送成功',
      description:`已向角色 ${row.character_name} 发送邮件${validItems.length?`（含${validItems.length}种道具）`:''}`,
      color:'green'
    });
    mailModal.value.show = false;
  } catch(e) {
    toast.add({ title:'发送失败', description:e.message||'请稍后重试', color:'red' });
  } finally { mailModal.value.loading = false; }
};
</script>

<style scoped>
.role-data-page { @apply space-y-6; }
.filter-content { @apply space-y-4; }
.filter-row { @apply flex gap-4 items-end w-full flex-wrap; }
.filter-row > * { @apply flex-1 min-w-40; }
.mobile-table-wrapper { @apply w-full overflow-x-auto; }
.uniform-table :deep(table) { width:100%; min-width:1100px; border-collapse:collapse; }
.uniform-table :deep(th) { text-align:center; padding:8px 6px; font-size:13px; font-weight:600; background:#f8fafc; border-right:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
.uniform-table :deep(td) { text-align:center; padding:8px 6px; font-size:13px; border-right:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
.uniform-table :deep(th:last-child), .uniform-table :deep(td:last-child) { border-right:none; }
.uniform-table :deep(.flex) { justify-content:center; align-items:center; }
@media (max-width:768px) { .filter-row { @apply flex-col gap-3; } }
</style>