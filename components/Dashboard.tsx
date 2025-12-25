
import React, { useMemo } from 'react';
import { Product, StockItem, LogEntry } from '../types';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { 
  Package, AlertTriangle, 
  Activity, ArrowUpRight, ArrowDownLeft, PieChart as PieIcon,
  TrendingUp, Zap, Clock, ChevronRight
} from 'lucide-react';

interface DashboardProps {
  products: Product[];
  stock: StockItem[];
  logs: LogEntry[];
}

const Dashboard: React.FC<DashboardProps> = ({ products, stock, logs }) => {
  const stats = useMemo(() => {
    const totalSKU = products.length;
    const criticalItems = products.filter(p => (p.stockToday || 0) <= (p.safetyStock || 0));
    
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(l => l.timestamp >= startOfDay);
    const todayIn = todayLogs.filter(l => l.type === 'IN').reduce((acc, l) => acc + (l.quantityChange || 0), 0);
    const todayOut = todayLogs.filter(l => l.type === 'OUT').reduce((acc, l) => acc + Math.abs(l.quantityChange || 0), 0);

    return { totalSKU, lowStockCount: criticalItems.length, criticalItems, todayIn, todayOut, todayTransCount: todayLogs.length };
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

  const topVelocityItems = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const outByProd: Record<string, { total: number, unit: string }> = {};
    
    logs.filter(l => l.type === 'OUT' && l.timestamp >= thirtyDaysAgo).forEach(l => {
      const prod = products.find(p => p.name === l.productName);
      if (!outByProd[l.productName]) {
        outByProd[l.productName] = { total: 0, unit: prod?.unit || '' };
      }
      outByProd[l.productName].total += Math.abs(l.quantityChange || 0);
    });

    return Object.entries(outByProd)
      .map(([name, data]) => ({ name, total: data.total, unit: data.unit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [logs, products]);

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    products.forEach(p => {
      cats[p.category] = (cats[p.category] || 0) + (p.stockToday || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [products]);

  const COLORS = ['#ef4444', '#0f172a', '#3b82f6', '#10b981', '#f59e0b'];

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Warehouse Analytics</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time visualization of warehouse performance</p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
            <Package size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total SKU</span>
            <span className="text-2xl font-black text-slate-900">{stats.totalSKU}</span>
          </div>
        </div>
        
        <div className={`p-5 rounded-[2rem] border shadow-sm flex flex-col gap-3 ${stats.lowStockCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${stats.lowStockCount > 0 ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600'}`}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Status Kritis</span>
            <span className={`text-2xl font-black ${stats.lowStockCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.lowStockCount} SKU</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <ArrowDownLeft size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Inflow Today</span>
            <span className="text-2xl font-black text-emerald-600">+{stats.todayIn.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="w-10 h-10 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
            <ArrowUpRight size={20} />
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Outflow Today</span>
            <span className="text-2xl font-black text-red-600">-{stats.todayOut.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Middle Section: Trends & Fast Moving */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
              <TrendingUp size={18} className="text-red-600" /> Activity Flow (7D)
            </h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div><span className="text-[8px] font-black uppercase text-slate-400">IN</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div><span className="text-[8px] font-black uppercase text-slate-400">OUT</span></div>
            </div>
          </div>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold'}}
                />
                <Area type="monotone" dataKey="masuk" stroke="#10b981" fillOpacity={1} fill="url(#colorIn)" strokeWidth={4} />
                <Area type="monotone" dataKey="keluar" stroke="#ef4444" fillOpacity={1} fill="url(#colorOut)" strokeWidth={4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-xl flex flex-col">
          <h3 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-3 mb-6">
            <Zap size={18} className="text-red-500" /> Fast Moving Items (30D)
          </h3>
          <div className="flex-1 space-y-4">
            {topVelocityItems.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1 group">
                <div className="flex justify-between items-center text-[10px] font-black uppercase">
                  <span className="truncate max-w-[150px]">{item.name}</span>
                  <span className="text-red-500">{item.total.toLocaleString()} {item.unit}</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-red-600 transition-all duration-1000" 
                     style={{ width: `${(item.total / topVelocityItems[0].total) * 100}%` }}
                   />
                </div>
              </div>
            ))}
            {topVelocityItems.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center gap-4">
                <Clock size={40} />
                <p className="text-[9px] font-black uppercase tracking-widest">Collecting data...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Critical Stock List & Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-500" /> Urgent Attention Required
            </h3>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">List of critical stock</span>
          </div>
          <div className="space-y-3">
            {stats.criticalItems.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-red-50/50 border border-red-100 rounded-2xl">
                <div className="min-w-0 flex-1">
                  <h4 className="text-[10px] font-black uppercase truncate text-slate-900">{p.name}</h4>
                  <p className="text-[8px] font-mono text-slate-400 mt-0.5">ID: {p.id}</p>
                </div>
                <div className="text-right pl-4">
                  <div className="text-[12px] font-black text-red-600">{p.stockToday?.toLocaleString()} / <span className="text-slate-400 text-[10px]">{p.safetyStock?.toLocaleString()}</span></div>
                  <div className="text-[8px] font-black text-red-400 uppercase">{p.unit}</div>
                </div>
              </div>
            ))}
            {stats.criticalItems.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-300">
                <Activity size={32} />
                <p className="text-[10px] font-black uppercase tracking-widest">All stock levels are safe</p>
              </div>
            )}
            {stats.criticalItems.length > 5 && (
              <div className="text-center pt-2">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">+{stats.criticalItems.length - 5} others...</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
              <PieIcon size={18} className="text-red-600" /> Category Distribution
            </h3>
          </div>
          <div className="flex-1 w-full flex flex-col items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', paddingBottom: '20px'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
