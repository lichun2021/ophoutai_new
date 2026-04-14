-- MySQL dump 10.13  Distrib 8.0.24, for Linux (x86_64)
--
-- Host: localhost    Database: quantum_db
-- ------------------------------------------------------
-- Server version	8.0.24

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `adminplatformcointransactions`
--

DROP TABLE IF EXISTS `adminplatformcointransactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `adminplatformcointransactions` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '流水记录ID,主键,自增',
  `from_channel_code` varchar(100) NOT NULL COMMENT '发送方渠道代码',
  `to_channel_code` varchar(100) NOT NULL COMMENT '接收方渠道代码',
  `from_admin_name` varchar(100) NOT NULL COMMENT '发送方代理名称',
  `to_admin_name` varchar(100) NOT NULL COMMENT '接收方代理名称',
  `amount` decimal(15,2) NOT NULL COMMENT '转账金额,精确到2位小数',
  `from_balance_before` decimal(15,2) NOT NULL COMMENT '发送方转账前余额',
  `from_balance_after` decimal(15,2) NOT NULL COMMENT '发送方转账后余额',
  `to_balance_before` decimal(15,2) NOT NULL COMMENT '接收方转账前余额',
  `to_balance_after` decimal(15,2) NOT NULL COMMENT '接收方转账后余额',
  `remark` varchar(500) DEFAULT '' COMMENT '备注信息',
  `operator_channel_code` varchar(100) DEFAULT '' COMMENT '操作员渠道代码',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  PRIMARY KEY (`id`),
  KEY `idx_admin_coin_from` (`from_channel_code`),
  KEY `idx_admin_coin_to` (`to_channel_code`),
  KEY `idx_admin_coin_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='代理间平台币流水表,记录代理之间的平台币转账';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `adminplatformcointransactions`
--

