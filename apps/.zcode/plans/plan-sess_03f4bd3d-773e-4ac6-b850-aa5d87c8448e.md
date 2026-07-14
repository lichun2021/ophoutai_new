## 目标
新建一个归档脚本:对 PaymentRecords + 4 张日志表,把「1 个月前」的数据 `INSERT IGNORE INTO 归档表 SELECT` 备份后,再从原表分批删除。参照 `op-admin/部署/scripts/audit.js` 的 `clean-failed-orders` 风格(dry-run 默认 + `--confirm` 真删 + 分批 + 200ms 停顿 + 共用 `config.js`)。

## 新建文件
`D:\projects\houtai\apps\op-admin\部署\scripts\archive-old-data.js`(ES Module,`#!/usr/bin/env node` shebang + JSDoc 用法头)

## 处理的表与时间列(均 < 阈值即归档)
| 原表 | 归档表 | 时间列 |
|---|---|---|
| PaymentRecords | PaymentRecords_archive | created_at |
| logs | logs_archive | created_at |
| userloginlogs | userloginlogs_archive | login_time |
| gm_operation_logs | gm_operation_logs_archive | created_at |
| AdminLoginLogs | AdminLoginLogs_archive | login_time |

- 归档表用 `CREATE TABLE IF NOT EXISTS <archive> LIKE <原表>` 创建(复制结构+索引,不复制外键)。
- 额外 `ALTER TABLE <archive> ADD COLUMN archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` 记录归档时刻。
- PaymentRecords 按你的选择**全部归档**(不做 `status!=3` 过滤,与 audit.js 不同)。

## 每张表的处理流程(游标分批,保证归档与删除精确对齐、可对账)
1. `COUNT` 待归档行数(`WHERE 时间列 < DATE_SUB(NOW(), INTERVAL ? DAY)`),dry-run 时只打印汇总后退出。
2. 确保归档表存在(LIKE + 加 archived_at 列)。
3. 按 `id` 游标分批(每批 5000):
   - 取本批 id 范围:`SELECT MAX(id) FROM 原表 WHERE 时间列 < 阈值 AND id > ?lastId ORDER BY id LIMIT 5000`
   - `INSERT IGNORE INTO 归档表 SELECT *, NULL FROM 原表 WHERE id > ?lastId AND id <= ?maxId AND 时间列 < 阈值`(`INSERT IGNORE` 靠主键 id 去重 → 脚本可安全重跑,幂等)
   - `DELETE FROM 原表 WHERE id > ?lastId AND id <= ?maxId AND 时间列 < 阈值 LIMIT 5000`
   - 推进 `lastId = maxId`,累加归档/删除计数,`setTimeout` 200ms 停顿(同 audit.js)。
4. 每张表结束后对账:原表剩余 `WHERE 时间列 < 阈值` 应为 0;打印归档条数 vs 删除条数。
5. 全部完成后 `console.table` 汇总各表归档/删除条数。

## 安全特性
- **dry-run 默认开**:不加 `--confirm` 只预览各表待归档数量,不写不删。
- **`INSERT IGNORE` 幂等**:重复运行不会因主键冲突报错,已归档的跳过。
- **归档→删除同范围游标**:每批先归档后删,范围完全一致,不会出现「删了但没归档」。
- **分批 + 停顿**:避免长事务、避免锁线上。
- **不碰外键级联**:PaymentRecords 的 FK 方向是「删 user 级联删 paymentrecords」,删 paymentrecords 不影响 users,安全。
- 连接用 `mysql2/promise` 单连接,`try/finally` 关闭;日志走 `config.js` 的 `logInfo/logWarn/logError`。

## CLI 用法
```
node scripts/archive-old-data.js                       # dry-run 预览(默认 30 天)
node scripts/archive-old-data.js --confirm             # 真实归档+删除,30 天前
node scripts/archive-old-data.js --confirm --days=60   # 自定义阈值
node scripts/archive-old-data.js --only=PaymentRecords # 只处理某张表
```

## 可选(顺带)
在 `op-admin/部署/scripts/package.json` 的 `scripts` 里加一条 `"archive": "node scripts/archive-old-data.js"`,与现有 `"audit"` 对齐。

## 不做
- 不做定时调度(仓库无 cron,脚本均手动 `node` 执行)。
- 不导出 .sql 文件(归档落在 DB 内的 `_archive` 表,查询方便;如需文件级备份可另用 export-db.js)。
- 不改任何应用代码、不动其他表。
