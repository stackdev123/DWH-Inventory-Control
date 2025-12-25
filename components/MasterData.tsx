
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Product, User } from '../types';
import { db } from '../services/database';
import { Plus, Search, Edit3, Trash2, X, Save, Database, RefreshCw, Lock, ShieldCheck, AlertCircle, Globe, Home, Building2 } from 'lucide-react';

interface MasterDataProps {
  products: Product[];
  currentUser: User;
  onRefresh: () => Promise<void>;
}

const MasterData: React.FC<MasterDataProps> = ({ products, currentUser, onRefresh }) => {
  const [filter, setFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [origin, setOrigin] = useState<'I' | 'E'>('I'); // Internal or External
  const [formData, setFormData] = useState<Partial<Product>>({
    id: '',
    name: '',
    category: 'Packaging',
    unit: 'Kg',
    initialStock: 0,
    safetyStock: 0
  });

  // Security Modal State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categories = ["Packaging", "Ingredients", "Chemical", "Other"];
  const units = ["Kg", "Pcs", "Roll", "Pack", "Karton", "Liter", "Lembar"];

  const getCategoryChar = (category: string) => {
    switch (category) {
      case 'Packaging': return 'P';
      case 'Ingredients': return 'I';
      case 'Chemical': return 'C';
      default: return 'O';
    }
  };

  const buildPrefix = (category: string, currentOrigin: 'I' | 'E') => {
    return `${getCategoryChar(category)}M${currentOrigin}`;
  };

  const generateNextId = useCallback((category: string, currentOrigin: 'I' | 'E') => {
    const prefix = buildPrefix(category, currentOrigin);
    const existingCodes = products
      .filter(p => p.id && p.id.startsWith(prefix))
      .map(p => {
        const numPart = p.id.replace(prefix, '');
        const parsed = parseInt(numPart, 10);
        return isNaN(parsed) ? 0 : parsed;
      });

    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }, [products]);

  // Auto-generate ID when category or origin changes if NOT editing
  useEffect(() => {
    if (!editingProduct && isModalOpen) {
      const newId = generateNextId(formData.category || 'Packaging', origin);
      setFormData(prev => ({ ...prev, id: newId }));
    }
  }, [formData.category, origin, editingProduct, isModalOpen, generateNextId]);

  const filteredProducts = useMemo(() => {
    const search = (filter || '').toLowerCase();
    return products.filter(p => 
      (p.name || '').toLowerCase().includes(search) || 
      (p.id || '').toLowerCase().includes(search) ||
      (p.category || '').toLowerCase().includes(search)
    );
  }, [products, filter]);

  const openAddModal = () => {
    setEditingProduct(null);
    setOrigin('I');
    const initialCategory = 'Packaging';
    const nextId = generateNextId(initialCategory, 'I');
    setFormData({ id: nextId, name: '', category: initialCategory, unit: 'Kg', initialStock: 0, safetyStock: 0 });
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    if (product.id && product.id.length >= 3) {
      setOrigin(product.id[2] as 'I' | 'E');
    }
    setFormData({ ...product });
    setIsModalOpen(true);
  };

  const handleVerifyAndDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteConfirmId || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const isValid = await db.verifyPassword(currentUser.username, deletePassword);
      if (!isValid) {
        setDeleteError("Password verifikasi salah.");
        setIsDeleting(false);
        return;
      }

      await db.deleteProduct(deleteConfirmId);
      await onRefresh();
      setDeleteConfirmId(null);
      setDeletePassword('');
    } catch (err) {
      setDeleteError("Gagal menghapus produk.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id || !formData.name) return;
    
    setIsSubmitting(true);
    try {
      await db.upsertProduct(formData as Product);
      await onRefresh();
      setIsModalOpen(false);
    } catch (err) {
      alert("Gagal menyimpan produk.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
           <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-sm w-full border border-slate-100">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                   <ShieldCheck size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-tight">Keamanan</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-4 leading-relaxed">
                  Masukkan password Anda untuk menghapus <span className="text-red-600">[{deleteConfirmId}]</span>.
                </p>
              </div>

              <form onSubmit={handleVerifyAndDelete} className="space-y-6">
                 <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="password" 
                      autoFocus
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 font-bold outline-none"
                      placeholder="Password..."
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                    />
                 </div>

                 {deleteError && (
                   <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[10px] font-bold uppercase">
                      <AlertCircle size={14} /> {deleteError}
                   </div>
                 )}

                 <div className="flex flex-col gap-3">
                    <button type="submit" disabled={isDeleting || !deletePassword} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      {isDeleting ? <RefreshCw className="animate-spin" size={16}/> : <Trash2 size={16}/>} KONFIRMASI
                    </button>
                    <button type="button" onClick={() => setDeleteConfirmId(null)} className="w-full py-3 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl">BATAL</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-lg w-full animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                {editingProduct ? 'Edit Master Produk' : 'Tambah Produk Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"><X /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Kategori</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Asal</label>
                   <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                      <button type="button" onClick={() => setOrigin('I')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 ${origin === 'I' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}><Home size={14} /> Internal</button>
                      <button type="button" onClick={() => setOrigin('E')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 ${origin === 'E' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}><Globe size={14} /> External</button>
                   </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">ID Produk (Auto)</label>
                <input type="text" readOnly className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-mono font-black uppercase text-red-600 cursor-not-allowed shadow-inner" value={formData.id}/>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Nama Produk *</label>
                <input type="text" autoFocus className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="Masukkan nama..." value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Satuan</label>
                  <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Safety Stock</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-red-600 outline-none" value={formData.safetyStock} onChange={e => setFormData({ ...formData, safetyStock: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="py-4 rounded-2xl border border-slate-200 text-slate-500 font-black uppercase text-xs">Batal</button>
                <button type="submit" disabled={isSubmitting} className="py-4 rounded-2xl bg-red-600 text-white font-black uppercase text-xs shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
                  {isSubmitting ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>} SIMPAN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Building2 size={120} />
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-200">
            <Database size={28} />
          </div>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">Master Produk</h2>
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md inline-block w-fit">BOUNTY SEGAR INDONESIA</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-1">
              Kelola database barang dengan penomoran otomatis
            </p>
          </div>
        </div>

        <div className="flex w-full md:w-auto gap-3 relative z-10">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari..." className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-red-500 transition-all" value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <button onClick={openAddModal} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 active:scale-95">
            <Plus size={18} /> Tambah
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
        <div className="overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-8 py-5">Kode</th>
                  <th className="px-8 py-5">Nama Produk</th>
                  <th className="px-8 py-5">Kategori</th>
                  <th className="px-8 py-5 text-center">Unit</th>
                  <th className="px-8 py-5 text-right">Safety Stock</th>
                  <th className="px-8 py-5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5 font-mono font-black text-red-600">{p.id}</td>
                    <td className="px-8 py-5 font-black text-slate-800 uppercase tracking-tight group-hover:text-red-600 transition-colors">{p.name}</td>
                    <td className="px-8 py-5">
                      <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[9px] font-black uppercase">{p.category}</span>
                    </td>
                    <td className="px-8 py-5 text-center font-bold text-slate-400 uppercase">{p.unit}</td>
                    <td className="px-8 py-5 text-right font-black text-red-600">{p.safetyStock?.toLocaleString()}</td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openEditModal(p)} className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit3 size={18} /></button>
                        <button onClick={() => setDeleteConfirmId(p.id)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile List View - Compact */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredProducts.map(p => (
              <div key={p.id} className="p-4 flex justify-between items-center active:bg-slate-50 transition-colors">
                <div className="flex flex-col min-w-0 pr-4" onClick={() => openEditModal(p)}>
                  <span className="text-[12px] font-black text-slate-800 uppercase truncate leading-tight">{p.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] font-mono font-bold text-red-600 uppercase tracking-widest">{p.id}</span>
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full">{p.category}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEditModal(p)} className="p-2 text-slate-300 hover:text-blue-600 transition-all"><Edit3 size={16} /></button>
                  <button onClick={() => setDeleteConfirmId(p.id)} className="p-2 text-slate-300 hover:text-red-600 transition-all"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="p-20 text-center text-slate-400 italic font-black uppercase tracking-widest opacity-20">Tidak ada produk ditemukan.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MasterData;
