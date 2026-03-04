import type { Locale } from '@/i18n/config'

export type AboutSectionId = 'tech' | 'features' | 'highlights' | 'innovation'

export interface AboutSection {
  id: AboutSectionId
  title: string
  intro: string
  points: string[]
  tags?: string[]
}

export interface AboutPageContent {
  heroTitle: string
  heroSubtitle: string
  sections: AboutSection[]
}

export const aboutContentByLocale: Record<Locale, AboutPageContent> = {
  zh: {
    heroTitle: 'MLog：AI 驱动的双语博客系统',
    heroSubtitle:
      'MLog 是一个以内容为中心的无服务器博客，结合 AI 写作增强、前台管理发布、自动化运营与可扩展的工程化架构。',
    sections: [
      {
        id: 'tech',
        title: '技术栈与架构',
        intro: '我们用现代 Web 技术构建低运维、高可维护的发布链路，同时保持页面体验轻快稳定。',
        points: [
          'Next.js App Router + TypeScript + Tailwind v4 + Framer Motion',
          'Git + Markdown 内容驱动，支持 zh/en 双语路径与统一 frontmatter 合约',
          'Vercel 无服务器部署：生产自动发布、PR 预览、Cron 自动任务',
          'SEO 基建完整：metadata、canonical、hreflang、RSS、sitemap、robots'
        ],
        tags: ['Next.js', 'TypeScript', 'Tailwind v4', 'Vercel']
      },
      {
        id: 'features',
        title: '核心功能矩阵',
        intro: '首版围绕“写作、发布、发现、订阅、反馈”闭环设计，覆盖真实博客运营所需能力。',
        points: [
          '双语站点：/zh 与 /en，列表页支持搜索、标签、分类与可分享筛选参数',
          '文章详情支持目录锚点、上一篇/下一篇、阅读时长、语言回退提示',
          '后台管理支持新建、编辑、删除、图片上传、草稿与发布',
          '发布链路自动创建 PR 并尝试自动合并，失败回落人工处理'
        ],
        tags: ['Bilingual', 'Admin', 'Search', 'Publishing']
      },
      {
        id: 'highlights',
        title: '产品亮点',
        intro: '我们关注长期可演进，而不是一次性模板效果；每个功能都与可维护性和可观测性绑定。',
        points: [
          'Git 即内容源：所有内容变更可审计、可回滚、可协作',
          '前台与后台复用同一套玻璃态设计系统，视觉语言统一',
          '统计与评论可插拔：Umami + Giscus，在配置缺失时自动降级',
          '错误码、请求 ID、操作日志齐全，便于排障与治理'
        ],
        tags: ['Observability', 'Auditability', 'Glassmorphism', 'Composable']
      },
      {
        id: 'innovation',
        title: '创新能力',
        intro: 'AI 不是装饰，而是写作流程中的可控执行层，强调“可阻断、可回退、可解释”。',
        points: [
          'AI 双语写作增强：发布时自动补齐另一语言，并补全摘要、标签、分类',
          '多模型主备链路：Gemini / OpenAI 兼容 / DeepSeek / Qwen 失败自动切换',
          '失败阻断策略：关键 AI 步骤失败不会产生半成品发布',
          '自动化选题与发文：按 GitHub 热门候选与规则筛选，定时生成内容'
        ],
        tags: ['AI Bilingual', 'Provider Fallback', 'Fail-Safe', 'Automation']
      }
    ]
  },
  en: {
    heroTitle: 'MLog: An AI-Enhanced Bilingual Blogging System',
    heroSubtitle:
      'MLog is a serverless, content-first blog platform combining AI writing enhancement, in-place admin publishing, and automation-ready operations.',
    sections: [
      {
        id: 'tech',
        title: 'Tech Stack & Architecture',
        intro: 'We built a low-ops and maintainable publishing workflow while keeping performance and readability first.',
        points: [
          'Next.js App Router + TypeScript + Tailwind v4 + Framer Motion',
          'Git + Markdown content model with zh/en routing and strict frontmatter contracts',
          'Vercel serverless deployment: production auto-deploys, PR previews, and scheduled cron jobs',
          'Complete SEO baseline: metadata, canonical, hreflang, RSS, sitemap, and robots'
        ],
        tags: ['Next.js', 'TypeScript', 'Tailwind v4', 'Vercel']
      },
      {
        id: 'features',
        title: 'Core Feature Matrix',
        intro: 'The first release covers the end-to-end loop of writing, publishing, discovery, subscription, and feedback.',
        points: [
          'Bilingual site with /zh and /en, including search, tag, category, and shareable filter params',
          'Post detail supports TOC anchors, previous/next navigation, reading time, and locale fallback notice',
          'Admin supports create/edit/delete, media upload, draft save, and publishing',
          'Publishing flow creates a PR and attempts auto-merge, with manual fallback when needed'
        ],
        tags: ['Bilingual', 'Admin', 'Search', 'Publishing']
      },
      {
        id: 'highlights',
        title: 'Product Highlights',
        intro: 'The product is designed for long-term evolution, with maintainability and observability built into each workflow.',
        points: [
          'Git as source of truth: content changes are auditable, reviewable, and rollback-friendly',
          'Unified glassmorphism design language shared by public pages and admin pages',
          'Pluggable comments and analytics: Giscus + Umami with graceful fallback behavior',
          'Structured error codes, request IDs, and operation logs for fast troubleshooting'
        ],
        tags: ['Observability', 'Auditability', 'Glassmorphism', 'Composable']
      },
      {
        id: 'innovation',
        title: 'Innovation Layer',
        intro: 'AI here is an execution layer inside publishing, not a gimmick: blocking, fallback, and traceability come first.',
        points: [
          'AI bilingual enhancement: publish in one locale and auto-complete the counterpart locale',
          'Automatic frontmatter enrichment: summary, tags, and category generation when fields are empty',
          'Provider failover strategy: Gemini / OpenAI-compatible / DeepSeek / Qwen',
          'Automated topic pipeline: scheduled GitHub hot-project curation and content generation'
        ],
        tags: ['AI Bilingual', 'Provider Fallback', 'Fail-Safe', 'Automation']
      }
    ]
  }
}
