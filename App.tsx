
import React, { useState, useEffect, useCallback } from 'react';
import { User, Product, StockItem, LogEntry, ItemStatus } from './types';
import { db, supabase } from './services/database';
import Login from './components/Login';
import Transactions from './components/Transactions';
import Inventory from './components/Inventory';
import MasterData from './components/MasterData';
import History from './components/History';
import About from './components/About';
import LabelGenerator from './components/LabelGenerator';
import Dashboard from './components/Dashboard';
import { 
  ArrowLeftRight,
  Package, 
  Database, 
  History as HistoryIcon, 
  Info, 
  LogOut,
  RefreshCw,
  Tag,
  LayoutDashboard
} from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAllData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [p, s, l] = await Promise.all([
        db.getProducts(),
        db.getAllStock(),
        db.getAllLogs()
      ]);
      setProducts(p);
      setStock(s);
      setLogs(l);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadAllData();
      
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public' },
          () => {
            loadAllData(true);
          }
        )
        .subscribe();

      const syncInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadAllData(true);
        }
      }, 15000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(syncInterval);
      };
    }
  }, [currentUser, loadAllData]);

  const handleLogout = () => {
    const confirmLogout = window.confirm("Apakah Anda yakin ingin keluar dari sistem?");
    if (confirmLogout) {
      setCurrentUser(null);
      setActiveTab('dashboard');
      setProducts([]);
      setStock([]);
      setLogs([]);
    }
  };

  const handleRegisterStock = async (items: StockItem[]) => {
    try {
      await db.addStockItems(items);
      await loadAllData(true);
    } catch (error) {
      alert("Gagal registrasi stiker.");
    }
  };

  const handleInbound = async (items: StockItem[], note: string, isMigration: boolean = false) => {
    if (!currentUser) return;
    try {
      const logEntries: LogEntry[] = [];
      
      items.forEach(item => {
        logEntries.push({
          id: `LOG-IN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'IN',
          stockItemId: item.uniqueId,
          productName: item.productName,
          timestamp: Date.now(),
          note: isMigration ? `Migrasi: ${note || 'Penerimaan'}` : (note || 'Penerimaan Barang'),
          quantityChange: item.quantity,
          user: currentUser.username
        });

        if (isMigration) {
          logEntries.push({
            id: `LOG-MIG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type: 'ADJUST',
            stockItemId: 'SYSTEM-MIGRATION',
            productName: item.productName,
            timestamp: Date.now() + 1,
            note: `Konversi Saldo Lama ke Stiker [${item.uniqueId.slice(-6)}]`,
            quantityChange: -item.quantity,
            user: currentUser.username
          });
        }
      });

      await db.addStockItems(items.map(i => ({ ...i, status: ItemStatus.IN_STOCK })));      await db.addLogEntries(logEntries);
      await loadAllData(true);
    } catch (error) {
      alert("Gagal melakukan inbound.");
      throw error;
    }
  };

  const handleOutbound = async (requests: { item: StockItem, qtyToTake: number, recipient: string, note: string }[]) => {
    if (!currentUser) return;
    try {
      const logEntries: LogEntry[] = requests.map(req => ({
        id: `LOG-OUT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'OUT',
        stockItemId: req.item.uniqueId,
        productName: req.item.productName,
        timestamp: Date.now(),
        recipient: req.recipient,
        note: req.note || 'Pengeluaran Barang',
        quantityChange: -req.qtyToTake,
        user: currentUser.username
      }));
      for (const req of requests) {
        const newQty = req.item.quantity - req.qtyToTake;
        const updatedItem: StockItem = {
          ...req.item,
          quantity: newQty,
          status: newQty <= 0 ? ItemStatus.OUTBOUND : ItemStatus.IN_STOCK
        };
        await db.updateStockItem(updatedItem);
      }
      await db.addLogEntries(logEntries);
      await loadAllData(true);
    } catch (error) {
      alert("Gagal melakukan outbound.");
      throw error;
    }
  };

  const handleAdjustment = async (item: StockItem, newQty: number, note: string) => {
    if (!currentUser) return;
    try {
      const diff = newQty - item.quantity;
      if (diff === 0) return;
      const logEntry: LogEntry = {
        id: `LOG-ADJ-${Date.now()}`,
        type: 'ADJUST',
        stockItemId: item.uniqueId,
        productName: item.productName,
        timestamp: Date.now(),
        note: note || 'Penyesuaian Stok (Audit)',
        quantityChange: diff,
        user: currentUser.username
      };
      const updatedItem: StockItem = {
        ...item,
        quantity: newQty,
        status: newQty <= 0 ? ItemStatus.OUTBOUND : ItemStatus.IN_STOCK
      };
      await db.updateStockItem(updatedItem);
      await db.addLogEntries([logEntry]);
      await loadAllData(true);
    } catch (error) {
      alert("Gagal melakukan adjustment.");
    }
  };

  const handleBulkAdjust = async (adjustments: { item: StockItem, newQty: number, note: string }[]) => {
    for (const adj of adjustments) {
      await handleAdjustment(adj.item, adj.newQty, adj.note);
    }
  };

  if (!currentUser) {
    return <Login onLoginSuccess={setCurrentUser} />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { id: 'inventory', label: 'Inventory', icon: <Package size={16} /> },
    { id: 'sticker', label: 'Buat Stiker', icon: <Tag size={16} /> },
    { id: 'transactions', label: 'Transaksi', icon: <ArrowLeftRight size={16} /> },
    { id: 'history', label: 'Reports', icon: <HistoryIcon size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-[100] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-1.5 rounded-lg text-white shadow-sm">
              <Package size={20} />
            </div>
            <div className="flex flex-col">
              <span className="font-black uppercase tracking-tighter text-slate-900 leading-none">Dry Warehouse</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 leading-none">Management System</span>
              <span className="text-[9px] font-black text-red-600 uppercase tracking-widest mt-1">Bounty Segar Indonesia</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="hidden md:flex flex-col text-right">
                <span className="text-[11px] font-black text-slate-900 uppercase leading-none tracking-tight">{currentUser.username}</span>
                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-0.5">{currentUser.role}</span>
             </div>
             <button 
               onClick={handleLogout} 
               className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all active:scale-90"
               title="Keluar dari Sistem"
             >
               <LogOut size={20} />
             </button>
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-4 overflow-x-auto no-scrollbar hidden md:block">
          <div className="flex gap-4">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 border-b-2 font-black text-[10px] uppercase tracking-widest transition-all
                  ${activeTab === item.id 
                    ? 'border-red-600 text-red-600' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'}
                `}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
            <RefreshCw className="animate-spin text-red-600" size={32} />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sinkronisasi Database...</span>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {activeTab === 'dashboard' && (
              <Dashboard products={products} stock={stock} logs={logs} />
            )}
            {activeTab === 'inventory' && (
              <Inventory products={products} inventory={stock} logs={logs} currentUser={currentUser} onAdjust={handleAdjustment} onBulkAdjust={handleBulkAdjust} onRefresh={() => loadAllData(true)} />
            )}
            {activeTab === 'sticker' && (
              <LabelGenerator products={products} stock={stock} onAddStock={handleRegisterStock} />
            )}
            {activeTab === 'transactions' && (
              <Transactions 
                products={products} 
                stock={stock} 
                onInbound={handleInbound} 
                onOutbound={handleOutbound} 
                onRefresh={() => loadAllData(true)} 
              />
            )}
            {activeTab === 'history' && (
              <History logs={logs} products={products} stock={stock} currentUser={currentUser} onRefresh={() => loadAllData(true)} onAdjust={handleAdjustment} />
            )}
            {activeTab === 'about' && (
              <About />
            )}
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-1 py-1 flex justify-around items-center z-[100] shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`
              flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-[50px]
              ${activeTab === item.id ? 'text-red-600' : 'text-slate-400'}
            `}
          >
            {item.icon}
            <span className="text-[7px] font-black uppercase tracking-tighter text-center">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
