#!/usr/bin/env bash
# 若报错: /usr/bin/env: 'bash\r': No such file — 说明脚本是 Windows 换行(CRLF)。
# 在 Linux 上请用: dos2unix start-all-pm2.sh
# （unix2dos 是反过来的，会把 LF 转成 CRLF，不要用来修这个。）
#
# 在服务器上同时启动 user-center / agent-admin / op-admin（PM2）
# 默认应用根目录为 /data（与 deploy.sh 解压路径一致），不是仓库里的 apps/
#
# 用法（配置文件放在 /data 时）:
#   cp ecosystem.config.js /data/
#   chmod +x start-all-pm2.sh && sudo cp start-all-pm2.sh /data/
#   /data/start-all-pm2.sh
#
# 本地 monorepo 调试可指定:
#   PM2_APPS_ROOT=/path/to/houtai/apps /path/to/start-all-pm2.sh
#   并: PM2_APPS_ROOT=/path/to/houtai/apps pm2 start ecosystem.config.js

set -euo pipefail

DATA_ROOT="${PM2_APPS_ROOT:-/data}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 优先使用 /data/ecosystem.config.js；若从仓库运行则用脚本同目录的 ecosystem.config.js
if [[ -f "${DATA_ROOT}/ecosystem.config.js" ]]; then
  ECOSYSTEM="${DATA_ROOT}/ecosystem.config.js"
elif [[ -f "${SCRIPT_DIR}/ecosystem.config.js" ]]; then
  ECOSYSTEM="${SCRIPT_DIR}/ecosystem.config.js"
else
  echo "[错误] 找不到 ecosystem.config.js（请放到 ${DATA_ROOT}/ 或与本脚本同目录）"
  exit 1
fi

export PM2_APPS_ROOT="$DATA_ROOT"

# 服务端目录结构：/data/<应用名>/server/index.mjs（与解压/发布布局一致）
for app in user-center agent-admin op-admin; do
  if [[ ! -f "${DATA_ROOT}/${app}/server/index.mjs" ]]; then
    echo "[错误] 缺少构建产物: ${DATA_ROOT}/${app}/server/index.mjs"
    echo "请先部署构建结果到 ${DATA_ROOT}/${app}/ 或设置 PM2_APPS_ROOT"
    exit 1
  fi
done

echo "应用根目录 PM2_APPS_ROOT=${DATA_ROOT}"
echo "配置文件: ${ECOSYSTEM}"
echo "CPU 核数: $(node -e "console.log(require('os').cpus().length)")"
echo ""

if [[ "${1:-}" == "reload" ]]; then
  pm2 reload "$ECOSYSTEM"
else
  pm2 start "$ECOSYSTEM"
fi

echo ""
echo "常用: pm2 list | pm2 logs | pm2 monit"
