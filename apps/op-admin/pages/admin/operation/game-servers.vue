<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="title">服务器配置</h2>
        <p class="subtitle">维护区服运营接口和客户端选服信息，保存后可生成 serverlist。</p>
      </div>
      <div class="actions">
        <button class="btn primary" :disabled="saving || generating" @click="openModal('create')">新建服务器</button>
      </div>
    </div>

    <p v-if="listError" class="notice error" role="alert">{{ listError }}</p>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>区服ID</th>
              <th>名称</th>
              <th>运营接口地址</th>
              <th>加入选服列表</th>
              <th>游戏连接入口</th>
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
              <td class="mono">{{ row.webhost || '-' }}</td>
              <td>
                <span v-if="row.serverlist_invalid" class="badge amber">配置需修正</span>
                <span v-else :class="['badge', row.serverlist_config.enabled ? 'blue' : 'gray']">{{ row.serverlist_config.enabled ? '已加入' : '未加入' }}</span>
              </td>
              <td class="mono">{{ endpointLabel(row.serverlist_config) }}</td>
              <td><span :class="['badge', row.is_active ? 'green' : 'gray']">{{ row.is_active ? '启用' : '停用' }}</span></td>
              <td><span :class="['badge', row.allow_cdk_redeem ? 'blue' : 'gray']">{{ row.allow_cdk_redeem ? '允许' : '禁止' }}</span></td>
              <td><span :class="['badge', row.count_online === 0 ? 'gray' : 'green']">{{ row.count_online === 0 ? '不计' : '计入' }}</span></td>
              <td>
                <div class="row-actions">
                  <button class="btn ghost" :disabled="saving || generating" @click="openModal('edit', row)">编辑</button>
                  <button class="btn ghost" :disabled="saving || generating" @click="openModal('copy', row)">复制</button>
                  <button class="btn danger" :disabled="saving || generating" @click="remove(row.id)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="10" class="empty">{{ loading ? '正在加载服务器...' : '暂无服务器，请先新建并保存配置' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card export-panel">
      <div class="export-copy">
        <h3>客户端选服文件</h3>
        <p class="subtitle">根据已保存的配置生成，仅包含启用、已加入选服列表且已开服的区服。</p>
        <p class="subtitle">输出位置：<code>/data/serverlist</code> · 内容格式：<code>{ "worldList": [...] }</code></p>
        <p class="hint">生成失败会保留原文件。游戏连接地址需要单独填写，不使用运营接口地址。</p>
      </div>
      <button class="btn primary generate-btn" :disabled="generating || saving || loading" @click="generateServerlist">
        {{ generating ? '正在生成...' : '生成 serverlist' }}
      </button>
      <p v-if="generationError" class="notice error export-result" role="alert">{{ generationError }}</p>
      <p v-if="generationResult" class="notice success export-result" role="status">
        已生成 {{ generationResult.count }} 个区服至 <code>{{ generationResult.path }}</code><span v-if="generationResult.bytes !== null">（{{ generationResult.bytes }} 字节）</span>
      </p>
    </div>

    <div v-if="modal.visible" class="modal-backdrop" @keydown.esc="closeModal">
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="server-modal-title" @submit.prevent="submit">
        <div class="modal-header">
          <div>
            <h3 id="server-modal-title">{{ modalTitle }}</h3>
            <p v-if="modal.mode === 'copy'" class="subtitle">复制配置后，请为新区服填写不同的游戏区服ID。</p>
          </div>
          <button type="button" class="btn ghost" :disabled="saving" aria-label="关闭服务器配置" @click="closeModal">关闭</button>
        </div>
        <div class="modal-body">
          <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>
          <p v-if="invalidExistingConfig" class="notice warning" role="alert">原选服配置无法读取。请重新填写并勾选下方确认后保存，其他服务器不受影响。</p>
          <fieldset :disabled="saving">
            <section class="form-section">
              <h4>区服信息</h4>
              <div class="form-grid">
                <div class="form-row">
                  <label for="server-world-id">游戏区服ID</label>
                  <input id="server-world-id" v-model.number="form.server_id" type="number" min="1" max="2147483647" step="1" required placeholder="游戏中的实际区服ID" />
                </div>
                <div class="form-row">
                  <label for="server-name">名称</label>
                  <input id="server-name" v-model="form.name" required maxlength="100" placeholder="例如 S1 / 一区" />
                </div>
                <div class="form-row">
                  <label for="server-active">启用</label>
                  <select id="server-active" v-model.number="form.is_active">
                    <option :value="1">启用</option>
                    <option :value="0">停用</option>
                  </select>
                </div>
                <div class="form-row">
                  <label for="server-webhost">运营接口地址（选填）</label>
                  <input id="server-webhost" v-model="form.webhost" placeholder="http://主机:端口 或 https://域名" />
                  <p class="hint">用于角色查询和邮件等运营功能，与游戏连接入口分开配置。</p>
                </div>
              </div>
            </section>

            <section class="form-section">
              <div class="section-heading">
                <h4>客户端选服列表</h4>
                <label class="checkbox-row">
                  <input v-model="form.serverlist_config.enabled" type="checkbox" />
                  加入 serverlist
                </label>
              </div>
              <p class="hint">未加入时可保存草稿；加入后请补齐以下信息。显示关闭或维护状态会按配置写入文件。</p>
              <div class="form-grid">
                <div class="form-row">
                  <label for="client-host">游戏主机</label>
                  <input id="client-host" v-model="form.serverlist_config.host" :required="form.serverlist_config.enabled" placeholder="IP 或域名，不含协议、端口和路径" />
                </div>
                <div class="form-row">
                  <label for="client-port">游戏端口</label>
                  <input id="client-port" v-model.number="form.serverlist_config.port" type="number" min="1" max="65535" step="1" :required="form.serverlist_config.enabled" placeholder="例如 8602" />
                </div>
                <div class="form-row">
                  <label for="client-opens-at">开服时间（北京时间）</label>
                  <input id="client-opens-at" v-model="form.serverlist_config.opensAt" type="datetime-local" step="1" :required="form.serverlist_config.enabled" />
                </div>
                <div class="form-row">
                  <label for="client-channel-group">客户端分组</label>
                  <select id="client-channel-group" v-model="form.serverlist_config.channelGroup" :required="form.serverlist_config.enabled">
                    <option value="" disabled>请选择与游戏一致的分组</option>
                    <option value="op1">op1</option>
                    <option value="op2">op2</option>
                    <option value="op3">op3</option>
                  </select>
                </div>
                <div class="form-row">
                  <label for="client-status">区服状态</label>
                  <select id="client-status" v-model.number="form.serverlist_config.status">
                    <option :value="0">爆满</option>
                    <option :value="1">新区</option>
                    <option :value="2">火爆</option>
                    <option :value="3">拥挤</option>
                    <option :value="4">其他</option>
                  </select>
                </div>
                <div class="form-row">
                  <label for="client-os-type">客户端平台</label>
                  <select id="client-os-type" v-model.number="form.serverlist_config.osType">
                    <option :value="1">iOS</option>
                    <option :value="2">Android</option>
                    <option :value="3">双端</option>
                  </select>
                </div>
                <div class="form-row">
                  <label for="client-visible">客户端显示</label>
                  <select id="client-visible" v-model.number="form.serverlist_config.visible">
                    <option :value="1">显示</option>
                    <option :value="0">隐藏</option>
                  </select>
                </div>
                <div class="form-row">
                  <label for="client-maintain">维护状态</label>
                  <select id="client-maintain" v-model.number="form.serverlist_config.maintain">
                    <option :value="0">正常</option>
                    <option :value="1">维护中</option>
                  </select>
                </div>
              </div>
              <label v-if="invalidExistingConfig" class="checkbox-row repair-confirmation">
                <input v-model="replaceInvalidConfig" type="checkbox" />
                确认用当前表单替换此服务器无法读取的选服配置
              </label>
            </section>

            <details class="form-section legacy-settings">
              <summary>其他功能配置（选填）</summary>
              <p class="hint">数据库凭据不用于角色查询或邮件，也不会写入 serverlist。</p>
              <div class="form-grid">
                <div class="form-row">
                  <label for="server-dbip">数据库地址</label>
                  <input id="server-dbip" v-model="form.dbip" placeholder="数据库主机IP" />
                </div>
                <div class="form-row">
                  <label for="server-bname">数据库名</label>
                  <input id="server-bname" v-model="form.bname" placeholder="如 game_1" />
                </div>
                <div class="form-row">
                  <label for="server-dbuser">数据库用户</label>
                  <input id="server-dbuser" v-model="form.dbuser" placeholder="数据库用户名" />
                </div>
                <div class="form-row">
                  <label for="server-dbpass">数据库密码</label>
                  <input id="server-dbpass" v-model="form.dbpass" type="password" autocomplete="new-password" placeholder="数据库密码" />
                </div>
                <div class="form-row">
                  <label for="server-cdk">CDK领取</label>
                  <select id="server-cdk" v-model.number="form.allow_cdk_redeem">
                    <option :value="1">允许</option>
                    <option :value="0">禁止</option>
                  </select>
                </div>
                <div class="form-row">
                  <label for="server-online">计入在线统计</label>
                  <select id="server-online" v-model.number="form.count_online">
                    <option :value="1">计入</option>
                    <option :value="0">不计</option>
                  </select>
                </div>
              </div>
            </details>
          </fieldset>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn ghost" :disabled="saving" @click="closeModal">取消</button>
          <button type="submit" class="btn primary" :disabled="saving">{{ saving ? '正在保存...' : modal.mode === 'edit' ? '保存' : '创建' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'

type ServerlistDraft = {
  enabled: boolean
  host: string
  port: number | string | null
  status: number
  visible: number
  maintain: number
  opensAt: string
  osType: number
  channelGroup: string
}

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
  count_online: number
  serverlist_config: ServerlistDraft
  serverlist_invalid?: boolean
}

const emptyServerlistConfig = (): ServerlistDraft => ({
  enabled: false, host: '', port: null, status: 1, visible: 1, maintain: 0,
  opensAt: '', osType: 3, channelGroup: ''
})
const emptyForm = (): Row => ({
  server_id: null, name: '', webhost: '', dbip: '', bname: '', dbuser: '', dbpass: '',
  is_active: 1, allow_cdk_redeem: 0, count_online: 0, serverlist_config: emptyServerlistConfig()
})
const rows = ref<Row[]>([])
const form = ref<Row>(emptyForm())
const loading = ref(false)
const saving = ref(false)
const listError = ref('')
const formError = ref('')
const generating = ref(false)
const generationError = ref('')
const generationResult = ref<{ path: string; count: number; bytes: number | null } | null>(null)
const invalidExistingConfig = ref(false)
const replaceInvalidConfig = ref(false)
const modal = ref<{ visible: boolean; mode: 'create' | 'edit' | 'copy'; currentId?: number }>({ visible: false, mode: 'create' })

const modalTitle = computed(() => {
  if (modal.value.mode === 'edit') return '编辑服务器'
  if (modal.value.mode === 'copy') return '复制服务器'
  return '新建服务器'
})

function decodeConfig(value: unknown): { config: ServerlistDraft; invalid: boolean } {
  if (value === null || value === undefined) return { config: emptyServerlistConfig(), invalid: false }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid config')
    const config = { ...emptyServerlistConfig() }
    config.enabled = parsed.enabled === true
    for (const key of ['host', 'opensAt', 'channelGroup'] as const) {
      if (parsed[key] !== undefined && typeof parsed[key] !== 'string') throw new Error('invalid config')
      config[key] = parsed[key] ?? config[key]
    }
    for (const key of ['status', 'visible', 'maintain', 'osType'] as const) {
      if (parsed[key] !== undefined && (typeof parsed[key] !== 'number' || !Number.isFinite(parsed[key]))) throw new Error('invalid config')
      config[key] = parsed[key] ?? config[key]
    }
    if (parsed.enabled !== undefined && typeof parsed.enabled !== 'boolean') throw new Error('invalid config')
    if (parsed.port !== undefined && parsed.port !== null && (typeof parsed.port !== 'number' || !Number.isFinite(parsed.port))) throw new Error('invalid config')
    config.port = parsed.port ?? null
    return { config, invalid: false }
  } catch {
    return { config: emptyServerlistConfig(), invalid: true }
  }
}

