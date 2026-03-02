---
title: "Shipping MLog from Scratch"
date: "2026-03-02"
summary: "How we shipped the first MLog release with bilingual routing, a Markdown content layer, and a warm glassmorphism system."
tags:
  - "Next.js"
  - "Bilingual"
  - "Engineering"
category: "Build Log"
cover: "/images/covers/ship-mlog.svg"
draft: false
updated: "2026-03-02"
---

## Why locale-prefixed routes

We adopted `/zh` and `/en` instead of runtime language toggles. This gives us:

1. clearer SEO signals for each language,
2. shareable URLs without extra parameters,
3. stable slug-based switching between languages.

## Content contract

Each post lives under `content/posts/<slug>/` with `zh.md` and `en.md`. Frontmatter is validated at build time, so malformed dates and missing required fields fail fast.

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

## Visual direction

We intentionally borrowed the *feel* of the reference project, not the exact layout:

- warm gradient atmosphere,
- translucent glass cards,
- restrained spring motions,
- single-column fallback on mobile.

The goal is clarity first, motion second.

## What comes next

- publish more real posts,
- improve translation coverage,
- iterate on homepage information architecture.
