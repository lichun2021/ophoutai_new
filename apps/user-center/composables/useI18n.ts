import { computed, onMounted } from 'vue'
import zhMessages from '~/locales/zh.json'
import enMessages from '~/locales/en.json'

export type LocaleType = 'zh' | 'en'

const messages: Record<LocaleType, Record<string, any>> = {
  zh: zhMessages,
  en: enMessages,
}

export function useI18n() {
  const langCookie = useCookie<LocaleType>('user_lang', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    default: () => 'zh',
  })

  const localeState = useState<LocaleType>('user_lang_state', () => {
    const cookieVal = langCookie.value
    if (cookieVal === 'en' || cookieVal === 'zh') {
      return cookieVal
    }
    return 'zh'
  })

  onMounted(() => {
    try {
      const saved = localStorage.getItem('user_lang') as LocaleType | null
      if ((saved === 'zh' || saved === 'en') && saved !== localeState.value) {
        localeState.value = saved
        langCookie.value = saved
      }
    } catch {
      // ignore localStorage errors in SSR/restricted mode
    }
  })

  const locale = computed<LocaleType>({
    get: () => localeState.value || 'zh',
    set: (val: LocaleType) => {
      const normalized: LocaleType = val === 'en' ? 'en' : 'zh'
      localeState.value = normalized
      langCookie.value = normalized
      if (import.meta.client) {
        try {
          localStorage.setItem('user_lang', normalized)
        } catch {
          // ignore
        }
      }
    },
  })

  const isEn = computed(() => locale.value === 'en')

  function setLocale(val: LocaleType) {
    locale.value = val
  }

  function toggleLocale() {
    setLocale(locale.value === 'zh' ? 'en' : 'zh')
  }

  function t(key: string, params?: Record<string, string | number>): string {
    const dict = messages[locale.value] || messages.zh
    const parts = key.split('.')
    let cur: any = dict
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) {
        cur = cur[p]
      } else {
        cur = undefined
        break
      }
    }

    if (typeof cur !== 'string') {
      // Fallback to zh
      let fallback: any = messages.zh
      for (const p of parts) {
        if (fallback && typeof fallback === 'object' && p in fallback) {
          fallback = fallback[p]
        } else {
          fallback = undefined
          break
        }
      }
      cur = typeof fallback === 'string' ? fallback : key
    }

    if (params && typeof cur === 'string') {
      return cur.replace(/\{(\w+)\}/g, (_, k) =>
        params[k] !== undefined && params[k] !== null ? String(params[k]) : `{${k}}`
      )
    }

    return cur
  }

  /**
   * Helper for inline bilingual text: returns `enText` when locale is 'en' (with fallback to `zhText`),
   * or `zhText` when locale is 'zh'.
   */
  function tt(zhText: string, enText?: string | null): string {
    if (locale.value === 'en') {
      return (enText && String(enText).trim()) ? String(enText) : zhText
    }
    return zhText
  }

  return {
    locale,
    isEn,
    setLocale,
    toggleLocale,
    t,
    tt,
  }
}
