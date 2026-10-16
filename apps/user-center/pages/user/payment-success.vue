<template>
  <div class="success-page">
    <LanguageSwitcher floating />
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-grid"></div>

    <div class="success-box">
      <!-- 加载中 -->
      <div v-if="loading" class="state-block">
        <div class="state-icon loading-spin">⏳</div>
        <h2 class="state-title">{{ tt('查询订单信息中...', 'Checking order status...') }}</h2>
        <p class="state-sub">{{ tt('请稍候', 'Please wait') }}</p>
      </div>

      <!-- 订单不存在 -->
      <div v-else-if="!paymentInfo" class="state-block">
        <div class="state-icon">❌</div>
        <h2 class="state-title">{{ tt('订单不存在', 'Order Not Found') }}</h2>
        <p class="state-sub">{{ tt('未找到对应的订单信息', 'Could not find matching order information') }}</p>
      </div>

      <!-- 订单信息 -->
      <div v-else>
        <div class="state-block">
          <div class="state-icon" :class="'icon-' + getPaymentStatus()">
            <span v-if="getPaymentStatus() === 'success'">✅</span>
            <span v-else-if="getPaymentStatus() === 'processing'">⏳</span>
            <span v-else>❌</span>
          </div>
          <h2 class="state-title">{{ getStatusTitle() }}</h2>
          <p class="state-sub">{{ getStatusDescription() }}</p>
        </div>

        <!-- 订单明细 -->
        <div class="detail-list">
          <div class="detail-row">
            <span class="detail-label">{{ tt('商品名称', 'Item') }}</span>
            <span class="detail-value">{{ paymentInfo.product_name || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ tt('支付金额', 'Amount') }}</span>
            <span class="detail-value amount" :class="'text-' + getPaymentStatus()">¥{{ formatAmount(paymentInfo.amount) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ tt('支付方式', 'Method') }}</span>
            <span class="detail-value">
              <img v-if="getPaymentIcon(paymentInfo.payment_way)" :src="getPaymentIcon(paymentInfo.payment_way)" class="pay-icon" />
              {{ getPaymentMethodName(paymentInfo.payment_way) }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ tt('订单状态', 'Status') }}</span>
            <span class="detail-value" :class="'text-' + getPaymentStatus()">{{ getStatusText() }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ tt('交易号', 'Transaction ID') }}</span>
            <span class="detail-value mono">
              {{ paymentInfo.transaction_id }}
              <button class="copy-btn" @click="copyTransactionId" :title="tt('复制', 'Copy')">📋</button>
            </span>
          </div>
          <div v-if="paymentInfo.mch_order_id" class="detail-row">
            <span class="detail-label">{{ tt('商户订单号', 'Order No.') }}</span>
            <span class="detail-value mono">{{ paymentInfo.mch_order_id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ tt('创建时间', 'Created At') }}</span>
            <span class="detail-value">{{ formatTime(paymentInfo.created_at) }}</span>
          </div>
          <div v-if="paymentInfo.updated_at && paymentInfo.updated_at !== paymentInfo.created_at" class="detail-row">
            <span class="detail-label">{{ tt('更新时间', 'Updated At') }}</span>
            <span class="detail-value">{{ formatTime(paymentInfo.updated_at) }}</span>
          </div>
        </div>

        <button class="action-btn" @click="refreshOrder">🔄 {{ tt('刷新状态', 'Refresh Status') }}</button>
      </div>
    </div>

    <div class="footer-hint">{{ tt('如有疑问，请联系客服', 'If you have any questions, please contact support') }}</div>

    <!-- 复制提示 -->
    <div v-if="showCopySuccess" class="toast-msg">{{ tt('复制成功！', 'Copied!') }}</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n';

definePageMeta({ layout: false, auth: false });

const route = useRoute();
const { isEn, tt } = useI18n();
const loading = ref(true);
const paymentInfo = ref<any>(null);
const showCopySuccess = ref(false);
const transactionId = computed(() => route.query.transaction_id as string || '');

const fetchOrderInfo = async () => {
  if (!transactionId.value) { loading.value = false; return; }
  try {
    loading.value = true;
    const response = await fetch(`/api/payment/trans/${transactionId.value}`);
    if (response.ok) {
      const result = await response.json();
      paymentInfo.value = (result.code === 200 && result.data) ? result.data : null;
    } else { paymentInfo.value = null; }
  } catch { paymentInfo.value = null; }
  finally { loading.value = false; }
};

const getPaymentStatus = () => {
  if (!paymentInfo.value) return 'unknown';
  const s = paymentInfo.value.payment_status;
  if (s === 3 || s === 4) return 'success';
  if (s === 1) return 'processing';
  return 'failed';
};

const getStatusTitle = () => ({
  success: tt('支付成功', 'Payment Successful'),
  processing: tt('支付处理中', 'Processing Payment'),
  failed: tt('支付失败', 'Payment Failed')
}[getPaymentStatus()] || tt('订单状态异常', 'Abnormal Order Status'));

const getStatusDescription = () => ({
  success: tt('您的支付已完成，感谢您的购买！', 'Your payment is complete. Thank you for your purchase!'),
  processing: tt('您的支付正在处理中，请稍候...', 'Your payment is being processed, please wait...'),
  failed: tt('支付失败，请联系客服或重新尝试', 'Payment failed, please contact support or try again')
}[getPaymentStatus()] || tt('订单状态异常，请联系客服', 'Order status abnormal, please contact support'));

