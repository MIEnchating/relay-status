<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Wrench,
  Zap
} from 'lucide-vue-next'

type StatusPayload = {
  configured: boolean
  source: {
    baseUrl: string
    slug: string
  }
  page: {
    title: string
    description: string
    icon: string | null
  }
  overall: {
    tone: string
    label: string
    summary: string
    total: number
    up: number
    down: number
    pending: number
    maintenance: number
    avgUptime: number | null
    avgPing: number | null
  }
  incidents: Array<{
    title: string
    content: string
    style: string
    createdAt: string | null
  }>
  maintenanceList: Array<{
    title: string
    description: string
    startAt: string | null
    endAt: string | null
  }>
  groups: Array<{
    name: string
    monitors: Monitor[]
  }>
  updatedAt: string
}

type Monitor = {
  id: string
  name: string
  type: string
  url: string | null
  status: 0 | 1 | 2 | 3
  label: string
  tone: string
  uptime: number | null
  ping: number | null
  avgPing: number | null
  lastChecked: string | null
  tags: string[]
  beats: Array<{
    time: string | null
    status: 0 | 1 | 2 | 3
    ping: number | null
  }>
}

const config = useRuntimeConfig()
const refreshSeconds = computed(() => Math.max(15, Number(config.public.refreshSeconds) || 60))

const { data, pending, error, refresh } = await useFetch<StatusPayload>('/api/status', {
  default: () => null
})

const pageTitle = computed(() => {
  const customTitle = String(config.public.statusTitle || '').trim()
  return customTitle || data.value?.page.title || 'Service Status'
})
const pageDescription = computed(() => data.value?.page.description || '实时服务健康状态')
const overall = computed(() => data.value?.overall)
const groups = computed(() => data.value?.groups || [])
const incidents = computed(() => data.value?.incidents || [])
const maintenanceList = computed(() => data.value?.maintenanceList || [])
const updatedAt = computed(() => data.value?.updatedAt || null)
const sourceUrl = computed(() => {
  if (!data.value?.source.baseUrl) {
    return ''
  }

  return `${data.value.source.baseUrl}/status/${data.value.source.slug}`
})
const sourceLabel = computed(() => {
  if (!data.value?.configured || !data.value?.source.baseUrl) {
    return 'Demo Source'
  }

  try {
    return new URL(data.value.source.baseUrl).host
  } catch {
    return data.value.source.baseUrl
  }
})
const healthScore = computed(() => {
  if (typeof overall.value?.avgUptime === 'number') {
    return Math.round(overall.value.avgUptime)
  }

  if (!overall.value?.total) {
    return 0
  }

  return Math.round(((overall.value.up + overall.value.maintenance * 0.65) / overall.value.total) * 100)
})
const overallIcon = computed(() => {
  if (overall.value?.tone === 'down' || overall.value?.tone === 'degraded') {
    return AlertTriangle
  }

  if (overall.value?.tone === 'maintenance') {
    return Wrench
  }

  return ShieldCheck
})

useHead(() => ({
  title: pageTitle.value
}))

let refreshTimer: ReturnType<typeof window.setInterval> | undefined

onMounted(() => {
  refreshTimer = window.setInterval(() => {
    refresh()
  }, refreshSeconds.value * 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})

function statusClass(tone?: string) {
  return `is-${tone || 'pending'}`
}

function beatClass(status: 0 | 1 | 2 | 3) {
  const toneMap = {
    0: 'is-down',
    1: 'is-up',
    2: 'is-pending',
    3: 'is-maintenance'
  }

  return toneMap[status]
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number') {
    return 'N/A'
  }

  return `${value.toFixed(digits)}%`
}

function formatPing(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'N/A'
  }

  return `${Math.round(value)} ms`
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return '未检测'
  }

  const date = new Date(value)
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (diffSeconds < 60) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'N/A'
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
</script>

