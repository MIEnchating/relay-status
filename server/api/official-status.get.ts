import { createError } from 'h3'
import { XMLParser } from 'fast-xml-parser'

type FeedSource = {
  id: string
  name: string
  feedUrl: string
  homepage: string
}

type FeedItem = {
  id: string
  title: string
  summary: string
  status: string
  tone: 'active' | 'resolved'
  publishedAt: string | null
  link: string
}

type FeedPayload = FeedSource & {
  updatedAt: string
  items: FeedItem[]
}

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  ignoreAttributes: false,
  trimValues: true
})

export default defineCachedEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const sources: FeedSource[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      feedUrl: String(config.openaiStatusFeedUrl || 'https://status.openai.com/feed.atom'),
      homepage: 'https://status.openai.com/'
    },
    {
      id: 'claude',
      name: 'Claude',
      feedUrl: String(config.claudeStatusFeedUrl || 'https://status.claude.com/history.rss'),
      homepage: 'https://status.claude.com/'
    }
  ]

  return Promise.all(sources.map(fetchFeedSource))
    .then((items) => ({
      updatedAt: new Date().toISOString(),
      sources: items
    }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown official status feed error'

      throw createError({
        statusCode: 502,
        statusMessage: '无法读取官方状态消息',
        message
      })
    })
}, {
  maxAge: 60,
  name: 'official-status-feeds'
})

function fetchFeedSource(source: FeedSource): Promise<FeedPayload> {
  return $fetch<string>(source.feedUrl, {
    responseType: 'text',
    headers: {
      accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml'
    }
  }).then((xml) => {
    const parsed = parser.parse(xml)
    const feed = parsed.feed || parsed.rss?.channel || {}
    const rawItems = normalizeArray(feed.entry || feed.item)
    const items = rawItems
      .map((item) => normalizeFeedItem(item, source))
      .filter((item): item is FeedItem => Boolean(item))
      .slice(0, 4)

    return {
      ...source,
      updatedAt: normalizeDateTime(textValue(feed.updated || feed.lastBuildDate || feed.pubDate)) || new Date().toISOString(),
      items
    }
  })
}

function normalizeFeedItem(raw: Record<string, unknown>, source: FeedSource): FeedItem | null {
  const rawTitle = cleanText(textValue(raw.title))
  const title = cleanTitle(rawTitle)
  const rawSummary = textValue(raw.summary || raw.description || raw.content)
  const statusSummary = cleanStatusText(rawSummary)
  const summary = cleanText(rawSummary)
  const link = normalizeUrl(linkValue(raw.link) || textValue(raw.id || raw.guid), source.homepage)
  const publishedAt = normalizeDateTime(textValue(raw.updated || raw.published || raw.pubDate))

  if (!title) {
    return null
  }

  const status = extractStatus(statusSummary, rawTitle)

  return {
    id: textValue(raw.id || raw.guid) || link || title,
    title,
    summary,
    status: translateStatus(status),
    tone: status.toLowerCase() === 'resolved' ? 'resolved' : 'active',
    publishedAt,
    link
  }
}

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return textValue(value[0])
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return textValue(record['#cdata'] || record['#text'] || record._text)
  }

  return ''
}

function linkValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const alternate = value.find((item) => {
      const record = item as Record<string, unknown>

      return record?.['@_rel'] === 'alternate' || !record?.['@_rel']
    })

    return linkValue(alternate)
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return textValue(record['@_href'] || record.href)
  }

  return ''
}

function extractStatus(summary: string, title: string) {
  const summaryMatch = summary.match(/status:\s*(resolved|investigating|identified|monitoring|update)\b/i)
  const titleMatch = title.match(/^(resolved|investigating|identified|monitoring|update)\s*[:|-]/i)
  const timelineMatch = summary.match(/\b(resolved|investigating|identified|monitoring|update)\s*[-:]/i)

  return summaryMatch?.[1]?.trim() || titleMatch?.[1]?.trim() || timelineMatch?.[1]?.trim() || 'Update'
}

function translateStatus(status: string) {
  const key = status.toLowerCase()
  const map: Record<string, string> = {
    resolved: '已恢复',
    investigating: '调查中',
    identified: '已定位',
    monitoring: '观察中',
    update: '更新'
  }

  return map[key] || status
}

function cleanTitle(value: string) {
  return value.replace(/^(resolved|investigating|identified|monitoring|update)\s*[:|-]\s*/i, '').trim()
}

function cleanText(value: string) {
  return cleanStatusText(value)
    .replace(/^status:\s*(resolved|investigating|identified|monitoring|update)\b/i, '')
    .trim()
}

function cleanStatusText(value: string) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeDateTime(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function normalizeUrl(value: string, homepage: string) {
  if (!value) {
    return homepage
  }

  return value.replace(`${homepage}/`, homepage)
}
