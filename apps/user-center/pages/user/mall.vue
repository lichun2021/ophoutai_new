<template>
  <div class="mall-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1>商城</h1>
      <p>精选礼包，助力游戏体验</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">
          <UIcon name="i-heroicons-cube" />
        </div>
                  <div class="stat-content">
            <h4>商品总数</h4>
            <p class="stat-value">{{ products.length }}个</p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">
            <UIcon name="i-heroicons-fire" />
          </div>
          <div class="stat-content">
            <h4>热门礼包</h4>
            <p class="stat-value">{{ hotProductsCount }}个</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <UIcon name="i-heroicons-currency-yen" />
          </div>
          <div class="stat-content">
            <h4>当前余额</h4>
            <p class="stat-value">{{ formatCoins(authStore.userInfo?.platform_coins || 0) }}</p>
          </div>
      </div>
    </div>

    <!-- 商品分类页签 -->
    <div v-if="categories.length > 0" class="category-tabs">
      <div class="tab-container">
        <button 
          v-for="tab in categoryTabs" 
          :key="tab.key"
          @click="selectCategory(tab.key)"
          :class="['tab-button', { active: currentCategory === tab.key }]"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- 商品列表 -->
    <div class="products-section">
      <div v-if="loading" class="loading-state">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        <p>加载中...</p>
      </div>

      <div v-else-if="products.length === 0" class="empty-state">
        <UIcon name="i-heroicons-shopping-bag" />
        <h3>暂无商品</h3>
        <p>当前分类暂时没有商品</p>
      </div>

      <div v-else class="products-grid">
        <div 
          v-for="product in products" 
          :key="product.id" 
          class="product-card"
          @click="toggleProductScroll(product.id)"
        >
          <!-- 商品图片 -->
          <div class="product-image">
            <img 
              :src="product.icon_url || '/default-gift.svg'" 
              :alt="product.package_name"
              @error="handleImageError"
            />
            
            <!-- 限时/限期标签（保持在图片上） -->
            <div v-if="product.category === 'limited' && product.end_time" class="time-badge limited-badge">
              <UIcon name="i-heroicons-clock" class="badge-icon" />
              <span>{{ getTimeRemaining(product.end_time) }}</span>
            </div>
            <div v-else-if="product.category === 'scheduled'" class="time-badge scheduled-badge">
              <UIcon name="i-heroicons-calendar-days" class="badge-icon" />
              <span>{{ getScheduledLabel(product) }}</span>
            </div>
          </div>

          <!-- 商品信息 -->
          <div class="product-info">
            <h3 class="product-name">{{ product.package_name }}</h3>
            <div class="description-container">
              <p 
                :class="{ 'scrolling': scrollingProducts[product.id] }"
                class="product-description"
                :style="getScrollStyle(product)"
              >
                {{ product.description || '暂无描述' }}
              </p>
            </div>
            
            <!-- 限购提示（排除自动发放礼包） -->
            <div v-if="product.max_per_user && product.max_per_user > 0 && !isAutoGrantCategory(product.category)" class="purchase-limit-badge">
              <UIcon name="i-heroicons-shopping-cart" class="limit-icon" />
              <span v-if="product.category === 'daily_recharge'">限购 {{ product.max_per_user }} 次/日</span>
              <span v-else>限购 {{ product.max_per_user }} 个</span>
            </div>

            <!-- 购买按钮（包含价格） -->
            <div class="product-actions">
              <!-- 自动发放礼包显示提示信息，不显示购买按钮 -->
              <div v-if="isAutoGrantCategory(product.category)" class="auto-gift-group">
                <div class="auto-gift-price">
                  <img src="/platform-coin.svg" alt="平台币" class="coin-icon-auto" />
                  <span>{{ formatCoins(product.price_platform_coins) }}</span>
                </div>
                <div class="auto-gift-notice">
                  <UIcon name="i-heroicons-gift" />
                  <span v-if="product.category === 'daily'">每日消费自动发放</span>
                  <span v-else>累计消费自动发放</span>
                </div>
              </div>
              <!-- 普通礼包显示购买按钮 -->
              <div v-else>
                
                <UButton 
                  @click.stop="buyProduct(product)" 
                  :loading="purchaseLoading[product.id]"
                  color="primary" 
                  size="lg" 
                  block
                  class="price-buy-button"
                >
                <div class="button-content">
                  <div class="button-price">
                    <template v-if="product.price_platform_coins > 0">
                      <img src="/platform-coin.svg" alt="平台币" class="coin-icon-button" />
                      <span>{{ formatCoins(product.price_platform_coins) }}</span>
                    </template>
                    <template v-else-if="product.price_real_money > 0">
                      <span class="money-symbol">¥</span>
                      <span>{{ formatMoney(product.price_real_money) }}</span>
                    </template>
                  </div>
                  <span class="button-text">立即购买</span>
                </div>
              </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 购买确认弹窗 -->
    <UModal v-model="showPurchaseModal">
      <UCard>
        <template #header>
          <div class="modal-header">
            <h3 class="text-lg font-semibold">确认购买</h3>
            <button @click="showPurchaseModal = false" class="close-button">
              <UIcon name="i-heroicons-x-mark" />
            </button>
          </div>
        </template>

          <div v-if="selectedProduct" class="purchase-modal-content">
          <div class="product-summary">
            <img 
              :src="selectedProduct.icon_url || '/default-gift.svg'" 
              :alt="selectedProduct.package_name"
              class="modal-product-image"
            />
            <div class="modal-product-info">
              <div class="modal-description-scroll">
                <p class="modal-description-text">{{ selectedProduct.description || '暂无描述' }}</p>
              </div>
            </div>
          </div>

          <!-- 角色选择下拉 -->
          <div class="detail-row character-row">
            <span>选择角色：<span class="required-mark">*</span></span>
            <div class="character-select">
              <USelectMenu
                v-model="selectedCharacterUuid"
                :options="characterSelectOptions"
                value-attribute="value"
                option-attribute="label"
                placeholder="请选择角色"
              />
            </div>
          </div>
          
          <!-- 红色警告提示 -->
          <div class="character-warning">
            <UIcon name="i-heroicons-exclamation-triangle" class="warning-icon" />
            <span class="warning-text">⚠️ 请仔细选择角色，选择后物品将发送到该角色，请勿选错！</span>
          </div>
          
          <div v-if="!characterSelectOptions.length" class="character-empty">
            暂无可用角色，请先创建游戏角色
          </div>

          <div class="gift-name-row">
            <span class="gift-name-label">礼包名称：</span>
            <span class="gift-name-text">{{ selectedProduct.package_name }}</span>
          </div>

          <div v-if="selectedProduct.gift_items && selectedProduct.gift_items.length > 0" class="gift-items">
            <h5>礼包内容</h5>
            <ul class="items-list">
              <li v-for="(item, index) in parseGiftItems(selectedProduct.gift_items)" :key="index" class="item-entry">
                <span class="item-order">{{ (index + 1).toString().padStart(2, '0') }}</span>
                <span class="item-name">{{ getItemNameSync(item.i) }}</span>
                <span class="item-qty">x{{ item.a }}</span>
              </li>
            </ul>
          </div>

          <div class="purchase-details">
            <div class="detail-row">
              <span>支付方式：</span>
            </div>
            <div class="payment-method-list">
              <button
                v-for="method in paymentMethods"
                :key="method.id"
                type="button"
                class="payment-method-button"
                :class="{ active: selectedPaymentMethod === method.id }"
                @click="selectedPaymentMethod = method.id"
              >
                <img :src="method.icon" :alt="method.name" />
                <span>{{ method.name }}</span>
              </button>
            </div>
            <div v-if="paymentMethods.length === 0" class="payment-warning">
              暂无可用支付方式，请联系管理员
            </div>

            <div class="detail-row">
              <span>商品价格：</span>
              <span v-if="selectedPaymentMethod === 'ptb'" class="price-with-icon">
                <img src="/platform-coin.svg" alt="平台币" class="coin-icon-small" />
                {{ formatCoins(selectedProduct.price_platform_coins) }}
              </span>
              <span v-else class="price-with-icon rmb">
                <span class="money-symbol">¥</span>
                {{ formatMoney(selectedProduct.price_real_money) }}
              </span>
            </div>

            <div v-if="selectedPaymentMethod === 'ptb'" class="detail-row">
              <span>当前余额：</span>
              <span class="balance price-with-icon">
                <img src="/platform-coin.svg" alt="平台币" class="coin-icon-small" />
                {{ formatCoins(authStore.userInfo?.platform_coins || 0) }}
              </span>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="modal-single-action">
            <UButton 
              @click="confirmPurchase" 
              :loading="confirmLoading"
              color="primary"
              size="lg"
              block
            >
              {{ selectedPaymentMethod === 'ptb' ? '确认购买' : '前往支付' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useCookie } from '#app';
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

// 记录上次选择的角色索引（使用cookie）
const lastCharacterIndexCookie = useCookie('mall_last_character_index', {
  path: '/',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30 // 30天
});

// 响应式数据
const products = ref([]);
const categories = ref([]);
const currentCategory = ref('general');
const loading = ref(false);
const showPurchaseModal = ref(false);
const selectedProduct = ref(null);
const purchaseLoading = ref({});
const confirmLoading = ref(false);
const scrollingProducts = ref({});
const paymentMethods = ref([]);
const selectedPaymentMethod = ref('ptb');

const characterList = ref([]);
const characterSelectOptions = computed(() =>
  characterList.value.map(char => ({
    value: char.uuid,
    label: `${char.server_name}-${char.character_name} (Lv.${char.character_level || 1})`,
    subuser_id: char.subuser_id,
    server_id: char.server_id
  }))
);
const selectedCharacterUuid = ref(null);
const selectedCharacter = computed(() =>
  characterList.value.find(c => c.uuid === selectedCharacterUuid.value)
);

const hotProductsCount = computed(() => {
  // 假设价格超过500平台币的为热门商品
  return products.value.filter(product => product.price_platform_coins >= 500).length;
});

const isRmbCategory = (category) => ['general', 'hero_super_weapon', 'daily_recharge', 'limited', 'scheduled'].includes(category);
const isAutoGrantCategory = (category) => ['daily', 'cumulative'].includes(category);

const CATEGORY_TABS = [
  { key: 'general', label: '通用礼包' },
  { key: 'hero_super_weapon', label: '英雄超武' },
  { key: 'daily_recharge', label: '每日必买' },
  { key: 'daily', label: '每日消费' },
  { key: 'cumulative', label: '累计消费' },
  { key: 'limited', label: '限时礼包' },
  { key: 'scheduled', label: '限期礼包' }
];

// 动态生成分类页签
const categoryTabs = computed(() => {
  const available = categories.value.length > 0 ? categories.value : CATEGORY_TABS.map(tab => tab.key);
  return CATEGORY_TABS.filter(tab => available.includes(tab.key));
});

// 方法
const formatCoins = (coins) => {
  if (!coins) return '0';
  return Math.floor(parseFloat(coins)).toString();
};

const formatMoney = (money) => {
  const value = Number(money || 0);
  return value.toFixed(2);
};

const handleImageError = (event) => {
  event.target.src = '/default-gift.svg';
};

const toggleProductScroll = (productId) => {
  scrollingProducts.value[productId] = !scrollingProducts.value[productId];
};

const getScrollStyle = (product) => {
  if (!scrollingProducts.value[product.id]) return {};
  
  // 计算动画时长，基于文字长度
  const textLength = product.description?.length || 0;
  const duration = Math.max(6, Math.min(15, textLength * 0.05));
  
  return {
    animationDuration: `${duration}s`
  };
};

// 计算剩余时间（限时礼包）
const getTimeRemaining = (endTime) => {
  if (!endTime) return '';
  
  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();
  
  if (diff <= 0) return '已结束';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `剩${days}天${hours}时`;
  if (hours > 0) return `剩${hours}时${minutes}分`;
  return `剩${minutes}分`;
};

// 获取限期礼包标签（限期礼包）
const getScheduledLabel = (product) => {
  if (!product.available_weekdays) {
    return '未设置日期';
  }
  
  const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const availableDays = String(product.available_weekdays).split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 7);
  
  if (availableDays.length === 0) {
    return '未设置日期';
  }
  
  // 只有一天（单选模式）
  if (availableDays.length === 1) {
    return `${weekdayNames[availableDays[0] - 1]}限定`;
  }
  
  // 兼容旧数据：如果是多天
  if (availableDays.length === 7) {
    return '每天可用';
  }
  
  if (availableDays.length <= 3) {
    const dayLabels = availableDays.map(day => weekdayNames[day - 1]);
    return dayLabels.join('/');
  } else {
    const firstDay = weekdayNames[availableDays[0] - 1];
    return `${firstDay}等${availableDays.length}天`;
  }
};

