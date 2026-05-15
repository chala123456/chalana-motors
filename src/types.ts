export interface Part {
  id: string;
  name: string;
  category: string; // e.g. Honda, Yamaha, Bajaj
  barcode?: string;
  costPrice: number; // Selling Price to customer
  purchasePrice: number; // Buying price for the store
  quantity: number;
  lowStockThreshold: number;
  lastUpdated: string;
}

export interface UsedPart {
  partId: string;
  name: string;
  quantity: number;
  costAtTime: number; // Selling Price at time of sale
  purchasePriceAtTime: number; // Buying Price at time of sale
}

export enum JobStatus {
  PENDING = 'pending',
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
}

export interface ServiceItem {
  description: string;
  price: number;
}

export interface RepairJob {
  id: string;
  jobRef: string;
  customerName?: string;
  contactNumber?: string;
  vehicleNumber: string;
  vehicleModel: string;
  jobType?: 'REPAIR' | 'SALE';
  issue: string; // Keeping for backward compatibility or as summary
  services: ServiceItem[];
  currentKm?: string;
  nextServiceDate?: string;
  status: JobStatus;
  repairFee: number;
  partsUsed: UsedPart[];
  totalPartsCost: number;
  profit: number;
  createdAt: string;
}

export interface DailySummary {
  id: string; // YYYY-MM-DD
  userId: string;
  totalRevenue: number;
  totalProfit: number;
  jobCount: number;
  lastUpdated: string;
}

export interface ServicePreset {
  id: string;
  name: string;
  price: number;
  type?: 'service' | 'part';
}

export interface Customer {
  id: string;
  customerName: string;
  contactNumber: string;
  email?: string;
  address?: string;
  vehicleNumbers?: string[];
  userId: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  userId: string;
  createdAt: string;
}

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}
