# 数据库备份 - 快速开始指南

## 🚀 5 分钟快速部署

### 步骤 1: 上传文件到服务器

```bash
# 在本地执行（Windows PowerShell 或 Git Bash）
scp backup_quantum_db.sh setup_mysql_backup.sh root@你的服务器IP:/root/
```

### 步骤 2: 登录服务器

```bash
ssh root@你的服务器IP
cd /root
```

### 步骤 3: 一键配置

```bash
# 设置执行权限
chmod +x setup_mysql_backup.sh backup_quantum_db.sh

# 运行配置脚本（会提示输入数据库密码）
./setup_mysql_backup.sh
```

### 步骤 4: 测试备份

```bash
# 执行一次备份测试
./backup_quantum_db.sh

# 查看备份结果
ls -lh /data/backup/
```

### 步骤 5: 设置定时任务

```bash
# 编辑 crontab
crontab -e

# 按 i 进入编辑模式，添加以下内容（每天凌晨 3 点备份）
0 3 * * * /root/backup_quantum_db.sh >> /data/backup/cron.log 2>&1

# 按 ESC，输入 :wq 保存退出
```

## ✅ 完成！

现在你的数据库会每天自动备份到 `/data/backup/` 目录。

---

## 📋 常用命令

### 查看备份文件

```bash
ls -lh /data/backup/
```

### 查看备份日志

```bash
tail -f /data/backup/backup.log
```

### 查看最新 5 个备份

```bash
ls -lt /data/backup/*.zip | head -5
```

### 手动执行备份

```bash
/root/backup_quantum_db.sh
```

### 查看定时任务

```bash
crontab -l
```

### 查看定时任务日志

```bash
tail -f /data/backup/cron.log
```

---

## 🔄 恢复备份

### 恢复最新备份

```bash
cd /data/backup
LATEST=$(ls -t quantum_db_*.sql.zip | head -1)
unzip "$LATEST"
mysql -u root -p quantum_db < "${LATEST%.zip}"
rm -f "${LATEST%.zip}"
```

### 恢复指定备份

```bash
cd /data/backup
# 查看所有备份
ls -lh quantum_db_*.sql.zip

# 恢复指定文件
unzip quantum_db_20251102_030000.sql.zip
mysql -u root -p quantum_db < quantum_db_20251102_030000.sql
```

---

## ⚙️ 修改配置

### 修改备份时间

```bash
# 编辑定时任务
crontab -e

# 常用时间配置：
# 每天凌晨 3 点: 0 3 * * *
# 每 6 小时:     0 */6 * * *
# 每周日 2 点:   0 2 * * 0
```

### 修改保留天数

```bash
# 编辑备份脚本
vim /root/backup_quantum_db.sh

# 找到这行并修改天数
KEEP_DAYS=30  # 改为你想要的天数
```

### 修改备份目录

```bash
# 编辑备份脚本
vim /root/backup_quantum_db.sh

# 找到这行并修改路径
BACKUP_DIR="/data/backup"  # 改为你想要的路径
```

---

## 🛠️ 故障排查

### 备份失败？

```bash
# 查看详细日志
tail -100 /data/backup/backup.log

# 测试数据库连接
mysql -u root -p -e "SELECT VERSION();"
```

### 磁盘空间不足？

```bash
# 查看磁盘空间
df -h

# 手动清理旧备份（保留最近 7 天）
find /data/backup -name "quantum_db_*.sql.zip" -mtime +7 -delete
```

### 定时任务没执行？

```bash
# 查看 cron 服务状态
systemctl status crond

# 启动 cron 服务
systemctl start crond

# 设置开机自启
systemctl enable crond

# 查看定时任务日志
tail -f /data/backup/cron.log
```

---

## 📞 需要帮助？

查看完整文档：`BACKUP_README.md`

---

**创建日期**: 2025-11-02  
**适用版本**: CentOS 7/8, Ubuntu 18.04+

