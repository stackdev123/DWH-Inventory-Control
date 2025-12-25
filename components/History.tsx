
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LogEntry, Product, StockItem, OpnameRequest, User, ItemStatus } from '../types';
import { 
  Search, ArrowUpRight, ArrowDownLeft, RefreshCw, ShieldCheck, 
  Download, ChevronRight, ChevronDown, Calendar, 
  Tag, Info, FileText, FileSpreadsheet, ClipboardCheck, User as UserIcon, CheckCircle2, XCircle, Clock, Layers, FileImage, Filter
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { db } from '../services/database';
import { toJpeg } from 'html-to-image';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

interface HistoryProps {
  logs: LogEntry[];
  products: Product[];
  stock: StockItem[];
  currentUser: User;
  onRefresh?: () => Promise<void>;
  onAdjust?: (item: StockItem, newQty: number, note: string) => void;
}

const History: React.FC<HistoryProps> = ({ logs, products, stock, currentUser, onRefresh, onAdjust }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'stockCard' | 'report'>('all');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'CREATE' | 'ADJUST'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const reportRef = useRef<HTMLDivElement>(null);
  const reportExportRef = useRef<HTMLDivElement>(null);
  const stockCardRef = useRef<HTMLDivElement>(null);
  const stockCardExportRef = useRef<HTMLDivElement>(null);

  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current) return;
    try {
      const dataUrl = await toJpeg(ref.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `${filename}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download image', err);
    }
  };

  const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current) return;
    try {
      const dataUrl = await toJpeg(ref.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      
      const imgWidth = ref.current.offsetWidth;
      const imgHeight = ref.current.offsetHeight;
      
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'l' : 'p',
        unit: 'px',
        format: [imgWidth, imgHeight]
      });
      
      pdf.addImage(dataUrl, 'JPEG', 0, 0, imgWidth, imgHeight);
      pdf.save(`${filename}.pdf`);
    } catch (err) {
      console.error('Failed to download PDF', err);
    }
  };

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

  const filterStartTs = useMemo(() => new Date(startDate).setHours(0,0,0,0), [startDate]);
  const filterEndTs = useMemo(() => new Date(endDate).setHours(23,59,59,999), [endDate]);

  const productNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => map.set(p.name.toLowerCase().trim(), p.id));
    return map;
  }, [products]);

  const isMigrationLog = (log: LogEntry) => {
    const note = (log.note || '').toLowerCase();
    return log.stockItemId === 'SYSTEM-MIGRATION' || note.includes('migrasi:') || note.includes('konversi saldo lama');
  };

  const reportData = useMemo(() => {
    if (activeTab !== 'report') return [];
    const logsByProduct = new Map<string, LogEntry[]>();
    logs.forEach(l => {
      const pid = productNameToIdMap.get(l.productName.toLowerCase().trim());
      if (pid) {
        if (!logsByProduct.has(pid)) logsByProduct.set(pid, []);
        logsByProduct.get(pid)!.push(l);
      }
    });

    return [...products]
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      .map(prod => {
        const pLogs = logsByProduct.get(prod.id) || [];
        const openingStock = pLogs.filter(l => l.timestamp < filterStartTs).reduce((acc, l) => acc + (l.quantityChange || 0), prod.initialStock || 0);
        const inRange = pLogs.filter(l => l.timestamp >= filterStartTs && l.timestamp <= filterEndTs && (l.type === 'IN' || (l.type === 'ADJUST' && l.quantityChange! > 0) || l.type === 'CREATE')).reduce((acc, l) => acc + Math.abs(l.quantityChange || 0), 0);
        const outRange = pLogs.filter(l => l.timestamp >= filterStartTs && l.timestamp <= filterEndTs && (l.type === 'OUT' || (l.type === 'ADJUST' && l.quantityChange! < 0))).reduce((acc, l) => acc + Math.abs(l.quantityChange || 0), 0);
        const stockEnd = openingStock + inRange - outRange;
        return { code: prod.id, name: prod.name, uom: prod.unit, openingStock, inRange, outRange, stockEnd };
      });
  }, [activeTab, products, logs, productNameToIdMap, filterStartTs, filterEndTs]);

  const stockCardData = useMemo(() => {
    if (activeTab !== 'stockCard' || !selectedProductId) return null;
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return null;

    const targetName = prod.name.toLowerCase().trim();
    const pLogs = logs
      .filter(l => l.productName.toLowerCase().trim() === targetName && !isMigrationLog(l))
      .sort((a, b) => a.timestamp - b.timestamp);

    let runningBalance = Number(prod.initialStock) || 0;
    
    const historyWithBalance = pLogs.map(l => {
      runningBalance += (Number(l.quantityChange) || 0);
      return { ...l, balanceAfter: runningBalance };
    });

    const filteredMutations = historyWithBalance.filter(l => l.timestamp >= filterStartTs && l.timestamp <= filterEndTs);
    
    const openingBalanceVal = historyWithBalance
      .filter(l => l.timestamp < filterStartTs)
      .reduce((acc, l) => acc + (Number(l.quantityChange) || 0), Number(prod.initialStock) || 0);

    return {
      openingBalance: openingBalanceVal,
      mutations: filteredMutations
    };
  }, [activeTab, selectedProductId, logs, products, filterStartTs, filterEndTs]);

  const filteredLogs = useMemo(() => {
    const search = (searchTerm || '').toLowerCase();
    return logs.filter(l => {
      if (isMigrationLog(l)) return false;
      const matchSearch = (l.productName || '').toLowerCase().includes(search) || 
                         (l.recipient && l.recipient.toLowerCase().includes(search)) ||
                         (l.user && l.user.toLowerCase().includes(search));
      const matchDate = l.timestamp >= filterStartTs && l.timestamp <= filterEndTs;
      const matchType = typeFilter === 'ALL' || l.type === typeFilter;
      return matchSearch && matchDate && matchType;
    });
  }, [logs, searchTerm, filterStartTs, filterEndTs, typeFilter]);

  const formatDateTimeFull = (ts: any) => {
    if (!ts) return "-";
    const d = new Date(Number(ts));
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const downloadStockCardExcel = () => {
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod || !stockCardData) return;
    
    const data = [
      { 'Waktu': '-', 'Tipe': 'SALDO AWAL', 'Keterangan': 'Saldo Sebelum Periode', 'Mutasi': 0, 'Saldo Akhir': stockCardData.openingBalance, 'Petugas': '-' },
      ...stockCardData.mutations.map(l => {
        const itemInfo = stock.find(s => s.uniqueId === l.stockItemId);
        const extraInfo = itemInfo ? ` [Batch: ${itemInfo.batchCode || '-'}, In: ${itemInfo.arrivalDate}, Exp: ${itemInfo.expiryDate || '-'}]` : '';
        return {
          'Waktu': formatDateTimeFull(l.timestamp),
          'Tipe': l.type,
          'Penerima/Note': (l.recipient || l.note || '-') + extraInfo,
          'Mutasi': l.quantityChange,
          'Saldo Akhir': l.balanceAfter,
          'Petugas': l.user || '-'
        };
      })
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kartu Stok");
    XLSX.writeFile(workbook, `Kartu_Stok_${prod.id}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadRekapExcel = () => {
    const data = reportData.map(r => ({
      'Kode': r.code,
      'Nama Produk': r.name,
      'UOM': r.uom,
      'Stok Awal': r.openingStock,
      'Masuk': r.inRange,
      'Keluar': r.outRange,
      'Stok Akhir': r.stockEnd
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Mutasi");
    XLSX.writeFile(workbook, `Rekap_Mutasi_${startDate}_ke_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('all')} className={`flex-1 min-w-[100px] px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'all' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Buku Mutasi</button>
          <button onClick={() => setActiveTab('stockCard')} className={`flex-1 min-w-[100px] px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'stockCard' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Kartu Stok</button>
          <button onClick={() => setActiveTab('report')} className={`flex-1 min-w-[100px] px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'report' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Rekap Mutasi</button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Dari Tanggal</label>
                <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Sampai Tanggal</label>
                <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
          </div>
          <div className="flex flex-col gap-3">
              {activeTab === 'stockCard' && (
                <div className="flex flex-col">
                  <SearchableSelect label="Pilih Produk Kartu Stok (Semua Kategori)" options={products} value={selectedProductId} onChange={setSelectedProductId} placeholder="Ketik Kode atau Nama Produk..." />
                </div>
              )}
              {activeTab !== 'stockCard' && (
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="Cari nama barang atau petugas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-[11px] font-bold outline-none bg-slate-50 focus:ring-1 focus:ring-red-500" />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl items-center gap-1 overflow-x-auto no-scrollbar">
                        <Filter size={12} className="text-slate-400 mx-2 flex-shrink-0" />
                        {(['ALL', 'IN', 'OUT', 'CREATE', 'ADJUST'] as const).map(type => (
                          <button 
                            key={type}
                            onClick={() => setTypeFilter(type)}
                            className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all whitespace-nowrap ${typeFilter === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {type === 'ALL' ? 'Semua' : type === 'IN' ? 'Masuk' : type === 'OUT' ? 'Keluar' : type === 'CREATE' ? 'Regis' : 'Adj'}
                          </button>
                        ))}
                    </div>
                </div>
              )}
          </div>
      </div>

      {activeTab === 'report' ? (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
             <button onClick={downloadRekapExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-emerald-50">
                <FileSpreadsheet size={16} /> XLSX
             </button>
             <button onClick={() => handleDownloadImage(reportExportRef, `Rekap_Mutasi_${startDate}_${endDate}`)} className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-slate-200">
                <FileImage size={16} /> JPG
             </button>
             <button onClick={() => handleDownloadPDF(reportExportRef, `Rekap_Mutasi_${startDate}_${endDate}`)} className="bg-red-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-red-900/20">
                <FileText size={16} /> PDF
             </button>
          </div>
          
          <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}>
            <div ref={reportExportRef} className="bg-white p-12 w-[1000px] border border-slate-200">
               <div className="text-center mb-8">
                  <h2 className="text-3xl font-black uppercase tracking-tighter">Rekapitulasi Mutasi Barang</h2>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Periode: {startDate} s/d {endDate}</p>
               </div>
               <table className="w-full text-center text-xs border-collapse border border-slate-900">
                    <thead>
                      <tr className="bg-slate-50 font-black text-slate-900 border-b-2 border-slate-900 uppercase">
                        <th className="border border-slate-900 px-4 py-4 w-[100px]">Kode</th>
                        <th className="border border-slate-900 px-4 py-4 text-left">Produk</th>
                        <th className="border border-slate-900 px-4 py-4 w-[80px]">Unit</th>
                        <th className="border border-slate-900 px-4 py-4 w-[120px]">Opening</th>
                        <th className="border border-slate-900 px-4 py-4 w-[120px]">In</th>
                        <th className="border border-slate-900 px-4 py-4 w-[120px]">Out</th>
                        <th className="border border-slate-900 px-4 py-4 w-[130px] bg-slate-50">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                          <tr key={row.code}>
                            <td className="border border-slate-900 px-4 py-3 font-mono font-bold">{row.code}</td>
                            <td className="border border-slate-900 px-4 py-3 text-left font-black uppercase truncate">{row.name}</td>
                            <td className="border border-slate-900 px-4 py-3 font-bold text-slate-400">{row.uom}</td>
                            <td className="border border-slate-900 px-4 py-3 font-black">{row.openingStock.toLocaleString()}</td>
                            <td className="border border-slate-900 px-4 py-3 font-black text-emerald-600">{row.inRange > 0 ? row.inRange.toLocaleString() : '-'}</td>
                            <td className="border border-slate-900 px-4 py-3 font-black text-red-600">{row.outRange > 0 ? row.outRange.toLocaleString() : '-'}</td>
                            <td className="border border-slate-900 px-4 py-3 font-black bg-slate-50/50">{row.stockEnd.toLocaleString()}</td>
                          </tr>
                      ))}
                    </tbody>
               </table>
            </div>
          </div>

          <div ref={reportRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
             <div className="hidden md:block overflow-x-auto">
               <table className="w-full text-center text-[10px] border-collapse border border-slate-900 min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-50 font-black text-slate-900 border-b-2 border-slate-900 uppercase">
                        <th className="border border-slate-900 px-3 py-3 w-[80px]">Kode</th>
                        <th className="border border-slate-900 px-3 py-3 text-left">Produk</th>
                        <th className="border border-slate-900 px-3 py-3 w-[60px]">Unit</th>
                        <th className="border border-slate-900 px-3 py-3 w-[100px]">Opening</th>
                        <th className="border border-slate-900 px-3 py-3 w-[100px]">In</th>
                        <th className="border border-slate-900 px-3 py-3 w-[100px]">Out</th>
                        <th className="border border-slate-900 px-3 py-3 w-[110px] bg-slate-50">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row) => (
                          <tr key={row.code} className="hover:bg-slate-50 transition-colors">
                            <td className="border border-slate-900 px-3 py-2.5 font-mono font-bold">{row.code}</td>
                            <td className="border border-slate-900 px-3 py-2.5 text-left font-black uppercase truncate">{row.name}</td>
                            <td className="border border-slate-900 px-3 py-2.5 font-bold text-slate-400">{row.uom}</td>
                            <td className="border border-slate-900 px-3 py-2.5 font-black">{row.openingStock.toLocaleString()}</td>
                            <td className="border border-slate-900 px-3 py-2.5 font-black text-emerald-600">{row.inRange > 0 ? row.inRange.toLocaleString() : '-'}</td>
                            <td className="border border-slate-900 px-3 py-2.5 font-black text-red-600">{row.outRange > 0 ? row.outRange.toLocaleString() : '-'}</td>
                            <td className="border border-slate-900 px-3 py-2.5 font-black bg-slate-50/50">{row.stockEnd.toLocaleString()}</td>
                          </tr>
                      ))}
                    </tbody>
               </table>
             </div>
             <div className="md:hidden divide-y divide-slate-100">
                {reportData.map((row) => (
                  <div key={row.code} className="py-4 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[11px] font-black text-slate-900 uppercase truncate leading-tight">{row.name}</span>
                        <span className="text-[8px] font-mono font-bold text-red-600 uppercase tracking-widest mt-1">{row.code}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-black text-slate-900">{row.stockEnd.toLocaleString()}</div>
                        <div className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">{row.uom}</div>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      ) : activeTab === 'stockCard' ? (
        <div className="space-y-4">
           <div className="flex justify-end gap-2">
              <button onClick={downloadStockCardExcel} disabled={!selectedProductId} className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-emerald-50 disabled:opacity-50">
                <FileSpreadsheet size={16} /> XLSX
              </button>
              <button onClick={() => handleDownloadImage(stockCardExportRef, `Kartu_Stok_${selectedProductId}`)} disabled={!selectedProductId} className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-slate-200 disabled:opacity-50">
                <FileImage size={16} /> JPG
              </button>
              <button onClick={() => handleDownloadPDF(stockCardExportRef, `Kartu_Stok_${selectedProductId}`)} disabled={!selectedProductId} className="bg-red-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-red-900/20 disabled:opacity-50">
                <FileText size={16} /> PDF
              </button>
           </div>
           
           <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}>
              <div ref={stockCardExportRef} className="bg-white p-12 w-[1100px] border border-slate-200">
                {selectedProductId && stockCardData && (
                  <>
                    <div className="text-center mb-8">
                      <h2 className="text-3xl font-black uppercase tracking-tighter">Kartu Stok Barang</h2>
                      <p className="text-xl font-black text-red-600 uppercase tracking-widest mt-2">{products.find(p => p.id === selectedProductId)?.name}</p>
                    </div>
                    <table className="w-full text-left text-xs border-collapse border border-slate-200">
                      <thead className="bg-slate-50 text-slate-900 font-black uppercase tracking-widest border-b-2 border-slate-900">
                        <tr>
                          <th className="px-5 py-4 border border-slate-200">Waktu</th>
                          <th className="px-5 py-4 border border-slate-200 text-center">Tipe</th>
                          <th className="px-5 py-4 border border-slate-200">Keterangan</th>
                          <th className="px-5 py-4 border border-slate-200 text-right">Mutasi</th>
                          <th className="px-5 py-4 border border-slate-200 text-right bg-slate-100">Saldo Akhir</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-blue-50/30">
                          <td className="px-5 py-3 border border-slate-200 font-bold text-slate-400 italic">-</td>
                          <td className="px-5 py-3 border border-slate-200 text-center"><span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border bg-blue-50 text-blue-600 border-blue-100">SALDO AWAL</span></td>
                          <td className="px-5 py-3 border border-slate-200 text-slate-400 font-bold italic">Akumulasi sebelum {startDate}</td>
                          <td className="px-5 py-3 border border-slate-200 text-right font-black text-slate-300">-</td>
                          <td className="px-5 py-3 border border-slate-200 text-right font-black bg-blue-50/50">{stockCardData.openingBalance?.toLocaleString()}</td>
                        </tr>
                        {stockCardData.mutations.map((log) => {
                          const itemInfo = stock.find(s => s.uniqueId === log.stockItemId);
                          return (
                            <tr key={log.id}>
                              <td className="px-5 py-3 border border-slate-200 font-bold text-slate-500">{formatDateTimeFull(log.timestamp)}</td>
                              <td className="px-5 py-3 border border-slate-200 text-center">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${log.type === 'IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : log.type === 'OUT' ? 'bg-red-50 text-red-600 border-red-100' : log.type === 'CREATE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                  {log.type}
                                </span>
                              </td>
                              <td className="px-5 py-3 border border-slate-200 text-slate-600 font-bold">
                                <div>{log.recipient ? `Penerima: ${log.recipient}` : log.note || '-'}</div>
                                {itemInfo && <div className="text-[10px] text-slate-400 font-normal mt-0.5">Batch: {itemInfo.batchCode || '-'} • In: {itemInfo.arrivalDate} {itemInfo.expiryDate ? `• Exp: ${itemInfo.expiryDate}` : ''}</div>}
                              </td>
                              <td className={`px-5 py-3 border border-slate-200 text-right font-black ${Number(log.quantityChange)! > 0 ? 'text-emerald-600' : Number(log.quantityChange)! < 0 ? 'text-red-600' : 'text-slate-400'}`}>{Number(log.quantityChange)! > 0 ? `+${log.quantityChange.toLocaleString()}` : log.quantityChange === 0 ? '0' : log.quantityChange?.toLocaleString()}</td>
                              <td className="px-5 py-3 border border-slate-200 text-right font-black bg-slate-50">{log.balanceAfter?.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
           </div>

           <div ref={stockCardRef} className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden p-6">
              {selectedProductId && stockCardData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse min-w-[600px] border border-slate-200">
                    <thead className="bg-slate-50 text-slate-900 font-black uppercase text-[9px] tracking-widest border-b-2 border-slate-900">
                      <tr>
                        <th className="px-4 py-3 border border-slate-200">Waktu</th>
                        <th className="px-4 py-3 border border-slate-200 text-center">Tipe</th>
                        <th className="px-4 py-3 border border-slate-200">Keterangan</th>
                        <th className="px-4 py-3 border border-slate-200 text-right">Mutasi</th>
                        <th className="px-4 py-3 border border-slate-200 text-right bg-slate-100">Saldo Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-blue-50/30">
                        <td className="px-4 py-3 border border-slate-200 font-bold text-slate-400 italic">-</td>
                        <td className="px-4 py-3 border border-slate-200 text-center"><span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border bg-blue-50 text-blue-600 border-blue-100">SALDO AWAL</span></td>
                        <td className="px-4 py-3 border border-slate-200 text-slate-400 font-bold italic">Saldo s/d {startDate}</td>
                        <td className="px-4 py-3 border border-slate-200 text-right font-black text-slate-300">-</td>
                        <td className="px-4 py-3 border border-slate-200 text-right font-black bg-blue-50/50">{stockCardData.openingBalance?.toLocaleString()}</td>
                      </tr>
                      {stockCardData.mutations.map((log) => {
                        const itemInfo = stock.find(s => s.uniqueId === log.stockItemId);
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 border border-slate-200 font-bold text-slate-500">{formatDateTimeFull(log.timestamp)}</td>
                            <td className="px-4 py-3 border border-slate-200 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${log.type === 'IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : log.type === 'OUT' ? 'bg-red-50 text-red-600 border-red-100' : log.type === 'CREATE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {log.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 border border-slate-200 text-slate-600 font-bold">
                              <div>{log.recipient ? `Penerima: ${log.recipient}` : log.note || '-'}</div>
                              {itemInfo && <div className="text-[9px] text-slate-400 font-normal mt-0.5">Batch: {itemInfo.batchCode || '-'} • In: {formatDateReadable(itemInfo.arrivalDate)} {itemInfo.expiryDate ? `• Exp: ${formatDateReadable(itemInfo.expiryDate)}` : ''}</div>}
                            </td>
                            <td className={`px-4 py-3 border border-slate-200 text-right font-black ${Number(log.quantityChange)! > 0 ? 'text-emerald-600' : Number(log.quantityChange)! < 0 ? 'text-red-600' : 'text-slate-400'}`}>{Number(log.quantityChange)! > 0 ? `+${log.quantityChange.toLocaleString()}` : log.quantityChange === 0 ? '0' : log.quantityChange?.toLocaleString()}</td>
                            <td className="px-4 py-3 border border-slate-200 text-right font-black bg-slate-50">{log.balanceAfter?.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-20 text-center text-slate-300 flex flex-col items-center gap-3">
                   <Tag size={40} className="opacity-20" />
                   <span className="font-black uppercase tracking-widest text-[10px]">Pilih produk kartu stok</span>
                </div>
              )}
           </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
             <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse min-w-[600px]">
                  <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[8px] tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Waktu</th>
                      <th className="px-6 py-4">Produk</th>
                      <th className="px-6 py-4 text-center">Tipe</th>
                      <th className="px-6 py-4 text-right">Mutasi</th>
                      <th className="px-6 py-4">Keterangan</th>
                      <th className="px-6 py-4">Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-400 whitespace-nowrap">{formatDateTimeFull(log.timestamp)}</td>
                        <td className="px-6 py-4 font-black text-slate-800 uppercase truncate">{log.productName}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${log.type === 'IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : log.type === 'OUT' ? 'bg-red-50 text-red-600 border-red-100' : log.type === 'CREATE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {log.type === 'CREATE' ? 'REGIS' : log.type}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-black ${Number(log.quantityChange)! > 0 ? 'text-emerald-600' : Number(log.quantityChange)! < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {Number(log.quantityChange)! > 0 ? `+${log.quantityChange.toLocaleString()}` : log.quantityChange === 0 ? '0' : log.quantityChange?.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-bold truncate max-w-[200px]">{log.note || '-'}</td>
                        <td className="px-6 py-4 text-slate-900 font-black uppercase text-[10px]">{log.user || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
        </div>
      )}
    </div>
  );
};

export default History;
