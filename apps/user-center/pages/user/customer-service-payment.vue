<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-2 sm:p-4">
    <div class="w-full max-w-md lg:max-w-lg bg-white rounded-lg shadow-lg p-4 sm:p-6 mx-auto">
      
      <!-- 加载中状态 -->
      <div v-if="loading" class="text-center py-8">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
          <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <h2 class="text-lg font-medium text-gray-900 mb-2">查询订单信息中...</h2>
        <p class="text-gray-600">请稍候</p>
      </div>

      <!-- 订单不存在 -->
      <div v-else-if="!paymentInfo" class="text-center py-8">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <svg class="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h2 class="text-lg font-medium text-gray-900 mb-2">订单不存在</h2>
        <p class="text-gray-600">未找到对应的订单信息</p>
      </div>

      <!-- 订单信息显示 -->
      <div v-else>
        <!-- 状态图标和标题 -->
        <div class="text-center mb-6">
          <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
            <img src="/customer-service.svg" alt="客服支付" class="h-8 w-8">
          </div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">客服支付</h1>
          <p class="text-gray-600">您的订单已提交，请联系客服完成支付</p>
        </div>

        <!-- LINE 联系区域 -->
        <div class="bg-green-50 border-2 border-green-200 rounded-lg p-4 sm:p-6 mb-6">
          <div class="text-center">
            <div class="mx-auto flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-green-100 mb-4">
              <!-- LINE 图标 -->
              <svg class="h-8 w-8 sm:h-10 sm:w-10 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
            </div>
            <h3 class="text-lg sm:text-xl font-semibold text-gray-900 mb-2">添加 LINE 客服</h3>
            <p class="text-sm sm:text-base text-gray-600 mb-4 px-2">请点击下方按钮添加我们的 LINE 客服，完成支付流程</p>
            
            <!-- LINE 操作按钮 -->
            <div class="space-y-3">
              <!-- LINE 添加按钮 -->
              <a :href="lineUrl" 
                 target="_blank" 
                 class="inline-flex items-center justify-center w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 sm:px-6 rounded-lg transition-colors duration-200 text-sm sm:text-base">
                <svg class="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                添加 LINE 客服
              </a>
              
              <!-- 复制链接按钮 -->
              <button @click="copyLineUrl" 
                      class="inline-flex items-center justify-center w-full bg-green-100 hover:bg-green-200 text-green-700 font-medium py-3 px-4 sm:px-6 rounded-lg transition-colors duration-200 border border-green-300 text-sm sm:text-base">
                <svg class="h-5 w-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                复制 LINE 链接
              </button>
            </div>
            
          </div>
        </div>

        <!-- 订单详情 -->
        <div class="border-t border-gray-200 pt-4 sm:pt-6">
          <h3 class="text-lg sm:text-xl font-medium text-gray-900 mb-4">订单详情</h3>
          <dl class="space-y-3 sm:space-y-4">
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <dt class="text-sm font-medium text-gray-500">商品名称</dt>
              <dd class="text-sm text-gray-900 break-words">{{ paymentInfo.product_name || '-' }}</dd>
            </div>
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <dt class="text-sm font-medium text-gray-500">支付金额</dt>
              <dd class="text-lg sm:text-xl font-semibold text-blue-600">¥{{ formatAmount(paymentInfo.amount) }}</dd>
            </div>
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <dt class="text-sm font-medium text-gray-500">支付方式</dt>
              <dd class="text-sm text-gray-900 flex items-center">
                <span class="inline-flex items-center">
                  <img src="/customer-service.png" alt="客服支付" class="w-4 h-4 sm:w-5 sm:h-5 mr-2">
                  <span>客服支付</span>
                </span>
              </dd>
            </div>
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <dt class="text-sm font-medium text-gray-500">订单状态</dt>
              <dd class="text-sm font-medium text-yellow-600">{{ getStatusText() }}</dd>
            </div>
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <dt class="text-sm font-medium text-gray-500">交易号</dt>
              <dd class="text-xs sm:text-sm text-gray-900 font-mono break-all leading-relaxed flex items-center">
                {{ paymentInfo.transaction_id }}
                <button @click="copyTransactionId" class="ml-2 p-1 text-gray-500 hover:text-gray-700 transition-colors" title="复制交易号">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                </button>
              </dd>
            </div>
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2" v-if="paymentInfo.mch_order_id">
              <dt class="text-sm font-medium text-gray-500">商户订单号</dt>
              <dd class="text-xs sm:text-sm text-gray-900 font-mono break-all leading-relaxed">{{ paymentInfo.mch_order_id }}</dd>
            </div>
            <div class="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2">
              <dt class="text-sm font-medium text-gray-500">创建时间</dt>
              <dd class="text-xs sm:text-sm text-gray-900">{{ formatTime(paymentInfo.created_at) }}</dd>
            </div>
          </dl>
        </div>

        <!-- 操作说明 -->
        <div class="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 rounded-lg">
          <div class="flex items-start">
            <svg class="h-5 w-5 text-blue-500 mt-0.5 mr-2 sm:mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <h4 class="text-sm sm:text-base font-medium text-blue-900 mb-2">接下来的操作步骤：</h4>
              <ol class="text-xs sm:text-sm text-blue-800 space-y-1">
                <li>1. 点击上方"添加 LINE 客服"或"复制 LINE 链接"</li>
                <li>2. 在 LINE 中添加我们的客服帐号</li>
                <li>3. 发送您的交易号给客服</li>
                <li>4. 按照客服指引完成支付</li>
                <li>5. 支付完成后请保留支付凭证</li>
              </ol>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="mt-4 sm:mt-6">
          <button @click="refreshOrder" 
                  class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-sm sm:text-base font-medium">
            <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            刷新订单状态
          </button>
        </div>
      </div>
    </div>

    <!-- 页脚提示 -->
    <!-- <div class="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-gray-500">
      <p>客服工作時間：24小時在線服務</p>
    </div> -->

    <!-- 复制成功提示 -->
    <div v-if="showCopySuccess" class="fixed top-4 right-4 bg-green-500 text-white px-3 sm:px-4 py-2 rounded-lg shadow-lg z-50 text-sm sm:text-base max-w-xs">
      {{ copySuccessMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
// 设置页面为独立布局，不需要认证
definePageMeta({
  layout: false,
  auth: false
})

// 获取URL参数
const route = useRoute()

// 响应式数据
const loading = ref(true)
const paymentInfo = ref<any>(null)
const showCopySuccess = ref(false)
const copySuccessMessage = ref('')
const lineUrl = ref('https://lin.ee/vG027VR') // 默认值

// 从URL获取交易ID
const transactionId = computed(() => route.query.transaction_id as string || '')

// 获取系统配置
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
    console.error('获取客服链接配置失败:', error)
    // 使用默认值
  }
}

