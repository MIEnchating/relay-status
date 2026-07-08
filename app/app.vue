<script setup lang="ts">
import {
  AlertTriangle,
  ExternalLink,
  Moon,
  RefreshCw,
  Sun,
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
  uptime7d: number | null
  uptime30d: number | null
  ping: number | null
  avgPing: number | null
  lastChecked: string | null
  message: string | null
  latestIssue: Beat | null
  tags: string[]
  beats: Beat[]
}

type Beat = {
  time: string | null
  status: 0 | 1 | 2 | 3
  ping: number | null
  message: string | null
}

type BeatSlot = Beat & {
  isPlaceholder: boolean
}

type ThemeMode = 'light' | 'dark'

type OfficialStatusPayload = {
  updatedAt: string
  sources: OfficialStatusSource[]
}

type OfficialStatusSource = {
  id: string
  name: string
  feedUrl: string
  homepage: string
  updatedAt: string
  items: OfficialStatusItem[]
}

type OfficialStatusItem = {
  id: string
  title: string
  summary: string
  status: string
  tone: 'active' | 'resolved'
  publishedAt: string | null
  link: string
}

const config = useRuntimeConfig()
const heartbeatSlotCount = 36
const defaultRefreshSeconds = Math.max(10, Number(config.public.refreshSeconds) || 60)
const refreshCountdown = ref(defaultRefreshSeconds)
const isRefreshing = ref(false)
const themeMode = ref<ThemeMode>('light')
const isDarkTheme = computed(() => themeMode.value === 'dark')

