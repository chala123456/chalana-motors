import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { RepairJobs } from './components/RepairJobs';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Part, RepairJob } from './types';
import { Wrench, LogIn, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<Part[]>([]);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [fetchingData, setFetchingData] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
        setInventory([]);
        setJobs([]);
        return;
    }

    setFetchingData(true);

    // Listen to Inventory
    const qInv = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      const partsArr: Part[] = [];
      snapshot.forEach(doc => {
        partsArr.push({ id: doc.id, ...doc.data() } as Part);
      });
      setInventory(partsArr);
      setFetchingData(false);
    });

    // Listen to Jobs
    const qJobs = query(
        collection(db, 'jobs'), 
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
    );
    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      const jobsArr: RepairJob[] = [];
      snapshot.forEach(doc => {
          const data = doc.data();
          jobsArr.push({ 
              id: doc.id, 
              ...data,
              createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString()
          } as RepairJob);
      });
      setJobs(jobsArr);
    });

    return () => {
      unsubInv();
      unsubJobs();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="h-screen w-full bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full bg-[#0a0a0a] flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_40%,_#151619_0%,_transparent_50%)]">
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-8"
        >
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
                <Wrench className="w-10 h-10 text-[#151619]" />
            </div>
            <div className="space-y-3">
                <h1 className="text-4xl font-sans font-medium text-white tracking-tighter italic-serif">Chalana Motors</h1>
                <p className="text-[#8E9299] text-sm max-w-[280px] mx-auto leading-relaxed">
                    Professional Garage Management System. 
                    Track inventory, manage repairs, and print customer bills.
                </p>
            </div>
            <button 
                onClick={handleLogin}
                className="bg-white text-[#151619] px-8 py-3 rounded-xl font-medium flex items-center space-x-3 mx-auto hover:bg-[#E4E3E0] transition-all transform active:scale-95 shadow-lg group font-sans"
            >
                <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                <span>Get Started with Google</span>
            </button>
            <p className="text-[10px] text-[#8E9299] uppercase tracking-[0.2em] font-mono">Secure Cloud Storage Provided</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user}
        onLogout={handleLogout}
      />
      
      <main className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {activeTab === 'dashboard' && <Dashboard jobs={jobs} inventory={inventory} />}
            {activeTab === 'inventory' && <Inventory parts={inventory} loading={fetchingData} />}
            {activeTab === 'jobs' && <RepairJobs jobs={jobs} inventory={inventory} loading={fetchingData} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
