<template>
  <div class="p-4 space-y-6">
    <h2>CDK 管理</h2>

    <section class="card p-4 space-y-3">
      <h3>创建/编辑 CDK 类型</h3>
      <div class="grid gap-3" style="grid-template-columns: 120px 1fr; align-items: center;">
        <label>标题</label>
        <input v-model="typeForm.title" placeholder="如：GM发放奖励" />
        <label>内容</label>
        <input v-model="typeForm.content" placeholder="发放邮件内容" />
        <label>类型</label>
        <select v-model="typeForm.type">
          <option value="universal">通码（每角色限领一次）</option>
          <option value="unique">唯一码（单码单人）</option>
          <option value="data">每日码（输入当天日期如 20251103）</option>
        </select>
        <label>物品列表</label>
        <div class="items-editor">
          <div class="selected">
            <div v-for="(row, idx) in typeForm.items" :key="idx" class="selected-row">
              <USelectMenu
                v-model.number="row.ItemId"
                :options="itemOptions"
                value-attribute="value"
                option-attribute="label"
                :searchable="searchItems"
                searchable-placeholder="按ID或名称搜索"
                placeholder="选择物品（可搜索）"
              />
              <input type="number" min="1" v-model.number="row.ItemNum" />
              <button class="btn btn-secondary" @click="removeItem(idx)">移除</button>
            </div>
          </div>
          <button class="btn btn-secondary mt-2" @click="addEmptyItem">添加一行</button>
        </div>
      </div>
      <div class="flex gap-2">
        <button @click="submitType" class="btn">{{ typeForm.id ? '更新类型' : '创建类型' }}</button>
        <button @click="resetType" class="btn btn-secondary">重置</button>
      </div>
    </section>

    <section class="card p-4 space-y-3">
      <h3>类型列表</h3>
      <button @click="fetchTypes" class="btn btn-secondary">刷新</button>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>标题</th>
            <th>类型</th>
            <th>物品</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in types" :key="t.id">
            <td>{{ t.id }}</td>
            <td>{{ t.title }}</td>
            <td>{{ t.type }}</td>
            <td><pre style="white-space: pre-wrap;">{{ tryStringify(t.items) }}</pre></td>
            <td>
              <button class="btn btn-secondary" @click="editType(t)">编辑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card p-4 space-y-3" v-if="!isDataTypeSelected">
      <h3>生成 CDK 码</h3>
      <div class="grid gap-3" style="grid-template-columns: 160px 1fr; align-items: center;">
        <label>CDK 类型</label>
        <select v-model.number="codeForm.cdk_type_id">
          <option v-for="t in types" :key="t.id" :value="t.id">{{ t.id }} - {{ t.title }} ({{ t.type }})</option>
        </select>
        <label>数量</label>
        <input v-model.number="codeForm.count" type="number" min="1" />
        <label>自定义码(每行一个，可选)</label>
        <textarea v-model="codeForm.customText" rows="4" placeholder="ABCDEFGH\nZZZYYXXX"></textarea>
        <label>码长度(自生成)</label>
        <input v-model.number="codeForm.codeLength" type="number" min="6" max="32" />
      </div>
      <button class="btn" @click="submitCodes">生成</button>
    </section>
    <section class="card p-4 space-y-3" v-else>
      <h3>生成 CDK 码</h3>
      <p>当前选择的类型为 <b>data</b>（每日码），无需生成实体码，玩家输入当天日期（YYYYMMDD）即可领取。</p>
    </section>

    <section class="card p-4 space-y-3">
      <h3>CDK 码列表</h3>
      <div class="flex gap-3 items-center">
        <select v-model.number="listQuery.cdk_type_id">
          <option :value="undefined">全部类型</option>
          <option v-for="t in types" :key="t.id" :value="t.id">{{ t.id }} - {{ t.title }}</option>
        </select>
        <select v-model.number="listQuery.is_used">
          <option :value="undefined">全部</option>
          <option :value="0">未使用</option>
          <option :value="1">已使用</option>
        </select>
        <input v-model="listQuery.code" placeholder="搜索code" />
        <button class="btn btn-secondary" @click="fetchCodes(1)">查询</button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Code</th>
            <th>TypeId</th>
            <th>是否使用</th>
            <th>使用者</th>
            <th>使用时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in codes.list" :key="c.id">
            <td>{{ c.id }}</td>
            <td>{{ c.code }}</td>
            <td>{{ c.cdk_type_id }}</td>
            <td>{{ c.is_used ? '是' : '否' }}</td>
            <td>{{ c.used_by_player_id || '-' }}</td>
            <td>{{ c.used_at || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="flex gap-2 items-center">
        <button class="btn btn-secondary" :disabled="codes.page<=1" @click="fetchCodes(codes.page-1)">上一页</button>
        <span>第 {{ codes.page }} / {{ Math.ceil(codes.total / codes.pageSize) || 1 }} 页</span>
        <button class="btn btn-secondary" :disabled="codes.page>=Math.ceil(codes.total / codes.pageSize)" @click="fetchCodes(codes.page+1)">下一页</button>
      </div>
    </section>

    <section class="card p-4 space-y-3">
      <h3>领取记录查询</h3>
      <div class="flex gap-3 items-center">
        <input v-model="redeemQuery.player_id" placeholder="playerId" />
        <input v-model="redeemQuery.code" placeholder="code" />
        <select v-model.number="redeemQuery.cdk_type_id">
          <option :value="undefined">全部类型</option>
          <option v-for="t in types" :key="t.id" :value="t.id">{{ t.id }} - {{ t.title }}</option>
        </select>
        <button class="btn btn-secondary" @click="fetchRedemptions(1)">查询</button>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>playerId</th>
            <th>server</th>
            <th>code</th>
            <th>typeId</th>
            <th>openId</th>
            <th>platform</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in redemptions.list" :key="r.id">
            <td>{{ r.id }}</td>
            <td>{{ r.player_id }}</td>
            <td>{{ r.server }}</td>
            <td>{{ r.code }}</td>
            <td>{{ r.cdk_type_id }}</td>
            <td>{{ r.open_id || '-' }}</td>
            <td>{{ r.platform || '-' }}</td>
            <td>{{ r.created_at }}</td>
          </tr>
        </tbody>
      </table>
      <div class="flex gap-2 items-center">
        <button class="btn btn-secondary" :disabled="redemptions.page<=1" @click="fetchRedemptions(redemptions.page-1)">上一页</button>
        <span>第 {{ redemptions.page }} / {{ Math.ceil(redemptions.total / redemptions.pageSize) || 1 }} 页</span>
        <button class="btn btn-secondary" :disabled="redemptions.page>=Math.ceil(redemptions.total / redemptions.pageSize)" @click="fetchRedemptions(redemptions.page+1)">下一页</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';

type CdkType = { id: number; title: string; content: string; type: 'universal'|'unique'|'data'; items: any };

type ItemRow = { ItemId: number|string; ItemNum: number; _kw?: string };

const typeForm = ref<{ id?: number; title: string; content: string; type: 'universal'|'unique'|'data'; items: Array<ItemRow> }>({
  title: 'GM发放奖励',
  content: '这是GM发放的奖励，请查收！',
  type: 'unique',
  items: [{ ItemId: 1016 as number, ItemNum: 100 }]
});

const types = ref<CdkType[]>([]);

function tryStringify(obj: any) { try { return typeof obj === 'string' ? obj : JSON.stringify(obj); } catch { return String(obj); } }

async function fetchTypes() {
  const res = await $fetch('/api/admin/cdk/type/list');
  if ((res as any).code === 200) types.value = (res as any).data || [];
}

async function submitType() {
  // 前端校验：至少一行且物品与数量有效
  const prepared = typeForm.value.items
    .filter(i => i.ItemId !== '' && Number(i.ItemId) > 0 && Number(i.ItemNum) > 0)
    .map(i => ({ ItemId: Number(i.ItemId), ItemNum: Number(i.ItemNum) }));
  if (prepared.length === 0) { alert('物品列表不能为空'); return; }
  const payload: any = { title: typeForm.value.title, content: typeForm.value.content, type: typeForm.value.type, items: prepared };
  if (typeForm.value.id) payload.id = typeForm.value.id;
  const url = typeForm.value.id ? '/api/admin/cdk/type/update' : '/api/admin/cdk/type/create';
  const res = await $fetch(url, { method: 'POST', body: payload });
  if ((res as any).code === 200) { await fetchTypes(); alert('保存成功'); }
}

function editType(t: any) {
  const items = Array.isArray(t.items) ? t.items : [];
  typeForm.value = { id: t.id, title: t.title, content: t.content, type: t.type, items } as any;
}

function resetType() {
  typeForm.value = { title: '', content: '', type: 'universal', items: [] } as any;
}

// 生成码
const codeForm = ref<{ cdk_type_id?: number; count: number; customText?: string; codeLength: number }>({ count: 10, codeLength: 8 });
async function submitCodes() {
  if (!codeForm.value.cdk_type_id) return alert('请选择类型');
  const t = types.value.find(t => t.id === codeForm.value.cdk_type_id);
  if (t && t.type === 'data') { alert('data 类型无需生成实体码'); return; }
  const customCodes = codeForm.value.customText?.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const res = await $fetch('/api/admin/cdk/code/create', { method: 'POST', body: {
    cdk_type_id: codeForm.value.cdk_type_id,
    count: codeForm.value.count,
    codeLength: codeForm.value.codeLength,
    customCodes
  }});
  if ((res as any).code === 200) { alert('生成成功'); await fetchCodes(1); }
}

// 码列表
const listQuery = ref<{ cdk_type_id?: number; code?: string; is_used?: number; page?: number; pageSize?: number }>({ page: 1, pageSize: 20 });
const codes = ref<{ list: any[]; total: number; page: number; pageSize: number }>({ list: [], total: 0, page: 1, pageSize: 20 });
async function fetchCodes(page?: number) {
  const q = { ...listQuery.value, page: page ?? listQuery.value.page, pageSize: listQuery.value.pageSize } as any;
  const res = await $fetch('/api/admin/cdk/code/list', { query: q });
  if ((res as any).code === 200) codes.value = (res as any).data;
}

// 领取记录
const redeemQuery = ref<{ player_id?: string; code?: string; cdk_type_id?: number; page?: number; pageSize?: number }>({ page: 1, pageSize: 20 });
const redemptions = ref<{ list: any[]; total: number; page: number; pageSize: number }>({ list: [], total: 0, page: 1, pageSize: 20 });
async function fetchRedemptions(page?: number) {
  const q = { ...redeemQuery.value, page: page ?? redeemQuery.value.page, pageSize: redeemQuery.value.pageSize } as any;
  const res = await $fetch('/api/admin/cdk/redemptions', { query: q });
  if ((res as any).code === 200) redemptions.value = (res as any).data;
}

onMounted(async () => {
  await fetchTypes();
  await fetchCodes(1);
  await fetchRedemptions(1);
  await loadAllItemOptions();
});

function removeItem(idx: number) {
  typeForm.value.items.splice(idx, 1);
}

// 物品下拉：远程搜索已移除，改为本地过滤
const itemOptionsFull = ref<Array<{ id: number|string; label: string }>>([]);
async function loadAllItemOptions() {
  try {
    const res: any = await $fetch('/api/items');
    const list = res?.data || [];
    itemOptionsFull.value = list.map((it: any) => ({ id: Number(it.id), label: it.name || it.cn || it.n }));
  } catch {}
}

const itemOptions = computed(() => itemOptionsFull.value.map(o => ({ value: Number(o.id), label: `${o.id} - ${o.label}` })));
const isDataTypeSelected = computed(() => {
  const t = types.value.find(t => t.id === codeForm.value.cdk_type_id);
  return t?.type === 'data';
});
function searchItems(query: string) {
  const q = (query || '').trim().toLowerCase();
  const opts = itemOptions.value || [];
  if (!q) return opts.slice(0, 20);
  return opts.filter(o => o.label.toLowerCase().includes(q)).slice(0, 200);
}

function addEmptyItem() {
  typeForm.value.items.push({ ItemId: '' as any, ItemNum: 1 });
}
</script>

<style scoped>
.card { border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.btn { padding: 6px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #111827; color: #fff; cursor: pointer; }
.btn-secondary { background: #6b7280; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
input, select, textarea { width: 100%; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 6px; }
.items-editor .results { max-height: 200px; overflow: auto; border: 1px dashed #e5e7eb; padding: 6px; border-radius: 6px; }
.items-editor .result-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
.items-editor .selected { margin-top: 8px; display: grid; gap: 8px; }
.items-editor .selected-row { display: grid; grid-template-columns: 1fr 120px 80px; gap: 8px; align-items: center; }
.items-editor .name { font-size: 12px; color: #374151; }
</style>


