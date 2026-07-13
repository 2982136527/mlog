import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { isIP } from 'node:net'
import path from 'node:path'
import matter from 'gray-matter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import sharp from 'sharp'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { LineCounter, isMap, isPair, isScalar, parseDocument } from 'yaml'

export const MEDIA_MIGRATION_SCHEMA_VERSION = 1
export const DEFAULT_CONTENT_ROOT = 'content/posts'
export const DEFAULT_PUBLIC_ROOT = 'public'
export const DEFAULT_TARGET_PREFIX = 'uploads/blog'
export const REQUIRED_APPLY_ENV = [
  'IMAGE_GITHUB_OWNER',
  'IMAGE_GITHUB_REPO',
  'IMAGE_GITHUB_TOKEN'
]

const MAX_YAML_ALIAS_COUNT = 20
const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024
const LOCAL_UPLOAD_PREFIXES = ['/images/uploads/', 'images/uploads/', 'public/images/uploads/']
const SUPPORTED_IMAGE_TYPES = {
  gif: { extension: 'gif', mime: 'image/gif' },
  jpeg: { extension: 'jpg', mime: 'image/jpeg' },
  png: { extension: 'png', mime: 'image/png' },
  webp: { extension: 'webp', mime: 'image/webp' }
}
const PRESERVABLE_CHECKPOINT_STATUSES = new Set(['uploaded', 'verified', 'rewritten', 'complete'])
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex')
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort(compareStrings).map(key => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeRepoRoot(value, label) {
  const normalized = String(value).trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`${label} must be a safe project-relative path`)
  }
  return normalized
}

export function normalizeTargetPrefix(value = DEFAULT_TARGET_PREFIX) {
  const normalized = String(value).trim().replace(/^\/+|\/+$/g, '')
  if (
    !normalized ||
    normalized.length > 180 ||
    normalized.split('/').some(segment => (
      !PATH_SEGMENT_PATTERN.test(segment) || segment === '.' || segment === '..'
    ))
  ) {
    throw new Error(`Invalid media target prefix: ${value}`)
  }
  return normalized
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa') ||
    isIP(normalized) !== 0
  )
}

export function normalizeCdnBaseUrl(value) {
  if (!value) return null

  const raw = String(value).trim()
  if (/(?:^|\/)(?:\.{1,2})(?:\/|$)/.test(raw) || /%(?:2e|2f|5c)/i.test(raw)) {
    throw new Error('NEXT_PUBLIC_CDN_BASE_URL must not contain path traversal segments')
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('NEXT_PUBLIC_CDN_BASE_URL must be a valid HTTPS URL')
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.port && parsed.port !== '443') ||
    isPrivateHostname(parsed.hostname)
  ) {
    throw new Error('NEXT_PUBLIC_CDN_BASE_URL must be a public HTTPS origin or path without credentials, query, or fragment')
  }

  return parsed.toString().replace(/\/+$/, '')
}

function normalizeBranch(value = 'main') {
  const branch = String(value || 'main').trim().replace(/^refs\/heads\//, '')
  const forbiddenCharacters = new Set(['~', '^', ':', '?', '*', '[', ']', '\\'])
  const hasForbiddenCharacter = [...branch].some(character => (
    character <= ' ' || character === '\x7f' || forbiddenCharacters.has(character)
  ))
  if (
    !branch ||
    branch.length > 255 ||
    branch.startsWith('.') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.includes('@{') ||
    branch.split('/').some(segment => segment.endsWith('.lock')) ||
    hasForbiddenCharacter
  ) {
    throw new Error('IMAGE_GITHUB_BRANCH is invalid')
  }
  return branch
}

function normalizePublicConfig(input) {
  const owner = String(input.owner || '').trim()
  const repo = String(input.repo || '').trim()
  if (!owner && !repo) return null
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo) || repo === '.' || repo === '..') {
    throw new Error('IMAGE_GITHUB_OWNER or IMAGE_GITHUB_REPO is invalid')
  }
  return {
    branch: normalizeBranch(input.branch),
    cdnBaseUrl: normalizeCdnBaseUrl(input.cdnBaseUrl),
    owner,
    repo
  }
}

function appendUrlPath(baseUrl, objectPath) {
  return `${baseUrl.replace(/\/$/, '')}/${objectPath.split('/').map(encodeURIComponent).join('/')}`
}

export function buildPublicCandidates(config, objectPath) {
  if (!config) return []
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/')
  const candidates = []
  if (config.cdnBaseUrl) {
    candidates.push({ kind: 'custom-cdn', url: appendUrlPath(config.cdnBaseUrl, objectPath) })
  }
  candidates.push({
    kind: 'jsdelivr',
    url: `https://cdn.jsdelivr.net/gh/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}@${encodeURIComponent(config.branch)}/${encodedPath}`
  })
  candidates.push({
    kind: 'github-raw',
    url: `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch)}/${encodedPath}`
  })
  return candidates
}

export function resolveLegacySource(rawUrl, options = {}) {
  const sourceUrl = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!sourceUrl) {
    return { classification: 'invalid', reason: 'empty-url', sourceUrl }
  }

  const migratedUrlPrefixes = options.migratedUrlPrefixes || []
  if (migratedUrlPrefixes.some(prefix => sourceUrl.startsWith(prefix))) {
    return { classification: 'already-migrated', sourceUrl }
  }

  if (/^(?:data|blob|javascript):/i.test(sourceUrl)) {
    return { classification: 'unsupported', reason: 'unsupported-url-scheme', sourceUrl }
  }

  let pathname
  if (/^https?:\/\//i.test(sourceUrl)) {
    let parsed
    try {
      parsed = new URL(sourceUrl)
    } catch {
      return { classification: 'invalid', reason: 'malformed-url', sourceUrl }
    }

    const legacyOrigins = new Set((options.legacyOrigins || []).map(origin => new URL(origin).origin))
    if (!legacyOrigins.has(parsed.origin)) {
      return { classification: 'external', sourceUrl }
    }
    pathname = parsed.pathname
  } else {
    pathname = sourceUrl.split(/[?#]/, 1)[0]
  }

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname).replaceAll('\\', '/')
  } catch {
    return { classification: 'invalid', reason: 'malformed-url-encoding', sourceUrl }
  }

  const matchingPrefix = LOCAL_UPLOAD_PREFIXES.find(prefix => decodedPath.startsWith(prefix))
  if (!matchingPrefix) {
    return { classification: 'external', sourceUrl }
  }

  const suffix = decodedPath.slice(matchingPrefix.length)
  const segments = suffix.split('/')
  if (!suffix || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return { classification: 'invalid', reason: 'unsafe-local-path', sourceUrl }
  }

  return {
    classification: 'local',
    relativePublicPath: `images/uploads/${segments.join('/')}`,
    repoPath: `public/images/uploads/${segments.join('/')}`,
    sourceUrl
  }
}

