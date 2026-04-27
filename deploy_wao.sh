#!/bin/bash
# =====================================================
# 三套应用一键构建 + 部署脚本 mV88VU3dpFf47uF
# 用法:
#   ./deploy.sh              # 部署全部三个应用
#   ./deploy.sh user         # 只部署 user-center
#   ./deploy.sh agent        # 只部署 agent-admin
#   ./deploy.sh op           # 只部署 op-admin
#   ./deploy.sh user agent   # 部署 user-center 和 agent-admin
# =====================================================

# ============ 服务器配置（按需修改）============
SERVER_IP="103.85.188.218"
USERNAME="root"
SSH_PORT="15069"

# 各应用在服务器上的路径和重启脚本
USER_REMOTE_PATH="/data/user-center"
USER_RESTART_SCRIPT="/data/restart-user.sh"
USER_PM2_NAME="user-center"

AGENT_REMOTE_PATH="/data/agent-admin"
AGENT_RESTART_SCRIPT="/data/restart-agent.sh"
AGENT_PM2_NAME="agent-admin"

OP_REMOTE_PATH="/data/op-admin"
OP_RESTART_SCRIPT="/data/restart-op.sh"
OP_PM2_NAME="op-admin"
# =================================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
log_error()   { echo -e "${RED}[✗]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}${CYAN}>>> $1${NC}"; }

# 记录总耗时
START_TIME=$(date +%s)

# =====================================================
# 解析参数 → 确定要部署哪些应用 mV88VU3dpFf47uF
# =====================================================
DEPLOY_USER=false
DEPLOY_AGENT=false
DEPLOY_OP=false

if [ $# -eq 0 ]; then
  # 无参数 → 部署全部
  DEPLOY_USER=true
  DEPLOY_AGENT=true
  DEPLOY_OP=true
else
  for arg in "$@"; do
    case "$arg" in
      user)   DEPLOY_USER=true ;;
      agent)  DEPLOY_AGENT=true ;;
      op)     DEPLOY_OP=true ;;
      *)
        log_error "未知参数: $arg"
        echo "用法: $0 [user] [agent] [op]"
        echo "  不传参数 = 部署全部三个"
        exit 1
        ;;
    esac
  done
fi

# 打印部署计划
echo ""
echo -e "${BOLD}======================================${NC}"
echo -e "${BOLD}  三套应用一键部署脚本${NC}"
echo -e "${BOLD}======================================${NC}"
echo -e "服务器: ${CYAN}$USERNAME@$SERVER_IP${NC}"
echo -e "计划部署:"
[ "$DEPLOY_USER"  = true ] && echo -e "  ${GREEN}✓${NC} user-center   → $USER_REMOTE_PATH"
[ "$DEPLOY_AGENT" = true ] && echo -e "  ${GREEN}✓${NC} agent-admin   → $AGENT_REMOTE_PATH"
[ "$DEPLOY_OP"    = true ] && echo -e "  ${GREEN}✓${NC} op-admin      → $OP_REMOTE_PATH"
echo ""

