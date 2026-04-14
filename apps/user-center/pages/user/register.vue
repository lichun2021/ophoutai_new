<template>
  <div class="register-container">
    <UCard class="register-card">
      <template #header>
        <h2 class="text-center text-2xl font-bold text-gray-900">用户注册</h2>
      </template>

      <!-- 代理账号状态提示 -->
      <div v-if="channelValidating" class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div class="flex items-center gap-2 text-blue-600">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
          <span>正在验证注册链接...</span>
        </div>
      </div>
      
      <div v-if="!channelValid && !channelValidating" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
        <div class="flex items-center gap-2 text-red-600">
          <UIcon name="i-heroicons-exclamation-triangle" />
          <span>{{ channelError || '该注册链接无效或代理账号已被禁用' }}</span>
        </div>
      </div>

      <UForm :state="formState" @submit="handleRegister" class="space-y-4">
        <UFormGroup label="用户名" name="username" required>
          <UInput
            v-model="formState.username"
            placeholder="请输入用户名"
            icon="i-heroicons-user"
            size="lg"
            :disabled="loading || !channelValid"
          />
        </UFormGroup>

        <UFormGroup label="密码" name="password" required>
          <UInput
            v-model="formState.password"
            type="password"
            placeholder="请输入密码"
            icon="i-heroicons-lock-closed"
            size="lg"
            :disabled="loading || !channelValid"
          />
        </UFormGroup>

        <UFormGroup label="确认密码" name="confirmPassword" required>
          <UInput
            v-model="formState.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            icon="i-heroicons-lock-closed"
            size="lg"
            :disabled="loading || !channelValid"
          />
        </UFormGroup>

        <UButton
          type="submit"
          block
          size="lg"
          :loading="loading || channelValidating"
          :disabled="!isFormValid"
        >
          注册
        </UButton>
      </UForm>


    </UCard>

    <!-- 成功/失败提示模态框 -->
    <UModal v-model="showModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6" :class="modalSuccess ? 'text-green-600' : 'text-red-600'">
              {{ modalSuccess ? '注册成功' : '注册失败' }}
            </h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="showModal = false" />
          </div>
        </template>

        <div class="text-center py-4">
          <div class="mb-4">
            <svg v-if="modalSuccess" class="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-gray-600">{{ modalMessage }}</p>
        </div>

        <template #footer>
          <div class="flex justify-center">
            <UButton 
              :color="modalSuccess ? 'primary' : 'gray'"
              @click="handleModalClose"
            >
              {{ modalSuccess ? '去登录' : '知道了' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// 定义页面元数据，使用独立的布局
definePageMeta({
  layout: 'auth'
});

const route = useRoute();
const router = useRouter();

// 表单状态
const formState = reactive({
  username: '',
  password: '',
  confirmPassword: ''
});

// URL参数
const urlParams = reactive({
  channel_code: '',
  game_code: '',
  thirdparty_uid: '',
  extra_params: {} as Record<string, any>
});

// 状态管理
const loading = ref(false);
const showModal = ref(false);
const modalSuccess = ref(false);
const modalMessage = ref('');
const channelValid = ref(true);
const channelValidating = ref(false);
const channelError = ref('');

// 表单验证
const isFormValid = computed(() => {
  return channelValid.value &&
         formState.username.trim() !== '' &&
         formState.password.trim() !== '' &&
         formState.confirmPassword.trim() !== '' &&
         formState.password === formState.confirmPassword;
});

// 验证代理账号状态
const validateChannel = async (channelCode: string) => {
  if (!channelCode) {
    channelValid.value = false;
    channelError.value = '缺少渠道代码参数';
    return;
  }
  
  channelValidating.value = true;
  channelError.value = '';
  
  try {
    const response = await fetch(`/api/user/check-channel?channel_code=${encodeURIComponent(channelCode)}`);
    const result = await response.json();
    
    if (result.valid && result.is_active) {
      channelValid.value = true;
      channelError.value = '';
    } else {
      channelValid.value = false;
      channelError.value = result.message || '该代理账号已被禁用，无法注册';
    }
  } catch (error) {
    console.error('验证代理账号状态失败:', error);
    // 如果验证失败，仍然允许提交，让后端进行最终验证
    channelValid.value = true;
    channelError.value = '';
  } finally {
    channelValidating.value = false;
  }
};

// 获取URL参数
onMounted(async () => {
  // 强制清除可能存在的登录状态，防止被重定向
  if (process.client) {
    localStorage.removeItem('authStore');
    sessionStorage.removeItem('authStore');
  }
  
  // 获取所有查询参数
  const query = route.query;
  
  // 获取特定参数
  urlParams.channel_code = (query.c as string) || '';
  urlParams.game_code = (query.g as string) || '';
  urlParams.thirdparty_uid = (query.thirdparty_uid as string) || '';
  
  // 存储其他参数
  Object.keys(query).forEach(key => {
    if (key !== 'c' && key !== 'g' && key !== 'thirdparty_uid') {
      urlParams.extra_params[key] = query[key];
    }
  });
  
  console.log('URL参数:', urlParams);
  
  // 验证代理账号状态
  if (urlParams.channel_code) {
    await validateChannel(urlParams.channel_code);
  } else {
    channelValid.value = false;
    channelError.value = '缺少渠道代码参数';
  }
});

// 处理注册
const handleRegister = async () => {
  if (!isFormValid.value) {
    showError('请正确填写所有字段');
    return;
  }
  
  loading.value = true;
  
  try {
    // 验证必需参数
    if (!urlParams.channel_code) {
      showError('缺少必需参数，请检查注册链接');
      return;
    }
    
    if (!urlParams.game_code) {
      showError('缺少必需参数，请检查注册链接');
      return;
    }
    
    // 准备注册数据
    const registerData = {
      username: formState.username.trim(),
      password: formState.password,
      channel_code: urlParams.channel_code,
      game_code: urlParams.game_code,
      thirdparty_uid: urlParams.thirdparty_uid || `user_${Date.now()}`,
      iphone: '', // 可以从URL参数中获取
      uid: '', // 由后端生成
      ...urlParams.extra_params // 包含其他参数
    };
    
    console.log('注册数据:', registerData);
    
    // 调用注册API
    const response = await fetch('/api/user/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(registerData)
    });
    
    const result = await response.json();
    console.log('注册结果:', result);
    
    if (response.ok && result.status === 'success') {
      showSuccess('注册成功！即将跳转到登录页面...');
    } else {
      // 处理服务器返回的错误信息
      if (!response.ok) {
        // HTTP错误状态码，显示服务器返回的错误信息
        showError(result.message || '注册失败，请检查参数是否正确');
      } else if (result.message && result.message.includes('Duplicate')) {
        // 数据库重复键错误
        if (result.message.includes('username')) {
          showError('用户名已存在，请更换用户名');
        } else if (result.message.includes('thirdparty_uid')) {
          showError('该第三方账号已注册');
        } else {
          showError('该账号已存在');
        }
      } else {
        showError(result.message || '注册失败，请稍后重试');
      }
    }
  } catch (error) {
    console.error('注册错误:', error);
    showError('网络错误，请检查网络连接');
  } finally {
    loading.value = false;
  }
};

// 显示成功消息
const showSuccess = (message: string) => {
  modalSuccess.value = true;
  modalMessage.value = message;
  showModal.value = true;
};

// 显示错误消息
const showError = (message: string) => {
  modalSuccess.value = false;
  modalMessage.value = message;
  showModal.value = true;
};

// 处理模态框关闭
const handleModalClose = () => {
  showModal.value = false;
  if (modalSuccess.value) {
    // 注册成功后跳转到登录页
    router.push('/user/login');
  }
};
</script>

<style scoped>
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
  padding: 20px;
}

.register-card {
  width: 100%;
  max-width: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.register-card h2) {
  margin: 0;
}
</style> 