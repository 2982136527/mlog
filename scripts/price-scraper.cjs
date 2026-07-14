const fs = require('node:fs');
/**
 * Price Monitor Scraper
 * 
 * Strategy:
 * 1. Search Newegg for each product → extract USD prices
 * 2. Fetch USD→CNY exchange rate via open.er-api.com
 * 3. Store both USD and CNY prices to PostgreSQL
 * 
 * Runs via GitHub Actions (scheduled cron) or locally.
 */

const { chromium } = require('playwright');
const { VercelPool } = require('@vercel/postgres');

// ── Product Config ──────────────────────────────────────────────────
const PRODUCTS = [
  // DDR5 Memory
  { id: 'ddr5-8000-32g', name: 'DDR5 8000 32GB', category: 'memory', spec: 'DDR5 8000MHz 32GB (16G×2)', keyword: 'DDR5 8000 32GB' },
  { id: 'ddr5-7600-32g', name: 'DDR5 7600 32GB', category: 'memory', spec: 'DDR5 7600MHz 32GB (16G×2)', keyword: 'DDR5 7600 32GB' },
  { id: 'ddr5-7200-32g', name: 'DDR5 7200 32GB', category: 'memory', spec: 'DDR5 7200MHz 32GB (16G×2)', keyword: 'DDR5 7200 32GB' },
  { id: 'ddr5-6800-32g', name: 'DDR5 6800 32GB', category: 'memory', spec: 'DDR5 6800MHz 32GB (16G×2)', keyword: 'DDR5 6800 32GB' },
  { id: 'ddr5-6400-32g', name: 'DDR5 6400 32GB', category: 'memory', spec: 'DDR5 6400MHz 32GB (16G×2)', keyword: 'DDR5 6400 32GB' },
  { id: 'ddr5-6000-32g', name: 'DDR5 6000 32GB', category: 'memory', spec: 'DDR5 6000MHz 32GB (16G×2)', keyword: 'DDR5 6000 32GB' },
  { id: 'ddr5-5600-16g', name: 'DDR5 5600 16GB', category: 'memory', spec: 'DDR5 5600MHz 16GB', keyword: 'DDR5 5600 16GB' },
  // DDR4 Memory
  { id: 'ddr4-3600-32g', name: 'DDR4 3600 32GB', category: 'memory', spec: 'DDR4 3600MHz 32GB (16G×2)', keyword: 'DDR4 3600 32GB' },
  { id: 'ddr4-3200-32g', name: 'DDR4 3200 32GB', category: 'memory', spec: 'DDR4 3200MHz 32GB (16G×2)', keyword: 'DDR4 3200 32GB' },
  { id: 'ddr4-3200-16g', name: 'DDR4 3200 16GB', category: 'memory', spec: 'DDR4 3200MHz 16GB', keyword: 'DDR4 3200 16GB' },
  // NVIDIA GPUs  
  { id: 'rtx-5090', name: 'RTX 5090', category: 'gpu', spec: 'NVIDIA RTX 5090 32GB GDDR7', keyword: 'RTX 5090', filterGPU: true },
  { id: 'rtx-5080', name: 'RTX 5080', category: 'gpu', spec: 'NVIDIA RTX 5080 16GB GDDR7', keyword: 'RTX 5080', filterGPU: true },
  { id: 'rtx-5070-ti', name: 'RTX 5070 Ti', category: 'gpu', spec: 'NVIDIA RTX 5070 Ti 16GB GDDR7', keyword: 'RTX 5070 Ti', filterGPU: true },
  { id: 'rtx-5070', name: 'RTX 5070', category: 'gpu', spec: 'NVIDIA RTX 5070 12GB GDDR7', keyword: 'RTX 5070', filterGPU: true },
  { id: 'rtx-5060-ti', name: 'RTX 5060 Ti', category: 'gpu', spec: 'NVIDIA RTX 5060 Ti 16GB GDDR7', keyword: 'RTX 5060 Ti', filterGPU: true },
  { id: 'rtx-5060', name: 'RTX 5060', category: 'gpu', spec: 'NVIDIA RTX 5060 8GB GDDR7', keyword: 'RTX 5060', filterGPU: true },
  { id: 'rtx-4060', name: 'RTX 4060', category: 'gpu', spec: 'NVIDIA RTX 4060 8GB GDDR6', keyword: 'RTX 4060', filterGPU: true },
  // AMD GPUs
  { id: 'rx-9070-xt', name: 'RX 9070 XT', category: 'gpu', spec: 'AMD RX 9070 XT 16GB GDDR6', keyword: 'RX 9070 XT', filterGPU: true },
  { id: 'rx-9070', name: 'RX 9070', category: 'gpu', spec: 'AMD RX 9070 16GB GDDR6', keyword: 'RX 9070', filterGPU: true },
  { id: 'rx-9060-xt', name: 'RX 9060 XT', category: 'gpu', spec: 'AMD RX 9060 XT', keyword: 'RX 9060 XT', filterGPU: true },
  // Intel CPUs
  { id: 'i9-14900k', name: 'i9-14900K', category: 'cpu', spec: 'Intel Core i9-14900K 24C/32T', keyword: 'Intel Core i9-14900K' },
  { id: 'i7-14700k', name: 'i7-14700K', category: 'cpu', spec: 'Intel Core i7-14700K 20C/28T', keyword: 'Intel Core i7-14700K' },
  { id: 'i5-14600k', name: 'i5-14600K', category: 'cpu', spec: 'Intel Core i5-14600K 14C/20T', keyword: 'Intel Core i5-14600K' },
  // AMD CPUs
  { id: 'r9-9950x', name: 'R9 9950X', category: 'cpu', spec: 'AMD Ryzen 9 9950X 16C/32T', keyword: 'AMD Ryzen 9 9950X' },
  { id: 'r7-9800x3d', name: 'R7 9800X3D', category: 'cpu', spec: 'AMD Ryzen 7 9800X3D 8C/16T', keyword: 'AMD Ryzen 7 9800X3D' },
  { id: 'r7-7800x3d', name: 'R7 7800X3D', category: 'cpu', spec: 'AMD Ryzen 7 7800X3D 8C/16T', keyword: 'AMD Ryzen 7 7800X3D' },
  { id: 'r5-9600x', name: 'R5 9600X', category: 'cpu', spec: 'AMD Ryzen 5 9600X 6C/12T', keyword: 'AMD Ryzen 5 9600X' },
];

