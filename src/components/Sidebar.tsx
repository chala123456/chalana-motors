import { LayoutDashboard, Package, Wrench, Users, Receipt, LogOut, User, Smartphone, FileText, Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
}

export function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'jobs', label: 'Repair Jobs', icon: Wrench },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'reports', label: 'Daily Reports', icon: FileText },
    { id: 'scanner', label: 'Scanner Mode', icon: Smartphone },
  ];

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#151619] border-b border-[#141414] flex items-center justify-between px-4 z-50 print:hidden">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center">
              <Wrench className="w-5 h-5 text-[#151619]" />
          </div>
          <h1 className="text-white font-sans font-medium tracking-tight text-lg">Chalana Motors</h1>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-[#8E9299] hover:text-white transition-colors"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <div className={cn(
        "fixed lg:static inset-y-0 left-0 w-64 bg-[#151619] text-[#8E9299] p-6 flex flex-col border-r border-[#141414] transition-transform duration-300 z-50 print:hidden",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="mb-10 px-2 hidden lg:flex items-center space-x-2">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center">
              <Wrench className="w-5 h-5 text-[#151619]" />
          </div>
          <h1 className="text-white font-sans font-medium tracking-tight text-xl">Chalana Motors</h1>
        </div>

        <nav className="flex-1 space-y-1 lg:mt-0 mt-12">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 font-sans text-sm",
                activeTab === item.id 
                  ? "bg-white text-[#151619] font-medium shadow-lg" 
                  : "hover:bg-white/5 hover:text-white"
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
    </>
  );
}
