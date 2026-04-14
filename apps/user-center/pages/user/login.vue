<template>
  <div class="login-page">
    <!-- 背景装饰 -->
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-grid"></div>

    <div class="login-box">
      <!-- Logo -->
      <div class="login-logo">
        <img src="/platform-coin.svg" alt="logo" class="logo-img" />
        <h1 class="logo-title">会员中心</h1>
        <p class="logo-sub">登录以管理您的账户</p>
      </div>

      <!-- 登录表单 -->
      <form class="login-form" @submit.prevent="login">
        <div class="form-field">
          <label class="field-label">用户名</label>
          <div class="input-wrap">
            <span class="input-icon">👤</span>
            <input
              v-model="state.username"
              class="field-input"
              placeholder="请输入用户名"
              :disabled="loading"
              autocomplete="username"
            />
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">密码</label>
          <div class="input-wrap">
            <span class="input-icon">🔒</span>
            <input
              v-model="state.password"
              type="password"
              class="field-input"
              placeholder="请输入密码"
              :disabled="loading"
              autocomplete="current-password"
            />
          </div>
        </div>

        <button type="submit" class="login-btn" :disabled="!isFormValid || loading">
          <span v-if="!loading">登 录</span>
          <span v-else class="loading-dots">
            <span></span><span></span><span></span>
          </span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';

definePageMeta({ layout: 'auth' });

const state = reactive({ username: '', password: '' });
const error = ref('');
const loading = ref(false);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const tips = useTips();

const isFormValid = computed(() => {
  const hasUsername = !!state.username?.trim();
  const hasPwd = !!state.password?.trim();
  const hasSig = typeof route.query.ts === 'string' && typeof route.query.sig === 'string';
  return hasUsername && (hasPwd || hasSig);
});

const login = async () => {
  if (loading.value) return;
  const tsParam = typeof route.query.ts === 'string' ? route.query.ts : undefined;
  const sigParam = typeof route.query.sig === 'string' ? route.query.sig : undefined;
  if (!state.username || (!state.password && !(tsParam && sigParam))) {
    tips.error('缺少登录凭据');
    return;
  }
  loading.value = true;
  try {
    const isResult = await authStore.logInUser(state.username, state.password, tsParam, sigParam);
    if (isResult) {
      tips.success('登录成功');
      await new Promise(r => setTimeout(r, 500));
      const redirect = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/user/home';
      await router.push(redirect);
    } else {
      tips.error('登录失败，用户名或密码错误');
    }
  } catch {
    tips.error('登录失败，无法连接到服务器');
  } finally {
    loading.value = false;
  }
};

const checkUrlParams = () => {
  const q = route.query;
  if (q.username) state.username = q.username;
  if (q.password) state.password = q.password;
  if (q.auto_login === 'true' && state.username && (state.password || (q.ts && q.sig))) {
    tips.success('正在自动登录...');
    setTimeout(() => { login(); }, 1000);
  }
};

onMounted(() => { checkUrlParams(); });
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #0d0f1a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
}
.orb-1 {
  width: 400px; height: 400px;
  background: rgba(108,92,231,0.2);
  top: -100px; left: -100px;
}
.orb-2 {
  width: 300px; height: 300px;
  background: rgba(0,206,201,0.15);
  bottom: -50px; right: -50px;
}
.bg-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.login-box {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: #161929;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px;
  padding: 40px 36px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,92,231,0.15);
}

.login-logo {
  text-align: center;
  margin-bottom: 36px;
}
.logo-img {
  width: 64px; height: 64px;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 20px rgba(108,92,231,0.6));
}
.logo-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 800;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.logo-sub {
  margin: 0;
  font-size: 13px;
  color: #8892b0;
}

.login-form { display: flex; flex-direction: column; gap: 20px; }

.form-field { display: flex; flex-direction: column; gap: 8px; }
.field-label { font-size: 13px; font-weight: 600; color: #8892b0; }

.input-wrap {
  display: flex; align-items: center;
  background: #0d0f1a;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-wrap:focus-within {
  border-color: rgba(108,92,231,0.6);
  box-shadow: 0 0 0 3px rgba(108,92,231,0.15);
}
.input-icon {
  padding: 0 12px;
  font-size: 16px;
  flex-shrink: 0;
}
.field-input {
  flex: 1;
  padding: 14px 16px 14px 0;
  background: transparent;
  border: none;
  outline: none;
  color: #e8eaf6;
  font-size: 15px;
}
.field-input::placeholder { color: rgba(136,146,176,0.5); }
.field-input:disabled { opacity: 0.5; }

.login-btn {
  margin-top: 8px;
  padding: 16px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  color: white;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 4px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 8px 24px rgba(108,92,231,0.4);
}
.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(108,92,231,0.5);
}
.login-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.loading-dots { display: flex; align-items: center; justify-content: center; gap: 4px; }
.loading-dots span {
  width: 6px; height: 6px; border-radius: 50%;
  background: white;
  animation: dot-bounce 1.2s infinite;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

@media (max-width: 480px) {
  .login-box { padding: 32px 24px; border-radius: 20px; }
}
</style>
