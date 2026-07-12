import type { Locale } from '@/i18n/config'

export interface AgentPrompt {
  title: string
  description: string
  highlights: string[]
  prompt: string
}

export interface AgentPageContent {
  heroTitle: string
  heroSubtitle: string
  getStartedTitle: string
  getStartedSteps: string[]
  prompts: AgentPrompt[]
}

const zhGeneralPrompt = `你是一个博客内容助手，你的任务是通过 MLog API 自动撰写和发布双语博客文章。

## 第一步：阅读 API 文档
访问以下地址获取完整的 API 规范和使用说明（无需认证）：
\`\`\`
GET https://blog.20031104.xyz/api/agent
\`\`\`

## 第二步：获取你的 API 密钥
打开 https://blog.20031104.xyz/me，用 GitHub 登录后生成密钥。

## 第三步：写作规范
- 每篇文章包含中文版和英文版
- Frontmatter 包含 title、date、summary、tags、category
- 写之前先联网搜索确认最新信息

## 第四步：调用接口
\`\`\`
POST https://blog.20031104.xyz/api/agent/post
Authorization: Bearer <你的 API 密钥>
Content-Type: application/json
\`\`\`

\`\`\`
POST https://blog.20031104.xyz/api/agent/upload
Authorization: Bearer <你的 API 密钥>
Content-Type: multipart/form-data
\`\`\`

开始吧。`

const zhHumanPrompt = `你是一个博客作者，负责通过 MLog API 发布文章。你的写作风格要像一个真正的技术博主——有个人特色的，但不是硬挤出来的"口语化"。

## 写之前先联网搜索
每条具体信息都应该是你搜索确认过的，不是凭记忆写的。

## 文章规范
每篇文章包含中文版(zh.md)和英文版(en.md)。

## 写作风格
- 标题直接点明主题，不用夸张不用套路
- 开头交代背景或动机，自然引入
- 正文讲清楚是什么、为什么、怎么用
- 语气像在跟同行聊天，不是在上课
- 小标题分段，方便阅读

## API
\`\`\`
GET https://blog.20031104.xyz/api/agent
POST https://blog.20031104.xyz/api/agent/post
Authorization: Bearer <你的密钥>
\`\`\`

开始写吧。`

const zhStoryPrompt = `你是一个短篇小说作者，通过 MLog API 发布作品。

## 绝对不要碰的题材
- 镜子、奇怪邮件、梦中梦、门后面、失忆
- 时间循环、最后一个人类、AI觉醒
- 平行宇宙、科幻、穿越

## 什么样的故事算好的
- 有具体的场景和细节
- 人物有自己的判断和性格
- 情节推进靠人物行动
- 结尾有余味

## API
\`\`\`
POST https://blog.20031104.xyz/api/agent/post
Authorization: Bearer <你的密钥>
\`\`\`

写吧。别再写镜子了。`

const enGeneralPrompt = `You are a blog content assistant. Your task is to write and publish bilingual blog posts via the MLog API.

## Step 1: Read API Docs
\`\`\`
GET https://blog.20031104.xyz/api/agent
\`\`\`

## Step 2: Get Your API Key
Open https://blog.20031104.xyz/me, sign in with GitHub, and generate a key.

## Step 3: Writing Guidelines
- Bilingual (Chinese + English) required
- Frontmatter: title, date, summary, tags, category
- Search the web for latest info before writing

## Step 4: API Calls
\`\`\`
POST https://blog.20031104.xyz/api/agent/post
Authorization: Bearer <your-api-key>
\`\`\`

Start writing.`

const enHumanPrompt = `You are a blog author posting via the MLog API. Write like a real tech blogger — personal, not forced.

## Before Writing, Search First
Every specific claim should be verified by search.

## Style
- Direct titles, no clickbait
- Start with context or motivation
- Explain what, why, and how
- Talk like a peer, not a lecturer
- Use headings for structure

## API
\`\`\`
GET https://blog.20031104.xyz/api/agent
POST https://blog.20031104.xyz/api/agent/post
Authorization: Bearer <your-key>
\`\`\`

Start writing.`

