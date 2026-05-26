-- ============================================================
-- 清服脚本 (quantum_db)
-- 生成时间: 2026-05-23
-- 说明:
--   ✅ 保留（不清除）:
--      users              - 主账号（用户无需重新注册）
--      subusers           - 子账号
--      agentrelationships - 代理关系层级
--      admins             - 代理/管理员账号
--      games / paymentsettings / systemparams
--      externalgiftpackages / cdktypes / GameServers
--      PaymentRoutingRules
--      paymentrecords（wx/zfb 等真实现金订单）
--
--   🗑️ 清除:
--      gamecharacters               - 所有游戏角色
--      platform_coins → 0           - 用户/代理平台币清零
--      paymentrecords（ptb/kf 订单）- 平台币充值订单
--      giftpackagepurchaserecords   - 礼包购买记录
--      admintoplayerplatformcointransactions
--      adminplatformcointransactions
--      logs / userloginlogs / gm_operation_logs
--      dailystats / ltvstats
--      cdkcodes（重置使用状态）/ cdkredemptions
--      settlements
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 删除所有游戏角色
--    users/subusers 保留，角色单独清
-- ============================================================
TRUNCATE TABLE `gamecharacters`;
ALTER TABLE `gamecharacters` AUTO_INCREMENT = 1;

-- ============================================================
-- 2. 所有用户平台币清零
--    users 表保留，仅更新 platform_coins 字段
-- ============================================================
UPDATE `users`
SET `platform_coins` = 0.00;

-- ============================================================
-- 3. paymentrecords 只保留现金成功订单
--    保留条件: payment_way IN ('微信','支付宝','Steam') AND payment_status = 3
--    删除以下所有记录:
--      ① 平台币类: 平台币 / 每日赠送 / kf / platform_coin
--      ② 现金但未成功（失败/处理中）: 微信/支付宝/Steam 中 status != 3
--      ③ 其他任何不在白名单内的 payment_way
-- ============================================================
DELETE FROM `paymentrecords`
WHERE `payment_way` NOT IN ('微信', '支付宝', 'Steam')
   OR `payment_status` != 3;

-- ============================================================
-- 4. 清空礼包购买记录（礼包用平台币购买，全部清除）
-- ============================================================
TRUNCATE TABLE `giftpackagepurchaserecords`;
ALTER TABLE `giftpackagepurchaserecords` AUTO_INCREMENT = 1;

-- ============================================================
-- 5. 清空代理给玩家的平台币流水
-- ============================================================
TRUNCATE TABLE `admintoplayerplatformcointransactions`;
ALTER TABLE `admintoplayerplatformcointransactions` AUTO_INCREMENT = 1;

-- ============================================================
-- 6. 清空代理间平台币转账流水
-- ============================================================
TRUNCATE TABLE `adminplatformcointransactions`;
ALTER TABLE `adminplatformcointransactions` AUTO_INCREMENT = 1;

-- ============================================================
-- 7. 重置代理/管理员的平台币余额（admins 表）
--    账号本身保留，仅清零平台币
-- ============================================================
UPDATE `admins`
SET `platform_coins` = 0.00,
    `available_platform_coins` = 0.00;

-- ============================================================
-- 8. 系统日志全部清空
-- ============================================================
TRUNCATE TABLE `logs`;
ALTER TABLE `logs` AUTO_INCREMENT = 1;

-- ============================================================
-- 9. 清空用户登录日志
-- ============================================================
TRUNCATE TABLE `userloginlogs`;
ALTER TABLE `userloginlogs` AUTO_INCREMENT = 1;

-- ============================================================
-- 10. 清空 GM 操作日志
-- ============================================================
TRUNCATE TABLE `gm_operation_logs`;
ALTER TABLE `gm_operation_logs` AUTO_INCREMENT = 1;

-- ============================================================
-- 11. 清空每日统计数据 & LTV 统计
-- ============================================================
TRUNCATE TABLE `dailystats`;
ALTER TABLE `dailystats` AUTO_INCREMENT = 1;

TRUNCATE TABLE `ltvstats`;
ALTER TABLE `ltvstats` AUTO_INCREMENT = 1;

-- ============================================================
-- 12. 重置 CDK 兑换状态（cdkcodes 标记为未使用）
--     cdkredemptions（兑换记录）全部清空
-- ============================================================
UPDATE `cdkcodes`
SET `is_used` = 0,
    `used_by_player_id` = NULL,
    `used_at` = NULL;

TRUNCATE TABLE `cdkredemptions`;
ALTER TABLE `cdkredemptions` AUTO_INCREMENT = 1;

-- ============================================================
-- 13. 清空结算记录
-- ============================================================
TRUNCATE TABLE `settlements`;
ALTER TABLE `settlements` AUTO_INCREMENT = 1;

-- ============================================================
-- 14. 重置支付路由每日已用额度
-- ============================================================
UPDATE `PaymentRoutingRules`
SET `used_quota` = 0,
    `quota_reset_date` = NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 完成！保留的表:
--   users              - 主账号（平台币已清零）
--   subusers           - 子账号
--   agentrelationships - 代理层级关系
--   admins             - 管理员/代理账号（平台币已清零）
--   games              - 游戏列表
--   paymentsettings    - 支付方式配置
--   systemparams       - 系统参数
--   externalgiftpackages - 礼包配置
--   cdktypes           - CDK 类型配置
--   GameServers        - 游戏服务器配置
--   PaymentRoutingRules - 支付路由规则
--   paymentrecords     - 仅保留 wx/zfb 等现金订单
-- ============================================================
