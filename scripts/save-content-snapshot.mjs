import fs from 'node:fs'
import path from 'node:path'

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'posts')
const SNAPSHOT_FILE = path.join(process.cwd(), 'public', '__content__.json')

if (!fs.existsSync(CONTENT_ROOT)) {
  console.warn('[snapshot] content/posts not found, skipping')
  process.exit(0)
}

const dirs = fs.readdirSync(CONTENT_ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)

const files = []
for (const slug of dirs) {
  for (const locale of ['zh', 'en']) {
    const fp = path.join(CONTENT_ROOT, slug, `${locale}.md`)
    if (fs.existsSync(fp)) {
      files.push({ p: `${slug}/${locale}.md`, c: fs.readFileSync(fp, 'utf8') })
    }
  }
}

fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true })
fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ files }))
console.log(`[snapshot] saved ${files.length} files`)