// 定时更新倒计时
const timeUpdateInterval = ref(null);

const startTimeUpdate = () => {
  // 每分钟更新一次倒计时
  timeUpdateInterval.value = setInterval(() => {
    // 强制重新渲染，更新所有倒计时
    if (products.value.length > 0) {
      products.value = [...products.value];
    }
  }, 60000); // 60秒更新一次
};

const buyProduct = async (product) => {
  selectedProduct.value = product;
  // 默认选中平台币支付
  selectedPaymentMethod.value = 'ptb';
  showPurchaseModal.value = true;
  // 不再强制重置角色选择，如果cookie里有上次的选择会在 loadUserCharacters 里恢复
  await loadUserCharacters();
  await ensurePaymentMethods();
  await ensureItemNameCache();
};

const parseGiftItems = (giftItems) => {
  try {
    if (typeof giftItems === 'string') {
      return JSON.parse(giftItems);
    }
    return giftItems || [];
  } catch (e) {
    return [];
  }
};

// 物品名称映射缓存
const itemNameCache = ref({});
const itemNamesLoaded = ref(false);

const ensureItemNameCache = async () => {
  if (itemNamesLoaded.value) return;
  try {
    const response = await $fetch('/api/user/item-config', {
      query: { action: 'list', pageSize: 20000 }
    });
    const list = response?.data?.list || response?.data || response?.list || [];
    if (Array.isArray(list) && list.length > 0) {
      const cache = {};
      list.forEach((item) => {
        const key = item.id != null ? String(item.id) : null;
        if (!key) return;
        const name = item.cn || item.n || item.name || item.desc || `道具${key}`;
        cache[key] = name;
      });
      itemNameCache.value = cache;
      itemNamesLoaded.value = true;
    }
  } catch (error) {
    console.error('获取物品配置失败:', error);
  }
};

