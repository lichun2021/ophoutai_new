<template>
  <div class="benefits-page">

    <!-- 顶部欢迎 Banner -->
    <div class="banner">
      <div class="banner-orb"></div>
      <div class="banner-content">
        <h2 class="banner-title">⭐ 权益中心</h2>
        <p class="banner-sub">每日领取专属平台币，让你的游戏更精彩</p>
      </div>
    </div>

    <!-- ====== 月卡区块 ====== -->
    <div class="section-card">
      <div class="section-head">
        <span class="section-icon">🃏</span>
        <h3 class="section-title">月卡权益</h3>
      </div>

      <!-- 始终并列 2 张卡 -->
      <div class="card-list">

        <!-- 月卡 -->
        <div class="mc-card" :class="monthlyCard ? 'monthly active-card' : 'monthly inactive-card'">
          <div class="mc-card-top">
            <div class="mc-card-badge">🌙 月卡</div>
            <div v-if="monthlyCard" class="mc-status-tag on">已开通</div>
            <div v-else class="mc-status-tag off">未开通</div>
          </div>
          <div class="mc-card-coins" v-if="monthlyCard">
            <span class="coin-num">{{ monthlyCard.daily_coins }}</span>
            <span class="coin-unit">平台币/天</span>
          </div>
          <div class="mc-card-coins inactive" v-else>
            <span class="coin-num">648</span>
            <span class="coin-unit">平台币/天</span>
          </div>
          <div class="mc-card-meta">
            <template v-if="monthlyCard">
              <span class="mc-expire">
                到期：{{ monthlyCard.expire_date }}
                <span v-if="getDaysLeft(monthlyCard.expire_date) <= 3" class="expire-warn">（即将到期）</span>
              </span>
            </template>
            <span v-else class="mc-expire dim">30 天有效</span>
          </div>
          <button
            v-if="monthlyCard"
            class="card-claim-btn"
            :class="{ claimed: isCardClaimed(monthlyCard), loading: cardClaiming }"
            :disabled="isCardClaimed(monthlyCard) || cardClaiming"
            @click="claimCard"
          >
            <template v-if="isCardClaimed(monthlyCard)">✅ 今日已领取</template>
            <template v-else-if="cardClaiming">领取中...</template>
            <template v-else>领取 {{ monthlyCard.daily_coins }} 平台币</template>
          </button>
          <button v-else class="card-claim-btn buy" @click="purchaseCard('monthly')">立即购买</button>
        </div>

        <!-- 终身卡 -->
        <div class="mc-card" :class="lifetimeCard ? 'lifetime active-card' : 'lifetime inactive-card'">
          <div class="mc-card-top">
            <div class="mc-card-badge">✨ 终身卡</div>
            <div v-if="lifetimeCard" class="mc-status-tag on">已开通</div>
            <div v-else class="mc-status-tag off">未开通</div>
          </div>
          <div class="mc-card-coins" v-if="lifetimeCard">
            <span class="coin-num">{{ lifetimeCard.daily_coins }}</span>
            <span class="coin-unit">平台币/天</span>
          </div>
          <div class="mc-card-coins inactive" v-else>
            <span class="coin-num">500</span>
            <span class="coin-unit">平台币/天</span>
          </div>
          <div class="mc-card-meta">
            <span v-if="lifetimeCard" class="mc-expire lifetime">永久有效</span>
            <span v-else class="mc-expire dim">永久有效</span>
          </div>
          <button
            v-if="lifetimeCard"
            class="card-claim-btn gold"
            :class="{ claimed: isCardClaimed(lifetimeCard), loading: cardClaiming }"
            :disabled="isCardClaimed(lifetimeCard) || cardClaiming"
            @click="claimCard"
          >
            <template v-if="isCardClaimed(lifetimeCard)">✅ 今日已领取</template>
            <template v-else-if="cardClaiming">领取中...</template>
            <template v-else>领取 {{ lifetimeCard.daily_coins }} 平台币</template>
          </button>
          <button v-else class="card-claim-btn buy gold" @click="purchaseCard('lifetime')">立即购买</button>
        </div>

      </div>

      <!-- 本月领取日历（有任意卡时显示） -->
      <template v-if="cardStatus.cards.length > 0">
        <div class="mini-calendar">
          <div class="mini-cal-title">本月领取记录</div>
          <div class="mini-cal-grid">
            <div
              v-for="day in monthDays"
              :key="day.date"
              class="mini-day"
              :class="{
                claimed: cardStatus.claimedDates.includes(day.date),
                today: day.date === cardStatus.today,
                future: day.isFuture
              }"
            >
              {{ day.num }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 奖励动画弹出 -->
    <Transition name="reward-pop">
      <div v-if="rewardPopup.show" class="reward-popup" @click="rewardPopup.show = false">
        <div class="reward-card">
          <div class="reward-icon">🎉</div>
          <div class="reward-title">{{ rewardPopup.title }}</div>
          <div class="reward-coins">+{{ rewardPopup.coins }}</div>
          <div class="reward-sub">平台币</div>
          <div class="reward-new-bal">当前余额：{{ formatBalance(rewardPopup.newBalance) }}</div>
          <div class="reward-hint">点击任意处关闭</div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useTips } from '@/composables/useTips';

