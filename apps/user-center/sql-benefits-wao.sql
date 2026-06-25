-- ============================================================
-- WAO 平台数据库补丁脚本
-- 执行时间：请在部署后尽快执行
-- ============================================================

-- 1. Users 表新增 remark 字段（管理员备注，玩家详情页使用）
--    注意：若字段已存在会报错，可先检查：SHOW COLUMNS FROM users LIKE 'remark';
ALTER TABLE users ADD COLUMN remark VARCHAR(500) NULL DEFAULT NULL COMMENT '管理员备注' AFTER channel_code;

-- ============================================================
-- 权益中心：月卡 + 签到（如果还没建表，一并执行）
-- ============================================================

-- 2. 月卡/终身卡订阅记录
CREATE TABLE IF NOT EXISTS MonthlyCards (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL COMMENT '用户ID',
    card_type       ENUM('monthly','lifetime') NOT NULL COMMENT 'monthly=月卡 lifetime=终身卡',
    daily_coins     INT NOT NULL COMMENT '每日发放平台币数量',
    start_date      DATE NOT NULL COMMENT '生效日期（购买当天）',
    expire_date     DATE NULL COMMENT '到期日期，NULL=永久（终身卡）',
    is_active       TINYINT NOT NULL DEFAULT 1 COMMENT '是否有效',
    purchase_amount DECIMAL(10,2) NULL COMMENT '购买金额（元）',
    transaction_id  VARCHAR(100) NULL COMMENT '关联PaymentRecords.transaction_id',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='月卡订阅记录';

-- 3. 月卡每日领取记录
CREATE TABLE IF NOT EXISTS MonthlyCardClaims (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    card_id         INT NOT NULL COMMENT '关联MonthlyCards.id',
    user_id         INT NOT NULL COMMENT '用户ID',
    claim_date      DATE NOT NULL COMMENT '领取日期（北京时间）',
    coins_amount    INT NOT NULL COMMENT '本次该卡领取金额',
    transaction_id  VARCHAR(100) NULL COMMENT '关联PaymentRecords.transaction_id',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_card_date (card_id, claim_date) COMMENT '防重：每张卡每天只能领一次',
    INDEX idx_user (user_id),
    INDEX idx_date (claim_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='月卡每日领取记录';

-- 4. 签到记录（WAO平台：基础奖励100/天，里程碑减半）
CREATE TABLE IF NOT EXISTS CheckInRecords (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL COMMENT '用户ID',
    check_date      DATE NOT NULL COMMENT '签到日期（北京时间）',
    base_coins      INT NOT NULL DEFAULT 100 COMMENT '基础签到奖励（WAO:100）',
    bonus_coins     INT NOT NULL DEFAULT 0 COMMENT '里程碑额外奖励',
    total_coins     INT NOT NULL COMMENT '本次合计奖励',
    cumulative_days INT NOT NULL COMMENT '本月累计签到天数',
    transaction_id  VARCHAR(100) NULL COMMENT '关联PaymentRecords.transaction_id',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_date (user_id, check_date) COMMENT '防重：每人每天只能签一次',
    INDEX idx_user (user_id),
    INDEX idx_date (check_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日签到记录';
