#!/usr/bin/env bash
# =====================================================
# 一键上传本地 SSH 公钥到服务器脚本 (自动读取 deploy.sh 配置)
# =====================================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # 无颜色

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
log_error()   { echo -e "${RED}[✗]${NC} $1"; }

# 1. 查找同级目录下的 deploy.sh 并解析服务器配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SH="$SCRIPT_DIR/deploy.sh"

SERVER_IP=""
USERNAME=""
SSH_PORT=""

if [ -f "$DEPLOY_SH" ]; then
    log_info "检测到部署脚本: deploy.sh，正在自动解析服务器配置..."
    SERVER_IP=$(grep -E "^SERVER_IP=" "$DEPLOY_SH" | cut -d'"' -f2)
    USERNAME=$(grep -E "^USERNAME=" "$DEPLOY_SH" | cut -d'"' -f2)
    SSH_PORT=$(grep -E "^SSH_PORT=" "$DEPLOY_SH" | cut -d'"' -f2)
fi

# 兜底默认值
SERVER_IP=${SERVER_IP:-"27.124.40.42"}
USERNAME=${USERNAME:-"root"}
SSH_PORT=${SSH_PORT:-"22"}

log_info "解析结果: 服务器=${CYAN}$USERNAME@$SERVER_IP${NC}, 端口=${CYAN}$SSH_PORT${NC}"

# 2. 检查本地是否存在 SSH 公钥，若不存在则自动生成
PUB_KEY=""
for key in "id_rsa.pub" "id_ed25519.pub" "id_ecdsa.pub"; do
    if [ -f "$HOME/.ssh/$key" ]; then
        PUB_KEY="$HOME/.ssh/$key"
        break
    fi
done

if [ -z "$PUB_KEY" ]; then
    log_warn "未检测到本地 SSH 公钥。正在自动为您生成 RSA 密钥对..."
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    ssh-keygen -t rsa -b 4096 -N "" -f "$HOME/.ssh/id_rsa"
    if [ $? -eq 0 ]; then
        log_success "SSH 密钥对生成成功！"
        PUB_KEY="$HOME/.ssh/id_rsa.pub"
    else
        log_error "SSH 密钥对生成失败，请手动运行 ssh-keygen 后重试。"
        exit 1
    fi
fi

log_info "将使用本地公钥: ${CYAN}$PUB_KEY${NC}"

# 3. 开始上传
log_info "准备上传公钥至服务器，此时${BOLD}您需要输入一次远程服务器的登录密码${NC}..."

# 优先使用 macOS 自带的 ssh-copy-id 工具，若未安装则采用 cat + ssh 方式兜底
if command -v ssh-copy-id &>/dev/null; then
    ssh-copy-id -p "$SSH_PORT" -i "$PUB_KEY" "$USERNAME@$SERVER_IP"
else
    log_info "本地未找到 ssh-copy-id 命令，正在使用通用管道命令上传..."
    cat "$PUB_KEY" | ssh -p "$SSH_PORT" "$USERNAME@$SERVER_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
fi

if [ $? -eq 0 ]; then
    log_success "SSH 公钥上传并信任成功！"
    echo -e "\n${BOLD}====================================================${NC}"
    echo -e " ${GREEN}现在您可以直接体验免密一键部署或登录了！${NC}"
    echo -e " 1. 免密登录服务器:   ${CYAN}ssh -p $SSH_PORT $USERNAME@$SERVER_IP${NC}"
    echo -e " 2. 免密执行一键部署: ${CYAN}./deploy.sh${NC}"
    echo -e "${BOLD}====================================================${NC}\n"
else
    log_error "上传失败。请确认密码是否正确，以及服务器端口/IP 是否可连通。"
    exit 1
fi
