
import React, { useMemo } from 'react';
import { Product, StockItem, LogEntry } from '../types';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Package, AlertTriangle, 
  Activity, ArrowUpRight, ArrowDownLeft, PieChart as PieIcon
} from 'lucide-react';

interface DashboardProps {
  products: Product[];
  stock: StockItem[];
  logs: LogEntry[];
}

const Dashboard: React.FC<DashboardProps> = ({ products, stock, logs }) => {
  const stats = useMemo(() => {
    const totalSKU = products.length;
    const lowStockItems = products.filter(p => (p.stockToday || 0) <= (p.safetyStock || 0)).length;
    
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(l => l.timestamp >= startOfDay);
    const todayIn = todayLogs.filter(l => l.type === 'IN').reduce((acc, l) => acc + (l.quantityChange || 0), 0);
    const todayOut = todayLogs.filter(l => l.type === 'OUT').reduce((acc, l) => acc + Math.abs(l.quantityChange || 0), 0);

    return { totalSKU, lowStockItems, todayIn, todayOut, todayTransCount: todayLogs.length };
  }, [products, logs]);

  const trendData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return last7Days.map(date => {
      const dayStart = new Date(date).setHours(0, 0, 0, 0);
      const dayEnd = new Date(date).setHours(23, 59, 59, 999);
      const dayLogs = logs.filter(l => l.timestamp >= dayStart && l.timestamp <= dayEnd);
      
      return {
        name: new Date(date).toLocaleDateString('id-ID', { weekday: 'short' }),
        masuk: dayLogs.filter(l => l.type === 'IN').reduce((acc, l) => acc + (l.quantityChange || 0), 0),
        keluar: dayLogs.filter(l => l.type === 'OUT').reduce((acc, l) => acc + Math.abs(l.quantityChange || 0), 0),
      };
    });
  }, [logs]);

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    products.forEach(p => {
      cats[p.category] = (cats[p.category] || 0) + (p.stockToday || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [products]);

  const COLORS = ['#ef4444', '#0f172a', '#3b82f6', '#10b981', '#f59e0b'];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Warehouse Analytics</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time data visualization of your inventory</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
            <Package size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total SKU</span>
            <span className="text-2xl font-black text-slate-900">{stats.totalSKU}</span>
          </div>
        </div>
        
        <div className={`p-5 rounded-[2rem] border shadow-sm flex flex-col gap-3 ${stats.lowStockItems > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${stats.lowStockItems > 0 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Stok Kritis</span>
            <span className={`text-2xl font-black ${stats.lowStockItems > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.lowStockItems}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <ArrowDownLeft size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Masuk Hari Ini</span>
            <span className="text-2xl font-black text-emerald-600">+{stats.todayIn.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
            <ArrowUpRight size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Keluar Hari Ini</span>
            <span className="text-2xl font-black text-red-600">-{stats.todayOut.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Activity size={16} className="text-red-600" /> Tren 7 Hari Terakhir
            </h3>
          </div>
          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold'}}
                />
                <Area type="monotone" dataKey="masuk" stroke="#10b981" fillOpacity={1} fill="url(#colorIn)" strokeWidth={3} />
                <Area type="monotone" dataKey="keluar" stroke="#ef4444" fillOpacity={1} fill="url(#colorOut)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <PieIcon size={16} className="text-red-600" /> Komposisi Stok
            </h3>
          </div>
          <div className="flex-1 w-full flex flex-col items-center min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
