# 部署指南 - Quantum Publish

**版本**: v1.0  
**更新日期**: 2026-07-03  
**适用环境**: 生产环境 / 测试环境

---

## 📋 前置要求

- Node.js >= 18.x
- pnpm >= 8.x
- PM2 >= 5.x
- MySQL >= 8.0
- Redis >= 6.x

---

## 🚀 快速部署

### 1. 配置环境变量

#### 方式1: 使用 .env 文件 (推荐)

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
nano .env
```

**必需配置项**:
```bash
# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_new_password_here  # ⚠️ 必须修改
DB_NAME=quantum_db

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password  # 如有密码

# JWT 配置 (生成随机强密钥)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 管理员 Session
ADMIN_SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# API 签名
API_SIGN_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

**生成强密钥**:
```bash
# 一键生成所有密钥
node -e "
const crypto = require('crypto');
console.log('JWT_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('ADMIN_SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('API_SIGN_KEY=' + crypto.randomBytes(32).toString('hex'));
" >> .env
```

#### 方式2: 系统环境变量

```bash
# 添加到 ~/.bashrc 或 /etc/environment
export DB_HOST=127.0.0.1
export DB_PASSWORD=your_new_password
export JWT_SECRET=your_jwt_secret_32_chars_min
export ADMIN_SESSION_SECRET=your_admin_secret_32_chars_min
export API_SIGN_KEY=your_api_key_32_chars_min

# 重新加载
source ~/.bashrc
```

---

### 2. 安装依赖

```bash
# 使用 pnpm workspace 安装
pnpm install

# 或分别安装 (如果没有配置 workspace)
cd apps/user-center && pnpm install
cd apps/op-admin && pnpm install
cd apps/agent-admin && pnpm install
```

---

### 3. 验证环境变量

**手动验证**:
```bash
# 检查是否已设置
node -e "
const required = ['DB_PASSWORD', 'JWT_SECRET', 'ADMIN_SESSION_SECRET', 'API_SIGN_KEY'];
required.forEach(key => {
  if (!process.env[key]) {
    console.error('❌ 缺少环境变量:', key);
  } else {
    console.log('✅', key, '已配置');
  }
});
"
```

**自动验证**:
```bash
# 启动任一应用，会自动检查环境变量
cd apps/user-center
pnpm dev

# 看到以下输出表示成功:
# 🔍 检查环境变量配置...
# ✅ 环境变量检查通过，服务器启动中...
```

---

### 4. 启动应用

#### 开发环境
```bash
# 启动单个应用
cd apps/user-center
pnpm dev

# 或使用 PM2 (推荐)
pm2 start ecosystem.config.js
```

#### 生产环境
```bash
# 方式1: 直接使用 PM2
export DB_PASSWORD="your_password"
export JWT_SECRET="your_jwt_secret"
export ADMIN_SESSION_SECRET="your_admin_secret"
export API_SIGN_KEY="your_api_key"

pm2 start ecosystem.config.js

# 方式2: 从 .env 文件加载 (需要 pm2-dotenv 插件)
pm2 install pm2-dotenv
pm2 start ecosystem.config.js

# 方式3: 使用部署脚本
./deploy.sh
```

---

## 🔒 安全配置

### 1. 修改 MySQL 密码 (旧密码已泄露)

**重要**: 旧的硬编码密码 `Tz9#mQ!kR8@vX2$pN5jL` 已泄露，必须立即修改！

```bash
# 1. 登录 MySQL
mysql -u root -p

# 2. 修改密码
ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_new_strong_password';
FLUSH PRIVILEGES;

# 3. 退出
EXIT;

# 4. 测试新密码
mysql -u root -p  # 使用新密码登录
```

**生成强密码**:
```bash
# 生成 20 字符随机密码
node -e "console.log(require('crypto').randomBytes(20).toString('base64').slice(0,20))"
```

### 2. 配置 .env 文件权限

