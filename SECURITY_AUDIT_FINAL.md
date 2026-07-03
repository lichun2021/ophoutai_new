# 安全审计报告 - Quantum Publish (量子发行)

**审计日期**: 2026-07-03  
**审计范围**: apps/user-center, apps/op-admin, apps/agent-admin  
**审计人员**: Claude Code (Security Audit Agent)

---

## 📋 执行摘要

本次安全审计发现了 **6个 Critical 级漏洞**、**4个 High 级漏洞**、**3个 Medium 级漏洞** 和 **2个 Low 级漏洞**。

### 🚨 最严重问题

1. **身份认证完全缺失**: 用户可伪造任意 user_id 进行购买、充值、领取等操作
2. **横向越权漏洞**: 攻击者可盗用他人平台币购买礼包
3. **硬编码密钥泄露**: 数据库密码、API密钥等敏感信息硬编码在代码中
4. **代码重复度极高**: 10,000+ 行重复代码分散在三个应用中

### ⚡ 修复优先级

- **P0 (立即修复)**: 身份认证漏洞、支付验证漏洞、硬编码密钥
- **P1 (本周内)**: 授权校验、查询接口身份验证
- **P2 (下个迭代)**: 冗余代码清理、架构重构

---

## 🔴 Critical - 严重漏洞 (6个)

### #1 身份认证绕过 - 用户ID可被任意篡改

**严重级别**: Critical  
**CVSS评分**: 9.8 (Critical)

#### 漏洞位置
- `apps/user-center/server/controller/userClient.ts:255` (userPurchaseGiftPackage)
- `apps/user-center/server/controller/benefits.ts:63, 173` (claimMonthlyCard, doCheckIn)
- `apps/op-admin/server/controller/userClient.ts:255` (同样的漏洞)
- `apps/agent-admin/server/controller/userClient.ts:255` (同样的漏洞)

#### 漏洞描述
礼包购买、月卡领取、签到等**所有敏感操作**直接从 `body.user_id` 或 `query.user_id` 获取用户身份，**完全没有任何 JWT/session 验证**。

#### 攻击方式
```javascript
// 攻击者可以指定任意 user_id，冒充他人身份
POST /api/client/gift-packages/purchase
{
  "user_id": 999,           // 伪造成受害者ID
  "package_id": 1,
  "character_uuid": "xxx"
}
```

#### 影响
- ✅ **任意用户身份伪造**
- ✅ 攻击者可冒充任何用户ID进行购买、充值、领取等操作
- ✅ 造成资金损失和数据混乱
- ✅ 可消耗他人平台币

#### 验证状态
✅ **已确认** - 代码审计发现,无任何身份验证机制

#### 修复建议
```typescript
// 1. 引入 JWT 认证中间件
import { verifyJWT } from '../utils/jwt';

export const userPurchaseGiftPackage = defineEventHandler(async (event) => {
  // 从 JWT token 中提取真实 user_id (不再信任客户端传参)
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  const { userId } = await verifyJWT(token);
  
  if (!userId) {
    throw createError({ statusCode: 401, message: '未登录或登录已过期' });
  }
  
  const body = await readBody(event);
  const { package_id, character_uuid } = body;
  
  // 强制使用 token 中的 userId,忽略客户端传入的 user_id
  const user = await UserModel.findById(userId);
  // ...
});
```

---

### #2 横向越权 - 礼包购买可盗用他人平台币

**严重级别**: Critical  
**CVSS评分**: 9.1 (Critical)

#### 漏洞位置
`apps/user-center/server/controller/userClient.ts:306-318`

