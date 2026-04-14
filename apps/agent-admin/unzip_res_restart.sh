#!/bin/bash

# 解压并重启后台服务脚本
# 使用方式: ./unzip_res_restart.sh xx.zip

set -e  # 遇到错误立即退出

# 设置字符编码为UTF-8
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

echo "========================================"
echo "Deploy Backend Service"
echo "========================================"

# 检查参数
if [ -z "$1" ]; then
    echo "ERROR: Missing zip file parameter"
    echo "Usage: ./unzip_res_restart.sh xx.zip"
    exit 1
fi

ZIP_FILE="$1"

# 检查zip文件是否存在
if [ ! -f "$ZIP_FILE" ]; then
    echo "ERROR: File not found: $ZIP_FILE"
    exit 1
fi

echo "ZIP File: $ZIP_FILE"
echo ""

# 步骤1: 清空 /data/nuxt3/ 目录
echo "[Step 1/3] Clean /data/nuxt3/ directory..."
if [ -d "/data/nuxt3" ]; then
    rm -rf /data/nuxt3/*
    echo "OK - Cleaned"
else
    echo "WARNING - Directory not exist, creating /data/nuxt3/"
    mkdir -p /data/nuxt3
fi
echo ""

# 步骤2: 解压zip文件到 /data/nuxt3/
echo "[Step 2/3] Unzip to /data/nuxt3/..."
# 使用 -qq 参数忽略警告信息
unzip -qq -o "$ZIP_FILE" -d /data/nuxt3/ 2>&1 | grep -v "appears to use backslashes" || true
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "OK - Unzipped"
else
    echo "ERROR - Unzip failed"
    exit 1
fi
echo ""

# 显示解压后的文件
echo "Files in /data/nuxt3/:"
ls -lh /data/nuxt3/ | head -10
echo ""

# 步骤3: 运行重启脚本
echo "[Step 3/3] Restart service..."
if [ -f "/data/restart_nuxt.sh" ]; then
    cd /data
    ./restart_nuxt.sh
    echo "OK - Service restarted"
else
    echo "ERROR - Restart script not found: /data/restart_nuxt.sh"
    exit 1
fi
echo ""

echo "========================================"
echo "SUCCESS - Deploy Completed!"
echo "========================================"
echo ""
echo "Deploy Info:"
echo "  - ZIP: $ZIP_FILE"
echo "  - Target: /data/nuxt3/"
echo "  - Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

