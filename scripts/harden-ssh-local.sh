#!/usr/bin/env bash
###############################################################################
# SSH 加固脚本 (本地执行)
#
# 运行位置: 本地电脑 (Mac),不要在服务器里运行。
#
# 两种模式:
#   1) 固定端口 (默认 52022,可自定义)   <- 默认
#   2) 随机 5 位端口 (10000-65535)
#
# 三步流程:
#   第 1 步: 用密码从 22 登录,部署本地公钥
#   第 2 步: 开启「只密钥 + 新端口」,22 暂留作退路
#   第 3 步: 验证新端口能进后,关闭 22
###############################################################################

set -euo pipefail

###############################################################################
# 配置区
###############################################################################

SERVER_IP="134.122.128.17"
SERVER_USER="root"
OLD_PORT="22"
DEFAULT_NEW_PORT="52022"

LOCAL_PRIVATE_KEY="$HOME/.ssh/id_ed25519"
LOCAL_PUBLIC_KEY="$HOME/.ssh/id_ed25519.pub"

###############################################################################
# 工具函数
###############################################################################

log() {
  echo
  echo "================================================================"
  echo "$1"
  echo "================================================================"
}

die() {
  echo
  echo "错误: $1" >&2
  exit 1
}

ssh_old() {
  ssh \
    -i "${LOCAL_PRIVATE_KEY}" \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -p "${OLD_PORT}" \
    "${SERVER_USER}@${SERVER_IP}" \
    "$@"
}

ssh_new() {
  ssh \
    -i "${LOCAL_PRIVATE_KEY}" \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -p "${NEW_PORT}" \
    "${SERVER_USER}@${SERVER_IP}" \
    "$@"
}

###############################################################################
# 第 0 步:选择模式
###############################################################################

log "第 0 步:选择新端口模式"

cat <<EOF
目标服务器: ${SERVER_USER}@${SERVER_IP} (当前端口 ${OLD_PORT})

选择新端口模式:
  1) 固定端口 (默认 ${DEFAULT_NEW_PORT},可自定义)   [默认]
  2) 随机 5 位端口 (10000-65535)
EOF

read -r -p "请选择 [1/2] (默认 1): " PORT_MODE
PORT_MODE="${PORT_MODE:-1}"

case "${PORT_MODE}" in
  2)
    PORT_MODE_DESC="随机 5 位端口"
    # bash $RANDOM 是 0-32767,组合两个得到大范围,映射到 10000-65535
    NEW_PORT="$(( (RANDOM * 32768 + RANDOM) % 55536 + 10000 ))"
    ;;
  *)
    PORT_MODE="1"
    PORT_MODE_DESC="固定端口"
    read -r -p "新端口 (默认 ${DEFAULT_NEW_PORT}): " NEW_PORT_INPUT
    NEW_PORT="${NEW_PORT_INPUT:-${DEFAULT_NEW_PORT}}"
    ;;
esac

# 校验端口是数字且在合法范围
case "${NEW_PORT}" in
  ''|*[!0-9]*) die "新端口必须是数字: ${NEW_PORT}" ;;
esac
if [ "${NEW_PORT}" -lt 1024 ] || [ "${NEW_PORT}" -gt 65535 ]; then
  die "新端口必须在 1024-65535 之间: ${NEW_PORT}"
fi
if [ "${NEW_PORT}" = "${OLD_PORT}" ]; then
  die "新端口不能和旧端口相同"
fi

log "本次加固计划 (${PORT_MODE_DESC})"

cat <<EOF
服务器:    ${SERVER_USER}@${SERVER_IP}
旧端口:    ${OLD_PORT}
新端口:    ${NEW_PORT}  (${PORT_MODE_DESC})
本地私钥:  ${LOCAL_PRIVATE_KEY}
本地公钥:  ${LOCAL_PUBLIC_KEY}

流程:
  第 1 步: 用密码从 22 登录,部署本地公钥
  第 2 步: 开启「只密钥 + 新端口」,22 暂留作退路
  第 3 步: 验证新端口后,关闭 22

重要:
  - 全程保持当前服务器 SSH 会话不要关闭。
  - 脚本只上传公钥,绝不上传私钥。
EOF

echo
read -r -p "确认继续请输入 yes: " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "已取消。"
  exit 0
fi

###############################################################################
# 第 1 步:检查本地密钥 + 用密码从 22 部署公钥
###############################################################################

log "第 1 步:检查本地密钥,用密码从 ${OLD_PORT} 部署公钥"

[ -f "${LOCAL_PRIVATE_KEY}" ] || die "找不到本地私钥: ${LOCAL_PRIVATE_KEY}"
[ -f "${LOCAL_PUBLIC_KEY}" ]  || die "找不到本地公钥: ${LOCAL_PUBLIC_KEY}"
chmod 600 "${LOCAL_PRIVATE_KEY}"

