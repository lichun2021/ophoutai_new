import { useAuthStore } from '~/store/auth';

export const useAuthTimer = () => {
  const authStore = useAuthStore();
  const remainingTime = ref('');
  const intervalId = ref<NodeJS.Timeout | null>(null);

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    return `${hours}小时${minutes}分钟${seconds}秒`;
  };

  const updateRemainingTime = () => {
    if (!authStore.isLoggedIn || !authStore.loginTime) {
      remainingTime.value = '';
      return;
    }

    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;
    const elapsed = now - authStore.loginTime;
    const remaining = fourHours - elapsed;

    if (remaining <= 0) {
      remainingTime.value = '已超时';
      stopTimer();
    } else {
      remainingTime.value = formatTime(remaining);
    }
  };

  const startTimer = () => {
    updateRemainingTime();
    intervalId.value = setInterval(updateRemainingTime, 1000);
  };

  const stopTimer = () => {
    if (intervalId.value) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
  };

  onMounted(() => {
    startTimer();
  });

  onUnmounted(() => {
    stopTimer();
  });

  return {
    remainingTime
  };
}; 