'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from './AuthContext';

interface ErpDataContextType {
  products: any[];
  inventory: any[];
  sales: any[];
  purchases: any[];
  customers: any[];
  parties: any[];
  ledgers: any[];
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
  ledgers: [],
  loading: true,
  refreshData: async () => {},
});

const GLOBAL_CACHE_KEY = 'adgen_global_erp_cache_v1';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 mins cache TTL

export const ErpDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

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

  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log(
        '%c🚀 AdGen Pharmacy ERP Engine Active\n%c✨ Designed & Engineered by Anshu (Anshu says hi! 👋)',
        'color: #059669; font-weight: bold; font-size: 16px; padding: 4px 0;',
        'color: #2563eb; font-weight: bold; font-size: 13px; background: #eff6ff; padding: 4px 8px; border-radius: 6px;'
      );

      const cache = getInitialCache();
      if (cache) {
        if (cache.products) setProducts(cache.products);
        if (cache.inventory) setInventory(cache.inventory);
        if (cache.sales) setSales(cache.sales);
        if (cache.purchases) setPurchases(cache.purchases);
        if (cache.customers) setCustomers(cache.customers);
        if (cache.parties) setParties(cache.parties);
        if (cache.ledgers) setLedgers(cache.ledgers);
        setLoading(false);
      }
    }
  }, []);

  const fetchAllData = React.useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      if (products.length === 0) {
        setLoading(true);
      }
      console.log('⚡ [Anshu Sync Engine] Synchronizing Live Pharmacy Data...');
      const [prodRes, invRes, salesRes, purRes, custRes, partyRes, ledgerRes] = await Promise.all([
        api.get('/products').catch(() => ({ data: [] })),
        api.get('/inventory').catch(() => ({ data: [] })),
        api.get('/sales').catch(() => ({ data: [] })),
        api.get('/purchases').catch(() => ({ data: [] })),
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/parties').catch(() => ({ data: [] })),
        api.get('/ledger').catch(() => ({ data: [] })),
      ]);

      const prods = prodRes.data || [];
      const inv = invRes.data || [];
      const sal = salesRes.data || [];
      const pur = purRes.data || [];
      const cust = custRes.data || [];
      const part = partyRes.data || [];
      const ledg = ledgerRes.data || [];

      console.log(`✅ [Anshu Engine] Data Sync Complete! 📦 ${prods.length} Medicines | 💊 ${inv.length} Batches | 🧾 ${sal.length} Invoices | 👥 ${cust.length} Customers`);

      setProducts(prods);
      setInventory(inv);
      setSales(sal);
      setPurchases(pur);
      setCustomers(cust);
      setParties(part);
      setLedgers(ledg);
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
        } catch (_) {}
      }
    } catch (e) {
      console.error('ErpDataProvider fetch error:', e);
      setLoading(false);
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
        loading,
        refreshData: fetchAllData,
      }}
    >
      {children}
    </ErpDataContext.Provider>
  );
};

export const useErpData = () => useContext(ErpDataContext);
