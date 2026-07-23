import { api } from './api-client';

const PRODUCTS_CACHE_KEY = 'adgen_products_cache_v2';
const INVENTORY_CACHE_KEY = 'adgen_inventory_cache_v2';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

let memoryProducts: { data: any[]; timestamp: number } | null = null;
let memoryInventory: { data: any[]; timestamp: number } | null = null;

// 1. Get Inventory Stock Cached (for Billing Counter)
export async function getCachedInventory(searchQuery: string = ''): Promise<any[]> {
  const now = Date.now();

  // Try in-memory cache
  if (memoryInventory && (now - memoryInventory.timestamp) < CACHE_TTL_MS) {
    return filterLocally(memoryInventory.data, searchQuery);
  }

  // Try localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(INVENTORY_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if ((now - parsed.timestamp) < CACHE_TTL_MS) {
          memoryInventory = parsed;
          return filterLocally(parsed.data, searchQuery);
        }
      }
    } catch (_) {}
  }

  // Fetch API
  try {
    const res = await api.get('/inventory');
    const data = res.data || [];
    const cacheObj = { data, timestamp: Date.now() };
    memoryInventory = cacheObj;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(cacheObj));
      } catch (_) {}
    }
    return filterLocally(data, searchQuery);
  } catch (e) {
    console.error('Inventory fetch error:', e);
    return memoryInventory ? filterLocally(memoryInventory.data, searchQuery) : [];
  }
}

// 2. Get Products Catalog Cached (for Purchase Entry)
export async function getCachedProducts(searchQuery: string = ''): Promise<any[]> {
  const now = Date.now();

  if (memoryProducts && (now - memoryProducts.timestamp) < CACHE_TTL_MS) {
    return filterLocally(memoryProducts.data, searchQuery);
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if ((now - parsed.timestamp) < CACHE_TTL_MS) {
          memoryProducts = parsed;
          return filterLocally(parsed.data, searchQuery);
        }
      }
    } catch (_) {}
  }

  try {
    const res = await api.get('/products');
    const data = res.data || [];
    const cacheObj = { data, timestamp: Date.now() };
    memoryProducts = cacheObj;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(cacheObj));
      } catch (_) {}
    }
    return filterLocally(data, searchQuery);
  } catch (e) {
    console.error('Products fetch error:', e);
    return memoryProducts ? filterLocally(memoryProducts.data, searchQuery) : [];
  }
}

// Medical relevance rank & filter in local memory (0ms execution time)
function filterLocally(items: any[], query: string): any[] {
  if (!query || !query.trim()) return items.slice(0, 100);
  const q = query.toLowerCase().trim();

  const calculateScore = (item: any): number => {
    const prod = item.product || item;
    const name = (prod.name || item.name || '').toLowerCase();
    const generic = (prod.genericName || item.genericName || '').toLowerCase();
    const company = (prod.companyName || item.companyName || '').toLowerCase();

    if (name.startsWith(q)) return 100;
    const words = name.split(/\s+/);
    if (words.some((w: string) => w.startsWith(q))) return 80;
    if (generic.startsWith(q) || company.startsWith(q)) return 60;
    if (name.includes(q)) return 40;
    if (generic.includes(q) || company.includes(q)) return 20;
    return 0;
  };

  return [...items]
    .filter((item) => calculateScore(item) > 0)
    .sort((a, b) => {
      const scoreA = calculateScore(a);
      const scoreB = calculateScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      const nameA = (a.product?.name || a.name || '');
      const nameB = (b.product?.name || b.name || '');
      return nameA.localeCompare(nameB);
    });
}

// Invalidate both caches on save operations
export function invalidateCatalogCache() {
  memoryProducts = null;
  memoryInventory = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
    localStorage.removeItem(INVENTORY_CACHE_KEY);
  }
}
