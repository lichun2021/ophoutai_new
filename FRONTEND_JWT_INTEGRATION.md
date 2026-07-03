# JWT 认证 - 前端对接文档

**版本**: v1.0  
**更新日期**: 2026-07-03  
**适用应用**: user-center, op-admin, agent-admin

---

## 📋 概述

系统已升级为 JWT (JSON Web Token) 认证机制，所有敏感操作需要携带有效的 JWT token。

### 核心改动

- ✅ 登录接口返回 JWT token
- ✅ 所有敏感接口需要 JWT 认证
- ✅ 支持 Authorization header 和 HttpOnly Cookie 双模式

---

## 🔐 认证流程

### 1. 用户登录

**接口**: `POST /api/user/login`

**请求示例**:
```json
{
  "username": "test_user",
  "password": "password123",
  "captcha_token": "slider_xxx",
  "captcha_input": "__SLIDER_PASSED__"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "user": {
      "id": 1,
      "username": "test_user",
      "channel_code": "default"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // 🆕 JWT token
    "rechargeUrl": "...",
    "mallUrl": "...",
    "gameip": "..."
  }
}
```

### 2. 存储 Token

**Web 应用 (浏览器)**:
```javascript
// 方式1: 自动 - HttpOnly Cookie (推荐)
// 服务器已自动设置 HttpOnly Cookie，浏览器会自动携带
// 无需前端额外处理

// 方式2: 手动 - LocalStorage/SessionStorage
localStorage.setItem('quantum_auth_token', response.data.token);
```

**移动端/原生应用**:
```javascript
// 保存到本地安全存储
await SecureStore.setItemAsync('quantum_auth_token', response.data.token);
```

### 3. 携带 Token 发起请求

**Web 应用 (推荐 - 依赖 Cookie)**:
```javascript
// 浏览器自动携带 HttpOnly Cookie，无需额外处理
fetch('/api/client/gift-packages/purchase', {
  method: 'POST',
  credentials: 'include',  // 重要：携带 Cookie
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    package_id: 1,
    character_uuid: 'xxx'
  })
});
```

**移动端/API (使用 Authorization Header)**:
```javascript
const token = await SecureStore.getItemAsync('quantum_auth_token');

fetch('/api/client/gift-packages/purchase', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`  // 携带 token
  },
  body: JSON.stringify({
    package_id: 1,
    character_uuid: 'xxx'
  })
});
```

**Axios 示例**:
```javascript
import axios from 'axios';

// 创建 axios 实例
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // 携带 Cookie
});

