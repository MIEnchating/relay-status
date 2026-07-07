# RelayAI 状态页部署

## 首次部署

服务器需要 Node.js 20.19+ 或 22.12+、npm、pm2。推荐直接安装 Node.js 22 LTS。

## 安装 Node.js

Ubuntu / Debian：

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

CentOS / Alibaba Cloud Linux / RHEL：

```bash
sudo yum install -y curl ca-certificates
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
sudo yum install -y nodejs
node -v
npm -v
```

```bash
npm i -g pm2
git clone https://github.com/MIEnchating/kuma-status-board.git
cd kuma-status-board
cp .env.example .env
```

编辑 `.env`：

```bash
NUXT_UPTIME_KUMA_BASE_URL=https://status.relayai.tech
NUXT_UPTIME_KUMA_SLUG=relayai
NUXT_UPTIME_KUMA_METRICS_URL=https://status.relayai.tech/metrics
NUXT_UPTIME_KUMA_METRICS_API_KEY=
NUXT_OPENAI_STATUS_FEED_URL=https://status.openai.com/feed.atom
NUXT_CLAUDE_STATUS_FEED_URL=https://status.claude.com/history.rss
NUXT_PUBLIC_STATUS_TITLE=RelayAI 状态
NUXT_PUBLIC_REFRESH_SECONDS=60
```

构建并启动：

```bash
npm ci
npm run build
npm run pm2:start
pm2 save
pm2 startup systemd
```

PM2 会监听 `0.0.0.0:3001`，进程名是 `relayai-status`。

## Nginx 反代

```nginx
server {
    listen 80;
    server_name status.relayai.tech;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

检查并重载：

```bash
nginx -t
systemctl reload nginx
```

## 后续更新

```bash
cd kuma-status-board
git pull --ff-only
npm ci
npm run build
npm run pm2:reload
```

常用命令：

```bash
npm run pm2:logs
npm run pm2:stop
pm2 status
```
