import type { Locale } from './config'

export type Dictionary = {
  siteName: string
  siteTagline: string
  nav: {
    home: string
    blog: string
    about: string
  }
  home: {
    introTitle: string
    introBody: string
    latestPost: string
    browseByCategory: string
    quickLinks: string
    tagCloud: string
    tagCloudEmpty: string
    readMore: string
  }
  blog: {
    title: string
    description: string
    searchPlaceholder: string
    allTags: string
    allCategories: string
    empty: string
    fallbackNotice: string
    prev: string
    next: string
    tableOfContents: string
    publishedOn: string
    updatedOn: string
    readingTime: string
  }
  common: {
    language: string
    rss: string
    about: string
    categories: string
    tags: string
    backToBlog: string
    noTranslation: string
  }
  about: {
    title: string
    description: string
    eyebrow: string
    sectionTitles: {
      tech: string
      features: string
      highlights: string
      innovation: string
    }
  }
  footer: {
    visitors: string
    pageviews: string
    avgReadTime: string
    siteSince: string
    statsFallbackSiteWide: string
  }
}

const dictionaries: Record<Locale, Dictionary> = {
  zh: {
    siteName: 'MLog',
    siteTagline: '属于我们的双语博客实验场',
    nav: {
      home: '首页',
      blog: '博客',
      about: '介绍'
    },
    home: {
      introTitle: '暖色玻璃态博客',
      introBody: '我们把内容放在第一位，用轻量动效与分层卡片构建有记忆点的阅读体验。',
      latestPost: '最新文章',
      browseByCategory: '按分类浏览',
      quickLinks: '快速入口',
      tagCloud: '热门标签',
      tagCloudEmpty: '暂无标签内容',
      readMore: '继续阅读'
    },
    blog: {
      title: '全部文章',
      description: '支持关键词、标签、分类筛选。',
      searchPlaceholder: '搜索标题、摘要或标签',
      allTags: '全部标签',
      allCategories: '全部分类',
      empty: '没有匹配到文章，请调整筛选条件。',
      fallbackNotice: '当前语言暂未提供该文章，已为你展示中文版本。',
      prev: '上一篇',
      next: '下一篇',
      tableOfContents: '目录',
      publishedOn: '发布于',
      updatedOn: '更新于',
      readingTime: '阅读时长'
    },
    common: {
      language: '语言',
      rss: 'RSS',
      about: '介绍',
      categories: '分类',
      tags: '标签',
      backToBlog: '返回文章列表',
      noTranslation: '该语言版本暂未提供'
    },
    about: {
      title: '关于 MLog',
      description: '了解 MLog 使用的技术、核心功能、工程亮点与 AI 无服务器创新能力。',
      eyebrow: 'PROJECT OVERVIEW',
      sectionTitles: {
        tech: '技术栈与架构',
        features: '核心功能矩阵',
        highlights: '产品亮点',
        innovation: '创新能力'
      }
    },
    footer: {
      visitors: '累计访客 UV',
      pageviews: '累计浏览 PV',
      avgReadTime: '平均阅读时长',
      siteSince: '建站于',
      statsFallbackSiteWide: '当前为全站统计口径（博客页面过滤不可用时自动降级）'
    }
  },
  en: {
    siteName: 'MLog',
    siteTagline: 'A bilingual blog crafted for our own voice',
    nav: {
      home: 'Home',
      blog: 'Blog',
      about: 'About'
    },
    home: {
      introTitle: 'Warm Glassmorphism Blog',
      introBody: 'Content comes first, supported by layered cards and restrained motion for a distinct reading feel.',
      latestPost: 'Latest Post',
      browseByCategory: 'Browse by Category',
      quickLinks: 'Quick Links',
      tagCloud: 'Tag Cloud',
      tagCloudEmpty: 'No tags yet.',
      readMore: 'Read More'
    },
    blog: {
      title: 'All Posts',
      description: 'Filter by keyword, tag, and category.',
      searchPlaceholder: 'Search title, summary, or tags',
      allTags: 'All tags',
      allCategories: 'All categories',
      empty: 'No posts matched your filters.',
      fallbackNotice: 'This post is not translated yet. Showing the Chinese version instead.',
      prev: 'Previous',
      next: 'Next',
      tableOfContents: 'Table of Contents',
      publishedOn: 'Published',
      updatedOn: 'Updated',
      readingTime: 'Reading time'
    },
    common: {
      language: 'Language',
      rss: 'RSS',
      about: 'About',
      categories: 'Categories',
      tags: 'Tags',
      backToBlog: 'Back to posts',
      noTranslation: 'Translation unavailable'
    },
    about: {
      title: 'About MLog',
      description: 'Explore the MLog stack, feature matrix, engineering highlights, and AI-powered serverless capabilities.',
      eyebrow: 'PROJECT OVERVIEW',
      sectionTitles: {
        tech: 'Tech Stack & Architecture',
        features: 'Core Feature Matrix',
        highlights: 'Product Highlights',
        innovation: 'Innovation Layer'
      }
    },
    footer: {
      visitors: 'Total Visitors UV',
      pageviews: 'Total Pageviews PV',
      avgReadTime: 'Avg Read Time',
      siteSince: 'Site Since',
      statsFallbackSiteWide: 'Currently using site-wide scope (auto fallback when blog-page filtering is unavailable).'
    }
  }
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}
