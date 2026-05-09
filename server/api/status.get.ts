import { createError } from 'h3'

type KumaStatus = 0 | 1 | 2 | 3

type KumaHeartbeat = {
  time?: string
  status?: KumaStatus
  msg?: string
  ping?: number | null
}

type KumaMonitor = {
  id: number | string
  name?: string
  type?: string
  url?: string
  tags?: Array<{ name?: string; color?: string }>
}

type KumaGroup = {
  name?: string
  monitorList?: KumaMonitor[]
}

type KumaStatusPageResponse = {
  config?: {
    slug?: string
    title?: string
    description?: string
    icon?: string
  }
  incidents?: Incident[]
  publicGroupList?: KumaGroup[]
  maintenanceList?: Maintenance[]
}

type KumaHeartbeatResponse = {
  heartbeatList?: Record<string, KumaHeartbeat[]>
  uptimeList?: Record<string, number>
}

type Incident = {
  title?: string
  content?: string
  style?: string
  createdDate?: string
  created_date?: string
}

type Maintenance = {
  title?: string
  description?: string
  strategy?: string
  startDateTime?: string
  endDateTime?: string
}

type Beat = {
  time: string | null
  status: KumaStatus
  ping: number | null
}

type Monitor = {
  id: string
  name: string
  type: string
  url: string | null
  status: KumaStatus
  label: string
  tone: string
  uptime: number | null
  ping: number | null
  avgPing: number | null
  lastChecked: string | null
  message: string | null
  tags: string[]
  beats: Beat[]
}

const STATUS_COPY: Record<KumaStatus, { label: string; tone: string }> = {
  0: { label: '故障', tone: 'down' },
  1: { label: '正常', tone: 'up' },
  2: { label: '等待', tone: 'pending' },
  3: { label: '维护', tone: 'maintenance' }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const source = getSource(
    String(config.uptimeKumaBaseUrl || ''),
    String(config.uptimeKumaSlug || 'default')
  )
  const updatedAt = new Date().toISOString()

  if (!source.baseUrl) {
    return buildDemoPayload(updatedAt)
  }

  try {
    const [page, heartbeat] = await Promise.all([
      $fetch<KumaStatusPageResponse>(`${source.baseUrl}/api/status-page/${encodeURIComponent(source.slug)}`),
      $fetch<KumaHeartbeatResponse>(`${source.baseUrl}/api/status-page/heartbeat/${encodeURIComponent(source.slug)}`)
    ])

    return normalizePayload(page, heartbeat, {
      baseUrl: source.baseUrl,
      slug: source.slug,
      configured: true,
      updatedAt
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Uptime Kuma error'

    throw createError({
      statusCode: 502,
      statusMessage: '无法读取 Uptime Kuma 状态页数据',
      message
    })
  }
})

function getSource(rawBaseUrl: string, rawSlug: string) {
  const slug = rawSlug.trim().replace(/^\/+|\/+$/g, '') || 'default'
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/g, '')

  return { baseUrl, slug }
}

function normalizePayload(
  page: KumaStatusPageResponse,
  heartbeat: KumaHeartbeatResponse,
  source: { baseUrl: string; slug: string; configured: boolean; updatedAt: string }
) {
  const groups = (page.publicGroupList || [])
    .map((group, index) => ({
      name: group.name || (index === 0 ? '核心服务' : `服务组 ${index + 1}`),
      monitors: (group.monitorList || []).map((monitor) => normalizeMonitor(monitor, heartbeat))
    }))
    .filter((group) => group.monitors.length > 0)

  const monitors = groups.flatMap((group) => group.monitors)

  return {
    configured: source.configured,
    source: {
      baseUrl: source.baseUrl,
      slug: source.slug
    },
    page: {
      title: page.config?.title || 'Service Status',
      description: page.config?.description || '',
      icon: page.config?.icon || null
    },
    overall: buildOverall(monitors),
    incidents: normalizeIncidents(page.incidents || []),
    maintenanceList: normalizeMaintenance(page.maintenanceList || []),
    groups,
    updatedAt: source.updatedAt
  }
}

function normalizeMonitor(monitor: KumaMonitor, heartbeat: KumaHeartbeatResponse): Monitor {
  const id = String(monitor.id)
  const beats = (heartbeat.heartbeatList?.[id] || []).slice(-64).map((beat): Beat => ({
    time: beat.time || null,
    status: normalizeStatus(beat.status),
    ping: normalizeNullableNumber(beat.ping)
  }))
  const latest = beats.at(-1)
  const status = latest?.status ?? 2
  const uptime = normalizeUptime(heartbeat.uptimeList?.[`${id}_24`] ?? heartbeat.uptimeList?.[id])
  const pingValues = beats.map((beat) => beat.ping).filter((ping): ping is number => typeof ping === 'number')

  return {
    id,
    name: monitor.name || `Monitor ${id}`,
    type: monitor.type || 'service',
    url: monitor.url || null,
    status,
    label: STATUS_COPY[status].label,
    tone: STATUS_COPY[status].tone,
    uptime,
    ping: latest?.ping ?? null,
    avgPing: average(pingValues),
    lastChecked: latest?.time || null,
    message: null,
    tags: (monitor.tags || []).map((tag) => tag.name).filter((name): name is string => Boolean(name)),
    beats
  }
}

