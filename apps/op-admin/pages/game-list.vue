<template>
  <div class="game-list-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>游戏列表</h2>
    </div>

    <!-- 游戏列表 -->
    <UCard class="game-list-card">
      <template #header>
        <div class="card-header">
          <h3>{{ isSuperAdmin ? '游戏管理' : '我的授权游戏' }}</h3>
          <div class="header-info">
            <span class="permission-level">{{ getLevelText(adminLevel) }}</span>
            <span class="game-count">共 {{ gameList.length }} 个游戏</span>
            <UButton 
              v-if="isSuperAdmin" 
              color="primary" 
              size="sm" 
              @click="showAddModal = true"
              icon="i-heroicons-plus"
            >
              添加游戏
            </UButton>
          </div>
        </div>
      </template>

      <div v-if="loading" class="loading-container">
        <div class="loading-text">正在加载游戏列表...</div>
      </div>

      <div v-else-if="gameList.length === 0" class="empty-container">
        <div class="empty-icon">🎮</div>
        <div class="empty-text">暂无授权游戏</div>
        <div class="empty-desc">请联系上级管理员为您分配游戏权限</div>
      </div>

      <!-- 游戏列表表格 -->
      <div v-else class="games-table-container mobile-table-wrapper">
        <table class="games-table">
          <thead>
            <tr>
              <th style="width: 80px; text-align: center;">图标</th>
              <th style="width: 150px; text-align: center;">游戏名称</th>
              <th style="width: 100px; text-align: center;">游戏代码</th>
              <th style="width: 90px; text-align: center;">支持设备</th>
              <th style="width: 80px; text-align: center;">状态</th>
              <th style="width: 200px; text-align: center;">注册链接</th>
              <th style="width: 180px; text-align: center;">iOS下载</th>
              <th style="width: 180px; text-align: center;">APK下载</th>
              <th v-if="isSuperAdmin" style="width: 200px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in gameList" :key="game.id" class="game-row">
              <!-- 游戏图标 -->
              <td class="icon-cell">
                <div class="game-icon-wrapper">
                  <img v-if="game.icon_url" :src="game.icon_url" :alt="game.game_name" class="game-icon" @error="handleImageError" />
                  <div class="default-icon" :style="{ display: game.icon_url ? 'none' : 'flex' }">🎮</div>
                </div>
              </td>

              <!-- 游戏名称 -->
              <td class="name-cell">
                <div class="game-name-wrapper">
                  <h4 class="game-name">{{ game.game_name }}</h4>
                  <p class="game-desc" v-if="game.description">{{ game.description }}</p>
                </div>
              </td>

              <!-- 游戏代码 -->
              <td class="code-cell">
                <span class="game-code-badge">{{ game.game_code }}</span>
              </td>

              <!-- 支持设备 -->
              <td class="device-cell">
                <span class="device-badge">{{ formatDevices(game.supported_devices) }}</span>
              </td>

              <!-- 状态 -->
              <td class="status-cell">
                <span class="status-badge" :class="getGameStatus(game.is_active) === 'active' ? 'active' : 'inactive'">
                  {{ getGameStatus(game.is_active) === 'active' ? '运营中' : '已停服' }}
                </span>
              </td>

              <!-- 注册链接 -->
              <td class="register-cell">
                <div v-if="getRegisterUrl(game)" class="link-container">
                  <input 
                    :value="getRegisterUrl(game)" 
                    readonly 
                    class="link-input"
                    @click="copyLink(getRegisterUrl(game), '注册链接')"
                    :title="'点击复制注册链接'"
                  />
                  <UButton 
                    size="xs" 
                    color="blue" 
                    variant="ghost"
                    @click="copyLink(getRegisterUrl(game), '注册链接')"
                    class="copy-btn"
                  >
                    复制
                  </UButton>
                </div>
                <span v-else class="no-link">暂无</span>
              </td>

              <!-- iOS下载 -->
              <td class="ios-cell">
                <div v-if="game.ios_download_url" class="link-container">
                  <input 
                    :value="game.ios_download_url" 
                    readonly 
                    class="link-input"
                    @click="copyLink(game.ios_download_url, 'iOS下载链接')"
                    :title="'点击复制iOS下载链接'"
                  />
                  <UButton 
                    size="xs" 
                    color="gray" 
                    variant="ghost"
                    @click="copyLink(game.ios_download_url, 'iOS下载链接')"
                    class="copy-btn"
                  >
                    复制
                  </UButton>
                </div>
                <span v-else class="no-link">暂无</span>
              </td>

              <!-- APK下载 -->
              <td class="android-cell">
                <div v-if="game.android_download_url" class="link-container">
                  <input 
                    :value="game.android_download_url" 
                    readonly 
                    class="link-input"
                    @click="copyLink(game.android_download_url, 'APK下载链接')"
                    :title="'点击复制APK下载链接'"
                  />
                  <UButton 
                    size="xs" 
                    color="green" 
                    variant="ghost"
                    @click="copyLink(game.android_download_url, 'APK下载链接')"
                    class="copy-btn"
                  >
                    复制
                  </UButton>
                </div>
                <span v-else class="no-link">暂无</span>
              </td>

              <!-- 管理操作 (只有超级管理员可见) -->
              <td v-if="isSuperAdmin" class="action-cell">
                <div class="action-buttons">
                  <UButton 
                    size="xs" 
                    color="blue" 
                    @click="editGame(game)"
                    title="编辑"
                  >
                    编辑
                  </UButton>
                  <UButton 
                    size="xs" 
                    :color="getGameStatus(game.is_active) === 'active' ? 'orange' : 'green'"
                    @click="toggleGameStatus(game)"
                    :title="getGameStatus(game.is_active) === 'active' ? '禁用' : '启用'"
                  >
                    {{ getGameStatus(game.is_active) === 'active' ? '禁用' : '启用' }}
                  </UButton>
                  <UButton 
                    size="xs" 
                    color="red" 
                    @click="deleteGame(game)"
                    title="删除"
                  >
                    删除
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- 添加/编辑游戏模态框 -->
    <UModal v-model="showAddModal" :ui="{ width: 'w-full max-w-2xl' }">
      <UCard>
        <template #header>
          <h3>{{ editingGame ? '编辑游戏' : '添加游戏' }}</h3>
        </template>

        <UForm :state="gameForm" @submit="saveGame" class="space-y-4">
          <div class="form-grid">
            <UFormGroup label="游戏名称" required>
              <UInput v-model="gameForm.game_name" placeholder="请输入游戏名称" />
            </UFormGroup>

            <UFormGroup label="游戏代码" required>
              <UInput v-model="gameForm.game_code" placeholder="请输入游戏代码（如 hzwqh）" />
            </UFormGroup>



            <UFormGroup label="支持设备" required>
              <USelect
                v-model="gameForm.supported_devices"
                :options="deviceOptions"
                placeholder="选择支持设备"
              />
            </UFormGroup>

            <UFormGroup label="图标URL">
              <UInput v-model="gameForm.icon_url" placeholder="请输入图标URL" />
            </UFormGroup>

            <UFormGroup label="注册链接">
              <UInput v-model="gameForm.register_url" placeholder="请输入注册链接" />
            </UFormGroup>

            <UFormGroup label="iOS下载链接">
              <UInput v-model="gameForm.ios_download_url" placeholder="请输入iOS下载链接" />
            </UFormGroup>

            <UFormGroup label="Android下载链接">
              <UInput v-model="gameForm.android_download_url" placeholder="请输入Android下载链接" />
            </UFormGroup>
          </div>

          <UFormGroup label="游戏描述">
            <UTextarea v-model="gameForm.description" placeholder="请输入游戏描述" />
          </UFormGroup>

          <div class="flex justify-end gap-2 pt-4">
            <UButton color="gray" @click="closeGameModal">取消</UButton>
            <UButton type="submit" color="primary" :loading="loading">
              {{ editingGame ? '更新' : '创建' }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </UModal>

    <!-- 消息通知 -->
    <UNotifications />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '~/store/auth';

const authStore = useAuthStore();

// 状态数据
const loading = ref(true);
const gameList = ref([]);
const adminLevel = ref(0);
const channelCode = ref('');
const toast = useToast();

// 游戏管理相关状态
const showAddModal = ref(false);
const editingGame = ref(null);
const gameForm = ref({
  game_name: '',
  game_code: '',
  icon_url: '',
  supported_devices: '',
  register_url: '',
  ios_download_url: '',
  android_download_url: '',
  description: ''
});

// 设备选项
const deviceOptions = [
  { label: 'H5网页', value: 'H5' },
  { label: 'iOS应用', value: 'iOS' },
  { label: 'Android应用', value: 'Android' },
  { label: 'iOS + Android', value: 'Dual' },
  { label: '全平台', value: 'All' }
];

// 是否为超级管理员
const isSuperAdmin = computed(() => adminLevel.value === 0);

// 页面初始化
onMounted(async () => {
  authStore.init();
  await loadAuthorizedGames();
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
  return levelMap[level] || '未知级别';
};

// 格式化支持设备
const formatDevices = (devices) => {
  const deviceMap = {
    'H5': 'H5网页',
    'iOS': 'iOS应用',
    'Android': 'Android应用',
    'Dual': 'iOS + Android',
    'All': '全平台'
  };
  return deviceMap[devices] || devices;
};

// 获取游戏状态（处理数字类型）
const getGameStatus = (isActive) => {
  // 将数字类型转换为布尔值
  const active = Boolean(Number(isActive));
  return active ? 'active' : 'inactive';
};

// 处理图片加载错误
const handleImageError = (event) => {
  // 隐藏加载失败的图片
  event.target.style.display = 'none';
  
  // 显示默认图标，需要找到同级的默认图标元素
  const container = event.target.parentElement;
  const defaultIcon = container.querySelector('.default-icon');
  if (defaultIcon) {
    defaultIcon.style.display = 'flex';
  }
};

// 获取组合后的注册链接 (url + g + c)
const getRegisterUrl = (game) => {
  if (!game.register_url || !game.game_code) {
    return null;
  }
  
  try {
    // 清理URL，去除可能的空格
    const baseUrl = game.register_url.trim();
    
    // 检查URL是否已经包含参数
    const hasParams = baseUrl.includes('?');
    const separator = hasParams ? '&' : '?';
    
    // 组合URL: 基础URL + g + c (短格式参数)
    let combinedUrl = `${baseUrl}${separator}g=${encodeURIComponent(game.game_code)}`;
    
    // 如果有渠道代码，则添加
    if (channelCode.value) {
      combinedUrl += `&c=${encodeURIComponent(channelCode.value)}`;
    }
    
    console.log('组合注册链接:', {
      base_url: baseUrl,
      game_code: game.game_code,
      channel_code: channelCode.value,
      final_url: combinedUrl
    });
    
    return combinedUrl;
  } catch (error) {
    console.error('生成注册链接失败:', error, game);
    return null;
  }
};

// 复制链接到剪贴板
const copyLink = async (url, linkType) => {
  if (!url) return;
  
  try {
    await navigator.clipboard.writeText(url);
    
    // 使用 Nuxt UI 的 toast 通知系统
    toast.add({
      title: '复制成功',
      description: `${linkType}已复制到剪贴板`,
      color: 'green',
      icon: 'i-heroicons-check-circle',
      timeout: 3000
    });
    
    console.log(`${linkType}已复制到剪贴板:`, url);
    
  } catch (err) {
    console.error('复制失败:', err);
    
    // 降级方案：选择文本
    try {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      
      // 降级成功也显示成功消息
      toast.add({
        title: '复制成功',
        description: `${linkType}已复制到剪贴板`,
        color: 'green',
        icon: 'i-heroicons-check-circle',
        timeout: 3000
      });
      
      console.log(`${linkType}已复制到剪贴板 (降级方案):`, url);
    } catch (fallbackErr) {
      console.error('降级复制也失败:', fallbackErr);
      
      // 复制失败时显示错误消息
      toast.add({
        title: '复制失败',
        description: '请手动复制链接',
        color: 'red',
        icon: 'i-heroicons-exclamation-circle',
        timeout: 5000
      });
    }
  }
};

// 打开链接
const openLink = (url) => {
  if (url) {
    window.open(url, '_blank');
  }
};

// 加载被授权的游戏列表
const loadAuthorizedGames = async () => {
  try {
    loading.value = true;

    // 检查是否为管理员登录
    if (!authStore.isLoggedIn || authStore.isUser) {
      console.error('未登录或不是管理员账号');
      return;
    }

    const adminId = authStore.id;
    const permissions = authStore.permissions;
    
    if (permissions) {
      adminLevel.value = permissions.level;
    }

    // 获取当前管理员的渠道代码
    try {
      if (authStore.permissions) {
        const perms = typeof authStore.permissions === 'string' ? JSON.parse(authStore.permissions) : authStore.permissions;
        if (perms && perms.channel_code) {
          // 直接使用管理员自己的渠道代码（包括超级管理员）
          channelCode.value = perms.channel_code;
        }
      }
    } catch (error) {
      console.error('获取渠道代码失败:', error);
    }

    console.log('当前管理员:', {
      name: authStore.name,
      id: adminId,
      level: adminLevel.value,
      channel: channelCode.value,
      permissions: authStore.permissions
    });

    // 调用API获取游戏列表
    console.log('正在调用API获取游戏列表...');
    
    let response;
    if (adminLevel.value === 0) {
      // 超级管理员获取所有游戏
      response = await $fetch('/api/admin/games');
    } else {
      // 普通管理员获取被授权的游戏
      response = await $fetch('/api/admin/filtered-games', {
        method: 'POST',
        body: {
          admin_id: adminId
        }
      });
    }

    console.log('获取游戏列表API响应:', {
      success: response.success,
      dataLength: response.data ? response.data.length : 0,
      data: response.data,
      fullResponse: response
    });

    if (response.success && response.data) {
      gameList.value = response.data;
      console.log('游戏列表设置完成，共', gameList.value.length, '个游戏');
      console.log('游戏数据示例:', gameList.value[0]);
    } else {
      console.error('获取游戏列表失败:', response);
      gameList.value = [];
    }

  } catch (error) {
    console.error('加载游戏列表失败:', error);
    gameList.value = [];
  } finally {
    loading.value = false;
  }
};

// 游戏管理函数
const editGame = (game) => {
  editingGame.value = game;
  gameForm.value = {
    game_name: game.game_name,
    game_code: game.game_code || '',
    icon_url: game.icon_url || '',
    supported_devices: game.supported_devices,
    register_url: game.register_url || '',
    ios_download_url: game.ios_download_url || '',
    android_download_url: game.android_download_url || '',
    description: game.description || ''
  };
  showAddModal.value = true;
};

const saveGame = async (event) => {
  try {
    event.preventDefault();
    loading.value = true;

    // 验证必填项
    if (!gameForm.value.game_name || !gameForm.value.supported_devices) {
      toast.add({
        title: '错误',
        description: '游戏名称和支持设备为必填项',
        color: 'red'
      });
      return;
    }

    const requestData = {
      ...gameForm.value,
      admin_id: authStore.id
    };

    let response;
    if (editingGame.value) {
      // 编辑现有游戏
      response = await $fetch('/api/admin/games/update', {
        method: 'POST',
        body: {
          id: editingGame.value.id,
          ...requestData
        }
      });
    } else {
      // 创建新游戏
      response = await $fetch('/api/admin/games/create', {
        method: 'POST',
        body: requestData
      });
    }

    if (response.success) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      });
      
      closeGameModal();
      await loadAuthorizedGames(); // 重新加载游戏列表
    } else {
      toast.add({
        title: '错误',
        description: response.message || '操作失败',
        color: 'red'
      });
    }
  } catch (error) {
    console.error('保存游戏失败:', error);
    toast.add({
      title: '错误',
      description: error.data?.message || '操作失败',
      color: 'red'
    });
  } finally {
    loading.value = false;
  }
};