const getItemNameSync = (itemId) => {
  const cache = itemNameCache.value;
  const key = itemId != null ? String(itemId) : '';
  return cache[key] || `道具${itemId}`;
};

const getPaymentMethodName = (method) => {
  const nameMap = {
    wx: '微信支付',
    zfb: '支付宝',
    ptb: '平台币',
    djq: '代金券',
    kf: '客服'
  };
  return nameMap[method] || method;
};

const getDefaultIcon = (method) => {
  const iconMap = {
    wx: '/wx.png',
    zfb: '/zfb.png',
    ptb: '/platform-coin.svg',
    djq: '/djq.png',
    kf: '/kf.png'
  };
  return iconMap[method] || '/default.png';
};

const goToRecharge = () => {
  showPurchaseModal.value = false;
  router.push('/user/cashier');
};

const confirmPurchase = async () => {
  if (!selectedProduct.value) return;
  
  // 强制检查角色选择
  if (!selectedCharacterUuid.value || !selectedCharacter.value) {
    tips.error('请先选择要接收物品的角色！');
    return;
  }
  if (selectedPaymentMethod.value !== 'ptb') {
    await submitRmbPurchase();
    return;
  }

  // 防止重复提交
  if (confirmLoading.value) {
    console.log('正在处理中，请勿重复点击');
    return;
  }
  
  confirmLoading.value = true;
  try {
    const userId = authStore.userInfo?.id || authStore.id;
    if (!userId) {
      tips.error('用戶信息獲取失敗');
      return;
    }
    const character = selectedCharacter.value;
    
    // 调试信息
    console.log('selectedProduct:', selectedProduct.value);
    console.log('购买参数:', {
      user_id: userId,
      package_id: selectedProduct.value.package_id || selectedProduct.value.id,
      character_uuid: character?.uuid,
      server_id: character?.server_id,
      character: character
    });
    
    // 🔒 不再传递quantity参数，后端强制为1
    const requestBody = {
      user_id: userId,
      package_id: selectedProduct.value.package_id || selectedProduct.value.id,
      character_uuid: character.uuid,
      server_id: character.server_id
    };
    
    const response = await $fetch('/api/client/gift-packages/purchase', {
      method: 'POST',
      body: requestBody
    });
    if (response.code === 200) {
      tips.success('购买成功！');
      showPurchaseModal.value = false;
      selectedProduct.value = null;
      // 刷新余额
      await authStore.refreshBalance();
    } else {
      // 平台币余额不足的特殊提示
      if (response.code === 400 && response.message && response.message.includes('平台币余额不足')) {
        tips.error('平台币余额不足，请先购买平台币');
      } else {
        tips.error(response.message || '购买失败');
      }
    }
  } catch (error) {
    console.error('购买失败:', error);
    tips.error('购买失败，请稍后重试');
  } finally {
    confirmLoading.value = false;
  }
};

