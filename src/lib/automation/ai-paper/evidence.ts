import type { AiPaperCandidate, AiPaperEvidence } from '@/types/automation'

export function buildAiPaperEvidence(candidate: AiPaperCandidate): AiPaperEvidence {
  const sourceUrls = Array.from(
    new Set(
      [
        candidate.paperUrl,
        candidate.pwcUrl || '',
        candidate.codeUrl || ''
      ]
        .map(item => item.trim())
        .filter(Boolean)
    )
  )

  return {
    arxivId: candidate.arxivId,
    title: candidate.title,
    summary: candidate.summary,
    authors: candidate.authors,
    categories: candidate.categories,
    publishedAt: candidate.publishedAt,
    updatedAt: candidate.updatedAt,
    paperUrl: candidate.paperUrl,
    pwcUrl: candidate.pwcUrl,
    codeUrl: candidate.codeUrl,
    hasCode: candidate.hasCode,
    signalsScore: candidate.signalsScore,
    sourceUrls,
    fetchedAt: new Date().toISOString()
  }
}