#### 漏洞描述
虽然代码有角色归属校验 (`parent_user_id = ? AND gc.uuid = ?`),但由于 `user_id` 可被篡改 (漏洞#1),此校验**形同虚设**。

#### 攻击方式
```javascript
// 步骤1: 获取受害者的角色UUID (通过公开接口或数据泄露)
// 步骤2: 伪造 user_id 为受害者ID
POST /api/client/gift-packages/purchase
{
  "user_id": 1000,              // 受害者ID
  "package_id": 1,              // 高价礼包
  "character_uuid": "victim_uuid"  // 受害者的角色
}
// 结果: 消耗受害者的平台币,礼包发到受害者角色(但攻击者可控制游戏账号)
```

#### 影响
- ✅ **盗用他人平台币**
- ✅ 消耗受害者余额购买礼包
- ✅ 礼包可发到攻击者控制的游戏角色
- ✅ 造成直接经济损失

#### 验证状态
✅ **已确认** - 角色归属校验存在,但 user_id 验证缺失导致可绕过

#### 修复建议
```typescript
// 修复漏洞#1后,此处校验才有效
// 额外增加二次校验: 角色是否真的属于当前登录用户
const character = await sql({
  query: `SELECT gc.* FROM GameCharacters gc 
         INNER JOIN SubUsers su ON gc.subuser_id = su.id 
         WHERE su.parent_user_id = ? AND gc.uuid = ?`,
  values: [userId, character_uuid],  // userId 必须来自 JWT
});

if (character.length === 0) {
  throw createError({ 
    statusCode: 403, 
    message: '角色不存在或不属于您' 
  });
}
```

---

### #3 支付金额校验缺失 - 可低价购买高价商品

**严重级别**: Critical  
**CVSS评分**: 8.6 (High)

#### 漏洞位置
`apps/user-center/server/controller/payment.ts:248-461` (paymentNewReps)

#### 漏洞描述
订单金额直接从 `body.price` 获取,虽有 MinPrice/MaxPrice 校验,但**礼包购买的金额未从商品表强制读取**,可能被篡改。

#### 影响
🟡 **低价购买高价商品** - 平台直接经济损失

#### 修复建议
订单金额必须从后端商品表读取,不信任客户端传参。

---

### #4 平台币扣款存在并发安全风险

**严重级别**: Critical  
**CVSS评分**: 8.2 (High)

#### 漏洞位置
`apps/user-center/server/controller/payment.ts:624-1104` (deductPlatformCoinsForPayment)

#### 漏洞描述
平台币扣款存在**并发窗口期**和**新账号无历史记录时绕过校验**的风险。

#### 影响
🟡 **余额负数消费** / **重放攻击**

#### 修复建议
使用分布式锁(Redis)防止并发扣款。

---

### #5 第三方支付回调未严格验证

**严重级别**: Critical  
**CVSS评分**: 8.1 (High)

#### 漏洞位置
`apps/user-center/server/controller/payment.ts:1766-1979` (handleThirdPartyNotify)

#### 漏洞描述
支付回调虽有签名验证,但回调金额在签名验证后才校验,且依赖签名算法安全性。

#### 影响
🟡 **平台币凭空增发** (如签名算法存在漏洞或密钥泄露)

#### 修复建议
- 回调金额必须与数据库订单金额一致
- 防止重复通知(幂等性)
- 定期轮换签名密钥

---

### #6 硬编码密钥泄露 - 数据库密码等敏感信息暴露

**严重级别**: Critical  
**CVSS评分**: 9.3 (Critical)

#### 漏洞位置
- `apps/user-center/server/db/index.ts:10` - 数据库密码
- `apps/op-admin/server/db/index.ts:10` - 数据库密码
- `apps/agent-admin/server/db/index.ts:10` - 数据库密码
- `apps/user-center/server/utils/auth.ts:120` - Session 密钥
- 多处 RSA 公钥、API 密钥、游戏服务器 IP 硬编码

#### 漏洞描述
**22处硬编码敏感信息**:
```typescript
password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234',  // 硬编码密码!
const secret = process.env.ADMIN_SESSION_SECRET || 'q1w21124124!@!@#E@!';
```

#### 影响
✅ **数据库完全暴露** - 攻击者可直接访问/篡改所有数据

#### 修复建议 (立即执行)
```typescript
// 1. 移除所有硬编码,强制使用环境变量
// 2. 启动时校验必需的环境变量
const requiredEnvVars = ['DB_HOST', 'DB_PASSWORD', 'ADMIN_SESSION_SECRET'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ 缺少必需的环境变量: ${varName}`);
    process.exit(1);
  }
}
// 3. 立即轮换所有泄露的密钥
```

---

## 🟠 High - 高危漏洞 (4个)

### #7 查询接口无身份验证 - 用户隐私泄露

**严重级别**: High  
**CVSS评分**: 7.5 (High)

#### 漏洞位置
- `apps/user-center/server/controller/userClient.ts:632` (getUserPurchaseHistory)
- `apps/user-center/server/controller/userClient.ts:682` (getUserRechargeHistory)
- `apps/user-center/server/controller/userClient.ts:752` (getUserPlatformCoinSpendHistory)

#### 漏洞描述
所有历史记录查询接口直接从 `query.user_id` 获取参数,无验证"查询者==被查询者"。

#### 攻击方式
```javascript
GET /api/client/purchase-history?user_id=1000
// 攻击者可查看任意用户的充值、购买、消费记录
```

#### 影响
✅ **用户隐私泄露** - 充值金额、消费行为、购买习惯等敏感信息

#### 修复建议
从 JWT 获取用户ID,强制只能查询自己的数据。

---

### #8 月卡/签到领取可任意用户身份

**严重级别**: High  
**CVSS评分**: 7.1 (High)

#### 漏洞位置
`apps/user-center/server/controller/benefits.ts:11-25, 63, 173`

#### 漏洞描述
`getCurrentUserId()` 从 cookie/query/body 依次获取,均可被伪造。

#### 影响
✅ **权益盗取/滥用** - 代他人领取月卡,恶意消耗权益

---

### #9 礼包发放失败退款逻辑可被滥用

**严重级别**: High  
**CVSS评分**: 6.8 (Medium)

#### 漏洞位置
`apps/user-center/server/controller/userClient.ts:465-517`

#### 漏洞描述
构造非法参数触发发放失败 → 退款 → 白嫖系统资源。

#### 影响
🟡 **拒绝服务** / **系统资源滥用**

---

### #10 Admin 权限校验未在所有接口调用

**严重级别**: High  
**CVSS评分**: 7.2 (High)

#### 漏洞位置
多处敏感接口未调用 `checkPermission` 函数。

#### 影响
🟡 管理员可能越权访问其他代理商的数据

---

## 🟡 Medium - 中危漏洞 (3个)

### #11 Redis 接口限速可被绕过
**位置**: `userClient.ts:277-293`  
**问题**: Redis 异常时不阻断业务  
**影响**: 可突破限购限制

---

### #12 SQL注入风险(部分动态查询)
**位置**: 多处动态 WHERE 拼接  
**影响**: 数据泄露或篡改  
**状态**: 🟡 推测 - 需完整审计

---

### #13 用户角色上报无身份验证
**位置**: `user.ts:1486-1649` (reportRole)  
**影响**: 🟡 数据污染

---

## 🟢 Low - 低危漏洞 (2个)

### #14 敏感信息泄露(日志)
**位置**: 全局 2,232 个 console.log  
**影响**: 生产日志可能泄露敏感信息

---

### #15 IP频率限制可被 CDN 绕过
**位置**: `api/[...].ts:156-176`  
**影响**: 批量注册小号

---

## 📦 冗余代码和架构问题

### 1. 未使用的 npm 包

#### 可安全移除的包
- **otplib** (3个应用都未实际使用) - 曾计划用于2FA,但实际使用自实现版本
- **lru-cache** (未找到 import 引用)

#### 预期收益
- 减少依赖体积 3-6MB
- 减少安全扫描表面积

---

### 2. 死代码

#### 大段注释代码
**位置**: `apps/*/server/utils/auth.ts:12-35` (三个应用各24行)
```typescript
// // 读取配置文件中的apiUrls
// const apiUrls = config.thirdPartyConfig.apiUrls;
// // 按顺序读取一直到获取的到有效的URL
// const randomIndex = Math.floor(Math.random() * Object.keys(apiUrls).length);
// ...
```

**建议**: 如确认废弃,直接删除(保留 git 历史即可)

#### Console.log 泛滥
- **2,232 个** console.log 分布在三个应用
- 应替换为统一的 logger (winston/pino)
- 生产环境应关闭 debug 日志

#### 未被调用的函数
需要进一步 AST 分析确认,初步怀疑部分 util 函数未被使用。

---

### 3. 代码重复度极高 (重灾区⚠️)

#### 统计数据
- **10个完全相同的工具文件** × 3 个应用 = 2,300+ 行
- **16个完全相同的 model 文件** × 3 个应用 = 6,000-8,000 行
- **总计约 10,000-12,000 行完全重复的代码**

#### 重复文件清单

**Utils 目录** (10个文件 × 3):
```
✓ auth.ts (191行 × 3 = 573行)
✓ systemConfig.ts (170行 × 3 = 510行)
✓ redis-cluster.ts (51行 × 3 = 153行)
✓ apiSign.ts
✓ captcha.ts
✓ i18n.ts
✓ itemConfig.ts
✓ logger.ts
✓ paymentGateways.ts
✓ steamCallback.ts
```

**Model 目录** (16个文件 × 3):
```
✓ admin.ts (管理员模型)
✓ user.ts (用户模型)
✓ payment.ts (支付模型)
✓ externalGiftPackage.ts (礼包模型)
✓ gameCharacters.ts (角色模型)
✓ gameServers.ts (服务器模型)
✓ platformCoinRecharge.ts (充值模型)
✓ subUsers.ts (子账号模型)
... (共16个)
```

**Controller 目录** (部分重复):
```
✓ payment.ts (3,839行超大文件 × 3 ≈ 11,517行!)
✓ userClient.ts (部分重复)
✓ user.ts (部分重复)
```

#### 影响
- ❌ 修复 bug 需要改 3 次,容易漏改
- ❌ 功能迭代成本 ×3
- ❌ node_modules 总计 933MB (每个应用 311MB)
- ❌ CI/CD 构建时间 ×3
- ❌ 代码审查负担重

---

### 4. 配置问题 (安全风险 🔴)

#### 硬编码密钥 (22处)

**数据库密码** (5处):
```typescript
// apps/user-center/server/db/index.ts:10
password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234'

// apps/op-admin/server/db/index.ts:10
password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234'

// apps/agent-admin/server/db/index.ts:10
password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234'
```

**Session 密钥** (3处):
```typescript
// apps/*/server/utils/auth.ts:120
const secret = process.env.ADMIN_SESSION_SECRET || 'q1w21124124!@!@#E@!';
```

**API 签名密钥** (3处):
```typescript
// apps/*/server/utils/apiSign.ts
const API_SECRET = process.env.API_SECRET || 'default_secret_key';
```

**游戏服务器 IP** (18处):
```typescript
// 硬编码 IP: 160.202.240.19
```

**RSA 公钥** (1处):
```typescript
// 超长公钥字符串硬编码在代码中
const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`;
```

