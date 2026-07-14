import { sql } from '@vercel/postgres'

export interface PriceRecord {
  productId: string
  price: number
  recordedAt: string
}

export interface LatestPrice extends PriceRecord {
  name: string
  category: string
  spec: string
}

export async function ensurePriceMonitorSchema(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS price_monitor_products (
    product_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    spec TEXT NOT NULL
  )`

  await sql`CREATE TABLE IF NOT EXISTS price_monitor_history (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES price_monitor_products(product_id),
    price NUMERIC(10, 2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`

  await sql`CREATE INDEX IF NOT EXISTS price_monitor_history_product_idx ON price_monitor_history(product_id, recorded_at DESC)`
}

export async function storePrice(productId: string, price: number): Promise<void> {
  await sql`
    INSERT INTO price_monitor_history (product_id, price)
    VALUES (${productId}, ${price})
  `
}

export async function getLatestPrices(): Promise<LatestPrice[]> {
  const result = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (product_id) product_id, price, recorded_at
      FROM price_monitor_history
      ORDER BY product_id, recorded_at DESC
    )
    SELECT p.product_id, p.name, p.category, p.spec, l.price, l.recorded_at
    FROM price_monitor_products p
    LEFT JOIN latest l ON l.product_id = p.product_id
    ORDER BY p.category, p.product_id
  `
  return result.rows.map(r => ({
    productId: r.product_id,
    name: r.name,
    category: r.category,
    spec: r.spec,
    price: r.price ? Number(r.price) : 0,
    recordedAt: r.recorded_at ? new Date(r.recorded_at).toISOString() : ''
  }))
}

export async function getPriceHistory(productId: string, days: number = 30): Promise<PriceRecord[]> {
  const result = await sql`
    SELECT product_id, price, recorded_at
    FROM price_monitor_history
    WHERE product_id = ${productId}
      AND recorded_at >= NOW() - INTERVAL '1 day' * ${days}
    ORDER BY recorded_at ASC
  `
  return result.rows.map(r => ({
    productId: r.product_id,
    price: Number(r.price),
    recordedAt: new Date(r.recorded_at).toISOString()
  }))
}

export async function seedProducts(): Promise<void> {
  const { monitoredProducts } = await import('./config')
  for (const p of monitoredProducts) {
    await sql`
      INSERT INTO price_monitor_products (product_id, name, category, spec)
      VALUES (${p.id}, ${p.name}, ${p.category}, ${p.spec})
      ON CONFLICT (product_id) DO NOTHING
    `
  }
}
