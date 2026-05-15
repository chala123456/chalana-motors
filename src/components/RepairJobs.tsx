import React, { useState, useEffect, useRef } from 'react';
import { Wrench, Plus, User, Phone, Car, Search, Save, X, History, ChevronRight, Check, Printer, Edit2, Calendar, Trash2, Smartphone, FileText } from 'lucide-react';
import { RepairJob, JobStatus, Part, UsedPart, ServicePreset, Customer } from '../types';
import { formatCurrency, cn, normalizeSearch } from '../lib/utils';
import { addDoc, collection, doc, updateDoc, serverTimestamp, increment, setDoc, getDoc, deleteDoc, query, where, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface RepairJobsProps {
  jobs: RepairJob[];
  inventory: Part[];
  loading: boolean;
  servicePresets: ServicePreset[];
  customers: Customer[];
}

export function RepairJobs({ jobs, inventory, loading, servicePresets, customers }: RepairJobsProps) {
  const [activeTab, setActiveTab] = useState<'JOBS' | 'REPORTS'>('JOBS');
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [partSearchTerm, setPartSearchTerm] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isQuickSale, setIsQuickSale] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const [newJob, setNewJob] = useState({
    customerName: '',
    contactNumber: '',
    vehicleNumber: '',
    vehicleModel: '',
    jobType: 'REPAIR' as 'REPAIR' | 'SALE',
    issue: '', // General description
    services: [] as { description: string; price: number }[],
    partsUsed: [] as UsedPart[],
    totalPartsCost: 0,
    currentKm: '',
    nextServiceDate: '',
    repairFee: 0,
    status: JobStatus.PENDING
  });
  const [currentService, setCurrentService] = useState('');
  const [currentServicePrice, setCurrentServicePrice] = useState<number>(0);
  const [currentPart, setCurrentPart] = useState('');
  const [currentPartPrice, setCurrentPartPrice] = useState<number>(0);
  const [modalPartSearch, setModalPartSearch] = useState('');

  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);

  const [isRemoteScanning, setIsRemoteScanning] = useState(false);
  const [scannedNotification, setScannedNotification] = useState<string | null>(null);
  const [quickAddBarcode, setQuickAddBarcode] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState<number>(0);
  const lastScanTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!auth.currentUser) return;
    const presenceRef = doc(db, 'status', auth.currentUser.uid);
    setDoc(presenceRef, {
      remoteReceiverActive: isRemoteScanning,
      lastActive: serverTimestamp(),
      userId: auth.currentUser.uid
    }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `status/${auth.currentUser?.uid}`));
  }, [isRemoteScanning]);


  const handleWhatsApp = (job: RepairJob) => {
    const custName = job.customerName || 'පාරිභෝගිකයා';
    const message = `*CHALANA MOTORS (චලන මෝටර්ස්)* 🛠️
-----------------------------------------
ආයුබෝවන් ${custName}, ඔබගේ වාහනයේ අලුත්වැඩියා කටයුතු පිළිබඳ විස්තර පහත දැක්වේ.

📌 *සේවා වාර්තාව:*
• වාහන අංකය: ${job.vehicleNumber} (${job.vehicleModel})
• වත්මන් දුර: ${job.currentKm || '---'} KM
• මුළු මුදල: Rs. ${(job.repairFee + (job.totalPartsCost || 0)).toLocaleString()}

📅 *මීළඟ සේවා වාරය:* ${job.nextServiceDate || '---'}

පහසු සහ ආරක්ෂිත ගමනකට අප සැමවිටම කැපවී සිටිමු! 🤝
-----------------------------------------
ස්තූතියි,
*Chalana Motors*`;

    if (!job.contactNumber) {
        alert('Contact number is missing for this job.');
        return;
    }
    // Format phone number for WhatsApp (Sri Lanka: 94)
    let phone = job.contactNumber.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '94' + phone.substring(1);
    } else if (phone.length === 9 && (phone.startsWith('7') || phone.startsWith('1') || phone.startsWith('2'))) {
      phone = '94' + phone;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const lookupCustomer = async (number: string) => {
    if (number.length < 9) {
      setFoundCustomer(null);
      return;
    }
    try {
      // First try to look up in customers collection
      const existingCustomer = customers.find(c => c.contactNumber.includes(number));
      if (existingCustomer) {
        setFoundCustomer(existingCustomer);
        setNewJob(prev => ({
          ...prev,
          customerName: existingCustomer.customerName,
          vehicleNumber: (existingCustomer.vehicleNumbers && existingCustomer.vehicleNumbers.length > 0) ? existingCustomer.vehicleNumbers[0] : prev.vehicleNumber
        }));
        return;
      }

      // Fallback to searching previous jobs
      const q = jobs.find(j => j.contactNumber.includes(number));
      if (q) {
        setNewJob(prev => ({
          ...prev,
          customerName: q.customerName,
          vehicleNumber: q.vehicleNumber,
          vehicleModel: q.vehicleModel
        }));
      } else {
        setFoundCustomer(null);
      }
    } catch (err) {
      console.error('Error looking up customer:', err);
    }
  };

  React.useEffect(() => {
    const total = newJob.partsUsed.reduce((sum, p) => sum + (p.costAtTime * (p.quantity || 1)), 0);
    if (newJob.totalPartsCost !== total) {
      setNewJob(prev => ({ ...prev, totalPartsCost: total }));
    }
  }, [newJob.partsUsed]);

  const calculateReports = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const stats = (since: string) => {
      const filtered = jobs.filter(j => j.createdAt && j.createdAt >= since && j.status === JobStatus.COMPLETED);
      const revenue = filtered.reduce((sum, j) => sum + (j.repairFee + (j.totalPartsCost || 0)), 0);
      const profit = filtered.reduce((sum, j) => sum + (j.profit || 0), 0);
      return { revenue, profit, count: filtered.length };
    };

    return {
      daily: stats(today),
      weekly: stats(startOfWeek),
      monthly: stats(startOfMonth)
    };
  };

  const reports = calculateReports();

  const [newPreset, setNewPreset] = useState({ name: '', price: 0, type: 'service' as 'service' | 'part' });

  const handleAddPreset = async () => {
    if (!auth.currentUser || !newPreset.name) return;
    try {
      await addDoc(collection(db, 'service_presets'), {
        ...newPreset,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      setNewPreset({ name: '', price: 0, type: 'service' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'service_presets');
    }
  };

  const deletePreset = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'service_presets', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `service_presets/${id}`);
    }
  };

  const usePreset = (preset: ServicePreset) => {
    setCurrentService(preset.name);
    setCurrentServicePrice(preset.price);
  };

  const generateJobRef = () => {
    return `CM-${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const filteredJobs = jobs.filter(j => {
    const jobDate = j.createdAt ? new Date(j.createdAt).toISOString().split('T')[0] : '';
    const today = new Date().toISOString().split('T')[0];
    
    const term = normalizeSearch(searchTerm);
    const matchesSearch = normalizeSearch(j.vehicleNumber).includes(term) ||
      normalizeSearch(j.customerName).includes(term) ||
      normalizeSearch(j.id).includes(term) ||
      (j.jobRef && normalizeSearch(j.jobRef).includes(term));
    
    const matchesDate = !dateFilter ? true : (jobDate === dateFilter);
    const matchesStatus = statusFilter === 'ALL' || j.status === statusFilter;
    
    return matchesSearch && matchesDate && matchesStatus;
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

  const handleAddManualPart = () => {
    if (currentPart.trim()) {
      const customPart = { 
        partId: `CUSTOM_${Date.now()}`, 
        name: currentPart.trim(), 
        quantity: 1, 
        costAtTime: currentPartPrice || 0,
        purchasePriceAtTime: currentPartPrice ? (currentPartPrice * 0.7) : 0 // Default cost estimate for manual parts
      };
      setNewJob({...newJob, partsUsed: [...newJob.partsUsed, customPart]});
      setCurrentPart('');
      setCurrentPartPrice(0);
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

      const totalPartsCost = Number(newJob.partsUsed.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0) || 0);
      const totalPartsPurchaseCost = Number(newJob.partsUsed.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0) || 0);
      const repairFeeNum = Number(newJob.repairFee || 0);
      
      // Profit is Labour (repairFeeNum) + Parts Profit (Selling - Buying)
      const partsProfit = totalPartsCost - totalPartsPurchaseCost;
      const profit = repairFeeNum + partsProfit;

      const docRef = await addDoc(collection(db, 'jobs'), {
        ...newJob,
        repairFee: repairFeeNum,
        jobRef: jobRefCode,
        services: finalServices,
        totalPartsCost,
        profit,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });

      // Update or Create Customer Record
      try {
        if (newJob.contactNumber) {
            const existingCust = customers.find(c => c.contactNumber === newJob.contactNumber);
            if (existingCust) {
              const updatedVehicles = Array.from(new Set([...(existingCust.vehicleNumbers || []), newJob.vehicleNumber])).filter(v => !!v);
              await updateDoc(doc(db, 'customers', existingCust.id), {
                customerName: newJob.customerName,
                vehicleNumbers: updatedVehicles
              });
            } else if (newJob.customerName) {
              await addDoc(collection(db, 'customers'), {
                customerName: newJob.customerName,
                contactNumber: newJob.contactNumber,
                vehicleNumbers: [newJob.vehicleNumber].filter(v => !!v),
                userId: auth.currentUser.uid,
                createdAt: new Date().toISOString()
              });
            }
        }
      } catch (custErr) {
        console.error('Error updating customer record:', custErr);
      }
      
      // Update inventory for parts used in this sale
      if (newJob.partsUsed.length > 0) {
        for (const p of newJob.partsUsed) {
          if (p.partId && !p.partId.startsWith('PRESET_') && !p.partId.startsWith('CUSTOM_')) {
            const partRef = doc(db, 'inventory', p.partId);
            await updateDoc(partRef, {
              quantity: increment(-p.quantity)
            });
          }
        }
      }

      if (newJob.jobType === 'SALE') {
        setSelectedJobId(docRef.id);
        const savedJob = { 
            ...newJob, 
            id: docRef.id, 
            jobRef: jobRefCode, 
            services: finalServices, 
            totalPartsCost, 
            profit, 
            repairFee: repairFeeNum 
        } as RepairJob;
        setTimeout(() => handlePrint(savedJob), 300);
      }
      
      setIsAdding(false);
      setNewJob({
        customerName: '',
        contactNumber: '',
        vehicleNumber: '',
        vehicleModel: '',
        jobType: 'REPAIR',
        issue: '',
        services: [],
        partsUsed: [],
        totalPartsCost: 0,
        currentKm: '',
        nextServiceDate: '',
        repairFee: 0,
        status: JobStatus.PENDING
      });
      setCurrentService('');
      setCurrentServicePrice(0);
      setModalPartSearch('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'jobs');
    }
  };

  const handleEditJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !newJob) return;

    try {
      const job = jobs.find(j => j.id === selectedJobId);
      if (!job) return;

      const finalServices = newJob.services.length > 0 
        ? newJob.services 
        : (newJob.issue ? [{ description: newJob.issue, price: newJob.repairFee }] : []);

      const partsRevenue = newJob.partsUsed.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0);
      const partsPurchaseCost = newJob.partsUsed.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0);
      const partsProfit = partsRevenue - partsPurchaseCost;
      
      const profit = newJob.repairFee + partsProfit;

      await updateDoc(doc(db, 'jobs', selectedJobId), {
        ...newJob,
        services: finalServices,
        profit
      });
      setIsEditing(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${selectedJobId}`);
    }
  };

  const startEdit = (job: RepairJob) => {
    setNewJob({
      customerName: job.customerName,
      contactNumber: job.contactNumber,
      vehicleNumber: job.vehicleNumber,
      vehicleModel: job.vehicleModel,
      jobType: job.jobType || 'REPAIR',
      issue: job.issue || '',
      services: job.services || [],
      partsUsed: job.partsUsed || [],
      totalPartsCost: job.totalPartsCost || 0,
      currentKm: job.currentKm || '',
      nextServiceDate: job.nextServiceDate || '',
      repairFee: job.repairFee,
      status: job.status
    });
    setIsEditing(true);
  };


  const deleteJob = async (jobId: string) => {
    try {
      await deleteDoc(doc(db, 'jobs', jobId));
      if (selectedJobId === jobId) setSelectedJobId(null);
      setSelectedJobIds(prev => prev.filter(id => id !== jobId));
      setConfirmDeleteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `jobs/${jobId}`);
    }
  };

  const deleteSelectedJobs = async () => {
    if (!auth.currentUser) {
      alert("Please sign in to delete records.");
      return;
    }

    const idsToDelete = [...selectedJobIds];
    const count = idsToDelete.length;
    if (count === 0) return;

    if (!window.confirm(`Remove ${count} selected records forever?`)) return;

    setIsClearing(true);
    try {
      // Batch deletes in chunks of 500 (Firestore limit)
      const chunks = [];
      for (let i = 0; i < idsToDelete.length; i += 500) {
        chunks.push(idsToDelete.slice(i, i + 500));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(id => {
          batch.delete(doc(db, 'jobs', id));
        });
        await batch.commit();
      }

      setSelectedJobIds([]);
      if (selectedJobId && idsToDelete.includes(selectedJobId)) {
        setSelectedJobId(null);
      }
      alert(`${count} records deleted.`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Deletion failed:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, 'jobs/multiple');
      } catch (e) {
        // Fallback alert for the user since handleFirestoreError only throws
        alert("Delete failed. You might not have permission or there's a connection issue.");
      }
    } finally {
      setIsClearing(false);
    }
  };

  const toggleJobSelection = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setSelectedJobIds(prev => 
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  const selectAllFiltered = () => {
    const allIds = filteredJobs.map(j => j.id);
    setSelectedJobIds(allIds);
  };

  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const clearAllJobs = async () => {
    if (!auth.currentUser || jobs.length === 0) {
      if (jobs.length === 0) alert('No records to clear.');
      return;
    }
    
    setIsClearing(true);
    try {
      const batchSize = 500;
      for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = jobs.slice(i, i + batchSize);
        chunk.forEach(job => {
          batch.delete(doc(db, 'jobs', job.id));
        });
        await batch.commit();
      }

      setSelectedJobId(null);
      setSelectedJobIds([]);
      setConfirmClearAll(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'jobs/all');
    } finally {
      setIsClearing(false);
    }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const addPresetToJob = async (preset: ServicePreset) => {
    if (!selectedJob) return;

    try {
      const jobRef = doc(db, 'jobs', selectedJob.id);
      
      if (preset.type === 'part') {
        const usedPart: UsedPart = {
          partId: `PRESET_${preset.id}`,
          name: preset.name,
          quantity: 1,
          costAtTime: preset.price,
          purchasePriceAtTime: 0 // Presets don't have buying price yet, default to 0 profit on this part if not specified
        };
        const updatedParts = [...(selectedJob.partsUsed || []), usedPart];
        const totalPartsCost = updatedParts.reduce((sum, p) => sum + (p.costAtTime * (p.quantity || 1)), 0);
        const totalPartsPurchaseCost = updatedParts.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * (p.quantity || 1)), 0);
        
        const repairFee = selectedJob.repairFee || 0;
        const profit = repairFee + (totalPartsCost - totalPartsPurchaseCost);

        await updateDoc(jobRef, {
          partsUsed: updatedParts,
          totalPartsCost,
          profit
        });
      } else {
        const newService = { description: preset.name, price: preset.price };
        const updatedServices = [...(selectedJob.services || []), newService];
        const repairFee = updatedServices.reduce((sum, s) => sum + s.price, 0);
        
        const totalPartsCost = selectedJob.totalPartsCost || 0;
        const totalPartsPurchaseCost = selectedJob.partsUsed?.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0) || 0;
        const profit = repairFee + (totalPartsCost - totalPartsPurchaseCost);
        
        await updateDoc(jobRef, {
          services: updatedServices,
          repairFee,
          profit
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${selectedJob.id}`);
    }
  };

  const addPartToJob = React.useCallback(async (partId: string) => {
    if (!selectedJob) return;
    const part = inventory.find(p => p.id === partId);
    if (!part) return;

    // We allow adding parts even if quantity is 0 in system, but we warn
    const usedPart: UsedPart = {
      partId: part.id,
      name: part.name,
      quantity: 1,
      costAtTime: part.costPrice,
      purchasePriceAtTime: part.purchasePrice || 0
    };

    const updatedParts = [...(selectedJob.partsUsed || []), usedPart];
    const totalPartsCost = updatedParts.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0);
    const totalPartsPurchaseCost = updatedParts.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0);
    const profit = selectedJob.repairFee + (totalPartsCost - totalPartsPurchaseCost);

    try {
      const jobRef = doc(db, 'jobs', selectedJob.id);
      await updateDoc(jobRef, {
        partsUsed: updatedParts,
        totalPartsCost,
        profit
      });
      
      // Update inventory (decrement)
      const partRef = doc(db, 'inventory', partId);
      await updateDoc(partRef, {
        quantity: increment(-1)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${selectedJob.id}`);
    }
  }, [selectedJob, inventory]);

  const addManualPartToJob = async () => {
    if (!selectedJob || !currentPart) return;

    const usedPart: UsedPart = {
      partId: `MANUAL_${Date.now()}`,
      name: currentPart,
      quantity: 1,
      costAtTime: currentPartPrice,
      purchasePriceAtTime: currentPartPrice * 0.7 // Estimate purchase cost as 70% if unknown
    };

    const updatedParts = [...(selectedJob.partsUsed || []), usedPart];
    const totalPartsCost = updatedParts.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0);
    const totalPartsPurchaseCost = updatedParts.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0);
    const profit = selectedJob.repairFee + (totalPartsCost - totalPartsPurchaseCost);

    try {
      const jobRef = doc(db, 'jobs', selectedJob.id);
      await updateDoc(jobRef, {
        partsUsed: updatedParts,
        totalPartsCost,
        profit
      });
      setCurrentPart('');
      setCurrentPartPrice(0);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${selectedJob.id}`);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (isRemoteScanning && auth.currentUser) {
      const scanDocRef = doc(db, 'remote_scans', auth.currentUser.uid);
      unsubscribe = onSnapshot(scanDocRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const timestamp = data.updatedAt?.toMillis() || 0;
          
          // Use a 5-second buffer to handle minor clock skews between client and server
          if (timestamp > (lastScanTimeRef.current - 5000)) {
            const barcode = data.barcode;
            if (barcode && data.status === 'pending') {
              // Lock the state immediately by resetting lastScanTime to avoid double processing
              lastScanTimeRef.current = timestamp;
              
              const part = inventory.find(p => p.barcode === barcode);
              if (part) {
                // If we are in Add/Edit modal, add to the modal's state
                if (isAdding || isEditing) {
                  setNewJob(prev => {
                    const existingPart = prev.partsUsed.find(up => up.partId === part.id);
                    let updatedParts;
                    if (existingPart) {
                      updatedParts = prev.partsUsed.map(up => up.partId === part.id ? {...up, quantity: up.quantity + 1} : up);
                    } else {
                      updatedParts = [...prev.partsUsed, { 
                        partId: part.id, 
                        name: part.name, 
                        quantity: 1, 
                        costAtTime: part.costPrice,
                        purchasePriceAtTime: part.purchasePrice || 0
                      }];
                    }
                    return { ...prev, partsUsed: updatedParts };
                  });
                  setScannedNotification(`Added to form: ${part.name}`);
                } 
                // Otherwise, add to the selected active job in Firestore
                else if (selectedJobId) {
                  addPartToJob(part.id);
                  setScannedNotification(`Added to bill: ${part.name}`);
                }
                else {
                  setScannedNotification("Select a job or open New Job form first!");
                  // Notify mobile about the missing target
                  updateDoc(scanDocRef, {
                    status: 'error',
                    partName: 'Select Job/Form', 
                    updatedAt: serverTimestamp()
                  }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `remote_scans/${auth.currentUser?.uid}`));
                  return; 
                }
                
                // CRITICAL: Successfully processed, update status to notify mobile
                updateDoc(scanDocRef, {
                  status: 'added',
                  partName: part.name,
                  updatedAt: serverTimestamp()
                }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `remote_scans/${auth.currentUser?.uid}`));

                setTimeout(() => setScannedNotification(null), 3000);
              } else {
                setScannedNotification(`Barcode ${barcode} not found!`);
                setQuickAddBarcode(barcode);
                setQuickAddName('');
                setQuickAddPrice(0);
                
                // Notify mobile specifically about not_found to trigger Quick Add form on phone
                updateDoc(scanDocRef, {
                  status: 'not_found',
                  partName: 'Not Found',
                  updatedAt: serverTimestamp()
                }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `remote_scans/${auth.currentUser?.uid}`));

                setTimeout(() => setScannedNotification(null), 3000);
              }
            } else if (barcode && data.status === 'pending' && data.quickAddData) {
              // HANDLE MOBILE QUICK ADD REQUEST
              lastScanTimeRef.current = timestamp;
              const { name, price } = data.quickAddData;
              
              try {
                // 1. Create part
                const partRef = await addDoc(collection(db, 'inventory'), {
                    name,
                    barcode,
                    costPrice: price,
                    purchasePrice: price * 0.7, // Estimate purchase at 70% for quick add if not known
                    quantity: 0,
                    minStock: 1,
                    category: 'Quick Add',
                    description: 'Created via mobile Quick Add',
                    userId: auth.currentUser.uid,
                    createdAt: serverTimestamp()
                });

                // 2. Add to job/form
                if (isAdding || isEditing) {
                    setNewJob(prev => ({
                        ...prev,
                        partsUsed: [...prev.partsUsed, { 
                            partId: partRef.id, 
                            name, 
                            quantity: 1, 
                            costAtTime: price,
                            purchasePriceAtTime: price * 0.7
                        }]
                    }));
                } else if (selectedJobId) {
                    addPartToJob(partRef.id);
                }

                // 3. Notify Success
                updateDoc(scanDocRef, {
                    status: 'added',
                    partName: name,
                    updatedAt: serverTimestamp()
                }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `remote_scans/${auth.currentUser?.uid}`));

                setScannedNotification(`Quick Added: ${name}`);
                setTimeout(() => setScannedNotification(null), 3000);
              } catch (err) {
                console.error("Mobile quick add error:", err);
              }
            }
          }
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `remote_scans/${auth.currentUser?.uid}`);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isRemoteScanning, selectedJobId, inventory, addPartToJob, isAdding, isEditing]);

  const removePartFromJob = async (partIndex: number) => {
    if (!selectedJob) return;
    const partToRemove = selectedJob.partsUsed[partIndex];
    if (!partToRemove) return;

    try {
      const updatedParts = selectedJob.partsUsed.filter((_, i) => i !== partIndex);
      const totalPartsCost = updatedParts.reduce((sum, p) => sum + (p.costAtTime * (p.quantity || 1)), 0);
      const totalPartsPurchaseCost = updatedParts.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * (p.quantity || 1)), 0);
      const profit = (selectedJob.repairFee || 0) + (totalPartsCost - totalPartsPurchaseCost);
      
      const jobRef = doc(db, 'jobs', selectedJob.id);
      await updateDoc(jobRef, {
        partsUsed: updatedParts,
        totalPartsCost,
        profit
      });

      if (!partToRemove.partId.startsWith('PRESET_')) {
          const partRef = doc(db, 'inventory', partToRemove.partId);
          await updateDoc(partRef, {
            quantity: increment(partToRemove.quantity || 1)
          });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${selectedJob.id}`);
    }
  };

  const removeServiceFromJob = async (serviceIndex: number) => {
    if (!selectedJob) return;
    
    try {
        const updatedServices = selectedJob.services.filter((_, i) => i !== serviceIndex);
        const repairFee = updatedServices.reduce((sum, s) => sum + s.price, 0);
        const totalPartsCost = selectedJob.totalPartsCost || 0;
        const totalPartsPurchaseCost = selectedJob.partsUsed?.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0) || 0;
        const profit = repairFee + (totalPartsCost - totalPartsPurchaseCost);
        
        const jobRef = doc(db, 'jobs', selectedJob.id);
        await updateDoc(jobRef, {
            services: updatedServices,
            repairFee,
            profit
        });
    } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `jobs/${selectedJob.id}`);
    }
  }

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddBarcode || !quickAddName || !auth.currentUser) return;

    try {
      // 1. Create part in inventory
      const partRef = await addDoc(collection(db, 'inventory'), {
        name: quickAddName,
        barcode: quickAddBarcode,
        costPrice: quickAddPrice,
        sellingPrice: quickAddPrice, // Defaulting selling to cost for quick add
        quantity: 0, // Will be incremented or just added to job
        minStock: 1,
        category: 'Quick Add',
        description: 'Auto-created via quick add scanner',
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });

      // 2. Add to Job or Form
      if (isAdding || isEditing) {
        setNewJob(prev => {
          const updatedParts = [...prev.partsUsed, { 
            partId: partRef.id, 
            name: quickAddName, 
            quantity: 1, 
            costAtTime: quickAddPrice,
            purchasePriceAtTime: quickAddPrice * 0.7 // Estimate buying price
          }];
          return { ...prev, partsUsed: updatedParts };
        });
        setScannedNotification(`Added to form: ${quickAddName}`);
      } else if (selectedJobId) {
        // addPartToJob logic but with new ID
        const usedPart: UsedPart = {
          partId: partRef.id,
          name: quickAddName,
          quantity: 1,
          costAtTime: quickAddPrice,
          purchasePriceAtTime: quickAddPrice * 0.7 // Estimate
        };
        const jobRef = doc(db, 'jobs', selectedJobId);
        const job = jobs.find(j => j.id === selectedJobId);
        if (job) {
          const updatedParts = [...(job.partsUsed || []), usedPart];
          const totalPartsCost = updatedParts.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0);
          const totalPartsPurchaseCost = updatedParts.reduce((sum, p) => sum + ((p.purchasePriceAtTime || 0) * p.quantity), 0);
          const profit = (job.repairFee || 0) + (totalPartsCost - totalPartsPurchaseCost);
          
          await updateDoc(jobRef, {
            partsUsed: updatedParts,
            totalPartsCost,
            profit
          });
        }
        setScannedNotification(`Added to bill: ${quickAddName}`);
      }

      // 3. Update Sync doc to success
      const scanDocRef = doc(db, 'remote_scans', auth.currentUser.uid);
      await updateDoc(scanDocRef, {
        status: 'added',
        partName: quickAddName,
        updatedAt: serverTimestamp()
      });

      // Reset
      setQuickAddBarcode(null);
      setTimeout(() => setScannedNotification(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'inventory/quick_add');
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
              
              const totalJobRevenue = job.repairFee + (job.totalPartsCost || 0);

              const summarySnap = await getDoc(summaryRef);
              if (summarySnap.exists()) {
                  await updateDoc(summaryRef, {
                      totalRevenue: increment(totalJobRevenue),
                      totalProfit: increment(job.profit || 0),
                      jobCount: increment(1),
                      lastUpdated: serverTimestamp()
                  });
              } else {
                  await setDoc(summaryRef, {
                      id: today,
                      userId: auth.currentUser.uid,
                      totalRevenue: totalJobRevenue,
                      totalProfit: job.profit || 0,
                      jobCount: 1,
                      lastUpdated: serverTimestamp()
                  });
              }
          }
      } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `jobs/${jobId}`);
      }
  };

  const handlePrint = (jobInput?: RepairJob | React.MouseEvent) => {
    // Determine the job to print: if jobInput is a MouseEvent or undefined, use selectedJob
    let jobToPrint: RepairJob | null = null;
    
    if (jobInput && 'id' in jobInput && typeof (jobInput as any).id === 'string') {
        jobToPrint = jobInput as RepairJob;
    } else {
        jobToPrint = selectedJob || null;
    }

    if (!jobToPrint) return;
    
    // Ensure numeric values to prevent NaN or string concatenation issues
    const repairFee = Number(jobToPrint.repairFee || 0);
    
    // Safety: recalculate parts cost if if it's missing or if we want to be sure
    const partsCost = Number(jobToPrint.totalPartsCost || jobToPrint.partsUsed?.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0) || 0);
    const totalAmount = repairFee + partsCost;
    
    const customerName = (jobToPrint.customerName || 'VALUED CUSTOMER').toUpperCase();
    const vehicleNo = (jobToPrint.vehicleNumber || '').toUpperCase();
    const vehicleModel = (jobToPrint.vehicleModel || '').toUpperCase();
    const jobRef = jobToPrint.jobRef || 'N/A';
    const dateStr = new Date().toLocaleDateString('en-LK');
    const timeStr = new Date().toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: true });

    const billHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>THERMAL BILL - ${vehicleNo || 'SALE'}</title>
          <style>
              @page { margin: 0; size: 80mm auto; }
              * { -webkit-print-color-adjust: exact; box-sizing: border-box; }
              html, body { margin: 0; padding: 0; width: 100%; height: auto !important; overflow: visible !important; }
              body { 
                  max-width: 80mm; margin: 0 auto; padding: 1mm 2mm 5mm 2mm;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
                  font-size: 18px; line-height: 1.2;
                  color: #000; background: #fff;
                  font-weight: 900;
                  text-rendering: optimizeLegibility;
                  -webkit-font-smoothing: antialiased;
               }
              .no-print { 
                padding: 15px; 
                background: #151619; 
                margin-bottom: 5px; 
                text-align: center; 
                border-radius: 0 0 10px 10px;
                color: white;
              }
              .btn-print { 
                background: white; 
                color: black; 
                padding: 12px 24px; 
                border: none; 
                font-weight: 900; 
                font-size: 16px; 
                cursor: pointer; 
                width: 100%;
                border-radius: 6px;
                text-transform: uppercase;
              }
              .btn-print:hover { background: #e4e3e0; }
              
              @media print { 
                  .no-print { display: none !important; } 
                  * { color: #000 !important; background: #fff !important; box-shadow: none !important; text-shadow: none !important; }
                  html, body { margin: 0 !important; padding: 0 !important; width: 80mm !important; height: auto !important; }
                  body { padding: 1mm 2mm 5mm 2mm !important; }
                  @page { size: auto; margin: 0mm; }
              }
              
              .bill-container { page-break-inside: avoid !important; break-inside: avoid !important; display: block; }
              .text-center { text-align: center; }
              .line-b { border-bottom: 2px solid #000; margin-bottom: 4px; padding-bottom: 2px; }
              .dealer { font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1; white-space: nowrap; }
              
              .info-box { border: 2px solid #000; padding: 4px; margin: 5px 0; text-align: center; }
              .v-no { font-size: 32px; font-weight: 900; border-bottom: 2px solid #000; display: block; margin-bottom: 2px; }
              
              .category-header { 
                  font-weight: 900; 
                  border-top: 1.5px solid #000;
                  border-bottom: 1.5px solid #000;
                  padding: 2px 0; 
                  margin-top: 8px; 
                  font-size: 16px;
                  text-transform: uppercase;
                  text-align: center;
              }
              
              .item-table { width: 100%; margin-top: 2px; }
              .item-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 17px; font-weight: 900; gap: 10px; }
              .item-desc { flex: 1; text-align: left; word-break: break-all; }
              .item-price { text-align: right; min-width: 100px; font-weight: 900; white-space: nowrap; }
              
              .total-section { 
                  font-size: 28px; 
                  font-weight: 900; 
                  border-top: 3px solid #000; 
                  border-bottom: 6px double #000; 
                  padding: 5px 0; 
                  margin-top: 8px;
              }
              .total-row { width: 100%; display: flex; justify-content: space-between; }
              
              .footer { margin-top: 12px; border-top: 2px dashed #000; padding-top: 10px; text-align: center; page-break-after: avoid !important; }
          </style>
      </head>
      <body>
          <div class="no-print">
              <button class="btn-print" onclick="window.print()">PRINT SLIP (80mm)</button>
              <div style="font-size: 11px; margin-top: 8px; font-family: sans-serif;">Close this window after printing</div>
          </div>

          <div class="bill-container">
              <div class="text-center line-b" style="margin-bottom: 4px; padding-bottom: 6px;">
                  <div class="dealer">CHALANA MOTORS</div>
              </div>
  
              <div style="font-weight: 900; font-size: 18px; display: flex; flex-direction: column; gap: 2px; margin-top: 6px;">
                  <div style="display: flex; justify-content: space-between;"><span>REF: ${jobRef}</span> <span>${dateStr}</span></div>
                  <div style="display: flex; justify-content: space-between;"><span>TIME: ${timeStr}</span></div>
              </div>
  
              ${(jobToPrint.jobType !== 'SALE' || (vehicleNo && vehicleNo !== 'COUNTER SALE')) ? `
              <div class="info-box">
                  ${vehicleNo ? `<span class="v-no">${vehicleNo}</span>` : ''}
                  ${vehicleModel ? `<div style="font-weight: 900; font-size: 18px;">${vehicleModel}</div>` : ''}
                  <div style="margin-top: 2px; font-size: 15px; font-weight: 900;">customer: ${customerName.toLowerCase()}</div>
                  ${jobToPrint.contactNumber ? `<div style="font-size: 15px; font-weight: 900; margin-top: 1px;">TEL: ${jobToPrint.contactNumber}</div>` : ''}
              </div>
              ` : `
              <div style="margin-top: 10px; padding: 10px 0; border: 2px solid #000; text-align: center; margin-bottom: 5px;">
                  <div style="font-weight: 900; font-size: 24px; text-transform: uppercase;">Direct Parts Sale</div>
                  <div style="font-size: 16px; font-weight: 900; margin-top: 5px;">CUSTOMER: ${customerName}</div>
                  ${jobToPrint.contactNumber ? `<div style="font-size: 15px; font-weight: 900; margin-top: 1px;">TEL: ${jobToPrint.contactNumber}</div>` : ''}
              </div>
              `}
  
              ${(jobToPrint.jobType !== 'SALE' && jobToPrint.nextServiceDate) ? `
                  <div style="border: 1.5px solid #000; padding: 4px; text-align: center; margin: 6px 0; font-weight: 900; background: #fff;">
                      <span style="font-size: 12px;">NEXT SERVICE DUE:</span><br>
                      <span style="font-size: 20px;">${jobToPrint.nextServiceDate.toUpperCase()}</span>
                  </div>
              ` : ''}
  
              ${jobToPrint.jobType !== 'SALE' ? `
              <div class="category-header">SERVICES & LABOR</div>
              <div class="item-table">
                  ${(jobToPrint.services && jobToPrint.services.length > 0) ? 
                      jobToPrint.services.map(s => `
                          <div class="item-row">
                              <span class="item-desc">${(s.description || 'Service').toUpperCase()}</span>
                              <span class="item-price">${Number(s.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                          </div>
                      `).join('') : `
                          <div class="item-row">
                              <span class="item-desc">${(jobToPrint.issue || 'REPAIR/SERVICE').toUpperCase()}</span>
                              <span class="item-price">${Number(jobToPrint.repairFee || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                          </div>
                  `}
              </div>
              ` : ''}
  
              ${jobToPrint.partsUsed && jobToPrint.partsUsed.length > 0 ? `
                  <div class="category-header">SPARE PARTS</div>
                  <div class="item-table">
                      ${jobToPrint.partsUsed.map(p => `
                          <div class="item-row">
                              <span class="item-desc">${p.name.toUpperCase()} (x${p.quantity})</span>
                              <span class="item-price">${Number(p.quantity * p.costAtTime).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                          </div>
                      `).join('')}
                  </div>
              ` : ''}
  
              <div class="total-section">
                  <div class="total-row">
                      <span>TOTAL Rs.</span>
                      <span>${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
              </div>
  
              <div class="footer">
                  <div style="font-weight: 900; font-size: 18px;">THANK YOU!</div>
                  <div style="font-size: 13px; font-weight: 900; margin-top: 5px;">Professional Service for Your Ride</div>
                  <div style="font-size: 17px; font-weight: 900; margin-top: 10px; border: 2px solid #000; padding: 5px; display: inline-block;">Hotline: 071 858 7456</div>
                  <div style="font-size: 13px; margin-top: 8px; font-weight: 900;">TRANS-ID: ${(jobToPrint.id || 'NEW').toUpperCase()}</div>
              </div>
          </div>
          <script>
              window.onload = function() {
                  setTimeout(function() { window.print(); }, 1000);
              };
          </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(billHtml);
      printWindow.document.close();
    } else {
      alert('Please allow popups to open the bill preview.');
    }
  };

  const handleViewFullBill = (jobInput?: RepairJob) => {
    let jobToPrint: RepairJob | null = null;
    if (jobInput && 'id' in jobInput) {
        jobToPrint = jobInput;
    } else {
        jobToPrint = selectedJob || null;
    }

    if (!jobToPrint) return;
    
    // Ensure numeric values to prevent NaN or string concatenation issues
    const repairFee = Number(jobToPrint.repairFee || 0);
    const partsCost = Number(jobToPrint.totalPartsCost || jobToPrint.partsUsed?.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0) || 0);
    const totalAmount = repairFee + partsCost;
    
    const customerName = (jobToPrint.customerName || 'Walk-in Customer').toUpperCase();
    const vehicleNo = (jobToPrint.vehicleNumber || 'COUNTER SALE').toUpperCase();
    const jobRef = jobToPrint.jobRef || 'N/A';
    const dateStr = new Date().toLocaleDateString('en-LK');

    const fullBillHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>FULL BILL - ${vehicleNo}</title>
          <style>
              @media print { .no-print { display: none !important; } @page { margin: 1cm; size: A4; } }
              body { font-family: sans-serif; background: #f4f4f4; padding: 40px; display: flex; flex-direction: column; align-items: center; }
              .bill-a4 { background: white; width: 210mm; min-height: 297mm; padding: 20mm; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
              .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
              .toolbar { width: 210mm; display: flex; justify-content: space-between; align-items: center; background: #151619; color: white; padding: 15px 25px; border-radius: 8px; margin-bottom: 20px; }
              .btn-action { background: white; color: black; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 15px; }
              .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              .table th { border-bottom: 2px solid #000; text-align: left; padding: 10px; }
              .table td { border-bottom: 1px solid #eee; padding: 10px; }
              .total { margin-top: 30px; text-align: right; font-size: 24px; font-weight: bold; }
          </style>
      </head>
      <body>
          <div class="toolbar no-print">
            <div style="font-weight: bold;">BILL PREVIEW (A4)</div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-action" onclick="window.print()">PRINT BILL</button>
                <button class="btn-action" onclick="window.close()">CLOSE</button>
            </div>
          </div>
          <div class="bill-a4">
              <div class="header">
                  <div>
                      <h1 style="margin: 0; font-size: 36px;">CHALANA MOTORS</h1>
                      <p style="margin: 5px 0;">Specialists in All Mechanical Repairs & Spare Parts</p>
                  </div>
                  <div style="text-align: right;">
                      <p style="font-weight: bold; margin: 0;">REF: ${jobRef}</p>
                      <p style="margin: 0;">Date: ${dateStr}</p>
                  </div>
              </div>
              <div style="display: grid; grid-cols-2: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                  <div>
                      <h3 style="border-bottom: 1px solid #000; padding-bottom: 5px;">CUSTOMER INFO</h3>
                      <p><b>Name:</b> ${customerName}</p>
                      <p><b>Phone:</b> ${jobToPrint.contactNumber || 'N/A'}</p>
                  </div>
                  <div style="text-align: right;">
                      <h3 style="border-bottom: 1px solid #000; padding-bottom: 5px;">VEHICLE INFO</h3>
                      <p><b>Number:</b> ${vehicleNo}</p>
                      <p><b>Model:</b> ${jobToPrint.vehicleModel || 'N/A'}</p>
                  </div>
              </div>

              <h3 style="background: #f8f8f8; padding: 10px; border-left: 5px solid #000;">SERVICE & LABOUR</h3>
              <table class="table">
                  <thead><tr><th>Description</th><th style="text-align: right;">Amount</th></tr></thead>
                  <tbody>
                      ${jobToPrint.services?.map(s => `<tr><td>${s.description}</td><td style="text-align: right;">${formatCurrency(s.price)}</td></tr>`).join('') || `<tr><td>${jobToPrint.issue || 'Repair Service'}</td><td style="text-align: right;">${formatCurrency(repairFee)}</td></tr>`}
                  </tbody>
              </table>

              ${jobToPrint.partsUsed && jobToPrint.partsUsed.length > 0 ? `
              <h3 style="background: #f8f8f8; padding: 10px; border-left: 5px solid #000; margin-top: 40px;">PARTS & MATERIALS</h3>
              <table class="table">
                  <thead><tr><th>Part Name</th><th style="text-align: center;">Qty</th><th style="text-align: right;">Total</th></tr></thead>
                  <tbody>
                      ${jobToPrint.partsUsed.map(p => `<tr><td>${p.name}</td><td style="text-align: center;">${p.quantity}</td><td style="text-align: right;">${formatCurrency(p.costAtTime * p.quantity)}</td></tr>`).join('')}
                  </tbody>
              </table>
              ` : ''}

              <div class="total">
                  GRAND TOTAL: ${formatCurrency(totalAmount)}
              </div>

              <div style="margin-top: 100px; border-top: 1px solid #eee; pt: 20px; text-align: center;">
                  <p>Thank you for choosing Chalana Motors.</p>
                  <p>Hotline: 071 858 7456</p>
              </div>
          </div>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(fullBillHtml);
      printWindow.document.close();
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-10 min-h-screen pb-20">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl font-sans font-medium text-white tracking-tight">Repair Jobs</h2>
          <p className="text-[#8E9299] text-sm mt-1">Track customer repairs and monitor profitability.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
            <button 
              onClick={() => setActiveTab('JOBS')}
              className={cn(
                "px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'JOBS' ? "bg-white text-black shadow-lg" : "text-[#8E9299] hover:text-white"
              )}
            >Jobs</button>
            <button 
              onClick={() => setActiveTab('REPORTS')}
              className={cn(
                "px-3 md:px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                activeTab === 'REPORTS' ? "bg-white text-black shadow-lg" : "text-[#8E9299] hover:text-white"
              )}
            >Reports</button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setShowPresets(true)}
              className="text-[10px] text-[#8E9299] border-white/5 hover:text-white hover:bg-white/5 uppercase tracking-widest font-mono transition-all border px-3 py-2 rounded-xl active:scale-95"
            >
              Presets
            </button>
            
            <button 
              onClick={() => {
                  lastScanTimeRef.current = Date.now() - 5000;
                  setIsRemoteScanning(!isRemoteScanning);
              }}
              className={cn(
                  "flex items-center space-x-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all relative overflow-hidden",
                  isRemoteScanning 
                  ? "bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105" 
                  : "bg-white/5 text-[#8E9299] border border-white/10 hover:text-white"
              )}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{isRemoteScanning ? 'Link ON' : 'Remote'}</span>
            </button>
          </div>

          <div className="flex gap-2 ml-auto lg:ml-0">
            <button 
              onClick={() => {
                  setNewJob({
                      customerName: 'COUNTER SALE',
                      contactNumber: '',
                      vehicleNumber: '',
                      vehicleModel: '',
                      jobType: 'SALE',
                      issue: 'Direct Parts Sale',
                      services: [],
                      partsUsed: [],
                      totalPartsCost: 0,
                      currentKm: '',
                      nextServiceDate: '',
                      repairFee: 0,
                      status: JobStatus.PENDING
                  });
                  setIsAdding(true);
              }}
              className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center space-x-2 hover:bg-emerald-500/20 transition-all active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Spare Part Sale</span>
              <span className="sm:hidden">Sale</span>
            </button>
            
            <button 
              onClick={() => {
                  setNewJob({
                      customerName: '',
                      contactNumber: '',
                      vehicleNumber: '',
                      vehicleModel: '',
                      jobType: 'REPAIR',
                      issue: '',
                      services: [],
                      partsUsed: [],
                      totalPartsCost: 0,
                      currentKm: '',
                      nextServiceDate: '',
                      repairFee: 0,
                      status: JobStatus.PENDING
                  });
                  setIsAdding(true);
              }}
              className="bg-white text-[#151619] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center space-x-2 hover:bg-[#E4E3E0] transition-all active:scale-95 shadow-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Job</span>
              <span className="sm:hidden">Job</span>
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'REPORTS' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {[
            { label: 'Today', stats: reports.daily, color: 'emerald' },
            { label: 'Weekly', stats: reports.weekly, color: 'blue' },
            { label: 'Monthly', stats: reports.monthly, color: 'purple' }
          ].map((r, i) => (
            <div key={i} className="bg-[#151619] border border-[#141414] rounded-2xl p-8 relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-32 h-32 bg-${r.color}-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-${r.color}-500/10 transition-all`} />
              <div className="relative z-10 space-y-6">
                <header className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold uppercase tracking-[0.2em] text-${r.color}-400`}>{r.label} Report</span>
                  <History className={`w-4 h-4 text-${r.color}-500/50`} />
                </header>
                <div className="space-y-1">
                  <p className="text-[#8E9299] text-xs uppercase tracking-widest font-mono">Total Revenue</p>
                  <p className="text-3xl font-mono text-white font-bold">{formatCurrency(r.stats.revenue)}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div>
                    <p className="text-[10px] text-[#8E9299] uppercase font-mono">Profit</p>
                    <p className={`text-sm font-mono font-bold text-${r.color}-400`}>{formatCurrency(r.stats.profit)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#8E9299] uppercase font-mono">Jobs</p>
                    <p className="text-sm font-mono font-bold text-white">{r.stats.count}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          <div className="md:col-span-3 bg-[#151619] border border-[#141414] rounded-2xl p-8 overflow-hidden relative">
             <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-none" />
             <div className="relative z-10">
                <h4 className="text-white font-medium mb-6 flex items-center space-x-2">
                   <Wrench className="w-4 h-4" />
                   <span>Completed Jobs Overview</span>
                </h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] text-[#8E9299] uppercase tracking-widest border-b border-white/5">
                                <th className="pb-4 font-mono">Reference</th>
                                <th className="pb-4 font-mono">Vehicle</th>
                                <th className="pb-4 font-mono">Date</th>
                                <th className="pb-4 font-mono text-right">Revenue</th>
                                <th className="pb-4 font-mono text-right">Profit</th>
                                <th className="pb-4 font-mono text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                            {jobs.filter(j => j.status === JobStatus.COMPLETED).slice(0, 20).map(j => (
                                <tr key={j.id} className="group hover:bg-white/[0.01] transition-colors">
                                    <td className="py-4 text-xs font-mono text-[#8E9299]">{j.jobRef}</td>
                                    <td className="py-4 text-xs text-white">{j.vehicleNumber}</td>
                                    <td className="py-4 text-xs text-[#8E9299]">{new Date(j.createdAt).toLocaleDateString()}</td>
                                    <td className="py-4 text-xs font-mono text-white text-right">{formatCurrency(j.repairFee + (j.totalPartsCost || 0))}</td>
                                    <td className="py-4 text-xs font-mono text-emerald-400 text-right">{formatCurrency(j.profit || 0)}</td>
                                    <td className="py-4 text-right">
                                        {confirmDeleteId === j.id ? (
                                            <div className="flex items-center justify-end space-x-1 animate-in fade-in slide-in-from-right-2">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteJob(j.id);
                                                    }}
                                                    className="px-2 py-1 bg-red-500 text-white text-[8px] font-bold rounded hover:bg-red-600 transition-colors"
                                                >
                                                    CONFIRM
                                                </button>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDeleteId(null);
                                                    }}
                                                    className="p-1 text-[#8E9299] hover:text-white"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDeleteId(j.id);
                                                }}
                                                className="p-2 text-[#8E9299] hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 min-h-0">
          {/* Job List Container */}
          <div className={cn(
            "lg:w-1/2 space-y-4 flex flex-col min-h-0 transition-all duration-300",
            selectedJobId && "hidden lg:flex" // Hide list on mobile if a job is selected
          )}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 w-full">
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E9299]" />
                  <input 
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#151619] border border-[#141414] rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-sans"
                  />
                </div>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E9299]" />
                    <input 
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        className="bg-[#151619] border border-[#141414] rounded-lg pl-9 pr-3 py-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-white/20 min-w-[110px]"
                        title="Filter by Date"
                    />
                </div>
                <select 
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="bg-[#151619] border border-[#141414] rounded-lg px-2 py-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer"
                >
                    <option value="ALL">All Status</option>
                    <option value={JobStatus.PENDING}>Pending</option>
                    <option value={JobStatus.ONGOING}>Ongoing</option>
                    <option value={JobStatus.COMPLETED}>Completed</option>
                </select>
            </div>
            {filteredJobs.length > 0 && (
                <button 
                    onClick={selectAllFiltered}
                    className="text-[9px] text-[#8E9299] whitespace-nowrap hover:text-white uppercase tracking-widest font-mono transition-colors"
                >
                    Select All ({filteredJobs.length})
                </button>
            )}
          </div>

          <AnimatePresence>
            {selectedJobIds.length > 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center justify-between shadow-lg"
                >
                    <div className="flex items-center space-x-3">
                        <span className="text-red-400 text-xs font-bold font-mono">{selectedJobIds.length} SELECTED</span>
                        <button 
                            onClick={() => setSelectedJobIds([])}
                            className="text-[#8E9299] hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <button 
                        onClick={deleteSelectedJobs}
                        disabled={isClearing}
                        className={cn(
                            "bg-red-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 shadow-xl active:scale-95",
                            isClearing ? "opacity-50 cursor-not-allowed" : "hover:bg-red-600"
                        )}
                    >
                        {isClearing ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>{isClearing ? 'Deleting...' : 'Delete Selected'}</span>
                    </button>
                </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-320px)] lg:max-h-[calc(100vh-280px)] pr-1 scrollbar-hide flex-1">
          <AnimatePresence>
            {(isAdding || isEditing) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#151619] p-4 md:p-6 rounded-2xl border border-white/20 shadow-2xl mb-6"
              >
                <form onSubmit={isEditing ? handleEditJob : handleAddJob} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-white font-medium text-sm">
                        {newJob.jobType === 'SALE' ? (isEditing ? 'Edit Sale' : 'Counter Sale Details') : (isEditing ? 'Edit Job' : 'Customer Details')}
                    </h3>
                    <button type="button" onClick={() => { setIsAdding(false); setIsEditing(false); }} className="text-[#8E9299] hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {newJob.jobType !== 'SALE' && (
                      <div className="relative col-span-2">
                         <input 
                          placeholder="Contact Number"
                          value={newJob.contactNumber}
                          onChange={e => {
                            const val = e.target.value;
                            setNewJob({...newJob, contactNumber: val});
                            if (val.length >= 9) lookupCustomer(val);
                          }}
                          className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                        />
                        {foundCustomer && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1 text-emerald-500 animate-pulse">
                             <Check className="w-3 h-3" />
                             <span className="text-[8px] font-bold uppercase">Linked</span>
                          </div>
                        )}
                      </div>
                    )}
                    <input 
                      placeholder="Customer Name"
                      value={newJob.customerName}
                      onChange={e => setNewJob({...newJob, customerName: e.target.value})}
                      className={cn(
                        "bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white",
                        newJob.jobType === 'SALE' ? "col-span-2" : ""
                      )}
                    />
                    {newJob.jobType !== 'SALE' && (
                       <input 
                        required placeholder="Vehicle Number"
                        value={newJob.vehicleNumber}
                        onChange={e => setNewJob({...newJob, vehicleNumber: e.target.value})}
                        className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                      />
                    )}
                  </div>
                  {newJob.jobType !== 'SALE' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <input 
                        required placeholder="Vehicle Model"
                        value={newJob.vehicleModel}
                        onChange={e => setNewJob({...newJob, vehicleModel: e.target.value})}
                        className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                  )}
                  {newJob.jobType !== 'SALE' && (
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
                  )}
                  {newJob.jobType === 'SALE' && (
                    <div className="space-y-4">
                        <div className="flex flex-col space-y-2">
                             <label className="text-[10px] text-[#8E9299] uppercase font-mono">Add Spare Parts to Bill</label>
                             <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E9299]" />
                                <input 
                                    type="text"
                                    placeholder="Search inventory or type part name..."
                                    value={modalPartSearch}
                                    onChange={e => setModalPartSearch(e.target.value)}
                                    className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/10"
                                />
                                {modalPartSearch && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1b1e] border border-white/20 rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-white/5">
                                        {inventory
                                            .filter(p => {
                                                const term = normalizeSearch(modalPartSearch);
                                                return normalizeSearch(p.name).includes(term) || 
                                                       (p.category && normalizeSearch(p.category).includes(term)) ||
                                                       (p.barcode && normalizeSearch(p.barcode).includes(term));
                                            })
                                            .slice(0, 5)
                                            .map(p => (
                                                <button 
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => {
                                                        const existingPart = newJob.partsUsed.find(up => up.partId === p.id);
                                                        let updatedParts;
                                                        if (existingPart) {
                                                            updatedParts = newJob.partsUsed.map(up => up.partId === p.id ? {...up, quantity: up.quantity + 1} : up);
                                                        } else {
                                                            updatedParts = [...newJob.partsUsed, { 
                                                              partId: p.id, 
                                                              name: p.name, 
                                                              quantity: 1, 
                                                              costAtTime: p.costPrice,
                                                              purchasePriceAtTime: p.purchasePrice || 0 
                                                            }];
                                                        }
                                                        setNewJob({...newJob, partsUsed: updatedParts});
                                                        setModalPartSearch('');
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
                                        {modalPartSearch.length > 0 && (
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const customPart = { 
                                                        partId: `CUSTOM_${Date.now()}`, 
                                                        name: modalPartSearch, 
                                                        quantity: 1, 
                                                        costAtTime: 0,
                                                        purchasePriceAtTime: 0 
                                                    };
                                                    setNewJob({...newJob, partsUsed: [...newJob.partsUsed, customPart]});
                                                    setModalPartSearch('');
                                                }}
                                                className="w-full text-left px-4 py-3 hover:bg-white/5 border-t border-white/5"
                                            >
                                                <p className="text-xs text-blue-400 font-medium">+ Add "{modalPartSearch}" as custom part</p>
                                            </button>
                                        )}
                                    </div>
                                )}
                             </div>

                             <div className="flex space-x-2 mt-2">
                                  <input 
                                     placeholder="Custom Part Name"
                                     value={currentPart}
                                     onChange={e => setCurrentPart(e.target.value)}
                                     className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-1.5 text-xs text-white flex-1"
                                  />
                                  <input 
                                     type="number"
                                     placeholder="Price"
                                     value={currentPartPrice || ''}
                                     onChange={e => setCurrentPartPrice(parseFloat(e.target.value) || 0)}
                                     className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-1.5 text-xs text-white w-24 font-mono"
                                  />
                                  <button 
                                     type="button"
                                     onClick={handleAddManualPart}
                                     className="bg-white/10 p-2 rounded text-white hover:bg-white/20 transition-all active:scale-90"
                                  >
                                     <Plus className="w-4 h-4" />
                                  </button>
                             </div>
                        </div>

                        {newJob.partsUsed.length > 0 && (
                            <div className="bg-[#1a1b1e] border border-white/5 rounded-lg overflow-hidden divide-y divide-white/5">
                                {newJob.partsUsed.map((p, i) => (
                                    <div key={i} className="px-3 py-2 flex items-center justify-between group">
                                        <div className="flex-1">
                                            <p className="text-xs text-white">{p.name}</p>
                                            <div className="flex items-center space-x-2 mt-1">
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = newJob.partsUsed.map((up, idx) => idx === i ? {...up, quantity: Math.max(1, up.quantity - 1)} : up);
                                                        setNewJob({...newJob, partsUsed: updated});
                                                    }}
                                                    className="w-5 h-5 bg-white/5 border border-white/10 rounded flex items-center justify-center text-xs text-[#8E9299] hover:text-white"
                                                >-</button>
                                                <span className="text-[10px] text-white w-4 text-center font-mono">{p.quantity}</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = newJob.partsUsed.map((up, idx) => idx === i ? {...up, quantity: up.quantity + 1} : up);
                                                        setNewJob({...newJob, partsUsed: updated});
                                                    }}
                                                    className="w-5 h-5 bg-white/5 border border-white/10 rounded flex items-center justify-center text-xs text-[#8E9299] hover:text-white"
                                                >+</button>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <input 
                                                type="number"
                                                value={p.costAtTime || ''}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    const updated = newJob.partsUsed.map((up, idx) => idx === i ? {...up, costAtTime: val} : up);
                                                    setNewJob({...newJob, partsUsed: updated});
                                                }}
                                                className="bg-[#151619] border border-[#141414] rounded px-2 py-1 text-[10px] text-emerald-500 w-20 text-right font-mono"
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    const updated = newJob.partsUsed.filter((_, idx) => idx !== i);
                                                    setNewJob({...newJob, partsUsed: updated});
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
                        
                        {newJob.partsUsed.length > 0 && (
                            <div className="pt-2 border-t border-white/5 flex justify-between items-center px-1">
                                <span className="text-[10px] text-[#8E9299] uppercase font-bold">Total Part Sale</span>
                                <span className="text-sm font-mono text-white font-bold">
                                    {formatCurrency(newJob.partsUsed.reduce((sum, p) => sum + (p.costAtTime * p.quantity), 0))}
                                </span>
                            </div>
                        )}
                        <textarea 
                            placeholder="Internal Sale Notes (Optional)..."
                            value={newJob.issue}
                            onChange={e => setNewJob({...newJob, issue: e.target.value})}
                            className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white h-16"
                        />
                    </div>
                  )}
                  {newJob.jobType !== 'SALE' && (
                  <div className="space-y-4">
                    <div className="flex flex-col space-y-2">
                         <label className="text-[10px] text-[#8E9299] uppercase font-mono">Add Services & Prices</label>
                         
                         {servicePresets.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {servicePresets.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => usePreset(p)}
                                        className="text-[10px] bg-white/5 border border-white/10 px-2 py-1 rounded text-[#8E9299] hover:text-white hover:border-white/30 transition-all"
                                    >
                                        + {p.name}
                                    </button>
                                ))}
                            </div>
                         )}

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
                        placeholder={newJob.jobType === 'SALE' ? 'Internal Sale Notes...' : 'Additional Notes / General Issue...'}
                        value={newJob.issue}
                        onChange={e => setNewJob({...newJob, issue: e.target.value})}
                        className="w-full bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white h-20"
                    />
                  </div>
                  )}
                  <div className="flex items-center space-x-4">
                    {newJob.jobType !== 'SALE' && (
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
                    )}
                    <button type="submit" className="flex-1 bg-white text-[#151619] py-2.5 rounded-lg text-sm font-medium hover:bg-[#E4E3E0] mt-5">
                      {isEditing ? (newJob.jobType === 'SALE' ? 'Update Sale' : 'Update Job') : (newJob.jobType === 'SALE' ? 'Create Sale' : 'Create Job')}
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
                  <div className="flex items-center space-x-4">
                    <button 
                        onClick={(e) => toggleJobSelection(e, job.id)}
                        className={cn(
                            "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90",
                            selectedJobIds.includes(job.id) 
                                ? "bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]" 
                                : "border-white/10 bg-white/[0.02] hover:border-white/30"
                        )}
                    >
                        {selectedJobIds.includes(job.id) && <Check className="w-4 h-4 text-white font-bold" />}
                    </button>
                    <div>
                        <div className="flex items-center space-x-3">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                job.status === JobStatus.COMPLETED ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                job.status === JobStatus.ONGOING ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" :
                                "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                            )} />
                            <h4 className="text-white font-medium text-lg leading-tight uppercase font-mono tracking-tighter">
                                {job.jobType === 'SALE' ? (job.vehicleNumber || 'DIRECT SALE') : job.vehicleNumber}
                            </h4>
                        </div>
                        <p className="text-[10px] text-[#8E9299] uppercase tracking-widest mt-1 ml-5">
                            {job.jobType === 'SALE' ? (job.vehicleModel || 'SPARE PARTS') : job.vehicleModel} 
                            <span className="mx-1 opacity-20">•</span> {job.jobRef}
                        </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={cn(
                      "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                      job.status === JobStatus.COMPLETED ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                      job.status === JobStatus.ONGOING ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                      "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    )}>
                      {job.status}
                    </div>
                    {job.jobType === 'SALE' && (
                        <div className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest bg-emerald-500 text-white shadow-lg">
                            SALE
                        </div>
                    )}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            handleWhatsApp(job);
                        }}
                        className="p-3 text-[#8E9299] hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all active:scale-110"
                        title="Send WhatsApp"
                    >
                        <Phone className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === job.id ? (
                        <div className="flex items-center space-x-1 animate-in fade-in slide-in-from-right-2">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteJob(job.id);
                                }}
                                className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors"
                            >
                                CONFIRM
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(null);
                                }}
                                className="p-2 text-[#8E9299] hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(job.id);
                            }}
                            className="p-3 text-[#8E9299] hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-110"
                            title="Delete Job"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-6 text-[#8E9299] text-xs relative z-10 ml-5">
                  <div className="flex items-center space-x-2">
                    <User className="w-3.5 h-3.5 opacity-50" />
                    <span className="font-medium text-[#c0c2c5]">{job.customerName || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-3.5 h-3.5 opacity-50" />
                    <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="mt-5 flex justify-between items-end relative z-10 ml-5">
                   <div>
                       <p className="text-[9px] text-[#8E9299] uppercase tracking-widest">Total Bill</p>
                       <p className="text-base font-mono font-semibold text-white">
                           {formatCurrency((job.repairFee || 0) + (job.totalPartsCost || 0))}
                       </p>
                   </div>
                   <div className="text-right">
                       <p className="text-[9px] text-[#8E9299] uppercase tracking-widest">Profit</p>
                       <p className={cn(
                           "text-sm font-mono font-medium",
                           (job.profit || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                       )}>
                           {formatCurrency(job.profit || 0)}
                       </p>
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
        <div className={cn(
          "lg:flex-1 bg-[#151619] rounded-2xl border border-[#141414] p-4 sm:p-6 md:p-8 flex flex-col min-h-[400px] lg:min-h-[600px] transition-all duration-300",
          !selectedJobId && "hidden lg:flex" // Hide detail on mobile if no job selected
        )}>
          {selectedJob ? (
            <div className="space-y-6 md:space-y-8 flex-1 flex flex-col">
              <header className="flex flex-col xl:flex-row justify-between items-start gap-4 md:gap-6">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <button 
                    onClick={() => setSelectedJobId(null)}
                    className="lg:hidden p-2 -ml-2 text-[#8E9299] hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div>
                    <h3 className="text-xl md:text-2xl font-sans font-medium text-white tracking-tight">Job Details</h3>
                    <p className="text-[#8E9299] text-xs md:text-sm">{selectedJob.jobRef} • {selectedJob.vehicleNumber}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
                    <button 
                        onClick={() => handleWhatsApp(selectedJob)}
                        className="bg-[#1a1b1e] border border-[#141414] p-2 rounded-lg text-emerald-500 hover:text-emerald-400 transition-all flex items-center space-x-2"
                        title="WhatsApp Customer"
                    >
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase">WhatsApp</span>
                    </button>
                    {selectedJob.status !== JobStatus.COMPLETED && (
                        <button 
                            onClick={() => startEdit(selectedJob)}
                            className="bg-[#1a1b1e] border border-[#141414] p-2 rounded-lg text-[#8E9299] hover:text-white transition-all flex items-center space-x-2"
                            title="Edit Job Info"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase">Edit</span>
                        </button>
                    )}
                    {confirmDeleteId === selectedJob.id ? (
                        <div className="flex items-center space-x-1 animate-in fade-in slide-in-from-right-2">
                             <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteJob(selectedJob.id);
                                }}
                                className="px-3 py-2 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-colors shadow-lg"
                             >
                                CONFIRM DELETE
                             </button>
                             <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(null);
                                }}
                                className="p-2 text-[#8E9299] hover:text-white"
                             >
                                <X className="w-4 h-4" />
                             </button>
                        </div>
                    ) : (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(selectedJob.id);
                            }}
                            className="bg-[#1a1b1e] border border-[#141414] p-2 rounded-lg text-[#8E9299] hover:text-red-500 transition-all"
                            title="Delete Job"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button 
                        onClick={() => handlePrint()}
                        className="bg-white text-[#151619] px-3 py-2 rounded-lg font-bold text-[10px] flex items-center space-x-2 transition-all active:scale-95 shadow-xl"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Slip</span>
                    </button>
                    <button 
                        onClick={() => handleViewFullBill()}
                        className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg font-bold text-[10px] flex items-center space-x-2 transition-all active:scale-95 border border-white/10"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">A4 Bill</span>
                    </button>
                    <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <button 
                          onClick={() => updateJobStatus(selectedJob.id, JobStatus.ONGOING)}
                          className={cn(
                              "flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all active:scale-95", 
                              selectedJob.status === JobStatus.ONGOING 
                                  ? "bg-blue-500 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]" 
                                  : "text-[#8E9299] border-white/5 hover:text-white"
                          )}
                      >
                          Repair
                      </button>
                      <button 
                          onClick={() => updateJobStatus(selectedJob.id, JobStatus.COMPLETED)}
                          className={cn(
                              "flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all active:scale-95", 
                              selectedJob.status === JobStatus.COMPLETED 
                                  ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                                  : "text-[#8E9299] border-white/5 hover:text-white"
                          )}
                      >
                          Finish
                      </button>
                    </div>
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
                             <div key={i} className="flex items-center justify-between text-white text-sm group">
                                 <div className="flex items-center space-x-2">
                                     <div className="w-1 h-1 bg-white/20 rounded-full" />
                                     <span>{s.description}</span>
                                 </div>
                                 <div className="flex items-center space-x-3">
                                     <span className="font-mono text-emerald-500">{formatCurrency(s.price)}</span>
                                     {selectedJob.status !== JobStatus.COMPLETED && (
                                         <button 
                                             onClick={() => removeServiceFromJob(i)}
                                             className="text-[#8E9299] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                         >
                                             <X className="w-3 h-3" />
                                         </button>
                                     )}
                                 </div>
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
                    <p className="text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">Quick Add Presets</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {servicePresets.map(p => (
                            <button
                                key={p.id}
                                onClick={() => addPresetToJob(p)}
                                className={cn(
                                    "text-[9px] border px-2 py-1 rounded transition-all active:scale-95 flex items-center space-x-1 font-bold uppercase",
                                    p.type === 'part' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-purple-500/10 border-purple-500/20 text-purple-400"
                                )}
                            >
                                + {p.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                            <p className="text-[10px] text-[#8E9299] uppercase tracking-wider font-mono">Search & Add Spare Parts</p>
                            <AnimatePresence>
                                {scannedNotification && (
                                    <motion.span 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded flex items-center space-x-1",
                                            scannedNotification.includes("not found") ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
                                        )}
                                    >
                                        <Check className="w-3 h-3" />
                                        <span>{scannedNotification.includes("not found") ? scannedNotification : `Added: ${scannedNotification}`}</span>
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
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
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setCurrentPart(partSearchTerm);
                                            setPartSearchTerm('');
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-white/5 border-t border-white/5"
                                    >
                                        <p className="text-xs text-blue-400 font-medium">+ Add "{partSearchTerm}" as custom part</p>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex space-x-2 mt-2">
                        <input 
                            placeholder="Manual Part Name"
                            value={currentPart}
                            onChange={e => setCurrentPart(e.target.value)}
                            className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-1.5 text-xs text-white flex-1 focus:outline-none focus:ring-1 focus:ring-white/10"
                        />
                        <input 
                            type="number"
                            placeholder="Price"
                            value={currentPartPrice || ''}
                            onChange={e => setCurrentPartPrice(parseFloat(e.target.value) || 0)}
                            className="bg-[#1a1b1e] border border-[#141414] rounded-lg px-3 py-1.5 text-xs text-white w-24 font-mono focus:outline-none focus:ring-1 focus:ring-white/10"
                        />
                        <button 
                            type="button"
                            onClick={addManualPartToJob}
                            className="bg-white/10 p-2 rounded-lg text-white hover:bg-white/20 transition-all active:scale-90"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
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
                                <div className="flex items-center space-x-4">
                                    <p className="text-xs text-white font-mono font-semibold">{formatCurrency(p.costAtTime * p.quantity)}</p>
                                    {selectedJob.status !== JobStatus.COMPLETED && (
                                        <button 
                                            onClick={() => removePartFromJob(i)}
                                            className="text-[#8E9299] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
              </section>

              <footer className="pt-6 border-t border-[#141414] grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-2 bg-white/[0.02] rounded-lg">
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono mb-1">Service Fee</p>
                      <p className="text-xs md:text-sm text-white font-mono font-bold">{formatCurrency(selectedJob.repairFee || 0)}</p>
                  </div>
                  <div className="p-2 bg-white/[0.02] rounded-lg">
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono mb-1">Parts Cost</p>
                      <p className="text-xs md:text-sm text-[#8E9299] font-mono">{formatCurrency(selectedJob.totalPartsCost || 0)}</p>
                  </div>
                  <div className="text-right p-2 bg-white/[0.02] rounded-lg">
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono mb-1">Total Bill</p>
                      <p className="text-sm md:text-base text-white font-mono font-bold">
                        {formatCurrency((selectedJob.repairFee || 0) + (selectedJob.totalPartsCost || 0))}
                      </p>
                  </div>
                  <div className="text-right p-2 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                      <p className="text-[8px] text-[#8E9299] uppercase font-mono mb-1">Est. Profit</p>
                      <p className={cn("text-sm md:text-base font-mono font-bold", (selectedJob.profit || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {formatCurrency(selectedJob.profit || 0)}
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
    )}

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
                        <h3 className="text-xl font-medium text-white italic-serif">Clear All Job History?</h3>
                        <p className="text-[#8E9299] text-sm leading-relaxed">
                            This will permanantly delete all <span className="text-white font-bold">{jobs.length} repair records</span> from your history. This action cannot be undone.
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
                            onClick={clearAllJobs}
                            className="py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                        >
                            Yes, Clear All
                        </button>
                    </div>
                </motion.div>
            </div>
        )}

        {showPresets && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowPresets(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
                />
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative bg-[#151619] border border-white/20 w-full max-w-md rounded-2xl p-6 shadow-2xl"
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-medium text-white italic-serif">Standard Services</h3>
                        <button onClick={() => setShowPresets(false)} className="text-[#8E9299] hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-[#1a1b1e] p-4 rounded-xl space-y-3">
                            <p className="text-[10px] text-[#8E9299] uppercase font-mono mb-1">Add New Preset (Service or Part)</p>
                            <div className="flex flex-col space-y-2">
                                <div className="flex space-x-2">
                                    <input 
                                        placeholder="Name"
                                        value={newPreset.name}
                                        onChange={e => setNewPreset({...newPreset, name: e.target.value})}
                                        className="bg-[#151619] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white flex-1 focus:outline-none focus:ring-1 focus:ring-white/20"
                                    />
                                    <input 
                                        type="number"
                                        placeholder="Price"
                                        value={newPreset.price || ''}
                                        onChange={e => setNewPreset({...newPreset, price: parseFloat(e.target.value) || 0})}
                                        className="bg-[#151619] border border-[#141414] rounded-lg px-3 py-2 text-xs text-white w-24 font-mono focus:outline-none focus:ring-1 focus:ring-white/20"
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <div className="flex-1 flex bg-[#151619] rounded-lg p-1 border border-[#141414]">
                                        <button 
                                            onClick={() => setNewPreset({...newPreset, type: 'service'})}
                                            className={cn(
                                                "flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all",
                                                newPreset.type === 'service' ? "bg-white text-black" : "text-[#8E9299]"
                                            )}
                                        >Service</button>
                                        <button 
                                            onClick={() => setNewPreset({...newPreset, type: 'part'})}
                                            className={cn(
                                                "flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all",
                                                newPreset.type === 'part' ? "bg-white text-black" : "text-[#8E9299]"
                                            )}
                                        >Part</button>
                                    </div>
                                    <button 
                                        onClick={handleAddPreset}
                                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {servicePresets.length === 0 ? (
                                <div className="text-center py-12 border border-dashed border-white/5 rounded-xl">
                                    <p className="text-[#8E9299] text-xs italic">No presets added yet.</p>
                                </div>
                            ) : (
                                servicePresets.map(p => (
                                    <div key={p.id} className="flex items-center justify-between p-3 bg-[#1a1b1e]/50 border border-white/5 rounded-lg group hover:border-white/10 transition-colors">
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <p className="text-xs text-white font-medium">{p.name}</p>
                                                <span className={cn(
                                                    "text-[8px] px-1 rounded uppercase font-bold",
                                                    p.type === 'part' ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                                                )}>
                                                    {p.type || 'service'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-mono text-emerald-500">{formatCurrency(p.price)}</p>
                                        </div>
                                        <button 
                                            onClick={() => deletePreset(p.id)}
                                            className="p-2 text-[#8E9299] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        )}

        {quickAddBarcode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setQuickAddBarcode(null)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
                />
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative bg-[#151619] border border-white/20 w-full max-w-sm rounded-2xl p-6 shadow-2xl"
                >
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                                <Plus className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-white italic-serif leading-tight">Quick Add Part</h3>
                                <p className="text-[10px] text-[#8E9299] font-mono tracking-wider">{quickAddBarcode}</p>
                            </div>
                        </div>
                        <button onClick={() => setQuickAddBarcode(null)} className="text-[#8E9299] hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleQuickAddSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] text-[#8E9299] uppercase font-mono px-1">Part Name</label>
                            <input 
                                autoFocus
                                required
                                placeholder="e.g. Brake Pads - Honda"
                                value={quickAddName}
                                onChange={e => setQuickAddName(e.target.value)}
                                className="w-full bg-[#1a1b1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-[#8E9299] uppercase font-mono px-1">Price (Rs.)</label>
                            <input 
                                type="number"
                                required
                                placeholder="0.00"
                                value={quickAddPrice || ''}
                                onChange={e => setQuickAddPrice(parseFloat(e.target.value) || 0)}
                                className="w-full bg-[#1a1b1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                            />
                        </div>

                        <div className="pt-4 flex items-center space-x-3">
                            <button 
                                type="button"
                                onClick={() => setQuickAddBarcode(null)}
                                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-[#8E9299] hover:bg-white/5 transition-all"
                            >Cancel</button>
                            <button 
                                type="submit"
                                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] active:scale-95 flex items-center justify-center space-x-2"
                            >
                                <Save className="w-4 h-4" />
                                <span>Save & Add</span>
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        )}

      </AnimatePresence>

      {/* Hidden Job PDF Area */}
      <div id="job-pdf-area" className="fixed top-0 left-[-5000px] w-[800px] bg-white text-black p-10 z-[-100] print:hidden">
        {selectedJob && (
          <div className="space-y-6">
            <div className="text-center border-b-2 border-black pb-4 mb-6">
                <h1 className="text-3xl font-bold uppercase">Chalana Motors</h1>
                <p className="text-sm font-mono uppercase tracking-widest">Service Station & Spare Parts</p>
                <p className="text-xs mt-1">No. 123, Main Road, Colombo | 071 858 7456</p>
            </div>
            
            <div className="flex justify-between items-start border-b border-black/10 pb-4 mb-4">
                <div className="space-y-1">
                    <p className="text-[10px] text-gray-500 uppercase font-mono">Bill To</p>
                    <h2 className="text-lg font-bold">{selectedJob.customerName || 'Valued Customer'}</h2>
                    <p className="text-sm">{selectedJob.vehicleNumber} {selectedJob.vehicleModel ? `(${selectedJob.vehicleModel})` : ''}</p>
                    {selectedJob.contactNumber && <p className="text-sm">{selectedJob.contactNumber}</p>}
                </div>
                <div className="text-right space-y-1">
                    <p className="text-[10px] text-gray-500 uppercase font-mono">Reference</p>
                    <p className="text-lg font-bold font-mono">{selectedJob.jobRef || 'N/A'}</p>
                    <p className="text-xs">{new Date(selectedJob.createdAt).toLocaleDateString()} {new Date(selectedJob.createdAt).toLocaleTimeString()}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="border-t-2 border-black pt-2">
                    <h3 className="text-sm font-bold uppercase mb-2">Services & Labor</h3>
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-black/20">
                            <tr>
                                <th className="py-2">Description</th>
                                <th className="py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(selectedJob.services && selectedJob.services.length > 0) ? 
                                selectedJob.services.map((s, i) => (
                                    <tr key={i} className="border-b border-black/5">
                                        <td className="py-2">{s.description}</td>
                                        <td className="py-2 text-right font-mono">{formatCurrency(s.price)}</td>
                                    </tr>
                                )) : (
                                    <tr className="border-b border-black/5">
                                        <td className="py-2">{selectedJob.issue || 'Repair/Service'}</td>
                                        <td className="py-2 text-right font-mono">{formatCurrency(selectedJob.repairFee)}</td>
                                    </tr>
                                )
                            }
                        </tbody>
                    </table>
                </div>

                {selectedJob.partsUsed && selectedJob.partsUsed.length > 0 && (
                    <div>
                        <h3 className="text-sm font-bold uppercase mb-2">Spare Parts</h3>
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-black/20">
                                <tr>
                                    <th className="py-2">Part Name</th>
                                    <th className="py-2 text-center">Qty</th>
                                    <th className="py-2 text-right">Unit Price</th>
                                    <th className="py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedJob.partsUsed.map((p, i) => (
                                    <tr key={i} className="border-b border-black/5">
                                        <td className="py-2">{p.name}</td>
                                        <td className="py-2 text-center">{p.quantity}</td>
                                        <td className="py-2 text-right font-mono">{formatCurrency(p.costAtTime)}</td>
                                        <td className="py-2 text-right font-mono">{formatCurrency(p.quantity * p.costAtTime)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="mt-8 pt-4 border-t-2 border-black flex justify-end">
                <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span className="font-mono">{formatCurrency(selectedJob.repairFee + (selectedJob.totalPartsCost || 0))}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold border-t-2 border-black pt-2">
                        <span>TOTAL</span>
                        <span className="font-mono">{formatCurrency(selectedJob.repairFee + (selectedJob.totalPartsCost || 0))}</span>
                    </div>
                </div>
            </div>

            <div className="mt-12 text-center text-[10px] text-gray-500 italic">
                <p>Thank you for choosing Chalana Motors.</p>
                <p>Specialized in Petrol & Hybrid vehicles service and repairs.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
