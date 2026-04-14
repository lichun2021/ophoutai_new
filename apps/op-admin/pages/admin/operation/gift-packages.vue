<template>
  <div class="gift-packages-management">
    <!-- 页面标题 -->
    <div class="page-header mb-6">
      <h1 class="text-2xl font-semibold text-gray-900 mb-4">商城礼包管理</h1>
      <div class="flex flex-wrap gap-2">
        <UButton @click="showCreateGiftPackageModal = true" color="primary">
          <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-2" />
          新增礼包
        </UButton>
        <UButton @click="showItemConfigModal = true" color="gray">
          <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 mr-2" />
          物品配置
        </UButton>
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <UFormGroup label="分类">
          <USelect v-model="filters.category" :options="categoryOptions" />
        </UFormGroup>
        <UFormGroup label="状态">
          <USelect v-model="filters.is_active" :options="statusOptions" />
        </UFormGroup>
        <UFormGroup label="游戏代码">
          <UInput v-model="filters.game_code" placeholder="游戏代码" />
        </UFormGroup>
        <UFormGroup label="操作">
          <div class="flex space-x-2">
            <UButton @click="loadGiftPackages" color="primary">查询</UButton>
            <UButton @click="resetFilters" color="gray">重置</UButton>
          </div>
        </UFormGroup>
      </div>
    </div>

    <!-- 礼包列表 -->
    <div class="bg-white rounded-lg shadow">
      <UTable
        :rows="giftPackages"
        :columns="columns"
        :loading="loading"
        @select="handleSelect"
      >
        <template #is_active-data="{ row }">
          <UBadge :color="row.is_active ? 'green' : 'red'">
            {{ row.is_active ? '启用' : '禁用' }}
          </UBadge>
        </template>
        
        <template #price_platform_coins-data="{ row }">
          <span class="font-medium">{{ row.price_platform_coins }}</span>
        </template>
        
        <template #gift_items_display-data="{ row }">
          <div class="max-w-xs truncate" :title="row.gift_items_display">
            {{ row.gift_items_display }}
          </div>
        </template>
        
        <template #created_at-data="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
        
        <template #actions-data="{ row }">
          <div class="flex space-x-2">
            <UButton size="sm" color="blue" @click="editGiftPackage(row)">
              编辑
            </UButton>
            <UButton size="sm" color="red" @click="deleteGiftPackage(row)">
              删除
            </UButton>
          </div>
        </template>
      </UTable>

      <!-- 分页 -->
      <div class="flex justify-between items-center p-4 border-t">
        <div class="text-sm text-gray-500">
          共 {{ pagination.total }} 条记录
        </div>
        <UPagination
          v-model="pagination.page"
          :page-count="pagination.pageSize"
          :total="pagination.total"
          @update:model-value="loadGiftPackages"
        />
      </div>
    </div>

    <!-- 新增/编辑礼包弹窗 -->
    <UModal v-model="showCreateGiftPackageModal" :ui="{ width: 'max-w-4xl' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">
            {{ editingGiftPackage ? '编辑礼包' : '新增礼包' }}
          </h3>
        </template>

        <UForm ref="giftPackageForm" :state="giftPackageForm" @submit="submitGiftPackage">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormGroup label="礼包代码" required>
              <UInput v-model="giftPackageForm.package_code" placeholder="礼包代码" />
            </UFormGroup>
            
            <UFormGroup label="礼包名称" required>
              <UInput v-model="giftPackageForm.package_name" placeholder="礼包名称" />
            </UFormGroup>
            
            <UFormGroup label="平台币价格" required>
              <UInput v-model.number="giftPackageForm.price_platform_coins" type="number" placeholder="平台币价格" />
            </UFormGroup>
            
            <UFormGroup label="现金价格">
              <UInput v-model.number="giftPackageForm.price_real_money" type="number" placeholder="现金价格（展示用）" />
            </UFormGroup>
            
            <UFormGroup label="分类">
              <USelect v-model="giftPackageForm.category" :options="categoryOptions" />
            </UFormGroup>
            
            <!-- 限时礼包的时间选择器 -->
            <UFormGroup v-if="giftPackageForm.category === 'limited'" label="限时时间" class="md:col-span-2">
              <UPopover :popper="{ placement: 'bottom-start' }">
                <UButton 
                  variant="outline" 
                  icon="i-heroicons-calendar-days"
                  class="w-full justify-start"
                >
                  {{ formatLimitedTimeRange(limitedTimeRange.start, limitedTimeRange.end) }}
                </UButton>
                
                <template #panel="{ close }">
                  <DatePicker v-model="limitedTimeRange" @close="close" />
                </template>
              </UPopover>
            </UFormGroup>
            
            <!-- 限期礼包的周几选择器 -->
            <UFormGroup v-if="giftPackageForm.category === 'scheduled'" label="可用日期" class="md:col-span-2">
              <USelect
                v-model="giftPackageForm.available_weekdays"
                :options="weekdayOptions"
                placeholder="选择可用的星期"
              />
            </UFormGroup>
            
            <UFormGroup label="排序权重">
              <UInput v-model.number="giftPackageForm.sort_order" type="number" placeholder="排序权重" />
            </UFormGroup>
            
            <UFormGroup label="是否启用">
              <UToggle v-model="giftPackageForm.is_active" />
            </UFormGroup>
            
            <UFormGroup label="是否限量">
              <UToggle v-model="giftPackageForm.is_limited" />
            </UFormGroup>
            
            <UFormGroup v-if="giftPackageForm.is_limited" label="总数量">
              <UInput v-model.number="giftPackageForm.total_quantity" type="number" placeholder="总数量" />
            </UFormGroup>
            
            <UFormGroup label="每用户限购">
              <UInput v-model.number="giftPackageForm.max_per_user" type="number" placeholder="0表示无限制" />
            </UFormGroup>
          </div>
          
          <UFormGroup label="描述" class="mt-4">
            <UTextarea v-model="giftPackageForm.description" placeholder="礼包描述" />
          </UFormGroup>

          <!-- 礼包图片 -->
          <UFormGroup label="礼包图片" class="mt-4">
            <div class="space-y-3">
              <!-- 当前图片预览 -->
              <div v-if="giftPackageForm.icon_url" class="flex items-center space-x-3">
                <img 
                  :src="giftPackageForm.icon_url" 
                  class="w-24 h-24 object-cover rounded-lg border"
                  alt="礼包图片"
                />
                <div class="flex-1">
                  <div class="text-sm text-gray-600 break-all">{{ giftPackageForm.icon_url }}</div>
                  <UButton 
                    color="red" 
                    size="xs" 
                    variant="soft"
                    class="mt-1"
                    @click="giftPackageForm.icon_url = ''"
                  >
                    移除
                  </UButton>
                </div>
              </div>
              
              <!-- 选择按钮 -->
              <UButton 
                @click="showImageSelectModal = true" 
                color="primary"
                size="sm"
              >
                <UIcon name="i-heroicons-photo" class="w-4 h-4 mr-1" />
                选择图片
              </UButton>
            </div>
          </UFormGroup>
          
          <!-- 礼包物品配置 -->
          <UFormGroup label="礼包物品" required class="mt-4">
            <div class="space-y-2">
              <div 
                v-for="(item, index) in giftPackageForm.gift_items" 
                :key="index"
                class="flex items-center space-x-2 p-3 border rounded-lg"
              >
                <UFormGroup label="物品" class="flex-1">
                  <USelectMenu
                    v-model.number="item.i"
                    :options="itemOptions"
                    value-attribute="value"
                    option-attribute="label"
                    :searchable="searchItems"
                    searchable-placeholder="按ID或名称搜索"
                    placeholder="选择物品（可搜索）"
                    @change="updateItemName(index)"
                  />
                </UFormGroup>
                <UFormGroup label="数量" class="flex-1">
                  <UInput v-model.number="item.a" type="number" placeholder="数量" />
                </UFormGroup>
                <div class="flex-2">
                  <div class="text-sm font-medium" :class="getItemDisplayClass(item.i)">
                    {{ getItemNameById(item.i) }}
                  </div>
                  <div class="text-xs text-gray-500">
                    ID: {{ item.i }}
                  </div>
                </div>
                <UButton 
                  size="sm" 
                  color="red" 
                  @click="removeGiftItem(index)"
                  :disabled="giftPackageForm.gift_items.length <= 1"
                >
                  删除
                </UButton>
              </div>
              <UButton 
                @click="addGiftItem" 
                color="gray" 
                size="sm"
                :disabled="giftPackageForm.gift_items.length >= 10"
              >
                添加物品 ({{ giftPackageForm.gift_items.length }}/10)
              </UButton>
            </div>
          </UFormGroup>
        </UForm>

        <template #footer>
          <div class="flex justify-end space-x-2">
            <UButton color="gray" @click="closeGiftPackageModal">取消</UButton>
            <UButton color="primary" @click="submitGiftPackage" :loading="submitting">
              {{ editingGiftPackage ? '更新' : '创建' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 物品配置弹窗 -->
    <UModal v-model="showItemConfigModal" :ui="{ width: 'max-w-6xl' }">
      <UCard>
        <template #header>
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold">物品配置管理（只读）</h3>
            <div class="text-sm text-gray-500">
              共 {{ items.length }} 个物品配置
            </div>
          </div>
        </template>

        <!-- 物品搜索 -->
        <div class="mb-4">
          <UInput 
            v-model="itemSearchTerm" 
            placeholder="搜索物品..." 
            @input="searchItemsDebounced"
          />
        </div>

        <!-- 物品列表 -->
        <UTable
          :rows="items"
          :columns="itemColumnsReadonly"
          :loading="itemsLoading"
          class="max-h-96 overflow-y-auto"
        />

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" @click="showItemConfigModal = false">关闭</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 图片选择弹窗 -->
    <UModal
      v-model="showImageSelectModal"
      :ui="{ width: 'w-[90vw] sm:w-[80vw] lg:w-[50vw] max-w-6xl' }"
    >
      <UCard>
        <template #header>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="text-lg font-semibold">选择图片</h3>
                <p class="text-xs text-gray-500 mt-1">目录: {{ imageDirectory }}</p>
              </div>
              <UButton 
                @click="loadImages" 
                color="gray" 
                size="sm"
                :loading="loadingImages"
              >
                <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
                刷新
              </UButton>
            </div>
            <div class="flex items-center gap-2">
              <UInput
                v-model="imageSearchTerm"
                icon="i-heroicons-magnifying-glass"
                placeholder="搜索图片文件名或链接"
                size="sm"
                class="flex-1"
              />
              <UButton
                color="gray"
                variant="soft"
                size="sm"
                :disabled="!imageSearchTerm"
                @click="imageSearchTerm = ''"
              >
                清空
              </UButton>
            </div>
          </div>
        </template>

        <!-- 加载状态 -->
        <div v-if="loadingImages" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p class="mt-2 text-gray-500">加载中...</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="images.length === 0" class="text-center py-12 text-gray-500">
          <UIcon name="i-heroicons-photo" class="w-16 h-16 mx-auto mb-2 opacity-50" />
          <p>目录中暂无图片文件</p>
        </div>

        <!-- 搜索无结果 -->
        <div v-else-if="filteredImages.length === 0" class="text-center py-12 text-gray-500">
          <UIcon name="i-heroicons-magnifying-glass" class="w-16 h-16 mx-auto mb-2 opacity-50" />
          <p>未找到匹配的图片</p>
        </div>

        <!-- 图片网格 -->
        <div v-else class="grid grid-cols-3 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto p-2">
          <div 
            v-for="image in filteredImages" 
            :key="image.filename"
            class="relative group cursor-pointer border-2 rounded-lg overflow-hidden hover:border-primary transition-all"
            :class="{ 'border-primary ring-2 ring-primary': giftPackageForm.icon_url === image.url }"
            @click="selectImage(image.url)"
          >
            <img 
              :src="image.url" 
              class="w-full h-32 object-cover"
              :alt="image.filename"
              @error="handleImageError"
            />
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
              <UIcon 
                v-if="giftPackageForm.icon_url === image.url"
                name="i-heroicons-check-circle-solid" 
                class="w-10 h-10 text-white"
              />
            </div>
            <div class="p-1.5 bg-gray-50">
              <p class="text-xs text-gray-600 truncate" :title="image.filename">
                {{ image.filename }}
              </p>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-between items-center">
            <div class="text-sm text-gray-500">
              显示 {{ filteredImages.length }} / {{ images.length }} 张图片
            </div>
            <UButton color="gray" @click="showImageSelectModal = false">关闭</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useAuthStore } from '~/store/auth';
import { useDebounceFn } from '@vueuse/core';

const authStore = useAuthStore();
const toast = useToast();

// 计算属性 - 是否是超级管理员
const isSuperAdmin = computed(() => {
  const permissions = authStore.permissions;
  return permissions && permissions.level === 0;
});

// 响应式数据
const loading = ref(false);
const submitting = ref(false);
const itemsLoading = ref(false);

// 礼包相关
const giftPackages = ref([]);
const showCreateGiftPackageModal = ref(false);
const editingGiftPackage = ref(null);

// 物品配置相关（只读）
const items = ref([]);
const showItemConfigModal = ref(false);
const itemSearchTerm = ref('');

// 图片选择相关
const showImageSelectModal = ref(false);
const loadingImages = ref(false);
const images = ref([]);
const imageDirectory = ref('');
const imageSearchTerm = ref('');
const filteredImages = computed(() => {
  const term = imageSearchTerm.value.trim().toLowerCase();
  if (!term) return images.value;
  return images.value.filter((image) => {
    const filename = String(image.filename || '').toLowerCase();
    const url = String(image.url || '').toLowerCase();
    return filename.includes(term) || url.includes(term);
  });
});

// 筛选和分页
const filters = reactive({
  category: '',
  is_active: '',
  game_code: 'hzwqh'
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// 表单数据
const giftPackageForm = reactive({
  package_code: '',
  package_name: '',
  description: '',
  icon_url: '',
  price_platform_coins: 0,
  price_real_money: 0,
  category: 'general',
  sort_order: 0,
  is_active: true,
  is_limited: false,
  total_quantity: 0,
  max_per_user: 0,
  gift_items: [{ i: 0, a: 1 }],
  // 限时礼包字段
  start_time: null,
  end_time: null,
  // 限期礼包字段（单选，存储单个数字）
  available_weekdays: null
});

// 限时礼包的日期选择器状态（初始化为当前日期，以触发范围选择模式）
const limitedTimeRange = ref({
  start: new Date(),
  end: new Date()
});

// itemForm 已移除，物品配置现在是只读的

// 选项配置
const categoryOptions = [
  { label: '全部', value: '' },
  { label: '通用礼包', value: 'general' },
  { label: '英雄超武', value: 'hero_super_weapon' },
  { label: '每日必买', value: 'daily_recharge' },
  { label: '每日消费', value: 'daily' },
  { label: '累计消费', value: 'cumulative' },
  { label: '限时礼包', value: 'limited' },
  { label: '限期礼包', value: 'scheduled' }
];

const statusOptions = [
  { label: '全部', value: '' },
  { label: '启用', value: 'true' },
  { label: '禁用', value: 'false' }
];

// 限期礼包的周几选项（1=周一, 7=周日）
const weekdayOptions = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 }
];

// 物品类型和稀有度选项已移除，因为物品配置现在是只读的

// 表格列配置
const columns = [
  { key: 'package_code', label: '礼包代码' },
  { key: 'package_name', label: '礼包名称' },
  { key: 'price_platform_coins', label: '平台币价格' },
  { key: 'price_real_money', label: '现金价格' },
  { key: 'category_label', label: '分类' },
  { key: 'gift_items_display', label: '礼包内容' },
  { key: 'is_active', label: '状态' },
  { key: 'created_at', label: '创建时间' },
  { key: 'actions', label: '操作' }
];

const CATEGORY_LABEL_MAP = {
  general: '通用礼包',
  hero_super_weapon: '英雄超武',
  daily_recharge: '每日必买',
  daily: '每日消费',
  cumulative: '累计消费',
  limited: '限时',
  scheduled: '限期礼包'
};

const itemColumns = [
  { key: 'id', label: '物品ID' },
  { key: 'n', label: '名称' },
  { key: 'type', label: '类型' },
  { key: 'rarity', label: '稀有度' },
  { key: 'actions', label: '操作' }
];

const itemColumnsReadonly = [
  { key: 'id', label: '物品ID' },
  { key: 'n', label: '中文名称' },
  { key: 'd', label: '描述' }
];

// 方法
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('zh-CN');
};