```bash
# 设置为仅所有者可读写
chmod 600 .env

# 验证权限
ls -l .env
# 应显示: -rw------- (600)
```

### 3. 确保 .env 不被提交到 Git

```bash
# 检查 .gitignore
grep "^\.env$" .gitignore

# 如果没有，添加
echo ".env" >> .gitignore

# 如果已经提交，从 Git 历史中移除
git rm --cached .env
git commit -m "Remove .env from git"
```

---

## 🔄 重启和更新

### 重启应用

```bash
# 重启所有应用
pm2 restart all

# 重启单个应用
pm2 restart user-center

# 重启并更新环境变量
pm2 restart ecosystem.config.js --update-env
```

### 更新代码

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装新依赖
pnpm install

# 3. 构建
pnpm build

# 4. 重启 PM2
pm2 restart all --update-env
```

---

## 🧪 验证部署

### 1. 检查应用状态

```bash
# 查看 PM2 进程状态
pm2 list

# 查看日志
pm2 logs user-center --lines 50

# 查看实时日志
pm2 logs user-center --follow
```

**预期输出**:
```
┌─────┬────────────────┬─────────┬─────────┬─────────┬──────────┐
│ id  │ name           │ mode    │ status  │ cpu     │ memory   │
├─────┼────────────────┼─────────┼─────────┼─────────┼──────────┤
│ 0   │ user-center    │ cluster │ online  │ 2%      │ 150 MB   │
│ 1   │ agent-admin    │ cluster │ online  │ 1%      │ 100 MB   │
│ 2   │ op-admin       │ cluster │ online  │ 1.5%    │ 120 MB   │
└─────┴────────────────┴─────────┴─────────┴─────────┴──────────┘
```

### 2. 测试 API 接口

```bash
# 测试健康检查
curl http://localhost:3001/api/health

# 测试登录接口
curl -X POST http://localhost:3001/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
```

### 3. 检查数据库连接

```bash
# 查看应用日志，确认连接成功
pm2 logs user-center | grep -i "database\|mysql\|connected"
```

### 4. 检查 Redis 连接

```bash
# 查看应用日志，确认 Redis 连接成功
pm2 logs user-center | grep -i "redis"

# 应该看到:
# Redis Connected
```

---

## 🐛 常见问题排查

### 问题1: 启动失败 - 缺少环境变量

**错误信息**:
```
❌ 缺少必需的环境变量:
   - DB_PASSWORD
   - JWT_SECRET
```

**解决方法**:
```bash
# 1. 检查环境变量是否设置
echo $DB_PASSWORD

# 2. 如果为空，设置环境变量
export DB_PASSWORD="your_password"

# 3. 或使用 .env 文件
cp .env.example .env
nano .env  # 填写配置

# 4. 重启应用
pm2 restart all --update-env
```

---

### 问题2: 数据库连接失败

**错误信息**:
```
Error: ER_ACCESS_DENIED_ERROR: Access denied for user 'root'@'localhost'
```

**解决方法**:
```bash
# 1. 检查数据库密码是否正确
mysql -u root -p  # 手动测试

# 2. 检查环境变量
echo $DB_PASSWORD

# 3. 如果密码包含特殊字符，使用引号
export DB_PASSWORD='Tz9#mQ!kR8@vX2$pN5jL'

# 4. 检查 MySQL 用户权限
mysql -u root -p
SHOW GRANTS FOR 'root'@'localhost';
```

---

### 问题3: Redis 连接失败

**错误信息**:
```
Redis Error: ECONNREFUSED 127.0.0.1:6379
```

**解决方法**:
```bash
# 1. 检查 Redis 是否运行
redis-cli ping
# 应返回: PONG

# 2. 如果未运行，启动 Redis
sudo systemctl start redis
# 或
redis-server

# 3. 检查 Redis 配置
redis-cli
CONFIG GET bind
CONFIG GET protected-mode

