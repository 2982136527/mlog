import 'server-only'
import { readMediaConfig } from './config'
import { GitHubMediaStorage } from './github-provider'
import { createPostgresMediaRateLimiter } from './rate-limit'
import { MediaUploadService } from './service'
import type { MediaProviderLocator } from './types'

let uploadService: MediaUploadService | null = null
let mediaStorage: GitHubMediaStorage | null = null
const historicalStorage = new Map<string, GitHubMediaStorage>()

export function getMediaStorage(): GitHubMediaStorage {
  if (!mediaStorage) {
    const config = readMediaConfig()
    mediaStorage = new GitHubMediaStorage(config)
  }
  return mediaStorage
}

export function getMediaStorageFor(locator: MediaProviderLocator): GitHubMediaStorage {
  const config = readMediaConfig({
    ...process.env,
    IMAGE_GITHUB_OWNER: locator.owner,
    IMAGE_GITHUB_REPO: locator.repo,
    IMAGE_GITHUB_BRANCH: locator.branch,
    IMAGE_GITHUB_PATH_PREFIX: locator.pathPrefix
  })
  const key = `${config.github.owner}/${config.github.repo}@${config.github.branch}:${config.pathPrefix}`
  let storage = historicalStorage.get(key)
  if (!storage) {
    storage = new GitHubMediaStorage(config)
    historicalStorage.set(key, storage)
  }
  return storage
}

export function getMediaUploadService(): MediaUploadService {
  if (!uploadService) {
    const config = readMediaConfig()
    uploadService = new MediaUploadService(
      config,
      getMediaStorage(),
      createPostgresMediaRateLimiter()
    )
  }
  return uploadService
}
