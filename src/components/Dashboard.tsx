import React, { useState, useEffect } from 'react';
import { TrendingUp, Wrench, AlertTriangle, DollarSign, Check } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { RepairJob, Part, JobStatus, Expense } from '../types';
import { motion } from 'motion/react';
import { deleteDoc, doc, writeBatch, collection, query, limit, onSnapshot } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';

interface DashboardProps {
  jobs: RepairJob[];
  inventory: Part[];
  expenses: Expense[];
}

export function Dashboard({ jobs, inventory, expenses }: DashboardProps) {
  const [isClearing, setIsClearing] = useState(false);
  const [dbStats, setDbStats] = useState<{ netProfit?: number; totalRevenue?: number } | null>(null);

  useEffect(() => {
    // Real-time listener for chalana_stats as requested
    const q = query(collection(db, 'chalana_stats'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setDbStats({
          netProfit: Number(data.netProfit || 0),
          totalRevenue: Number(data.totalRevenue || 0)
        });
      }
    }, (err) => {
      // Non-blocking error for background sync
      console.error("Dashboard real-time sync failed:", err);
    });

    return () => unsubscribe();
  }, []);

  const handleClearHistory = async () => {
    if (!auth.currentUser || jobs.length === 0) {
      if (jobs.length === 0) alert('No records to clear.');
      return;
    }
    
    const count = jobs.length;
    if (!window.confirm(`DANGER: This will permanently delete ALL ${count} repair records. This cannot be undone. Proceed?`)) return;

    setIsClearing(true);
    try {
      // Batch deletes in chunks of 500 (Firestore limit)
      const chunks = [];
      for (let i = 0; i < jobs.length; i += 500) {
        chunks.push(jobs.slice(i, i + 500));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(job => {
          batch.delete(doc(db, 'jobs', job.id));
        });
        await batch.commit();
      }

      alert(`${count} records cleared successfully.`);
    } catch (err) {
      console.error("Clear history failed:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, 'jobs/all_dashboard');
      } catch (e) {
        // Fallback alert since handleFirestoreError only throws
        alert("Operation failed. This is likely due to permission issues or a connection error.");
      }
    } finally {
      setIsClearing(false);
    }
  };

  const [reportRange, setReportRange] = useState<'today' | 'week' | 'month'>('today');

  const now = new Date();
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const startOfWeek = new Date(new Date().setDate(now.getDate() - 7));
  const startOfMonth = new Date(new Date().setDate(now.getDate() - 30));

  const filteredJobs = jobs.filter(j => {
    const jobDate = new Date(j.createdAt);
    if (reportRange === 'today') {
      return jobDate >= startOfToday;
    }
    if (reportRange === 'week') {
        return jobDate >= startOfWeek;
    }
    return jobDate >= startOfMonth;
  });

  const completedJobs = filteredJobs.filter(j => j.status === JobStatus.COMPLETED);

  const serviceRevenue = completedJobs.reduce((sum, j) => sum + Number(j.repairFee || 0), 0);
  const partsRevenue = completedJobs.reduce((sum, j) => sum + Number(j.totalPartsCost || 0), 0);
  
  const totalRevenue = serviceRevenue + partsRevenue;
  
  const totalExpenseAmount = expenses
    .filter(e => {
      const eDate = new Date(e.date);
      if (reportRange === 'today') return eDate >= startOfToday;
      if (reportRange === 'week') return eDate >= startOfWeek;
      return eDate >= startOfMonth;
    })
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Net Profit = Labour Revenue - Expenses (Excluding parts for now as requested)
  const calculatedNetProfit = serviceRevenue - totalExpenseAmount;
  
  // Use DB values if available, otherwise fallback to local calculation
  const netProfit = dbStats?.netProfit !== undefined ? dbStats.netProfit : calculatedNetProfit;
  const displayTotalRevenue = dbStats?.totalRevenue !== undefined ? dbStats.totalRevenue : totalRevenue;
    
  const activeJobs = jobs.filter(j => j.status !== JobStatus.COMPLETED).length;

  const stats = [
    { label: 'Net Profit', value: formatCurrency(netProfit), icon: TrendingUp, color: netProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Total Revenue', value: formatCurrency(displayTotalRevenue), icon: DollarSign, color: 'text-white' },
    { label: 'Labour Revenue', value: formatCurrency(serviceRevenue), icon: Wrench, color: 'text-blue-400' },
    { label: 'Parts Revenue', value: formatCurrency(partsRevenue), icon: DollarSign, color: 'text-amber-400' },
  ];

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="w-full md:w-auto">
          <h2 className="text-2xl md:text-3xl font-sans font-medium text-white tracking-tight">Financial Reports</h2>
          <p className="text-[#8E9299] text-xs md:text-sm mt-1">Breakdown of services and spare parts revenue.</p>
        </div>
        <div className="flex flex-wrap items-center bg-white/[0.03] p-1 md:p-1.5 rounded-xl md:rounded-2xl border border-white/5 w-full md:w-auto">
          <button
            onClick={() => setReportRange('today')}
            className={cn(
              "flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[10px] md:text-[11px] font-mono uppercase tracking-widest transition-all",
              reportRange === 'today' ? "bg-white/10 text-white shadow-lg" : "text-[#8E9299] hover:text-white"
            )}
          >
            Today
          </button>
          <button
            onClick={() => setReportRange('week')}
            className={cn(
              "flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[10px] md:text-[11px] font-mono uppercase tracking-widest transition-all",
              reportRange === 'week' ? "bg-white/10 text-white shadow-lg" : "text-[#8E9299] hover:text-white"
            )}
          >
            Weekly
          </button>
          <button
            onClick={() => setReportRange('month')}
            className={cn(
              "flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[10px] md:text-[11px] font-mono uppercase tracking-widest transition-all",
              reportRange === 'month' ? "bg-white/10 text-white shadow-lg" : "text-[#8E9299] hover:text-white"
            )}
          >
            Monthly
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-[#151619] p-5 md:p-6 rounded-2xl border border-white/[0.03] hover:border-white/10 hover:shadow-2xl transition-all group"
          >
            <div className="flex justify-between items-start mb-3 md:mb-4">
              <div className={cn("p-2 rounded-xl bg-white/[0.03] border border-white/5", stat.color)}>
                <stat.icon className="w-4 h-4 md:w-5 md:h-5" />
              </div>
            </div>
            <p className="text-[#8E9299] text-[9px] md:text-[10px] font-mono uppercase tracking-[0.2em]">{stat.label}</p>
            <h3 className="text-xl md:text-2xl font-sans font-medium text-white mt-1 md:mt-2">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 space-y-6 md:space-y-8">
          <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden flex flex-col">
            <div className="p-4 md:p-6 border-b border-white/[0.05] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-white font-sans font-medium text-sm md:text-base">Income Breakdown ({reportRange === 'today' ? 'Daily' : reportRange === 'week' ? 'Weekly' : 'Monthly'})</h3>
              <div className="flex items-center space-x-3 text-[9px] md:text-[10px] font-mono">
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                  <span className="text-[#8E9299]">PROFIT</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                  <span className="text-[#8E9299]">REVENUE</span>
                </div>
              </div>
            </div>
            
            <div className="p-6 md:p-12">
               <div className="flex justify-between mb-2 px-1">
                  <span className="text-[9px] md:text-[10px] text-[#8E9299] font-mono">Net Profit vs Total Revenue</span>
                  <span className="text-[9px] md:text-[10px] text-white font-mono">{Math.round((netProfit / (displayTotalRevenue || 1)) * 100)}% Margin</span>
               </div>
               <div className="relative h-3 md:h-4 bg-white/[0.03] rounded-full overflow-hidden flex border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, (netProfit / (displayTotalRevenue || 1)) * 100))}%` }}
                    className="h-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]" 
                  />
               </div>
               
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4 mt-6 md:mt-8">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] md:text-[9px] text-[#8E9299] font-mono uppercase tracking-widest mb-1">Total Revenue</p>
                      <p className="text-base md:text-lg text-white font-sans font-medium">
                        {formatCurrency(displayTotalRevenue)}
                      </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] md:text-[9px] text-blue-400 font-mono uppercase tracking-widest mb-1">Labour Revenue</p>
                      <p className="text-base md:text-lg text-white font-sans font-medium">
                        {formatCurrency(serviceRevenue)}
                      </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] md:text-[9px] text-amber-500 font-mono uppercase tracking-widest mb-1">Parts Sales</p>
                      <p className="text-base md:text-lg text-white font-sans font-medium">
                        {formatCurrency(partsRevenue)}
                      </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] md:text-[9px] text-red-400 font-mono uppercase tracking-widest mb-1">Expenses</p>
                      <p className="text-base md:text-lg text-white font-sans font-medium">
                        {formatCurrency(totalExpenseAmount)}
                      </p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 transition-all sm:col-span-2 xl:col-span-1">
                      <p className="text-[8px] md:text-[9px] text-emerald-400 font-mono uppercase tracking-widest mb-1">Net Profit</p>
                      <p className="text-base md:text-lg text-emerald-400 font-sans font-medium">
                        {formatCurrency(netProfit)}
                      </p>
                  </div>
                </div>
            </div>
          </div>

          <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden">
            <div className="p-4 md:p-6 border-b border-white/[0.05] flex justify-between items-center">
              <h3 className="text-white font-sans font-medium text-sm md:text-base">Recent Activity</h3>
              <span className="bg-white/5 text-[8px] md:text-[9px] text-[#8E9299] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Live</span>
            </div>
            <div className="overflow-x-auto min-h-[250px] md:min-h-[300px]">
              {jobs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-16 h-16 bg-white/[0.02] rounded-full flex items-center justify-center mb-4 border border-white/5">
                    <Wrench className="w-6 h-6 text-[#8E9299]" />
                  </div>
                  <h4 className="text-white font-medium text-lg">No recent jobs found</h4>
                  <p className="text-[#8E9299] text-sm mt-1 max-w-xs">Start your day by creating a new repair job for a customer.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-white/[0.02] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">
                    <tr>
                      <th className="px-6 py-4 font-normal">Vehicle & Ref</th>
                      <th className="px-6 py-4 font-normal">Status</th>
                      <th className="px-6 py-4 font-normal text-right">Service</th>
                      <th className="px-6 py-4 font-normal text-right">Parts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {jobs.slice(0, 8).map((job) => (
                      <tr key={job.id} className="text-sm text-white hover:bg-white/[0.02] transition-colors group cursor-pointer">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-white/[0.03] rounded-lg border border-white/5 flex items-center justify-center font-mono text-[10px] text-[#8E9299]">
                               {job.vehicleNumber?.slice(-4) || 'SAL'}
                            </div>
                            <div>
                              <div className="font-medium text-white">{job.vehicleNumber || (job.jobType === 'SALE' ? 'Counter Sale' : 'N/A')}</div>
                              <div className="text-[10px] text-[#8E9299] uppercase tracking-tighter">{job.vehicleModel} • {job.jobRef}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest",
                            job.status === JobStatus.COMPLETED ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                            job.status === JobStatus.ONGOING ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                            "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          )}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[#8E9299] font-medium group-hover:text-blue-400 transition-colors">
                          {formatCurrency(job.repairFee)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[#8E9299] font-medium group-hover:text-amber-400 transition-colors">
                          {formatCurrency(job.totalPartsCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
           <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden">
                <div className="p-6 border-b border-white/[0.05]">
                    <h3 className="text-white font-sans font-medium">Critical Stock</h3>
                </div>
                <div className="p-6 space-y-3">
                    {inventory.filter(p => p.quantity <= p.lowStockThreshold).length === 0 ? (
                        <div className="py-12 text-center">
                             <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/5 rounded-full mb-3 border border-emerald-500/10">
                                <Check className="w-5 h-5 text-emerald-500" />
                             </div>
                             <p className="text-[#8E9299] text-xs font-medium">Stock Levels Optimal</p>
                        </div>
                    ) : (
                        inventory
                            .filter(p => p.quantity <= p.lowStockThreshold)
                            .slice(0, 6)
                            .map(part => (
                            <div key={part.id} className="flex items-center justify-between p-3.5 bg-white/[0.02] rounded-xl border border-white/[0.03] hover:border-white/10 hover:bg-white/[0.04] transition-all group">
                                <div>
                                    <p className="text-white text-[13px] font-medium group-hover:text-white transition-colors">{part.name}</p>
                                    <p className="text-[10px] text-amber-500/80 font-mono mt-0.5 font-bold uppercase tracking-tighter">Only {part.quantity} left</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] text-[#8E9299] uppercase font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5">Min: {part.lowStockThreshold}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="bg-red-500/5 rounded-2xl border border-red-500/10 p-6">
                <h4 className="text-red-400 text-xs font-mono uppercase tracking-widest mb-4">Danger Zone</h4>
                <button 
                  onClick={handleClearHistory}
                  disabled={isClearing}
                  className={cn(
                    "w-full text-xs text-[#8E9299] border-white/5 uppercase tracking-widest font-mono transition-all border px-6 py-4 rounded-xl active:scale-95 shadow-lg",
                    isClearing ? "opacity-50 cursor-not-allowed" : "hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/30"
                  )}
                >
                  {isClearing ? 'Clearing...' : 'Wipe Job History'}
                </button>
            </div>
        </div>
      </div>
    </div>

  );
}
