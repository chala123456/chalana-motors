import React, { useState } from 'react';
import { Customer, RepairJob } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Search, Plus, User, Phone, MapPin, Calendar, Wrench, MoreVertical, X, Edit2, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CustomersProps {
  customers: Customer[];
  loading: boolean;
  jobs: RepairJob[];
}

export function Customers({ customers, loading, jobs }: CustomersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    customerName: '',
    contactNumber: '',
    email: '',
    address: '',
    vehicleNumbers: [] as string[]
  });

  const filteredCustomers = customers.filter(c => 
    c.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.contactNumber.includes(searchTerm) ||
    c.vehicleNumbers?.some(v => v.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), {
          ...newCustomer,
          vehicleNumbers: newCustomer.vehicleNumbers.filter(v => v.trim() !== '')
        });
      } else {
        await addDoc(collection(db, 'customers'), {
          ...newCustomer,
          vehicleNumbers: newCustomer.vehicleNumbers.filter(v => v.trim() !== ''),
          userId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
      }
      setIsAdding(false);
      setEditingCustomer(null);
      setNewCustomer({ customerName: '', contactNumber: '', email: '', address: '', vehicleNumbers: [] });
    } catch (err) {
      handleFirestoreError(err, editingCustomer ? OperationType.UPDATE : OperationType.CREATE, editingCustomer ? `customers/${editingCustomer.id}` : 'customers');
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (confirm('Are you sure you want to delete this customer?')) {
      try {
        await deleteDoc(doc(db, 'customers', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `customers/${id}`);
      }
    }
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setNewCustomer({
      customerName: customer.customerName,
      contactNumber: customer.contactNumber,
      email: customer.email || '',
      address: customer.address || '',
      vehicleNumbers: customer.vehicleNumbers || []
    });
    setIsAdding(true);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 min-h-screen pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-sans font-medium text-white tracking-tight">Customer Database</h2>
          <p className="text-[#8E9299] text-sm mt-1">Manage and track your client history</p>
        </div>
        <button 
          onClick={() => {
            setIsAdding(true);
            setEditingCustomer(null);
            setNewCustomer({ customerName: '', contactNumber: '', email: '', address: '', vehicleNumbers: [] });
          }}
          className="w-full sm:w-auto bg-white text-[#0a0a0a] px-5 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-[#E4E3E0] transition-all transform active:scale-95 shadow-xl"
        >
          <Plus className="w-5 h-5" />
          <span>New Customer</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
        <input 
          type="text"
          placeholder="Search by name, phone, or vehicle..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-[#151619] border border-[#141414] rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/10 transition-all shadow-inner"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {filteredCustomers.map((customer) => {
          const customerJobs = jobs.filter(j => j.contactNumber === customer.contactNumber);
          const lastVisit = customerJobs.length > 0 
            ? new Date(customerJobs[0].createdAt).toLocaleDateString()
            : 'No visits';

          return (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={customer.id}
              className="bg-[#151619] border border-[#141414] rounded-2xl p-6 hover:shadow-2xl transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 flex space-x-2">
                <button 
                  onClick={() => openEdit(customer)}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-[#8E9299] hover:text-white transition-all"
                  title="Edit Customer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeleteCustomer(customer.id)}
                  className="p-2 bg-white/5 hover:bg-red-500/10 rounded-lg text-[#8E9299] hover:text-red-500 transition-all"
                  title="Delete Customer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/5 group-hover:bg-white/10 transition-colors">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-medium text-lg leading-tight">{customer.customerName}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <Phone className="w-3 h-3 text-[#8E9299]" />
                    <span className="text-xs text-[#8E9299]">{customer.contactNumber}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {customer.email && (
                  <div className="flex items-center space-x-3 text-xs text-[#8E9299]">
                    <span className="w-20 uppercase tracking-widest text-[10px] opacity-50">Email</span>
                    <span className="text-white/80">{customer.email}</span>
                  </div>
                )}
                <div className="flex items-center space-x-3 text-xs text-[#8E9299]">
                  <span className="w-20 uppercase tracking-widest text-[10px] opacity-50">Vehicles</span>
                  <div className="flex flex-wrap gap-1">
                    {(customer.vehicleNumbers && customer.vehicleNumbers.length > 0) ? customer.vehicleNumbers.map(v => (
                      <span key={v} className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-white font-mono">{v}</span>
                    )) : <span className="text-white/30 italic">None registered</span>}
                  </div>
                </div>
                <div className="flex items-center space-x-3 text-xs text-[#8E9299]">
                  <span className="w-20 uppercase tracking-widest text-[10px] opacity-50">Last Visit</span>
                  <span className="text-white/80">{lastVisit}</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wrench className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-white/50">{customerJobs.length} Services Done</span>
                </div>
                <div className="text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">
                  REF: {customer.id.slice(-6).toUpperCase()}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-[#0a0a0a]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#151619] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-xl font-medium text-white">{editingCustomer ? 'Edit' : 'New'} Customer</h3>
                <button onClick={() => setIsAdding(false)} className="text-[#8E9299] hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Name</label>
                      <input 
                        required
                        value={newCustomer.customerName}
                        onChange={e => setNewCustomer({...newCustomer, customerName: e.target.value})}
                        className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
                        placeholder="Customer Full Name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Contact</label>
                      <input 
                        required
                        value={newCustomer.contactNumber}
                        onChange={e => setNewCustomer({...newCustomer, contactNumber: e.target.value})}
                        className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
                        placeholder="Phone Number"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Email (Optional)</label>
                    <input 
                      type="email"
                      value={newCustomer.email}
                      onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                      className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Address (Optional)</label>
                    <textarea 
                      value={newCustomer.address}
                      onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                      className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans resize-none h-20"
                      placeholder="Home or Work Address"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#8E9299] uppercase tracking-widest font-mono ml-1">Vehicle Numbers</label>
                    <div className="flex flex-wrap gap-2">
                      {newCustomer.vehicleNumbers.map((v, i) => (
                        <div key={i} className="flex items-center bg-white/5 rounded-lg border border-white/5 px-2 py-1">
                          <span className="text-xs text-white uppercase font-mono">{v}</span>
                          <button 
                            type="button"
                            onClick={() => setNewCustomer({
                              ...newCustomer, 
                              vehicleNumbers: newCustomer.vehicleNumbers.filter((_, idx) => idx !== i)
                            })}
                            className="ml-2 text-[#8E9299] hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2 mt-2">
                       <input 
                          id="new-vehicle"
                          placeholder="e.g. WP ABC-1234"
                          className="flex-1 bg-[#0a0a0a] border border-white/5 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono uppercase"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (e.currentTarget as HTMLInputElement).value.trim();
                              if (val) {
                                setNewCustomer({...newCustomer, vehicleNumbers: [...newCustomer.vehicleNumbers, val]});
                                (e.currentTarget as HTMLInputElement).value = '';
                              }
                            }
                          }}
                       />
                       <button 
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('new-vehicle') as HTMLInputElement;
                            const val = input.value.trim();
                            if (val) {
                              setNewCustomer({...newCustomer, vehicleNumbers: [...newCustomer.vehicleNumbers, val]});
                              input.value = '';
                            }
                          }}
                          className="bg-white/5 px-4 py-2 rounded-xl text-white hover:bg-white/10 transition-all"
                       >
                         <Plus className="w-4 h-4" />
                       </button>
                    </div>
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
                    {editingCustomer ? 'Save Changes' : 'Create Customer'}
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