const submitRmbPurchase = async () => {
  if (!selectedProduct.value) return;
  if (!selectedPaymentMethod.value || selectedPaymentMethod.value === 'ptb') {
    tips.error('请选择支付方式');
    return;
  }
  const availableRmbMethods = paymentMethods.value.filter(m => m.id !== 'ptb');
  if (availableRmbMethods.length === 0) {
    tips.error('暂无可用支付方式');
    return;
  }
  
  // 防止重复提交
  if (confirmLoading.value) {
    console.log('正在处理中，请勿重复点击');
    return;
  }
  
  confirmLoading.value = true;
  try {
    const userInfo = authStore.userInfo;
    if (!userInfo?.username) {
      tips.error('用户信息获取失败');
      return;
    }
    const character = selectedCharacter.value;
    if (!character) {
      tips.error('请选择角色');
      return;
    }

    const transactionId = `${selectedPaymentMethod.value}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 简化元数据，避免 server_url 过长导致数据库插入失败
    const meta = {
      pid: selectedProduct.value.package_id || selectedProduct.value.id,  // package_id
      cid: character.uuid,             // character_uuid
      sid: character.server_id || 1    // server_id
    };
    const metaEncoded = encodeURIComponent(JSON.stringify(meta));

    const sdkParams = {
      z: selectedPaymentMethod.value,
      f: userInfo.username,
      p: Number(selectedProduct.value.price_real_money || 0).toFixed(2),
      j: userInfo.game_code || 'hzwqh',
      k: `礼包-${selectedProduct.value.package_name}`,
      l: `购买礼包：${selectedProduct.value.package_name}`,
      y: transactionId,
      h: String(character.server_id || 1),
      c: 'web',
      tr: character.subuser_id || '',
      xx: transactionId,
      os: 'web',
      d: userInfo.game_code || 'hzwqh',
      e: userInfo.channel_code || '',
      x: userInfo.thirdparty_uid || userInfo.username,
      server_url: `gift://${metaEncoded}`,
      role_id: character.uuid,
      // gift 订单无需走平台币收银台逻辑
      cashier_payment: 'false'
    };

    const response = await $fetch('/api/user/cashier/pay', {
      method: 'POST',
      body: sdkParams
    });

    if (response.code === 1) {
      tips.success('订单创建成功，请完成付款');
      showPurchaseModal.value = false;
      selectedProduct.value = null;
      

      
      if (response.data) {
        window.location.href = response.data;
      }
    } else {
      tips.error(response.msg || '支付订单创建失败');
    }
  } catch (error) {
    console.error('创建礼包支付订单失败:', error);
    const message = error?.data?.message || error?.message || '下单失败，请稍后重试';
    tips.error(message);
  } finally {
    confirmLoading.value = false;
  }
};


