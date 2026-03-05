import type { Locale } from '@/i18n/config'

export type AboutSectionId = 'tech' | 'features' | 'highlights' | 'innovation'

export interface AboutSection {
  id: AboutSectionId
  title: string
  intro: string
  points: string[]
  tags?: string[]
}

export interface AboutActionLink {
  label: string
  href: string
  external?: boolean
}

export interface AboutPageContent {
  heroTitle: string
  heroSubtitle: string
  sections: AboutSection[]
  actionLinks: AboutActionLink[]
  updatedAt: string
}

export const aboutContentByLocale: Record<Locale, AboutPageContent> = {
  zh: {
    heroTitle: 'MLog：AI 驱动的双语工程博客系统',
    heroSubtitle:
      'MLog 是一套内容优先、严格双仓隔离、无服务器部署的博客架构，覆盖写作增强、管理发布、自动发文与教程公开镜像。',
    sections: [
      {
        id: 'tech',
        title: '技术栈与架构',
        intro: '我们围绕“可维护 + 可扩展 + 可审计”设计工程骨架，而不是仅做主题皮肤。',
        points: [
          'Next.js App Router + TypeScript + Tailwind v4 + Framer Motion',
          'Git + Markdown 内容模型，按 slug 与 locale 组织并严格 frontmatter 校验',
          '双仓隔离：公开代码仓 + 私有内容仓（文章、系统配置、上传媒体）',
          'Vercel 无服务器部署：主分支生产发布、PR 预览、Cron 定时任务'
        ],
        tags: ['Next.js', 'TypeScript', 'Dual Repo', 'Vercel']
      },
      {
        id: 'features',
        title: '核心功能矩阵',
        intro: '围绕真实运营流程构建从写作到上线的闭环，保证扩展时仍保持协议稳定。',
        points: [
          '双语站点：/zh 与 /en，列表支持搜索、标签、分类与 URL 参数分享',
          '管理后台支持新建、编辑、删除、图片上传、草稿保存与一键发布',
          '详情页提供目录、上一篇/下一篇、评论、统计、发布快照卡与实时快照卡',
          '教程白名单镜像：仅指定教程同步到公开 docs，其余文章保持私有'
        ],
        tags: ['Bilingual', 'Admin', 'Repo Cards', 'Tutorial Mirror']
      },
      {
        id: 'highlights',
        title: '产品亮点',
        intro: '每个关键能力都与可观测和可回滚机制绑定，避免“看起来自动化，实际不可控”。',
        points: [
          'Git 即内容源：内容变更可审计、可评审、可回滚',
          '统一设计系统：前台与后台共享玻璃态 token 与组件语言',
          '发布链路 PR 化：自动创建 PR、自动尝试合并、失败可人工接管',
          '部署联动：内容合并后可自动触发部署，避免“已发布但前台未更新”'
        ],
        tags: ['Auditability', 'Observability', 'Glassmorphism', 'Deploy Hook']
      },
      {
        id: 'innovation',
        title: '创新能力',
        intro: 'AI 作为发布流程执行层接入，强调主备、阻断、可解释，不把失败留给线上。',
        points: [
          'AI 双语增强：发布时自动补齐另一语言，并补全摘要、标签、分类',
          '多 Provider 主备链路：Gemini / OpenAI 兼容 / DeepSeek / Qwen',
          'GitHub 爆火日报自动化：08:00 定时选题、去重、写作、发布与固定标签',
          '质量门禁：结构、证据与数值校验不过时直接阻断，避免低质量自动文上线'
        ],
        tags: ['AI Bilingual', 'Provider Fallback', 'Hot Daily', 'Quality Gate']
      }
    ],
    actionLinks: [
      {
        label: '查看站内教程（中文）',
        href: '/zh/blog/mlog-open-source-deploy-guide'
      },
      {
        label: '查看公开 Docs 镜像（中文）',
        href: 'https://github.com/2982136527/mlog/blob/main/docs/tutorials/mlog-open-source-deploy-guide.zh.md',
        external: true
      }
    ],
    updatedAt: '2026-03-05'
  },
  en: {
    heroTitle: 'MLog: AI-Enhanced Bilingual Engineering Blog',
    heroSubtitle:
      'MLog is a content-first, strict dual-repo, serverless blogging architecture that integrates AI writing enhancement, admin publishing, daily automation, and tutorial mirroring.',
    sections: [
      {
        id: 'tech',
        title: 'Tech Stack & Architecture',
        intro: 'The foundation prioritizes maintainability, scalability, and auditability over a one-off visual template.',
        points: [
          'Next.js App Router + TypeScript + Tailwind v4 + Framer Motion',
          'Git + Markdown model with locale-aware slug folders and strict frontmatter contracts',
          'Strict dual-repo isolation: public code repo + private content repo',
          'Vercel serverless workflow: production from main, PR previews, scheduled cron jobs'
        ],
        tags: ['Next.js', 'TypeScript', 'Dual Repo', 'Vercel']
      },
      {
        id: 'features',
        title: 'Core Feature Matrix',
        intro: 'From writing to production, each capability is built for stable long-term operation.',
        points: [
          'Bilingual site with /zh and /en, plus search/tag/category filtering and shareable query params',
          'Admin supports create/edit/delete, media upload, draft save, and one-click publish',
          'Post pages include TOC, prev/next navigation, comments, analytics, static snapshot card, and live snapshot card',
          'Tutorial whitelist mirroring: only selected tutorial content is mirrored to public docs'
        ],
        tags: ['Bilingual', 'Admin', 'Repo Cards', 'Tutorial Mirror']
      },
      {
        id: 'highlights',
        title: 'Product Highlights',
        intro: 'Critical workflows are tied to observability and rollback paths, not hidden black boxes.',
        points: [
          'Git as source of truth: all content changes are reviewable, traceable, and rollback-friendly',
          'Unified glassmorphism language shared between public pages and admin interfaces',
          'PR-based publishing with auto-merge attempt and manual fallback',
          'Deploy linkage after merged content updates to avoid stale production content'
        ],
        tags: ['Auditability', 'Observability', 'Glassmorphism', 'Deploy Hook']
      },
      {
        id: 'innovation',
        title: 'Innovation Layer',
        intro: 'AI is integrated as a controlled execution layer with failover, blocking, and explainable outcomes.',
        points: [
          'AI bilingual enhancement: publish one locale and auto-complete the counterpart locale',
          'Multi-provider failover: Gemini / OpenAI-compatible / DeepSeek / Qwen',
          'Daily GitHub hot-project automation at 08:00 with dedupe and fixed tags',
          'Quality gate blocks low-quality AI output when structure, evidence, or fact checks fail'
        ],
        tags: ['AI Bilingual', 'Provider Fallback', 'Hot Daily', 'Quality Gate']
      }
    ],
    actionLinks: [
      {
        label: 'Open In-Site Tutorial (EN)',
        href: '/en/blog/mlog-open-source-deploy-guide'
      },
      {
        label: 'Open Public Docs Mirror (EN)',
        href: 'https://github.com/2982136527/mlog/blob/main/docs/tutorials/mlog-open-source-deploy-guide.en.md',
        external: true
      }
    ],
    updatedAt: '2026-03-05'
  }
}
