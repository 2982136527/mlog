#!/usr/bin/env node
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  DEFAULT_CONTENT_ROOT,
  DEFAULT_PUBLIC_ROOT,
  DEFAULT_TARGET_PREFIX,
  applyArticleRewrites,
  buildMigrationPlan,
  rollbackArticleRewrites,
  validateApplyConfiguration,
  writeMigrationStateArtifacts,
  writePlanArtifacts
} from './media-migrate-lib.mjs'

const execFileAsync = promisify(execFile)

function usage() {
  return `Usage: pnpm media:migrate [options]

Builds an offline, deterministic migration plan. It never uploads media.
Article changes require --apply, complete media config, and a provider-verified
checkpoint. The default output directory is .media-migration.

Options:
  --root <path>             Project root (default: current directory)
  --content-checkout <path> Authoritative content Git checkout for apply/rollback
  --content-root <path>     Content tree relative to root (default: content/posts)
  --public-root <path>      Public asset root relative to root (default: public)
  --output-dir <path>       Plan/checkpoint/rollback output directory
  --target-prefix <path>    Remote object prefix (default: uploads/blog)
  --cdn-base-url <url>      Optional NEXT_PUBLIC_CDN_BASE_URL override for planning
  --legacy-origin <origin>  Treat this HTTP(S) origin's /images/uploads URLs as local
  --fresh                   Do not carry completed checkpoint entries forward
  --stdout                  Print the plan without writing local artifacts
  --strict                  Exit non-zero when the plan has validation errors
  --apply                   Rewrite articles after every asset is provider-verified
  --rollback                Restore articles using the applied rollback manifest
  --help                    Show this help
`
}

function parseArguments(argv) {
  const result = { legacyOrigins: [] }
  const valueOptions = new Map([
    ['--root', 'projectRoot'],
    ['--content-checkout', 'contentCheckout'],
    ['--content-root', 'contentRoot'],
    ['--public-root', 'publicRoot'],
    ['--output-dir', 'outputDirectory'],
    ['--target-prefix', 'targetPrefix'],
    ['--cdn-base-url', 'cdnBaseUrl']
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') result.help = true
    else if (argument === '--fresh') result.fresh = true
    else if (argument === '--stdout') result.stdout = true
    else if (argument === '--strict') result.strict = true
    else if (argument === '--apply') result.apply = true
    else if (argument === '--rollback') result.rollback = true
    else if (argument === '--legacy-origin') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--legacy-origin requires a value')
      result.legacyOrigins.push(value)
      index += 1
    } else if (valueOptions.has(argument)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
      result[valueOptions.get(argument)] = value
      index += 1
    } else {
      throw new Error(`Unknown option: ${argument}`)
    }
  }
  return result
}