// 获取子账号和角色
const loadUserCharacters = async () => {
  const userId = authStore.userInfo?.id || authStore.id;
  if (!userId) return;
  const res = await $fetch('/api/client/getUserCharacters', { query: { user_id: userId } });
  if (res.code === 200) {
    const list = res.data.characters || [];
    characterList.value = list;
    if (list.length > 0) {
      // 优先使用cookie里记录的上次选择的角色索引
      const lastIndex = parseInt(lastCharacterIndexCookie.value);
      const validIndex = !isNaN(lastIndex) && lastIndex >= 0 && lastIndex < list.length;
      
      let targetIndex;
      if (validIndex) {
        // 如果cookie有值,使用cookie记录的索引
        targetIndex = lastIndex;
      } else {
        // 如果cookie没有值,选择等级最高的角色
        const sortedByLevel = [...list].sort((a, b) => {
          const levelA = a.character_level || 0;
          const levelB = b.character_level || 0;
          return levelB - levelA; // 降序排列,等级高的在前
        });
        const highestLevelChar = sortedByLevel[0];
        targetIndex = list.findIndex(c => c.uuid === highestLevelChar.uuid);
        // 如果找不到(理论上不会),则使用0
        if (targetIndex < 0) targetIndex = 0;
      }
      
      selectedCharacterUuid.value = list[targetIndex].uuid;
    } else {
      selectedCharacterUuid.value = null;
    }
  } else {
    characterList.value = [];
    selectedCharacterUuid.value = null;
  }
};

// 监听角色选择，写入cookie（保存索引）
watch(selectedCharacterUuid, (val) => {
  if (val) {
    const index = characterList.value.findIndex(c => c.uuid === val);
    if (index >= 0) {
      lastCharacterIndexCookie.value = index.toString();
    }
  }
});

const ensurePaymentMethods = async () => {
  if (paymentMethods.value.length === 0) {
    await loadPaymentMethods();
  }
};

const loadPaymentMethods = async () => {
  try {
    const response = await $fetch('/api/user/payment-settings/active');
    const activeSettings = response.data || [];
    //const filtered = activeSettings.filter(setting => ['wx', 'zfb'].includes(setting.payment_method));
    const filtered = [];
    const methods = [];
    // 平台币支付始终可选
    methods.push({
      id: 'ptb',
      name: getPaymentMethodName('ptb'),
      icon: getDefaultIcon('ptb')
    });

    // 追加已开启的微信/支付宝
    filtered.forEach(setting => {
      methods.push({
        id: setting.payment_method,
        name: setting.name || getPaymentMethodName(setting.payment_method),
        icon: setting.icon_url || getDefaultIcon(setting.payment_method)
      });
    });

    paymentMethods.value = methods;
    selectedPaymentMethod.value = 'ptb';
  } catch (error) {
    console.error('加载支付方式失败:', error);
    tips.error('加载支付方式失败');
  }
};

// 监听下拉变化
// 选择分类
const selectCategory = (category) => {
  currentCategory.value = category;
  loadProducts();
};