export function detectImageType(buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString('ascii') === 'PNG' &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return SUPPORTED_IMAGE_TYPES.png
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return SUPPORTED_IMAGE_TYPES.jpeg
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return SUPPORTED_IMAGE_TYPES.gif
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return SUPPORTED_IMAGE_TYPES.webp
  }
  return null
}

async function readAndValidateLocalImage(absolutePath, publicRoot, maxBytes = MAX_SOURCE_IMAGE_BYTES) {
  try {
    const stat = await fs.lstat(absolutePath)
    if (!stat.isFile() || stat.isSymbolicLink()) return { error: 'unsafe-source-file' }
    if (stat.size > maxBytes) return { error: 'source-file-too-large' }

    const [realSource, realPublicRoot] = await Promise.all([
      fs.realpath(absolutePath),
      fs.realpath(publicRoot)
    ])
    if (!realSource.startsWith(`${realPublicRoot}${path.sep}`)) return { error: 'unsafe-source-file' }

    const buffer = await fs.readFile(realSource)
    const detected = detectImageType(buffer)
    if (!detected) return { error: 'unsupported-image-content' }
    let metadata
    try {
      metadata = await sharp(buffer, { animated: true, limitInputPixels: 48_000_000 }).metadata()
    } catch {
      return { error: 'invalid-image-content' }
    }
    const width = metadata.autoOrient?.width || metadata.width
    const height = metadata.pageHeight || metadata.autoOrient?.height || metadata.height
    const frames = metadata.pages || 1
    if (
      !Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isSafeInteger(frames) || frames <= 0
    ) {
      return { error: 'invalid-image-dimensions' }
    }
    return {
      buffer,
      bytes: buffer.length,
      extension: detected.extension,
      frames,
      height,
      mime: detected.mime,
      sha256: sha256(buffer),
      width
    }
  } catch (error) {
    return {
      error: error && typeof error === 'object' && error.code === 'ENOENT'
        ? 'source-file-missing'
        : 'source-file-unreadable'
    }
  }
}

function yamlEngine() {
  return {
    parse(source) {
      const document = parseDocument(source, { uniqueKeys: true })
      if (document.errors.length > 0) {
        throw document.errors[0]
      }
      const value = document.toJS({ maxAliasCount: MAX_YAML_ALIAS_COUNT })
      return value && typeof value === 'object' ? value : {}
    }
  }
}

function findYamlValue(document, keyName) {
  if (!isMap(document.contents)) return null
  const pair = document.contents.items.find(item => (
    isPair(item) && isScalar(item.key) && String(item.key.value) === keyName
  ))
  return pair && isScalar(pair.value) && pair.value.range ? pair.value : null
}

function locateFrontmatter(raw, filePath) {
  const start = raw.charCodeAt(0) === 0xfeff ? 1 : 0
  const firstLineEnd = raw.indexOf('\n', start)
  const firstLine = raw.slice(start, firstLineEnd < 0 ? raw.length : firstLineEnd).replace(/\r$/, '')
  if (firstLine !== '---') {
    return { bodyStart: 0, matterEnd: 0, matterStart: 0 }
  }

  let lineStart = firstLineEnd < 0 ? raw.length : firstLineEnd + 1
  while (lineStart <= raw.length) {
    const nextLineEnd = raw.indexOf('\n', lineStart)
    const lineEnd = nextLineEnd < 0 ? raw.length : nextLineEnd
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === '---') {
      return {
        bodyStart: nextLineEnd < 0 ? raw.length : nextLineEnd + 1,
        matterEnd: Math.max(start + 3, lineStart - 1),
        matterStart: start + 3
      }
    }
    if (nextLineEnd < 0) break
    lineStart = nextLineEnd + 1
  }
  throw new Error(`Unclosed YAML frontmatter in ${filePath}`)
}

function findMarkdownUrlEdit(content, bodyOffset, node, sourceUrl, kind) {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error(`Markdown parser did not provide an edit range for ${kind}`)
  }

  const segment = content.slice(start, end)
  const marker = kind === 'markdown-image' ? '](' : ':'
  const markerIndex = segment.indexOf(marker)
  const searchFrom = markerIndex >= 0 ? markerIndex + marker.length : 0
  const relativeStart = segment.indexOf(sourceUrl, searchFrom)
  if (relativeStart < 0) {
    throw new Error(`Unable to locate parsed image URL in ${kind}`)
  }

  return {
    end: bodyOffset + start + relativeStart + sourceUrl.length,
    expected: sourceUrl,
    format: 'markdown-url',
    start: bodyOffset + start + relativeStart
  }
}

