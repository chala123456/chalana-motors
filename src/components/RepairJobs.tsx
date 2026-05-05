import React, { useState } from 'react';
import { Wrench, Plus, User, Phone, Car, Search, Save, X, History, ChevronRight, Check, Printer, Edit2, Calendar } from 'lucide-react';
import { RepairJob, JobStatus, Part, UsedPart } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { addDoc, collection, doc, updateDoc, serverTimestamp, increment, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface RepairJobsProps {
  jobs: RepairJob[];
  inventory: Part[];
  loading: boolean;
}

export function RepairJobs({ jobs, inventory, loading }: RepairJobsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [partSearchTerm, setPartSearchTerm] = useState('');
  
  const [newJob, setNewJob] = useState({
    customerName: '',
    contactNumber: '',
    vehicleNumber: '',
    vehicleModel: '',
    issue: '', // General description
    services: [] as { description: string; price: number }[],
    currentKm: '',
    nextServiceDate: '',
    repairFee: 0,
    status: JobStatus.PENDING
  });
  const [currentService, setCurrentService] = useState('');
  const [currentServicePrice, setCurrentServicePrice] = useState<number>(0);

  const generateJobRef = () => {
    return `CM-${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const filteredJobs = jobs.filter(j => {
    const matchesSearch = j.vehicleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.jobRef?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = !dateFilter || (j.createdAt && j.createdAt.startsWith(dateFilter));
    
    return matchesSearch && matchesDate;
  });

  const handleAddService = () => {
    if (currentService.trim()) {
      const updatedServices = [
        ...newJob.services, 
        { description: currentService.trim(), price: currentServicePrice || 0 }
      ];
      // Auto-calculate repair fee based on services
      const newRepairFee = updatedServices.reduce((sum, s) => sum + s.price, 0);
      setNewJob({ 
        ...newJob, 
        services: updatedServices,
        repairFee: newRepairFee
      });
      setCurrentService('');
      setCurrentServicePrice(0);
    }
  };

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const jobRefCode = generateJobRef();
      const finalServices = newJob.services.length > 0 
        ? newJob.services 
        : (newJob.issue ? [{ description: newJob.issue, price: newJob.repairFee }] : []);

      await addDoc(collection(db, 'jobs'), {
        ...newJob,
        jobRef: jobRefCode,
        services: finalServices,
        partsUsed: [],
        totalPartsCost: 0,
        profit: newJob.repairFee,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      setIsAdding(false);
      setNewJob({
        customerName: '',
        contactNumber: '',
        vehicleNumber: '',
        vehicleModel: '',
        issue: '',
        services: [],
        currentKm: '',
        nextServiceDate: '',
        repairFee: 0,
        status: JobStatus.PENDING
      });
      setCurrentService('');
      setCurrentServicePrice(0);
    } catch (err) {
      console.error("Error adding job:", err);
    }
  };

  const handleEditJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !newJob) return;

    try {
      const job = jobs.find(j => j.id === selectedJobId);
      if (!job) return;

      const totalPartsCost = job.totalPartsCost || 0;
      const profit = newJob.repairFee - totalPartsCost;

      await updateDoc(doc(db, 'jobs', selectedJobId), {
        ...newJob,
        profit
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Error editing job:", err);
    }
  };

  const startEdit = (job: RepairJob) => {
    setNewJob({
      customerName: job.customerName,
      contactNumber: job.contactNumber,
      vehicleNumber: job.vehicleNumber,
      vehicleModel: job.vehicleModel,
      issue: job.issue || '',
      services: job.services || [],
      currentKm: job.currentKm || '',
      nextServiceDate: job.nextServiceDate || '',
      repairFee: job.repairFee,
      status: job.status
    });
    setIsEditing(true);
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const addPartToJob = async (partId: string) => {
    if (!selectedJob) return;
    const part = inventory.find(p => p.id === partId);
    if (!part || part.quantity <= 0) return;

    const usedPart: UsedPart = {
      partId: part.id,
      name: part.name,
      quantity: 1,
      costAtTime: part.costPrice
    };

    const updatedParts = [...selectedJob.partsUsed, usedPart];
    const totalPartsCost = updatedParts.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0);
    const profit = selectedJob.repairFee - totalPartsCost;

    try {
      const jobRef = doc(db, 'jobs', selectedJob.id);
      await updateDoc(jobRef, {
        partsUsed: updatedParts,
        totalPartsCost,
        profit
      });
      
      // Update inventory
      const partRef = doc(db, 'inventory', partId);
      await updateDoc(partRef, {
        quantity: increment(-1)
      });
    } catch (err) {
      console.error("Error adding part to job:", err);
    }
  };

  const updateJobStatus = async (jobId: string, status: JobStatus) => {
      const job = jobs.find(j => j.id === jobId);
      if (!job || !auth.currentUser) return;

      try {
          await updateDoc(doc(db, 'jobs', jobId), { status });
          
          // Daily Summary Logic
          if (status === JobStatus.COMPLETED && job.status !== JobStatus.COMPLETED) {
              const today = new Date().toISOString().split('T')[0];
              const summaryRef = doc(db, 'daily_summaries', `${today}_${auth.currentUser.uid}`);
              
              const summarySnap = await getDoc(summaryRef);
              if (summarySnap.exists()) {
                  await updateDoc(summaryRef, {
                      totalRevenue: increment(job.repairFee),
                      totalProfit: increment(job.profit || 0),
                      jobCount: increment(1),
                      lastUpdated: serverTimestamp()
                  });
              } else {
                  await setDoc(summaryRef, {
                      id: today,
                      userId: auth.currentUser.uid,
                      totalRevenue: job.repairFee,
                      totalProfit: job.profit || 0,
                      jobCount: 1,
                      lastUpdated: serverTimestamp()
                  });
              }
          }
      } catch (err) {
          console.error("Error updating status:", err);
      }
  };

  const handlePrint = () => {
      if (!selectedJob) return;
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const html = `
        <html>
          <head>
            <title>Invoice - ${selectedJob.jobRef}</title>
            <style>
              @page { margin: 0; size: 80mm auto; }
              body { 
                font-family: 'Courier New', Courier, monospace; 
                width: 72mm; 
                margin: 0 auto; 
                padding: 10px; 
                color: #000;
                font-size: 13px;
                line-height: 1.4;
              }
              .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; }
              .dealer { font-size: 22px; font-weight: 800; text-transform: uppercase; margin-bottom: 2px; letter-spacing: -1px; }
              .sub-header { font-size: 10px; font-weight: bold; margin-bottom: 5px; }
              
              .details { margin-bottom: 12px; font-size: 12px; }
              .details-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
              .label { font-weight: bold; text-transform: uppercase; font-size: 9px; margin-top: 6px; display: block; border-bottom: 1px dashed #000; padding-bottom: 2px; margin-bottom: 4px; }

              table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
              th { text-align: left; border-bottom: 2px solid #000; padding-bottom: 4px; font-size: 10px; }
              td { padding: 8px 0; border-bottom: 1px solid #eee; }
              
              .totals { border-top: 2px solid #000; padding-top: 8px; margin-top: 5px; }
              .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
              .grand-total { font-size: 18px; font-weight: 800; margin-top: 4px; border-top: 4px double #000; padding-top: 6px; }
              
              .extra-info { background: #000; color: #fff; padding: 10px; margin: 12px 0; border-radius: 4px; font-size: 11px; -webkit-print-color-adjust: exact; }

              .footer { text-align: center; margin-top: 25px; font-size: 11px; border-top: 1px solid #000; padding-top: 15px; }
              .barcode { font-size: 10px; margin: 10px 0; font-family: monospace; letter-spacing: 3px; font-weight: bold; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="dealer">CHALANA MOTORS</div>
              <div class="sub-header" style="letter-spacing: 2px;">Professional Service for Your Ride</div>
            </div>
            
            <div class="details">
              <div class="details-row"><span>DATE:</span> <span>${new Date().toLocaleDateString()}</span></div>
              <div class="details-row"><span>TIME:</span> <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
              
              <div style="margin-top: 10px; border: 1px solid #000; border-radius: 4px; overflow: hidden;">
                <div style="background: #000; color: #fff; padding: 2px 8px; font-size: 10px; font-weight: bold; -webkit-print-color-adjust: exact;">VEHICLE</div>
                <div style="padding: 5px 8px;">
                    <div style="font-weight: 900; font-size: 20px;">${selectedJob.vehicleNumber}</div>
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: bold;">${selectedJob.vehicleModel}</div>
                </div>
              </div>

              <div style="margin-top: 8px; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                <div style="background: #eee; color: #000; padding: 2px 8px; font-size: 10px; font-weight: bold; border-bottom: 1px solid #ccc; -webkit-print-color-adjust: exact;">CUSTOMER</div>
                <div style="padding: 5px 8px;">
                    <div style="font-weight: bold; font-size: 14px;">${selectedJob.customerName.toUpperCase()}</div>
                    <div style="font-size: 11px;">TEL: ${selectedJob.contactNumber}</div>
                </div>
              </div>

              ${selectedJob.nextServiceDate ? `
              <div class="extra-info">
                <div class="details-row" style="font-weight: 800; font-size: 14px;">
                    <span>NEXT SERVICE:</span> 
                    <span>${selectedJob.nextServiceDate} ${selectedJob.nextServiceDate.match(/\d+/) ? 'KM' : ''}</span>
                </div>
              </div>
              ` : ''}
            </div>

            <table>
              <thead>
                <tr>
                  <th colspan="2" style="border-bottom: 2px solid #000; padding: 10px 0 5px 0; font-size: 11px;">SERVICES & LABOR</th>
                </tr>
                <tr>
                  <th style="font-size: 10px;">Item</th>
                  <th style="text-align: right; font-size: 10px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${(selectedJob.services && selectedJob.services.length > 0) ? 
                  selectedJob.services.map(s => `
                    <tr>
                      <td style="padding-right: 5px; font-weight: bold;">${s.description}</td>
                      <td style="text-align: right; font-weight: bold;">${formatCurrency(s.price)}</td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td style="font-weight: bold;">SERVICE CHARGE</td>
                      <td style="text-align: right; font-weight: bold;">${formatCurrency(selectedJob.repairFee)}</td>
                    </tr>
                `}
              </tbody>
              ${selectedJob.partsUsed && selectedJob.partsUsed.length > 0 ? `
              <thead>
                <tr>
                  <th colspan="2" style="border-bottom: 2px solid #000; padding: 15px 0 5px 0; font-size: 11px;">SPARE PARTS</th>
                </tr>
              </thead>
              <tbody>
                ${selectedJob.partsUsed.map(p => `
                  <tr>
                    <td style="padding-right: 5px; font-size: 11px;">${p.name.toUpperCase()} (x${p.quantity})</td>
                    <td style="text-align: right;">${formatCurrency(p.costAtTime * p.quantity)}</td>
                  </tr>
                `).join('')}
              </tbody>
              ` : ''}
            </table>

            <div class="totals">
              <div class="total-row grand-total">
                <span>NET TOTAL</span>
                <span>${formatCurrency(selectedJob.repairFee + (selectedJob.totalPartsCost || 0))}</span>
              </div>
            </div>

            <div class="footer">
              <div style="font-weight: 900; font-size: 15px; margin-bottom: 5px; letter-spacing: 1px;">THANK YOU, COME AGAIN!</div>
              <div style="font-size: 10px; border: 1px solid #000; display: inline-block; padding: 2px 10px; margin-top: 5px;">Professional Service for Your Ride</div>
              <div class="barcode">|||||||||||||||||||||||||</div>
              <div style="margin-top: 8px; font-size: 10px; font-weight: bold;">SERVICE REF: ${selectedJob.id.substring(0, 12).toUpperCase()}</div>
            </div>
            
            <script>
                window.onload = () => {
                    window.print();
                    setTimeout(() => window.close(), 200);
                }
            </script>
          </body>
        </html>
      `;
      
      printWindow.document.write(html);
      printWindow.document.close();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 h-full">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-sans font-medium text-white tracking-tight">Repair Jobs</h2>
          <p className="text-[#8E9299] text-sm mt-1">Track customer repairs and monitor profitability.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-white text-[#151619] px-4 py-2 rounded-lg font-medium text-sm flex items-center space-x-2 hover:bg-[#E4E3E0] transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Repair Job</span>
        </button>
      </header>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/2 space-y-4">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
              <input 
                type="text"
                placeholder="Search vehicle or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#151619] border border-[#141414] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
              />
            </div>
            <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9299]" />
                <input 
                    type="date"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    className="bg-[#151619] border border-[#141414] rounded-lg pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                    title="Filter by Date"
                />
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-320px)] pr-2 scrollbar-hide">
          <AnimatePresence>
            {(isAdding || isEditing) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#151619] p-6 rounded-xl border border-white/20 shadow-2xl"
              >
                <form onSubmit={isEditing ? handleEditJob : handleAddJob} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-white font-medium text-sm">{isEditing ? 'Edit Job' : 'Customer Details'}</h3>
                    <button type="button" onClick={() => { setIsAdding(false); setIsEditing(false); }} className="text-[#8E9299] hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input 
                      required placeholder="Customer Name"
                      value={newJob.customerName}
                      onChange={e => setNewJob({...newJob, customerName: e.target.value})}
                      className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                    />
                    <input 
                      required placeholder="Contact Number"
                      value={newJob.contactNumber}
                      onChange={e => setNewJob({...newJob, contactNumber: e.target.value})}
                      className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input 
                      required placeholder="Vehicle Number"
                      value={newJob.vehicleNumber}
                      onChange={e => setNewJob({...newJob, vehicleNumber: e.target.value})}
                      className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                    />
                    <input 
                      required placeholder="Vehicle Model"
                      value={newJob.vehicleModel}
                      onChange={e => setNewJob({...newJob, vehicleModel: e.target.value})}
                      className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-[#8E9299] uppercase font-mono">Current KM</label>
                        <input 
                            placeholder="e.g. 45000"
                            value={newJob.currentKm}
                            onChange={e => setNewJob({...newJob, currentKm: e.target.value})}
                            className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[#8E9299] uppercase font-mono">Next Service</label>
                        <input 
                            placeholder="e.g. 50000 KM or Date"
                            value={newJob.nextServiceDate}
                            onChange={e => setNewJob({...newJob, nextServiceDate: e.target.value})}
                            className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                        />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-col space-y-2">
                         <label className="text-[10px] text-[#8E9299] uppercase font-mono">Add Services & Prices</label>
                         <div className="flex space-x-2">
                             <input 
                                placeholder="Service Name"
                                value={currentService}
                                onChange={e => setCurrentService(e.target.value)}
                                className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-1.5 text-xs text-white flex-1"
                             />
                             <input 
                                type="number"
                                placeholder="Price"
                                value={currentServicePrice || ''}
                                onChange={e => setCurrentServicePrice(parseFloat(e.target.value) || 0)}
                                className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-1.5 text-xs text-white w-24 font-mono"
                             />
                             <button 
                                type="button"
                                onClick={handleAddService}
                                className="bg-white/10 p-2 rounded text-white hover:bg-white/20"
                             >
                                <Plus className="w-4 h-4" />
                             </button>
                         </div>
                    </div>
                    {newJob.services.length > 0 && (
                        <div className="bg-[#1a1b1e] border border-white/5 rounded-lg overflow-hidden divide-y divide-white/5">
                            {newJob.services.map((s, i) => (
                                <div key={i} className="px-3 py-2 flex items-center justify-between group">
                                    <div className="flex-1">
                                        <p className="text-xs text-white">{s.description}</p>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <p className="text-xs font-mono text-emerald-500">{formatCurrency(s.price)}</p>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                const updated = newJob.services.filter((_, idx) => idx !== i);
                                                setNewJob({...newJob, services: updated, repairFee: updated.reduce((sum, s) => sum + s.price, 0)});
                                            }}
                                            className="text-[#8E9299] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <textarea 
                        placeholder="Additional Notes / General Issue..."
                        value={newJob.issue}
                        onChange={e => setNewJob({...newJob, issue: e.target.value})}
                        className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white h-20"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <label className="text-[10px] text-[#8E9299] uppercase font-mono mb-1 block">Repair Fee</label>
                      <input 
                        type="number" required
                        value={newJob.repairFee || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setNewJob({...newJob, repairFee: isNaN(val) ? 0 : val});
                        }}
                        className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <button type="submit" className="flex-1 bg-white text-[#151619] py-2.5 rounded-lg text-sm font-medium hover:bg-[#E4E3E0] mt-5">
                      {isEditing ? 'Update Job' : 'Create Job'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {filteredJobs.length === 0 ? (
            <div className="text-center py-12 bg-[#151619] rounded-xl border border-[#141414]">
               <Wrench className="w-8 h-8 text-[#141414] mx-auto mb-3" />
               <p className="text-[#8E9299] text-sm">No active repair jobs.</p>
            </div>
          ) : (
            filteredJobs.map(job => (
              <div 
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={cn(
                  "p-5 rounded-2xl border cursor-pointer transition-all duration-300 group relative overflow-hidden",
                  selectedJobId === job.id 
                    ? "bg-gradient-to-br from-[#1a1b1e] to-[#151619] border-white/20 shadow-2xl scale-[1.02]" 
                    : "bg-[#151619] border-[#141414] hover:bg-[#1a1b1e] hover:border-white/10"
                )}
              >
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <div className="flex items-center space-x-3">
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            job.status === JobStatus.COMPLETED ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                            job.status === JobStatus.ONGOING ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" :
                            "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                        )} />
                        <h4 className="text-white font-medium text-lg leading-tight uppercase font-mono tracking-tighter">{job.vehicleNumber}</h4>
                    </div>
                    <p className="text-[10px] text-[#8E9299] uppercase tracking-widest mt-1 ml-5">{job.vehicleModel} <span className="mx-1 opacity-20">•</span> {job.jobRef}</p>
                  </div>
                  <div className={cn(
                    "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                    job.status === JobStatus.COMPLETED ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                    job.status === JobStatus.ONGOING ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                    "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                  )}>
                    {job.status}
                  </div>
                </div>
                
                <div className="flex items-center space-x-6 text-[#8E9299] text-xs relative z-10 ml-5">
                  <div className="flex items-center space-x-2">
                    <User className="w-3.5 h-3.5 opacity-50" />
                    <span className="font-medium text-[#c0c2c5]">{job.customerName}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-3.5 h-3.5 opacity-50" />
                    <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="mt-5 flex justify-between items-end relative z-10 ml-5">
                   <div>
                       <p className="text-[9px] text-[#8E9299] uppercase tracking-widest">Est. Profit</p>
                       <p className={cn(
                           "text-base font-mono font-semibold",
                           job.profit >= 0 ? "text-emerald-400" : "text-red-400"
                       )}>
                           {formatCurrency(job.profit)}
                       </p>
                   </div>
                   <div className="flex items-center space-x-1 text-white/20 group-hover:text-white/40 transition-colors">
                        <span className="text-[9px] uppercase font-bold tracking-widest">Details</span>
                        <ChevronRight className="w-4 h-4" />
                   </div>
                </div>

                {selectedJobId === job.id && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-3xl rounded-full -mr-12 -mt-12" />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Job Detail / Actions Pane */}
      <div className="lg:flex-1 bg-[#151619] rounded-xl border border-[#141414] p-8 flex flex-col min-h-[500px]">
          {selectedJob ? (
            <div className="space-y-8 flex-1 flex flex-col">
              <header className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-sans font-medium text-white italic-serif">Job Details</h3>
                  <p className="text-[#8E9299] text-sm">{selectedJob.jobRef} • {selectedJob.vehicleNumber}</p>
                </div>
                <div className="flex items-center space-x-2">
                    {selectedJob.status !== JobStatus.COMPLETED && (
                        <button 
                            onClick={() => startEdit(selectedJob)}
                            className="bg-[#1a1b1e] border border-[#141414] p-2 rounded-lg text-[#8E9299] hover:text-white transition-all"
                            title="Edit Job Info"
                        >
                            <Edit2 className="w-3 h-3" />
                        </button>
                    )}
                    <button 
                        onClick={handlePrint}
                        className="px-3 py-1 rounded text-[10px] border border-[#141414] text-[#8E9299] hover:text-white flex items-center space-x-1"
                        title="Print Bill"
                    >
                        <Printer className="w-3 h-3" />
                        <span>Bill</span>
                    </button>
                    <button 
                        onClick={() => updateJobStatus(selectedJob.id, JobStatus.ONGOING)}
                        className={cn("px-3 py-1 rounded text-[10px] border border-[#141414] transition-all", selectedJob.status === JobStatus.ONGOING ? "bg-blue-500 text-white" : "text-[#8E9299] hover:text-white")}
                    >Start</button>
                    <button 
                        onClick={() => updateJobStatus(selectedJob.id, JobStatus.COMPLETED)}
                        className={cn("px-3 py-1 rounded text-[10px] border border-[#141414] transition-all", selectedJob.status === JobStatus.COMPLETED ? "bg-emerald-500 text-white" : "text-[#8E9299] hover:text-white")}
                    >Finish</button>
                </div>
              </header>

              <section className="bg-[#1a1b1e] rounded-lg p-4 border border-[#141414]">
                 <div className="flex justify-between items-center mb-3">
                    <p className="text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">Services Offered</p>
                    <div className="flex space-x-4">
                        {selectedJob.currentKm && (
                            <div className="text-right">
                                <p className="text-[8px] text-[#8E9299] uppercase">Current KM</p>
                                <p className="text-xs text-white font-mono">{selectedJob.currentKm}</p>
                            </div>
                        )}
                        {selectedJob.nextServiceDate && (
                            <div className="text-right">
                                <p className="text-[8px] text-[#8E9299] uppercase text-emerald-500">Next Service</p>
                                <p className="text-xs text-emerald-500 font-mono">{selectedJob.nextServiceDate}</p>
                            </div>
                        )}
                    </div>
                 </div>
                 <div className="space-y-2">
                     {(selectedJob.services && selectedJob.services.length > 0) ? (
                         selectedJob.services.map((s, i) => (
                             <div key={i} className="flex items-center justify-between text-white text-sm">
                                 <div className="flex items-center space-x-2">
                                     <div className="w-1 h-1 bg-white/20 rounded-full" />
                                     <span>{s.description}</span>
                                 </div>
                                 <span className="font-mono text-emerald-500">{formatCurrency(s.price)}</span>
                             </div>
                         ))
                     ) : (
                        <p className="text-white text-sm italic">{selectedJob.issue}</p>
                     )}
                     {selectedJob.services && selectedJob.services.length > 0 && selectedJob.issue && (
                         <p className="text-[#8E9299] text-[10px] mt-3 italic pt-3 border-t border-white/5">{selectedJob.issue}</p>
                     )}
                 </div>
              </section>

              <section className="flex-1 space-y-4">
                <div className="flex flex-col space-y-3">
                    <p className="text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">Search & Add Spare Parts</p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E9299]" />
                        <input 
                            type="text"
                            placeholder="Type part name or bike model..."
                            value={partSearchTerm}
                            onChange={e => setPartSearchTerm(e.target.value)}
                            className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/10"
                        />
                        {partSearchTerm && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1b1e] border border-white/10 rounded-lg shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-white/5">
                                {inventory
                                    .filter(p => 
                                        p.name.toLowerCase().includes(partSearchTerm.toLowerCase()) || 
                                        (p.category && p.category.toLowerCase().includes(partSearchTerm.toLowerCase()))
                                    )
                                    .slice(0, 10)
                                    .map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => {
                                                addPartToJob(p.id);
                                                setPartSearchTerm('');
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-white/5 flex justify-between items-center transition-colors"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs text-white font-medium">{p.name}</span>
                                                <span className="text-[9px] text-[#8E9299] uppercase">{p.category}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-emerald-500 font-mono">{formatCurrency(p.costPrice)}</p>
                                                <p className={cn("text-[9px] font-bold", p.quantity > 5 ? "text-emerald-500/50" : "text-amber-500")}>STOCK: {p.quantity}</p>
                                            </div>
                                        </button>
                                    ))}
                                {inventory.filter(p => p.name.toLowerCase().includes(partSearchTerm.toLowerCase())).length === 0 && (
                                    <div className="px-4 py-3 text-xs text-[#8E9299] text-center italic">No matching parts found in inventory.</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="space-y-2">
                    <p className="text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">Parts on this Bill</p>
                    {selectedJob.partsUsed.length === 0 ? (
                        <p className="text-[10px] text-[#8E9299] text-center py-4 italic bg-[#1a1b1e]/30 rounded-lg">No parts added yet. Use the search bar above.</p>
                    ) : (
                        selectedJob.partsUsed.map((p, i) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-[#1a1b1e] rounded-xl border border-white/5 group hover:border-white/10 transition-all">
                                <div>
                                    <p className="text-[11px] text-white font-medium">{p.name}</p>
                                    <p className="text-[9px] text-[#8E9299] font-mono mt-0.5">{formatCurrency(p.costAtTime)} x {p.quantity}</p>
                                </div>
                                <p className="text-xs text-white font-mono font-semibold">{formatCurrency(p.costAtTime * p.quantity)}</p>
                            </div>
                        ))
                    )}
                </div>
              </section>

              <footer className="pt-6 border-t border-[#141414] grid grid-cols-3 gap-4">
                  <div>
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono">Service Fee</p>
                      <p className="text-sm text-white font-mono">{formatCurrency(selectedJob.repairFee)}</p>
                  </div>
                  <div>
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono">Parts Cost</p>
                      <p className="text-sm text-red-400 font-mono">-{formatCurrency(selectedJob.totalPartsCost)}</p>
                  </div>
                  <div className="text-right">
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono">Net Profit</p>
                      <p className={cn("text-lg font-mono", selectedJob.profit >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {formatCurrency(selectedJob.profit)}
                      </p>
                  </div>
              </footer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-[#1a1b1e] rounded-full flex items-center justify-center border border-[#141414]">
                    <Search className="w-6 h-6 text-[#8E9299]" />
                </div>
                <div>
                   <p className="text-white font-medium italic-serif">No Job Selected</p>
                   <p className="text-[#8E9299] text-[10px] max-w-[200px]">Select a job from the list to manage parts, update status, and view profitability.</p>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
