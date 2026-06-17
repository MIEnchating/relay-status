export default defineNuxtConfig({
  compatibilityDate: '2026-05-08',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    uptimeKumaBaseUrl: process.env.NUXT_UPTIME_KUMA_BASE_URL || '',
    uptimeKumaSlug: process.env.NUXT_UPTIME_KUMA_SLUG || 'default',
    openaiStatusFeedUrl: process.env.NUXT_OPENAI_STATUS_FEED_URL || 'https://status.openai.com/feed.atom',
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
      ]
    }
  }
})