// 格式化日期（仅日期部分）
const formatDateOnly = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 格式化限时时间范围显示
const formatLimitedTimeRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '请选择限时时间段';
  
  // 如果开始和结束日期相同，且与表单的 start_time 为空，说明还没有真正选择
  if (!giftPackageForm.start_time && !giftPackageForm.end_time) {
    return '请选择限时时间段';
  }
  
  const start = formatDateOnly(startDate);
  const end = formatDateOnly(endDate);
  return `${start} 至 ${end}`;
};

// 监听限时时间选择器变化，同步到表单
watch(limitedTimeRange, (newRange) => {
  if (newRange.start && newRange.end) {
    giftPackageForm.start_time = formatDateOnly(newRange.start) + ' 00:00:00';
    giftPackageForm.end_time = formatDateOnly(newRange.end) + ' 23:59:59';
  } else {
    giftPackageForm.start_time = null;
    giftPackageForm.end_time = null;
  }
}, { deep: true });

// 监听分类变化，切换到限时礼包时确保日期选择器处于范围模式
watch(() => giftPackageForm.category, (newCategory, oldCategory) => {
  if (newCategory === 'limited' && oldCategory !== 'limited') {
    // 如果表单中没有时间数据，重置为今天（触发范围选择模式）
    if (!giftPackageForm.start_time || !giftPackageForm.end_time) {
      limitedTimeRange.value = { start: new Date(), end: new Date() };
    }
  }
});

