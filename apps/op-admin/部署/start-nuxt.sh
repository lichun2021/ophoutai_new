 BUILD_ID=DONTKILLME
  
  echo "pm2 starting"
  
  pm2 start ecosystem.config.js
  
  echo "pm2 started"
