#!/usr/bin/env bash
set -euo pipefail

# ban-login-attackers.sh
# Analyze web access logs for excessive /api/user/login requests and ban offending IPs.
# Intended for Linux servers with nginx/openresty access logs and ipset+iptables.
#
# Examples:
#   sudo bash scripts/ban-login-attackers.sh --dry-run
#   sudo bash scripts/ban-login-attackers.sh --apply
#   sudo bash scripts/ban-login-attackers.sh --apply --log /var/log/nginx/access.log --threshold 2 --window-min 1

LOG_FILE="/var/log/nginx/access.log"
WINDOW_MIN=1
THRESHOLD=2
BAN_HOURS=24
IPSET_NAME="login_cc_blacklist"
APPLY=0
ENDPOINT_REGEX='(/api/user/login|/sdkapi/login/dologin|/sdkapi/user/login)'

usage() {
  cat <<USAGE
Usage: sudo bash $0 [options]

Options:
  --apply                 Actually ban IPs using ipset/iptables. Default is dry-run.
  --dry-run               Only print detected IPs. Default.
  --log PATH              Access log path. Default: ${LOG_FILE}
  --window-min N          Analyze last N minutes. Default: ${WINDOW_MIN}
  --threshold N           Ban if requests > N in window. Default: ${THRESHOLD}
  --ban-hours N           Ban timeout hours. Default: ${BAN_HOURS}
  --ipset NAME            ipset name. Default: ${IPSET_NAME}
  --endpoint-regex REGEX  Endpoint regex. Default: ${ENDPOINT_REGEX}
  -h, --help              Show help.

Notes:
  - Requires nginx/openresty combined access log where first field is client IP.
  - With CDN, make nginx log real client IP as first field, or pass a log containing real IP.
  - Existing bans are refreshed to the configured timeout.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    --log) LOG_FILE="${2:-}"; shift 2 ;;
    --window-min) WINDOW_MIN="${2:-}"; shift 2 ;;
    --threshold) THRESHOLD="${2:-}"; shift 2 ;;
    --ban-hours) BAN_HOURS="${2:-}"; shift 2 ;;
    --ipset) IPSET_NAME="${2:-}"; shift 2 ;;
    --endpoint-regex) ENDPOINT_REGEX="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ ! -f "$LOG_FILE" ]]; then
  echo "[error] log file not found: $LOG_FILE" >&2
  exit 1
fi

if ! [[ "$WINDOW_MIN" =~ ^[0-9]+$ ]] || ! [[ "$THRESHOLD" =~ ^[0-9]+$ ]] || ! [[ "$BAN_HOURS" =~ ^[0-9]+$ ]]; then
  echo "[error] window-min/threshold/ban-hours must be integers" >&2
  exit 1
fi

SINCE_EPOCH=$(date -d "${WINDOW_MIN} minutes ago" +%s 2>/dev/null || python3 - <<PY
import time
print(int(time.time() - ${WINDOW_MIN} * 60))
PY
)
BAN_SECONDS=$((BAN_HOURS * 3600))
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

# Parse nginx combined log lines like:
# 1.2.3.4 - - [03/Jul/2026:17:59:12 +0800] "POST /api/user/login HTTP/1.1" 429 ...
# Count matching endpoint requests within the time window by source IP.
python3 - "$LOG_FILE" "$SINCE_EPOCH" "$ENDPOINT_REGEX" > "$TMP_FILE" <<'PY'
import re, sys, datetime, collections
log_file, since_raw, endpoint_regex = sys.argv[1], int(sys.argv[2]), sys.argv[3]
endpoint = re.compile(endpoint_regex)
line_re = re.compile(r'^(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) [^"]*" (?P<status>\d{3})')
counts = collections.Counter()
last_status = {}
last_ts = {}

def parse_ts(s):
    # 03/Jul/2026:17:59:12 +0800
    return int(datetime.datetime.strptime(s, '%d/%b/%Y:%H:%M:%S %z').timestamp())

with open(log_file, 'r', errors='ignore') as f:
    for line in f:
        m = line_re.match(line)
        if not m:
            continue
        path = m.group('path')
        if not endpoint.search(path):
            continue
        try:
            ts = parse_ts(m.group('ts'))
        except Exception:
            continue
        if ts < since_raw:
            continue
        ip = m.group('ip')
        if ip in ('127.0.0.1', '::1', '-'):
            continue
        counts[ip] += 1
        last_status[ip] = m.group('status')
        last_ts[ip] = m.group('ts')

for ip, count in counts.most_common():
    print(f'{ip}\t{count}\t{last_status.get(ip, "-")}\t{last_ts.get(ip, "-")}')
PY

CANDIDATES=()
while IFS=$'\t' read -r ip count status ts; do
  [[ -z "${ip:-}" ]] && continue
  if (( count > THRESHOLD )); then
    CANDIDATES+=("$ip")
  fi
done < "$TMP_FILE"

echo "[info] log=$LOG_FILE window=${WINDOW_MIN}m threshold=>${THRESHOLD} endpoint=${ENDPOINT_REGEX}"
echo "[info] candidates: ${#CANDIDATES[@]}"
if [[ -s "$TMP_FILE" ]]; then
  printf "%-45s %-8s %-8s %s\n" "IP" "COUNT" "STATUS" "LAST_TIME"
  awk -F '\t' -v t="$THRESHOLD" '$2 > t { printf "%-45s %-8s %-8s %s\n", $1, $2, $3, $4 }' "$TMP_FILE"
fi

if (( ${#CANDIDATES[@]} == 0 )); then
  exit 0
fi

if (( APPLY == 0 )); then
  echo "[dry-run] no IPs banned. Re-run with --apply to ban."
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "[error] --apply requires root" >&2
  exit 1
fi

command -v ipset >/dev/null 2>&1 || { echo "[error] ipset not found. Install ipset first." >&2; exit 1; }
command -v iptables >/dev/null 2>&1 || { echo "[error] iptables not found." >&2; exit 1; }

ipset create "$IPSET_NAME" hash:ip timeout "$BAN_SECONDS" -exist
if ! iptables -C INPUT -m set --match-set "$IPSET_NAME" src -j DROP 2>/dev/null; then
  iptables -I INPUT -m set --match-set "$IPSET_NAME" src -j DROP
fi

for ip in "${CANDIDATES[@]}"; do
  ipset add "$IPSET_NAME" "$ip" timeout "$BAN_SECONDS" -exist
  echo "[ban] $ip for ${BAN_HOURS}h"
done

echo "[done] active banned IPs in set '$IPSET_NAME':"
ipset list "$IPSET_NAME" 2>/dev/null | sed -n '/Members:/,$p'