// getRarityColor 函数已移除，因为不再显示稀有度

const getItemNameById = (itemId) => {
  if (!itemId) return '';
  
  // 如果物品配置还在加载中，显示加载状态
  if (itemsLoading.value || items.value.length === 0) {
    return `物品${itemId} (加载中...)`;
  }
  
  const item = items.value.find(item => item.id == itemId);
  if (item) {
    return item.cn || item.n;
  } else {
    // 只有在物品配置完全加载后才显示不存在警告
    console.warn(`物品ID ${itemId} 在配置中不存在`);
    return `⚠️ 物品${itemId}(不存在)`;
  }
};

const getItemDisplayClass = (itemId) => {
  if (itemsLoading.value) {
    return 'text-gray-500'; // 加载中
  }
  const item = items.value.find(item => item.id == itemId);
  if (item) {
    return 'text-gray-900'; // 正常
  } else {
    return 'text-red-600'; // 不存在
  }
};

// 加载礼包列表
const loadGiftPackages = async () => {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/gift-packages', {
      query: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters
      },
      headers: {
        authorization: authStore.id
      }
    });
    
    if (response.success) {
      giftPackages.value = (response.data.list || []).map(pkg => ({
        ...pkg,
        price_real_money: Number(pkg.price_real_money || 0),
        category_label: CATEGORY_LABEL_MAP[pkg.category] || pkg.category
      }));
      pagination.total = response.data.total;
    }
  } catch (error) {
    console.error('加载礼包列表失败:', error);
  } finally {
    loading.value = false;
  }
};

