<template>
  <div class="profile-container">
    <!-- 个人信息卡片 -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-gray-900">个人中心</h2>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- 用户基本信息 -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">基本信息</h3>
          
          <div class="space-y-3">
            <div class="flex items-center">
              <UIcon name="i-heroicons-user" class="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <span class="text-sm text-gray-500">用户名：</span>
                <span class="font-medium">{{ authStore.userInfo?.username || authStore.name || '未设置' }}</span>
              </div>
            </div>
            
            <div class="flex items-center">
              <UIcon name="i-heroicons-hashtag" class="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <span class="text-sm text-gray-500">用户ID：</span>
                <span class="font-medium">{{ authStore.userInfo?.id || authStore.id }}</span>
              </div>
            </div>
            
            <div class="flex items-center">
              <UIcon name="i-heroicons-phone" class="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <span class="text-sm text-gray-500">手机号：</span>
                <span class="font-medium">{{ authStore.userInfo?.iphone || '未绑定' }}</span>
              </div>
            </div>
            
            <div class="flex items-center">
              <UIcon name="i-heroicons-identification" class="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <span class="text-sm text-gray-500">UID：</span>
                <span class="font-medium">{{ authStore.userInfo?.uid || '未设置' }}</span>
              </div>
            </div>
            
            <div class="flex items-center">
              <UIcon name="i-heroicons-tag" class="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <span class="text-sm text-gray-500">渠道：</span>
                <UBadge color="primary" variant="subtle">{{ authStore.userInfo?.channel_code || '默认' }}</UBadge>
              </div>
            </div>
          </div>
        </div>

        <!-- 账户统计 -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">账户统计</h3>
          
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-blue-50 p-4 rounded-lg">
              <div class="flex items-center">
                <UIcon name="i-heroicons-currency-dollar" class="w-8 h-8 text-blue-500 mr-3" />
                <div>
                  <p class="text-sm text-gray-600">平台币余额</p>
                  <p class="text-lg font-bold text-blue-600">{{ formatBalance(authStore.userInfo?.platform_coins) }}</p>
                </div>
              </div>
            </div>
            
            <div class="bg-green-50 p-4 rounded-lg">
              <div class="flex items-center">
                <UIcon name="i-heroicons-arrow-trending-up" class="w-8 h-8 text-green-500 mr-3" />
                <div>
                  <p class="text-sm text-gray-600">总充值</p>
                  <p class="text-lg font-bold text-green-600">{{ formatBalance(userStats?.total_recharge || 0) }}</p>
                </div>
              </div>
            </div>
            
            <div class="bg-purple-50 p-4 rounded-lg">
              <div class="flex items-center">
                <UIcon name="i-heroicons-gift" class="w-8 h-8 text-purple-500 mr-3" />
                <div>
                  <p class="text-sm text-gray-600">购买次数</p>
                  <p class="text-lg font-bold text-purple-600">{{ userStats?.total_purchases || 0 }}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </UCard>

    <!-- 快捷操作 -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold text-gray-800">快捷操作</h3>
      </template>
      
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <UButton
          color="primary"
          variant="outline"
          block
          @click="goToRecharge"
          icon="i-heroicons-credit-card"
        >
          充值平台币
        </UButton>
        
        <UButton
          color="green"
          variant="outline"
          block
          @click="goToGiftShop"
          icon="i-heroicons-gift"
        >
          礼包商店
        </UButton>
        
        <UButton
          color="blue"
          variant="outline"
          block
          @click="viewOrders"
          icon="i-heroicons-document-text"
        >
          我的订单
        </UButton>
      </div>
    </UCard>

    <!-- 功能未开发提示组件 -->
    <FeatureNotReady v-model="showFeatureNotReady" :message="featureMessage" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';
import FeatureNotReady from '@/components/FeatureNotReady.vue';

// 定义页面元数据
definePageMeta({
  middleware: 'auth',
  layout: 'user'
});

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

const userStats = ref<{
  total_recharge?: number;
  total_purchases?: number;
}>({});
const loading = ref(false);
const showFeatureNotReady = ref(false);
const featureMessage = ref('');

// 获取用户统计信息
const fetchUserStats = async () => {
  loading.value = true;
  try {
    const userId = authStore.userInfo?.id || authStore.id;
    if (!userId) {
      tips.error('用户信息获取失败');
      return;
    }

    // 获取用户统计数据
    const response = await fetch(`/api/client/user/stats/${userId}`, {
      headers: {
        'Authorization': userId.toString()
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.code === 200 && result.data) {
        userStats.value = {
          total_recharge: result.data.total_recharge || 0,
          total_purchases: result.data.total_purchases || 0
        };
      }
    }
  } catch (error) {
    console.error('获取用户统计信息出错:', error);
    // 不显示错误，使用默认值
  } finally {
    loading.value = false;
  }
};

// 格式化余额显示
const formatBalance = (amount: number | string | undefined) => {
  if (!amount) return '0.00';
  return `¥${Number(amount).toFixed(2)}`;
};

// 快捷操作函数
const goToRecharge = () => {
  router.push('/user/cashier');
};

const goToGiftShop = () => {
  featureMessage.value = '礼包商店功能正在开发中，敬请期待！';
  showFeatureNotReady.value = true;
};

const viewOrders = () => {
  featureMessage.value = '订单查看功能正在开发中，敬请期待！';
  showFeatureNotReady.value = true;
};

// 页面加载时获取用户信息
onMounted(() => {
  authStore.init();
  fetchUserStats();
});
</script>

<style scoped>
.profile-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

/* 自定义样式 */
.space-y-3 > * + * {
  margin-top: 0.75rem;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .profile-container {
    padding: 16px;
  }
  
  .grid-cols-2 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
  
  .md\:grid-cols-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .grid-cols-2,
  .md\:grid-cols-3 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}
</style> 