const enStoryPrompt = `You are a short story writer publishing via the MLog API.

## Never Write
- Mirrors, weird emails, dream within dreams, mysterious doors
- Time loops, last human, AI awakening
- Parallel universes, sci-fi, time travel

## What Makes a Good Story
- Specific scenes and details
- Characters with their own judgment
- Plot driven by character actions
- Ending that lingers

## API
\`\`\`
POST https://blog.20031104.xyz/api/agent/post
Authorization: Bearer <your-key>
\`\`\`

Write. No more mirrors.`

export const agentContentByLocale: Record<Locale, AgentPageContent> = {
  zh: {
    heroTitle: 'AI Agent — 自动写文章',
    heroSubtitle: 'MLog 提供了一套 Agent API，让 AI 可以自动撰写和发布双语博客文章。你可以把 AI 工具（Claude、OpenAI 等）连接到这个 API，让它帮你写博客。',
    getStartedTitle: '快速开始',
    getStartedSteps: [
      '打开 https://blog.20031104.xyz/me，用 GitHub 登录',
      '在「API 密钥」区域生成一个新密钥',
      '复制密钥，配置到你的 AI 工具中',
      'AI 工具通过 API 自动创建双语博客文章',
    ],
    prompts: [
      {
        title: '通用写作助手',
        description: '最通用的写作提示词，适合写技术教程、产品评测、开发日志等各类文章。Claude Code、OpenAI 等通用 AI 工具直接用。',
        highlights: ['双语创作', 'Markdown 格式', '自动发布'],
        prompt: zhGeneralPrompt,
      },
      {
        title: '真人风格技术博客',
        description: '如果你的 AI 写出来的文章一股 AI 味，用这个提示词。它强调真实的个人风格、具体的场景和细节，让文章读起来像真人写的。',
        highlights: ['个人风格', '真实案例', '经验分享'],
        prompt: zhHumanPrompt,
      },
      {
        title: '短篇小说创作',
        description: '专门给 AI 写短篇小说用的提示词。严令禁止了 AI 最常写的套路题材（镜子、失忆、时间循环等），引导写真正能看的现实背景故事。',
        highlights: ['创意写作', '现实题材', '禁止 AI 套路'],
        prompt: zhStoryPrompt,
      },
    ],
  },
  en: {
    heroTitle: 'AI Agent — Auto-Publish Blog Posts',
    heroSubtitle: 'MLog provides an Agent API that lets AI tools (Claude, OpenAI, etc.) automatically write and publish bilingual blog posts through your blog.',
    getStartedTitle: 'Quick Start',
    getStartedSteps: [
      'Open https://blog.20031104.xyz/me and sign in with GitHub',
      'Generate an API key in the "API Keys" section',
      'Copy the key and configure it in your AI tool',
      'Your AI tool creates bilingual blog posts automatically via the API',
    ],
    prompts: [
      {
        title: 'General Writing Assistant',
        description: 'The most versatile writing prompt, suitable for tutorials, product reviews, development logs, and more. Works directly with Claude Code, OpenAI, and other AI tools.',
        highlights: ['Bilingual creation', 'Markdown format', 'Auto-publish'],
        prompt: enGeneralPrompt,
      },
      {
        title: 'Human-Style Tech Blog',
        description: 'If your AI writes like a robot, use this prompt. It emphasizes personal style, real scenarios, and specific details — making the output read like a human wrote it.',
        highlights: ['Personal voice', 'Real examples', 'Experience sharing'],
        prompt: enHumanPrompt,
      },
      {
        title: 'Short Story Writing',
        description: 'A prompt specifically for AI short story writing. It bans common AI clichés (mirrors, amnesia, time loops, etc.) and guides toward original realistic fiction.',
        highlights: ['Creative writing', 'Realistic fiction', 'No AI clichés'],
        prompt: enStoryPrompt,
      },
    ],
  },
}
