import { defineStore } from 'pinia';

/**
 * 购物车 store
 * 数据持久化到 localStorage（key: cart_items），刷新不丢失。
 * 购物车只存"商品快照 + 数量"，下单时逐个调 /api/client/gift-packages/purchase（后端强制 quantity=1）。
 */

export interface CartItem {
  // 商品唯一键：package_id 优先，否则用 id
  key: string;
  package_id: number | string;
  package_name: string;
  icon_url?: string;
  description?: string;
  price_platform_coins: number;
  price_real_money?: number;
  category?: string;
  gift_items?: any;
  quantity: number;
  max_per_user?: number;
}

const STORAGE_KEY = 'cart_items';

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [] as CartItem[],
    drawerOpen: false,
  }),
  getters: {
    // 总数量（角标用）
    totalCount(state): number {
      return state.items.reduce((sum, item) => sum + item.quantity, 0);
    },
    // 商品种类数
    kindCount(state): number {
      return state.items.length;
    },
    // 平台币总价
    totalPlatformCoins(state): number {
      return state.items.reduce((sum, item) => sum + (item.price_platform_coins || 0) * item.quantity, 0);
    },
    // 人民币总价
    totalRealMoney(state): number {
      return state.items.reduce((sum, item) => sum + (item.price_real_money || 0) * item.quantity, 0);
    },
  },
  actions: {
    init() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          this.items = JSON.parse(saved) || [];
        }
      } catch (e) {
        this.items = [];
      }
    },
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
      } catch (e) {
        console.error('[cart] persist failed:', e);
      }
    },
    // 生成商品唯一键
    makeKey(product: any): string {
      return String(product.package_id || product.id);
    },
    // 加入购物车（自动合并数量）
    add(product: any, qty = 1) {
      if (!product) return;
      const key = this.makeKey(product);
      const existing = this.items.find(i => i.key === key);
      if (existing) {
        existing.quantity += qty;
        // 限购商品数量不超过限购数
        if (product.max_per_user && existing.quantity > product.max_per_user) {
          existing.quantity = product.max_per_user;
        }
      } else {
        const item: CartItem = {
          key,
          package_id: product.package_id || product.id,
          package_name: product.package_name,
          icon_url: product.icon_url,
          description: product.description,
          price_platform_coins: product.price_platform_coins || 0,
          price_real_money: product.price_real_money || 0,
          category: product.category,
          gift_items: product.gift_items,
          quantity: Math.max(1, qty),
          max_per_user: product.max_per_user,
        };
        // 限购商品初始数量不超过限购数
        if (product.max_per_user && item.quantity > product.max_per_user) {
          item.quantity = product.max_per_user;
        }
        this.items.push(item);
      }
      this.persist();
    },
    // 设置指定商品数量
    setQuantity(key: string, qty: number) {
      const item = this.items.find(i => i.key === key);
      if (!item) return;
      const min = 1;
      let max = 99;
      if (item.max_per_user && item.max_per_user > 0) max = item.max_per_user;
      item.quantity = Math.max(min, Math.min(max, qty));
      this.persist();
    },
    // 增加数量
    increment(key: string) {
      const item = this.items.find(i => i.key === key);
      if (!item) return;
      let max = 99;
      if (item.max_per_user && item.max_per_user > 0) max = item.max_per_user;
      if (item.quantity < max) {
        item.quantity += 1;
        this.persist();
      }
    },
    // 减少数量
    decrement(key: string) {
      const idx = this.items.findIndex(i => i.key === key);
      if (idx < 0) return;
      const item = this.items[idx];
      if (item.quantity > 1) {
        item.quantity -= 1;
        this.persist();
      } else {
        // 数量减到 0 即移除
        this.items.splice(idx, 1);
        this.persist();
      }
    },
    // 移除商品
    remove(key: string) {
      const idx = this.items.findIndex(i => i.key === key);
      if (idx >= 0) {
        this.items.splice(idx, 1);
        this.persist();
      }
    },
    // 清空
    clear() {
      this.items = [];
      this.persist();
    },
    openDrawer() { this.drawerOpen = true; },
    closeDrawer() { this.drawerOpen = false; },
    toggleDrawer() { this.drawerOpen = !this.drawerOpen; },
  },
});