// ── Exchange Rate ───────────────────────────────────────────────────
async function fetchExchangeRate() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json();
  if (data.result === 'success' && data.rates?.CNY) {
    return data.rates.CNY;
  }
  throw new Error('Exchange rate fetch failed');
}

// ── Scrape Newegg Prices ────────────────────────────────────────────
async function scrapeNeweggPrices(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  const results = [];

  for (const product of PRODUCTS) {
    try {
      await page.goto('https://www.newegg.com/p/pl?d=' + encodeURIComponent(product.keyword), {
        waitUntil: 'domcontentloaded', timeout: 20000
      });
      await page.waitForTimeout(1500);

      const items = await page.evaluate(({ isGPU, categoryFilter, keyword }) => {
        const results = [];
        const cells = document.querySelectorAll('.item-cell');
        
        for (const cell of cells) {
          const nameEl = cell.querySelector('a[title="View Details"]');
          const priceEl = cell.querySelector('.price-current');
          const name = nameEl?.textContent?.trim();
          
          if (!name || !priceEl) continue;

          const priceText = priceEl.textContent.replace(/,/g, '').trim();
          const priceMatch = priceText.match(/\$?\s*([0-9]+(\.[0-9]+)?)/);
          
          if (!priceMatch) continue;
          const price = parseFloat(priceMatch[1]);
          if (isNaN(price) || price < 1) continue;

          // Skip pre-built PCs and laptops that happen to match
          if (isGPU && (name.includes('Laptop') || name.includes('Gaming PC') || name.includes('Desktop PC') || name.includes('Desktop Computer'))) continue;
          // For CPU, skip motherboards and refurbished
          if (categoryFilter === 'cpu' && (name.includes('Motherboard') || name.includes('Refurbished') || name.includes('Desktop'))) continue;
          // For memory, try to match the keyword (e.g. filter DDR4 when searching DDR5)
          if (categoryFilter === 'memory') {
            const hasType = keyword.match(/DDR[0-9]/i);
            if (hasType && !name.toUpperCase().includes(hasType[0].toUpperCase())) continue;
          }

          results.push({ name: name.slice(0, 120), price });
        }
        
        results.sort((a, b) => a.price - b.price);
        return results.slice(0, 3);
      }, { isGPU: product.category === 'gpu', categoryFilter: product.category, keyword: product.keyword });

      const best = items?.[0];
      if (best) {
        results.push({
          productId: product.id,
          name: product.name,
          category: product.category,
          spec: product.spec,
          priceUSD: best.price,
          source: 'newegg',
          scrapedName: best.name
        });
        console.log(`  ✓ ${product.name}: $${best.price} USD`);
        try { fs.appendFileSync('/tmp/price-scraper-progress.log', `✓ ${product.name}: $${best.price}\n`); } catch(e) {}
      } else {
        results.push({ productId: product.id, name: product.name, category: product.category, spec: product.spec, priceUSD: null, source: 'newegg' });
        console.log(`  ✗ ${product.name}: no price found`);
        try { fs.appendFileSync('/tmp/price-scraper-progress.log', `✗ ${product.name}: no price\n`); } catch(e) {}
      }
    } catch (err) {
      console.log(`  ✗ ${product.name}: ERROR - ${err.message?.slice(0, 80)}`);
      try { fs.appendFileSync('/tmp/price-scraper-progress.log', `✗ ${product.name}: ERROR ${err.message?.slice(0,60)}\n`); } catch(e) {}
      results.push({ productId: product.id, name: product.name, category: product.category, spec: product.spec, priceUSD: null, source: 'newegg' });
    }
  }

  return results;
}