function buildOverall(monitors: Monitor[]) {
  const totals = {
    up: monitors.filter((monitor) => monitor.status === 1).length,
    down: monitors.filter((monitor) => monitor.status === 0).length,
    pending: monitors.filter((monitor) => monitor.status === 2).length,
    maintenance: monitors.filter((monitor) => monitor.status === 3).length
  }
  const measuredUptime = monitors
    .map((monitor) => monitor.uptime)
    .filter((uptime): uptime is number => typeof uptime === 'number')
  const measuredPing = monitors
    .map((monitor) => monitor.avgPing)
    .filter((ping): ping is number => typeof ping === 'number')

  let tone = 'pending'
  let label = '等待数据'
  let summary = '还没有可用的监控数据'

  if (totals.maintenance > 0) {
    tone = 'maintenance'
    label = '维护中'
    summary = `${totals.maintenance} 项服务处于维护状态`
  } else if (totals.down > 0 && totals.up > 0) {
    tone = 'degraded'
    label = '部分异常'
    summary = `${totals.down} 项服务正在故障`
  } else if (totals.down > 0) {
    tone = 'down'
    label = '服务故障'
    summary = '所有可用服务都处于故障状态'
  } else if (totals.up > 0 && totals.pending === 0) {
    tone = 'up'
    label = '系统正常'
    summary = '所有服务运行正常'
  } else if (totals.up > 0) {
    tone = 'up'
    label = '基本正常'
    summary = `${totals.pending} 项服务正在等待检测`
  }

  return {
    tone,
    label,
    summary,
    total: monitors.length,
    ...totals,
    avgUptime: average(measuredUptime),
    avgPing: average(measuredPing)
  }
}

function normalizeIncidents(incidents: Incident[]) {
  return incidents.map((incident) => ({
    title: incident.title || '事件',
    content: stripHtml(incident.content || ''),
    style: incident.style || 'warning',
    createdAt: incident.createdDate || incident.created_date || null
  }))
}

function normalizeMaintenance(maintenanceList: Maintenance[]) {
  return maintenanceList.map((item) => ({
    title: item.title || '计划维护',
    description: stripHtml(item.description || ''),
    strategy: item.strategy || null,
    startAt: item.startDateTime || null,
    endAt: item.endDateTime || null
  }))
}

function normalizeStatus(status: unknown): KumaStatus {
  if (status === 0 || status === 1 || status === 2 || status === 3) {
    return status
  }

  return 2
}

function normalizeUptime(value: unknown) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    return null
  }

  return Number((numberValue <= 1 ? numberValue * 100 : numberValue).toFixed(3))
}

function normalizeNullableNumber(value: unknown) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : null
}

function average(values: number[]) {
  if (!values.length) {
    return null
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, '').trim()
}

function buildDemoPayload(updatedAt: string) {
  const now = Date.now()
  const makeBeats = (status: KumaStatus, ping: number, badIndex = -1) =>
    Array.from({ length: 64 }, (_, index): Beat => {
      const currentStatus = index === badIndex ? 0 : status
      return {
        time: new Date(now - (63 - index) * 60_000).toISOString(),
        status: currentStatus,
        ping: currentStatus === 0 ? null : Math.round(ping + Math.sin(index / 3) * 8)
      }
    })

  const monitors: Monitor[] = [
    demoMonitor('web', '官网入口', 'http', 'https://example.com', 1, 99.997, 42, makeBeats(1, 42)),
    demoMonitor('api', 'Open API', 'http', 'https://api.example.com', 1, 99.982, 86, makeBeats(1, 86)),
    demoMonitor('jobs', '任务队列', 'push', null, 1, 99.91, 123, makeBeats(1, 123)),
    demoMonitor('db', '主数据库', 'port', null, 3, 99.95, 18, makeBeats(3, 18)),
    demoMonitor('cdn', '静态资源 CDN', 'http', 'https://cdn.example.com', 1, 99.999, 24, makeBeats(1, 24)),
    demoMonitor('pay', '支付回调', 'keyword', 'https://pay.example.com', 0, 98.741, null, makeBeats(1, 55, 63))
  ]

  const groups = [
    { name: '外部访问', monitors: monitors.slice(0, 3) },
    { name: '基础设施', monitors: monitors.slice(3) }
  ]

  return {
    configured: false,
    source: {
      baseUrl: '',
      slug: 'default'
    },
    page: {
      title: 'Service Status',
      description: '示例数据',
      icon: null
    },
    overall: buildOverall(monitors),
    incidents: [
      {
        title: '支付回调延迟升高',
        content: '部分区域的回调确认时间高于预期，正在处理。',
        style: 'warning',
        createdAt: new Date(now - 18 * 60_000).toISOString()
      }
    ],
    maintenanceList: [
      {
        title: '主数据库维护窗口',
        description: '只读副本已接管查询流量。',
        strategy: null,
        startAt: new Date(now - 32 * 60_000).toISOString(),
        endAt: new Date(now + 28 * 60_000).toISOString()
      }
    ],
    groups,
    updatedAt
  }
}

function demoMonitor(
  id: string,
  name: string,
  type: string,
  url: string | null,
  status: KumaStatus,
  uptime: number,
  avgPing: number | null,
  beats: Beat[]
): Monitor {
  return {
    id,
    name,
    type,
    url,
    status,
    label: STATUS_COPY[status].label,
    tone: STATUS_COPY[status].tone,
    uptime,
    ping: beats.at(-1)?.ping ?? null,
    avgPing,
    lastChecked: beats.at(-1)?.time || null,
    message: null,
    tags: [],
    beats
  }
}
