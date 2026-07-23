'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Search, Command, ArrowRight, Package, Receipt, ShoppingBag, Users, Building2, LayoutDashboard, X } from 'lucide-react';

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([
        { type: 'page', title: 'New Sale / POS Counter', path: '/billing', icon: Receipt },
        { type: 'page', title: 'New Purchase Entry', path: '/purchases/new', icon: ShoppingBag },
        { type: 'page', title: 'Inventory & Stock Valuation', path: '/inventory', icon: Package },
        { type: 'page', title: 'Products Catalog', path: '/products', icon: Package },
        { type: 'page', title: 'Sales Ledger', path: '/sales', icon: Receipt },
        { type: 'page', title: 'Purchases Ledger', path: '/purchases', icon: ShoppingBag },
        { type: 'page', title: 'Customers Directory', path: '/customers', icon: Users },
        { type: 'page', title: 'Suppliers Directory', path: '/parties', icon: Building2 },
      ]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await api.get(`/inventory?q=${encodeURIComponent(query.trim())}`);
        const productItems = (res.data || []).slice(0, 8).map((p: any) => ({
          type: 'medicine',
          title: p.productName || p.name,
          sub: `Stock: ${p.totalStock || 0} units | MRP: ₹${p.mrp || 0}`,
          path: `/inventory?q=${encodeURIComponent(p.productName || p.name)}`,
          icon: Package,
        }));
        setResults(productItems);
      } catch (err) {
        console.error('CommandPalette search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: any) => {
    setIsOpen(false);
    setQuery('');
    router.push(item.path);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 rounded-full shadow-2xl flex items-center gap-2 border border-emerald-400/40 transition active:scale-95"
        title="Global Search (Ctrl+K)"
      >
        <Command className="w-5 h-5" />
        <span className="text-xs font-extrabold pr-1 hidden sm:inline">Ctrl + K</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-20 px-4">
      <div className="bg-white border border-slate-200 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Search Header Input */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <Search className="w-5 h-5 text-emerald-600" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a medicine name, invoice number, or page..."
            className="flex-1 bg-transparent text-sm font-bold text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded font-mono font-bold">ESC</span>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-2">
          {loading ? (
            <div className="p-6 text-center text-xs font-bold text-slate-400">Searching inventory...</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-xs font-bold text-slate-400">No matching medicines or pages found</div>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon || ArrowRight;
              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(item)}
                  className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                    idx === selectedIndex ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100/60 text-emerald-800 rounded-lg">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">{item.title}</div>
                      {item.sub && <div className="text-[10px] font-mono text-slate-500">{item.sub}</div>}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Tips */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold flex items-center justify-between">
          <span>AdGen ERP Global Command Palette</span>
          <span>Use Ctrl+K anywhere</span>
        </div>
      </div>
    </div>
  );
}