// 加载物品配置（列表用于名称展示）
const loadItems = async () => {
  itemsLoading.value = true;
  try {
    const response = await $fetch('/api/admin/item-config', {
      query: { action: 'list', pageSize: 10000 }, // 增加到10000确保加载所有物品
      headers: {
        authorization: authStore.id
      }
    });
    
    if (response.success) {
      items.value = response.data.list;
      console.log(`物品配置加载成功: ${items.value.length} 个物品`);
      // 调试：检查普通列表的数据结构
      if (items.value.length > 0) {
        console.log('前端列表结果示例:', items.value.slice(0, 2));
      }
    }
  } catch (error) {
    console.error('加载物品配置失败:', error);
  } finally {
    itemsLoading.value = false;
  }
};

// 供下拉使用的全量选项（本地过滤）
const itemOptions = computed(() => {
  return (items.value || []).map((it) => ({ value: Number(it.id), label: `${it.id} - ${it.cn || it.n || ''}` }));
});

function searchItems(query) {
  const q = (query || '').trim().toLowerCase();
  const opts = itemOptions.value || [];
  if (!q) return opts.slice(0, 20);
  return opts.filter(o => o.label.toLowerCase().includes(q)).slice(0, 200);
}

// 搜索物品（防抖）
const searchItemsDebounced = useDebounceFn(async () => {
  if (!itemSearchTerm.value.trim()) {
    loadItems();
    return;
  }
  
  itemsLoading.value = true;
  try {
    const response = await $fetch('/api/admin/item-config', {
      query: { 
        action: 'search', 
        q: itemSearchTerm.value,
        pageSize: 10000  // 确保搜索结果也不受分页限制
      },
      headers: {
        authorization: authStore.id
      }
    });
    
    if (response.success) {
      items.value = response.data.list;
      console.log(`搜索到 ${items.value.length} 个匹配的物品`);
      // 调试：检查搜索结果的数据结构
      if (items.value.length > 0) {
        console.log('前端搜索结果示例:', items.value.slice(0, 2));
      }
    }
  } catch (error) {
    console.error('搜索物品失败:', error);
  } finally {
    itemsLoading.value = false;
  }
}, 300);

