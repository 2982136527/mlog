import { NextRequest } from 'next/server'
import { createRequestId, ok, fail } from '@/lib/admin/response'
import { ensurePriceMonitorSchema, seedProducts, getLatestPrices, getPriceHistory } from '@/lib/price-monitor/db'
import { monitorCategories } from '@/lib/price-monitor/config'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const productId = request.nextUrl.searchParams.get('history')

    await ensurePriceMonitorSchema()
    await seedProducts()

    if (productId) {
      const history = await getPriceHistory(productId)
      return ok(requestId, { productId, history })
    }

    const latestPrices = await getLatestPrices()

    const byCategory = monitorCategories.map(cat => ({
      category: cat.key,
      label: cat.label,
      labelEn: cat.labelEn,
      products: latestPrices.filter(p => p.category === cat.key)
    }))

    return ok(requestId, {
      categories: byCategory,
      updatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('[price-monitor][GET]', requestId, error)
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to fetch price data')
  }
}
