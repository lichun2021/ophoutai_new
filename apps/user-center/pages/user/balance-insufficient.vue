<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
    <div class="w-full max-w-md bg-white rounded-lg shadow p-6">
      <div class="text-center mb-6">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <svg class="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 mb-1">余额不足</h1>
        <p class="text-gray-600">您的平台币余额不足，无法完成本次购买</p>
      </div>

      <!-- LINE 联系区域 -->
      <div class="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
        <div class="text-center">
          <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-3">
            <svg class="h-8 w-8 text-green-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">添加 LINE 客服</h3>
          <p class="text-sm text-gray-600 mb-4">如需协助，请点击下方按钮添加我们的 LINE 客服</p>

          <div class="space-y-3">
            <a :href="lineUrl" target="_blank" class="inline-flex items-center justify-center w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-lg transition-colors">
              <svg class="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zM15.51 12.879c0 .27-.174.51-.432.596a.68.68 0 01-.199.031.62.62 0 01-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zM9.769 12.879c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zM7.303 13.508H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
              打开 LINE
            </a>
            <button @click="copyLineUrl" class="inline-flex items-center justify-center w-full bg-green-100 hover:bg-green-200 text-green-700 font-medium py-3 px-4 rounded-lg transition-colors border border-green-300">
              <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              复制 LINE 链接
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- 复制成功提示 -->
    <div v-if="showCopySuccess" class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow z-50 text-sm">
      {{ copySuccessMessage }}
    </div>
  </div>
  
</template>

<script setup>
definePageMeta({
  layout: false,
  auth: false
})

const lineUrl = ref('https://lin.ee/vG027VR')
const showCopySuccess = ref(false)
const copySuccessMessage = ref('')

const fetchSystemConfig = async () => {
  try {
    const response = await fetch('/api/user/system-params/kefu_line')
    if (response.ok) {
      const result = await response.json()
      if (result.code === 200 && result.data && result.data.content) {
        lineUrl.value = result.data.content
      }
    }
  } catch (error) {
    // ignore, use default
  }
}

const copyLineUrl = async () => {
  try {
    await navigator.clipboard.writeText(lineUrl.value)
    copySuccessMessage.value = 'LINE 链接已复制！'
    showCopySuccess.value = true
    setTimeout(() => { showCopySuccess.value = false }, 2000)
  } catch (error) {
    const textArea = document.createElement('textarea')
    textArea.value = lineUrl.value
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    copySuccessMessage.value = 'LINE 链接已复制！'
    showCopySuccess.value = true
    setTimeout(() => { showCopySuccess.value = false }, 2000)
  }
}

onMounted(async () => {
  await fetchSystemConfig()
})

useHead({
  title: '余额不足'
})
</script>

<style scoped>
.transition-colors {
  transition: background-color 0.2s ease-in-out;
}
</style>