// 加载商品分类
const loadCategories = async () => {
  try {
    const response = await $fetch('/api/client/gift-packages/categories');
    if (response.code === 200) {
      categories.value = response.data || [];
      const tabs = categoryTabs.value;
      if (tabs.length > 0) {
        currentCategory.value = tabs[0].key;
      }
    } else {
      console.error('获取分类列表失败:', response.message);
    }
  } catch (error) {
    console.error('加载分类失败:', error);
  }
};

// 加载商品列表
const loadProducts = async () => {
  loading.value = true;
  try {
    // 调用真实的API获取礼包列表
    const url = currentCategory.value 
      ? `/api/client/gift-packages?category=${encodeURIComponent(currentCategory.value)}`
      : '/api/client/gift-packages';
    
    const response = await $fetch(url);
    
    if (response.code === 200) {
      products.value = (response.data || []).map(item => ({
        ...item,
        price_real_money: Number(item.price_real_money || 0),
        price_platform_coins: Number(item.price_platform_coins || 0)
      }));
    } else {
      console.error('获取礼包列表失败:', response.message);
      tips.error(response.message || '获取礼包列表失败');
    }
  } catch (error) {
    console.error('加载商品失败:', error);
    tips.error('加载商品失败');
  } finally {
    loading.value = false;
  }
};

// 页面加载时初始化
onMounted(() => {
  loadCategories();
  loadProducts();
  ensurePaymentMethods();
  ensureItemNameCache();
  loadUserCharacters();
  startTimeUpdate(); // 启动倒计时更新
});

// 页面卸载时清理定时器
onUnmounted(() => {
  if (timeUpdateInterval.value) {
    clearInterval(timeUpdateInterval.value);
  }
  console.log('[页面卸载] 页面清理完成');
  // 注：支付询单由后端定时任务自动处理，无需前端定时器
});
</script>

<style scoped>
.mall-container {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #2d3748;
}

.page-header p {
  margin: 0;
  color: #718096;
  font-size: 16px;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 18px;
  flex-shrink: 0;
}

.stat-content h4 {
  margin: 0 0 6px;
  font-size: 12px;
  color: #718096;
  font-weight: 500;
}

.stat-value {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #2d3748;
}

/* 分类页签样式 */
.category-tabs {
  margin-bottom: 24px;
  padding: 0 4px;
}

.tab-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tab-container::-webkit-scrollbar {
  display: none;
}

.tab-button {
  flex-shrink: 0;
  padding: 12px 20px;
  border: 2px solid #e2e8f0;
  background: white;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  color: #718096;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}

.tab-button:hover {
  border-color: #667eea;
  color: #667eea;
  background: rgba(102, 126, 234, 0.05);
  transform: translateY(-1px);
}

.tab-button.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.tab-button.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
  pointer-events: none;
}

.products-section {
  margin-bottom: 32px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: white;
  border-radius: 12px;
}

.loading-state UIcon {
  font-size: 32px;
  color: #667eea;
  margin-bottom: 16px;
}

.empty-state UIcon {
  font-size: 64px;
  color: #cbd5e0;
  margin-bottom: 24px;
}

.empty-state h3 {
  margin: 0 0 12px;
  font-size: 20px;
  color: #2d3748;
}

.empty-state p {
  margin: 0;
  color: #718096;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.product-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s;
}

.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.product-image {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 时间标签样式 */
.time-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  animation: badge-pulse 2s ease-in-out infinite;
  z-index: 1;
}

.badge-icon {
  font-size: 14px;
}

/* 限时礼包标签（红色主题） */
.limited-badge {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* 限期礼包标签（紫色主题） */
.scheduled-badge {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.95) 0%, rgba(124, 58, 237, 0.95) 100%);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* 标签脉动动画 */
@keyframes badge-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.product-info {
  padding: 20px;
}

.product-name {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
}