export function parseContentFile(raw, filePath) {
  const parsed = matter(raw, { engines: { yaml: yamlEngine() } })
  const bounds = locateFrontmatter(raw, filePath)
  if (
    raw.slice(bounds.matterStart, bounds.matterEnd) !== parsed.matter ||
    raw.slice(bounds.bodyStart) !== parsed.content
  ) {
    throw new Error(`Frontmatter boundaries do not match parsed content in ${filePath}`)
  }
  const lineCounter = new LineCounter()
  const document = parseDocument(parsed.matter, { lineCounter, uniqueKeys: true })
  if (document.errors.length > 0) {
    throw document.errors[0]
  }
  document.toJS({ maxAliasCount: MAX_YAML_ALIAS_COUNT })

  const bodyOffset = bounds.bodyStart
  const bodyLineOffset = raw.slice(0, bodyOffset).split('\n').length - 1
  const matterOffset = bounds.matterStart
  const tree = unified().use(remarkParse).use(remarkGfm).parse(parsed.content)
  const definitions = new Map()
  const occurrences = []
  const diagnostics = []

  visit(tree, 'definition', node => {
    definitions.set(String(node.identifier).toLowerCase(), node)
  })

  visit(tree, node => {
    if (node.type === 'image') {
      occurrences.push(markdownOccurrence(
        parsed.content,
        bodyOffset,
        node.url,
        node,
        bodyLineOffset,
        'markdown-image'
      ))
      return
    }

    if (node.type === 'imageReference') {
      const definition = definitions.get(String(node.identifier).toLowerCase())
      if (!definition) {
        diagnostics.push({
          code: 'missing-image-definition',
          column: node.position?.start.column || null,
          file: filePath,
          line: node.position ? node.position.start.line + bodyLineOffset : null,
          message: `Image reference has no definition: ${node.identifier}`,
          severity: 'error'
        })
        return
      }
      const occurrence = markdownOccurrence(
        parsed.content,
        bodyOffset,
        definition.url,
        node,
        bodyLineOffset,
        'markdown-reference',
        definition
      )
      occurrence.definition = {
        column: definition.position?.start.column || null,
        line: definition.position ? definition.position.start.line + bodyLineOffset : null
      }
      occurrences.push(occurrence)
      return
    }

    if (node.type === 'html' && /<img\b/i.test(node.value)) {
      diagnostics.push({
        code: 'html-image-requires-manual-review',
        column: node.position?.start.column || null,
        file: filePath,
        line: node.position ? node.position.start.line + bodyLineOffset : null,
        message: 'Raw HTML <img> is not included in the automatic migration plan',
        severity: 'warning'
      })
    }
  })

  const cover = parsed.data.cover
  if (typeof cover === 'string' && cover.trim()) {
    const coverNode = findYamlValue(document, 'cover')
    if (!coverNode) throw new Error(`Unable to locate parsed cover in ${filePath}`)
    occurrences.push({
      column: null,
      edit: {
        end: matterOffset + coverNode.range[1],
        expected: raw.slice(matterOffset + coverNode.range[0], matterOffset + coverNode.range[1]),
        format: 'yaml-scalar',
        start: matterOffset + coverNode.range[0]
      },
      kind: 'frontmatter-cover',
      line: lineCounter.linePos(coverNode.range[0]).line,
      sourceUrl: cover.trim()
    })
  } else if (cover !== undefined && cover !== null && cover !== '') {
    diagnostics.push({
      code: 'invalid-cover-type',
      column: null,
      file: filePath,
      line: findYamlValue(document, 'cover')
        ? lineCounter.linePos(findYamlValue(document, 'cover').range[0]).line
        : null,
      message: 'Frontmatter cover must be a string URL',
      severity: 'error'
    })
  }

  return {
    date: normalizePostDate(parsed.data.date),
    diagnostics,
    occurrences
  }
}

function markdownOccurrence(content, bodyOffset, sourceUrl, node, bodyLineOffset, kind, editNode = node) {
  const normalizedUrl = String(sourceUrl).trim()
  return {
    column: node.position?.start.column || null,
    edit: findMarkdownUrlEdit(content, bodyOffset, editNode, normalizedUrl, kind),
    kind,
    line: node.position ? node.position.start.line + bodyLineOffset : null,
    sourceUrl: normalizedUrl
  }
}

function normalizePostDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`)
  const normalized = `${match[1]}-${match[2]}-${match[3]}`
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized ? null : normalized
}

async function listContentFiles(rootDirectory) {
  const files = []

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => compareStrings(left.name, right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
      } else if (entry.isFile() && (entry.name === 'zh.md' || entry.name === 'en.md')) {
        files.push(absolutePath)
      }
    }
  }

  await walk(rootDirectory)
  return files
}

function toRepoPath(projectRoot, absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/')
}

function compareStrings(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareOccurrences(left, right) {
  return (
    compareStrings(left.file, right.file) ||
    (left.line || 0) - (right.line || 0) ||
    (left.column || 0) - (right.column || 0) ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.sourceUrl, right.sourceUrl)
  )
}

function makeDiagnostic(input) {
  return {
    code: input.code,
    column: input.column ?? null,
    file: input.file,
    line: input.line ?? null,
    message: input.message,
    severity: input.severity
  }
}

function diagnosticSort(left, right) {
  return (
    compareStrings(left.file || '', right.file || '') ||
    (left.line || 0) - (right.line || 0) ||
    compareStrings(left.code, right.code) ||
    compareStrings(left.message, right.message)
  )
}

function occurrenceId(occurrence) {
  const identity = [
    occurrence.file,
    occurrence.kind,
    occurrence.line ?? '',
    occurrence.column ?? '',
    occurrence.sourceUrl
  ].join('\0')
  return `occ_${sha256(identity).slice(0, 24)}`
}

export async function buildMigrationPlan(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd())
  const contentRoot = normalizeRepoRoot(options.contentRoot || DEFAULT_CONTENT_ROOT, 'Content root')
  const publicRoot = normalizeRepoRoot(options.publicRoot || DEFAULT_PUBLIC_ROOT, 'Public root')
  const targetPrefix = normalizeTargetPrefix(options.targetPrefix)
  const publicConfig = normalizePublicConfig({
    branch: options.githubBranch,
    cdnBaseUrl: options.cdnBaseUrl,
    owner: options.githubOwner,
    repo: options.githubRepo
  })
  const migratedUrlPrefixes = buildPublicCandidates(publicConfig, targetPrefix).map(candidate => `${candidate.url}/`)
  const legacyOrigins = (options.legacyOrigins || []).map(origin => new URL(origin).origin).sort(compareStrings)
  const maxSourceBytes = options.maxSourceBytes ?? MAX_SOURCE_IMAGE_BYTES
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) {
    throw new Error('maxSourceBytes must be a positive integer')
  }
  const absoluteContentRoot = path.resolve(projectRoot, contentRoot)
  const absolutePublicRoot = path.resolve(projectRoot, publicRoot)
  const contentFiles = await listContentFiles(absoluteContentRoot)
  const diagnostics = []
  const fileInventory = []
  const allOccurrences = []

  for (const absoluteFile of contentFiles) {
    const file = toRepoPath(projectRoot, absoluteFile)
    const raw = await fs.readFile(absoluteFile, 'utf8')
    const fileSha256 = sha256(raw)
    let parsed
    try {
      parsed = parseContentFile(raw, file)
    } catch (error) {
      diagnostics.push(makeDiagnostic({
        code: 'content-parse-failed',
        file,
        message: error instanceof Error ? error.message : String(error),
        severity: 'error'
      }))
      fileInventory.push({ date: null, path: file, sha256: fileSha256 })
      continue
    }

    diagnostics.push(...parsed.diagnostics)
    fileInventory.push({ date: parsed.date, path: file, sha256: fileSha256 })
    for (const occurrence of parsed.occurrences) {
      allOccurrences.push({
        ...occurrence,
        file,
        fileSha256,
        postDate: parsed.date
      })
    }
  }

  allOccurrences.sort(compareOccurrences)
  const sourceCache = new Map()
  const plannedOccurrences = []

  for (const occurrence of allOccurrences) {
    const resolved = resolveLegacySource(occurrence.sourceUrl, { legacyOrigins, migratedUrlPrefixes })
    const planned = {
      column: occurrence.column,
      definition: occurrence.definition || null,
      edit: occurrence.edit,
      file: occurrence.file,
      fileSha256: occurrence.fileSha256,
      id: occurrenceId(occurrence),
      kind: occurrence.kind,
      line: occurrence.line,
      postDate: occurrence.postDate,
      sourceUrl: occurrence.sourceUrl,
      status: resolved.classification
    }

    if (resolved.classification !== 'local') {
      if (resolved.reason) planned.reason = resolved.reason
      plannedOccurrences.push(planned)
      if (resolved.classification === 'invalid' || resolved.classification === 'unsupported') {
        diagnostics.push(makeDiagnostic({
          code: resolved.reason || 'invalid-image-url',
          column: occurrence.column,
          file: occurrence.file,
          line: occurrence.line,
          message: `Cannot migrate image URL: ${occurrence.sourceUrl}`,
          severity: 'error'
        }))
      } else if (resolved.classification === 'external') {
        diagnostics.push(makeDiagnostic({
          code: 'external-image-skipped',
          column: occurrence.column,
          file: occurrence.file,
          line: occurrence.line,
          message: `External image is outside the legacy media scope: ${occurrence.sourceUrl}`,
          severity: 'warning'
        }))
      }
      continue
    }

    planned.sourcePath = `${publicRoot}/${resolved.relativePublicPath}`
    const absoluteSource = path.resolve(projectRoot, planned.sourcePath)
    const publicBoundary = `${absolutePublicRoot}${path.sep}`
    if (!absoluteSource.startsWith(publicBoundary)) {
      planned.status = 'invalid'
      planned.reason = 'unsafe-local-path'
      plannedOccurrences.push(planned)
      diagnostics.push(makeDiagnostic({
        code: 'unsafe-local-path',
        column: occurrence.column,
        file: occurrence.file,
        line: occurrence.line,
        message: `Legacy image resolves outside ${publicRoot}: ${occurrence.sourceUrl}`,
        severity: 'error'
      }))
      continue
    }

    let source = sourceCache.get(planned.sourcePath)
    if (!source) {
      const inspected = await readAndValidateLocalImage(absoluteSource, absolutePublicRoot, maxSourceBytes)
      source = inspected.error
        ? { error: inspected.error }
        : {
            bytes: inspected.bytes,
            extension: inspected.extension,
            frames: inspected.frames,
            height: inspected.height,
            mime: inspected.mime,
            sha256: inspected.sha256,
            width: inspected.width
          }
      sourceCache.set(planned.sourcePath, source)
    }

    if (source.error) {
      planned.status = 'invalid'
      planned.reason = source.error
      plannedOccurrences.push(planned)
      diagnostics.push(makeDiagnostic({
        code: source.error,
        column: occurrence.column,
        file: occurrence.file,
        line: occurrence.line,
        message: `Cannot validate legacy image ${planned.sourcePath}`,
        severity: 'error'
      }))
      continue
    }

    planned.assetSha256 = source.sha256
    planned.status = 'ready'
    plannedOccurrences.push(planned)
  }

  const assetGroups = new Map()
  for (const occurrence of plannedOccurrences.filter(item => item.status === 'ready')) {
    const source = sourceCache.get(occurrence.sourcePath)
    const existing = assetGroups.get(source.sha256) || {
      bytes: source.bytes,
      extension: source.extension,
      frames: source.frames,
      height: source.height,
      mime: source.mime,
      occurrences: [],
      sha256: source.sha256,
      sourcePaths: new Set(),
      sourceUrls: new Set()
    }
    existing.occurrences.push(occurrence)
    existing.sourcePaths.add(occurrence.sourcePath)
    existing.sourceUrls.add(occurrence.sourceUrl)
    assetGroups.set(source.sha256, existing)
  }

  const assets = [...assetGroups.values()].map(group => {
    const targetPath = `${targetPrefix}/${group.sha256.slice(0, 2)}/${group.sha256}.${group.extension}`
    const candidates = buildPublicCandidates(publicConfig, targetPath)
    return {
      bytes: group.bytes,
      candidates,
      extension: group.extension,
      id: `asset_${group.sha256.slice(0, 24)}`,
      mime: group.mime,
      occurrenceIds: group.occurrences.map(item => item.id).sort(compareStrings),
      sha256: group.sha256,
      sourcePaths: [...group.sourcePaths].sort(compareStrings),
      sourceUrls: [...group.sourceUrls].sort(compareStrings),
      targetPath,
      targetUrl: candidates[0]?.url || null,
      width: group.width
    }
  }).sort((left, right) => compareStrings(left.sha256, right.sha256))

  const assetByHash = new Map(assets.map(asset => [asset.sha256, asset]))
  for (const occurrence of plannedOccurrences) {
    if (!occurrence.assetSha256) continue
    const asset = assetByHash.get(occurrence.assetSha256)
    occurrence.assetId = asset.id
    occurrence.targetPath = asset.targetPath
    occurrence.targetUrl = asset.targetUrl
  }

  const mappings = buildMappings(plannedOccurrences)
  if (!publicConfig && assets.length > 0) {
    diagnostics.push(makeDiagnostic({
      code: 'media-public-config-missing',
      file: '',
      message: 'IMAGE_GITHUB_OWNER and IMAGE_GITHUB_REPO are required before apply can produce replacement URLs',
      severity: 'warning'
    }))
  }

  diagnostics.sort(diagnosticSort)
  const errors = diagnostics.filter(item => item.severity === 'error')
  const warnings = diagnostics.filter(item => item.severity === 'warning')
  const draft = {
    assets,
    contentRoot: contentRoot.split(path.sep).join('/'),
    files: fileInventory.sort((left, right) => compareStrings(left.path, right.path)),
    kind: 'mlog-media-migration-plan',
    legacyOrigins,
    mappings,
    occurrences: plannedOccurrences,
    publicRoot: publicRoot.split(path.sep).join('/'),
    publicUrlConfig: publicConfig,
    schemaVersion: MEDIA_MIGRATION_SCHEMA_VERSION,
    summary: {
      alreadyMigratedOccurrences: plannedOccurrences.filter(item => item.status === 'already-migrated').length,
      errorCount: errors.length,
      externalOccurrences: plannedOccurrences.filter(item => item.status === 'external').length,
      plannedAssets: assets.length,
      readyOccurrences: plannedOccurrences.filter(item => item.status === 'ready').length,
      scannedFiles: fileInventory.length,
      totalOccurrences: plannedOccurrences.length,
      warningCount: warnings.length
    },
    targetPrefix,
    validation: {
      errors,
      valid: errors.length === 0,
      warnings
    }
  }
  return { ...draft, planId: `plan_${sha256(stableStringify(draft))}` }
}

function buildMappings(occurrences) {
  const groups = new Map()
  for (const occurrence of occurrences) {
    const key = [occurrence.sourceUrl, occurrence.sourcePath || ''].join('\0')
    const existing = groups.get(key) || {
      assetId: occurrence.assetId || null,
      occurrenceIds: [],
      sourcePath: occurrence.sourcePath || null,
      sourceUrl: occurrence.sourceUrl,
      status: occurrence.status,
      targetPath: occurrence.targetPath || null,
      targetUrl: occurrence.targetUrl || null
    }
    existing.occurrenceIds.push(occurrence.id)
    groups.set(key, existing)
  }
  return [...groups.values()]
    .map(mapping => ({ ...mapping, occurrenceIds: mapping.occurrenceIds.sort(compareStrings) }))
    .sort((left, right) => compareStrings(left.sourceUrl, right.sourceUrl) || compareStrings(left.sourcePath || '', right.sourcePath || ''))
}

export function createCheckpoint(plan, previous = null) {
  validatePlanShape(plan)
  const samePlan = previous?.planId === plan.planId
  const previousAssets = new Map(
    previous?.kind === 'mlog-media-migration-checkpoint' && Array.isArray(previous.assets)
      ? previous.assets.map(asset => [asset.assetId, asset])
      : []
  )

  const assets = plan.assets.map(asset => {
    const old = previousAssets.get(asset.id)
    const publicUrlMatches = !old?.publicUrl || asset.candidates.some(candidate => candidate.url === old.publicUrl)
    const canResume = (
      old &&
      old.sourceSha256 === asset.sha256 &&
      old.targetPath === asset.targetPath &&
      publicUrlMatches &&
      PRESERVABLE_CHECKPOINT_STATUSES.has(old.status) &&
      (samePlan || old.status === 'uploaded' || old.status === 'verified')
    )
    return {
      assetId: asset.id,
      lastError: canResume ? old.lastError || null : null,
      publicUrl: canResume ? old.publicUrl || null : null,
      remoteSha: canResume ? old.remoteSha || null : null,
      sourceSha256: asset.sha256,
      status: canResume ? old.status : 'pending',
      targetPath: asset.targetPath
    }
  })

  return {
    assets,
    kind: 'mlog-media-migration-checkpoint',
    planId: plan.planId,
    schemaVersion: MEDIA_MIGRATION_SCHEMA_VERSION
  }
}

export function createRollbackManifest(plan) {
  validatePlanShape(plan)
  return {
    files: [],
    kind: 'mlog-media-migration-rollback',
    mappings: plan.occurrences
      .filter(occurrence => occurrence.status === 'ready')
      .map(occurrence => ({
        assetId: occurrence.assetId,
        file: occurrence.file,
        fileSha256Before: occurrence.fileSha256,
        kind: occurrence.kind,
        migratedUrl: occurrence.targetUrl,
        occurrenceId: occurrence.id,
        originalUrl: occurrence.sourceUrl,
        targetPath: occurrence.targetPath
      }))
      .sort((left, right) => compareStrings(left.occurrenceId, right.occurrenceId)),
    planId: plan.planId,
    schemaVersion: MEDIA_MIGRATION_SCHEMA_VERSION
  }
}

export function validatePlanShape(plan) {
  if (
    !plan ||
    plan.kind !== 'mlog-media-migration-plan' ||
    plan.schemaVersion !== MEDIA_MIGRATION_SCHEMA_VERSION ||
    typeof plan.planId !== 'string' ||
    !Array.isArray(plan.assets) ||
    !Array.isArray(plan.occurrences)
  ) {
    throw new Error('Invalid or unsupported media migration plan')
  }

  const { planId, ...draft } = plan
  if (planId !== `plan_${sha256(stableStringify(draft))}`) {
    throw new Error('Media migration plan digest does not match its contents')
  }
}

export function validateCheckpoint(plan, checkpoint) {
  validatePlanShape(plan)
  if (
    !checkpoint ||
    checkpoint.kind !== 'mlog-media-migration-checkpoint' ||
    checkpoint.schemaVersion !== MEDIA_MIGRATION_SCHEMA_VERSION ||
    checkpoint.planId !== plan.planId ||
    !Array.isArray(checkpoint.assets)
  ) {
    throw new Error('Checkpoint does not belong to this media migration plan')
  }

  const expected = new Map(plan.assets.map(asset => [asset.id, asset]))
  if (checkpoint.assets.length !== expected.size) {
    throw new Error('Checkpoint asset count does not match the migration plan')
  }
  for (const state of checkpoint.assets) {
    const asset = expected.get(state.assetId)
    if (!asset || state.sourceSha256 !== asset.sha256 || state.targetPath !== asset.targetPath) {
      throw new Error(`Checkpoint asset does not match the migration plan: ${state.assetId}`)
    }
    if (state.publicUrl && !asset.candidates.some(candidate => candidate.url === state.publicUrl)) {
      throw new Error(`Checkpoint public URL is outside the planned candidates: ${state.assetId}`)
    }
    if (
      (state.status === 'verified' || state.status === 'rewritten' || state.status === 'complete') &&
      !state.publicUrl
    ) {
      throw new Error(`Checkpoint has no provider-verified public URL: ${state.assetId}`)
    }
  }
}

export function validateApplyConfiguration(environment = process.env) {
  const missing = REQUIRED_APPLY_ENV.filter(name => !String(environment[name] || '').trim())
  if (missing.length > 0) {
    throw new Error(`Apply is blocked: missing ${missing.join(', ')}`)
  }
  for (const name of REQUIRED_APPLY_ENV) {
    const raw = String(environment[name])
    if (raw !== raw.trim() || /\s/.test(raw)) {
      throw new Error(`Apply is blocked: invalid whitespace in ${name}`)
    }
  }
  const publicConfig = normalizePublicConfig({
    branch: environment.IMAGE_GITHUB_BRANCH || 'main',
    cdnBaseUrl: environment.NEXT_PUBLIC_CDN_BASE_URL,
    owner: environment.IMAGE_GITHUB_OWNER.trim(),
    repo: environment.IMAGE_GITHUB_REPO.trim()
  })
  return {
    ...publicConfig,
    pathPrefix: normalizeTargetPrefix(environment.IMAGE_GITHUB_PATH_PREFIX || DEFAULT_TARGET_PREFIX)
  }
}

function validateApplyInputs(plan, checkpoint, environment) {
  const config = validateApplyConfiguration(environment)
  validateCheckpoint(plan, checkpoint)
  if (!plan.validation?.valid) {
    throw new Error('Apply is blocked because the migration plan contains validation errors')
  }
  const { pathPrefix, ...publicConfig } = config
  if (
    !plan.publicUrlConfig ||
    stableStringify(plan.publicUrlConfig) !== stableStringify(publicConfig) ||
    plan.targetPrefix !== pathPrefix
  ) {
    throw new Error('Apply is blocked because the plan does not match the active media configuration')
  }
  if (plan.assets.some(asset => !asset.targetUrl)) {
    throw new Error('Apply is blocked because one or more assets have no target URL')
  }
  for (const asset of plan.assets) {
    const expectedCandidates = buildPublicCandidates(publicConfig, asset.targetPath)
    if (
      asset.targetUrl !== expectedCandidates[0]?.url ||
      stableStringify(asset.candidates) !== stableStringify(expectedCandidates) ||
      !asset.targetPath.startsWith(`${plan.targetPrefix}/`)
    ) {
      throw new Error(`Apply is blocked by an invalid target mapping: ${asset.id}`)
    }
  }
  return config
}

function safeRepoFile(projectRoot, repoPath, requiredPrefix) {
  const normalizedRepoPath = String(repoPath).replaceAll('\\', '/')
  const normalizedPrefix = String(requiredPrefix).replaceAll('\\', '/').replace(/\/$/, '')
  if (
    path.isAbsolute(normalizedRepoPath) ||
    !normalizedRepoPath.startsWith(`${normalizedPrefix}/`) ||
    normalizedRepoPath.split('/').some(segment => segment === '..')
  ) {
    throw new Error(`Unsafe migration path: ${repoPath}`)
  }
  const absolutePath = path.resolve(projectRoot, normalizedRepoPath)
  const boundary = `${path.resolve(projectRoot, normalizedPrefix)}${path.sep}`
  if (!absolutePath.startsWith(boundary)) {
    throw new Error(`Migration path leaves ${normalizedPrefix}: ${repoPath}`)
  }
  return absolutePath
}

function replacementFor(edit, targetUrl) {
  return edit.format === 'yaml-scalar' ? JSON.stringify(targetUrl) : targetUrl
}

export function buildContentRewrite(raw, occurrences) {
  const candidates = occurrences.filter(occurrence => occurrence.status === 'ready')
  const uniqueEdits = new Map()

  for (const occurrence of candidates) {
    if (!occurrence.targetUrl || !occurrence.edit) {
      throw new Error(`Occurrence is not ready for rewrite: ${occurrence.id}`)
    }
    const edit = occurrence.edit
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end <= edit.start ||
      edit.end > raw.length ||
      raw.slice(edit.start, edit.end) !== edit.expected
    ) {
      throw new Error(`Parser edit range no longer matches content: ${occurrence.id}`)
    }

    const replacement = replacementFor(edit, occurrence.targetUrl)
    const key = `${edit.start}:${edit.end}`
    const existing = uniqueEdits.get(key)
    if (existing && (existing.replacement !== replacement || existing.expected !== edit.expected)) {
      throw new Error(`Conflicting parser edits at ${key}`)
    }
    uniqueEdits.set(key, {
      end: edit.end,
      expected: edit.expected,
      occurrenceIds: [...(existing?.occurrenceIds || []), occurrence.id].sort(compareStrings),
      replacement,
      start: edit.start
    })
  }

  const edits = [...uniqueEdits.values()].sort((left, right) => left.start - right.start)
  let previousEnd = -1
  let delta = 0
  const reverseEdits = []
  for (const edit of edits) {
    if (edit.start < previousEnd) throw new Error('Overlapping parser edits in migration plan')
    const migratedStart = edit.start + delta
    reverseEdits.push({
      end: migratedStart + edit.replacement.length,
      expected: edit.replacement,
      occurrenceIds: edit.occurrenceIds,
      replacement: edit.expected,
      start: migratedStart
    })
    delta += edit.replacement.length - (edit.end - edit.start)
    previousEnd = edit.end
  }

  let content = raw
  for (const edit of edits.toReversed()) {
    content = `${content.slice(0, edit.start)}${edit.replacement}${content.slice(edit.end)}`
  }

  return {
    afterSha256: sha256(content),
    beforeSha256: sha256(raw),
    changed: content !== raw,
    content,
    reverseEdits
  }
}

function applyExactEdits(raw, edits) {
  const sorted = [...edits].sort((left, right) => left.start - right.start)
  let previousEnd = -1
  for (const edit of sorted) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < previousEnd ||
      raw.slice(edit.start, edit.end) !== edit.expected
    ) {
      throw new Error('Rollback edit range no longer matches content')
    }
    previousEnd = edit.end
  }
  let content = raw
  for (const edit of sorted.toReversed()) {
    content = `${content.slice(0, edit.start)}${edit.replacement}${content.slice(edit.end)}`
  }
  return content
}

async function writeChangesAtomically(changes) {
  const prepared = []
  const committed = []
  try {
    for (const [index, change] of changes.entries()) {
      const temporaryPath = `${change.absolutePath}.media-migrate-${process.pid}-${index}-${randomUUID()}.tmp`
      const stat = await fs.stat(change.absolutePath)
      await fs.writeFile(temporaryPath, change.content, { encoding: 'utf8', mode: stat.mode })
      prepared.push({ ...change, temporaryPath })
    }
    for (const change of prepared) {
      await fs.rename(change.temporaryPath, change.absolutePath)
      committed.push(change)
    }
  } catch (error) {
    for (const change of committed.toReversed()) {
      await fs.writeFile(change.absolutePath, change.original, 'utf8').catch(() => {})
    }
    throw error
  } finally {
    await Promise.all(prepared.map(change => fs.rm(change.temporaryPath, { force: true }).catch(() => {})))
  }
}

async function writeTextAtomically(filePath, content) {
  const temporaryPath = `${filePath}.media-migrate-${process.pid}-${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.writeFile(temporaryPath, content, 'utf8')
    await fs.rename(temporaryPath, filePath)
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

export async function writeMigrationStateArtifacts(options) {
  // Rollback is the recovery source of truth, so it must reach disk before the checkpoint advances.
  await writeTextAtomically(options.rollbackPath, serializeManifest(options.rollback))
  await writeTextAtomically(options.checkpointPath, serializeManifest(options.checkpoint))
}

export async function verifyAppliedContent(options) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd())
  const files = options.rollback?.files
  if (!Array.isArray(files) || files.length === 0) return false
  for (const file of files) {
    if (file.status !== 'applied') return false
    const absolutePath = safeRepoFile(projectRoot, file.path, options.contentRoot || DEFAULT_CONTENT_ROOT)
    const raw = await fs.readFile(absolutePath, 'utf8')
    if (sha256(raw) !== file.fileSha256After) return false
  }
  return true
}