<template>
  <main class="page-shell" :class="statusClass(overall?.tone)">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <Activity :size="24" />
        </div>
        <div>
          <p>{{ sourceLabel }}</p>
          <h1>{{ pageTitle }}</h1>
        </div>
      </div>

      <div class="topbar-actions">
        <span class="status-chip" :class="statusClass(overall?.tone)">
          <span aria-hidden="true" />
          {{ overall?.label || '加载中' }}
        </span>
        <button class="icon-button" type="button" title="刷新数据" @click="refresh()">
          <RefreshCw :size="18" :class="{ 'is-spinning': pending }" />
        </button>
        <a v-if="sourceUrl" class="icon-button" :href="sourceUrl" target="_blank" rel="noreferrer" title="打开 Uptime Kuma">
          <ExternalLink :size="18" />
        </a>
      </div>
    </header>

    <div v-if="error" class="notice is-error">
      <AlertTriangle :size="18" />
      <span>{{ error.statusMessage || error.message }}</span>
    </div>

    <div v-else-if="data && !data.configured" class="notice">
      <AlertTriangle :size="18" />
      <span>正在显示示例数据。复制 .env.example 为 .env 后填入 Uptime Kuma 地址即可接入真实状态页。</span>
    </div>

    <section class="overview-band">
      <div class="overview-copy">
        <p class="eyebrow">Live Operations</p>
        <h2>{{ overall?.summary || '正在读取监控状态' }}</h2>
        <p>{{ pageDescription }}</p>
      </div>

      <div class="health-panel" :class="statusClass(overall?.tone)" :style="{ '--score': `${healthScore}%` }">
        <div class="health-ring">
          <component :is="overallIcon" :size="30" />
          <strong>{{ healthScore }}</strong>
        </div>
        <div>
          <span>Health</span>
          <strong>{{ formatPercent(overall?.avgUptime, 3) }}</strong>
          <small>24h uptime</small>
        </div>
      </div>
    </section>

    <section class="metrics-grid" aria-label="Status summary">
      <article class="metric-card">
        <Server :size="20" />
        <span>服务总数</span>
        <strong>{{ overall?.total ?? '--' }}</strong>
      </article>
      <article class="metric-card">
        <CheckCircle2 :size="20" />
        <span>正常运行</span>
        <strong>{{ overall?.up ?? '--' }}</strong>
      </article>
      <article class="metric-card">
        <Gauge :size="20" />
        <span>平均延迟</span>
        <strong>{{ formatPing(overall?.avgPing) }}</strong>
      </article>
      <article class="metric-card">
        <Clock3 :size="20" />
        <span>最后更新</span>
        <strong>{{ formatRelativeTime(updatedAt) }}</strong>
      </article>
    </section>

    <section v-if="incidents.length || maintenanceList.length" class="alerts-band">
      <article v-for="incident in incidents" :key="`incident-${incident.title}-${incident.createdAt}`" class="alert-card">
        <AlertTriangle :size="20" />
        <div>
          <div class="alert-heading">
            <strong>{{ incident.title }}</strong>
            <time>{{ formatDateTime(incident.createdAt) }}</time>
          </div>
          <p>{{ incident.content }}</p>
        </div>
      </article>

      <article v-for="item in maintenanceList" :key="`maintenance-${item.title}-${item.startAt}`" class="alert-card is-maintenance">
        <Wrench :size="20" />
        <div>
          <div class="alert-heading">
            <strong>{{ item.title }}</strong>
            <time>{{ formatDateTime(item.startAt) }} - {{ formatDateTime(item.endAt) }}</time>
          </div>
          <p>{{ item.description }}</p>
        </div>
      </article>
    </section>

    <section v-for="group in groups" :key="group.name" class="service-section">
      <div class="section-heading">
        <div>
          <p>Monitor Group</p>
          <h2>{{ group.name }}</h2>
        </div>
        <span>{{ group.monitors.length }} services</span>
      </div>

      <div class="service-grid">
        <article v-for="monitor in group.monitors" :key="monitor.id" class="service-card" :class="statusClass(monitor.tone)">
          <div class="service-header">
            <div>
              <span class="service-dot" :class="statusClass(monitor.tone)" aria-hidden="true" />
              <h3>{{ monitor.name }}</h3>
            </div>
            <span class="service-state">{{ monitor.label }}</span>
          </div>

          <div class="sparkline" aria-label="Recent heartbeat history">
            <span
              v-for="(beat, index) in monitor.beats"
              :key="`${monitor.id}-${beat.time || index}`"
              class="beat"
              :class="beatClass(beat.status)"
              :title="`${formatDateTime(beat.time)} / ${formatPing(beat.ping)}`"
            />
          </div>

          <div class="service-meta">
            <span>
              <Radio :size="15" />
              {{ formatPercent(monitor.uptime, 3) }}
            </span>
            <span>
              <Zap :size="15" />
              {{ formatPing(monitor.ping ?? monitor.avgPing) }}
            </span>
            <span>
              <Clock3 :size="15" />
              {{ formatRelativeTime(monitor.lastChecked) }}
            </span>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