# =====================================================
# 核心函数：构建 + 打包 + 上传 + 解压 + 重启
# 参数: $1=应用名(显示用) $2=本地路径 $3=远程路径 $4=PM2名称
# =====================================================
deploy_app() {
  local APP_LABEL="$1"
  local LOCAL_PATH="$2"
  local REMOTE_PATH="$3"
  local PM2_NAME="$4"
  local ZIP_NAME="${PM2_NAME}.zip"

  log_step "部署 ${APP_LABEL}"

  # 检查本地目录
  if [ ! -d "$LOCAL_PATH" ]; then
    log_error "本地目录不存在: $LOCAL_PATH"
    return 1
  fi

  cd "$LOCAL_PATH" || exit 1

  # --- 步骤1: 构建 ---
  log_info "[1/6] 构建 $APP_LABEL..."
  if [ -d ".output" ]; then
    rm -rf .output
    log_info "已清理旧的 .output"
  fi

  npm run build
  if [ $? -ne 0 ]; then
    log_error "$APP_LABEL 构建失败！"
    cd - > /dev/null
    return 1
  fi
  log_success "$APP_LABEL 构建完成"

  # --- 步骤2: 检查构建产物 ---
  if [ ! -d ".output" ]; then
    log_error ".output 目录不存在，构建异常"
    cd - > /dev/null
    return 1
  fi

  # --- 步骤3: 打包 ---
  log_info "[2/6] 打包 .output → $ZIP_NAME..."
  rm -f "$ZIP_NAME"
  cd .output
  zip -r "../$ZIP_NAME" . -q
  if [ $? -ne 0 ]; then
    log_error "打包失败"
    cd - > /dev/null
    return 1
  fi
  cd ..
  local ZIP_SIZE=$(du -sh "$ZIP_NAME" | cut -f1)
  log_success "打包完成 ($ZIP_SIZE)"

  # --- 步骤4: 上传 ---
  log_info "[3/6] 上传 $ZIP_NAME 到服务器..."
  # 先确保远程目录存在
  ssh -p $SSH_PORT $USERNAME@$SERVER_IP "mkdir -p $REMOTE_PATH"
  scp -P $SSH_PORT "$ZIP_NAME" "$USERNAME@$SERVER_IP:$REMOTE_PATH/"
  if [ $? -ne 0 ]; then
    log_error "上传失败"
    cd - > /dev/null
    return 1
  fi
  log_success "上传完成"

  # --- 步骤5: 服务器上解压 ---
  log_info "[4/6] 服务器解压..."
  # unzip：必须把选项放在压缩包名前；-o 与 -q 合并为 -oq；勿在包名后再写 -q（否则会被当成「要解压的文件名」）
  ssh -p $SSH_PORT $USERNAME@$SERVER_IP "
    cd $REMOTE_PATH &&
    find . -type f ! -name '$ZIP_NAME' -delete 2>/dev/null;
    find . -mindepth 1 -type d -empty -delete 2>/dev/null;
    unzip -oq $ZIP_NAME -d . &&
    rm -f $ZIP_NAME
  "
  if [ $? -ne 0 ]; then
    log_error "服务器解压失败"
    cd - > /dev/null
    return 1
  fi
  log_success "解压完成"

  # --- 步骤6: 重启服务 ---
  log_info "[5/6] 重启 PM2 服务 ($PM2_NAME)..."
  ssh -p $SSH_PORT $USERNAME@$SERVER_IP "
    if command -v pm2 &>/dev/null; then
      if pm2 list | grep -q '$PM2_NAME'; then
        pm2 restart $PM2_NAME
      else
        echo '[warn] PM2 进程 $PM2_NAME 不存在，尝试用 ecosystem 启动'
        if [ -f /data/ecosystem.config.js ]; then
          pm2 start /data/ecosystem.config.js --only $PM2_NAME
        fi
      fi
    else
      echo '[warn] pm2 未安装，跳过重启'
    fi
  "
  if [ $? -ne 0 ]; then
    log_warn "重启命令执行异常，请手动检查"
  else
    log_success "服务重启完成"
  fi

  # --- 步骤6: 清理本地 zip ---
  log_info "[6/6] 清理本地 $ZIP_NAME..."
  rm -f "$ZIP_NAME"
  log_success "$APP_LABEL 部署完成！"

  cd - > /dev/null
  return 0
}

# =====================================================
# 获取脚本所在的根目录（monorepo root）
# =====================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =====================================================
# 按顺序部署选中的应用
# =====================================================
FAILED=()

if [ "$DEPLOY_USER" = true ]; then
  deploy_app "user-center" "$SCRIPT_DIR/apps/user-center" "$USER_REMOTE_PATH" "$USER_PM2_NAME"
  [ $? -ne 0 ] && FAILED+=("user-center")
fi

if [ "$DEPLOY_AGENT" = true ]; then
  deploy_app "agent-admin" "$SCRIPT_DIR/apps/agent-admin" "$AGENT_REMOTE_PATH" "$AGENT_PM2_NAME"
  [ $? -ne 0 ] && FAILED+=("agent-admin")
fi

if [ "$DEPLOY_OP" = true ]; then
  deploy_app "op-admin" "$SCRIPT_DIR/apps/op-admin" "$OP_REMOTE_PATH" "$OP_PM2_NAME"
  [ $? -ne 0 ] && FAILED+=("op-admin")
fi

# =====================================================
# 总结
# =====================================================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

echo ""
echo -e "${BOLD}======================================${NC}"
if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  全部部署成功！✓${NC}"
else
  echo -e "${RED}${BOLD}  部分应用部署失败！${NC}"
  for f in "${FAILED[@]}"; do
    echo -e "  ${RED}✗ $f${NC}"
  done
fi
echo -e "  总耗时: ${MINUTES}m ${SECONDS}s"
echo -e "${BOLD}======================================${NC}"
echo ""
