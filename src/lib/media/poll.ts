import type { StoredMediaAsset } from './repository'
import { getMediaProcessingExpiresAt } from './status'

export function mediaPoll(asset: StoredMediaAsset, url: string) {
  return {
    url,
    afterMs: 2_000,
    expiresAt: getMediaProcessingExpiresAt(asset)
  }
}
