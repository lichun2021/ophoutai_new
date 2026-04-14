<template>
  <div class="promoter-list-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>代理列表</h2>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-blue-600">{{ totalRecords }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" class="w-4 h-4 text-blue-500" />
            <span class="text-sm text-gray-600">总代理</span>
          </div>
        </div>
      </UCard>

      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-green-600">{{ activeCount }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500" />
            <span class="text-sm text-gray-600">启用状态</span>
          </div>
        </div>
      </UCard>

      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-orange-600">¥{{ totalCashFlow }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-orange-500" />
            <span class="text-sm text-gray-600">总流水</span>
          </div>
        </div>
      </UCard>

      <UCard class="text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="text-2xl font-bold text-purple-600">{{ getLevelText(authStore.permissions?.level || 0) }}</div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-purple-500" />
            <span class="text-sm text-gray-600">当前权限</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 筛选条件 -->
    <UCard class="mb-6">
      <div class="flex items-end gap-4 p-4">
        <!-- 代理名称 -->
        <UFormGroup label="代理名称" class="flex-1">
          <UInput
            v-model="searchForm.name"
            placeholder="请输入代理名称"
            icon="i-heroicons-user"
            @keyup.enter="searchPromoters"
          />
        </UFormGroup>

        <!-- 渠道代码 -->
        <UFormGroup label="渠道代码" class="flex-1">
          <UInput
            v-model="searchForm.channel_code"
            placeholder="请输入渠道代码"
            icon="i-heroicons-hashtag"
            @keyup.enter="searchPromoters"
          />
        </UFormGroup>

        <!-- 等级 -->
        <UFormGroup label="等级" class="flex-1">
          <USelect
            v-model="searchForm.level"
            :options="searchLevelOptions"
            placeholder="选择等级"
            icon="i-heroicons-star"
          />
        </UFormGroup>

        <!-- 结算方式 -->
        <UFormGroup label="结算方式" class="flex-1">
          <USelect
            v-model="searchForm.settlement_type"
            :options="settlementOptions"
            placeholder="选择结算方式"
            icon="i-heroicons-credit-card"
          />
        </UFormGroup>

        <!-- 操作按钮 -->
        <div class="flex gap-2 shrink-0">
          <UButton 
            @click="searchPromoters" 
            :loading="loading"
            icon="i-heroicons-magnifying-glass"
          >
            查询
          </UButton>
          <UButton 
            color="gray" 
            variant="outline" 
            @click="resetSearch"
            icon="i-heroicons-arrow-path"
          >
            重置
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 代理列表 -->
    <UCard class="promoter-list-card">
      <template #header>
        <div class="card-header">
          <h3>代理管理</h3>
          <UButton 
            v-if="canCreateSubAgent" 
            color="primary" 
            size="sm" 
            @click="openAddModal"
          >
            添加代理 ({{ getNextLevelText() }})
          </UButton>
          <span v-else class="text-gray-500 text-sm">
            {{ getLevelText(authStore.permissions?.level ?? 0) }} 无法创建下级代理
          </span>
        </div>
      </template>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>代理名称</th>
              <th>等级</th>
              <th>渠道代码</th>
              <th>上级代理</th>
              <th>结算方式</th>
              <th>分成比例</th>
              <th>分账金额</th>
              <th>总流水</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="promoter in promoterList" :key="promoter.id">
              <td>{{ promoter.id }}</td>
              <td>{{ promoter.name }}</td>
              <td>
                <span class="level-badge" :class="getLevelClass(promoter.level)">
                  {{ getLevelText(promoter.level) }}
                </span>
              </td>
              <td>{{ promoter.channel_code || '-' }}</td>
              <td>{{ promoter.parent_admin_name || promoter.parent_channel_code || '-' }}</td>
              <td>{{ getSettlementTypeText(promoter.settlement_type) }}</td>
              <td>{{ promoter.divide_rate }}%</td>
              <td class="amount-cell">¥{{ formatAmount(promoter.total_rev_share) }}</td>
              <td class="amount-cell">¥{{ formatAmount(promoter.total_cash_flow) }}</td>
              <td>
                <span class="status-badge" :class="promoter.is_active ? 'active' : 'inactive'">
                  {{ promoter.is_active ? '启用' : '禁用' }}
                </span>
              </td>
              <td>{{ formatDate(promoter.created_at) }}</td>
              <td>
                <div class="action-buttons">
                  <UButton size="xs" color="blue" @click="viewPromoter(promoter)">详情</UButton>
                  <UButton size="xs" color="green" @click="editPromoter(promoter)">编辑</UButton>
                  <UButton size="xs" color="orange" @click="toggleStatus(promoter)">
                    {{ promoter.is_active ? '禁用' : '启用' }}
                  </UButton>
                  <!-- 删除 
                  <UButton 
                    v-if="canDeletePromoter" 
                    size="xs" 
                    color="red" 
                    @click="deletePromoter(promoter)"
                  >
                    删除
                  </UButton>
                  -->
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <!-- <div class="pagination-container">
        <div class="pagination-info">
          共 {{ totalRecords }} 条记录，第 {{ currentPage }} / {{ totalPages }} 页
        </div>
        <UPagination
          v-model="currentPage"
          :page-count="pageSize"
          :total="totalRecords"
          :max="5"
          @update:model-value="loadPromoterList"
        />
      </div> -->
    </UCard>

    <!-- 添加/编辑代理模态框 -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <h3>{{ editingPromoter ? '编辑代理' : '添加代理' }}</h3>
        </template>

        <UForm :state="formState" @submit="savePromoter" class="space-y-4">
          <div class="form-grid">
            <UFormGroup label="代理名称" required>
              <UInput v-model="formState.name" placeholder="请输入代理名称" />
            </UFormGroup>

            <UFormGroup label="密码" required>
              <UInput v-model="formState.password" type="password" placeholder="请输入密码" />
            </UFormGroup>

            <UFormGroup label="等级">
              <div class="level-display">
                <span class="level-badge" :class="getLevelClass(formState.level)">
                  {{ getLevelText(formState.level) }}
                </span>
                <span class="text-sm text-gray-500 ml-2">
                  (系统自动设置为下级)
                </span>
              </div>
            </UFormGroup>

            <UFormGroup 
              v-if="formState.level >= 2 && formState.level <= 4" 
              label="上级代理" 
              required
            >
              <USelect 
                v-model="formState.parent_admin_id" 
                :options="parentAdminOptions" 
                placeholder="选择上级代理"
              />
            </UFormGroup>

            <UFormGroup label="渠道代码" required>
              <UInput 
                v-model="formState.channel_code" 
                placeholder="请输入渠道代码，如: qh6677"
                @blur="validateChannelCode"
                :disabled="!!editingPromoter"
              />
              <template #help>
                <div class="text-xs text-gray-500">
                  <div v-if="!editingPromoter">• 长度3-20个字符，只能包含字母、数字、下划线和连字符</div>
                  <div v-else class="text-orange-500">• 渠道代码创建后不可修改</div>
                </div>
              </template>
            </UFormGroup>

            

            <UFormGroup label="结算方式">
              <USelect v-model="formState.settlement_type" :options="settlementOptions" />
            </UFormGroup>

            <UFormGroup label="分成比例(%)">
              <UInput 
                v-model="formState.divide_rate" 
                type="number" 
                :placeholder="getDivideRatePlaceholder"
                :max="maxAllowedDivideRate"
                min="0"
                :disabled="!!editingPromoter"
              />
              <template #help v-if="editingPromoter">
                <div class="text-xs text-orange-500">• 分成比例创建后不可修改</div>
              </template>
              <template #help>
                <span v-if="!isSuperAdmin" class="text-xs text-gray-500">
                  最大可设置: {{ maxAllowedDivideRate }}%
                </span>
              </template>
            </UFormGroup>

            <UFormGroup label="Telegram">
              <UInput v-model="formState.tg_account" placeholder="请输入Telegram账号" />
            </UFormGroup>

            <UFormGroup label="QQ">
              <UInput v-model="formState.qq_account" placeholder="请输入QQ账号" />
            </UFormGroup>

            <UFormGroup label="邮箱">
              <UInput v-model="formState.email" placeholder="请输入邮箱地址" />
            </UFormGroup>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <UButton color="gray" @click="closeModal">取消</UButton>
            <UButton type="submit" color="primary">保存</UButton>
          </div>
        </UForm>
      </UCard>
    </UModal>

    <!-- 代理详情模态框 -->
    <UModal v-model="showDetailModal">
      <UCard>
        <template #header>
          <h3>代理详情 - {{ selectedPromoter?.name }}</h3>
        </template>

        <div v-if="selectedPromoter" class="detail-content">
          <div class="detail-row">
            <label class="detail-label">代理名称</label>
            <span class="detail-value">{{ selectedPromoter.name }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">等级</label>
            <span class="detail-value">{{ getLevelText(selectedPromoter.level) }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">渠道代码</label>
            <span class="detail-value">{{ selectedPromoter.channel_code || '-' }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">上级代理</label>
            <span class="detail-value">{{ selectedPromoter.parent_admin_name || selectedPromoter.parent_channel_code || '-' }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">结算方式</label>
            <span class="detail-value">{{ getSettlementTypeText(selectedPromoter.settlement_type) }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">分成比例</label>
            <span class="detail-value">{{ selectedPromoter.divide_rate }}%</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">总流水（支付宝+微信）</label>
            <span class="detail-value amount">¥{{ formatAmount(selectedPromoter.total_cash_flow) }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">分账金额（= 总流水 × 分成比例）</label>
            <span class="detail-value amount">¥{{ formatAmount(selectedPromoter.total_rev_share) }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">Telegram</label>
            <span class="detail-value">{{ selectedPromoter.tg_account || '-' }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">QQ</label>
            <span class="detail-value">{{ selectedPromoter.qq_account || '-' }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">邮箱</label>
            <span class="detail-value">{{ selectedPromoter.email || '-' }}</span>
          </div>
          <div class="detail-row">
            <label class="detail-label">创建时间</label>
            <span class="detail-value">{{ formatDate(selectedPromoter.created_at) }}</span>
          </div>
        </div>

        <div class="flex justify-end pt-4">
          <UButton @click="showDetailModal = false">关闭</UButton>
        </div>
      </UCard>
    </UModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '~/store/auth';

const authStore = useAuthStore();

// 代理列表
const promoterList = ref([]);
const currentPage = ref(1);
const pageSize = 20;
const totalRecords = ref(0);
const totalPages = computed(() => Math.ceil(totalRecords.value / pageSize));
const loading = ref(false);

// 统计数据计算
const activeCount = computed(() => {
  return allPromoters.value.filter(p => p.is_active).length;
});

const totalCashFlow = computed(() => {
  const total = allPromoters.value.reduce((sum, p) => sum + (parseFloat(p.total_cash_flow) || 0), 0);
  return total.toFixed(2);
});

// 搜索表单
const searchForm = ref({
  name: '',
  channel_code: '',
  level: '',
  settlement_type: ''
});

// 表单状态
const showAddModal = ref(false);
const showDetailModal = ref(false);
const editingPromoter = ref(null);
const selectedPromoter = ref(null);
const formState = ref({
  name: '',
  password: '',
  level: 1,
  channel_code: '',
  phone: '',
  settlement_type: 0,
  divide_rate: 0,
  tg_account: '',
  qq_account: '',
  email: '',
  parent_admin_id: null, // 上级管理员ID
  parent_channel_code: '' // 上级渠道代码
});

// 错误状态
const channelCodeError = ref('');

// 上级管理员列表
const parentAdminList = ref([]);

// 选项配置 - 搜索用的所有等级选项
const searchLevelOptions = [
  { label: '全部等级', value: '' },
  { label: '超级管理员', value: 0 },
  { label: '一级代理', value: 1 },
  { label: '二级代理', value: 2 },
  { label: '三级代理', value: 3 },
  { label: '四级代理', value: 4 }
];

// 根据当前用户等级计算下级级别
const getNextLevel = () => {
  const currentLevel = authStore.permissions?.level ?? 0;
  
  // 权限规则：只能创建下一级
  if (currentLevel === 0) {
    return 1; // 超级管理员创建1级代理
  } else if (currentLevel === 1) {
    return 2; // 1级代理创建2级代理
  } else if (currentLevel === 2) {
    return 3; // 2级代理创建3级代理
  } else if (currentLevel === 3) {
    return 4; // 3级代理创建4级代理
  } else {
    return null; // 4级代理不能创建下级
  }
};

// 检查是否可以创建下级代理
const canCreateSubAgent = computed(() => {
  const currentLevel = authStore.permissions?.level ?? 0;
  return currentLevel >= 0 && currentLevel <= 3; // 0-3级可以创建下级，4级不能
});

// 获取将要创建的代理级别文本
const getNextLevelText = () => {
  const nextLevel = getNextLevel();
  if (nextLevel === null) return '无法创建下级';
  return getLevelText(nextLevel);
};

// 上级管理员选项
const parentAdminOptions = computed(() => {
  return parentAdminList.value.map(admin => ({
    label: `${admin.name} (${admin.channel_code}) - ${getLevelText(admin.level)}`,
    value: admin.id
  }));
});

// 删除代理权限检查（只有超级管理员能删除）
const canDeletePromoter = computed(() => {
  const currentLevel = authStore.permissions?.level ?? 999;
  return currentLevel === 0; // 只有超级管理员（level 0）能删除
});

// 是否为超级管理员
const isSuperAdmin = computed(() => {
  const currentLevel = authStore.permissions?.level ?? 999;
  return currentLevel === 0;
});

// 计算最大允许的分成比例
const maxAllowedDivideRate = computed(() => {
  if (isSuperAdmin.value) {
    return 100; // 超级管理员无限制
  }
  
  const currentDivideRate = authStore.permissions?.divide_rate ?? 0;
  return Math.max(0, currentDivideRate - 5);
});

// 分成比例输入框占位符
const getDivideRatePlaceholder = computed(() => {
  if (isSuperAdmin.value) {
    return '请输入分成比例(0-100)';
  }
  return `请输入分成比例(0-${maxAllowedDivideRate.value})`;
});

const settlementOptions = [
  { label: '全部方式', value: '' },
  { label: '无', value: 0 },
  { label: '支付宝', value: 1 },
  { label: '微信', value: 2 },
  { label: '银联', value: 3 }
];

// 页面初始化
onMounted(async () => {
  authStore.init();
  await loadPromoterList();
  await loadParentAdminList();
});

// 获取等级文本
const getLevelText = (level) => {
  const levelMap = {
    0: '超级管理员',
    1: '一级代理',
    2: '二级代理',
    3: '三级代理',
    4: '四级代理'
  };
  return levelMap[level] || '未知';
};

// 获取等级样式类
const getLevelClass = (level) => {
  const classMap = {
    0: 'super',
    1: 'level-1',
    2: 'level-2',
    3: 'level-3',
    4: 'level-4'
  };
  return classMap[level] || 'default';
};

// 获取结算方式文本
const getSettlementTypeText = (type) => {
  const typeMap = {
    0: '无',
    1: '支付宝',
    2: '微信',
    3: '银联'
  };
  return typeMap[type] || '无';
};

// 格式化时间
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
};

// 所有代理原始数据
const allPromoters = ref([]);

// 加载代理列表
const loadPromoterList = async () => {
  try {
    const response = await $fetch('/api/admin/list', {
      query: {
        admin_id: authStore.id // 传递当前管理员ID用于权限过滤
      }
    });
    if (response && response.data) {
      // 过滤掉超级管理员，只显示代理
      allPromoters.value = response.data.filter(admin => admin.level > 0);
    } else {
      allPromoters.value = [];
    }
  } catch (error) {
    console.error('加载代理列表失败:', error);
    // 使用模拟数据作为降级方案
    allPromoters.value = [
      {
        id: 1,
        name: 'qh6677',
        level: 2,
        channel_code: 'channelB',
        phone: '13800000002',
        settlement_type: 1,
        divide_rate: 50,
        settlement_amount_available: 900.00,
        settlement_amount: 1800.00,
        tg_account: 'tg_agent1',
        qq_account: 'qq654321',
        email: 'agent1@admin.com',
        is_active: true,
        created_at: '2025-06-01 10:00:00'
      }
    ];
  }
  
  // 初始加载后执行搜索过滤
  applySearchFilter();
};

// 应用搜索过滤
const applySearchFilter = () => {
  let filtered = [...allPromoters.value];
  
  // 按名称搜索
  if (searchForm.value.name && searchForm.value.name.trim()) {
    const searchName = searchForm.value.name.trim().toLowerCase();
    filtered = filtered.filter(promoter => 
      promoter.name.toLowerCase().includes(searchName)
    );
  }
  
  // 按渠道代码搜索
  if (searchForm.value.channel_code && searchForm.value.channel_code.trim()) {
    const searchChannel = searchForm.value.channel_code.trim().toLowerCase();
    filtered = filtered.filter(promoter => 
      promoter.channel_code && promoter.channel_code.toLowerCase().includes(searchChannel)
    );
  }
  
  // 按等级过滤
  if (searchForm.value.level !== '' && searchForm.value.level !== null && searchForm.value.level !== undefined) {
    const levelValue = parseInt(searchForm.value.level);
    if (!isNaN(levelValue)) {
      filtered = filtered.filter(promoter => promoter.level === levelValue);
    }
  }
  
  // 按结算方式过滤
  if (searchForm.value.settlement_type !== '' && searchForm.value.settlement_type !== null && searchForm.value.settlement_type !== undefined) {
    const settlementValue = parseInt(searchForm.value.settlement_type);
    if (!isNaN(settlementValue)) {
      filtered = filtered.filter(promoter => promoter.settlement_type === settlementValue);
    }
  }
  
  // 更新显示的代理列表和总数
  promoterList.value = filtered;
  totalRecords.value = filtered.length;
  
  console.log('搜索结果:', {
    searchForm: searchForm.value,
    totalOriginal: allPromoters.value.length,
    totalFiltered: filtered.length
  });
};

// 加载可选的上级管理员列表
const loadParentAdminList = async () => {
  try {
    const currentLevel = authStore.permissions?.level ?? 0;
    const response = await $fetch('/api/admin/list', {
      query: {
        admin_id: authStore.id // 传递当前管理员ID用于权限过滤
      }
    });
    
    if (response && response.data) {
      // 简化逻辑：只能选择当前用户作为上级（因为只能创建直接下级）
      const currentUser = response.data.find(admin => admin.id === authStore.id);
      if (currentUser) {
        parentAdminList.value = [currentUser];
      } else {
        parentAdminList.value = [];
      }
    }
  } catch (error) {
    console.error('加载上级管理员列表失败:', error);
    parentAdminList.value = [];
  }
};

// 打开添加模态框
const openAddModal = () => {
  const nextLevel = getNextLevel();
  if (nextLevel !== null) {
    formState.value.level = nextLevel;
    // 如果是创建2级以上的代理，需要设置上级
    if (nextLevel >= 2) {
      formState.value.parent_admin_id = authStore.id; // 默认选择自己作为上级
    }
    showAddModal.value = true;
  }
};

// 搜索代理
const searchPromoters = () => {
  currentPage.value = 1;
  applySearchFilter();
};

// 重置搜索
const resetSearch = () => {
  searchForm.value = {
    name: '',
    channel_code: '',
    level: '',
    settlement_type: ''
  };
  applySearchFilter();
};

// 查看代理详情
const viewPromoter = (promoter) => {
  selectedPromoter.value = promoter;
  showDetailModal.value = true;
};

// 编辑代理 - 暂时禁用
const editPromoter = (promoter) => {
  alert('编辑功能暂时禁用，请联系系统管理员');
  return;
  // editingPromoter.value = promoter;
  // formState.value = { ...promoter };
  // // 编辑时，如果需要上级代理，设置为当前代理的上级
  // if (promoter.level >= 2 && !formState.value.parent_admin_id) {
  //   formState.value.parent_admin_id = authStore.id;
  // }
  // showAddModal.value = true;
};

// 切换状态
const toggleStatus = async (promoter) => {
  try {
    const newStatus = !promoter.is_active;
    const response = await $fetch('/api/admin/toggle-promoter-status', {
      method: 'POST',
      body: {
        id: promoter.id,
        is_active: newStatus
      }
    });
    
    if (response.success) {
      promoter.is_active = newStatus;
      alert(`代理状态已${newStatus ? '启用' : '禁用'}`);
    } else {
      alert('状态切换失败：' + (response.message || '未知错误'));
    }
  } catch (error) {
    console.error('切换代理状态失败:', error);
    // 更好的错误信息提取
    let errorMessage = '状态切换失败：未知错误';
    
    if (error.data?.message) {
      errorMessage = '状态切换失败：' + error.data.message;
    } else if (error.cause?.message) {
      errorMessage = '状态切换失败：' + error.cause.message;
    } else if (error.message) {
      errorMessage = '状态切换失败：' + error.message;
    }
    
    alert(errorMessage);
  }
};

// 删除代理 - 暂时禁用
const deletePromoter = async (promoter) => {
  alert('删除功能暂时禁用，请联系系统管理员');
  return;
  // if (!canDeletePromoter.value) {
  //   alert('您没有权限删除代理');
  //   return;
  // }
  // 
  // if (confirm(`确定要删除代理 ${promoter.name} 吗？\n删除后将同时清理相关的代理关系，此操作不可恢复！`)) {
  //   try {
  //     const response = await $fetch('/api/admin/delete-promoter', {
  //       method: 'POST',
  //       body: {
  //         id: promoter.id,
  //         channel_code: promoter.channel_code
  //       }
  //     });
  //     
  //     if (response.success) {
  //       alert('代理删除成功！');
  //       await loadPromoterList();
  //       await loadParentAdminList();
  //     } else {
  //       alert('删除失败：' + (response.message || '未知错误'));
  //     }
  //   } catch (error) {
  //     console.error('删除代理失败:', error);
  //     // 更好的错误信息提取
  //     let errorMessage = '删除失败：未知错误';
  //     
  //     if (error.data?.message) {
  //       errorMessage = '删除失败：' + error.data.message;
  //     } else if (error.cause?.message) {
  //       errorMessage = '删除失败：' + error.cause.message;
  //     } else if (error.message) {
  //       errorMessage = '删除失败：' + error.message;
  //     }
  //     
  //     alert(errorMessage);
  //   }
  // }
};

// 保存代理
const savePromoter = async (event) => {
  try {
    event.preventDefault();
    
    // 验证必填项
    if (!formState.value.name || !formState.value.password || !formState.value.channel_code) {
      alert('请填写必填项：代理名称、密码、渠道代码');
      return;
    }
    
    // 清理渠道代码
    validateChannelCode();
    
    // 验证上级选择（只有创建2级以上的代理才需要）
    if (formState.value.level >= 2 && !formState.value.parent_admin_id) {
      alert('请选择上级代理');
      return;
    }
    
    // 验证分成比例
    if (formState.value.divide_rate < 0 || formState.value.divide_rate > maxAllowedDivideRate.value) {
      alert(`分成比例必须在 0 到 ${maxAllowedDivideRate.value} 之间`);
      return;
    }
    
    // 获取上级的渠道代码（可选，服务端会自动处理）
    if (formState.value.parent_admin_id) {
      const parentAdmin = parentAdminList.value.find(admin => admin.id === formState.value.parent_admin_id);
      if (parentAdmin) {
        formState.value.parent_channel_code = parentAdmin.channel_code;
        console.log(`前端获取上级渠道代码: ${parentAdmin.channel_code} (ID: ${formState.value.parent_admin_id})`);
      } else {
        console.log(`前端未找到parent_admin_id ${formState.value.parent_admin_id} 对应的管理员`);
      }
    }
    
    if (editingPromoter.value) {
      // 编辑现有代理 - 暂时禁用
      alert('编辑功能暂时禁用，请联系系统管理员');
      return;
      // console.log('发送更新代理请求，数据:', formState.value);
      // const response = await $fetch('/api/admin/update-promoter', {
      //   method: 'POST',
      //   body: {
      //     id: editingPromoter.value.id,
      //     ...formState.value,
      //     current_admin_id: authStore.id // 传递当前用户ID用于权限验证
      //   }
      // });
      // 
      // if (response.success) {
      //   alert('代理信息更新成功！');
      // } else {
      //   alert('更新失败：' + (response.message || '未知错误'));
      //   return;
      // }
    } else {
      // 创建新代理
      console.log('发送创建代理请求，数据:', formState.value);
      const response = await $fetch('/api/admin/create-promoter', {
        method: 'POST',
        body: {
          ...formState.value,
          // 确保传递关键字段
          parent_admin_id: formState.value.parent_admin_id,
          parent_channel_code: formState.value.parent_channel_code,
          current_admin_id: authStore.id // 传递当前用户ID用于权限验证
        }
      });
      
      if (response.success) {
        alert('代理创建成功！');
      } else {
        alert('创建失败：' + (response.message || '未知错误'));
        return;
      }
    }
    
    closeModal();
    await loadPromoterList();
    await loadParentAdminList();
  } catch (error) {
    console.error('保存代理失败:', error);
    // 更好的错误信息提取
    let errorMessage = '操作失败：未知错误';
    
    if (error.data?.message) {
      // Nuxt错误格式
      errorMessage = '操作失败：' + error.data.message;
    } else if (error.cause?.message) {
      // H3Error格式
      errorMessage = '操作失败：' + error.cause.message;
    } else if (error.message) {
      // 普通错误格式
      errorMessage = '操作失败：' + error.message;
    }
    
    alert(errorMessage);
  }
};

// 渠道代码简单清理
const validateChannelCode = () => {
  // 只做基本的空格清理
  formState.value.channel_code = formState.value.channel_code.trim();
  channelCodeError.value = '';
};

// 关闭模态框
const closeModal = () => {
  showAddModal.value = false;
  editingPromoter.value = null;
  channelCodeError.value = ''; // 清除错误信息
  // 重置表单，级别默认为下一级
  const nextLevel = getNextLevel();
  formState.value = {
    name: '',
    password: '',
    level: nextLevel || 1,
    channel_code: '',
    phone: '',
    settlement_type: 0,
    divide_rate: 0,
    tg_account: '',
    qq_account: '',
    email: '',
    parent_admin_id: null,
    parent_channel_code: ''
  };
};
</script>

<style scoped>
.promoter-list-page {
  padding: 16px;
  background: #f5f6fa;
}

.page-header {
  margin-bottom: 16px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.promoter-list-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.search-area {
  padding: 16px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
}

.search-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
}

.search-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.table-container {
  overflow-x: auto;
}

@media (max-width: 768px) {
  .table-container {
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
    max-width: calc(100vw - 24px);
  }
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: white;
}

.data-table th {
  background: #f8f9fa;
  padding: 12px 8px;
  text-align: center;
  border: 1px solid #dee2e6;
  font-weight: 600;
  color: #495057;
  white-space: nowrap;
}

.data-table td {
  padding: 10px 8px;
  text-align: center;
  border: 1px solid #dee2e6;
  white-space: nowrap;
}

.data-table tbody tr:hover {
  background: #f5f5f5;
}

.level-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.level-badge.super {
  background: #ff4757;
  color: white;
}

.level-badge.level-1 {
  background: #ff6b6b;
  color: white;
}

.level-badge.level-2 {
  background: #4dabf7;
  color: white;
}

.level-badge.level-3 {
  background: #69db7c;
  color: white;
}

.level-badge.level-4 {
  background: #ffd43b;
  color: #333;
}

.level-display {
  display: flex;
  align-items: center;
  padding: 8px 0;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.amount-cell {
  color: #ff9800;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
}

.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
}

.pagination-info {
  font-size: 14px;
  color: #666;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.detail-content {
  padding: 20px;
}

.detail-row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  width: 120px;
  font-weight: 500;
  color: #666;
  font-size: 14px;
  text-align: right;
  margin-right: 24px;
  flex-shrink: 0;
}

.detail-value {
  color: #333;
  font-size: 14px;
  flex: 1;
}

.detail-value.amount {
  color: #ff9800;
  font-weight: 600;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .promoter-list-page {
    padding: 12px;
  }
  
  .search-row {
    grid-template-columns: 1fr;
  }
  
  .search-buttons {
    justify-content: stretch;
  }
  
  .search-buttons button {
    flex: 1;
  }
  
  .card-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .data-table th,
  .data-table td {
    padding: 8px 4px;
    font-size: 12px;
  }
  
  .action-buttons {
    flex-direction: column;
    gap: 2px;
  }
  
  .pagination-container {
    flex-direction: column;
    gap: 12px;
  }
  
  .form-grid {
    grid-template-columns: 1fr;
  }
  
  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .detail-label {
    width: auto;
    text-align: left;
    margin-right: 0;
  }
}
</style> 