definePageMeta({ middleware: 'auth', layout: 'user' });

const router = useRouter();
const authStore = useAuthStore();
const tips = useTips();

// ─── 状态 ───
const cardStatus = ref({
  cards: [],
  totalDailyCoins: 0,
  todayClaimed: false,
  unclaimedCards: [],
  claimedDates: [],
  today: '',
});

const cardClaiming = ref(false);

const rewardPopup = ref({
  show: false,
  title: '',
  coins: 0,
  newBalance: 0,
});

// ─── 月卡快捷访问器 ───
const monthlyCard = computed(() =>
  cardStatus.value.cards.find(c => c.card_type === 'monthly') ?? null
);
const lifetimeCard = computed(() =>
  cardStatus.value.cards.find(c => c.card_type === 'lifetime') ?? null
);

// 某张卡今天是否已领取
const isCardClaimed = (card) => {
  if (!card) return false;
  // unclaimedCards 里没有这张卡就表示已领
  return !cardStatus.value.unclaimedCards.some(c => c.id === card.id);
};

// ─── 格式化 ───
const formatBalance = (v) => Math.floor(Number(v || 0)).toString();

const getDaysLeft = (expireDate) => {
  const today = new Date();
  const exp = new Date(expireDate);
  return Math.ceil((exp - today) / 86400000);
};

// ─── 日历计算 ───
const monthDays = computed(() => {
  if (!cardStatus.value.today) return [];
  const today = cardStatus.value.today;
  const [y, m] = today.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    const date = `${today.slice(0, 7)}-${d}`;
    return { num: i + 1, date, isFuture: date > today };
  });
});

// ─── API 调用 ───
const loadCardStatus = async () => {
  try {
    const res = await $fetch('/api/client/benefits/monthly-card/status', {
      query: { user_id: authStore.userInfo?.id },
    });
    if (res.code === 200) cardStatus.value = res.data;
  } catch { /* 静默失败 */ }
};

const claimCard = async () => {
  if (cardClaiming.value || cardStatus.value.todayClaimed) return;
  cardClaiming.value = true;
  try {
    const res = await $fetch('/api/client/benefits/monthly-card/claim', {
      method: 'POST',
      body: { user_id: authStore.userInfo?.id },
    });
    if (res.code === 200) {
      // 乐观更新：立即设置已领取状态，不等接口刷新
      cardStatus.value = {
        ...cardStatus.value,
        todayClaimed: true,
        unclaimedCards: [],
        claimedDates: [...cardStatus.value.claimedDates, cardStatus.value.today],
      };
      // 立即更新为颟
      authStore.platformCoins = res.data.new_balance;
      if (authStore.userInfo) {
        authStore.userInfo = { ...authStore.userInfo, platform_coins: res.data.new_balance };
      }
      rewardPopup.value = {
        show: true,
        title: '月卡权益领取成功！',
        coins: res.data.coins_claimed,
        newBalance: res.data.new_balance,
      };
      // 异步刷新（不阅塞 UI）
      loadCardStatus();
    } else {
      tips.warning(res.message || '领取失败');
    }
  } catch {
    tips.error('网络错误，请稍后重试');
  } finally {
    cardClaiming.value = false;
  }
};

const purchaseCard = (cardType) => {
  // 调转到月卡专用收银台
  router.push({ path: '/user/card-payment', query: { type: cardType } });
};

onMounted(async () => {
  if (!authStore.isLoggedIn || !authStore.isUser) {
    router.push('/user/login');
    return;
  }
  await loadCardStatus();
});
</script>

<style scoped>
.benefits-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Banner ── */
.banner {
  position: relative;
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 60%, #4c1d95 100%);
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  overflow: hidden;
  color: #fff;
}
.banner-orb {
  position: absolute;
  right: -30px; top: -30px;
  width: 180px; height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%);
}
.banner-title { margin: 0 0 6px; font-size: 22px; font-weight: 800; }
.banner-sub { margin: 0; font-size: 13px; color: rgba(255,255,255,0.8); }

/* ── Section ── */
.section-card {
  background: var(--surface-container);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.section-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 18px;
}
.section-icon { font-size: 20px; }
.section-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--on-surface); flex: 1; }

