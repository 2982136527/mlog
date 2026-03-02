---
title: "Warm Glassmorphism as a System"
date: "2026-02-26"
summary: "Our constraints for typography, color tokens, hierarchy, and motion in MLog, designed for reuse and maintainability."
tags:
  - "Design"
  - "Typography"
  - "CSS"
category: "Design System"
cover: "/images/covers/warm-glass.svg"
draft: false
updated: "2026-02-27"
---

## Font strategy

We separate display and body typography:

- expressive serif for headings,
- language-specific body fonts for Chinese and English.

## Color tokens

All core colors are tokenized to avoid scattered hex values.

```css
:root {
  --color-brand: #d46634;
  --color-brand-strong: #bb5122;
  --color-ink: #3e2a22;
}
```

## Motion strategy

Motion should reinforce hierarchy, not compete with content:

- staggered card reveal on the homepage,
- subtle hover feedback,
- low-frequency background movement.

## Takeaway

A durable visual style comes from consistency across component design, tokens, and content structure.
