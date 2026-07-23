'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api-client';

interface ErpDataContextType {
  products: any[];
  inventory: any[];
  sales: any[];
  purchases: any[];
  customers: any[];
  parties: any[];
  loading: boolean;
  refreshData: () => Promise<void>;
}

const ErpDataContext = createContext<ErpDataContextType>({
  products: [],
  inventory: [],
  sales: [],
  purchases: [],
  customers: [],
  parties: [],
  loading: true,
  refreshData: async () => {},
});

const GLOBAL_CACHE_KEY = 'adgen_global_erp_cache_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 mins cache TTL

export const ErpDataProvider = ({ children }: { children: React.ReactNode }) => {
  const getInitialCache = () => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(GLOBAL_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            return parsed;
          }
        }
      } catch (_) {}
    }
    return null;
  };

  const initialCache = getInitialCache();

  const [products, setProducts] = useState<any[]>(initialCache?.products || []);
  const [inventory, setInventory] = useState<any[]>(initialCache?.inventory || []);
  const [sales, setSales] = useState<any[]>(initialCache?.sales || []);
  const [purchases, setPurchases] = useState<any[]>(initialCache?.purchases || []);
  const [customers, setCustomers] = useState<any[]>(initialCache?.customers || []);
  const [parties, setParties] = useState<any[]>(initialCache?.parties || []);
  const [loading, setLoading] = useState<boolean>(!initialCache);

  const fetchAllData = React.useCallback(async () => {
    try {
      const [prodRes, invRes, salesRes, purRes, custRes, partyRes] = await Promise.all([
        api.get('/products').catch(() => ({ data: [] })),
        api.get('/inventory').catch(() => ({ data: [] })),
        api.get('/sales').catch(() => ({ data: [] })),
        api.get('/purchases').catch(() => ({ data: [] })),
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/parties').catch(() => ({ data: [] })),
      ]);

      const prods = prodRes.data || [];
      const inv = invRes.data || [];
      const sal = salesRes.data || [];
      const pur = purRes.data || [];
      const cust = custRes.data || [];
      const part = partyRes.data || [];

      setProducts(prods);
      setInventory(inv);
      setSales(sal);
      setPurchases(pur);
      setCustomers(cust);
      setParties(part);
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
              timestamp: Date.now(),
            })
          );
        } catch (_) {}
      }
    } catch (e) {
      console.error('ErpDataProvider fetch error:', e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  return (
    <ErpDataContext.Provider
      value={{
        products,
        inventory,
        sales,
        purchases,
        customers,
        parties,
        loading,
        refreshData: fetchAllData,
      }}
    >
      {children}
    </ErpDataContext.Provider>
  );
};

export const useErpData = () => useContext(ErpDataContext);
