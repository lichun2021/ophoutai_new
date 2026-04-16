#!/usr/bin/env bash
# 重启三个 Nuxt 应用（PM2 进程名与 ecosystem.config.js 一致）
# 放到服务器: cp restart-all-pm2.sh /data/ && chmod +x /data/restart-all-pm2.sh
# 使用: /data/restart-all-pm2.sh
#
# 集群想尽量无感重载可改用（需已有 /data/ecosystem.config.js）:
#   pm2 reload /data/ecosystem.config.js
#
# 若脚本报 bash\r：在服务器执行 dos2unix restart-all-pm2.sh

set -euo pipefail

if ! command -v pm2 &>/dev/null; then
  echo "[错误] 未找到 pm2 命令"
  exit 1
fi

echo "[PM2] 重启 user-center, agent-admin, op-admin ..."
pm2 restart user-center agent-admin op-admin
pm2 save 2>/dev/null || true
echo "[PM2] 完成。查看状态: pm2 list"
