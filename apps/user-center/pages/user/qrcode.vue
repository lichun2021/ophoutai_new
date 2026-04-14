<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
    <div class="max-w-lg w-full bg-white rounded-lg shadow-lg p-6">
      
      <!-- 加载中状态 -->
      <div v-if="loading" class="text-center py-8">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
          <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <h2 class="text-lg font-medium text-gray-900 mb-2">生成二维码中...</h2>
        <p class="text-gray-600">请稍候</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="text-center py-8">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <svg class="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h2 class="text-lg font-medium text-gray-900 mb-2">二维码生成失败</h2>
        <p class="text-gray-600">{{ error }}</p>
        <button @click="retryGenerate" class="mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
          重试
        </button>
      </div>

                      <!-- 二维码显示 -->
        <div v-else-if="qrCodeUrl" class="landscape-layout">
          <!-- 左侧：二维码 -->
          <div class="landscape-qr text-center">
            <!-- 标题 -->
            <div class="mb-4">
              <h1 class="text-xl font-bold text-gray-900 mb-1">请扫码支付</h1>
              <p class="text-sm text-gray-600">使用微信或支付宝扫描二维码</p>
            </div>

            <!-- 二维码 -->
            <div class="mb-4">
              <div class="inline-block p-3 bg-white border-2 border-gray-200 rounded-lg">
                <img 
                  :src="qrCodeUrl" 
                  :alt="paymentMethod" 
                  class="w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64 object-contain"
                  @error="handleImageError"
                />
              </div>
            </div>
          </div>

          <!-- 右侧：支付信息和操作 -->
          <div class="landscape-info">
            <!-- 支付信息 -->
            <div class="mb-6">
              <dl class="space-y-3">
                <div class="flex justify-between">
                  <dt class="text-sm font-medium text-gray-500">支付金额</dt>
                  <dd class="text-lg font-semibold text-green-600">¥{{ formatAmount(amount) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-sm font-medium text-gray-500">支付方式</dt>
                  <dd class="text-sm text-gray-900 flex items-center">
                    <span class="inline-flex items-center">
                      <img v-if="getPaymentIcon(paymentMethod)" 
                           :src="getPaymentIcon(paymentMethod)" 
                           :alt="paymentMethod"
                           class="w-5 h-5 mr-2">
                      <span>{{ getPaymentMethodName(paymentMethod) }}</span>
                    </span>
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-sm font-medium text-gray-500">商品名称</dt>
                  <dd class="text-sm text-gray-900">{{ productName }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-sm font-medium text-gray-500">交易号</dt>
                  <dd class="text-sm text-gray-900 font-mono break-all flex items-center">
                    {{ transactionId }}
                    <button @click="copyTransactionId" class="ml-2 p-1 text-gray-500 hover:text-gray-700 transition-colors" title="复制交易号">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                      </svg>
                    </button>
                  </dd>
                </div>
              </dl>
            </div>

            <!-- 操作按钮 -->
            <div class="space-y-2">
              <button @click="checkPaymentStatus" 
                      class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center text-sm">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                检查支付状态
              </button>
              

              
              <button v-if="qrCodeText" @click="copyQRCodeText" 
                      class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center text-sm">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                复制支付链接
              </button>
            </div>
          </div>
        </div>

      <!-- 无二维码状态 -->
      <div v-else class="text-center py-8">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4">
          <svg class="h-8 w-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
        </div>
        <h2 class="text-lg font-medium text-gray-900 mb-2">未找到二维码</h2>
        <p class="text-gray-600">请检查URL参数是否正确</p>
      </div>
    </div>

    <!-- 页脚提示 -->
    <div class="mt-8 text-center text-sm text-gray-500">
      <p>支付完成后请点击"检查支付状态"按钮</p>
      <p class="mt-1">如有疑问，请联系客服</p>
    </div>

    <!-- 复制成功提示 -->
    <div v-if="showCopySuccess" class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50">
      {{ copySuccessMessage }}
    </div>

    <!-- 支付状态检查结果 -->
    <div v-if="paymentStatusResult" class="fixed top-4 right-4 px-4 py-2 rounded-md shadow-lg z-50" 
         :class="paymentStatusResult.success ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'">
      {{ paymentStatusResult.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'

// 设置页面为独立布局，需要认证
definePageMeta({
  layout: false,
  auth: false
})

// 获取URL参数
const route = useRoute()

// 响应式数据
const loading = ref(true)
const error = ref('')
const qrCodeUrl = ref('')
const qrCodeText = ref('') // 存储二维码文本内容
const showCopySuccess = ref(false)
const copySuccessMessage = ref('复制成功！')
const paymentStatusResult = ref<any>(null)

// 从URL获取参数
const transactionId = computed(() => route.query.transaction_id as string || '')
const qrcode = computed(() => route.query.qrcode as string || '')

// 支付信息（从URL参数或API获取）
const amount = ref(0)
const paymentMethod = ref('')
const productName = ref('')

// 获取支付方式图标
const getPaymentIcon = (method: string) => {
  const icons: { [key: string]: string } = {
    '支付宝': '/zfb.png',
    '微信': '/wx.png',
    'alipay': '/zfb.png',
    'wxpay': '/wx.png'
  }
  return icons[method] || ''
}

// 获取支付方式名称
const getPaymentMethodName = (method: string) => {
  const names: { [key: string]: string } = {
    '支付宝': '支付宝',
    '微信': '微信支付',
    'alipay': '支付宝',
    'wxpay': '微信支付'
  }
  return names[method] || method
}

// 格式化金额
const formatAmount = (amount: number) => {
  return amount.toFixed(2)
}

// 复制交易号
const copyTransactionId = async () => {
  try {
    await navigator.clipboard.writeText(transactionId.value)
    copySuccessMessage.value = '交易号复制成功！'
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 复制二维码文本
const copyQRCodeText = async () => {
  try {
    await navigator.clipboard.writeText(qrCodeText.value)
    copySuccessMessage.value = '支付链接复制成功！'
    showCopySuccess.value = true
    setTimeout(() => {
      showCopySuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 处理图片加载错误
const handleImageError = () => {
  error.value = '二维码图片加载失败'
}

// 检查支付状态
const checkPaymentStatus = async () => {
  if (!transactionId.value) {
    paymentStatusResult.value = {
      success: false,
      message: '交易号不存在'
    }
    return
  }

  try {
    const response = await fetch(`/api/payment/trans/${transactionId.value}`)
    
    if (response.ok) {
      const result = await response.json()
      if (result.code === 200 && result.data) {
        const status = result.data.payment_status
        if (status === 3 || status === 4) {
          // 支付成功，跳转到成功页面
          await navigateTo(`/user/payment-success?transaction_id=${transactionId.value}`)
          return
        } else if (status === 1) {
          paymentStatusResult.value = {
            success: false,
            message: '支付处理中，请稍后再试'
          }
        } else {
          paymentStatusResult.value = {
            success: false,
            message: '支付未完成，请继续扫码支付'
          }
        }
      } else {
        paymentStatusResult.value = {
          success: false,
          message: '订单不存在'
        }
      }
    } else {
      paymentStatusResult.value = {
        success: false,
        message: '查询失败，请稍后再试'
      }
    }
  } catch (err) {
    paymentStatusResult.value = {
      success: false,
      message: '网络错误，请稍后再试'
    }
  }

  // 3秒后隐藏提示
  setTimeout(() => {
    paymentStatusResult.value = null
  }, 3000)
}

// 刷新二维码
const refreshQRCode = async () => {
  if (qrCodeText.value) {
    // 重新生成二维码
    await generateQRCode(qrCodeText.value)
  } else if (transactionId.value) {
    // 重新请求支付接口获取新的二维码
    window.location.reload()
  }
}

// 重试生成
const retryGenerate = async () => {
  error.value = ''
  loading.value = true
  await initPage()
}

// 生成二维码
const generateQRCode = async (text: string) => {
  try {
    // 生成二维码数据URL
    const dataUrl = await QRCode.toDataURL(text, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
    qrCodeUrl.value = dataUrl
    qrCodeText.value = text
  } catch (err) {
    console.error('生成二维码失败:', err)
    error.value = '二维码生成失败'
  }
}

// 初始化页面
const initPage = async () => {
  try {
    loading.value = true
    error.value = ''

    // 如果有二维码文本内容，生成二维码
    if (qrcode.value) {
      const qrCodeText = decodeURIComponent(qrcode.value)
      await generateQRCode(qrCodeText)
      
      // 如果有交易号，获取订单信息
      if (transactionId.value) {
        try {
          const response = await fetch(`/api/payment/trans/${transactionId.value}`)
          if (response.ok) {
            const result = await response.json()
            if (result.code === 200 && result.data) {
              amount.value = parseFloat(result.data.amount) || 0
              paymentMethod.value = result.data.payment_way || ''
              productName.value = result.data.product_name || ''
            }
          }
        } catch (err) {
          console.error('获取订单信息失败:', err)
        }
      }
    } else if (transactionId.value) {
      // 只有交易号，尝试从订单信息中获取二维码
      try {
        const response = await fetch(`/api/payment/trans/${transactionId.value}`)
        if (response.ok) {
          const result = await response.json()
          if (result.code === 200 && result.data) {
            const orderData = result.data
            amount.value = parseFloat(orderData.amount) || 0
            paymentMethod.value = orderData.payment_way || ''
            productName.value = orderData.product_name || ''
            
            // 这里可以添加从订单中获取二维码的逻辑
            // 如果订单中有二维码URL的话
          }
        }
      } catch (err) {
        console.error('获取订单信息失败:', err)
      }
    } else {
      error.value = '缺少必要的参数'
    }
  } catch (err) {
    console.error('初始化页面失败:', err)
    error.value = '页面初始化失败'
  } finally {
    loading.value = false
  }
}

// 页面加载时初始化
onMounted(async () => {
  await initPage()
})

// 监听URL参数变化
watch([transactionId, qrcode], async () => {
  await initPage()
})
</script>

<style scoped>
/* 默认竖屏布局 */
.landscape-layout {
  text-align: center;
}

.landscape-qr {
  margin-bottom: 1.5rem;
}

.landscape-info {
  text-align: center;
}

/* 横屏适配 */
@media (orientation: landscape) {
  .min-h-screen {
    min-height: 100vh;
    padding: 0.5rem;
  }
  
  .max-w-lg {
    max-width: 95vw;
  }
  
  /* 横屏时二维码和信息并排显示 */
  .landscape-layout {
    display: flex;
    align-items: center;
    gap: 2rem;
    text-align: left;
  }
  
  .landscape-qr {
    flex-shrink: 0;
    margin-bottom: 0;
    text-align: center;
  }
  
  .landscape-info {
    flex: 1;
    text-align: left;
  }
}

/* 小屏幕横屏优化 */
@media (orientation: landscape) and (max-height: 500px) {
  .landscape-layout {
    gap: 1rem;
  }
  
  .landscape-qr h1 {
    font-size: 1.125rem;
  }
  
  .landscape-qr p {
    font-size: 0.875rem;
  }
  
  .w-48.h-48 {
    width: 10rem;
    height: 10rem;
  }
}

/* 移动端横屏优化 */
@media (orientation: landscape) and (max-width: 768px) {
  .max-w-lg {
    max-width: 98vw;
  }
  
  .landscape-layout {
    gap: 1rem;
  }
  
  .w-48.h-48 {
    width: 8rem;
    height: 8rem;
  }
  
  .landscape-info .space-y-2 > * {
    margin-bottom: 0.5rem;
  }
  
  .landscape-info button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }
}

/* 超小屏幕横屏 */
@media (orientation: landscape) and (max-width: 480px) {
  .landscape-layout {
    flex-direction: column;
    gap: 1rem;
  }
  
  .landscape-qr {
    margin-bottom: 0;
  }
  
  .landscape-info {
    text-align: center;
  }
  
  .w-48.h-48 {
    width: 6rem;
    height: 6rem;
  }
}
</style> 