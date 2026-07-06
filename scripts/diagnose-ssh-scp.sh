#!/usr/bin/env bash
set -euo pipefail

# diagnose-ssh-scp.sh
# Run ON THE SERVER to diagnose why scp/ssh connections are closed.
# Usage:
#   sudo bash diagnose-ssh-scp.sh [client_ip]
# Example:
#   sudo bash diagnose-ssh-scp.sh 1.2.3.4

CLIENT_IP="${1:-}"
SSHD_CONFIG="/etc/ssh/sshd_config"
NOW="$(date '+%F %T %z')"

echo "============================================================"
echo " SSH/SCP Diagnose"
echo " Time: $NOW"
echo " Host: $(hostname -f 2>/dev/null || hostname)"
echo " User: $(id)"
echo " Client IP filter: ${CLIENT_IP:-<none>}"
echo "============================================================"
echo

run() {
  echo "---- $* ----"
  bash -lc "$*" 2>&1 || true
  echo
}

section() {
  echo
  echo "============================================================"
  echo " $1"
  echo "============================================================"
}

section "1) Basic system state"
run "uptime"
run "free -h"
run "df -h"
run "df -i"
run "ulimit -n; cat /proc/sys/fs/file-nr 2>/dev/null"
run "ss -tn state established '( sport = :22 )' | wc -l; ss -tn state syn-recv '( sport = :22 )' | wc -l"
run "ss -ltnp | grep -E ':(22|2222)\\s' || ss -ltnp | grep ssh"

section "2) sshd service status"
if command -v systemctl >/dev/null 2>&1; then
  run "systemctl status sshd --no-pager -l || systemctl status ssh --no-pager -l"
  run "journalctl -u sshd -n 120 --no-pager || journalctl -u ssh -n 120 --no-pager"
else
  run "service sshd status || service ssh status"
fi

section "3) sshd config effective values"
run "sshd -T 2>/dev/null | egrep '^(port|listenaddress|passwordauthentication|pubkeyauthentication|permitrootlogin|maxsessions|maxstartups|clientaliveinterval|clientalivecountmax|loglevel|allowusers|denyusers|allowgroups|denygroups|usepam|subsystem)'"
run "grep -nE '^[[:space:]]*(Port|ListenAddress|PasswordAuthentication|PubkeyAuthentication|PermitRootLogin|MaxSessions|MaxStartups|ClientAliveInterval|ClientAliveCountMax|AllowUsers|DenyUsers|AllowGroups|DenyGroups|UsePAM|Subsystem|Match)\\b' $SSHD_CONFIG /etc/ssh/sshd_config.d/*.conf 2>/dev/null"
run "sshd -t && echo 'sshd_config syntax OK'"

section "4) Recent auth/security logs"
AUTH_LOG=""
for f in /var/log/auth.log /var/log/secure /var/log/messages; do
  [[ -f "$f" ]] && AUTH_LOG="$f" && break
done
if [[ -n "$AUTH_LOG" ]]; then
  echo "Using auth log: $AUTH_LOG"
  if [[ -n "$CLIENT_IP" ]]; then
    run "grep -a '$CLIENT_IP' '$AUTH_LOG' | tail -120"
  fi
  run "grep -aE 'sshd|scp|sftp|Connection closed|Disconnected|Accepted|Failed|Invalid|MaxStartups|Too many|refused|PAM|fatal|error' '$AUTH_LOG' | tail -180"
else
  echo "No /var/log/auth.log or /var/log/secure found; relying on journalctl above."
fi

section "5) fail2ban / deny hosts / hosts.allow deny"
if command -v fail2ban-client >/dev/null 2>&1; then
  run "fail2ban-client status"
  run "for j in $(fail2ban-client status 2>/dev/null | awk -F: '/Jail list/{gsub(/,/,\" \",$2); print $2}'); do echo ==== jail:$j ====; fail2ban-client status $j; done"
  if [[ -n "$CLIENT_IP" ]]; then
    run "for j in $(fail2ban-client status 2>/dev/null | awk -F: '/Jail list/{gsub(/,/,\" \",$2); print $2}'); do echo ==== check:$j ====; fail2ban-client get $j banip --with-time | grep '$CLIENT_IP' || true; done"
  fi
else
  echo "fail2ban-client not installed"
fi
run "test -f /etc/hosts.deny && cat /etc/hosts.deny || true"
run "test -f /etc/hosts.allow && cat /etc/hosts.allow || true"

section "6) Firewall rules"
if command -v firewall-cmd >/dev/null 2>&1; then
  run "firewall-cmd --state"
  run "firewall-cmd --list-all"
  run "firewall-cmd --direct --get-all-rules"
fi
if command -v iptables >/dev/null 2>&1; then
  run "iptables -S INPUT"
  run "iptables -L INPUT -n -v --line-numbers | sed -n '1,120p'"
fi
if command -v nft >/dev/null 2>&1; then
  run "nft list ruleset | sed -n '1,220p'"
fi
if command -v ipset >/dev/null 2>&1; then
  run "ipset list -name"
  if [[ -n "$CLIENT_IP" ]]; then
    run "for s in $(ipset list -name 2>/dev/null); do echo ==== ipset:$s ====; ipset test $s '$CLIENT_IP' 2>&1 || true; done"
  fi
fi

section "7) Process / connection pressure"
run "ps -ef | grep '[s]shd'"
run "ps -eo pid,ppid,user,stat,etime,cmd | grep -E '[s]shd|[s]ftp|[s]cp' | head -200"
run "ss -antp | grep ':22' | head -200"
run "cat /proc/sys/net/ipv4/tcp_max_syn_backlog 2>/dev/null; cat /proc/sys/net/core/somaxconn 2>/dev/null"

section "8) Disk permissions for upload target guesses"
for d in /data /data/user-center /data/op-admin /data/agent-admin /tmp; do
  if [[ -e "$d" ]]; then
    run "ls -ld '$d'; df -h '$d'; df -i '$d'"
  fi
done

section "9) Network routes and CDN/security provider hints"
if [[ -n "$CLIENT_IP" ]]; then
  run "ip route get '$CLIENT_IP'"
fi
run "last -ai | head -40"
run "lastb -ai 2>/dev/null | head -40"

section "10) Suggested quick checks"
cat <<'TIPS'
Look for these common causes:

1. MaxStartups triggered:
   - auth log contains: "beginning MaxStartups throttling" or "drop connection"
   - Fix by increasing MaxStartups in /etc/ssh/sshd_config, e.g. MaxStartups 50:30:100, then systemctl reload sshd.

2. fail2ban / ipset / iptables banned your deploy machine IP:
   - Unban with: fail2ban-client set sshd unbanip YOUR_IP
   - Or: ipset del SET_NAME YOUR_IP

3. Disk full or inode full:
   - scp may connect then close during upload.

4. sshd Subsystem sftp missing or wrong:
   - scp on modern clients may use SFTP mode by default.
   - Ensure sshd -T shows a valid subsystem sftp.

5. CDN / security group / cloud firewall:
   - If server logs show nothing at the time of failure, packet may be dropped before sshd.

6. Too many sshd processes / file descriptors:
   - Check process and file limits.
TIPS

echo
if [[ -n "$CLIENT_IP" ]]; then
  echo "If you confirm $CLIENT_IP is safe, example unban commands:"
  echo "  fail2ban-client set sshd unbanip $CLIENT_IP"
  echo "  for s in \$(ipset list -name); do ipset del \$s $CLIENT_IP 2>/dev/null || true; done"
fi

echo "============================================================"
echo " Diagnose complete"
echo "============================================================"
