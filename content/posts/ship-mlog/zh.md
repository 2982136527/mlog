---
title: "从零发布 MLog：我们的双语博客起航"
date: "2026-03-02"
summary: "记录 MLog 第一版从空仓到上线的关键决策：双语路由、Markdown 内容层与玻璃态设计系统。"
tags:
  - "Next.js"
  - "Bilingual"
  - "Engineering"
category: "开发日志"
cover: "/images/covers/ship-mlog.svg"
draft: false
updated: "2026-03-02"
---

## 为什么我们选择双语子路径

我们把语言显式放到路径里：`/zh` 与 `/en`。这样做有三个直接收益：

1. 搜索引擎更容易识别不同语言页面。
2. 链接分享时不需要额外语言参数。
3. 文章详情页可以稳定保留 `slug`，语言切换成本低。

## 内容层的约束

每篇文章目录固定在 `content/posts/<slug>/`，并使用 `zh.md` / `en.md` 两份文件。Frontmatter 强约束如下：

```yaml
title: string
date: ISO date
summary: string
tags: string[]
category: string
cover?: string
draft?: boolean
updated?: ISO date
```

如果字段缺失或日期格式错误，构建会直接失败。这样可以避免线上出现“无标题文章”或排序异常。

## 视觉策略

我们借鉴了参考项目的气质，但没有直接复刻：

- 暖色渐变背景 + 模糊光斑
- 半透明玻璃卡片
- 轻量 spring 入场动效
- 移动端改为单列流式布局

> 目标不是炫技，而是让内容阅读在第一位。

## 下一步

- 增加更多真实文章
- 完善英文翻译覆盖率
- 迭代首页信息架构