export async function applyArticleRewrites(options) {
  if (options.apply !== true) throw new Error('Article rewrite requires explicit apply: true')
  const { plan, checkpoint } = options
  validateApplyInputs(plan, checkpoint, options.environment)
  if (plan.assets.length === 0) {
    return {
      alreadyApplied: true,
      changedFiles: [],
      checkpoint,
      rollback: options.rollback || createRollbackManifest(plan)
    }
  }
  const states = new Map(checkpoint.assets.map(state => [state.assetId, state]))
  const statuses = new Set(checkpoint.assets.map(state => state.status))
  if ([...statuses].every(status => status === 'rewritten' || status === 'complete')) {
    if (!await verifyAppliedContent({
      contentRoot: plan.contentRoot,
      projectRoot: options.projectRoot,
      rollback: options.rollback
    })) {
      throw new Error('Checkpoint says rewritten, but article verification failed')
    }
    return { alreadyApplied: true, changedFiles: [], checkpoint, rollback: options.rollback }
  }
  if ([...statuses].some(status => status === 'rewritten' || status === 'complete')) {
    throw new Error('Checkpoint contains a partial article rewrite state')
  }
  for (const asset of plan.assets) {
    if (states.get(asset.id)?.status !== 'verified') {
      throw new Error(`Apply is blocked until the provider verifies ${asset.id}`)
    }
  }

  const projectRoot = path.resolve(options.projectRoot || process.cwd())
  const occurrencesByFile = new Map()
  for (const occurrence of plan.occurrences.filter(item => item.status === 'ready')) {
    const existing = occurrencesByFile.get(occurrence.file) || []
    existing.push(occurrence)
    occurrencesByFile.set(occurrence.file, existing)
  }
  const rollbackBase = options.rollback || createRollbackManifest(plan)
  const rollback = {
    ...rollbackBase,
    files: [...(rollbackBase.files || [])],
    mappings: rollbackBase.mappings.map(mapping => ({
      ...mapping,
      migratedUrl: states.get(mapping.assetId)?.publicUrl
    }))
  }
  const rollbackFiles = new Map(rollback.files.map(file => [file.path, file]))
  const changedFiles = []
  for (const [file, occurrences] of [...occurrencesByFile.entries()].sort(([left], [right]) => compareStrings(left, right))) {
    const absolutePath = safeRepoFile(projectRoot, file, plan.contentRoot)
    const raw = await fs.readFile(absolutePath, 'utf8')
    const expectedHash = occurrences[0].fileSha256
    if (occurrences.some(item => item.fileSha256 !== expectedHash)) {
      throw new Error(`Migration plan has conflicting article hashes: ${file}`)
    }
    const existingRollback = rollbackFiles.get(file)
    const currentHash = sha256(raw)
    if (existingRollback && currentHash === existingRollback.fileSha256After) {
      if (existingRollback.status !== 'applied') {
        existingRollback.status = 'applied'
        await options.onState?.({ checkpoint, file, phase: 'applied', rollback })
      }
      continue
    }
    if (currentHash !== expectedHash || (existingRollback && currentHash !== existingRollback.fileSha256Before)) {
      throw new Error(`Article changed after the plan was generated: ${file}`)
    }
    parseContentFile(raw, file)
    const rewrite = buildContentRewrite(raw, occurrences.map(occurrence => ({
      ...occurrence,
      targetUrl: states.get(occurrence.assetId)?.publicUrl
    })))
    if (!rewrite.changed) continue
    if (
      existingRollback &&
      (
        existingRollback.fileSha256After !== rewrite.afterSha256 ||
        existingRollback.fileSha256Before !== rewrite.beforeSha256 ||
        stableStringify(existingRollback.reverseEdits) !== stableStringify(rewrite.reverseEdits)
      )
    ) {
      throw new Error(`Rollback state conflicts with the parser rewrite: ${file}`)
    }
    const rollbackFile = existingRollback || {
      fileSha256After: rewrite.afterSha256,
      fileSha256Before: rewrite.beforeSha256,
      path: file,
      reverseEdits: rewrite.reverseEdits,
      status: 'prepared'
    }
    rollbackFile.status = 'prepared'
    rollbackFiles.set(file, rollbackFile)
    rollback.files = [...rollbackFiles.values()].sort((left, right) => compareStrings(left.path, right.path))
    await options.onState?.({ checkpoint, file, phase: 'prepared', rollback })

    await writeChangesAtomically([{ absolutePath, content: rewrite.content, original: raw }])
    rollbackFile.status = 'applied'
    changedFiles.push(file)
    await options.onState?.({ checkpoint, file, phase: 'applied', rollback })
  }

  for (const state of checkpoint.assets) state.status = 'rewritten'
  await options.onState?.({ checkpoint, file: null, phase: 'complete', rollback })
  return {
    alreadyApplied: changedFiles.length === 0,
    changedFiles,
    checkpoint,
    rollback
  }
}