function endpointLabel(config: ServerlistDraft): string {
  return config.host && config.port ? `${config.host}:${config.port}` : '-'
}

function message(error: any, fallback: string): string {
  return String(error?.data?.message || error?.data?.statusMessage || error?.message || fallback)
}

async function fetchList() {
  loading.value = true
  listError.value = ''
  try {
    const res = await $fetch('/api/admin/servers', { credentials: 'include' }) as any
    if (!res?.success || !Array.isArray(res.data)) throw new Error(res?.message || '获取服务器失败')
    rows.value = res.data.map((row: any) => {
      const decoded = decodeConfig(row.serverlist_config)
      return {
        ...row,
        serverlist_config: decoded.config,
        serverlist_invalid: decoded.invalid,
        count_online: row.count_online === undefined || row.count_online === null ? 1 : Number(row.count_online)
      }
    })
  } catch (error) {
    listError.value = message(error, '获取服务器失败')
  } finally {
    loading.value = false
  }
}

function openModal(mode: 'create' | 'edit' | 'copy', row?: Row) {
  if (saving.value || generating.value) return
  modal.value = { visible: true, mode, currentId: mode === 'edit' ? row?.id : undefined }
  formError.value = ''
  invalidExistingConfig.value = !!row?.serverlist_invalid
  replaceInvalidConfig.value = false
  form.value = row ? { ...emptyForm(), ...row, id: undefined, serverlist_config: { ...row.serverlist_config } } : emptyForm()
}

