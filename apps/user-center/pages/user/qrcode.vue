<template>
  <div class="qr-page">
    <LanguageSwitcher floating />
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-grid"></div>

    <div class="qr-box">
      <!-- 加载中 -->
      <div v-if="loading" class="state-block">
        <div class="state-icon loading-spin">⏳</div>
        <h2 class="state-title">{{ tt('生成二维码中...', 'Generating QR Code...') }}</h2>
        <p class="state-sub">{{ tt('请稍候', 'Please wait') }}</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="state-block">
        <div class="state-icon">❌</div>
        <h2 class="state-title">{{ tt('二维码生成失败', 'Failed to Generate QR Code') }}</h2>
        <p class="state-sub">{{ error }}</p>
        <button class="action-btn mt-16" @click="retryGenerate">{{ tt('重试', 'Retry') }}</button>
      </div>

      <!-- 二维码显示 -->
      <div v-else-if="qrCodeUrl" class="qr-content">
        <!-- 左侧：二维码 -->
        <div class="qr-left">
          <h1 class="qr-heading">{{ tt('请扫码支付', 'Scan QR Code to Pay') }}</h1>
          <p class="qr-heading-sub">{{ tt('使用微信或支付宝扫描二维码', 'Scan with WeChat or Alipay') }}</p>
          <div class="qr-img-wrap">
            <img :src="qrCodeUrl" :alt="paymentMethod" class="qr-img" @error="handleImageError" />
          </div>
        </div>

        <!-- 右侧：支付信息 -->
        <div class="qr-right">
          <div class="detail-list">
            <div class="detail-row">
              <span class="detail-label">{{ tt('支付金额', 'Amount') }}</span>
              <span class="detail-value amount text-success">¥{{ formatAmount(amount) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">{{ tt('支付方式', 'Method') }}</span>
              <span class="detail-value">
                <img v-if="getPaymentIcon(paymentMethod)" :src="getPaymentIcon(paymentMethod)" class="pay-icon" />
                {{ getPaymentMethodName(paymentMethod) }}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">{{ tt('商品名称', 'Item') }}</span>
              <span class="detail-value">{{ productName }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">{{ tt('交易号', 'Transaction ID') }}</span>
              <span class="detail-value mono">
                {{ transactionId }}
                <button class="copy-btn" @click="copyTransactionId">📋</button>
              </span>
            </div>
          </div>

          <div class="qr-actions">
            <button class="action-btn" @click="checkPaymentStatus">🔄 {{ tt('检查支付状态', 'Check Payment Status') }}</button>
            <button v-if="qrCodeText" class="action-btn-outline" @click="copyQRCodeText">📋 {{ tt('复制支付链接', 'Copy Payment Link') }}</button>
          </div>
        </div>
      </div>

      <!-- 无二维码 -->
      <div v-else class="state-block">
        <div class="state-icon">📄</div>
        <h2 class="state-title">{{ tt('未找到二维码', 'QR Code Not Found') }}</h2>
        <p class="state-sub">{{ tt('请检查URL参数是否正确', 'Please check the URL parameters') }}</p>
      </div>
    </div>

    <div class="footer-hint">{{ tt('支付完成后请点击"检查支付状态"按钮', 'Click "Check Payment Status" after completing payment') }}</div>

    <div v-if="showCopySuccess" class="toast-msg">{{ copySuccessMessage }}</div>
    <div v-if="paymentStatusResult" class="toast-msg" :class="paymentStatusResult.success ? '' : 'toast-warn'">{{ paymentStatusResult.message }}</div>
  </div>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'
import { useI18n } from '~/composables/useI18n'

definePageMeta({ layout: false, auth: false })

const route = useRoute()
const { tt } = useI18n()
const loading = ref(true)
const error = ref('')
const qrCodeUrl = ref('')
const qrCodeText = ref('')
const showCopySuccess = ref(false)
const copySuccessMessage = ref('')
const paymentStatusResult = ref<any>(null)
const transactionId = computed(() => route.query.transaction_id as string || '')
const qrcode = computed(() => route.query.qrcode as string || '')
const amount = ref(0)
const paymentMethod = ref('')
const productName = ref('')

const getPaymentIcon = (m: string) => ({ '支付宝': '/zfb.png', '微信': '/wx.png', 'alipay': '/zfb.png', 'wxpay': '/wx.png' }[m] || '')
const getPaymentMethodName = (m: string) => ({
  '支付宝': tt('支付宝', 'Alipay'),
  '微信': tt('微信支付', 'WeChat Pay'),
  'alipay': tt('支付宝', 'Alipay'),
  'wxpay': tt('微信支付', 'WeChat Pay')
}[m] || m)
const formatAmount = (a: number) => a.toFixed(2)

const copyTransactionId = async () => {
  try { await navigator.clipboard.writeText(transactionId.value) } catch { const t = document.createElement('textarea'); t.value = transactionId.value; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  copySuccessMessage.value = tt('交易号复制成功！', 'Transaction ID copied!'); showCopySuccess.value = true; setTimeout(() => { showCopySuccess.value = false }, 2000)
}
const copyQRCodeText = async () => {
  try { await navigator.clipboard.writeText(qrCodeText.value) } catch { const t = document.createElement('textarea'); t.value = qrCodeText.value; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  copySuccessMessage.value = tt('支付链接复制成功！', 'Payment link copied!'); showCopySuccess.value = true; setTimeout(() => { showCopySuccess.value = false }, 2000)
}
const handleImageError = () => { error.value = tt('二维码图片加载失败', 'Failed to load QR code image') }

const checkPaymentStatus = async () => {
  if (!transactionId.value) { paymentStatusResult.value = { success: false, message: tt('交易号不存在', 'Transaction ID missing') }; return }
  try {
    const response = await fetch(`/api/payment/trans/${transactionId.value}`)
    if (response.ok) {
      const result = await response.json()
      if (result.code === 200 && result.data) {
        const status = result.data.payment_status
        if (status === 3 || status === 4) { await navigateTo(`/user/payment-success?transaction_id=${transactionId.value}`); return }
        paymentStatusResult.value = { success: false, message: status === 1 ? tt('支付处理中，请稍后再试', 'Payment processing, please try again shortly') : tt('支付未完成，请继续扫码支付', 'Payment not completed yet, please scan to pay') }
      } else { paymentStatusResult.value = { success: false, message: tt('订单不存在', 'Order not found') } }
    } else { paymentStatusResult.value = { success: false, message: tt('查询失败，请稍后再试', 'Query failed, please try again') } }
  } catch { paymentStatusResult.value = { success: false, message: tt('网络错误，请稍后再试', 'Network error, please try again') } }
  setTimeout(() => { paymentStatusResult.value = null }, 3000)
}

const generateQRCode = async (text: string) => {
  try { qrCodeUrl.value = await QRCode.toDataURL(text, { width: 200, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } }); qrCodeText.value = text }
  catch { error.value = tt('二维码生成失败', 'Failed to generate QR code') }
}

const initPage = async () => {
  try {
    loading.value = true; error.value = ''
    if (qrcode.value) {
      await generateQRCode(decodeURIComponent(qrcode.value))
      if (transactionId.value) {
        try { const r = await fetch(`/api/payment/trans/${transactionId.value}`); if (r.ok) { const res = await r.json(); if (res.code === 200 && res.data) { amount.value = parseFloat(res.data.amount) || 0; paymentMethod.value = res.data.payment_way || ''; productName.value = res.data.product_name || '' } } } catch {}
      }
    } else if (transactionId.value) {
      try { const r = await fetch(`/api/payment/trans/${transactionId.value}`); if (r.ok) { const res = await r.json(); if (res.code === 200 && res.data) { amount.value = parseFloat(res.data.amount) || 0; paymentMethod.value = res.data.payment_way || ''; productName.value = res.data.product_name || '' } } } catch {}
    } else { error.value = tt('缺少必要的参数', 'Missing required parameters') }
  } catch { error.value = tt('页面初始化失败', 'Failed to initialize page') }
  finally { loading.value = false }
}

const retryGenerate = async () => { error.value = ''; loading.value = true; await initPage() }

onMounted(async () => { await initPage() })
watch([transactionId, qrcode], async () => { await initPage() })
</script>

<style scoped>
.qr-page {
  min-height: 100vh; background: #fff4f3 !important;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  padding: 20px; position: relative; overflow: hidden;
  font-family: var(--font-family);
}
.bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
.orb-1 { width: 400px; height: 400px; background: rgba(168,50,6,0.2); top: -100px; left: -100px; }
.orb-2 { width: 300px; height: 300px; background: rgba(127,230,219,0.15); bottom: -50px; right: -50px; }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--outline-variant) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }

.qr-box {
  position: relative; width: 100%; max-width: 500px;
  background: var(--surface-container-low); /* no-line rule */;
  border-radius: var(--radius-lg); padding: 36px; box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,50,6,0.15);
}

.state-block { text-align: center; padding: 20px 0; }
.state-icon { font-size: 48px; margin-bottom: 12px; }
.loading-spin { animation: spin 1.5s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.state-title { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: var(--on-surface); }
.state-sub { margin: 0; font-size: 13px; color: var(--on-surface-variant); }
.mt-16 { margin-top: 16px; }

.qr-content { text-align: center; }
.qr-heading { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: var(--on-surface); }
.qr-heading-sub { margin: 0 0 16px; font-size: 13px; color: var(--on-surface-variant); }
.qr-img-wrap {
  display: inline-block; padding: 12px;
  background: var(--surface-container-low); border-radius: var(--radius-sm); margin-bottom: 24px;
}
.qr-img { width: 200px; height: 200px; object-fit: contain; }

.detail-list { border-top: 1px solid var(--outline-variant); padding-top: 20px; display: flex; flex-direction: column; gap: 14px; }
.detail-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.detail-label { font-size: 13px; color: var(--on-surface-variant); flex-shrink: 0; }
.detail-value { font-size: 14px; color: var(--on-surface); text-align: right; word-break: break-all; display: flex; align-items: center; gap: 6px; }
.detail-value.amount { font-size: 18px; font-weight: 700; }
.detail-value.mono { font-family: 'Courier New', monospace; font-size: 12px; }
.text-success { color: var(--secondary-fixed); }
.pay-icon { width: 18px; height: 18px; }
.copy-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; opacity: 0.6; transition: opacity 0.2s; }
.copy-btn:hover { opacity: 1; }

.qr-actions { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
.action-btn {
  width: 100%; padding: 14px; border-radius: var(--radius-md); border: none;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  color: var(--on-primary); font-size: 15px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 8px 24px rgba(168,50,6,0.3);
}
.action-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(168,50,6,0.5); }
.action-btn-outline {
  width: 100%; padding: 14px; border-radius: var(--radius-md);
  background: rgba(127,230,219,0.1); border: 1px solid rgba(127,230,219,0.3);
  color: var(--secondary-fixed); font-size: 15px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.action-btn-outline:hover { background: rgba(127,230,219,0.2); }

.footer-hint { margin-top: 24px; font-size: 12px; color: var(--on-surface-variant); text-align: center; position: relative; }
.toast-msg {
  position: fixed; top: 20px; right: 20px;
  background: linear-gradient(135deg, var(--secondary), var(--secondary-fixed));
  color: var(--surface); padding: 10px 20px; border-radius: 10px;
  font-size: 14px; font-weight: 600; z-index: 200;
  box-shadow: 0 8px 24px rgba(127,230,219,0.4);
}
.toast-warn { background: linear-gradient(135deg, var(--error), var(--primary)); }

@media (max-width: 480px) { .qr-box { padding: 28px 20px; border-radius: var(--radius-lg); } .qr-img { width: 180px; height: 180px; } }

@media (orientation: landscape) and (min-width: 600px) {
  .qr-box { max-width: 700px; }
  .qr-content { display: flex; gap: 28px; text-align: left; align-items: flex-start; }
  .qr-left { flex-shrink: 0; text-align: center; }
  .qr-right { flex: 1; }
  .detail-list { border-top: none; padding-top: 0; }
}
</style>