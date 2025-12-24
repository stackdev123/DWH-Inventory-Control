
import React, { useState, useEffect } from 'react';
import { db } from '../services/database';
// Added missing RefreshCw import
import { User as UserIcon, Wifi, RefreshCw } from 'lucide-react';

const OnlineUsers: React.FC = () => {
  const [onlineUsers, setOnlineUsers] = useState<{username: string, role: string}[]>([]);
  const [showList, setShowList] = useState(false);

  const fetchOnline = async () => {
    try {
      const users = await db.getOnlineUsers();
      setOnlineUsers(users);
    } catch (e) {
      console.error("Failed to fetch online users", e);
    }
  };

  useEffect(() => {
    fetchOnline();
    const interval = setInterval(fetchOnline, 15000); // Polling faster (15s) for responsiveness
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <button 
        onClick={() => setShowList(!showList)}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-95"
      >
        <Wifi size={12} className="animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest">{onlineUsers.length} Online</span>
      </button>

      {showList && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Personnel</span>
            <button onClick={() => fetchOnline()} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
              <RefreshCw size={10} className="text-slate-400" />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {onlineUsers.length > 0 ? onlineUsers.map(user => (
              <div key={user.username} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200">
                  <UserIcon size={14} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-slate-700 truncate uppercase">{user.username}</span>
                  <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">{user.role}</span>
                </div>
                <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
              </div>
            )) : (
              <div className="p-4 text-center text-slate-400 text-[10px] italic">No active users</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineUsers;