// ── Store to PostgreSQL ─────────────────────────────────────────────
async function storePrices(pool, results, exchangeRate) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_monitor_products (
      product_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      spec TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_monitor_history (
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES price_monitor_products(product_id),
      price NUMERIC(10, 2) NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE price_monitor_history ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10,2)`).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS price_monitor_history_product_idx 
    ON price_monitor_history(product_id, recorded_at DESC)
  `).catch(() => {});

  // Seed products
  for (const r of results) {
    await pool.query(
      `INSERT INTO price_monitor_products (product_id, name, category, spec)
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (product_id) DO UPDATE SET name = $2, spec = $4`,
      [r.productId, r.name, r.category, r.spec]
    ).catch(e => console.log('  DB seed error:', e.message?.slice(0, 60)));
  }

  // Store prices
  let stored = 0;
  for (const r of results) {
    if (r.priceUSD) {
      const priceCNY = Math.round(r.priceUSD * exchangeRate * 100) / 100;
      await pool.query(
        `INSERT INTO price_monitor_history (product_id, price, price_usd) VALUES ($1, $2, $3)`,
        [r.productId, priceCNY, r.priceUSD]
      ).catch(e => console.log('  DB insert error:', e.message?.slice(0, 60)));
      stored++;
    }
  }
  console.log(`Stored ${stored}/${results.length} prices to DB`);
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('Price Monitor Scraper v2 (Newegg)');
  console.log('================================\n');

  const exchangeRate = await fetchExchangeRate();
  console.log(`Exchange rate: 1 USD = ${exchangeRate} CNY\n`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const results = await scrapeNeweggPrices(browser);
    results.forEach(r => r.exchangeRate = exchangeRate);

    const found = results.filter(r => r.priceUSD);
    console.log(`\nResults: ${found.length}/${results.length} found`);
    try { fs.appendFileSync('/tmp/price-scraper-progress.log', `Results: ${found.length}/${results.length} found\n`); } catch(e) {}
    found.forEach(r => {
      const cny = (r.priceUSD * exchangeRate).toFixed(2);
      console.log(`  ${r.name}: $${r.priceUSD} = ¥${cny}`);
    });

    if (!process.env.DRY_RUN && (process.env.POSTGRES_URL || process.env.DATABASE_URL)) {
      console.log('\nStoring to PostgreSQL...');
      const pool = new VercelPool({
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      await storePrices(pool, results, exchangeRate);
      await pool.end();
    } else {
      console.log(`\n${process.env.DRY_RUN ? 'Dry run' : 'No DB configured'} - not storing to DB`);
    }

    // Output JSON summary
    console.log('\n=== JSON ===');
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      exchangeRate,
      found: found.length,
      total: results.length,
      prices: found.map(r => ({
        id: r.productId, name: r.name, usd: r.priceUSD, cny: Math.round(r.priceUSD * exchangeRate * 100) / 100
      }))
    }));
  } finally {
    await browser.close();
  }
  
  // Also write to log file
  try {
    const fs = require('fs');
    fs.writeFileSync('/tmp/price-scraper-last.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      exchangeRate,
      found: found.length,
      total: results.length,
      prices: found.map(r => ({
        id: r.productId, name: r.name, priceUSD: r.priceUSD, 
        priceCNY: Math.round(r.priceUSD * exchangeRate * 100) / 100
      }))
    }, null, 2));
  } catch(e) {}
}

if (require.main === module) main().catch(err => { console.error('FATAL:', err); process.exit(1); });
module.exports = { scrapeNeweggPrices, fetchExchangeRate, storePrices, PRODUCTS };
