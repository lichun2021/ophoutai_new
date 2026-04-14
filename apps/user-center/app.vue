<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <UNotifications />
  </div>
</template>

<script setup>
// 使用 Nuxt 内置的布局系统，不需要手动切换布局
</script>

<style>
/* 全局移动端适配样式 */
@media (max-width: 768px) {
  /* 确保所有输入框在移动端可见 */
  input, select, textarea {
    font-size: 16px !important;
    max-width: 100%;
  }
  
  /* 表格容器统一处理 */
  .table-responsive {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  /* 按钮组在移动端堆叠 */
  .button-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .button-group button {
    width: 100%;
  }
  
  /* 卡片间距调整 */
  .mobile-card {
    margin: 0 -4px;
    border-radius: 0;
  }
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>