LOCK TABLES `adminplatformcointransactions` WRITE;
/*!40000 ALTER TABLE `adminplatformcointransactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `adminplatformcointransactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '管理员ID,主键,自增',
  `level` int DEFAULT '0' COMMENT '代理级别：0=超级管理员,1=1级代理(可结算),2=2级代理(可结算),3=3级代理(不可结算),4=4级代理(不可结算)',
  `name` varchar(100) NOT NULL COMMENT '管理员名称,必填',
  `password` varchar(100) NOT NULL COMMENT '密码(加密存储),必填',
  `channel_code` varchar(100) DEFAULT '' COMMENT '渠道代码,标识管理员来源,默认空字符串',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间,默认当前时间',
  `settlement_type` int DEFAULT '0' COMMENT '结算方式：0=无,1=支付宝,2=微信,3=银联',
  `settlement_amount` decimal(10,2) DEFAULT '0.00' COMMENT '总结算金额,默认0',
  `settlement_amount_available` decimal(10,2) DEFAULT '0.00' COMMENT '可结算金额,默认0',
  `divide_rate` int DEFAULT '0' COMMENT '分成比例(百分比),默认0',
  `platform_coins` decimal(15,2) DEFAULT '0.00' COMMENT '平台币总额,精确到2位小数,默认0.00',
  `available_platform_coins` decimal(15,2) DEFAULT '0.00' COMMENT '可用平台币余额,精确到2位小数,默认0.00',
  `u_address` varchar(255) DEFAULT '' COMMENT 'U地址(USDT钱包地址),默认空字符串',
  `tg_account` varchar(100) DEFAULT '' COMMENT 'Telegram账号,默认空字符串',
  `qq_account` varchar(100) DEFAULT '' COMMENT 'QQ账号,默认空字符串',
  `email` varchar(100) DEFAULT '' COMMENT '邮箱地址,默认空字符串',
  `phone` varchar(100) DEFAULT '' COMMENT '电话号码,默认空字符串',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：1=启用,0=禁用,默认1',
  `google_2fa_secret` VARCHAR(32) DEFAULT NULL COMMENT 'Google 2FA 密钥';"
  `allowed_channel_codes` json DEFAULT NULL COMMENT '允许访问的渠道代码列表(JSON格式)，空数组表示超级管理员可访问所有数据',
  `allowed_game_ids` json DEFAULT NULL COMMENT '允许访问的游戏ID列表(JSON格式)，空数组表示超级管理员可访问所有游戏',
  PRIMARY KEY (`id`),
  KEY `idx_admin_level` (`level`),
  KEY `idx_admin_channel_code` (`channel_code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='管理员表,存储管理员和代理信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admins`
--

LOCK TABLES `admins` WRITE;
/*!40000 ALTER TABLE `admins` DISABLE KEYS */;
INSERT INTO `admins` VALUES (1,0,'admin','super123','admin','2025-08-26 03:43:30','2025-10-09 03:43:20',0,99999999.00,99999999.00,0,0.00,99580000.00,'','tg_super','qq123456','super@admin.com','13800000001',1,'[]','[]');
/*!40000 ALTER TABLE `admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `admintoplayerplatformcointransactions`
--

DROP TABLE IF EXISTS `admintoplayerplatformcointransactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admintoplayerplatformcointransactions` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '流水记录ID,主键,自增',
  `admin_channel_code` varchar(100) NOT NULL COMMENT '代理渠道代码',
  `admin_name` varchar(100) NOT NULL COMMENT '代理名称',
  `user_thirdparty_uid` varchar(100) NOT NULL COMMENT '玩家第三方ID',
  `user_channel_code` varchar(100) DEFAULT '' COMMENT '玩家渠道代码',
  `game_code` varchar(50) DEFAULT '' COMMENT '游戏代码',
  `amount` decimal(15,2) NOT NULL COMMENT '发放金额,精确到2位小数',
  `admin_balance_before` decimal(15,2) NOT NULL COMMENT '代理发放前余额',
  `admin_balance_after` decimal(15,2) NOT NULL COMMENT '代理发放后余额',
  `player_balance_before` decimal(15,2) NOT NULL COMMENT '玩家接收前余额',
  `player_balance_after` decimal(15,2) NOT NULL COMMENT '玩家接收后余额',
  `remark` varchar(500) DEFAULT '' COMMENT '备注信息',
  `operator_channel_code` varchar(100) DEFAULT '' COMMENT '操作员渠道代码',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  PRIMARY KEY (`id`),
  KEY `idx_admin_player_coin_admin` (`admin_channel_code`),
  KEY `idx_admin_player_coin_thirdparty` (`user_thirdparty_uid`),
  KEY `idx_admin_player_coin_time` (`created_at`),
  KEY `idx_admin_player_coin_channel` (`user_channel_code`),
  KEY `idx_admin_player_coin_game` (`game_code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='代理给玩家平台币流水表,记录代理向玩家发放平台币的记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admintoplayerplatformcointransactions`
--

LOCK TABLES `admintoplayerplatformcointransactions` WRITE;
/*!40000 ALTER TABLE `admintoplayerplatformcointransactions` DISABLE KEYS */;
INSERT INTO `admintoplayerplatformcointransactions` VALUES (1,'admin','admin','user_1756875280981','admin','hzwqh',100000.00,99999999.00,99899999.00,0.00,100000.00,'tt','admin','2025-09-10 11:17:43'),(2,'admin','admin','user_1756887090866','admin','hzwqh',100000.00,99899999.00,99799999.00,0.00,100000.00,'tt','admin','2025-09-10 11:17:59'),(3,'admin','admin','user_1756811480869','admin','hzwqh',100000.00,99799999.00,99699999.00,0.00,100000.00,'tt','admin','2025-09-10 11:33:49'),(4,'admin','admin','user_1758522155540','admin','hzwqh',20000.00,99699999.00,99679999.00,0.00,20000.00,'','admin','2025-09-24 09:44:08'),(5,'admin','admin','user_1759811794428','admin','hzwqh',99999.00,99679999.00,99580000.00,0.00,99999.00,'测试','admin','2025-10-08 06:55:01');
/*!40000 ALTER TABLE `admintoplayerplatformcointransactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agentrelationships`
--

DROP TABLE IF EXISTS `agentrelationships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agentrelationships` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '代理关系ID,主键,自增',
  `parent_channel_code` varchar(100) NOT NULL COMMENT '上级代理渠道代码',
  `child_channel_code` varchar(100) NOT NULL COMMENT '下级代理渠道代码',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  PRIMARY KEY (`id`),
  KEY `idx_parent_channel` (`parent_channel_code`),
  KEY `idx_child_channel` (`child_channel_code`),
  KEY `idx_channel_relation` (`parent_channel_code`,`child_channel_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='代理关系表,存储代理层级关系';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agentrelationships`
--

LOCK TABLES `agentrelationships` WRITE;
/*!40000 ALTER TABLE `agentrelationships` DISABLE KEYS */;
/*!40000 ALTER TABLE `agentrelationships` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cdkcodes`
--

DROP TABLE IF EXISTS `cdkcodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cdkcodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `cdk_type_id` int NOT NULL,
  `is_used` tinyint(1) NOT NULL DEFAULT '0',
  `used_by_player_id` varchar(128) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_cdk_type_id` (`cdk_type_id`),
  CONSTRAINT `fk_cdkcodes_type` FOREIGN KEY (`cdk_type_id`) REFERENCES `cdktypes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cdkcodes`
--

LOCK TABLES `cdkcodes` WRITE;
/*!40000 ALTER TABLE `cdkcodes` DISABLE KEYS */;
INSERT INTO `cdkcodes` VALUES (1,'89RYWF9K5D',2,0,NULL,NULL,'2025-09-30 09:48:41'),(2,'96Z3MS8HCW',2,0,NULL,NULL,'2025-09-30 09:48:41'),(3,'MYMY2XVMGA',2,0,NULL,NULL,'2025-09-30 09:48:41'),(4,'UGPS6TRJUH',2,0,NULL,NULL,'2025-09-30 09:48:41'),(5,'Q2S27MWDWJ',2,0,NULL,NULL,'2025-09-30 09:48:41'),(6,'27BMQCM9M9',2,0,NULL,NULL,'2025-09-30 09:48:41'),(7,'UV293B7BHJ',2,0,NULL,NULL,'2025-09-30 09:48:41'),(8,'3MK64VCC4X',2,1,'7pt-43yskz-1','2025-09-30 15:32:11','2025-09-30 09:48:41'),(9,'8RSAPT6WKA',2,1,'7pt-4410un-1','2025-09-30 10:51:54','2025-09-30 09:48:41'),(10,'DC7UPMGWSK',2,0,NULL,NULL,'2025-09-30 09:48:41');
/*!40000 ALTER TABLE `cdkcodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cdkredemptions`
--

DROP TABLE IF EXISTS `cdkredemptions`;
CREATE TABLE `cdkredemptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT '玩家ID（角色ID/玩家ID或openid）',
  `server` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '区服标识，如 game_1',
  `code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '兑换码或日期码(YYYYMMDD)',
  `cdk_type_id` int NOT NULL COMMENT 'CDKTypes.id',
  `open_id` varchar(128) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'OpenID（可选）',
  `platform` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '平台: 1=Android,2=iOS 或字符串',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_player_type_code` (`player_id`,`cdk_type_id`,`code`),
  KEY `idx_code` (`code`),
  KEY `idx_type` (`cdk_type_id`),
  CONSTRAINT `fk_redemptions_type` FOREIGN KEY (`cdk_type_id`) REFERENCES `cdktypes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `cdktypes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cdktypes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `content` text COLLATE utf8mb4_general_ci NOT NULL,
  `type` enum('universal','unique','data') COLLATE utf8mb4_general_ci NOT NULL,
  `items` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cdktypes`
--

LOCK TABLES `cdktypes` WRITE;
/*!40000 ALTER TABLE `cdktypes` DISABLE KEYS */;
INSERT INTO `cdktypes` VALUES (1,'测试CDK','112233','universal','[]','2025-09-30 09:27:04','2025-09-30 09:27:04'),(2,'测试 123','4123123','unique','[{\"ItemId\": 1002, \"ItemNum\": 1000}]','2025-09-30 09:48:15','2025-09-30 09:48:15');
/*!40000 ALTER TABLE `cdktypes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dailystats`
--

DROP TABLE IF EXISTS `dailystats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dailystats` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '统计记录ID',
  `stat_date` date NOT NULL COMMENT '统计日期',
  `channel_code` varchar(100) DEFAULT '' COMMENT '渠道代码',
  `game_code` varchar(50) DEFAULT '' COMMENT '游戏代码',
  `active_users` int DEFAULT '0' COMMENT '活跃用户数（基于登录记录）',
  `new_users` int DEFAULT '0' COMMENT '新增用户数',
  `register_users` int DEFAULT '0' COMMENT '注册数',
  `valid_register_users` int DEFAULT '0' COMMENT '有效注册数（产生角色的用户）',
  `character_count` int DEFAULT '0' COMMENT '角色数',
  `yesterday_retention` decimal(5,2) DEFAULT '0.00' COMMENT '昨日留存率（%）',
  `pay_users` int DEFAULT '0' COMMENT '付费用户数',
  `new_pay_users` int DEFAULT '0' COMMENT '新增付费用户数（首次付费）',
  `recharge_users` int DEFAULT '0' COMMENT '充值人数（不含平台币）',
  `recharge_times` int DEFAULT '0' COMMENT '充值次数',
  `high_value_users` int DEFAULT '0' COMMENT '充值超100用户数',
  `high_value_users_200` int DEFAULT '0' COMMENT '充值超200用户数',
  `consume_amount` decimal(15,2) DEFAULT '0.00' COMMENT '消费流水（包含平台币）',
  `real_recharge_amount` decimal(15,2) DEFAULT '0.00' COMMENT '真实流水（不包含平台币）',
  `high_value_recharge_amount` decimal(15,2) DEFAULT '0.00' COMMENT '优质用户充值总额（超过200）',
  `pay_amount` decimal(15,2) DEFAULT '0.00' COMMENT '付费金额',
  `new_pay_amount` decimal(15,2) DEFAULT '0.00' COMMENT '新增付费金额',
  `new_user_recharge` decimal(15,2) DEFAULT '0.00' COMMENT '新增用户充值金额',
  `pay_rate` decimal(5,2) DEFAULT '0.00' COMMENT '付费率（%）',
  `new_pay_rate` decimal(5,2) DEFAULT '0.00' COMMENT '新增付费率（%）',
  `active_arpu` decimal(10,2) DEFAULT '0.00' COMMENT '活跃ARPU',
  `pay_arpu` decimal(10,2) DEFAULT '0.00' COMMENT '付费ARPU',
  `new_arpu` decimal(10,2) DEFAULT '0.00' COMMENT '新增ARPU',
  `new_pay_arpu` decimal(10,2) DEFAULT '0.00' COMMENT '新增付费ARPU',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_date_channel_game` (`stat_date`,`channel_code`,`game_code`),
  KEY `idx_stat_date` (`stat_date`),
  KEY `idx_channel_code` (`channel_code`),
  KEY `idx_game_code` (`game_code`),
  KEY `idx_stat_date_game` (`stat_date`,`game_code`),
  KEY `idx_channel_game` (`channel_code`,`game_code`),
  KEY `idx_stat_date_channel_game` (`stat_date`,`channel_code`,`game_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='每日数据统计表,按游戏和渠道分别统计';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dailystats`
--

LOCK TABLES `dailystats` WRITE;
/*!40000 ALTER TABLE `dailystats` DISABLE KEYS */;
/*!40000 ALTER TABLE `dailystats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `externalgiftpackages`
--

DROP TABLE IF EXISTS `externalgiftpackages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `externalgiftpackages` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '礼包ID,主键,自增',
  `package_code` varchar(100) NOT NULL COMMENT '礼包代码,唯一标识',
  `package_name` varchar(200) NOT NULL COMMENT '礼包名称',
  `description` text COMMENT '礼包描述',
  `price_platform_coins` decimal(15,2) NOT NULL COMMENT '平台币价格',
  `price_real_money` decimal(10,2) DEFAULT '0.00' COMMENT '现金价格(仅展示用)',
  `gift_items` json NOT NULL COMMENT '礼包内容(JSON格式)',
  `category` varchar(50) DEFAULT 'general' COMMENT '礼包分类',
  `icon_url` varchar(500) DEFAULT '' COMMENT '礼包图标URL',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：1=启用,0=禁用',
  `is_limited` tinyint(1) DEFAULT '0' COMMENT '是否限量：1=限量,0=不限量',
  `total_quantity` int DEFAULT '0' COMMENT '总数量(0表示无限)',
  `sold_quantity` int DEFAULT '0' COMMENT '已售数量',
  `max_per_user` int DEFAULT '0' COMMENT '每用户最大购买数量(0表示无限)',
  `start_time` timestamp NULL DEFAULT NULL COMMENT '开始销售时间',
  `end_time` timestamp NULL DEFAULT NULL COMMENT '结束销售时间',
  `available_weekdays` VARCHAR(50) DEFAULT NULL COMMENT '可用星期几(1-7,逗号分隔,1=周一,7=周日,NULL=不限制)',
  `sort_order` int DEFAULT '0' COMMENT '排序权重',
  `game_code` varchar(50) NOT NULL COMMENT '游戏代码,关联Games表',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间,自动更新',
  PRIMARY KEY (`id`),
  UNIQUE KEY `package_code` (`package_code`),
  KEY `idx_gift_package_code` (`package_code`),
  KEY `idx_gift_package_active` (`is_active`),
  KEY `idx_gift_package_category` (`category`),
  KEY `idx_gift_package_price` (`price_platform_coins`),
  KEY `idx_gift_package_time` (`start_time`,`end_time`),
  KEY `idx_gift_package_game` (`game_code`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='外部礼包表,存储可购买的礼包信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `externalgiftpackages`
--

LOCK TABLES `externalgiftpackages` WRITE;
/*!40000 ALTER TABLE `externalgiftpackages` DISABLE KEYS */;
INSERT INTO `externalgiftpackages` VALUES (1,'DAILY_RECHARGE_100','当日氪金100','1000海盗便当 9级晶石包100个 5级诅咒珠宝袋500 +10w钻',100.00,0.00,'[{\"a\": 1000, \"i\": 40009}, {\"a\": 100, \"i\": 42940}, {\"a\": 500, \"i\": 43032}, {\"a\": 100000, \"i\": 90004}]','daily','',1,0,0,0,0,NULL,NULL,1,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(2,'DAILY_RECHARGE_200','当日氪金200','海盗便当3000 9级晶石包300 5级诅咒珠宝1000 望远镜2000 +30w钻',200.00,0.00,'[{\"a\": 3000, \"i\": 40009}, {\"a\": 300, \"i\": 42940}, {\"a\": 1000, \"i\": 43032}, {\"a\": 300000, \"i\": 90004}, {\"a\": 2000, \"i\": 90045}]','daily','',1,0,0,0,0,NULL,NULL,2,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(3,'DAILY_RECHARGE_500','当日氪金500','9级晶石800 5级诅咒珠宝2000 5星材料船SSR5 望远镜9999 +80w钻',500.00,0.00,'[{\"a\": 5, \"i\": 43386}, {\"a\": 800, \"i\": 42940}, {\"a\": 2000, \"i\": 43032}, {\"a\": 800000, \"i\": 90004}, {\"a\": 9999, \"i\": 90045}]','daily','',1,0,0,0,0,NULL,NULL,3,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(4,'DAILY_RECHARGE_1000','当日氪金1000','材料船12 支援卡1000 料理ss+1000 橙色进阶石2000 橙色进阶魂石200 +200w钻',1000.00,0.00,'[{\"a\": 12, \"i\": 43386}, {\"a\": 1000, \"i\": 90063}, {\"a\": 1000, \"i\": 42906}, {\"a\": 2000, \"i\": 55002}, {\"a\": 200, \"i\": 55006}, {\"a\": 2000000, \"i\": 90004}]','daily','',1,0,0,0,0,NULL,NULL,4,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(5,'DAILY_RECHARGE_2000','当日氪金2000','材料船30 支援卡2500 洗练包1000 红色进阶石2000 造船材料箱子500 500w钻',2000.00,0.00,'[{\"a\": 30, \"i\": 43386}, {\"a\": 2500, \"i\": 90063}, {\"a\": 1000, \"i\": 41002}, {\"a\": 2000, \"i\": 55003}, {\"a\": 500, \"i\": 46001}, {\"a\": 5000000, \"i\": 90004}]','daily','',1,0,0,0,0,NULL,NULL,5,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(6,'DAILY_RECHARGE_5000','当日氪金5000','高级招待任选箱1000 支援卡6000 精炼水晶2000 精炼魔药1000 洗练包 2000 1500w钻',5000.00,0.00,'[{\"a\": 1000, \"i\": 43488}, {\"a\": 6000, \"i\": 90063}, {\"a\": 2000, \"i\": 42207}, {\"a\": 1000, \"i\": 42208}, {\"a\": 2000, \"i\": 41002}, {\"a\": 15000000, \"i\": 90004}]','daily','',1,0,0,0,0,NULL,NULL,6,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(7,'TOTAL_RECHARGE_100','累计充值100','料理招待邀请函500 9级晶石100 超级经验药水1000',100.00,0.00,'[{\"a\": 500, \"i\": 43484}, {\"a\": 100, \"i\": 42940}, {\"a\": 1000, \"i\": 40048}]','cumulative','',1,0,0,0,0,NULL,NULL,7,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(8,'TOTAL_RECHARGE_200','累计充值200','超级经验药水3000 大原石500 紫色进阶石1000 紫色进阶魂石500',200.00,0.00,'[{\"a\": 3000, \"i\": 40048}, {\"a\": 500, \"i\": 40017}, {\"a\": 1000, \"i\": 55001}, {\"a\": 500, \"i\": 55005}]','cumulative','',1,0,0,0,0,NULL,NULL,8,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(9,'TOTAL_RECHARGE_500','累计充值500','紫色进阶石2500 紫色进阶魂石1000 普通精炼石1500 普通精炼助剂500',500.00,0.00,'[{\"a\": 2500, \"i\": 55001}, {\"a\": 1000, \"i\": 55005}, {\"a\": 1500, \"i\": 48622}, {\"a\": 500, \"i\": 48625}]','cumulative','',1,0,0,0,0,NULL,NULL,9,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(10,'TOTAL_RECHARGE_1000','累计充值1000','普通百炼秘钥500 稀有百炼秘钥1000 稀有精炼石1500 稀有精炼助剂800 支援卡1000',1000.00,0.00,'[{\"a\": 500, \"i\": 48619}, {\"a\": 1000, \"i\": 48620}, {\"a\": 1500, \"i\": 48623}, {\"a\": 800, \"i\": 48626}, {\"a\": 1000, \"i\": 90063}]','cumulative','',1,0,0,0,0,NULL,NULL,10,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(11,'TOTAL_RECHARGE_2000','累计充值2000','传说百炼秘钥2000 传说精炼石2500 稀有精炼助剂1500 支援卡2000 试炼点之书1000',2000.00,0.00,'[{\"a\": 2000, \"i\": 48621}, {\"a\": 2500, \"i\": 48624}, {\"a\": 1500, \"i\": 48626}, {\"a\": 2000, \"i\": 90063}, {\"a\": 1000, \"i\": 40013}]','cumulative','',1,0,0,0,0,NULL,NULL,11,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(12,'TOTAL_RECHARGE_5000','累计充值5000','核心秘能1000 支援卡5000 试炼点之书2000 精炼水晶5000 精炼魔药1000',5000.00,0.00,'[{\"a\": 1000, \"i\": 220006}, {\"a\": 5000, \"i\": 90063}, {\"a\": 2000, \"i\": 40013}, {\"a\": 5000, \"i\": 42207}, {\"a\": 1000, \"i\": 42208}]','cumulative','',1,0,0,0,0,NULL,NULL,12,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(13,'TOTAL_RECHARGE_10000','累计充值10000','初级潜能符石选择包2000 潜能之石1000 精炼水晶1W 精炼魔药5000 初级元素灵石*1050 秘能粉末*74',10000.00,0.00,'[{\"a\": 2000, \"i\": 47113}, {\"a\": 1000, \"i\": 47021}, {\"a\": 10000, \"i\": 42207}, {\"a\": 5000, \"i\": 42208}, {\"a\": 1050, \"i\": 2200031}, {\"a\": 74, \"i\": 300013}]','cumulative','',1,0,0,0,0,NULL,NULL,13,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(14,'TOTAL_RECHARGE_20000','累计充值20000','时装升级通用纺布 5640 时装升级精良纺布61 时装升级稀有纺布92 时装升级传说纺布 150 中级元素灵石 5600 秘能粉末500',20000.00,0.00,'[{\"a\": 5640, \"i\": 50050}, {\"a\": 61, \"i\": 50051}, {\"a\": 92, \"i\": 50052}, {\"a\": 150, \"i\": 50053}, {\"a\": 5600, \"i\": 2200032}, {\"a\": 500, \"i\": 300013}]','cumulative','',1,0,0,0,0,NULL,NULL,14,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30'),(15,'TOTAL_RECHARGE_30000','累计充值30000','高级元素灵石18320 秘能精髓780 高级勋章魔晶*1000 中级勋章魔晶*2000 初级勋章魔晶*3000',30000.00,0.00,'[{\"a\": 18320, \"i\": 2200033}, {\"a\": 780, \"i\": 300014}, {\"a\": 1000, \"i\": 220005}, {\"a\": 2000, \"i\": 220004}, {\"a\": 3000, \"i\": 220003}]','cumulative','',1,0,0,0,0,NULL,NULL,15,'hzwqh','2025-08-26 03:43:30','2025-08-26 03:43:30');
/*!40000 ALTER TABLE `externalgiftpackages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `gamecharacters`
--

DROP TABLE IF EXISTS `gamecharacters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gamecharacters` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '角色ID,主键,自增',
  `user_id` int NOT NULL COMMENT '主账号ID,关联Users表,必填',
  `subuser_id` int NOT NULL COMMENT '子账号ID,关联SubUsers表,必填',
  `game_id` int NOT NULL COMMENT '游戏ID,关联Games表,角色所属游戏',
  `uuid` varchar(100) NOT NULL COMMENT '角色唯一标识,必填',
  `character_name` varchar(100) NOT NULL COMMENT '角色名称,必填',
  `character_level` int DEFAULT '1' COMMENT '角色等级,默认1',
  `server_name` varchar(100) NOT NULL COMMENT '服务器名称,必填',
  `server_id` int DEFAULT '1' COMMENT '服务器ID,默认1',
  `ext` json DEFAULT NULL COMMENT '扩展字段,存储角色相关信息',
  `last_login_at` timestamp NULL DEFAULT NULL COMMENT '最后登录时间,可为空',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_uuid_server` (`uuid`,`server_id`),
  KEY `fk_gamechar_subuser` (`subuser_id`),
  KEY `idx_game_id` (`game_id`),
  KEY `idx_user_subuser` (`user_id`,`subuser_id`),
  CONSTRAINT `fk_gamechar_game` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_gamechar_subuser` FOREIGN KEY (`subuser_id`) REFERENCES `subusers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gamechar_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='游戏角色表,存储主账号和子账号的角色信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `gamecharacters`
--

LOCK TABLES `gamecharacters` WRITE;
/*!40000 ALTER TABLE `gamecharacters` DISABLE KEYS */;
/*!40000 ALTER TABLE `gamecharacters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `games`
--

DROP TABLE IF EXISTS `games`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `games` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '游戏ID,主键,自增',
  `game_name` varchar(100) NOT NULL COMMENT '游戏名称,唯一,必填',
  `game_code` varchar(50) NOT NULL COMMENT '游戏代码,唯一标识,必填',
  `icon_url` varchar(255) NOT NULL DEFAULT '' COMMENT '游戏图标URL,指向CDN或云存储,必填',
  `supported_devices` enum('H5','iOS','Android','Dual','All') NOT NULL COMMENT '支持设备：H5、iOS、Android、Dual(iOS+Android)、All(全部),必填',
  `register_url` varchar(255) DEFAULT '' COMMENT '注册页面URL,默认空字符串',
  `ios_download_url` varchar(255) DEFAULT '' COMMENT 'iOS下载链接(如App Store),默认空字符串',
  `android_download_url` varchar(255) DEFAULT '' COMMENT 'Android下载链接(如Google Play或APK),默认空字符串',
  `description` text COMMENT '游戏描述',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：1=上架,0=下架,默认1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间,自动更新',
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_code` (`game_code`),
  UNIQUE KEY `unique_game_name` (`game_name`),
  UNIQUE KEY `unique_game_code` (`game_code`),
  KEY `idx_supported_devices` (`supported_devices`),
  KEY `idx_game_code` (`game_code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='游戏表,存储游戏列表信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `games`
--

LOCK TABLES `games` WRITE;
/*!40000 ALTER TABLE `games` DISABLE KEYS */;
INSERT INTO `games` VALUES (1,'红警','hzwqh','https://cdn.example.com/icons/hzwqh.jpg','All','http://49.232.62.9:3000/user/register','https://apps.apple.com/app/hzwqh','https://play.google.com/store/apps/hzwqh','一款开放世界的冒险 RPG 游戏',1,'2025-08-26 03:43:30','2025-09-02 11:07:59');
/*!40000 ALTER TABLE `games` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `giftpackagepurchaserecords`
--

DROP TABLE IF EXISTS `giftpackagepurchaserecords`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `giftpackagepurchaserecords` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '购买记录ID,主键,自增',
  `user_id` int NOT NULL COMMENT '用户ID,关联Users表',
  `thirdparty_uid` varchar(100) NOT NULL COMMENT '第三方用户ID',
  `mch_order_id` varchar(100) NOT NULL COMMENT '商户订单号',
  `package_id` int NOT NULL COMMENT '礼包ID,关联ExternalGiftPackages表',
  `package_code` varchar(100) NOT NULL COMMENT '礼包代码(冗余字段,便于查询)',
  `package_name` varchar(200) NOT NULL COMMENT '礼包名称(冗余字段)',
  `quantity` int DEFAULT '1' COMMENT '购买数量',
  `unit_price` decimal(15,2) NOT NULL COMMENT '单价(平台币)',
  `total_amount` decimal(15,2) NOT NULL COMMENT '总金额(平台币)',
  `balance_before` decimal(15,2) NOT NULL COMMENT '购买前平台币余额',
  `balance_after` decimal(15,2) NOT NULL COMMENT '购买后平台币余额',
  `gift_items` json NOT NULL COMMENT '购买时的礼包内容快照',
  `status` enum('pending','paid','delivered','failed','cancelled') DEFAULT 'pending' COMMENT '状态：pending=待支付,paid=已支付,delivered=已发放,failed=失败,cancelled=已取消',
  `game_delivery_status` enum('waiting','sent','success','failed') DEFAULT 'waiting' COMMENT '游戏内发放状态',
  `game_delivery_data` json DEFAULT NULL COMMENT '游戏发放相关数据',
  `delivery_attempts` int DEFAULT '0' COMMENT '发放尝试次数',
  `remark` varchar(1000) DEFAULT '' COMMENT '备注信息',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间,自动更新',
  `delivered_at` timestamp NULL DEFAULT NULL COMMENT '发放完成时间',
  PRIMARY KEY (`id`),
  KEY `idx_gift_purchase_user` (`user_id`),
  KEY `idx_gift_purchase_thirdparty` (`thirdparty_uid`),
  KEY `idx_gift_purchase_package` (`package_id`),
  KEY `idx_gift_purchase_status` (`status`),
  KEY `idx_gift_purchase_delivery` (`game_delivery_status`),
  KEY `idx_gift_purchase_time` (`created_at`),
  CONSTRAINT `fk_gift_purchase_package` FOREIGN KEY (`package_id`) REFERENCES `externalgiftpackages` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_gift_purchase_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='礼包购买记录表,存储用户礼包购买历史';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `giftpackagepurchaserecords`
--

LOCK TABLES `giftpackagepurchaserecords` WRITE;
/*!40000 ALTER TABLE `giftpackagepurchaserecords` DISABLE KEYS */;
/*!40000 ALTER TABLE `giftpackagepurchaserecords` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `logs`
--

DROP TABLE IF EXISTS `logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `logs` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '日志ID,主键,自增',
  `log_type` varchar(100) NOT NULL COMMENT '日志类型(如user_login、payment),必填',
  `log_content` varchar(800) NOT NULL COMMENT '日志内容,描述具体操作,必填',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='日志表,存储系统操作日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `logs`
--

LOCK TABLES `logs` WRITE;
/*!40000 ALTER TABLE `logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ltvstats`
--

DROP TABLE IF EXISTS `ltvstats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ltvstats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stat_date` date NOT NULL COMMENT '统计日期(注册日期)',
  `channel_code` varchar(50) NOT NULL DEFAULT 'all' COMMENT '渠道代码',
  `game_code` varchar(50) NOT NULL DEFAULT 'all' COMMENT '游戏代码',
  `new_users` int NOT NULL DEFAULT '0' COMMENT '注册用户数',
  `ltv1_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV1充值金额',
  `ltv1_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV1 ARPU',
  `ltv2_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV2充值金额',
  `ltv2_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV2 ARPU',
  `ltv3_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV3充值金额',
  `ltv3_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV3 ARPU',
  `ltv4_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV4充值金额',
  `ltv4_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV4 ARPU',
  `ltv5_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV5充值金额',
  `ltv5_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV5 ARPU',
  `ltv6_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV6充值金额',
  `ltv6_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV6 ARPU',
  `ltv7_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV7充值金额',
  `ltv7_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV7 ARPU',
  `ltv10_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV10充值金额',
  `ltv10_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV10 ARPU',
  `ltv20_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV20充值金额',
  `ltv20_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV20 ARPU',
  `ltv30_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV30充值金额',
  `ltv30_arpu` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'LTV30 ARPU',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_channel_game` (`stat_date`,`channel_code`,`game_code`),
  KEY `idx_stat_date` (`stat_date`),
  KEY `idx_channel_code` (`channel_code`),
  KEY `idx_game_code` (`game_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='LTV统计表(简化版)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ltvstats`
--

LOCK TABLES `ltvstats` WRITE;
/*!40000 ALTER TABLE `ltvstats` DISABLE KEYS */;
/*!40000 ALTER TABLE `ltvstats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paymentrecords`
--

DROP TABLE IF EXISTS `paymentrecords`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paymentrecords` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '支付记录ID，主键，自增',
  `user_id` int NOT NULL COMMENT '主账号ID，关联Users表(id)，必填',
  `sub_user_id` int DEFAULT NULL COMMENT '子账号ID，关联SubUsers表(id)，可为空',
  `role_id` varchar(36) NOT NULL DEFAULT '' COMMENT '角色UUID，标识游戏角色，可为空字符串',
  `transaction_id` varchar(100) NOT NULL COMMENT '交易ID，唯一，系统生成，必填',
  `wuid` varchar(100) NOT NULL COMMENT '外部用户ID（如第三方支付平台用户ID），必填',
  `payment_way` varchar(50) NOT NULL DEFAULT '' COMMENT '支付方式（如支付宝、微信），默认空字符串',
  `payment_id` int NOT NULL DEFAULT '0' COMMENT '支付设置ID，关联PaymentSettings表(id)，默认0',
  `world_id` int NOT NULL DEFAULT '1' COMMENT '游戏世界ID，默认1',
  `product_name` varchar(100) NOT NULL COMMENT '商品名称（如充值金币），必填',
  `product_des` varchar(255) NOT NULL COMMENT '商品描述，详细说明商品内容，必填',
  `ip` varchar(45) NOT NULL DEFAULT '' COMMENT '支付时的IP地址（支持IPv4/IPv6），默认空字符串',
  `amount` decimal(10,2) NOT NULL COMMENT '支付金额，精确到2位小数，必填',
  `mch_order_id` varchar(100) NOT NULL DEFAULT '' COMMENT '商户订单ID，第三方支付系统生成，默认空字符串',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间，默认当前时间',
  `notify_at` timestamp NULL DEFAULT NULL COMMENT '通知时间，可为空',
  `callback_at` timestamp NULL DEFAULT NULL COMMENT '回调时间，可为空',
  `msg` varchar(255) NOT NULL DEFAULT '' COMMENT '附加信息或备注，默认空字符串',
  `server_url` varchar(255) NOT NULL DEFAULT '' COMMENT '服务器回调URL，默认空字符串',
  `device` varchar(100) NOT NULL DEFAULT '' COMMENT '支付设备信息（如手机型号），默认空字符串',
  `channel_code` varchar(50) NOT NULL DEFAULT '' COMMENT '支付渠道代码（如ALI、WX），默认空字符串',
  `game_code` varchar(50) NOT NULL DEFAULT '' COMMENT '游戏代码，标识具体游戏，默认空字符串',
  `payment_status` int NOT NULL DEFAULT '0' COMMENT '支付状态：0=未完成，1=处理中，2=失败，3=已完成，默认0',
  `ptb_before` decimal(15,2) NOT NULL DEFAULT 0 COMMENT '平台币变动前余额',
  `ptb_change` decimal(15,2) NOT NULL DEFAULT 0 COMMENT '平台币变动量' ,
  `ptb_after`  decimal(15,2) NOT NULL DEFAULT 0 COMMENT '平台币变动后余额' ,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transaction_id` (`transaction_id`),
  UNIQUE KEY `uk_mch_order_id` (`mch_order_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_sub_user_id` (`sub_user_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_payment_status` (`payment_status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_payment_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='支付记录表，用于存储用户支付相关信息';
/*!40101 SET character_set_client = @saved_cs_client */;



DROP TABLE IF EXISTS `paymentsettings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paymentsettings` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '支付设置ID,主键,自增',
  `icon_url` varchar(255) NOT NULL DEFAULT '' COMMENT '支付方式图标URL,默认空字符串',
  `payment_method` varchar(100) NOT NULL COMMENT '支付方式(zfb 支付宝 wx 微信 ptb  平台币 kf 客服),必填',
  `payment_channel` varchar(50) NOT NULL COMMENT '支付渠道代码,必填',
  `request_url` varchar(255) NOT NULL DEFAULT '' COMMENT '请求URL,默认空字符串',
  `MinPrice` int DEFAULT '0' COMMENT '最小支付金额,默认0',
  `MaxPrice` int DEFAULT '9999' COMMENT '最大支付金额,默认9999',
  `Sort` int DEFAULT '0' COMMENT '排序优先级,默认0',
  `isClose` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '用户中心启用(1启用,0禁用)',
  `clientIsClose` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '客户端/SDK启用(1启用,0禁用)',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='支付设置表,存储支付方式和渠道配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `paymentsettings`
--

LOCK TABLES `paymentsettings` WRITE;
/*!40000 ALTER TABLE `paymentsettings` DISABLE KEYS */;
INSERT INTO `paymentsettings` VALUES (1,'http://156.254.5.29/platform-coin.png','ptb','001','',0,9999,0,1),(2,'http://156.254.5.29/wx.png','wx','wxpay','',0,9999,0,1),(3,'http://156.254.5.29/zfb.png','zfb','alipay','',0,9999,0,1);
/*!40000 ALTER TABLE `paymentsettings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settlements`
--

DROP TABLE IF EXISTS `settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settlements` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '结算记录ID,主键,自增',
  `admin_id` int NOT NULL COMMENT '管理员/代理ID,关联Admins表',
  `admin_name` varchar(100) NOT NULL COMMENT '代理名称,必填',
  `admin_level` int NOT NULL COMMENT '代理级别,同步Admins表的level字段',
  `total_amount` decimal(10,2) DEFAULT '0.00' COMMENT '总收入金额,默认0',
  `divide_rate` int DEFAULT '0' COMMENT '分成比例(百分比),默认0',
  `settlement_amount` decimal(10,2) DEFAULT '0.00' COMMENT '应结算金额,默认0',
  `status` int DEFAULT '0' COMMENT '结算状态：0=待结算,1=已结算,2=已拒绝,默认0',
  `settlement_date` timestamp NULL DEFAULT NULL COMMENT '实际结算时间,可为空',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间,自动更新',
  `remark` varchar(255) DEFAULT '' COMMENT '备注,默认空字符串',
  PRIMARY KEY (`id`),
  KEY `fk_settlement_admin` (`admin_id`),
  CONSTRAINT `fk_settlement_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='结算表,存储代理结算信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settlements`
--

LOCK TABLES `settlements` WRITE;
/*!40000 ALTER TABLE `settlements` DISABLE KEYS */;
/*!40000 ALTER TABLE `settlements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subusers`
--

DROP TABLE IF EXISTS `subusers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subusers` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '子账号ID,主键,自增',
  `parent_user_id` int NOT NULL COMMENT '父用户ID,关联主账号',
  `username` varchar(100) NOT NULL COMMENT '子账号用户名,唯一',
  `wuid` varchar(100) DEFAULT '' COMMENT '外部用户ID,默认空字符串',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  PRIMARY KEY (`id`),
  KEY `fk_subuser_parent` (`parent_user_id`),
  CONSTRAINT `fk_subuser_parent` FOREIGN KEY (`parent_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1000012 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='子用户表,存储子账号信息';
/*!40101 SET character_set_client = @saved_cs_client */;



DROP TABLE IF EXISTS `systemparams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `systemparams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(255) NOT NULL COMMENT '参数键',
  `content` text NOT NULL COMMENT '参数内容',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统参数表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `systemparams`
--

LOCK TABLES `systemparams` WRITE;
/*!40000 ALTER TABLE `systemparams` DISABLE KEYS */;
INSERT INTO `systemparams` VALUES (1,'payment_message','*平台币说明：1人民币=1平台币，不会过期，可前往盒子或官网进行充值。\n亲爱的玩家：游戏充值后可前往盒子申请福利哦','2025-08-26 03:43:29','2025-08-26 03:43:29'),(2,'kefu_line','https://lin.ee/hmwVgIW','2025-08-26 03:43:29','2025-08-26 03:43:29'),(3,'pay_suc_url','http://49.232.62.9:3000/user/payment-success','2025-08-26 03:43:29','2025-09-10 12:37:48'),(4,'kefu_order_url','http://49.232.62.9:3000/user/customer-service-payment','2025-08-26 03:43:29','2025-09-10 12:37:36'),(5,'notify_game_url','http://160.202.240.19:8888/update_pay_status','2025-08-26 03:43:29','2025-08-26 03:43:29'),(7,'qrcode_url','http://49.232.62.9:3000/user/qrcode','2025-09-11 04:31:57','2025-09-23 10:13:01');
/*!40000 ALTER TABLE `systemparams` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `userloginlogs`
--

DROP TABLE IF EXISTS `userloginlogs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `userloginlogs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '账号',
  `sub_user_id` int DEFAULT NULL COMMENT '子账号ID，可为空',
  `sub_user_name` varchar(100) DEFAULT '' COMMENT '子账号用户名，可为空',
  `game_code` varchar(100) DEFAULT '' COMMENT '游戏',
  `login_time` datetime NOT NULL COMMENT '登录时间',
  `imei` varchar(50) DEFAULT '' COMMENT 'IMEI',
  `ip_address` varchar(45) DEFAULT '' COMMENT 'IP',
  `device` varchar(100) DEFAULT '' COMMENT '设备',
  `channel_code` varchar(50) DEFAULT '' COMMENT '渠道',
  PRIMARY KEY (`id`),
  KEY `idx_username` (`username`),
  KEY `idx_login_time` (`login_time`),
  KEY `idx_imei` (`imei`),
  KEY `idx_channel_code` (`channel_code`),
  KEY `idx_login_time_channel` (`login_time`,`channel_code`),
  KEY `idx_login_username_time` (`username`,`login_time`),
  KEY `idx_login_channel_time` (`channel_code`,`login_time`),
  KEY `idx_login_game_code` (`game_code`),
  KEY `idx_login_time_game` (`login_time`,`game_code`),
  KEY `idx_login_channel_game` (`channel_code`,`game_code`),
  KEY `idx_login_time_channel_game` (`login_time`,`channel_code`,`game_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户登录记录表';
/*!40101 SET character_set_client = @saved_cs_client */;



DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '用户ID,主键,自增',
  `username` varchar(100) DEFAULT NULL COMMENT '用户名,可为空',
  `iphone` varchar(100) DEFAULT '' COMMENT '手机号码,默认空字符串',
  `password` varchar(100) DEFAULT NULL COMMENT '密码(加密存储),可为空',
  `thirdparty_uid` varchar(100) NOT NULL COMMENT '第三方平台用户ID,必填',
  `channel_code` varchar(100) DEFAULT '' COMMENT '渠道代码,标识用户来源,默认空字符串',
  `game_code` varchar(50) DEFAULT '' COMMENT '游戏代码,标识用户所属游戏',
  `platform_coins` decimal(15,2) DEFAULT '0.00' COMMENT '平台币余额,精确到2位小数,默认0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间,默认当前时间',
  `status` int DEFAULT '0' COMMENT '用户状态：0=正常,1=封号',
  PRIMARY KEY (`id`),
  KEY `idx_users_created_channel` (`created_at`,`channel_code`),
  KEY `idx_users_channel_created` (`channel_code`,`created_at`),
  KEY `idx_users_game_code` (`game_code`),
  KEY `idx_users_created_game` (`created_at`,`game_code`),
  KEY `idx_users_channel_game` (`channel_code`,`game_code`),
  KEY `idx_users_created_channel_game` (`created_at`,`channel_code`,`game_code`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=10010 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='主用户表,存储主账号信息';
/*!40101 SET character_set_client = @saved_cs_client */;


CREATE TABLE `GameServers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int DEFAULT NULL COMMENT '业务服务器ID，例如 10001',
  `name` varchar(100) NOT NULL COMMENT '显示名称，如 S1/一区',
  `webhost` varchar(255) NOT NULL COMMENT '如 http://1.2.3.4:8888 或 https://domain:port',
  `dbip` varchar(128) NOT NULL COMMENT 'MySQL 主机',
  `bname` varchar(100) NOT NULL COMMENT '数据库名，如 game_1',
  `dbuser` varchar(100) NOT NULL COMMENT 'MySQL 用户名',
  `dbpass` varchar(255) NOT NULL COMMENT 'MySQL 密码',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `allow_cdk_redeem` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=允许CDK领取 0=不允许',
  `count_online` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=计在线 0=不计',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_is_active` (`is_active`),
  UNIQUE KEY `uniq_server_id` (`server_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gm_operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  op_type VARCHAR(32) NOT NULL COMMENT '操作类型: ban/unban/send_items/recharge/send_mail',
  server VARCHAR(64) NOT NULL COMMENT '服务器标识，如 game_1',
  player_id VARCHAR(64) DEFAULT NULL COMMENT '玩家ID（游戏内角色/玩家ID）',
  player_name VARCHAR(128) DEFAULT NULL COMMENT '玩家名称（可选，前端传入或查询时补充）',
  open_id VARCHAR(128) DEFAULT NULL COMMENT 'OpenID（账号标识）',
  role_id VARCHAR(64) DEFAULT NULL COMMENT '角色ID（可选）',
  platform VARCHAR(16) DEFAULT NULL COMMENT '平台: 1=Android,2=iOS 或字符串',
  admin_id BIGINT DEFAULT NULL COMMENT '操作者管理员ID',
  admin_name VARCHAR(64) DEFAULT NULL COMMENT '操作者管理员名称',
  request_params JSON NULL COMMENT '请求参数快照（入参）',
  response_result JSON NULL COMMENT '响应结果快照（出参或错误）',
  success TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否成功: 1=成功,0=失败',
  error_message VARCHAR(512) DEFAULT NULL COMMENT '错误信息（失败时）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_type_created (op_type, created_at),
  INDEX idx_player (player_id, open_id, player_name),
  INDEX idx_admin (admin_id, admin_name),
  INDEX idx_server (server),
  INDEX idx_success (success),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='GM操作日志';


CREATE TABLE IF NOT EXISTS `PaymentRoutingRules` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `rule_name` VARCHAR(100) NOT NULL COMMENT '关联渠道名称',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '优先级，数字越大越优先',
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  
  -- 匹配条件
  `min_amount` DECIMAL(10,2) DEFAULT NULL COMMENT '最小金额（包含），NULL=不限制',
  `max_amount` DECIMAL(10,2) DEFAULT NULL COMMENT '最大金额（包含），NULL=不限制',
  `time_start` TIME DEFAULT NULL COMMENT '开始时间，NULL=不限制',
  `time_end` TIME DEFAULT NULL COMMENT '结束时间，NULL=不限制',
  
  -- 路由目标
  `payment_channel` VARCHAR(10) NOT NULL COMMENT '支付渠道ID',
  
  -- 额度限制
  `daily_quota` DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '每日额度限制，0=不限制',
  `used_quota` DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '今日已使用额度',
  `quota_reset_date` DATE DEFAULT NULL COMMENT '额度重置日期',
  
  -- 支付方式开关
  `allow_zfb` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=允许支付宝 0=禁止',
  `allow_wx` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=允许微信 0=禁止',

  -- 降级配置
  `fallback_channel` VARCHAR(10) DEFAULT NULL COMMENT '降级渠道',
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_priority` (`priority` DESC),
  INDEX `idx_enabled` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付路由策略表';

-- 5. 插入示例路由规则
INSERT INTO `PaymentRoutingRules` 
(`rule_name`, `priority`, `is_enabled`, `min_amount`, `max_amount`, `time_start`, `time_end`, `payment_channel`, `daily_quota`, `fallback_channel`) 
VALUES
-- 小额订单：0.01-100元，使用1号渠道，每日限额10000元
('小额订单', 100, 1, 0.01, 100.00, NULL, NULL, '1', 10000.00, '2'),

-- 中额订单：100.01-500元，使用2号渠道，每日限额50000元
('中额订单', 90, 1, 100.01, 500.00, NULL, NULL, '2', 50000.00, '1'),

-- 大额订单：500.01元以上，使用1号渠道，不限额度
('大额订单', 80, 1, 500.01, NULL, NULL, NULL, '1', 0, '3'),

-- 夜间时段：22:00-08:00，使用2号渠道，不限额度
('夜间时段', 70, 0, NULL, NULL, '22:00:00', '08:00:00', '2', 0, '1');



INSERT INTO `SystemParams` (`param_key`, `param_value`, `param_description`) VALUES
('payment_routing_enabled', 'false', '是否启用智能路由')
ON DUPLICATE KEY UPDATE 
  `param_description` = VALUES(`param_description`);

INSERT INTO `SystemParams` (`param_key`, `param_value`, `param_description`) VALUES
('payment_routing_mode', 'manual', '路由模式: auto=自动, manual=手动')
ON DUPLICATE KEY UPDATE 
  `param_description` = VALUES(`param_description`);

INSERT INTO `SystemParams` (`param_key`, `param_value`, `param_description`) VALUES
('payment_health_check_enabled', 'true', '是否启用健康检测')
ON DUPLICATE KEY UPDATE 
  `param_description` = VALUES(`param_description`);

INSERT INTO `SystemParams` (`param_key`, `param_value`, `param_description`) VALUES
('payment_health_check_interval', '30', '健康检测时间窗口（分钟）')
ON DUPLICATE KEY UPDATE 
  `param_description` = VALUES(`param_description`);



