---
title: "暖色玻璃态设计：不是模板，而是系统"
date: "2026-02-26"
summary: "整理我们在 MLog 中对字体、色板、层次和动效的设计约束，让风格可复用、可维护。"
tags:
  - "Design"
  - "Typography"
  - "CSS"
category: "设计系统"
cover: "/images/covers/warm-glass.svg"
draft: false
updated: "2026-02-27"
---

## 字体分工

我们把标题和正文分离：

- 标题用更有性格的衬线，拉开识别度。
- 正文按语言分别优化，中文与英文各用合适字体。

## 色板原则

主色、强调色、边框色和文本色都以变量定义，避免“到处写十六进制”。

```css
:root {
  --color-brand: #d46634;
  --color-brand-strong: #bb5122;
  --color-ink: #3e2a22;
}
```

## 动效原则

动效只服务于信息层级：

- 首页卡片 stagger 入场，建立阅读节奏。
- hover 只做轻微反馈，避免喧宾夺主。
- 背景是低频缓动，不抢正文注意力。

## 结论

风格稳定的关键不是“某一个酷炫效果”，而是**组件层 + token 层 + 内容层**的持续一致。
