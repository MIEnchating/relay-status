<script setup lang="ts">
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Timer,
  Wrench
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
  beats: Beat[]
}

type Beat = {
  time: string | null
  status: 0 | 1 | 2 | 3
  ping: number | null
  message: string | null
}

type OpenAIStatusPayload = {
  source: string
  feedUrl: string
  updatedAt: string
  items: OpenAIStatusItem[]
}

type OpenAIStatusItem = {
  id: string
  title: string
  summary: string
  status: string
  tone: 'active' | 'resolved'
  publishedAt: string | null
  link: string
}

const config = useRuntimeConfig()
const defaultRefreshSeconds = Math.max(10, Number(config.public.refreshSeconds) || 300)
const refreshCountdown = ref(defaultRefreshSeconds)
const isRefreshing = ref(false)

const { data, error, refresh } = await useFetch<StatusPayload>('/api/status', {
  default: () => null
})
const { data: openaiStatus, error: openaiStatusError, refresh: refreshOpenAIStatus } = await useFetch<OpenAIStatusPayload>('/api/openai-status', {
  default: () => null
})

const pageTitle = computed(() => {
  const customTitle = String(config.public.statusTitle || '').trim()
  return customTitle || data.value?.page.title || '服务状态'
})
const overall = computed(() => data.value?.overall)
const groups = computed(() => data.value?.groups || [])
const incidents = computed(() => data.value?.incidents || [])
const maintenanceList = computed(() => data.value?.maintenanceList || [])
const openaiItems = computed(() => openaiStatus.value?.items || [])
const hasOpenAIStatus = computed(() => openaiItems.value.length > 0 || Boolean(openaiStatusError.value))
const statusCounts = computed(() => {
  const current = overall.value

  return [
    { label: '正常服务', value: current?.up ?? 0, tone: 'up' },
    { label: '故障服务', value: current?.down ?? 0, tone: 'down' }
  ]
})

useHead(() => ({
  title: pageTitle.value
}))

let refreshTimer: ReturnType<typeof window.setInterval> | undefined

