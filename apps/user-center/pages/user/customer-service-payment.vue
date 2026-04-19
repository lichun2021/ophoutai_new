<template>
  <div class="cs-page">
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-grid"></div>

    <div class="cs-box">
      <!-- 加载中 -->
      <div v-if="loading" class="state-block">
        <div class="state-icon loading-spin">⏳</div>
        <h2 class="state-title">查询订单信息中...</h2>
        <p class="state-sub">请稍候</p>
      </div>

      <!-- 订单不存在 -->
      <div v-else-if="!paymentInfo" class="state-block">
        <div class="state-icon">❌</div>
        <h2 class="state-title">订单不存在</h2>
        <p class="state-sub">未找到对应的订单信息</p>
      </div>

      <!-- 订单信息 -->
      <div v-else>
        <!-- 头部 -->
        <div class="state-block">
          <div class="state-icon">💬</div>
          <h1 class="state-title">客服支付</h1>
          <p class="state-sub">您的订单已提交，请联系客服完成支付</p>
        </div>

        <!-- LINE 联系区域 -->
        <div class="line-section">
          <div class="line-icon-wrap">
            <svg class="line-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
          </div>
          <h3 class="line-title">添加 LINE 客服</h3>
          <p class="line-sub">请点击下方按钮添加我们的 LINE 客服，完成支付流程</p>
          <div class="line-btns">
            <a :href="lineUrl" target="_blank" class="line-btn line-btn-primary">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zM15.51 12.879c0 .27-.174.51-.432.596a.68.68 0 01-.199.031.62.62 0 01-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zM9.769 12.879c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zM7.303 13.508H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
              添加 LINE 客服
            </a>
            <button @click="copyLineUrl" class="line-btn line-btn-outline">📋 复制 LINE 链接</button>
          </div>
        </div>

        <!-- 订单详情 -->
        <div class="detail-list">
          <div class="detail-row">
            <span class="detail-label">商品名称</span>
            <span class="detail-value">{{ paymentInfo.product_name || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">支付金额</span>
            <span class="detail-value amount">¥{{ formatAmount(paymentInfo.amount) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">支付方式</span>
            <span class="detail-value"><img src="/customer-service.png" alt="" class="pay-icon" /> 客服支付</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">订单状态</span>
            <span class="detail-value text-processing">{{ getStatusText() }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">交易号</span>
            <span class="detail-value mono">
              {{ paymentInfo.transaction_id }}
              <button class="copy-btn" @click="copyTransactionId">📋</button>
            </span>
          </div>
          <div v-if="paymentInfo.mch_order_id" class="detail-row">
            <span class="detail-label">商户订单号</span>
            <span class="detail-value mono">{{ paymentInfo.mch_order_id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">创建时间</span>
            <span class="detail-value">{{ formatTime(paymentInfo.created_at) }}</span>
          </div>
        </div>

        <!-- 操作说明 -->
        <div class="steps-box">
          <h4 class="steps-title">💡 接下来的操作步骤：</h4>
          <ol class="steps-list">
            <li>点击上方"添加 LINE 客服"或"复制 LINE 链接"</li>
            <li>在 LINE 中添加我们的客服帐号</li>
            <li>发送您的交易号给客服</li>
            <li>按照客服指引完成支付</li>
            <li>支付完成后请保留支付凭证</li>
          </ol>
        </div>

        <button class="action-btn" @click="refreshOrder">🔄 刷新订单状态</button>
      </div>
    </div>

    <div v-if="showCopySuccess" class="toast-msg">{{ copySuccessMessage }}</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false, auth: false });

const route = useRoute();
const loading = ref(true);
const paymentInfo = ref<any>(null);
const showCopySuccess = ref(false);
const copySuccessMessage = ref('');
const lineUrl = ref('https://lin.ee/vG027VR');
const transactionId = computed(() => route.query.transaction_id as string || '');

const fetchSystemConfig = async () => {
  try {
    const response = await fetch('/api/user/system-params/kefu_line');
    if (response.ok) {
      const result = await response.json();
      if (result.code === 200 && result.data && result.data.content) lineUrl.value = result.data.content;
    }
  } catch {}
};

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

const getStatusText = () => {
  if (!paymentInfo.value) return '未知';
  return { 0: '待支付', 1: '处理中', 2: '支付失败', 3: '支付成功', 4: '已完成' }[paymentInfo.value.payment_status] || '未知状态';
};
const formatAmount = (a: any) => (!a && a !== 0) ? '0.00' : parseFloat(a).toFixed(2);
const formatTime = (t: string) => { if (!t) return '-'; try { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return t; } };
const refreshOrder = () => fetchOrderInfo();

const showToast = (msg: string) => { copySuccessMessage.value = msg; showCopySuccess.value = true; setTimeout(() => { showCopySuccess.value = false; }, 2000); };

const copyLineUrl = async () => {
  try { await navigator.clipboard.writeText(lineUrl.value); } catch { const t = document.createElement('textarea'); t.value = lineUrl.value; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  showToast('LINE 链接已复制！');
};
const copyTransactionId = async () => {
  if (!paymentInfo.value?.transaction_id) return;
  try { await navigator.clipboard.writeText(paymentInfo.value.transaction_id); } catch { const t = document.createElement('textarea'); t.value = paymentInfo.value.transaction_id; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  showToast('交易号已复制！');
};

onMounted(async () => { await Promise.all([fetchSystemConfig(), fetchOrderInfo()]); });
useHead({ title: '客服支付 - 订单详情' });
</script>

<style scoped>
.cs-page {
  min-height: 100vh; background: #0d0f1a;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  padding: 20px; position: relative; overflow: hidden;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
}
.bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
.orb-1 { width: 400px; height: 400px; background: rgba(108,92,231,0.2); top: -100px; left: -100px; }
.orb-2 { width: 300px; height: 300px; background: rgba(0,206,201,0.15); bottom: -50px; right: -50px; }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }

.cs-box {
  position: relative; width: 100%; max-width: 460px;
  background: #161929; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px; padding: 36px; box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,92,231,0.15);
}

.state-block { text-align: center; margin-bottom: 24px; }
.state-icon { font-size: 48px; margin-bottom: 12px; }
.loading-spin { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.state-title { margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #e8eaf6; }
.state-sub { margin: 0; font-size: 13px; color: #8892b0; }

/* LINE 区域 */
.line-section {
  background: rgba(0,180,80,0.08); border: 1px solid rgba(0,180,80,0.2);
  border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: center;
}
.line-icon-wrap {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(0,180,80,0.15);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px;
}
.line-svg { width: 28px; height: 28px; color: #00b450; }
.line-title { margin: 0 0 6px; font-size: 17px; font-weight: 700; color: #e8eaf6; }
.line-sub { margin: 0 0 16px; font-size: 13px; color: #8892b0; }
.line-btns { display: flex; flex-direction: column; gap: 10px; }
.line-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 16px; border-radius: 12px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; text-decoration: none; border: none;
}
.line-btn-primary { background: #00b450; color: white; }
.line-btn-primary:hover { background: #009940; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,180,80,0.4); }
.line-btn-outline { background: rgba(0,180,80,0.1); color: #55efc4; border: 1px solid rgba(0,180,80,0.3); }
.line-btn-outline:hover { background: rgba(0,180,80,0.2); }
.btn-icon { width: 18px; height: 18px; }

/* 订单详情 */
.detail-list { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; display: flex; flex-direction: column; gap: 14px; }
.detail-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.detail-label { font-size: 13px; color: #8892b0; flex-shrink: 0; }
.detail-value { font-size: 14px; color: #e8eaf6; text-align: right; word-break: break-all; display: flex; align-items: center; gap: 6px; }
.detail-value.amount { font-size: 18px; font-weight: 700; color: #a29bfe; }
.detail-value.mono { font-family: 'Courier New', monospace; font-size: 12px; }
.text-processing { color: #fdcb6e; }
.pay-icon { width: 18px; height: 18px; }
.copy-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; opacity: 0.6; transition: opacity 0.2s; }
.copy-btn:hover { opacity: 1; }

/* 步骤说明 */
.steps-box {
  margin-top: 20px; padding: 16px;
  background: rgba(108,92,231,0.08); border: 1px solid rgba(108,92,231,0.2);
  border-radius: 12px;
}
.steps-title { margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #a29bfe; }
.steps-list { margin: 0; padding-left: 18px; font-size: 13px; color: #8892b0; line-height: 1.8; }

.action-btn {
  margin-top: 24px; width: 100%; padding: 14px;
  border-radius: 14px; border: none;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  color: white; font-size: 15px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 8px 24px rgba(108,92,231,0.3);
}
.action-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(108,92,231,0.5); }

.toast-msg {
  position: fixed; top: 20px; right: 20px;
  background: linear-gradient(135deg, #00cec9, #55efc4);
  color: #0d0f1a; padding: 10px 20px; border-radius: 10px;
  font-size: 14px; font-weight: 600; z-index: 200;
  box-shadow: 0 8px 24px rgba(0,206,201,0.4);
}

@media (max-width: 480px) { .cs-box { padding: 28px 20px; border-radius: 20px; } }
</style>