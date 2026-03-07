import type { AiPaperEvidence } from '@/types/automation'

export type AiPaperQualityResult = {
  passed: boolean
  failedChecks: string[]
}

const REQUIRED_H2_TITLES = ['论文一句话结论', '已确认事实（论文信息卡）', '方法与创新点', '结果与可信边界', '30分钟复现实操路径', '适用/不适用场景', '证据来源']

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

function hasEvidenceTimestamp(section: string, fetchedAt: string): boolean {
  const day = fetchedAt.slice(0, 10)
  return section.includes(day) || /抓取时间|fetched\s+at/i.test(section)
}

export function validateAiPaperGeneratedPost(input: {
  markdown: string
  evidence: AiPaperEvidence
  minChineseChars?: number
}): AiPaperQualityResult {
  const markdown = input.markdown || ''
  const failedChecks: string[] = []
  const minChineseChars = input.minChineseChars ?? 1200

  const h2Titles = extractH2Titles(markdown).map(normalizeHeading)
  for (const heading of REQUIRED_H2_TITLES) {
    if (!h2Titles.includes(normalizeHeading(heading))) {
      failedChecks.push(`缺少必需章节：${heading}`)
    }
  }

  if (!markdown.includes(input.evidence.paperUrl)) {
    failedChecks.push('正文未包含 arXiv 论文链接')
  }

  const zhChars = countChineseCharacters(markdown)
  if (zhChars < minChineseChars) {
    failedChecks.push(`正文中文字符不足：${zhChars}/${minChineseChars}`)
  }

  const factsSection = extractSection(markdown, '已确认事实（论文信息卡）')
  const sourceSection = extractSection(markdown, '证据来源')
  const pathSection = extractSection(markdown, '30分钟复现实操路径')

  if (!factsSection) {
    failedChecks.push('缺少“已确认事实（论文信息卡）”章节内容')
  }
  if (!sourceSection) {
    failedChecks.push('缺少“证据来源”章节内容')
  }
  if (!pathSection) {
    failedChecks.push('缺少“30分钟复现实操路径”章节内容')
  }

  const sourceUrls = Array.from(sourceSection.matchAll(/https?:\/\/\S+/gi)).map(match => match[0])
  const evidenceSourceCount = Math.max(1, input.evidence.sourceUrls.length)
  const requiredSourceCount = Math.min(2, evidenceSourceCount)
  if (sourceUrls.length < requiredSourceCount) {
    failedChecks.push(`证据来源章节至少需要 ${requiredSourceCount} 个可访问 URL`)
  }

  if (!hasEvidenceTimestamp(sourceSection, input.evidence.fetchedAt)) {
    failedChecks.push('证据来源章节缺少抓取时间说明')
  }

  if (!factsSection.includes(input.evidence.arxivId)) {
    failedChecks.push('论文信息卡未包含 arXiv ID')
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks
  }
}
