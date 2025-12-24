
import React, { useState, useRef, useEffect } from 'react';
import { Product, StockItem, ItemStatus, LabelData } from '../types';
import LabelPreview from './LabelPreview';
import { Printer, X, Tag, CheckCircle, Download, RefreshCw, FileImage, FileCode, Settings, Info, Zap } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { toJpeg } from 'html-to-image';

interface LabelGeneratorProps {
  products: Product[];
  stock: StockItem[];
  onAddStock: (items: StockItem[]) => void;
}

const LabelGenerator: React.FC<LabelGeneratorProps> = ({ products, stock, onAddStock }) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [supplier, setSupplier] = useState<string>('');
  const [batchCode, setBatchCode] = useState<string>(''); 
  const [itemCount, setItemCount] = useState<number | ''>(1);
  const [quantityPerItem, setQuantityPerItem] = useState<number | ''>('');
  const [arrivalDate, setArrivalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [generatedItemsForPrint, setGeneratedItemsForPrint] = useState<StockItem[]>([]);
  const [showPrintView, setShowPrintView] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const generateAutoBatch = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const datePart = `${day}${month}${year}`;
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${datePart}DP${random}`;
  };

  const handleGenerate = () => {
    const qtyPerSticker = Number(quantityPerItem);
    const numStickers = Number(itemCount);

    if (!selectedProductId || numStickers <= 0 || qtyPerSticker <= 0 || !supplier) {
      alert("Mohon isi data wajib: Produk, Supplier, Jml Stiker, & Isi/Stiker");
      return;
    }

    const dateInStr = arrivalDate.replace(/-/g, '');
    const dateExpStr = expiryDate ? expiryDate.replace(/-/g, '') : 'NOEXP';
    
    // Auto generate if empty with the new DDMMYYDP&XXX format
    const finalBatchCode = batchCode.trim() || generateAutoBatch();
    const cleanBatch = finalBatchCode.replace(/[^a-zA-Z0-9&]/g, '').toUpperCase();
    
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const batchId = `${selectedProductId}-${cleanBatch}-${dateInStr}-${dateExpStr}-${randomSuffix}`;
    const totalQuantity = numStickers * qtyPerSticker;

    const batchItem: StockItem = {
      uniqueId: batchId,
      productId: selectedProductId,
      productName: selectedProduct?.name || 'Unknown',
      batchCode: finalBatchCode,
      arrivalDate,
      expiryDate,
      supplier,
      status: ItemStatus.CREATED,
      createdAt: Date.now(),
      quantity: totalQuantity,
    };

    const printList: StockItem[] = Array(numStickers).fill(null).map((_, i) => ({
      ...batchItem,
      quantity: qtyPerSticker 
    }));

    setGeneratedItemsForPrint(printList);
    onAddStock([batchItem]);
    setShowPrintView(true);
  };

  const generateZPL = (item: StockItem) => {
    const prod = products.find(p => p.id === item.productId);
    const name = prod?.name || 'Unknown';
    const id = item.uniqueId;
    const batch = item.batchCode || '-';
    const supp = item.supplier || '-';
    const arrival = item.arrivalDate;
    const expiry = item.expiryDate || 'NO EXPIRY';

    return `
^XA
^PW812
^LL568
^CI28
^FO50,40^A0N,50,50^FB712,1,0,C^FD${name.toUpperCase()}^FS
^FO50,100^A0N,30,30^FB712,1,0,C^FD(BATCH: ${batch.toUpperCase()})^FS
^FO50,140^GB712,3,3^FS
^FO60,180^BQN,2,10^FDMM,A${id}^FS
^FO350,190^A0N,32,32^FDID    : ${id}^FS
^FO350,240^A0N,30,30^FDSUPP  : ${supp.toUpperCase()}^FS
^FO350,290^A0N,30,30^FDDATE  : ${arrival}^FS
^FO350,340^A0N,30,30^FDEXP   : ${expiry}^FS
^FO50,450^GB712,3,3^FS
^FO50,470^A0N,30,30^FB712,1,0,C^FDVERIFIED SIGNATURE^FS
^FO306,540^GB200,1,1^FS
^XZ`.trim();
  };

  const handleDirectPrint = async () => {
    if (generatedItemsForPrint.length === 0) return;
    setIsDirectPrinting(true);
    
    try {
      const allZpl = generatedItemsForPrint.map(item => generateZPL(item)).join('\n');
      const tryFetch = async (url: string) => {
        return fetch(url, {
          method: 'POST',
          mode: 'cors',
          body: JSON.stringify({
            device: { name: 'Zebra' },
            data: allZpl
          })
        });
      };

      try {
        const response = await tryFetch('https://localhost:9101/write');
        if (!response.ok) throw new Error("Gagal kirim ke 9101");
        alert("Data berhasil dikirim ke printer Zebra!");
      } catch (e) {
        const response = await tryFetch('http://localhost:9100/write');
        if (!response.ok) throw new Error("Gagal kirim ke 9100");
        alert("Data berhasil dikirim ke printer Zebra (via HTTP 9100)!");
      }

    } catch (err) {
      alert("Zebra Browser Print tidak terdeteksi!\n\nPastikan:\n1. Software 'Zebra Browser Print' sudah aktif.\n2. Printer Zebra sudah terhubung ke PC.\n3. Jika menggunakan browser Chrome/Edge, izinkan akses ke localhost.");
      console.error(err);
    } finally {
      setIsDirectPrinting(false);
    }
  };

  const downloadZPLFile = () => {
    if (generatedItemsForPrint.length === 0) return;
    const zplContent = generatedItemsForPrint.map(item => generateZPL(item)).join('\n');
    const blob = new Blob([zplContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Labels_Zebra_${generatedItemsForPrint[0].uniqueId}.zpl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const saveSingleLabelAsJpg = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    const target = element.querySelector('.label-content-capture') as HTMLElement;
    if (!target) return;

    try {
      const dataUrl = await toJpeg(target, { quality: 1, pixelRatio: 3, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `${filename}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Gagal save JPG", err);
    }
  };

  const saveAllAsJpg = async () => {
    if (generatedItemsForPrint.length === 0 || isSavingAll) return;
    setIsSavingAll(true);
    try {
      for (let i = 0; i < generatedItemsForPrint.length; i++) {
        const item = generatedItemsForPrint[i];
        const elementId = `label-print-${i}`;
        const filename = `${item.uniqueId}_${i + 1}`;
        await saveSingleLabelAsJpg(elementId, filename);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  const getProduct = (id: string) => products.find(p => p.id === id);

  if (showPrintView) {
    return (
      <div className="bg-slate-100 min-h-screen">
        <div className="no-print p-4 bg-white shadow-md flex flex-col md:flex-row justify-between items-center sticky top-0 z-50 border-b border-slate-100 gap-4">
          <div className="flex flex-col">
             <h2 className="font-black text-base text-slate-800 uppercase tracking-tight">Cetak Label Zebra ({generatedItemsForPrint.length})</h2>
             <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 uppercase tracking-widest">
               <Zap className="w-3 h-3 fill-red-600" /> Direct Printing Ready
             </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleDirectPrint} disabled={isDirectPrinting} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[11px] uppercase tracking-widest active:scale-95 shadow-xl transition-all border-2 border-red-500">
              {isDirectPrinting ? <RefreshCw className="animate-spin" size={16} /> : <Printer size={18} />}
              DIRECT PRINT ZEBRA
            </button>
            <button onClick={downloadZPLFile} className="bg-slate-900 hover:bg-black text-white px-5 py-3 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-xl transition-all">
              <FileCode size={16} className="text-red-500" /> DOWNLOAD ZPL
            </button>
            <button onClick={saveAllAsJpg} disabled={isSavingAll} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg disabled:opacity-50 transition-all">
              {isSavingAll ? <RefreshCw className="animate-spin" size={16} /> : <FileImage size={16} />}
              JPG
            </button>
            <button onClick={() => { setShowPrintView(false); setGeneratedItemsForPrint([]); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 py-3 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
              BATAL
            </button>
          </div>
        </div>
        
        <div ref={printRef} className="p-10 flex flex-col gap-10 items-center print:p-0 print:block thermal-print-container bg-slate-100 print:bg-white min-h-screen">
          {generatedItemsForPrint.map((item, idx) => {
             const prod = getProduct(item.productId);
             const labelData: LabelData = {
               item: { 
                 name: prod?.name || 'Unknown', 
                 code: item.uniqueId, 
                 batchCode: item.batchCode, 
                 quantity: item.quantity, 
                 unit: prod?.unit || '' 
               },
               supplier: item.supplier, 
               arrivalDate: item.arrivalDate, 
               expiryDate: item.expiryDate
             };
             return (
               <div key={`${item.uniqueId}-${idx}`} id={`label-print-${idx}`} className="print:block print:w-[10cm] print:h-[7cm] print:m-0 print:p-0 relative group bg-white shadow-2xl print:shadow-none p-0 border border-slate-200 print:border-none">
                 <div className="label-content-capture inline-block bg-white">
                    <LabelPreview data={labelData} scale={1} />
                 </div>
                 <div className="no-print absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => saveSingleLabelAsJpg(`label-print-${idx}`, `${item.uniqueId}_${idx + 1}`)} className="p-3 bg-emerald-600 text-white rounded-full shadow-xl hover:bg-emerald-700 active:scale-90 transition-all"><Download size={18} /></button>
                 </div>
               </div>
             );
          })}
        </div>
        <style>{`
          @media print {
            .thermal-print-container { padding: 0 !important; margin: 0 !important; display: block !important; background: white !important; }
            body { margin: 0 !important; padding: 0 !important; background: white !important; }
            @page { size: 10cm 7cm; margin: 0mm !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="p-5 bg-white rounded-[2.5rem] shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
          <Tag className="w-5 h-5 text-red-600" /> Registrasi & Labeling
        </h2>
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl">
            <Settings size={14} className="text-slate-400" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Printer: Zebra (ZPL Mode)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <SearchableSelect label="Produk *" options={products} value={selectedProductId} onChange={setSelectedProductId} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest ml-1">Supplier *</label>
              <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-[11px] outline-none focus:ring-1 focus:ring-red-500 shadow-inner" placeholder="Pemasok..." value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest ml-1">Batch / Lot (Opsional)</label>
              <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold text-[11px] uppercase outline-none focus:ring-1 focus:ring-red-500 shadow-inner" placeholder="Auto Generate jika kosong..." value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest ml-1">Arrival Date *</label>
              <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-red-500 shadow-inner" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest ml-1">Expiry Date</label>
              <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-red-500 shadow-inner" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:col-span-2">
             <div className="relative">
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest ml-1">Isi per Unit ({selectedProduct?.unit})</label>
                <input type="number" step="0.01" className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-[14px] text-red-600 outline-none focus:ring-2 focus:ring-red-500/10 shadow-sm" value={quantityPerItem} onChange={(e) => setQuantityPerItem(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" />
             </div>
             <div className="relative">
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5 tracking-widest ml-1">Jumlah Label</label>
                <input type="number" min="1" className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-[14px] text-slate-900 outline-none focus:ring-2 focus:ring-red-500/10 shadow-sm" value={itemCount} onChange={(e) => setItemCount(e.target.value === '' ? '' : parseInt(e.target.value))} placeholder="1" />
             </div>
        </div>

        <div className="md:col-span-2 bg-slate-900 p-6 rounded-[2rem] flex justify-between items-center text-white shadow-xl shadow-slate-900/10 border border-white/5">
             <div className="flex flex-col">
                <span className="font-black uppercase tracking-widest text-[8px] text-slate-500 mb-1">Estimasi Volume Batch:</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{itemCount || 0} label x {quantityPerItem || 0} {selectedProduct?.unit}</span>
             </div>
             <span className="font-black text-2xl text-white">{((Number(itemCount) || 0) * (Number(quantityPerItem) || 0)).toLocaleString()} <small className="text-xs uppercase text-slate-400 ml-1">{selectedProduct?.unit}</small></span>
        </div>

        <div className="md:col-span-2 pt-2">
          <button onClick={handleGenerate} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-red-900/20 active:scale-95 text-[12px] uppercase tracking-[0.2em] flex items-center justify-center gap-3">
            <Printer size={20} /> CETAK {itemCount || 0} STIKER
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabelGenerator;
