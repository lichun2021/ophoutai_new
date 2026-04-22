<template>
  <div class="cashier-container">
      <!-- 当前余额显示 -->
      <div class="balance-display">
        <div class="balance-info">
          <span class="balance-label">当前平台币余额</span>
          <div class="balance-amount">
            <img src="/logo-warm.svg" alt="平台币" class="coin-icon" />
            <span class="amount">{{ formatBalance(currentBalance) }}</span>
          </div>
        </div>
      </div>

      <!-- 充值金额选择 -->
      <div class="amount-section">
        <h3>选择充值金额</h3>
        
        <!-- 预设金额选择 -->
        <div class="preset-amounts">
          <div 
            v-for="preset in presetAmounts" 
            :key="preset.value"
            class="preset-item"
            :class="{ 'active': selectedAmount === preset.value }"
            @click="selectPresetAmount(preset.value)"
          >
            <div class="preset-amount">¥{{ preset.value }}</div>
            <div class="preset-coins">
              <img src="/logo-warm.svg" alt="平台币" class="preset-coin-icon" />
              {{ Math.floor(preset.value * ptbRate) }}
            </div>
            <div v-if="preset.bonus" class="preset-bonus">{{ preset.bonus }}</div>
          </div>
        </div>

        <!-- 自定义金额输入 -->
        <div class="custom-amount">
          <h4>或输入其他金额</h4>
          <div class="amount-input-group">
            <UInput
              v-model="customAmount"
              type="number"
              placeholder="请输入充值金额"
              icon="i-heroicons-currency-yen"
              size="lg"
              :min="minAmount"
              :max="maxAmount"
              @input="onCustomAmountChange"
            >
              <template #trailing>
                <span class="text-gray-400">元</span>
              </template>
            </UInput>
          </div>
          <div class="amount-tips">
            <p class="tip-text">最低充值¥{{ minAmount }}，最高充值¥{{ maxAmount }}</p>
          </div>
        </div>

        <!-- 兑换预览 -->
        <div v-if="finalAmount > 0" class="exchange-preview">
          <div class="exchange-item">
            <span class="label">充值金额：</span>
            <span class="value">¥{{ finalAmount }}</span>
          </div>
          <div class="exchange-item">
            <span class="label">兑换比例：</span>
            <span class="value">1:{{ ptbRate }}</span>
          </div>
          <div class="exchange-item highlight">
            <span class="label">可获得平台币：</span>
            <span class="value">
              <img src="/logo-warm.svg" alt="平台币" class="preview-coin-icon" />
              {{ Math.floor(finalAmount * ptbRate) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 支付方式选择 -->
      <div class="payment-method-section">
        <h3>选择支付方式</h3>
        <div class="payment-methods">
          <div 
            v-for="method in paymentMethods" 
            :key="method.id"
            class="payment-method-item"
            :class="{ 
              'active': selectedPaymentMethod === method.id
            }"
            @click="selectPaymentMethod(method.id)"
          >
            <img :src="method.icon" :alt="method.name" class="method-icon" />
            <div class="method-info">
              <span class="method-name">{{ method.name }}</span>
            </div>
            <div class="check-icon" :class="{ 'visible': selectedPaymentMethod === method.id }">
              <UIcon name="i-heroicons-check-circle" />
            </div>
          </div>
        </div>
      </div>

      <!-- 充值按钮 -->
      <div class="action-section">
        <UButton
          @click="proceedPayment"
          :disabled="!canProceed"
          :loading="processing"
          size="xl"
          color="primary"
          block
          class="recharge-btn"
        >
          <span v-if="!processing">立即充值</span>
          <span v-else>处理中...</span>
        </UButton>
      </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';

// 页面元数据
definePageMeta({
  middleware: 'auth',
  layout: 'user'
});

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

// 响应式数据
const selectedAmount = ref(0);
const customAmount = ref('');
const selectedPaymentMethod = ref(''); // 动态选择第一个可用的支付方式
const processing = ref(false);

// 配置数据
const minAmount = 10;
const maxAmount = 10000;
const ptbRate = ref(10);

// 预设充值金额
const presetAmounts = [
  { value: 50, coins: 50, bonus: '' },
  { value: 100, coins: 100, bonus: '' },
  { value: 200, coins: 200, bonus: '推荐' },
  { value: 500, coins: 500, bonus: '' },
  { value: 1000, coins: 1000, bonus: '热门' },
  { value: 2000, coins: 2000, bonus: '' }
];

// 支付方式 - 从数据库动态获取启用的支付方式
const paymentMethods = ref([]);

// 计算属性
const currentBalance = computed(() => {
  return authStore.userInfo?.platform_coins || 0;
});

const finalAmount = computed(() => {
  if (selectedAmount.value > 0) {
    return selectedAmount.value;
  }
  const amount = parseFloat(customAmount.value);
  return isNaN(amount) ? 0 : amount;
});

const canProceed = computed(() => {
  if (!selectedPaymentMethod.value || finalAmount.value < minAmount || finalAmount.value > maxAmount) {
    return false;
  }
  
  return true;
});

// 方法
const formatBalance = (amount) => {
  if (!amount) return '0';
  return Math.floor(parseFloat(amount)).toString();
};

const selectPresetAmount = (amount) => {
  selectedAmount.value = amount;
  customAmount.value = '';
};

const onCustomAmountChange = () => {
  selectedAmount.value = 0;
  const amount = parseFloat(customAmount.value);
  if (amount < minAmount || amount > maxAmount) {
    // 可以添加验证提示
  }
};

const selectPaymentMethod = (methodId) => {
  selectedPaymentMethod.value = methodId;
};

const proceedPayment = async () => {
  if (!canProceed.value) return;

  processing.value = true;
  try {
    const userInfo = authStore.userInfo;
    if (!userInfo?.username) {
      tips.error('用户信息获取失败');
      return;
    }

    // 生成交易ID
    const transactionId = `${selectedPaymentMethod.value}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 从URL中读取兜底透传的 sub_user_id 与 wuid（余额不足后自动登录重定向会附带）
    let querySubUserId = '';
    let queryWuid = '';
    try {
      const sp = new URLSearchParams(window.location.search || '');
      querySubUserId = sp.get('sub_user_id') || '';
      queryWuid = sp.get('wuid') || '';
    } catch {}

    // 构建SDK支付请求参数
    const sdkParams = {
      z: selectedPaymentMethod.value,  // 支付方式
      f: userInfo.username,           // 用户名
      p: finalAmount.value.toString(), // 价格
      j: userInfo.game_code || 'hzwqh', // 游戏ID
      k: '平台币充值',                // 商品名称
      l: `充值${finalAmount.value}元平台币`, // 商品描述
      y: transactionId,               // 附加信息（交易ID）
      h: '1',                         // 服务器ID
      c: 'web',                       // 设备IMEI
      tr: querySubUserId || userInfo.subuser_id || '',   // 子用户ID（优先用URL参数）
      xx: transactionId,              // 订单号
      os: 'web',                       // 操作系统
      d: userInfo.game_code || 'hzwqh', // 应用ID
      e: userInfo.channel_code || '',  // 代理ID
      x: queryWuid || userInfo.thirdparty_uid || userInfo.username, // wuid（优先用URL参数）
      server_url: window.location.origin,
      // 收银台支付使用特殊的回调地址
      cashier_payment: 'true'  // 标识这是收银台支付
    };

    console.log('SDK支付请求参数:', sdkParams);

    // 用户侧收银台支付（不走 /sdkapi 签名）
    const response = await $fetch('/api/user/cashier/pay', {
      method: 'POST',
      body: sdkParams
    });

    console.log('SDK支付响应:', response);

    if (response.code === 1) {
      // 支付订单创建成功
      if (response.data) {
        // 跳转到支付页面
        window.location.href = response.data;
      } else {
        tips.success('支付订单创建成功');
        // 可以跳转到订单列表页面
        setTimeout(() => {
          router.push('/user/orders');
        }, 1500);
      }
    } else {
      // 余额不足（后端返回跳转URL）
      if (response.code === -6 && response.data) {
        window.location.href = response.data;
        return;
      }
      tips.error(response.msg || '支付失败，请重试');
    }

  } catch (error) {
    console.error('支付失败:', error);
    tips.error('支付失败，请检查网络连接后重试');
  } finally {
    processing.value = false;
  }
};

// 获取支付方式
const loadPaymentMethods = async () => {
  try {
    const response = await $fetch('/api/user/payment-settings/active');
    const activeSettings = response.data || [];
    
    // 收银台页面不显示平台币支付方式，因为用户正在购买平台币
    const filteredSettings = activeSettings.filter(setting => setting.payment_method !== 'ptb');
    
    paymentMethods.value = filteredSettings.map(setting => ({
      id: setting.payment_method,
      name: getPaymentMethodName(setting.payment_method),
      icon: setting.icon_url || getDefaultIcon(setting.payment_method)
    }));
    
    // 如果有可用的支付方式，默认选择第一个
    if (paymentMethods.value.length > 0) {
      selectedPaymentMethod.value = paymentMethods.value[0].id;
    }
  } catch (error) {
    console.error('加载支付方式失败:', error);
    tips.error('加载支付方式失败');
  }
};

// 获取支付方式名称
const getPaymentMethodName = (method) => {
  const nameMap = {
    'wx': '微信支付',
    'zfb': '支付宝',
    'ptb': '平台币',
    'djq': '代金券',
    'kf': '客服'
  };
  return nameMap[method] || method;
};

// 获取默认图标
const getDefaultIcon = (method) => {
  const iconMap = {
    'wx': '/wx.png',
    'zfb': '/zfb.png',
    'ptb': '/platform-coin.svg',
    'djq': '/djq.png',
    'kf': '/kf.png'
  };
  return iconMap[method] || '/default.png';
};

// 页面初始化
onMounted(async () => {
  if (!authStore.isLoggedIn || !authStore.isUser) {
    router.push('/user/login');
    return;
  }
  // 加载系统参数中的PTB系数
  try {
    const resp = await $fetch('/api/user/system-params/ptb_exchange_rate');
    ptbRate.value = Math.max(1, parseFloat(resp?.data?.content || '10') || 10);
  } catch {}
  // 加载支付方式
  loadPaymentMethods();
});
</script>

<style scoped>
.cashier-container {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  min-height: calc(100vh - 120px);
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: var(--on-surface);
}

.page-header p {
  margin: 0;
  color: var(--on-surface-variant);
  font-size: 14px;
}



/* 余额显示 */
.balance-display {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%);
  border-radius: var(--radius-sm);
  padding: 20px;
  margin-bottom: 32px;
  color: var(--on-primary);
  margin-top: 16px;
}

.balance-info {
  text-align: center;
}

.balance-label {
  display: block;
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.balance-amount {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.coin-icon {
  width: 24px;
  height: 24px;
}

.amount {
  font-size: 32px;
  font-weight: 700;
}

/* 金额选择区域 */
.amount-section {
  margin-bottom: 32px;
}

.amount-section h3 {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: var(--on-surface);
}

.preset-amounts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.preset-item {
  background: var(--surface);
  border: 2px solid var(--surface-container-high);
  border-radius: var(--radius-sm);
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.preset-item:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.preset-item.active {
  border-color: var(--primary);
  background: var(--surface-container-low);
}

.preset-amount {
  font-size: 18px;
  font-weight: 700;
  color: var(--on-surface);
  margin-bottom: 4px;
}

.preset-coins {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 14px;
  color: var(--on-surface);
  margin-bottom: 4px;
}

.preset-coin-icon {
  width: 12px;
  height: 12px;
}

.preset-bonus {
  background: var(--secondary-dim);
  color: var(--on-primary);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  position: absolute;
  top: -6px;
  right: 8px;
}

/* 自定义金额 */
.custom-amount h4 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--on-surface);
}

.amount-input-group {
  margin-bottom: 8px;
}

.amount-tips {
  margin-bottom: 16px;
}

.tip-text {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant);
}

/* 兑换预览 */
.exchange-preview {
  background: var(--surface);
  border-radius: 8px;
  padding: 16px;
  border: 1px solid var(--surface-container-high);
}

.exchange-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.exchange-item:last-child {
  margin-bottom: 0;
}

.exchange-item.highlight {
  background: var(--surface-container-low);
  padding: 8px 12px;
  border-radius: 6px;
  margin: 12px -12px -12px;
}

.exchange-item .label {
  font-size: 14px;
  color: var(--on-surface);
}

.exchange-item .value {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface);
  display: flex;
  align-items: center;
  gap: 4px;
}

.preview-coin-icon {
  width: 14px;
  height: 14px;
}

/* 支付方式 */
.payment-method-section {
  margin-bottom: 32px;
}

.payment-method-section h3 {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: var(--on-surface);
}

.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.payment-method-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--surface);
  border: 2px solid var(--surface-container-high);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.3s;
}

.payment-method-item:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.payment-method-item.active {
  border-color: var(--primary);
  background: var(--surface-container-low);
}

.method-icon {
  width: 24px;
  height: 24px;
  color: var(--on-surface);
}

.method-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.method-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--on-surface);
}

.method-balance {
  font-size: 12px;
  color: var(--on-surface-variant);
}

.check-icon {
  width: 20px;
  height: 20px;
  color: var(--primary);
  opacity: 0;
  transition: opacity 0.3s;
}

.check-icon.visible {
  opacity: 1;
}

/* 操作区域 */
.action-section {
  margin-bottom: 24px;
}

.recharge-btn {
  margin-bottom: 16px;
  height: 52px;
  font-size: 18px;
  font-weight: 600;
}

.terms-text {
  text-align: center;
}

.terms-text p {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant);
  line-height: 1.5;
}

.terms-link {
  color: var(--primary);
  text-decoration: none;
}

.terms-link:hover {
  text-decoration: underline;
}

/* 充值说明 */
.info-section {
  background: var(--surface-container-low);
  border-radius: var(--radius-sm);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.info-section h4 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--on-surface);
}

.info-list {
  margin: 0;
  padding-left: 20px;
  list-style: none;
}

.info-list li {
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--on-surface);
  position: relative;
}

.info-list li:before {
  content: '•';
  color: var(--primary);
  font-weight: bold;
  position: absolute;
  left: -16px;
}

.info-list li:last-child {
  margin-bottom: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .cashier-container {
    padding: 12px;
  }
  
  .cashier-card {
    padding: 20px;
    border-radius: var(--radius-sm);
  }
  
  .preset-amounts {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  
  .preset-item {
    padding: 12px 8px;
  }
  
  .preset-amount {
    font-size: 16px;
  }
  
  .preset-coins {
    font-size: 12px;
  }
  
  .payment-methods {
    gap: 10px;
  }
  
  .payment-method-item {
    padding: 14px;
  }
  
  .method-name {
    font-size: 15px;
  }
}

/* 小屏设备适配 */
@media (max-width: 480px) {
  .page-header h1 {
    font-size: 20px;
  }
  
  .balance-amount .amount {
    font-size: 28px;
  }
  
  .preset-amounts {
    grid-template-columns: repeat(1, 1fr);
  }
  
  .recharge-btn {
    height: 48px;
    font-size: 16px;
  }
}
</style> 