onMounted(() => {
  refreshTimer = window.setInterval(() => {
    if (refreshCountdown.value <= 1) {
      refreshAll()
      return
    }

    refreshCountdown.value -= 1
  }, 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})

function statusClass(tone?: string) {
  return `is-${tone || 'pending'}`
}

function refreshAll() {
  if (isRefreshing.value) {
    return
  }

  isRefreshing.value = true
  Promise.all([refresh(), refreshOpenAIStatus()])
    .finally(() => {
      isRefreshing.value = false
      refreshCountdown.value = defaultRefreshSeconds
    })
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

function statusLabel(status: 0 | 1 | 2 | 3) {
  const labelMap = {
    0: '故障',
    1: '正常',
    2: '等待',
    3: '维护'
  }

  return labelMap[status]
}

function formatMonitorType(value: string | null | undefined) {
  const typeMap: Record<string, string> = {
    group: '分组',
    http: 'HTTP',
    keyword: '关键词',
    json: 'JSON',
    port: '端口',
    ping: 'Ping',
    dns: 'DNS',
    docker: 'Docker',
    push: '推送',
    steam: 'Steam',
    grpc: 'gRPC',
    mqtt: 'MQTT',
    mysql: 'MySQL',
    postgres: 'PostgreSQL',
    mongodb: 'MongoDB',
    redis: 'Redis'
  }
  const key = String(value || '').toLowerCase()

  return typeMap[key] || value || '服务'
}

function formatBeatTooltip(beat: Beat) {
  const parts = [formatDateTimeWithSeconds(beat.time), statusLabel(beat.status)]

  if (beat.status === 0) {
    parts.push(beat.message || '未返回故障原因')
  } else {
    parts.push(`延迟 ${formatPing(beat.ping)}`)
  }

  return parts.join(' · ')
}

function recentBeats(beats: Beat[]) {
  return beats.slice(-36)
}

function beatStyle(beat: Beat) {
  return {
    '--beat-color': beatColor(beat)
  }
}

function beatColor(beat: Beat) {
  if (beat.status === 0) {
    return '#c64545'
  }

  if (beat.status === 2) {
    return '#8e8b82'
  }

  return '#5db872'
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '暂无'
  }

  return `${Math.round(value)}%`
}

function formatPing(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '暂无'
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
    return '暂无'
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatDateTimeWithSeconds(value: string | null | undefined) {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function openaiItemClass(tone: OpenAIStatusItem['tone']) {
  return `is-${tone}`
}
</script>

<template>
  <main class="page-shell" :class="statusClass(overall?.tone)">
    <div v-if="error" class="notice is-error">
      <AlertTriangle :size="18" />
      <span>{{ error.statusMessage || error.message }}</span>
    </div>

    <div v-else-if="data && !data.configured" class="notice">
      <AlertTriangle :size="18" />
      <span>正在显示示例数据。复制 .env.example 为 .env 后填入 Uptime Kuma 地址即可接入真实状态页。</span>
    </div>

    <div class="monitor-layout" :class="{ 'has-rail': hasOpenAIStatus }">
      <div class="service-stack">
        <section class="refresh-toolbar" aria-label="刷新控制">
          <span class="refresh-countdown">
            <Timer :size="15" />
            {{ isRefreshing ? '正在刷新' : `${refreshCountdown} 秒后刷新` }}
          </span>

          <button class="refresh-button" type="button" :disabled="isRefreshing" @click="refreshAll">
            <RefreshCw :size="16" :class="{ 'is-spinning': isRefreshing }" />
            <span>刷新</span>
          </button>
        </section>

        <section class="status-counts" aria-label="状态汇总">
          <article v-for="item in statusCounts" :key="item.label" class="count-card" :class="statusClass(item.tone)">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
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
              <h2>{{ group.name }}</h2>
            </div>
            <span>{{ group.monitors.length }} 项服务</span>
          </div>

          <div class="service-grid">
            <article v-for="monitor in group.monitors" :key="monitor.id" class="service-card" :class="statusClass(monitor.tone)">
              <div class="service-header">
                <div>
                  <span class="service-dot" :class="statusClass(monitor.tone)" aria-hidden="true" />
                  <div>
                    <h3>{{ monitor.name }}</h3>
                    <p>{{ formatMonitorType(monitor.type) }}</p>
                  </div>
                </div>
                <span class="service-state">{{ monitor.label }}</span>
              </div>

              <div class="service-snapshot">
                <div>
                  <span>24 小时可用率</span>
                  <strong>{{ formatPercent(monitor.uptime) }}</strong>
                </div>
                <div>
                  <span>延迟</span>
                  <strong>{{ formatPing(monitor.ping ?? monitor.avgPing) }}</strong>
                </div>
                <div>
                  <span>最近检测</span>
                  <strong>{{ formatRelativeTime(monitor.lastChecked) }}</strong>
                </div>
              </div>

              <div
                class="sparkline"
                aria-label="近期心跳记录"
                :style="{ '--beat-count': String(recentBeats(monitor.beats).length) }"
              >
                <span
                  v-for="(beat, index) in recentBeats(monitor.beats)"
                  :key="`${monitor.id}-${beat.time || index}`"
                  class="beat"
                  :class="beatClass(beat.status)"
                  :style="beatStyle(beat)"
                  :aria-label="formatBeatTooltip(beat)"
                  tabindex="0"
                >
                  <span class="beat-tooltip" role="tooltip">
                    <strong>{{ statusLabel(beat.status) }}</strong>
                    <span>{{ formatDateTimeWithSeconds(beat.time) }}</span>
                    <span v-if="beat.status === 0">原因：{{ beat.message || '未返回故障原因' }}</span>
                    <span v-else>延迟 {{ formatPing(beat.ping) }}</span>
                  </span>
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>

      <aside v-if="hasOpenAIStatus" class="official-rail" aria-label="OpenAI 官方状态">
        <section class="openai-section">
          <div class="section-heading">
            <div>
              <p>外部官方消息</p>
              <h2>OpenAI 状态</h2>
            </div>
            <span>RSS 自动同步</span>
          </div>

          <div v-if="openaiStatusError" class="notice is-error">
            <AlertTriangle :size="18" />
            <span>{{ openaiStatusError.statusMessage || openaiStatusError.message }}</span>
          </div>

          <div v-else class="openai-list">
            <a
              v-for="item in openaiItems"
              :key="item.id"
              class="openai-item"
              :class="openaiItemClass(item.tone)"
              :href="item.link"
              target="_blank"
              rel="noreferrer"
            >
              <div>
                <div class="openai-meta">
                  <span>{{ item.status }}</span>
                  <time>{{ formatRelativeTime(item.publishedAt) }}</time>
                </div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.summary }}</p>
              </div>
              <ExternalLink :size="16" />
            </a>
          </div>
        </section>
      </aside>
    </div>
  </main>
</template>