const toggleGameStatus = async (game) => {
  try {
    const currentStatus = getGameStatus(game.is_active);
    const newStatusValue = currentStatus === 'active' ? 0 : 1;
    
    console.log('切换游戏状态:', {
      gameId: game.id,
      gameName: game.game_name,
      currentStatus: currentStatus,
      currentValue: game.is_active,
      newValue: newStatusValue
    });
    
    const response = await $fetch('/api/admin/games/toggle-status', {
      method: 'POST',
      body: {
        id: game.id,
        is_active: newStatusValue,
        admin_id: authStore.id
      }
    });

    if (response.success) {
      // 更新本地状态
      game.is_active = newStatusValue;
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      });
    } else {
      toast.add({
        title: '错误',
        description: response.message || '操作失败',
        color: 'red'
      });
    }
  } catch (error) {
    console.error('切换游戏状态失败:', error);
    toast.add({
      title: '错误',
      description: error.data?.message || '操作失败',
      color: 'red'
    });
  }
};

const deleteGame = async (game) => {
  if (!confirm(`确定要删除游戏 "${game.game_name}" 吗？\n删除后将从所有管理员的权限中移除，此操作不可恢复！`)) {
    return;
  }

  try {
    console.log('正在删除游戏:', {
      gameId: game.id,
      gameName: game.game_name,
      adminId: authStore.id,
      adminLevel: adminLevel.value
    });
    
    const response = await $fetch('/api/admin/games/delete', {
      method: 'POST',
      body: {
        id: game.id,
        admin_id: authStore.id
      }
    });

    console.log('删除游戏API响应:', response);

    if (response.success) {
      toast.add({
        title: '成功',
        description: response.message,
        color: 'green'
      });
      
      await loadAuthorizedGames(); // 重新加载游戏列表
    } else {
      console.error('删除失败，服务器返回:', response);
      toast.add({
        title: '错误',
        description: response.message || '删除失败',
        color: 'red'
      });
    }
  } catch (error) {
    console.error('删除游戏失败 - 详细错误:', {
      error: error,
      message: error.message,
      statusCode: error.statusCode,
      statusMessage: error.statusMessage,
      data: error.data
    });
    
    let errorMessage = '删除失败';
    if (error.statusCode === 403) {
      errorMessage = '权限不足，只有超级管理员可以删除游戏';
    } else if (error.statusCode === 404) {
      errorMessage = '游戏不存在或已被删除';
    } else if (error.data?.message) {
      errorMessage = error.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    toast.add({
      title: '错误',
      description: errorMessage,
      color: 'red'
    });
  }
};

const closeGameModal = () => {
  showAddModal.value = false;
  editingGame.value = null;
  gameForm.value = {
    game_name: '',
    game_code: '',
    icon_url: '',
    supported_devices: '',
    register_url: '',
    ios_download_url: '',
    android_download_url: '',
    description: ''
  };
};
</script>

<style scoped>
.game-list-page {
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

.game-list-card {
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

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.permission-level {
  padding: 4px 8px;
  background: #e6f7ff;
  color: #1890ff;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.game-count {
  color: #666;
  font-size: 14px;
}

.loading-container, .empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.loading-text {
  color: #666;
  font-size: 14px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  color: #333;
  margin-bottom: 8px;
}

.empty-desc {
  color: #666;
  font-size: 14px;
}

/* 游戏列表表格 */
.games-table-container {
  padding: 20px;
  overflow-x: auto;
}

.games-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.games-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}



.action-cell {
  text-align: center;
}

.action-buttons {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.games-table tbody tr {
  transition: all 0.2s ease;
}

.games-table tbody tr:hover {
  background: #f8fafc;
  transform: scale(1.01);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.games-table tbody tr:last-child {
  border-bottom: none;
}

.games-table th {
  padding: 16px 12px;
  text-align: center;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.5px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  vertical-align: middle;
}

.games-table td {
  padding: 16px 12px;
  vertical-align: middle;
  font-size: 14px;
  text-align: center;
  height: 80px;
  border-bottom: 1px solid #f1f5f9;
}

/* 列宽设置 */
.icon-col { width: 80px; }
.name-col { width: 150px; }
.code-col { width: 100px; }
.device-col { width: 90px; }
.status-col { width: 80px; }
.register-col { width: 200px; }
.ios-col { width: 180px; }
.android-col { width: 180px; }

/* 图标单元格 */
.icon-cell {
  text-align: center;
}

.game-icon-wrapper {
  display: inline-block;
  position: relative;
}

.game-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid #e8e8e8;
  transition: all 0.2s ease;
}

.game-icon:hover {
  border-color: #1890ff;
  transform: scale(1.05);
}

.default-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #999;
  border: 2px solid #e8e8e8;
}

/* 游戏名称单元格 */
.name-cell {
  min-width: 150px;
  text-align: center !important;
  vertical-align: middle;
}

.game-name-wrapper {
  max-width: 140px;
  text-align: center;
  margin: 0 auto;
}

.game-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-desc {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-height: 32px;
}

/* 游戏代码单元格 */
.game-code-badge {
  background: #f3f4f6;
  color: #374151;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: 600;
  display: inline-block;
}

/* 设备支持单元格 */
.device-badge {
  background: #e0f2fe;
  color: #0277bd;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  display: inline-block;
}

/* 状态单元格 */
.status-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-block;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* 链接容器 */
.link-container {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.link-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 11px;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-input:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.link-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.copy-btn {
  font-size: 10px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  min-width: 40px;
  flex-shrink: 0;
}

.copy-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.no-link {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  text-align: center;
  display: block;
}

.debug-info {
  font-size: 12px;
  color: #10b981;
  background: #d1fae5;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

/* 确保表格在不同屏幕下的表现 */
.games-table {
  
}

.games-table tbody tr:last-child td {
  border-bottom: none;
}



/* 响应式适配 */
@media (max-width: 1200px) {
  .games-table-container {
    padding: 16px;
  }
  
  .games-table th,
  .games-table td {
    padding: 12px 8px;
    font-size: 13px;
  }
  
  .game-name {
    font-size: 14px;
  }
  
  .game-desc {
    font-size: 11px;
  }
}

@media (max-width: 768px) {
  .game-list-page {
    padding: 12px;
  }
  
  .games-table-container {
    padding: 12px;
    overflow-x: auto;
  }
  
  .games-table {
    min-width: 1100px;
  }
  
  .games-table th,
  .games-table td {
    padding: 10px 6px;
    font-size: 12px;
  }
  
  .game-icon,
  .default-icon {
    width: 36px;
    height: 36px;
    border-radius: 6px;
  }
  
  .default-icon {
    font-size: 16px;
  }
  
  .game-name {
    font-size: 13px;
  }
  
  .game-desc {
    font-size: 10px;
    -webkit-line-clamp: 1;
    max-height: 16px;
  }
  
  .game-code-badge,
  .device-badge,
  .status-badge {
    font-size: 10px;
    padding: 3px 6px;
  }
  
  .link-container {
    flex-direction: column;
    gap: 4px;
  }
  
  .link-input {
    font-size: 10px;
    padding: 2px 4px;
  }
  
  .copy-btn {
    font-size: 9px;
    padding: 2px 6px;
    min-width: 35px;
    align-self: stretch;
  }
  
  .no-link {
    font-size: 10px;
  }
  
  .card-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  
  .header-info {
    align-self: stretch;
    justify-content: space-between;
  }
}

@media (max-width: 480px) {
  .games-table-container {
    padding: 8px;
  }
  
  .games-table {
    min-width: 1000px;
  }
  
  .games-table th,
  .games-table td {
    padding: 8px 4px;
    font-size: 11px;
  }
  
  .game-icon,
  .default-icon {
    width: 32px;
    height: 32px;
    border-radius: 4px;
  }
  
  .default-icon {
    font-size: 14px;
  }
  
  .link-container {
    flex-direction: column;
    gap: 2px;
  }
  
  .link-input {
    font-size: 9px;
    padding: 2px 4px;
  }
  
  .copy-btn {
    font-size: 8px;
    padding: 2px 4px;
    min-width: 30px;
  }
  
  /* 隐藏游戏描述在极小屏幕 */
  .game-desc {
    display: none;
  }
}
</style> 