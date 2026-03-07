import type { Locale } from './config'

export type Dictionary = {
  siteName: string
  siteTagline: string
  nav: {
    home: string
    blog: string
    about: string
    forum: string
    me: string
  }
  home: {
    introTitle: string
    introBody: string
    latestPost: string
    browseByCategory: string
    quickLinks: string
    quickHubSubtitle: string
    quickStatsTitle: string
    quickStatPosts: string
    quickStatCategories: string
    quickStatTags: string
    quickPicksTitle: string
    latestUpdate: string
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
    liveCardTitle: string
    liveCardUpdatedAt: string
    liveCardSource: string
    liveCardUnavailable: string
    liveCardErrorUpstream: string
    liveCardErrorRepoMissing: string
    liveCardErrorNotEnabled: string
    liveCardErrorUnknown: string
    liveCardCacheHint: string
    liveCardStars: string
    liveCardForks: string
    liveCardOpenIssues: string
    liveCardLastPush: string
    staticCardTitle: string
    staticCardSnapshotAt: string
    staticCardSource: string
    staticCardStars: string
    staticCardForks: string
    staticCardOpenIssues: string
    staticCardUnavailable: string
    staticCardRepo: string
    staticCardVisitRepo: string
  }
  forum: {
    title: string
    description: string
    categories: string
    latestThreads: string
    hotThreads: string
    allCategories: string
    searchPlaceholder: string
    loadMore: string
    emptyThreads: string
    emptyReplies: string
    noCategories: string
    comments: string
    reactions: string
    createdAt: string
    updatedAt: string
    newThread: string
    myForum: string
    myThreads: string
    myReplies: string
    backToForum: string
    threadFormTitle: string
    threadFormBody: string
    threadFormCategory: string
    threadFormSubmit: string
    threadFormSubmitting: string
    replyFormTitle: string
    replyFormSubmit: string
    replyFormSubmitting: string
    loginRequired: string
    scopeRequired: string
    authorize: string
    contentLocale: string
    contentLocaleZh: string
    contentLocaleEn: string
    statusSingle: string
    statusBilingual: string
    singleOnlyZh: string
    singleOnlyEn: string
    switchToZh: string
    switchToEn: string
  }
  common: {
    language: string
    theme: string
    themeClassic: string
    themeOrnate: string
    rss: string
    about: string
    forum: string
    login: string
    me: string
    categories: string
    tags: string
    backToBlog: string
    noTranslation: string
  }
  about: {
    title: string
    description: string
    eyebrow: string
    actionsTitle: string
    tutorialSource: string
    tutorialDocs: string
    lastUpdated: string
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
      about: '介绍',
      forum: '论坛',
      me: '我的'
    },
    home: {
      introTitle: '暖色玻璃态博客',
      introBody: '我们把内容放在第一位，用轻量动效与分层卡片构建有记忆点的阅读体验。',
      latestPost: '最新文章',
      browseByCategory: '按分类浏览',
      quickLinks: '快速入口',
      quickHubSubtitle: '常用入口 + 内容速览，快速开始阅读或订阅。',
      quickStatsTitle: '站点速览',
      quickStatPosts: '文章',
      quickStatCategories: '分类',
      quickStatTags: '标签',
      quickPicksTitle: '今日推荐标签',
      latestUpdate: '最近更新',
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
      readingTime: '阅读时长',
      liveCardTitle: '实时快照卡',
      liveCardUpdatedAt: '更新时间',
      liveCardSource: '数据源',
      liveCardUnavailable: '实时数据暂不可用',
      liveCardErrorUpstream: 'GitHub 上游暂不可用或权限受限，请稍后重试。',
      liveCardErrorRepoMissing: '文章中未识别到有效 GitHub 仓库链接。',
      liveCardErrorNotEnabled: '该文章未启用实时快照卡。',
      liveCardErrorUnknown: '实时数据加载失败，请稍后重试。',
      liveCardCacheHint: '10 分钟缓存口径',
      liveCardStars: 'Stars',
      liveCardForks: 'Forks',
      liveCardOpenIssues: 'Open Issues',
      liveCardLastPush: '最近代码提交',
      staticCardTitle: '发布快照卡',
      staticCardSnapshotAt: '快照时间',
      staticCardSource: '数据来源',
      staticCardStars: 'Stars',
      staticCardForks: 'Forks',
      staticCardOpenIssues: 'Open Issues',
      staticCardUnavailable: '当前没有可用的发布快照数据',
      staticCardRepo: '仓库',
      staticCardVisitRepo: '访问仓库'
    },
    forum: {
      title: '论坛',
      description: '围绕博客内容交流想法、提问和分享经验。',
      categories: '分类',
      latestThreads: '最新主题',
      hotThreads: '热门主题',
      allCategories: '全部分类',
      searchPlaceholder: '搜索主题标题或内容',
      loadMore: '加载更多',
      emptyThreads: '暂无主题。',
      emptyReplies: '暂无回复。',
      noCategories: '暂无可用分类。',
      comments: '回复',
      reactions: '反应',
      createdAt: '创建于',
      updatedAt: '更新于',
      newThread: '新建主题',
      myForum: '我的论坛',
      myThreads: '我的主题',
      myReplies: '我的回复',
      backToForum: '返回论坛',
      threadFormTitle: '主题标题',
      threadFormBody: '主题内容',
      threadFormCategory: '主题分类',
      threadFormSubmit: '发布主题',
      threadFormSubmitting: '发布中...',
      replyFormTitle: '回复内容',
      replyFormSubmit: '发布回复',
      replyFormSubmitting: '发布中...',
      loginRequired: '请先登录后再操作。',
      scopeRequired: '需要 GitHub Discussions 写入权限，请补授权。',
      authorize: '补授权',
      contentLocale: '内容语言',
      contentLocaleZh: '中文',
      contentLocaleEn: '英文',
      statusSingle: '单语',
      statusBilingual: '双语',
      singleOnlyZh: '仅中文主题',
      singleOnlyEn: '仅英文主题',
      switchToZh: 'View in Chinese',
      switchToEn: 'View in English'
    },
    common: {
      language: '语言',
      theme: '主题',
      themeClassic: '经典',
      themeOrnate: '华丽',
      rss: 'RSS',
      about: '介绍',
      forum: '论坛',
      login: '登录',
      me: '我的',
      categories: '分类',
      tags: '标签',
      backToBlog: '返回文章列表',
      noTranslation: '该语言版本暂未提供'
    },
    about: {
      title: '关于 MLog',
      description: '了解 MLog 使用的技术、核心功能、工程亮点与 AI 无服务器创新能力。',
      eyebrow: 'PROJECT OVERVIEW',
      actionsTitle: '教程与文档入口',
      tutorialSource: '站内教程',
      tutorialDocs: '公开 Docs',
      lastUpdated: '最后更新',
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
      about: 'About',
      forum: 'Forum',
      me: 'My'
    },
    home: {
      introTitle: 'Warm Glassmorphism Blog',
      introBody: 'Content comes first, supported by layered cards and restrained motion for a distinct reading feel.',
      latestPost: 'Latest Post',
      browseByCategory: 'Browse by Category',
      quickLinks: 'Quick Links',
      quickHubSubtitle: 'Jump to core actions and scan site activity at a glance.',
      quickStatsTitle: 'Site Snapshot',
      quickStatPosts: 'Posts',
      quickStatCategories: 'Categories',
      quickStatTags: 'Tags',
      quickPicksTitle: 'Today Picks',
      latestUpdate: 'Latest Update',
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
      readingTime: 'Reading time',
      liveCardTitle: 'Live Snapshot',
      liveCardUpdatedAt: 'Updated at',
      liveCardSource: 'Source',
      liveCardUnavailable: 'Live data is temporarily unavailable.',
      liveCardErrorUpstream: 'GitHub upstream is unavailable or restricted. Please try again later.',
      liveCardErrorRepoMissing: 'No valid GitHub repository link was found in this post.',
      liveCardErrorNotEnabled: 'Live snapshot is not enabled for this post.',
      liveCardErrorUnknown: 'Failed to load live data. Please try again later.',
      liveCardCacheHint: '10-minute cache window',
      liveCardStars: 'Stars',
      liveCardForks: 'Forks',
      liveCardOpenIssues: 'Open Issues',
      liveCardLastPush: 'Last Push',
      staticCardTitle: 'Published Snapshot',
      staticCardSnapshotAt: 'Snapshot Time',
      staticCardSource: 'Source',
      staticCardStars: 'Stars',
      staticCardForks: 'Forks',
      staticCardOpenIssues: 'Open Issues',
      staticCardUnavailable: 'No published snapshot is available yet.',
      staticCardRepo: 'Repository',
      staticCardVisitRepo: 'Open Repo'
    },
    forum: {
      title: 'Forum',
      description: 'Discuss blog topics, ask questions, and share practical experience.',
      categories: 'Categories',
      latestThreads: 'Latest Threads',
      hotThreads: 'Hot Threads',
      allCategories: 'All Categories',
      searchPlaceholder: 'Search thread title or content',
      loadMore: 'Load More',
      emptyThreads: 'No threads yet.',
      emptyReplies: 'No replies yet.',
      noCategories: 'No categories available.',
      comments: 'Replies',
      reactions: 'Reactions',
      createdAt: 'Created',
      updatedAt: 'Updated',
      newThread: 'New Thread',
      myForum: 'My Forum',
      myThreads: 'My Threads',
      myReplies: 'My Replies',
      backToForum: 'Back to Forum',
      threadFormTitle: 'Thread Title',
      threadFormBody: 'Thread Content',
      threadFormCategory: 'Thread Category',
      threadFormSubmit: 'Publish Thread',
      threadFormSubmitting: 'Publishing...',
      replyFormTitle: 'Reply Content',
      replyFormSubmit: 'Post Reply',
      replyFormSubmitting: 'Posting...',
      loginRequired: 'Please sign in to continue.',
      scopeRequired: 'GitHub Discussions write scope is required.',
      authorize: 'Authorize Scope',
      contentLocale: 'Content Locale',
      contentLocaleZh: 'Chinese',
      contentLocaleEn: 'English',
      statusSingle: 'Single',
      statusBilingual: 'Bilingual',
      singleOnlyZh: 'Chinese only',
      singleOnlyEn: 'English only',
      switchToZh: '查看中文',
      switchToEn: 'View in English'
    },
    common: {
      language: 'Language',
      theme: 'Theme',
      themeClassic: 'Classic',
      themeOrnate: 'Ornate',
      rss: 'RSS',
      about: 'About',
      forum: 'Forum',
      login: 'Login',
      me: 'My',
      categories: 'Categories',
      tags: 'Tags',
      backToBlog: 'Back to posts',
      noTranslation: 'Translation unavailable'
    },
    about: {
      title: 'About MLog',
      description: 'Explore the MLog stack, feature matrix, engineering highlights, and AI-powered serverless capabilities.',
      eyebrow: 'PROJECT OVERVIEW',
      actionsTitle: 'Tutorial & Docs Links',
      tutorialSource: 'In-Site Tutorial',
      tutorialDocs: 'Public Docs',
      lastUpdated: 'Last updated',
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
