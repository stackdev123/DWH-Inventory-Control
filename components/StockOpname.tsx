
import React, { useState, useMemo } from 'react';
import { Product, StockItem, ItemStatus, User, OpnameRequest } from '../types';
// Fixed missing icon imports: XCircle and ShieldAlert
import { ClipboardCheck, Save, Search, RotateCcw, RefreshCcw, X, Filter, Calendar, Info, Clock, CheckCircle, AlertCircle, FileSpreadsheet, ScanLine, Plus, XCircle, ShieldAlert } from 'lucide-react';
import { db } from '../services/database';
import CameraScanner from './CameraScanner';
import * as XLSX from 'xlsx';

interface StockOpnameProps {
  products: Product[];
  inventory: StockItem[];
  currentUser: User;
  onBulkAdjust: (adjustments: { item: StockItem, newQty: number, note: string }[]) => Promise<void>;
  onRefresh?: () => void;
}

interface BatchGroup {
  key: string; 
  productId: string;
  productName: string;
  unit: string;
  batchCode: string;
  items: StockItem[];
  totalSystemQty: number;
  productStockToday: number;
  productInitialStock: number;
}

const StockOpname: React.FC<StockOpnameProps> = ({ products, inventory, currentUser, onBulkAdjust, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionAdjustments, setSessionAdjustments] = useState<Record<string, { newTotalQty: number, note: string, isInitial: boolean, refDate: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  const defaultRefDate = firstDayOfMonth.toISOString().split('T')[0];

  const allBatchGroups = useMemo(() => {
    const groups: BatchGroup[] = [];
    const activeItems = inventory.filter(item => 
      String(item.status) === String(ItemStatus.IN_STOCK)
    );

    products.forEach(product => {
      const productActiveItems = activeItems.filter(item => item.productId === product.id);

      if (productActiveItems.length > 0) {
        const batchMap: Record<string, BatchGroup> = {};
        productActiveItems.forEach(item => {
          const batch = item.batchCode || 'TANPA-BATCH';
          const key = `${product.id}|${batch}`;
          if (!batchMap[key]) {
            batchMap[key] = {
              key, 
              productId: product.id, 
              productName: product.name,
              unit: product.unit, 
              batchCode: batch, 
              items: [], 
              totalSystemQty: 0,
              productStockToday: product.stockToday || 0,
              productInitialStock: product.initialStock || 0
            };
          }
          batchMap[key].items.push(item);
          batchMap[key].totalSystemQty += (item.quantity || 0);
        });
        Object.values(batchMap).forEach(g => groups.push(g));
      } else {
        groups.push({
          key: `${product.id}|GENERAL`,
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          batchCode: 'GLOBAL',
          items: [],
          totalSystemQty: product.stockToday || 0,
          productStockToday: product.stockToday || 0,
          productInitialStock: product.initialStock || 0
        });
      }
    });
    return groups.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
  }, [inventory, products]);

  const filteredGroups = useMemo(() => {
    const search = (searchTerm || '').toLowerCase();
    return allBatchGroups.filter(g => 
      (g.productName || '').toLowerCase().includes(search) || 
      (g.batchCode || '').toLowerCase().includes(search)
    );
  }, [allBatchGroups, searchTerm]);

  const handleQtyChange = (key: string, val: string) => {
    const qty = val === '' ? 0 : parseFloat(val);
    const group = allBatchGroups.find(g => g.key === key);
    setSessionAdjustments(prev => ({
      ...prev,
      [key]: { 
        ...(prev[key] || { note: '', newTotalQty: group?.totalSystemQty || 0, isInitial: false, refDate: defaultRefDate }), 
        newTotalQty: qty 
      }
    }));
  };

  const handleIncrementalScan = (codes: string | string[]) => {
    const codeList = Array.isArray(codes) ? codes : [codes];
    
    setSessionAdjustments(prev => {
      const next = { ...prev };
      codeList.forEach(code => {
        // Try to find if this code maps to a product or batch
        const group = allBatchGroups.find(g => 
          g.productId === code || g.items.some(i => i.uniqueId === code)
        );

        if (group) {
          const current = next[group.key] || { 
            newTotalQty: 0, // In scanning mode, we build from zero or current physical if exists
            note: 'Count via Scanner', 
            isInitial: false, 
            refDate: defaultRefDate 
          };
          
          // Incrementally add 1 (or batch size if detectable)
          next[group.key] = {
            ...current,
            newTotalQty: current.newTotalQty + 1
          };
        }
      });
      return next;
    });
  };

  const toggleInitial = (key: string) => {
    setSessionAdjustments(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { newTotalQty: allBatchGroups.find(g => g.key === key)?.totalSystemQty || 0, note: '', refDate: defaultRefDate }), isInitial: !prev[key]?.isInitial }
    }));
  };

  const resetAdjustment = (key: string) => {
    const newSession = { ...sessionAdjustments };
    delete newSession[key];
    setSessionAdjustments(newSession);
  };

  const adjustmentSummary = useMemo(() => {
    return (Object.entries(sessionAdjustments) as [string, any][])
      .map(([key, data]) => {
        const group = allBatchGroups.find(g => g.key === key);
        if (!group) return null;
        const variance = data.newTotalQty - group.totalSystemQty;
        if (variance === 0 && !data.note && !data.isInitial) return null;
        return { 
          key, 
          productId: group.productId,
          batchCode: group.batchCode, 
          productName: group.productName, 
          unit: group.unit, 
          system: group.totalSystemQty, 
          physical: data.newTotalQty, 
          variance, 
          note: data.note,
          isInitial: data.isInitial,
          refDate: data.refDate
        };
      })
      .filter(Boolean);
  }, [sessionAdjustments, allBatchGroups]);

  const commitOpname = async () => {
    if (adjustmentSummary.length === 0) return;
    setIsSubmitting(true);
    try {
      if (currentUser.role === 'Admin') {
        const adjustmentsToSubmit: { item: StockItem, newQty: number, note: string }[] = [];
        for (const adj of adjustmentSummary as any[]) {
          const group = allBatchGroups.find(g => g.key === adj.key);
          if (!group) continue;

          if (adj.isInitial) {
             const startTs = new Date(adj.refDate).getTime();
             const { data: logsInRange } = await (db as any).supabase
                .from('logs')
                .select('quantity_change')
                .eq('product_name', group.productName)
                .gte('timestamp', startTs);
             
             const sumMutations = (logsInRange || []).reduce((acc: number, l: any) => acc + (Number(l.quantity_change) || 0), 0);
             const calculatedInitial = adj.physical - sumMutations;
             await db.updateInitialStock(group.productId, calculatedInitial);
          } else {
            if (group.items.length > 0) {
              adjustmentsToSubmit.push({ item: group.items[0], newQty: adj.physical, note: adj.note || `Audit ${adj.batchCode}` });
            } else {
              const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
              const newItem: StockItem = {
                uniqueId: `OPN-${group.productId}-${suffix}`,
                productId: group.productId,
                productName: group.productName,
                batchCode: 'ADJUSTMENT-SYSTEM',
                arrivalDate: new Date().toISOString().split('T')[0],
                expiryDate: '',
                supplier: 'SYSTEM ADJ',
                status: ItemStatus.IN_STOCK,
                createdAt: Date.now(),
                quantity: group.totalSystemQty,
              };
              adjustmentsToSubmit.push({ item: newItem, newQty: adj.physical, note: adj.note || `Audit Global` });
            }
          }
        }
        if (adjustmentsToSubmit.length > 0) await onBulkAdjust(adjustmentsToSubmit);
      } else {
        for (const adj of adjustmentSummary as any[]) {
          await db.submitOpnameRequest({
            productId: adj.productId,
            productName: adj.productName,
            batchCode: adj.batchCode,
            systemQty: adj.system,
            physicalQty: adj.physical,
            variance: adj.variance,
            note: adj.note,
            isInitialStockAdjustment: adj.isInitial,
            referenceDate: adj.refDate,
            submittedBy: currentUser.username
          });
        }
        alert("Pengajuan opname telah dikirim ke Admin.");
      }
      
      setSessionAdjustments({});
      setShowConfirmModal(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      alert("Gagal menyimpan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {showScanner && (
        <CameraScanner 
          onScan={handleIncrementalScan} 
          onClose={() => setShowScanner(false)} 
          products={products}
          stockItems={inventory}
        />
      )}

      {/* Audit Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-200">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Total SKU Diaudit</span>
          <span className="text-3xl font-black">{adjustmentSummary.length}</span>
          <div className="mt-4 flex items-center gap-2 text-emerald-400 text-[10px] font-bold">
            <ClipboardCheck size={14} /> Progress: {Math.round((adjustmentSummary.length / allBatchGroups.length) * 100)}%
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Selisih (Variance)</span>
          <span className={`text-3xl font-black ${adjustmentSummary.reduce((acc, a: any) => acc + a.variance, 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {adjustmentSummary.reduce((acc, a: any) => acc + a.variance, 0).toLocaleString()}
          </span>
          <p className="text-[9px] text-slate-400 font-bold mt-4 uppercase">Koreksi akumulasi seluruh SKU</p>
        </div>
        <div className="bg-white rounded-3xl p-2 border border-slate-200 shadow-sm flex flex-col gap-2">
           <button onClick={() => setShowScanner(true)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
              <ScanLine size={20} className="text-red-600" />
              <span className="text-[10px] font-black uppercase tracking-widest">Scan to Count</span>
           </button>
           <button onClick={() => setShowConfirmModal(true)} disabled={adjustmentSummary.length === 0} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 active:scale-[0.98] shadow-lg shadow-red-200">
              <Save size={20} />
              <span className="text-[10px] font-black uppercase tracking-widest">Finalize Audit</span>
           </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
                type="text" 
                placeholder="Cari SKU atau Nama Barang untuk mulai audit..."
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-500/10 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button className="bg-slate-100 text-slate-600 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <Filter size={14} /> Filter
          </button>
          <button onClick={() => {}} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <FileSpreadsheet size={14} /> Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-[11px] border-collapse min-w-[800px]">
          <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[8px] tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-8 py-5">Produk / Batch Identity</th>
              <th className="px-6 py-5 text-center">System Stock</th>
              <th className="px-6 py-5 text-center">Physical Count</th>
              <th className="px-6 py-5 text-center">Variance</th>
              <th className="px-6 py-5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredGroups.length > 0 ? filteredGroups.map((group) => {
              const adj = sessionAdjustments[group.key];
              const physical = adj ? adj.newTotalQty : group.totalSystemQty;
              const variance = physical - group.totalSystemQty;
              const isModified = adj !== undefined;
              const isInitial = adj?.isInitial || false;

              return (
                <tr key={group.key} className={`transition-colors ${isModified ? 'bg-amber-50/20' : 'hover:bg-slate-50/30'}`}>
                  <td className="px-8 py-4">
                    <div className="font-black text-slate-800 uppercase text-[12px] leading-tight tracking-tight">{group.productName}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[8px] text-slate-400 font-mono uppercase tracking-widest bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm">ID: {group.productId}</span>
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-widest ${group.batchCode === 'GLOBAL' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-900 text-white border-slate-800'}`}>Batch: {group.batchCode}</span>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 text-center">
                    <span className="font-black text-slate-500 text-base">{group.totalSystemQty.toLocaleString()}</span>
                    <span className="text-[8px] font-black text-slate-300 block uppercase">{group.unit}</span>
                  </td>
                  
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex flex-col items-center gap-2">
                       <input 
                         type="number" 
                         step="0.01"
                         className={`w-32 text-center py-3 rounded-2xl font-black text-lg outline-none border transition-all ${isModified ? 'border-red-400 bg-white ring-4 ring-red-50' : 'border-slate-200 bg-slate-50 focus:border-slate-400'}`}
                         value={adj?.newTotalQty ?? group.totalSystemQty}
                         onChange={(e) => handleQtyChange(group.key, e.target.value)}
                       />
                       {isModified && <span className="text-[7px] font-black text-red-500 uppercase tracking-widest">Manual Correction Active</span>}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl font-black text-sm border ${variance === 0 ? 'text-slate-300 border-slate-100' : variance > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100'}`}>
                      {variance === 0 ? <CheckCircle size={14}/> : (variance > 0 ? '+' : '')}
                      {variance === 0 ? 'PERFECT' : variance.toLocaleString()}
                    </div>
                  </td>
                  
                  <td className="px-8 py-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => toggleInitial(group.key)} 
                        title="Set sebagai saldo awal periode (Back-date)"
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isInitial ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        <Clock size={18} />
                      </button>
                      <button onClick={() => resetAdjustment(group.key)} disabled={!isModified} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isModified ? 'bg-slate-900 text-white hover:bg-black' : 'bg-slate-50 text-slate-200'}`}>
                        <RotateCcw size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={5} className="py-32 text-center">
                  <XCircle size={48} className="text-slate-200 mx-auto mb-4" />
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Tidak ada item dalam daftar audit ini</h3>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
           <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-lg w-full flex flex-col max-h-[85vh] animate-in zoom-in-95 border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">Confirm Audit</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">Review {adjustmentSummary.length} sku corrections</p>
                </div>
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl"><ShieldAlert size={24} /></div>
              </div>
              
              <div className="flex-1 overflow-y-auto mb-8 space-y-3 pr-2 custom-scrollbar">
                {adjustmentSummary.map((adj: any) => (
                  <div key={adj.key} className="p-5 bg-slate-50 rounded-3xl flex flex-col gap-2 border border-slate-200">
                     <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1">
                            <span className="text-[11px] font-black text-slate-900 truncate block uppercase leading-tight">{adj.productName}</span>
                            <span className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">BATCH: {adj.batchCode}</span>
                        </div>
                        <div className={`px-3 py-1 rounded-xl text-[10px] font-black border ${adj.variance >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            {adj.variance > 0 ? `+${adj.variance}` : adj.variance}
                        </div>
                     </div>
                     {adj.isInitial && (
                         <div className="flex items-center gap-2 bg-amber-100/50 p-2 rounded-xl">
                            <Clock size={12} className="text-amber-600" />
                            <span className="text-[8px] font-black text-amber-700 uppercase tracking-widest">Correction applied to Period Opening</span>
                         </div>
                     )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={commitOpname} disabled={isSubmitting} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl active:scale-[0.98] transition-all">
                  {isSubmitting ? <RefreshCcw className="animate-spin" size={18}/> : <CheckCircle size={18}/>} 
                  {currentUser.role === 'Admin' ? 'AUTHENTICATE & SAVE' : 'SUBMIT FOR APPROVAL'}
                </button>
                <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 rounded-2xl text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50">Back to Audit</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StockOpname;
