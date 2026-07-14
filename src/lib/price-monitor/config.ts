export interface MonitoredProduct {
  id: string
  name: string
  category: 'memory' | 'gpu' | 'cpu'
  spec: string
  jdSku?: string
}

export const monitoredProducts: MonitoredProduct[] = [
  // DDR5 Memory
  { id: 'ddr5-6400-32g', name: 'DDR5 6400 32GB', category: 'memory', spec: 'DDR5 6400MHz 32GB (16G×2)' },
  { id: 'ddr5-6000-32g', name: 'DDR5 6000 32GB', category: 'memory', spec: 'DDR5 6000MHz 32GB (16G×2)' },
  { id: 'ddr5-5600-16g', name: 'DDR5 5600 16GB', category: 'memory', spec: 'DDR5 5600MHz 16GB' },
  // DDR4 Memory
  { id: 'ddr4-3600-32g', name: 'DDR4 3600 32GB', category: 'memory', spec: 'DDR4 3600MHz 32GB (16G×2)' },
  { id: 'ddr4-3200-16g', name: 'DDR4 3200 16GB', category: 'memory', spec: 'DDR4 3200MHz 16GB' },
  // NVIDIA GPUs
  { id: 'rtx-5090', name: 'RTX 5090', category: 'gpu', spec: 'NVIDIA GeForce RTX 5090 32GB GDDR7' },
  { id: 'rtx-5080', name: 'RTX 5080', category: 'gpu', spec: 'NVIDIA GeForce RTX 5080 16GB GDDR7' },
  { id: 'rtx-5070-ti', name: 'RTX 5070 Ti', category: 'gpu', spec: 'NVIDIA GeForce RTX 5070 Ti 16GB GDDR7' },
  { id: 'rtx-5070', name: 'RTX 5070', category: 'gpu', spec: 'NVIDIA GeForce RTX 5070 12GB GDDR7' },
  { id: 'rtx-4060', name: 'RTX 4060', category: 'gpu', spec: 'NVIDIA GeForce RTX 4060 8GB GDDR6' },
  // AMD GPUs
  { id: 'rx-9070-xt', name: 'RX 9070 XT', category: 'gpu', spec: 'AMD Radeon RX 9070 XT 16GB GDDR6' },
  { id: 'rx-9070', name: 'RX 9070', category: 'gpu', spec: 'AMD Radeon RX 9070 16GB GDDR6' },
  // CPU
  { id: 'i7-14700k', name: 'i7-14700K', category: 'cpu', spec: 'Intel Core i7-14700K 20C/28T' },
  { id: 'r7-7800x3d', name: 'R7 7800X3D', category: 'cpu', spec: 'AMD Ryzen 7 7800X3D 8C/16T' },
]

export const monitorCategories = [
  { key: 'memory' as const, label: '内存', labelEn: 'Memory' },
  { key: 'gpu' as const, label: '显卡', labelEn: 'GPU' },
  { key: 'cpu' as const, label: 'CPU', labelEn: 'CPU' },
]
