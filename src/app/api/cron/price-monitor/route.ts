import { NextRequest } from 'next/server'
import { createRequestId, fail, ok } from '@/lib/admin/response'
import { ensurePriceMonitorSchema, seedProducts, storePrice } from '@/lib/price-monitor/db'
import { monitoredProducts } from '@/lib/price-monitor/config'
import { fetchProductPrice } from '@/lib/price-monitor/fetcher'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    await ensurePriceMonitorSchema()
    await seedProducts()

    const results: Array<{ productId: string; price: number | null; error?: string }> = []

    for (const product of monitoredProducts) {
      const result = await fetchProductPrice(product.id, product.jdSku)
      if (result.price !== null && result.price > 0) {
        await storePrice(product.id, result.price)
        results.push({ productId: product.id, price: result.price })
      } else {
        results.push({ productId: product.id, price: null, error: result.error })
      }
    }

    const successCount = results.filter(r => r.price !== null).length
    console.info('[cron][price-monitor]', { requestId, total: results.length, success: successCount })

    return ok(requestId, {
      total: results.length,
      success: successCount,
      results
    })
  } catch (error) {
    console.error('[cron][price-monitor]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Price monitor cron failed')
  }
}
