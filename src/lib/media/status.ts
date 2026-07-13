import 'server-only'
import { randomUUID } from 'node:crypto'
import { MediaError } from './errors'
import { getMediaStorageFor } from './factory'
import {
  claimMediaProbeLease,
  getMediaById,
  markMediaFailed,
  releaseMediaProbeLease,
  updateMediaAvailability,
  type StoredMediaAsset
} from './repository'

const MIN_PROBE_INTERVAL_MS = 1_500
const DEFAULT_PROCESSING_TIMEOUT_SECONDS = 60
const DEFAULT_PROBE_LEASE_SECONDS = 15

export function getMediaProcessingTimeoutMs(): number {
  const seconds = Number(process.env.MEDIA_PROCESSING_TIMEOUT_SECONDS || DEFAULT_PROCESSING_TIMEOUT_SECONDS)
  const safeSeconds = Number.isSafeInteger(seconds) && seconds >= 30 && seconds <= 600
    ? seconds
    : DEFAULT_PROCESSING_TIMEOUT_SECONDS
  return safeSeconds * 1_000
}

export function getMediaProcessingExpiresAt(asset: StoredMediaAsset): string {
  const startedAt = Date.parse(asset.processingStartedAt || asset.createdAt)
  const base = Number.isFinite(startedAt) ? startedAt : Date.now()
  return new Date(base + getMediaProcessingTimeoutMs()).toISOString()
}

export function getMediaProbeLeaseMs(): number {
  const seconds = Number(process.env.MEDIA_PROBE_LEASE_SECONDS || DEFAULT_PROBE_LEASE_SECONDS)
  const safeSeconds = Number.isSafeInteger(seconds) && seconds >= 5 && seconds <= 60
    ? seconds
    : DEFAULT_PROBE_LEASE_SECONDS
  return safeSeconds * 1_000
}

async function latestMediaOr(id: string, fallback: StoredMediaAsset): Promise<StoredMediaAsset> {
  return await getMediaById(id, true) || fallback
}

export async function refreshMediaStatus(id: string, requestId: string): Promise<StoredMediaAsset> {
  const asset = await getMediaById(id, true)
  if (!asset) {
    throw new MediaError({
      status: 404,
      code: 'MEDIA_NOT_FOUND',
      message: 'Media asset not found.'
    })
  }
  if (asset.status === 'deleted' || asset.status === 'ready' || asset.status === 'failed') return asset

  const checkedAt = asset.availabilityCheckedAt ? Date.parse(asset.availabilityCheckedAt) : 0
  if (Number.isFinite(checkedAt) && Date.now() - checkedAt < MIN_PROBE_INTERVAL_MS) {
    return asset
  }

  const leaseToken = randomUUID()
  const claim = await claimMediaProbeLease({
    id: asset.id,
    token: leaseToken,
    leaseMs: getMediaProbeLeaseMs()
  })
  if (!claim) {
    throw new MediaError({
      status: 404,
      code: 'MEDIA_NOT_FOUND',
      message: 'Media asset not found.'
    })
  }
  if (!claim.acquired || claim.asset.status !== 'processing') return claim.asset

  let availability
  try {
    availability = await getMediaStorageFor(claim.asset.locator).probe(claim.asset.path, requestId)
  } catch (error) {
    await releaseMediaProbeLease(claim.asset.id, leaseToken)
    throw error
  }

  if (availability.available) {
    return await updateMediaAvailability(claim.asset.id, leaseToken, availability)
      || latestMediaOr(claim.asset.id, claim.asset)
  }

  if (Date.now() >= Date.parse(getMediaProcessingExpiresAt(claim.asset))) {
    return await markMediaFailed(
      claim.asset.id,
      leaseToken,
      'MEDIA_PROCESSING_TIMEOUT',
      'No approved public media URL became available before the processing deadline.',
      availability.checkedAt
    ) || latestMediaOr(claim.asset.id, claim.asset)
  }
  return await updateMediaAvailability(claim.asset.id, leaseToken, availability)
    || latestMediaOr(claim.asset.id, claim.asset)
}
