export default defineAppConfig({
  ui: {
    primary: 'orange',
    gray: 'warm-gray',
    
    // 按钮使用暖色调
    button: {
      rounded: 'rounded-full',
      default: {
        size: 'md',
      },
    },
    
    // 输入框
    input: {
      rounded: 'rounded-xl',
    },
    
    // 卡片
    card: {
      rounded: 'rounded-2xl',
      shadow: 'shadow-lg shadow-orange-900/5',
      background: 'bg-orange-50/50',
      ring: '',
      divide: '',
    },

    // 通知
    notifications: {
      position: 'top-0 bottom-auto',
    },
  },
});