// 获取订单信息
const fetchOrderInfo = async () => {
  if (!transactionId.value) {
    loading.value = false
    return
  }

  try {
    loading.value = true
    const response = await fetch(`/api/payment/trans/${transactionId.value}`)
    
    if (response.ok) {
      const result = await response.json()
      if (result.code === 200 && result.data) {
        paymentInfo.value = result.data
      } else {
        paymentInfo.value = null
      }
    } else {
      paymentInfo.value = null
    }
  } catch (error) {
    console.error('查询订单失败:', error)
    paymentInfo.value = null
  } finally {
    loading.value = false
  }
}

// 获取状态文本
const getStatusText = () => {
  if (!paymentInfo.value) return '未知'
  
  const status = paymentInfo.value.payment_status
  switch (status) {
    case 0:
      return '待支付'
    case 1:
      return '处理中'
    case 2:
      return '支付失败'
    case 3:
      return '支付成功'
    case 4:
      return '已完成'
    default:
      return '未知状态'
  }
}

// 格式化金额
const formatAmount = (amount: any) => {
  if (!amount && amount !== 0) return '0.00'
  return parseFloat(amount).toFixed(2)
}

// 格式化时间
const formatTime = (timeString: string) => {
  if (!timeString) return '-'
  
  try {
    const time = new Date(timeString)
    return time.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return timeString
  }
}

// 刷新订单状态
const refreshOrder = async () => {
  await fetchOrderInfo()
}

// 复制 LINE 链接
const copyLineUrl = async () => {
  try {
    await navigator.clipboard.writeText(lineUrl.value)
    copySuccessMessage.value = 'LINE 链接已复制！'
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  } catch (error) {
    // 降级处理：使用旧的方法
    const textArea = document.createElement('textarea')
    textArea.value = lineUrl.value
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    
    copySuccessMessage.value = 'LINE 链接已复制！'
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  }
}

// 复制交易号
const copyTransactionId = async () => {
  if (!paymentInfo.value?.transaction_id) return
  
  try {
    await navigator.clipboard.writeText(paymentInfo.value.transaction_id)
    copySuccessMessage.value = '交易號已複製！'
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  } catch (error) {
    // 降级处理：使用旧的方法
    const textArea = document.createElement('textarea')
    textArea.value = paymentInfo.value.transaction_id
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    
    copySuccessMessage.value = '交易号已复制！'
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  }
}

// 页面加载时获取配置和订单信息
onMounted(async () => {
  await Promise.all([
    fetchSystemConfig(),
    fetchOrderInfo()
  ])
})

// 页面标题
useHead({
  title: '客服支付 - 订单详情'
})
</script>

<style scoped>
/* 自定义样式 */
.break-all {
  word-break: break-all;
}

/* 动画效果 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}

/* LINE 按钮悬停效果 */
.transition-colors {
  transition: background-color 0.2s ease-in-out;
}

/* 横屏优化 */
@media (orientation: landscape) and (max-height: 600px) {
  .min-h-screen {
    min-height: auto;
    padding-top: 1rem;
    padding-bottom: 1rem;
  }
  
  /* 横屏时减少间距 */
  .space-y-4 > * + * {
    margin-top: 0.75rem;
  }
  
  .space-y-3 > * + * {
    margin-top: 0.5rem;
  }
}

/* 小屏设备横屏特殊处理 */
@media (orientation: landscape) and (max-height: 500px) {
  .h-16, .h-20 {
    height: 3rem;
    width: 3rem;
  }
  
  .sm\:h-20, .sm\:w-20 {
    height: 3rem;
    width: 3rem;
  }
  
  .py-3 {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
}

/* 改善触摸体验 */
@media (hover: none) and (pointer: coarse) {
  button, a {
    min-height: 44px; /* 确保触摸目标足够大 */
  }
}
</style> 