// 重置筛选器
const resetFilters = () => {
  Object.assign(filters, {
    category: '',
    is_active: '',
    game_code: 'hzwqh'
  });
  pagination.page = 1;
  loadGiftPackages();
};

// 礼包相关操作
const addGiftItem = () => {
  if (giftPackageForm.gift_items.length >= 10) {
    alert('礼包最多只能包含10个物品');
    return;
  }
  giftPackageForm.gift_items.push({ i: 0, a: 1 });
};

const removeGiftItem = (index) => {
  if (giftPackageForm.gift_items.length > 1) {
    giftPackageForm.gift_items.splice(index, 1);
  }
};

const updateItemName = (index) => {
  // 验证物品ID是否存在
  const itemId = giftPackageForm.gift_items[index].i;
  if (itemId) {
    const item = items.value.find(item => item.id == itemId);
    if (!item) {
      console.warn(`物品ID ${itemId} 不存在，请检查配置`);
    }
  }
  // 触发界面更新，显示物品名称
  giftPackageForm.gift_items[index] = { ...giftPackageForm.gift_items[index] };
};

function normalizeGiftItems(input) {
  try {
    const arr = Array.isArray(input) ? input : (typeof input === 'string' ? JSON.parse(input) : []);
    return (arr || []).map((it) => ({ i: Number(it?.i ?? it?.id ?? it?.ItemId), a: Number(it?.a ?? it?.num ?? it?.ItemNum) })).filter(it => Number.isFinite(it.i) && it.i > 0 && Number.isFinite(it.a) && it.a > 0);
  } catch {
    return [];
  }
}

