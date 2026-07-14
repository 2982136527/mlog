export interface FetchedPrice {
  productId: string
  price: number | null
  error?: string
}

export async function fetchProductPrice(productId: string, jdSku?: string): Promise<FetchedPrice> {
  // Strategy 1: Try JD price API if we have a SKU
  if (jdSku) {
    try {
      const url = `https://p.3.cn/prices/mgets?skuIds=J_${jdSku}&type=1`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal: AbortSignal.timeout(5000)
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data[0]?.p) {
          const price = parseFloat(data[0].p)
          if (!isNaN(price) && price > 0) {
            return { productId, price }
          }
        }
      }
    } catch {
      // Fall through to next strategy
    }
  }

  // Strategy 2: Try taobao/open API
  try {
    const searchName = productId.replace(/-/g, ' ')
    const url = `https://suggest.taobao.com/sug?code=utf-8&q=${encodeURIComponent(searchName)}&area=c2c`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000)
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.result?.[0]?.price) {
        const price = parseFloat(data.result[0].price)
        if (!isNaN(price) && price > 0) {
          return { productId, price }
        }
      }
    }
  } catch {
    // Fall through
  }

  return { productId, price: null, error: 'no data source available' }
}
