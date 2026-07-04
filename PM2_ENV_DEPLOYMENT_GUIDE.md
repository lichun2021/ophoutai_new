# PM2 环境变量部署指南

## 📋 新的环境变量方案

由于PM2 daemon进程无法读取shell环境变量(`~/.bashrc`),我们改用 **PM2的 env_file** 方案。

### 方案架构

```
/data/
├── .env.production          # 所有密钥存储在这里(不提交Git)
├── ecosystem.config.js      # PM2配置文件(可提交Git,不含密钥)
├── user-center/             # 应用1
├── op-admin/                # 应用2
└── agent-admin/             # 应用3
```

**工作原理**:
- PM2读取 `/data/.env.production` 中的环境变量
- 自动注入到所有应用进程
- `ecosystem.config.js` 只包含非敏感配置

---

## 🚀 部署步骤

### 1. 上传脚本到服务器

```bash
# 本地执行
scp setup-pm2-env.sh root@your-server:/root/
```

### 2. 在服务器上运行配置脚本

```bash
# SSH登录服务器
ssh root@your-server

# 运行脚本
cd /root
chmod +x setup-pm2-env.sh
sudo ./setup-pm2-env.sh
```

**脚本会做什么**:
- ✅ 生成3个强随机密钥(JWT_SECRET, ADMIN_SESSION_SECRET, API_SIGN_KEY)
- ✅ 交互式询问数据库配置
- ✅ 写入 `/data/.env.production`
- ✅ 设置严格文件权限 (600)
- ✅ 显示生成的密钥(记得保存!)

### 3. 修改数据库密码(旧密码已泄露)

```bash
mysql -u root -p
```

```sql
-- 修改root密码
ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新强密码';
FLUSH PRIVILEGES;
EXIT;
```

**重要**: 修改密码后,更新 `/data/.env.production` 中的 `DB_PASSWORD`。

### 4. 验证配置

```bash
# 检查文件是否存在
ls -l /data/.env.production

# 查看文件内容(确认密钥已填写)
cat /data/.env.production

# 文件权限应该是 -rw------- (600)
```

### 5. 部署应用代码

```bash
# 正常部署你的代码
# ecosystem.config.js 会自动读取 /data/.env.production

# 如果使用deploy.sh
./deploy.sh
```

### 6. 启动/重启PM2

```bash
# 首次启动
pm2 start /data/ecosystem.config.js

# 或重启
pm2 restart all

# 重新加载配置
pm2 reload all
```

### 7. 验证环境变量

```bash
# 查看第一个应用的环境变量
pm2 env 0

# 应该能看到:
# DB_PASSWORD=xxx
# JWT_SECRET=xxx
# ADMIN_SESSION_SECRET=xxx
```

### 8. 检查日志

```bash
# 查看所有应用日志
pm2 logs

# 查看特定应用
pm2 logs user-center

# 应该看到:
# - ✅ 没有 "sessionVariables" 警告
# - ✅ 没有 "环境变量缺失" 错误
# - ✅ 应用正常启动
```

---

## 🔧 常见问题

### Q1: PM2重启后环境变量丢失?

**原因**: PM2 daemon重启了,需要重新加载配置。

**解决**:
```bash
pm2 restart all --update-env
```

### Q2: 修改了 .env.production 不生效?

**原因**: PM2缓存了旧的环境变量。

**解决**:
```bash
pm2 restart all --update-env
# 或
pm2 reload all
```

### Q3: 想临时覆盖某个环境变量?

```bash
# 在ecosystem.config.js的env里直接写
env: {
  DB_PASSWORD: 'temporary-password',  // 这个会覆盖.env.production
}
```

### Q4: 多个应用需要不同的环境变量?

**方案A**: 每个应用用不同的 env_file
```javascript
{
  name: 'user-center',
  env_file: '/data/user-center/.env',
}
```

**方案B**: 在 ecosystem.config.js 里为特定应用单独配置
```javascript
{
  name: 'user-center',
  env_file: '/data/.env.production',  // 共享的
  env: {
    PORT: 3001,                        // 应用特定的
    BASE_URL: 'https://...',
  }
}
```

### Q5: 如何轮换密钥?

```bash
# 1. 生成新密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. 编辑配置文件
vi /data/.env.production

# 3. 重启应用
pm2 restart all --update-env

# 4. 验证
pm2 logs | grep "环境变量"
```

---

## 📊 文件清单

### 需要上传到服务器
- ❌ `.env.production` - **不要上传!** (在服务器上生成)
- ✅ `ecosystem.config.js` - 可以上传(不含密钥)
- ✅ `setup-pm2-env.sh` - 配置脚本

### 保留在本地(不提交Git)
- `.env.production.example` - 模板文件
- `setup-pm2-env.sh` - 配置脚本

### 提交到Git
- `ecosystem.config.js` - PM2配置(已移除密钥)
- `.env.production.example` - 模板(供参考)

---

## 🔒 安全检查清单

部署完成后,确认以下几点:

- [ ] `/data/.env.production` 文件权限是 600
- [ ] `.env.production` 已添加到 `.gitignore`
- [ ] 数据库密码已修改(旧密码已泄露)
- [ ] JWT_SECRET 是随机生成的(至少32字符)
- [ ] ADMIN_SESSION_SECRET 是随机生成的
- [ ] 所有密钥已保存到密码管理器
- [ ] PM2日志没有 "环境变量缺失" 错误
- [ ] 应用正常启动,功能正常

---

## 📞 后续支持

如有问题,检查:
1. PM2日志: `pm2 logs`
2. 环境变量: `pm2 env 0`
3. 配置文件: `cat /data/.env.production`

---

**文档更新时间**: 2026-07-03