.description-container {
  height: 3.6em; /* 固定3行高度 */
  overflow: hidden;
  margin: 0 0 12px;
  position: relative;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.description-container:hover {
  background-color: rgba(102, 126, 234, 0.05);
}

.product-description {
  margin: 0;
  font-size: 14px;
  color: #718096;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  word-wrap: break-word;
  transition: all 0.5s ease;
  padding: 2px;
}

.product-description.scrolling {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
  animation: smooth-scroll 8s ease-in-out infinite;
  background: linear-gradient(180deg, transparent 0%, rgba(102, 126, 234, 0.1) 50%, transparent 100%);
}

@keyframes smooth-scroll {
  0% {
    transform: translateY(0);
  }
  20% {
    transform: translateY(0);
  }
  80% {
    transform: translateY(calc(-100% + 3.4em));
  }
  100% {
    transform: translateY(0);
  }
}

.modal-description-scroll {
  margin-bottom: 16px;
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.modal-description-text {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
  word-wrap: break-word;
}

.gift-name-row {
  margin: 12px 0 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.gift-name-label {
  font-size: 14px;
  color: #64748b;
  font-weight: 500;
}

.gift-name-text {
  font-size: 18px;
  color: #1e293b;
  font-weight: 700;
  flex: 1;
}

.gift-items {
  margin: 10px 0 20px;
  padding: 18px 22px;
  background: #f8faff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}

.gift-items h5 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.items-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-entry {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #edf2f7;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05);
}

.item-order {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #eef2ff, #e0f2ff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
  font-weight: 600;
  font-size: 13px;
}

.item-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.item-qty {
  font-size: 14px;
  font-weight: 700;
  color: #5b21b6;
}



.price-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.current-price {
  font-size: 20px;
  font-weight: 700;
  color: #667eea;
  display: flex;
  align-items: center;
  gap: 6px;
}

.coin-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.coin-icon-small {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.price-with-icon {
  display: flex;
  align-items: center;
  gap: 4px;
}

.price-with-icon.rmb {
  color: #2d3748;
  font-weight: 600;
}

.product-actions {
  margin-top: 16px;
}

.price-buy-button {
  position: relative;
}

.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.button-price {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
}

.money-symbol {
  font-weight: 700;
  font-size: 16px;
}

.coin-icon-button {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.button-text {
  font-weight: 600;
}

.auto-gift-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid #0ea5e9;
  border-radius: 8px;
  color: #0369a1;
  font-size: 14px;
  font-weight: 500;
}

.auto-gift-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.auto-gift-price {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 700;
  color: #ffb200;
}

.coin-icon-auto {
  width: 18px;
  height: 18px;
}

/* 限购提示样式 - 统一样式（显示在商品卡片中） */
.purchase-limit-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border: 1px solid #f87171;
  border-radius: 6px;
  font-size: 12px;
  color: #991b1b;
  font-weight: 600;
}

.purchase-limit-badge .limit-icon,
.purchase-limit-badge svg {
  width: 14px;
  height: 14px;
  color: #dc2626;
  flex-shrink: 0;
}


.character-row {
  align-items: center;
}

.character-select {
  flex: 1;
}

.character-select :deep(.nui-select-menu) {
  width: 100%;
}

.character-empty {
  margin-top: 4px;
  font-size: 12px;
  color: #ef4444;
}

/* 必填标记 */
.required-mark {
  color: #e53e3e;
  font-weight: bold;
  margin-left: 2px;
  font-size: 16px;
}

/* 角色选择警告提示 */
.character-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: linear-gradient(135deg, #fff5f5 0%, #fed7d7 100%);
  border: 2px solid #fc8181;
  border-radius: 8px;
  margin: 12px 0;
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.15);
  animation: pulse-warning 2s ease-in-out infinite;
}

@keyframes pulse-warning {
  0%, 100% {
    border-color: #fc8181;
  }
  50% {
    border-color: #e53e3e;
  }
}

.character-warning .warning-icon {
  color: #e53e3e;
  font-size: 20px;
  flex-shrink: 0;
}

.character-warning .warning-text {
  color: #c53030;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  flex: 1;
}

/* 购买弹窗样式 */
.purchase-modal-content {
  padding: 16px 0;
}

.product-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.modal-product-image {
  width: 84px;
  height: 84px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.modal-product-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-product-info p {
  margin: 0;
  font-size: 14px;
  color: #718096;
  line-height: 1.5;
}

.modal-price {
  font-size: 20px;
  font-weight: 700;
  color: #667eea;
  display: flex;
  align-items: center;
  gap: 6px;
}

.purchase-details {
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.detail-row.total {
  border-top: 1px solid #e2e8f0;
  margin-top: 8px;
  padding-top: 16px;
  font-weight: 600;
}

.payment-method-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.payment-method-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.payment-method-button img {
  width: 28px;
  height: 28px;
}

.payment-method-button:hover {
  border-color: #667eea;
}

.payment-method-button.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.08);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.18);
}

.payment-warning {
  margin-top: 8px;
  color: #e53e3e;
  font-size: 13px;
}

.balance {
  color: #38a169;
}

.total-amount {
  color: #667eea;
  font-size: 18px;
}

.insufficient-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fed7d7;
  border-radius: 8px;
  color: #e53e3e;
  margin-bottom: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.close-button {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  border-radius: 6px;
  color: #718096;
  font-size: 20px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
}

.close-button:hover {
  background-color: #f7fafc;
  color: #e53e3e;
  transform: scale(1.1);
}

.modal-single-action {
  width: 100%;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .mall-container {
    padding: 12px;
  }

  .page-header h1 {
    font-size: 24px;
  }

  .page-header {
    margin-bottom: 20px;
  }

  /* 统计卡片移动端优化 */
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 20px;
  }

  .stat-card {
    padding: 12px;
    gap: 8px;
    flex-direction: column;
    text-align: center;
  }

  .stat-icon {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }

  .stat-content h4 {
    font-size: 10px;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 16px;
  }
  
  /* 分类页签移动端优化 */
  .category-tabs {
    margin-bottom: 20px;
    padding: 0 2px;
  }
  
  .tab-container {
    gap: 6px;
    padding: 6px 0;
  }
  
  .tab-button {
    padding: 8px 16px;
    font-size: 13px;
    border-radius: 20px;
  }
  
  /* 商品网格移动端优化 */
  .products-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .product-card {
    border-radius: 8px;
  }

  .product-image {
    height: 120px;
  }
  
  /* 移动端时间标签适配 */
  .time-badge {
    top: 8px;
    right: 8px;
    padding: 4px 8px;
    font-size: 11px;
    gap: 4px;
  }
  
  .badge-icon {
    font-size: 12px;
  }

  .product-info {
    padding: 12px;
  }

  .product-name {
    font-size: 14px;
    margin-bottom: 6px;
  }

  .description-container {
    height: 2.4em;
    margin-bottom: 8px;
  }

  .product-description {
    font-size: 12px;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .product-description.scrolling {
    animation: smooth-scroll-mobile 6s ease-in-out infinite;
  }

  @keyframes smooth-scroll-mobile {
    0% {
      transform: translateY(0);
    }
    20% {
      transform: translateY(0);
    }
    80% {
      transform: translateY(calc(-100% + 2.2em));
    }
    100% {
      transform: translateY(0);
    }
  }

  .current-price {
    font-size: 16px;
    gap: 4px;
  }

  .coin-icon {
    width: 16px;
    height: 16px;
  }

  .price-section {
    margin-bottom: 12px;
  }

  .product-actions {
    margin-top: 12px;
  }

  .product-actions :deep(.btn) {
    height: 36px;
    font-size: 13px;
  }
  
  .product-summary {
    flex-direction: column;
  }
  
  .modal-single-action {
    width: 100%;
  }

  .close-button {
    min-width: 28px;
    min-height: 28px;
    font-size: 18px;
  }
  
  /* 移动端警告提示优化 */
  .character-warning {
    padding: 10px;
    gap: 6px;
    margin: 10px 0;
  }
  
  .character-warning .warning-icon {
    font-size: 18px;
  }
  
  .character-warning .warning-text {
    font-size: 13px;
  }
}

/* 小屏设备进一步优化 */
@media (max-width: 480px) {
  .mall-container {
    padding: 8px;
  }

  /* 统计卡片更紧凑 */
  .stats-grid {
    gap: 6px;
    margin-bottom: 16px;
  }

  .stat-card {
    padding: 10px;
    gap: 6px;
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }

  .stat-content h4 {
    font-size: 9px;
  }

  .stat-value {
    font-size: 14px;
  }

  /* 分类页签更紧凑 */
  .category-tabs {
    margin-bottom: 16px;
    padding: 0 1px;
  }
  
  .tab-container {
    gap: 4px;
    padding: 4px 0;
  }
  
  .tab-button {
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 16px;
  }

  /* 商品网格更紧凑 */
  .products-grid {
    gap: 8px;
  }

  .product-card {
    border-radius: 6px;
  }

  .product-image {
    height: 100px;
  }
  
  /* 小屏幕时间标签适配 */
  .time-badge {
    top: 6px;
    right: 6px;
    padding: 3px 6px;
    font-size: 10px;
    gap: 3px;
  }
  
  .badge-icon {
    font-size: 10px;
  }

  .product-info {
    padding: 10px;
  }

  .product-name {
    font-size: 13px;
    margin-bottom: 4px;
  }

  .description-container {
    height: 2.2em;
    margin-bottom: 6px;
  }

  .product-description {
    font-size: 11px;
  }

  .current-price {
    font-size: 14px;
  }

  .coin-icon {
    width: 14px;
    height: 14px;
  }

  .price-section {
    margin-bottom: 8px;
  }

  .product-actions {
    margin-top: 8px;
  }

  .product-actions :deep(.btn) {
    height: 32px;
    font-size: 12px;
  }
  
  /* 超小屏幕警告提示进一步优化 */
  .character-warning {
    padding: 8px;
    gap: 6px;
    margin: 8px 0;
  }
  
  .character-warning .warning-icon {
    font-size: 16px;
  }
  
  .character-warning .warning-text {
    font-size: 12px;
  }
}
</style> 