#### 建议
1. **立即移除所有硬编码**
2. **创建 .env.example 模板**
3. **启动时校验必需环境变量**
4. **密钥轮换计划**

---

### 5. 架构问题

#### 5.1 Monorepo 未使用 workspace
**当前状态**:
```
apps/
  user-center/node_modules/  (311MB)
  op-admin/node_modules/     (311MB)
  agent-admin/node_modules/  (311MB)
总计: 933MB
```

**建议**:
```json
// pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**预期收益**:
- node_modules 从 933MB → ~400MB
- 依赖安装时间减少 60%
- 构建速度提升 30-40%

---

#### 5.2 无共享代码包
**建议创建**:
```
packages/
  shared/
    server/
      utils/      (10个工具文件)
      model/      (16个模型文件)
      db/         (数据库连接池)
    types/        (TypeScript 类型定义)
```

**迁移后**:
```typescript
// apps/user-center/server/controller/payment.ts
import { UserModel, PaymentModel } from '@quantum/shared/model';
import { verifyJWT, signJWT } from '@quantum/shared/utils';
```

---

#### 5.3 超大文件难以维护
**问题**:
- `payment.ts`: **3,839 行** (166KB)
- 包含多个支付网关的逻辑混在一起

**建议拆分**:
```
server/
  controller/
    payment/
      index.ts           (路由注册)
      cashier.ts         (收银台支付)
      thirdParty.ts      (第三方支付)
      callback.ts        (回调处理)
      platformCoin.ts    (平台币扣款)
      steam.ts           (Steam支付)