const editGiftPackage = (row) => {
  editingGiftPackage.value = row;
  const items = normalizeGiftItems(row.gift_items);
  
  // 处理 available_weekdays：转换为单个数字
  let weekday = null;
  if (row.available_weekdays) {
    if (typeof row.available_weekdays === 'string') {
      // 如果是字符串（如 "1,2,3"），取第一个值
      const days = row.available_weekdays.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 7);
      weekday = days.length > 0 ? days[0] : null;
    } else if (typeof row.available_weekdays === 'number') {
      weekday = row.available_weekdays;
    }
  }
  
  Object.assign(giftPackageForm, {
    ...row,
    gift_items: items.length > 0 ? items : [{ i: 0, a: 1 }],
    available_weekdays: weekday
  });
  
  // 如果是限时礼包，设置时间选择器
  if (row.category === 'limited' && row.start_time && row.end_time) {
    limitedTimeRange.value = {
      start: new Date(row.start_time),
      end: new Date(row.end_time)
    };
  } else {
    // 重置为今天（保持范围选择模式）
    limitedTimeRange.value = { start: new Date(), end: new Date() };
  }
  
  showCreateGiftPackageModal.value = true;
};

const deleteGiftPackage = async (row) => {
  if (!confirm('确定要删除这个礼包吗？')) return;
  
  try {
    const response = await $fetch('/api/admin/gift-packages', {
      method: 'DELETE',
      query: { id: row.id },
      headers: {
        authorization: authStore.id
      }
    });
    
    if (response.success) {
      loadGiftPackages();
    }
  } catch (error) {
    console.error('删除礼包失败:', error);
    alert('删除失败：' + (error.data?.message || error.message));
  }
};

