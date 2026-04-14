<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
      
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
          <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-4" :class="getStatusIconClass()">
            <svg v-if="getPaymentStatus() === 'success'" class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <svg v-else-if="getPaymentStatus() === 'processing'" class="h-8 w-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <svg v-else class="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">{{ getStatusTitle() }}</h1>
          <p class="text-gray-600">{{ getStatusDescription() }}</p>
        </div>

        <!-- 订单详情 -->
        <div class="border-t border-gray-200 pt-6">
          <dl class="space-y-4">
            <div class="flex justify-between">
                          <dt class="text-sm font-medium text-gray-500">商品名称</dt>
            <dd class="text-sm text-gray-900">{{ paymentInfo.product_name || '-' }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm font-medium text-gray-500">支付金额</dt>
            <dd class="text-lg font-semibold" :class="getAmountClass()">¥{{ formatAmount(paymentInfo.amount) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm font-medium text-gray-500">支付方式</dt>
            <dd class="text-sm text-gray-900 flex items-center">
              <span class="inline-flex items-center">
                <img v-if="getPaymentIcon(paymentInfo.payment_way)" 
                     :src="getPaymentIcon(paymentInfo.payment_way)" 
                     :alt="paymentInfo.payment_way"
                     class="w-5 h-5 mr-2">
                <span>{{ getPaymentMethodName(paymentInfo.payment_way) }}</span>
              </span>
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm font-medium text-gray-500">订单状态</dt>
            <dd class="text-sm font-medium" :class="getStatusTextClass()">{{ getStatusText() }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm font-medium text-gray-500">交易号</dt>
            <dd class="text-sm text-gray-900 font-mono break-all flex items-center">
              {{ paymentInfo.transaction_id }}
              <button @click="copyTransactionId" class="ml-2 p-1 text-gray-500 hover:text-gray-700 transition-colors" title="复制交易号">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
              </button>
            </dd>
          </div>
          <div class="flex justify-between" v-if="paymentInfo.mch_order_id">
            <dt class="text-sm font-medium text-gray-500">商户订单号</dt>
            <dd class="text-sm text-gray-900 font-mono">{{ paymentInfo.mch_order_id }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-sm font-medium text-gray-500">创建时间</dt>
            <dd class="text-sm text-gray-900">{{ formatTime(paymentInfo.created_at) }}</dd>
          </div>
          <div class="flex justify-between" v-if="paymentInfo.updated_at && paymentInfo.updated_at !== paymentInfo.created_at">
            <dt class="text-sm font-medium text-gray-500">更新时间</dt>
            <dd class="text-sm text-gray-900">{{ formatTime(paymentInfo.updated_at) }}</dd>
          </div>
          </dl>
        </div>

        <!-- 操作按钮 -->
        <div class="mt-8">
          <button @click="refreshOrder" 
                  class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            刷新状态
          </button>
        </div>
      </div>
    </div>

    <!-- 页脚提示 -->
    <div class="mt-8 text-center text-sm text-gray-500">
      <p>如有疑问，请联系客服</p>
    </div>

    <!-- 复制成功提示 -->
    <div v-if="showCopySuccess" class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50">
      复制成功！
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

// 从URL获取交易ID
const transactionId = computed(() => route.query.transaction_id as string || '')

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

// 获取支付状态
const getPaymentStatus = () => {
  if (!paymentInfo.value) return 'unknown'
  
  const status = paymentInfo.value.payment_status
  switch (status) {
    case 3:
    case 4:
      return 'success'
    case 1:
      return 'processing'
    case 0:
    case 2:
    default:
      return 'failed'
  }
}

// 获取状态图标样式
const getStatusIconClass = () => {
  const status = getPaymentStatus()
  switch (status) {
    case 'success':
      return 'bg-green-100'
    case 'processing':
      return 'bg-yellow-100'
    case 'failed':
    default:
      return 'bg-red-100'
  }
}

// 获取状态标题
const getStatusTitle = () => {
  const status = getPaymentStatus()
  switch (status) {
    case 'success':
      return '支付成功'
    case 'processing':
      return '支付处理中'
    case 'failed':
      return '支付失败'
    default:
      return '订单状态异常'
  }
}

// 获取状态描述
const getStatusDescription = () => {
  const status = getPaymentStatus()
  switch (status) {
    case 'success':
      return '您的支付已完成，感谢您的购买！'
    case 'processing':
      return '您的支付正在处理中，请稍候...'
    case 'failed':
      return '支付失败，请联系客服或重新尝试'
    default:
      return '订单状态异常，请联系客服'
  }
}

// 获取状态文本
const getStatusText = () => {
  if (!paymentInfo.value) return '未知'
  
  const status = paymentInfo.value.payment_status
  switch (status) {
    case 0:
      return '未完成'
    case 1:
      return '处理中'
    case 2:
      return '失败'
    case 3:
      return '支付成功'
    case 4:
      return '扣款成功'
    default:
      return '未知狀態'
  }
}

// 获取状态文本样式
const getStatusTextClass = () => {
  const status = getPaymentStatus()
  switch (status) {
    case 'success':
      return 'text-green-600'
    case 'processing':
      return 'text-yellow-600'
    case 'failed':
    default:
      return 'text-red-600'
  }
}

// 获取金额样式
const getAmountClass = () => {
  const status = getPaymentStatus()
  switch (status) {
    case 'success':
      return 'text-green-600'
    case 'processing':
      return 'text-yellow-600'
    case 'failed':
    default:
      return 'text-gray-600'
  }
}

// 获取支付方式名称
const getPaymentMethodName = (method: string) => {
  if (!method) return '未知'
  
  const methodMap: Record<string, string> = {
    '客服': '客服支付',
    '平台币': '平台币支付',
    '支付宝': '支付宝',
    '微信': '微信支付',
    '银联': '银联支付',
    'zfb': '支付寶',
    'wx': '微信支付',
    'ptb': '平台幣',
    'kf': '客服',
    'yl': '银联',
    'alipay': '支付宝',
    'wechat': '微信支付',
    'unionpay': '银联'
  }
  return methodMap[method] || method
}

// 获取支付方式图标
const getPaymentIcon = (method: string): string | undefined => {
  if (!method) return undefined
  
  const iconMap: Record<string, string> = {
    '客服': '/customer-service.png',
    '平台币': '/platform-coin.png',
    '支付宝': '/zfb.png',
    '微信': '/wx.png',
    'zfb': '/zfb.png',
    'alipay': '/zfb.png',
    'wx': '/wx.png',
    'wechat': '/wx.png',
    'ptb': '/platform-coin.png',
    'kf': '/customer-service.png',
    'yl': '/unionpay.png',
    'unionpay': '/unionpay.png'
  }
  return iconMap[method] || undefined
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

// 复制交易号
const copyTransactionId = async () => {
  if (!paymentInfo.value?.transaction_id) return
  
  try {
    await navigator.clipboard.writeText(paymentInfo.value.transaction_id)
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
    
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  }
}

// 页面加载时获取订单信息
onMounted(() => {
  fetchOrderInfo()
})

// 页面标题
useHead({
  title: '订单详情'
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
</style> 