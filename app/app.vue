<script setup lang="ts">
import {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  Check,
  ExternalLink,
  Layers,
  Moon,
  RefreshCw,
  Sun,
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
type DashboardView = 'services' | 'official'

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
const activeView = ref<DashboardView>('services')
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
const hasAlerts = computed(() => Boolean(incidents.value.length || maintenanceList.value.length))
const officialSources = computed(() => officialStatus.value?.sources || [])
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
const visibleOfficialSource = computed(() => {
  return officialSources.value.find((source) => source.id === selectedOfficialSource.value) || officialSources.value[0] || null
})
const statusCounts = [
  { label: '正常', tone: 'up', icon: Check },
  { label: '故障', tone: 'down', icon: AlertCircle },
  { label: '等待', tone: 'pending', icon: AlarmClock },
  { label: '维护', tone: 'maintenance', icon: Wrench }
] as const

useHead(() => ({
  title: pageTitle.value,
  htmlAttrs: {
    lang: 'zh-CN',
    'data-theme': themeMode.value
  },
  meta: [
    {
      name: 'theme-color',
      content: isDarkTheme.value ? '#151513' : '#faf9f5'
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
  if (window.location.hash === '#official') {
    activeView.value = 'official'
  }

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

function selectView(view: DashboardView) {
  activeView.value = view
  window.history.replaceState(window.history.state, '', `#${view}`)
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function toggleTheme() {
  themeMode.value = isDarkTheme.value ? 'light' : 'dark'
  window.localStorage.setItem('relay-status-theme', themeMode.value)
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

function moveBeatFocus(event: KeyboardEvent) {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
  const step = steps[event.key]
  if (!step) {
    return
  }

  const history = event.currentTarget as HTMLElement
  const beats = [...history.querySelectorAll<HTMLButtonElement>('button.beat')]
  const index = beats.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) {
    return
  }

  event.preventDefault()
  beats[Math.max(0, Math.min(beats.length - 1, index + step))]?.focus()
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '暂无'
  }

  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}%`
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
  <header class="topbar">
    <div class="topbar-inner page-width">
      <a class="brand" href="#services" @click.prevent="selectView('services')">
        <span class="brand-icon"><Activity :size="21" aria-hidden="true" /></span>
        <span>{{ pageTitle }}</span>
      </a>

      <div class="page-nav" role="group" aria-label="切换状态视图">
        <button type="button" aria-controls="services" :aria-pressed="activeView === 'services'" @click="selectView('services')">
          服务监控
        </button>
        <button type="button" aria-controls="official" :aria-pressed="activeView === 'official'" @click="selectView('official')">
          官方动态
        </button>
      </div>

      <div class="toolbar" role="group" aria-label="页面设置">
        <span v-if="data && !data.configured" class="demo-label">示例数据</span>
        <button
          class="icon-button"
          type="button"
          :aria-label="isDarkTheme ? '切换到亮色主题' : '切换到暗色主题'"
          :title="isDarkTheme ? '切换到亮色主题' : '切换到暗色主题'"
          @click="toggleTheme"
        >
          <Sun v-if="isDarkTheme" :size="18" aria-hidden="true" />
          <Moon v-else :size="18" aria-hidden="true" />
        </button>
        <button class="icon-button" type="button" title="刷新状态" aria-label="刷新状态" :disabled="isRefreshing" @click="refreshAll">
          <RefreshCw :size="17" :class="{ 'is-spinning': isRefreshing }" aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>

  <main id="status" class="page-width dashboard">
    <section v-show="activeView === 'services'" id="services" aria-labelledby="services-heading">
      <div v-if="error" class="notice is-error" role="alert">
        <AlertTriangle :size="18" aria-hidden="true" />
        <span>{{ error.statusMessage || error.message }}</span>
      </div>

      <div class="status-strip" :class="statusClass(overall?.tone)">
        <div class="status-overview">
          <span class="status-signal" aria-hidden="true"><Activity :size="18" /></span>
          <div class="status-copy">
            <strong>{{ overall?.label || '状态暂不可用' }}</strong>
            <p>{{ overall?.summary || '请稍后刷新，重新获取服务状态。' }}</p>
          </div>
        </div>

        <div v-if="overall" class="status-counts" role="group" aria-label="全部服务状态汇总">
          <div v-for="item in statusCounts" :key="item.tone" class="status-count" :class="statusClass(item.tone)">
            <component :is="item.icon" :size="14" aria-hidden="true" />
            <span>{{ item.label }}</span>
            <strong>{{ overall[item.tone] }}</strong>
          </div>
        </div>

        <span class="refresh-timer">
          <AlarmClock :size="14" aria-hidden="true" />
          {{ isRefreshing ? '正在刷新' : `${refreshCountdown} 秒后刷新` }}
        </span>
      </div>

      <div class="section-heading">
        <div class="section-title">
          <h1 id="services-heading">服务监控</h1>
          <span v-if="overall">共 {{ overall.total }} 项</span>
          <a v-if="hasAlerts" class="events-link" href="#events">事件与维护</a>
        </div>
        <div v-if="groupFilters.length > 1" class="group-filter" role="group" aria-label="分组筛选">
          <button
            v-for="item in groupFilters"
            :key="item.id"
            class="group-filter-button"
            type="button"
            :aria-pressed="selectedGroup === item.id"
            @click="selectedGroup = item.id"
          >
            {{ item.label }} <span>{{ item.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="!visibleGroups.length" class="empty-state">
        <Layers :size="22" aria-hidden="true" />
        <p>{{ error ? '服务监控暂不可用' : '暂无监控服务' }}</p>
      </div>

      <Transition name="panel">
        <div v-if="visibleGroups.length" :key="selectedGroup" class="service-groups">
          <section v-for="group in visibleGroups" :key="group.name" class="service-section">
            <div class="group-heading">
              <Layers :size="15" aria-hidden="true" />
              <h2>{{ group.name }}</h2>
            </div>

            <div class="service-grid">
              <article v-for="monitor in group.monitors" :key="monitor.id" class="service-card" :class="statusClass(monitor.tone)">
                <header class="service-header">
                  <span class="service-icon"><Activity :size="18" aria-hidden="true" /></span>
                  <div class="service-name">
                    <h3>{{ monitor.name }}</h3>
                    <span>{{ formatMonitorType(monitor.type) }}</span>
                  </div>
                  <span class="service-state"><span class="status-dot" aria-hidden="true" />{{ monitor.label }}</span>
                </header>

                <dl class="service-metrics">
                  <div>
                    <dt>24 小时可用率</dt>
                    <dd>{{ formatPercent(monitor.uptime) }}</dd>
                  </div>
                  <div>
                    <dt>7 天可用率</dt>
                    <dd>{{ formatPercent(monitor.uptime7d) }}</dd>
                  </div>
                  <div>
                    <dt>延迟</dt>
                    <dd>{{ formatPing(monitor.ping ?? monitor.avgPing) }}</dd>
                  </div>
                  <div>
                    <dt>最近检测</dt>
                    <dd>{{ formatRelativeTime(monitor.lastChecked) }}</dd>
                  </div>
                </dl>

                <div class="service-history">
                  <div class="history-heading">
                    <span>近期心跳</span>
                    <span>最近 {{ heartbeatSlotCount }} 次</span>
                  </div>
                  <div
                    class="sparkline"
                    role="group"
                    :aria-label="`${monitor.name}的近期心跳，使用左右方向键浏览`"
                    :style="{ '--beat-count': heartbeatSlotCount }"
                    @keydown="moveBeatFocus"
                  >
                    <template
                      v-for="(beat, index) in recentBeatSlots(monitor.beats)"
                      :key="beat.isPlaceholder ? `empty-${index}` : `${beat.time || 'beat'}-${index}`"
                    >
                      <span v-if="beat.isPlaceholder" class="beat is-empty" aria-hidden="true" />
                      <button
                        v-else
                        type="button"
                        class="beat"
                        :class="beatClass(beat)"
                        :style="{ '--beat-index': index }"
                        :tabindex="index === heartbeatSlotCount - 1 ? 0 : -1"
                        :aria-label="formatBeatTooltip(beat)"
                      >
                        <span class="beat-tooltip" aria-hidden="true">{{ formatBeatTooltip(beat) }}</span>
                      </button>
                    </template>
                  </div>
                  <div class="history-axis" aria-hidden="true">
                    <span>较早</span>
                    <span>最新</span>
                  </div>
                </div>
              </article>
            </div>

            <p v-if="!group.monitors.length" class="empty-state">此分组暂无监控服务</p>
          </section>
        </div>
      </Transition>

      <section v-if="hasAlerts" id="events" class="events-section" aria-labelledby="events-heading">
        <div class="section-heading">
          <h2 id="events-heading">事件与维护</h2>
        </div>
        <div class="alerts-band">
          <article v-for="incident in incidents" :key="`incident-${incident.title}-${incident.createdAt}`" class="alert-card is-degraded">
            <span class="count-icon"><AlertTriangle :size="18" aria-hidden="true" /></span>
            <div class="alert-copy">
              <h3>{{ incident.title }}</h3>
              <time :datetime="incident.createdAt || undefined">{{ formatDateTime(incident.createdAt) }}</time>
              <p>{{ incident.content }}</p>
            </div>
          </article>

          <article v-for="item in maintenanceList" :key="`maintenance-${item.title}-${item.startAt}`" class="alert-card is-maintenance">
            <span class="count-icon"><Wrench :size="18" aria-hidden="true" /></span>
            <div class="alert-copy">
              <h3>{{ item.title }}</h3>
              <span class="event-time">{{ formatDateTime(item.startAt) }} – {{ formatDateTime(item.endAt) }}</span>
              <p>{{ item.description }}</p>
            </div>
          </article>
        </div>
      </section>
    </section>

    <section v-show="activeView === 'official'" id="official" aria-labelledby="official-heading">
      <div class="section-heading">
        <h1 id="official-heading">官方动态</h1>
        <div v-if="visibleOfficialSource && !officialStatusError" class="official-tabs" role="group" aria-label="官方状态来源">
          <button
            v-for="source in officialSources"
            :key="source.id"
            class="official-tab"
            :class="officialTabClass(source)"
            type="button"
            :aria-pressed="selectedOfficialSource === source.id"
            @click="selectedOfficialSource = source.id"
          >
            <span>{{ source.name }}</span>
            <span class="official-tab-count">{{ officialTabCount(source) }}</span>
          </button>
        </div>
      </div>

      <div v-if="officialStatusError" class="notice is-error" role="alert">
        <AlertTriangle :size="18" aria-hidden="true" />
        <span>{{ officialStatusError.statusMessage || officialStatusError.message }}</span>
      </div>

      <template v-else-if="visibleOfficialSource">
        <Transition name="panel">
          <div :key="visibleOfficialSource.id" class="official-feed">
            <ul v-if="visibleOfficialSource.items.length" class="official-list">
              <li v-for="item in visibleOfficialSource.items" :key="item.id">
                <a
                  class="official-item"
                  :class="`is-${item.tone}`"
                  :href="item.link"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div class="official-meta">
                    <span class="official-item-status">{{ item.status }}</span>
                    <time :datetime="item.publishedAt || undefined">{{ formatRelativeTime(item.publishedAt) }}</time>
                  </div>
                  <h2>{{ item.title }}</h2>
                  <p v-if="item.summary">{{ item.summary }}</p>
                  <ExternalLink :size="14" class="official-link-icon" aria-hidden="true" />
                </a>
              </li>
            </ul>

            <p v-else class="empty-state">{{ visibleOfficialSource.name }} 暂无官方消息</p>

            <a class="official-home" :href="visibleOfficialSource.homepage" target="_blank" rel="noreferrer">
              打开 {{ visibleOfficialSource.name }} 状态页
              <ExternalLink :size="13" aria-hidden="true" />
            </a>
          </div>
        </Transition>
      </template>
      <p v-else class="empty-state">暂无官方消息</p>
    </section>
  </main>
</template>
