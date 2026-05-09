# Kuma Status Board

一个使用 Nuxt 构建的 Uptime Kuma 状态监控页面。页面通过 Nuxt 服务端接口读取 Uptime Kuma 的公开状态页 API：

- `/api/status-page/:slug`
- `/api/status-page/heartbeat/:slug`

## 使用

```bash
npm install
copy .env.example .env
npm run dev
```

编辑 `.env`：

```bash
NUXT_UPTIME_KUMA_BASE_URL=https://你的-uptime-kuma-地址
NUXT_UPTIME_KUMA_SLUG=default
NUXT_PUBLIC_STATUS_TITLE=Service Status
NUXT_PUBLIC_REFRESH_SECONDS=60
```

`NUXT_UPTIME_KUMA_BASE_URL` 填 Uptime Kuma 根地址，不要带 `/status/default`。如果没有配置 `.env`，页面会使用内置示例数据，方便先预览样式。
