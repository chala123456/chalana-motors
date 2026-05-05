import React, { useState } from 'react';
import { Package, Plus, Search, AlertCircle, Save, X, Trash2 } from 'lucide-react';
import { Part } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { addDoc, collection, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface InventoryProps {
  parts: Part[];
  loading: boolean;
}

export function Inventory({ parts, loading }: InventoryProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newPart, setNewPart] = useState({
    name: '',
    category: 'General', // Default category
    costPrice: 0,
    quantity: 0,
    lowStockThreshold: 5
  });

  const [categoryFilter, setCategoryFilter] = useState('All');

  const categories = ['All', ...Array.from(new Set(parts.map(p => p.category || 'General')))];

  const filteredParts = parts.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    const nameMatch = p.name.toLowerCase().includes(term);
    const categoryMatch = p.category ? p.category.toLowerCase().includes(term) : false;
    
    const matchesSearch = !term || nameMatch || categoryMatch;
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const handleBootstrap = async () => {
    if (!auth.currentUser) return;
    if (!window.confirm('This will add 40+ common Sri Lankan motorcycle parts to your inventory reference. Continue?')) return;

    const commonParts = [
      // GENERAL / CONSUMABLES
      { name: 'Engine Oil (Yamalube 1L)', category: 'Yamaha', costPrice: 2150 },
      { name: 'Engine Oil (Bajaj DTSI 1L)', category: 'Bajaj', costPrice: 1950 },
      { name: 'Engine Oil (Honda 10W-30 1L)', category: 'Honda', costPrice: 2050 },
      { name: 'Engine Oil (TVS TRU4 1L)', category: 'TVS', costPrice: 1850 },
      { name: 'Engine Oil (Mobil Super 1L)', category: 'General', costPrice: 2450 },
      { name: 'Engine Oil (Castrol Power1 1L)', category: 'General', costPrice: 2650 },
      { name: 'Spark Plug (NGK C7HSA)', category: 'General', costPrice: 450 },
      { name: 'Spark Plug (NGK CPR7EA-9)', category: 'General', costPrice: 550 },
      { name: 'Spark Plug (NGK CR8E)', category: 'Yamaha/Apache', costPrice: 650 },
      { name: 'Brake Fluid (Dot 4 250ml)', category: 'General', costPrice: 650 },
      { name: 'Fork Oil (Veedol 175ml)', category: 'General', costPrice: 450 },
      { name: 'Carburetor Cleaner (Spray)', category: 'General', costPrice: 1250 },
      { name: 'Chain Lube (Spray)', category: 'General', costPrice: 1450 },

      // HONDA (Dio/Grazia/Activa/CB)
      { name: 'Air Filter (Dio/Grazia)', category: 'Honda', costPrice: 1150 },
      { name: 'Drive Belt (Dio/Grazia)', category: 'Honda', costPrice: 3850 },
      { name: 'Brake Shoe Rear (Dio)', category: 'Honda', costPrice: 950 },
      { name: 'Brake Pad Front (CB Shine)', category: 'Honda', costPrice: 1250 },
      { name: 'Side Mirror Set (Dio)', category: 'Honda', costPrice: 1650 },
      { name: 'Variator Roller Set (Dio)', category: 'Honda', costPrice: 1400 },
      { name: 'Clutch Shoe Set (Dio)', category: 'Honda', costPrice: 4800 },
      { name: 'Cylinder Gasket (Dio)', category: 'Honda', costPrice: 350 },
      { name: 'Tappet Cover Packing (Dio)', category: 'Honda', costPrice: 450 },
      { name: 'Speedometer Cable (Dio)', category: 'Honda', costPrice: 650 },

      // BAJAJ (Pulsar/Discover/CT100/Platina/Dominar)
      { name: 'Air Filter (Pulsar 150/180)', category: 'Bajaj', costPrice: 950 },
      { name: 'Oil Filter (Pulsar/Dominar)', category: 'Bajaj', costPrice: 480 },
      { name: 'Brake Pad Front (Pulsar/KB)', category: 'Bajaj', costPrice: 1650 },
      { name: 'Brake Shoe Rear (Pulsar)', category: 'Bajaj', costPrice: 1150 },
      { name: 'Clutch Cable (Pulsar 150)', category: 'Bajaj', costPrice: 850 },
      { name: 'Throttle Cable (Pulsar)', category: 'Bajaj', costPrice: 1150 },
      { name: 'Drive Chain Set (Pulsar 150)', category: 'Bajaj', costPrice: 4800 },
      { name: 'Drive Chain Set (CT100)', category: 'Bajaj', costPrice: 2800 },
      { name: 'Cylinder Piston Kit (CT100)', category: 'Bajaj', costPrice: 7500 },
      { name: 'Cylinder Piston Kit (Pulsar 150)', category: 'Bajaj', costPrice: 9800 },
      { name: 'CDI Unit (Pulsar 150)', category: 'Bajaj', costPrice: 3800 },
      { name: 'Friction Plate Set (Pulsar 150)', category: 'Bajaj', costPrice: 2400 },
      { name: 'Handle Bar (Pulsar Clip-on L)', category: 'Bajaj', costPrice: 1850 },

      // TVS (NTORQ/Apache/King/Wego)
      { name: 'Air Filter (NTORQ)', category: 'TVS', costPrice: 1250 },
      { name: 'Brake Pad Front (NTORQ)', category: 'TVS', costPrice: 1550 },
      { name: 'Brake Shoe Rear (NTORQ)', category: 'TVS', costPrice: 1150 },
      { name: 'Drive Belt (NTORQ)', category: 'TVS', costPrice: 4400 },
      { name: 'Spark Plug (RTR Apache)', category: 'TVS', costPrice: 650 },
      { name: 'Oil Filter (Apache RTR)', category: 'TVS', costPrice: 580 },
      { name: 'Clutch Plate Set (Apache RTR)', category: 'TVS', costPrice: 3200 },
      { name: 'Side Mirror Set (NTORQ)', category: 'TVS', costPrice: 1850 },

      // YAMAHA (FZ/RayZR/R15/MT15)
      { name: 'Air Filter (FZ-S V2/V3)', category: 'Yamaha', costPrice: 1350 },
      { name: 'Oil Filter (FZ/MT15/R15)', category: 'Yamaha', costPrice: 750 },
      { name: 'Brake Pad Front (FZ-S)', category: 'Yamaha', costPrice: 1950 },
      { name: 'Drive Chain Set (FZ V2)', category: 'Yamaha', costPrice: 5800 },
      { name: 'Throttle Cable (FZ)', category: 'Yamaha', costPrice: 1350 },
      { name: 'Clutch Cable (FZ)', category: 'Yamaha', costPrice: 950 },
      { name: 'Front Footrest Pin Set', category: 'Yamaha', costPrice: 450 },

      // HERO (Dash/Pleasure/Hunk)
      { name: 'Air Filter (Hero Dash)', category: 'Hero', costPrice: 1100 },
      { name: 'Drive Belt (Hero Dash)', category: 'Hero', costPrice: 3600 },
      { name: 'Brake Shoe Rear (Hunk/CBZ)', category: 'Hero', costPrice: 1150 },

      // ELECTRICAL & OTHERS
      { name: 'Battery (Exide 12V 5LB)', category: 'General', costPrice: 8200 },
      { name: 'Battery (GS 12V 4LB)', category: 'General', costPrice: 6800 },
      { name: 'Headlight Bulb (HS1 35/35W)', category: 'General', costPrice: 650 },
      { name: 'Indicator Bulb (Single)', category: 'General', costPrice: 180 },
      { name: 'Indicator Assembly (Pulsar Front R)', category: 'Bajaj', costPrice: 850 },
      { name: 'Flasher Relay (2-pin)', category: 'General', costPrice: 450 },
      { name: 'Horn (Single 12V High Tone)', category: 'General', costPrice: 1450 },
      { name: 'Tire Tube (90/90-12)', category: 'General', costPrice: 2150 },
      { name: 'Fork Oil Seal (Set - Pulsar)', category: 'Bajaj', costPrice: 1050 },
      { name: 'Wheel Bearing (6201)', category: 'General', costPrice: 550 },
      { name: 'Wheel Bearing (6202)', category: 'General', costPrice: 650 },
      { name: 'Main Stand (Dio)', category: 'Honda', costPrice: 2800 },
      { name: 'Side Stand (General)', category: 'General', costPrice: 850 }
    ];

    try {
      for (const part of commonParts) {
        await addDoc(collection(db, 'inventory'), {
          ...part,
          quantity: 0,
          lowStockThreshold: 5,
          userId: auth.currentUser.uid,
          lastUpdated: serverTimestamp()
        });
      }
      alert('40+ common parts added successfully! You can now adjust their market prices and stock quantities.');
    } catch (err) {
      console.error("Error bootstrapping inventory:", err);
    }
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      await addDoc(collection(db, 'inventory'), {
        ...newPart,
        userId: auth.currentUser.uid,
        lastUpdated: serverTimestamp()
      });
      setIsAdding(false);
      setNewPart({ name: '', costPrice: 0, quantity: 0, lowStockThreshold: 5 });
    } catch (err) {
      console.error("Error adding part:", err);
    }
  };

  const handleUpdateQuantity = async (id: string, delta: number) => {
    const part = parts.find(p => p.id === id);
    if (!part) return;
    
    try {
      const partRef = doc(db, 'inventory', id);
      await updateDoc(partRef, {
        quantity: Math.max(0, part.quantity + delta),
        lastUpdated: serverTimestamp()
      });
    } catch (err) {
      console.error("Error updating quantity:", err);
    }
  };

  const handleDeletePart = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this part from inventory?')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
    } catch (err) {
      console.error("Error deleting part:", err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-sans font-medium text-white tracking-tight">Inventory</h2>
          <p className="text-[#8E9299] text-sm mt-1">Manage your spare parts and track stock levels.</p>
        </div>
        <div className="flex items-center space-x-3">
            <button 
                onClick={handleBootstrap}
                className="border border-white/10 text-[#8E9299] px-4 py-2 rounded-lg text-xs font-medium hover:text-white hover:bg-white/5 transition-all"
            >
                Load Default Parts Data
            </button>
            <button 
                onClick={() => setIsAdding(true)}
                className="bg-white text-[#151619] px-4 py-2 rounded-lg font-medium text-sm flex items-center space-x-2 hover:bg-[#E4E3E0] transition-colors"
            >
                <Plus className="w-4 h-4" />
                <span>Add New Part</span>
            </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder="Search parts by name or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151619] border border-[#141414] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
          />
        </div>
        <div className="flex items-center space-x-2 bg-[#151619] border border-[#141414] rounded-lg px-3">
            <span className="text-[10px] text-[#8E9299] uppercase font-mono">Bike / Category:</span>
            <select 
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none py-2"
            >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#151619] p-6 rounded-xl border border-white/20 mb-8 shadow-2xl"
          >
            <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[#8E9299] uppercase font-mono">Part Name</label>
                <input 
                  required
                  placeholder="e.g. Brake Pads"
                  value={newPart.name}
                  onChange={e => setNewPart({...newPart, name: e.target.value})}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#8E9299] uppercase font-mono">Bike / Model</label>
                <input 
                  required
                  placeholder="e.g. Honda Dio"
                  value={newPart.category}
                  onChange={e => setNewPart({...newPart, category: e.target.value})}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#8E9299] uppercase font-mono">Cost Price</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  value={newPart.costPrice || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setNewPart({...newPart, costPrice: isNaN(val) ? 0 : val});
                  }}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#8E9299] uppercase font-mono">Initial Qty</label>
                <input 
                  type="number"
                  required
                  value={newPart.quantity || ''}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    setNewPart({...newPart, quantity: isNaN(val) ? 0 : val});
                  }}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex items-end space-x-2">
                <button type="submit" className="flex-1 bg-white text-[#151619] py-2 rounded-lg text-sm font-medium hover:bg-[#E4E3E0] transition-colors flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </button>
                <button type="button" onClick={() => setIsAdding(false)} className="p-2 border border-[#141414] rounded-lg text-[#8E9299] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-[#151619] rounded-xl border border-[#141414] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#1a1b1e] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">
            <tr>
              <th className="px-6 py-4 font-normal">Part Name</th>
              <th className="px-6 py-4 font-normal">Bike / Category</th>
              <th className="px-6 py-4 font-normal text-right">Cost Price</th>
              <th className="px-6 py-4 font-normal text-center">Stock Level</th>
              <th className="px-6 py-4 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]">
            {filteredParts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-[#8E9299] text-sm">
                  {loading ? 'Fetching inventory...' : 'No parts found.'}
                </td>
              </tr>
            ) : (
              filteredParts.map((part) => {
                const isLow = part.quantity <= part.lowStockThreshold;
                return (
                  <tr key={part.id} className="text-sm text-white hover:bg-[#1a1b1e] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{part.name}</span>
                        {isLow && <AlertCircle className="w-3 h-3 text-amber-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-[#8E9299]">
                            {part.category || 'General'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[#8E9299] font-mono group-hover:text-white">
                      {formatCurrency(part.costPrice)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-3">
                        <button 
                          disabled={part.quantity <= 0}
                          onClick={() => handleUpdateQuantity(part.id, -1)}
                          className="bg-[#1a1b1e] border border-[#141414] w-6 h-6 rounded flex items-center justify-center hover:bg-white hover:text-[#151619] transition-all disabled:opacity-50"
                        >
                          -
                        </button>
                        <span className={cn(
                          "font-mono w-8 text-center",
                          isLow ? "text-amber-500 font-bold" : "text-white"
                        )}>
                          {part.quantity}
                        </span>
                        <button 
                          onClick={() => handleUpdateQuantity(part.id, 1)}
                          className="bg-[#1a1b1e] border border-[#141414] w-6 h-6 rounded flex items-center justify-center hover:bg-white hover:text-[#151619] transition-all"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeletePart(part.id)}
                        className="text-[#8E9299] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
