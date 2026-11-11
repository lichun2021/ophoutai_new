# Nuxt 3 Minimal Starter

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm run dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm run build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm run preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Telegram 运营功能

在私聊中发送 `/menu`，可打开「渠道结算」和「查玩家 / 发平台币」。渠道结算按绑定账号在后台的渠道权限分页显示。发平台币仅供已启用的超级管理员使用，确认后从该管理员的平台币余额扣款。

用 `/myid` 查看 Telegram 用户 ID。在当前使用的 `telegram.json`（开发环境通常是 `server/config/telegram.json`，生产环境可用 `/data/config/telegram.json`）中加入 `adminBindings`。键是 Telegram 用户 ID，值是 `Admins.id`。把示例中的 ID 换成实际账号，并保留现有的白名单和其他绑定。

```json
{
  "allowedUserIds": [123456789],
  "allowedGroupIds": [],
  "adminBindings": {
    "123456789": 1
  }
}
```

`/settlement` 直接打开结算数据。`/grant` 提示输入玩家登录账号或第三方 UID，显示用户 ID 后可输入数量并确认发放。`/cancel` 可返回主菜单。
