<template>
  <div class="card-pay-page">

    <!-- 卡片信息 -->
    <div class="card-info" :class="cardType">
      <div class="card-badge">{{ cardType === 'lifetime' ? '✨ 终身卡' : '🌙 月卡' }}</div>
      <div class="card-price">¥ {{ cardConfig.price }}</div>
      <div class="card-perday">每天 {{ cardConfig.dailyCoins }} 平台币</div>
      <div class="card-duration">{{ cardType === 'lifetime' ? '永久有效' : '有效期 30 天' }}</div>
    </div>

    <!-- 支付方式选择 -->
    <div class="pay-methods-section">
      <h3 class="pay-title">选择支付方式</h3>

      <div v-if="loading" class="pay-loading">加载支付方式...</div>

      <div v-else-if="methods.length === 0" class="pay-empty">
        暂无可用支付方式，请联系客服
      </div>

      <div v-else class="pay-methods">
        <div
          v-for="m in methods"
          :key="m.id"
          class="pay-method"
          :class="{ active: selectedMethod === m.id }"
          @click="selectedMethod = m.id"
        >
          <img :src="m.icon" :alt="m.name" class="method-icon" />
          <span class="method-name">{{ m.name }}</span>
          <span class="method-check" v-if="selectedMethod === m.id">✓</span>
        </div>
      </div>
    </div>

    <!-- 订单摘要 -->
    <div class="order-summary">
      <div class="summary-row">
        <span>商品</span>
        <span>{{ cardType === 'lifetime' ? '终身卡' : '月卡' }}</span>
      </div>
      <div class="summary-row">
        <span>权益</span>
        <span>每天 {{ cardConfig.dailyCoins }} 平台币</span>
      </div>
      <div class="summary-row">
        <span>有效期</span>
        <span>{{ cardType === 'lifetime' ? '永久' : '30天' }}</span>
      </div>
      <div class="summary-row total">
        <span>应付金额</span>
        <span class="total-price">¥ {{ cardConfig.price }}</span>
      </div>
    </div>

    <!-- 立即支付按钮 -->
    <button
      class="pay-btn"
      :class="{ loading: paying }"
      :disabled="!selectedMethod || paying || methods.length === 0"
      @click="doPay"
    >
      <template v-if="paying">支付处理中...</template>
      <template v-else>立即支付 ¥{{ cardConfig.price }}</template>
    </button>

    <p class="pay-hint">支付成功后月卡即时生效，可在权益中心领取每日平台币</p>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';

definePageMeta({ middleware: 'auth', layout: 'user' });

const route  = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

const cardType = computed(() => route.query.type === 'lifetime' ? 'lifetime' : 'monthly');

// 卡片配置
const CARD_CONFIG = {
  monthly:  { price: 328, dailyCoins: 648, productName: '月卡' },
  lifetime: { price: 980, dailyCoins: 500, productName: '终身卡' },
};
const cardConfig = computed(() => CARD_CONFIG[cardType.value]);

// 支付方式
const methods   = ref([]);
const loading   = ref(true);
const selectedMethod = ref('');
const paying    = ref(false);

const METHOD_NAMES = { wx: '微信支付', zfb: '支付宝' };
// 固定用 public 目录下的本地图片，不依赖数据库 icon_url
const METHOD_ICONS = { wx: '/wx.png', zfb: '/zfb.png' };

const loadMethods = async () => {
  loading.value = true;
  try {
    const res = await $fetch('/api/user/payment-settings/active');
    const active = (res.data || []).filter(s => s.payment_method === 'wx' || s.payment_method === 'zfb');
    methods.value = active.map(s => ({
      id: s.payment_method,
      name: METHOD_NAMES[s.payment_method] || s.payment_method,
      icon: METHOD_ICONS[s.payment_method],   // 只用本地图片
    }));
    if (methods.value.length > 0) selectedMethod.value = methods.value[0].id;
  } catch {
    tips.error('加载支付方式失败');
  } finally {
    loading.value = false;
  }
};