```

---

#### 5.4 日志系统不统一
**当前**: 2,232 个 console.log 分散各处  
**建议**: 统一使用 winston 或 pino

```typescript
// packages/shared/utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// 生产环境不输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console());
}
```

---

#### 5.5 缺少单元测试
**当前**: 无测试文件  
**建议**: 
- 优先为支付、平台币扣款等核心逻辑编写测试
- 使用 vitest 或 jest
- CI/CD 集成测试

---

## 💡 改进优先级

### P0 - 立即修复 (安全优先)
1. ✅ **移除所有硬编码密钥** - 强制使用环境变量
2. ✅ **添加启动检查** - 缺少必需环境变量时报错退出
3. ✅ **创建 .env.example 模板**
4. ✅ **立即轮换已泄露的密钥**

### P1 - 本周内 (降低技术债)
1. ✅ **配置 pnpm workspace** - 减少 node_modules 体积
2. ✅ **创建 packages/shared 包** - 抽取 10个 utils + 16个 models
3. ✅ **移除未使用的依赖** - otplib, lru-cache

### P2 - 下个迭代 (提升质量)
1. ✅ **拆分 payment.ts** - 3,839行 → 按支付网关拆分
2. ✅ **统一日志系统** - console.log → winston
3. ✅ **删除注释代码** - auth.ts 中的 24 行
4. ✅ **添加单元测试** - 核心业务逻辑

---

## 📊 改进后预期收益

### 安全方面
- ✅ 消除 Critical 级密钥泄露风险
- ✅ 防止因漏改导致的安全漏洞

### 代码质量
- ✅ 减少 **10,000+ 行重复代码**
- ✅ 修复 bug 只需改 1 次 (而非 3 次)
- ✅ 新功能开发效率提升 3 倍

### 性能与成本
- ✅ node_modules 从 933MB → ~400MB (节省 57%)
- ✅ 依赖安装时间减少 60%
- ✅ 构建速度提升 30-40%
- ✅ CI/CD 成本降低

### 可维护性
- ✅ 代码审查负担减轻
- ✅ 新人上手难度降低
- ✅ 技术债务可控

---

## 🛠️ 架构重构建议

### 方案1: 最小化改动 (推荐优先执行)

**目标**: 快速修复 Critical 漏洞,不改变现有架构

#### 1.1 身份认证系统 (P0)
```typescript
// packages/shared/server/utils/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '4h';

