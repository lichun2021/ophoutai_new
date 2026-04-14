export const useTips = () => {
  const showTip = (message: string, type: 'success' | 'error' = 'success') => {
    // 创建提示元素
    const tipElement = document.createElement('div');
    tipElement.className = `tip-message tip-${type}`;
    tipElement.textContent = message;
    
    // 设置样式
    Object.assign(tipElement.style, {
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      padding: '12px 24px',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: '500',
      color: type === 'success' ? '#52c41a' : '#ff4d4f',
      backgroundColor: type === 'success' ? '#f6ffed' : '#fff2f0',
      border: type === 'success' ? '1px solid #b7eb8f' : '1px solid #ffccc7',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      transition: 'all 0.3s ease',
      opacity: '0'
    });
    
    // 添加到页面
    document.body.appendChild(tipElement);
    
    // 显示动画
    requestAnimationFrame(() => {
      tipElement.style.opacity = '1';
      tipElement.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    // 3秒后移除
    setTimeout(() => {
      tipElement.style.opacity = '0';
      tipElement.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => {
        if (tipElement.parentNode) {
          document.body.removeChild(tipElement);
        }
      }, 300);
    }, 3000);
  };

  return {
    success: (message: string) => showTip(message, 'success'),
    error: (message: string) => showTip(message, 'error')
  };
}; 