echo "本地公钥指纹:"
ssh-keygen -lf "${LOCAL_PUBLIC_KEY}"

PUBLIC_KEY_CONTENT="$(cat "${LOCAL_PUBLIC_KEY}")"

cat <<EOF
现在连接 ${SERVER_USER}@${SERVER_IP}:${OLD_PORT}。
如果服务器还没保存你的公钥,会要求输入一次 root 密码,这是正常的。
公钥会被追加到 /root/.ssh/authorized_keys,私钥不会上传。
EOF

ssh \
  -o StrictHostKeyChecking=accept-new \
  -p "${OLD_PORT}" \
  "${SERVER_USER}@${SERVER_IP}" \
  "mkdir -p /root/.ssh && \
   chmod 700 /root/.ssh && \
   touch /root/.ssh/authorized_keys && \
   chmod 600 /root/.ssh/authorized_keys && \
   grep -qxF '${PUBLIC_KEY_CONTENT}' /root/.ssh/authorized_keys || \
   echo '${PUBLIC_KEY_CONTENT}' >> /root/.ssh/authorized_keys && \
   echo '公钥已确认存在于 /root/.ssh/authorized_keys'"

###############################################################################
# 第 2 步:开启「只密钥 + 新端口」,22 暂留作退路
###############################################################################

log "第 2 步:开启「只密钥 + 新端口 ${NEW_PORT}」,22 暂留作退路"

ssh_old "NEW_PORT='${NEW_PORT}' bash -s" <<'REMOTE_PHASE1'
set -euo pipefail

set_option() {
  # 用法: set_option <key> <value>
  # 已存在(含注释行)则替换,否则追加。直接改 /etc/ssh/sshd_config,不用 Include。
  local key="$1" val="$2"
  if grep -qiE "^[[:space:]]*#?[[:space:]]*${key}[[:space:]]" /etc/ssh/sshd_config; then
    sed -i -E "s|^[[:space:]]*#?[[:space:]]*${key}[[:space:]].*|${key} ${val}|" /etc/ssh/sshd_config
  else
    printf '%s %s\n' "${key}" "${val}" >> /etc/ssh/sshd_config
  fi
}

echo "[2.1] 备份 sshd_config"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.before-hardening.$(date +%F-%H%M%S)

echo "[2.2] 清理可能残留的坏 Include 行 (老版本 sshd 不支持 Include)"
sed -i -E '\|^Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf|d' /etc/ssh/sshd_config || true

echo "[2.3] 处理 SELinux 新端口"
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  if ! command -v semanage >/dev/null 2>&1; then
    yum install -y policycoreutils-python-utils
  fi
  if semanage port -l | grep '^ssh_port_t' | grep -qw "${NEW_PORT}"; then
    echo "  SELinux 已允许 ${NEW_PORT}"
  else
    semanage port -a -t ssh_port_t -p tcp "${NEW_PORT}"
  fi
else
  echo "  SELinux 非 Enforcing,跳过"
fi

echo "[2.4] 写入加固配置 (直接改 sshd_config)"
# 先确保有 Port 22
if ! grep -qiE '^[[:space:]]*Port[[:space:]]+22([[:space:]]|$)' /etc/ssh/sshd_config; then
  echo "Port 22" >> /etc/ssh/sshd_config
fi
# 再追加新端口(避免重复)
if ! grep -qiE "^[[:space:]]*Port[[:space:]]+${NEW_PORT}([[:space:]]|$)" /etc/ssh/sshd_config; then
  echo "Port ${NEW_PORT}" >> /etc/ssh/sshd_config
fi

set_option PasswordAuthentication no
set_option KbdInteractiveAuthentication no
set_option ChallengeResponseAuthentication no
set_option PubkeyAuthentication yes
set_option PermitEmptyPasswords no
set_option PermitRootLogin prohibit-password
set_option MaxAuthTries 3
set_option LoginGraceTime 20
set_option MaxStartups 10:30:60
set_option ClientAliveInterval 300
set_option ClientAliveCountMax 2
set_option X11Forwarding no
set_option AllowAgentForwarding no
set_option AllowTcpForwarding no

echo "[2.5] 检查 sshd 语法"
sshd -t

echo "[2.6] 防火墙放行新端口,暂时保留 22"
firewall-cmd --permanent --add-port=${NEW_PORT}/tcp
firewall-cmd --reload

echo "[2.7] reload sshd (已建连接不受影响)"
systemctl reload sshd

echo "[2.8] 当前 sshd 生效配置"
sshd -T | grep -Ei '^(port|passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication|maxauthtries|maxstartups)'

