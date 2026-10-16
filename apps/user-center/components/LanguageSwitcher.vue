<template>
  <button
    type="button"
    class="lang-switcher"
    :class="{ 'is-floating': floating, 'is-block': block }"
    :title="t('common.switchLang')"
    @click="toggleLocale"
  >
    <span class="lang-globe">🌐</span>
    <span class="lang-pill" :class="{ active: locale === 'zh' }">中</span>
    <span class="lang-divider">/</span>
    <span class="lang-pill" :class="{ active: locale === 'en' }">EN</span>
  </button>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

defineProps<{
  floating?: boolean
  block?: boolean
}>()

const { locale, toggleLocale, t } = useI18n()
</script>

<style scoped>
.lang-switcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--surface-container, #fce8e6);
  border: 1px solid rgba(168, 50, 6, 0.16);
  color: var(--on-surface-variant, #6e5350);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  font-family: inherit;
  line-height: 1;
}

.lang-switcher:hover {
  background: var(--primary-container, #ffdacf);
  border-color: rgba(168, 50, 6, 0.35);
  transform: translateY(-1px);
}

.lang-switcher.is-floating {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 60;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 14px rgba(168, 50, 6, 0.12);
}

.lang-switcher.is-block {
  width: 100%;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 8px;
}

.lang-globe {
  font-size: 13px;
}

.lang-pill {
  padding: 2px 5px;
  border-radius: 6px;
  transition: all 0.15s ease;
  color: #7c5854;
}

.lang-pill.active {
  background: var(--primary, #a83206);
  color: #ffffff;
  font-weight: 700;
}

.lang-divider {
  opacity: 0.4;
  font-size: 11px;
}
</style>
