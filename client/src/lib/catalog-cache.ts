import { api } from './api-client';
import type { InventoryItem, Product } from '@/types';

const PRODUCTS_CACHE_KEY = 'adgen_products_cache_v2';
const INVENTORY_CACHE_KEY = 'adgen_inventory_cache_v2';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes TTL for responsive stock sync

interface CacheEnvelope<T> {
  data: T[];
  timestamp: number;
}

/** The subset of fields the local relevance ranking needs. */
interface Searchable {
  name?: string | null;
  genericName?: string | null;
  companyName?: string | null;
  product?: { name?: string | null; genericName?: string | null; companyName?: string | null };
}

let memoryProducts: CacheEnvelope<Product> | null = null;
let memoryInventory: CacheEnvelope<InventoryItem> | null = null;

function readCache<T>(key: string, now: number): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (now - parsed.timestamp < CACHE_TTL_MS) return parsed;
  } catch {
    // Corrupt or unavailable storage — fall through to a network fetch.
  }
  return null;
}

function writeCache<T>(key: string, envelope: CacheEnvelope<T>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded / private mode — the in-memory cache still applies.
  }
}

// 1. Get Inventory Stock Cached (for Billing Counter)
export async function getCachedInventory(searchQuery: string = ''): Promise<InventoryItem[]> {
  const now = Date.now();

  if (memoryInventory && now - memoryInventory.timestamp < CACHE_TTL_MS) {
    return filterLocally(memoryInventory.data, searchQuery);
  }

  const cached = readCache<InventoryItem>(INVENTORY_CACHE_KEY, now);
  if (cached) {
    memoryInventory = cached;
    return filterLocally(cached.data, searchQuery);
  }

  try {
    const res = await api.get<InventoryItem[]>('/inventory');
    const data = res.data || [];
    const envelope: CacheEnvelope<InventoryItem> = { data, timestamp: Date.now() };
    memoryInventory = envelope;
    writeCache(INVENTORY_CACHE_KEY, envelope);
    return filterLocally(data, searchQuery);
  } catch (e) {
    console.error('Inventory fetch error:', e);
    return memoryInventory ? filterLocally(memoryInventory.data, searchQuery) : [];
  }
}

// 2. Get Products Catalog Cached (for Purchase Entry)
export async function getCachedProducts(searchQuery: string = ''): Promise<Product[]> {
  const now = Date.now();

  if (memoryProducts && now - memoryProducts.timestamp < CACHE_TTL_MS) {
    return filterLocally(memoryProducts.data, searchQuery);
  }

  const cached = readCache<Product>(PRODUCTS_CACHE_KEY, now);
  if (cached) {
    memoryProducts = cached;
    return filterLocally(cached.data, searchQuery);
  }

  try {
    const res = await api.get<Product[]>('/products');
    const data = res.data || [];
    const envelope: CacheEnvelope<Product> = { data, timestamp: Date.now() };
    memoryProducts = envelope;
    writeCache(PRODUCTS_CACHE_KEY, envelope);
    return filterLocally(data, searchQuery);
  } catch (e) {
    console.error('Products fetch error:', e);
    return memoryProducts ? filterLocally(memoryProducts.data, searchQuery) : [];
  }
}

// Medical relevance rank & filter in local memory (0ms execution time)
function filterLocally<T extends Searchable>(items: T[], query: string): T[] {
  if (!query || !query.trim()) return items.slice(0, 100);
  const q = query.toLowerCase().trim();

  const calculateScore = (item: T): number => {
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
      const nameA = a.product?.name || a.name || '';
      const nameB = b.product?.name || b.name || '';
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
