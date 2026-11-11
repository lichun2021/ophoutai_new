-- Run explicitly against the intended backend database before deploying the
-- serverlist editor. MySQL 8.x; safe to run repeatedly. Existing rows stay NULL.
-- No changes to game databases, credentials, or existing server records.
SET @serverlist_config_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'gameservers'
    AND COLUMN_NAME = 'serverlist_config'
);
SET @serverlist_config_ddl = IF(
  @serverlist_config_exists = 0,
  'ALTER TABLE `GameServers` ADD COLUMN `serverlist_config` JSON DEFAULT NULL COMMENT ''客户端公开服务器列表配置，与运营接口地址独立'' AFTER `webhost`',
  'SELECT ''serverlist_config already exists'' AS migration_status'
);
PREPARE serverlist_config_statement FROM @serverlist_config_ddl;
EXECUTE serverlist_config_statement;
DEALLOCATE PREPARE serverlist_config_statement;