async function assertAuthoritativeContentCheckout(projectRoot, contentRoot) {
  let topLevel
  let trackedFiles
  try {
    const topLevelResult = await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'])
    topLevel = topLevelResult.stdout.trim()
    const trackedResult = await execFileAsync('git', [
      '-C', projectRoot,
      '-c', 'core.quotePath=false',
      'ls-files', '-z', '--', contentRoot
    ], { maxBuffer: 10 * 1024 * 1024 })
    trackedFiles = trackedResult.stdout.split('\0').filter(Boolean)
  } catch {
    throw new Error('--content-checkout must point to an accessible Git worktree')
  }

  const [realRoot, realTopLevel] = await Promise.all([fs.realpath(projectRoot), fs.realpath(topLevel)])
  if (realRoot !== realTopLevel) {
    throw new Error('--content-checkout must point to the root of the authoritative content Git worktree')
  }
  if (!trackedFiles.some(file => /\/(?:zh|en)\.md$/.test(file))) {
    throw new Error('--content-checkout has no tracked zh.md/en.md content files; the MLog cache is not authoritative')
  }
  return new Set(trackedFiles)
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return
  }

  if ((args.apply || args.rollback) && !args.contentCheckout) {
    const remoteConfigured = Object.entries(process.env).some(([name, value]) => (
      name.startsWith('CONTENT_GITHUB_') && String(value || '').trim()
    ))
    throw new Error(
      `${remoteConfigured ? 'CONTENT_GITHUB_* is configured; ' : ''}` +
      '--apply/--rollback requires --content-checkout. The local MLog content cache is not authoritative.'
    )
  }
  if (args.contentCheckout && args.projectRoot) {
    throw new Error('--root and --content-checkout cannot be combined')
  }

  const projectRoot = path.resolve(args.contentCheckout || args.projectRoot || process.cwd())
  const outputDirectory = path.resolve(projectRoot, args.outputDirectory || '.media-migration')
  if (args.apply && args.rollback) throw new Error('--apply and --rollback cannot be used together')
  if ((args.apply || args.rollback) && args.stdout) throw new Error('--stdout cannot be combined with a write operation')

  if (args.apply || args.rollback) {
    const trackedContentFiles = await assertAuthoritativeContentCheckout(
      projectRoot,
      args.contentRoot || DEFAULT_CONTENT_ROOT
    )
    const environment = {
      ...process.env,
      ...(args.cdnBaseUrl ? { NEXT_PUBLIC_CDN_BASE_URL: args.cdnBaseUrl } : {}),
      ...(args.targetPrefix ? { IMAGE_GITHUB_PATH_PREFIX: args.targetPrefix } : {})
    }
    validateApplyConfiguration(environment)
    const planPath = path.join(outputDirectory, 'plan.json')
    const checkpointPath = path.join(outputDirectory, 'checkpoint.json')
    const rollbackPath = path.join(outputDirectory, 'rollback.json')
    const [plan, checkpoint, rollback] = await Promise.all([
      fs.readFile(planPath, 'utf8').then(JSON.parse),
      fs.readFile(checkpointPath, 'utf8').then(JSON.parse),
      fs.readFile(rollbackPath, 'utf8').then(JSON.parse)
    ])
    const untrackedPlanFiles = [...new Set([
      ...(plan.files || []).map(file => file.path),
      ...(plan.occurrences || []).map(occurrence => occurrence.file)
    ])].filter(file => !trackedContentFiles.has(file))
    if (untrackedPlanFiles.length > 0) {
      throw new Error(`Migration plan contains untracked content files: ${untrackedPlanFiles[0]}`)
    }

    if (args.apply) {
      const persistState = state => writeMigrationStateArtifacts({
        checkpoint: state.checkpoint,
        checkpointPath,
        rollback: state.rollback,
        rollbackPath
      })
      const result = await applyArticleRewrites({
        apply: true,
        checkpoint,
        environment,
        onState: persistState,
        plan,
        projectRoot,
        rollback
      })
      await persistState(result)
      console.log(`[media:migrate] ${result.alreadyApplied ? 'already applied' : `rewritten ${result.changedFiles.length} article file(s)`}`)
      return
    }

    const persistState = state => writeMigrationStateArtifacts({
      checkpoint: state.checkpoint,
      checkpointPath,
      rollback: state.rollback,
      rollbackPath
    })
    const result = await rollbackArticleRewrites({
      apply: true,
      checkpoint,
      contentRoot: plan.contentRoot,
      environment,
      onState: persistState,
      plan,
      projectRoot,
      rollback
    })
    await persistState(result)
    console.log(`[media:migrate] rolled back ${result.changedFiles.length} article file(s)`)
    return
  }

  const plan = await buildMigrationPlan({
    cdnBaseUrl: args.cdnBaseUrl || process.env.NEXT_PUBLIC_CDN_BASE_URL || null,
    contentRoot: args.contentRoot || DEFAULT_CONTENT_ROOT,
    githubBranch: process.env.IMAGE_GITHUB_BRANCH || 'main',
    githubOwner: process.env.IMAGE_GITHUB_OWNER,
    githubRepo: process.env.IMAGE_GITHUB_REPO,
    legacyOrigins: args.legacyOrigins,
    projectRoot,
    publicRoot: args.publicRoot || DEFAULT_PUBLIC_ROOT,
    targetPrefix: args.targetPrefix || process.env.IMAGE_GITHUB_PATH_PREFIX || DEFAULT_TARGET_PREFIX
  })

  if (args.stdout) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
    if (args.strict && !plan.validation.valid) process.exitCode = 1
    return
  } else {
    const artifacts = await writePlanArtifacts({
      fresh: Boolean(args.fresh),
      outputDirectory,
      plan
    })
    console.log(`[media:migrate] dry-run plan: ${artifacts.planPath}`)
    console.log(`[media:migrate] checkpoint: ${artifacts.checkpointPath}`)
    console.log(`[media:migrate] rollback: ${artifacts.rollbackPath}`)
  }

  console.log(
    `[media:migrate] scanned=${plan.summary.scannedFiles} occurrences=${plan.summary.totalOccurrences} ` +
    `assets=${plan.summary.plannedAssets} errors=${plan.summary.errorCount} warnings=${plan.summary.warningCount}`
  )
  console.log('[media:migrate] dry-run only; no remote media or article content was changed')
  if (args.strict && !plan.validation.valid) process.exitCode = 1
}

main().catch(error => {
  console.error(`[media:migrate] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