export async function rollbackArticleRewrites(options) {
  if (options.apply !== true) throw new Error('Article rollback requires explicit apply: true')
  validateApplyConfiguration(options.environment)
  const rollback = options.rollback
  if (
    !rollback ||
    rollback.kind !== 'mlog-media-migration-rollback' ||
    rollback.schemaVersion !== MEDIA_MIGRATION_SCHEMA_VERSION ||
    !Array.isArray(rollback.files) ||
    rollback.files.length === 0
  ) {
    throw new Error('Rollback manifest has no applied article state')
  }
  if (options.plan) {
    validatePlanShape(options.plan)
    if (rollback.planId !== options.plan.planId) {
      throw new Error('Rollback manifest does not belong to this migration plan')
    }
    if (options.checkpoint) validateCheckpoint(options.plan, options.checkpoint)
  }

  const projectRoot = path.resolve(options.projectRoot || process.cwd())
  const changedFiles = []
  for (const file of rollback.files) {
    const absolutePath = safeRepoFile(projectRoot, file.path, options.contentRoot || DEFAULT_CONTENT_ROOT)
    const raw = await fs.readFile(absolutePath, 'utf8')
    const currentHash = sha256(raw)
    if (currentHash === file.fileSha256Before) {
      if (file.status !== 'rolled-back') {
        file.status = 'rolled-back'
        await options.onState?.({
          checkpoint: options.checkpoint,
          file: file.path,
          phase: 'rolled-back',
          rollback
        })
      }
      continue
    }
    if (currentHash !== file.fileSha256After) {
      throw new Error(`Article changed after migration; rollback stopped: ${file.path}`)
    }
    const content = applyExactEdits(raw, file.reverseEdits)
    if (sha256(content) !== file.fileSha256Before) {
      throw new Error(`Rollback checksum failed: ${file.path}`)
    }
    await writeChangesAtomically([{ absolutePath, content, original: raw }])
    file.status = 'rolled-back'
    changedFiles.push(file.path)
    await options.onState?.({
      checkpoint: options.checkpoint,
      file: file.path,
      phase: 'rolled-back',
      rollback
    })
  }
  if (options.checkpoint) {
    for (const state of options.checkpoint.assets) {
      if (state.status === 'rewritten' || state.status === 'complete') state.status = 'verified'
    }
    await options.onState?.({
      checkpoint: options.checkpoint,
      file: null,
      phase: 'rollback-complete',
      rollback
    })
  }
  return { changedFiles, checkpoint: options.checkpoint, rollback }
}

