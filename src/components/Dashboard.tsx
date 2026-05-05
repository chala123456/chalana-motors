import React from 'react';
import { TrendingUp, Wrench, AlertTriangle, DollarSign } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { RepairJob, Part, JobStatus } from '../types';
import { motion } from 'motion/react';

interface DashboardProps {
  jobs: RepairJob[];
  inventory: Part[];
}

export function Dashboard({ jobs, inventory }: DashboardProps) {
  const totalProfit = jobs
    .filter(j => j.status === JobStatus.COMPLETED)
    .reduce((sum, j) => sum + (j.profit || 0), 0);
    
  const activeJobs = jobs.filter(j => j.status !== JobStatus.COMPLETED).length;
  const lowStock = inventory.filter(p => p.quantity <= p.lowStockThreshold).length;
  const totalRevenue = jobs
    .filter(j => j.status === JobStatus.COMPLETED)
    .reduce((sum, j) => sum + (j.repairFee || 0), 0);

  const stats = [
    { label: 'Total Profit', value: formatCurrency(totalProfit), icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Active Jobs', value: activeJobs, icon: Wrench, color: 'text-blue-500' },
    { label: 'Low Stock Items', value: lowStock, icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-white' },
  ];

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      <header>
        <h2 className="text-2xl font-sans font-medium text-white tracking-tight">Overview</h2>
        <p className="text-[#8E9299] text-sm mt-1">Real-time performance metrics for your garage.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-[#151619] p-6 rounded-xl border border-[#141414] hover:shadow-2xl transition-shadow group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-2 rounded-lg bg-[#1a1b1e]", stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[#8E9299] text-xs font-mono uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-2xl font-sans font-medium text-white mt-1">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Jobs Table Preview Card */}
        <div className="lg:col-span-2 bg-[#151619] rounded-xl border border-[#141414] overflow-hidden">
          <div className="p-6 border-bottom border-[#141414] flex justify-between items-center">
            <h3 className="text-white font-sans font-medium italic-serif">Recent Jobs</h3>
            <button className="text-[10px] text-[#8E9299] hover:text-white uppercase tracking-wider font-medium">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#1a1b1e] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">
                <tr>
                  <th className="px-6 py-3 font-normal">Vehicle</th>
                  <th className="px-6 py-3 font-normal">Issue</th>
                  <th className="px-6 py-3 font-normal">Status</th>
                  <th className="px-6 py-3 font-normal text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {jobs.slice(0, 5).map((job) => (
                  <tr key={job.id} className="text-sm text-white hover:bg-[#1a1b1e] transition-colors group cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-[#8E9299] font-mono">{job.jobRef}</span>
                        <div className="font-medium">{job.vehicleNumber}</div>
                      </div>
                      <div className="text-[10px] text-[#8E9299]">{job.vehicleModel}</div>
                    </td>
                    <td className="px-6 py-4 text-[#8E9299] truncate max-w-[200px]">{job.issue}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                        job.status === JobStatus.COMPLETED ? "bg-emerald-500/10 text-emerald-500" :
                        job.status === JobStatus.ONGOING ? "bg-blue-500/10 text-blue-500" :
                        "bg-amber-500/10 text-amber-500"
                      )}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-[#8E9299] group-hover:text-white transition-colors">
                      {formatCurrency(job.repairFee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-[#151619] rounded-xl border border-[#141414] overflow-hidden">
             <div className="p-6 border-bottom border-[#141414]">
                <h3 className="text-white font-sans font-medium italic-serif">Low Stock Alerts</h3>
            </div>
            <div className="p-6 space-y-4">
                {inventory.filter(p => p.quantity <= p.lowStockThreshold).length === 0 ? (
                    <p className="text-[#8E9299] text-xs">All inventory levels are healthy.</p>
                ) : (
                    inventory
                        .filter(p => p.quantity <= p.lowStockThreshold)
                        .slice(0, 5)
                        .map(part => (
                        <div key={part.id} className="flex items-center justify-between p-3 bg-[#1a1b1e] rounded-lg border border-[#141414]">
                            <div>
                                <p className="text-white text-sm font-medium">{part.name}</p>
                                <p className="text-[10px] text-amber-500 font-mono">{part.quantity} units left</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-[#8E9299] uppercase tracking-wider">Threshold: {part.lowStockThreshold}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

// Inline helper because Sidebar.tsx hasn't exported it properly in this context if I missed it
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
