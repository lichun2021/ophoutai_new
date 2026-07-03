#!/bin/bash
# 生产服务器环境变量配置脚本 (PM2专用)
# 使用方法: chmod +x setup-pm2-env.sh && sudo ./setup-pm2-env.sh

set -e

echo "=========================================="
echo "  Quantum Publish - PM2 环境变量配置"
echo "=========================================="
echo ""

# 检查是否有root权限
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用 sudo 运行此脚本"
  exit 1
fi

# 目标文件
ENV_FILE="/data/.env.production"

# 检查 /data 目录是否存在
if [ ! -d "/data" ]; then
  echo "⚠️  /data 目录不存在,正在创建..."
  mkdir -p /data
  echo "✅ 已创建 /data 目录"
fi

# 如果文件已存在,备份
if [ -f "$ENV_FILE" ]; then
  BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$ENV_FILE" "$BACKUP_FILE"
  echo "📦 已备份现有配置到: $BACKUP_FILE"
fi

# 生成随机密钥的函数
generate_secret() {
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

echo "📋 正在生成安全密钥..."
JWT_SECRET=$(generate_secret)
ADMIN_SESSION_SECRET=$(generate_secret)

echo "✅ 密钥生成完成"
echo ""

# 提示用户输入数据库密码
echo "⚠️  请输入数据库配置信息:"
echo ""
read -p "数据库地址 [默认: 127.0.0.1]: " DB_HOST
DB_HOST=${DB_HOST:-127.0.0.1}

read -p "数据库端口 [默认: 3306]: " DB_PORT
DB_PORT=${DB_PORT:-3306}

read -p "数据库用户名 [默认: root]: " DB_USER
DB_USER=${DB_USER:-root}

read -sp "数据库密码: " DB_PASSWORD
echo ""

read -p "数据库名称 [默认: quantum_db]: " DB_NAME
DB_NAME=${DB_NAME:-quantum_db}

echo ""
read -p "Redis地址 [默认: 127.0.0.1]: " REDIS_HOST
REDIS_HOST=${REDIS_HOST:-127.0.0.1}

read -p "Redis端口 [默认: 6379]: " REDIS_PORT
REDIS_PORT=${REDIS_PORT:-6379}

read -sp "Redis密码 [留空如无密码]: " REDIS_PASSWORD
echo ""

echo ""
read -p "API签名密钥 [默认: 自动生成]: " API_SIGN_KEY
if [ -z "$API_SIGN_KEY" ]; then
  API_SIGN_KEY=$(generate_secret)
fi

echo ""
echo "📝 正在写入环境变量到 $ENV_FILE ..."

# 写入配置文件
cat > $ENV_FILE << EOF
# ============================================
# Quantum Publish - 生产环境配置
# 由 setup-pm2-env.sh 自动生成于 $(date)
# ============================================

# 数据库配置
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_QUEUE_LIMIT=0

# Redis 配置
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASSWORD

# JWT 认证配置
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=4h
JWT_COOKIE_NAME=quantum_auth_token
JWT_COOKIE_MAX_AGE=14400000

# 管理员 Session 配置
ADMIN_SESSION_SECRET=$ADMIN_SESSION_SECRET

# API 签名配置
API_SIGN_KEY=$API_SIGN_KEY

# 应用配置
NODE_ENV=production
LOG_LEVEL=info
SERVICE_NAME=quantum-publish
EOF

# 设置严格权限 (仅所有者可读写)
chmod 600 $ENV_FILE

echo "✅ 环境变量已写入 $ENV_FILE"
echo "✅ 文件权限已设置为 600 (仅所有者可读写)"
echo ""

echo "=========================================="
echo "  ✅ 配置完成！"
echo "=========================================="
echo ""
echo "📋 生成的密钥 (请妥善保存):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "JWT_SECRET:            $JWT_SECRET"
echo "ADMIN_SESSION_SECRET:  $ADMIN_SESSION_SECRET"
echo "API_SIGN_KEY:          $API_SIGN_KEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  重要提醒:"
echo "1. 请立即保存上述密钥到安全的地方(如密码管理器)"
echo "2. 旧数据库密码已泄露,建议立即修改:"
echo ""
echo "   mysql -u $DB_USER -p"
echo "   ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '新密码';"
echo "   FLUSH PRIVILEGES;"
echo ""
echo "3. 重启PM2应用:"
echo "   pm2 restart all"
echo ""
echo "4. 验证环境变量:"
echo "   pm2 env 0"
echo ""
echo "5. 检查应用日志:"
echo "   pm2 logs"
echo ""
