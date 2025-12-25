import { createClient } from '@supabase/supabase-js';
import { StockItem, LogEntry, Product, InventorySummary, User, ItemStatus, OpnameRequest } from '../types';

const SUPABASE_URL = "https://rvddbgirgevteifjjjud.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_s4U5py44CncLoJmNOPxFKA_JHACcSlQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const db = {
  login: async (user: string, pass: string): Promise<{success: boolean, user?: User, message?: string}> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', user)
        .eq('password', pass)
        .single();

      if (error || !data) return { success: false, message: "Username atau Password salah." };
      
      // Update presence immediately on login
      await supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('username', user);

      return { 
        success: true, 
        user: { username: data.username, role: data.role as 'Admin' | 'User' } 
      };
    } catch (e) {
      return { success: false, message: "Koneksi database gagal." };
    }
  },

  updatePresence: async (username: string): Promise<void> => {
    await supabase
      .from('users')
      .update({ last_seen: new Date().toISOString() })
      .eq('username', username);
  },

  getOnlineUsers: async (): Promise<{username: string, role: string}[]> => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('users')
      .select('username, role')
      .gt('last_seen', fiveMinutesAgo);
    
    if (error) return [];
    return data || [];
  },

  verifyPassword: async (username: string, pass: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .eq('password', pass)
      .single();
    return !!data && !error;
  },

  getProducts: async (): Promise<Product[]> => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) return [];
    return data.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      initialStock: item.initial_stock,
      safetyStock: item.safety_stock,
      stockToday: item.stock || 0
    }));
  },

  upsertProduct: async (product: Product): Promise<void> => {
    const payload = {
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      initial_stock: product.initialStock || 0,
      safety_stock: product.safetyStock || 0,
      stock: product.stockToday || 0
    };
    const { error } = await supabase.from('products').upsert(payload);
    if (error) throw error;
  },

  updateProductBalance: async (productName: string, qtyChange: number): Promise<void> => {
    const { data: prod, error: fetchErr } = await supabase
      .from('products')
      .select('id, stock')
      .eq('name', productName)
      .single();

    if (fetchErr || !prod) return;

    const newStock = (prod.stock || 0) + qtyChange;
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', prod.id);

    if (updateErr) throw updateErr;
  },

  recalculateProductStock: async (productId: string): Promise<void> => {
    const { data: product, error: pErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();
    
    if (pErr || !product) return;

    const { data: logs, error: lErr } = await supabase
      .from('logs')
      .select('quantity_change')
      .eq('product_name', product.name);

    if (lErr) throw lErr;

    const totalMutation = (logs || []).reduce((acc, l) => acc + (Number(l.quantity_change) || 0), 0);
    const correctStock = (Number(product.initial_stock) || 0) + totalMutation;

    const { error: uErr } = await supabase
      .from('products')
      .update({ stock: correctStock })
      .eq('id', productId);
      
    if (uErr) throw uErr;
  },

  deleteProduct: async (productId: string): Promise<void> => {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
  },

  getAllStock: async (): Promise<StockItem[]> => {
    const { data, error } = await supabase
      .from('stock_items')
      .select('*')
      .order('created_at_ts', { ascending: false });

    if (error) return [];
    return data.map(s => ({
      id: s.id, 
      uniqueId: s.unique_id, 
      productId: s.product_id,
      productName: s.product_name,
      batchCode: s.batch_code,
      arrivalDate: s.arrival_date,
      expiryDate: s.expiry_date,
      supplier: s.supplier,
      status: s.status as ItemStatus,
      createdAt: s.created_at_ts,
      quantity: s.quantity,
      note: s.note // Map kolom note dari database
    }));
  },

  getAllLogs: async (): Promise<LogEntry[]> => {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(30);

    if (error) return [];
    // Correct mapping from raw database rows to camelCase LogEntry interface
    return data.map(l => ({
      id: l.id,
      type: l.type,
      stockItemId: l.stock_item_id,
      productName: l.product_name,
      timestamp: l.timestamp,
      recipient: l.recipient,
      note: l.note,
      quantityChange: Number(l.quantity_change) || 0,
      user: l.user
    }));
  },

  addStockItems: async (items: StockItem[]): Promise<void> => {
    for (const item of items) {
      const { data: existing } = await supabase
        .from('stock_items')
        .select('quantity, status')
        .eq('unique_id', item.uniqueId)
        .single();

      if (existing) {
        await supabase
          .from('stock_items')
          .update({ 
            quantity: (Number(existing.quantity) || 0) + item.quantity,
            status: item.status, 
            arrival_date: item.arrivalDate,
            expiry_date: item.expiryDate || null,
            supplier: item.supplier,
            note: item.note || null // Update keterangan jika ada
          })
          .eq('unique_id', item.uniqueId);
      } else {
        const payload = {
          unique_id: item.uniqueId,
          product_id: item.productId,
          product_name: item.productName,
          batch_code: item.batchCode || null,
          arrival_date: item.arrivalDate,
          expiry_date: item.expiryDate || null,
          supplier: item.supplier,
          status: item.status,
          created_at_ts: item.createdAt,
          quantity: item.quantity,
          note: item.note || null // Simpan keterangan saat insert baru
        };
        await supabase.from('stock_items').insert(payload);
      }
    }
  },

  updateStockItem: async (item: StockItem): Promise<void> => {
    const { error } = await supabase
      .from('stock_items')
      .update({ 
        status: item.status,
        quantity: item.quantity,
        note: item.note // Pastikan note juga bisa diupdate
      })
      .eq('unique_id', item.uniqueId);
    if (error) throw error;
  },

  addLogEntries: async (logs: LogEntry[]): Promise<void> => {
    const payload = logs.map(l => ({
      id: l.id,
      type: l.type,
      stock_item_id: l.stockItemId,
      // Fix line 244: Map from camelCase LogEntry.productName to database column product_name
      product_name: l.productName,
      timestamp: l.timestamp,
      recipient: l.recipient,
      note: l.note,
      quantity_change: l.quantityChange,
      user: l.user
    }));

    const { error } = await supabase.from('logs').insert(payload);
    if (error) throw error;

    for (const log of logs) {
       if (log.quantityChange !== undefined && log.quantityChange !== 0) {
          await db.updateProductBalance(log.productName, log.quantityChange);
       }
    }
  },

  getOpnameRequests: async (): Promise<OpnameRequest[]> => {
    const { data, error } = await supabase
      .from('opname_requests')
      .select('*')
      .order('submitted_at', { ascending: false });
    
    if (error) return [];
    return data.map(r => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      batchCode: r.batch_code,
      systemQty: r.system_qty,
      physicalQty: r.physical_qty,
      variance: r.variance,
      note: r.note,
      isInitialStockAdjustment: r.is_initial_adj,
      referenceDate: r.reference_date,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at,
      status: r.status
    }));
  },

  submitOpnameRequest: async (request: Partial<OpnameRequest>): Promise<void> => {
    const payload = {
      product_id: request.productId,
      product_name: request.productName,
      batch_code: request.batchCode,
      system_qty: request.systemQty,
      physical_qty: request.physicalQty,
      variance: request.variance,
      note: request.note,
      is_initial_adj: request.isInitialStockAdjustment,
      reference_date: request.referenceDate,
      submitted_by: request.submittedBy,
      submitted_at: Date.now(),
      status: 'PENDING'
    };
    const { error } = await supabase.from('opname_requests').insert(payload);
    if (error) throw error;
  },

  updateOpnameStatus: async (requestId: string, status: 'APPROVED' | 'REJECTED'): Promise<void> => {
    const { error } = await supabase
      .from('opname_requests')
      .update({ status })
      .eq('id', requestId);
    if (error) throw error;
  },

  updateInitialStock: async (productId: string, newInitialQty: number): Promise<void> => {
    const { error } = await supabase
      .from('products')
      .update({ initial_stock: newInitialQty })
      .eq('id', productId);
    if (error) throw error;
    await db.recalculateProductStock(productId);
  }
};