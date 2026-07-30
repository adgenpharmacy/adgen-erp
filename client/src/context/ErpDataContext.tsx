'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from './AuthContext';
import { invalidateCatalogCache } from '@/lib/catalog-cache';
import type {
  Product,
  InventoryItem,
  Sale,
  Purchase,
  Customer,
  Party,
  LedgerEntry,
  PharmacyProfile,
} from '@/types';

interface ErpDataContextType {
  products: Product[];
  inventory: InventoryItem[];
  sales: Sale[];
  purchases: Purchase[];
  customers: Customer[];
  parties: Party[];
  ledgers: LedgerEntry[];
  profile: PharmacyProfile | null;
  loading: boolean;
  refreshData: () => Promise<void>;
  /** Refetch only the sales list — one request instead of the eight-endpoint fan-out. */
  refreshSales: () => Promise<void>;
}

/** Shape persisted to localStorage between sessions. */
interface ErpCache {
  products: Product[];
  inventory: InventoryItem[];
  sales: Sale[];
  purchases: Purchase[];
  customers: Customer[];
  parties: Party[];
  ledgers: LedgerEntry[];
  timestamp: number;
}

const ErpDataContext = createContext<ErpDataContextType>({
  products: [],
  inventory: [],
  sales: [],
  purchases: [],
  customers: [],
  parties: [],
  ledgers: [],
  profile: null,
  loading: true,
  refreshData: async () => {},
  refreshSales: async () => {},
});

const GLOBAL_CACHE_KEY = 'adgen_global_erp_cache_v1';
/** Beyond this the cached copy is shown but no longer trusted enough to hide the loading state. */
const CACHE_FRESH_MS = 2 * 60 * 1000;

export const ErpDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

  /*
   * Read whatever is cached, however old.
   *
   * The cache used to be discarded after two minutes, so any reload past that point sat on
   * skeletons until eight requests came back — several seconds against a distant database, on
   * every single load. Yesterday's list is a far better first paint than no list: it is shown
   * immediately and replaced the moment the refresh lands. Anything older than CACHE_FRESH_MS
   * still shows, but the spinner keeps running so nobody mistakes it for live data.
   */
  const getInitialCache = (): { data: ErpCache; isFresh: boolean } | null => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(GLOBAL_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ErpCache;
          return { data: parsed, isFresh: Date.now() - parsed.timestamp < CACHE_FRESH_MS };
        }
      } catch {}
    }
    return null;
  };

  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [ledgers, setLedgers] = useState<LedgerEntry[]>([]);
  const [profile, setProfile] = useState<PharmacyProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = getInitialCache();
      if (cached) {
        const { data: cache, isFresh } = cached;
        if (cache.products) setProducts(cache.products);
        if (cache.inventory) setInventory(cache.inventory);
        if (cache.sales) setSales(cache.sales);
        if (cache.purchases) setPurchases(cache.purchases);
        if (cache.customers) setCustomers(cache.customers);
        if (cache.parties) setParties(cache.parties);
        if (cache.ledgers) setLedgers(cache.ledgers);
        if (isFresh) setLoading(false);
      }
    }
  }, []);

  const fetchAllData = React.useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      // There are two caches: this global one, and the counter's catalogue/inventory cache in
      // lib/catalog-cache. A refresh means "the data changed", so both must drop together —
      // otherwise adding a medicine refreshed this list while the billing screen kept serving
      // a stale catalogue for up to its TTL, and the new medicine was unsearchable.
      invalidateCatalogCache();

      if (products.length === 0) {
        setLoading(true);
      }
      // Lines are omitted here: the shared context feeds the list screens, which show a row
      // count. Reports fetches its own full copies for COGS and GST. This was the single
      // largest payload in the app.
      const [prodRes, invRes, salesRes, purRes, custRes, partyRes, ledgerRes, profileRes] = await Promise.all([
        api.get<Product[]>('/products').catch(() => ({ data: [] as Product[] })),
        api.get<InventoryItem[]>('/inventory').catch(() => ({ data: [] as InventoryItem[] })),
        api.get<Sale[]>('/sales?summary=1').catch(() => ({ data: [] as Sale[] })),
        api.get<Purchase[]>('/purchases?summary=1').catch(() => ({ data: [] as Purchase[] })),
        api.get<Customer[]>('/customers').catch(() => ({ data: [] as Customer[] })),
        api.get<Party[]>('/parties').catch(() => ({ data: [] as Party[] })),
        api.get<LedgerEntry[]>('/ledger').catch(() => ({ data: [] as LedgerEntry[] })),
        api.get<PharmacyProfile | null>('/settings').catch(() => ({ data: null })),
      ]);

      const prods = prodRes.data || [];
      const inv = invRes.data || [];
      const sal = salesRes.data || [];
      const pur = purRes.data || [];
      const cust = custRes.data || [];
      const part = partyRes.data || [];
      const ledg = ledgerRes.data || [];

      setProducts(prods);
      setInventory(inv);
      setSales(sal);
      setPurchases(pur);
      setCustomers(cust);
      setParties(part);
      setLedgers(ledg);
      setProfile(profileRes.data ?? null);
      setLoading(false);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            GLOBAL_CACHE_KEY,
            JSON.stringify({
              products: prods,
              inventory: inv,
              sales: sal,
              purchases: pur,
              customers: cust,
              parties: part,
              ledgers: ledg,
              timestamp: Date.now(),
            })
          );
        } catch {}
      }
    } catch (e) {
      console.error('ErpDataProvider fetch error:', e);
      setLoading(false);
    }
  }, [user]);

  /**
   * Refetch the sales list alone.
   *
   * Saving a bill used to trigger the whole eight-endpoint refresh, and the sales screen was
   * reached before any of it came back — so an edit looked like it had not been saved until
   * seconds later. One 47KB request settles the screen the operator is actually looking at;
   * the full refresh still runs behind it for the stock and ledger figures.
   */
  const refreshSales = React.useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<Sale[]>('/sales?summary=1');
      const rows = res.data || [];
      setSales(rows);
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(GLOBAL_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as ErpCache;
            localStorage.setItem(
              GLOBAL_CACHE_KEY,
              JSON.stringify({ ...parsed, sales: rows, timestamp: Date.now() })
            );
          }
        } catch {}
      }
    } catch (e) {
      console.error('refreshSales failed:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAllData();
    } else {
      setProducts([]);
      setInventory([]);
      setSales([]);
      setPurchases([]);
      setCustomers([]);
      setParties([]);
      setLedgers([]);
      setLoading(false);
    }
  }, [user, fetchAllData]);

  return (
    <ErpDataContext.Provider
      value={{
        products,
        inventory,
        sales,
        purchases,
        customers,
        parties,
        ledgers,
        profile,
        loading,
        refreshData: fetchAllData,
        refreshSales,
      }}
    >
      {children}
    </ErpDataContext.Provider>
  );
};

export const useErpData = () => useContext(ErpDataContext);
