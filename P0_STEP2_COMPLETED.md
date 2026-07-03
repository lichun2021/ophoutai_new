# 第2步完成 - 登录接口和敏感接口 JWT 改造

## ✅ 已完成的修改

### 1. 配置文件
- ✅ 创建 `pnpm-workspace.yaml` - 配置 monorepo workspace
- ✅ 修改 `apps/user-center/package.json` - 添加依赖：
  - `@quantum/shared: workspace:*`
  - `jsonwebtoken: ^9.0.2`
  - `@types/jsonwebtoken: ^9.0.5`

### 2. 登录接口 (apps/user-center/server/controller/user.ts)
- ✅ 添加 import: `signJWT`, `setAuthCookie`
- ✅ 登录成功后生成 JWT token
- ✅ 通过 `setAuthCookie()` 设置 HttpOnly Cookie
- ✅ 响应中返回 token (供移动端/API使用)

**修改位置**: line 838-856
```typescript
// 生成 JWT token
const jwtToken = signJWT({
    userId: userData.id!,
    username: userData.username || '',
    channelCode: userData.channel_code || ''
});

// 设置 HttpOnly Cookie
setAuthCookie(evt, jwtToken);

// 响应中返回 token
data: {
    user: userInfo,
    token: jwtToken,  // 🆕
    // ...
}
```

### 3. 敏感接口改造 (apps/user-center/server/controller/userClient.ts)

已修改 **9个敏感接口**，全部使用 `requireAuth()` 从 JWT 获取真实用户ID：

#### ✅ 购买相关
1. **userPurchaseGiftPackage** (line 252) - 礼包购买
   - 移除 `body.user_id` 参数
   - 使用 `const { userId } = await requireAuth(event)`
   - 所有 `user_id` 替换为 `userId`

#### ✅ 查询接口
2. **getUserPurchaseHistory** (line 635) - 购买记录查询
3. **getUserRechargeHistory** (line 682) - 充值记录查询
4. **getUserPlatformCoinSpendHistory** (line 749) - 平台币消费记录
5. **getUserHomeStats** (line 860) - 首页统计
6. **getUserBalance** (line 987) - 余额查询
7. **getUserCharacters** (line 1028) - 角色列表
8. **getUserStats** (line 924) - 个人资料统计
9. **getPlayerGiftPackageRecords** (line 1075) - 礼包记录

**统一改造模式**:
```typescript
// 改造前
export const someFunction = defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { user_id } = body;  // ❌ 信任客户端
    // ...
});

// 改造后
export const someFunction = defineEventHandler(async (event) => {
    // ============ JWT 认证 ============
    const { userId } = await requireAuth(event);
    console.log(`[JWT认证] 用户ID: ${userId} ...`);
    // ==================================
    
    const body = await readBody(event);
    // 不再从 body 获取 user_id
    // ...
});
```

### 4. 权益中心改造 (apps/user-center/server/controller/benefits.ts)

已修改 **4个接口**：

1. **getMonthlyCardStatus** (line 44) - 月卡状态查询
2. **claimMonthlyCard** (line 61) - 月卡领取
3. **getCheckInStatus** (line 154) - 签到状态查询
4. **doCheckIn** (line 171) - 执行签到

**关键改动**:
- ✅ 移除 `getCurrentUserId()` 函数（不再从 cookie/query/body 获取）
- ✅ 全部改用 `requireAuth()` 强制 JWT 认证
- ✅ 移除 `body.user_id` 的兜底逻辑

---

## 🔒 安全改进

### Before (漏洞)
```typescript
// ❌ 客户端可伪造任意 user_id
const { user_id } = body;
const user = await UserModel.findById(user_id);
```

### After (安全)
```typescript
// ✅ 从 JWT 获取，无法伪造
const { userId } = await requireAuth(event);
const user = await UserModel.findById(userId);
```

---

## 📊 统计

- **修改文件**: 3个
  - `user.ts` (登录接口)
  - `userClient.ts` (9个敏感接口)
  - `benefits.ts` (4个权益接口)
- **添加 JWT 认证**: 13个接口
- **移除 user_id 参数**: 所有敏感操作
- **安全级别**: Critical 级漏洞已修复

---

## 🔄 向后兼容

### 旧客户端
- ✅ 登录后自动设置 HttpOnly Cookie
- ✅ 后续请求自动携带 Cookie (浏览器自动行为)
- ✅ `requireAuth()` 自动从 Cookie 提取 token
- ✅ 无需前端改动

### 新客户端/API
- ✅ 登录后获取 `response.data.token`
- ✅ 请求时携带 `Authorization: Bearer <token>`
- ✅ `requireAuth()` 优先从 header 提取 token

---

## ⚠️ 待 Review 检查点

1. **JWT 认证逻辑是否正确**？
2. **是否遗漏了其他敏感接口**？
3. **向后兼容策略是否合理**？
4. **日志输出是否合适**（生产环境需关闭调试日志）？
5. **错误消息是否友好**（401 "未登录或登录已过期"）？

---

## 📝 下一步

确认无误后，进行:
- **第3步**: 移除所有硬编码密钥
- **第4步**: 添加环境变量启动检查
- **第5步**: 生成前端对接文档

**请 Review 上述修改，确认后我继续第3步！**
