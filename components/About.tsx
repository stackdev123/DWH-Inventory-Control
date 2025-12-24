
import React from 'react';
import { Info, ShieldCheck, Tag, Box, Database, Smartphone, History, CheckCircle2 } from 'lucide-react';

const About: React.FC = () => {
  const features = [
    { icon: <Tag className="text-red-500" />, title: "Unique Unit Tracking", desc: "Granular tracking per batch/unit with unique QR identifiers." },
    { icon: <ShieldCheck className="text-blue-500" />, title: "Secure Operations", desc: "Approval-based workflows for sensitive inventory adjustments." },
    { icon: <Box className="text-amber-500" />, title: "Smart Inventory", desc: "Real-time stock level monitoring with low-stock alerts." },
    { icon: <Database className="text-purple-500" />, title: "Centralized Data", desc: "Robust Master Data management for consistent warehouse operations." },
    { icon: <Smartphone className="text-slate-500" />, title: "Mobile Scanner", desc: "Built-in QR scanner supporting single and batch processing modes." },
  ];

  const updateLogs = [
    { version: "v4.2.0", date: "Desember 2025", items: ["Optimasi Header & Tombol Logout", "Fix Layout Kartu Outbound (Input QTY)", "Branding Bounty Segar Indonesia Terintegrasi"] },
    { version: "v4.1.0", date: "Desember 2025", items: ["Scan Cek Lifecycle Detail (In, Exp, Petugas)", "Auto-fill QTY Outbound sesuai stiker", "UI Scanner Viewfinder Simetris"] },
    { version: "v4.0.0", date: "Desember 2025", items: ["Implementasi Dry Warehouse Core", "Modul Inbound, Outbound & Rekap", "Manajemen Master Data & Stiker QR"] },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 text-center relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/5 blur-[100px] rounded-full"></div>
        <div className="relative z-10">
          <div className="w-24 h-24 bg-gradient-to-br from-red-600 to-red-800 text-white rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl mb-8">
            <Info size={44} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Dry Warehouse System</h1>
          <p className="text-xs font-black text-red-600 uppercase tracking-[0.2em] mt-3 bg-red-50 px-6 py-1.5 rounded-full inline-block border border-red-100">Release v4.2.0</p>
          <div className="mt-8 max-w-2xl mx-auto text-slate-500 font-bold text-sm leading-relaxed uppercase tracking-wider">
            Sistem manajemen gudang modern yang dioptimalkan untuk performa, akurasi stok, dan kemudahan operasional BOUNTY SEGAR INDONESIA.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, idx) => (
          <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-slate-100 transition-colors">
              {f.icon}
            </div>
            <h3 className="font-black text-slate-800 uppercase text-xs tracking-tight mb-2">{f.title}</h3>
            <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
         <div className="flex items-center gap-3 mb-8">
            <div className="bg-slate-900 p-2.5 rounded-xl text-white shadow-lg"><History size={20} /></div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Riwayat Pembaruan</h2>
         </div>
         <div className="space-y-6">
            {updateLogs.map((log, idx) => (
               <div key={idx} className="relative pl-8 border-l-2 border-slate-100 pb-2">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-red-600"></div>
                  <div className="flex items-center gap-3 mb-2">
                     <span className="text-[12px] font-black text-slate-900 uppercase">{log.version}</span>
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{log.date}</span>
                  </div>
                  <ul className="space-y-1.5">
                     {log.items.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-tight">
                           <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                           {item}
                        </li>
                     ))}
                  </ul>
               </div>
            ))}
         </div>
      </div>

      <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] py-10">© 2025 BOUNTY SEGAR INDONESIA — MANAGEMENT SYSTEM</p>
    </div>
  );
};

export default About;
