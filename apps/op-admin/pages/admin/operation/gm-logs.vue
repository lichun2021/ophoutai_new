<template>
  <div class="p-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">GM操作日志</h2>
            <p class="text-sm text-gray-500">支持按类型 / 服务器 / 玩家 / 管理员 / 时间筛选</p>
          </div>
          <UButton icon="i-heroicons-arrow-path" variant="soft" @click="loadLogs" :loading="loading">刷新</UButton>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <USelectMenu v-model="filters.op_type" :options="opTypeOptions" value-attribute="value" option-attribute="label" placeholder="操作类型"/>
        <USelectMenu v-model="filters.server" :options="serverOptions" placeholder="选择服务器" value-attribute="value" option-attribute="label" />
        <UInput v-model="filters.player_id" placeholder="玩家ID"/>
        <UInput v-model="filters.player_name" placeholder="玩家名称"/>
        <UInput v-model="filters.open_id" placeholder="OpenID"/>
        <UInput v-model="filters.admin_id" placeholder="管理员ID"/>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <UInput v-model="filters.startDate" type="date" placeholder="开始日期"/>
        <UInput v-model="filters.endDate" type="date" placeholder="结束日期"/>
        <UButton @click="applyFilters" icon="i-heroicons-magnifying-glass" :loading="loading">搜索</UButton>
        <UButton variant="ghost" @click="resetFilters" icon="i-heroicons-arrow-path">重置</UButton>
      </div>

      <UTable :rows="rows" :columns="columns" :loading="loading" :ui="{ td: { padding: 'py-2 px-3' } }">
        <template #op_type-data="{ row }">
          <UBadge variant="soft">{{ formatOpType(row.op_type) }}</UBadge>
        </template>
        <template #success-data="{ row }">
          <UBadge :color="row.success ? 'green' : 'red'" variant="soft">{{ row.success ? '成功' : '失败' }}</UBadge>
        </template>
        <template #created_at-data="{ row }">
          <span class="text-sm">{{ formatDate(row.created_at) }}</span>
        </template>
        <template #details-data="{ row }">
          <div class="space-y-1 text-xs text-gray-600">
            <div v-if="row.op_type === 'send_items'">
              <div>标题：{{ getParam(row, 'title') }}</div>
              <div>内容：{{ getParam(row, 'content') }}</div>
              <div>
                物资：
                <span v-if="getItems(row).length === 0">-</span>
                <span v-else>
                  {{ getItems(row).map(i => formatItem(i)).join(', ') }}
                </span>
              </div>
            </div>
            <div v-else-if="row.op_type === 'send_mail'">
              <div>标题：{{ getParam(row, 'title') }}</div>
              <div>内容：{{ getParam(row, 'content') }}</div>
            </div>
            <div v-else-if="row.op_type === 'recharge'">
              <div>钻石：{{ getParam(row, 'diamond') }}</div>
            </div>
            <div v-else-if="row.op_type === 'ban'">
              <div>时长(秒)：{{ getParam(row, 'banSeconds') }}</div>
              <div>原因：{{ getParam(row, 'banReason') }}</div>
            </div>
            <div v-else>
              <span>-</span>
            </div>
          </div>
        </template>
      </UTable>

      <div class="mt-4 flex justify-between items-center">
        <div class="text-sm text-gray-500">共 {{ total }} 条</div>
        <UPagination v-model="page" :page-count="pageSize" :total="total" @update:model-value="loadLogs"/>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const rows = ref<any[]>([]);

const filters = ref({
  op_type: 'all',
  server: '',
  player_id: '',
  player_name: '',
  open_id: '',
  admin_id: '',
  startDate: '',
  endDate: ''
});

const opTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '封号', value: 'ban' },
  { label: '解封', value: 'unban' },
  { label: '发物资', value: 'send_items' },
  { label: '充值', value: 'recharge' },
  { label: '发邮件', value: 'send_mail' }
];

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'op_type', label: '类型' },
  { key: 'server', label: '服务器' },
  { key: 'player_id', label: '玩家ID' },
  { key: 'player_name', label: '玩家名称' },
  { key: 'open_id', label: 'OpenID' },
  { key: 'admin_id', label: '管理员ID' },
  { key: 'details', label: '详情' },
  { key: 'success', label: '结果' },
  { key: 'created_at', label: '时间' }
];

const formatOpType = (t: string) => {
  switch (t) {
    case 'ban': return '封号';
    case 'unban': return '解封';
    case 'send_items': return '发物资';
    case 'send_mail': return '发邮件';
    case 'recharge': return '充值';
    default: return t;
  }
};

const formatDate = (s: string) => {
  if (!s) return '-';
  return new Date(s).toLocaleString('zh-CN');
};

const buildQuery = () => {
  const params: Record<string, any> = { page: page.value, pageSize: pageSize.value };
  Object.entries(filters.value).forEach(([k, v]) => { if (v) params[k] = v; });
  return params;
};

const loadLogs = async () => {
  loading.value = true;
  try {
    const res: any = await $fetch('/api/admin/gm-operation-logs', { params: buildQuery() });
    if (res?.success) {
      rows.value = (res.data || []).map((r: any) => ({
        ...r,
        request_params_parsed: parseMaybeJson(r.request_params),
        response_result_parsed: parseMaybeJson(r.response_result)
      }));
      total.value = res.total || 0;
    } else {
      rows.value = [];
      total.value = 0;
    }
  } finally {
    loading.value = false;
  }
};

const applyFilters = () => {
  page.value = 1;
  loadLogs();
};

const resetFilters = () => {
  filters.value = { op_type: 'all', server: '', player_id: '', player_name: '', open_id: '', admin_id: '', startDate: '', endDate: '' };
  page.value = 1;
  loadLogs();
};

onMounted(() => loadLogs());
const serverOptions = ref<{ label: string; value: string }[]>([]);
const loadServers = async () => {
  try {
    const res: any = await $fetch('/api/gm/servers');
    serverOptions.value = (res?.data || []).map((s: { name: string; bname: string }) => ({ label: s.name, value: s.bname }));
  } catch {}
};
onMounted(() => loadServers());

// 物品名称映射
const itemNameMap = ref<Record<string, string>>({});
const loadItemMap = async () => {
  try {
    const res: any = await $fetch('/api/items');
    const list = res?.data || [];
    const map: Record<string, string> = {};
    list.forEach((it: any) => { if (it?.id) map[String(it.id)] = it.name || `物品${it.id}`; });
    itemNameMap.value = map;
  } catch {}
};
onMounted(() => loadItemMap());

const parseMaybeJson = (v: any) => {
  if (!v) return {} as any;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v as string); } catch { return {}; }
};

const getParam = (row: any, key: string) => {
  const p = row.request_params_parsed || {};
  // 兼容 IDIP 编码字段名（发物资在后端使用 title/content/items 记录）
  if (key === 'title') return p.title || p.MailTitle || '';
  if (key === 'content') return p.content || p.MailContent || '';
  return p[key] ?? '';
};

const getItems = (row: any): Array<{ ItemId: number; ItemNum: number }> => {
  const p = row.request_params_parsed || {};
  return Array.isArray(p.items) ? p.items : (Array.isArray(p.SendItemList) ? p.SendItemList : []);
};

const formatItem = (i: { ItemId: number; ItemNum: number }) => {
  const name = itemNameMap.value[String(i.ItemId)] || `物品${i.ItemId}`;
  return `${name}×${i.ItemNum}`;
};
</script>

<style scoped>
</style>