const { data, error, refresh } = await useFetch<StatusPayload>('/api/status', {
  default: () => null
})
const { data: officialStatus, error: officialStatusError, refresh: refreshOfficialStatus } = await useFetch<OfficialStatusPayload>('/api/official-status', {
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
const officialSources = computed(() => officialStatus.value?.sources || [])
const hasOfficialStatus = computed(() => officialSources.value.some((source) => source.items.length > 0) || Boolean(officialStatusError.value))
const selectedGroup = ref('all')
const selectedOfficialSource = ref('openai')
const groupFilters = computed(() => {
  const allCount = groups.value.reduce((sum, group) => sum + group.monitors.length, 0)

  return [
    { id: 'all', label: '全部', count: allCount },
    ...groups.value.map((group) => ({
      id: group.name,
      label: group.name,
      count: group.monitors.length
    }))
  ]
})
const visibleGroups = computed(() => {
  if (selectedGroup.value === 'all') {
    return groups.value
  }

  return groups.value.filter((group) => group.name === selectedGroup.value)
})
const visibleMonitors = computed(() => visibleGroups.value.flatMap((group) => group.monitors))
const visibleOfficialSource = computed(() => {
  return officialSources.value.find((source) => source.id === selectedOfficialSource.value) || officialSources.value[0] || null
})
const statusCounts = computed(() => {
  const monitors = visibleMonitors.value

  return [
    { label: '正常服务', value: monitors.filter((monitor) => monitor.status === 1).length, tone: 'up' },
    { label: '故障服务', value: monitors.filter((monitor) => monitor.status === 0).length, tone: 'down' },
    { label: '等待服务', value: monitors.filter((monitor) => monitor.status === 2).length, tone: 'pending' },
    { label: '维护服务', value: monitors.filter((monitor) => monitor.status === 3).length, tone: 'maintenance' }
  ]
})

useHead(() => ({
  title: pageTitle.value,
  htmlAttrs: {
    'data-theme': themeMode.value
  },
  meta: [
    {
      name: 'theme-color',
      content: isDarkTheme.value ? '#151513' : '#f8faf7'
    }
  ]
}))

watch(groupFilters, (items) => {
  if (!items.some((item) => item.id === selectedGroup.value)) {
    selectedGroup.value = 'all'
  }
})

watch(officialSources, (sources) => {
  if (!sources.length || sources.some((source) => source.id === selectedOfficialSource.value)) {
    return
  }

  selectedOfficialSource.value = sources.find((source) => source.id === 'openai')?.id || sources[0].id
}, { immediate: true })

let refreshTimer: ReturnType<typeof window.setInterval> | undefined

onMounted(() => {
  const savedTheme = window.localStorage.getItem('relay-status-theme')
  if (savedTheme === 'light' || savedTheme === 'dark') {
    themeMode.value = savedTheme
  }

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

function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  window.localStorage.setItem('relay-status-theme', mode)
}

function refreshAll() {
  if (isRefreshing.value) {
    return
  }

  isRefreshing.value = true
  Promise.all([refresh(), refreshOfficialStatus()])
    .finally(() => {
      isRefreshing.value = false
      refreshCountdown.value = defaultRefreshSeconds
    })
}

function beatClass(beat: BeatSlot) {
  if (beat.isPlaceholder) {
    return 'is-empty'
  }

  const toneMap = {
    0: 'is-down',
    1: 'is-up',
    2: 'is-pending',
    3: 'is-maintenance'
  }

  return toneMap[beat.status]
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

function formatBeatTooltip(beat: BeatSlot) {
  const parts = [formatDateTimeWithSeconds(beat.time), statusLabel(beat.status)]

  if (beat.status !== 0) {
    parts.push(`延迟 ${formatPing(beat.ping)}`)
  }

  return parts.join(' · ')
}

function recentBeatSlots(beats: Beat[]) {
  const recent = beats.slice(-heartbeatSlotCount).map((beat): BeatSlot => ({
    ...beat,
    isPlaceholder: false
  }))
  const missingCount = heartbeatSlotCount - recent.length

  if (missingCount <= 0) {
    return recent
  }

  const placeholders = Array.from({ length: missingCount }, (): BeatSlot => ({
    time: null,
    status: 2,
    ping: null,
    message: null,
    isPlaceholder: true
  }))

  return [...placeholders, ...recent]
}

function beatStyle(beat: BeatSlot) {
  return {
    '--beat-color': beatColor(beat)
  }
}

function beatColor(beat: BeatSlot) {
  if (beat.isPlaceholder) {
    return 'var(--beat-empty)'
  }

  if (beat.status === 0) {
    return 'var(--error)'
  }

  if (beat.status === 2) {
    return 'var(--muted-soft)'
  }

  return 'var(--success)'
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '暂无'
  }

  return `${Math.round(value)}%`
}

function formatPing(value: number | null | undefined) {
  if (typeof value !== 'number' || value < 0) {
    return '暂无'
  }

  return `${Math.round(value)} ms`
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return '未检测'
  }

  const date = new Date(value)
  const referenceTime = new Date(data.value?.updatedAt || '').getTime()
  const now = Number.isNaN(referenceTime) ? Date.now() : referenceTime
  const diffSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))

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

function officialItemClass(tone: OfficialStatusItem['tone']) {
  return `is-${tone}`
}

function officialSourceTone(source: OfficialStatusSource) {
  const activeItems = officialActiveItems(source)

  if (!activeItems.length) {
    return 'normal'
  }

  return activeItems.some(isSevereOfficialItem) ? 'danger' : 'warning'
}

function officialActiveItems(source: OfficialStatusSource) {
  return source.items.filter((item) => item.tone === 'active')
}

function officialTabCount(source: OfficialStatusSource) {
  return officialActiveItems(source).length || source.items.length
}

function officialTabClass(source: OfficialStatusSource) {
  return `is-${officialSourceTone(source)}`
}

function isSevereOfficialItem(item: OfficialStatusItem) {
  return /outage|error|errors|failure|failures|failed|unavailable|down|not working|denied|故障|异常|错误|不可用|失败/i
    .test(`${item.status} ${item.title} ${item.summary}`)
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

    <div class="monitor-layout" :class="{ 'has-rail': hasOfficialStatus }">
      <div class="service-stack">
        <section class="refresh-toolbar" aria-label="刷新控制">
          <div class="theme-switcher" role="group" aria-label="主题切换">
            <button
              type="button"
              class="theme-button"
              :class="{ 'is-active': themeMode === 'light' }"
              :aria-pressed="themeMode === 'light'"
              title="亮色主题"
              @click="setTheme('light')"
            >
              <Sun :size="15" />
              <span>亮色</span>
            </button>
            <button
              type="button"
              class="theme-button"
              :class="{ 'is-active': themeMode === 'dark' }"
              :aria-pressed="themeMode === 'dark'"
              title="暗色主题"
              @click="setTheme('dark')"
            >
              <Moon :size="15" />
              <span>暗色</span>
            </button>
          </div>

          <span class="refresh-countdown">
            <Timer :size="15" />
            {{ isRefreshing ? '正在刷新' : `${refreshCountdown} 秒后刷新` }}
          </span>

          <button class="refresh-button" type="button" :disabled="isRefreshing" @click="refreshAll">
            <RefreshCw :size="16" :class="{ 'is-spinning': isRefreshing }" />
            <span>刷新</span>
          </button>
        </section>

        <section v-if="groupFilters.length > 1" class="group-filter" aria-label="分组筛选">
          <button
            v-for="item in groupFilters"
            :key="item.id"
            class="group-filter-button"
            :class="{ 'is-active': selectedGroup === item.id }"
            type="button"
            @click="selectedGroup = item.id"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.count }}</strong>
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

        <section v-for="group in visibleGroups" :key="group.name" class="service-section">
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
                <span class="service-state" :class="statusClass(monitor.tone)">{{ monitor.label }}</span>
              </div>

              <div class="service-snapshot">
                <div>
                  <span>24 小时可用率</span>
                  <strong>{{ formatPercent(monitor.uptime) }}</strong>
                </div>
                <div>
                  <span>7 天可用率</span>
                  <strong>{{ formatPercent(monitor.uptime7d) }}</strong>
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
                :style="{ '--beat-count': String(heartbeatSlotCount) }"
              >
                <span
                  v-for="(beat, index) in recentBeatSlots(monitor.beats)"
                  :key="beat.isPlaceholder ? `${monitor.id}-empty-${index}` : `${monitor.id}-${beat.time || index}`"
                  class="beat"
                  :class="beatClass(beat)"
                  :style="beatStyle(beat)"
                  :aria-label="beat.isPlaceholder ? '暂无心跳记录' : formatBeatTooltip(beat)"
                  :aria-hidden="beat.isPlaceholder"
                  :tabindex="beat.isPlaceholder ? -1 : 0"
                >
                  <span v-if="!beat.isPlaceholder" class="beat-tooltip" role="tooltip">
                    <strong>{{ statusLabel(beat.status) }}</strong>
                    <span>{{ formatDateTimeWithSeconds(beat.time) }}</span>
                    <span v-if="beat.status !== 0">延迟 {{ formatPing(beat.ping) }}</span>
                  </span>
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>

      <aside v-if="hasOfficialStatus" class="official-rail" aria-label="官方状态">
        <section class="openai-section">
          <div class="section-heading">
            <div>
              <p>外部官方消息</p>
              <h2>官方状态</h2>
            </div>
            <span>OpenAI / Claude</span>
          </div>

          <div v-if="officialStatusError" class="notice is-error">
            <AlertTriangle :size="18" />
            <span>{{ officialStatusError.statusMessage || officialStatusError.message }}</span>
          </div>

          <div v-else-if="visibleOfficialSource" class="official-status-stack">
            <div class="official-tabs" role="tablist" aria-label="官方状态来源">
              <button
                v-for="source in officialSources"
                :key="source.id"
                type="button"
                class="official-tab"
                :class="[officialTabClass(source), { 'is-active': selectedOfficialSource === source.id }]"
                role="tab"
                :aria-selected="selectedOfficialSource === source.id"
                @click="selectedOfficialSource = source.id"
              >
                <span class="official-tab-label">{{ source.name }}</span>
                <span class="official-tab-count">{{ officialTabCount(source) }}</span>
              </button>
            </div>

            <template v-if="visibleOfficialSource.items.length">
              <div class="openai-list">
                <a
                  v-for="item in visibleOfficialSource.items"
                  :key="`${visibleOfficialSource.id}-${item.id}`"
                  class="openai-item"
                  :class="officialItemClass(item.tone)"
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
            </template>

            <div v-else class="notice">
              <span>{{ visibleOfficialSource.name }} 暂无官方消息</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </main>
</template>
