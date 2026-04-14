<template>
  <div class="promoter-info-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>代理信息</h2>
    </div>



    <!-- 代理详情信息 -->
    <UCard class="promoter-detail-card">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UAvatar 
              :alt="promoterInfo.name" 
              size="lg"
              :ui="{ background: 'bg-primary-500 dark:bg-primary-400' }"
            />
            <div>
              <h3 class="text-lg font-semibold text-gray-900">{{ promoterInfo.name || '代理' }}</h3>
              <UBadge 
                :color="getLevelBadgeColor(promoterInfo.level)" 
                :label="getLevelText(promoterInfo.level)"
                variant="soft"
              />
            </div>
          </div>
          <UButton 
            color="orange" 
            variant="outline"
            icon="i-heroicons-key"
            @click="changePassword"
          >
            修改密码
          </UButton>
        </div>
      </template>

      <div class="detail-content">
        <!-- 基本信息 -->
        <div class="section">
          <h4 class="section-title">
            <UIcon name="i-heroicons-identification" class="w-5 h-5" />
            基本信息
          </h4>
          <div class="detail-grid">
            <UFormGroup label="代理ID">
              <UInput 
                :model-value="promoterInfo.id?.toString() || '-'" 
                readonly 
                variant="outline"
                icon="i-heroicons-identification"
              />
            </UFormGroup>
            
            <UFormGroup label="代理名称">
              <UInput 
                :model-value="promoterInfo.name || '-'" 
                readonly 
                variant="outline"
                icon="i-heroicons-user"
              />
            </UFormGroup>
            
            <UFormGroup label="代理级别">
              <UInput 
                :model-value="getLevelText(promoterInfo.level)" 
                readonly 
                variant="outline"
                icon="i-heroicons-star"
              >
                <template #trailing>
                  <UBadge 
                    :color="getLevelBadgeColor(promoterInfo.level)" 
                    variant="soft"
                    :label="getLevelText(promoterInfo.level)"
                  />
                </template>
              </UInput>
            </UFormGroup>
            
            <UFormGroup label="渠道代码">
              <UInput 
                :model-value="promoterInfo.channel_code || '-'" 
                readonly 
                variant="outline"
                icon="i-heroicons-hashtag"
              />
            </UFormGroup>
          </div>
        </div>

        <!-- 联系信息 -->
        <div class="section">
          <div class="flex items-center justify-between mb-4">
            <h4 class="section-title-with-button">
              <UIcon name="i-heroicons-phone" class="w-5 h-5" />
              联系信息
            </h4>
            <UButton 
              color="purple" 
              variant="outline"
              icon="i-heroicons-pencil"
              size="sm"
              @click="editContactInfo"
            >
              修改联系信息
            </UButton>
          </div>
          <div class="detail-grid">
            <UFormGroup label="手机号码">
              <UInput 
                :model-value="promoterInfo.phone || '暂未设置'" 
                readonly 
                variant="outline"
                icon="i-heroicons-device-phone-mobile"
              >
                <template #trailing>
                  <UBadge 
                    :color="promoterInfo.phone ? 'green' : 'gray'" 
                    variant="soft"
                    :label="promoterInfo.phone ? '已设置' : '未设置'"
                  />
                </template>
              </UInput>
            </UFormGroup>
            
            <UFormGroup label="邮箱地址">
              <UInput 
                :model-value="promoterInfo.email || '暂未设置'" 
                readonly 
                variant="outline"
                icon="i-heroicons-envelope"
              >
                <template #trailing>
                  <UBadge 
                    :color="promoterInfo.email ? 'green' : 'gray'" 
                    variant="soft"
                    :label="promoterInfo.email ? '已设置' : '未设置'"
                  />
                </template>
              </UInput>
            </UFormGroup>
          </div>
        </div>

        <!-- 客服信息 -->
        <div class="section">
          <div class="flex items-center justify-between mb-4">
            <h4 class="section-title-with-button">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5" />
              客服信息
            </h4>
            <UButton 
              color="blue" 
              variant="outline"
              icon="i-heroicons-pencil"
              size="sm"
              @click="editServiceInfo"
            >
              修改客服
            </UButton>
          </div>
          <div class="detail-grid">
            <UFormGroup label="QQ账号">
              <UInput 
                :model-value="promoterInfo.qq_account || '暂未设置'" 
                readonly 
                variant="outline"
                icon="i-heroicons-chat-bubble-left-ellipsis"
              >
                <template #trailing>
                  <UBadge 
                    :color="promoterInfo.qq_account ? 'green' : 'gray'" 
                    variant="soft"
                    :label="promoterInfo.qq_account ? '已设置' : '未设置'"
                  />
                </template>
              </UInput>
            </UFormGroup>
            
            <UFormGroup label="Telegram账号">
              <UInput 
                :model-value="promoterInfo.tg_account || '暂未设置'" 
                readonly 
                variant="outline"
                icon="i-heroicons-paper-airplane"
              >
                <template #trailing>
                  <UBadge 
                    :color="promoterInfo.tg_account ? 'green' : 'gray'" 
                    variant="soft"
                    :label="promoterInfo.tg_account ? '已设置' : '未设置'"
                  />
                </template>
              </UInput>
            </UFormGroup>
          </div>
        </div>

        <!-- 结算信息 -->
        <div class="section">
          <h4 class="section-title">
            <UIcon name="i-heroicons-banknotes" class="w-5 h-5" />
            结算信息
          </h4>
          <div class="detail-grid">
            <UFormGroup label="结算方式">
              <UInput 
                :model-value="getSettlementTypeText(promoterInfo.settlement_type)" 
                readonly 
                variant="outline"
                icon="i-heroicons-credit-card"
              />
            </UFormGroup>
            
            <UFormGroup label="分成比例">
              <UInput 
                :model-value="`${promoterInfo.divide_rate || 0}%`" 
                readonly 
                variant="outline"
                icon="i-heroicons-percent-badge"
              >
                <template #trailing>
                  <UBadge color="blue" variant="soft">%</UBadge>
                </template>
              </UInput>
            </UFormGroup>
            
            <UFormGroup label="总结算金额">
              <UInput 
                :model-value="formatAmount(promoterInfo.settlement_amount)" 
                readonly 
                variant="outline"
                icon="i-heroicons-banknotes"
              >
                <template #trailing>
                  <UBadge color="orange" variant="soft">元</UBadge>
                </template>
              </UInput>
            </UFormGroup>
            
            <UFormGroup label="可结算金额">
              <UInput 
                :model-value="formatAmount(promoterInfo.settlement_amount_available)" 
                readonly 
                variant="outline"
                icon="i-heroicons-banknotes"
              >
                <template #trailing>
                  <UBadge color="green" variant="soft">元</UBadge>
                </template>
              </UInput>
            </UFormGroup>
          </div>
        </div>

        <!-- 权限信息 -->
        <div class="section">
          <h4 class="section-title">
            <UIcon name="i-heroicons-shield-check" class="w-5 h-5" />
            权限信息
          </h4>
          <div class="detail-grid">
            <UFormGroup label="允许渠道">
              <UTextarea 
                :model-value="getChannelCodesText(promoterInfo.allowed_channel_codes)" 
                readonly 
                variant="outline"
                :rows="2"
              />
            </UFormGroup>
            
            <UFormGroup label="允许游戏">
              <UTextarea 
                :model-value="getGameIdsText(promoterInfo.allowed_game_ids)" 
                readonly 
                variant="outline"
                :rows="2"
              />
            </UFormGroup>
          </div>
        </div>

        <!-- 时间信息 -->
        <div class="section">
          <h4 class="section-title">
            <UIcon name="i-heroicons-clock" class="w-5 h-5" />
            时间信息
          </h4>
          <div class="detail-grid">
            <UFormGroup label="创建时间">
              <UInput 
                :model-value="formatDate(promoterInfo.created_at)" 
                readonly 
                variant="outline"
                icon="i-heroicons-calendar-days"
              />
            </UFormGroup>
            
            <UFormGroup label="更新时间">
              <UInput 
                :model-value="formatDate(promoterInfo.updated_at)" 
                readonly 
                variant="outline"
                icon="i-heroicons-calendar-days"
              />
            </UFormGroup>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 修改密码模态框 -->
    <UModal v-model="showPasswordModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-key" class="w-6 h-6 text-primary-500" />
            <h3 class="text-lg font-semibold">修改密码</h3>
          </div>
        </template>

        <UForm 
          :state="passwordForm" 
          @submit="savePassword" 
          class="space-y-6"
        >
          <UFormGroup label="新密码" name="newPassword" required>
            <UInput 
              v-model="passwordForm.newPassword" 
              type="password" 
              placeholder="请输入新密码（至少6位）"
              icon="i-heroicons-lock-closed"
            />
          </UFormGroup>

          <UFormGroup label="确认密码" name="confirmPassword" required>
            <UInput 
              v-model="passwordForm.confirmPassword" 
              type="password" 
              placeholder="请再次输入新密码"
              icon="i-heroicons-lock-closed"
            />
          </UFormGroup>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <UButton 
              color="gray" 
              variant="ghost" 
              @click="showPasswordModal = false"
            >
              取消
            </UButton>
            <UButton 
              type="submit" 
              color="primary"
              :loading="passwordLoading"
              icon="i-heroicons-check"
            >
              保存密码
            </UButton>
          </div>
        </UForm>
      </UCard>
    </UModal>

    <!-- 修改客服信息模态框 -->
    <UModal v-model="showServiceModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-blue-500" />
            <h3 class="text-lg font-semibold">修改客服信息</h3>
          </div>
        </template>

        <UForm 
          :state="serviceForm" 
          @submit="saveServiceInfo" 
          class="space-y-6"
        >
          <UFormGroup label="QQ账号" help="请输入有效的QQ号码">
            <UInput 
              v-model="serviceForm.qq_account" 
              placeholder="请输入QQ账号" 
              icon="i-heroicons-chat-bubble-left-ellipsis"
              type="number"
            />
          </UFormGroup>

          <UFormGroup label="Telegram账号" help="请输入Telegram用户名或ID">
            <UInput 
              v-model="serviceForm.tg_account" 
              placeholder="请输入Telegram账号" 
              icon="i-heroicons-paper-airplane"
            />
          </UFormGroup>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <UButton 
              color="gray" 
              variant="ghost" 
              @click="showServiceModal = false"
            >
              取消
            </UButton>
            <UButton 
              type="submit" 
              color="primary"
              :loading="serviceLoading"
              icon="i-heroicons-check"
            >
              保存更改
            </UButton>
          </div>
        </UForm>
      </UCard>
    </UModal>

    <!-- 修改联系信息模态框 -->
    <UModal v-model="showContactModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-phone" class="w-6 h-6 text-purple-500" />
            <h3 class="text-lg font-semibold">修改联系信息</h3>
          </div>
        </template>

        <UForm 
          :state="contactForm" 
          @submit="saveContactInfo" 
          class="space-y-6"
        >
          <UFormGroup label="手机号码" help="请输入有效的手机号码">
            <UInput 
              v-model="contactForm.phone" 
              placeholder="请输入手机号码" 
              icon="i-heroicons-device-phone-mobile"
              type="tel"
            />
          </UFormGroup>

          <UFormGroup label="邮箱地址" help="请输入有效的邮箱地址">
            <UInput 
              v-model="contactForm.email" 
              placeholder="请输入邮箱地址" 
              icon="i-heroicons-envelope"
              type="email"
            />
          </UFormGroup>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <UButton 
              color="gray" 
              variant="ghost" 
              @click="showContactModal = false"
            >
              取消
            </UButton>
            <UButton 
              type="submit" 
              color="primary"
              :loading="contactLoading"
              icon="i-heroicons-check"
            >
              保存更改
            </UButton>
          </div>
        </UForm>
      </UCard>
    </UModal>

    <!-- 通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '~/store/auth';

