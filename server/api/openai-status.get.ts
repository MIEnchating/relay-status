import { createError } from 'h3'
import { XMLParser } from 'fast-xml-parser'

type FeedItem = {
  id: string
  title: string
  summary: string
  status: string
  tone: 'active' | 'resolved'
  publishedAt: string | null
  link: string
}

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  ignoreAttributes: false,
  trimValues: true
})

export default defineCachedEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const feedUrl = String(config.openaiStatusFeedUrl || 'https://status.openai.com/feed.atom')

  try {
    const xml = await $fetch<string>(feedUrl, {
      responseType: 'text',
      headers: {
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml'
      }
    })
    const parsed = parser.parse(xml)
    const feed = parsed.feed || parsed.rss?.channel || {}
    const rawItems = normalizeArray(feed.entry || feed.item)
    const items = rawItems.map(normalizeFeedItem).filter((item): item is FeedItem => Boolean(item)).slice(0, 5)

    return {
      source: textValue(feed.title) || 'OpenAI status',
      feedUrl,
      updatedAt: normalizeDateTime(textValue(feed.updated || feed.lastBuildDate)) || new Date().toISOString(),
      items
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OpenAI status feed error'

    throw createError({
      statusCode: 502,
      statusMessage: '无法读取 OpenAI 官方状态消息',
      message
    })
  }
}, {
  maxAge: 300,
  name: 'openai-status-feed'
})

function normalizeFeedItem(raw: Record<string, unknown>): FeedItem | null {
  const rawTitle = cleanText(textValue(raw.title))
  const rawSummary = textValue(raw.summary || raw.description || raw.content)
  const title = translateOpenAIText(rawTitle)
  const summary = translateOpenAIText(cleanText(rawSummary))
  const link = normalizeOpenAIUrl(linkValue(raw.link) || textValue(raw.id || raw.guid))
  const publishedAt = normalizeDateTime(textValue(raw.updated || raw.published || raw.pubDate))

  if (!rawTitle) {
    return null
  }

  const status = extractStatus(rawSummary)

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

function extractStatus(summary: string) {
  const match = summary.match(/status:\s*([a-z ]+)/i)

  return match?.[1]?.trim() || 'Update'
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

function translateOpenAIText(value: string) {
  if (!value) {
    return ''
  }

  let text = value.replace(/\(([^)]+)\)/g, (_, status: string) => `（${translateComponentStatus(status)}）`)

  for (const [pattern, replacement] of sentenceTranslations) {
    text = text.replace(pattern, replacement)
  }

  for (const [pattern, replacement] of glossaryTranslations) {
    text = text.replace(pattern, replacement)
  }

  return normalizeChineseText(text)
}

function translateComponentStatus(status: string) {
  const key = status.trim().toLowerCase()
  const map: Record<string, string> = {
    operational: '正常',
    'degraded performance': '性能下降',
    'partial outage': '部分故障',
    'major outage': '严重故障',
    'under maintenance': '维护中'
  }

  return map[key] || status
}

const sentenceTranslations: Array<[RegExp, string]> = [
  [/All impacted services have now fully recovered\./gi, '所有受影响的服务现已完全恢复。'],
  [/We are still investigating the issue for the listed services\./gi, '我们仍在调查所列服务的问题。'],
  [/We are investigating an issue for the listed services\./gi, '我们正在调查所列服务的问题。'],
  [/We are investigating an issue with ([^.]+)\./gi, '我们正在调查 $1 的问题。'],
  [/We have identified the issue and are working on a remediation\./gi, '我们已经定位问题，正在处理修复。'],
  [/We have identified the issue and are monitoring the results\./gi, '我们已经定位问题，正在观察恢复情况。'],
  [/We are monitoring the results\./gi, '我们正在观察恢复情况。'],
  [/This incident has been resolved\./gi, '该事件已恢复。'],
  [/Users may experience issue with ([^.]+)/gi, '用户可能遇到 $1 问题'],
  [/Elevated ([0-9]+) Errors/gi, '$1 错误率升高'],
  [/OAuth Account Creation \/ Login Error/gi, 'OAuth 账号创建 / 登录错误'],
  [/Selected Model is at Capacity/gi, '所选模型已满载'],
  [/([A-Za-z0-9 /-]+) have degraded performance/gi, '$1 出现性能下降'],
  [/Affected components?/gi, '受影响组件：']
]

const glossaryTranslations: Array<[RegExp, string]> = [
  [/\bAPI orgs\b/gi, 'API 组织'],
  [/\bAPI organizations\b/gi, 'API 组织'],
  [/\borgs\b/gi, '组织'],
  [/\bworkspaces\b/gi, '工作区'],
  [/\bCodex Cloud tasks\b/gi, 'Codex Cloud 任务'],
  [/\bVS Code extension\b/gi, 'VS Code 扩展'],
  [/\bAccount Creation\b/gi, '账号创建'],
  [/\bLogin\b/gi, '登录'],
  [/\bImages\b/gi, '图像'],
  [/\bAudio\b/gi, '音频'],
  [/\bFiles\b/gi, '文件'],
  [/\bFine-tuning\b/gi, '微调'],
  [/\bRealtime\b/gi, '实时'],
  [/\bModerations\b/gi, '内容审核'],
  [/\bOperational\b/gi, '正常'],
  [/\bDegraded performance\b/gi, '性能下降'],
  [/\bPartial outage\b/gi, '部分故障'],
  [/\bMajor outage\b/gi, '严重故障'],
  [/\bInvestigating\b/gi, '调查中'],
  [/\bIdentified\b/gi, '已定位'],
  [/\bMonitoring\b/gi, '观察中'],
  [/\bResolved\b/gi, '已恢复'],
  [/\bError\b/gi, '错误'],
  [/\bErrors\b/gi, '错误'],
  [/\band\b/gi, '和']
]

function normalizeChineseText(value: string) {
  return value
    .replace(/"([^"]+)"/g, '“$1”')
    .replace(/\s+/g, ' ')
    .replace(/。\s+/g, '。')
    .replace(/：\s+/g, '：')
    .replace(/\s+（/g, '（')
    .replace(/）\s+(?=[A-Za-z0-9])/g, '）、')
    .replace(/\s+([，。；：）])/g, '$1')
    .replace(/（\s+/g, '（')
    .replace(/\s+）/g, '）')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .trim()
}

function cleanText(value: string) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/^status:\s*[a-z ]+/i, '')
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

function normalizeOpenAIUrl(value: string) {
  if (!value) {
    return 'https://status.openai.com/'
  }

  return value.replace('https://status.openai.com//', 'https://status.openai.com/')
}
