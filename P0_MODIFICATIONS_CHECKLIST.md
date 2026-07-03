# P0 修复完成 - 文件修改清单

**完成日期**: 2026-07-03  
**修复级别**: P0 (Critical - 立即修复)  
**修复内容**: 移除硬编码密钥 + JWT 认证 + 环境变量检查

---

## ✅ 第1步: 环境变量配置

### 新增文件
1. ✅ `.env.example` - 环境变量模板
   - 包含所有必需的配置项
   - 详细的注释说明
   - 密钥生成方法示例

2. ✅ `packages/shared/package.json` - 共享包配置
3. ✅ `packages/shared/server/utils/jwt.ts` - JWT 认证中间件
4. ✅ `packages/shared/server/utils/envCheck.ts` - 环境变量检查工具
5. ✅ `pnpm-workspace.yaml` - Monorepo workspace 配置

---

## ✅ 第2步: JWT 认证改造

### 修改文件 (登录接口)
1. ✅ `apps/user-center/server/controller/user.ts`
   - **修改**: userLogin 函数 (line 691-860)
   - **新增**: 生成 JWT token
   - **新增**: 设置 HttpOnly Cookie
   - **新增**: 响应返回 token

2. ✅ `apps/user-center/package.json`
   - **新增**: `@quantum/shared: workspace:*`
   - **新增**: `jsonwebtoken: ^9.0.2`
   - **新增**: `@types/jsonwebtoken: ^9.0.5`

### 修改文件 (敏感接口 - 13个)
3. ✅ `apps/user-center/server/controller/userClient.ts`
   - **新增**: import `requireAuth` from `@quantum/shared`
   - **修改接口** (9个):
     - userPurchaseGiftPackage (line 252)
     - getUserPurchaseHistory (line 635)
     - getUserRechargeHistory (line 682)
     - getUserPlatformCoinSpendHistory (line 749)
     - getUserHomeStats (line 860)
     - getUserBalance (line 987)
     - getUserCharacters (line 1028)
     - getUserStats (line 924)
     - getPlayerGiftPackageRecords (line 1075)
   - **移除**: 所有 `body.user_id` / `query.user_id` 参数
   - **新增**: JWT 认证调用

4. ✅ `apps/user-center/server/controller/benefits.ts`
   - **新增**: import `requireAuth` from `@quantum/shared`
   - **修改接口** (4个):
     - getMonthlyCardStatus (line 44)
     - claimMonthlyCard (line 61)
     - getCheckInStatus (line 154)
     - doCheckIn (line 171)
   - **移除**: `getCurrentUserId()` 函数
   - **新增**: JWT 认证调用

---

## ✅ 第3步: 移除硬编码密钥

### 数据库配置 (3个应用)
5. ✅ `apps/user-center/server/db/index.ts`
   - **移除**: `password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234'`
   - **改为**: `password: process.env.DB_PASSWORD!`
   - **移除**: 其他默认值 (host, port, user, database)

6. ✅ `apps/op-admin/server/db/index.ts`
   - 同上

7. ✅ `apps/agent-admin/server/db/index.ts`
   - 同上

### Redis 配置 (3个应用)
8. ✅ `apps/user-center/server/utils/redis-cluster.ts`
   - **移除**: `host: process.env.REDIS_HOST || '127.0.0.1'`
   - **改为**: `host: process.env.REDIS_HOST!`
   - **移除**: `port: Number(process.env.REDIS_PORT || 6379)`
   - **改为**: `port: Number(process.env.REDIS_PORT!)`

9. ✅ `apps/op-admin/server/utils/redis-cluster.ts`
   - 同上

10. ✅ `apps/agent-admin/server/utils/redis-cluster.ts`
    - 同上

### 认证密钥 (3个应用)
11. ✅ `apps/user-center/server/utils/auth.ts`
    - **移除**: `process.env.ADMIN_SESSION_SECRET || 'q1w21124124!@!@#E@!'`
    - **改为**: `process.env.ADMIN_SESSION_SECRET!`
    - **新增**: 缺少时抛出异常

12. ✅ `apps/op-admin/server/utils/auth.ts`
    - 同上

