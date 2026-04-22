<template>
  <div class="register-page">
    <!-- 背景装饰 -->
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>


    <div class="register-box">
      <!-- Logo -->
      <div class="register-logo">
        <!-- logo removed -->

        <h1 class="logo-title">用户注册</h1>
        <p class="logo-sub">创建您的账户</p>
      </div>

      <!-- 代理验证状态 -->
      <div v-if="channelValidating" class="status-bar status-loading">
        <span class="status-icon">⏳</span>
        <span>正在验证注册链接...</span>
      </div>

      <div v-if="!channelValid && !channelValidating" class="status-bar status-error">
        <span class="status-icon">⚠️</span>
        <span>{{ channelError || '该注册链接无效或代理账号已被禁用' }}</span>
      </div>

      <!-- 注册表单 -->
      <form class="register-form" @submit.prevent="handleRegister">
        <div class="form-field">
          <label class="field-label">用户名</label>
          <div class="input-wrap">
            <span class="input-icon">👤</span>
            <input
              v-model="formState.username"
              class="field-input"
              placeholder="请输入用户名"
              :disabled="loading || !channelValid"
              autocomplete="username"
            />
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">密码</label>
          <div class="input-wrap">
            <span class="input-icon">🔒</span>
            <input
              v-model="formState.password"
              type="password"
              class="field-input"
              placeholder="请输入密码"
              :disabled="loading || !channelValid"
              autocomplete="new-password"
            />
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">确认密码</label>
          <div class="input-wrap">
            <span class="input-icon">🔒</span>
            <input
              v-model="formState.confirmPassword"
              type="password"
              class="field-input"
              placeholder="请再次输入密码"
              :disabled="loading || !channelValid"
              autocomplete="new-password"
            />
          </div>
        </div>

        <button type="submit" class="register-btn" :disabled="!isFormValid || loading || channelValidating">
          <span v-if="!loading">注 册</span>
          <span v-else class="loading-dots">
            <span></span><span></span><span></span>
          </span>
        </button>
      </form>
    </div>

    <!-- 成功/失败模态框 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-box">
        <div class="modal-icon-wrap" :class="modalSuccess ? 'modal-success' : 'modal-fail'">
          <span v-if="modalSuccess">✅</span>
          <span v-else>❌</span>
        </div>
        <h3 class="modal-title" :class="modalSuccess ? 'text-success' : 'text-danger'">
          {{ modalSuccess ? '注册成功' : '注册失败' }}
        </h3>
        <p class="modal-message">{{ modalMessage }}</p>
        <button class="modal-btn" :class="modalSuccess ? 'btn-success' : 'btn-gray'" @click="handleModalClose">
          {{ modalSuccess ? '去登录' : '知道了' }}
        </button>
      </div>
    </div>
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
.register-page { min-height: 100vh; background: #fff4f3 !important; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow: hidden; font-family: var(--font-family); }
.bg-orb { position: absolute; border-radius: 50%; filter: blur(100px); pointer-events: none; }
.orb-1 { width: 420px; height: 420px; background: rgba(168,50,6,0.1); top: -120px; left: -120px; }
.orb-2 { width: 340px; height: 340px; background: rgba(127,230,219,0.12); bottom: -80px; right: -80px; }
.register-box { position: relative; width: 100%; max-width: 420px; background: var(--surface-container-low); border-radius: var(--radius-lg); padding: 40px 36px; box-shadow: 0 40px 60px -5px var(--shadow-ambient); }
.register-logo { text-align: center; margin-bottom: 28px; }
.logo-img { width: 56px; height: 56px; margin-bottom: 10px; filter: drop-shadow(0 4px 12px rgba(168,50,6,0.25)); }
.logo-title { margin: 0 0 6px; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: var(--primary); }
.logo-sub { margin: 0; font-size: 13px; color: var(--on-surface-variant); }
.status-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 20px; }
.status-loading { background: var(--surface-container); color: var(--primary); }
.status-error { background: var(--error-container); color: var(--error); }
.status-icon { font-size: 15px; }
.register-form { display: flex; flex-direction: column; gap: 18px; }
.form-field { display: flex; flex-direction: column; gap: 7px; }
.field-label { font-size: 13px; font-weight: 600; color: var(--on-surface-variant); }
.input-wrap { display: flex; align-items: center; background: var(--surface-container); border-radius: var(--radius-sm); overflow: hidden; transition: box-shadow var(--transition); border-bottom: 3px solid transparent; }
.input-wrap:focus-within { border-bottom-color: var(--secondary); box-shadow: 0 2px 12px rgba(127,230,219,0.15); }
.input-icon { padding: 0 12px; font-size: 16px; flex-shrink: 0; }
.field-input { flex: 1; padding: 13px 16px 13px 0; background: transparent; border: none; outline: none; color: var(--on-surface); font-size: 15px; font-family: var(--font-family); }
.field-input::placeholder { color: var(--on-surface-variant); opacity: 0.5; }
.field-input:disabled { opacity: 0.4; }
.register-btn { margin-top: 6px; padding: 15px; border-radius: var(--radius-xl); border: none; background: linear-gradient(135deg, var(--primary), var(--primary-container)); color: var(--on-primary); font-size: 16px; font-weight: 700; letter-spacing: 4px; cursor: pointer; transition: all var(--transition); box-shadow: 0 8px 24px rgba(168,50,6,0.3); font-family: var(--font-family); }
.register-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(168,50,6,0.4); }
.register-btn:active:not(:disabled) { transform: translateY(0); box-shadow: inset 0 2px 6px rgba(0,0,0,0.15); }
.register-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.loading-dots { display: flex; align-items: center; justify-content: center; gap: 4px; }
.loading-dots span { width: 6px; height: 6px; border-radius: 50%; background: white; animation: dot-bounce 1.2s infinite; }
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
.modal-overlay { position: fixed; inset: 0; background: rgba(78,33,32,0.3); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
.modal-box { background: var(--surface-container-low); border-radius: var(--radius-lg); padding: 32px; max-width: 360px; width: 100%; text-align: center; box-shadow: 0 40px 60px -5px var(--shadow-ambient); }
.modal-icon-wrap { font-size: 40px; margin-bottom: 16px; }
.modal-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
.text-success { color: var(--secondary-dim); }
.text-danger { color: var(--error); }
.modal-message { font-size: 14px; color: var(--on-surface-variant); margin: 0 0 24px; line-height: 1.5; }
.modal-btn { padding: 12px 32px; border-radius: var(--radius-xl); border: none; font-size: 14px; font-weight: 600; cursor: pointer; transition: all var(--transition); font-family: var(--font-family); }
.btn-success { background: linear-gradient(135deg, var(--secondary), var(--secondary-fixed)); color: var(--on-secondary); }
.btn-success:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(127,230,219,0.3); }
.btn-gray { background: var(--surface-container); color: var(--on-surface); }
.btn-gray:hover { background: var(--surface-container-highest); }
@media (max-width: 480px) { .register-box { padding: 32px 24px; border-radius: 20px; } }
</style>
