<template>
  <div class="balance-page">
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-grid"></div>

    <div class="balance-box">
      <div class="state-block">
        <div class="state-icon">⚠️</div>
        <h1 class="state-title">余额不足</h1>
        <p class="state-sub">您的平台币余额不足，无法完成本次购买</p>
      </div>

      <!-- LINE 联系区域 -->
      <div class="line-section">
        <div class="line-icon-wrap">
          <svg class="line-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
        </div>
        <h3 class="line-title">添加 LINE 客服</h3>
        <p class="line-sub">如需协助，请点击下方按钮添加我们的 LINE 客服</p>
        <div class="line-btns">
          <a :href="lineUrl" target="_blank" class="line-btn line-btn-primary">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zM15.51 12.879c0 .27-.174.51-.432.596a.68.68 0 01-.199.031.62.62 0 01-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zM9.769 12.879c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zM7.303 13.508H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
            打开 LINE
          </a>
          <button @click="copyLineUrl" class="line-btn line-btn-outline">📋 复制 LINE 链接</button>
        </div>
      </div>
    </div>

    <div v-if="showCopySuccess" class="toast-msg">{{ copySuccessMessage }}</div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false, auth: false })

const lineUrl = ref('https://lin.ee/vG027VR')
const showCopySuccess = ref(false)
const copySuccessMessage = ref('')

const fetchSystemConfig = async () => {
  try {
    const response = await fetch('/api/user/system-params/kefu_line')
    if (response.ok) {
      const result = await response.json()
      if (result.code === 200 && result.data && result.data.content) lineUrl.value = result.data.content
    }
  } catch {}
}

const copyLineUrl = async () => {
  try { await navigator.clipboard.writeText(lineUrl.value) } catch { const t = document.createElement('textarea'); t.value = lineUrl.value; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  copySuccessMessage.value = 'LINE 链接已复制！'; showCopySuccess.value = true; setTimeout(() => { showCopySuccess.value = false }, 2000)
}

onMounted(async () => { await fetchSystemConfig() })
useHead({ title: '余额不足' })
</script>

<style scoped>
.balance-page {
  min-height: 100vh; background: var(--surface);
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  padding: 20px; position: relative; overflow: hidden;
  font-family: var(--font-family);
}
.bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
.orb-1 { width: 400px; height: 400px; background: rgba(168,50,6,0.2); top: -100px; left: -100px; }
.orb-2 { width: 300px; height: 300px; background: rgba(127,230,219,0.15); bottom: -50px; right: -50px; }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--outline-variant) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }

.balance-box {
  position: relative; width: 100%; max-width: 440px;
  background: var(--surface-container-low); /* no-line rule */;
  border-radius: var(--radius-lg); padding: 36px; box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,50,6,0.15);
}

.state-block { text-align: center; margin-bottom: 24px; }
.state-icon { font-size: 48px; margin-bottom: 12px; }
.state-title { margin: 0 0 6px; font-size: 22px; font-weight: 700; color: var(--on-surface); }
.state-sub { margin: 0; font-size: 13px; color: var(--on-surface-variant); }

.line-section {
  background: rgba(0,180,80,0.08); border: 1px solid rgba(0,180,80,0.2);
  border-radius: 16px; padding: 24px; text-align: center;
}
.line-icon-wrap {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(0,180,80,0.15);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px;
}
.line-svg { width: 28px; height: 28px; color: var(--secondary-dim); }
.line-title { margin: 0 0 6px; font-size: 17px; font-weight: 700; color: var(--on-surface); }
.line-sub { margin: 0 0 16px; font-size: 13px; color: var(--on-surface-variant); }
.line-btns { display: flex; flex-direction: column; gap: 10px; }
.line-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 16px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; text-decoration: none; border: none;
}
.line-btn-primary { background: var(--secondary-dim); color: var(--on-primary); }
.line-btn-primary:hover { background: var(--secondary-dim); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,180,80,0.4); }
.line-btn-outline { background: rgba(0,180,80,0.1); color: var(--secondary-fixed); border: 1px solid rgba(0,180,80,0.3); }
.line-btn-outline:hover { background: rgba(0,180,80,0.2); }
.btn-icon { width: 18px; height: 18px; }

.toast-msg {
  position: fixed; top: 20px; right: 20px;
  background: linear-gradient(135deg, var(--secondary), var(--secondary-fixed));
  color: var(--surface); padding: 10px 20px; border-radius: 10px;
  font-size: 14px; font-weight: 600; z-index: 200;
  box-shadow: 0 8px 24px rgba(127,230,219,0.4);
}

@media (max-width: 480px) { .balance-box { padding: 28px 20px; border-radius: var(--radius-lg); } }
</style>
