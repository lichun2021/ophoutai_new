// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  app: {
    head: {
      title: '量子发行 - 代理后台',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: '量子发行 - 代理管理后台' },
        { name: 'keywords', content: '量子发行,代理后台,游戏发行' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/quantum-icon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/quantum-icon.svg' }
      ]
    }
  },
  
  nitro: {
    externals: {
      inline: ["lru-cache"]
    }
  },
  
  runtimeConfig: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3002',
    adminLoginIpWhitelist: process.env.ADMIN_LOGIN_IP_WHITELIST || '*',
    
    public: {
      apiBaseURL: process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3002',
      baseUrl: process.env.BASE_URL || 'http://localhost:3002',
      apiSignKey: process.env.API_SIGN_KEY || process.env.PUBLIC_API_SIGN_KEY || 'fasdjhkfh2348!@#$!617'
    }
  },

  compatibilityDate: '2024-04-03',

  devtools: { 
    enabled: true 
  },

  modules: [
    '@pinia/nuxt',
    "@nuxt/ui",
    "@nuxtjs/tailwindcss"
  ],

  // 避免 SSR 在线拉取 Iconify 导致 heroicons 图标超时
  icon: {
    serverBundle: {
      collections: ['heroicons']
    }
  },
})