// 添加请求拦截器 (可选，用于 Authorization Header)
api.interceptors.request.use(config => {
  const token = localStorage.getItem('quantum_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 发起请求
api.post('/client/gift-packages/purchase', {
  package_id: 1,
  character_uuid: 'xxx'
});
```

---

## 🔒 需要认证的接口

### 购买相关
- `POST /api/client/gift-packages/purchase` - 礼包购买

### 查询接口
- `GET /api/client/purchase-history` - 购买记录
- `GET /api/client/recharge-history` - 充值记录
- `GET /api/client/spend-history` - 平台币消费记录
- `GET /api/client/balance` - 余额查询
- `GET /api/client/getUserCharacters` - 角色列表
- `GET /api/client/user/profile/:id` - 个人信息
- `GET /api/client/user/stats/:id` - 个人统计
- `GET /api/client/user/home-stats` - 首页统计
- `GET /api/client/player-gift-packages` - 礼包记录

### 权益中心
- `GET /api/client/benefits/monthly-card/status` - 月卡状态
- `POST /api/client/benefits/monthly-card/claim` - 领取月卡
- `GET /api/client/benefits/checkin/status` - 签到状态
- `POST /api/client/benefits/checkin` - 执行签到

---

## ⚠️ 重要变更

### 1. 移除客户端参数

以下参数**不再需要**从客户端传递：

❌ **废弃**:
```javascript
// 旧代码 (不安全)
POST /api/client/gift-packages/purchase
{
  "user_id": 123,  // ❌ 不再需要
  "package_id": 1,
  "character_uuid": "xxx"
}
```

✅ **新代码**:
```javascript
// 新代码 (安全)
POST /api/client/gift-packages/purchase
{
  "package_id": 1,      // ✅ 只需要业务参数
  "character_uuid": "xxx"
}
// user_id 从 JWT token 中自动提取
```

### 2. 查询接口参数变更

❌ **废弃**:
```javascript
GET /api/client/purchase-history?user_id=123&page=1
```

✅ **新代码**:
```javascript
GET /api/client/purchase-history?page=1
// user_id 从 JWT token 中自动提取
```

---

## 🚨 错误处理

### 401 Unauthorized (未登录)

**响应示例**:
```json
{
  "statusCode": 401,
  "statusMessage": "未登录或登录已过期，请先登录"
}
```

**前端处理**:
```javascript
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // 清除本地 token
      localStorage.removeItem('quantum_auth_token');
      
      // 跳转到登录页
      window.location.href = '/user/login';
    }
    return Promise.reject(error);
  }
);
```

### Token 过期

Token 默认有效期: **4 小时**

**处理方式**:
1. Token 过期后，接口返回 401
2. 前端清除本地 token
3. 引导用户重新登录

---

## 🔄 向后兼容

### 旧客户端（使用 Cookie）

- ✅ 登录后自动设置 HttpOnly Cookie
- ✅ 后续请求浏览器自动携带 Cookie
- ✅ 无需任何前端改动

### 新客户端（使用 Authorization Header）

- ✅ 登录后保存 `response.data.token`
- ✅ 请求时添加 `Authorization: Bearer <token>`
- ✅ 更适合移动端和 API 调用

---

## 🧪 测试示例

### 1. 登录并保存 Token

```javascript
async function login(username, password) {
  const response = await fetch('/api/user/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  
  if (data.code === 200) {
    // 保存 token
    localStorage.setItem('quantum_auth_token', data.data.token);
    console.log('登录成功，token 已保存');
    return data.data.token;
  } else {
    throw new Error(data.message);
  }
}
```

### 2. 购买礼包

```javascript
async function purchaseGiftPackage(packageId, characterUuid) {
  const token = localStorage.getItem('quantum_auth_token');
  
  const response = await fetch('/api/client/gift-packages/purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      package_id: packageId,
      character_uuid: characterUuid
    })
  });
  
  const data = await response.json();
  
  if (data.code === 200) {
    console.log('购买成功');
    return data;
  } else if (response.status === 401) {
    console.error('未登录或 token 已过期');
    // 跳转登录页
  } else {
    console.error('购买失败:', data.message);
  }
}
```

### 3. 查询余额

```javascript
async function getBalance() {
  const token = localStorage.getItem('quantum_auth_token');
  
  const response = await fetch('/api/client/balance', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  if (data.code === 200) {
    console.log('平台币余额:', data.data.platform_coins);
    return data.data.platform_coins;
  }
}
```

---

## 📝 FAQ

### Q1: 旧客户端是否需要修改？

**A**: 不需要。旧客户端依赖 Cookie 自动携带 token，无需改动。

### Q2: Token 存储在哪里最安全？

**A**: 
- **Web 应用**: 依赖 HttpOnly Cookie (最安全，防 XSS)
- **移动端**: 使用平台安全存储 (iOS Keychain / Android Keystore)

### Q3: 如何刷新 Token？

**A**: 当前版本 Token 过期后需要重新登录。后续版本会增加 Refresh Token 机制。

### Q4: 是否支持多设备登录？

**A**: 支持。每次登录生成新的 Token，多个设备可同时持有有效 Token。

---

## 🔗 相关文档

- [安全审计报告](./SECURITY_AUDIT_FINAL.md)
- [环境变量配置](./.env.example)
- [API 签名规范](./apps/user-center/server/utils/apiSign.ts)

---

**如有疑问，请联系技术支持**
