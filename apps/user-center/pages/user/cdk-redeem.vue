<template>
  <div class="cdk-page">
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-grid"></div>

    <div class="cdk-box">
      <!-- Logo -->
      <div class="cdk-header">
        <div class="header-icon">🎁</div>
        <h1 class="header-title">CDK 领取</h1>
        <p class="header-sub">输入领取码获取您的奖励</p>
      </div>

      <!-- 表单 -->
      <form class="cdk-form" @submit.prevent="submit">
        <div class="form-field">
          <label class="field-label">服务器</label>
          <div class="select-wrap">
            <select v-model="form.server" class="field-select" :disabled="loadingServers">
              <option value="" disabled>{{ loadingServers ? '加载中...' : '请选择服务器' }}</option>
              <option v-for="s in serverOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <span class="select-arrow">▾</span>
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">角色ID</label>
          <div class="input-wrap">
            <span class="input-icon">🎮</span>
            <input v-model="form.playerId" class="field-input" placeholder="输入角色ID / UUID" />
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">CDK 码</label>
          <div class="input-wrap">
            <span class="input-icon">🔑</span>
            <input v-model="form.code" class="field-input" placeholder="输入领取码" />
          </div>
        </div>

        <div class="btn-row">
          <button type="submit" class="submit-btn" :disabled="loading || !form.server || !form.playerId || !form.code">
            <span v-if="!loading">🎉 立即领取</span>
            <span v-else class="loading-dots"><span></span><span></span><span></span></span>
          </button>
          <button type="button" class="reset-btn" @click="reset">重置</button>
        </div>
      </form>

      <!-- 结果提示 -->
      <div v-if="message" class="result-bar" :class="ok ? 'result-success' : 'result-error'">
        <span class="result-icon">{{ ok ? '✅' : '❌' }}</span>
        <div>
          <div class="result-title">{{ ok ? '领取成功' : '领取结果' }}</div>
          <div class="result-msg">{{ message }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';

definePageMeta({ layout: false, auth: false })

const form = ref({ server: '', playerId: '', code: '' });
const loading = ref(false);
const message = ref('');
const ok = ref(false);
type ServerOption = { label: string; value: string };
const servers = ref<ServerOption[]>([]);
const loadingServers = ref(false);
const serverOptions = computed(() => servers.value);

async function submit() {
  if (!form.value.server || !form.value.playerId || !form.value.code) {
    message.value = '请填写完整信息'; ok.value = false; return;
  }
  loading.value = true; message.value = ''; ok.value = false;
  try {
    const res = await $fetch('/api/client/cdk/redeem', { method: 'POST', body: form.value });
    if ((res as any).code === 200) { ok.value = true; message.value = (res as any).message || '领取成功'; }
    else { ok.value = false; message.value = (res as any).message || '领取失败'; }
  } catch (e: any) {
    ok.value = false; message.value = e?.data?.message || e?.message || '领取失败';
  } finally {
    loading.value = false;
  }
}

async function fetchServers() {
  loadingServers.value = true;
  try {
    const res: any = await $fetch('/api/client/cdk/servers');
    if (res?.success && Array.isArray(res.data)) {
      servers.value = (res.data as Array<{ name: string; bname: string; server_id?: number | null }>)
        .map(s => ({ label: s.name, value: String(s.server_id ?? s.bname) }));
      if (!form.value.server && servers.value.length > 0) {
        form.value.server = servers.value[0].value;
      } else if (servers.value.length === 0) {
        message.value = '暂无可用服务器，请联系管理员';
        ok.value = false;
      }
    }
  } catch (e: any) {
    console.error('获取服务器列表失败:', e);
    message.value = '获取服务器列表失败: ' + (e?.data?.message || e?.message || '网络错误');
    ok.value = false;
  } finally {
    loadingServers.value = false;
  }
}

const route = useRoute();
onMounted(() => {
  const q: any = route.query || {};
  const pid = (q.playerid || q.playerId || '').toString();
  if (pid) form.value.playerId = pid;
  fetchServers();
});

function reset() {
  form.value = { server: form.value.server, playerId: '', code: '' };
  message.value = '';
  ok.value = false;
}
</script>

<style scoped>
.cdk-page {
  min-height: 100vh; background: #0d0f1a;
  display: flex; align-items: center; justify-content: center;
  padding: 20px; position: relative; overflow: hidden;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
}
.bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
.orb-1 { width: 400px; height: 400px; background: rgba(108,92,231,0.2); top: -100px; left: -100px; }
.orb-2 { width: 300px; height: 300px; background: rgba(0,206,201,0.15); bottom: -50px; right: -50px; }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }

.cdk-box {
  position: relative; width: 100%; max-width: 440px;
  background: #161929; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px; padding: 36px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,92,231,0.15);
}

.cdk-header { text-align: center; margin-bottom: 28px; }
.header-icon { font-size: 48px; margin-bottom: 10px; }
.header-title {
  margin: 0 0 6px; font-size: 24px; font-weight: 800;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.header-sub { margin: 0; font-size: 13px; color: #8892b0; }

.cdk-form { display: flex; flex-direction: column; gap: 18px; }
.form-field { display: flex; flex-direction: column; gap: 7px; }
.field-label { font-size: 13px; font-weight: 600; color: #8892b0; }

.input-wrap {
  display: flex; align-items: center;
  background: #0d0f1a; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s;
}
.input-wrap:focus-within { border-color: rgba(108,92,231,0.6); box-shadow: 0 0 0 3px rgba(108,92,231,0.15); }
.input-icon { padding: 0 12px; font-size: 16px; flex-shrink: 0; }
.field-input {
  flex: 1; padding: 13px 16px 13px 0; background: transparent;
  border: none; outline: none; color: #e8eaf6; font-size: 15px;
}
.field-input::placeholder { color: rgba(136,146,176,0.5); }

.select-wrap {
  position: relative; background: #0d0f1a;
  border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.select-wrap:focus-within { border-color: rgba(108,92,231,0.6); box-shadow: 0 0 0 3px rgba(108,92,231,0.15); }
.field-select {
  width: 100%; padding: 13px 40px 13px 16px; background: transparent;
  border: none; outline: none; color: #e8eaf6; font-size: 15px;
  appearance: none; -webkit-appearance: none; cursor: pointer;
}
.field-select option { background: #161929; color: #e8eaf6; }
.select-arrow {
  position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
  color: #8892b0; pointer-events: none; font-size: 14px;
}

.btn-row { display: flex; gap: 10px; margin-top: 6px; }
.submit-btn {
  flex: 1; padding: 15px; border-radius: 14px; border: none;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  color: white; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 8px 24px rgba(108,92,231,0.4);
}
.submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(108,92,231,0.5); }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.reset-btn {
  padding: 15px 24px; border-radius: 14px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: #8892b0; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.reset-btn:hover { background: rgba(255,255,255,0.1); color: #e8eaf6; }

.loading-dots { display: flex; align-items: center; justify-content: center; gap: 4px; }
.loading-dots span { width: 6px; height: 6px; border-radius: 50%; background: white; animation: dot-bounce 1.2s infinite; }
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }

.result-bar {
  margin-top: 20px; display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 16px; border-radius: 12px;
}
.result-success { background: rgba(0,206,201,0.1); border: 1px solid rgba(0,206,201,0.25); }
.result-error { background: rgba(225,112,85,0.1); border: 1px solid rgba(225,112,85,0.25); }
.result-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
.result-title { font-size: 14px; font-weight: 600; color: #e8eaf6; margin-bottom: 2px; }
.result-msg { font-size: 13px; color: #8892b0; }

@media (max-width: 480px) { .cdk-box { padding: 28px 20px; border-radius: 20px; } }
</style>