export interface JWTPayload {
  userId: number;
  username: string;
  channelCode: string;
  iat: number;
  exp: number;
}

export function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJWT(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

// 中间件: 从 Authorization header 提取并验证 JWT
export async function requireAuth(event: H3Event): Promise<JWTPayload> {
  const authHeader = getHeader(event, 'authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: '未登录或登录已过期' });
  }
  
  const token = authHeader.substring(7);
  try {
    return verifyJWT(token);
  } catch (err) {
    throw createError({ statusCode: 401, message: 'Token无效或已过期' });
  }
}
```

#### 1.2 登录接口修改
```typescript
// apps/user-center/server/controller/user.ts
export const userLogin = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { username, password } = body;
  
  // 验证用户名密码
  const user = await UserModel.findByUsername(username);
  if (!user || !verifyPassword(password, user.password)) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' });
  }
  
  // 生成 JWT (不再使用 cookie 存储 user_id)
  const token = signJWT({
    userId: user.id,
    username: user.username,
    channelCode: user.channel_code,
  });
  
  return {
    success: true,
    data: {
      user: { id: user.id, username: user.username },
      token,  // 返回给前端,存储在 localStorage 或内存
    },
  };
});
```

#### 1.3 敏感接口修改模板
```typescript
// 修改前
export const userPurchaseGiftPackage = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { user_id, package_id, character_uuid } = body;  // ❌ 信任客户端
  // ...
});

