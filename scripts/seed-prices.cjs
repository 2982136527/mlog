const { VercelPool } = require('@vercel/postgres');

const PRODUCTS = [
  { id: 'ddr5-8000-32g', name: 'DDR5 8000 32GB', category: 'memory', spec: 'DDR5 8000MHz 32GB (16G×2)' },
  { id: 'ddr5-7600-32g', name: 'DDR5 7600 32GB', category: 'memory', spec: 'DDR5 7600MHz 32GB (16G×2)' },
  { id: 'ddr5-7200-32g', name: 'DDR5 7200 32GB', category: 'memory', spec: 'DDR5 7200MHz 32GB (16G×2)' },
  { id: 'ddr5-6800-32g', name: 'DDR5 6800 32GB', category: 'memory', spec: 'DDR5 6800MHz 32GB (16G×2)' },
  { id: 'ddr5-6400-32g', name: 'DDR5 6400 32GB', category: 'memory', spec: 'DDR5 6400MHz 32GB (16G×2)' },
  { id: 'ddr5-6000-32g', name: 'DDR5 6000 32GB', category: 'memory', spec: 'DDR5 6000MHz 32GB (16G×2)' },
  { id: 'ddr5-5600-16g', name: 'DDR5 5600 16GB', category: 'memory', spec: 'DDR5 5600MHz 16GB' },
  { id: 'ddr4-3600-32g', name: 'DDR4 3600 32GB', category: 'memory', spec: 'DDR4 3600MHz 32GB (16G×2)' },
  { id: 'ddr4-3200-32g', name: 'DDR4 3200 32GB', category: 'memory', spec: 'DDR4 3200MHz 32GB (16G×2)' },
  { id: 'ddr4-3200-16g', name: 'DDR4 3200 16GB', category: 'memory', spec: 'DDR4 3200MHz 16GB' },
  { id: 'rtx-5090', name: 'RTX 5090', category: 'gpu', spec: 'NVIDIA RTX 5090 32GB GDDR7' },
  { id: 'rtx-5080', name: 'RTX 5080', category: 'gpu', spec: 'NVIDIA RTX 5080 16GB GDDR7' },
  { id: 'rtx-5070-ti', name: 'RTX 5070 Ti', category: 'gpu', spec: 'NVIDIA RTX 5070 Ti 16GB GDDR7' },
  { id: 'rtx-5070', name: 'RTX 5070', category: 'gpu', spec: 'NVIDIA RTX 5070 12GB GDDR7' },
  { id: 'rtx-5060-ti', name: 'RTX 5060 Ti', category: 'gpu', spec: 'NVIDIA RTX 5060 Ti 16GB GDDR7' },
  { id: 'rtx-5060', name: 'RTX 5060', category: 'gpu', spec: 'NVIDIA RTX 5060 8GB GDDR7' },
  { id: 'rtx-4060', name: 'RTX 4060', category: 'gpu', spec: 'NVIDIA RTX 4060 8GB GDDR6' },
  { id: 'rx-9070-xt', name: 'RX 9070 XT', category: 'gpu', spec: 'AMD RX 9070 XT 16GB GDDR6' },
  { id: 'rx-9070', name: 'RX 9070', category: 'gpu', spec: 'AMD RX 9070 16GB GDDR6' },
  { id: 'rx-9060-xt', name: 'RX 9060 XT', category: 'gpu', spec: 'AMD RX 9060 XT' },
  { id: 'i9-14900k', name: 'i9-14900K', category: 'cpu', spec: 'Intel Core i9-14900K 24C/32T' },
  { id: 'i7-14700k', name: 'i7-14700K', category: 'cpu', spec: 'Intel Core i7-14700K 20C/28T' },
  { id: 'i5-14600k', name: 'i5-14600K', category: 'cpu', spec: 'Intel Core i5-14600K 14C/20T' },
  { id: 'r9-9950x', name: 'R9 9950X', category: 'cpu', spec: 'AMD Ryzen 9 9950X 16C/32T' },
  { id: 'r7-9800x3d', name: 'R7 9800X3D', category: 'cpu', spec: 'AMD Ryzen 7 9800X3D 8C/16T' },
  { id: 'r7-7800x3d', name: 'R7 7800X3D', category: 'cpu', spec: 'AMD Ryzen 7 7800X3D 8C/16T' },
  { id: 'r5-9600x', name: 'R5 9600X', category: 'cpu', spec: 'AMD Ryzen 5 9600X 6C/12T' },
];

const SEED_PRICES_USD = {
  'ddr5-8000-32g': 519.99, 'ddr5-7600-32g': 899.99, 'ddr5-7200-32g': 229.99,
  'ddr5-6800-32g': 539.99, 'ddr5-6400-32g': 389.99, 'ddr5-6000-32g': 394.99,
  'ddr5-5600-16g': 199.99, 'ddr4-3600-32g': 204.85, 'ddr4-3200-32g': 89.99,
  'ddr4-3200-16g': 69.10, 'rtx-5090': 4099.99, 'rtx-5080': 1249.99,
  'rtx-5070-ti': 899.99, 'rtx-5070': 629.00, 'rtx-5060-ti': 499.99,
  'rtx-5060': 309.99, 'rtx-4060': 299.99, 'rx-9070-xt': 629.99,
  'rx-9070': 579.99, 'rx-9060-xt': 334.99, 'i9-14900k': 419.77,
  'i7-14700k': 380.99, 'i5-14600k': 239.88, 'r9-9950x': 489.99,
  'r7-9800x3d': 479.99, 'r7-7800x3d': 389.00, 'r5-9600x': 194.99,
};

async function seed() {
  const pool = new VercelPool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Schema
  await pool.query(`CREATE TABLE IF NOT EXISTS price_monitor_products (product_id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, spec TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS price_monitor_history (id SERIAL PRIMARY KEY, product_id TEXT NOT NULL REFERENCES price_monitor_products(product_id), price NUMERIC(10,2) NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`ALTER TABLE price_monitor_history ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10,2)`).catch(() => {});
  
  // Seed products
  for (const p of PRODUCTS) {
    await pool.query(`INSERT INTO price_monitor_products (product_id, name, category, spec) VALUES ($1,$2,$3,$4) ON CONFLICT (product_id) DO UPDATE SET name=$2,spec=$4`, [p.id, p.name, p.category, p.spec]);
  }

  // Seed prices  
  const rate = 6.78828;
  let count = 0;
  for (const [id, usd] of Object.entries(SEED_PRICES_USD)) {
    const cny = Math.round(usd * rate * 100) / 100;
    await pool.query(`INSERT INTO price_monitor_history (product_id, price) VALUES ($1,$2)`, [id, cny]);
    count++;
    console.log(`  ${id}: $${usd} = ¥${cny}`);
  }
  console.log(`\nSeeded ${count} products`);

  await pool.end();
}

seed().catch(e => { console.error('FATAL:', e); process.exit(1); });
