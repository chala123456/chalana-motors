import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, Smartphone, Check, AlertCircle, Zap, ZapOff, Plus } from 'lucide-react';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ScannerModeProps {
  onClose: () => void;
}

export function ScannerMode({ onClose }: ScannerModeProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ name: string; status: 'added' | 'error' } | null>(null);
  const [isReceiverActive, setIsReceiverActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQuickAdd, setIsQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [hasZoom, setHasZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let presenceUnsubscribe: (() => void) | null = null;
    
    if (auth.currentUser) {
      const scanDocRef = doc(db, 'remote_scans', auth.currentUser.uid);
      unsubscribe = onSnapshot(scanDocRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.status === 'added') {
            if (syncTimeoutRef.current) {
              clearTimeout(syncTimeoutRef.current);
              syncTimeoutRef.current = null;
            }
            setConfirmation({ name: data.partName || 'Part', status: 'added' });
            
            // Auto reset within 1.5s as requested
            setTimeout(() => {
              setConfirmation(null);
              setLastScan(null);
            }, 1500);
            
            // Success haptic
            if (window.navigator.vibrate) {
              window.navigator.vibrate([100, 50, 100]);
            }
          } else if (data.status === 'error') {
            if (syncTimeoutRef.current) {
              clearTimeout(syncTimeoutRef.current);
              syncTimeoutRef.current = null;
            }
            setConfirmation({ name: data.partName || 'Not Found', status: 'error' });
            setTimeout(() => {
                setConfirmation(null);
                setLastScan(null);
            }, 3000);
          } else if (data.status === 'not_found' && data.barcode) {
             if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = null;
             }
             setIsQuickAdd(true);
             setQuickAddName('');
             setQuickAddPrice('');
             setLastScan(data.barcode);
          }
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `remote_scans/${auth.currentUser?.uid}`);
      });

      const presenceRef = doc(db, 'status', auth.currentUser.uid);
      presenceUnsubscribe = onSnapshot(presenceRef, (snapshot) => {
        if (snapshot.exists()) {
          setIsReceiverActive(!!snapshot.data().remoteReceiverActive);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `status/${auth.currentUser?.uid}`);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (presenceUnsubscribe) presenceUnsubscribe();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isScanning) {
      const html5QrCode = new Html5Qrcode("reader", { 
        useBarCodeDetectorIfSupported: true,
        verbose: false 
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 30,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.min(viewfinderWidth * 0.9, 450);
            const height = width * 0.45;
            return { width, height };
        },
        aspectRatio: 1.0,
        videoConstraints: {
            facingMode: "environment",
            focusMode: "continuous",
            exposureMode: "continuous",
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
        } as any,
        tryRescale: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF
        ]
      };

      html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          if (Date.now() - lastScanTimeRef.current > 2000) {
            lastScanTimeRef.current = Date.now();
            onScanSuccess(decodedText);
          }
        },
        () => {}
      ).then(() => {
        const scanner = scannerRef.current as any;
        if (scanner && typeof scanner.getRunningTrack === 'function') {
          const track = scanner.getRunningTrack();
          if (track) {
            const capabilities = track.getCapabilities() as any;
            setHasFlash(!!capabilities.torch);
            
            if (capabilities.zoom) {
                setHasZoom(true);
                setMinZoom(capabilities.zoom.min);
                setMaxZoom(capabilities.zoom.max);
                setZoomLevel(track.getSettings().zoom || capabilities.zoom.min);
            }
          }
        }
        setError(null);
      }).catch(err => {
        console.error("Scanner startup error:", err);
        const errorMessage = err?.toString() || "";
        
        if (errorMessage.includes("NotAllowedError") || errorMessage.includes("Permission denied")) {
          setError("Camera access was denied. Please check your browser's site settings to allow camera permissions.");
        } else if (errorMessage.includes("NotFoundError")) {
          setError("No camera found on this device.");
        } else {
          setError("Could not start camera. Please ensure no other app is using it and try again.");
        }
        setIsScanning(false);
      });
    }

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isScanning]);

  const toggleFlash = async () => {
    if (!scannerRef.current || !scannerRef.current.isScanning) return;
    
    try {
      const newState = !isFlashOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: newState }]
      } as any);
      setIsFlashOn(newState);
    } catch (err) {
      console.error("Failed to toggle flash:", err);
    }
  };

  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setZoomLevel(value);
    if (scannerRef.current && scannerRef.current.isScanning) {
        try {
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ zoom: value }]
            } as any);
        } catch (err) {
            console.error("Failed to apply zoom:", err);
        }
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    if (!auth.currentUser) return;
    if (lastScan || confirmation || isQuickAdd) return; // Lock if already processing
    
    try {
      setIsQuickAdd(false);
      setLastScan(decodedText);
      setConfirmation(null);
      setError(null);

      // Start 3.5s timeout as requested
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        setConfirmation({ name: 'Sync Timeout', status: 'error' });
        setError("Desktop receiver did not respond within 3s. Please ensure 'Receiver ON' is active on your Mac.");
        setLastScan(null);
        setTimeout(() => setConfirmation(null), 3000);
      }, 3500);

      await setDoc(doc(db, 'remote_scans', auth.currentUser.uid), {
        barcode: decodedText,
        userId: auth.currentUser.uid,
        status: 'pending',
        partName: '',
        updatedAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, `remote_scans/${auth.currentUser?.uid}`));
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate(150);
      }
    } catch (err) {
      console.error("Error updating scan:", err);
      setError("Failed to sync scan. Check network connection.");
      setLastScan(null);
    }
  };
  
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !lastScan || !quickAddName) return;

    try {
        setConfirmation({ name: 'Syncing...', status: 'added' });
        await setDoc(doc(db, 'remote_scans', auth.currentUser.uid), {
            barcode: lastScan,
            userId: auth.currentUser.uid,
            status: 'pending',
            quickAddData: {
                name: quickAddName,
                price: parseFloat(quickAddPrice) || 0
            },
            updatedAt: serverTimestamp()
        });
        setIsQuickAdd(false);
        // Mac listener will eventually set status to 'added' which triggers our existing listener
    } catch (err) {
        console.error("Quick add submit error:", err);
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center overflow-hidden"
    >
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-4 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all z-50 active:scale-95"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="max-w-md w-full space-y-8 relative">
        <header className="space-y-2">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/30">
            <Smartphone className={cn("w-8 h-8", isReceiverActive ? "text-emerald-400" : "text-blue-400")} />
          </div>
          <div className="flex items-center justify-center space-x-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Scanner</h2>
            <div className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center space-x-1.5",
                isReceiverActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isReceiverActive ? "bg-emerald-400" : "bg-red-400")} />
                <span>{isReceiverActive ? "Connected to Mac" : "Mac Offline"}</span>
            </div>
          </div>
          <p className="text-[#8E9299] text-sm px-4">
            {isReceiverActive 
              ? "Receiver is active on your desktop. Scan items to auto-add." 
              : "Turn on 'Remote Scan' on your Mac to sync automatically."}
          </p>
        </header>

        <div className="relative group">
          <div className={cn(
            "aspect-square rounded-3xl overflow-hidden border-2 transition-all relative",
            isScanning ? "border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.3)]" : "border-white/10 bg-white/[0.02]"
          )}>
            {isScanning ? (
              <>
                <div id="reader" className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full"></div>
                {hasFlash && (
                  <button 
                    onClick={toggleFlash}
                    className={cn(
                      "absolute bottom-6 right-6 p-4 rounded-full transition-all shadow-xl z-10 active:scale-90",
                      isFlashOn ? "bg-amber-500 text-white shadow-amber-500/20" : "bg-black/60 text-[#8E9299] border border-white/20"
                    )}
                  >
                    {isFlashOn ? <Zap className="w-6 h-6 fill-current" /> : <ZapOff className="w-6 h-6" />}
                  </button>
                )}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[90%] max-w-[450px] aspect-[2/1] border-2 border-white/50 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] relative">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-sm" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-sm" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-sm" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-sm" />
                    <motion.div 
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute left-0 right-0 h-0.5 bg-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,1)]"
                    />
                  </div>
                </div>

                {hasZoom && (
                    <div className="absolute bottom-24 left-6 right-6 z-20 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-white/60 font-mono uppercase tracking-widest">
                            <span>Zoom</span>
                            <span>{zoomLevel.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range"
                            min={minZoom}
                            max={maxZoom}
                            step="0.1"
                            value={zoomLevel}
                            onChange={handleZoomChange}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8">
                <Camera className="w-16 h-16 text-white/10 mb-6" />
                <button 
                  onClick={() => setIsScanning(true)}
                  className="bg-white text-black px-12 py-4 rounded-2xl font-bold text-base hover:bg-[#E4E3E0] transition-all active:scale-95 shadow-2xl"
                >
                  Start High-Res Scanner
                </button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {lastScan && !confirmation && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute -bottom-12 left-4 right-4 py-3 bg-blue-500 text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20"
              >
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>SYNCING: {lastScan}</span>
              </motion.div>
            )}

            {confirmation && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "absolute -bottom-12 left-4 right-4 py-3 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg",
                  confirmation.status === 'added' ? "bg-emerald-500 shadow-emerald-500/20" : "bg-red-500 shadow-red-500/20"
                )}
              >
                {confirmation.status === 'added' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="uppercase">{confirmation.status === 'added' ? `PART ADDED: ${confirmation.name}` : `ERROR: ${confirmation.name}`}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-2xl flex items-center space-x-4 text-red-400 text-sm text-left">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-bold">Access Required</p>
                <p className="opacity-80">{error}</p>
              </div>
            </div>
            
            <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl text-left space-y-3">
              <p className="text-white text-xs font-bold uppercase tracking-wider">How to enable:</p>
              <ul className="text-[#8E9299] text-xs space-y-2 list-disc pl-4">
                <li>Tap the <b>AA</b> or <b>lock icon</b> in Safari/Chrome address bar.</li>
                <li>Go to <b>Website Settings</b>.</li>
                <li>Set <b>Camera</b> to <b>Allow</b>.</li>
                <li>Refresh this page and try again.</li>
              </ul>
            </div>
          </motion.div>
        )}

        <div className="pt-8 grid grid-cols-2 gap-4">
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 text-left">
            <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest mb-1.5">Camera Info</p>
            <p className="text-white font-medium flex items-center text-sm">
              <span className={cn("w-2 h-2 rounded-full mr-2.5", isScanning ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-red-400")} />
              {isScanning ? "High-Res Mode" : "Ready to Start"}
            </p>
          </div>
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 text-left">
            <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-widest mb-1.5">Format Support</p>
            <div className="flex items-center space-x-1">
               <span className="text-white text-xs font-medium">EAN / UPC / CODE-128</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isQuickAdd && (
            <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed inset-0 z-[110] bg-black/95 flex flex-col items-center justify-center p-6 text-center"
            >
                <div className="max-w-md w-full space-y-8">
                    <header className="space-y-2">
                        <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/30">
                            <Plus className="w-8 h-8 text-blue-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight italic-serif">Quick Add Part</h2>
                        <p className="text-[#8E9299] text-sm">
                            Barcode <span className="font-mono text-blue-400">{lastScan}</span> was not found. Add it now?
                        </p>
                    </header>

                    <form onSubmit={handleQuickAddSubmit} className="space-y-4">
                        <div className="space-y-1 text-left">
                            <label className="text-[10px] text-[#8E9299] uppercase font-mono px-2">Part Name</label>
                            <input 
                                required
                                autoFocus
                                placeholder="Enter part name..."
                                value={quickAddName}
                                onChange={e => setQuickAddName(e.target.value)}
                                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            />
                        </div>
                        <div className="space-y-1 text-left">
                            <label className="text-[10px] text-[#8E9299] uppercase font-mono px-2">Price (Rs.)</label>
                            <input 
                                type="number"
                                required
                                placeholder="0.00"
                                value={quickAddPrice}
                                onChange={e => setQuickAddPrice(e.target.value)}
                                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            />
                        </div>

                        <div className="pt-8 flex flex-col space-y-3">
                            <button 
                                type="submit"
                                className="w-full bg-blue-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-600 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95"
                            >
                                Save & Finish Scan
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    setIsQuickAdd(false);
                                    setLastScan(null);
                                }}
                                className="w-full bg-white/5 text-[#8E9299] py-4 rounded-2xl font-bold text-base hover:text-white transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
