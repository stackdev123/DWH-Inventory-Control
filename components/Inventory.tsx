
import React, { useState, useMemo, useEffect } from 'react';
import { StockItem, Product, LogEntry, ItemStatus, User, LabelData } from '../types';
import { 
  Search, Package, Box, AlertTriangle, RefreshCw, X, Tag, FileSpreadsheet, 
  ChevronRight, Info, ArrowUpRight, ArrowDownLeft, History as HistoryIcon, 
  Printer, AlertCircle, Layers, ShieldCheck, Eye, Settings2, Plus, Minus, 
  ScanLine, User as UserIcon, Activity, Truck, Database, Clock, Calendar, Hash, FileText
} from 'lucide-react';
import StockOpname from './StockOpname';
import MasterData from './MasterData';
import { db } from '../services/database';
import * as XLSX from 'xlsx';
import CameraScanner from './CameraScanner';

interface InventoryProps {
  products: Product[];
  inventory: StockItem[];
  logs: LogEntry[];
  currentUser: User;
  onAdjust?: (item: StockItem, newQty: number, note: string) => void;
  onBulkAdjust?: (adjustments: { item: StockItem, newQty: number, note: string }[]) => Promise<void>;
  onRefresh?: () => void;
}

const Inventory: React.FC<InventoryProps> = ({ products, inventory, logs, currentUser, onAdjust, onBulkAdjust, onRefresh }) => {
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'recap' | 'opname' | 'master'>('recap');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailTab, setDetailTab] = useState<'batches' | 'history'>('batches');
  
  const [showScanner, setShowScanner] = useState(false);
  const [scannedUnit, setScannedUnit] = useState<{ item: StockItem; logs: LogEntry[] } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [manageForm, setManageForm] = useState({ safetyStock: 0, adjustQty: 0, adjustNote: '' });
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);

  useEffect(() => {
    if (selectedProduct) {
      setManageForm({
        safetyStock: selectedProduct.safetyStock || 0,
        adjustQty: 0,
        adjustNote: ''
      });
      setDetailTab('batches');
    }
  }, [selectedProduct]);

  const formatDateReadable = (dateStr: string) => {
    if (!dateStr || dateStr === 'System' || dateStr === 'Migration') return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const formatDateTimeFull = (ts: any) => {
    if (!ts) return "-";
    const d = new Date(Number(ts));
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleScanCheck = (id: string | string[]) => {
    const uniqueId = Array.isArray(id) ? id[0] : id;
    setScanError(null);

    const item = inventory.find(s => s.uniqueId === uniqueId);
    if (item) {
      const unitLogs = logs.filter(l => l.stockItemId === uniqueId).sort((a, b) => b.timestamp - a.timestamp);
      setScannedUnit({ item, logs: unitLogs });
      return;
    }

    const product = products.find(p => p.id === uniqueId);
    if (product) {
      setSelectedProduct(product);
      return;
    }

    setScanError(`ID "${uniqueId}" tidak ditemukan.`);
    setTimeout(() => setScanError(null), 3000);
  };

  const handleAdminUpdate = async () => {
    if (!selectedProduct || isAdminSubmitting) return;
    setIsAdminSubmitting(true);
    try {
      if (manageForm.safetyStock !== (selectedProduct.safetyStock || 0)) {
        await db.upsertProduct({ ...selectedProduct, safetyStock: manageForm.safetyStock });
      }

      if (manageForm.adjustQty !== 0) {
        if (!manageForm.adjustNote.trim()) {
          alert("Alasan penyesuaian stok harus diisi.");
          setIsAdminSubmitting(false);
          return;
        }

        const currentQty = selectedProduct.stockToday || 0;
        const newQty = currentQty + manageForm.adjustQty;

        const group = inventory.find(s => s.productId === selectedProduct.id && s.status === ItemStatus.IN_STOCK);
        
        const correctionItem: StockItem = group ? { ...group } : {
           uniqueId: `CORR-${selectedProduct.id}-${Date.now()}`,
           productId: selectedProduct.id,
           productName: selectedProduct.name,
           batchCode: 'ADMIN-CORRECTION',
           arrivalDate: new Date().toISOString().split('T')[0],
           expiryDate: '',
           supplier: 'SYSTEM',
           status: ItemStatus.IN_STOCK,
           createdAt: Date.now(),
           quantity: currentQty
        };

        if (onAdjust) await onAdjust(correctionItem, newQty, `[ADMIN FIX] ${manageForm.adjustNote}`);
      }

      setSelectedProduct(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert("Gagal memperbarui data.");
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  const filteredRecap = useMemo(() => {
    const search = (filter || '').toLowerCase();
    return products.filter(p => 
      (p.name || '').toLowerCase().includes(search) || 
      (p.id || '').toLowerCase().includes(search)
    );
  }, [products, filter]);

  const productBatches = useMemo(() => {
    if (!selectedProduct) return [];
    const recordedEntries = inventory.filter(s => 
      s.productId === selectedProduct.id && 
      s.status === ItemStatus.IN_STOCK &&
      s.quantity > 0.001
    ).sort((a, b) => {
        if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        return a.createdAt - b.createdAt;
    });
    
    const recordedSum = recordedEntries.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0);
    const gapQty = (selectedProduct.stockToday || 0) - recordedSum;
    
    const finalBatchList: StockItem[] = [...recordedEntries];
    if (gapQty > 0.01) { 
        finalBatchList.push({
            uniqueId: `INITIAL-${selectedProduct.id}`,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            batchCode: 'LEGACY',
            arrivalDate: 'System',
            expiryDate: '',
            supplier: 'Migration',
            status: ItemStatus.IN_STOCK,
            createdAt: 0,
            quantity: gapQty,
            isUnlabeled: true
        });
    }
    return finalBatchList;
  }, [selectedProduct, inventory]);

  const recentHistory = useMemo(() => {
    if (!selectedProduct) return [];
    return logs
      .filter(l => l.productName === selectedProduct.name)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
  }, [selectedProduct, logs]);

  const downloadInventoryExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(products.map(p => ({
      'Kode': p.id,
      'Nama Produk': p.name,
      'Unit': p.unit,
      'Kategori': p.category,
      'Saldo Awal': p.initialStock || 0,
      'Stok Akhir': p.stockToday || 0,
      'Safety Stock': p.safetyStock || 0
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Recap");
    XLSX.writeFile(workbook, "Inventory_Recap.xlsx");
  };

  const getStockStatus = (p: Product) => {
    const stock = p.stockToday || 0;
    const safety = p.safetyStock || 0;
    if (stock <= 0) return { label: 'HABIS', color: 'bg-red-600', text: 'text-white' };
    if (stock <= safety) return { label: 'MENIPIS', color: 'bg-amber-500', text: 'text-white' };
    return { label: 'AMAN', color: 'bg-emerald-500', text: 'text-white' };
  };

  return (
    <div className="space-y-4 relative">
      {showScanner && (
        <CameraScanner onScan={handleScanCheck} onClose={() => setShowScanner(false)} stockItems={inventory} products={products} />
      )}

      {scannedUnit && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="p-5 bg-slate-900 text-white relative">
                 <button onClick={() => setScannedUnit(null)} className="absolute top-5 right-5 p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={20} /></button>
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg"><Package size={22} /></div>
                    <div>
                       <h3 className="text-base font-black uppercase tracking-tighter">{scannedUnit.item.productName}</h3>
                       <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${scannedUnit.item.status === ItemStatus.IN_STOCK ? 'bg-emerald-500' : 'bg-red-500'}`}>{scannedUnit.item.status}</span>
                          <span className="text-[7px] font-black text-slate-500 uppercase">ID: {scannedUnit.item.uniqueId.slice(-8)}</span>
                       </div>
                    </div>
                 </div>
                 <div className="grid grid-cols-4 gap-2">
                    <div className="bg-white/5 p-2 rounded-xl">
                       <span className="text-[6px] font-black text-slate-500 uppercase block">Batch</span>
                       <span className="text-[9px] font-black text-white truncate block">{scannedUnit.item.batchCode || '-'}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl">
                       <span className="text-[6px] font-black text-slate-500 uppercase block">Qty</span>
                       <span className="text-[9px] font-black text-white">{scannedUnit.item.quantity.toLocaleString()}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl">
                       <span className="text-[6px] font-black text-slate-500 uppercase block">In</span>
                       <span className="text-[9px] font-black text-white">{formatDateReadable(scannedUnit.item.arrivalDate) || '-'}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl">
                       <span className="text-[6px] font-black text-slate-500 uppercase block">Exp</span>
                       <span className="text-[9px] font-black text-white truncate">{scannedUnit.item.expiryDate ? formatDateReadable(scannedUnit.item.expiryDate) : 'N/A'}</span>
                    </div>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                 {scannedUnit.item.note && (
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                       <FileText size={18} className="text-blue-500 mt-0.5" />
                       <div>
                          <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest block mb-1">Keterangan Unit</span>
                          <p className="text-[11px] font-bold text-blue-700 italic leading-snug">{scannedUnit.item.note}</p>
                       </div>
                    </div>
                 )}

                 <h4 className="text-[8px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-4"><Activity size={12} className="text-red-600" /> Mutasi Unit</h4>
                 <div className="space-y-4 relative ml-1 border-l-2 border-slate-200 pl-4">
                    {scannedUnit.logs.length > 0 ? scannedUnit.logs.map((log) => (
                      <div key={log.id} className="relative">
                         <div className={`absolute -left-[25px] top-0 w-2.5 h-2.5 rounded-full border-2 border-white ${log.type === 'IN' ? 'bg-emerald-500' : log.type === 'OUT' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                         <div className="flex justify-between items-start">
                           <div className="min-w-0">
                              <span className="text-[9px] font-black text-slate-900 uppercase leading-none">{log.type} Transaction</span>
                              <p className="text-[8px] font-medium text-slate-500 truncate">{log.note || log.recipient || '-'}</p>
                           </div>
                           <div className={`font-black text-[10px] ${log.quantityChange! > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                             {log.quantityChange! > 0 ? '+' : ''}{log.quantityChange?.toLocaleString()}
                           </div>
                         </div>
                      </div>
                    )) : (
                        <div className="py-10 text-center text-slate-300 italic text-[9px] uppercase font-black">No Logs</div>
                    )}
                 </div>
              </div>
              <div className="p-4 border-t border-slate-100">
                <button onClick={() => setScannedUnit(null)} className="w-full py-3 bg-slate-950 text-white rounded-xl font-black uppercase text-[9px] tracking-widest">TUTUP</button>
              </div>
           </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center"><Package size={22} /></div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Inventory Control</h2>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Global Stock Monitoring</p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-0.5 rounded-xl w-full md:w-auto border border-slate-200">
             <button onClick={() => setViewMode('recap')} className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'recap' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}>REKAP</button>
             <button onClick={() => setViewMode('opname')} className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'opname' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>OPNAME</button>
             {currentUser.role === 'Admin' && (
                <button onClick={() => setViewMode('master')} className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'master' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>MASTER</button>
             )}
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
              {viewMode === 'recap' && (
                <>
                    <button onClick={() => setShowScanner(true)} className="bg-slate-900 text-white px-3 py-2 rounded-xl active:scale-95 shadow-md"><ScanLine size={16} className="text-red-500" /></button>
                    <div className="relative flex-1 md:w-40">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input type="text" placeholder="Cari..." value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-[10px] font-bold outline-none bg-slate-50 focus:ring-1 focus:ring-red-500" />
                    </div>
                    <button onClick={downloadInventoryExcel} className="bg-emerald-600 text-white p-2 rounded-xl active:scale-90 shadow-md"><FileSpreadsheet size={16} /></button>
                </>
              )}
          </div>
        </div>

        <div className="p-0">
          {viewMode === 'recap' ? (
            <div className="overflow-x-auto">
               <table className="w-full text-left text-[10px] border-collapse min-w-[600px]">
                  <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[8px] tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Identitas Produk</th>
                      <th className="px-4 py-4 text-center">Unit</th>
                      <th className="px-4 py-4 text-right bg-red-50/20 text-red-600">Stok</th>
                      <th className="px-4 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecap.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-all group">
                        <td className="px-6 py-4 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                          <div className="font-black text-slate-900 uppercase text-[11px] leading-tight group-hover:text-red-600">{p.name}</div>
                          <div className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest">{p.id}</div>
                        </td>
                        <td className="px-4 py-4 text-center font-bold text-slate-400 uppercase">{p.unit}</td>
                        <td className="px-4 py-4 text-right bg-red-50/5"><span className="text-sm font-black text-slate-900">{p.stockToday?.toLocaleString() || 0}</span></td>
                        <td className="px-4 py-4 text-center">
                            <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${getStockStatus(p).color} ${getStockStatus(p).text}`}>
                                {getStockStatus(p).label}
                            </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                            <button onClick={() => setSelectedProduct(p)} className="p-2 text-slate-300 hover:text-slate-900 transition-all">
                                <Eye size={18} />
                            </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          ) : viewMode === 'opname' ? (
            <div className="p-4">
               {onBulkAdjust && <StockOpname products={products} inventory={inventory} currentUser={currentUser} onBulkAdjust={onBulkAdjust} onRefresh={onRefresh} />}
            </div>
          ) : (
            <div className="p-4">
               <MasterData products={products} currentUser={currentUser} onRefresh={async () => onRefresh?.()} />
            </div>
          )}
        </div>
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-0 md:p-4">
          <div className="bg-white rounded-t-[2rem] md:rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col max-h-[85vh] border border-slate-100 overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-4 flex justify-between items-center border-b border-slate-100 bg-white sticky top-0 z-10">
              <div className="flex gap-3 items-center">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg ${getStockStatus(selectedProduct).color}`}><Package size={18} /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedProduct.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[7px] font-mono font-bold text-slate-400 uppercase">{selectedProduct.id}</span>
                    <span className="text-[7px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-2 py-0.5 rounded-full">{selectedProduct.category}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded-full transition-colors"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
                <div className="bg-white p-4">
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button onClick={() => setDetailTab('batches')} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${detailTab === 'batches' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}>
                      <Layers size={12} /> Stiker
                    </button>
                    <button onClick={() => setDetailTab('history')} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${detailTab === 'history' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}>
                      <HistoryIcon size={12} /> Mutasi
                    </button>
                  </div>
                </div>

                <div className="p-4">
                {detailTab === 'batches' ? (
                  <div className="space-y-2">
                    {productBatches.length > 0 ? productBatches.map((item) => (
                      <div key={item.uniqueId} className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col gap-2 group hover:border-red-400 transition-all shadow-sm">
                        <div className="flex justify-between items-center">
                           <div className="flex items-center gap-2">
                             <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400 group-hover:text-red-500 transition-colors border border-slate-100"><Tag size={12} /></div>
                             <div className="flex flex-col">
                               <span className="text-[10px] font-black text-slate-900 uppercase leading-none">{item.batchCode || 'GENERAL'}</span>
                               <span className="text-[7px] font-mono font-bold text-slate-400 uppercase mt-0.5">{item.uniqueId.slice(-10)}</span>
                             </div>
                           </div>
                           <div className="text-right">
                             <div className="text-sm font-black text-slate-900">{item.quantity.toLocaleString()} <small className="text-[7px] uppercase text-slate-400">{selectedProduct.unit}</small></div>
                           </div>
                        </div>

                        <div className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                           <div className="flex items-center gap-1 min-w-0">
                              <Truck size={10} className="text-slate-300" />
                              <span className="text-[8px] font-black text-slate-500 uppercase truncate">{item.supplier || '-'}</span>
                           </div>
                           <div className="w-px h-3 bg-slate-200"></div>
                           <div className="flex items-center gap-1 whitespace-nowrap">
                              <Calendar size={10} className="text-slate-300" />
                              <span className="text-[8px] font-black text-slate-500 uppercase">{formatDateReadable(item.arrivalDate) || '-'}</span>
                           </div>
                           <div className="w-px h-3 bg-slate-200"></div>
                           <div className="flex items-center gap-1 whitespace-nowrap min-w-0">
                              <Clock size={10} className="text-slate-300" />
                              <span className={`text-[8px] font-black uppercase ${item.expiryDate ? 'text-red-600' : 'text-slate-400'}`}>{item.expiryDate ? formatDateReadable(item.expiryDate) : 'NO EXP'}</span>
                           </div>
                        </div>

                        {item.note && (
                           <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 rounded-xl border border-blue-100/50 mt-1">
                              <FileText size={10} className="text-blue-400" />
                              <span className="text-[8px] font-bold text-blue-600 italic truncate">{item.note}</span>
                           </div>
                        )}
                      </div>
                    )) : (
                      <div className="py-12 text-center text-slate-300 italic text-[9px] font-black uppercase flex flex-col items-center gap-2">
                        <Layers size={30} className="opacity-10" />
                        No data
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentHistory.length > 0 ? recentHistory.map((log) => {
                      const itemInfo = inventory.find(s => s.uniqueId === log.stockItemId);
                      return (
                        <div key={log.id} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.type === 'IN' ? 'bg-emerald-500' : log.type === 'OUT' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                          
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-2 items-center">
                              <div className={`p-1.5 rounded-lg ${log.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : log.type === 'OUT' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                {log.type === 'IN' ? <ArrowDownLeft size={12} /> : log.type === 'OUT' ? <ArrowUpRight size={12} /> : <Info size={12} />}
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-[7px] font-black uppercase tracking-widest ${log.type === 'IN' ? 'text-emerald-600' : log.type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`}>
                                  {log.type}
                                </span>
                                <p className="text-[9px] font-black text-slate-900 leading-tight">{formatDateTimeFull(log.timestamp)}</p>
                              </div>
                            </div>
                            <div className={`text-xs font-black ${Number(log.quantityChange)! > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {Number(log.quantityChange)! > 0 ? '+' : ''}{log.quantityChange?.toLocaleString()}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-2">
                             <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                <Hash size={10} className="text-slate-300" />
                                <span className="text-[7px] font-black text-slate-500 uppercase truncate">{itemInfo?.batchCode || '-'}</span>
                             </div>
                             <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                <Clock size={10} className="text-slate-300" />
                                <span className="text-[7px] font-black text-slate-500 uppercase">{itemInfo?.expiryDate ? formatDateReadable(itemInfo.expiryDate) : 'NO EXP'}</span>
                             </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                             <div className="flex items-center gap-1">
                                <UserIcon size={10} className="text-red-600" />
                                <span className="text-[8px] font-black text-slate-900 uppercase">{log.user || 'SYS'}</span>
                             </div>
                             <div className="flex items-center gap-1 max-w-[60%]">
                                <Info size={10} className="text-slate-300" />
                                <span className="text-[8px] font-bold text-slate-400 italic truncate">{log.recipient || log.note || '-'}</span>
                             </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="py-12 text-center text-slate-300 italic text-[9px] font-black uppercase">No Activity</div>
                    )}
                  </div>
                )}
                </div>

                {currentUser.role === 'Admin' && (
                  <div className="m-4 p-4 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
                    <h4 className="text-[8px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <Settings2 size={12} className="text-blue-600" /> Admin Tools
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-400 uppercase block ml-1">Safety</label>
                        <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black outline-none" value={manageForm.safetyStock} onChange={(e) => setManageForm({...manageForm, safetyStock: parseInt(e.target.value) || 0})}/>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-400 uppercase block ml-1">Adjust (+/-)</label>
                        <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black outline-none" value={manageForm.adjustQty} onChange={(e) => setManageForm({...manageForm, adjustQty: parseFloat(e.target.value) || 0})}/>
                      </div>
                    </div>

                    {manageForm.adjustQty !== 0 && (
                      <input type="text" placeholder="Reason..." className="w-full px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-[10px] font-bold outline-none" value={manageForm.adjustNote} onChange={(e) => setManageForm({...manageForm, adjustNote: e.target.value})} />
                    )}

                    <button onClick={handleAdminUpdate} disabled={isAdminSubmitting} className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
                      {isAdminSubmitting ? <RefreshCw className="animate-spin" size={12} /> : <ShieldCheck size={14} />} SAVE CHANGES
                    </button>
                  </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <button onClick={() => setSelectedProduct(null)} className="w-full py-3 bg-slate-950 text-white rounded-xl font-black uppercase text-[9px] tracking-widest">TUTUP</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
