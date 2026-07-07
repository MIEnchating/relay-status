export default defineNuxtConfig({
  compatibilityDate: '2026-05-08',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    uptimeKumaBaseUrl: process.env.NUXT_UPTIME_KUMA_BASE_URL || '',
    uptimeKumaSlug: process.env.NUXT_UPTIME_KUMA_SLUG || 'default',
    uptimeKumaMetricsUrl: process.env.NUXT_UPTIME_KUMA_METRICS_URL || '',
    uptimeKumaMetricsApiKey: process.env.NUXT_UPTIME_KUMA_METRICS_API_KEY || '',
    openaiStatusFeedUrl: process.env.NUXT_OPENAI_STATUS_FEED_URL || 'https://status.openai.com/feed.atom',
    claudeStatusFeedUrl: process.env.NUXT_CLAUDE_STATUS_FEED_URL || 'https://status.claude.com/history.rss',
    public: {
      refreshSeconds: Number(process.env.NUXT_PUBLIC_REFRESH_SECONDS || 60),
      statusTitle: process.env.NUXT_PUBLIC_STATUS_TITLE || ''
    }
  },
  app: {
    head: {
      title: 'Service Status',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#f8faf7' },
        {
          name: 'description',
          content: 'A polished Nuxt status dashboard powered by Uptime Kuma.'
        }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  }
})
