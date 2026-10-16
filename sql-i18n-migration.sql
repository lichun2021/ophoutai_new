-- ============================================================
-- 多语言支持（中文 / English）数据库增量迁移脚本
-- 适用库：业务主库 (op-admin / user-center 共用数据库)
-- ============================================================

-- 1. 外部商城礼包表 (externalgiftpackages) 新增英文名称与英文描述
ALTER TABLE `externalgiftpackages`
  ADD COLUMN `package_name_en` VARCHAR(200) DEFAULT '' COMMENT '礼包英文名称' AFTER `package_name`,
  ADD COLUMN `description_en` TEXT COMMENT '礼包英文描述' AFTER `description`;

-- 2. CDK 类型表 (cdktypes) 新增英文邮件标题与英文邮件内容
ALTER TABLE `cdktypes`
  ADD COLUMN `title_en` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT '' COMMENT '英文标题(游戏内邮件标题)' AFTER `title`,
  ADD COLUMN `content_en` TEXT COLLATE utf8mb4_general_ci COMMENT '英文内容(游戏内邮件内容)' AFTER `content`;

-- 3. 系统参数表 (systemparams) 新增英文支付说明参数
INSERT INTO `systemparams` (`key`, `content`)
VALUES (
  'payment_message_en',
  '*Platform Coin Info: 1 CNY = 1 Platform Coin (never expires). You can top up via the app or official website.\nDear Player: After recharging in-game, you can claim bonus benefits in the Welfare Center!'
)
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;
