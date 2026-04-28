import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    id: 0,
    isLoggedIn: false,
    name: '',
    password: '',
    permissions: null,
    timeoutId: 0 as unknown as number,
    loginTime: 0, // 添加登录时间戳
    // 用户相关状态
    isUser: false, // 是否为普通用户
    userInfo: null as any, // 用户详细信息
  }),
  // setup() {
  //   const store = useAuthStore();
  //   store.init();
  // },
  actions: {
    init() {
      this.id = Number(localStorage.getItem('auth_id')) || 0;
      this.isLoggedIn = localStorage.getItem('auth_isLoggedIn') === 'true';
      this.name = localStorage.getItem('auth_name') || '';
      this.password = localStorage.getItem('auth_password') || '';
      this.permissions = JSON.parse(localStorage.getItem('auth_permissions') || 'null');
      this.loginTime = Number(localStorage.getItem('auth_loginTime')) || 0;
      this.isUser = localStorage.getItem('auth_isUser') === 'true';
      this.userInfo = JSON.parse(localStorage.getItem('auth_userInfo') || 'null');
      
      // 检查登录有效期
      if (this.isLoggedIn && this.loginTime) {
        const now = Date.now();
        // 用户15分钟，管理员4小时
        const duration = this.isUser ? 15 * 60 * 1000 : 4 * 60 * 60 * 1000;
        
        if (now - this.loginTime > duration) {
          console.log(`登录已超过${this.isUser ? '15分钟' : '4小时'}，需要重新登录`);
          this.logOut();
        } else {
          // 计算剩余时间并设置超时
          const remainingTime = duration - (now - this.loginTime);
          this.setTimeoutWithDuration(remainingTime);
        }
      }
    },
    async logInUser(username: string, password: string, ts?: string | number, sig?: string) {
      try {
        console.log('🚀 开始用户登录请求...');
        
        if (!username) {
          console.log('❌ 用户名为空');
          return false;
        }
        
        const body: any = { username };
        if (sig && ts) {
          body.ts = ts;
          body.sig = sig;
        } else {
          if (!password) {
            console.log('❌ 缺少密码或签名');
            return false;
          }
          body.password = password;
        }
        const response = await $fetch('/api/user/login', { method: 'POST', body }) as any;

        console.log("✅ 用户登录response:", response);
        
        // 检查响应是否有效
        if (!response) {
          console.log('❌ 响应为空');
          return false;
        }
        
        if (response.data && response.data.user) {
          console.log('📝 开始设置用户状态...');
          
          this.isLoggedIn = true;
          this.isUser = true;
          this.id = response.data.user.id;
          this.name = response.data.user.username;
          this.userInfo = response.data.user;
          this.loginTime = Date.now();
          this.permissions = null; // 用户没有管理权限

          console.log('💾 开始保存到localStorage...');
          // 保存到localStorage
          localStorage.setItem('auth_id', this.id.toString());
          localStorage.setItem('auth_isLoggedIn', 'true');
          localStorage.setItem('auth_name', this.name);
          localStorage.setItem('auth_loginTime', this.loginTime.toString());
          localStorage.setItem('auth_isUser', 'true');
          localStorage.setItem('auth_userInfo', JSON.stringify(this.userInfo));
          
          console.log('✅ 用户登录状态已设置:', {
            isLoggedIn: this.isLoggedIn,
            isUser: this.isUser,
            id: this.id,
            name: this.name
          });
          
          console.log('⏰ 设置登录超时...');
          this.resetTimeout();
          
          console.log('🎉 用户登录流程完成，返回true');
          return true;
        } else {
          console.log('❌ 响应数据格式错误或登录失败:', response);
          return false;
        }
      } catch (error: any) {
          console.error('💥 用户登录异常:', error);
          console.error('错误详情:', {
            message: error?.message,
            stack: error?.stack,
            name: error?.name,
            data: error?.data
          });
          this.clearAuthState();
          // 不重新抛出错误，而是返回false让上层正常处理
          return false;
        }
    },
    async logInAdmin(username: string, password: string) {
      try {
        const response = await $fetch('/api/admin/login', {
          method: 'POST',
          body: { "name":username, "password":password }
        }) as any;

        console.log("代理登录response:", response)
        

        if (response.data) {
            this.isLoggedIn = true; 
            this.isUser = false; // 管理员不是普通用户
            const data = response.data.permissions;
            this.id = response.data.id;
            this.permissions = JSON.parse(data);
            this.name = username;
            this.password = password;
            this.loginTime = Date.now();
            this.userInfo = null; // 管理员没有用户信息

            localStorage.setItem('auth_id', this.id.toString());
            localStorage.setItem('auth_isLoggedIn', 'true');
            localStorage.setItem('auth_name', this.name);
            localStorage.setItem('auth_password', this.password);
            localStorage.setItem('auth_permissions', JSON.stringify(this.permissions));
            localStorage.setItem('auth_loginTime', this.loginTime.toString());
            localStorage.setItem('auth_isUser', 'false');
            localStorage.removeItem('auth_userInfo');
            
            console.log('代理登录状态已设置:', this.isLoggedIn);
            this.resetTimeout();
            return true;
        } else {
          return false;
        }
      } catch (error: any) {
        console.error('代理登录失败:', error);
        const errorMsg = error.data?.message || error.message || '登录失败';
        this.clearAuthState();
        return { error: errorMsg };
      }
    },
    clearAuthState() {
      this.isLoggedIn = false;
      this.permissions = null;
      this.id = 0;
      this.name = '';
      this.password = '';
      this.isUser = false;
      this.userInfo = null;
      this.loginTime = 0;

      localStorage.removeItem('auth_id');
      localStorage.removeItem('auth_isLoggedIn');
      localStorage.removeItem('auth_name');
      localStorage.removeItem('auth_password');
      localStorage.removeItem('auth_permissions');
      localStorage.removeItem('auth_loginTime');
      localStorage.removeItem('auth_isUser');
      localStorage.removeItem('auth_userInfo');
    },
    logOut() {
      clearTimeout(this.timeoutId);
      
      // 在清除状态前先保存用户类型
      const wasUser = this.isUser;
      
      this.clearAuthState();
      this.timeoutId = 0;
      
      // 根据之前的用户类型跳转到不同的登录页
      const router = useRouter();
      if (wasUser) {
        router.push('/user/login'); // 用户跳转到用户登录页
      } else {
        router.push('/admin/login'); // 管理员跳转到代理登录页
      }
    },
    resetTimeout() {
      // 用户15分钟，管理员4小时
      const duration = this.isUser ? 15 * 60 * 1000 : 4 * 60 * 60 * 1000;
      this.setTimeoutWithDuration(duration);
    },
    setTimeoutWithDuration(duration: number) {
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => {
        console.log('登录超时，自动登出');
        this.logOut();
      }, duration) as unknown as number;
    },
    // 刷新用户余额
    async refreshBalance() {
      if (!this.isUser || !this.id) {
        return false;
      }
      
      try {
        console.log('🔄 刷新用户余额...');
        // 使用客户端余额接口，携带 Authorization 头便于后端鉴权
        const response = await $fetch(`/api/client/balance?user_id=${this.id}`, {
          headers: {
            Authorization: String(this.id)
          }
        }) as any;
        
        if (response && response.code === 200 && response.data) {
          const newBalance = response.data.platform_coins;
          console.log(`✅ 余额更新: ${this.userInfo?.platform_coins} -> ${newBalance}`);
          
          // 更新 userInfo 中的余额
          if (this.userInfo) {
            this.userInfo.platform_coins = newBalance;
            localStorage.setItem('auth_userInfo', JSON.stringify(this.userInfo));
          }
          
          return true;
        }
        return false;
      } catch (error) {
        console.error('刷新余额失败:', error);
        return false;
      }
    }
  }
});