/* ── 月卡卡片布局 ── */
.card-list {
  display: flex; gap: 12px;
  margin-bottom: 18px;
}
.mc-card {
  flex: 1;
  border-radius: var(--radius-md);
  padding: 16px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* 有效状态 */
.mc-card.monthly.active-card {
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  color: #fff;
}
.mc-card.lifetime.active-card {
  background: linear-gradient(135deg, #d97706, #92400e);
  color: #fff;
}
/* 未开通状态 */
.mc-card.monthly.inactive-card {
  background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(91,33,182,0.05));
  border: 2px dashed rgba(124,58,237,0.3);
  color: var(--on-surface-variant);
}
.mc-card.lifetime.inactive-card {
  background: linear-gradient(135deg, rgba(217,119,6,0.08), rgba(146,64,14,0.05));
  border: 2px dashed rgba(217,119,6,0.3);
  color: var(--on-surface-variant);
}
.mc-card-top {
  display: flex; justify-content: space-between; align-items: center;
}
.mc-card-badge {
  background: rgba(255,255,255,0.2);
  border-radius: var(--radius-xl);
  padding: 3px 10px; font-size: 12px; font-weight: 700;
}
.inactive-card .mc-card-badge {
  background: rgba(0,0,0,0.06);
  color: var(--on-surface-variant);
}
.mc-status-tag {
  font-size: 10px; font-weight: 700;
  padding: 2px 8px; border-radius: var(--radius-xl);
}
.mc-status-tag.on {
  background: rgba(255,255,255,0.25);
  color: #fff;
}
.mc-status-tag.off {
  background: rgba(0,0,0,0.08);
  color: var(--on-surface-variant);
}
.mc-card-coins {
  text-align: center;
}
.mc-card-coins.inactive {
  opacity: 0.35;
}
.coin-num {
  font-size: 28px; font-weight: 900;
  display: block;
  color: inherit;
}
.coin-unit {
  font-size: 11px;
  display: block;
  color: rgba(255,255,255,0.7);
}
.inactive-card .coin-unit {
  color: var(--on-surface-variant);
}
.mc-card-meta .mc-expire {
  font-size: 11px;
  color: rgba(255,255,255,0.8);
}
.mc-card-meta .mc-expire.lifetime { color: rgba(255,255,255,0.9); font-weight: 600; }
.mc-card-meta .mc-expire.dim { color: var(--on-surface-variant); opacity: 0.6; }
.expire-warn { color: #fbbf24; font-weight: 600; }

/* ── 月历 ── */
.mini-calendar { margin-top: 4px; }
.mini-cal-title { font-size: 12px; color: var(--on-surface-variant); margin-bottom: 10px; }
.mini-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.mini-day {
  aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  font-size: 11px;
  background: var(--surface-container-low);
  color: var(--on-surface-variant);
  font-weight: 500;
}
.mini-day.claimed {
  background: linear-gradient(135deg, rgba(124,58,237,0.3), rgba(91,33,182,0.2));
  color: #a78bfa;
  font-weight: 700;
}
.mini-day.today {
  border: 2px solid #7c3aed;
  color: var(--on-surface);
  font-weight: 700;
}
.mini-day.future { opacity: 0.35; }

.shop-perday { font-size: 13px; color: var(--on-surface-variant); margin-bottom: 4px; }
.shop-duration { font-size: 12px; color: var(--on-surface-variant); margin-bottom: 14px; }
.shop-btn {
  width: 100%; padding: 10px;
  border: none; border-radius: var(--radius-sm);
  font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: var(--font-family); transition: all 0.2s;
}
.shop-card.monthly .shop-btn {
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  color: #fff;
}
.shop-card.lifetime .shop-btn {
  background: linear-gradient(135deg, #d97706, #92400e);
  color: #fff;
}
.shop-btn:hover { transform: translateY(-1px); opacity: 0.9; }

/* ── 奖励弹窗 ── */
.reward-popup {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
}
.reward-card {
  background: var(--surface-container-low);
  border-radius: var(--radius-lg);
  padding: 36px 32px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  min-width: 240px;
}
.reward-icon { font-size: 48px; margin-bottom: 12px; }
.reward-title { font-size: 16px; font-weight: 700; color: var(--on-surface); margin-bottom: 16px; }
.reward-coins { font-size: 56px; font-weight: 900; color: #7c3aed; line-height: 1; }
.reward-sub { font-size: 14px; color: var(--on-surface-variant); margin-bottom: 12px; }
.reward-new-bal { font-size: 13px; color: var(--on-surface-variant); margin-bottom: 16px; }
.reward-hint { font-size: 12px; color: var(--on-surface-variant); opacity: 0.6; }

/* 弹窗动画 */
.reward-pop-enter-active { animation: reward-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.reward-pop-leave-active { animation: reward-in 0.2s reverse ease-in; }
@keyframes reward-in {
  from { opacity: 0; transform: scale(0.7); }
  to   { opacity: 1; transform: scale(1); }
}

</style>