13. ✅ `apps/agent-admin/server/utils/auth.ts`
    - 同上

### API 签名密钥 (3个应用)
14. ✅ `apps/user-center/server/utils/apiSign.ts`
    - **移除**: `process.env.API_SIGN_KEY || 'fasdjhkfh2348!@#$!617'`
    - **改为**: `process.env.API_SIGN_KEY!`
    - **新增**: 缺少时抛出异常

15. ✅ `apps/op-admin/server/utils/apiSign.ts`
    - 同上

16. ✅ `apps/agent-admin/server/utils/apiSign.ts`
    - 同上

---

## ✅ 第4步: 启动时环境变量检查

### 启动插件 (3个应用)
17. ✅ `apps/user-center/server/plugins/envCheck.ts` - **新增**
18. ✅ `apps/op-admin/server/plugins/envCheck.ts` - **新增**
19. ✅ `apps/agent-admin/server/plugins/envCheck.ts` - **新增**

**功能**:
- 服务器启动时自动调用 `checkRequiredEnvVars()`
- 缺少必需环境变量时退出并提示
- 检查密钥强度 (至少32字符)

---

## 📄 新增文档

20. ✅ `FRONTEND_JWT_INTEGRATION.md` - 前端对接文档
    - JWT 认证流程
    - Token 存储方式
    - API 调用示例
    - 错误处理
    - 测试代码

21. ✅ `P0_STEP2_COMPLETED.md` - 第2步完成报告
22. ✅ `P0_STEP3_COMPLETED.md` - 本文档

---

## 📊 统计

### 修改文件总计: **22个**
- **新增文件**: 9个
- **修改文件**: 13个

### 分类统计
- **数据库配置**: 3个 (移除硬编码密码)
- **Redis配置**: 3个 (移除硬编码 host/port)
- **认证密钥**: 3个 (移除硬编码 session secret)
- **API密钥**: 3个 (移除硬编码签名密钥)
- **JWT认证**: 3个 (登录 + userClient + benefits)
- **启动检查**: 3个 (envCheck 插件)
- **共享包**: 5个 (workspace + JWT + envCheck)

---

## 🔒 安全改进

### Before (Critical 漏洞)
```typescript
// ❌ 硬编码数据库密码
password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234'

// ❌ 信任客户端 user_id
const { user_id } = body;
```

### After (安全)
```typescript
// ✅ 强制使用环境变量
password: process.env.DB_PASSWORD!

// ✅ 从 JWT 获取真实 userId
const { userId } = await requireAuth(event);
```

---

## 🚀 部署要求

### 1. 环境变量配置 (必须)

复制 `.env.example` 为 `.env` 并填写:

```bash
# 数据库
DB_HOST=your_db_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_strong_password  # 必须修改
DB_NAME=quantum_db

# Redis
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT (生成随机强密钥)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 管理员 Session
ADMIN_SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# API 签名
API_SIGN_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 2. 依赖安装

```bash
# 安装依赖 (使用 pnpm workspace)
pnpm install

# 或分别安装
cd apps/user-center && pnpm install
cd apps/op-admin && pnpm install
cd apps/agent-admin && pnpm install
```

### 3. 启动验证

```bash
# 启动时会自动检查环境变量
pnpm dev

# 看到以下输出表示成功:
# 🔍 检查环境变量配置...
# ✅ 环境变量检查通过，服务器启动中...
```

---

## ⚠️ 重要提醒

1. **立即轮换密钥**: 旧的硬编码密钥已泄露,必须轮换
2. **环境变量权限**: `.env` 文件权限设置为 600
3. **Git 忽略**: 确保 `.env` 在 `.gitignore` 中
4. **生产部署**: 使用 PM2 ecosystem.config.js 配置环境变量
5. **前端对接**: 参考 `FRONTEND_JWT_INTEGRATION.md`

---

## 📞 后续支持

- **前端对接**: 查看 `FRONTEND_JWT_INTEGRATION.md`
- **安全审计**: 查看 `SECURITY_AUDIT_FINAL.md`
- **环境变量**: 查看 `.env.example`

---

**P0 修复完成！🎉**