const getStatusText = () => {
  if (!paymentInfo.value) return tt('未知', 'Unknown');
  return {
    0: tt('未完成', 'Unpaid'),
    1: tt('处理中', 'Processing'),
    2: tt('失败', 'Failed'),
    3: tt('支付成功', 'Paid'),
    4: tt('扣款成功', 'Completed')
  }[paymentInfo.value.payment_status] || tt('未知状态', 'Unknown');
};

const getPaymentMethodName = (m: string) => {
  if (!m) return tt('未知', 'Unknown');
  return {
    '客服': tt('客服支付', 'Customer Service'),
    '平台币': tt('平台币支付', 'Platform Coins'),
    '支付宝': tt('支付宝', 'Alipay'),
    '微信': tt('微信支付', 'WeChat Pay'),
    'zfb': tt('支付宝', 'Alipay'),
    'wx': tt('微信支付', 'WeChat Pay'),
    'ptb': tt('平台币', 'Platform Coins'),
    'kf': tt('客服', 'Customer Service'),
    'alipay': tt('支付宝', 'Alipay'),
    'wechat': tt('微信支付', 'WeChat Pay')
  }[m] || m;
};

const getPaymentIcon = (m: string): string | undefined => {
  if (!m) return undefined;
  return { '客服': '/customer-service.png', '平台币': '/platform-coin.png', '支付宝': '/zfb.png', '微信': '/wx.png', 'zfb': '/zfb.png', 'alipay': '/zfb.png', 'wx': '/wx.png', 'wechat': '/wx.png', 'ptb': '/platform-coin.png', 'kf': '/customer-service.png' }[m];
};

const formatAmount = (a: any) => (!a && a !== 0) ? '0.00' : parseFloat(a).toFixed(2);
const formatTime = (t: string) => {
  if (!t) return '-';
  try { return new Date(t).toLocaleString(isEn.value ? 'en-US' : 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return t; }
};

const refreshOrder = () => fetchOrderInfo();
const copyTransactionId = async () => {
  if (!paymentInfo.value?.transaction_id) return;
  try { await navigator.clipboard.writeText(paymentInfo.value.transaction_id); } catch { const t = document.createElement('textarea'); t.value = paymentInfo.value.transaction_id; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  showCopySuccess.value = true;
  setTimeout(() => { showCopySuccess.value = false; }, 2000);
};

onMounted(() => { fetchOrderInfo(); });
useHead({ title: computed(() => tt('订单详情', 'Order Details')) });
</script>

<style scoped>
.success-page {
  min-height: 100vh; background: #fff4f3 !important;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  padding: 20px; position: relative; overflow: hidden;
  font-family: var(--font-family);
}
.bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
.orb-1 { width: 400px; height: 400px; background: rgba(168,50,6,0.2); top: -100px; left: -100px; }
.orb-2 { width: 300px; height: 300px; background: rgba(127,230,219,0.15); bottom: -50px; right: -50px; }
.bg-grid { position: absolute; inset: 0; background-image: none; background-size: 40px 40px; pointer-events: none; }

.success-box {
  position: relative; width: 100%; max-width: 440px;
  background: var(--surface-container-low); /* no-line rule */;
  border-radius: var(--radius-lg); padding: 36px; box-shadow: 0 24px 80px var(--shadow-ambient), 0 0 0 1px rgba(168,50,6,0.08);
}

.state-block { text-align: center; margin-bottom: 24px; }
.state-icon { font-size: 48px; margin-bottom: 12px; }
.loading-spin { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.state-title { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: var(--on-surface); }
.state-sub { margin: 0; font-size: 13px; color: var(--on-surface-variant); }

.detail-list { border-top: 1px solid var(--outline-variant); padding-top: 20px; display: flex; flex-direction: column; gap: 14px; }
.detail-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.detail-label { font-size: 13px; color: var(--on-surface-variant); flex-shrink: 0; }
.detail-value { font-size: 14px; color: var(--on-surface); text-align: right; word-break: break-all; display: flex; align-items: center; gap: 6px; }
.detail-value.amount { font-size: 18px; font-weight: 700; }
.detail-value.mono { font-family: 'Courier New', monospace; font-size: 12px; }
.text-success { color: var(--secondary-fixed); }
.text-processing { color: var(--primary); }
.text-failed { color: var(--error); }

.pay-icon { width: 18px; height: 18px; }
.copy-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; opacity: 0.6; transition: opacity 0.2s; }
.copy-btn:hover { opacity: 1; }

.action-btn {
  margin-top: 24px; width: 100%; padding: 14px;
  border-radius: var(--radius-md); border: none;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  color: var(--on-primary); font-size: 15px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 8px 24px rgba(168,50,6,0.3);
}
.action-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(168,50,6,0.5); }

.footer-hint { margin-top: 24px; font-size: 12px; color: var(--on-surface-variant); text-align: center; position: relative; }

.toast-msg {
  position: fixed; top: 20px; right: 20px;
  background: linear-gradient(135deg, var(--secondary), var(--secondary-fixed));
  color: var(--surface); padding: 10px 20px; border-radius: 10px;
  font-size: 14px; font-weight: 600; z-index: 200;
  box-shadow: 0 8px 24px rgba(127,230,219,0.4);
}

@media (max-width: 480px) { .success-box { padding: 28px 20px; border-radius: var(--radius-lg); } }
</style>