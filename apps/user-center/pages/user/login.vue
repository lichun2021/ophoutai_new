<template>
  <div class="login-page">
    <!-- 装饰性色球 -->
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>

    <div class="login-box">
      <!-- Logo -->
      <div class="login-logo">
        <img src="/logo-warm.svg" alt="logo" class="logo-img" />
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
  background: #fff4f3 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
  font-family: 'Plus Jakarta Sans', 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif;
}

/* 装饰色球 — 暖色调 */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
}
.orb-1 {
  width: 420px; height: 420px;
  background: rgba(168,50,6,0.1);
  top: -120px; left: -120px;
}
.orb-2 {
  width: 340px; height: 340px;
  background: rgba(127,230,219,0.12);
  bottom: -80px; right: -80px;
}

/* 登录卡片 — No-Line Rule, tonal layering */
.login-box {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: var(--surface-container-low);
  border-radius: var(--radius-lg);
  padding: 40px 36px;
  box-shadow: 0 40px 60px -5px var(--shadow-ambient);
}

.login-logo {
  text-align: center;
  margin-bottom: 36px;
}
.logo-img {
  width: 64px; height: 64px;
  margin-bottom: 12px;
  filter: drop-shadow(0 4px 12px rgba(168,50,6,0.25));
}
.logo-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--primary);
}
.logo-sub {
  margin: 0;
  font-size: 13px;
  color: var(--on-surface-variant);
}

.login-form { display: flex; flex-direction: column; gap: 20px; }

.form-field { display: flex; flex-direction: column; gap: 8px; }
.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--on-surface-variant);
}

/* 输入框 — Filled style + 3px teal bottom accent */
.input-wrap {
  display: flex; align-items: center;
  background: var(--surface-container);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: box-shadow var(--transition);
  border-bottom: 3px solid transparent;
}
.input-wrap:focus-within {
  border-bottom-color: var(--secondary);
  box-shadow: 0 2px 12px rgba(127,230,219,0.15);
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
  color: var(--on-surface);
  font-size: 15px;
  font-family: var(--font-family);
}
.field-input::placeholder { color: var(--on-surface-variant); opacity: 0.5; }
.field-input:disabled { opacity: 0.5; }

/* 登录按钮 — Signature gradient CTA, pill shape */
.login-btn {
  margin-top: 8px;
  padding: 16px;
  border-radius: var(--radius-xl);
  border: none;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  color: var(--on-primary);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 4px;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 8px 24px rgba(168,50,6,0.3);
  font-family: var(--font-family);
}
.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(168,50,6,0.4);
}
.login-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.15);
}
.login-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* Loading dots */
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