// 页面元数据
definePageMeta({
  layout: 'default'
});

const authStore = useAuthStore();
const toast = useToast();

// 加载状态
const passwordLoading = ref(false);
const serviceLoading = ref(false);
const contactLoading = ref(false);

// 当前登录的代理信息
const promoterInfo = ref({
  id: 0,
  level: 0,
  name: '',
  password: '',
  channel_code: '',
  created_at: '',
  updated_at: '',
  settlement_type: 0,
  settlement_amount: 0.00,
  settlement_amount_available: 0.00,
  divide_rate: 0,
  tg_account: '',
  qq_account: '',
  email: '',
  phone: '',
  allowed_channel_codes: [],
  allowed_game_ids: []
});

// 密码表单
const showPasswordModal = ref(false);
const passwordForm = ref({
  newPassword: '',
  confirmPassword: ''
});

// 客服信息表单
const showServiceModal = ref(false);
const serviceForm = ref({
  qq_account: '',
  tg_account: ''
});

// 联系信息表单
const showContactModal = ref(false);
const contactForm = ref({
  phone: '',
  email: ''
});

// 密码验证模式 - 简化版本
const validatePassword = (form) => {
  const errors = {};
  
  if (!form.newPassword || form.newPassword.length < 6) {
    errors.newPassword = '密码至少需要6位';
  }
  
  if (!form.confirmPassword) {
    errors.confirmPassword = '请确认密码';
  } else if (form.newPassword !== form.confirmPassword) {
    errors.confirmPassword = '两次输入的密码不一致';
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

// 页面初始化
onMounted(() => {
  authStore.init();
  loadPromoterInfo();
});

// 获取等级文本
const getLevelText = (level) => {
  const levelMap = {
    0: '超级管理员',
    1: '一级代理',
    2: '二级代理',
    3: '三级代理',
    4: '四级代理'
  };
  return levelMap[level] || '未知';
};

// 移除getLevelTextColor函数，不再需要

// 获取等级徽章颜色
const getLevelBadgeColor = (level) => {
  const colorMap = {
    0: 'red',
    1: 'orange', 
    2: 'yellow',
    3: 'green',
    4: 'blue'
  };
  return colorMap[level] || 'gray';
};

// 获取结算方式文本
const getSettlementTypeText = (type) => {
  const typeMap = {
    0: '无',
    1: '支付宝',
    2: '微信',
    3: '银联'
  };
  return typeMap[type] || '无';
};

// 获取渠道代码列表文本
const getChannelCodesText = (codes) => {
  if (!codes || codes.length === 0) {
    return '全部渠道 (超级管理员权限)';
  }
  return codes.join(', ');
};

// 获取游戏ID列表文本
const getGameIdsText = (gameIds) => {
  if (!gameIds || gameIds.length === 0) {
    return '全部游戏 (超级管理员权限)';
  }
  
  const gameMap = {
    1: '海贼王',
    2: '冒险大陆', 
    3: '武侠江湖',
    4: '游戏4',
    5: '游戏5'
  };
  
  const gameNames = gameIds.map(id => gameMap[id] || `游戏${id}`);
  return gameNames.join(', ');
};

// 格式化金额
const formatAmount = (value) => {
  if (value === null || value === undefined) return '0.00';
  return typeof value === 'number' ? value.toFixed(2) : value;
};

// 格式化时间
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// 加载当前代理信息
const loadPromoterInfo = async () => {
  try {
    if (!authStore.isLoggedIn || authStore.isUser) {
      toast.add({
        title: '权限错误',
        description: '请先登录管理员账号',
        color: 'red'
      });
      return;
    }

    const currentAdminId = authStore.id;
    const currentAdminName = authStore.name;
    const adminPermissions = authStore.permissions;
    
    let adminLevel = adminPermissions?.level || 0;

    try {
      const response = await $fetch('/api/admin/get-profile', {
        method: 'POST',
        body: {
          admin_id: currentAdminId
        }
      });
      
      if (response.success && response.data) {
        promoterInfo.value = {
          id: response.data.id,
          level: response.data.level,
          name: response.data.name,
          password: '',
          channel_code: response.data.channel_code || '',
          created_at: response.data.created_at || '',
          updated_at: response.data.updated_at || '',
          settlement_type: response.data.settlement_type || 0,
          settlement_amount: response.data.settlement_amount || 0.00,
          settlement_amount_available: response.data.settlement_amount_available || 0.00,
          divide_rate: response.data.divide_rate || 0,
          tg_account: response.data.tg_account || '',
          qq_account: response.data.qq_account || '',
          email: response.data.email || '',
          phone: response.data.phone || '',
          allowed_channel_codes: response.data.allowed_channel_codes || [],
          allowed_game_ids: response.data.allowed_game_ids || []
        };
      } else {
        // 使用基本信息
        promoterInfo.value = {
          id: currentAdminId,
          level: adminLevel,
          name: currentAdminName,
          password: '',
          channel_code: adminPermissions?.channel_code || '',
          created_at: '',
          updated_at: '',
          settlement_type: adminPermissions?.settlement_type || 0,
          settlement_amount: adminPermissions?.settlement_amount || 0.00,
          settlement_amount_available: adminPermissions?.settlement_amount_available || 0.00,
          divide_rate: adminPermissions?.divide_rate || 0,
          tg_account: adminPermissions?.tg_account || '',
          qq_account: adminPermissions?.qq_account || '',
          email: adminPermissions?.email || '',
          phone: adminPermissions?.phone || '',
          allowed_channel_codes: adminPermissions?.allowed_channel_codes || [],
          allowed_game_ids: adminPermissions?.allowed_game_ids || []
        };
      }
    } catch (apiError) {
      toast.add({
        title: '加载信息',
        description: '使用缓存信息，部分数据可能不是最新的',
        color: 'yellow'
      });
      
      promoterInfo.value = {
        id: currentAdminId,
        level: adminLevel,
        name: currentAdminName,
        password: '',
        channel_code: adminPermissions?.channel_code || '',
        created_at: '',
        updated_at: '',
        settlement_type: adminPermissions?.settlement_type || 0,
        settlement_amount: adminPermissions?.settlement_amount || 0.00,
        settlement_amount_available: adminPermissions?.settlement_amount_available || 0.00,
        divide_rate: adminPermissions?.divide_rate || 0,
        tg_account: adminPermissions?.tg_account || '',
        qq_account: adminPermissions?.qq_account || '',
        email: adminPermissions?.email || '',
        phone: adminPermissions?.phone || '',
        allowed_channel_codes: adminPermissions?.allowed_channel_codes || [],
        allowed_game_ids: adminPermissions?.allowed_game_ids || []
      };
    }
  } catch (error) {
    console.error('加载代理信息失败:', error);
    toast.add({
      title: '加载失败',
      description: '无法获取代理信息',
      color: 'red'
    });
  }
};

// 修改密码
const changePassword = () => {
  passwordForm.value = {
    newPassword: '',
    confirmPassword: ''
  };
  showPasswordModal.value = true;
};

// 修改客服信息
const editServiceInfo = () => {
  serviceForm.value = {
    qq_account: promoterInfo.value.qq_account || '',
    tg_account: promoterInfo.value.tg_account || ''
  };
  showServiceModal.value = true;
};

// 修改联系信息
const editContactInfo = () => {
  contactForm.value = {
    phone: promoterInfo.value.phone || '',
    email: promoterInfo.value.email || ''
  };
  showContactModal.value = true;
};

// 保存密码
const savePassword = async (event) => {
  try {
    // 阻止默认表单提交
    if (event) {
      event.preventDefault();
    }
    
    // 验证表单
    const validation = validatePassword(passwordForm.value);
    if (!validation.valid) {
      // 显示第一个错误
      const firstError = Object.values(validation.errors)[0];
      toast.add({
        title: '表单验证失败',
        description: firstError,
        color: 'red'
      });
      return;
    }
    
    passwordLoading.value = true;
    
    const response = await $fetch('/api/admin/change-password', {
      method: 'POST',
      body: {
        admin_id: promoterInfo.value.id,
        new_password: passwordForm.value.newPassword
      }
    });
    
    showPasswordModal.value = false;
    passwordForm.value = {
      newPassword: '',
      confirmPassword: ''
    };
    
    if (response.success) {
      toast.add({
        title: '密码修改成功',
        description: '您的密码已成功更新',
        color: 'green'
      });
    } else {
      throw new Error(response.message || '修改失败');
    }
  } catch (error) {
    toast.add({
      title: '密码修改失败',
      description: error.message || '网络错误，请重试',
      color: 'red'
    });
  } finally {
    passwordLoading.value = false;
  }
};

// 保存客服信息
const saveServiceInfo = async (event) => {
  try {
    // 阻止默认表单提交
    if (event) {
      event.preventDefault();
    }
    
    serviceLoading.value = true;
    
    const response = await $fetch('/api/admin/update-profile', {
      method: 'POST',
      body: {
        admin_id: promoterInfo.value.id,
        qq_account: serviceForm.value.qq_account,
        tg_account: serviceForm.value.tg_account
      }
    });
    
    if (response.success) {
      // 更新本地数据
      promoterInfo.value.qq_account = serviceForm.value.qq_account;
      promoterInfo.value.tg_account = serviceForm.value.tg_account;
      
      showServiceModal.value = false;
      
      toast.add({
        title: '保存成功',
        description: '客服信息更新成功！',
        color: 'green'
      });
    } else {
      toast.add({
        title: '保存失败',
        description: response.message || '更新失败',
        color: 'red'
      });
    }
  } catch (error) {
    console.error('保存客服信息失败:', error);
    toast.add({
      title: '保存失败',
      description: error?.data?.message || error?.message || '网络错误',
      color: 'red'
    });
  } finally {
    serviceLoading.value = false;
  }
};

// 保存联系信息
const saveContactInfo = async (event) => {
  try {
    // 阻止默认表单提交
    if (event) {
      event.preventDefault();
    }
    
    contactLoading.value = true;
    
    const response = await $fetch('/api/admin/update-profile', {
      method: 'POST',
      body: {
        admin_id: promoterInfo.value.id,
        phone: contactForm.value.phone,
        email: contactForm.value.email
      }
    });
    
    if (response.success) {
      // 更新本地数据
      promoterInfo.value.phone = contactForm.value.phone;
      promoterInfo.value.email = contactForm.value.email;
      
      showContactModal.value = false;
      
      toast.add({
        title: '保存成功',
        description: '联系信息更新成功！',
        color: 'green'
      });
    } else {
      toast.add({
        title: '保存失败',
        description: response.message || '更新失败',
        color: 'red'
      });
    }
  } catch (error) {
    console.error('保存联系信息失败:', error);
    toast.add({
      title: '保存失败',
      description: error?.data?.message || error?.message || '网络错误',
      color: 'red'
    });
  } finally {
    contactLoading.value = false;
  }
};
</script>

<style scoped>
.promoter-info-page {
  width: 100%;
  max-width: 100%;
  margin: 0;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.detail-content {
  @apply space-y-6;
}

.section {
  @apply space-y-4 p-6 bg-gray-50/50 rounded-lg;
}

.section-title {
  @apply flex items-center gap-2 text-lg font-semibold text-gray-700 pb-3 mb-4 border-b border-gray-200;
}

.section-title-with-button {
  @apply flex items-center gap-2 text-lg font-semibold text-gray-700;
}

.detail-grid {
  @apply grid grid-cols-1 md:grid-cols-2 gap-4;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .detail-grid {
    @apply grid-cols-1;
  }
}
</style> 