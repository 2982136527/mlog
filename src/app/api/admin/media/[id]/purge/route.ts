import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { createRequestId, ok } from '@/lib/admin/response'
import { MediaError } from '@/lib/media/errors'
import { getMediaStorageFor } from '@/lib/media/factory'
import { mediaFailure, validateMediaId } from '@/lib/media/http'
import { getMediaReferences } from '@/lib/media/references'
import { claimMediaPurge, getMediaById, removeClaimedMediaRecord } from '@/lib/media/repository'

const DEFAULT_PURGE_GRACE_DAYS = 30
const PURGE_LEASE_MS = 2 * 60_000

function purgeGraceDays(): number {
  const value = Number(process.env.MEDIA_PURGE_GRACE_DAYS || DEFAULT_PURGE_GRACE_DAYS)
  return Number.isSafeInteger(value) && value >= DEFAULT_PURGE_GRACE_DAYS ? value : DEFAULT_PURGE_GRACE_DAYS
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId()
  try {
    const { login } = await requireAdminSession()
    if ((process.env.MEDIA_PURGE_ENABLED || '').trim().toLowerCase() !== 'true') {
      throw new MediaError({
        status: 403,
        code: 'MEDIA_PURGE_NOT_ALLOWED',
        message: 'Current-branch media removal is disabled. Soft deletion keeps published URLs intact.'
      })
    }

    const id = validateMediaId((await params).id)
    const body = await request.json().catch(() => ({})) as { expectedHash?: unknown }
    const expectedHash = typeof body.expectedHash === 'string' ? body.expectedHash.trim().toLowerCase() : ''
    const asset = await getMediaById(id, true)
    if (!asset) {
      throw new MediaError({ status: 404, code: 'MEDIA_NOT_FOUND', message: 'Media asset not found.' })
    }
    if (expectedHash !== asset.sha256 || expectedHash !== id) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_PURGE_NOT_ALLOWED',
        message: 'Current-branch removal requires the exact media hash.'
      })
    }
    if (!asset.deletedAt) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_PURGE_NOT_ALLOWED',
        message: 'Media must be soft-deleted before it can be purged.'
      })
    }

    const graceMs = purgeGraceDays() * 24 * 60 * 60 * 1_000
    const deletedAt = Date.parse(asset.deletedAt)
    if (!Number.isFinite(deletedAt) || Date.now() - deletedAt < graceMs) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_PURGE_NOT_ALLOWED',
        message: `Media must remain soft-deleted for at least ${purgeGraceDays()} days before purge.`
      })
    }

    const references = await getMediaReferences(asset)
    if (references.count > 0) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_IN_USE',
        message: 'Media is still referenced by article content or cover metadata.',
        retryable: false
      })
    }

    const purgeToken = randomUUID()
    const claimed = await claimMediaPurge({
      id: asset.id,
      deletedAt: asset.deletedAt,
      token: purgeToken,
      leaseMs: PURGE_LEASE_MS
    })
    if (!claimed) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_PURGE_NOT_ALLOWED',
        message: 'Media changed or another current-branch removal is already in progress. Retry after checking its status.',
        retryable: true,
        retryAfterSeconds: 30
      })
    }

    const providerResult = await getMediaStorageFor(claimed.locator).delete({
      path: claimed.path,
      expectedSha256: claimed.sha256,
      requestId
    })
    const recordRemoved = await removeClaimedMediaRecord(claimed.id, purgeToken)
    if (!recordRemoved) {
      throw new MediaError({
        status: 409,
        code: 'MEDIA_PURGE_NOT_ALLOWED',
        message: 'The current-branch object was handled, but purge ownership changed before the media record could be removed. Retry to reconcile it.',
        retryable: true,
        retryAfterSeconds: 30
      })
    }

    console.warn('[admin][media][purge]', {
      requestId,
      actor: login,
      mediaId: claimed.id,
      providerDeleted: providerResult.deleted,
      gitHistoryErased: false,
      cdnCacheErasureGuaranteed: false,
      referencesScannedAt: references.scannedAt
    })
    return ok(requestId, {
      success: true,
      purged: true,
      providerDeleted: providerResult.deleted,
      erasure: {
        currentBranchObjectRemoved: true,
        registryRecordRemoved: true,
        gitHistoryErased: false,
        cdnCacheErasureGuaranteed: false
      },
      message: 'The object was removed from the configured branch and the registry record was removed. Git history and CDN caches may still retain public copies.',
      references
    })
  } catch (error) {
    console.error('[admin][media][purge][POST]', { requestId, error: error instanceof Error ? error.message : error })
    return mediaFailure(requestId, error, 'Failed to purge media.')
  }
}

export const dynamic = 'force-dynamic'
