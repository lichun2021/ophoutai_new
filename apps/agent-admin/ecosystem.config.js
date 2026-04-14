module.exports = {
  apps: [
    {
      name: 'ophoutai',
      port: '3000',
      exec_mode: 'cluster',
      instances: 'max',
      script: './nuxt3/server/index.mjs',
      args: "", // 传递给脚本的参数
      watch: true, // 开启监听文件变动重启
      ignore_watch: ["node_modules", "public", "logs"], // 不用监听的文件
      autorestart: true, // 默认为 true, 发生异常的情况下自动重启
      max_memory_restart: "1G",
      // error_file: './logs/app-err.log', // 错误日志文件
      // out_file: './logs/app-out.log', // 正常日志文件
      merge_logs: true, // 设置追加日志而不是新建日志
      log_date_format: "YYYY-MM-DD HH:mm:ss", // 指定日志文件的时间格式
      min_uptime: "60s", // 应用运行少于时间被认为是异常启动
      max_restarts: 30, // 最大异常重启次数
      restart_delay: 60, // 异常重启情况下，延时重启时间
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // 配置您的域名，请将 YOUR_DOMAIN.com 替换为您的实际域名
        BASE_URL: 'https://hzw.ht.shcdzz.xyz',
        // 或者如果使用HTTP，则改为：
        // BASE_URL: 'http://YOUR_DOMAIN.com',
        API_BASE_URL: 'https://hzw.ht.shcdzz.xyz'
      }
    }
  ]
}
