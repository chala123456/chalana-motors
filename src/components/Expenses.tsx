import React, { useState } from 'react';
import { Expense } from '../types';
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Search, Plus, Receipt, Calendar, Tag, Trash2, Edit2, X, ArrowUpRight } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface ExpensesProps {
  expenses: Expense[];
  loading: boolean;
}

const CATEGORIES = ['Rent', 'Electricity', 'Water', 'Staff Salary', 'Tools', 'Inventory Purchase', 'Marketing', 'Taxes', 'Others'];

export function Expenses({ expenses, loading }: ExpensesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: 0,
    category: 'Others',
    date: new Date().toISOString().split('T')[0]
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const handleClearAllExpenses = async () => {
    if (!auth.currentUser || expenses.length === 0) return;
    
    setIsClearingAll(true);
    try {
      const batchSize = 500;
      for (let i = 0; i < expenses.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = expenses.slice(i, i + batchSize);
        chunk.forEach(exp => {
          batch.delete(doc(db, 'expenses', exp.id));
        });
        await batch.commit();
      }
      setConfirmClearAll(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'expenses/all');
    } finally {
      setIsClearingAll(false);
    }
  };

  const filteredExpenses = expenses
    .filter(e => 
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      if (editingExpense) {
        await updateDoc(doc(db, 'expenses', editingExpense.id), {
          ...newExpense
        });
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...newExpense,
          userId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
      }
      setIsAdding(false);
      setConfirmDeleteId(null);
      setEditingExpense(null);
      setNewExpense({ description: '', amount: 0, category: 'Others', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      handleFirestoreError(err, editingExpense ? OperationType.UPDATE : OperationType.CREATE, editingExpense ? `expenses/${editingExpense.id}` : 'expenses');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', id));
      setConfirmDeleteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
    }
  };

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setNewExpense({
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      date: expense.date
    });
    setIsAdding(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-sans font-medium text-white tracking-tight">Expense Tracking</h2>
          <p className="text-[#8E9299] text-sm mt-1">Monitor your business spending</p>
        </div>
        <div className="flex items-center space-x-3">
            <button 
                onClick={() => setConfirmClearAll(true)}
                disabled={isClearingAll || expenses.length === 0}
                className={cn(
                    "px-5 py-3 rounded-xl text-xs font-bold border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-all active:scale-95 disabled:opacity-50 shadow-lg",
                    isClearingAll && "animate-pulse"
                )}
            >
                {isClearingAll ? 'Clearing...' : 'Clear All Expenses'}
            </button>
            <button 
                onClick={() => {
                    setIsAdding(true);
                    setEditingExpense(null);
                    setNewExpense({ description: '', amount: 0, category: 'Others', date: new Date().toISOString().split('T')[0] });
                }}
                className="bg-white text-[#0a0a0a] px-6 py-3 rounded-xl font-bold flex items-center space-x-2 hover:bg-[#E4E3E0] transition-all transform active:scale-95 shadow-xl"
            >
                <Plus className="w-5 h-5" />
                <span>Add Expense</span>
            </button>
        </div>
      </div>

      <AnimatePresence>
        {confirmClearAll && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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
                        <h3 className="text-xl font-medium text-white italic-serif">Delete All Expenses?</h3>
                        <p className="text-[#8E9299] text-sm leading-relaxed">
                            This will permanantly delete all <span className="text-white font-bold">{expenses.length} expense records</span>. This action cannot be undone.
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
                            onClick={handleClearAllExpenses}
                            className="py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                        >
                            Yes, Delete All
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
            <div className="bg-[#151619] border border-[#141414] rounded-2xl p-6">
                <p className="text-[10px] text-[#8E9299] uppercase tracking-[0.2em] font-mono font-bold mb-4 flex items-center">
                    <Receipt className="w-3 h-3 mr-2" />
                    Total Expenses
                </p>
                <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-mono text-red-500">-</span>
                    <span className="text-4xl font-sans font-medium text-white tracking-tighter">{formatCurrency(totalExpenses)}</span>
                </div>
                <p className="text-[10px] text-[#8E9299] mt-4 uppercase tracking-widest leading-relaxed">Based on current filtered list</p>
            </div>

            <div className="bg-[#151619] border border-[#141414] rounded-2xl p-6">
                <p className="text-[10px] text-[#8E9299] uppercase tracking-[0.2em] font-mono font-bold mb-4 flex items-center">
                    <Tag className="w-3 h-3 mr-2" />
                    Categories
                </p>
                <div className="space-y-3">
                    {CATEGORIES.map(cat => {
                        const catTotal = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
                        if (catTotal === 0) return null;
                        const percentage = totalExpenses > 0 ? (catTotal / totalExpenses) * 100 : 0;
                        return (
                            <div key={cat} className="space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-white/70 italic uppercase tracking-wider">{cat}</span>
                                    <span className="text-white font-mono">{formatCurrency(catTotal)}</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-red-500/50 rounded-full transition-all duration-500" 
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        <div className="md:col-span-2 space-y-4">
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
                <input 
                    type="text"
                    placeholder="Search expenses by description or category..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-[#151619] border border-[#141414] rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/10 transition-all shadow-inner"
                />
            </div>

            <div className="bg-[#151619] border border-[#141414] rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5">
                            <th className="px-6 py-4 text-[10px] text-[#8E9299] uppercase tracking-widest font-mono font-bold">Date</th>
                            <th className="px-6 py-4 text-[10px] text-[#8E9299] uppercase tracking-widest font-mono font-bold">Description</th>
                            <th className="px-6 py-4 text-[10px] text-[#8E9299] uppercase tracking-widest font-mono font-bold text-right">Amount</th>
                            <th className="px-6 py-4 text-[10px] text-[#8E9299] uppercase tracking-widest font-mono font-bold text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
                            <tr key={expense.id} className="hover:bg-white/[0.01] transition-colors group text-sm">
                                <td className="px-6 py-4 text-[#8E9299] font-mono text-xs whitespace-nowrap">
                                    {expense.date}
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-white font-medium">{expense.description}</p>
                                    <span className="text-[10px] text-[#8E9299] uppercase tracking-wider">{expense.category}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="text-white font-mono font-medium">{formatCurrency(expense.amount)}</span>
                                </td>
                                <td className="px-6 py-4">
                                            <div className="flex items-center justify-center space-x-2">
                                                {confirmDeleteId === expense.id ? (
                                                    <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-2">
                                                        <button 
                                                            onClick={() => handleDeleteExpense(expense.id)}
                                                            className="px-4 py-2 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                                                        >
                                                            CONFIRM
                                                        </button>
                                                        <button 
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="p-2 text-[#8E9299] hover:text-white"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button 
                                                            onClick={() => openEdit(expense)}
                                                            className="p-2.5 hover:bg-white/10 rounded-lg transition-colors text-[#8E9299] hover:text-white"
                                                            title="Edit Expense"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => setConfirmDeleteId(expense.id)}
                                                            className="p-2.5 hover:bg-red-500/10 rounded-lg transition-colors text-[#8E9299] hover:text-red-500"
                                                            title="Delete Expense"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-[#8E9299] italic italic-serif">No expense records found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-[#0a0a0a]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#151619] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-xl font-medium text-white">{editingExpense ? 'Edit' : 'Add'} Expense</h3>
                <button onClick={() => setIsAdding(false)} className="text-[#8E9299] hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Description</label>
                    <input 
                      required
                      value={newExpense.description}
                      onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                      className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
                      placeholder="e.g. Electricity Bill May"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Amount</label>
                      <input 
                        type="number"
                        required
                        value={newExpense.amount || ''}
                        onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})}
                        className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Date</label>
                      <input 
                        type="date"
                        required
                        value={newExpense.date}
                        onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                        className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Category</label>
                    <select 
                      value={newExpense.category}
                      onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                      className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-6 flex space-x-3">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 bg-white/5 py-3 rounded-xl font-medium text-white hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-white py-3 rounded-xl font-medium text-[#0a0a0a] hover:bg-[#E4E3E0] transition-all transform active:scale-95 shadow-lg"
                  >
                    {editingExpense ? 'Update Record' : 'Save Expense'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
