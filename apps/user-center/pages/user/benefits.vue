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
        <span v-if="cardStatus.cards.length > 0" class="section-badge active">已开通</span>
        <span v-else class="section-badge">未开通</span>
      </div>

      <!-- 有月卡 -->
      <template v-if="cardStatus.cards.length > 0">
        <!-- 卡片列表 -->
        <div class="card-list">
          <div v-for="card in cardStatus.cards" :key="card.id" class="mc-card"
               :class="card.card_type">
            <div class="mc-card-top">
              <div class="mc-card-badge">{{ card.card_type === 'lifetime' ? '终身卡' : '月卡' }}</div>
              <div class="mc-card-coins">
                <span class="coin-num">{{ card.daily_coins }}</span>
                <span class="coin-unit">平台币/天</span>
              </div>
            </div>
            <div class="mc-card-bottom">
              <span class="mc-expire" v-if="card.expire_date">
                到期：{{ card.expire_date }}
                <span v-if="getDaysLeft(card.expire_date) <= 3" class="expire-warn">（即将到期）</span>
              </span>
              <span class="mc-expire lifetime" v-else>永久有效</span>
            </div>
          </div>
        </div>

        <!-- 合并领取区 -->
        <div class="claim-area">
          <div class="claim-info">
            <div class="claim-total">
              今日可领：<strong>{{ cardStatus.totalDailyCoins }}</strong> 平台币
            </div>
            <div class="claim-stacked" v-if="cardStatus.cards.length > 1">
              （月卡 + 终身卡叠加）
            </div>
          </div>
          <button
            class="claim-btn"
            :class="{ claimed: cardStatus.todayClaimed, loading: cardClaiming }"
            :disabled="cardStatus.todayClaimed || cardClaiming"
            @click="claimCard"
          >
            <template v-if="cardStatus.todayClaimed">✅ 今日已领取</template>
            <template v-else-if="cardClaiming">领取中...</template>
            <template v-else>领取今日 {{ cardStatus.totalDailyCoins }} 平台币</template>
          </button>
        </div>

        <!-- 本月领取日历 -->
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

      <!-- 无月卡：购买入口 -->
      <template v-else>
        <p class="no-card-hint">购买月卡，每天自动解锁专属平台币</p>
        <div class="card-shop">
          <div class="shop-card monthly">
            <div class="shop-icon">🌙</div>
            <div class="shop-name">月卡</div>
            <div class="shop-price">¥ 328</div>
            <div class="shop-perday">每天 300 平台币</div>
            <div class="shop-duration">有效期 30 天</div>
            <button class="shop-btn" @click="purchaseCard('monthly')">立即购买</button>
          </div>
          <div class="shop-card lifetime">
            <div class="shop-top-tag">推荐</div>
            <div class="shop-icon">✨</div>
            <div class="shop-name">终身卡</div>
            <div class="shop-price">¥ 980</div>
            <div class="shop-perday">每天 500 平台币</div>
            <div class="shop-duration">永久有效</div>
            <button class="shop-btn" @click="purchaseCard('lifetime')">立即购买</button>
          </div>
        </div>
      </template>
    </div>

    <!-- ====== 签到区块 ====== -->
    <div class="section-card">
      <div class="section-head">
        <span class="section-icon">📅</span>
        <h3 class="section-title">每日签到</h3>
        <span class="section-badge" :class="{ active: checkInStatus.todayChecked }">
          {{ checkInStatus.todayChecked ? '今日已签' : '未签到' }}
        </span>
      </div>

      <!-- 签到日历 -->
      <div class="checkin-calendar">
        <div
          v-for="day in checkInMonthDays"
          :key="day.date"
          class="ci-day"
          :class="{
            checked: checkInStatus.checkedDates.includes(day.date),
            today: day.date === checkInStatus.today,
            future: day.isFuture
          }"
        >
          <span class="ci-day-num">{{ day.num }}</span>
          <span class="ci-check-mark" v-if="checkInStatus.checkedDates.includes(day.date)">✓</span>
        </div>
      </div>

      <!-- 里程碑进度 -->
      <div class="milestones">
        <div class="ms-title">累计签到奖励</div>
        <div class="ms-list">
          <div
            v-for="ms in checkInStatus.milestones"
            :key="ms.days"
            class="ms-item"
            :class="{
              achieved: checkInStatus.cumulativeDays >= ms.days,
              next: isNextMilestone(ms)
            }"
          >
            <div class="ms-days">{{ ms.days }}天</div>
            <div class="ms-check">{{ checkInStatus.cumulativeDays >= ms.days ? '✓' : '+' }}{{ ms.bonus }}</div>
          </div>
        </div>
      </div>

      <!-- 签到按钮 -->
      <div class="checkin-action">
        <div class="checkin-info">
          <span>本月已签 <strong>{{ checkInStatus.cumulativeDays }}</strong> 天</span>
          <span v-if="checkInStatus.nextMilestone" class="next-hint">
            再签 {{ checkInStatus.nextMilestone.days - checkInStatus.cumulativeDays }} 天得额外 {{ checkInStatus.nextMilestone.bonus }}
          </span>
        </div>
        <button
          class="checkin-btn"
          :class="{ checked: checkInStatus.todayChecked, loading: checkInLoading }"
          :disabled="checkInStatus.todayChecked || checkInLoading"
          @click="doCheckIn"
        >
          <template v-if="checkInStatus.todayChecked">✅ 今日已签到</template>
          <template v-else-if="checkInLoading">签到中...</template>
          <template v-else>📅 签到 +{{ checkInStatus.baseCoins }} 平台币</template>
        </button>
      </div>
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

