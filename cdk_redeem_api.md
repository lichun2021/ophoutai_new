# CDK 兑换接口文档

**版本**: v1.0  

---

## 概述

玩家在游戏客户端输入 CDK 兑换码后，第三方平台调用本接口完成兑换，系统将通过游戏内邮件自动发放奖励道具至玩家背包。

**接口特性**：
- 无需登录鉴权（公开接口）
- 同一类型 CDK 每个角色仅可领取一次（幂等保护）
- 支持三种 CDK 类型（通用码 / 唯一码 / 每日码）

---

## 接口信息

| 项目 | 内容 |
|---|---|
| **请求地址** | `POST /api/client/cdk/redeem` |
| **Content-Type** | `application/json` |
| **鉴权方式** | 无（公开接口，无需签名） |

---

## 请求参数

### Body（JSON）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `server` | string | ✅ | 游戏区服标识，如 `game_1`，可调用 [获取服务器列表接口](#获取服务器列表接口) 获取 |
| `playerId` | string | ✅ | 玩家角色 ID（游戏内角色唯一标识） |
| `code` | string | ✅ | CDK 兑换码（区分大小写） |

### 请求示例

```json
{
  "server": "game_1",
  "playerId": "7pt-43yskz-1",
  "code": "3MK64VCC4X"
}
```

---

## 响应参数

### 响应格式（JSON）

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | number | 状态码：`200` = 成功，`400` = 业务失败，`500` = 服务异常 |
| `message` | string | 结果描述信息 |

### 成功响应

```json
{
  "code": 200,
  "message": "领取成功，奖励已通过游戏内邮件发放"
}
```

### 失败响应

```json
{
  "code": 400,
  "message": "该类型已领取，无法重复领取"
}
```

---

## 业务状态码说明

| code | message | 原因 |
|---|---|---|
| `200` | 领取成功，奖励已通过游戏内邮件发放 | 兑换成功 |
| `400` | 缺少参数：server/playerId/code | 请求体缺少必填字段 |
| `400` | CDK不存在或无效 | 兑换码不存在 |
| `400` | 该CDK已被使用 | 唯一码已被其他人使用 |
| `400` | 该类型已领取，无法重复领取 | 同一角色重复领取同类型 CDK |
| `400` | 今日已领取，无法重复领取 | 每日码当日已领取 |
| `400` | 未配置 data 类型 | 后台未配置每日码活动 |
| `400` | 未找到或未启用的游戏服务器配置 | `server` 参数无效或服务器已停用 |
| `500` | 发放失败: GM接口错误 | 游戏服道具发放异常，可稍后重试 |
| `502` | 兑换服务暂时不可用，请稍后重试 | 内部服务通信异常 |

---

## CDK 类型说明

| 类型 | 说明 | 特点 |
|---|---|---|
| `universal`（通用码） | 多人共享同一码 | 同一角色只能领取一次；不同角色可用同一码 |
| `unique`（唯一码） | 每码只能使用一次 | 先到先得，用完即止 |
| `data`（每日码） | 每日自动生成的日期码（格式：`YYYYMMDD`，东八区） | 每个角色每天仅限领取一次 |

> **每日码规则**：`code` 字段传入当天日期字符串，格式为 `YYYYMMDD`（北京时间 UTC+8），如 `20260523`。

---

## 获取服务器列表接口

> 在兑换前，可先调用此接口获取当前支持 CDK 兑换的服务器列表。

| 项目 | 内容 |
|---|---|
| **请求地址** | `GET /api/client/cdk/servers` |
| **鉴权方式** | 无（公开接口） |

### 响应示例

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "server_id": 10001,
      "name": "S1/一区",
      "is_active": 1
    },
    {
      "id": 2,
      "server_id": 10002,
      "name": "S2/二区",
      "is_active": 1
    }
  ],
  "message": "ok"
}
```

> 接口调用时，`server` 字段传 `bname`（如 `game_1`）或 `name`（如 `S1/一区`）或 `server_id`（如 `10001`）均可识别。

---

## 完整调用示例

### cURL

```bash
curl -X POST https://your-domain.com/api/client/cdk/redeem \
  -H "Content-Type: application/json" \
  -d '{
    "server": "game_1",
    "playerId": "7pt-43yskz-1",
    "code": "3MK64VCC4X"
  }'
```

### JavaScript (fetch)

```javascript
const res = await fetch('https://your-domain.com/api/client/cdk/redeem', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server: 'game_1',
    playerId: '7pt-43yskz-1',
    code: '3MK64VCC4X',
  }),
});
const data = await res.json();
if (data.code === 200) {
  console.log('兑换成功:', data.message);
} else {
  console.warn('兑换失败:', data.message);
}
```

### Unity (C#)

```csharp
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

IEnumerator RedeemCDK(string server, string playerId, string code)
{
    var payload = $"{{\"server\":\"{server}\",\"playerId\":\"{playerId}\",\"code\":\"{code}\"}}";
    var request = new UnityWebRequest("https://your-domain.com/api/client/cdk/redeem", "POST");
    request.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(payload));
    request.downloadHandler = new DownloadHandlerBuffer();
    request.SetRequestHeader("Content-Type", "application/json");

    yield return request.SendWebRequest();

    if (request.result == UnityWebRequest.Result.Success)
    {
        Debug.Log("响应: " + request.downloadHandler.text);
        // 解析 JSON 判断 code == 200
    }
    else
    {
        Debug.LogError("请求失败: " + request.error);
    }
}
```

---

## 注意事项

1. `playerId` 必须是**游戏内实际存在的角色 ID**，不可使用账号 ID 或其他标识替代。
2. 兑换成功后奖励通过**游戏内邮件**发放，玩家需进入游戏邮箱领取。
3. `unique` 类型 CDK 一旦成功兑换即标记已使用，**不可撤销**。
4. 每日码 `code` 需严格使用北京时间（UTC+8）当日日期，跨天无效。
5. 服务器在维护期间可能返回 `500`，建议客户端给出"稍后重试"提示。
