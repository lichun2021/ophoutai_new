<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="title">服务器配置</h2>
        <p class="subtitle">合服场景可单服关闭在线统计，支持复制与弹窗编辑</p>
      </div>
      <div class="actions">
        <button class="btn primary" @click="openModal('create')">新建服务器</button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>server_id</th>
              <th>名称</th>
              <th>webhost</th>
              <th>dbip</th>
              <th>bname</th>
              <th>dbuser</th>
              <th>启用</th>
              <th>CDK</th>
              <th>计在线</th>
              <th style="min-width:180px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.id }}</td>
              <td class="mono">{{ row.server_id ?? '-' }}</td>
              <td>{{ row.name }}</td>
              <td class="mono">{{ row.webhost }}</td>
              <td class="mono">{{ row.dbip }}</td>
              <td class="mono">{{ row.bname }}</td>
              <td class="mono">{{ row.dbuser }}</td>
              <td><span :class="['badge', row.is_active ? 'green' : 'gray']">{{ row.is_active ? '启用' : '停用' }}</span></td>
              <td><span :class="['badge', row.allow_cdk_redeem ? 'blue' : 'gray']">{{ row.allow_cdk_redeem ? '允许' : '禁止' }}</span></td>
              <td><span :class="['badge', row.count_online === 0 ? 'gray' : 'green']">{{ row.count_online === 0 ? '不计' : '计入' }}</span></td>
              <td class="row-actions">
                <button class="btn ghost" @click="openModal('edit', row)">编辑</button>
                <button class="btn ghost" @click="openModal('copy', row)">复制</button>
                <button class="btn danger" @click="remove(row.id)">删除</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="11" class="empty">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 弹窗 -->
    <div v-if="modal.visible" class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ modalTitle }}</h3>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>server_id</label>
            <input v-model.number="form.server_id" placeholder="例如 10001" />
          </div>
          <div class="form-row">
            <label>名称</label>
            <input v-model="form.name" placeholder="例如 S1 / 一区" />
          </div>
          <div class="form-row">
            <label>webhost</label>
            <input v-model="form.webhost" placeholder="http://ip:port 或 https://domain:port" />
          </div>
          <div class="form-row">
            <label>dbip</label>
            <input v-model="form.dbip" placeholder="数据库主机IP" />
          </div>
          <div class="form-row">
            <label>bname</label>
            <input v-model="form.bname" placeholder="如 game_1" />
          </div>
          <div class="form-row">
            <label>dbuser</label>
            <input v-model="form.dbuser" placeholder="数据库用户名" />
          </div>
          <div class="form-row">
            <label>dbpass</label>
            <input v-model="form.dbpass" placeholder="数据库密码" />
          </div>
          <div class="form-row">
            <label>启用</label>
            <select v-model.number="form.is_active">
              <option :value="1">启用</option>
              <option :value="0">停用</option>
            </select>
          </div>
          <div class="form-row">
            <label>CDK领取</label>
            <select v-model.number="form.allow_cdk_redeem">
              <option :value="1">允许</option>
              <option :value="0">禁止</option>
            </select>
          </div>
          <div class="form-row">
            <label>计入在线统计</label>
            <select v-model.number="form.count_online">
              <option :value="1">计入</option>
              <option :value="0">不计</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" @click="closeModal">取消</button>
          <button class="btn primary" @click="submit">{{ modal.mode === 'edit' ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'

type Row = {
  id?: number
  server_id?: number | null
  name: string
  webhost: string
  dbip: string
  bname: string
  dbuser: string
  dbpass?: string
  is_active: number
  allow_cdk_redeem: number
  count_online?: number
}

const rows = ref<Row[]>([])
const emptyForm: Row = { server_id: null, name: '', webhost: '', dbip: '', bname: '', dbuser: '', dbpass: '', is_active: 1, allow_cdk_redeem: 1, count_online: 1 }
const form = ref<Row>({ ...emptyForm })
const modal = ref<{ visible: boolean; mode: 'create' | 'edit' | 'copy'; currentId?: number }>({ visible: false, mode: 'create' })

const modalTitle = computed(() => {
  if (modal.value.mode === 'edit') return '编辑服务器'
  if (modal.value.mode === 'copy') return '复制服务器'
  return '新建服务器'
})

async function fetchList() {
  const res = await $fetch('/api/admin/servers') as any
  rows.value = (res?.data || []).map((r: any) => ({
    ...r,
    count_online: r.count_online === undefined || r.count_online === null ? 1 : Number(r.count_online)
  }))
}

function openModal(mode: 'create' | 'edit' | 'copy', row?: Row) {
  modal.value = { visible: true, mode, currentId: mode === 'edit' ? row?.id : undefined }
  if (row) {
    const base = { ...row }
    delete base.id
    form.value = {
      ...emptyForm,
      ...base,
      count_online: base.count_online === undefined || base.count_online === null ? 1 : Number(base.count_online)
    }
  } else {
    form.value = { ...emptyForm }
  }
}

function closeModal() {
  modal.value.visible = false
}

async function submit() {
  try {
    if (modal.value.mode === 'edit' && modal.value.currentId) {
      const res = await $fetch(`/api/admin/servers/update?id=${modal.value.currentId}`, { method: 'POST', body: form.value }) as any
      if (!res?.success) throw new Error(res?.message || '更新失败')
    } else {
      const res = await $fetch('/api/admin/servers/create', { method: 'POST', body: form.value }) as any
      if (!res?.success) throw new Error(res?.message || '创建失败')
    }
    await fetchList()
    closeModal()
  } catch (e: any) {
    alert(e?.data?.message || e?.message || '请求失败')
  }
}

async function remove(id?: number) {
  if (!id) return
  if (!confirm('确定删除?')) return
  try {
    const res = await $fetch(`/api/admin/servers/remove?id=${id}`, { method: 'POST' }) as any
    if (!res?.success) throw new Error(res?.message || '删除失败')
    await fetchList()
  } catch (e: any) {
    alert(e?.data?.message || e?.message || '请求失败')
  }
}

onMounted(fetchList)
</script>

<style scoped>
.page { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.title { margin: 0; font-size: 20px; font-weight: 700; }
.subtitle { margin: 4px 0 0; color: #6b7280; font-size: 13px; }
.actions { display: flex; gap: 8px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
th { color: #6b7280; font-weight: 600; background: #f9fafb; }
tbody tr:hover { background: #f9fafb; }
.mono { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; font-size: 12px; }
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge.green { background: #ecfdf3; color: #15803d; }
.badge.blue { background: #eff6ff; color: #1d4ed8; }
.badge.gray { background: #f3f4f6; color: #4b5563; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.btn { border: none; border-radius: 8px; padding: 6px 10px; font-size: 13px; cursor: pointer; transition: all 0.15s ease; }
.btn.primary { background: #2563eb; color: #fff; }
.btn.danger { background: #ef4444; color: #fff; }
.btn.ghost { background: #f3f4f6; color: #111827; }
.btn:hover { filter: brightness(0.97); }
.empty { text-align: center; color: #9ca3af; padding: 16px; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; width: 640px; max-width: 90vw; padding: 18px; box-shadow: 0 12px 34px rgba(0,0,0,0.15); }
.modal-header { margin-bottom: 12px; }
.modal-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 13px; color: #4b5563; }
.form-row input, .form-row select { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
.modal-footer { margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px; }
</style>
