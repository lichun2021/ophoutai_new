# 1. 用新配置重启（先建日志目录）
mkdir -p /data/logs
cd /data
pm2 delete all
pm2 start /data/ecosystem.config.js
pm2 save

# 2. 开机自启（关键！服务器重启后进程自动恢复）
pm2 startup
# 执行它输出的那条 sudo 命令，然后：
pm2 save

# 3. 日志轮转（防日志撑满磁盘）
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true