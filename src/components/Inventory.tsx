import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, AlertCircle, Save, X, Trash2, TrendingUp, Calculator, ListPlus, Send, Printer as PrinterIcon, FileDown, FileText } from 'lucide-react';
import { Part } from '../types';
import { formatCurrency, cn, normalizeSearch } from '../lib/utils';
import { addDoc, collection, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
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
    barcode: '',
    costPrice: 0,
    purchasePrice: 0,
    quantity: 0,
    lowStockThreshold: 5
  });

  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [bulkPricePercent, setBulkPricePercent] = useState(0);
  const [isProcessingList, setIsProcessingList] = useState(false);
  const [profitMargin, setProfitMargin] = useState(25); // Default 25% profit margin
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [whatsappRecipient, setWhatsappRecipient] = useState('94779468940');

  const totalItems = parts.length;
  const totalStockQuantity = parts.reduce((sum, p) => sum + p.quantity, 0);
  const totalInventoryValue = parts.reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0);
  const lowStockParts = parts.filter(p => p.quantity <= p.lowStockThreshold);

  const categories = ['All', ...Array.from(new Set(parts.map(p => p.category || 'General')))];

  const handleEditPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart) return;

    try {
      await updateDoc(doc(db, 'inventory', editingPart.id), {
        name: editingPart.name,
        category: editingPart.category || 'General',
        barcode: editingPart.barcode || '',
        costPrice: editingPart.costPrice || 0,
        purchasePrice: editingPart.purchasePrice || 0,
        quantity: editingPart.quantity || 0,
        lowStockThreshold: editingPart.lowStockThreshold || 5,
        lastUpdated: serverTimestamp()
      });
      setEditingPart(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inventory/${editingPart.id}`);
    }
  };

  const removeDuplicates = async () => {
    if (parts.length === 0) return;
    
    // Group parts by normalized name, category, AND barcode if available
    const uniqueMap = new Map<string, Part>();
    const duplicateIds: string[] = [];

    parts.forEach(part => {
      // Use barcode as primary unique key if it exists, otherwise use name|category
      const key = part.barcode 
        ? `bc:${normalizeSearch(part.barcode)}` 
        : `nc:${normalizeSearch(part.name)}|${normalizeSearch(part.category || 'General')}`;
      
      if (uniqueMap.has(key)) {
        // Already seen this combination, mark this ID for deletion
        duplicateIds.push(part.id);
      } else {
        uniqueMap.set(key, part);
      }
    });

    if (duplicateIds.length === 0) {
      alert("No duplicate items found (Same Barcode or Name+Category).");
      return;
    }

    if (!window.confirm(`Found ${duplicateIds.length} duplicate items out of ${parts.length} total. Remove duplicates and keep only one of each?`)) return;

    setIsProcessingList(true);
    try {
      // Delete duplicates in batches
      const batchSize = 500;
      for (let i = 0; i < duplicateIds.length; i += batchSize) {
        const chunk = duplicateIds.slice(i, i + batchSize);
        const deletePromises = chunk.map(id => deleteDoc(doc(db, 'inventory', id)));
        await Promise.all(deletePromises);
      }
      alert(`Successfully removed ${duplicateIds.length} duplicate items.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'inventory/cleanup');
    } finally {
      setIsProcessingList(false);
    }
  };

  const filteredParts = parts.filter(p => {
    const term = normalizeSearch(searchTerm);
    const nameMatch = normalizeSearch(p.name).includes(term);
    const categoryMatch = p.category ? normalizeSearch(p.category).includes(term) : false;
    const barcodeMatch = p.barcode ? normalizeSearch(p.barcode).includes(term) : false;
    
    const matchesSearch = !term || nameMatch || categoryMatch || barcodeMatch;
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    const seedInventory = async () => {
      if (!auth.currentUser || loading) return;
      
      const seeded = localStorage.getItem(`inventory_seeded_v2_${auth.currentUser.uid}`);
      if (seeded) return;

      const newParts = [
        { name: 'Osram head light bulb', category: 'General', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'F-Fork oil', category: 'General', costPrice: 800, purchasePrice: 700, quantity: 15 },
        { name: 'Ct-100 cluth cable', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 5 },
        { name: 'Ct-100 / Platina side mirror', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 8 },
        { name: 'Discover 135 cluth yoke', category: 'Bajaj', costPrice: 580, purchasePrice: 500, quantity: 6 },
        { name: 'Ct-100 cluth yoke', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Passion + meter case', category: 'Hero', costPrice: 0, purchasePrice: 0, quantity: 3 },
        { name: 'Bajaj Pulsar 150 head light switch', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 4 },
        { name: 'Platina head light switch', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 4 },
        { name: 'Bendit wheel', category: 'General', costPrice: 0, purchasePrice: 0, quantity: 2 },
        { name: 'Pulsar 150 Air filter', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 12 },
        { name: 'XL Super Element Air cleaner', category: 'TVS', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Air filter Pulsar 180', category: 'Bajaj', costPrice: 550, purchasePrice: 480, quantity: 10 },
        { name: 'Discover 135 Air filter', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Discover 100 Air filter', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Ct-100 Air filter', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Pulsar Digital Air filter', category: 'Bajaj', costPrice: 550, purchasePrice: 480, quantity: 10 },
        { name: 'Fork boot Pulsar', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Hand grip Splender', category: 'Hero', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Hand grip Discover 135', category: 'Bajaj', costPrice: 650, purchasePrice: 580, quantity: 10 },
        { name: 'Handle accelerater Ct-100', category: 'Bajaj', costPrice: 650, purchasePrice: 580, quantity: 10 },
        { name: 'Ct-100, Boxer, meter wheel set', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 5 },
        { name: 'Carbon brush kit Scooty pept', category: 'TVS', costPrice: 0, purchasePrice: 0, quantity: 5 },
        { name: 'Brkt Lever LH', category: 'General', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Starter motor brush set Platina', category: 'Bajaj', costPrice: 0, purchasePrice: 0, quantity: 5 },
        { name: 'Plesure head oring', category: 'Hero', costPrice: 0, purchasePrice: 0, quantity: 10 },
        { name: 'Packing Dio', category: 'Honda', costPrice: 0, purchasePrice: 0, quantity: 10 }
      ];

      try {
        const promises = newParts.map(part => addDoc(collection(db, 'inventory'), {
          ...part,
          lowStockThreshold: 5,
          userId: auth.currentUser!.uid,
          lastUpdated: serverTimestamp()
        }));
        await Promise.all(promises);
        localStorage.setItem(`inventory_seeded_v2_${auth.currentUser.uid}`, 'true');
      } catch (err) {
        console.error("Auto-seed failed:", err);
      }
    };

    if (auth.currentUser && !loading) {
      seedInventory();
    }
  }, [auth.currentUser, loading]);

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
      setNewPart({ name: '', category: 'General', barcode: '', costPrice: 0, purchasePrice: 0, quantity: 0, lowStockThreshold: 5 });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory');
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
      handleFirestoreError(err, OperationType.UPDATE, `inventory/${id}`);
    }
  };

  const handleDeletePart = async (id: string) => {
    if (!id) return;
    
    try {
      const docRef = doc(db, 'inventory', id);
      await deleteDoc(docRef);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Delete Error:", err);
      handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`);
    }
  };

  const [isClearing, setIsClearing] = useState(false);

  const handleApplyProfitMargin = () => {
    if (newPart.purchasePrice > 0) {
        const marginMultiplier = 1 + (profitMargin / 100);
        const suggestedSale = Math.round(newPart.purchasePrice * marginMultiplier);
        setNewPart({ ...newPart, costPrice: suggestedSale });
    }
  };


  const handleBulkPriceUpdate = async () => {
    if (!auth.currentUser || bulkPricePercent === 0) return;
    if (!window.confirm(`Are you sure you want to ${bulkPricePercent > 0 ? 'INCREASE' : 'DECREASE'} all selling prices by ${Math.abs(bulkPricePercent)}%?`)) return;

    setSearchTerm('Updating prices...');
    try {
      const multiplier = 1 + (bulkPricePercent / 100);
      const updatePromises = parts.map(part => {
        const newPrice = Math.round(part.costPrice * multiplier);
        return updateDoc(doc(db, 'inventory', part.id), {
          costPrice: newPrice,
          lastUpdated: serverTimestamp()
        });
      });
      await Promise.all(updatePromises);
      alert('All prices updated successfully!');
      setBulkPricePercent(0);
      setIsBulkPriceModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'inventory/bulk-price');
    } finally {
      setSearchTerm('');
    }
  };

  const clearAllInventory = async () => {
    if (!auth.currentUser) return;
    const count = parts.length;
    if (count === 0) return;

    setIsClearing(true);
    try {
      const deletePromises = parts.map(part => deleteDoc(doc(db, 'inventory', part.id)));
      await Promise.all(deletePromises);
      setConfirmClearAll(false);
    } catch (err) {
      console.error("Clear Error:", err);
      handleFirestoreError(err, OperationType.DELETE, 'inventory/all');
    } finally {
      setIsClearing(false);
    }
  };

  const handleWhatsAppReport = (type: 'low' | 'full' | 'all') => {
    const reportTitle = type === 'low' ? 'LOW STOCK REPORT' : (type === 'full' ? 'FULL STOCK BALANCE' : 'COMPLETE STOCK SUMMARY');
    const header = `📋 *CHALANA MOTORS - ${reportTitle}*\nDate: ${new Date().toLocaleDateString()}\n----------------------------------\n`;
    
    let body = '';
    if (type === 'low') {
        body = lowStockParts.length > 0 
            ? lowStockParts.map(p => `• ${p.name}: *${p.quantity}*`).join('\n')
            : '✅ All items are above threshold levels.';
    } else if (type === 'full') {
        body = parts.map(p => `• ${p.name}: *${p.quantity}* in stock`).join('\n');
    } else {
        const low = lowStockParts.length > 0 
            ? `🚨 *LOW STOCK:* \n` + lowStockParts.map(p => `• ${p.name}: ${p.quantity}`).join('\n')
            : `✅ No low stock items.`;
        const full = `\n\n📦 *FULL STOCK:* \n` + parts.map(p => `• ${p.name}: ${p.quantity}`).join('\n');
        body = low + full;
    }

    const footer = `\n----------------------------------\nTotal Items: ${parts.length}`;
    
    const message = encodeURIComponent(header + body + footer);
    const cleanNumber = whatsappRecipient.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
  };

  const handlePrintReport = (elementId: string = 'report-print-area', title: any = 'Stock Report') => {
    const printContent = document.getElementById(elementId);
    if (!printContent) return;
    
    // Safety check if title is a MouseEvent
    const safeTitle = (typeof title === 'string') ? title : 'Stock Report';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Please allow popups to open the report preview.');
        return;
    }
    
    // Capture all current styles
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(style => style.outerHTML)
        .join('');
        
    printWindow.document.write(`
      <html>
        <head>
          <title>${safeTitle} - Chalana Motors</title>
          ${styles}
          <style>
            @media print {
                .no-print { display: none !important; }
                body { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
                @page { margin: 1cm; size: auto; }
            }
            body { 
                padding: 40px; 
                font-family: sans-serif; 
                background: #f4f4f4; 
                color: black !important;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .report-container {
                background: white;
                width: 1000px;
                padding: 40px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                border-radius: 8px;
            }
            .no-print-toolbar {
                width: 1000px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #151619;
                color: white;
                padding: 15px 25px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            .btn-action {
                background: white;
                color: black;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 15px;
            }
            .btn-action:hover { background: #e4e3e0; }
          </style>
        </head>
        <body>
          <div class="no-print-toolbar no-print">
            <div style="font-weight: bold; font-size: 16px;">REPORT PREVIEW</div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-action" onclick="window.print()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    PRINT REPORT
                </button>
                <button class="btn-action" onclick="window.close()">CLOSE</button>
            </div>
          </div>
          <div class="report-container">
            ${printContent.innerHTML}
          </div>
          <script>
            // Check if oklch exists and replace with grey for print compatibility
            document.querySelectorAll('*').forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.color && style.color.includes('oklch')) el.style.color = '#333';
                if (style.backgroundColor && style.backgroundColor.includes('oklch')) el.style.backgroundColor = '#f0f0f0';
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Hidden Print Area - Full Inventory - FIXED WIDTH FOR CAPTURE */}
      <div id="report-print-area" className="fixed top-0 left-[-5000px] w-[1000px] bg-white text-black p-10 z-[-100] print:static print:block">
        <div className="text-center border-b-2 border-black pb-6 mb-8">
            <h1 className="text-3xl font-bold uppercase">Chalana Motors</h1>
            <p className="text-sm font-mono uppercase tracking-widest">Service Station & Spare Parts Inventory Report</p>
            <p className="text-xs mt-2">Date: {new Date().toLocaleString()}</p>
        </div>
        
        <h2 className="text-xl font-bold mb-4 uppercase text-center">Full Stock Availability Report</h2>
        <table className="w-full text-left border-collapse border border-black">
            <thead>
                <tr className="bg-gray-100 border-b border-black text-xs uppercase">
                    <th className="p-2 border-r border-black">Part Name</th>
                    <th className="p-2 border-r border-black">Category</th>
                    <th className="p-2 text-center">Qty in Stock</th>
                </tr>
            </thead>
            <tbody>
                {parts.map(p => (
                    <tr key={p.id} className="border-b border-black text-sm">
                        <td className="p-2 border-r border-black font-medium">{p.name}</td>
                        <td className="p-2 border-r border-black">{p.category}</td>
                        <td className="p-2 text-center font-bold">{p.quantity}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        
        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
            <div className="border border-black p-4 bg-gray-50">
                <p className="font-bold border-b border-black mb-2 uppercase text-xs">Inventory Summary</p>
                <p>Total Different Items: {totalItems}</p>
                <p>Total Units in Stock: {totalStockQuantity}</p>
                <p>Valuation: {formatCurrency(totalInventoryValue)}</p>
            </div>
            <div className="flex flex-col justify-end items-end">
                <div className="text-center">
                    <div className="w-48 border-b border-black mb-1"></div>
                    <p className="text-xs uppercase font-bold tracking-tighter">Authorized Signature</p>
                </div>
            </div>
        </div>
      </div>

      {/* Hidden Print Area - Low Stock Only - FIXED WIDTH FOR CAPTURE */}
      <div id="low-stock-print-area" className="fixed top-0 left-[-5000px] w-[1000px] bg-white text-black p-10 z-[-100] print:static print:block">
        <div className="text-center border-b-2 border-black pb-6 mb-8">
            <h1 className="text-3xl font-bold uppercase">Chalana Motors</h1>
            <p className="text-sm font-mono uppercase tracking-widest">Low Stock Reorder Alert</p>
            <p className="text-xs mt-2">Date: {new Date().toLocaleString()}</p>
        </div>
        
        <h2 className="text-xl font-bold mb-4 uppercase text-center text-red-600">Critical Stock Reorder List</h2>
        <table className="w-full text-left border-collapse border border-black">
            <thead>
                <tr className="bg-red-50 border-b border-black text-xs uppercase">
                    <th className="p-2 border-r border-black">Part Name</th>
                    <th className="p-2 border-r border-black">Category</th>
                    <th className="p-2 text-center">Current Qty</th>
                </tr>
            </thead>
            <tbody>
                {lowStockParts.map(p => (
                    <tr key={p.id} className="border-b border-black text-sm">
                        <td className="p-2 border-r border-black font-medium">{p.name}</td>
                        <td className="p-2 border-r border-black">{p.category}</td>
                        <td className="p-2 text-center font-bold text-red-600">{p.quantity}</td>
                    </tr>
                ))}
            </tbody>
        </table>

        {lowStockParts.length === 0 && (
            <div className="p-10 text-center text-gray-500 italic">No low stock items detected. All inventory levels are healthy.</div>
        )}
        
        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
            <div className="border border-black p-4 bg-red-50">
                <p className="font-bold border-b border-black mb-2 uppercase text-xs">Alert Summary</p>
                <p>Items Needing Reorder: {lowStockParts.length}</p>
            </div>
            <div className="flex flex-col justify-end items-end">
                <div className="text-center">
                    <div className="w-48 border-b border-black mb-1"></div>
                    <p className="text-xs uppercase font-bold tracking-tighter">Inventory Manager</p>
                </div>
            </div>
        </div>
      </div>

      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 print:hidden">
        <div>
          <h2 className="text-2xl font-sans font-medium text-white tracking-tight">Inventory</h2>
          <p className="text-[#8E9299] text-sm mt-1">Manage your spare parts and track stock levels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <button 
                onClick={() => setIsReportModalOpen(true)}
                className="flex-1 sm:flex-none justify-center bg-blue-500/10 text-blue-400 px-3 py-2 rounded-lg text-[11px] font-medium hover:bg-blue-500/20 transition-all flex items-center gap-2 border border-blue-500/20"
            >
                <FileDown className="w-3.5 h-3.5" />
                Reports
            </button>
            <button 
                onClick={removeDuplicates}
                disabled={isProcessingList}
                className="flex-1 sm:flex-none justify-center bg-amber-500/10 text-amber-500 px-3 py-2 rounded-lg text-[11px] font-medium hover:bg-amber-500/20 transition-all flex items-center gap-2 border border-amber-500/20"
            >
                <Trash2 className="w-3.5 h-3.5" />
                Duplicates
            </button>
            <button 
                onClick={() => setIsBulkPriceModalOpen(true)}
                className="flex-1 sm:flex-none justify-center bg-emerald-500/10 text-emerald-500 px-3 py-2 rounded-lg text-[11px] font-medium hover:bg-emerald-500/20 transition-all flex items-center gap-2 border border-emerald-500/20"
            >
                <TrendingUp className="w-3.5 h-3.5" />
                Prices
            </button>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <button 
                  onClick={() => setIsAdding(true)}
                  className="flex-1 sm:flex-none justify-center bg-white text-[#151619] px-4 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 hover:bg-[#E4E3E0] transition-colors shadow-lg"
              >
                  <Plus className="w-4 h-4" />
                  <span>Add New Part</span>
              </button>
            </div>
        </div>
      </header>

      {/* Inventory Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 print:hidden">
        <div className="bg-[#151619] p-4 md:p-5 rounded-2xl border border-white/[0.03] space-y-1">
            <p className="text-[#8E9299] text-[9px] md:text-[10px] font-mono uppercase tracking-widest">SKU Count</p>
            <h3 className="text-xl md:text-2xl font-sans font-medium text-white">{totalItems}</h3>
        </div>
        <div className="bg-[#151619] p-4 md:p-5 rounded-2xl border border-white/[0.03] space-y-1">
            <p className="text-[#8E9299] text-[9px] md:text-[10px] font-mono uppercase tracking-widest">Stock Qty</p>
            <h3 className="text-xl md:text-2xl font-sans font-medium text-white">{totalStockQuantity}</h3>
        </div>
        <div className="bg-[#151619] p-4 md:p-5 rounded-2xl border border-white/[0.03] space-y-1">
            <p className="text-[#8E9299] text-[9px] md:text-[10px] font-mono uppercase tracking-widest">Stock Value</p>
            <h3 className="text-xl md:text-2xl font-sans font-medium text-white">{formatCurrency(totalInventoryValue)}</h3>
        </div>
        <div className={cn(
            "p-4 md:p-5 rounded-2xl border transition-all space-y-1",
            lowStockParts.length > 0 ? "bg-red-500/5 border-red-500/20" : "bg-[#151619] border-white/[0.03]"
        )}>
            <p className="text-[#8E9299] text-[9px] md:text-[10px] font-mono uppercase tracking-widest">Low Stock</p>
            <h3 className={cn("text-xl md:text-2xl font-sans font-medium", lowStockParts.length > 0 ? "text-red-400" : "text-white")}>
                {lowStockParts.length}
            </h3>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
          <input 
            type="text"
            placeholder="Search parts, category or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151619] border border-[#141414] rounded-lg pl-10 pr-4 py-2.5 text-xs md:text-sm text-white focus:outline-none transition-all font-sans"
          />
        </div>
        <div className="flex items-center space-x-2 bg-[#151619] border border-[#141414] rounded-lg px-3">
            <span className="text-[9px] md:text-[10px] text-[#8E9299] uppercase font-mono">Filter:</span>
            <select 
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-transparent text-xs md:text-sm text-white focus:outline-none py-2 font-sans"
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
            <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[9px] text-[#8E9299] uppercase font-mono tracking-widest">Part Name</label>
                <input 
                  required
                  placeholder="e.g. Brake Pads"
                  value={newPart.name}
                  onChange={e => setNewPart({...newPart, name: e.target.value})}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-white/20 transition-all outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-[#8E9299] uppercase font-mono tracking-widest">Bike / Model</label>
                <input 
                  required
                  placeholder="e.g. Honda Dio"
                  value={newPart.category}
                  onChange={e => setNewPart({...newPart, category: e.target.value})}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-white/20 transition-all outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-[#8E9299] uppercase font-mono tracking-widest">Barcode</label>
                <input 
                  placeholder="Scan/Type"
                  value={newPart.barcode}
                  onChange={e => setNewPart({...newPart, barcode: e.target.value})}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-[#8E9299] uppercase font-mono tracking-widest">Buy Price</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  value={newPart.purchasePrice || ''}
                  onChange={e => {
                      const val = parseFloat(e.target.value);
                      setNewPart({...newPart, purchasePrice: isNaN(val) ? 0 : val});
                  }}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-[#8E9299] uppercase font-mono tracking-widest flex justify-between">
                    Sale Price
                    <span className="text-emerald-500 lowercase">{profitMargin}%</span>
                </label>
                <div className="flex gap-1">
                    <input 
                    type="number"
                    step="0.01"
                    required
                    value={newPart.costPrice || ''}
                    onChange={e => {
                        const val = parseFloat(e.target.value);
                        setNewPart({...newPart, costPrice: isNaN(val) ? 0 : val});
                    }}
                    className="flex-1 bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                    />
                    <button 
                        type="button"
                        onClick={handleApplyProfitMargin}
                        className="bg-emerald-500/10 text-emerald-500 p-2 rounded-lg hover:bg-emerald-500/20 transition-colors"
                        title="Calculate margin"
                    >
                        <Calculator className="w-4 h-4" />
                    </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-[#8E9299] uppercase font-mono tracking-widest">Stock Qty</label>
                <input 
                  type="number"
                  required
                  value={newPart.quantity || ''}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    setNewPart({...newPart, quantity: isNaN(val) ? 0 : val});
                  }}
                  className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                />
              </div>
              <div className="flex items-end space-x-2 md:col-start-6">
                <button type="submit" className="flex-1 bg-white text-[#151619] py-2.5 rounded-xl text-xs font-bold hover:bg-[#E4E3E0] transition-colors flex items-center justify-center space-x-2 shadow-lg active:scale-95">
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
                <button type="button" onClick={() => setIsAdding(false)} className="p-2 border border-white/10 rounded-lg text-[#8E9299] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-[#151619] rounded-xl border border-[#141414] overflow-hidden flex flex-col">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left min-w-[800px]">
          <thead className="bg-[#1a1b1e] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">
            <tr>
              <th className="px-6 py-4 font-normal">Part Name</th>
              <th className="px-6 py-4 font-normal">Bike / Category</th>
              <th className="px-6 py-4 font-normal">Barcode</th>
              <th className="px-6 py-4 font-normal text-right">Selling Price</th>
              <th className="px-6 py-4 font-normal text-right">Buying Price</th>
              <th className="px-6 py-4 font-normal text-center">Stock Level</th>
              <th className="px-6 py-4 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]">
            {filteredParts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[#8E9299] text-sm">
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
                    <td className="px-6 py-4">
                        <button 
                            onClick={async () => {
                                const newBarcode = prompt(`Enter barcode for ${part.name}:`, part.barcode || '');
                                if (newBarcode !== null) {
                                    try {
                                        await updateDoc(doc(db, 'inventory', part.id), {
                                            barcode: newBarcode,
                                            lastUpdated: serverTimestamp()
                                        });
                                    } catch (err) {
                                        handleFirestoreError(err, OperationType.UPDATE, `inventory/${part.id}`);
                                    }
                                }
                            }}
                            className="text-[10px] font-mono text-[#555] group-hover:text-blue-400 hover:scale-105 transition-all text-left"
                        >
                            {part.barcode || 'SET BARCODE'}
                        </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <button 
                            onClick={async () => {
                                const newPrice = prompt(`Enter NEW SELLING PRICE for ${part.name}:`, part.costPrice.toString());
                                if (newPrice !== null) {
                                    const parsed = parseFloat(newPrice);
                                    if (!isNaN(parsed)) {
                                        try {
                                            await updateDoc(doc(db, 'inventory', part.id), {
                                                costPrice: parsed,
                                                lastUpdated: serverTimestamp()
                                            });
                                        } catch (err) {
                                            handleFirestoreError(err, OperationType.UPDATE, `inventory/${part.id}`);
                                        }
                                    }
                                }
                            }}
                            className="text-emerald-500 font-mono font-bold hover:text-white hover:scale-105 transition-all text-right w-full"
                        >
                            {formatCurrency(part.costPrice)}
                        </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <button 
                            onClick={async () => {
                                const newPrice = prompt(`Enter NEW BUYING PRICE for ${part.name}:`, (part.purchasePrice || 0).toString());
                                if (newPrice !== null) {
                                    const parsed = parseFloat(newPrice);
                                    if (!isNaN(parsed)) {
                                        try {
                                            await updateDoc(doc(db, 'inventory', part.id), {
                                                purchasePrice: parsed,
                                                lastUpdated: serverTimestamp()
                                            });
                                        } catch (err) {
                                            handleFirestoreError(err, OperationType.UPDATE, `inventory/${part.id}`);
                                        }
                                    }
                                }
                            }}
                            className="text-[#8E9299] font-mono hover:text-white hover:scale-105 transition-all text-right w-full"
                        >
                            {formatCurrency(part.purchasePrice || 0)}
                        </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-3">
                        <button 
                          disabled={part.quantity <= 0}
                          onClick={() => handleUpdateQuantity(part.id, -1)}
                          className="bg-[#1a1b1e] border border-[#141414] w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white hover:text-[#151619] transition-all disabled:opacity-50 text-lg font-bold"
                        >
                          -
                        </button>
                        <button
                          onClick={async () => {
                            const newQty = prompt(`Set total stock for ${part.name}:`, part.quantity.toString());
                            if (newQty !== null) {
                                const parsed = parseInt(newQty);
                                if (!isNaN(parsed)) {
                                    try {
                                        await updateDoc(doc(db, 'inventory', part.id), {
                                            quantity: Math.max(0, parsed),
                                            lastUpdated: serverTimestamp()
                                        });
                                    } catch (err) {
                                        handleFirestoreError(err, OperationType.UPDATE, `inventory/${part.id}`);
                                    }
                                }
                            }
                          }}
                          className={cn(
                            "font-mono w-10 text-center text-base hover:text-blue-400 hover:scale-110 transition-all",
                            isLow ? "text-amber-500 font-bold" : "text-white"
                          )}
                        >
                          {part.quantity}
                        </button>
                        <button 
                          onClick={() => handleUpdateQuantity(part.id, 1)}
                          className="bg-[#1a1b1e] border border-[#141414] w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white hover:text-[#151619] transition-all text-lg font-bold"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <div className="flex justify-end items-center space-x-2">
                        <button 
                          onClick={() => setEditingPart(part)}
                          className="w-10 h-10 flex items-center justify-center text-[#8E9299] hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
                          title="Edit Part Details"
                        >
                          <ListPlus className="w-5 h-5" />
                        </button>
                        {confirmDeleteId === part.id ? (
                          <div className="flex items-center space-x-1 animate-in fade-in slide-in-from-right-2 duration-200">
                             <button 
                                onClick={() => handleDeletePart(part.id)}
                                className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors"
                             >
                                CONFIRM
                             </button>
                             <button 
                                onClick={() => setConfirmDeleteId(null)}
                                className="p-1.5 text-[#8E9299] hover:text-white"
                             >
                                <X className="w-4 h-4" />
                             </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setConfirmDeleteId(part.id)}
                            className="w-10 h-10 flex items-center justify-center text-[#8E9299] hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-95 group"
                            title="Delete Part"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
      {/* Global Clear Confirmation */}
      <AnimatePresence>
        {confirmClearAll && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#151619] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-6"
                >
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                        <Trash2 className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-medium text-white">Clean All Inventory?</h3>
                        <p className="text-[#8E9299] text-sm leading-relaxed">
                            This will permanantly delete all <span className="text-white font-bold">{parts.length} items</span> from your stock. This action cannot be undone.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <button 
                            onClick={() => setConfirmClearAll(false)}
                            className="py-3 bg-white/5 text-[#8E9299] rounded-xl font-medium hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={clearAllInventory}
                            className="py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                        >
                            Yes, Delete All
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
      
      {/* Full Edit Modal */}
      <AnimatePresence>
        {editingPart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#151619] border border-white/10 rounded-2xl p-8 max-w-2xl w-full shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium text-white">Edit Part Details</h3>
                <button onClick={() => setEditingPart(null)} className="text-[#8E9299] hover:text-white"><X className="w-5 h-5"/></button>
              </div>

              <form onSubmit={handleEditPart} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Part Name</label>
                  <input 
                    required
                    value={editingPart.name}
                    onChange={e => setEditingPart({...editingPart, name: e.target.value})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Bike / Brand</label>
                  <input 
                    required
                    value={editingPart.category}
                    onChange={e => setEditingPart({...editingPart, category: e.target.value})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Barcode</label>
                  <input 
                    value={editingPart.barcode || ''}
                    onChange={e => setEditingPart({...editingPart, barcode: e.target.value})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Buying Price (Purchase)</label>
                  <input 
                    type="number"
                    value={editingPart.purchasePrice}
                    onChange={e => setEditingPart({...editingPart, purchasePrice: parseFloat(e.target.value) || 0})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Selling Price (Sale)</label>
                  <input 
                    type="number"
                    value={editingPart.costPrice}
                    onChange={e => setEditingPart({...editingPart, costPrice: parseFloat(e.target.value) || 0})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-emerald-400 font-mono focus:ring-1 focus:ring-emerald-500/30 transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Current Quantity</label>
                  <input 
                    type="number"
                    value={editingPart.quantity}
                    onChange={e => setEditingPart({...editingPart, quantity: parseInt(e.target.value) || 0})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#8E9299] uppercase font-mono tracking-widest pl-1">Low Stock Alert Level</label>
                  <input 
                    type="number"
                    value={editingPart.lowStockThreshold}
                    onChange={e => setEditingPart({...editingPart, lowStockThreshold: parseInt(e.target.value) || 0})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-amber-500 font-mono focus:ring-1 focus:ring-amber-500/30 transition-all outline-none"
                  />
                </div>

                <div className="md:col-span-2 grid grid-cols-2 gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingPart(null)}
                    className="py-4 bg-white/5 text-[#8E9299] rounded-xl font-medium hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="py-4 bg-white text-[#151619] rounded-xl font-bold hover:bg-[#E4E3E0] transition-colors shadow-xl"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Price Update Modal */}
      <AnimatePresence>
        {isBulkPriceModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#151619] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
                >
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                        <TrendingUp className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-medium text-white">Bulk Price Adjustment</h3>
                        <p className="text-[#8E9299] text-sm">
                            Apply a percentage increase or decrease to ALL selling prices in your inventory.
                        </p>
                    </div>

                    <div className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-3">
                        <div className="flex justify-between items-center text-xs font-mono uppercase text-[#8E9299]">
                            <span>Percentage Change</span>
                            <span className={cn("font-bold", bulkPricePercent >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {bulkPricePercent > 0 ? '+' : ''}{bulkPricePercent}%
                            </span>
                        </div>
                        <input 
                            type="range"
                            min="-50"
                            max="100"
                            step="1"
                            value={bulkPricePercent}
                            onChange={(e) => setBulkPricePercent(parseInt(e.target.value))}
                            className="w-full accent-emerald-500"
                        />
                        <div className="grid grid-cols-4 gap-2">
                            {[-10, 5, 10, 25].map(val => (
                                <button 
                                    key={val}
                                    onClick={() => setBulkPricePercent(val)}
                                    className="py-1.5 text-[10px] font-bold border border-white/10 rounded bg-white/5 text-[#8E9299] hover:text-white transition-colors"
                                >
                                    {val > 0 ? '+' : ''}{val}%
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <button 
                            onClick={() => setIsBulkPriceModalOpen(false)}
                            className="py-3 bg-white/5 text-[#8E9299] rounded-xl font-medium hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleBulkPriceUpdate}
                            disabled={bulkPricePercent === 0}
                            className="py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                            Apply Adjust
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isReportModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#151619] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
                >
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-medium text-white">Stock Reports</h3>
                        <button onClick={() => setIsReportModalOpen(false)} className="text-[#8E9299] hover:text-white"><X className="w-5 h-5"/></button>
                    </div>

                    <div className="space-y-4">
                        {/* WhatsApp / Text Sharing */}
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="text-emerald-500 font-medium font-sans">Share Text Report</h4>
                                    <p className="text-[10px] text-emerald-500/60 uppercase font-mono tracking-wider">Fast summary to WhatsApp</p>
                                </div>
                                <Send className="w-5 h-5 text-emerald-500" />
                            </div>
                            
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-[#8E9299] uppercase font-mono ml-1">Admin/Owner Number</label>
                                    <input 
                                        type="text"
                                        value={whatsappRecipient}
                                        onChange={(e) => setWhatsappRecipient(e.target.value)}
                                        placeholder="94779468940"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => handleWhatsAppReport('full')}
                                        className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
                                    >
                                        Share Full Text
                                    </button>
                                    <button 
                                        onClick={() => handleWhatsAppReport('low')}
                                        className="flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-500 py-2.5 rounded-lg text-xs font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                                    >
                                        Share Low Alert
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* View/Print Section - UNIFIED FOR ALL REPORTS */}
                        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-4">
                            <div>
                                <h4 className="text-white font-medium font-sans">Full Documents</h4>
                                <p className="text-[10px] text-[#8E9299] uppercase font-mono tracking-wider">High-quality preview & printing</p>
                            </div>
                            
                            <div className="space-y-3">
                                <button 
                                    onClick={() => handlePrintReport('report-print-area', 'Full Inventory Report')}
                                    className="w-full flex items-center justify-center gap-2 bg-white text-[#151619] py-3 rounded-xl text-sm font-bold hover:bg-[#E4E3E0] transition-all shadow-xl"
                                >
                                    <FileText className="w-4.5 h-4.5" />
                                    View Full Inventory Report
                                </button>
                                
                                <button 
                                    onClick={() => handlePrintReport('low-stock-print-area', 'Low Stock Report')}
                                    className="w-full flex items-center justify-center gap-2 bg-white/5 text-white py-3 rounded-xl text-sm font-bold hover:bg-white/10 transition-all border border-white/10"
                                >
                                    <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                                    View Low Stock Alert List
                                </button>

                                <div className="pt-4 mt-6 border-t border-white/5">
                                    <button 
                                        onClick={() => {
                                            setIsReportModalOpen(false);
                                            setConfirmClearAll(true);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 text-red-500/60 hover:text-red-500 transition-colors text-[10px] uppercase font-mono font-bold"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Clean All Inventory
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}
