#!/bin/bash

# 自动化部署脚本
# 服务器信息 
SERVER_IP="27.124.6.93"
USERNAME="root"
SSH_PORT="22"  # SSH端口配置
REMOTE_PATH="/data/nuxt3"
RESTART_SCRIPT="/data/restart-nuxt.sh"
LOCAL_ZIP="houtai.zip"

echo "=== 开始自动化部署 ==="
echo "服务器: $USERNAME@$SERVER_IP"
echo "远程路径: $REMOTE_PATH"
echo ""

# 1. 检查.output目录是否存在
if [ ! -d "./.output" ]; then
    echo "错误: ./.output 目录不存在，请先构建项目"
    exit 1
fi

echo "步骤1: 删除旧的压缩包..."
if [ -f "$LOCAL_ZIP" ]; then
    rm -f "$LOCAL_ZIP"
    echo "已删除旧的 $LOCAL_ZIP"
fi

echo "步骤2: 打包 ./.output 目录..."
cd .output
zip -r "../$LOCAL_ZIP" .
if [ $? -ne 0 ]; then
    echo "错误: 打包失败"
    exit 1
fi
cd ..
echo "打包完成: $LOCAL_ZIP"

echo "步骤3: 删除服务器上的旧文件..."
ssh -p $SSH_PORT $USERNAME@$SERVER_IP "rm -f $REMOTE_PATH/*.zip"
if [ $? -ne 0 ]; then
    echo "错误: 删除服务器上的houtai.zip失败"
    exit 1
fi
echo "服务器上的houtai.zip已删除"

echo "步骤4: 上传新的压缩包到服务器..."
scp -P $SSH_PORT "$LOCAL_ZIP" "$USERNAME@$SERVER_IP:$REMOTE_PATH/"
if [ $? -ne 0 ]; then
    echo "错误: 文件上传失败"
    exit 1
fi
echo "文件上传完成"

echo "步骤5: 删除服务器上除了houtai.zip之外的其他文件..."
ssh -p $SSH_PORT $USERNAME@$SERVER_IP "cd $REMOTE_PATH && find . -type f ! -name 'houtai.zip' -delete && find . -type d -empty -delete"
if [ $? -ne 0 ]; then
    echo "错误: 删除服务器上其他文件失败"
    exit 1
fi
echo "服务器上其他文件已删除"

echo "步骤6: 在服务器上解压文件..."
ssh -p $SSH_PORT $USERNAME@$SERVER_IP "cd $REMOTE_PATH && unzip -o houtai.zip && rm -f houtai.zip"
if [ $? -ne 0 ]; then
    echo "错误: 文件解压失败"
    exit 1
fi
echo "文件解压完成"

sleep 3

echo "步骤7: 重启Nuxt服务..."
ssh -p $SSH_PORT $USERNAME@$SERVER_IP "bash $RESTART_SCRIPT"
if [ $? -ne 0 ]; then
    echo "错误: 服务重启失败"
    exit 1
fi
echo "服务重启完成"

echo "步骤8: 清理本地压缩包..."
rm -f "$LOCAL_ZIP"
echo "本地压缩包已清理"

echo "=== 部署完成！ ==="
echo "服务器地址: http://$SERVER_IP" 