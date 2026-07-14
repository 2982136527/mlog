export interface MonitoredProduct {
  id: string
  name: string
  category: 'memory' | 'gpu' | 'cpu'
  spec: string
  jdSku?: string
}

export const monitoredProducts: MonitoredProduct[] = [
  // DDR5 Memory
  { id: 'ddr5-8000-32g', name: 'DDR5 8000 32GB', category: 'memory', spec: 'DDR5 8000MHz 32GB (16G×2)' },
  { id: 'ddr5-7600-32g', name: 'DDR5 7600 32GB', category: 'memory', spec: 'DDR5 7600MHz 32GB (16G×2)' },
  { id: 'ddr5-7200-32g', name: 'DDR5 7200 32GB', category: 'memory', spec: 'DDR5 7200MHz 32GB (16G×2)' },
  { id: 'ddr5-6800-32g', name: 'DDR5 6800 32GB', category: 'memory', spec: 'DDR5 6800MHz 32GB (16G×2)' },
  { id: 'ddr5-6400-32g', name: 'DDR5 6400 32GB', category: 'memory', spec: 'DDR5 6400MHz 32GB (16G×2)' },
  { id: 'ddr5-6000-32g', name: 'DDR5 6000 32GB', category: 'memory', spec: 'DDR5 6000MHz 32GB (16G×2)' },
  { id: 'ddr5-5600-16g', name: 'DDR5 5600 16GB', category: 'memory', spec: 'DDR5 5600MHz 16GB' },
  // DDR4 Memory
  { id: 'ddr4-3600-32g', name: 'DDR4 3600 32GB', category: 'memory', spec: 'DDR4 3600MHz 32GB (16G×2)' },
  { id: 'ddr4-3200-32g', name: 'DDR4 3200 32GB', category: 'memory', spec: 'DDR4 3200MHz 32GB (16G×2)' },
  { id: 'ddr4-3200-16g', name: 'DDR4 3200 16GB', category: 'memory', spec: 'DDR4 3200MHz 16GB' },
  // NVIDIA GPUs
  { id: 'rtx-5090', name: 'RTX 5090', category: 'gpu', spec: 'NVIDIA GeForce RTX 5090 32GB GDDR7' },
  { id: 'rtx-5080', name: 'RTX 5080', category: 'gpu', spec: 'NVIDIA GeForce RTX 5080 16GB GDDR7' },
  { id: 'rtx-5070-ti', name: 'RTX 5070 Ti', category: 'gpu', spec: 'NVIDIA GeForce RTX 5070 Ti 16GB GDDR7' },
  { id: 'rtx-5070', name: 'RTX 5070', category: 'gpu', spec: 'NVIDIA GeForce RTX 5070 12GB GDDR7' },
  { id: 'rtx-5060-ti', name: 'RTX 5060 Ti', category: 'gpu', spec: 'NVIDIA GeForce RTX 5060 Ti 16GB GDDR7' },
  { id: 'rtx-5060', name: 'RTX 5060', category: 'gpu', spec: 'NVIDIA GeForce RTX 5060 8GB GDDR7' },
  { id: 'rtx-4060', name: 'RTX 4060', category: 'gpu', spec: 'NVIDIA GeForce RTX 4060 8GB GDDR6' },
  // AMD GPUs
  { id: 'rx-9070-xt', name: 'RX 9070 XT', category: 'gpu', spec: 'AMD Radeon RX 9070 XT 16GB GDDR6' },
  { id: 'rx-9070', name: 'RX 9070', category: 'gpu', spec: 'AMD Radeon RX 9070 16GB GDDR6' },
  { id: 'rx-9060-xt', name: 'RX 9060 XT', category: 'gpu', spec: 'AMD Radeon RX 9060 XT 16GB GDDR6' },
  // Intel CPUs
  { id: 'i9-14900k', name: 'i9-14900K', category: 'cpu', spec: 'Intel Core i9-14900K 24C/32T' },
  { id: 'i7-14700k', name: 'i7-14700K', category: 'cpu', spec: 'Intel Core i7-14700K 20C/28T' },
  { id: 'i5-14600k', name: 'i5-14600K', category: 'cpu', spec: 'Intel Core i5-14600K 14C/20T' },
  // AMD CPUs
  { id: 'r9-9950x', name: 'R9 9950X', category: 'cpu', spec: 'AMD Ryzen 9 9950X 16C/32T' },
  { id: 'r7-9800x3d', name: 'R7 9800X3D', category: 'cpu', spec: 'AMD Ryzen 7 9800X3D 8C/16T' },
  { id: 'r7-7800x3d', name: 'R7 7800X3D', category: 'cpu', spec: 'AMD Ryzen 7 7800X3D 8C/16T' },
  { id: 'r5-9600x', name: 'R5 9600X', category: 'cpu', spec: 'AMD Ryzen 5 9600X 6C/12T' },
]

export const monitorCategories = [
  { key: 'memory' as const, label: '内存', labelEn: 'Memory' },
  { key: 'gpu' as const, label: '显卡', labelEn: 'GPU' },
  { key: 'cpu' as const, label: 'CPU', labelEn: 'CPU' },
]