# 4. 如果 Redis 有密码，设置环境变量
export REDIS_PASSWORD="your_redis_password"
```

---

### 问题4: JWT Token 无效

**错误信息**:
```
401 Unauthorized: Token 验证失败，请重新登录
```

**解决方法**:
```bash
# 1. 检查 JWT_SECRET 是否配置
echo $JWT_SECRET

# 2. 检查 JWT_SECRET 长度 (至少32字符)
echo -n $JWT_SECRET | wc -c

# 3. 确保所有应用使用相同的 JWT_SECRET
pm2 logs | grep JWT_SECRET

# 4. 重新生成 JWT_SECRET
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 5. 重启应用
pm2 restart all --update-env
```

---

### 问题5: PM2 进程频繁重启

**错误信息**:
```
user-center  │ ↻ restarted (5)
```

**解决方法**:
```bash
# 1. 查看详细日志
pm2 logs user-center --lines 100 --err

# 2. 检查是否是环境变量问题
pm2 env 0  # 查看进程0的环境变量

# 3. 检查端口占用
lsof -i :3001

# 4. 检查内存使用
pm2 monit

# 5. 增加启动超时
pm2 start ecosystem.config.js --listen-timeout 10000
```

---

### 问题6: 数据库密码包含特殊字符

**问题**: 密码包含 `$`, `!`, `"` 等特殊字符导致解析错误

**解决方法**:
```bash
# 方式1: 使用单引号 (最安全)
export DB_PASSWORD='Tz9#mQ!kR8@vX2$pN5jL'

# 方式2: 转义特殊字符
export DB_PASSWORD="Tz9#mQ\!kR8@vX2\$pN5jL"

# 方式3: 使用 .env 文件 (推荐)
# .env 文件中不需要转义
DB_PASSWORD=Tz9#mQ!kR8@vX2$pN5jL
```

---

## 📊 监控和日志

### PM2 监控

```bash
# 实时监控
pm2 monit

# Web 监控界面
pm2 web

# 日志管理
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
```

### 日志位置

```bash
# PM2 日志
~/.pm2/logs/user-center-out.log
~/.pm2/logs/user-center-error.log

# 应用日志
logs/combined.log
logs/error.log
```

---

## 🔄 回滚指南

### 快速回滚

```bash
# 1. 停止当前应用
pm2 stop all

# 2. 回滚代码
git reset --hard HEAD~1

# 3. 恢复依赖
pnpm install

# 4. 重启应用
pm2 restart all
```

### 回滚环境变量

```bash
# 1. 备份当前 .env
cp .env .env.backup

# 2. 恢复旧的 .env
cp .env.old .env

# 3. 重启应用
pm2 restart all --update-env
```

---

## 📝 最佳实践

### 1. 环境变量管理

- ✅ 使用 .env 文件 (本地/测试环境)
- ✅ 使用系统环境变量 (生产环境)
- ✅ 使用密钥管理服务 (AWS Secrets Manager, Azure Key Vault)
- ❌ 不要在代码中硬编码
- ❌ 不要提交 .env 到 Git

### 2. 密钥轮换

- 定期轮换密钥 (建议每季度一次)
- 记录密钥轮换历史
- 保留旧密钥一段时间 (防止回滚)

### 3. 监控告警

- 配置 PM2 进程监控
- 配置日志告警
- 配置性能监控 (CPU, 内存, 响应时间)

### 4. 备份策略

- 定期备份数据库
- 定期备份 .env 文件 (加密存储)
- 定期备份 PM2 配置

---

## 📞 技术支持

如遇到问题，请提供以下信息:

```bash
# 1. 系统信息
uname -a
node -v
pnpm -v
pm2 -v

# 2. PM2 状态
pm2 list

# 3. 应用日志 (最近 100 行)
pm2 logs user-center --lines 100 --nostream > debug.log

# 4. 环境变量 (脱敏后)
pm2 env 0 | grep -E "DB_|REDIS_|JWT_|API_" > env.log
```

---

**部署成功！🎉**
