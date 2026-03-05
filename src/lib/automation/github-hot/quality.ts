import type { GithubRepoEvidence } from '@/types/automation'

export type GithubHotQualityResult = {
  passed: boolean
  failedChecks: string[]
}

const REQUIRED_H2_TITLES = ['项目概览', '已确认事实（数据卡）', '核心能力与适用边界', '观点与推断', '30分钟上手路径', '风险与限制', '证据来源']

function normalizeHeading(value: string): string {
  return value.replace(/\s+/g, '').trim()
}

function extractH2Titles(markdown: string): string[] {
  return markdown
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('## '))
    .map(line => line.replace(/^##\s+/, '').trim())
}

function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n')
  const startIndex = lines.findIndex(line => normalizeHeading(line.replace(/^##\s+/, '')) === normalizeHeading(heading) && line.trim().startsWith('## '))
  if (startIndex < 0) {
    return ''
  }

  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith('## ')) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex + 1, endIndex).join('\n').trim()
}

function countChineseCharacters(input: string): number {
  const matched = input.match(/[\u4e00-\u9fff]/g)
  return matched ? matched.length : 0
}

function parseMetric(section: string, keywords: string[]): number | null {
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escaped}[^\\d]{0,12}([\\d,]+)`, 'i')
    const match = section.match(regex)
    if (match?.[1]) {
      const parsed = Number(match[1].replace(/,/g, ''))
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function hasEvidenceTimestamp(section: string, fetchedAt: string): boolean {
  const day = fetchedAt.slice(0, 10)
  return section.includes(day) || /抓取时间|fetched\s+at/i.test(section)
}

export function validateGithubHotGeneratedPost(input: {
  markdown: string
  evidence: GithubRepoEvidence
  minChineseChars?: number
}): GithubHotQualityResult {
  const markdown = input.markdown || ''
  const failedChecks: string[] = []
  const minChineseChars = input.minChineseChars ?? 1200

  const h2Titles = extractH2Titles(markdown).map(normalizeHeading)
  for (const heading of REQUIRED_H2_TITLES) {
    if (!h2Titles.includes(normalizeHeading(heading))) {
      failedChecks.push(`缺少必需章节：${heading}`)
    }
  }

  if (!markdown.includes(input.evidence.url)) {
    failedChecks.push('正文未包含仓库 URL')
  }

  const confirmedFactsSection = extractSection(markdown, '已确认事实（数据卡）')
  const opinionSection = extractSection(markdown, '观点与推断')
  const sourceSection = extractSection(markdown, '证据来源')

  if (!confirmedFactsSection) {
    failedChecks.push('缺少“已确认事实（数据卡）”章节内容')
  }
  if (!opinionSection) {
    failedChecks.push('缺少“观点与推断”章节内容')
  }
  if (!sourceSection) {
    failedChecks.push('缺少“证据来源”章节内容')
  }

  const zhChars = countChineseCharacters(markdown)
  if (zhChars < minChineseChars) {
    failedChecks.push(`正文中文字符不足：${zhChars}/${minChineseChars}`)
  }

  const stars = parseMetric(confirmedFactsSection, ['Stars', 'Star', '⭐', '星标'])
  const forks = parseMetric(confirmedFactsSection, ['Forks', 'Fork', '分叉'])
  const issues = parseMetric(confirmedFactsSection, ['Open Issues', 'Issues', 'Issue', '未关闭 Issue', '问题数'])

  if (stars !== null && stars !== input.evidence.stars) {
    failedChecks.push(`数据卡 Stars 与证据不一致：${stars} != ${input.evidence.stars}`)
  }
  if (forks !== null && forks !== input.evidence.forks) {
    failedChecks.push(`数据卡 Forks 与证据不一致：${forks} != ${input.evidence.forks}`)
  }
  if (issues !== null && issues !== input.evidence.openIssues) {
    failedChecks.push(`数据卡 Open Issues 与证据不一致：${issues} != ${input.evidence.openIssues}`)
  }

  const sourceHasUrl = /https?:\/\/\S+/i.test(sourceSection)
  if (!sourceHasUrl) {
    failedChecks.push('证据来源章节未包含可访问 URL')
  }

  if (!hasEvidenceTimestamp(sourceSection, input.evidence.fetchedAt)) {
    failedChecks.push('证据来源章节缺少抓取时间说明')
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks
  }
}
