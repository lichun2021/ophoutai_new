<template>
  <div class="cdk-container">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-qr-code" class="w-5 h-5 text-blue-600" />
          <h3 class="text-base font-semibold">CDK 领取</h3>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormGroup label="服务器" required>
          <USelectMenu
            v-model="form.server"
            :options="serverOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="请选择服务器"
            :loading="loadingServers"
          />
        </UFormGroup>

        <UFormGroup label="角色ID" required>
          <UInput v-model="form.playerId" placeholder="输入角色ID / UUID" />
        </UFormGroup>

        <UFormGroup label="CDK 码" required>
          <UInput v-model="form.code" placeholder="输入领取码" />
        </UFormGroup>
      </div>

      <div class="mt-4 flex gap-2">
        <UButton color="primary" :loading="loading" @click="submit">立即领取</UButton>
        <UButton color="gray" variant="outline" @click="reset">重置</UButton>
      </div>

      <div class="mt-4">
        <UAlert v-if="message" :title="ok ? '领取成功' : '领取结果'" :color="ok ? 'green' : 'red'" :description="message" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';


definePageMeta({
  layout: false,
  auth: false
})

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
    // 使用专门的CDK服务器列表接口
    const res: any = await $fetch('/api/client/cdk/servers');
    if (res?.success && Array.isArray(res.data)) {
      servers.value = (res.data as Array<{ name: string; bname: string; server_id?: number | null }>)
        .map(s => ({ label: s.name, value: String(s.server_id ?? s.bname) }));
      if (!form.value.server && servers.value.length > 0) {
        form.value.server = servers.value[0].value;
      } else if (servers.value.length === 0) {
        // 如果服务器列表为空，显示提示
        message.value = '暂无可用服务器，请联系管理员';
        ok.value = false;
      }
    }
  } catch (e: any) {
    // 显示错误信息
    console.error('获取服务器列表失败:', e);
    message.value = '获取服务器列表失败: ' + (e?.data?.message || e?.message || '网络错误');
    ok.value = false;
  } finally {
    loadingServers.value = false;
  }
}

const route = useRoute();
onMounted(() => {
  // 预填 playerId（支持 ?playerid= / ?playerId=）
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
.cdk-container { padding: 16px; max-width: 600px; margin: 0 auto; min-height: calc(100vh - 120px); }
</style>