echo "[2.9] 当前防火墙"
firewall-cmd --list-all | grep -E 'services|ports'

echo "第二阶段完成。22 仍保留作退路。"
REMOTE_PHASE1

###############################################################################
# 第 2.5 步:本地验证新端口
###############################################################################

log "第 2.5 步:本地验证新端口 ${NEW_PORT} 能登录"

ssh \
  -i "${LOCAL_PRIVATE_KEY}" \
  -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  -p "${NEW_PORT}" \
  "${SERVER_USER}@${SERVER_IP}" \
  "echo '密钥登录新端口 ${NEW_PORT} 成功'"

echo "新端口 ${NEW_PORT} 登录成功。"

###############################################################################
# 第 3 步:确认后关闭 22
###############################################################################

log "第 3 步:准备关闭 22"

cat <<EOF
已确认新端口 ${NEW_PORT} 可用。下一步会:
  1. 从 sshd_config 移除 Port 22
  2. 从防火墙移除 22/tcp 和 ssh 服务
  3. reload sshd

之后只能用:
  ssh -i ${LOCAL_PRIVATE_KEY} -p ${NEW_PORT} ${SERVER_USER}@${SERVER_IP}
EOF

echo
read -r -p "确认关闭 22 请输入 CLOSE22: " CLOSE_CONFIRM
if [ "${CLOSE_CONFIRM}" != "CLOSE22" ]; then
  echo "未输入 CLOSE22,已停止。当前: 新端口 ${NEW_PORT} 可用,22 仍保留。"
  echo "以后登录: ssh -i ${LOCAL_PRIVATE_KEY} -p ${NEW_PORT} ${SERVER_USER}@${SERVER_IP}"
  exit 0
fi

log "第 3 步:通过新端口连接服务器,关闭 22"

ssh_new "NEW_PORT='${NEW_PORT}' bash -s" <<'REMOTE_PHASE2'
set -euo pipefail

echo "[3.1] 备份当前 sshd_config"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.remove-port22.$(date +%F-%H%M%S)

echo "[3.2] 从 sshd_config 删除 Port 22 (保留 Port 新端口)"
sed -i -E "/^[[:space:]]*Port[[:space:]]+22([[:space:]]|$)/d" /etc/ssh/sshd_config

echo "[3.3] 检查 sshd 语法"
sshd -t

echo "[3.4] reload sshd"
systemctl reload sshd

echo "[3.5] 从防火墙移除 22 和 ssh 服务"
firewall-cmd --permanent --remove-service=ssh 2>/dev/null || true
firewall-cmd --permanent --remove-port=22/tcp 2>/dev/null || true
firewall-cmd --permanent --add-port=${NEW_PORT}/tcp
firewall-cmd --reload

echo "[3.6] 当前 sshd 生效配置"
sshd -T | grep -Ei '^(port|passwordauthentication|permitrootlogin|pubkeyauthentication)'

echo "[3.7] 当前防火墙"
firewall-cmd --list-all | grep -E 'services|ports'

echo "22 已关闭。"
REMOTE_PHASE2

###############################################################################
# 最终验证
###############################################################################

log "最终验证"

echo "[V1] 验证新端口 ${NEW_PORT} 仍可登录"
ssh \
  -i "${LOCAL_PRIVATE_KEY}" \
  -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  -p "${NEW_PORT}" \
  "${SERVER_USER}@${SERVER_IP}" \
  "echo '最终验证: 新端口登录成功'"

echo
echo "[V2] 验证 22 已无法连接"
set +e
ssh \
  -i "${LOCAL_PRIVATE_KEY}" \
  -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey \
  -o BatchMode=yes \
  -o ConnectTimeout=5 \
  -o StrictHostKeyChecking=accept-new \
  -p "${OLD_PORT}" \
  "${SERVER_USER}@${SERVER_IP}" \
  "echo '警告: 22 仍可连接'" >/tmp/ssh22-check.out 2>&1
SSH22_EXIT=$?
set -e
if [ "${SSH22_EXIT}" -eq 0 ]; then
  echo "警告: 22 仍然可连接,请检查。"
  cat /tmp/ssh22-check.out
else
  echo "正常: 22 端口已无法连接。"
fi
rm -f /tmp/ssh22-check.out

###############################################################################
# 完成
###############################################################################

log "SSH 加固完成"

cat <<EOF
结果:
  服务器:      ${SERVER_USER}@${SERVER_IP}
  新端口:      ${NEW_PORT}  (${PORT_MODE_DESC})
  22 端口:     已关闭
  密码登录:    已禁止
  root 登录:   仅允许密钥

以后登录:
  ssh -i ${LOCAL_PRIVATE_KEY} -p ${NEW_PORT} ${SERVER_USER}@${SERVER_IP}
EOF
