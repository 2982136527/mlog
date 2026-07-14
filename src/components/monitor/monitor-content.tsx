'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface PriceData {
  categories: Array<{
    category: string
    label: string
    labelEn: string
    products: Array<{
      productId: string
      name: string
      category: string
      spec: string
      price: number
      recordedAt: string
    }>
  }>
  updatedAt: string
}

interface HistoryPoint {
  price: number
  recordedAt: string
}

type Dict = {
  memory: string
  gpu: string
  cpu: string
  noData: string
  days: string
  price: string
  updated: string
}

export function MonitorContent({ locale, dict }: { locale: string; dict: Dict }) {
  const [data, setData] = useState<PriceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(0)
  const [histories, setHistories] = useState<Record<string, HistoryPoint[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/price-monitor')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const loadHistory = async (productId: string) => {
    if (histories[productId]) return
    const res = await fetch('/api/price-monitor?history=' + productId)
    const d = await res.json()
    setHistories(h => ({ ...h, [productId]: d.history || [] }))
  }

  const categoryLabels: Record<string, string> = {
    memory: dict.memory,
    gpu: dict.gpu,
    cpu: dict.cpu
  }

  if (loading) {
    return <div className="text-sm text-[var(--color-ink-soft)]">{'Loading...'}</div>
  }

  if (!data || data.categories.every(c => c.products.length === 0)) {
    return (
      <div className="rounded-2xl border border-white/60 bg-white/40 px-5 py-8 text-center text-sm text-[var(--color-ink-soft)] backdrop-blur">
        {dict.noData}
      </div>
    )
  }

  const activeCategory = data.categories[activeTab]

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {data.categories.map((cat, i) => (
          <button
            key={cat.category}
            onClick={() => setActiveTab(i)}
            className={'rounded-full px-4 py-2 text-sm font-medium transition ' + (
              i === activeTab
                ? 'bg-[var(--color-brand)] text-white'
                : 'border border-white/60 bg-white/50 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            )}
          >
            {categoryLabels[cat.category]} ({cat.products.length})
          </button>
        ))}
      </div>

      <p className="mb-4 text-xs text-[var(--color-ink-soft)]">
        {dict.updated}: {new Date(data.updatedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activeCategory.products.map(product => (
          <div key={product.productId}
            className="relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition hover:shadow-md"
            style={{ borderColor: 'var(--glass-border)', background: 'var(--glass-bg)', boxShadow: 'var(--glass-shadow)' }}
            onMouseEnter={() => { loadHistory(product.productId); setExpanded(product.productId) }}>
            <div className="mb-2">
              <h3 className="font-medium text-[var(--color-ink)]">{product.name}</h3>
              <p className="text-xs text-[var(--color-ink-soft)]">{product.spec}</p>
            </div>
            <div className="mb-3">
              {product.price > 0
                ? <span className="text-2xl font-bold text-[var(--color-brand)]">{'\u00a5'}{product.price.toLocaleString()}</span>
                : <span className="text-sm text-[var(--color-ink-soft)]">{dict.noData}</span>
              }
            </div>
            <div className="h-12 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={histories[product.productId] || []}>
                  <Line type="monotone" dataKey="price" stroke="var(--color-brand)" dot={false} strokeWidth={1.5} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--glass-border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any) => ['¥' + String(value), dict.price]}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {expanded === product.productId && histories[product.productId]?.length > 0 && (
              <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">
                {histories[product.productId].length} {dict.days}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