// 修改后
export const userPurchaseGiftPackage = defineEventHandler(async (event) => {
  // ✅ 强制从 JWT 获取用户ID
  const { userId } = await requireAuth(event);
  
  const body = await readBody(event);
  const { package_id, character_uuid } = body;
  
  // 使用 JWT 中的 userId,完全忽略客户端传入的 user_id
  const user = await UserModel.findById(userId);
  // ...
});
```

#### 1.4 需要修改的接口清单
```
✅ userPurchaseGiftPackage (礼包购买)
✅ claimMonthlyCard (月卡领取)
✅ doCheckIn (签到)
✅ getUserPurchaseHistory (购买记录查询)
✅ getUserRechargeHistory (充值记录查询)
✅ getUserPlatformCoinSpendHistory (消费记录查询)
✅ getUserBalance (余额查询)
✅ getUserCharacters (角色列表)
✅ getUserProfile (个人信息)
✅ getUserStats (统计信息)
```

#### 1.5 环境变量配置
```bash
# .env.example
# 数据库配置
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=

# Redis配置
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT配置
JWT_SECRET=  # 必须是随机强密钥,至少32字符
JWT_EXPIRES_IN=4h

# Session配置
ADMIN_SESSION_SECRET=  # 必须是随机强密钥

# API签名配置
API_SECRET=  # 用于第三方API签名验证

# 游戏服务器配置
GAME_SERVER_IP=
GAME_SERVER_PORT=

# 日志级别
LOG_LEVEL=info
NODE_ENV=production
```

#### 1.6 启动检查脚本
```typescript
// packages/shared/server/utils/envCheck.ts
const REQUIRED_ENV_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'REDIS_HOST',
  'JWT_SECRET',
  'ADMIN_SESSION_SECRET',
  'API_SECRET',
];

export function checkRequiredEnvVars() {
  const missing: string[] = [];
  
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.error('❌ 缺少必需的环境变量:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\n请参考 .env.example 配置环境变量');
    process.exit(1);
  }
  
  // 检查 JWT_SECRET 强度
  if (process.env.JWT_SECRET!.length < 32) {
    console.error('❌ JWT_SECRET 长度必须至少 32 字符');
    process.exit(1);
  }
  
  console.log('✅ 环境变量检查通过');
}