function closeModal() {
  if (!saving.value) modal.value.visible = false
}

function validateClientConfig(config: ServerlistDraft) {
  if (!config.enabled) return
  const port = Number(config.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('请填写1至65535之间的游戏端口')
  const host = config.host.trim()
  if (!host || /[\s\/?#@\\]/.test(host) || host.includes('://')) throw new Error('游戏主机只填写IP或域名，不含协议、端口和路径')
  try {
    const endpoint = new URL(`http://${host}:${port}`)
    if (endpoint.hostname.toLowerCase() !== host.toLowerCase() || endpoint.username || endpoint.password || endpoint.pathname !== '/') throw new Error()
  } catch { throw new Error('游戏主机格式无效；IPv6地址请使用方括号') }
  if (![0, 1, 2, 3, 4].includes(config.status)) throw new Error('请选择有效的区服状态')
  if (![0, 1].includes(config.visible) || ![0, 1].includes(config.maintain)) throw new Error('请选择有效的显示和维护状态')
  if (![1, 2, 3].includes(config.osType)) throw new Error('请选择客户端平台')
  if (!['op1', 'op2', 'op3'].includes(config.channelGroup)) throw new Error('请选择与游戏一致的客户端分组')
  const time = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(config.opensAt)
  if (!time) throw new Error('请填写有效的开服时间（北京时间）')
  const [year, month, day, hour, minute, second] = time.slice(1).map(value => Number(value || 0))
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (year < 1970 || utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day || utc.getUTCHours() !== hour || utc.getUTCMinutes() !== minute || utc.getUTCSeconds() !== second) {
    throw new Error('请填写真实有效的开服日期和时间')
  }
}

async function submit() {
  if (saving.value) return
  formError.value = ''
  try {
    if (!Number.isSafeInteger(form.value.server_id) || Number(form.value.server_id) <= 0 || Number(form.value.server_id) > 2147483647) throw new Error('请填写有效的游戏区服ID')
    if (!form.value.name.trim()) throw new Error('请填写区服名称')
    if (invalidExistingConfig.value && !replaceInvalidConfig.value) throw new Error('请先确认替换无法读取的选服配置')
    validateClientConfig(form.value.serverlist_config)
    const config = form.value.serverlist_config
    const payload = {
      server_id: form.value.server_id, name: form.value.name.trim(), webhost: form.value.webhost.trim(),
      dbip: form.value.dbip, bname: form.value.bname, dbuser: form.value.dbuser, dbpass: form.value.dbpass,
      is_active: form.value.is_active, allow_cdk_redeem: form.value.allow_cdk_redeem, count_online: form.value.count_online,
      serverlist_config: { ...config, host: config.host.trim(), port: config.port === '' || config.port === null ? null : Number(config.port) }
    }
    saving.value = true
    const editing = modal.value.mode === 'edit' && modal.value.currentId
    const res = await $fetch(editing ? `/api/admin/servers/update?id=${modal.value.currentId}` : '/api/admin/servers/create', {
      method: 'POST', body: payload, credentials: 'include', retry: 0
    }) as any
    if (!res?.success) throw new Error(res?.message || (editing ? '更新失败' : '创建失败'))
    modal.value.visible = false
    generationResult.value = null
    await fetchList()
  } catch (error) {
    formError.value = message(error, '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(id?: number) {
  if (!id || saving.value || generating.value || !confirm('确定删除此服务器配置？')) return
  saving.value = true
  listError.value = ''
  try {
    const res = await $fetch(`/api/admin/servers/remove?id=${id}`, { method: 'POST', credentials: 'include', retry: 0 }) as any
    if (!res?.success) throw new Error(res?.message || '删除失败')
    generationResult.value = null
    await fetchList()
  } catch (error) {
    listError.value = message(error, '删除失败')
  } finally {
    saving.value = false
  }
}

async function generateServerlist() {
  if (generating.value || saving.value || loading.value) return
  generating.value = true
  generationError.value = ''
  generationResult.value = null
  try {
    const res = await $fetch('/api/admin/servers/generate-serverlist', { method: 'POST', body: {}, credentials: 'include', retry: 0 }) as any
    if (!res?.success) throw new Error(res?.message || '生成 serverlist 失败')
    const count = Number(res.count)
    if (!Number.isSafeInteger(count) || count < 1 || res.path !== '/data/serverlist') throw new Error('生成结果未确认，请刷新后重试')
    generationResult.value = { path: res.path, count, bytes: Number.isSafeInteger(res.bytes) && res.bytes >= 0 ? res.bytes : null }
  } catch (error) {
    generationError.value = message(error, '生成 serverlist 失败')
  } finally {
    generating.value = false
  }
}

onMounted(fetchList)
</script>

<style scoped>
.page { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.page-header, .modal-header, .section-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.title, .export-copy h3, .modal-header h3, .form-section h4 { margin: 0; font-weight: 700; }
.title { font-size: 20px; }
.subtitle { margin: 6px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6; }
.hint { margin: 6px 0 0; color: #6b7280; font-size: 12px; line-height: 1.6; }
.actions, .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
th { color: #6b7280; font-weight: 600; background: #f9fafb; }
tbody tr:hover { background: #f9fafb; }
.mono, code { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; font-size: 12px; overflow-wrap: anywhere; }
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.badge.green { background: #ecfdf3; color: #15803d; }
.badge.blue { background: #eff6ff; color: #1d4ed8; }
.badge.gray { background: #f3f4f6; color: #4b5563; }
.badge.amber { background: #fffbeb; color: #92400e; }
.btn { border: none; border-radius: 8px; padding: 8px 12px; font-size: 13px; cursor: pointer; transition: background 0.15s ease; }
.btn.primary { background: #2563eb; color: #fff; }
.btn.danger { background: #ef4444; color: #fff; }
.btn.ghost { background: #f3f4f6; color: #111827; }
.btn:hover:not(:disabled) { filter: brightness(0.97); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.empty { text-align: center; color: #9ca3af; padding: 22px; }
.export-panel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.export-copy { flex: 1; min-width: min(100%, 280px); }
.generate-btn { white-space: nowrap; }
.export-result { width: 100%; margin: 0; }
.notice { border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.6; }
.notice.error { color: #b91c1c; background: #fef2f2; }
.notice.warning { color: #92400e; background: #fffbeb; }
.notice.success { color: #166534; background: #f0fdf4; }
.modal-backdrop { position: fixed; inset: 0; padding: 20px; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; width: 860px; max-width: 100%; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 12px 34px rgba(0,0,0,0.15); }
.modal-header { padding: 18px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-body { padding: 18px 20px; overflow-y: auto; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.form-section + .form-section { margin-top: 22px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
.form-section h4 { font-size: 14px; }
.form-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.form-row { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-row label, .checkbox-row { font-size: 13px; color: #374151; }
.form-row input, .form-row select { border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 10px; font-size: 13px; min-width: 0; width: 100%; box-sizing: border-box; }
.form-row input:focus, .form-row select:focus { border-color: #2563eb; outline: 2px solid #dbeafe; }
.checkbox-row { display: inline-flex; align-items: center; gap: 7px; }
.repair-confirmation { margin-top: 14px; }
.legacy-settings summary { cursor: pointer; font-size: 14px; font-weight: 600; }
.modal-footer { padding: 14px 20px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
@media (max-width: 640px) {
  .page { padding: 14px; }
  .page-header, .section-heading { align-items: flex-start; flex-direction: column; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
  .modal-backdrop { padding: 10px; }
  .modal { max-height: 96vh; }
  .modal-header, .modal-body, .modal-footer { padding: 14px; }
  .generate-btn { width: 100%; }
}
</style>
