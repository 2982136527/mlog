import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const matter = require('gray-matter')
const readingTime = require('reading-time')

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'posts')
const INDEX_FILE = path.join(process.cwd(), 'public', '__index__.json')
const CONTENT_DIR = path.join(process.cwd(), 'public', '__content__')

if (!fs.existsSync(CONTENT_ROOT)) {
  if (fs.existsSync(INDEX_FILE)) {
    console.warn('[snapshot] content/posts not found, keeping existing index')
    process.exit(0)
  }
  console.warn('[snapshot] content/posts not found, skipping')
  process.exit(0)
}

const slugs = fs.readdirSync(CONTENT_ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)

const index = []
let contentCount = 0

for (const slug of slugs) {
  for (const locale of ['zh', 'en']) {
    const fp = path.join(CONTENT_ROOT, slug, `${locale}.md`)
    if (!fs.existsSync(fp)) continue

    const raw = fs.readFileSync(fp, 'utf8')
    const { data, content } = matter(raw)

    // Write index entry (frontmatter only, no body)
    index.push({
      slug,
      locale,
      frontmatter: data,
      readingTime: Math.max(1, Math.ceil(readingTime(content).minutes))
    })

    // Write individual content file
    const contentFp = path.join(CONTENT_DIR, slug, `${locale}.json`)
    fs.mkdirSync(path.dirname(contentFp), { recursive: true })
    fs.writeFileSync(contentFp, JSON.stringify({ content: content.trimStart() }))
    contentCount++
  }
}

// Write index
fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true })
fs.writeFileSync(INDEX_FILE, JSON.stringify({ posts: index }))

// Remove old format if exists
const oldSnapshot = path.join(process.cwd(), 'public', '__content__.json')
if (fs.existsSync(oldSnapshot)) {
  fs.unlinkSync(oldSnapshot)
  console.log('[snapshot] removed old __content__.json')
}

console.log(`[snapshot] index: ${index.length} posts, ${contentCount} content files`)