const checkInStatus = ref({
  today: '',
  checkedDates: [],
  todayChecked: false,
  cumulativeDays: 0,
  nextMilestone: null,
  achievedMilestones: [],
  milestones: [],
  baseCoins: 200,
});

const cardClaiming = ref(false);
const checkInLoading = ref(false);

const rewardPopup = ref({
  show: false,
  title: '',
  coins: 0,
  newBalance: 0,
});

// ─── 格式化 ───
const formatBalance = (v) => Math.floor(Number(v || 0)).toString();

const getDaysLeft = (expireDate) => {
  const today = new Date();
  const exp = new Date(expireDate);
  return Math.ceil((exp - today) / 86400000);
};

const isNextMilestone = (ms) => {
  return checkInStatus.value.nextMilestone?.days === ms.days;
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

const checkInMonthDays = computed(() => {
  if (!checkInStatus.value.today) return [];
  const today = checkInStatus.value.today;
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

const loadCheckInStatus = async () => {
  try {
    const res = await $fetch('/api/client/benefits/checkin/status', {
      query: { user_id: authStore.userInfo?.id },
    });
    if (res.code === 200) checkInStatus.value = res.data;
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

const doCheckIn = async () => {
  if (checkInLoading.value || checkInStatus.value.todayChecked) return;
  checkInLoading.value = true;
  try {
    const res = await $fetch('/api/client/benefits/checkin', {
      method: 'POST',
      body: { user_id: authStore.userInfo?.id },
    });
    if (res.code === 200) {
      const { base_coins, bonus_coins, total_coins, cumulative_days, new_balance } = res.data;
      // 乐观更新：立即标记今日已签，防止重复点击
      const today = checkInStatus.value.today;
      checkInStatus.value = {
        ...checkInStatus.value,
        todayChecked: true,
        cumulativeDays: cumulative_days,
        checkedDates: [...checkInStatus.value.checkedDates, today],
      };
      // 立即更新为颟
      authStore.platformCoins = new_balance;
      if (authStore.userInfo) {
        authStore.userInfo = { ...authStore.userInfo, platform_coins: new_balance };
      }
      const title = bonus_coins > 0
        ? `签到成功！累计 ${cumulative_days} 天，获得里程碑奖励！`
        : `签到成功！累计 ${cumulative_days} 天`;
      rewardPopup.value = {
        show: true,
        title,
        coins: total_coins,
        newBalance: new_balance,
      };
      // 异步刷新签到状态（不阅塞 UI）
      loadCheckInStatus();
    } else {
      tips.warning(res.message || '签到失败');
    }
  } catch {
    tips.error('网络错误，请稍后重试');
  } finally {
    checkInLoading.value = false;
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
  await Promise.all([loadCardStatus(), loadCheckInStatus()]);
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
.section-badge {
  font-size: 11px; padding: 3px 10px;
  border-radius: var(--radius-xl);
  background: var(--outline-variant);
  color: var(--on-surface-variant);
  font-weight: 600;
}
.section-badge.active {
  background: rgba(127,230,219,0.2);
  color: var(--secondary);
}

/* ── 月卡卡片 ── */
.card-list {
  display: flex; gap: 12px; flex-wrap: wrap;
  margin-bottom: 18px;
}
.mc-card {
  flex: 1; min-width: 140px;
  border-radius: var(--radius-md);
  padding: 16px;
  position: relative;
}
.mc-card.monthly {
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  color: #fff;
}
.mc-card.lifetime {
  background: linear-gradient(135deg, #d97706, #92400e);
  color: #fff;
}
.mc-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.mc-card-badge {
  background: rgba(255,255,255,0.25);
  border-radius: var(--radius-xl);
  padding: 3px 10px; font-size: 12px; font-weight: 700;
}
.coin-num { font-size: 26px; font-weight: 900; display: block; text-align: right; }
.coin-unit { font-size: 11px; color: rgba(255,255,255,0.7); display: block; text-align: right; }
.mc-card-bottom .mc-expire { font-size: 12px; color: rgba(255,255,255,0.8); }
.mc-card-bottom .mc-expire.lifetime { color: rgba(255,255,255,0.9); font-weight: 600; }
.expire-warn { color: #fbbf24; font-weight: 600; }

/* ── 领取区 ── */
.claim-area {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--surface-container-low);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  margin-bottom: 18px;
  gap: 12px;
}
.claim-total { font-size: 15px; color: var(--on-surface); }
.claim-total strong { color: #7c3aed; font-size: 20px; font-weight: 900; }
.claim-stacked { font-size: 12px; color: var(--on-surface-variant); margin-top: 2px; }
.claim-btn {
  padding: 12px 22px;
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  border: none; border-radius: var(--radius-md);
  color: #fff; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
  font-family: var(--font-family);
}
.claim-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(124,58,237,0.4); }
.claim-btn.claimed, .claim-btn:disabled {
  background: var(--surface-container-low);
  color: var(--on-surface-variant);
  cursor: default;
}
.claim-btn.loading { opacity: 0.7; }

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

/* ── 无月卡 ── */
.no-card-hint {
  font-size: 13px; color: var(--on-surface-variant);
  margin: 0 0 16px; text-align: center;
}
.card-shop { display: flex; gap: 14px; }
.shop-card {
  flex: 1; border-radius: var(--radius-md); padding: 20px 16px;
  position: relative; text-align: center;
  background: var(--surface-container-low);
  border: 2px solid var(--outline-variant);
  transition: all 0.2s;
}
.shop-card:hover { transform: translateY(-2px); }
.shop-card.lifetime {
  border-color: #d97706;
  background: linear-gradient(135deg, rgba(217,119,6,0.05), rgba(146,64,14,0.05));
}
.shop-card.monthly {
  border-color: #7c3aed;
  background: linear-gradient(135deg, rgba(124,58,237,0.05), rgba(91,33,182,0.05));
}
.shop-top-tag {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: #d97706; color: #fff;
  padding: 2px 12px; border-radius: var(--radius-xl);
  font-size: 11px; font-weight: 700;
}
.shop-icon { font-size: 28px; margin-bottom: 8px; }
.shop-name { font-size: 16px; font-weight: 800; color: var(--on-surface); margin-bottom: 6px; }
.shop-price { font-size: 24px; font-weight: 900; color: var(--primary); margin-bottom: 6px; }
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

/* ── 签到日历 ── */
.checkin-calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
  margin-bottom: 20px;
}
.ci-day {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 12px;
  background: var(--surface-container-low);
  color: var(--on-surface-variant);
  font-weight: 500;
  position: relative;
  gap: 1px;
}
.ci-day-num {
  font-size: 12px;
  line-height: 1;
}
.ci-check-mark {
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
  color: #10b981;
}
.ci-day.checked {
  background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.12));
  color: #064e3b;
}
.ci-day.checked .ci-day-num { color: #065f46; font-weight: 700; }
.ci-day.today {
  border: 2px solid #10b981;
  color: var(--on-surface); font-weight: 700;
}
.ci-day.future { opacity: 0.3; }

/* ── 里程碑 ── */
.milestones { margin-bottom: 20px; }
.ms-title { font-size: 12px; color: var(--on-surface-variant); margin-bottom: 10px; font-weight: 600; }
.ms-list { display: flex; gap: 6px; flex-wrap: wrap; }
.ms-item {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-container-low);
  border: 1.5px solid var(--outline-variant);
  min-width: 52px;
  transition: all 0.2s;
}
.ms-item.achieved {
  background: rgba(16,185,129,0.12);
  border-color: #10b981;
}
.ms-item.next {
  background: rgba(251,191,36,0.1);
  border-color: #fbbf24;
  box-shadow: 0 0 0 2px rgba(251,191,36,0.2);
}
.ms-days { font-size: 11px; color: var(--on-surface-variant); margin-bottom: 3px; }
.ms-check { font-size: 12px; font-weight: 700; color: var(--on-surface); }
.ms-item.achieved .ms-check { color: #10b981; }
.ms-item.next .ms-check { color: #f59e0b; }

/* ── 签到操作 ── */
.checkin-action {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--surface-container-low);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  gap: 12px;
}
.checkin-info { font-size: 14px; color: var(--on-surface); }
.checkin-info strong { color: #10b981; font-size: 18px; }
.next-hint { display: block; font-size: 12px; color: #f59e0b; margin-top: 3px; }
.checkin-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #10b981, #059669);
  border: none; border-radius: var(--radius-md);
  color: #fff; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
  font-family: var(--font-family);
}
.checkin-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(16,185,129,0.4); }
.checkin-btn.checked, .checkin-btn:disabled {
  background: var(--surface-container-low);
  color: var(--on-surface-variant);
  cursor: default;
}

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

@media (max-width: 480px) {
  .claim-area { flex-direction: column; align-items: stretch; text-align: center; }
  .claim-btn { width: 100%; }
  .checkin-action { flex-direction: column; align-items: stretch; text-align: center; }
  .checkin-btn { width: 100%; }
  .card-shop { flex-direction: column; }
}
</style>
