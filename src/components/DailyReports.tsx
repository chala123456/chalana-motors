import React, { useState } from 'react';
import { Calendar, Package, Wrench, Printer, ArrowLeft, ArrowRight, FileText, TrendingUp, DollarSign, X, Clock, User, Car, Send } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { RepairJob, Part, JobStatus, Expense } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface DailyReportsProps {
  jobs: RepairJob[];
  inventory: Part[];
  expenses: Expense[];
}

export function DailyReports({ jobs, inventory, expenses }: DailyReportsProps) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [viewingJob, setViewingJob] = useState<RepairJob | null>(null);
    const [viewingLabourDetail, setViewingLabourDetail] = useState<{ description: string, total: number } | null>(null);
    const [viewingPartDetail, setViewingPartDetail] = useState<{ partId: string, name: string, quantity: number, revenue: number } | null>(null);
    const [whatsappRecipient, setWhatsappRecipient] = useState('94779468940');
    const [isSharingAll, setIsSharingAll] = useState(false);

    // Filter data for the selected date
    const dayJobs = jobs.filter(j => j.createdAt.startsWith(selectedDate) && j.status === JobStatus.COMPLETED);
    const dayExpenses = expenses.filter(e => e.date === selectedDate);

    const labourRevenue = dayJobs.reduce((sum, j) => sum + Number(j.repairFee || 0), 0);
    const partsRevenue = dayJobs.reduce((sum, j) => sum + Number(j.totalPartsCost || 0), 0);
    const totalRevenue = labourRevenue + partsRevenue;
    const totalExpensesValue = dayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    // Net Profit = Labour Revenue - Expenses (Excluding parts profit for now as per previous logic in Dashboard)
    const netProfit = labourRevenue - totalExpensesValue;

    // Extract all labour items used on this day
    const servicesMap = new Map<string, { description: string, count: number, total: number }>();
    dayJobs.forEach(job => {
        if (job.services && job.services.length > 0) {
            job.services.forEach(service => {
                const existing = servicesMap.get(service.description) || { description: service.description, count: 0, total: 0 };
                servicesMap.set(service.description, {
                    description: service.description,
                    count: existing.count + 1,
                    total: existing.total + service.price
                });
            });
        }
    });
    const consolidatedServices = Array.from(servicesMap.values()).sort((a, b) => b.total - a.total);

    // Extract all parts used on this day
    const partsMap = new Map<string, { partId: string, name: string, quantity: number, revenue: number }>();
    dayJobs.forEach(job => {
        job.partsUsed.forEach(part => {
            const existing = partsMap.get(part.partId) || { partId: part.partId, name: part.name, quantity: 0, revenue: 0 };
            partsMap.set(part.partId, {
                partId: part.partId,
                name: part.name,
                quantity: existing.quantity + (part.quantity || 1),
                revenue: existing.revenue + (part.costAtTime * (part.quantity || 1))
            });
        });
    });
    const consolidatedParts = Array.from(partsMap.values()).sort((a, b) => b.revenue - a.revenue);

    const changeDate = (days: number) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(date.toISOString().split('T')[0]);
    };

    const handlePrint = (title: any = 'Daily Business Report') => {
        const printContent = document.getElementById('daily-report-print-area');
        if (!printContent) {
            window.print();
            return;
        }

        const safeTitle = (typeof title === 'string') ? title : 'Daily Business Report';

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
                            body { background: white !important; color: black !important; padding: 0; margin: 0; }
                            @page { margin: 1cm; size: auto; }
                        }
                        body { 
                            padding: 40px; 
                            font-family: sans-serif; 
                            background: #f4f4f4; 
                            color: black; 
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

    const handleWhatsAppDailyReport = () => {
        const header = `📅 *CHALANA MOTORS - DAILY REPORT*\nDate: ${selectedDate}\n----------------------------------\n`;
        const stats = `💰 Total Revenue: *${formatCurrency(totalRevenue)}*\n🛠️ Labour: ${formatCurrency(labourRevenue)}\n📦 Parts: ${formatCurrency(partsRevenue)}\n📈 Net Profit: *${formatCurrency(netProfit)}*\n----------------------------------\n`;
        
        let body = `✅ *COMPLETED JOBS (${dayJobs.length}):*\n`;
        dayJobs.forEach(job => {
            body += `- ${job.vehicleNumber || 'Sale'}: ${formatCurrency(job.repairFee + job.totalPartsCost)}\n`;
        });

        const expensesStr = dayExpenses.length > 0 
            ? `\n💸 *EXPENSES:*\n` + dayExpenses.map(e => `- ${e.description}: ${formatCurrency(e.amount)}`).join('\n')
            : '\n💸 No expenses recorded.';

        const message = encodeURIComponent(header + stats + body + expensesStr);
        const cleanNumber = whatsappRecipient.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
    };

    const handleWhatsAppAllReports = () => {
        const header = `📋 *CHALANA MOTORS - COMPLETE BUSINESS SUMMARY*\nDate: ${selectedDate}\n----------------------------------\n`;
        
        const stats = `💰 Today Revenue: *${formatCurrency(totalRevenue)}*\n📈 Today Net Profit: *${formatCurrency(netProfit)}*\n🛠️ Jobs Today: ${dayJobs.length}\n`;
        
        const lowStock = inventory.filter(p => p.quantity <= (p.lowStockThreshold || 5));
        const lowStockSection = `\n🚨 *LOW STOCK ALERT:* \n` + (lowStock.length > 0 
            ? lowStock.slice(0, 10).map(p => `• ${p.name}: ${p.quantity} left`).join('\n') + (lowStock.length > 10 ? `\n...and ${lowStock.length - 10} more` : '')
            : '✅ Stock levels healthy.');
            
        const footer = `\n----------------------------------\nSent from Chalana Motors Cloud`;
        
        const message = encodeURIComponent(header + stats + lowStockSection + footer);
        const cleanNumber = whatsappRecipient.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
    };

    const handleWhatsAppJobBill = (job: RepairJob) => {
        const header = `🧾 *CHALANA MOTORS - INVOICE*\nRef: ${job.jobRef}\nDate: ${new Date(job.createdAt).toLocaleDateString()}\n----------------------------------\n`;
        const vehicle = `🚗 Vehicle: *${job.vehicleNumber || 'Direct Sale'}*\n👤 Customer: ${job.customerName || 'Walk-in'}\n----------------------------------\n`;
        
        let labour = `🛠️ *SERVICES:*\n`;
        job.services?.forEach(s => labour += `- ${s.description}: ${formatCurrency(s.price)}\n`);
        
        let items = `\n📦 *PARTS:*\n`;
        job.partsUsed?.forEach(p => items += `- ${p.name} (x${p.quantity}): ${formatCurrency(p.costAtTime * p.quantity)}\n`);
        
        const total = `\n💰 *TOTAL AMOUNT: ${formatCurrency(job.repairFee + job.totalPartsCost)}*\n----------------------------------\nThank you for your business!`;
        
        const message = encodeURIComponent(header + vehicle + labour + items + total);
        const cleanNumber = whatsappRecipient.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
                <div className="flex items-center space-x-3">
                   <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                        <FileText className="w-6 h-6 text-emerald-500" />
                   </div>
                   <div>
                        <h2 className="text-3xl font-sans font-medium text-white tracking-tight italic-serif">Daily Operations Report</h2>
                        <p className="text-[#8E9299] text-sm mt-0.5">End-of-day summary for parts and labour.</p>
                   </div>
                </div>

                <div className="flex items-center space-x-3 bg-[#151619] p-1.5 rounded-xl border border-white/5 shadow-2xl">
                    <button 
                        onClick={() => changeDate(-1)}
                        className="p-2 hover:bg-white/5 rounded-lg text-[#8E9299] hover:text-white transition-all"
                        title="Yesterday"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center space-x-2 px-3 border-x border-white/5">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent text-sm font-mono text-white outline-none border-none cursor-pointer"
                        />
                    </div>
                    <button 
                        onClick={() => changeDate(1)}
                        className="p-2 hover:bg-white/5 rounded-lg text-[#8E9299] hover:text-white transition-all"
                        title="Tomorrow"
                    >
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center space-x-3">
                    <div className="flex flex-col gap-1 print:hidden">
                        <div className="flex items-center bg-[#151619] border border-white/5 rounded-lg px-2 py-1">
                            <span className="text-[9px] text-[#8E9299] uppercase font-mono mr-2">Admin Phone:</span>
                            <input 
                                type="text"
                                value={whatsappRecipient}
                                onChange={(e) => setWhatsappRecipient(e.target.value)}
                                className="bg-transparent text-xs font-mono text-white outline-none w-28"
                            />
                        </div>
                        <button 
                            onClick={handleWhatsAppDailyReport}
                            className="flex items-center justify-center space-x-2 bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-600/20 transition-all text-xs shadow-sm"
                        >
                            <Send className="w-3.5 h-3.5" />
                            <span>WhatsApp Report</span>
                        </button>
                    </div>
                    <button 
                        onClick={() => handlePrint()}
                        className="flex items-center space-x-2 bg-white text-[#151619] px-6 py-3 rounded-xl font-bold hover:bg-[#E4E3E0] transition-all text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <FileText className="w-4.5 h-4.5" />
                        <span>View / Print Full Report</span>
                    </button>
                </div>
            </header>

            {/* Print Friendly Header & Content - FIXED WIDTH FOR CAPTURE */}
            <div id="daily-report-print-area" className="fixed top-0 left-[-5000px] w-[1000px] bg-white text-black p-10 z-[-100] print:static print:block">
                <div className="flex justify-between items-center mb-10 pb-6 border-b-2 border-black">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center">
                            <Wrench className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold uppercase tracking-tight">Chalana Motors</h1>
                            <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-500">Service Station & Spare Parts</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-bold uppercase">Daily Business Report</h2>
                        <p className="text-sm font-mono bg-gray-100 px-3 py-1 rounded inline-block mt-2">Date: {selectedDate}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2 mb-8">
                    {[
                        { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
                        { label: 'Labour Revenue', value: formatCurrency(labourRevenue) },
                        { label: 'Parts Revenue', value: formatCurrency(partsRevenue) },
                        { label: 'Net Profit', value: formatCurrency(netProfit) }
                    ].map((stat) => (
                        <div key={stat.label} className="border border-black p-4">
                            <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-gray-600 mb-1">{stat.label}</p>
                            <h3 className="text-lg font-bold">{stat.value}</h3>
                        </div>
                    ))}
                </div>

                <div className="space-y-8">
                    {/* Simplified Print-Only Tables */}
                    <div className="border border-black">
                        <div className="p-3 bg-gray-50 border-b border-black font-bold uppercase text-sm">Services Completed ({dayJobs.length})</div>
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="bg-gray-100 border-b border-black">
                                    <th className="p-2 border-r border-black">Ref/Vehicle</th>
                                    <th className="p-2 border-r border-black">Labour</th>
                                    <th className="p-2 border-r border-black">Parts</th>
                                    <th className="p-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dayJobs.map(job => (
                                    <tr key={job.id} className="border-b border-black">
                                        <td className="p-2 border-r border-black">{job.jobRef} / {job.vehicleNumber || 'Sale'}</td>
                                        <td className="p-2 border-r border-black">{formatCurrency(job.repairFee)}</td>
                                        <td className="p-2 border-r border-black">{formatCurrency(job.totalPartsCost)}</td>
                                        <td className="p-2 text-right">{formatCurrency(job.repairFee + job.totalPartsCost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Interactive Screen Layout (Hidden during print) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
                {[
                    { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-white' },
                    { label: 'Labour Revenue', value: formatCurrency(labourRevenue), icon: Wrench, color: 'text-blue-400' },
                    { label: 'Parts Revenue', value: formatCurrency(partsRevenue), icon: Package, color: 'text-amber-400' },
                    { label: 'Net Profit', value: formatCurrency(netProfit), icon: TrendingUp, color: netProfit >= 0 ? 'text-emerald-400' : 'text-red-400' }
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#151619] p-6 rounded-2xl border border-white/[0.03] print:border-black print:bg-white print:text-black flex flex-col justify-between h-32 relative overflow-hidden group"
                    >
                        <div className="relative z-10">
                            <p className="text-[#8E9299] text-[10px] font-mono uppercase tracking-[0.2em] mb-1 print:text-gray-600">{stat.label}</p>
                            <h3 className={cn("text-2xl font-sans font-medium print:text-black", stat.color)}>{stat.value}</h3>
                        </div>
                        <stat.icon className={cn("absolute -bottom-2 -right-2 w-12 h-12 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity print:hidden", stat.color)} />
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:block print:space-y-8">
                {/* Services/Jobs Section */}
                <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden print:border print:border-black print:bg-white shadow-xl flex flex-col">
                    <div className="p-6 border-b border-white/[0.05] flex items-center justify-between print:border-black">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg print:hidden">
                                <Wrench className="w-5 h-5 text-blue-400" />
                            </div>
                            <h3 className="text-white font-sans font-medium print:text-black text-lg">Services Completed</h3>
                        </div>
                        <span className="text-[10px] font-mono text-[#8E9299] bg-white/5 px-2 py-1 rounded-full uppercase tracking-widest font-bold">{dayJobs.length} Jobs</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono print:bg-gray-100 print:text-black border-b border-white/5 print:border-black">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Vehicle Ref</th>
                                    <th className="px-6 py-4 font-normal">Labour</th>
                                    <th className="px-6 py-4 font-normal">Parts</th>
                                    <th className="px-6 py-4 font-normal text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03] print:divide-gray-200">
                                {dayJobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-16 text-center text-[#8E9299] text-sm print:text-black italic">
                                            No jobs found for this date.
                                        </td>
                                    </tr>
                                ) : (
                                    dayJobs.map(job => (
                                        <tr 
                                            key={job.id} 
                                            onClick={() => setViewingJob(job)}
                                            className="text-sm group hover:bg-white/[0.05] cursor-pointer transition-colors print:text-black"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-white print:text-black">{job.vehicleNumber || (job.jobType === 'SALE' ? 'Sale' : 'Unknown')}</div>
                                                <div className="text-[10px] text-[#8E9299] uppercase font-mono mt-0.5 tracking-tighter">{job.jobRef}</div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-[#8E9299] group-hover:text-blue-400 transition-colors print:text-black">{formatCurrency(job.repairFee)}</td>
                                            <td className="px-6 py-4 font-mono text-[#8E9299] group-hover:text-amber-400 transition-colors print:text-black">{formatCurrency(job.totalPartsCost)}</td>
                                            <td className="px-6 py-4 text-right font-mono text-white print:text-black font-medium">{formatCurrency(job.repairFee + job.totalPartsCost)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {dayJobs.length > 0 && (
                                <tfoot className="bg-white/[0.02] print:bg-gray-50 border-t border-white/[0.1] print:border-black">
                                    <tr className="font-mono text-sm text-white print:text-black font-bold">
                                        <td className="px-6 py-5 uppercase tracking-tighter">Day Total</td>
                                        <td className="px-6 py-5">{formatCurrency(labourRevenue)}</td>
                                        <td className="px-6 py-5">{formatCurrency(partsRevenue)}</td>
                                        <td className="px-6 py-5 text-right bg-blue-500/5 print:bg-transparent underline underline-offset-8 decoration-blue-500 text-blue-400 print:text-black">{formatCurrency(totalRevenue)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Labour Item Breakdown Section */}
                <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden print:border print:border-black print:bg-white shadow-xl flex flex-col">
                    <div className="p-6 border-b border-white/[0.05] flex items-center justify-between print:border-black">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg print:hidden">
                                <Wrench className="w-5 h-5 text-blue-400" />
                            </div>
                            <h3 className="text-white font-sans font-medium print:text-black text-lg">Labour Item Breakdown</h3>
                        </div>
                        <span className="text-[10px] font-mono text-[#8E9299] bg-white/5 px-2 py-1 rounded-full uppercase tracking-widest font-bold">{consolidatedServices.length} Items</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono print:bg-gray-100 print:text-black border-b border-white/5 print:border-black">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Service Type</th>
                                    <th className="px-6 py-4 font-normal text-center">Count</th>
                                    <th className="px-6 py-4 font-normal text-right">Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03] print:divide-gray-200">
                                {consolidatedServices.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-16 text-center text-[#8E9299] text-sm print:text-black italic">
                                            No detailed labour items found.
                                        </td>
                                    </tr>
                                ) : (
                                    consolidatedServices.map((service, idx) => (
                                        <tr 
                                            key={idx} 
                                            onClick={() => setViewingLabourDetail(service)}
                                            className="text-sm cursor-pointer group hover:bg-white/[0.05] transition-colors print:text-black"
                                        >
                                            <td className="px-6 py-4 text-white print:text-black font-medium">{service.description}</td>
                                            <td className="px-6 py-4 text-center font-mono text-blue-400 font-bold bg-blue-400/5 print:bg-transparent">{service.count}</td>
                                            <td className="px-6 py-4 text-right font-mono text-[#8E9299] print:text-black">{formatCurrency(service.total)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {consolidatedServices.length > 0 && (
                                <tfoot className="bg-white/[0.02] print:bg-gray-50 border-t border-white/[0.1] print:border-black">
                                    <tr className="font-mono text-sm text-white print:text-black font-bold">
                                        <td className="px-6 py-5 uppercase tracking-tighter">Labour Total Revenue</td>
                                        <td className="px-6 py-5 text-center">{consolidatedServices.reduce((s, p) => s + p.count, 0)} Items</td>
                                        <td className="px-6 py-5 text-right text-blue-400 print:text-black underline underline-offset-8 decoration-blue-500">{formatCurrency(labourRevenue)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Parts Movement Section */}
                <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden print:border print:border-black print:bg-white shadow-xl flex flex-col">
                    <div className="p-6 border-b border-white/[0.05] flex items-center justify-between print:border-black">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-amber-500/10 rounded-lg print:hidden">
                                <Package className="w-5 h-5 text-amber-500" />
                            </div>
                            <h3 className="text-white font-sans font-medium print:text-black text-lg">Parts Inventory Usage</h3>
                        </div>
                        <span className="text-[10px] font-mono text-[#8E9299] bg-white/5 px-2 py-1 rounded-full uppercase tracking-widest font-bold">{consolidatedParts.length} SKUs</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] text-[10px] text-[#8E9299] uppercase tracking-wider font-mono print:bg-gray-100 print:text-black border-b border-white/5 print:border-black">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Part Name</th>
                                    <th className="px-6 py-4 font-normal text-center">Qty</th>
                                    <th className="px-6 py-4 font-normal text-right">Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03] print:divide-gray-200">
                                {consolidatedParts.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-16 text-center text-[#8E9299] text-sm print:text-black italic">
                                            No parts used today.
                                        </td>
                                    </tr>
                                ) : (
                                    consolidatedParts.map((part, idx) => (
                                        <tr 
                                            key={idx} 
                                            onClick={() => setViewingPartDetail(part)}
                                            className="text-sm cursor-pointer group hover:bg-white/[0.05] transition-colors print:text-black"
                                        >
                                            <td className="px-6 py-4 text-white print:text-black font-medium">{part.name}</td>
                                            <td className="px-6 py-4 text-center font-mono text-amber-500 font-bold bg-amber-500/5 print:bg-transparent">{part.quantity}</td>
                                            <td className="px-6 py-4 text-right font-mono text-[#8E9299] print:text-black">{formatCurrency(part.revenue)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {consolidatedParts.length > 0 && (
                                <tfoot className="bg-white/[0.02] print:bg-gray-50 border-t border-white/[0.1] print:border-black">
                                    <tr className="font-mono text-sm text-white print:text-black font-bold">
                                        <td className="px-6 py-5 uppercase tracking-tighter">Parts Total Revenue</td>
                                        <td className="px-6 py-5 text-center">{consolidatedParts.reduce((s, p) => s + p.quantity, 0)} Items</td>
                                        <td className="px-6 py-5 text-right text-amber-500 print:text-black underline underline-offset-8 decoration-amber-500">{formatCurrency(partsRevenue)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Expenses Breakdown */}
                <div className="bg-[#151619] rounded-2xl border border-white/[0.03] overflow-hidden lg:col-span-2 print:border print:border-black print:bg-white shadow-xl">
                     <div className="p-6 border-b border-white/[0.05] flex items-center justify-between print:border-black">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-red-500/10 rounded-lg print:hidden">
                                <TrendingUp className="w-5 h-5 text-red-500 rotate-180" />
                            </div>
                            <h3 className="text-white font-sans font-medium print:text-black text-lg">Daily Expenses</h3>
                        </div>
                        <span className="text-[10px] font-mono text-red-400 bg-red-400/10 px-2 py-1 rounded-full uppercase tracking-widest font-bold">-{formatCurrency(totalExpensesValue)}</span>
                   </div>
                   <div className="p-8">
                        {dayExpenses.length === 0 ? (
                            <p className="text-[#8E9299] text-sm italic text-center py-8">No expenses logged for this date.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {dayExpenses.map(exp => (
                                    <motion.div 
                                        key={exp.id} 
                                        className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-red-500/30 transition-all group print:border-black print:bg-white print:text-black shadow-inner"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="text-[10px] text-red-400 font-mono uppercase tracking-[0.15em] font-bold px-2.5 py-1 bg-red-400/10 rounded-lg border border-red-400/20">{exp.category}</span>
                                            <span className="text-base font-mono font-bold text-white print:text-black group-hover:text-red-400 transition-colors">{formatCurrency(exp.amount)}</span>
                                        </div>
                                        <p className="text-sm text-[#8E9299] leading-relaxed line-clamp-2 print:text-black">{exp.description}</p>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                   </div>
                </div>
            </div>

            <footer className="pt-12 text-center text-[#8E9299] text-[10px] uppercase tracking-[0.5em] font-mono border-t border-white/[0.03] print:text-black print:border-black print:mt-12">
                Certified Operational Report • Chalana Motors Cloud
            </footer>

            {/* Job Details Modal */}
            <AnimatePresence>
                {viewingJob && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:bg-white print:p-0 print:block print:static">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#151619] border border-white/5 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:border-none print:bg-white print:text-black print:rounded-none"
                        >
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02] print:hidden">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                                        <Wrench className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-medium text-white">Job Details</h3>
                                        <p className="text-xs text-[#8E9299] font-mono uppercase tracking-widest">{viewingJob.jobRef}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button 
                                        onClick={() => handleWhatsAppJobBill(viewingJob)}
                                        className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-emerald-500 transition-colors"
                                        title="Send via WhatsApp"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => window.print()}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                                        title="Print Bill"
                                    >
                                        <Printer className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => setViewingJob(null)}
                                        className="p-3 hover:bg-white/5 rounded-full text-[#8E9299] hover:text-white transition-colors"
                                    >
                                        <X className="w-8 h-8" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-8 overflow-y-auto space-y-8 print:p-0">
                                {/* Bill Header (Print Only) */}
                                <div className="hidden print:block text-center border-b-2 border-black pb-6 mb-8">
                                    <h1 className="text-3xl font-bold uppercase italic-serif">Chalana Motors</h1>
                                    <p className="text-sm font-mono uppercase tracking-widest">Service Station & Spare Parts</p>
                                    <p className="text-xs mt-2">Tel: 07x-xxxxxxx | No. 123, Main Road, City</p>
                                    <div className="mt-4 py-1 bg-black text-white text-xs font-bold uppercase tracking-[0.3em]">Official Invoice</div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 print:grid-cols-2">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest flex items-center gap-2 print:text-black">
                                            <Car className="w-3 h-3" /> Vehicle
                                        </p>
                                        <p className="text-white font-medium print:text-black">{viewingJob.vehicleNumber || (viewingJob.jobType === 'SALE' ? 'Direct Sale' : 'Unknown')}</p>
                                        <p className="text-sm text-[#8E9299] print:text-black">{viewingJob.vehicleModel || viewingJob.brand || 'No modelinfo'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest flex items-center gap-2 print:text-black text-right justify-end">
                                            <Clock className="w-3 h-3" /> Record Time
                                        </p>
                                        <p className="text-white font-medium print:text-black text-right">{new Date(viewingJob.createdAt).toLocaleTimeString()}</p>
                                        <p className="text-sm text-[#8E9299] print:text-black text-right">{new Date(viewingJob.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest flex items-center gap-2 print:text-black">
                                            <User className="w-3 h-3" /> Customer
                                        </p>
                                        <p className="text-white font-medium print:text-black">{viewingJob.customerName || 'Walk-in'}</p>
                                        <p className="text-sm text-[#8E9299] font-mono print:text-black">{viewingJob.customerPhone || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest flex items-center gap-2 print:text-black text-right justify-end font-bold">
                                            <DollarSign className="w-3 h-3" /> Total Amount
                                        </p>
                                        <p className="text-emerald-400 font-medium print:text-black text-xl text-right">{formatCurrency(viewingJob.repairFee + viewingJob.totalPartsCost)}</p>
                                        <p className="text-[10px] text-[#8E9299] uppercase tracking-tighter print:text-black text-right">
                                            L: {formatCurrency(viewingJob.repairFee)} + P: {formatCurrency(viewingJob.totalPartsCost)}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-mono text-white/40 uppercase tracking-[0.2em] print:text-black print:border-b print:border-black print:pb-1">Services / Labour</h4>
                                    <div className="space-y-2">
                                        {viewingJob.services && viewingJob.services.length > 0 ? (
                                            viewingJob.services.map((s, i) => (
                                                <div key={i} className="flex justify-between items-center p-3 bg-white/[0.02] border border-white/5 rounded-xl print:bg-white print:border-none print:p-1">
                                                    <span className="text-sm text-white print:text-black">{s.description}</span>
                                                    <span className="text-sm font-mono text-blue-400 font-medium print:text-black">{formatCurrency(s.price)}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-white/20 italic">No services listed.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-mono text-white/40 uppercase tracking-[0.2em] print:text-black print:border-b print:border-black print:pb-1">Parts Used</h4>
                                    <div className="space-y-2">
                                        {viewingJob.partsUsed && viewingJob.partsUsed.length > 0 ? (
                                            viewingJob.partsUsed.map((p, i) => (
                                                <div key={i} className="flex justify-between items-center p-3 bg-white/[0.02] border border-white/5 rounded-xl print:bg-white print:border-none print:p-1">
                                                    <div>
                                                        <span className="text-sm text-white print:text-black">{p.name}</span>
                                                        <span className="text-[10px] text-[#8E9299] ml-2 font-mono print:text-black">x{p.quantity}</span>
                                                    </div>
                                                    <span className="text-sm font-mono text-amber-500 font-medium print:text-black">{formatCurrency(p.costAtTime * p.quantity)}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-white/20 italic">No parts listed.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="hidden print:block pt-12 text-center">
                                    <p className="text-xs italic">Thank you for your business!</p>
                                    <p className="text-[8px] font-mono mt-4 text-gray-400">Invoice Generated by Chalana Motors Cloud • {new Date().toLocaleString()}</p>
                                </div>
                            </div>
                            
                            <div className="p-6 bg-white/[0.02] border-t border-white/5 print:hidden">
                                <button 
                                    onClick={() => setViewingJob(null)}
                                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all font-medium text-sm border border-white/5"
                                >
                                    Close Details
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Labour Detail Modal */}
            <AnimatePresence>
                {viewingLabourDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#151619] border border-white/5 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-blue-500/5">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                                        <Wrench className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-medium text-white">{viewingLabourDetail.description}</h3>
                                        <p className="text-xs text-blue-400 font-mono uppercase tracking-widest"> Labour Detail Summary</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingLabourDetail(null)} className="p-2 hover:bg-white/5 rounded-full text-[#8E9299] hover:text-white"><X className="w-6 h-6" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4">
                                <div className="flex justify-between items-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <span className="text-[#8E9299] text-sm">Total Daily Revenue</span>
                                    <span className="text-xl font-mono text-blue-400 font-bold">{formatCurrency(viewingLabourDetail.total)}</span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest px-2">Used in following jobs</p>
                                    {dayJobs.filter(job => job.services.some(s => s.description === viewingLabourDetail.description)).map(job => (
                                        <div key={job.id} className="flex justify-between items-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                                            <div>
                                                <p className="text-sm text-white font-medium">{job.vehicleNumber || 'Walk-in'}</p>
                                                <p className="text-[10px] text-[#8E9299] font-mono">{job.jobRef}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-mono text-white">{formatCurrency(job.services.find(s => s.description === viewingLabourDetail.description)?.price || 0)}</p>
                                                <p className="text-[9px] text-[#8E9299] font-mono">{new Date(job.createdAt).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-6 bg-white/[0.02] border-t border-white/5">
                                <button onClick={() => setViewingLabourDetail(null)} className="w-full py-3 bg-white/5 text-white rounded-xl font-medium text-sm border border-white/5">Close</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Part Detail Modal */}
            <AnimatePresence>
                {viewingPartDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:hidden">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#151619] border border-white/5 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-amber-500/5">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                                        <Package className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-medium text-white">{viewingPartDetail.name}</h3>
                                        <p className="text-xs text-amber-500 font-mono uppercase tracking-widest">Part Usage Summary</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingPartDetail(null)} className="p-2 hover:bg-white/5 rounded-full text-[#8E9299] hover:text-white"><X className="w-6 h-6" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <p className="text-[10px] text-[#8E9299] font-mono uppercase mb-1">Total Quantity</p>
                                        <p className="text-xl font-mono text-amber-500 font-bold">{viewingPartDetail.quantity}</p>
                                    </div>
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <p className="text-[10px] text-[#8E9299] font-mono uppercase mb-1">Total Revenue</p>
                                        <p className="text-xl font-mono text-amber-500 font-bold">{formatCurrency(viewingPartDetail.revenue)}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest px-2">Used in following jobs</p>
                                    {dayJobs.filter(job => job.partsUsed.some(p => p.partId === viewingPartDetail.partId)).map(job => (
                                        <div key={job.id} className="flex justify-between items-center p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                                            <div>
                                                <p className="text-sm text-white font-medium">{job.vehicleNumber || 'Walk-in'}</p>
                                                <p className="text-[10px] text-[#8E9299] font-mono">{job.jobRef}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-mono text-white">x{job.partsUsed.find(p => p.partId === viewingPartDetail.partId)?.quantity || 1}</p>
                                                <p className="text-[9px] text-[#8E9299] font-mono">{formatCurrency((job.partsUsed.find(p => p.partId === viewingPartDetail.partId)?.costAtTime || 0) * (job.partsUsed.find(p => p.partId === viewingPartDetail.partId)?.quantity || 1))}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-6 bg-white/[0.02] border-t border-white/5">
                                <button onClick={() => setViewingPartDetail(null)} className="w-full py-3 bg-white/5 text-white rounded-xl font-medium text-sm border border-white/5">Close</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