const submitGiftPackage = async () => {
  submitting.value = true;
  try {
    const method = editingGiftPackage.value ? 'PUT' : 'POST';
    const body = { ...giftPackageForm };
    if (editingGiftPackage.value) {
      body.id = editingGiftPackage.value.id;
    }
    
    // 处理 available_weekdays：转换为字符串（单个数字）
    if (body.available_weekdays && typeof body.available_weekdays === 'number') {
      body.available_weekdays = String(body.available_weekdays);
    } else if (!body.available_weekdays) {
      body.available_weekdays = null;
    }
    
    // 如果不是限时礼包，清空时间字段
    if (body.category !== 'limited') {
      body.start_time = null;
      body.end_time = null;
    }
    
    // 如果不是限期礼包，清空周几字段
    if (body.category !== 'scheduled') {
      body.available_weekdays = null;
    }
    
    const response = await $fetch('/api/admin/gift-packages', {
      method,
      body,
      headers: {
        authorization: authStore.id
      }
    });
    
    if (response.success) {
      closeGiftPackageModal();
      loadGiftPackages();
    }
  } catch (error) {
    console.error('提交礼包失败:', error);
    alert('提交失败：' + (error.data?.message || error.message));
  } finally {
    submitting.value = false;
  }
};

const closeGiftPackageModal = () => {
  showCreateGiftPackageModal.value = false;
  editingGiftPackage.value = null;
  Object.assign(giftPackageForm, {
    package_code: '',
    package_name: '',
    description: '',
    icon_url: '',
    price_platform_coins: 0,
    price_real_money: 0,
    category: 'general',
    sort_order: 0,
    is_active: true,
    is_limited: false,
    total_quantity: 0,
    max_per_user: 0,
    gift_items: [{ i: 0, a: 1 }],
    start_time: null,
    end_time: null,
    available_weekdays: null
  });
  // 重置限时时间选择器（保持范围选择模式）
  limitedTimeRange.value = { start: new Date(), end: new Date() };
};

// 物品配置现在是只读的，移除了编辑功能

// 图片选择相关方法
const loadImages = async () => {
  loadingImages.value = true;
  
  try {
    const response = await $fetch('/api/admin/list-images', {
      method: 'GET',
      headers: {
        'Authorization': authStore.id.toString()
      }
    });
    
    if (response.code === 200) {
      images.value = response.data.images;
      imageDirectory.value = response.data.directory;
    }
  } catch (error) {
    console.error('加载图片列表失败:', error);
    toast.add({
      title: '加载失败',
      description: '无法加载图片列表',
      color: 'red'
    });
  } finally {
    loadingImages.value = false;
  }
};

const selectImage = (url) => {
  giftPackageForm.icon_url = url;
  showImageSelectModal.value = false;
  
  toast.add({
    title: '已选择图片',
    color: 'green'
  });
};

const handleImageError = (e) => {
  e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E加载失败%3C/text%3E%3C/svg%3E';
};

// 监听图片选择弹窗打开，自动加载图片列表
watch(showImageSelectModal, (newVal) => {
  if (newVal) {
    loadImages();
  }
});

// 页面初始化
onMounted(() => {
  // 权限检查
  if (!isSuperAdmin.value) {
    toast.add({
      title: '无权限访问',
      description: '只有超级管理员可以管理商城礼包',
      color: 'red'
    });
    navigateTo('/admin');
    return;
  }
  
  loadGiftPackages();
  loadItems();
});
</script>

<style scoped>
.gift-packages-management {
  padding: 20px;
}

/* 页面标题布局 */
.page-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 桌面端保持水平布局 */
@media (min-width: 768px) {
  .page-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0;
  }
  
  .page-header h1 {
    margin-bottom: 0;
  }
}

/* 移动端按钮布局 */
@media (max-width: 767px) {
  .page-header .flex {
    justify-content: flex-start;
  }
}
</style> 