export async function prepareAssetsWithProvider(options) {
  if (options.apply !== true) throw new Error('Provider migration requires explicit apply: true')
  const { plan, checkpoint, provider } = options
  validateApplyInputs(plan, checkpoint, options.environment)
  if (!provider || typeof provider.put !== 'function' || typeof provider.verify !== 'function') {
    throw new Error('Provider adapter must implement put() and verify()')
  }

  const projectRoot = path.resolve(options.projectRoot || process.cwd())
  const states = new Map(checkpoint.assets.map(state => [state.assetId, state]))
  for (const asset of plan.assets) {
    const state = states.get(asset.id)
    if (state.status === 'verified' || state.status === 'rewritten' || state.status === 'complete') continue
    const sourcePath = asset.sourcePaths[0]
    const absolutePath = safeRepoFile(projectRoot, sourcePath, plan.publicRoot)
    try {
      const inspected = await readAndValidateLocalImage(
        absolutePath,
        path.resolve(projectRoot, plan.publicRoot)
      )
      if (inspected.error || inspected.sha256 !== asset.sha256 || inspected.mime !== asset.mime) {
        throw new Error(`Source image checksum or type changed: ${sourcePath}`)
      }
      const bytes = inspected.buffer
      const stored = state.status === 'uploaded'
        ? { remoteSha: state.remoteSha, resumed: true }
        : await provider.put({ asset, bytes, sourcePath })
      if (state.status !== 'uploaded') {
        state.status = 'uploaded'
        state.remoteSha = stored?.remoteSha || null
        state.lastError = null
        if (options.onCheckpoint) await options.onCheckpoint(checkpoint)
      }

      const verified = await provider.verify({ asset, stored })
      if (!verified?.available || !asset.candidates.some(candidate => candidate.url === verified?.url)) {
        throw new Error(`Provider did not verify a planned target URL for ${asset.id}`)
      }
      state.status = 'verified'
      state.publicUrl = verified.url
      state.remoteSha = verified.remoteSha || state.remoteSha
      if (options.onCheckpoint) await options.onCheckpoint(checkpoint)
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error)
      if (options.onCheckpoint) await options.onCheckpoint(checkpoint)
      throw error
    }
  }
  return checkpoint
}

