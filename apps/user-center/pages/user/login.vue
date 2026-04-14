<template>
  <div class="login-container">
    <UCard class="login-card">
      <template #header>
        <h2 class="text-center text-2xl font-bold text-gray-900">会员中心</h2>
      </template>

      <UForm @submit.prevent="login" :state="state" class="space-y-4">
        <UFormGroup label="用户名" name="username" required>
          <UInput
            v-model="state.username"
            placeholder="请输入用户名"
            icon="i-heroicons-user"
            size="lg"
            :disabled="loading"
          />
        </UFormGroup>

        <UFormGroup label="密码" name="password" required>
          <UInput
            v-model="state.password"
            type="password"
            placeholder="请输入密码"
            icon="i-heroicons-lock-closed"
            size="lg"
            :disabled="loading"
          />
        </UFormGroup>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading"
          :disabled="!isFormValid"
        >
          登录
        </UButton>
      </UForm>

    </UCard>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useNuxtApp } from '#app';
import { useTips } from '@/composables/useTips';

definePageMeta({
  layout: 'auth'
});

const state = reactive({
  username: '',
  password: ''
})

const error = ref('');
const loading = ref(false);

const router = useRouter(); 
const route = useRoute();

const authStore = useAuthStore();

const tips = useTips();

// 表单验证：支持密码或签名(ts+sig)
const isFormValid = computed(() => {
  const hasUsername = !!state.username?.trim();
  const hasPwd = !!state.password?.trim();
  const hasSig = typeof route.query.ts === 'string' && typeof route.query.sig === 'string';
  return hasUsername && (hasPwd || hasSig);
});

const login = async () => {
  try {
    // 防止重复提交
    if (loading.value) {
      console.log('登录进行中，忽略重复请求');
      return;
    }
    
    console.log('用户登录请求:', state);
    
    // 检查输入（允许签名免密）
    const tsParam = typeof route.query.ts === 'string' ? route.query.ts : undefined;
    const sigParam = typeof route.query.sig === 'string' ? route.query.sig : undefined;
    if (!state.username || (!state.password && !(tsParam && sigParam))) {
      const errorMsg = '缺少登录凭据（需要密码或签名）';
      tips.error(errorMsg);
      error.value = errorMsg;
      return;
    }

    loading.value = true;

    const isResult = await authStore.logInUser(state.username, state.password, tsParam, sigParam);
    console.log('✅ 用户登录结果:', isResult);
    console.log('登录后状态:', authStore.isLoggedIn);

    if (isResult) {
      console.log('✅ 用户登录成功，当前状态:', {
        isLoggedIn: authStore.isLoggedIn,
        isUser: authStore.isUser,
        userInfo: authStore.userInfo
      });
      
      tips.success('登录成功');
      
      // 给一点时间让状态完全更新
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 优先使用 URL 中的 redirect 参数
      const redirect = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/user/home';
      console.log('🚀 执行跳转到', redirect);
      await router.push(redirect);
      console.log('✅ 跳转完成');
    } else {
      const errorMsg = '登录失败，用户名或密码错误';
      console.log('❌ 用户登录失败');
      tips.error(errorMsg);
      error.value = errorMsg;
    } 
  } catch (err) {
    const errorMsg = '登录失败，无法连接到服务器';
    console.error('用户登录异常:', err);
    tips.error(errorMsg);
    error.value = errorMsg;
  } finally {
    loading.value = false;
  }
};

// 检查URL参数并自动填入登录信息
const checkUrlParams = () => {
  const urlParams = route.query;
  
  if (urlParams.username) {
    state.username = urlParams.username;
    console.log('从URL参数填入用户名:', urlParams.username);
  }
  
  if (urlParams.password) {
    state.password = urlParams.password;
    console.log('从URL参数填入密码');
  }
  
  // 如果设置了auto_login=true，自动执行登录
  if (urlParams.auto_login === 'true' && state.username && (state.password || (urlParams.ts && urlParams.sig))) {
    console.log('检测到自动登录参数，执行自动登录');
    // 显示提示（useTips 仅支持 success/error）
    tips.success('正在自动登录...');
    
    // 延迟一下让用户看到自动登录的提示
    setTimeout(() => {
      login();
    }, 1000);
  }
};

// 页面挂载时检查URL参数
onMounted(() => {
  checkUrlParams();
});
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.login-card h2) {
  margin: 0;
}

.error-message {
  color: #dc2626;
  text-align: center;
  font-size: 14px;
  padding: 16px 24px;
  margin: 0;
  border-top: 1px solid #f0f0f0;
  background: #fef2f2;
}

.login-links {
  text-align: center;
  padding: 16px 24px;
  font-size: 14px;
  color: #666;
  border-top: 1px solid #f0f0f0;
}

.login-links .link {
  color: #2563eb;
  text-decoration: none;
  transition: all 0.3s;
  font-weight: 500;
}

.login-links .link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}
</style>