const doPay = async () => {
  if (!selectedMethod.value || paying.value) return;
  paying.value = true;

  try {
    const userInfo = authStore.userInfo;
    if (!userInfo?.username) {
      tips.error('用户信息获取失败，请重新登录');
      return;
    }

    const cfg = cardConfig.value;
    const transactionId = `${selectedMethod.value}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sdkParams = {
      z: selectedMethod.value,           // 支付方式
      f: userInfo.username,              // 用户名
      p: String(cfg.price),             // 固定金额
      j: userInfo.game_code || 'hzwqh', // 游戏ID
      k: cfg.productName,               // 商品名称（月卡/终身卡）—— 回调激活关键字
      l: `购买${cfg.productName}，每天${cfg.dailyCoins}平台币`, // 描述
      y: transactionId,
      h: '1',
      c: 'web',
      tr: userInfo.subuser_id || '',
      xx: transactionId,
      os: 'web',
      d: userInfo.game_code || 'hzwqh',
      e: userInfo.channel_code || '',
      x: userInfo.thirdparty_uid || userInfo.username,
      server_url: window.location.origin,
      cashier_payment: 'true',
    };

    const res = await $fetch('/api/user/cashier/pay', {
      method: 'POST',
      body: sdkParams,
    });

    if (res.code === 1 && res.data) {
      // 直接跳转到支付页面
      window.location.href = res.data;
    } else if (res.code === 1) {
      tips.success('订单创建成功，请等待支付确认');
      setTimeout(() => router.push('/user/benefits'), 1500);
    } else {
      tips.error(res.msg || '支付失败，请重试');
    }
  } catch (err) {
    console.error('月卡支付失败:', err);
    tips.error('支付失败，请稍后重试');
  } finally {
    paying.value = false;
  }
};

onMounted(async () => {
  if (!authStore.isLoggedIn || !authStore.isUser) {
    router.push('/user/login');
    return;
  }
  await loadMethods();
});
</script>

<style scoped>
.card-pay-page {
  max-width: 420px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 卡片信息 ── */
.card-info {
  border-radius: var(--radius-lg);
  padding: 32px 24px;
  text-align: center;
  color: #fff;
  position: relative;
  overflow: hidden;
}
.card-info::before {
  content: '';
  position: absolute;
  right: -40px; top: -40px;
  width: 180px; height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%);
}
.card-info.monthly {
  background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);
}
.card-info.lifetime {
  background: linear-gradient(135deg, #d97706 0%, #92400e 100%);
}
.card-badge {
  display: inline-block;
  background: rgba(255,255,255,0.2);
  border-radius: var(--radius-xl);
  padding: 4px 14px;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 16px;
}
.card-price {
  font-size: 52px;
  font-weight: 900;
  line-height: 1;
  margin-bottom: 8px;
}
.card-perday {
  font-size: 15px;
  color: rgba(255,255,255,0.85);
  margin-bottom: 4px;
}
.card-duration {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
}

/* ── 支付方式 ── */
.pay-methods-section {
  background: var(--surface-container);
  border-radius: var(--radius-lg);
  padding: 18px;
}
.pay-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--on-surface);
}
.pay-loading, .pay-empty {
  font-size: 14px;
  color: var(--on-surface-variant);
  text-align: center;
  padding: 16px 0;
}
.pay-methods {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pay-method {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 2px solid var(--outline-variant);
  cursor: pointer;
  transition: all 0.2s;
  background: var(--surface-container-low);
}
.pay-method:hover { border-color: var(--primary); }
.pay-method.active {
  border-color: var(--primary);
  background: rgba(var(--primary-rgb, 124,58,237), 0.06);
}
.method-icon { width: 32px; height: 32px; object-fit: contain; }
.method-name { flex: 1; font-size: 15px; font-weight: 600; color: var(--on-surface); }
.method-check { color: var(--primary); font-weight: 700; font-size: 16px; }

/* ── 订单摘要 ── */
.order-summary {
  background: var(--surface-container);
  border-radius: var(--radius-lg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--on-surface-variant);
}
.summary-row span:last-child { color: var(--on-surface); font-weight: 500; }
.summary-row.total {
  padding-top: 12px;
  border-top: 1px solid var(--outline-variant);
  font-size: 15px;
  font-weight: 700;
}
.summary-row.total span:first-child { color: var(--on-surface); }
.total-price { font-size: 22px; font-weight: 900; color: var(--primary); }

/* ── 支付按钮 ── */
.pay-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  color: #fff;
  font-size: 17px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-family);
  letter-spacing: 0.5px;
}
.pay-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(124,58,237,0.45);
}
.pay-btn:disabled, .pay-btn.loading {
  opacity: 0.6;
  cursor: default;
  transform: none;
}
.pay-hint {
  text-align: center;
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 0;
  line-height: 1.6;
}
</style>