export function serializeManifest(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function writePlanArtifacts(options) {
  const outputDirectory = path.resolve(options.outputDirectory)
  const planPath = path.join(outputDirectory, 'plan.json')
  const checkpointPath = path.join(outputDirectory, 'checkpoint.json')
  const rollbackPath = path.join(outputDirectory, 'rollback.json')
  let previous = null
  let previousRollback = null

  if (!options.fresh) {
    for (const [manifestPath, assign] of [
      [checkpointPath, value => { previous = value }],
      [rollbackPath, value => { previousRollback = value }]
    ]) {
      try {
        assign(JSON.parse(await fs.readFile(manifestPath, 'utf8')))
      } catch (error) {
        if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error
      }
    }
  }

  const hasAppliedRollback = Array.isArray(previousRollback?.files) && previousRollback.files.length > 0
  const hasActiveRollback = previousRollback?.files?.some(file => file.status !== 'rolled-back')
  if (
    hasAppliedRollback &&
    hasActiveRollback &&
    previousRollback.planId !== options.plan.planId
  ) {
    throw new Error('Applied rollback data would be replaced by a new plan; rollback first or use --fresh explicitly')
  }

  const checkpoint = createCheckpoint(options.plan, previous)
  const rollback = hasAppliedRollback && previousRollback.planId === options.plan.planId
    ? previousRollback
    : createRollbackManifest(options.plan)
  await writeTextAtomically(planPath, serializeManifest(options.plan))
  await writeMigrationStateArtifacts({ checkpoint, checkpointPath, rollback, rollbackPath })
  return { checkpoint, checkpointPath, planPath, rollback, rollbackPath }
}
