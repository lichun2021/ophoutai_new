// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  app: {
    head: {
      title: '用户中心',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: '用户充值与礼包中心' },
        { name: 'keywords', content: '用户中心,游戏充值,礼包' }
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
    baseUrl: process.env.BASE_URL || 'http://localhost:3001',

    public: {
      apiBaseURL: process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3001',
      baseUrl: process.env.BASE_URL || 'http://localhost:3001',
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

  // 避免 SSR 在线拉取 Iconify 导致 heroicons:… 超时（默认 1500ms）
  icon: {
    serverBundle: {
      collections: ['heroicons']
    }
  },
})