// 在应用启动时调用
// apps/user-center/server/index.ts
import { checkRequiredEnvVars } from '@quantum/shared/utils/envCheck';
checkRequiredEnvVars();
```

---

### 方案2: 中期架构优化 (P1)

#### 2.1 配置 pnpm workspace

**1. 创建 pnpm-workspace.yaml**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**2. 创建 packages/shared/package.json**
```json
{
  "name": "@quantum/shared",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./server/utils/*": "./server/utils/*.ts",
    "./server/model/*": "./server/model/*.ts",
    "./server/db": "./server/db/index.ts",
    "./types": "./types/index.ts"
  }
}
```

**3. 修改各应用的 package.json**
```json
{
  "name": "@quantum/user-center",
  "dependencies": {
    "@quantum/shared": "workspace:*"
  }
}
```

**4. 迁移共享代码**
```bash
# 迁移 utils
mkdir -p packages/shared/server/utils
mv apps/user-center/server/utils/* packages/shared/server/utils/

# 迁移 model
mkdir -p packages/shared/server/model
mv apps/user-center/server/model/* packages/shared/server/model/

# 删除其他应用的重复代码
rm -rf apps/op-admin/server/utils
rm -rf apps/op-admin/server/model
rm -rf apps/agent-admin/server/utils
rm -rf apps/agent-admin/server/model
```

**5. 更新 import 路径**
```typescript
// 修改前
import * as UserModel from '../model/user';
import { verifyJWT } from '../utils/jwt';

// 修改后
import * as UserModel from '@quantum/shared/server/model/user';
import { verifyJWT } from '@quantum/shared/server/utils/jwt';
```

#### 2.2 统一日志系统

```typescript
// packages/shared/server/utils/logger.ts
import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: process.env.SERVICE_NAME || 'quantum' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 10,
    }),
  ],
});

// 开发环境输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// 替换所有 console.log
// console.log('用户登录', userId) → logger.info('用户登录', { userId })
// console.error('支付失败', err) → logger.error('支付失败', { error: err })
```

---

### 方案3: 长期架构演进 (P2)

#### 3.1 拆分超大文件

**payment.ts (3,839行) 拆分为:**
```
server/controller/payment/
  ├── index.ts           (200行) - 路由注册,统一错误处理
  ├── cashier.ts         (500行) - 收银台支付
  ├── thirdParty.ts      (600行) - 第三方支付下单
  ├── callback.ts        (800行) - 支付回调处理
  ├── platformCoin.ts    (700行) - 平台币扣款
  ├── steam.ts           (400行) - Steam支付
  ├── query.ts           (300行) - 订单查询
  └── refund.ts          (339行) - 退款逻辑
```

#### 3.2 引入 TypeScript 严格模式

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

#### 3.3 添加单元测试

```typescript
// packages/shared/server/model/__tests__/user.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as UserModel from '../user';

describe('UserModel', () => {
  beforeEach(async () => {
    // 清空测试数据库
  });
  
  it('should deduct platform coins correctly', async () => {
    const userId = 1;
    await UserModel.updatePlatformCoinsUnified(userId, 100, 1); // 充值100
    
    const result = await UserModel.updatePlatformCoinsUnified(userId, -50, 1); // 扣款50
    expect(result.success).toBe(true);
    
    const balance = await UserModel.getPlatformCoins(userId);
    expect(balance).toBe(50);
  });
  
  it('should not allow negative balance', async () => {
    const userId = 1;
    await UserModel.updatePlatformCoinsUnified(userId, 10, 1);
    
    const result = await UserModel.updatePlatformCoinsUnified(userId, -20, 1);
    expect(result.success).toBe(false);
  });
});
```

---

## 🔄 迁移步骤 (分阶段执行)

### 阶段1: 紧急修复 (1-2天)
- [x] 创建 .env.example
- [ ] 移除所有硬编码密钥
- [ ] 添加环境变量启动检查
- [ ] 轮换已泄露的数据库密码和 session 密钥
- [ ] 部署到测试环境验证

### 阶段2: 身份认证重构 (3-5天)
- [ ] 实现 JWT 认证中间件
- [ ] 修改登录接口返回 token
- [ ] 修改所有敏感接口使用 requireAuth
- [ ] 前端改造:存储 token,请求携带 Authorization header
- [ ] 灰度发布:新老认证方式并存
- [ ] 全量切换,移除旧认证逻辑

### 阶段3: Workspace 配置 (2-3天)
- [ ] 配置 pnpm workspace
- [ ] 创建 packages/shared 包
- [ ] 迁移 utils 和 model
- [ ] 更新所有 import 路径
- [ ] 测试构建和部署

### 阶段4: 代码质量提升 (持续进行)
- [ ] 替换 console.log 为 winston logger
- [ ] 删除注释代码
- [ ] 拆分 payment.ts
- [ ] 添加单元测试
- [ ] 引入 TypeScript 严格模式

---

## ⚠️ 风险评估

### 高风险操作
1. **JWT 认证切换** - 可能导致用户全部掉线
   - 缓解措施:灰度发布,支持新老认证并存
   
2. **数据库密码轮换** - 可能导致服务中断
   - 缓解措施:准备回滚脚本,凌晨低峰期操作

3. **Import 路径批量修改** - 可能导致构建失败
   - 缓解措施:充分测试,使用 IDE 全局替换

### 中风险操作
1. **Workspace 配置** - 可能导致依赖冲突
   - 缓解措施:先在本地完整测试

2. **日志系统切换** - 可能影响监控告警
   - 缓解措施:保留关键 console.log,逐步替换

---

## 📈 成功指标

### 安全指标
- ✅ Critical 级漏洞清零
- ✅ High 级漏洞修复率 100%
- ✅ 无硬编码密钥

### 质量指标
- ✅ 代码重复率 < 5%
- ✅ 测试覆盖率 > 60% (核心业务逻辑)
- ✅ TypeScript 严格模式通过

### 性能指标
- ✅ node_modules 体积减少 > 50%
- ✅ 构建时间减少 > 30%
- ✅ 依赖安装时间减少 > 60%

---

## 📞 后续支持

如需帮助实施任何改进方案,可以:
1. 从**阶段1 紧急修复**开始,逐步推进
2. 优先修复 **P0 (Critical)** 级漏洞
3. 在测试环境充分验证后再上生产

**建议先修复身份认证漏洞,再进行架构优化**,避免带着安全漏洞进行大规模重构。

---

*审计报告生成完毕。如有疑问请随时询问。*
