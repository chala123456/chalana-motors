import React from 'react';
import { LayoutDashboard, Package, Wrench, Settings, LogOut, User } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
}

export function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'jobs', label: 'Repair Jobs', icon: Wrench },
  ];

  return (
    <div className="w-64 h-screen bg-[#151619] text-[#8E9299] p-6 flex flex-col border-r border-[#141414]">
      <div className="mb-10 px-2 flex items-center space-x-2">
        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center">
            <Wrench className="w-5 h-5 text-[#151619]" />
        </div>
        <h1 className="text-white font-sans font-medium tracking-tight text-xl">Chalana Motors</h1>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-sans text-sm",
              activeTab === item.id 
                ? "bg-white text-[#151619] font-medium" 
                : "hover:bg-[#1a1b1e] hover:text-white"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-4 pt-6 border-t border-[#141414]">
        {user && (
          <div className="flex items-center space-x-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#1a1b1e] flex items-center justify-center overflow-hidden border border-[#141414]">
              {user.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-4 h-4 text-[#8E9299]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate font-medium">{user.displayName || 'Garage Owner'}</p>
              <p className="text-[10px] text-[#8E9299] truncate uppercase tracking-wider">Member Since May '24</p>
            </div>
          </div>
        )}
        
        <button 
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-[#1a1b1e] hover:text-white transition-all text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
