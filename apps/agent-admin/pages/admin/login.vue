<template>
  <div class="login-container">
    <UCard class="login-card">
      <template #header>
        <h2>代理登录V2</h2>
      </template>

      <UForm @submit.prevent="login" :state="state" class="login-form">
        <UInput
          v-model="state.username"
          type="text"
          placeholder="管理员用户名"
          required
          class="login-input"
          :disabled="show2FA"
        />
        <UInput
          v-model="state.password"
          type="password"
          placeholder="密码"
          required
          class="login-input"
        />
        
        <div class="2fa-section">
          <p class="text-sm text-blue-600 mb-2 font-semibold">Google 身份验证器验证码</p>
          <UInput
            v-model="state.google_code"
            type="text"
            placeholder="6位动态验证码"
            required
            class="login-input"
            maxlength="6"
            autocomplete="off"
          />
        </div>

        <UButton type="submit" primary class="login-button" :loading="loading">
          立即登录
        </UButton>
      </UForm>

      <template #footer>
        <p v-if="error" class="error-message">{{ error }}</p>
      </template>
    </UCard>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useNuxtApp } from '#app';
import { useTips } from '@/composables/useTips';

definePageMeta({
  layout: 'auth'
});

const state = reactive({
  username: undefined,
  password: undefined,
  google_code: undefined
})

const error = ref('');
const show2FA = ref(false);
const loading = ref(false);

const router = useRouter(); 

const authStore = useAuthStore();

const tips = useTips();

const login = async () => {
  try {
    error.value = '';
    
    // 检查输入
    if (!state.username || !state.password || !state.google_code) {
      const errorMsg = '请输入用户名、密码和 Google 验证码';
      tips.error(errorMsg);
      error.value = errorMsg;
      return;
    }

    loading.value = true;
    let result = await authStore.logInAdmin(state.username, state.password, state.google_code);
    
    // 处理错误返回
    if (result && typeof result === 'object' && result.error) {
      tips.error(result.error);
      error.value = result.error;
      loading.value = false;
      return;
    }

    if (result === true) {
      tips.success('登录成功');
      
      authStore.init();
      await nextTick();
      
      setTimeout(async () => {
        await router.push('/home');
      }, 800);
    } else {
      const errorMsg = '登录失败，请检查账号信息或验证码';
      tips.error(errorMsg);
      error.value = errorMsg;
    } 
  } catch (err) {
    const errorMsg = '登录失败，系统异常';
    console.error('代理登录异常:', err);
    tips.error(errorMsg);
    error.value = errorMsg;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 16px;
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

@media (max-width: 640px) {
  .login-container {
    padding: 12px;
  }
  
  .login-card {
    max-width: 100%;
    margin: 0;
    border-radius: 8px;
  }
}

.login-card :deep(h2) {
  color: rgba(0, 0, 0, 0.85);
  font-size: 24px;
  font-weight: 500;
  text-align: center;
  margin: 0;
  padding: 24px;
  border-bottom: 1px solid #f0f0f0;
}

@media (max-width: 640px) {
  .login-card :deep(h2) {
    font-size: 20px;
    padding: 16px;
  }
}

.login-form {
  padding: 24px;
}

@media (max-width: 640px) {
  .login-form {
    padding: 16px;
  }
}

.login-input {
  margin-bottom: 24px;
}

.login-input :deep(input) {
  width: 100%;
  height: 40px;
  padding: 4px 11px;
  font-size: 14px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.85);
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  transition: all 0.3s;
}

.login-input :deep(input:hover) {
  border-color: #40a9ff;
}

.login-input :deep(input:focus) {
  border-color: #40a9ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.login-button {
  width: 100%;
  height: 40px;
  font-size: 16px;
  background: #1890ff;
  border: 1px solid #1890ff;
  color: white;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.login-button:hover {
  background: #40a9ff;
  border-color: #40a9ff;
}

.error-message {
  color: #ff4d4f;
  text-align: center;
  font-size: 14px;
  padding: 16px 24px;
  margin: 0;
  border-top: 1px solid #f0f0f0;
}

@media (max-width: 640px) {
  .error-message {
    padding: 12px 16px;
    font-size: 13px;
  }
}
</style> 