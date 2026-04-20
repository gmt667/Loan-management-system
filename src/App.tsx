/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, Component, ReactNode } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  CheckCircle2, 
  CreditCard, 
  Settings, 
  HelpCircle, 
  Search, 
  RefreshCw,
  Bell, 
  Plus,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  FileDown,
  ChevronRight,
  MoreHorizontal,
  DollarSign,
  PieChart as PieChartIcon,
  Clock,
  LogOut,
  History,
  Smartphone,
  Receipt,
  UserPlus,
  ArrowRight,
  Filter,
  Edit,
  UserMinus,
  UserCheck,
  Briefcase,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  BarChart3,
  Zap,
  Info,
  User as UserIcon,
  FileEdit,
  Layout,
  AlertTriangle,
  X,
  BellRing,
  EyeOff,
  Eye,
  FileCheck,
  Menu,
  Activity,
  Wallet,
  Target,
  Award,
  Terminal,
  MapPin,
  Calendar,
  Maximize2,
  Sparkles,
  Box,
  BarChart4,
  FileX2,
  Download,
  Printer,
  Lock,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTheme as useNextTheme } from 'next-themes';
import { AuthProvider, type AppPath } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';

// Firebase
import { auth, db, storage } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signInWithPopup,
  signOut,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDocFromServer,
  doc,
  getDoc,
  getDocs,
  where,
  setDoc,
  runTransaction
} from 'firebase/firestore';

// Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  READ = 'read',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export let generateReceipt: any = null;

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Financial Engine Utilities
 */

// Reducing Balance Amortization Formula: P = [r * A] / [1 - (1 + r)^-n]
const calculateAmortizedInstallment = (principal: number, annualRate: number, termMonths: number): number => {
  if (termMonths === 0) return 0;
  const monthlyRate = (annualRate / 100) / 12;
  const installment = (monthlyRate * principal) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  return Math.round(installment);
};

// Generate full schedule
const generateRepaymentSchedule = (
  loanId: string, 
  principal: number, 
  annualRate: number, 
  termMonths: number,
  startDate: Date = new Date()
): RepaymentScheduleItem[] => {
  const schedule: RepaymentScheduleItem[] = [];
  const monthlyRate = (annualRate / 100) / 12;
  const monthlyPayment = calculateAmortizedInstallment(principal, annualRate, termMonths);
  
  let remainingBalance = principal;

  for (let i = 1; i <= termMonths; i++) {
    const interestPortion = Math.round(remainingBalance * monthlyRate);
    const principalPortion = monthlyPayment - interestPortion;
    
    // Adjust last payment for rounding errors
    const finalPrincipal = i === termMonths ? remainingBalance : principalPortion;
    const finalTotal = i === termMonths ? (finalPrincipal + interestPortion) : monthlyPayment;
    
    const dueDate = new Date(startDate);
    dueDate.setMonth(startDate.getMonth() + i);

    schedule.push({
      loanId,
      installmentNumber: i,
      dueDate: dueDate.toISOString(),
      principalAmount: finalPrincipal,
      interestAmount: interestPortion,
      total: finalTotal,
      remainingBalance: Math.max(0, remainingBalance - finalPrincipal),
      status: 'PENDING',
      paidAmount: 0,
      penaltyAmount: 0
    });

    remainingBalance -= finalPrincipal;
  }

  return schedule;
};

// Charge calculation
const calculateChargeValue = (amount: number, charge: { type: ChargeType, value: number }): number => {
  if (charge.type === 'FIXED') return charge.value;
  return Math.round((amount * charge.value) / 100);
};

// Atomic transaction helper
const recordTransaction = async (
  loanId: string,
  clientId: string,
  type: TransactionType,
  amount: number,
  reference: string,
  agentEmail: string,
  comment?: string
) => {
  const txData = {
    loanId,
    clientId,
    type,
    amount,
    reference,
    agentEmail,
    comment: comment || '',
    timestamp: serverTimestamp(),
    metadata: {
      source: 'financial-engine-p3',
      processedAt: new Date().toISOString()
    }
  };
  
  await addDoc(collection(db, 'transactions'), txData);
  return txData;
};

// Payment processing engine
const processRepayment = async (
  loan: any, 
  amount: number, 
  agentEmail: string,
  method: string,
  reference: string
) => {
  try {
    const isLocalLoan = loan.id?.startsWith('local-') || loan.id?.startsWith('demo-') || getLocalLoans().some(localLoan => localLoan.id === loan.id);

    if (isLocalLoan) {
      const localSchedules = getLocalRepaymentSchedules();
      const updatedSchedules = localSchedules.map(scheduleItem => ({ ...scheduleItem }));
      let remainingPayment = amount;

      for (const inst of updatedSchedules.filter(item => item.loanId === loan.id).sort((left, right) => (left.installmentNumber || 0) - (right.installmentNumber || 0))) {
        if (remainingPayment <= 0) break;
        if (inst.status === 'PAID') continue;

        const outstandingForInstallment = ((inst.total || 0) + (inst.penaltyAmount || 0)) - (inst.paidAmount || 0);
        if (outstandingForInstallment <= 0) continue;

        const paymentToThisInstallment = Math.min(remainingPayment, outstandingForInstallment);
        inst.paidAmount = (inst.paidAmount || 0) + paymentToThisInstallment;
        inst.status = inst.paidAmount >= ((inst.total || 0) + (inst.penaltyAmount || 0)) ? 'PAID' : 'PARTIAL';
        inst.updatedAt = new Date().toISOString();
        remainingPayment -= paymentToThisInstallment;
      }

      saveLocalRepaymentSchedules(updatedSchedules);

      const updatedLoan = {
        ...loan,
        outstandingBalance: Math.max(0, (loan.outstandingBalance || 0) - amount),
        updatedAt: new Date().toISOString(),
      };
      saveLocalLoan(updatedLoan);

      saveLocalTransactionRecord({
        id: `local-tx-${Date.now()}`,
        loanId: loan.id,
        clientId: loan.clientId,
        clientName: loan.clientName || 'Unknown Client',
        type: 'REPAYMENT',
        amount,
        reference,
        agentEmail,
        method,
        timestamp: new Date().toISOString(),
        comment: `Payment via ${method}`,
      });

      toast.success(`Payment of MWK ${amount.toLocaleString()} processed.`);
      return true;
    }

    // 1. Fetch schedule
    const q = query(collection(db, 'repayment_schedule'), where('loanId', '==', loan.id), orderBy('installmentNumber', 'asc'));
    const snapshot = await getDocs(q);
    const schedule = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RepaymentScheduleItem));

    let remainingPayment = amount;
    const updates: Promise<any>[] = [];

    // Waterfall allocation: Penalties -> Interest -> Principal
    for (const inst of schedule) {
      if (remainingPayment <= 0) break;
      if (inst.status === 'PAID') continue;

      const currentPenaltyDue = inst.penaltyAmount - (inst.paidAmount >= (inst.total + inst.penaltyAmount) ? inst.penaltyAmount : 0); // Simplified
      // For simplicity in this mock, we assume penalty is added to 'total' or tracked separately
      // Real logic: target = (inst.total - inst.paidAmount) + inst.penaltyAmount
      
      const outstandingForInstallment = (inst.total + inst.penaltyAmount) - inst.paidAmount;
      const paymentToThisInstallment = Math.min(remainingPayment, outstandingForInstallment);

      const newPaidAmount = inst.paidAmount + paymentToThisInstallment;
      const newStatus: ScheduleStatus = newPaidAmount >= (inst.total + inst.penaltyAmount) ? 'PAID' : 'PARTIAL';

      updates.push(updateDoc(doc(db, 'repayment_schedule', inst.id!), {
        paidAmount: newPaidAmount,
        status: newStatus,
        updatedAt: serverTimestamp()
      }));

      remainingPayment -= paymentToThisInstallment;
    }

    await Promise.all(updates);

    // 2. Record Transaction
    await recordTransaction(
      loan.id,
      loan.clientId,
      'REPAYMENT',
      amount,
      reference,
      agentEmail,
      `Payment via ${method}`
    );

    // 3. Update Loan Balance
    await updateDoc(doc(db, 'loans', loan.id), {
      outstandingBalance: Math.max(0, (loan.outstandingBalance || 0) - amount),
      updatedAt: serverTimestamp()
    });

    // 4. Phase 5: Payment Received notification
    await createNotification(
      'PAYMENT_RECEIVED',
      'Payment Received',
      `Payment of MWK ${amount.toLocaleString()} received for loan ${loan.id.slice(0,8).toUpperCase()} via ${method.replace('_', ' ')}. Ref: ${reference}`,
      'ALL',
      loan.id,
      loan.applicationId,
      { paymentAmount: amount, method, reference }
    );

    toast.success(`Payment of MWK ${amount.toLocaleString()} processed.`);
    return true;
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'repayment_schedule');
    return false;
  }
};

// --- Phase 4 Reporting Utilities ---

function getTimestampDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts === 'string') return new Date(ts);
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return null;
}

const calculateFinancialStats = (transactions: any[], startDate?: Date, endDate?: Date) => {
  const filtered = transactions.filter(tx => {
    const txDate = getTimestampDate(tx.timestamp);
    if (!txDate) return false;
    if (startDate && txDate < startDate) return false;
    if (endDate && txDate > endDate) return false;
    return true;
  });

  const interest = filtered.filter(tx => tx.type === 'INTEREST').reduce((s, tx) => s + (tx.amount || 0), 0);
  const charges = filtered.filter(tx => tx.type === 'CHARGE').reduce((s, tx) => s + (tx.amount || 0), 0);
  const penalties = filtered.filter(tx => tx.type === 'PENALTY').reduce((s, tx) => s + (tx.amount || 0), 0);
  const revenue = interest + charges + penalties;

  const disbursed = filtered.filter(tx => tx.type === 'DISBURSEMENT').reduce((s, tx) => s + (tx.amount || 0), 0);
  const recovered = filtered.filter(tx => tx.type === 'REPAYMENT').reduce((s, tx) => s + (tx.amount || 0), 0);

  return { interest, charges, penalties, revenue, disbursed, recovered, netCashFlow: recovered - disbursed };
};

const calculatePortfolioStats = (loans: any[], schedule: any[]) => {
  const activeLoans = loans.filter(l => l.status === 'ACTIVE');
  const totalOutstanding = activeLoans.reduce((s, l) => s + (l.outstandingBalance || 0), 0);
  const totalDisbursed = loans.reduce((s, l) => s + (l.amount || 0), 0);

  // PAR (Portfolio At Risk) - Loans with any installment overdue
  const overdueLoanIds = new Set(schedule.filter(s => s.status === 'OVERDUE').map(s => s.loanId));
  const parAmount = activeLoans.filter(l => overdueLoanIds.has(l.id)).reduce((s, l) => s + (l.outstandingBalance || 0), 0);
  const parRatio = totalOutstanding > 0 ? (parAmount / totalOutstanding) * 100 : 0;

  // NPL (Non-Performing Loans) - Overdue > 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const nplLoanIds = new Set(
    schedule
      .filter(s => s.status === 'OVERDUE' && getTimestampDate(s.dueDate)! < ninetyDaysAgo)
      .map(s => s.loanId)
  );
  const nplCount = nplLoanIds.size;

  return { totalOutstanding, totalDisbursed, activeCount: activeLoans.length, parAmount, parRatio, nplCount };
};

const confirmRepayment = async (
  transaction: any,
  penaltyRate: number = 5
) => {
  try {
    const isLocalTx = transaction.id?.startsWith('local-');
    if (isLocalTx) {
      toast.error('Local transactions cannot be verified yet.');
      return false;
    }

    const loanDoc = await getDoc(doc(db, 'loans', transaction.loanId));
    if (!loanDoc.exists()) throw new Error('Loan not found');
    const loanData = loanDoc.data();
    const loanId = loanDoc.id;

    const q = query(collection(db, 'repayment_schedule'), where('loanId', '==', loanId), orderBy('installmentNumber', 'asc'));
    const snapshot = await getDocs(q);
    const schedule = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RepaymentScheduleItem));

    let remainingPayment = transaction.amount;
    const updatesMap = new Map<string, any>();
    
    let totalPenaltyPaid = 0;
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;

    // 1. ALLOCATE PENALTIES (All installments)
    for (const inst of schedule) {
      if (remainingPayment <= 0) break;
      if (inst.status === 'PAID') continue;
      
      const penaltyDue = (inst.penaltyAmount || 0) - (inst.paidPenalty || 0);
      if (penaltyDue > 0) {
        const payToPenalty = Math.min(remainingPayment, penaltyDue);
        inst.paidPenalty = (inst.paidPenalty || 0) + payToPenalty;
        inst.paidAmount = (inst.paidAmount || 0) + payToPenalty;
        remainingPayment -= payToPenalty;
        totalPenaltyPaid += payToPenalty;
        updatesMap.set(inst.id!, { ...inst });
      }
    }

    // 2. ALLOCATE INTEREST (All installments)
    for (const inst of schedule) {
      if (remainingPayment <= 0) break;
      if (inst.status === 'PAID') continue;

      const interestDue = (inst.interestAmount || 0) - (inst.paidInterest || 0);
      if (interestDue > 0) {
        const payToInterest = Math.min(remainingPayment, interestDue);
        inst.paidInterest = (inst.paidInterest || 0) + payToInterest;
        inst.paidAmount = (inst.paidAmount || 0) + payToInterest;
        remainingPayment -= payToInterest;
        totalInterestPaid += payToInterest;
        updatesMap.set(inst.id!, { ...inst });
      }
    }

    // 3. ALLOCATE PRINCIPAL (All installments)
    for (const inst of schedule) {
      if (remainingPayment <= 0) break;
      if (inst.status === 'PAID') continue;

      const principalDue = (inst.principalAmount || 0) - (inst.paidPrincipal || 0);
      if (principalDue > 0) {
        const payToPrincipal = Math.min(remainingPayment, principalDue);
        inst.paidPrincipal = (inst.paidPrincipal || 0) + payToPrincipal;
        inst.paidAmount = (inst.paidAmount || 0) + payToPrincipal;
        remainingPayment -= payToPrincipal;
        totalPrincipalPaid += payToPrincipal;
        updatesMap.set(inst.id!, { ...inst });
      }
    }

    const updates: Promise<any>[] = [];
    updatesMap.forEach((updatedInst, id) => {
      const isPaid = updatedInst.paidAmount >= (updatedInst.total + (updatedInst.penaltyAmount || 0));
      updates.push(updateDoc(doc(db, 'repayment_schedule', id), {
        paidAmount: updatedInst.paidAmount,
        paidPrincipal: updatedInst.paidPrincipal || 0,
        paidInterest: updatedInst.paidInterest || 0,
        paidPenalty: updatedInst.paidPenalty || 0,
        status: isPaid ? 'PAID' : 'PARTIAL',
        updatedAt: serverTimestamp()
      }));
    });

    const currentBalance = loanData.outstandingBalance || 0;
    const finalBalance = Math.max(0, currentBalance - transaction.amount);
    
    updates.push(updateDoc(doc(db, 'loans', loanId), {
      outstandingBalance: finalBalance,
      updatedAt: serverTimestamp()
    }));

    updates.push(updateDoc(doc(db, 'transactions', transaction.id), {
      status: 'CONFIRMED',
      verificationStatus: 'CONFIRMED',
      verifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await Promise.all(updates);
    
    // Receipt generation uses new balance and detailed allocation
    await generateReceipt(
      loanId,
      'REPAYMENT',
      transaction.reference,
      transaction.amount,
      'auditor-console',
      loanData.clientName || 'Valued Client',
      transaction.method,
      `Audited Repayment: Allocated via Penalty -> Interest -> Principal algorithm.`,
      { 
        penalty: totalPenaltyPaid, 
        interest: totalInterestPaid, 
        principal: totalPrincipalPaid 
      },
      undefined, // No disbursement details
      { remainingBalance: finalBalance },
      false, // Not local
      transaction.id
    );

    toast.success(`Repayment of MWK ${transaction.amount.toLocaleString()} confirmed and allocated.`);
    return true;
  } catch (error) {
    console.error("Confirmation failed:", error);
    toast.error('Failed to confirm repayment.');
    return false;
  }
};

const handleManualDisbursement = async (loan: any, amount: number, reference: string, method: string, loanProducts: any[] = []) => {
  try {
    const isLocal = !!(loan.id?.startsWith('local-'));
    const reviewerEmail = getActiveSessionEmail() || 'manager-console';
    
    // 1. Fetch Product for Fee Calculation
    const product = loanProducts.find((p: any) => p.id === loan.productId);
    const processingFee = product ? calculateChargeValue(amount, { type: product.processingFeeType, value: product.processingFee }) : 0;
    const applicationFee = product ? calculateChargeValue(amount, { type: product.applicationFeeType, value: product.applicationFee }) : 0;
    const totalFees = processingFee + applicationFee;
    const netAmount = amount - totalFees;

    // 2. Record Disbursement Transaction
    const tx = await recordTransaction(loan.id, loan.clientId, 'DISBURSEMENT', amount, reference, reviewerEmail, `Manual Disbursement confirmed via ${method}`);
    
    // 3. Generate Receipt
    await generateReceipt(
      loan.id,
      'DISBURSEMENT',
      reference,
      amount,
      reviewerEmail,
      loan.clientName || 'Valued Client',
      method,
      `Loan funds released: MWK ${amount.toLocaleString()}. Fees deducted: MWK ${totalFees.toLocaleString()}`,
      undefined, // No repayment allocation
      {
        disbursedAmount: amount,
        feesDeducted: totalFees,
        netAmountSent: netAmount
      },
      { loanId: loan.id },
      isLocal,
      (tx as any).id
    );

    toast.success('Disbursement recorded and receipt generated.');
    return true;
  } catch (error) {
    console.error('Manual disbursement error:', error);
    toast.error('Failed to record disbursement.');
    return false;
  }
};

const handleConfirmRepayment = async (transaction: any, loan: any) => {
  try {
    const success = await confirmRepayment(transaction, (loan.penaltyRate || 5));
    return success;
  } catch (error) {
    toast.error('Failed to process repayment receipt.');
    return false;
  }
};

const calculateOperationalStats = (applications: any[], workflowHistory: any[]) => {
  const total = applications.length;
  const approved = applications.filter(a => a.status === 'APPROVED').length;
  const rejected = applications.filter(a => a.status === 'REJECTED').length;
  
  const approvalRate = total > 0 ? (approved / total) * 100 : 0;
  const rejectionRate = total > 0 ? (rejected / total) * 100 : 0;

  let totalTime = 0;
  let count = 0;

  applications.forEach(app => {
    if (app.status === 'APPROVED' || app.status === 'REJECTED') {
      const start = getTimestampDate(app.createdAt);
      const end = getTimestampDate(app.approvedAt || app.updatedAt);
      if (start && end) {
        totalTime += (end.getTime() - start.getTime());
        count++;
      }
    }
  });

  const avgProcessingTimeHours = count > 0 ? (totalTime / count) / (1000 * 60 * 60) : 0;

  return { total, approved, rejected, approvalRate, rejectionRate, avgProcessingTimeHours };
};

const downloadAsCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(obj => Object.values(obj).map(v => {
    const str = String(v).replace(/"/g, '""');
    return `"${str}"`;
  }).join(','));
  const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


// Penalty Engine & Maintenance
const runFinancialMaintenance = async (loans: any[], products: LoanProduct[], graceDays: number = 3) => {
  const now = new Date();
  let penaltiesApplied = 0;
  let totalPenaltyValue = 0;

  try {
    const maintenancePromises = loans.map(async (loan) => {
      if (loan.status === 'REPAID' || loan.status === 'REJECTED') return;

      const product = products.find(p => p.id === loan.productId);
      if (!product) return;

      const q = query(collection(db, 'repayment_schedule'), 
        where('loanId', '==', loan.id), 
        where('status', 'in', ['PENDING', 'PARTIAL', 'OVERDUE'])
      );
      const snapshot = await getDocs(q);
      
      const batchUpdates: Promise<any>[] = [];

      snapshot.docs.forEach(docSnap => {
        const inst = docSnap.data() as RepaymentScheduleItem;
        const dueDate = new Date(inst.dueDate);
        
        // Task 4: Respect Grace Period
        const penaltyDate = new Date(dueDate.getTime() + (graceDays * 24 * 60 * 60 * 1000));
        
        if (now > penaltyDate && inst.status !== 'PAID') {
          const penaltyAmount = calculateChargeValue(inst.total, { type: product.penaltyType, value: product.penaltyRate });
          
          // Only apply once per installment for this mock simulation (real system would track dates)
          const lastUpdated = inst.updatedAt?.toDate ? inst.updatedAt.toDate() : new Date(0);
          if (inst.penaltyAmount === 0 || now.getDate() !== lastUpdated.getDate()) {
             batchUpdates.push(updateDoc(doc(db, 'repayment_schedule', docSnap.id), {
               penaltyAmount: (inst.penaltyAmount || 0) + penaltyAmount,
               status: 'OVERDUE',
               updatedAt: serverTimestamp()
             }));

             // Record Transaction
             recordTransaction(loan.id, loan.clientId, 'PENALTY', penaltyAmount, `PEN-${loan.id.slice(0,5)}`, 'system-maintenance', `Late payment penalty for installment #${inst.installmentNumber}`);
             
             // Update Loan Balance
             batchUpdates.push(updateDoc(doc(db, 'loans', loan.id), {
               outstandingBalance: (loan.outstandingBalance || 0) + penaltyAmount,
               updatedAt: serverTimestamp()
             }));

             penaltiesApplied++;
             totalPenaltyValue += penaltyAmount;
          }
        }
      });
      
      await Promise.all(batchUpdates);
    });

    await Promise.all(maintenancePromises);

    // DEFAULTED detection: mark loans as DEFAULTED if all installments are OVERDUE and past term
    const defaultCheckPromises = loans.map(async (loan) => {
      if (loan.status !== 'ACTIVE') return;
      const product = products.find(p => p.id === loan.productId);
      if (!product) return;
      const allQ = query(collection(db, 'repayment_schedule'), where('loanId', '==', loan.id));
      const allSnap = await getDocs(allQ);
      if (allSnap.empty) return;
      const allItems = allSnap.docs.map(d => d.data());
      const allOverdue = allItems.every(item => item.status === 'OVERDUE' || item.status === 'PAID');
      const hasAnyOverdue = allItems.some(item => item.status === 'OVERDUE');
      if (allOverdue && hasAnyOverdue) {
        await updateDoc(doc(db, 'loans', loan.id), { status: 'DEFAULTED', updatedAt: serverTimestamp() });
        await createNotification(
          'LOAN_DEFAULTED',
          'Loan Marked as DEFAULTED',
          `Loan for ${loan.clientName || loan.clientId} has been automatically flagged as DEFAULTED ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â all installments are overdue.`,
          'OFFICER',
          loan.id
        );
        penaltiesApplied++;
      }
    });
    await Promise.all(defaultCheckPromises);

    if (penaltiesApplied > 0) {
      toast.success(`Maintenance complete. Applied ${penaltiesApplied} penalties / defaults detected.`);
    } else {
      toast.info("Maintenance complete. No new overdue installments found.");
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'maintenance');
  }
};

// --- Phase 5: Notification System ---

const createNotification = async (
  type: NotificationType,
  title: string,
  message: string,
  targetRole: UserRole | 'ALL' = 'ALL',
  loanId?: string,
  applicationId?: string,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    await addDoc(collection(db, 'notifications'), {
      type,
      title,
      message,
      targetRole,
      loanId: loanId || null,
      applicationId: applicationId || null,
      isRead: false,
      createdAt: serverTimestamp(),
      metadata: metadata || {}
    } as NotificationRecord);
  } catch (e) {
    // Notifications are non-critical; swallow errors silently
    console.warn('[Phase5] createNotification failed:', e);
  }
};

// --- Phase 5: Mock Payment Service ---
const MockPaymentService = {
  async initiateDisbursement(loanId: string, amount: number, clientName: string, method: PaymentMethod = 'AIRTEL_MONEY'): Promise<PaymentResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    const ref = `FK-DISB-${Date.now().toString(36).toUpperCase()}-${loanId.slice(0, 5).toUpperCase()}`;
    const providerName = method === 'AIRTEL_MONEY' ? 'Airtel Money' : method === 'MPAMBA' ? 'TNM Mpamba' : method.replace('_', ' ');
    return {
      success: true,
      reference: ref,
      method,
      message: `MWK ${amount.toLocaleString()} disbursed to ${clientName} via ${providerName}. Ref: ${ref}`,
      transactionId: `SIM-TX-${Date.now()}`
    };
  },

  async processRepayment(loanId: string, amount: number, clientName: string, method: PaymentMethod = 'CASH'): Promise<PaymentResult> {
    await new Promise(resolve => setTimeout(resolve, 500));
    const ref = `FK-REP-${Date.now().toString(36).toUpperCase()}-${loanId.slice(0, 5).toUpperCase()}`;
    const providerName = method === 'AIRTEL_MONEY' ? 'Airtel Money' : method === 'MPAMBA' ? 'TNM Mpamba' : method.replace('_', ' ');
    return {
      success: true,
      reference: ref,
      method,
      message: `MWK ${amount.toLocaleString()} received from ${clientName} via ${providerName}. Ref: ${ref}`,
      transactionId: `SIM-TX-${Date.now()}`
    };
  }
};

// --- Phase 5: Payment Reminders ---
const sendPaymentReminders = async (loans: any[]): Promise<number> => {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  let count = 0;

  for (const loan of loans) {
    if (loan.status !== 'ACTIVE') continue;
    const nextDue = loan.nextDueDate ? new Date(loan.nextDueDate) : null;
    if (!nextDue) continue;
    if (nextDue <= threeDaysFromNow && nextDue >= new Date()) {
      await createNotification(
        'PAYMENT_REMINDER',
        'Payment Due Soon',
        `Loan for ${loan.clientName || 'Unknown Client'} has a payment due on ${nextDue.toLocaleDateString()}. Outstanding: MWK ${(loan.outstandingBalance || 0).toLocaleString()}.`,
        'OFFICER',
        loan.id
      );
      count++;
    }
  }
  return count;
};

// --- Phase 5: Daily Automation Runner ---
const runDailyAutomation = async (loans: any[], products: any[]): Promise<void> => {
  const lastRun = localStorage.getItem(AUTOMATION_LAST_RUN_KEY);
  const now = new Date();
  if (lastRun) {
    const lastRunDate = new Date(lastRun);
    const hoursSince = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return; // Cooldown: only run once every 24h
  }

  const logEntry = { runAt: now.toISOString(), results: {} as Record<string, any> };

  try {
    // Job 1: Penalty + Schedule maintenance
    await runFinancialMaintenance(loans, products);
    logEntry.results['maintenance'] = { status: 'OK', runAt: now.toISOString() };

    // Job 2: Payment Reminders
    const reminderCount = await sendPaymentReminders(loans);
    logEntry.results['reminders'] = { status: 'OK', count: reminderCount, runAt: now.toISOString() };

    // System notification for admin
    await createNotification(
      'SYSTEM',
      'Daily Automation Complete',
      `Scheduled jobs ran successfully. ${reminderCount} payment reminder(s) sent. See Automation Center for details.`,
      'ADMIN'
    );

    localStorage.setItem(AUTOMATION_LAST_RUN_KEY, now.toISOString());
    const existingLog: any[] = JSON.parse(localStorage.getItem(AUTOMATION_LOG_KEY) || '[]');
    existingLog.unshift(logEntry);
    localStorage.setItem(AUTOMATION_LOG_KEY, JSON.stringify(existingLog.slice(0, 30)));

  } catch (e) {
    logEntry.results['error'] = { status: 'FAILED', error: String(e) };
    const existingLog: any[] = JSON.parse(localStorage.getItem(AUTOMATION_LOG_KEY) || '[]');
    existingLog.unshift(logEntry);
    localStorage.setItem(AUTOMATION_LOG_KEY, JSON.stringify(existingLog.slice(0, 30)));
  }
};


class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  public state: { hasError: boolean, error: Error | null };
  public props: { children: ReactNode };
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.operationType) {
          message = `Firestore ${parsed.operationType} failed: ${parsed.error}`;
        }
      } catch (e) {
        message = this.state.error?.message || message;
      }

      return (
        <div className="h-screen w-full flex items-center justify-center bg-red-50 p-6">
          <Card className="max-w-md w-full border-red-200 shadow-xl">
            <CardHeader className="bg-red-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle size={24} />
                System Error
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-slate-700 font-medium">{message}</p>
              <p className="text-xs text-slate-500 bg-slate-100 p-3 rounded border border-slate-200 overflow-auto max-h-32">
                {this.state.error?.stack}
              </p>
              <Button 
                onClick={() => window.location.reload()}
                className="w-full bg-slate-900 hover:bg-slate-800"
              >
                Reload Application
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Types
type UserRole = 'ADMIN' | 'OFFICER' | 'AGENT' | 'CREDIT_ANALYST' | 'MANAGER' | 'CLIENT';
type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
type LoanStage = 'PENDING' | 'REVIEWED' | 'ANALYZED' | 'REFERRED_BACK' | 'APPROVED' | 'REJECTED' | 'DISBURSED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CRB_CHECK' | 'ANALYSIS' | 'FINAL_DECISION';
type View = 'dashboard' | 'users' | 'clients' | 'loan-products' | 'loans' | 'transactions' | 'reports' | 'audit-logs' | 'automation-center' | 'applications' | 'approvals' | 'repayments' | 'transactions-audit' | 'anomalies' | 'user-activity' | 'cases' | 'payments' | 'due-loans' | 'settings' | 'repayment-audit' | 'manager-decision' | 'manager-portfolio' | 'manager-risk' | 'profile' | 'receipts' | 'notifications';

type TransactionType = 'DISBURSEMENT' | 'REPAYMENT' | 'CHARGE' | 'PENALTY' | 'ADJUSTMENT';
type ScheduleStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'OVERDUE';
type ChargeType = 'FIXED' | 'PERCENTAGE';
type PaymentMethod = 'CASH' | 'AIRTEL_MONEY' | 'MPAMBA' | 'BANK_TRANSFER';
type NotificationType = 'LOAN_APPROVED' | 'LOAN_REJECTED' | 'PAYMENT_RECEIVED' | 'PAYMENT_REMINDER' | 'LOAN_OVERDUE' | 'LOAN_DEFAULTED' | 'STAGE_CHANGE' | 'CRB_READY' | 'SYSTEM';

interface NotificationRecord {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  loanId?: string;
  applicationId?: string;
  clientId?: string;
  targetEmail?: string;
  targetRole?: UserRole | 'ALL';
  isRead: boolean;
  createdAt: any;
  metadata?: Record<string, any>;
}

interface PaymentResult {
  success: boolean;
  reference: string;
  method: PaymentMethod;
  message: string;
  transactionId: string;
}

interface LoanProduct {
  id: string;
  name: string;
  interestRate: number; // Annualized %
  maxTerm: number;
  minAmount: number;
  maxAmount: number;
  status: 'ACTIVE' | 'INACTIVE';
  charges: {
    applicationFee: { type: ChargeType, value: number };
    processingFee: { type: ChargeType, value: number };
    disbursementFee: { type: ChargeType, value: number };
  };
  feeDistribution: 'DEDUCTED' | 'SEPARATE';
  penaltyRate: number;
  penaltyType: ChargeType;
}

interface RepaymentScheduleItem {
  id?: string;
  loanId: string;
  installmentNumber: number;
  dueDate: any;
  principalAmount: number;
  interestAmount: number;
  total: number;
  remainingBalance: number;
  status: ScheduleStatus;
  paidAmount: number;
  paidPrincipal?: number;
  paidInterest?: number;
  paidPenalty?: number;
  penaltyAmount: number;
  updatedAt?: any;
}

interface AuthProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone?: string;
  idNumber?: string;
  nationalId?: string;
  address?: string;
  role: UserRole;
  status: UserStatus;
  kycStatus?: string;
  profilePhotoName?: string;
  photoURL?: string;
  guarantorReference?: string;
  kycComplete?: boolean;
  createdAt?: any;
  theme?: 'light' | 'dark' | 'system';
  lastLogin?: string;
  lastDevice?: string;
  passwordHash?: string;
}

export interface ReceiptRecord {
  id: string;
  receiptId: string;
  transactionId: string; // Linked transaction
  transactionType: 'DISBURSEMENT' | 'REPAYMENT' | 'DECISION' | 'ADJUSTMENT' | 'FEE_PAYMENT';
  issuedAt: any; // serverTimestamp
  date: string; // Display date
  loanId: string;
  clientId: string;
  clientName: string;
  amount: number;
  paymentMethod?: string;
  transactionReference?: string;
  authorizedBy: string;
  description?: string;
  status: 'ISSUED' | 'VOIDED';
  allocation?: {
    penalty: number;
    interest: number;
    principal: number;
  };
  disbursementDetails?: {
    disbursedAmount: number;
    feesDeducted: number;
    netAmountSent: number;
  };
  metadata?: Record<string, any>;
}

export interface ConfirmableLoanRecord {
  id: string;
  clientId: string;
  clientName?: string;
  outstandingBalance?: number;
}

interface SystemSettings {
  interest_rate_default: number;
  max_loan_duration: number;
  penalty_rate: number;
  penalty_grace_days: number;
  currency: string;
  company_name: string;
}

// --- Phase 5: Automation localStorage keys ---
const AUTOMATION_LOG_KEY = 'fastkwacha_automation_log';
const AUTOMATION_LAST_RUN_KEY = 'fastkwacha_automation_last_run';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PHONE_REGEX = /^(\+?265|0)?(8|9)\d{8}$/;
const ID_NUMBER_REGEX = /^[A-Z0-9/-]{6,20}$/i;
const DEFAULT_ROLE_ACCOUNTS: Record<string, { role: UserRole; password: string; name: string }> = {
  'admin@fastkwacha.com': { role: 'ADMIN', password: 'admin123', name: 'System Admin' },
  'officer@fastkwacha.com': { role: 'OFFICER', password: 'officer123', name: 'Loan Officer' },
  'agent.test@fastkwacha.com': { role: 'AGENT', password: 'agent123', name: 'Field Agent' },
  'manager@fastkwacha.com': { role: 'MANAGER', password: 'manager123', name: 'Operations Manager' },
  'analyst@fastkwacha.com': { role: 'CREDIT_ANALYST', password: 'analyst123', name: 'Credit Analyst' },
};

const formatPhoneDisplay = (value: string) => value.replace(/\s+/g, '').trim();

const COLORS = ['#208CA2', '#42DAD9', '#0A4969', '#146886'];

const barData = [
  { name: 'Jan', disbursement: 4000, repayment: 2400 },
  { name: 'Feb', disbursement: 3000, repayment: 1398 },
  { name: 'Mar', disbursement: 2000, repayment: 9800 },
  { name: 'Apr', disbursement: 2780, repayment: 3908 },
  { name: 'May', disbursement: 1890, repayment: 4800 },
  { name: 'Jun', disbursement: 2390, repayment: 3800 },
  { name: 'Jul', disbursement: 3490, repayment: 4300 },
];

const pieData = [
  { name: 'Commercial', value: 60 },
  { name: 'SME Loans', value: 25 },
  { name: 'Personal', value: 15 },
];

const getStatusTone = (status: UserStatus) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-700';
    case 'PENDING':
      return 'bg-amber-50 text-amber-700';
    case 'REJECTED':
      return 'bg-red-50 text-red-700';
    case 'SUSPENDED':
      return 'bg-slate-100 text-slate-700';
  }
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUserRole = (role?: string): UserRole => {
  switch (String(role || 'CLIENT').toUpperCase()) {
    case 'LOAN_OFFICER':
    case 'OFFICER':
      return 'OFFICER';
    case 'AGENT':
      return 'AGENT';
    case 'CREDIT_ANALYST':
      return 'CREDIT_ANALYST';
    case 'MANAGER':
      return 'MANAGER';
    case 'ADMIN':
      return 'ADMIN';
    default:
      return 'CLIENT';
  }
};
const normalizeUserStatus = (status?: string): UserStatus =>
  status === 'INACTIVE' || status === 'DISABLED' ? 'SUSPENDED' : ((status as UserStatus) || 'ACTIVE');

const normalizeAppPath = (path?: string): AppPath => {
  switch (path) {
    case '/client':
    case '/officer':
    case '/analyst':
    case '/manager':
    case '/admin':
    case '/unauthorized':
      return path;
    default:
      return '/login';
  }
};

const getPathForRole = (role?: UserRole | null): AppPath => {
  switch (role) {
    case 'CLIENT':
      return '/client';
    case 'OFFICER':
    case 'AGENT':
      return '/officer';
    case 'CREDIT_ANALYST':
      return '/analyst';
    case 'MANAGER':
      return '/manager';
    case 'ADMIN':
      return '/admin';
    default:
      return '/login';
  }
};

const normalizeApplicationStage = (stage?: string, status?: string): LoanStage => {
  const normalized = String(stage || status || 'PENDING').toUpperCase();

  switch (normalized) {
    case 'SUBMITTED':
    case 'PENDING':
      return 'PENDING';
    case 'UNDER_REVIEW':
    case 'CRB_CHECK':
    case 'REVIEWED':
      return 'REVIEWED';
    case 'ANALYSIS':
    case 'FINAL_DECISION':
    case 'ANALYZED':
      return 'ANALYZED';
    case 'REFERRED_BACK':
      return 'REFERRED_BACK';
    case 'APPROVED':
      return 'APPROVED';
    case 'REJECTED':
      return 'REJECTED';
    case 'DISBURSED':
      return 'DISBURSED';
    default:
      return 'PENDING';
  }
};

const normalizeApplicationRecord = (application: any) => {
  const currentStage = normalizeApplicationStage(application?.current_stage, application?.status);
  return {
    ...application,
    current_stage: currentStage,
    status: currentStage === 'DISBURSED' ? 'APPROVED' : currentStage,
  };
};

const getDefaultViewForRole = (profile?: AuthProfile | null): View => {
  if (!profile) return 'dashboard';
  if (profile.role === 'CLIENT') {
    return profile.kycComplete ? 'dashboard' : 'profile';
  }
  return 'dashboard';
};

const isViewAllowedForRole = (role: UserRole, view: View) => {
  const allowedViewsByRole: Record<UserRole, View[]> = {
    CLIENT: ['dashboard', 'loans', 'repayments', 'receipts', 'notifications', 'profile', 'settings'],
    OFFICER: ['dashboard', 'applications', 'approvals', 'clients', 'loans', 'payments', 'repayments', 'transactions', 'due-loans', 'reports', 'settings'],
    AGENT: ['dashboard', 'clients', 'due-loans', 'transactions', 'payments', 'settings'],
    CREDIT_ANALYST: ['dashboard', 'audit-logs', 'repayment-audit', 'transactions-audit', 'anomalies', 'reports', 'user-activity', 'cases', 'settings'],
    MANAGER: ['dashboard', 'manager-decision', 'manager-portfolio', 'manager-risk', 'reports', 'audit-logs', 'automation-center', 'settings', 'repayments'],
    ADMIN: ['dashboard', 'users', 'clients', 'loan-products', 'loans', 'transactions', 'reports', 'audit-logs', 'automation-center', 'applications', 'approvals', 'repayments', 'transactions-audit', 'anomalies', 'user-activity', 'cases', 'payments', 'due-loans', 'settings', 'repayment-audit'],
  };

  return allowedViewsByRole[role]?.includes(view) ?? false;
};

const LOCAL_USERS_KEY = 'fastkwacha_local_users';
const LOCAL_CLIENTS_KEY = 'fastkwacha_local_clients';
const LOCAL_APPLICATIONS_KEY = 'fastkwacha_local_apps';
const LOCAL_LOANS_KEY = 'fastkwacha_local_loans';
const LOCAL_TRANSACTIONS_KEY = 'fastkwacha_local_transactions';
const LOCAL_WORKFLOW_HISTORY_KEY = 'fastkwacha_local_workflow';
const LOCAL_REPAYMENT_SCHEDULE_KEY = 'fastkwacha_local_schedule';
const LOCAL_LOAN_PRODUCTS_KEY = 'fastkwacha_local_products';
const LOCAL_DATA_UPDATED_EVENT = 'fastkwacha-local-data-updated';

const getLocalUsers = (): AuthProfile[] => {
  try {
    const data = localStorage.getItem(LOCAL_USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const getLocalUserByEmail = (emailAddress: string): AuthProfile | null => {
  const normalizedEmail = normalizeEmail(emailAddress);
  const localUser = getLocalUsers().find((user) => normalizeEmail(user.email) === normalizedEmail);
  return localUser ? (normalizeAuthProfile(localUser) as AuthProfile) : null;
};

const hashLocalPassword = async (password: string) => {
  if (!password) return '';
  if (typeof window === 'undefined' || !window.crypto?.subtle) return password;

  const encoded = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

const verifyStoredPassword = async (storedHash: string | undefined, password: string) => {
  if (!storedHash) return false;
  return storedHash === await hashLocalPassword(password);
};

const saveLocalUser = (user: AuthProfile) => {
  const users = getLocalUsers();
  const existingIndex = users.findIndex(u => u.id === user.id || u.email === user.email);
  if (existingIndex >= 0) {
    users[existingIndex] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
};

const getLocalClients = (): any[] => {
  try {
    const data = localStorage.getItem(LOCAL_CLIENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveLocalClient = (client: any) => {
  const clients = getLocalClients();
  const existingIndex = clients.findIndex(c => c.id === client.id);
  if (existingIndex >= 0) {
    clients[existingIndex] = client;
  } else {
    clients.push(client);
  }
  localStorage.setItem(LOCAL_CLIENTS_KEY, JSON.stringify(clients));
};

const getLocalApplications = (): any[] => {
  try {
    const data = localStorage.getItem(LOCAL_APPLICATIONS_KEY);
    const apps = data ? JSON.parse(data) : [];
    console.log('[DEBUG] getLocalApplications read:', apps.length, 'apps');
    
    // Inject demo app for testing if empty
    if (apps.length === 0) {
      const demoApp = {
        id: 'demo-app-1',
        clientId: 'demo-client-1',
        clientName: 'Jennifer Smith',
        amount: 250000,
        requestedAmount: 250000,
        status: 'IN_REVIEW',
        current_stage: 'ANALYSIS',
        createdAt: new Date().toISOString(),
        monthlyIncome: 650000,
        employmentStatus: 'EMPLOYED',
        clientSnapshot: {
          name: 'Jennifer Smith',
          nationalId: 'ID-JS-9000',
          phone: '+265 999 123 456',
          residence: 'Lilongwe, Sector 4'
        },
        crb: { score: 450, riskLevel: 'MEDIUM', lastChecked: new Date().toISOString() }
      };
      console.log('[DEBUG] Injecting demo app Jennifer Smith');
      return [demoApp];
    }
    return apps;
  } catch (e) { 
    console.error('[DEBUG] getLocalApplications error:', e);
    return []; 
  }
};

const getLocalLoans = (): any[] => {
  try {
    const data = localStorage.getItem(LOCAL_LOANS_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const getLocalTransactions = (): any[] => {
  try {
    const data = localStorage.getItem(LOCAL_TRANSACTIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const getLocalWorkflowHistory = (): any[] => {
  try {
    const data = localStorage.getItem(LOCAL_WORKFLOW_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const getLocalRepaymentSchedules = (): any[] => {
  try {
    const data = localStorage.getItem(LOCAL_REPAYMENT_SCHEDULE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const getLocalLoanProducts = (): LoanProduct[] => {
  try {
    const data = localStorage.getItem(LOCAL_LOAN_PRODUCTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const mergeFirestoreWithLocal = <T extends { id?: string }>(firestoreItems: T[], localItems: T[]) => {
  const firestoreIds = new Set(firestoreItems.map(item => item.id).filter(Boolean));
  const localOnly = localItems.filter(item => !item.id || !firestoreIds.has(item.id));
  return [...firestoreItems, ...localOnly];
};

const syncItemsWithLocal = <T extends { id?: string }>(currentItems: T[], localItems: T[]) => {
  const localIds = new Set(localItems.map(item => item.id).filter(Boolean));
  const preserved = currentItems.filter(item => !item.id || !localIds.has(item.id));
  return [...preserved, ...localItems];
};

const announceLocalDataUpdate = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOCAL_DATA_UPDATED_EVENT));
};

const saveLocalApplication = (app: any) => {
  const apps = getLocalApplications();
  const existingIndex = apps.findIndex(a => a.id === app.id);
  if (existingIndex >= 0) {
    apps[existingIndex] = app;
  } else {
    apps.push(app);
  }
  localStorage.setItem(LOCAL_APPLICATIONS_KEY, JSON.stringify(apps));
  announceLocalDataUpdate();
};

const saveLocalLoan = (loan: any) => {
  const loans = getLocalLoans();
  const existingIndex = loans.findIndex(l => l.id === loan.id);
  if (existingIndex >= 0) {
    loans[existingIndex] = loan;
  } else {
    loans.push(loan);
  }
  localStorage.setItem(LOCAL_LOANS_KEY, JSON.stringify(loans));
  announceLocalDataUpdate();
};

const saveLocalTransactionRecord = (transaction: any) => {
  const transactions = getLocalTransactions();
  const existingIndex = transactions.findIndex(t => t.id === transaction.id);
  if (existingIndex >= 0) {
    transactions[existingIndex] = transaction;
  } else {
    transactions.unshift(transaction);
  }
  localStorage.setItem(LOCAL_TRANSACTIONS_KEY, JSON.stringify(transactions));
  announceLocalDataUpdate();
};

const LOCAL_RECEIPTS_KEY = 'fastkwacha-local-receipts';
const saveLocalReceiptRecord = (receipt: any) => {
  const existing = JSON.parse(localStorage.getItem(LOCAL_RECEIPTS_KEY) || '[]');
  const updated = [receipt, ...existing.filter((r: any) => r.id !== receipt.id)];
  localStorage.setItem(LOCAL_RECEIPTS_KEY, JSON.stringify(updated));
};

const saveLocalRepaymentSchedules = (schedules: any[]) => {
  localStorage.setItem(LOCAL_REPAYMENT_SCHEDULE_KEY, JSON.stringify(schedules));
  announceLocalDataUpdate();
};

const removeLocalUser = (userId: string) => {
  const users = getLocalUsers().filter(u => u.id !== userId);
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
};
const LOCAL_SESSION_STORAGE_KEY = 'fastkwacha-local-session';

const readStoredLocalSessionProfile = (): AuthProfile | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthProfile;
  } catch (error) {
    console.error('Failed to read local session profile', error);
    return null;
  }
};

const writeStoredLocalSessionProfile = (profile: AuthProfile | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!profile) {
      window.localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('Failed to persist local session profile', error);
  }
};

const normalizeAuthProfile = (profile: Partial<AuthProfile> & { id: string; uid?: string; email: string; name?: string }) => ({
  ...profile,
  id: profile.id,
  uid: profile.uid || profile.id,
  email: normalizeEmail(profile.email),
  name: profile.name || 'FastKwacha User',
  role: normalizeUserRole(profile.role),
  status: normalizeUserStatus(profile.status),
  kycComplete: Boolean(profile.kycComplete),
  kycStatus: profile.kycStatus || (profile.kycComplete ? 'COMPLETE' : 'INCOMPLETE'),
} as AuthProfile);

const getActiveSessionEmail = (profile?: AuthProfile | null) =>
  normalizeEmail(profile?.email || auth.currentUser?.email || readStoredLocalSessionProfile()?.email || '');

const isLocalApplicationId = (applicationId?: string) => {
  if (!applicationId) return false;
  return applicationId.startsWith('local-app-')
    || applicationId.startsWith('demo-')
    || getLocalApplications().some((application) => application.id === applicationId);
};

function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (nextValue: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
        checked ? 'border-brand-600 bg-brand-600' : 'border-slate-200 bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const downloadCSV = (data: any[], filename: string) => {
  if (data.length === 0) {
    toast.error("No data available to export.");
    return;
  }
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(fieldName => {
        const value = row[fieldName];
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ];
  
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  
  return `${browser} on ${navigator.platform}`;
};

const hashStringToInt = (str: string, range: number = 550, offset: number = 300) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % range) + offset;
};

export const calculateSLA = (application: any) => {
  const createdAt = application.createdAt?.toDate ? application.createdAt.toDate() : new Date(application.createdAt || Date.now());
  const now = new Date();
  const hoursElapsed = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
  
  if (hoursElapsed > 24) return { status: 'VIOLATED', color: 'text-red-600', bg: 'bg-red-50', text: 'SLA BREACHED', hours: hoursElapsed };
  if (hoursElapsed > 18) return { status: 'WARNING', color: 'text-amber-600', bg: 'bg-amber-50', text: 'SLA RISK', hours: hoursElapsed };
  return { status: 'ON TRACK', color: 'text-emerald-600', bg: 'bg-emerald-50', text: 'ON TRACK', hours: hoursElapsed };
};

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPath, setCurrentPath] = useState<AppPath>(() => normalizeAppPath(typeof window === 'undefined' ? '/login' : window.location.pathname));
  const [role, setRole] = useState<UserRole>('CLIENT');
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [localSessionProfile, setLocalSessionProfile] = useState<AuthProfile | null>(() => readStoredLocalSessionProfile());
  const [loading, setLoading] = useState(true);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [isPaychanguModalOpen, setIsPaychanguModalOpen] = useState(false);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState<any | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [repaymentSchedules, setRepaymentSchedules] = useState<any[]>([]);
  const [workflowHistory, setWorkflowHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    interest_rate_default: 15,
    max_loan_duration: 12,
    penalty_rate: 5,
    penalty_grace_days: 3,
    currency: 'MWK',
    company_name: 'FastKwacha Ltd'
  });
  const [users, setUsers] = useState<any[]>([]);
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [pendingEmailPrompt, setPendingEmailPrompt] = useState<string | null>(null);
  const [loginAttempts, setLoginAttempts] = useState({ count: 0, lockedUntil: 0 });
  const [managerNote, setManagerNote] = useState('');
  const [clientSettings, setClientSettings] = useState({
    notifications: true,
    marketing: true,
    twoFactor: false,
    displayMode: 'system' as 'light' | 'dark' | 'system'
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registrationData, setRegistrationData] = useState({
    fullName: '',
    email: '',
    phone: '',
    nationalId: '',
    address: '',
    password: '',
    confirmPassword: '',
    guarantorReference: '',
  });
  const [registrationFiles, setRegistrationFiles] = useState<{ profilePhoto: File | null }>({ profilePhoto: null });
  const [isRegistering, setIsRegistering] = useState(false);
  const registrationHydrationRef = React.useRef<string | null>(null);
  const registrationDraftRef = React.useRef(registrationData);
  const localSessionProfileRef = React.useRef<AuthProfile | null>(localSessionProfile);
  const isLoggingOutRef = React.useRef(false);
  const welcomedUserRef = React.useRef<string | null>(null);
  const [showRegistrationSuccessPanel, setShowRegistrationSuccessPanel] = useState(false);
  const sessionProfile = authProfile || localSessionProfile;
  const isPendingStaff = sessionProfile?.role === 'OFFICER' && sessionProfile.status === 'PENDING';

  const predefinedRoleAccounts = DEFAULT_ROLE_ACCOUNTS;

  const syncLocalPasswordRecord = React.useCallback(async (profile: AuthProfile, nextPassword: string) => {
    const normalizedEmail = normalizeEmail(profile.email);
    const existingLocalProfile = getLocalUserByEmail(normalizedEmail);
    const defaultAccount = predefinedRoleAccounts[normalizedEmail];
    const passwordHash = await hashLocalPassword(nextPassword);
    const localProfile = normalizeAuthProfile({
      ...(existingLocalProfile || {}),
      ...profile,
      id: existingLocalProfile?.id || profile.id || `local-${profile.role || defaultAccount?.role || 'CLIENT'}`,
      uid: existingLocalProfile?.uid || profile.uid || profile.id || `local-${profile.role || defaultAccount?.role || 'CLIENT'}`,
      name: profile.name || existingLocalProfile?.name || defaultAccount?.name || 'FastKwacha User',
      email: normalizedEmail,
      role: profile.role || existingLocalProfile?.role || defaultAccount?.role || 'CLIENT',
      status: profile.status || existingLocalProfile?.status || 'ACTIVE',
    });

    saveLocalUser({ ...localProfile, passwordHash } as AuthProfile);
  }, [predefinedRoleAccounts]);

  const authenticateOfflineProfile = React.useCallback(async (normalizedEmail: string, rawPassword: string) => {
    const localUser = getLocalUserByEmail(normalizedEmail);
    if (localUser?.passwordHash && await verifyStoredPassword(localUser.passwordHash, rawPassword)) {
      return localUser;
    }

    const defaultAccount = predefinedRoleAccounts[normalizedEmail];
    if (defaultAccount && defaultAccount.password === rawPassword) {
      return normalizeAuthProfile({
        ...(localUser || {}),
        id: localUser?.id || `local-${defaultAccount.role}`,
        uid: localUser?.uid || `local-${defaultAccount.role}`,
        email: normalizedEmail,
        name: localUser?.name || defaultAccount.name,
        role: defaultAccount.role,
        status: localUser?.status || 'ACTIVE',
        kycComplete: localUser?.kycComplete ?? true,
        kycStatus: localUser?.kycStatus || 'COMPLETE',
      });
    }

    return null;
  }, [predefinedRoleAccounts]);

  const fetchUserProfileByEmail = async (emailAddress: string) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', normalizeEmail(emailAddress)), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const profileDoc = snapshot.docs[0];
        const data = profileDoc.data() as any;
        return normalizeAuthProfile({ id: profileDoc.id, ...data });
      }
    } catch (error: any) {
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        console.warn('fetchUserProfileByEmail blocked by permissions. Checking local storage.');
      } else {
        throw error;
      }
    }
    
    // Fallback: Check local storage
    const locals = getLocalUsers();
    const localUser = locals.find(u => normalizeEmail(u.email) === normalizeEmail(emailAddress));
    return localUser ? normalizeAuthProfile(localUser) : null;
  };

  const fetchUserProfileByPhone = async (phoneNumber: string) => {
    try {
      const q = query(collection(db, 'users'), where('phone', '==', phoneNumber.trim()), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const profileDoc = snapshot.docs[0];
        const data = profileDoc.data() as any;
        return normalizeAuthProfile({ id: profileDoc.id, ...data });
      }
    } catch (error) {
       console.warn('fetchUserProfileByPhone blocked by permissions. Checking local storage.');
    }
    const locals = getLocalUsers();
    const localUser = locals.find(u => u.phone === phoneNumber.trim());
    return localUser ? normalizeAuthProfile(localUser) : null;
  };

  useEffect(() => {
    writeStoredLocalSessionProfile(localSessionProfile);
  }, [localSessionProfile]);

  useEffect(() => {
    localSessionProfileRef.current = localSessionProfile;
  }, [localSessionProfile]);

  useEffect(() => {
    registrationDraftRef.current = registrationData;
  }, [registrationData]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizeAppPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const resetSessionState = React.useCallback(() => {
    setUser(null);
    setAuthProfile(null);
    setLocalSessionProfile(null);
    setIsAuthenticated(false);
    setRole('CLIENT');
    setCurrentView('dashboard');
    setCurrentPath('/login');
    welcomedUserRef.current = null;
  }, []);

  const navigateTo = React.useCallback((path: AppPath, options?: { replace?: boolean }) => {
    const nextPath = normalizeAppPath(path);
    if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
      const method = options?.replace ? 'replaceState' : 'pushState';
      window.history[method](null, '', nextPath);
    }
    setCurrentPath(nextPath);
  }, []);

  const activateSession = React.useCallback((profile: AuthProfile, authenticatedUser?: FirebaseUser | null, source: 'manual' | 'restore' = 'manual') => {
    setUser(authenticatedUser || null);
    if (authenticatedUser) {
      setAuthProfile(profile);
      setLocalSessionProfile(null);
    } else {
      setAuthProfile(null);
      setLocalSessionProfile(profile);
    }
    setRole(profile.role);
    setCurrentView(getDefaultViewForRole(profile));
    navigateTo(getPathForRole(profile.role), { replace: true });
    setIsAuthenticated(true);

    const sessionKey = authenticatedUser?.uid || profile.uid || profile.id;
    if (source === 'manual' && welcomedUserRef.current !== sessionKey) {
      toast.success(`Welcome back, ${profile.name || authenticatedUser?.displayName || 'User'} (${profile.role})`);
      welcomedUserRef.current = sessionKey;
    }
  }, [navigateTo]);

  const resolveAuthProfile = React.useCallback(async (authenticatedUser: FirebaseUser): Promise<AuthProfile | null> => {
    const signedInWithGoogle = authenticatedUser.providerData.some(provider => provider.providerId === 'google.com');
    let profileSnap = await getDoc(doc(db, 'users', authenticatedUser.uid));
    let profile: AuthProfile | null = null;

    if (profileSnap.exists()) {
      const data = profileSnap.data() as any;
      profile = normalizeAuthProfile({ id: profileSnap.id, ...data });
    } else if (authenticatedUser.email) {
      profile = await fetchUserProfileByEmail(authenticatedUser.email);
      if (profile && profile.id !== authenticatedUser.uid) {
        await setDoc(doc(db, 'users', authenticatedUser.uid), {
          ...profile,
          uid: authenticatedUser.uid,
          email: normalizeEmail(profile.email),
          migratedFromId: profile.id,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        profile = normalizeAuthProfile({ ...profile, id: authenticatedUser.uid, uid: authenticatedUser.uid });
      }
    }

    if (!profile && authenticatedUser.email && signedInWithGoogle) {
      const generatedProfile = normalizeAuthProfile({
        id: authenticatedUser.uid,
        uid: authenticatedUser.uid,
        email: authenticatedUser.email,
        name: authenticatedUser.displayName || authenticatedUser.email.split('@')[0],
        role: 'CLIENT',
        status: 'ACTIVE',
        kycComplete: false,
        kycStatus: 'INCOMPLETE',
        photoURL: authenticatedUser.photoURL || undefined,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
      registrationHydrationRef.current = authenticatedUser.uid;
      await setDoc(doc(db, 'users', authenticatedUser.uid), {
        ...generatedProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      }, { merge: true });
      profile = generatedProfile;
    }

    if (!profile && authenticatedUser.email && registrationHydrationRef.current === authenticatedUser.uid) {
      const registrationDraft = registrationDraftRef.current;
      const generatedProfile = normalizeAuthProfile({
        id: authenticatedUser.uid,
        uid: authenticatedUser.uid,
        email: authenticatedUser.email,
        name: registrationDraft.fullName.trim() || authenticatedUser.displayName || authenticatedUser.email.split('@')[0],
        phone: registrationDraft.phone.trim() || undefined,
        nationalId: registrationDraft.nationalId.trim() || undefined,
        address: registrationDraft.address.trim() || undefined,
        role: 'CLIENT',
        status: 'ACTIVE',
        kycComplete: false,
        kycStatus: 'INCOMPLETE',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
      await setDoc(doc(db, 'users', authenticatedUser.uid), {
        ...generatedProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      }, { merge: true });
      profile = generatedProfile;
    }

    if (signedInWithGoogle && profile?.role !== 'CLIENT') {
      throw new Error('Google sign-in is available for client accounts only.');
    }

    return profile;
  }, [fetchUserProfileByEmail]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
      if (authenticatedUser) {
        if (!isAuthenticated) {
          setLoading(false);
          return;
        }

        try {
          const profile = await resolveAuthProfile(authenticatedUser);

          if (!profile) {
            await signOut(auth);
            resetSessionState();
            if (!isLoggingOutRef.current) {
              toast.error('No access profile was found for this account.');
            }
          } else {
            isLoggingOutRef.current = false;
            activateSession(profile, authenticatedUser, 'restore');
            registrationHydrationRef.current = null;
            testConnection();
          }
        } catch (error) {
          console.error('Failed to load user profile', error);
          resetSessionState();
          if (auth.currentUser) {
            try {
              await signOut(auth);
            } catch (signOutError) {
              console.error('Failed to sign out after auth profile error', signOutError);
            }
          }
          if (!isLoggingOutRef.current) {
            toast.error('Unable to load your access profile.');
          }
        }
      } else {
        if (!localSessionProfileRef.current) {
          setAuthProfile(null);
        }
        setUser(null);
        setRole(localSessionProfileRef.current?.role || 'CLIENT');
        if (!localSessionProfileRef.current) {
          setCurrentView('dashboard');
          welcomedUserRef.current = null;
        }
        isLoggingOutRef.current = false;
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [activateSession, isAuthenticated, resetSessionState, resolveAuthProfile]);

  useEffect(() => {
    if (!isAuthenticated || !sessionProfile) return;

    const expectedView = getDefaultViewForRole(sessionProfile);
    const shouldRedirectForKyc = sessionProfile.role === 'CLIENT' && !sessionProfile.kycComplete && currentView === 'dashboard';

    if (!isViewAllowedForRole(role, currentView) || shouldRedirectForKyc) {
      setCurrentView(expectedView);
    }
  }, [isAuthenticated, sessionProfile?.id, sessionProfile?.role, sessionProfile?.kycComplete, currentView, role]);

  useEffect(() => {
    if (!isAuthenticated && currentPath !== '/login') {
      navigateTo('/login', { replace: true });
    }
  }, [currentPath, isAuthenticated, navigateTo]);

  useEffect(() => {
    if (isAuthenticated && sessionProfile && currentPath === '/login') {
      navigateTo(getPathForRole(sessionProfile.role), { replace: true });
    }
  }, [currentPath, isAuthenticated, navigateTo, sessionProfile]);

  // Unified Data Synchronization
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!user && !localSessionProfile) return;

    setUsers(prev => syncItemsWithLocal(prev, getLocalUsers()));
    setClients(prev => syncItemsWithLocal(prev, getLocalClients()));
    setApplications(prev => syncItemsWithLocal(prev, getLocalApplications()));
    setLoans(prev => syncItemsWithLocal(prev, getLocalLoans()));
    setTransactions(prev => syncItemsWithLocal(prev, getLocalTransactions()));
    setRepaymentSchedules(prev => syncItemsWithLocal(prev, getLocalRepaymentSchedules()));
    setLoanProducts(prev => syncItemsWithLocal(prev, getLocalLoanProducts()));
    setWorkflowHistory(prev => syncItemsWithLocal(prev, getLocalWorkflowHistory()));

    // Clients Listener
    const qClients = query(collection(db, 'clients'), orderBy('createdAt', 'desc'), limit(50));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      const firestoreClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(prev => {
        const localClients = getLocalClients();
        const firestoreIds = new Set(firestoreClients.map(c => c.id));
        const activeLocal = localClients.filter(lc => !firestoreIds.has(lc.id));
        return [...firestoreClients, ...activeLocal];
      });
    }, (error) => {
      console.warn("Firestore clients query blocked.", error);
      handleFirestoreError(error, OperationType.GET, 'clients');
      setClients(getLocalClients());
    });

    // Loans Listener with fallbacks
    const qLoans = query(collection(db, 'loans'), orderBy('disbursedAt', 'desc'), limit(50));
    const unsubLoans = onSnapshot(qLoans, (snapshot) => {
      const firestoreLoans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLoans(mergeFirestoreWithLocal(firestoreLoans, getLocalLoans()));
    }, (error) => {
      console.warn("Loans query blocked. Using local.");
      setLoans(getLocalLoans());
    });

    // Applications Listener
    const qApps = query(collection(db, 'applications'), orderBy('createdAt', 'desc'), limit(50));
    const unsubApps = onSnapshot(qApps, (snapshot) => {
      const firestoreApps = snapshot.docs.map(doc => normalizeApplicationRecord({ id: doc.id, ...doc.data() }));
      console.log('[DEBUG] Firestore apps received:', firestoreApps.length);
      setApplications(prev => {
        const localApps = getLocalApplications();
        const firestoreIds = new Set(firestoreApps.map(a => a.id));
        const activeLocal = localApps.filter(la => !firestoreIds.has(la.id)).map(normalizeApplicationRecord);
        const combined = [...firestoreApps, ...activeLocal];
        console.log('[DEBUG] Combined apps count:', combined.length);
        return combined;
      });
    }, (error) => {
      console.warn("Firestore apps query blocked. Using local.", error);
      const locals = getLocalApplications().map(normalizeApplicationRecord);
      console.log('[DEBUG] Error fallback apps count:', locals.length);
      setApplications(locals);
    });

    // Transactions Listener fallback
    const qTrans = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const firestoreTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(mergeFirestoreWithLocal(firestoreTransactions, getLocalTransactions()));
    }, (error) => {
      console.warn("Transactions query blocked. Using local.");
      setTransactions(getLocalTransactions());
    });

    const unsubProducts = onSnapshot(query(collection(db, 'loan_products'), limit(50)), (snapshot) => {
      const firestoreProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoanProduct));
      setLoanProducts(mergeFirestoreWithLocal(firestoreProducts, getLocalLoanProducts()));
    }, (error) => {
      console.warn("Loan products query blocked. Using local.");
      setLoanProducts(getLocalLoanProducts());
      handleFirestoreError(error, OperationType.GET, 'loan_products');
    });

    // Phase 5: Repayment Schedule Listener with limit
    const qSchedule = query(collection(db, 'repayment_schedule'), limit(100));
    const unsubSchedule = onSnapshot(qSchedule, (snapshot) => {
      const firestoreSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRepaymentSchedules(mergeFirestoreWithLocal(firestoreSchedules, getLocalRepaymentSchedules()));
    }, (error) => {
      console.warn("Schedules query blocked. Using local.");
      setRepaymentSchedules(getLocalRepaymentSchedules());
    });

    // Phase 4: Workflow History Listener
    const qWorkflow = query(collection(db, 'workflow_history'), orderBy('timestamp', 'desc'), limit(100));
    const unsubWorkflow = onSnapshot(qWorkflow, (snapshot) => {
      const firestoreHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWorkflowHistory(firestoreHistory); // Simplification: assume firestore is primary if available
    }, (error) => {
      console.warn("Workflow query blocked. Using local.");
      setWorkflowHistory(getLocalWorkflowHistory());
    });

    // Users Listener
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const firestoreUsers = snapshot.docs.map(doc => ({ 
        id: doc.id, ...doc.data() as any, 
        status: normalizeUserStatus((doc.data() as any).status) 
      }));
      setUsers(prev => {
        const localUsers = getLocalUsers();
        const firestoreIds = new Set(firestoreUsers.map(u => u.id));
        const activeLocal = localUsers.filter(lu => !firestoreIds.has(lu.id));
        return [...firestoreUsers, ...activeLocal];
      });
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));

    // System Settings Listener
    const unsubSettings = onSnapshot(doc(db, 'system_settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSystemSettings(docSnap.data() as SystemSettings);
      } else {
        setDoc(doc(db, 'system_settings', 'global'), {
          interest_rate_default: 15, max_loan_duration: 12, penalty_rate: 5,
          currency: 'MWK', company_name: 'FastKwacha Ltd'
        }).catch(console.error);
      }
    });

    const qNotifications = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    const unsubNotifications = onSnapshot(qNotifications, (snapshot) => {
      setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as NotificationRecord)));
    }, (error) => console.warn('[Phase5] notifications listener error:', error));

    const unsubReceipts = onSnapshot(query(collection(db, 'receipts'), orderBy('date', 'desc'), limit(50)), (snapshot) => {
      setReceipts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptRecord)));
    }, (error) => console.warn('Receipts listener error:', error));

    const handleLocalDataUpdated = () => {
      setUsers(prev => syncItemsWithLocal(prev, getLocalUsers()));
      setClients(prev => syncItemsWithLocal(prev, getLocalClients()));
      setApplications(prev => syncItemsWithLocal(prev, getLocalApplications()));
      setLoans(prev => syncItemsWithLocal(prev, getLocalLoans()));
      setTransactions(prev => syncItemsWithLocal(prev, getLocalTransactions()));
      setRepaymentSchedules(prev => syncItemsWithLocal(prev, getLocalRepaymentSchedules()));
      setLoanProducts(prev => syncItemsWithLocal(prev, getLocalLoanProducts()));
      setWorkflowHistory(prev => syncItemsWithLocal(prev, getLocalWorkflowHistory()));
    };

    window.addEventListener(LOCAL_DATA_UPDATED_EVENT, handleLocalDataUpdated);

    return () => {
      window.removeEventListener(LOCAL_DATA_UPDATED_EVENT, handleLocalDataUpdated);
      unsubClients(); unsubLoans(); unsubApps(); unsubTrans(); unsubProducts(); unsubSchedule(); unsubWorkflow(); unsubUsers(); unsubSettings(); unsubNotifications(); unsubReceipts();
    };
  }, [isAuthenticated, user, localSessionProfile]);

  // Phase 5: Daily automation on login (runs once per 24h)
  useEffect(() => {
    if (!isAuthenticated || !sessionProfile) return;
    if (loans.length === 0) return;
    runDailyAutomation(loans, loanProducts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionProfile?.id, loans.length]);

  // Profile Specific Listener
  useEffect(() => {
    if (!isAuthenticated) return;
    const profileId = authProfile?.id || localSessionProfile?.id;
    if (!profileId) return;

    const unsubProfile = onSnapshot(doc(db, 'users', profileId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        const updatedProfile = normalizeAuthProfile({ id: docSnap.id, ...data });
        if (authProfile) setAuthProfile(updatedProfile);
        else if (localSessionProfile) {
          if (updatedProfile.status !== localSessionProfile.status || updatedProfile.role !== localSessionProfile.role) {
            setLocalSessionProfile(updatedProfile);
          }
        }
      }
    });
    return () => unsubProfile();
  }, [isAuthenticated, authProfile?.id, localSessionProfile?.id]);

  // Auto-Logout & Session Sync
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!user && !localSessionProfile) return;

    const syncInterval = setInterval(() => {
      if (localSessionProfile) {
        const locals = getLocalUsers();
        const currentLocal = locals.find(u => u.id === localSessionProfile.id);
        if (currentLocal && currentLocal.status !== localSessionProfile.status) {
          setLocalSessionProfile(currentLocal);
        }
      }
    }, 2000);

    let logoutTimer: any;
    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        handleLogout();
        toast.info("Logged out due to inactivity for security.");
      }, 15 * 60 * 1000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    resetTimer();

    return () => {
      clearInterval(syncInterval);
      if (logoutTimer) clearTimeout(logoutTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
    };
  }, [isAuthenticated, user, localSessionProfile]);

  const runWorkflowMigration = async () => {
    toast.loading("Starting workflow migration...");
    let migratedCount = 0;
    try {
      // 1. Migrate Firestore Applications
      const snapshot = await getDocs(collection(db, 'applications'));
      for (const applicationDoc of snapshot.docs) {
        const data = applicationDoc.data();
        const stage = normalizeApplicationStage(data.current_stage, data.status);
        if (data.current_stage !== stage || data.status !== stage) {
          await updateDoc(doc(db, 'applications', applicationDoc.id), {
            current_stage: stage,
            status: stage === 'DISBURSED' ? 'APPROVED' : stage,
            updatedAt: serverTimestamp()
          });
          migratedCount++;
        }
      }

      // 2. Migrate Local Applications
      const localApps = getLocalApplications();
      let localMigrated = false;
      const updatedLocalApps = localApps.map(app => {
        const stage = normalizeApplicationStage(app.current_stage, app.status);
        if (app.current_stage !== stage || app.status !== stage) {
          localMigrated = true;
          migratedCount++;
          return { ...app, current_stage: stage, status: stage === 'DISBURSED' ? 'APPROVED' : stage, updatedAt: new Date().toISOString() };
        }
        return app;
      });

      if (localMigrated) {
        localStorage.setItem(LOCAL_APPLICATIONS_KEY, JSON.stringify(updatedLocalApps));
        setApplications(updatedLocalApps);
      }

      toast.dismiss();
      toast.success(`Migration complete! ${migratedCount} applications updated.`);
    } catch (error) {
      toast.dismiss();
      console.error('Migration failed', error);
      toast.error("Migration failed. Check console for details.");
    }
  };

  const recordWorkflowHistory = async (loanId: string, fromStage: LoanStage | 'NONE', toStage: LoanStage, comment: string = '') => {
    const historyEntry = {
      loan_id: loanId,
      from_stage: fromStage,
      to_stage: toStage,
      performed_by: sessionProfile?.id || auth.currentUser?.uid || 'system',
      performed_by_email: sessionProfile?.email || auth.currentUser?.email || 'system',
      role: role,
      timestamp: serverTimestamp(),
      comment: comment
    };

    try {
      if (loanId.startsWith('local-') || loanId.startsWith('demo-')) {
        const history = JSON.parse(localStorage.getItem('fastkwacha_workflow_history') || '[]');
        history.push({ ...historyEntry, id: `local-hist-${Date.now()}`, timestamp: new Date().toISOString() });
        localStorage.setItem('fastkwacha_workflow_history', JSON.stringify(history));
        announceLocalDataUpdate();
      } else {
        await addDoc(collection(db, 'workflow_history'), historyEntry);
      }
    } catch (error) {
      console.warn("Workflow history record blocked. Saving locally.", error);
      const history = JSON.parse(localStorage.getItem('fastkwacha_workflow_history') || '[]');
      history.push({ ...historyEntry, id: `local-hist-${Date.now()}`, timestamp: new Date().toISOString() });
      localStorage.setItem('fastkwacha_workflow_history', JSON.stringify(history));
      announceLocalDataUpdate();
    }
  };



  const handleStageTransition = async (application: any, toStage: LoanStage, comment: string = '', analysisData?: any) => {
    const fromStage = normalizeApplicationStage(application.current_stage, application.status);
    const normalizedTarget = normalizeApplicationStage(toStage);

    const transitionMap: Record<string, LoanStage[]> = {
      PENDING: ['REVIEWED', 'REFERRED_BACK'],
      REVIEWED: ['ANALYZED', 'REFERRED_BACK'],
      ANALYZED: ['APPROVED', 'REJECTED', 'REFERRED_BACK'],
      APPROVED: ['DISBURSED'],
      REFERRED_BACK: ['PENDING'],
      REJECTED: [],
      DISBURSED: []
    };

    const actorMap: Record<string, UserRole[]> = {
      'PENDING:REVIEWED': ['OFFICER', 'ADMIN'],
      'PENDING:REFERRED_BACK': ['OFFICER', 'ADMIN'],
      'REVIEWED:ANALYZED': ['CREDIT_ANALYST', 'ADMIN'],
      'REVIEWED:REFERRED_BACK': ['CREDIT_ANALYST', 'ADMIN'],
      'ANALYZED:APPROVED': ['MANAGER', 'ADMIN'],
      'ANALYZED:REJECTED': ['MANAGER', 'ADMIN'],
      'ANALYZED:REFERRED_BACK': ['MANAGER', 'ADMIN'],
      'APPROVED:DISBURSED': ['OFFICER', 'ADMIN'],
      'REFERRED_BACK:PENDING': ['CLIENT', 'OFFICER', 'ADMIN'],
    };

    if (!transitionMap[fromStage]?.includes(normalizedTarget)) {
      toast.error(`Invalid transition from ${fromStage} to ${toStage}`);
      return false;
    }

    const actorKey = `${fromStage}:${normalizedTarget}`;
    if (!actorMap[actorKey]?.includes(role)) {
      toast.error(`Your role (${role}) is not authorized to move a loan to ${normalizedTarget}`);
      return false;
    }

    if (!comment.trim()) {
      toast.error('A decision comment is required for every workflow action.');
      return false;
    }

    if ((normalizedTarget === 'ANALYZED' || normalizedTarget === 'REFERRED_BACK' || normalizedTarget === 'APPROVED' || normalizedTarget === 'REJECTED') && (!analysisData?.reasons || analysisData.reasons.length === 0)) {
      toast.error('At least one structured reason is required for this decision.');
      return false;
    }

    if (normalizedTarget === 'ANALYZED' && !application.crb) {
      toast.error("Mandatory Requirement: Fetch CRB data before proceeding to analyst completion.");
      return false;
    }

    const workflowEntry = {
      stage: normalizedTarget,
      role,
      comment: comment.trim(),
      reasons: analysisData?.reasons || [],
      decision: analysisData?.decision || normalizedTarget,
      actorId: sessionProfile?.id || user?.uid || 'system',
      actorName: sessionProfile?.name || user?.displayName || 'System User',
      createdAt: new Date().toISOString(),
    };

    try {
      const updateData: any = {
        current_stage: normalizedTarget,
        status: normalizedTarget === 'DISBURSED' ? 'APPROVED' : normalizedTarget,
        latestDecision: workflowEntry,
        decisionTrail: [...(application.decisionTrail || []), workflowEntry],
        updatedAt: serverTimestamp()
      };

      if (analysisData) {
        updateData.analysis = normalizedTarget === 'ANALYZED' ? {
          ...analysisData,
          analystId: sessionProfile?.id || user?.uid || 'system',
          analystName: sessionProfile?.name || user?.displayName || 'System Analyst',
          createdAt: new Date().toISOString()
        } : {
          ...(application.analysis || {}),
          ...analysisData,
        };
      }

      if (normalizedTarget === 'APPROVED' || normalizedTarget === 'REJECTED' || normalizedTarget === 'REFERRED_BACK') {
        updateData.finalDecision = workflowEntry;
      }

      if (isLocalApplicationId(application.id)) {
        const apps = getLocalApplications();
        const index = apps.findIndex(a => a.id === application.id);
        if (index >= 0) {
          apps[index] = normalizeApplicationRecord({ ...apps[index], ...updateData, updatedAt: new Date().toISOString() });
          localStorage.setItem(LOCAL_APPLICATIONS_KEY, JSON.stringify(apps));
          setApplications([...apps]);
        }
      } else {
        await updateDoc(doc(db, 'applications', application.id), updateData);
      }

      await recordWorkflowHistory(application.id, fromStage as LoanStage, normalizedTarget, comment);
      // Phase 5: Stage change notification
      await createNotification(
        'STAGE_CHANGE',
        `Application Stage: ${normalizedTarget.replace(/_/g, ' ')}`,
        `Application for ${application.clientSnapshot?.name || 'Unknown Client'} has moved from ${fromStage.replace(/_/g, ' ')} to ${normalizedTarget.replace(/_/g, ' ')}. Note: ${comment}`,
        'ALL',
        undefined,
        application.id
      );
      toast.success(`Loan moved to ${normalizedTarget.replace('_', ' ')}`);
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${application.id}`);
      return false;
    }
  };

  const riskThresholds = {
    high: 400,
    medium: 600
  };

  const calculateRiskLevel = (score: number): 'LOW' | 'MEDIUM' | 'HIGH' => {
    if (score < riskThresholds.high) return 'HIGH';
    if (score < riskThresholds.medium) return 'MEDIUM';
    return 'LOW';
  };

  const handleApplicationUpdate = async (applicationId: string, updateData: any) => {
    try {
      const fullUpdate = { ...updateData, updatedAt: serverTimestamp() };
      if (isLocalApplicationId(applicationId)) {
        const apps = getLocalApplications();
        const index = apps.findIndex(a => a.id === applicationId);
        if (index >= 0) {
          const updatedApp = { ...apps[index], ...updateData, updatedAt: new Date().toISOString() };
          apps[index] = updatedApp;
          localStorage.setItem(LOCAL_APPLICATIONS_KEY, JSON.stringify(apps));
          setApplications([...apps]);
          return updatedApp;
        }
      } else {
        await updateDoc(doc(db, 'applications', applicationId), fullUpdate);
        // Refresh local state will be handled by parent listeners or manual refresh if needed
        return null;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${applicationId}`);
      throw error;
    }
  };

  const fetchCRBReport = async (application: any) => {
    toast.loading("Fetching Credit Registry Data...", { id: 'crb-fetch' });
    
    // Simulate replaceable service layer delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Deterministic Mock Data Generation based on National ID
      const nationalId = application.clientSnapshot?.nationalId || 'GUEST-000';
      const score = hashStringToInt(nationalId, 550, 300); // Range 300-850
      const riskLevel = calculateRiskLevel(score);
      const fetchedAt = new Date().toISOString();
      
      const crbData = {
        score,
        riskLevel,
        reportSummary: `Systematic Audit: Borrower history for ${nationalId} indicates ${score > 600 ? 'strong' : score > 450 ? 'stable' : 'volatile'} credit discipline. Score calculated as ${score}.`,
        source: 'API' as const,
        fetchedAt
      };

      await handleApplicationUpdate(application.id, { crb: crbData });
      
      toast.dismiss('crb-fetch');
      toast.success(`CRB Check Complete: ${riskLevel} Risk (${score})`);
      
      // Update local state immediately if needed (handleApplicationUpdate already does it for local-*)
      if (!isLocalApplicationId(application.id)) {
        setApplications(prev => prev.map(a => a.id === application.id ? { ...a, crb: crbData } : a));
      }

      await recordWorkflowHistory(application.id, application.current_stage || 'SUBMITTED', application.current_stage || 'SUBMITTED', "CRB Report retrieved via API");
    } catch (error) {
      toast.dismiss('crb-fetch');
      toast.error("Failed to fetch CRB data. Please try again.");
    }
  };

  const handleSaveManualCRB = async (application: any, score: number, summary: string) => {
    try {
      const riskLevel = calculateRiskLevel(score);
      const fetchedAt = new Date().toISOString();
      const crbData = {
        score,
        riskLevel,
        reportSummary: summary || `Manual insertion of credit risk data. Risk Level assessed as ${riskLevel}.`,
        source: 'MANUAL' as const,
        fetchedAt
      };

      await handleApplicationUpdate(application.id, { crb: crbData });
      setApplications(prev => prev.map(a => a.id === application.id ? { ...a, crb: crbData } : a));
      
      toast.success(`CRB data saved manually: ${riskLevel} Risk`);
      await recordWorkflowHistory(application.id, application.current_stage || 'SUBMITTED', application.current_stage || 'SUBMITTED', "CRB Report added manually");
      // Phase 5: Notify analyst that CRB data is ready
      await createNotification(
        'CRB_READY',
        'CRB Report Ready for Analysis',
        `CRB data for ${application.clientSnapshot?.name || 'Unknown Client'} has been entered. Risk Level: ${riskLevel}. Application is ready for analyst review.`,
        'CREDIT_ANALYST',
        undefined,
        application.id,
        { riskLevel, score }
      );
    } catch (error) {
      toast.error("Failed to save manual CRB data.");
    }
  };

  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        toast.error("Firebase connection error. Please check configuration.");
      }
    }
  };

  const updateUserAccessStatus = async (targetUser: any, status: UserStatus) => {
    try {
      if (targetUser.id.startsWith('demo-') || !targetUser.id.includes('/') && getLocalUsers().find(u => u.id === targetUser.id)) {
        const locals = getLocalUsers();
        const userToUpdate = locals.find(u => u.id === targetUser.id);
        if (userToUpdate) {
          userToUpdate.status = status;
          saveLocalUser(userToUpdate);
          toast.success(`User status updated to ${status} (Simulation Mode)`);
          return;
        }
      }
      
      await updateDoc(doc(db, 'users', targetUser.id), {
        status,
        updatedAt: serverTimestamp()
      });
      toast.success(`User status updated to ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.id}`);
    }
  };

  const handleVerifyRepayment = async (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) {
      toast.error('Transaction not found in local cache.');
      return;
    }
    
    try {
      const loan = loans.find(l => l.id === tx.loanId);
      const success = await confirmRepayment(tx, (loan?.penaltyRate || 5));
      if (success) {
        toast.success('Repayment verified and audit trail updated.');
      }
    } catch (err) {
      toast.error("Failed to verify repayment.");
    }
  };



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    setLoading(true);
    try {
      setLoginError(null);
      const offlineProfile = await authenticateOfflineProfile(normalizedEmail, password);
      if (offlineProfile) {
        activateSession(offlineProfile, null, 'manual');
        return;
      }
      
      const credentials = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const profile = await resolveAuthProfile(credentials.user);
      if (!profile) {
        await signOut(auth);
        resetSessionState();
        setLoginError('No access profile was found for this account.');
        toast.error('No access profile was found for this account.');
        return;
      }
      activateSession(profile, credentials.user, 'manual');
    } catch (error: any) {
      const message = error?.message || 'Invalid email or password.';
      setLoginError(message);
      toast.error(`Login failed: ${message}`);
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleAgentCollection = async (loan: any, amount: number) => {
    const normalizedAmount = Number(amount);
    if (!loan || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.error('Enter a valid collection amount.');
      return false;
    }

    const reference = `AGENT-${Date.now()}`;
    const agentIdentity = sessionProfile?.name || sessionProfile?.email || 'field-agent@fastkwacha.com';
    const agentEmail = getActiveSessionEmail(sessionProfile) || sessionProfile?.email || 'field-agent@fastkwacha.com';
    const success = await processRepayment(loan, normalizedAmount, agentEmail, 'CASH', reference);

    if (!success) {
      return false;
    }

    await generateReceipt(
      loan.id,
      'REPAYMENT',
      reference,
      normalizedAmount,
      agentIdentity,
      loan.clientName || 'Valued Client',
      'CASH',
      'Field collection recorded by agent terminal.',
      {
        penalty: 0,
        interest: 0,
        principal: normalizedAmount,
      },
      undefined,
      {
        remainingBalance: Math.max(0, (loan.outstandingBalance || 0) - normalizedAmount),
        collectedBy: agentEmail,
      },
      true,
      `local-agent-collection-${Date.now()}`
    );

    return true;
  };

  const handleGoogleClientAuth = async () => {
    setLoading(true);
    try {
      setLoginError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const profile = await resolveAuthProfile(result.user);
      if (!profile) {
        await signOut(auth);
        resetSessionState();
        toast.error('No access profile was found for this account.');
        return;
      }
      activateSession(profile, result.user, 'manual');
    } catch (error: any) {
      setLoginError(error.message || 'Google sign-in failed.');
      toast.error(error.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleClientRegistration = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (isRegistering) return; 
    setIsRegistering(true); 
    setLoading(true);
    const normalizedEmail = normalizeEmail(registrationData.email);

    // Mandatory Full KYC: Name, Email, Phone, National ID, Password
    if (!registrationData.fullName || !normalizedEmail || !registrationData.password || !registrationData.phone || !registrationData.nationalId) {
      toast.error('Identity Protocol Error: All fields (Name, Email, Phone, National ID, and Password) are mandatory for registration.');
      setIsRegistering(false);
      return;
    }

    if (registrationData.password !== registrationData.confirmPassword) {
      toast.error('Passwords do not match.');
      setIsRegistering(false);
      return;
    }

    try {
      // 1. Email Uniqueness
      const existingEmail = await fetchUserProfileByEmail(normalizedEmail);
      if (existingEmail) {
        toast.error('Identity Conflict: Email already registered.');
        setIsRegistering(false);
        return;
      }

      // 2. Phone Uniqueness
      const existingPhone = await fetchUserProfileByPhone(registrationData.phone);
      if (existingPhone) {
        toast.error('Identity Conflict: Phone number already registered.');
        setIsRegistering(false);
        return;
      }

      // 3. Password Strength (Min 8 characters, 1 uppercase, 1 digit)
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(registrationData.password)) {
        toast.error('Security Protocol Violation: Password must be at least 8 characters long and contain at least one uppercase letter and one digit.');
        setIsRegistering(false);
        return;
      }

      // 4. National ID Format (8 chars Alphanumeric)
      const nationalIdRegex = /^[A-Z0-9]{8}$/i;
      if (!nationalIdRegex.test(registrationData.nationalId)) {
        toast.error('Identity Validation Error: National ID must be exactly 8 alphanumeric characters.');
        setIsRegistering(false);
        return;
      }
      

      const credentials = await createUserWithEmailAndPassword(auth, normalizedEmail, registrationData.password);
      registrationHydrationRef.current = credentials.user.uid;

      const passwordHash = await hashLocalPassword(registrationData.password);
      const payload = normalizeAuthProfile({
        id: credentials.user.uid,
        uid: credentials.user.uid,
        name: registrationData.fullName.trim(),
        email: normalizedEmail,
        phone: registrationData.phone.trim(),
        nationalId: registrationData.nationalId.trim(),
        role: 'CLIENT',
        status: 'ACTIVE',
        kycComplete: false,
        kycStatus: 'INCOMPLETE',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });

      try {
        await setDoc(doc(db, 'users', credentials.user.uid), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          passwordHint: 'enc_client_auth_primary'
        });
      } catch (err) {
        saveLocalUser(payload);
        setLocalSessionProfile(payload);
      }

      saveLocalUser({ ...payload, passwordHash } as AuthProfile);

      activateSession(payload, credentials.user, 'manual');
      toast.success('Registration successful. Complete your KYC to unlock loan applications.');
    } catch (error: any) {
      toast.error(`Registration Failed: ${error.message}`);
    } finally {
      setIsRegistering(false);
      setLoading(false);
    }
  };


  const getNextReceiptNumber = async (type: 'DIS' | 'REP'): Promise<string> => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const counterId = `${type}_${dateStr}`;
    const counterRef = doc(db, 'counters', counterId);

    try {
      const nextNum = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let count = 1;
        
        if (counterDoc.exists()) {
          count = counterDoc.data().count + 1;
          transaction.update(counterRef, { count });
        } else {
          transaction.set(counterRef, { count: 1, date: dateStr, type });
        }
        
        return count;
      });

      return `FW-${type}-${dateStr}-${nextNum.toString().padStart(4, '0')}`;
    } catch (e) {
      console.error('Failed to get sequential number:', e);
      return `FW-${type}-${dateStr}-FAL-${Math.floor(Math.random() * 10000)}`;
    }
  };

  // Assigned to global variable for top-level utility functions
  generateReceipt = async (
    loanId: string,
    type: ReceiptRecord['transactionType'],
    reference: string,
    amount: number,
    authorizedBy: string,
    clientName: string,
    paymentMethod?: string,
    description?: string,
    allocation?: ReceiptRecord['allocation'],
    disbursementDetails?: ReceiptRecord['disbursementDetails'],
    metadata?: any,
    isLocal: boolean = false,
    transactionId?: string
  ) => {
    // 1. Duplicate Prevention Check
    if (!isLocal && transactionId) {
      const existingQuery = query(collection(db, 'receipts'), where('transactionId', '==', transactionId));
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        toast.error('Duplicate receipt detected. Action blocked.');
        return existingSnap.docs[0].data() as ReceiptRecord;
      }
    }

    // 2. Generate Sequential Number
    const prefix = type === 'DISBURSEMENT' ? 'DIS' : 'REP';
    const sequentialId = await getNextReceiptNumber(prefix as 'DIS' | 'REP');

    const receipt: ReceiptRecord = {
      id: isLocal ? `local-rcpt-${Date.now()}` : `rcpt-${Date.now()}`,
      receiptId: sequentialId,
      transactionId: transactionId || reference, 
      transactionType: type,
      issuedAt: isLocal ? new Date().toISOString() : serverTimestamp(),
      date: new Date().toISOString(),
      loanId,
      clientId: 'resolved-via-context',
      clientName,
      amount,
      paymentMethod,
      transactionReference: reference,
      authorizedBy,
      description: description || `${type.replace(/_/g, ' ')} for loan ${loanId.slice(0, 8)}`,
      status: 'ISSUED',
      allocation,
      disbursementDetails,
      metadata: { ...metadata }
    };

    try {
      if (isLocal) {
        saveLocalReceiptRecord(receipt);
      } else {
        await addDoc(collection(db, 'receipts'), receipt);
      }
      setSelectedReceipt(receipt);
      setIsReceiptModalOpen(true);
      toast.success(`Receipt ${receipt.receiptId} generated successfully.`);
      return receipt;
    } catch (e) {
      console.error('Failed to generate receipt:', e);
      saveLocalReceiptRecord(receipt);
      setSelectedReceipt(receipt);
      setIsReceiptModalOpen(true);
      return receipt;
    }
  };

  const processPaychanguWebhook = async (loanId: string, amount: number, reference: string) => {
    try {
      const loanDoc = await getDoc(doc(db, 'loans', loanId));
      if (!loanDoc.exists()) throw new Error('Loan not found');
      const loanData = loanDoc.data();

      // Allocation Algorithm: Penalty -> Interest -> Principal
      const q = query(collection(db, 'repayment_schedule'), where('loanId', '==', loanId), orderBy('installmentNumber', 'asc'));
      const snapshot = await getDocs(q);
      const schedule = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RepaymentScheduleItem));

      let remainingPayment = amount;
      const updates: Promise<any>[] = [];

      for (const inst of schedule) {
        if (remainingPayment <= 0) break;
        if (inst.status === 'PAID') continue;

        const penaltyOwed = (inst.penaltyAmount || 0);
        const interestOwed = inst.interestAmount;
        const principalOwed = inst.principalAmount;
        
        let instTotalOwed = penaltyOwed + interestOwed + principalOwed - (inst.paidAmount || 0);
        const paymentToThis = Math.min(remainingPayment, instTotalOwed);
        
        const newPaidAmount = (inst.paidAmount || 0) + paymentToThis;
        const newStatus = newPaidAmount >= (penaltyOwed + interestOwed + principalOwed) ? 'PAID' : 'PARTIAL';
        
        updates.push(updateDoc(doc(db, 'repayment_schedule', inst.id!), {
          paidAmount: newPaidAmount,
          status: newStatus,
          updatedAt: serverTimestamp()
        }));

        remainingPayment -= paymentToThis;
      }

      const currentBalance = loanData.outstandingBalance || 0;
      const newBalance = Math.max(0, currentBalance - amount);
      
      updates.push(updateDoc(doc(db, 'loans', loanId), {
        outstandingBalance: newBalance,
        status: newBalance <= 0 ? 'REPAID' : 'ACTIVE',
        updatedAt: serverTimestamp()
      }));

      // Record Ledger Transaction
      await recordTransaction(loanId, loanData.clientId, 'REPAYMENT', amount, reference, 'paychangu-gateway', `Self-service payment via Paychangu.`);

      await Promise.all(updates);

      // Show Receipt
      await generateReceipt(
        loanId,
        'REPAYMENT',
        reference,
        amount,
        'paychangu-bot',
        loanData.clientName || 'Valued Client',
        'PAYCHANGU_CARD',
        `Autonomous Paychangu fulfillment.`,
        undefined,
        undefined,
        { provider: 'Paychangu', newBalance }
      );

      toast.success('Payment successfully processed through Paychangu!');
    } catch (error) {
      console.error('Webhook processing failed:', error);
      toast.error('Financial settlement failed. Please contact support.');
    }
  };

  const uploadDocument = async (file: File, folder: string, loanId: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, `${folder}/${loanId}/${file.name}_${Date.now()}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`Upload is ${progress}% done`);
        },
        (error) => {
          console.error("Upload failed", error);
          toast.error(`Upload failed: ${file.name}`);
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const handleLogout = async () => {
    setLoading(true);
    isLoggingOutRef.current = true;
    try {
      if (user) {
        await signOut(auth);
      } else {
        resetSessionState();
      }

      setIsAuthenticated(false);
      toast.info("Logged out successfully");
    } catch (error) {
      console.error("Logout failed", error);
      resetSessionState();
      toast.error("Logout encountered an issue, but your local session was cleared.");
    } finally {
      if (!auth.currentUser) {
        resetSessionState();
      }
      setLoading(false);
      isLoggingOutRef.current = false;
    }
  };

  const authContextValue = React.useMemo(() => ({
    isAuthenticated,
    role,
    loading,
    currentPath,
    navigateTo,
  }), [currentPath, isAuthenticated, loading, navigateTo, role]);

  const allowedRolesByPath: Partial<Record<AppPath, UserRole[]>> = {
    '/client': ['CLIENT'],
    '/officer': ['OFFICER', 'AGENT'],
    '/analyst': ['CREDIT_ANALYST'],
    '/manager': ['MANAGER'],
    '/admin': ['ADMIN'],
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Initializing LMS Authority...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user && !authProfile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Loading access profile...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden font-sans">
        {/* Left Side: Institutional Branding */}
        <div className="hidden md:flex md:w-1/2 bg-slate-900 items-center justify-center p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full -mr-48 -mt-48 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full -ml-32 -mb-32 blur-3xl"></div>
          
          <div className="relative z-10 max-w-md space-y-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-24 h-24 bg-brand-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-brand-500/20"
            >
              <LayoutDashboard size={48} className="text-white" />
            </motion.div>
            
            <div className="space-y-4">
              <h1 className="text-6xl font-black text-white tracking-tighter italic leading-none">FASTKWACHA</h1>
              <p className="text-xl text-slate-400 font-medium tracking-tight">Smart Lending, Trusted Decisions.</p>
            </div>

            <div className="pt-12 space-y-6">
              <div className="flex items-center gap-4 text-slate-300">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><ShieldCheck size={20} /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest leading-none">Proactive Security</p>
                  <p className="text-[10px] text-slate-500 font-medium">Bank-grade encryption & audit trails.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-slate-300">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><Zap size={20} /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest leading-none">Fast Decisions</p>
                  <p className="text-[10px] text-slate-500 font-medium">Rapid monitoring for quick loan approvals.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Card Content Placeholder - To be filled by next chunk */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white shadow-2xl shadow-slate-900/10 relative z-20">
          <div className="w-full max-w-sm space-y-10">
            <div className="text-center md:text-left space-y-3">
               <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-full mb-4">
                  <ShieldAlert size={12} className="text-brand-400" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">{authMode === 'login' ? 'Secure Portal' : 'Create Account'}</span>
               </div>
               <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                {authMode === 'login' ? 'Welcome Back' : 'Join FastKwacha'}
               </h2>
               <p className="text-slate-500 text-sm font-medium">
                  {authMode === 'login' 
                    ? 'Sign in to manage your FastKwacha account.' 
                    : 'Get started with a new client account today.'}
               </p>
            </div>

            <AnimatePresence mode="wait">
              {authMode === 'login' ? (
                <motion.div 
                  key="login-form" 
                  initial={{ opacity: 0, x: -20 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8"
                >
                  <div className="text-center pt-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter your credentials to continue</p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</label>
                      <Input 
                        type="email" 
                        placeholder="name@email.com" 
                        className={`h-14 rounded-2xl border-2 font-bold transition-all ${emailError ? 'border-red-500 bg-red-50/10' : 'border-slate-100 focus:border-brand-500 text-slate-900'} focus:ring-0`}
                        value={email} 
                        autoComplete="username"
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (e.target.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)) {
                            setEmailError('Invalid email format');
                          } else {
                            setEmailError(null);
                          }
                        }} 
                        required 
                      />
                      {emailError && <p className="text-[10px] text-red-500 font-bold ml-2 uppercase tracking-widest">{emailError}</p>}
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                        <button type="button" className="text-[9px] font-black text-brand-600 uppercase tracking-widest hover:underline">Forgot?</button>
                      </div>
                      <div className="relative">
                        <Input 
                          type={showPassword ? 'text' : 'password'} 
                          placeholder="••••••••" 
                          className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold pr-14" 
                          value={password} 
                          onChange={(e) => setPassword(e.target.value)} 
                          required 
                        />
                        <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" aria-label="Authorize Access" className="w-full h-14 bg-slate-900 hover:bg-brand-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-slate-900/10 transition-all">
                      Authorize Access
                    </Button>
                    <Button type="button" variant="outline" onClick={handleGoogleClientAuth} className="w-full h-14 border-2 border-slate-200 bg-white font-black text-xs uppercase tracking-widest rounded-2xl">
                      Continue With Google
                    </Button>
                  </form>

                  {loginError && (
                    <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest text-center">{loginError}</p>
                  )}

                  <div className="text-center pt-8 border-t border-slate-50">
                    <p className="text-xs text-slate-500 mb-1">New to FastKwacha?</p>
                    <button onClick={() => setAuthMode('register')} className="text-brand-600 text-xs font-black uppercase tracking-widest hover:underline">Create an Account</button>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                   key="register-form" 
                   initial={{ opacity: 0, x: 20 }} 
                   animate={{ opacity: 1, x: 0 }} 
                   exit={{ opacity: 0, x: -20 }}
                   className="space-y-6"
                >
                  <form onSubmit={handleClientRegistration} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legal Full Name <span className="text-brand-600">*</span></label>
                      <Input placeholder="Enter as per National ID" className="h-12 rounded-xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={registrationData.fullName} onChange={(e) => setRegistrationData({ ...registrationData, fullName: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Identity <span className="text-brand-600">*</span></label>
                      <Input 
                        type="email" 
                        placeholder="name@email.com" 
                        className={`h-12 rounded-xl border-2 font-bold transition-all ${emailError ? 'border-red-500 bg-red-50/10' : 'border-slate-100 focus:border-brand-500 text-slate-900'} focus:ring-0`}
                        value={registrationData.email} 
                        onChange={(e) => {
                          setRegistrationData({ ...registrationData, email: e.target.value });
                          if (e.target.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)) {
                            setEmailError('Invalid email format');
                          } else {
                            setEmailError(null);
                          }
                        }} 
                        required 
                      />
                      {emailError && <p className="text-[9px] text-red-500 font-bold ml-2 uppercase tracking-widest">{emailError}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Number <span className="text-brand-600">*</span></label>
                        <Input 
                          placeholder="099..." 
                          className="h-12 rounded-xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" 
                          value={registrationData.phone} 
                          onChange={(e) => setRegistrationData({ ...registrationData, phone: e.target.value })} 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">National ID <span className="text-brand-600">*</span></label>
                        <Input 
                          placeholder="8 Characters" 
                          className="h-12 rounded-xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" 
                          value={registrationData.nationalId} 
                          onChange={(e) => setRegistrationData({ ...registrationData, nationalId: e.target.value })} 
                          required 
                        />
                        <p className="text-[9px] text-slate-400 font-bold">Format: 8 Alphanumeric (e.g. ABC123D4)</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Code <span className="text-brand-600">*</span></label>
                        <div className="relative">
                          <Input 
                            type={showPassword ? 'text' : 'password'} 
                            placeholder="Min 8 chars" 
                            className={`h-12 rounded-xl border-2 font-bold pr-10 transition-all ${passwordError ? 'border-red-500 bg-red-50/10' : 'border-slate-100 focus:border-brand-500 text-slate-900'} focus:ring-0`}
                            value={registrationData.password} 
                            onChange={(e) => {
                              setRegistrationData({ ...registrationData, password: e.target.value });
                              if (e.target.value && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(e.target.value)) {
                                setPasswordError('Needs 8+ chars, upper & digit');
                              } else {
                                setPasswordError(null);
                              }
                            }} 
                            required 
                          />
                          <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {passwordError && <p className="text-[8px] text-red-500 font-bold uppercase tracking-widest">{passwordError}</p>}
                        {!passwordError && <p className="text-[8px] text-slate-400 font-bold">Req: Uppercase & Digit</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm <span className="text-brand-600">*</span></label>
                        <div className="relative">
                          <Input 
                            type={showPassword ? 'text' : 'password'} 
                            placeholder="••••••••" 
                            className={`h-12 rounded-xl border-2 font-bold pr-10 transition-all ${registrationData.confirmPassword && registrationData.confirmPassword !== registrationData.password ? 'border-red-500 bg-red-50/10' : 'border-slate-100 focus:border-brand-500 text-slate-900'} focus:ring-0`}
                            value={registrationData.confirmPassword} 
                            onChange={(e) => setRegistrationData({ ...registrationData, confirmPassword: e.target.value })} 
                            required 
                          />
                        </div>
                        {registrationData.confirmPassword && registrationData.confirmPassword !== registrationData.password && (
                          <p className="text-[8px] text-red-500 font-bold uppercase tracking-widest">Passwords do not match</p>
                        )}
                      </div>
                    </div>
                    <div className="pt-2">
                      <Button type="submit" className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-xl shadow-brand-500/20 transition-all">
                        Complete Registration & Access Hub
                      </Button>
                    </div>
                    <div className="pt-1">
                      <Button type="button" variant="outline" onClick={handleGoogleClientAuth} className="w-full h-12 border-2 border-slate-200 bg-white font-black text-[10px] uppercase tracking-widest rounded-xl">
                        Continue With Google
                      </Button>
                    </div>
                  </form>
                  <div className="text-center">
                    <button onClick={() => setAuthMode('login')} className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] hover:text-slate-600">Back to Authorized Login</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="pt-10 flex flex-col items-center gap-4 border-t border-slate-50 opacity-60">
              <div className="flex items-center gap-2 text-[9px] text-slate-400 uppercase tracking-widest font-black">
                <CheckCircle2 size={12} className="text-emerald-500" /> Authorized Institutional Environment Only
              </div>
              <p className="text-[8px] text-slate-400 text-center max-w-[200px] leading-relaxed">FastKwacha LMS &bull; v2.4.0 <br/> All actions logged & secured via 256-bit encryption.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionProfile && sessionProfile.status !== 'ACTIVE' && !isPendingStaff) {
    return (
      <RestrictedAccessScreen
        profile={sessionProfile}
        onLogout={handleLogout}
      />
    );
  }

  if (currentPath === '/unauthorized') {
    return (
      <AuthProvider value={authContextValue}>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <Card className="w-full max-w-xl rounded-[2rem] border border-slate-200 shadow-xl bg-white">
            <CardContent className="p-10 text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                <ShieldAlert size={28} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Unauthorized Access</h2>
                <p className="text-sm text-slate-500 font-medium">
                  Your current role does not have permission to open this route.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigateTo(getPathForRole(role), { replace: true })} className="bg-slate-900 text-white hover:bg-slate-800">
                  Go To My Dashboard
                </Button>
                <Button variant="outline" onClick={handleLogout}>
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider value={authContextValue}>
      <ProtectedRoute allowedRoles={allowedRolesByPath[currentPath]}>
        <div className="flex h-screen bg-background font-sans text-foreground overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="sidebar-mobile-overlay lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 z-50
        transition-all duration-300 ease-in-out
        fixed lg:relative inset-y-0 left-0
        ${isMobileSidebarOpen ? 'translate-x-0 sidebar-mobile-enter' : '-translate-x-full lg:translate-x-0'}
        ${isSidebarOpen ? 'w-[220px]' : 'lg:w-20 w-[220px]'}
      `}>
        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border/40">
          <div
            className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-700 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg cursor-pointer"
            onClick={() => { setIsSidebarOpen(v => !v); setIsMobileSidebarOpen(false); }}
          >
            <LayoutDashboard size={16} />
          </div>
          <div className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${isSidebarOpen ? 'opacity-100 w-32' : 'opacity-0 w-0 lg:hidden'}`}>
            <h1 className="font-black text-base leading-tight text-white tracking-widest">FASTKWACHA</h1>
            <p className="text-[9px] text-sidebar-foreground/60 font-semibold tracking-widest uppercase">Loan Management</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 mt-4">
          {role === 'ADMIN' && (
            <NavItem 
              icon={<LayoutDashboard size={16} />} 
              label="Dashboard" 
              active={currentView === 'dashboard'} 
              onClick={() => setCurrentView('dashboard')}
              collapsed={!isSidebarOpen}
            />
          )}
          
          {role === 'ADMIN' && (
            <>
              <NavItem 
                icon={<Users size={16} />} 
                label="Users" 
                active={currentView === 'users'} 
                onClick={() => setCurrentView('users')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<UserPlus size={16} />} 
                label="Clients" 
                active={currentView === 'clients'} 
                onClick={() => setCurrentView('clients')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Briefcase size={16} />} 
                label="Loan Products" 
                active={currentView === 'loan-products'} 
                onClick={() => setCurrentView('loan-products')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<FileText size={16} />} 
                label="Loans" 
                active={currentView === 'loans'} 
                onClick={() => setCurrentView('loans')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<History size={16} />} 
                label="Transactions" 
                active={currentView === 'transactions'} 
                onClick={() => setCurrentView('transactions')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<BarChart3 size={16} />} 
                label="Reports" 
                active={currentView === 'reports'} 
                onClick={() => setCurrentView('reports')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<ShieldAlert size={16} />} 
                label="Audit Logs" 
                active={currentView === 'audit-logs'} 
                onClick={() => setCurrentView('audit-logs')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<ShieldCheck size={16} />} 
                label="Repayment Audit" 
                active={currentView === 'repayment-audit'} 
                onClick={() => setCurrentView('repayment-audit')}
                collapsed={!isSidebarOpen}
              />
            </>
          )}

          {role === 'MANAGER' && (
            <>
              <NavItem 
                icon={<LayoutDashboard size={16} />} 
                label="Overview" 
                active={currentView === 'dashboard'} 
                onClick={() => setCurrentView('dashboard')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<CheckCircle2 size={16} />} 
                label="Decision Queue" 
                active={currentView === 'manager-decision'} 
                onClick={() => setCurrentView('manager-decision')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Briefcase size={16} />} 
                label="Portfolio Control" 
                active={currentView === 'manager-portfolio'} 
                onClick={() => setCurrentView('manager-portfolio')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<ShieldAlert size={16} />} 
                label="Risk Guard" 
                active={currentView === 'manager-risk'} 
                onClick={() => setCurrentView('manager-risk')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<BarChart3 size={16} />} 
                label="Operational Reports" 
                active={currentView === 'reports'} 
                onClick={() => setCurrentView('reports')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<History size={16} />} 
                label="Security Audit" 
                active={currentView === 'audit-logs'} 
                onClick={() => setCurrentView('audit-logs')}
                collapsed={!isSidebarOpen}
              />
            </>
          )}

          {(role === 'ADMIN' || role === 'MANAGER') && (
            <NavItem 
              icon={<Zap size={16} />} 
              label="Automation Center" 
              active={currentView === 'automation-center'} 
              onClick={() => setCurrentView('automation-center')}
              collapsed={!isSidebarOpen}
            />
          )}


          {role === 'CREDIT_ANALYST' && (
            <>
              <NavItem 
                icon={<ShieldAlert size={16} />} 
                label="Audit Logs" 
                active={currentView === 'audit-logs'} 
                onClick={() => setCurrentView('audit-logs')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<ShieldCheck size={16} />} 
                label="Repayment Audit" 
                active={currentView === 'repayment-audit'} 
                onClick={() => setCurrentView('repayment-audit')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<History size={16} />} 
                label="Transactions Audit" 
                active={currentView === 'transactions-audit'} 
                onClick={() => setCurrentView('transactions-audit')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<AlertCircle size={16} />} 
                label="Anomalies" 
                active={currentView === 'anomalies'} 
                onClick={() => setCurrentView('anomalies')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<BarChart3 size={16} />} 
                label="Reports" 
                active={currentView === 'reports'} 
                onClick={() => setCurrentView('reports')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Users size={16} />} 
                label="User Activity" 
                active={currentView === 'user-activity'} 
                onClick={() => setCurrentView('user-activity')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Briefcase size={16} />} 
                label="Cases" 
                active={currentView === 'cases'} 
                onClick={() => setCurrentView('cases')}
                collapsed={!isSidebarOpen}
              />
            </>
          )}

          {role === 'OFFICER' && (
            <>
              <NavItem
                icon={<LayoutDashboard size={16} />}
                label="Command Center"
                active={currentView === 'dashboard'}
                onClick={() => { setCurrentView('dashboard'); setIsMobileSidebarOpen(false); }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<Users size={16} />}
                label="Clients"
                active={currentView === 'clients'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('clients'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<CheckCircle2 size={16} />}
                label="Approvals"
                active={currentView === 'approvals'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('approvals'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<FileEdit size={16} />}
                label="Applications"
                active={currentView === 'applications'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('applications'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<CreditCard size={16} />}
                label="Repayments"
                active={currentView === 'repayments'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('repayments'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<TrendingUp size={16} />}
                label="Ledger"
                active={currentView === 'transactions'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('transactions'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<Clock size={16} />}
                label="Due Loans"
                active={currentView === 'due-loans'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('due-loans'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<BarChart3 size={16} />}
                label="Reports"
                active={currentView === 'reports'}
                onClick={() => { if (!isPendingStaff) { setCurrentView('reports'); setIsMobileSidebarOpen(false); } }}
                collapsed={!isSidebarOpen}
              />
            </>
          )}

          {role === 'AGENT' && (
            <>
              <NavItem
                icon={<LayoutDashboard size={16} />}
                label="Dashboard"
                active={currentView === 'dashboard'}
                onClick={() => { setCurrentView('dashboard'); setIsMobileSidebarOpen(false); }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<Users size={16} />}
                label="Clients"
                active={currentView === 'clients'}
                onClick={() => { setCurrentView('clients'); setIsMobileSidebarOpen(false); }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<Clock size={16} />}
                label="Due Loans"
                active={currentView === 'due-loans'}
                onClick={() => { setCurrentView('due-loans'); setIsMobileSidebarOpen(false); }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<History size={16} />}
                label="Transactions"
                active={currentView === 'transactions'}
                onClick={() => { setCurrentView('transactions'); setIsMobileSidebarOpen(false); }}
                collapsed={!isSidebarOpen}
              />
              <NavItem
                icon={<CreditCard size={16} />}
                label="Payments"
                active={currentView === 'payments'}
                onClick={() => { setCurrentView('payments'); setIsMobileSidebarOpen(false); }}
                collapsed={!isSidebarOpen}
              />
            </>
          )}

          {role === 'CLIENT' && (
            <>
              <NavItem 
                icon={<LayoutDashboard size={16} />} 
                label="Dashboard" 
                active={currentView === 'dashboard'} 
                onClick={() => setCurrentView('dashboard')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Briefcase size={16} />} 
                label="Loans" 
                active={currentView === 'loans'} 
                onClick={() => setCurrentView('loans')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Zap size={16} />} 
                label="Repayments" 
                active={currentView === 'repayments'} 
                onClick={() => setCurrentView('repayments')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<FileText size={16} />} 
                label="Receipts" 
                active={currentView === 'receipts'} 
                onClick={() => setCurrentView('receipts')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<BellRing size={16} />} 
                label="Notifications" 
                active={currentView === 'notifications'} 
                onClick={() => setCurrentView('notifications')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<UserIcon size={16} />} 
                label="Profile" 
                active={currentView === 'profile'} 
                onClick={() => setCurrentView('profile')}
                collapsed={!isSidebarOpen}
              />
            </>
          )}

          <NavItem 
            icon={<Settings size={16} />} 
            label="Settings" 
            active={currentView === 'settings'} 
            onClick={() => setCurrentView('settings')}
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 mt-auto border-t border-sidebar-border/50">
          {isSidebarOpen && (
            <div className="px-2 mb-4 space-y-3">
              <div>
                <p className="text-[10px] text-sidebar-foreground uppercase tracking-widest font-black mb-1">Active Session</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${role === 'ADMIN' ? 'bg-brand-400' : role === 'OFFICER' ? 'bg-amber-400' : role === 'AGENT' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                  <p className="text-[11px] text-white font-bold">{role} AUTHORITY</p>
                </div>
                <p className="text-[12px] text-sidebar-foreground font-medium truncate mt-0.5">{sessionProfile?.email || user?.email || 'local-session@fastkwacha.com'}</p>
              </div>
            </div>
          )}
          {role !== 'CLIENT' && (
            <Button 
              variant="ghost" 
              onClick={handleLogout}
              className="w-full justify-start gap-3 text-sidebar-foreground hover:text-white hover:bg-sidebar-accent h-9 px-2"
            >
              <LogOut size={16} />
              {isSidebarOpen && <span className="text-xs">Logout</span>}
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content — offset for fixed sidebar on desktop */}
      <div className="hidden lg:block shrink-0 transition-all duration-300" style={{ width: isSidebarOpen ? '220px' : '80px' }} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsMobileSidebarOpen(v => !v)}
              className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-slate-50 hover:bg-slate-100 transition-colors shrink-0"
            >
              <Menu size={18} className="text-slate-600" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-base md:text-lg font-bold tracking-tight truncate">
                {role === 'OFFICER' ? 'Officer Terminal' : role === 'MANAGER' ? 'Manager Console' : role === 'CREDIT_ANALYST' ? 'Analyst Station' : 'FastKwacha LMS'}
              </h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">Operational overview &bull; {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 px-4 text-xs font-semibold border-border bg-white"
                onClick={() => {
                  let data: any[] = [];
                  let name = 'export';
                  if (currentView === 'clients') { data = clients; name = 'clients'; }
                  else if (currentView === 'loans') { data = loans; name = 'loans'; }
                  else if (currentView === 'applications') { data = applications; name = 'applications'; }
                  else if (currentView === 'transactions') { data = transactions; name = 'transactions'; }
                  else { data = [...clients, ...loans]; name = 'full_report'; }
                  downloadCSV(data, name);
                  toast.success(`Exporting ${name}.csv`);
                }}
              >
                Export CSV
              </Button>
              {role === 'OFFICER' && (
                <Button size="sm" className="h-9 px-4 text-xs font-semibold bg-primary text-white" onClick={() => setCurrentView('applications')}>
                  <Plus size={14} className="mr-2" /> New Application
                </Button>
              )}
            </div>
            <Separator orientation="vertical" className="h-6" />

            {/* Phase 5: Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(v => !v)}
                className="relative h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-white hover:bg-slate-50 transition-colors"
              >
                <Bell size={16} className="text-slate-600" />
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-black">
                    {Math.min(notifications.filter(n => !n.isRead).length, 9)}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-11 w-96 bg-white border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                      <Bell size={14} />
                      <p className="text-xs font-bold uppercase tracking-widest">Notifications</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {notifications.some(n => !n.isRead) && (
                        <button
                          className="text-[10px] font-bold text-slate-400 hover:text-white"
                          onClick={async () => {
                            const unread = notifications.filter(n => !n.isRead && n.id);
                            await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id!), { isRead: true })));
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                      <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-white text-sm font-bold">ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¢</button>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-border">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell size={28} className="mx-auto text-slate-200 mb-2" />
                        <p className="text-xs text-slate-400 font-medium">No notifications yet</p>
                      </div>
                    ) : notifications.slice(0, 20).map(n => {
                      const icons: Record<string, string> = {
                        LOAN_APPROVED: 'ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦', LOAN_REJECTED: 'ÃƒÂ¢Ã‚ÂÃ…â€™', PAYMENT_RECEIVED: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â°',
                        PAYMENT_REMINDER: 'ÃƒÂ¢Ã‚ÂÃ‚Â°', LOAN_OVERDUE: 'ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â', LOAN_DEFAULTED: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â´',
                        STAGE_CHANGE: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾', CRB_READY: 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹', SYSTEM: 'ÃƒÂ¢Ã…Â¡Ã¢â€žÂ¢ÃƒÂ¯Ã‚Â¸Ã‚Â'
                      };
                      return (
                        <div
                          key={n.id}
                          className={`px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${!n.isRead ? 'border-l-2 border-brand-500 bg-brand-50/30' : ''}`}
                          onClick={async () => {
                            if (!n.isRead && n.id) {
                              await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-base mt-0.5">{icons[n.type] || 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Â'}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold truncate ${!n.isRead ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-slate-400 mt-1 font-medium">
                                {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : 'Just now'}
                              </p>
                            </div>
                            {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sessionProfile?.uid || user?.uid || role.toLowerCase()}`} />
                <AvatarFallback>{sessionProfile?.name?.charAt(0) || user?.displayName?.charAt(0) || role.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>
          </div>

        </header>

        {/* View Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {role === 'CLIENT' && (
              <>
                <motion.div key={currentView}>
                  <ClientDashboardView 
                    view={currentView}
                    loans={loans.filter(l => l.clientSnapshot?.email === (sessionProfile?.email || user?.email) || l.clientId === sessionProfile?.id)}
                    receipts={receipts.filter(r => r.clientId === sessionProfile?.id || loans.some(l => l.id === r.loanId && (l.clientSnapshot?.email === (sessionProfile?.email || user?.email) || l.clientId === sessionProfile?.id)))}
                    profile={sessionProfile}
                    notifications={notifications.filter(n => n.clientId === sessionProfile?.id || n.targetEmail === sessionProfile?.email)}
                    onNavigate={(v) => setCurrentView(v)}
                    onPay={(loan) => {
                      setSelectedLoanForPayment(loan);
                      setIsPaychanguModalOpen(true);
                    }}
                    onViewReceipt={(rcpt) => {
                      setSelectedReceipt(rcpt);
                      setIsReceiptModalOpen(true);
                    }}
                    handleLogout={handleLogout}
                    settings={clientSettings}
                    onUpdateSettings={async (newSettings) => {
                      setClientSettings(newSettings);
                      if (sessionProfile) {
                        try {
                          await updateDoc(doc(db, 'users', sessionProfile.id), { settings: newSettings });
                          toast.success("Settings saved.");
                        } catch (e) {
                          console.error("Failed to save settings", e);
                        }
                      }
                    }}
                    clients={clients}
                    applications={applications}
                    uploadDocument={uploadDocument}
                  />
                </motion.div>
              </>
            )}

            {(currentView === 'dashboard' || currentView === 'manager-decision' || currentView === 'manager-portfolio' || currentView === 'manager-risk') && role !== 'CLIENT' && (
              <motion.div key="dashboard">
                <DashboardView 
                  view={currentView}
                  clients={clients} 
                  loans={loans} 
                  applications={applications} 
                  role={role} 
                  users={users} 
                  transactions={transactions} 
                  onNavigate={(v) => setCurrentView(v)}
                  onUpdateUserStatus={updateUserAccessStatus}
                  handleStageTransition={handleStageTransition}
                  fetchCRBReport={fetchCRBReport}
                  workflowHistory={workflowHistory}
                  handleSaveManualCRB={handleSaveManualCRB}
                  loanProducts={loanProducts}
                  repaymentSchedules={repaymentSchedules}
                  runWorkflowMigration={runWorkflowMigration}
                  recordWorkflowHistory={recordWorkflowHistory}
                  managerNote={managerNote}
                  setManagerNote={setManagerNote}
                  sessionProfile={sessionProfile}
                  user={user}
                  generateReceipt={generateReceipt}
                />
              </motion.div>
            )}
            {currentView === 'clients' && role !== 'CLIENT' && (
              <motion.div key="clients">
                <ClientsView clients={clients} loans={loans} role={role} />
              </motion.div>
            )}
            {currentView === 'applications' && role !== 'CLIENT' && (
              <motion.div key="applications">
                <ApplicationsView clients={clients} applications={applications} role={role} sessionProfile={sessionProfile!} uploadDocument={uploadDocument} />
              </motion.div>
            )}
            {currentView === 'approvals' && role !== 'CLIENT' && (
              <motion.div key="approvals">
                <ApprovalsView 
                  applications={applications} 
                  role={role} 
                  handleStageTransition={handleStageTransition}
                  fetchCRBReport={fetchCRBReport}
                  handleSaveManualCRB={handleSaveManualCRB}
                  loanProducts={loanProducts}
                />
              </motion.div>
            )}
            {currentView === 'repayments' && (
              <motion.div key="repayments">
                <RepaymentsView loans={loans} role={role} loanProducts={loanProducts} />
              </motion.div>
            )}
            {currentView === 'payments' && (
              <motion.div key="payments">
                {role === 'AGENT' ? (
                  <AgentPaymentCollectionView
                    loans={loans}
                    clients={clients}
                    onCollect={handleAgentCollection}
                  />
                ) : (
                  <RepaymentsView loans={loans} role={role} loanProducts={loanProducts} />
                )}
              </motion.div>
            )}
            {currentView === 'transactions' && (
              <motion.div key="transactions">
                <TransactionsAuditView transactions={transactions} loans={loans} role={role} />
              </motion.div>
            )}
            {currentView === 'due-loans' && (
              <motion.div key="due-loans">
                <LoansView
                  loans={loans.filter(l => l.status === 'ACTIVE' || l.status === 'OVERDUE' || l.status === 'DEFAULTED')}
                  clients={clients}
                  title={role === 'AGENT' ? 'Due & Overdue Tracking' : 'Loan Portfolio'}
                  description={role === 'AGENT' ? 'Focus on active field collections and facilities that need immediate follow-up.' : 'Global view of all active, closed, and defaulted loans.'}
                />
              </motion.div>
            )}
            {currentView === 'users' && (
              <motion.div key="users">
                <UserManagementView users={users} onUpdateUserStatus={updateUserAccessStatus} />
              </motion.div>
            )}
            {currentView === 'loan-products' && (
              <motion.div key="loan-products">
                <LoanProductsView products={loanProducts} />
              </motion.div>
            )}
            {currentView === 'loans' && (
              <motion.div key="loans">
                <LoansView loans={loans} clients={clients} />
              </motion.div>
            )}
            {currentView === 'reports' && (
              <motion.div key="reports">
                <ReportsView 
                  loans={loans} 
                  applications={applications} 
                  transactions={transactions} 
                  clients={clients} 
                  repaymentSchedules={repaymentSchedules}
                  workflowHistory={workflowHistory}
                />
              </motion.div>
            )}
            {currentView === 'audit-logs' && (
              <motion.div key="audit-logs">
                <AuditLogsView users={users} clients={clients} applications={applications} loans={loans} transactions={transactions} />
              </motion.div>
            )}
            {currentView === 'transactions-audit' && (
              <motion.div key="transactions-audit">
                <TransactionsAuditView transactions={transactions} loans={loans} />
              </motion.div>
            )}
            {currentView === 'anomalies' && (
              <motion.div key="anomalies">
                <AnomaliesView users={users} applications={applications} loans={loans} transactions={transactions} />
              </motion.div>
            )}
            {currentView === 'user-activity' && (
              <motion.div key="user-activity">
                <UserActivityView users={users} applications={applications} transactions={transactions} loans={loans} />
              </motion.div>
            )}
            {currentView === 'cases' && (
              <motion.div key="cases">
                <CasesView users={users} applications={applications} loans={loans} transactions={transactions} />
              </motion.div>
            )}
            {currentView === 'repayment-audit' && (
              <motion.div key="repayment-audit">
                <RepaymentAuditView 
                  transactions={transactions} 
                  loans={loans} 
                  onVerifyRepayment={handleVerifyRepayment}
                />
              </motion.div>
            )}
            {currentView === 'settings' && (
              <motion.div key="settings">
                {role === 'CLIENT' ? (
                  <ClientDashboardView 
                    view="settings"
                    loans={[]}
                    receipts={[]}
                    profile={sessionProfile}
                    notifications={[]}
                    onNavigate={(v) => setCurrentView(v)}
                    onPay={() => {}}
                    onViewReceipt={() => {}}
                    handleLogout={handleLogout}
                    settings={clientSettings}
                    onUpdateSettings={async (s) => setClientSettings(s)}
                    clients={clients}
                    applications={applications}
                    uploadDocument={uploadDocument}
                  />
                ) : (
                  <SettingsView 
                    profile={sessionProfile!} 
                    systemSettings={systemSettings}
                    onUpdateSystemSettings={(settings) => {
                      setSystemSettings(settings);
                      setDoc(doc(db, 'system_settings', 'global'), settings);
                    }}
                    onUpdateProfile={(updatedProfile) => {
                      if (sessionProfile?.id.startsWith('demo-')) {
                        saveLocalUser(updatedProfile);
                        setLocalSessionProfile(updatedProfile);
                      } else {
                        updateDoc(doc(db, 'users', sessionProfile!.id), updatedProfile as any);
                      }
                      toast.success("Profile updated successfully.");
                    }}
                  />
                )}
              </motion.div>
            )}
            {currentView === 'automation-center' && (role === 'ADMIN' || role === 'MANAGER') && (
              <motion.div key="automation-center">
                <AutomationCenterView
                  loans={loans}
                  loanProducts={loanProducts}
                  notifications={notifications}
                  onRunMaintenance={() => runFinancialMaintenance(loans, loanProducts)}
                  onRunReminders={() => sendPaymentReminders(loans)}
                  onRunAutomation={() => {
                    localStorage.removeItem(AUTOMATION_LAST_RUN_KEY);
                    return runDailyAutomation(loans, loanProducts);
                  }}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
      
      {/* Audit & Financial Artifacts Overlay */}
      {isReceiptModalOpen && selectedReceipt && (
        <ReceiptViewerModal 
          receipt={selectedReceipt} 
          isOpen={isReceiptModalOpen} 
          onClose={() => setIsReceiptModalOpen(false)} 
        />
      )}

      {/* Paychangu Mock Gateway */}
      {isPaychanguModalOpen && selectedLoanForPayment && (
        <PaychanguMockModal 
          loan={selectedLoanForPayment}
          onSuccess={(ref, amt) => {
            setIsPaychanguModalOpen(false);
            processPaychanguWebhook(selectedLoanForPayment.id, amt, ref);
          }}
          onClose={() => setIsPaychanguModalOpen(false)}
        />
      )}
        </div>
      </ProtectedRoute>
    </AuthProvider>
  );
}

function ReceiptViewerModal({ receipt, isOpen, onClose }: { receipt: ReceiptRecord, isOpen: boolean, onClose: () => void }) {
  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const isDisbursement = receipt.transactionType === 'DISBURSEMENT';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300 print:p-0 print:static print:bg-white print:backdrop-blur-none">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 print:shadow-none print:max-h-none print:w-[210mm] print:rounded-none print:border-none"
      >
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 print:hidden">
          <div className="flex items-center gap-4">
            <div className="bg-brand-600 p-3 rounded-2xl shadow-lg shadow-brand-500/20">
              <ShieldCheck className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tighter">OFFICIAL RECEIPT</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mt-1">Verified Financial Statement</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-11 px-6 gap-2 font-black border-slate-200 rounded-2xl hover:bg-slate-900 hover:text-white transition-all">
              <FileDown size={18} /> PRINT/PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-11 w-11 rounded-full hover:bg-slate-200 text-slate-400 Transition-all">
              <X size={20} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-white print:p-0 print:overflow-visible">
          <div className="max-w-xl mx-auto print:max-w-none">
            {/* watermark-like texture could be added here with absolute divs */}
            
            <div className="flex justify-between items-start mb-12 pb-12 border-b-4 border-slate-900">
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter mb-1 italic">FASTKWACHA LTD</h1>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-[0.2em] mb-6">Financial Records Division</p>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  FastKwacha House, Plot 491, Victoria Ave<br />
                  Private Bag 110, Blantyre, Malawi<br />
                  Reg: MW-LMS-2026-F612
                </p>
              </div>
              <div className="text-right">
                <div className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-[0.3em] mb-6 inline-block">
                  {receipt.transactionType}
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px] mb-1">Receipt Number</p>
                  <p className="text-lg font-black text-slate-900 tracking-tight">{receipt.receiptId}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12 mb-12">
              <div className="space-y-4">
                <div>
                  <h3 className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Issued To</h3>
                  <p className="text-xl font-black text-slate-900 uppercase tracking-tight">{receipt.clientName}</p>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">Loan ID: {receipt.loanId.toUpperCase()}</p>
                </div>
                <div>
                  <h3 className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Date & Time</h3>
                  <p className="text-sm font-black text-slate-900">
                    {receipt.issuedAt ? (receipt.issuedAt.toDate ? receipt.issuedAt.toDate() : new Date(receipt.issuedAt)).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : new Date(receipt.date).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right space-y-4">
                <div>
                  <h3 className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Transaction Type</h3>
                  <p className="text-sm font-black text-slate-900 uppercase bg-slate-100 px-3 py-1 rounded-lg inline-block">{receipt.transactionType.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <h3 className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Payment Reference</h3>
                  <p className="text-sm font-mono font-bold text-brand-600">{receipt.transactionReference || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Financial Breakdown Table */}
            <div className="border border-slate-200 rounded-[2rem] overflow-hidden mb-12 shadow-sm">
              <div className="bg-slate-50 px-8 py-5 border-b border-slate-200">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Transaction Summary</p>
              </div>
              <div className="p-8 space-y-4">
                {isDisbursement && receipt.disbursementDetails ? (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium tracking-tight">Approved Loan Amount</span>
                      <span className="text-slate-900 font-black">{formatCurrency(receipt.disbursementDetails.disbursedAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-red-600">
                      <span className="font-medium tracking-tight">Total Processing Fees</span>
                      <span className="font-black">- {formatCurrency(receipt.disbursementDetails.feesDeducted || 0)}</span>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-base font-black text-slate-900">Net Disbursement Sent</span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">{formatCurrency(receipt.disbursementDetails.netAmountSent || 0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    {receipt.allocation && (
                      <div className="space-y-3 pb-4 border-b border-slate-50">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Principal Recovery</span>
                          <span className="text-slate-900 font-black">{formatCurrency(receipt.allocation.principal || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Interest Paid</span>
                          <span className="text-slate-900 font-black">{formatCurrency(receipt.allocation.interest || 0)}</span>
                        </div>
                        {(receipt.allocation.penalty || 0) > 0 && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-amber-600 font-bold uppercase tracking-widest">Late Penalties</span>
                            <span className="text-amber-600 font-black">{formatCurrency(receipt.allocation.penalty || 0)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="pt-2 flex justify-between items-center">
                      <span className="text-base font-black text-slate-900 italic">Total Payment Confirmed</span>
                      <span className="text-3xl font-black text-brand-600 tracking-tighter">{formatCurrency(receipt.amount || 0)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 text-[11px] font-medium text-slate-400 mb-12">
              <div className="p-6 bg-slate-50 rounded-2xl italic">
                {receipt.description || "Official financial movement recorded and reconciled by FastKwacha Audit Control."}
              </div>
              <div className="space-y-4">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold uppercase tracking-widest text-[9px]">Auth Status</span>
                  <span className="text-emerald-600 font-black uppercase tracking-widest text-[9px]">{receipt.status}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold uppercase tracking-widest text-[9px]">Verified By</span>
                  <span className="text-slate-900 font-black uppercase tracking-widest text-[9px]">{receipt.authorizedBy}</span>
                </div>
              </div>
            </div>

            <div className="pt-12 border-t border-slate-100 text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 border-4 border-slate-900 rounded-full flex items-center justify-center transform -rotate-12">
                   <span className="text-[8px] font-black text-slate-900 text-center leading-none uppercase">FK AUDIT<br/>SECURE</span>
                </div>
              </div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.3em]">Institutional Verification Required for Validity</p>
              <p className="text-[8px] text-slate-300 mt-4 leading-relaxed font-medium">
                This document is generated by the FastKwacha LMS (v2.4.0). Electronically signed and timestamped.<br/>
                Transaction ID: {receipt.transactionId}
              </p>
              <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em] mt-6">Electronically Generated - No Signature Required</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-6 py-2.5 transition-all duration-200 border-l-[3px] ${
        active 
          ? 'bg-white/5 text-white border-brand-400 font-semibold' 
          : 'text-sidebar-foreground hover:text-white border-transparent'
      }`}
    >
      <span className={`${active ? 'text-white' : 'text-sidebar-foreground'}`}>{icon}</span>
      {!collapsed && <span className="text-[13px]">{label}</span>}
    </button>
  );
}

function RestrictedAccessScreen({ profile, onLogout }: { profile: AuthProfile, onLogout: () => Promise<void> }) {
  const isPending = profile.status === 'PENDING';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-2xl w-full border-none shadow-2xl overflow-hidden">
        <div className={`p-8 text-white ${isPending ? 'bg-amber-500' : profile.status === 'REJECTED' ? 'bg-red-600' : 'bg-slate-700'}`}>
          <h1 className="text-2xl font-bold">
            {isPending ? 'Institutional Approval Pending' : profile.status === 'REJECTED' ? 'Account Rejected' : 'Account Suspended'}
          </h1>
          <p className="text-sm mt-2 opacity-90">
            {isPending
              ? 'Your registration has been received and is waiting for admin review.'
              : profile.status === 'REJECTED'
                ? 'This account was reviewed and denied access.'
                : 'This account is temporarily disabled and cannot operate.'}
          </p>
        </div>
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-border bg-white p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Account Status</p>
              <p className="text-lg font-bold text-slate-900">{profile.name}</p>
              <p className="text-sm text-slate-500">{profile.email}</p>
            </div>
            <Badge className={`${getStatusTone(profile.status)} border-none px-3 py-1 uppercase tracking-widest text-[10px] font-black`}>
              {profile.status}
            </Badge>
          </div>

          {isPending ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Estimated approval window: up to 24 hours. You can sign in again anytime to check your status.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReadOnlyDetail label="Phone" value={profile.phone || 'Not provided'} />
                <ReadOnlyDetail label="National ID" value={profile.nationalId || 'Not provided'} />
                <ReadOnlyDetail label="Address" value={profile.address || 'Not provided'} />
                <ReadOnlyDetail label="Guarantor / Reference" value={profile.guarantorReference || 'Not provided'} />
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-4 space-y-2 text-sm text-slate-600">
                <p className="font-bold text-slate-900">Workspace access is locked until approval.</p>
                <p>Client registration: disabled</p>
                <p>Payments: disabled</p>
                <p>Transactions: disabled</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-slate-50 p-4 text-sm text-slate-600">
              Contact an administrator if you believe this status should be reviewed.
            </div>
          )}

          <Button onClick={onLogout} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold">
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyDetail({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PendingAgentWorkspace({
  profile,
  showSuccessPanel = false,
  onDismissSuccessPanel,
}: {
  profile: AuthProfile,
  showSuccessPanel?: boolean,
  onDismissSuccessPanel?: () => void,
}) {
  return (
    <Card className="max-w-4xl mx-auto border border-amber-200 bg-amber-50 shadow-none rounded-xl">
      <CardContent className="p-8 space-y-6">
        {showSuccessPanel && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-2">Submit Successful</p>
              <h3 className="text-lg font-bold text-emerald-950">Your registration has been received.</h3>
              <p className="text-sm text-emerald-800 mt-1">Please wait up to 24 hours for admin approval. You are now in the inactive agent dashboard while your account is being reviewed.</p>
            </div>
            <Button type="button" variant="outline" className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100" onClick={onDismissSuccessPanel}>
              Dismiss
            </Button>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">Agent Dashboard</p>
            <h2 className="text-2xl font-bold text-amber-950">Welcome, {profile.name}</h2>
            <p className="text-sm text-amber-800 mt-1">Your account has been created and redirected to your dashboard, but operations will stay locked until admin approval.</p>
          </div>
          <Badge className="bg-amber-100 text-amber-800 border-none px-3 py-1 uppercase tracking-widest text-[10px] font-black">
            Pending Approval
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ReadOnlyDetail label="Submitted Email" value={profile.email} />
          <ReadOnlyDetail label="Phone" value={profile.phone || 'Not provided'} />
          <ReadOnlyDetail label="National ID" value={profile.nationalId || 'Not provided'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border border-border shadow-none rounded-lg bg-white">
            <CardContent className="p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Client Registration</p>
              <p className="text-sm font-semibold text-slate-900">Disabled</p>
              <p className="text-[12px] text-slate-500 mt-2">You will be able to register borrowers after approval.</p>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none rounded-lg bg-white">
            <CardContent className="p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payments</p>
              <p className="text-sm font-semibold text-slate-900">Disabled</p>
              <p className="text-[12px] text-slate-500 mt-2">Collection tools stay locked while your account is under review.</p>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none rounded-lg bg-white">
            <CardContent className="p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Transactions</p>
              <p className="text-sm font-semibold text-slate-900">Empty</p>
              <p className="text-[12px] text-slate-500 mt-2">Your operational history will appear here once access is activated.</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentDashboardView({
  clients,
  loans,
  transactions,
  onNavigate,
  sessionProfile,
}: {
  clients: any[],
  loans: any[],
  transactions: any[],
  onNavigate: (view: View) => void,
  sessionProfile: AuthProfile | null,
}) {
  const agentEmail = sessionProfile?.email;
  const relevantLoans = loans
    .filter((loan) => !agentEmail || !loan.assignedAgentEmail || loan.assignedAgentEmail === agentEmail)
    .sort((left, right) => new Date(left.nextDueDate || left.updatedAt || 0).getTime() - new Date(right.nextDueDate || right.updatedAt || 0).getTime());
  const priorityCollections = relevantLoans.filter((loan) => (loan.outstandingBalance || 0) > 0).slice(0, 5);
  const todayCollections = transactions
    .filter((tx) => tx.type === 'REPAYMENT' && getTimestampDate(tx.timestamp)?.toDateString() === new Date().toDateString())
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-12">
      <div className="rounded-[2.5rem] bg-slate-950 text-white p-8 lg:p-10 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Field Operations Live
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter italic">Agent Mission Control</h1>
            <p className="max-w-2xl text-sm text-slate-300 font-medium">
              Stay focused on today&apos;s collections, client follow-ups, and the facilities that need immediate action.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 min-w-[280px]">
            <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Clients</p>
              <p className="mt-2 text-3xl font-black">{clients.length}</p>
            </div>
            <div className="rounded-3xl bg-emerald-400/10 border border-emerald-400/20 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Collected Today</p>
              <p className="mt-2 text-3xl font-black">{formatCurrency(todayCollections)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 rounded-[2rem] border border-slate-200 shadow-none bg-white">
          <CardContent className="p-0">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Priority Collections</h2>
                <p className="text-sm text-slate-500 mt-1">Field-ready accounts with live balances and upcoming due dates.</p>
              </div>
              <Button onClick={() => onNavigate('payments')} className="bg-slate-900 hover:bg-slate-800 text-white font-black">
                Open Payments
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {priorityCollections.length === 0 ? (
                <div className="p-8 text-sm text-slate-500 italic">No active collections are assigned right now.</div>
              ) : (
                priorityCollections.map((loan) => (
                  <div key={loan.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-black text-slate-900">{loan.clientName || clients.find((client) => client.id === loan.clientId)?.name || 'Unknown Client'}</p>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mt-1">
                        Loan #{loan.id.slice(0, 8).toUpperCase()} • Due {formatDateLabel(loan.nextDueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Outstanding</p>
                        <p className="text-xl font-black text-slate-900">{formatCurrency(loan.outstandingBalance || 0)}</p>
                      </div>
                      <Button variant="outline" className="font-black" onClick={() => onNavigate('payments')}>
                        Collect
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-slate-200 shadow-none bg-white">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Field Shortcuts</h3>
            <Button variant="outline" className="w-full justify-start font-black" onClick={() => onNavigate('clients')}>
              Client Management
            </Button>
            <Button variant="outline" className="w-full justify-start font-black" onClick={() => onNavigate('due-loans')}>
              Due &amp; Overdue Tracking
            </Button>
            <Button variant="outline" className="w-full justify-start font-black" onClick={() => onNavigate('transactions')}>
              Transaction History
            </Button>
            <Button className="w-full justify-start bg-emerald-600 hover:bg-emerald-700 text-white font-black" onClick={() => onNavigate('payments')}>
              Payment Collection
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function DashboardView({ 
  view,
  clients, 
  loans, 
  applications, 
  role, 
  users, 
  transactions, 
  onNavigate, 
  onUpdateUserStatus,
  handleStageTransition,
  fetchCRBReport,
  workflowHistory,
  handleSaveManualCRB,
  loanProducts,
  repaymentSchedules,
  runWorkflowMigration,
  recordWorkflowHistory,
  managerNote,
  setManagerNote,
  sessionProfile,
  user,
  generateReceipt
}: { 
  view: View,
  clients: any[], 
  loans: any[], 
  applications: any[], 
  role: UserRole, 
  users: any[], 
  transactions: any[], 
  onNavigate: (v: View) => void, 
  onUpdateUserStatus: (user: any, status: UserStatus) => Promise<void>,
  handleStageTransition: (app: any, stage: LoanStage, comment?: string) => Promise<boolean>,
  fetchCRBReport: (app: any) => Promise<void>,
  workflowHistory: any[],
  handleSaveManualCRB: (appId: string, score: number, summary: string) => Promise<void>,
  loanProducts: LoanProduct[],
  repaymentSchedules: any[],
  runWorkflowMigration: () => Promise<void>,
  recordWorkflowHistory: (loanId: string, fromStage: LoanStage | 'NONE', toStage: LoanStage, comment?: string) => Promise<void>,
  managerNote: string,
  setManagerNote: (value: string) => void,
  sessionProfile: AuthProfile | null,
  user: any,
  generateReceipt: any
}) {
  // Map App-level view to Manager internal tabs
  const activeManagerTab = view === 'manager-decision' ? 'decision' : 
                          view === 'manager-portfolio' ? 'portfolio' : 
                          view === 'manager-risk' ? 'risk' : 
                          view === 'reports' ? 'reports' :
                          view === 'audit-logs' ? 'audit' : 'overview';
  const totalOutstanding = loans.reduce((acc, loan) => acc + (loan.outstandingBalance || 0), 0);
  const activeLoansCount = loans.filter(l => l.status === 'ACTIVE').length;
  const pendingAppsCount = applications.filter(a => ['PENDING', 'REVIEWED', 'ANALYZED'].includes(normalizeApplicationStage(a.current_stage, a.status))).length;

  if (role === 'OFFICER') {
    return (
      <LoanOfficerDashboardView 
        clients={clients} 
        loans={loans} 
        applications={applications} 
        transactions={transactions} 
        onNavigate={onNavigate} 
        handleStageTransition={handleStageTransition}
      />
    );
  }

  if (role === 'AGENT') {
    return (
      <AgentDashboardView
        clients={clients}
        loans={loans}
        transactions={transactions}
        onNavigate={onNavigate}
        sessionProfile={sessionProfile}
      />
    );
  }

  if (role === 'MANAGER') {
    return (
      <ManagerDashboardView
        clients={clients}
        loans={loans}
        applications={applications}
        users={users}
        transactions={transactions}
        repaymentSchedules={repaymentSchedules}
        onNavigate={onNavigate}
        handleStageTransition={handleStageTransition}
        loanProducts={loanProducts}
        recordWorkflowHistory={recordWorkflowHistory}
        generateReceipt={generateReceipt}
        managerNote={managerNote}
        setManagerNote={setManagerNote}
        activeTab={activeManagerTab}
        onTabChange={(tab: any) => {
          // If it maps to a top-level view, navigate App
          if (tab === 'decision') onNavigate('manager-decision');
          else if (tab === 'portfolio') onNavigate('manager-portfolio');
          else if (tab === 'risk') onNavigate('manager-risk');
          else if (tab === 'reports') onNavigate('reports');
          else if (tab === 'audit') onNavigate('audit-logs');
          else onNavigate('dashboard');
        }}
      />
    );
  }

  if (role === 'ADMIN') {
    return (
      <AdminDashboardView
        clients={clients}
        loans={loans}
        applications={applications}
        users={users}
        transactions={transactions}
        onNavigate={onNavigate}
        onUpdateUserStatus={onUpdateUserStatus}
        runWorkflowMigration={runWorkflowMigration}
      />
    );
  }

  if (role === 'CREDIT_ANALYST') {
    return (
      <CreditAnalystDashboardView 
        applications={applications} 
        clients={clients} 
        loans={loans} 
        onNavigate={onNavigate} 
        handleStageTransition={handleStageTransition}
        fetchCRBReport={fetchCRBReport}
        handleSaveManualCRB={handleSaveManualCRB}
      />
    );
  }

  return (
    <div className="text-sm text-slate-500">No dashboard available for role: {role}</div>
  );
}

function ManagerDashboardView({
  clients,
  loans,
  applications,
  users,
  transactions,
  repaymentSchedules,
  onNavigate,
  handleStageTransition,
  loanProducts,
  recordWorkflowHistory,
  generateReceipt,
  managerNote,
  setManagerNote,
  activeTab,
  onTabChange,
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  users: any[],
  transactions: any[],
  repaymentSchedules: any[],
  onNavigate: (view: View) => void,
  handleStageTransition: (app: any, stage: LoanStage, comment?: string) => Promise<boolean>,
  loanProducts: LoanProduct[],
  recordWorkflowHistory: (loanId: string, fromStage: LoanStage | 'NONE', toStage: LoanStage, comment?: string) => Promise<void>,
  generateReceipt: any,
  managerNote: string;
  setManagerNote: (v: string) => void;
  activeTab: 'overview' | 'decision' | 'portfolio' | 'risk' | 'reports' | 'audit';
  onTabChange: (tab: any) => void;
}) {
  const handleManagerApprove = async (application: any, productId: string, note: string, override = false) => {
    const product = loanProducts.find(item => item.id === productId);
    if (!product) {
      toast.error('Select an active loan product before approval.');
      return false;
    }
    if (!note.trim()) {
      toast.error('Manager approval requires a comment.');
      return false;
    }
    const analysisReasons = application.analysis?.reasons || application.latestDecision?.reasons || [];
    if (analysisReasons.length === 0) {
      toast.error('Manager approval requires analyst reasons on the application record.');
      return false;
    }

    const reviewerEmail = getActiveSessionEmail() || 'manager-console';
    const requestedAmount = application.requestedAmount || 0;
    const monthlyIncome = application.monthlyIncome || Math.round((application.annualIncome || 0) / 12);
    const clientName = application.clientSnapshot?.name || getApplicationClientLabel(application, clients);
    const originatingAgentEmail = application.originatingAgentEmail || application.assignedAgentEmail || application.metadata?.createdBy?.email || '';
    const appFee = calculateChargeValue(requestedAmount, product.charges.applicationFee);
    const procFee = calculateChargeValue(requestedAmount, product.charges.processingFee);
    const isLocalApplication = application.id?.startsWith('local-') || application.id?.startsWith('demo-') || getLocalApplications().some(item => item.id === application.id);

    try {
      if (isLocalApplication) {
        const approvedAt = new Date().toISOString();
        const updatedApplication = {
          ...application,
          status: 'APPROVED',
          current_stage: 'APPROVED',
          approvedAt,
          approvedBy: reviewerEmail,
          selectedProductId: product.id,
          managerNote: note,
          managerOverride: override,
          finalDecision: {
            decision: override ? 'OVERRIDE_APPROVE' : 'APPROVE',
            reasons: analysisReasons,
            comment: note,
            role: 'MANAGER',
            createdAt: approvedAt,
          },
          updatedAt: approvedAt,
        };
        saveLocalApplication(updatedApplication);
        await recordWorkflowHistory(application.id, normalizeApplicationStage(application.current_stage, application.status), 'APPROVED', `${override ? 'OVERRIDE_APPROVE' : 'FINAL_APPROVE'}: ${note || 'No note provided'}`);

        const loanId = `local-loan-${Date.now()}`;
        const newLoan = {
          id: loanId,
          clientId: application.clientId,
          applicationId: application.id,
          productId: product.id,
          productName: product.name,
          clientName,
          amount: requestedAmount,
          outstandingBalance: requestedAmount,
          interestRate: product.interestRate,
          status: 'PENDING_DISBURSEMENT',
          type: product.name,
          termMonths: application.termMonths || 1,
          monthlyIncome,
          originatingAgentEmail,
          assignedAgentEmail: originatingAgentEmail,
          approvedBy: reviewerEmail,
          metadata: {
            createdBy: application.metadata?.createdBy || null,
            approvedBy: reviewerEmail,
            approvedAt,
            feesApplied: { appFee, procFee },
            managerOverride: override,
            disbursementStatus: 'AWAITING_OFFICER_CONFIRMATION',
          },
          crb: application.crb || null,
          createdAt: approvedAt,
          updatedAt: approvedAt,
        };
        saveLocalLoan(newLoan);

        // Generate Decision Receipt
        await generateReceipt(
          loanId,
          'DECISION',
          `DEC-${application.id.slice(0, 6)}`,
          requestedAmount,
          reviewerEmail,
          clientName,
          'SYSTEM_LOCAL',
          `Local Loan Application ${application.id.slice(0, 8)} APPROVED.`,
          requestedAmount,
          { status: 'APPROVED', note },
          true
        );
        await createNotification(
          'LOAN_APPROVED',
          'Loan Approved',
          `Loan for ${clientName} has been approved and is awaiting loan officer disbursement confirmation.`,
          'CLIENT',
          loanId,
          application.id,
          { selectedProductId: product.id, override }
        );

        toast.success(override ? 'Override approval completed. Loan is awaiting disbursement confirmation.' : 'Application approved. Loan is awaiting disbursement confirmation.');
        return true;
      }

      const approvedAt = serverTimestamp();
      await updateDoc(doc(db, 'applications', application.id), {
        status: 'APPROVED',
        current_stage: 'APPROVED',
        approvedAt,
        approvedBy: reviewerEmail,
        selectedProductId: product.id,
        managerNote: note,
        managerOverride: override,
        finalDecision: {
          decision: override ? 'OVERRIDE_APPROVE' : 'APPROVE',
          reasons: analysisReasons,
          comment: note,
          role: 'MANAGER',
          createdAt: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
      });
      await recordWorkflowHistory(application.id, normalizeApplicationStage(application.current_stage, application.status), 'APPROVED', `${override ? 'OVERRIDE_APPROVE' : 'FINAL_APPROVE'}: ${note || 'No note provided'}`);

      const loanRef = await addDoc(collection(db, 'loans'), {
        clientId: application.clientId,
        applicationId: application.id,
        productId: product.id,
        productName: product.name,
        clientName,
        amount: requestedAmount,
        outstandingBalance: requestedAmount,
        interestRate: product.interestRate,
        status: 'PENDING_DISBURSEMENT',
        type: product.name,
        termMonths: application.termMonths || 1,
        monthlyIncome,
        originatingAgentEmail,
        assignedAgentEmail: originatingAgentEmail,
        approvedBy: reviewerEmail,
        metadata: {
          createdBy: application.metadata?.createdBy || null,
          approvedBy: reviewerEmail,
          approvedAt,
          feesApplied: { appFee, procFee },
          managerOverride: override,
          feeDistribution: product.feeDistribution,
          disbursementStatus: 'AWAITING_OFFICER_CONFIRMATION',
        },
        crb: application.crb || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // Generate Decision Receipt
      await generateReceipt(
        loanRef.id,
        'DECISION',
        `DEC-${application.id.slice(0, 6)}`,
        requestedAmount,
        reviewerEmail,
        clientName,
        'SYSTEM',
        `Loan Application ${application.id.slice(0, 8)} APPROVED.`,
        requestedAmount,
        { status: 'APPROVED', note }
      );
      await createNotification(
        'LOAN_APPROVED',
        'Loan Approved',
        `Loan for ${clientName} has been approved and is awaiting loan officer disbursement confirmation.`,
        'CLIENT',
        loanRef.id,
        application.id,
        { selectedProductId: product.id, override }
      );

      toast.success(override ? 'Override approval completed. Loan is awaiting disbursement confirmation.' : 'Application approved. Loan is awaiting disbursement confirmation.');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `applications/${application.id}`);
      return false;
    }
  };

  const handleManagerReject = async (application: any, note: string) => {
    if (!note.trim()) {
      toast.error('Manager rejection requires a comment.');
      return false;
    }
    const reviewerEmail = getActiveSessionEmail() || 'manager-console';
    const analysisReasons = application.analysis?.reasons || application.latestDecision?.reasons || [];
    const isLocalApplication = application.id?.startsWith('local-') || application.id?.startsWith('demo-') || getLocalApplications().some(item => item.id === application.id);
    try {
      if (isLocalApplication) {
        saveLocalApplication({
          ...application,
          status: 'REJECTED',
          current_stage: 'REJECTED',
          managerNote: note,
          approvedBy: reviewerEmail,
          finalDecision: {
            decision: 'REJECT',
            reasons: analysisReasons,
            comment: note,
            role: 'MANAGER',
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(doc(db, 'applications', application.id), {
          status: 'REJECTED',
          current_stage: 'REJECTED',
          managerNote: note,
          approvedBy: reviewerEmail,
          finalDecision: {
            decision: 'REJECT',
            reasons: analysisReasons,
            comment: note,
            role: 'MANAGER',
            createdAt: new Date().toISOString(),
          },
          updatedAt: serverTimestamp(),
        });
      }
      await recordWorkflowHistory(application.id, normalizeApplicationStage(application.current_stage, application.status), 'REJECTED', `FINAL_REJECT: ${note || 'No note provided'}`);
      
      // Generate Decision (Rejection) Receipt
      await generateReceipt(
        `REJ-${application.id.slice(0, 8)}`,
        'DECISION',
        `REJ-${Date.now().toString(36).toUpperCase()}`,
        0,
        reviewerEmail,
        application.clientSnapshot?.name || 'Applicant',
        'NOTICE',
        `Loan Application REJECTED. Reason: ${note || 'Credit policy requirements not met.'}`,
        0,
        { status: 'REJECTED', note },
        isLocalApplication
      );

      toast.success('Application rejected.');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${application.id}`);
      return false;
    }
  };

  const handleManagerSendBack = async (application: any, note: string) => {
    const isLocalApplication = application.id?.startsWith('local-') || application.id?.startsWith('demo-') || getLocalApplications().some(item => item.id === application.id);
    const sendBackNote = note || 'Returned for additional review.';
    const analysisReasons = application.analysis?.reasons || application.latestDecision?.reasons || [];
    try {
      if (isLocalApplication) {
        saveLocalApplication({
          ...application,
          status: 'REFERRED_BACK',
          current_stage: 'REFERRED_BACK',
          managerNote: sendBackNote,
          finalDecision: {
            decision: 'REFER_BACK',
            reasons: analysisReasons,
            comment: sendBackNote,
            role: 'MANAGER',
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(doc(db, 'applications', application.id), {
          status: 'REFERRED_BACK',
          current_stage: 'REFERRED_BACK',
          managerNote: sendBackNote,
          finalDecision: {
            decision: 'REFER_BACK',
            reasons: analysisReasons,
            comment: sendBackNote,
            role: 'MANAGER',
            createdAt: new Date().toISOString(),
          },
          updatedAt: serverTimestamp(),
        });
      }
      await recordWorkflowHistory(application.id, normalizeApplicationStage(application.current_stage, application.status), 'REFERRED_BACK', `SEND_BACK: ${sendBackNote}`);
      toast.success('Application returned to review.');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${application.id}`);
      return false;
    }
  };

  return (
    <ManagerCommandCenter
      clients={clients}
      loans={loans}
      applications={applications}
      users={users}
      transactions={transactions}
      repaymentSchedules={repaymentSchedules}
      onNavigate={onNavigate}
      loanProducts={loanProducts}
      onApprove={handleManagerApprove}
      onReject={handleManagerReject}
      onSendBack={handleManagerSendBack}
      activeTab={activeTab}
      onTabChange={onTabChange}
      managerNote={managerNote}
      setManagerNote={setManagerNote}
    />
  );
}

function ManagerCommandCenter({
  clients,
  loans,
  applications,
  users,
  transactions,
  repaymentSchedules,
  onNavigate,
  loanProducts,
  onApprove,
  onReject,
  onSendBack,
  activeTab,
  onTabChange,
  managerNote,
  setManagerNote,
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  users: any[],
  transactions: any[],
  repaymentSchedules: any[],
  onNavigate: (view: View) => void,
  loanProducts: LoanProduct[],
  onApprove: (application: any, productId: string, note: string, override?: boolean) => Promise<boolean>,
  onReject: (application: any, note: string) => Promise<boolean>,
  onSendBack: (application: any, note: string) => Promise<boolean>,
  activeTab: 'overview' | 'decision' | 'portfolio' | 'risk' | 'reports' | 'audit';
  onTabChange: (tab: any) => void;
  managerNote: string;
  setManagerNote: (v: string) => void;
}) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [selectedProductId, setSelectedProductId] = useState('');

  const finStats = calculateFinancialStats(transactions);
  const portStats = calculatePortfolioStats(loans, repaymentSchedules);
  const anomalies = buildAnomalies({ users, applications, loans, transactions });
  const auditLogs = buildAuditLogs({ users, clients, applications, loans, transactions });
  const defaultedLoans = loans.filter(loan => loan.status === 'DEFAULTED');
  const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');
  const todayApprovals = applications.filter(app => {
    if (normalizeApplicationStage(app.current_stage, app.status) !== 'APPROVED') return false;
    return formatDateLabel(app.approvedAt || app.updatedAt) === formatDateLabel(new Date());
  }).length;

  const queue = applications
    .filter(app => normalizeApplicationStage(app.current_stage, app.status) === 'ANALYZED')
    .map(app => {
      const created = getTimestampDate(app.updatedAt || app.createdAt);
      const waitHours = created ? Math.max(1, Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60))) : 0;
      const riskLevel = app.crb?.riskLevel || ((app.crb?.score || 0) < 450 ? 'HIGH' : (app.crb?.score || 0) < 620 ? 'MEDIUM' : 'LOW');
      const riskRank = riskLevel === 'HIGH' ? 3 : riskLevel === 'MEDIUM' ? 2 : 1;
      const analystRecommendation = String(app.analysis?.decision || app.analystRecommendation || app.recommendation || 'PENDING ANALYST').toUpperCase();
      return {
        ...app,
        clientLabel: getApplicationClientLabel(app, clients),
        waitHours,
        riskLevel,
        riskRank,
        analystRecommendation,
      };
    })
    .filter(app => riskFilter === 'ALL' || app.riskLevel === riskFilter)
    .sort((left, right) => {
      if (right.riskRank !== left.riskRank) return right.riskRank - left.riskRank;
      if ((right.requestedAmount || 0) !== (left.requestedAmount || 0)) return (right.requestedAmount || 0) - (left.requestedAmount || 0);
      return right.waitHours - left.waitHours;
    });

  useEffect(() => {
    if (!selectedAppId && queue.length > 0) {
      setSelectedAppId(queue[0].id);
      return;
    }
    if (selectedAppId && !queue.some(app => app.id === selectedAppId)) {
      setSelectedAppId(queue[0]?.id || null);
    }
  }, [queue, selectedAppId]);

  useEffect(() => {
    if (!selectedProductId) {
      const firstActiveProduct = loanProducts.find(product => product.status === 'ACTIVE');
      if (firstActiveProduct) setSelectedProductId(firstActiveProduct.id);
    }
  }, [loanProducts, selectedProductId]);

  const selectedApp = queue.find(app => app.id === selectedAppId) || queue[0] || null;
  const selectedProduct = loanProducts.find(product => product.id === selectedProductId) || loanProducts.find(product => product.status === 'ACTIVE') || null;
  const projectedInstallment = selectedApp && selectedProduct
    ? calculateAmortizedInstallment(selectedApp.requestedAmount || 0, selectedProduct.interestRate, selectedApp.termMonths || 1)
    : 0;
  const applicationFee = selectedApp && selectedProduct ? calculateChargeValue(selectedApp.requestedAmount || 0, selectedProduct.charges.applicationFee) : 0;
  const processingFee = selectedApp && selectedProduct ? calculateChargeValue(selectedApp.requestedAmount || 0, selectedProduct.charges.processingFee) : 0;
  const totalPayable = projectedInstallment * (selectedApp?.termMonths || 0);
  const totalInterest = Math.max(0, totalPayable - (selectedApp?.requestedAmount || 0));
  const selectedImpact = getManagerDecisionImpact(selectedApp, portStats, totalInterest + applicationFee + processingFee);
  const riskMix = buildManagerRiskMix(activeLoans);
  const portfolioTrend = buildManagerPortfolioTrend(loans, transactions);
  const alerts = buildManagerAlerts(applications, defaultedLoans, portStats);
  const riskSegments = buildManagerRiskSegments(applications, loans);
  const managerAudit = auditLogs.filter(log => String(log.user || '').toLowerCase().includes('manager')).slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6 pb-10">
      <ManagerHero
        activeLoans={portStats.activeCount}
        totalDisbursed={finStats.disbursed}
        outstanding={portStats.totalOutstanding}
        parRatio={portStats.parRatio}
        nplCount={portStats.nplCount}
        todayApprovals={todayApprovals}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onNavigate={onNavigate}
        selectedApp={selectedApp}
        onRiskFilterToggle={() => setRiskFilter(prev => prev === 'ALL' ? 'HIGH' : 'ALL')}
        selectedProductId={selectedProductId}
        managerNote={managerNote}
        onApprove={onApprove}
        onReject={onReject}
        onSendBack={onSendBack}
      />
      {activeTab === 'overview' && <ManagerOverviewTab portfolioTrend={portfolioTrend} riskMix={riskMix} alerts={alerts} finStats={finStats} applications={applications} portStats={portStats} />}
      {activeTab === 'decision' && <ManagerDecisionTab queue={queue} selectedApp={selectedApp} selectedProductId={selectedProductId} setSelectedProductId={setSelectedProductId} loanProducts={loanProducts} managerNote={managerNote} setManagerNote={setManagerNote} setSelectedAppId={setSelectedAppId} selectedImpact={selectedImpact} projectedInstallment={projectedInstallment} totalPayable={totalPayable} totalInterest={totalInterest} applicationFee={applicationFee} processingFee={processingFee} onApprove={onApprove} onReject={onReject} onSendBack={onSendBack} />}
      {activeTab === 'portfolio' && <ManagerPortfolioTab portStats={portStats} activeLoans={activeLoans} portfolioTrend={portfolioTrend} riskSegments={riskSegments} />}
      {activeTab === 'risk' && <ManagerRiskTab anomalies={anomalies} riskSegments={riskSegments} applications={applications} />}
      {activeTab === 'reports' && <ManagerReportsTab finStats={finStats} portStats={portStats} todayApprovals={todayApprovals} onNavigate={onNavigate} />}
      {activeTab === 'audit' && <ManagerAuditTab logs={managerAudit.length > 0 ? managerAudit : auditLogs.slice(0, 10)} anomalies={anomalies} applications={applications} />}
    </motion.div>
  );
}

function buildManagerRiskMix(activeLoans: any[]) {
  return [
    { name: 'Low', value: activeLoans.filter(loan => loan.crb?.riskLevel === 'LOW').length, fill: '#10B981' },
    { name: 'Medium', value: activeLoans.filter(loan => loan.crb?.riskLevel === 'MEDIUM').length, fill: '#F59E0B' },
    { name: 'High', value: activeLoans.filter(loan => loan.crb?.riskLevel === 'HIGH').length, fill: '#EF4444' },
  ].filter(item => item.value > 0);
}

function buildManagerPortfolioTrend(loans: any[], transactions: any[]) {
  return Array.from({ length: 6 }).map((_, index) => {
    const bucket = new Date();
    bucket.setDate(1);
    bucket.setMonth(bucket.getMonth() - (5 - index));
    const month = bucket.toLocaleDateString(undefined, { month: 'short' });
    const disbursed = loans
      .filter(loan => {
        const date = getTimestampDate(loan.disbursedAt || loan.createdAt);
        return date && date.getMonth() === bucket.getMonth() && date.getFullYear() === bucket.getFullYear();
      })
      .reduce((sum, loan) => sum + (loan.amount || 0), 0);
    const repaid = transactions
      .filter(transaction => {
        const date = getTimestampDate(transaction.timestamp);
        return transaction.type === 'REPAYMENT' && date && date.getMonth() === bucket.getMonth() && date.getFullYear() === bucket.getFullYear();
      })
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
    return { month, disbursed, repaid };
  });
}

function buildManagerAlerts(applications: any[], defaultedLoans: any[], portStats: any) {
  return [
    { id: 'high-risk', tone: 'critical', text: `${applications.filter(app => normalizeApplicationStage(app.current_stage, app.status) === 'ANALYZED' && app.crb?.riskLevel === 'HIGH').length} high-risk loans awaiting decision` },
    { id: 'overdue', tone: defaultedLoans.length > 0 ? 'critical' : 'healthy', text: `${defaultedLoans.length} overdue loans require attention today` },
    { id: 'par', tone: portStats.parRatio > 10 ? 'critical' : portStats.parRatio > 5 ? 'warning' : 'healthy', text: `PAR is ${portStats.parRatio.toFixed(1)}%` },
  ];
}

function buildManagerRiskSegments(applications: any[], loans: any[]) {
  return [
    { label: 'Repeat defaulters', value: loans.filter(loan => loan.status === 'DEFAULTED').length, description: 'Loans currently defaulted' },
    { label: 'High-risk CRB cluster', value: applications.filter(app => app.crb?.riskLevel === 'HIGH').length, description: 'Applications with elevated bureau risk' },
    { label: 'Large-ticket exposure', value: applications.filter(app => (app.requestedAmount || 0) >= 300000).length, description: 'Applications above MWK 300,000' },
  ];
}

function getManagerDecisionImpact(application: any, portStats: any, expectedRevenue: number) {
  if (!application) return { riskDelta: 0, revenueDelta: 0 };
  const amount = application.requestedAmount || 0;
  const riskWeight = application.riskLevel === 'HIGH' ? 2.4 : application.riskLevel === 'MEDIUM' ? 1.2 : 0.4;
  const riskDelta = portStats.totalOutstanding > 0 ? ((amount * riskWeight) / Math.max(portStats.totalOutstanding, 1)) * 100 : 0;
  return { riskDelta, revenueDelta: expectedRevenue };
}

function ManagerHero({ activeLoans, totalDisbursed, outstanding, parRatio, nplCount, todayApprovals, activeTab, onTabChange, onNavigate, selectedApp, onRiskFilterToggle, selectedProductId, managerNote, onApprove, onReject, onSendBack }: any) {
  const canSubmitDecision = Boolean(selectedApp);
  const canApprove = Boolean(selectedApp && selectedProductId);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(32,140,162,0.18),_transparent_40%),linear-gradient(135deg,#f8fafc_0%,#f1f5f9_100%)] p-8 shadow-xl shadow-brand-950/5 relative overflow-hidden group">
      {/* Decorative backdrop elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-400/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-brand-400/10 transition-colors duration-700" />
      
      <div className="flex flex-col gap-8 relative z-10">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 pb-6 border-b border-white/50">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-600 mb-2 px-3 py-1 bg-brand-100/50 rounded-full inline-block">Management Terminal</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-950">Console Center</h2>
            <p className="text-sm font-medium text-slate-500 max-w-2xl leading-relaxed">Decision-first logic engine. Monitor portfolio health, override risk parameters, and authorize capital flow.</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-right hidden sm:block">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Station</p>
               <p className="text-sm font-black text-slate-900">OPERATIONS CONTROL</p>
             </div>
             <div className="h-10 w-10 rounded-2xl bg-slate-950 flex items-center justify-center text-white shadow-lg rotate-3">
               <ShieldCheck size={20} />
             </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard title="Active Units" value={String(activeLoans)} trend="Active Portfolio" icon={<Briefcase size={14}/>} />
          <StatCard title="Capital Deployed" value={formatCurrency(totalDisbursed)} trend="Total Disbursement" icon={<ArrowUpRight size={14}/>} />
          <StatCard title="Recovery Target" value={formatCurrency(outstanding)} trend="Outstanding Capital" icon={<TrendingUp size={14}/>} />
          <StatCard 
            title="PAR Index" 
            value={`${parRatio.toFixed(1)}%`} 
            trend={parRatio > 10 ? 'CRITICAL LIMIT' : 'HEALTHY STATUS'} 
            highlight={parRatio > 10}
            icon={<AlertCircle size={14}/>}
          />
          <StatCard 
            title="NPL Incident" 
            value={String(nplCount)} 
            trend="Under observation" 
            highlight={nplCount > 0}
            icon={<ShieldAlert size={14}/>} 
          />
          <StatCard title="Daily Quota" value={String(todayApprovals)} trend="Today's Approvals" icon={<CheckCircle2 size={14}/>} />
        </div>


        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 backdrop-blur-sm">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Context Ribbon</p>
            <p className="text-sm font-semibold text-slate-900">Decision-first tooling that changes with the active tab.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === 'decision' ? (
              <>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => selectedApp && onApprove(selectedApp, selectedProductId, managerNote, false)} disabled={!canApprove}>
                  <CheckCircle2 size={14} className="mr-2" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="font-bold border-red-200 text-red-600" onClick={() => selectedApp && onReject(selectedApp, managerNote)} disabled={!canSubmitDecision}>
                  <AlertCircle size={14} className="mr-2" /> Reject
                </Button>
                <Button size="sm" variant="outline" className="font-bold" onClick={() => selectedApp && onSendBack(selectedApp, managerNote)} disabled={!canSubmitDecision}>
                  <RefreshCw size={14} className="mr-2" /> Send Back
                </Button>
                <Button size="sm" variant="outline" className="font-bold border-amber-200 text-amber-700" onClick={() => selectedApp ? onApprove(selectedApp, selectedProductId, managerNote, true) : onRiskFilterToggle()} disabled={!canApprove}>
                  <ShieldAlert size={14} className="mr-2" /> Override Risk
                </Button>
              </>
            ) : activeTab === 'reports' ? (
              <>
                <Button size="sm" className="bg-brand-600 font-bold" onClick={() => onNavigate('reports')}>
                  <FileDown size={14} className="mr-2" /> Export CSV
                </Button>
                <Button size="sm" variant="outline" className="font-bold" onClick={() => onNavigate('reports')}>Export PDF</Button>
                <Button size="sm" variant="outline" className="font-bold" onClick={() => onNavigate('reports')}>Export Excel</Button>
              </>
            ) : (
              <>
                <Button size="sm" className="bg-brand-600 font-bold" onClick={() => onTabChange('decision')}>
                  <Zap size={14} className="mr-2" /> Open Decision Queue
                </Button>
                <Button size="sm" variant="outline" className="font-bold" onClick={() => onNavigate('reports')}>
                  <BarChart3 size={14} className="mr-2" /> Reports
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ManagerOverviewTab({ portfolioTrend, riskMix, alerts, finStats, applications, portStats }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 border border-border shadow-none rounded-2xl bg-white p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Portfolio Trend</h3>
          <p className="text-sm text-slate-500 mt-1">Repayments versus disbursements over the last six months.</p>
          <div className="h-80 mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={portfolioTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="disbursed" stroke="#0A4969" strokeWidth={3} name="Disbursed" />
                <Line type="monotone" dataKey="repaid" stroke="#10B981" strokeWidth={3} name="Repaid" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Risk Distribution</h3>
          <div className="h-56 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskMix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={4}>
                  {riskMix.map((item: any) => <Cell key={item.name} fill={item.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Alerts Panel</h3>
          <div className="space-y-3 mt-4">
            {alerts.map((alert: any) => (
              <div key={alert.id} className={`rounded-xl border p-4 ${alert.tone === 'critical' ? 'border-red-200 bg-red-50' : alert.tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <p className={`text-sm font-bold ${alert.tone === 'critical' ? 'text-red-700' : alert.tone === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`}>{alert.text}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Revenue Snapshot</h3>
          <div className="space-y-4 mt-4">
            <div className="rounded-xl bg-slate-900 p-4 text-white">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Interest Earned</p>
              <p className="text-2xl font-black mt-2">{formatCurrency(finStats.interest)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Charges</p>
                <p className="text-xl font-black text-slate-900 mt-2">{formatCurrency(finStats.charges)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Penalties</p>
                <p className="text-xl font-black text-slate-900 mt-2">{formatCurrency(finStats.penalties)}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Smart Indicators</h3>
          <div className="space-y-4 mt-4">
            <div className={`rounded-xl p-4 ${portStats.parRatio > 10 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.25em]">Portfolio Health</p>
              <p className="text-xl font-black mt-2">{portStats.parRatio > 10 ? 'PAR Above Threshold' : 'Healthy Portfolio'}</p>
            </div>
            <div className={`rounded-xl p-4 ${applications.filter((app: any) => app.crb?.riskLevel === 'HIGH').length >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.25em]">High Risk Spike</p>
              <p className="text-xl font-black mt-2">{applications.filter((app: any) => app.crb?.riskLevel === 'HIGH').length} elevated-risk applications</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ManagerDecisionTab({ queue, selectedApp, selectedProductId, setSelectedProductId, loanProducts, managerNote, setManagerNote, setSelectedAppId, selectedImpact, projectedInstallment, totalPayable, totalInterest, applicationFee, processingFee, onApprove, onReject, onSendBack }: any) {
  const activeProducts = loanProducts.filter((product: LoanProduct) => product.status === 'ACTIVE');
  const canApprove = Boolean(selectedApp && selectedProductId);
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
      <Card className="md:col-span-2 border border-border shadow-none rounded-2xl bg-white overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Loans Awaiting Decision</h3>
          <p className="text-sm text-slate-500 mt-1">Priority sorting: High risk, high amount, oldest.</p>
        </div>
        <div className="max-h-[760px] overflow-y-auto divide-y divide-border">
          {queue.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 italic">No applications currently require manager intervention.</div>
          ) : queue.map((app: any) => (
            <button key={app.id} onClick={() => setSelectedAppId(app.id)} className={`w-full text-left p-4 transition-colors ${selectedApp?.id === app.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] opacity-60">Loan {app.id.slice(0, 8).toUpperCase()}</p>
                  <h4 className={`text-base font-black mt-2 ${selectedApp?.id === app.id ? 'text-white' : 'text-slate-900'}`}>{app.clientLabel}</h4>
                  <p className={`text-xs mt-1 ${selectedApp?.id === app.id ? 'text-slate-300' : 'text-slate-500'}`}>{formatCurrency(app.requestedAmount || 0)}</p>
                </div>
                <Badge className={`border ${app.riskLevel === 'HIGH' ? 'border-red-200 bg-red-50 text-red-700' : app.riskLevel === 'MEDIUM' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{app.riskLevel}</Badge>
              </div>
              <div className={`mt-3 flex items-center justify-between text-[11px] ${selectedApp?.id === app.id ? 'text-slate-300' : 'text-slate-500'}`}>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${app.analysis?.decision === 'APPROVE' ? 'bg-emerald-400' : app.analysis?.decision === 'REJECT' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <span className="font-bold uppercase tracking-widest">{app.analysis?.decision || 'PENDING ANALYSIS'}</span>
                </div>
                <span>{app.waitHours || 0}h waiting</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="md:col-span-2 border border-border shadow-none rounded-2xl bg-white overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Decision Workspace</h3>
          <p className="text-sm text-slate-500 mt-1">Show consequences before action.</p>
        </div>
        {selectedApp ? (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Applicant + Loan Summary</p>
                <p className="text-lg font-black text-slate-900 mt-2">{selectedApp.clientLabel}</p>
                <p className="text-sm text-slate-500 mt-1">{formatCurrency(selectedApp.requestedAmount || 0)} over {selectedApp.termMonths || 0} months</p>
              </div>
              <div className={`rounded-xl p-4 border transition-all ${
                selectedApp.analysis?.decision === 'REJECT' ? 'bg-red-50 border-red-100' : 
                selectedApp.analysis?.decision === 'APPROVE' ? 'bg-emerald-50 border-emerald-100' : 
                'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Analyst Recommendation</p>
                    <p className={`text-lg font-black mt-1 ${
                      selectedApp.analysis?.decision === 'REJECT' ? 'text-red-700' : 
                      selectedApp.analysis?.decision === 'APPROVE' ? 'text-emerald-700' : 
                      'text-slate-900'
                    }`}>
                      {selectedApp.analysis?.decision || 'Analysis Pending'}
                    </p>
                  </div>
                  {selectedApp.analysis?.analystName && (
                    <span className="text-[9px] font-black uppercase bg-white/50 px-2 py-1 rounded-md text-slate-400 border border-slate-100">
                      BY: {selectedApp.analysis.analystName}
                    </span>
                  )}
                </div>
                
                {selectedApp.analysis?.reasons && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {selectedApp.analysis.reasons.map((reason: string) => (
                      <span key={reason} className="text-[8px] font-black uppercase tracking-widest bg-white px-2 py-0.5 rounded border border-slate-100 text-slate-500">
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
                
                {selectedApp.analysis?.comment && (
                  <p className="text-[10px] text-slate-500 mt-3 italic line-clamp-2 border-t border-slate-100 pt-2">
                    "{selectedApp.analysis.comment}"
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Financial Projection</h4>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <MetricReadout label="Total Payable" value={formatCurrency(totalPayable)} />
                <MetricReadout label="Monthly Installment" value={formatCurrency(projectedInstallment)} />
                <MetricReadout label="Total Interest" value={formatCurrency(totalInterest)} />
                <MetricReadout label="Fees Applied" value={formatCurrency(applicationFee + processingFee)} />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Loan Product</label>
              <select className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                {activeProducts.map((product: LoanProduct) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.interestRate}%)</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Manager Note</label>
              <textarea rows={4} value={managerNote} onChange={(e) => setManagerNote(e.target.value)} placeholder="Add note, override rationale, or send-back instruction." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 resize-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button 
                aria-label="Approve Application"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black" 
                onClick={() => {
                  if (selectedApp.analysis?.decision === 'REJECT' && !managerNote) {
                    toast.error("Override Protocol: You are approving a loan rejected by the Analyst. A justification note is mandatory.");
                    return;
                  }
                  onApprove(selectedApp, selectedProductId, managerNote, false);
                }} 
                disabled={!canApprove}
              >
                Approve Application
              </Button>
              <Button 
                variant="outline" 
                className="font-black border-red-200 text-red-600" 
                onClick={() => {
                  if (selectedApp.analysis?.decision === 'APPROVE' && !managerNote) {
                    toast.error("Override Protocol: You are rejecting a loan approved by the Analyst. A justification note is mandatory.");
                    return;
                  }
                  onReject(selectedApp, managerNote);
                }}
              >
                FINAL REJECT
              </Button>
              <Button variant="outline" className="font-black border-slate-200 text-slate-700" onClick={() => onSendBack(selectedApp, managerNote)}>Send Back</Button>
              <Button 
                variant="outline" 
                className="font-black border-amber-200 text-amber-700 md:col-span-3" 
                onClick={() => {
                  if (!managerNote) {
                    toast.error("Manual Override Justification Required: Provide rationale to bypass standard protocol.");
                    return;
                  }
                  onApprove(selectedApp, selectedProductId, managerNote, true);
                }} 
                disabled={!canApprove}
              >
                Override & Approve
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-500 italic">Select an application to open the manager decision workspace.</div>
        )}
      </Card>

      <Card className="md:col-span-2 border border-border shadow-none rounded-2xl bg-slate-950 text-white overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Executive Intelligence</h3>
        </div>
        {selectedApp ? (
          <div className="p-5 space-y-5">
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Risk Snapshot</p>
              <p className="text-2xl font-black mt-2">{selectedApp.crb?.score || 'N/A'}</p>
              <p className="text-sm text-slate-300 mt-1">Risk Level: {selectedApp.riskLevel}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Critical Flags</p>
              <p className="text-sm text-slate-200 mt-3">{selectedApp.riskLevel === 'HIGH' ? 'High previous default probability' : 'Risk profile currently manageable.'}</p>
              <p className="text-sm text-slate-200 mt-2">{(selectedApp.requestedAmount || 0) > ((selectedApp.monthlyIncome || 0) * 4) ? 'Debt-to-income ratio may be too high.' : 'Debt-to-income ratio remains within expected bounds.'}</p>
            </div>
            <div className="rounded-2xl bg-brand-500/10 border border-brand-400/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-brand-200">Decision Impact Preview</p>
              <p className="text-sm text-white mt-3">If Approved: Portfolio Risk +{selectedImpact.riskDelta.toFixed(1)}%</p>
              <p className="text-sm text-white mt-2">Expected Revenue: +{formatCurrency(selectedImpact.revenueDelta)}</p>
              <p className="text-sm text-slate-300 mt-2">If Rejected: risk remains stable</p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-400 italic">Select a loan from the queue to reveal executive intelligence.</div>
        )}
      </Card>
    </div>
  );
}

function MetricReadout({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em]">{label}</p>
      <p className="text-xl font-black text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function ManagerPortfolioTab({ portStats, activeLoans, portfolioTrend, riskSegments }: any) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 border border-border shadow-none rounded-2xl bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Portfolio Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <StatCard title="Portfolio Value" value={formatCurrency(portStats.totalDisbursed)} trend="Issued capital" />
          <StatCard title="Outstanding" value={formatCurrency(portStats.totalOutstanding)} trend="Open exposure" />
          <StatCard title="PAR %" value={`${portStats.parRatio.toFixed(1)}%`} trend="Portfolio at risk" highlight={portStats.parRatio > 10} />
          <StatCard title="NPL %" value={`${activeLoans.length > 0 ? ((portStats.nplCount / activeLoans.length) * 100).toFixed(1) : '0.0'}%`} trend="Non-performing segment" />
          <StatCard title="Avg Loan" value={formatCurrency(activeLoans.length > 0 ? activeLoans.reduce((sum: number, loan: any) => sum + (loan.amount || 0), 0) / activeLoans.length : 0)} trend="Average ticket size" />
        </div>
        <div className="h-80 mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={portfolioTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="disbursed" stroke="#208CA2" fill="#42DAD9" fillOpacity={0.25} name="Disbursed" />
              <Area type="monotone" dataKey="repaid" stroke="#0A4969" fill="#0A4969" fillOpacity={0.12} name="Recovered" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Risk Segmentation</h3>
        <div className="space-y-4 mt-6">
          {riskSegments.map((segment: any) => (
            <div key={segment.label} className="rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{segment.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-2">{segment.value}</p>
              <p className="text-sm text-slate-500 mt-1">{segment.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ManagerRiskTab({ anomalies, riskSegments, applications }: any) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 border border-border shadow-none rounded-2xl bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Risk Control Console</h3>
        <p className="text-sm text-slate-500 mt-2">Identify high-risk patterns, enforce thresholds, and spot emerging clusters.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {riskSegments.map((segment: any) => (
            <div key={segment.label} className="rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{segment.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-2">{segment.value}</p>
              <p className="text-sm text-slate-500 mt-1">{segment.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {anomalies.slice(0, 8).map((anomaly: any) => (
            <div key={anomaly.id} className={`rounded-xl border p-4 ${anomaly.severity === 'CRITICAL' ? 'border-red-200 bg-red-50' : anomaly.severity === 'HIGH' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900">{anomaly.type.replace(/_/g, ' ')}</p>
                <Badge className={`border-none ${anomaly.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : anomaly.severity === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>{anomaly.severity}</Badge>
              </div>
              <p className="text-sm text-slate-600 mt-2">{anomaly.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border border-border shadow-none rounded-2xl bg-slate-950 text-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Policy Snapshot</h3>
        <div className="space-y-4 mt-6">
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">PAR Threshold</p>
            <p className="text-2xl font-black mt-2">10%</p>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">High Risk CRB Cutoff</p>
            <p className="text-2xl font-black mt-2">Below 450</p>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">High-Risk Applications</p>
            <p className="text-2xl font-black mt-2">{applications.filter((app: any) => app.crb?.riskLevel === 'HIGH').length}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ManagerReportsTab({ finStats, portStats, todayApprovals, onNavigate }: any) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 border border-border shadow-none rounded-2xl bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Executive Report Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Financial Summary</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{formatCurrency(finStats.revenue)}</p>
            <p className="text-sm text-slate-500 mt-1">Interest, charges, penalties</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Loan Performance</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{`${portStats.parRatio.toFixed(1)}%`}</p>
            <p className="text-sm text-slate-500 mt-1">Portfolio at risk</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Operational Performance</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{todayApprovals}</p>
            <p className="text-sm text-slate-500 mt-1">Approvals today</p>
          </div>
        </div>
        <Button className="mt-6 bg-brand-600 font-bold" onClick={() => onNavigate('reports')}>Open Full Reports Workspace</Button>
      </Card>

      <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Export Actions</h3>
        <div className="space-y-3 mt-6">
          <Button className="w-full bg-slate-900 text-white font-black" onClick={() => onNavigate('reports')}>Export CSV</Button>
          <Button className="w-full" variant="outline" onClick={() => onNavigate('reports')}>Export PDF</Button>
          <Button className="w-full" variant="outline" onClick={() => onNavigate('reports')}>Export Excel</Button>
        </div>
      </Card>
    </div>
  );
}

function ManagerAuditTab({ logs, anomalies, applications }: any) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 border border-border shadow-none rounded-2xl bg-white overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Decision and Override History</h3>
        </div>
        <div className="divide-y divide-border">
          {logs.map((log: any) => (
            <div key={log.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900">{log.action.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-400">{formatDateTimeLabel(log.timestamp)}</p>
              </div>
              <p className="text-sm text-slate-600 mt-2">{log.details}</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mt-2">{log.user}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border border-border shadow-none rounded-2xl bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Audit Summary</h3>
        <div className="space-y-4 mt-6">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Override Logs</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{applications.filter((app: any) => app.managerOverride).length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Audit Trail Entries</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{logs.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Critical Alerts</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{anomalies.filter((item: any) => item.severity === 'CRITICAL').length}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function calculateAIConfidenceScore(app: any) {
  if (!app) return 0;
  
  // Weights: CRB (40%), DTI (25%), History (20%), Stability (15%)
  const crbScore = app.crb?.score || 0;
  const crbNorm = Math.min(100, (crbScore / 999) * 100);
  
  const monthlyIncome = app.monthlyIncome || Math.round((app.annualIncome || 0) / 12);
  const monthlyInstallment = app.expected_installment || (app.requestedAmount * 0.1); 
  const dti = monthlyIncome > 0 ? (monthlyInstallment / monthlyIncome) : 1;
  const dtiNorm = Math.max(0, 100 - (dti * 100)); // Lower DTI is better
  
  // Simulated history and stability based on app data
  const historyNorm = app.repaymentHistory === 'GOOD' ? 100 : app.repaymentHistory === 'FAIR' ? 60 : 20;
  const stabilityNorm = app.yearsAtJob >= 2 ? 100 : app.yearsAtJob >= 1 ? 70 : 30;
  
  const finalScore = (crbNorm * 0.4) + (dtiNorm * 0.25) + (historyNorm * 0.2) + (stabilityNorm * 0.15);
  return Math.round(finalScore);
}



function AdminDashboardView({
  clients,
  loans,
  applications,
  users,
  transactions,
  onNavigate,
  onUpdateUserStatus,
  runWorkflowMigration
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  users: any[],
  transactions: any[],
  onNavigate: (view: View) => void,
  onUpdateUserStatus: (user: any, status: UserStatus) => Promise<void>,
  runWorkflowMigration: () => Promise<void>
}) {
  const totalPortfolioValue = loans.reduce((acc, loan) => acc + (loan.amount || 0), 0);
  const totalOutstanding = loans.reduce((acc, loan) => acc + (loan.outstandingBalance || 0), 0);
  const totalDisbursed = transactions.filter(t => t.type === 'DISBURSEMENT').reduce((acc, t) => acc + (t.amount || 0), 0);
  const totalCollected = transactions.filter(t => t.type === 'REPAYMENT').reduce((acc, t) => acc + (t.amount || 0), 0);
  const defaultRate = loans.length > 0 ? (loans.filter(l => l.status === 'DEFAULTED').length / loans.length) * 100 : 0;
  const activeStaff = users.filter(u => u.role === 'AGENT' || u.role === 'OFFICER').length;
  const pendingAgents = users.filter(u => u.role === 'AGENT' && normalizeUserStatus(u.status) === 'PENDING');
  const pendingApps = applications.filter(a => normalizeApplicationStage(a.current_stage, a.status) === 'PENDING');
  const activeLoans = loans.filter(l => l.status === 'ACTIVE').length;
  const repaymentRate = totalDisbursed > 0 ? (totalCollected / totalDisbursed) * 100 : 0;
  const kycReadyClients = clients.filter(client => client.idNumber || client.personalInfo?.idNumber).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Admin Command Center</h2>
          <p className="text-sm text-slate-500">Live governance view across onboarding, lending, risk, and operational throughput.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('users')}>
            <Users size={14} className="mr-2" />
            Review Users
          </Button>
          <Button variant="outline" size="sm" onClick={runWorkflowMigration}>
            <History size={14} className="mr-2" />
            Migrate Workflow
          </Button>
          <Button size="sm" className="bg-brand-600 hover:bg-brand-700 text-white" onClick={() => onNavigate('settings')}>
            <Settings size={14} className="mr-2" />
            System Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Portfolio Value" value={`MWK ${totalPortfolioValue.toLocaleString()}`} trend="Principal issued" icon={<Briefcase className="text-brand-500" size={18} />} iconBg="bg-brand-50" />
        <StatCard title="Outstanding Balance" value={`MWK ${totalOutstanding.toLocaleString()}`} trend="Still on book" icon={<AlertCircle className="text-amber-500" size={18} />} iconBg="bg-amber-50" />
        <StatCard title="Repayment Rate" value={`${repaymentRate.toFixed(1)}%`} trend={repaymentRate >= 80 ? 'Healthy recovery' : 'Needs attention'} icon={<TrendingUp className="text-emerald-500" size={18} />} iconBg="bg-emerald-50" />
        <StatCard title="Pending Agents" value={pendingAgents.length.toString()} trend="Awaiting approval" icon={<UserPlus className="text-blue-500" size={18} />} iconBg="bg-blue-50" />
        <StatCard title="Pending Applications" value={pendingApps.length.toString()} trend="Credit queue" icon={<FileText className="text-indigo-500" size={18} />} iconBg="bg-indigo-50" />
        <StatCard title="Active Loans" value={activeLoans.toString()} trend="Running accounts" icon={<CheckCircle2 className="text-emerald-500" size={18} />} iconBg="bg-emerald-50" />
        <StatCard title="KYC Coverage" value={`${clients.length ? ((kycReadyClients / clients.length) * 100).toFixed(1) : '0.0'}%`} trend="Client registry completeness" icon={<ShieldAlert className="text-slate-500" size={18} />} iconBg="bg-slate-100" />
        <StatCard title="Active Staff" value={activeStaff.toString()} trend="Agents and officers" icon={<Users className="text-purple-500" size={18} />} iconBg="bg-purple-50" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Pending Agent Approval Queue</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Approve or reject newly registered agents without leaving the dashboard.</p>
            </div>
            <Button variant="link" className="text-xs text-brand-500 p-0 h-auto" onClick={() => onNavigate('users')}>Open User Management</Button>
          </div>
          <Table className="text-[13px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Agent</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Phone</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">National ID</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingAgents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic">No pending agents right now.</TableCell>
                </TableRow>
              ) : (
                pendingAgents.slice(0, 6).map(agent => (
                  <TableRow key={agent.id} className="border-border">
                    <TableCell className="px-5 py-3">
                      <p className="font-bold text-foreground">{agent.name || 'Unnamed Agent'}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{agent.email}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-muted-foreground">{agent.phone || 'N/A'}</TableCell>
                    <TableCell className="px-5 py-3 font-mono text-[12px]">{agent.nationalId || 'N/A'}</TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="h-8 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700" onClick={() => onUpdateUserStatus(agent, 'ACTIVE')}>
                          APPROVE
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold border-red-200 text-red-600 hover:bg-red-50" onClick={() => onUpdateUserStatus(agent, 'REJECTED')}>
                          REJECT
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-5">
          <Card className="border border-border shadow-none rounded-lg bg-[#1A1C23] text-white p-5">
            <div className="flex items-center gap-2 text-sidebar-foreground mb-4">
              <TrendingUp size={16} />
              <h4 className="font-bold text-[10px] uppercase tracking-widest">Operational Health</h4>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>Repayment Recovery</span>
                  <span>{repaymentRate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, repaymentRate)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>Default Exposure</span>
                  <span>{defaultRate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400" style={{ width: `${Math.min(100, defaultRate * 3)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>KYC Readiness</span>
                  <span>{clients.length ? ((kycReadyClients / clients.length) * 100).toFixed(1) : '0.0'}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400" style={{ width: `${clients.length ? (kycReadyClients / clients.length) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="border border-border shadow-none rounded-lg bg-white p-5">
            <h3 className="text-sm font-bold mb-4">Quick Controls</h3>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3 h-10 border-border text-xs font-bold" onClick={() => onNavigate('users')}>
                <Users size={16} className="text-brand-600" />
                User Access Control
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-10 border-border text-xs font-bold" onClick={() => onNavigate('audit-logs')}>
                <ShieldAlert size={16} className="text-amber-600" />
                Audit Logs
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-10 border-border text-xs font-bold" onClick={() => onNavigate('loan-products')}>
                <Briefcase size={16} className="text-blue-600" />
                Loan Products
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-10 border-border text-xs font-bold" onClick={() => onNavigate('settings')}>
                <Settings size={16} className="text-slate-600" />
                System Configuration
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Credit Pipeline</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Most recent applications waiting for officer attention.</p>
            </div>
            <Button variant="link" className="text-xs text-brand-500 p-0 h-auto" onClick={() => onNavigate('applications')}>All Applications</Button>
          </div>
          <Table className="text-[13px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Client</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Amount</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.slice(0, 6).map(app => (
                <TableRow key={app.id} className="border-border">
                  <TableCell className="px-5 py-3">
                    <p className="font-bold text-foreground">{app.clientSnapshot?.name || `Client ${app.clientId?.slice(0, 8) || 'N/A'}`}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">#{app.id.slice(0, 8).toUpperCase()}</p>
                  </TableCell>
                  <TableCell className="px-5 py-3 font-semibold">MWK {(app.requestedAmount || 0).toLocaleString()}</TableCell>
                  <TableCell className="px-5 py-3">
                    <Badge className={`${app.status === 'SUBMITTED' || app.status === 'IN_REVIEW' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'} border-none text-[10px] font-bold`}>
                      {app.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {applications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-10 text-muted-foreground italic">No applications available.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Recent Financial Activity</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Latest disbursements and repayments across the system.</p>
            </div>
            <Button variant="link" className="text-xs text-brand-500 p-0 h-auto" onClick={() => onNavigate('reports')}>Financial Reports</Button>
          </div>
          <Table className="text-[13px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Type</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Amount</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-11 px-5">Method</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.slice(0, 6).map(tx => (
                <TableRow key={tx.id} className="border-border">
                  <TableCell className="px-5 py-3 font-semibold">{tx.type}</TableCell>
                  <TableCell className="px-5 py-3">MWK {(tx.amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground">{tx.method || 'N/A'}</TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-10 text-muted-foreground italic">No financial activity recorded yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </motion.div>
  );
}

function ActivityItem({ icon, title, subtitle, iconColor = "text-brand-500" }: any) {
  return (
    <div className="flex gap-3 text-[12px]">
      <div className={`w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center font-bold shrink-0 ${iconColor}`}>
        {icon}
      </div>
      <div className="flex flex-col justify-center">
        <p className="font-medium text-foreground leading-tight">{title}</p>
        <span className="text-muted-foreground text-[11px]">{subtitle}</span>
      </div>
    </div>
  );
}

function PortfolioHealthChart() {
  const data = [
    { name: 'Active', value: 85, color: '#10B981' },
    { name: 'Grace Period', value: 10, color: '#F59E0B' },
    { name: 'Defaulted', value: 5, color: '#EF4444' },
  ];

  return (
    <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Portfolio Health</h3>
      </div>
      <div className="p-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SystemSettingsView() {
  const [settings, setSettings] = useState({
    baseInterestRate: 5.25,
    maxLoanAmount: 1000000,
    minCreditScore: 650,
    automaticApproval: false
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDocFromServer(doc(db, 'settings', 'global'));
        if (docSnap.exists()) {
          setSettings(docSnap.data() as any);
        }
      } catch (e) {
        console.error("Error fetching settings", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'settings', 'global'), settings);
      toast.success("System settings updated successfully");
    } catch (e: any) {
      if (e.code === 'not-found') {
        try {
          await import('firebase/firestore').then(({ setDoc }) => 
            setDoc(doc(db, 'settings', 'global'), settings)
          );
          toast.success("System settings initialized and saved");
        } catch (createError) {
          handleFirestoreError(createError, OperationType.WRITE, 'settings/global');
        }
      } else {
        handleFirestoreError(e, OperationType.UPDATE, 'settings/global');
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Configuration</h2>
          <p className="text-muted-foreground text-sm">Global parameters for the LMS Authority engine.</p>
        </div>
        <Button onClick={handleSave} className="bg-brand-600 hover:bg-brand-700 text-white font-bold">
          SAVE CHANGES
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border border-border shadow-none rounded-lg bg-white p-6 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Lending Parameters</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold">Base Interest Rate (%)</label>
              <Input 
                type="number" 
                value={settings.baseInterestRate} 
                onChange={e => setSettings({...settings, baseInterestRate: parseFloat(e.target.value)})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold">Maximum Loan Amount (MWK )</label>
              <Input 
                type="number" 
                value={settings.maxLoanAmount} 
                onChange={e => setSettings({...settings, maxLoanAmount: parseInt(e.target.value)})}
              />
            </div>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white p-6 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Risk Thresholds</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold">Minimum Credit Score</label>
              <Input 
                type="number" 
                value={settings.minCreditScore} 
                onChange={e => setSettings({...settings, minCreditScore: parseInt(e.target.value)})}
              />
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-slate-50">
              <div>
                <p className="text-xs font-bold">Automatic Approval</p>
                <p className="text-[10px] text-muted-foreground">Enable AI-driven auto-approval for low-risk apps.</p>
              </div>
              <input 
                type="checkbox" 
                checked={settings.automaticApproval} 
                onChange={e => setSettings({...settings, automaticApproval: e.target.checked})}
                className="w-5 h-5 accent-brand-600"
              />
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
function StatCard({ title, value, trend, icon, iconBg, highlight }: any) {
  const testId = `stat-card-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  return (
    <Card data-testid={testId} className={`border border-border shadow-none rounded-xl bg-white overflow-hidden transition-all hover:shadow-md ${highlight ? 'ring-2 ring-red-500/20 bg-red-50/10' : ''}`}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-4">
          <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-none">{title}</h4>
          {icon && (
            <div className={`p-2 rounded-lg ${iconBg || 'bg-slate-50'}`}>
              {icon}
            </div>
          )}
        </div>
        <p className={`text-2xl font-black text-slate-900 leading-tight ${highlight ? 'text-red-600' : ''}`}>{value}</p>
        <p className={`text-[11px] mt-2 font-bold uppercase tracking-tight ${highlight ? 'text-red-500' : 'text-slate-400'}`}>
          {trend}
        </p>
      </CardContent>
    </Card>
  );
}


function ActivityRow({ name, type, amount, status, time, initials, color }: any) {
  return (
    <TableRow className="border-slate-50 hover:bg-slate-50/50 transition-colors">
      <TableCell className="py-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${color}`}>
            {initials}
          </div>
          <span className="font-semibold text-sm">{name}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-slate-500">{type}</TableCell>
      <TableCell className="font-bold text-sm">{amount}</TableCell>
      <TableCell>
        <Badge variant="secondary" className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
          status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 
          status === 'IN REVIEW' ? 'bg-slate-100 text-slate-600' : 
          'bg-blue-50 text-blue-700'
        }`}>
          {status}
        </Badge>
      </TableCell>
      <TableCell className="text-right text-xs text-slate-400 font-medium">{time}</TableCell>
    </TableRow>
  );
}

function AlertItem({ type, title, description, action }: any) {
  const colors = {
    danger: 'border-red-500 bg-red-50/50',
    info: 'border-blue-500 bg-blue-50/50',
    success: 'border-emerald-500 bg-emerald-50/50'
  };
  
  const iconColors = {
    danger: 'text-red-500',
    info: 'text-blue-500',
    success: 'text-emerald-500'
  };

  return (
    <div className={`p-4 rounded-xl border-l-4 ${colors[type as keyof typeof colors]} space-y-2`}>
      <div className="flex items-center gap-2">
        {type === 'danger' && <AlertCircle className={iconColors.danger} size={18} />}
        {type === 'info' && <HelpCircle className={iconColors.info} size={18} />}
        {type === 'success' && <CheckCircle2 className={iconColors.success} size={18} />}
        <h4 className="font-bold text-sm">{title}</h4>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
      {action && (
        <button className={`text-[10px] font-black uppercase tracking-widest ${iconColors[type as keyof typeof iconColors]} hover:underline`}>
          {action}
        </button>
      )}
    </div>
  );
}

function CreditAnalystDashboardView({
  applications,
  clients,
  loans,
  onNavigate,
  handleStageTransition,
  fetchCRBReport,
  handleSaveManualCRB,
}: {
  applications: any[],
  clients: any[],
  loans: any[],
  onNavigate: (view: View) => void,
  handleStageTransition: (app: any, stage: LoanStage, comment: string, analysisData?: any) => Promise<boolean>,
  fetchCRBReport: (app: any) => Promise<any>,
  handleSaveManualCRB: (app: any, score: number, summary: string) => Promise<void>,
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'applications' | 'risk' | 'reports'>('overview');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{title: string, value: string} | null>(null);
  
  // Decision Engine State
  const [recommendation, setRecommendation] = useState<'APPROVE' | 'REJECT' | 'REFER_BACK' | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [analystComment, setAnalystComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingAnalysis = applications.filter(app => normalizeApplicationStage(app.current_stage, app.status) === 'REVIEWED');
  const highRiskCount = applications.filter(app => (app.crb?.score || 0) < 450).length;

  const queue = applications
    .filter(app => normalizeApplicationStage(app.current_stage, app.status) === 'REVIEWED')
    .map(app => {
      const sla = calculateSLA(app);
      return {
        ...app,
        clientLabel: app.clientSnapshot?.name || clients.find(c => c.id === app.clientId)?.name || 'Unknown Client',
        riskLevel: (app.crb?.score || 0) < 450 ? 'HIGH' : (app.crb?.score || 0) < 620 ? 'MEDIUM' : 'LOW',
        sla
      };
    })
    .sort((a, b) => {
       // Priority sorting: SLA violation first, then high risk, then high amount
       if (a.sla.status === 'VIOLATED' && b.sla.status !== 'VIOLATED') return -1;
       if (a.sla.status !== 'VIOLATED' && b.sla.status === 'VIOLATED') return 1;
       if (a.riskLevel === 'HIGH' && b.riskLevel !== 'HIGH') return -1;
       return (b.requestedAmount || 0) - (a.requestedAmount || 0);
    });

  const selectedApp = queue.find(app => app.id === selectedAppId) || null;

  const reasonOptions = {
    APPROVE: ['Strong income', 'Low CRB risk', 'Stable employment', 'Meets criteria'],
    REJECT: ['High CRB risk', 'Insufficient income', 'High obligations', 'Poor history', 'Identity mismatch'],
    REFER_BACK: ['Missing documents', 'Incorrect data', 'Need clarification', 'Invalid collateral proof']
  };

  const handleDecisionSubmit = async () => {
    if (!selectedApp || !recommendation) return;
    if (selectedReasons.length === 0) {
      toast.error('Institutional Protocol: You must select at least one reason for your recommendation.');
      return;
    }
    if (analystComment.trim().length < 10) {
      toast.error('Detailed rationale is required for analyst decisions (min 10 chars).');
      return;
    }

    setIsSubmitting(true);
    const analysisData = {
      decision: recommendation === 'APPROVE' ? 'RECOMMEND_APPROVE' : recommendation === 'REJECT' ? 'RECOMMEND_REJECT' : 'REFER_BACK',
      reasons: selectedReasons,
      comment: analystComment,
      status: 'ANALYZED'
    };

    const success = await handleStageTransition(selectedApp, recommendation === 'REFER_BACK' ? 'REFERRED_BACK' : 'ANALYZED', analystComment, analysisData);
    if (success) {
      toast.success(recommendation === 'REFER_BACK'
        ? `Application for ${selectedApp.clientLabel} sent back for correction.`
        : `Handoff complete: analysis for ${selectedApp.clientLabel} forwarded to Manager.`);
      setSelectedAppId(null);
      setRecommendation(null);
      setSelectedReasons([]);
      setAnalystComment('');
      setActiveTab('overview');
    }
    setIsSubmitting(false);
  };

  const calculateDTI = (income: number, amount: number, term: number) => {
     const monthlyRepayment = amount / term; // Simple approximation
     return ((monthlyRepayment / income) * 100).toFixed(1);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Station Header */}
      <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              <ShieldCheck size={12} className="text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Credit Analyst Station Alpha</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Risk Assessment Terminal</h2>
            <p className="text-sm text-slate-500 font-medium">Verify identity, analyze capacity, and commit institutional recommendations.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Queue" value={String(queue.length)} trend="Live Registry" />
            <StatCard title="High Risk" value={String(highRiskCount)} trend="Bureau Alert" highlight={highRiskCount > 0} />
            <StatCard title="SLA Violations" value={String(queue.filter(a => a.sla.status === 'VIOLATED').length)} trend="Overdue" highlight={queue.some(a => a.sla.status === 'VIOLATED')} />
            <StatCard title="Efficiency" value="94%" trend="Avg. Cycle" />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-8 p-1.5 bg-slate-100/50 rounded-2xl w-fit">
          {(['overview', 'applications', 'risk', 'reports'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab === 'applications' ? 'Work Queue' : tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2 p-8 rounded-[2.5rem] border-slate-200 bg-white">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-base font-black text-slate-900">Priority Analysis Queue</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Applications sorted by SLA breach risk and impact.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab('applications')} className="rounded-xl font-bold">Launch Full Queue</Button>
            </div>
            <div className="space-y-4">
              {queue.slice(0, 5).map(app => (
                <div 
                  key={app.id} 
                  onClick={() => { setSelectedAppId(app.id); setActiveTab('applications'); }}
                  className="group relative flex items-center justify-between p-5 rounded-3xl border border-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all cursor-pointer overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${app.sla.color}`} />
                  <div className="flex items-center gap-5">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-sm ${app.riskLevel === 'HIGH' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                      {app.clientLabel.charAt(0)}
                    </div>
                    <div>
                      <p className="text-base font-black text-slate-900">{app.clientLabel}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">{app.id.slice(-8)}</span>
                        <Badge variant="outline" className={`border-none font-black text-[9px] leading-none h-4 ${app.riskLevel === 'HIGH' ? 'text-red-500' : 'text-slate-400'}`}>{app.riskLevel} RISK</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">{formatCurrency(app.requestedAmount || 0)}</p>
                    <div className="flex items-center justify-end gap-2 mt-1">
                       <Clock size={10} className={app.sla.color.replace('bg-', 'text-')} />
                       <span className={`text-[10px] font-black uppercase tracking-wider ${app.sla.color.replace('bg-', 'text-')}`}>{app.sla.text}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-8 rounded-[2.5rem] border-slate-200 bg-white">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">SLA Performance</h3>
               <div className="flex flex-col items-center py-4">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="50" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                      <circle cx="64" cy="64" r="50" fill="transparent" stroke="#10b981" strokeWidth="12" strokeDasharray="314" strokeDashoffset="31.4" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-900">90%</span>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">On Track</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-8 w-full mt-10">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Cycle</p>
                      <p className="text-lg font-black text-slate-900">4.2h</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Throughput</p>
                      <p className="text-lg font-black text-slate-900">12/day</p>
                    </div>
                  </div>
               </div>
            </Card>
            
            <AlertItem 
              type="danger" 
              title="Identity Conflict Alert" 
              description="System detected multiple National IDs linked to a single biometric signature (simulated)."
              action="Run Deep Veracity Scan"
            />
          </div>
        </div>
      )}

      {activeTab === 'applications' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Master Queue List */}
          <Card className="lg:col-span-1 p-6 rounded-[2.5rem] border-slate-200 bg-white shadow-none h-[800px] flex flex-col">
            <div className="mb-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Institutional Queue</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Scan Reference / Name..." 
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold focus:bg-white transition-all ring-0 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {queue.map(app => (
                <div 
                  key={app.id} 
                  onClick={() => setSelectedAppId(app.id)}
                  className={`p-4 rounded-2xl cursor-pointer border-2 transition-all relative overflow-hidden ${selectedAppId === app.id ? 'bg-slate-950 border-slate-950 text-white shadow-2xl' : 'bg-white border-slate-50 hover:border-blue-100 text-slate-600'}`}
                >
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${app.sla.color}`} />
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                       <span className={`text-[9px] font-black uppercase tracking-widest ${selectedAppId === app.id ? 'text-blue-400' : 'text-slate-400'}`}>{app.id.slice(-8)}</span>
                       <span className={`text-[8px] font-black uppercase ${app.sla.color.replace('bg-', 'text-')}`}>{app.sla.hours.toFixed(0)}h elapsed</span>
                    </div>
                    <p className="text-sm font-black leading-tight uppercase tracking-tight truncate">{app.clientLabel}</p>
                    <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg mt-2">
                      <p className="text-[10px] font-black">{formatCurrency(app.requestedAmount || 0)}</p>
                      <Badge className={`border-none text-[8px] font-bold ${app.riskLevel === 'HIGH' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{app.riskLevel}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Analysis Workspace */}
          <div className="lg:col-span-3">
            {selectedApp ? (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={selectedApp.id} className="space-y-6">
                {/* 1. Identity & Context Ribbon */}
                <Card className="p-8 rounded-[2.5rem] border-slate-200 bg-white relative overflow-hidden">
                  <div className="flex justify-between items-start z-10 relative">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                        <Terminal size={12} /> Institutional Analysis Stage: {selectedApp.current_stage || 'PENDING'}
                      </p>
                      <h3 className="text-4xl font-black text-slate-950 tracking-tighter">{selectedApp.clientLabel}</h3>
                      <div className="flex items-center gap-4 mt-2">
                         <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
                           <MapPin size={14} className="text-slate-400" /> Blantyre, Malawi
                         </div>
                         <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
                           <Calendar size={14} className="text-slate-400" /> Client since {new Date(selectedApp.createdAt).getFullYear()}
                         </div>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Exposure Required</p>
                       <p className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(selectedApp.requestedAmount || 0)}</p>
                       <p className="text-xs text-slate-500 font-bold mt-1">Duration: {selectedApp.termMonths} Months</p>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50 rounded-full -mr-40 -mt-40 blur-[80px] opacity-40"></div>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Left Column: Intelligence Panels */}
                  <div className="space-y-6">
                    {/* A. Financial Capacity Panel */}
                    <Card className="p-8 rounded-[2.5rem] border-slate-200 bg-white">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Financial Capacity Analytics</h4>
                      <div className="grid grid-cols-2 gap-10">
                        <div className="space-y-8">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Monthly Income (Verified)</p>
                            <p className="text-2xl font-black text-slate-900">{formatCurrency(selectedApp.monthlyIncome || 0)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Debt-to-Income (DTI)</p>
                            <div className="flex items-end gap-2">
                              <p className="text-2xl font-black text-slate-900">{calculateDTI(selectedApp.monthlyIncome || 1, selectedApp.requestedAmount || 0, selectedApp.termMonths || 1)}%</p>
                              <span className="text-[10px] font-bold text-emerald-600 mb-1">HEALTHY</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-8">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Bureau Risk Score</p>
                            <div className="h-10 flex items-center">
                              {selectedApp.crb?.score ? (
                                <p className="text-3xl font-black text-blue-600 tracking-tighter">{selectedApp.crb.score}</p>
                              ) : (
                                <button className="text-xs font-black uppercase text-blue-600 underline" onClick={() => fetchCRBReport(selectedApp)}>Run Bureau Sync</button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Repayment Cap</p>
                            <p className="text-2xl font-black text-slate-900">{formatCurrency((selectedApp.monthlyIncome || 0) * 0.4)}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Interactive Visual */}
                      <div className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Capacity Utilization Strip</p>
                        <div className="h-4 w-full bg-slate-200 rounded-full flex overflow-hidden">
                           <div className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]" style={{ width: `${calculateDTI(selectedApp.monthlyIncome || 1, selectedApp.requestedAmount || 0, selectedApp.termMonths || 1)}%` }} />
                        </div>
                        <div className="flex justify-between mt-3">
                           <span className="text-[10px] font-bold text-slate-400 italic">Installment Impact</span>
                           <span className="text-[10px] font-bold text-slate-900 uppercase">Max Capability: 40%</span>
                        </div>
                      </div>
                    </Card>

                    {/* B. Documentation Inspector */}
                    <Card className="p-8 rounded-[2.5rem] border-slate-200 bg-white">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Master Documentation Artifacts</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { key: 'idFront', title: 'National ID (Front)' },
                          { key: 'idBack', title: 'National ID (Back)' },
                          { key: 'passportPhoto', title: 'Biometric Reference' },
                          { key: 'proofOfResidence', title: 'Institutional Residence Proof' }
                        ].map(doc => (
                          <div 
                            key={doc.key} 
                            onClick={() => { setPreviewDoc({title: doc.title, value: (selectedApp as any)[doc.key]}); setIsPreviewModalOpen(true); }}
                            className="group relative h-32 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center p-4 hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer"
                          >
                             <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors shadow-sm">
                               <Maximize2 size={16} />
                             </div>
                             <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-3">{doc.title}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  {/* Right Column: Decision Engine */}
                  <div className="space-y-6">
                    <Card className="p-10 rounded-[3rem] border-slate-200 shadow-2xl shadow-blue-900/10 bg-white flex flex-col h-full ring-2 ring-blue-50">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="h-10 w-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
                           <Sparkles size={18} />
                        </div>
                        <h4 className="text-xl font-black text-slate-900 tracking-tight">Institutional Recommendation</h4>
                      </div>

                      <div className="space-y-10 flex-1">
                        {/* Recommendation Selector */}
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Risk Decision</p>
                          <div className="grid grid-cols-1 gap-3">
                            {(['APPROVE', 'REJECT', 'REFER_BACK'] as const).map(mode => (
                              <button
                                key={mode}
                                onClick={() => { setRecommendation(mode); setSelectedReasons([]); }}
                                className={`h-16 px-6 rounded-2xl border-2 flex items-center justify-between transition-all ${recommendation === mode ? 'border-blue-600 bg-blue-50/50' : 'border-slate-50 hover:border-slate-200'}`}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`h-3 w-3 rounded-full ${mode === 'APPROVE' ? 'bg-emerald-500' : mode === 'REJECT' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                  <span className={`text-xs font-black uppercase tracking-widest ${recommendation === mode ? 'text-blue-600' : 'text-slate-600'}`}>
                                    {mode.replace('_', ' ')}
                                  </span>
                                </div>
                                {recommendation === mode && <CheckCircle2 size={18} className="text-blue-600" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Reason Tags */}
                        {recommendation && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Justification Tags (Mandatory)</p>
                            <div className="flex flex-wrap gap-2">
                              {reasonOptions[recommendation].map(reason => (
                                <button
                                  key={reason}
                                  onClick={() => setSelectedReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason])}
                                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedReasons.includes(reason) ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                >
                                  {reason}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}

                        {/* Comment Box */}
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyst Brief / Override Context</p>
                          <textarea 
                            value={analystComment}
                            onChange={(e) => setAnalystComment(e.target.value)}
                            rows={5}
                            placeholder="Provide deep rationale for this credit decision. Minimum 10 characters for rejections."
                            className="w-full rounded-3xl border-2 border-slate-50 bg-slate-50/50 p-6 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-600 transition-all ring-0 resize-none shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="mt-10">
                        <Button 
                          onClick={handleDecisionSubmit}
                          disabled={!recommendation || isSubmitting}
                          className="w-full h-16 bg-slate-950 hover:bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-3"
                        >
                          {isSubmitting ? <Activity size={18} title="analysing" className="animate-spin" /> : <ShieldCheck size={18} />}
                          Commit Recommendation to Manager
                        </Button>
                        <p className="text-center text-[9px] text-slate-400 uppercase font-black tracking-widest mt-4">This action will be logged in the immutable audit trail.</p>
                      </div>
                    </Card>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-[800px] rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300">
                <Box size={48} className="mb-4 opacity-20" />
                <p className="font-black uppercase tracking-widest text-[10px]">Select application from queue to begin analysis</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'risk' && (
        <Card className="p-12 rounded-[3rem] border-slate-200 bg-white flex flex-col items-center justify-center text-center">
           <div className="w-24 h-24 rounded-[2.5rem] bg-amber-50 flex items-center justify-center text-amber-500 mb-8 border border-amber-100 shadow-xl shadow-amber-500/10">
              <Zap size={48} />
           </div>
           <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">Risk Intelligence Center</h3>
           <p className="text-slate-500 max-w-sm font-medium">Aggregating real-time portfolio risk distribution and CRB health trends. This module is initializing with your regional data.</p>
           <div className="grid grid-cols-3 gap-8 mt-12 w-full max-w-2xl">
              {[
                { label: 'Avg Portfolio Score', value: '624' },
                { label: 'Default Probability', value: '4.2%' },
                { label: 'System Confidence', value: '98.9%' }
              ].map(stat => (
                <div key={stat.label} className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-xl font-black text-slate-900">{stat.value}</p>
                </div>
              ))}
           </div>
        </Card>
      )}

      {activeTab === 'reports' && (
        <Card className="p-12 rounded-[3rem] border-slate-200 bg-white flex flex-col items-center justify-center text-center">
           <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-50 flex items-center justify-center text-indigo-500 mb-8 border border-indigo-100 shadow-xl shadow-indigo-500/10">
              <BarChart4 size={48} />
           </div>
           <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">Institutional Reports</h3>
           <p className="text-slate-500 max-w-sm font-medium">Download decision history, analyst performance logs, and risk breakdown charts.</p>
           <Button className="mt-10 rounded-2xl px-10 h-14 bg-slate-900 text-white font-black uppercase text-xs tracking-widest">Launch Report Generator</Button>
        </Card>
      )}

      {/* High-Fidelity Doc Modal */}
      <AnimatePresence>
        {isPreviewModalOpen && previewDoc && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
               onClick={() => setIsPreviewModalOpen(false)}
            />
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
               className="relative w-full max-w-5xl aspect-[3/2] bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                   <h4 className="text-lg font-black text-slate-900">{previewDoc.title}</h4>
                   <p className="text-xs text-slate-500 font-bold tracking-tight">Institutional Artifact Reference</p>
                </div>
                <button onClick={() => setIsPreviewModalOpen(false)} className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-slate-400 hover:text-slate-950 shadow-sm border border-slate-100 transition-all">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 bg-slate-100 flex items-center justify-center p-12 overflow-y-auto">
                 {previewDoc.value ? (
                   <img src={previewDoc.value} alt={previewDoc.title} className="max-w-full max-h-full rounded-2xl shadow-2xl border-4 border-white" />
                 ) : (
                   <div className="flex flex-col items-center opacity-30">
                     <FileX2 size={64} className="mb-4" />
                     <p className="font-black uppercase tracking-widest text-sm text-center">No Artifact Image<br/>Available in Registry</p>
                   </div>
                 )}
              </div>
              <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center">
                 <div className="flex gap-4">
                    <Button variant="outline" className="rounded-xl font-bold flex gap-2 items-center text-xs">
                      <Download size={14} /> Download PDF
                    </Button>
                    <Button variant="outline" className="rounded-xl font-bold flex gap-2 items-center text-xs">
                      <Printer size={14} /> Print Artifact
                    </Button>
                 </div>
                 <div className="flex items-center gap-6">
                    <button className="h-10 w-10 text-slate-400 hover:text-blue-600 transition-colors"><ZoomIn size={20} /></button>
                    <button className="h-10 w-10 text-slate-400 hover:text-blue-600 transition-colors"><ZoomOut size={20} /></button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ClientsView({ clients, loans, role }: { clients: any[], loans: any[], role: UserRole }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredClients = clients.filter(c => {
    const matchesSearch = (c.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
                          (c.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleFlagClient = async (clientId: string, currentStatus: string) => {
    if (role !== 'ADMIN') return;
    try {
      const newStatus = currentStatus === 'FLAGGED' ? 'ACTIVE' : 'FLAGGED';
      await updateDoc(doc(db, 'clients', clientId), {
        status: newStatus
      });
      toast.success(`Client ${newStatus === 'FLAGGED' ? 'flagged' : 'unflagged'} successfully`);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{role === 'AGENT' ? 'Client Management' : 'Client Directory'}</h2>
          <p className="text-[12px] text-muted-foreground">
            {role === 'AGENT' ? 'Manage field clients, confirm contact details, and prepare follow-up visits.' : 'Manage and monitor institutional client accounts.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold border-border bg-white">
            Export CSV
          </Button>
          {role !== 'CREDIT_ANALYST' && (
            <Button size="sm" className="h-9 px-4 text-xs font-semibold bg-primary text-white">
              + New Client
            </Button>
          )}
        </div>
      </div>

      <Card className="border border-border shadow-none rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between bg-white gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input 
              placeholder="Search by name, ID or account number..." 
              className="pl-10 h-9 text-xs bg-[#F9FAFB] border-none" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select 
              className="h-9 rounded-md border border-border bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="FLAGGED">Flagged</option>
              <option value="BLACKLISTED">Blacklisted</option>
            </select>
            <Button variant="outline" size="sm" className="h-9 text-xs border-border bg-white">
              <Filter size={14} className="mr-2" /> More Filters
            </Button>
          </div>
        </div>
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-6">ID</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Client Details</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-center">Active Loans</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Total Balance</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Status</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                  No clients found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map(client => {
                const activeLoansCount = loans.filter(l => l.clientId === client.id && l.status === 'ACTIVE').length;
                return (
                  <ClientRow 
                    key={client.id}
                    id={client.id.slice(0, 8).toUpperCase()}
                    name={client.name}
                    email={client.email}
                    loans={activeLoansCount}
                    balance={`MWK ${(client.totalBalance || 0).toLocaleString()}`}
                    status={client.status}
                    initials={client.name.split(' ').map((n: string) => n[0]).join('')}
                    role={role}
                    onFlag={() => handleFlagClient(client.id, client.status)}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="p-3 border-t border-border flex items-center justify-between bg-white">
          <p className="text-[11px] text-muted-foreground font-medium">Showing {filteredClients.length} clients</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-border"><ChevronRight className="rotate-180" size={12} /></Button>
            <Button size="sm" className="h-7 px-2.5 text-[11px] bg-primary">1</Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-border"><ChevronRight size={12} /></Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ClientRow({ id, name, email, loans, balance, status, initials, role, onFlag }: any) {
  return (
    <TableRow className="border-border hover:bg-[#F9FAFB] transition-colors">
      <TableCell className="px-6 py-2.5">
        <span className="bg-[#F3F4F6] text-foreground px-2 py-0.5 rounded font-mono text-[10px] border border-border">{id}</span>
      </TableCell>
      <TableCell className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-[#F3F4F6] text-muted-foreground text-[10px] font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-[12px] font-semibold text-foreground">{name}</p>
            <p className="text-[11px] text-muted-foreground">{email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-2.5 text-center font-medium text-muted-foreground">{loans}</TableCell>
      <TableCell className="px-4 py-2.5 font-bold text-foreground">{balance}</TableCell>
      <TableCell className="px-4 py-2.5">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
          status === 'ACTIVE' ? 'bg-[#D1FAE5] text-[#065F46]' : 
          status === 'BLACKLISTED' ? 'bg-[#FEE2E2] text-[#991B1B]' : 
          'bg-[#DBEAFE] text-[#1E40AF]'
        }`}>
          {status}
        </span>
      </TableCell>
      <TableCell className="px-6 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {role === 'ADMIN' && (
            <Button 
              variant="ghost" 
              size="icon" 
              className={`h-8 w-8 ${status === 'FLAGGED' ? 'text-red-600 hover:bg-red-50' : 'text-amber-600 hover:bg-amber-50'}`}
              onClick={onFlag}
              title={status === 'FLAGGED' ? 'Unflag Client' : 'Flag Client'}
            >
              <ShieldAlert size={14} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <MoreHorizontal size={16} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

const APPLICATION_STEPS = [
  'Client Lookup',
  'Personal & Contact',
  'Address & Income',
  'KYC & Financials',
  'Review & Submit',
] as const;

const BANK_OPTIONS = [
  'National Bank of Malawi',
  'Standard Bank Malawi',
  'FDH Bank',
  'First Capital Bank',
  'NBS Bank',
  'Ecobank Malawi',
  'MyBucks Banking Corporation',
] as const;

const emptyApplicationDraft = () => ({
  mode: 'existing',
  selectedClientId: '',
  searchQuery: '',
  firstName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  idNumber: '',
  maritalStatus: '',
  primaryPhone: '',
  secondaryPhone: '',
  email: '',
  preferredContactMethod: 'PHONE',
  district: '',
  traditionalAuthority: '',
  villageArea: '',
  physicalAddress: '',
  gpsCoordinates: '',
  employmentStatus: 'EMPLOYED',
  employerName: '',
  businessName: '',
  monthlyIncome: '0',
  incomeSourceDescription: '',
  nextOfKinName: '',
  nextOfKinRelationship: '',
  nextOfKinPhone: '',
  nextOfKinAddress: '',
  hasExistingLoans: 'NO',
  existingLenderName: '',
  outstandingBalance: '',
  paymentChannel: 'MOBILE_MONEY',
  mobileMoneyProvider: 'AIRTEL_MONEY',
  mobileMoneyNumber: '',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranch: '',
  clientStatus: 'ACTIVE',
  otpVerified: false,
  requestedAmount: '250000',
  termMonths: '12',
  purpose: '',
  loanProduct: 'Commercial Growth Bridge',
  currency: 'MWK',
});

const formatEmploymentLabel = (value?: string) => value?.replace(/_/g, ' ') || 'N/A';

function getClientName(client: any) {
  if (client?.name) return client.name;
  const first = client?.firstName || '';
  const last = client?.lastName || '';
  return `${first} ${last}`.trim() || 'Unnamed Client';
}

const getClientPrimaryPhone = (client: any) =>
  client?.phone || client?.primaryPhone || client?.contactInfo?.primaryPhone || '';

function getClientIdNumber(client: any) {
  return client?.idNumber || client?.personalInfo?.idNumber || '';
}

const getAgeFromDate = (dateString: string) => {
  if (!dateString) return 0;
  const dob = new Date(dateString);
  if (Number.isNaN(dob.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

function formatCurrency(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString()}`;
}

// getTimestampDate is defined as a hoisted function at line 330


function formatDateLabel(value: any, options?: Intl.DateTimeFormatOptions) {
  const date = getTimestampDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString(undefined, options || { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTimeLabel(value: any) {
  const date = getTimestampDate(value);
  if (!date) return 'N/A';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getRelativeTimeLabel = (value: any) => {
  const date = getTimestampDate(value);
  if (!date) return 'Unknown';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
};

function getApplicationClientLabel(application: any, clients: any[]) {
  const linkedClient = clients.find(client => client.id === application.clientId);
  if (linkedClient) return getClientName(linkedClient);
  return application.clientSnapshot?.name || 'Unknown Client';
}

function buildAuditLogs({
  users,
  clients,
  applications,
  loans,
  transactions,
}: {
  users: any[],
  clients: any[],
  applications: any[],
  loans: any[],
  transactions: any[],
}) {
  const userLogs = users.map(user => ({
    id: `user-${user.id}`,
    timestamp: user.updatedAt || user.createdAt,
    user: user.email || 'system',
    action: normalizeUserStatus(user.status) === 'PENDING' ? 'USER_REGISTERED' : 'USER_ACCESS_UPDATED',
    details: `${user.name || user.email || 'User'} is ${normalizeUserStatus(user.status).toLowerCase()} with role ${user.role || 'UNKNOWN'}${user.phone ? ` | Phone: ${user.phone}` : ''}${user.nationalId ? ` | ID: ${user.nationalId}` : ''}${user.guarantorReference ? ` | Reference: ${user.guarantorReference}` : ''}.`,
    category: 'ACCESS',
  }));

  const clientLogs = clients.map(client => ({
    id: `client-${client.id}`,
    timestamp: client.updatedAt || client.createdAt || client.metadata?.registrationDate,
    user: client.metadata?.createdBy?.email || 'system',
    action: 'CLIENT_REGISTERED',
    details: `${getClientName(client)} added to the borrower registry${getClientIdNumber(client) ? ` with ID ${getClientIdNumber(client)}` : ''}.`,
    category: 'KYC',
  }));

  const applicationLogs = applications.map(application => ({
    id: `application-${application.id}`,
    timestamp: application.updatedAt || application.createdAt,
    user: application.metadata?.createdBy?.email || application.approvedBy || 'system',
    action: application.status === 'APPROVED'
      ? 'APPLICATION_APPROVED'
      : application.status === 'REJECTED'
        ? 'APPLICATION_REJECTED'
        : 'APPLICATION_SUBMITTED',
    details: `${getApplicationClientLabel(application, clients)} application ${application.id.slice(0, 8).toUpperCase()} is ${application.status.toLowerCase().replace(/_/g, ' ')} for ${formatCurrency(application.requestedAmount || 0)}.`,
    category: 'LENDING',
  }));

  const loanLogs = loans.map(loan => ({
    id: `loan-${loan.id}`,
    timestamp: loan.updatedAt || loan.disbursedAt || loan.createdAt,
    user: transactions.find(transaction => transaction.loanId === loan.id && transaction.type === 'DISBURSEMENT')?.agentEmail || 'system',
    action: loan.status === 'REPAID' ? 'LOAN_CLOSED' : loan.status === 'DEFAULTED' ? 'LOAN_DEFAULTED' : 'LOAN_DISBURSED',
    details: `Loan ${loan.id.slice(0, 8).toUpperCase()} for ${formatCurrency(loan.amount || 0)} is currently ${String(loan.status || 'ACTIVE').toLowerCase()}.`,
    category: 'PORTFOLIO',
  }));

  const transactionLogs = transactions.map(transaction => ({
    id: `transaction-${transaction.id}`,
    timestamp: transaction.timestamp,
    user: transaction.agentEmail || 'system',
    action: transaction.type === 'DISBURSEMENT' ? 'FUNDS_DISBURSED' : 'PAYMENT_COLLECTED',
    details: `${transaction.type === 'DISBURSEMENT' ? 'Disbursed' : 'Collected'} ${formatCurrency(transaction.amount || 0)} ${transaction.clientName ? `for ${transaction.clientName}` : ''}${transaction.reference ? ` via ${transaction.reference}` : ''}.`,
    category: 'TRANSACTION',
  }));

  return [...userLogs, ...clientLogs, ...applicationLogs, ...loanLogs, ...transactionLogs]
    .filter(log => getTimestampDate(log.timestamp))
    .sort((left, right) => (getTimestampDate(right.timestamp)?.getTime() || 0) - (getTimestampDate(left.timestamp)?.getTime() || 0));
};

function buildAnomalies({
  users,
  applications,
  loans,
  transactions,
}: {
  users: any[],
  applications: any[],
  loans: any[],
  transactions: any[],
}) {
  const anomalies: any[] = [];
  const averageTransactionAmount = transactions.length
    ? transactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0) / transactions.length
    : 0;

  transactions.forEach(transaction => {
    const amount = transaction.amount || 0;
    if (transaction.type === 'DISBURSEMENT' && amount > Math.max(1000000, averageTransactionAmount * 2.5)) {
      anomalies.push({
        id: `txn-large-${transaction.id}`,
        sourceId: transaction.id,
        type: 'LARGE_DISBURSEMENT',
        description: `Disbursement of ${formatCurrency(amount)} exceeds expected operating range.`,
        severity: amount >= 3000000 ? 'CRITICAL' : 'HIGH',
        user: transaction.agentEmail || 'system',
        time: transaction.timestamp,
        status: 'UNRESOLVED',
      });
    }

    if (transaction.type === 'REPAYMENT' && !transaction.reference) {
      anomalies.push({
        id: `txn-reference-${transaction.id}`,
        sourceId: transaction.id,
        type: 'MISSING_REFERENCE',
        description: `Repayment of ${formatCurrency(amount)} was recorded without a reference number.`,
        severity: 'MEDIUM',
        user: transaction.agentEmail || 'system',
        time: transaction.timestamp,
        status: 'INVESTIGATING',
      });
    }
  });

  applications.forEach(application => {
    const monthlyIncome = application.monthlyIncome || Math.round((application.annualIncome || 0) / 12);
    const exposureRatio = monthlyIncome > 0 ? (application.requestedAmount || 0) / monthlyIncome : 0;
    if (application.kycStatus === 'MISSING') {
      anomalies.push({
        id: `app-kyc-${application.id}`,
        sourceId: application.id,
        type: 'MISSING_KYC',
        description: `Application ${application.id.slice(0, 8).toUpperCase()} is missing KYC documents.`,
        severity: 'HIGH',
        user: application.metadata?.createdBy?.email || 'system',
        time: application.updatedAt || application.createdAt,
        status: 'UNRESOLVED',
      });
    }
    if (exposureRatio >= 6) {
      anomalies.push({
        id: `app-exposure-${application.id}`,
        sourceId: application.id,
        type: 'HIGH_EXPOSURE_APPLICATION',
        description: `Application ${application.id.slice(0, 8).toUpperCase()} requests ${exposureRatio.toFixed(1)}x verified monthly income.`,
        severity: exposureRatio >= 10 ? 'CRITICAL' : 'HIGH',
        user: application.metadata?.createdBy?.email || application.approvedBy || 'system',
        time: application.updatedAt || application.createdAt,
        status: application.status === 'APPROVED' ? 'INVESTIGATING' : 'UNRESOLVED',
      });
    }
  });

  loans.forEach(loan => {
    if (loan.status === 'DEFAULTED' && (loan.outstandingBalance || 0) > 0) {
      anomalies.push({
        id: `loan-default-${loan.id}`,
        sourceId: loan.id,
        type: 'DEFAULTED_EXPOSURE',
        description: `Loan ${loan.id.slice(0, 8).toUpperCase()} is defaulted with ${formatCurrency(loan.outstandingBalance || 0)} still outstanding.`,
        severity: (loan.outstandingBalance || 0) > 500000 ? 'CRITICAL' : 'HIGH',
        user: transactions.find(transaction => transaction.loanId === loan.id && transaction.type === 'DISBURSEMENT')?.agentEmail || 'system',
        time: loan.updatedAt || loan.disbursedAt || loan.createdAt,
        status: 'UNRESOLVED',
      });
    }
  });

  users.forEach(user => {
    if (normalizeUserStatus(user.status) === 'SUSPENDED') {
      anomalies.push({
        id: `user-suspended-${user.id}`,
        sourceId: user.id,
        type: 'SUSPENDED_ACCESS',
        description: `${user.email || user.name || 'User'} remains suspended and should be reviewed for residual access.`,
        severity: 'MEDIUM',
        user: user.email || 'system',
        time: user.updatedAt || user.createdAt,
        status: 'RESOLVED',
      });
    }
  });

  return anomalies
    .filter(anomaly => getTimestampDate(anomaly.time))
    .sort((left, right) => (getTimestampDate(right.time)?.getTime() || 0) - (getTimestampDate(left.time)?.getTime() || 0));
};

const buildCasesFromAnomalies = (anomalies: any[]) =>
  anomalies.slice(0, 8).map((anomaly, index) => ({
    id: `CASE-${String(index + 1).padStart(3, '0')}`,
    title: anomaly.type.replace(/_/g, ' '),
    status: anomaly.status === 'UNRESOLVED' ? 'OPEN' : anomaly.status === 'INVESTIGATING' ? 'UNDER REVIEW' : 'CLOSED',
    priority: anomaly.severity === 'CRITICAL' ? 'HIGH' : anomaly.severity === 'HIGH' ? 'HIGH' : anomaly.severity === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    assignee: anomaly.user || 'auditor@fastkwacha.com',
    updated: anomaly.time,
    sourceId: anomaly.sourceId,
    description: anomaly.description,
  }));

const isCurrentAgentRecord = (record: any, profile?: AuthProfile | null) => {
  const currentEmail = getActiveSessionEmail(profile);
  if (!currentEmail) return false;
  return [
    record?.agentEmail,
    record?.originatingAgentEmail,
    record?.assignedAgentEmail,
    record?.metadata?.createdBy?.email,
    record?.createdBy?.email,
    record?.collectorEmail,
  ].some(value => normalizeEmail(String(value || '')) === normalizeEmail(currentEmail));
};

const getLoanInstallmentAmount = (loan: any) => {
  const termMonths = Math.max(1, loan?.termMonths || 12);
  const balance = loan?.outstandingBalance || 0;
  const amount = loan?.amount || balance;
  return Math.round((balance > 0 ? balance : amount) / termMonths);
};

const getLoanCollectionState = (loan: any) => {
  const dueDate = getTimestampDate(loan?.nextDueDate || loan?.disbursedAt || loan?.createdAt);
  if (!dueDate) {
    return { tone: 'watch', label: 'Follow Up', helper: 'Due date not set' };
  }
  const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (loan?.status === 'DEFAULTED' || diffDays < 0) {
    return { tone: 'overdue', label: 'Overdue', helper: `${Math.abs(diffDays)} day(s) late` };
  }
  if (diffDays === 0) {
    return { tone: 'today', label: 'Due Today', helper: 'Collect today' };
  }
  return { tone: 'watch', label: 'Upcoming', helper: `Due in ${diffDays} day(s)` };
};

const getIdValidationState = (idNumber: string, clients: any[]) => {
  const normalized = idNumber.trim().toUpperCase();
  if (!normalized) {
    return { tone: 'neutral', message: 'Enter a National ID or Passport number.' };
  }
  if (!ID_NUMBER_REGEX.test(normalized)) {
    return { tone: 'invalid', message: 'Use 6-20 letters, numbers, slashes, or hyphens.' };
  }
  const duplicate = clients.find(client => getClientIdNumber(client).trim().toUpperCase() === normalized);
  if (duplicate) {
    return { tone: 'invalid', message: `Already registered under ${getClientName(duplicate)}.` };
  }
  return { tone: 'valid', message: 'ID number format looks valid and is currently unique.' };
};

function ApplicationsView({ clients, applications, role, sessionProfile, uploadDocument }: { clients: any[], applications: any[], role: UserRole, sessionProfile: AuthProfile | null, uploadDocument: any }) {
  const draftStorageKey = `fastkwacha-application-draft-${role.toLowerCase()}`;
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState(emptyApplicationDraft);
  const [files, setFiles] = useState<{
    idFront: File | null,
    idBack: File | null,
    proofOfResidence: File | null,
    passportPhoto: File | null,
  }>({
    idFront: null,
    idBack: null,
    proofOfResidence: null,
    passportPhoto: null,
  });

  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(draftStorageKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        setDraft({ ...emptyApplicationDraft(), ...parsed });
      } else if (role === 'CLIENT' && sessionProfile) {
        // Initialize draft for logged-in client
        setDraft(prev => ({
          ...prev,
          selectedClientId: sessionProfile.id,
          firstName: sessionProfile.name?.split(' ')[0] || '',
          lastName: sessionProfile.name?.split(' ').slice(1).join(' ') || '',
          email: sessionProfile.email || '',
          primaryPhone: sessionProfile.phone || '',
          idNumber: sessionProfile.idNumber || '',
          mode: 'existing'
        }));
        setCurrentStep(2); // Skip Step 1 (Search)
      }
    } catch (error) {
      console.error('Failed to restore draft', error);
    }
  }, [draftStorageKey, role, sessionProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to persist draft', error);
    }
  }, [draft, draftStorageKey]);

  const setDraftField = (field: string, value: string | boolean) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  const filteredClients = clients.filter(client => {
    const query = draft.searchQuery.toLowerCase();
    if (!query) return true;
    return [
      getClientName(client),
      getClientPrimaryPhone(client),
      getClientIdNumber(client),
      client.email || '',
    ].some(value => value?.toLowerCase().includes(query));
  });

  const selectedClient = clients.find(client => client.id === draft.selectedClientId) || null;
  const requestedAmount = parseInt(draft.requestedAmount, 10) || 0;
  const termMonths = parseInt(draft.termMonths, 10) || 0;
  const monthlyIncome = parseInt(draft.monthlyIncome, 10) || 0;
  const outstandingBalance = parseInt(draft.outstandingBalance, 10) || 0;
  const applicantAge = getAgeFromDate(draft.dateOfBirth);
  const totalPayable = Math.round(requestedAmount + (requestedAmount * 0.0525) + 2500);
  const monthlyRepayment = termMonths > 0 ? Math.round(totalPayable / termMonths) : 0;

  const draftClientStatus = draft.clientStatus === 'BLACKLISTED' ? 'BLACKLISTED' : draft.clientStatus;
  const hasExistingLoanDetails = draft.hasExistingLoans === 'YES';
  const usesBankingDetails = draft.paymentChannel === 'BANK';
  const idValidation = getIdValidationState(draft.idNumber, clients);
  const kycFilesReady = Boolean(files.idFront && files.idBack);

  const resetDraft = () => {
    setDraft(emptyApplicationDraft());
    setFiles({
      idFront: null,
      idBack: null,
      proofOfResidence: null,
      passportPhoto: null,
    });
    setCurrentStep(1);
    localStorage.removeItem(draftStorageKey);
  };

  const handleFileChange = (field: 'idFront' | 'idBack' | 'proofOfResidence' | 'passportPhoto', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setFiles(prev => ({ ...prev, [field]: file }));
  };

  const validateStep = (step: number) => {
    if (step === 1) {
      if (draft.mode === 'existing' && !selectedClient) {
        toast.error('Select an existing client or switch to new registration.');
        return false;
      }
      if (draft.mode === 'new' && filteredClients.some(client => {
        const query = draft.searchQuery.trim().toLowerCase();
        return query && getClientName(client).toLowerCase().includes(query);
      })) {
        toast.info('Similar client records exist. Review the search results before creating a new client.');
      }
      return true;
    }

    if (step === 2 && draft.mode === 'new') {
      if (!draft.firstName || !draft.lastName || !draft.gender || !draft.dateOfBirth || !draft.idNumber || !draft.maritalStatus) {
        toast.error('Complete all personal information fields.');
        return false;
      }
      if (applicantAge < 18) {
        toast.error('Client must be at least 18 years old.');
        return false;
      }
      if (!PHONE_REGEX.test(formatPhoneDisplay(draft.primaryPhone))) {
        toast.error('Enter a valid Malawi primary phone number.');
        return false;
      }
      if (draft.secondaryPhone && !PHONE_REGEX.test(formatPhoneDisplay(draft.secondaryPhone))) {
        toast.error('Enter a valid Malawi secondary phone number.');
        return false;
      }
      if (idValidation.tone === 'invalid') {
        toast.error(idValidation.message);
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (draft.mode === 'new' && (!draft.district || !draft.traditionalAuthority || !draft.villageArea || !draft.physicalAddress)) {
        toast.error('Address details are required for new client registration.');
        return false;
      }
      if (!draft.employmentStatus || !draft.incomeSourceDescription) {
        toast.error('Employment status and income source are required.');
        return false;
      }
      if (monthlyIncome <= 0) {
        toast.error('Monthly income must be greater than zero for a loan application.');
        return false;
      }
      if (draft.employmentStatus === 'EMPLOYED' && !draft.employerName) {
        toast.error('Employer name is required for employed applicants.');
        return false;
      }
      if (draft.employmentStatus === 'SELF_EMPLOYED' && !draft.businessName) {
        toast.error('Business name is required for self-employed applicants.');
        return false;
      }
      return true;
    }

    if (step === 4) {
      if (draft.mode === 'new' && (!draft.nextOfKinName || !draft.nextOfKinRelationship || !draft.nextOfKinPhone || !draft.nextOfKinAddress)) {
        toast.error('Next of kin / guarantor details are required.');
        return false;
      }
      if (draft.mode === 'new' && !kycFilesReady) {
        toast.error('Upload both front and back images of the National ID.');
        return false;
      }
      if (hasExistingLoanDetails && (!draft.existingLenderName || outstandingBalance <= 0)) {
        toast.error('Provide lender name and outstanding balance for existing loans.');
        return false;
      }
      if (usesBankingDetails) {
        if (!draft.bankName || !draft.bankAccountName || !draft.bankAccountNumber) {
          toast.error('Complete the bank payment details.');
          return false;
        }
      } else {
        if (!draft.mobileMoneyNumber || !PHONE_REGEX.test(formatPhoneDisplay(draft.mobileMoneyNumber))) {
          toast.error('Enter a valid Airtel Money or TNM Mpamba number.');
          return false;
        }
      }
      if (!draft.purpose || requestedAmount <= 0 || termMonths <= 0) {
        toast.error('Loan product, amount, term, and purpose are required.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleStepChange = (nextStep: number) => {
    if (nextStep > currentStep && !validateStep(currentStep)) return;
    setCurrentStep(nextStep);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (role === 'CREDIT_ANALYST') {
      toast.error("Credit Analysts cannot submit applications manually via this module.");
      return;
    }

    if (role === 'CLIENT' && sessionProfile && !sessionProfile.kycComplete) {
      toast.error("Institutional Protocol Error: Phase 2 KYC incomplete. Please verify your Identity and Phone in the Profile Center before application.");
      return;
    }

    for (let step = 1; step <= 4; step += 1) {
      if (!validateStep(step)) {
        setCurrentStep(step);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // PHASE 3: Functional Doc Upload Sequence
      toast.info('Uploading documents to secure baseline...', { duration: 2000 });
      
      const docUrls: Record<string, string> = {};
      const fileEntries = Object.entries(files).filter(([_, file]) => !!file);
      
      for (const [key, file] of fileEntries) {
        if (file) {
          const url = await uploadDocument(file, 'applications', `temp-${Date.now()}`);
          docUrls[key] = url;
        }
      }

      let clientId = selectedClient?.id || '';
      const createdBy = {
        uid: auth.currentUser?.uid || `local-${role.toLowerCase()}`,
        email: getActiveSessionEmail(),
        role,
      };

      const clientPayload = draft.mode === 'new' ? {
        name: `${draft.firstName} ${draft.lastName}`.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        gender: draft.gender,
        dateOfBirth: draft.dateOfBirth,
        maritalStatus: draft.maritalStatus,
        idNumber: draft.idNumber.trim(),
        phone: formatPhoneDisplay(draft.primaryPhone),
        primaryPhone: formatPhoneDisplay(draft.primaryPhone),
        secondaryPhone: formatPhoneDisplay(draft.secondaryPhone),
        email: draft.email.trim(),
        preferredContactMethod: draft.preferredContactMethod,
        district: draft.district.trim(),
        traditionalAuthority: draft.traditionalAuthority.trim(),
        villageArea: draft.villageArea.trim(),
        physicalAddress: draft.physicalAddress.trim(),
        gpsCoordinates: draft.gpsCoordinates.trim(),
        employmentStatus: draft.employmentStatus,
        employerName: draft.employerName.trim(),
        businessName: draft.businessName.trim(),
        monthlyIncome,
        incomeSourceDescription: draft.incomeSourceDescription.trim(),
        nextOfKin: {
          fullName: draft.nextOfKinName.trim(),
          relationship: draft.nextOfKinRelationship.trim(),
          phoneNumber: formatPhoneDisplay(draft.nextOfKinPhone),
          address: draft.nextOfKinAddress.trim(),
        },
        documents: {
          idFrontFileName: files.idFront?.name || '',
          idBackFileName: files.idBack?.name || '',
          proofOfResidenceFileName: files.proofOfResidence?.name || '',
          passportPhotoFileName: files.passportPhoto?.name || '',
        },
        financialProfile: {
          hasExistingLoans: hasExistingLoanDetails,
          lenderName: draft.existingLenderName.trim(),
          outstandingBalance,
          paymentChannel: draft.paymentChannel,
          mobileMoneyProvider: usesBankingDetails ? '' : draft.mobileMoneyProvider,
          mobileMoneyNumber: usesBankingDetails ? '' : formatPhoneDisplay(draft.mobileMoneyNumber),
          bankName: usesBankingDetails ? draft.bankName : '',
          bankAccountName: usesBankingDetails ? draft.bankAccountName.trim() : '',
          bankAccountNumber: usesBankingDetails ? draft.bankAccountNumber.trim() : '',
          bankBranch: usesBankingDetails ? draft.bankBranch.trim() : '',
        },
        assignedAgentEmail: createdBy.email,
        status: draftClientStatus,
        totalBalance: 0,
        otpVerified: draft.otpVerified,
        metadata: {
          createdBy,
          registrationDate: serverTimestamp(),
          lastUpdatedAt: serverTimestamp(),
          clientStatus: draftClientStatus,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } : null;

      if (clientPayload) {
        try {
          const clientRef = await addDoc(collection(db, 'clients'), clientPayload);
          clientId = clientRef.id;
        } catch (err: any) {
          if (err.code === 'permission-denied' || err.message?.includes('permission')) {
            console.warn('Client registration blocked by permissions. Falling back to Simulation Mode.');
            const localId = `local-client-${Math.random().toString(36).substr(2, 9)}`;
            clientId = localId;
            saveLocalClient({ ...clientPayload, id: localId, uid: localId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          } else {
            throw err;
          }
        }
      } else if (selectedClient?.id) {
        try {
          await updateDoc(doc(db, 'clients', selectedClient.id), {
            assignedAgentEmail: createdBy.email,
            updatedAt: serverTimestamp(),
            metadata: {
              ...(selectedClient.metadata || {}),
              lastUpdatedAt: serverTimestamp(),
              lastApplicationBy: createdBy,
            }
          });
        } catch (err: any) {
          if (err.code === 'permission-denied' || err.message?.includes('permission')) {
            console.warn('Client update blocked by permissions (Simulation Mode).');
            // In simulation mode, we just proceed as the client is already in the system
          } else {
            throw err;
          }
        }
      }

      const clientSnapshot = draft.mode === 'new'
        ? {
            name: `${draft.firstName} ${draft.lastName}`.trim(),
            phone: formatPhoneDisplay(draft.primaryPhone),
            email: draft.email.trim(),
            idNumber: draft.idNumber.trim(),
          }
        : selectedClient
          ? {
              name: getClientName(selectedClient),
              phone: getClientPrimaryPhone(selectedClient),
              email: selectedClient.email || '',
              idNumber: getClientIdNumber(selectedClient),
            }
          : null;

      const applicationPayload = {
        clientId,
        clientSnapshot,
        originatingAgentEmail: createdBy.role === 'CLIENT' ? createdBy.email : 'direct-client-submission',
        assignedAgentEmail: createdBy.role === 'CLIENT' ? createdBy.email : 'direct-client-submission',
        requestedAmount,
        termMonths,
        purpose: draft.purpose.trim(),
        employmentStatus: draft.employmentStatus,
        annualIncome: monthlyIncome * 12,
        monthlyIncome,
        loanProduct: draft.loanProduct,
        currency: draft.currency,
        status: 'PENDING',
        current_stage: 'PENDING' as LoanStage,
        kycStatus: kycFilesReady ? 'PENDING_REVIEW' : 'MISSING',
        decisionTrail: [],
        metadata: {
          createdBy,
          registrationDate: serverTimestamp(),
          lastUpdatedAt: serverTimestamp(),
          clientStatus: draftClientStatus,
        },
        personalInfo: {
          firstName: draft.mode === 'new' ? draft.firstName.trim() : (selectedClient?.firstName || getClientName(selectedClient).split(' ')[0] || ''),
          lastName: draft.mode === 'new' ? draft.lastName.trim() : (selectedClient?.lastName || getClientName(selectedClient).split(' ').slice(1).join(' ') || ''),
          gender: draft.mode === 'new' ? draft.gender : (selectedClient?.gender || ''),
          dateOfBirth: draft.mode === 'new' ? draft.dateOfBirth : (selectedClient?.dateOfBirth || ''),
          maritalStatus: draft.mode === 'new' ? draft.maritalStatus : (selectedClient?.maritalStatus || ''),
          idNumber: draft.mode === 'new' ? draft.idNumber.trim() : getClientIdNumber(selectedClient),
        },
        contactInfo: {
          primaryPhone: draft.mode === 'new' ? formatPhoneDisplay(draft.primaryPhone) : formatPhoneDisplay(getClientPrimaryPhone(selectedClient)),
          secondaryPhone: draft.secondaryPhone ? formatPhoneDisplay(draft.secondaryPhone) : (selectedClient?.secondaryPhone || ''),
          email: draft.mode === 'new' ? draft.email.trim() : (selectedClient?.email || ''),
          preferredContactMethod: draft.preferredContactMethod,
          otpVerified: draft.otpVerified,
        },
        addressInfo: {
          district: draft.mode === 'new' ? draft.district.trim() : (selectedClient?.district || ''),
          traditionalAuthority: draft.mode === 'new' ? draft.traditionalAuthority.trim() : (selectedClient?.traditionalAuthority || ''),
          villageArea: draft.mode === 'new' ? draft.villageArea.trim() : (selectedClient?.villageArea || ''),
          physicalAddress: draft.mode === 'new' ? draft.physicalAddress.trim() : (selectedClient?.physicalAddress || ''),
          gpsCoordinates: draft.mode === 'new' ? draft.gpsCoordinates.trim() : (selectedClient?.gpsCoordinates || ''),
        },
        employmentDetails: {
          status: draft.employmentStatus,
          employerName: draft.employerName.trim(),
          businessName: draft.businessName.trim(),
          monthlyIncome,
          incomeSourceDescription: draft.incomeSourceDescription.trim(),
        },
        nextOfKin: {
          fullName: draft.nextOfKinName.trim(),
          relationship: draft.nextOfKinRelationship.trim(),
          phoneNumber: formatPhoneDisplay(draft.nextOfKinPhone),
          address: draft.nextOfKinAddress.trim(),
        },
        documents: {
          idFrontUrl: docUrls.idFront || '',
          idBackUrl: docUrls.idBack || '',
          proofOfResidenceUrl: docUrls.proofOfResidence || '',
          passportPhotoUrl: docUrls.passportPhoto || '',
          uploadedAt: serverTimestamp(),
        },
        financialProfile: {
          hasExistingLoans: hasExistingLoanDetails,
          lenderName: draft.existingLenderName.trim(),
          outstandingBalance,
          paymentChannel: draft.paymentChannel,
          mobileMoneyProvider: usesBankingDetails ? '' : draft.mobileMoneyProvider,
          mobileMoneyNumber: usesBankingDetails ? '' : formatPhoneDisplay(draft.mobileMoneyNumber),
          bankName: usesBankingDetails ? draft.bankName : '',
          bankAccountName: usesBankingDetails ? draft.bankAccountName.trim() : '',
          bankAccountNumber: usesBankingDetails ? draft.bankAccountNumber.trim() : '',
          bankBranch: usesBankingDetails ? draft.bankBranch.trim() : '',
        },
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        const appRef = await addDoc(collection(db, 'applications'), applicationPayload);
        await updateDoc(doc(db, 'applications', appRef.id), { applicationId: appRef.id });
        await createNotification(
          'SYSTEM',
          'New Loan Application',
          `Application ${appRef.id.slice(0, 8).toUpperCase()} is pending first review for ${clientSnapshot?.name || 'a client'}.`,
          'OFFICER',
          undefined,
          appRef.id,
          { slaHours: 24 }
        );
      } catch (err: any) {
        if (err.code === 'permission-denied' || err.message?.includes('permission')) {
          console.warn('Application submission blocked by permissions. Falling back to Simulation Mode.');
          const localAppId = `local-app-${Math.random().toString(36).substr(2, 9)}`;
          saveLocalApplication({ ...applicationPayload, id: localAppId, applicationId: localAppId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        } else {
          throw err;
        }
      }

      toast.success(draft.mode === 'new' ? 'Client registered and application submitted successfully' : 'Application submitted successfully');
      resetDraft();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'applications');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="max-w-7xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {role === 'CLIENT' ? 'Institutional Loan Application' : 'Client Registration & Loan Application'}
          </h2>
          <p className="text-slate-500 mt-1">
            {role === 'CLIENT' 
              ? 'Complete your financial and employment profile to trigger an automated credit review.' 
              : 'Capture client KYC, income, guarantor, documents, and loan details in one guided flow.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-blue-100 text-blue-700 border-none px-3 py-1 uppercase tracking-widest text-[10px] font-black">
            {role === 'CREDIT_ANALYST' ? 'READ ONLY' : 'Drafting'}
          </Badge>
          <Badge className="bg-slate-100 text-slate-700 border-none px-3 py-1 uppercase tracking-widest text-[10px] font-black">
            Step {currentStep} / {APPLICATION_STEPS.length}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Steps */}
        <div className="space-y-6">
          {APPLICATION_STEPS.map((label, index) => (
            <button key={label} className="w-full text-left" onClick={() => handleStepChange(index + 1)}>
              <StepItem number={index + 1} label={label} active={currentStep === index + 1} completed={currentStep > index + 1} />
            </button>
          ))}
          
          <Card className="bg-slate-50 border-none p-4 mt-8">
            <p className="text-xs text-slate-500 leading-relaxed">
              Drafts autosave locally while you work. Search existing clients first to avoid duplicate records before starting a new registration.
            </p>
          </Card>

          <Card className="border border-border shadow-none rounded-lg bg-white p-4 space-y-3">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Validation Rules</h4>
            <div className="space-y-2 text-[12px] text-slate-600">
              <p>Age must be 18+.</p>
              <p>Primary and mobile money numbers must match Malawi formats.</p>
              <p>National ID / Passport must be unique.</p>
              <p>Income must be greater than zero before submission.</p>
            </div>
          </Card>
        </div>

        {/* Form Area */}
        <div className="xl:col-span-2 space-y-8">
          {currentStep === 1 && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900">Client Search & Registration Mode</h3>
                <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50">
                  <button
                    type="button"
                    disabled={role === 'CREDIT_ANALYST'}
                    onClick={() => setDraft(prev => ({ ...prev, mode: 'existing', selectedClientId: prev.selectedClientId || '' }))}
                    className={`px-3 py-2 text-xs font-bold rounded-md ${draft.mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    Existing Client
                  </button>
                  <button
                    type="button"
                    disabled={role === 'CREDIT_ANALYST'}
                    onClick={() => setDraft(prev => ({ ...prev, mode: 'new', selectedClientId: '' }))}
                    className={`px-3 py-2 text-xs font-bold rounded-md ${draft.mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    New Client
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search by name, phone, ID or email..."
                  className="pl-10 h-12 bg-white"
                  value={draft.searchQuery}
                  onChange={(e) => setDraftField('searchQuery', e.target.value)}
                />
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                {filteredClients.map(client => (
                  <Card
                    key={client.id}
                    onClick={() => role !== 'CREDIT_ANALYST' && draft.mode === 'existing' && setDraft(prev => ({ ...prev, selectedClientId: client.id }))}
                    className={`p-4 flex items-center justify-between transition-all ${
                      draft.mode === 'existing'
                        ? 'cursor-pointer'
                        : 'cursor-default opacity-80'
                    } ${selectedClient?.id === client.id ? 'border-2 border-blue-600 bg-blue-50/30' : 'border border-slate-100 hover:border-blue-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-blue-100 text-blue-700 font-bold">
                          {getClientName(client).split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm">{getClientName(client)}</p>
                        <p className="text-xs text-slate-500">Phone: {getClientPrimaryPhone(client) || 'N/A'} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ID: {getClientIdNumber(client) || 'N/A'}</p>
                      </div>
                    </div>
                    {selectedClient?.id === client.id && <CheckCircle2 className="text-blue-600" size={20} />}
                  </Card>
                ))}
                {filteredClients.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-8 italic">No matching clients found. Switch to new client mode to register a borrower.</p>
                )}
              </div>

              {selectedClient && draft.mode === 'existing' && (
                <Card className="border border-emerald-200 bg-emerald-50/60 shadow-none rounded-lg">
                  <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                    <div>
                      <p className="font-black uppercase tracking-widest text-emerald-700 text-[10px] mb-1">Selected Client</p>
                      <p className="font-bold text-slate-900">{getClientName(selectedClient)}</p>
                      <p className="text-slate-600">{selectedClient.email || 'No email on file'}</p>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-widest text-emerald-700 text-[10px] mb-1">KYC Snapshot</p>
                      <p className="text-slate-600">Phone: {getClientPrimaryPhone(selectedClient) || 'N/A'}</p>
                      <p className="text-slate-600">ID: {getClientIdNumber(selectedClient) || 'N/A'}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {currentStep === 2 && (
            <section className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900">Personal Information</h3>
                <p className="text-sm text-slate-500 mt-1">Identity verification and communication details for the borrower record.</p>
              </div>

              {draft.mode === 'existing' && selectedClient ? (
                <Card className="border border-border shadow-none rounded-lg bg-slate-50">
                  <CardContent className="p-5 text-sm text-slate-600">
                    Existing client selected. Personal details will be pulled from the current client profile, while this application stores the loan-specific contact preference.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="First Name"><Input value={draft.firstName} onChange={(e) => setDraftField('firstName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                    <Field label="Last Name"><Input value={draft.lastName} onChange={(e) => setDraftField('lastName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                    <Field label="Gender">
                      <select value={draft.gender} onChange={(e) => setDraftField('gender', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="">Select gender</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    </Field>
                    <Field label="Date of Birth">
                      <Input type="date" value={draft.dateOfBirth} onChange={(e) => setDraftField('dateOfBirth', e.target.value)} disabled={role === 'CREDIT_ANALYST'} />
                    </Field>
                    <Field label="National ID / Passport Number">
                      <div className="space-y-2">
                        <Input value={draft.idNumber} onChange={(e) => setDraftField('idNumber', e.target.value.toUpperCase())} disabled={role === 'CREDIT_ANALYST'} />
                        <p className={`text-[11px] font-medium ${
                          idValidation.tone === 'valid' ? 'text-emerald-600' :
                          idValidation.tone === 'invalid' ? 'text-red-600' :
                          'text-slate-500'
                        }`}>
                          {idValidation.message}
                        </p>
                      </div>
                    </Field>
                    <Field label="Marital Status">
                      <select value={draft.maritalStatus} onChange={(e) => setDraftField('maritalStatus', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="">Select status</option>
                        <option value="SINGLE">Single</option>
                        <option value="MARRIED">Married</option>
                        <option value="DIVORCED">Divorced</option>
                        <option value="WIDOWED">Widowed</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Primary Phone Number"><Input value={draft.primaryPhone} onChange={(e) => setDraftField('primaryPhone', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="+265..." /></Field>
                    <Field label="Secondary Phone Number"><Input value={draft.secondaryPhone} onChange={(e) => setDraftField('secondaryPhone', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="Optional" /></Field>
                    <Field label="Email Address"><Input type="email" value={draft.email} onChange={(e) => setDraftField('email', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="Optional" /></Field>
                    <Field label="Preferred Contact Method">
                      <select value={draft.preferredContactMethod} onChange={(e) => setDraftField('preferredContactMethod', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="PHONE">Phone</option>
                        <option value="SMS">SMS</option>
                        <option value="EMAIL">Email</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={draft.otpVerified} onChange={(e) => setDraftField('otpVerified', e.target.checked)} disabled={role === 'CREDIT_ANALYST'} />
                Phone contact has been OTP-verified
              </label>
            </section>
          )}

          {currentStep === 3 && (
            <section className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900">Address & Income Details</h3>
                <p className="text-sm text-slate-500 mt-1">These fields support field tracing, eligibility checks, and later credit scoring.</p>
              </div>

              {draft.mode === 'new' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="District"><Input value={draft.district} onChange={(e) => setDraftField('district', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                  <Field label="Traditional Authority (TA)"><Input value={draft.traditionalAuthority} onChange={(e) => setDraftField('traditionalAuthority', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                  <Field label="Village / Area"><Input value={draft.villageArea} onChange={(e) => setDraftField('villageArea', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                  <Field label="GPS Coordinates"><Input value={draft.gpsCoordinates} onChange={(e) => setDraftField('gpsCoordinates', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="Optional" /></Field>
                  <div className="md:col-span-2">
                    <Field label="Physical Address Description">
                      <textarea value={draft.physicalAddress} onChange={(e) => setDraftField('physicalAddress', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none" />
                    </Field>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Employment Status">
                  <select value={draft.employmentStatus} onChange={(e) => setDraftField('employmentStatus', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="EMPLOYED">Employed</option>
                    <option value="SELF_EMPLOYED">Self-employed</option>
                    <option value="UNEMPLOYED">Unemployed</option>
                  </select>
                </Field>
                <Field label="Monthly Income (MWK)"><Input type="number" value={draft.monthlyIncome} onChange={(e) => setDraftField('monthlyIncome', e.target.value)} disabled={role === 'CREDIT_ANALYST'} min="0" /></Field>
                <Field label="Employer Name"><Input value={draft.employerName} onChange={(e) => setDraftField('employerName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="Required if employed" /></Field>
                <Field label="Business Name"><Input value={draft.businessName} onChange={(e) => setDraftField('businessName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="Required if self-employed" /></Field>
                <div className="md:col-span-2">
                  <Field label="Income Source Description">
                    <textarea value={draft.incomeSourceDescription} onChange={(e) => setDraftField('incomeSourceDescription', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none" placeholder="Salary, farming, business sales, piece work, etc." />
                  </Field>
                </div>
              </div>
            </section>
          )}

          {currentStep === 4 && (
            <section className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900">KYC, Guarantor & Financial Profile</h3>
                <p className="text-sm text-slate-500 mt-1">Capture safety-net details, file references, and existing debt exposure before submission.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Next of Kin / Guarantor Full Name"><Input value={draft.nextOfKinName} onChange={(e) => setDraftField('nextOfKinName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                <Field label="Relationship"><Input value={draft.nextOfKinRelationship} onChange={(e) => setDraftField('nextOfKinRelationship', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                <Field label="Phone Number"><Input value={draft.nextOfKinPhone} onChange={(e) => setDraftField('nextOfKinPhone', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                <Field label="Address"><Input value={draft.nextOfKinAddress} onChange={(e) => setDraftField('nextOfKinAddress', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="National ID Front Image">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*,.pdf" disabled={role === 'CREDIT_ANALYST'} onChange={(e) => handleFileChange('idFront', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.idFront ? files.idFront.name : 'No front image selected.'}</p>
                  </div>
                </Field>
                <Field label="National ID Back Image">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*,.pdf" disabled={role === 'CREDIT_ANALYST'} onChange={(e) => handleFileChange('idBack', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.idBack ? files.idBack.name : 'No back image selected.'}</p>
                  </div>
                </Field>
                <Field label="Proof of Residence File">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*,.pdf" disabled={role === 'CREDIT_ANALYST'} onChange={(e) => handleFileChange('proofOfResidence', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.proofOfResidence ? files.proofOfResidence.name : 'Optional file not selected.'}</p>
                  </div>
                </Field>
                <Field label="Passport Photo File">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*" disabled={role === 'CREDIT_ANALYST'} onChange={(e) => handleFileChange('passportPhoto', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.passportPhoto ? files.passportPhoto.name : 'Optional file not selected.'}</p>
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Existing Loans">
                  <select value={draft.hasExistingLoans} onChange={(e) => setDraftField('hasExistingLoans', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="NO">No</option>
                    <option value="YES">Yes</option>
                  </select>
                </Field>
                <Field label="Client Status">
                  <select value={draft.clientStatus} onChange={(e) => setDraftField('clientStatus', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="BLACKLISTED">Blacklisted</option>
                  </select>
                </Field>
                {hasExistingLoanDetails && (
                  <>
                    <Field label="Current Lender Name"><Input value={draft.existingLenderName} onChange={(e) => setDraftField('existingLenderName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                    <Field label="Outstanding Balance (MWK)"><Input type="number" value={draft.outstandingBalance} onChange={(e) => setDraftField('outstandingBalance', e.target.value)} disabled={role === 'CREDIT_ANALYST'} min="0" /></Field>
                  </>
                )}
                <Field label="Payment Channel">
                  <select value={draft.paymentChannel} onChange={(e) => setDraftField('paymentChannel', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK">Bank</option>
                  </select>
                </Field>
                {usesBankingDetails ? (
                  <>
                    <Field label="Bank Name">
                      <select value={draft.bankName} onChange={(e) => setDraftField('bankName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="">Select bank</option>
                        {BANK_OPTIONS.map(bank => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Account Name"><Input value={draft.bankAccountName} onChange={(e) => setDraftField('bankAccountName', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                    <Field label="Account Number"><Input value={draft.bankAccountNumber} onChange={(e) => setDraftField('bankAccountNumber', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                    <Field label="Branch"><Input value={draft.bankBranch} onChange={(e) => setDraftField('bankBranch', e.target.value)} disabled={role === 'CREDIT_ANALYST'} placeholder="Optional" /></Field>
                  </>
                ) : (
                  <>
                    <Field label="Mobile Money Provider">
                      <select value={draft.mobileMoneyProvider} onChange={(e) => setDraftField('mobileMoneyProvider', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="AIRTEL_MONEY">Airtel Money</option>
                        <option value="TNM_MPAMBA">TNM Mpamba</option>
                      </select>
                    </Field>
                    <Field label="Mobile Money Number"><Input value={draft.mobileMoneyNumber} onChange={(e) => setDraftField('mobileMoneyNumber', e.target.value)} disabled={role === 'CREDIT_ANALYST'} /></Field>
                  </>
                )}
              </div>

              <Card className="bg-slate-50 border-none rounded-xl">
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Loan Product">
                      <select value={draft.loanProduct} onChange={(e) => setDraftField('loanProduct', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="Commercial Growth Bridge">Commercial Growth Bridge</option>
                        <option value="SME Expansion Fund">SME Expansion Fund</option>
                        <option value="Personal Asset Loan">Personal Asset Loan</option>
                      </select>
                    </Field>
                    <Field label="Currency">
                      <select value={draft.currency} onChange={(e) => setDraftField('currency', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="MWK">MWK - Malawi Kwacha</option>
                        <option value="USD">USD - United States Dollar</option>
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Requested Amount (MWK)">
                      <Input type="number" min="10000" step="10000" value={draft.requestedAmount} onChange={(e) => setDraftField('requestedAmount', e.target.value)} disabled={role === 'CREDIT_ANALYST'} />
                    </Field>
                    <Field label="Term (Months)">
                      <Input type="number" min="1" step="1" value={draft.termMonths} onChange={(e) => setDraftField('termMonths', e.target.value)} disabled={role === 'CREDIT_ANALYST'} />
                    </Field>
                  </div>
                  <Field label="Purpose of Loan">
                    <textarea value={draft.purpose} onChange={(e) => setDraftField('purpose', e.target.value)} disabled={role === 'CREDIT_ANALYST'} className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none" placeholder="Describe the reason for this loan request..." />
                  </Field>
                </CardContent>
              </Card>
            </section>
          )}

          {currentStep === 5 && (
            <section className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900">Review Before Submission</h3>
                <p className="text-sm text-slate-500 mt-1">Confirm identity, documents, financials, and the requested facility before sending to the approvals queue.</p>
              </div>

              <ReviewGrid
                items={[
                  { label: 'Client Source', value: draft.mode === 'existing' ? 'Existing Registry Record' : 'New Registration' },
                  { label: 'Applicant', value: draft.mode === 'existing' ? getClientName(selectedClient) : `${draft.firstName} ${draft.lastName}`.trim() || 'N/A' },
                  { label: 'National ID', value: draft.mode === 'existing' ? getClientIdNumber(selectedClient) || 'N/A' : draft.idNumber || 'N/A' },
                  { label: 'Age', value: draft.mode === 'new' ? `${applicantAge} years` : 'Existing profile' },
                  { label: 'District', value: draft.mode === 'existing' ? selectedClient?.district || 'Existing profile' : draft.district || 'N/A' },
                  { label: 'Employment', value: formatEmploymentLabel(draft.employmentStatus) },
                  { label: 'Monthly Income', value: `MWK ${monthlyIncome.toLocaleString()}` },
                  { label: 'Existing Debt', value: hasExistingLoanDetails ? `Yes ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ MWK ${outstandingBalance.toLocaleString()}` : 'No' },
                  { label: 'Payment Details', value: usesBankingDetails ? `${draft.bankName || 'No bank selected'} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ${draft.bankAccountNumber || 'No account number'}` : `${draft.mobileMoneyProvider} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ${draft.mobileMoneyNumber || 'No number'}` },
                  { label: 'Loan Product', value: draft.loanProduct },
                  { label: 'Requested Amount', value: `MWK ${requestedAmount.toLocaleString()}` },
                  { label: 'Term', value: `${termMonths} months` },
                  { label: 'KYC Files', value: `${files.idFront?.name || 'Missing front'} / ${files.idBack?.name || 'Missing back'}` },
                ]}
              />
            </section>
          )}

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Button variant="ghost" className="flex-1 h-12 font-bold text-slate-500" onClick={resetDraft}>
              CLEAR DRAFT
            </Button>
            {currentStep > 1 && (
              <Button variant="outline" className="flex-1 h-12 font-bold border-border" onClick={() => setCurrentStep(currentStep - 1)}>
                BACK
              </Button>
            )}
            {currentStep < APPLICATION_STEPS.length ? (
              <Button onClick={() => handleStepChange(currentStep + 1)} className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 font-bold gap-2" disabled={role === 'CREDIT_ANALYST'}>
                CONTINUE <ChevronRight size={18} />
              </Button>
            ) : (
              role !== 'CREDIT_ANALYST' && (
                <Button onClick={handleSubmit} className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 font-bold gap-2">
                  SUBMIT APPLICATION <ChevronRight size={18} />
                </Button>
              )
            )}
          </div>
        </div>

        {/* Sidebar Summary */}
        <div className="space-y-6">
          <Card className="bg-blue-900 text-white border-none p-6">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-4">Estimated Repayment</h4>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-3xl font-black">MWK {monthlyRepayment.toLocaleString()}</span>
              <span className="text-sm font-bold text-blue-300">/mo</span>
            </div>
            
            <div className="space-y-3 border-t border-blue-800 pt-4">
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">Interest Rate</span>
                <span className="font-bold">5.25% <span className="text-[10px] text-emerald-400">(Fixed)</span></span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">Total Interest</span>
                <span className="font-bold">MWK {Math.round(requestedAmount * 0.0525).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">Origination Fee</span>
                <span className="font-bold">MWK 2,500</span>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-blue-800 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Total Payable</span>
              <span className="text-xl font-black text-blue-400">MWK {totalPayable.toLocaleString()}</span>
            </div>
          </Card>

          <Card className="bg-emerald-50 border-none p-6 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={18} />
              <h4 className="font-black text-xs uppercase tracking-widest">Application Intelligence</h4>
            </div>
            <div className="space-y-2 text-xs text-emerald-800 leading-relaxed font-medium">
              <p>Client source: <span className="font-black">{draft.mode === 'existing' ? 'Existing' : 'New registration'}</span></p>
              <p>KYC reference: <span className="font-black">{kycFilesReady ? 'Front and back captured' : 'Pending'}</span></p>
              <p>Primary contact: <span className="font-black">{draft.preferredContactMethod}</span></p>
              <p>Payment rail: <span className="font-black">{usesBankingDetails ? (draft.bankName || 'Bank account pending') : draft.mobileMoneyProvider}</span></p>
              <p>Debt profile: <span className="font-black">{hasExistingLoanDetails ? 'Has external obligations' : 'No external obligations declared'}</span></p>
            </div>
          </Card>

          <Card className="border border-border shadow-none rounded-lg bg-white p-5">
            <h3 className="text-sm font-bold mb-4">Recent Applications</h3>
            <div className="space-y-3">
              {applications.slice(0, 4).map(app => (
                <div key={app.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-sm font-bold text-slate-900">{app.clientSnapshot?.name || `Client ${app.clientId?.slice(0, 8) || 'N/A'}`}</p>
                  <p className="text-[11px] text-slate-500">MWK {(app.requestedAmount || 0).toLocaleString()} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ {app.status}</p>
                </div>
              ))}
              {applications.length === 0 && (
                <p className="text-xs text-slate-400 italic">No submitted applications yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function ReviewGrid({ items }: { items: { label: string, value: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map(item => (
        <Card key={item.label} className="border border-border shadow-none rounded-lg bg-white">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{item.label}</p>
            <p className="text-sm font-semibold text-slate-900">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StepItem({ number, label, active, completed = false }: any) {
  return (
    <div className="flex items-center gap-4">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        active ? 'bg-slate-900 text-white' : completed ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
      }`}>
        {completed ? <CheckCircle2 size={14} /> : number}
      </div>
      <span className={`text-sm font-bold ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

function ApprovalsView({ 
  applications, 
  role, 
  handleStageTransition,
  fetchCRBReport,
  handleSaveManualCRB,
  loanProducts
}: { 
  applications: any[], 
  role: UserRole, 
  handleStageTransition: (app: any, stage: LoanStage, comment?: string, analysisData?: any) => Promise<boolean>,
  fetchCRBReport: (app: any) => Promise<void>,
  handleSaveManualCRB: (app: any, score: number, summary: string) => Promise<void>,
  loanProducts: LoanProduct[]
}) {
  const [showManualCRB, setShowManualCRB] = useState<string | null>(null);
  const [manualScore, setManualScore] = useState<string>('');
  const [manualSummary, setManualSummary] = useState<string>('');
  const pendingApps = applications.filter(a => ['PENDING', 'REVIEWED'].includes(normalizeApplicationStage(a.current_stage, a.status)));

  const getWorkflowAction = (app: any) => {
    const stage = normalizeApplicationStage(app.current_stage, app.status);
    if (stage === 'PENDING' && (role === 'OFFICER' || role === 'ADMIN')) {
      return { label: 'Review Complete', target: 'REVIEWED' as LoanStage, color: 'bg-amber-600' };
    }
    return null;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Credit Approvals</h2>
          <p className="text-slate-500 mt-1">Review and authorize pending loan applications.</p>
        </div>
        <Badge className="bg-orange-100 text-orange-700 border-none px-3 py-1 uppercase tracking-widest text-[10px] font-black">
          {pendingApps.length} PENDING REVIEW
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {pendingApps.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-border rounded-xl bg-[#F9FAFB]">
            <CheckCircle2 className="mx-auto text-muted-foreground/30 mb-3" size={40} />
            <h3 className="text-sm font-bold text-foreground">Queue Clear</h3>
            <p className="text-[12px] text-muted-foreground mt-1">All applications have been processed.</p>
          </div>
        ) : (
          pendingApps.map(app => (
            <Card key={app.id} className="border border-border shadow-none rounded-lg overflow-hidden flex flex-col md:flex-row bg-white">
              {/* Main Content Area */}
              <div className="p-4 flex-1 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-900">{app.clientSnapshot?.name || 'Unknown'}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-slate-100 text-slate-600 border-none text-[10px] font-bold">
                        {(app.current_stage || 'SUBMITTED').replace('_', ' ')}
                      </Badge>
                      <p className="text-[11px] text-slate-400">ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Created {getRelativeTimeLabel(app.createdAt)}</p>
                    </div>
                    <div className="mt-2">
                       <h4 className="font-bold text-[13px] text-foreground">Application #{app.id.slice(0, 8).toUpperCase()}</h4>
                    </div>
                  </div>
                  <span className="bg-[#DBEAFE] text-[#1E40AF] px-2 py-0.5 rounded-full text-[10px] font-bold">{app.status}</span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-2">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Requested</p>
                    <p className="text-lg font-bold text-foreground">MWK {app.requestedAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Term</p>
                    <p className="text-lg font-bold text-foreground">{app.termMonths} <span className="text-[11px] text-muted-foreground font-medium">Mo</span></p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Income</p>
                    <p className="text-lg font-bold text-foreground">MWK {(app.annualIncome || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Employment</p>
                    <p className="text-[12px] font-semibold text-foreground">{app.employmentStatus?.replace('_', ' ') || 'N/A'}</p>
                  </div>
                </div>

                {app.purpose && (
                  <div className="pt-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Purpose</p>
                    <p className="text-[12px] text-slate-600 leading-relaxed italic">"{app.purpose}"</p>
                  </div>
                )}

                {/* Phase 2: CRB Section */}
                <div className="pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                       <ShieldCheck className="text-indigo-600" size={16} />
                       <h4 className="text-[11px] font-bold uppercase tracking-tight">Credit Registry (CRB)</h4>
                    </div>
                    {app.crb ? (
                      <Badge className={`${
                        app.crb.riskLevel === 'HIGH' ? 'bg-red-50 text-red-600' :
                        app.crb.riskLevel === 'MEDIUM' ? 'bg-amber-50 text-amber-600' :
                        'bg-emerald-50 text-emerald-600'
                      } border-none text-[10px] font-black uppercase px-2`}>
                        {app.crb.riskLevel} RISK
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground font-bold border-slate-200">
                        PENDING CHECK
                      </Badge>
                    )}
                  </div>

                  {!app.crb ? (
                    <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                      {showManualCRB === app.id ? (
                        <div className="space-y-3">
                           <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                               <label className="text-[9px] font-bold text-muted-foreground uppercase">CRB Score</label>
                               <Input 
                                 type="number" 
                                 placeholder="e.g. 620" 
                                 className="h-8 text-xs font-bold"
                                 value={manualScore}
                                 onChange={(e) => setManualScore(e.target.value)}
                               />
                             </div>
                             <div className="flex items-end pb-0.5">
                               <Button 
                                 size="sm" 
                                 className="h-8 w-full text-[10px] bg-indigo-600"
                                 onClick={() => {
                                   handleSaveManualCRB(app, parseInt(manualScore), manualSummary);
                                   setShowManualCRB(null);
                                   setManualScore('');
                                   setManualSummary('');
                                 }}
                               >SAVE DATA</Button>
                             </div>
                           </div>
                           <textarea 
                             className="w-full text-xs font-medium p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                             placeholder="Summary remarks..."
                             rows={2}
                             value={manualSummary}
                             onChange={(e) => setManualSummary(e.target.value)}
                           />
                           <Button variant="link" className="p-0 h-auto text-[10px] text-muted-foreground" onClick={() => setShowManualCRB(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold h-8 flex-1 gap-2"
                            onClick={() => fetchCRBReport(app)}
                          >
                            <RefreshCw size={12} className={app.current_stage === 'CRB_CHECK' ? 'animate-spin' : ''} />
                            FETCH FROM BUREAU
                          </Button>
                          <Button 
                            variant="outline" 
                            className="text-[10px] font-bold h-8 border-slate-200 text-slate-600 hover:bg-white"
                            onClick={() => setShowManualCRB(app.id)}
                          >
                            MANUAL ENTRY
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/30 p-3 rounded-lg border border-slate-50">
                       <div className="bg-white p-2 rounded border border-slate-100 text-center">
                          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight">Score</p>
                          <p className="text-sm font-black text-indigo-700">{app.crb.score}</p>
                       </div>
                       <div className="md:col-span-2">
                          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight mb-1">Bureau Summary</p>
                          <p className="text-[11px] font-medium text-slate-600 line-clamp-2 italic leading-tight">{app.crb.reportSummary}</p>
                       </div>
                       <div className="flex flex-col justify-center items-end">
                          <Badge variant="outline" className="text-[8px] font-bold text-slate-400 border-slate-200 uppercase">
                             via {app.crb.source}
                          </Badge>
                       </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Actions */}
              <div className="bg-[#F9FAFB] border-l border-border p-4 flex flex-row md:flex-col justify-center gap-2 w-full md:w-48">
                {(() => {
                  const action = getWorkflowAction(app);
                  if (action) {
                    return (
                      <>
                        <Button 
                          onClick={() => {
                            const comment = window.prompt('Enter review comment / eligibility summary:');
                            if (!comment) return;
                            handleStageTransition(app, action.target as LoanStage, comment, {
                              decision: 'REVIEW',
                              reasons: ['Application complete', 'Basic eligibility confirmed'],
                            });
                          }}
                          size="sm"
                          className={`w-full h-9 text-[11px] font-bold text-white ${action.color}`}
                        >
                          {action.label.toUpperCase()}
                        </Button>
                        <Button 
                          onClick={() => {
                            const comment = window.prompt('Enter the reason for sending this application back to the client:');
                            if (!comment) return;
                            handleStageTransition(app, 'REFERRED_BACK', comment, {
                              decision: 'REFER_BACK',
                              reasons: ['Corrections required'],
                            });
                          }}
                          variant="outline" 
                          size="sm"
                          className="w-full h-9 text-[11px] font-bold border-border text-muted-foreground hover:bg-white"
                        >
                          REFER BACK
                        </Button>
                      </>
                    );
                  }
                  return <Badge variant="outline" className="w-full h-9 flex items-center justify-center text-[10px] font-bold border-border text-muted-foreground">LOCKED</Badge>;
                })()}
              </div>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  );
}

function RepaymentsView({ loans, role, loanProducts }: { loans: any[], role: UserRole, loanProducts: LoanProduct[] }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Repayment Ledger</h2>
          <p className="text-[12px] text-muted-foreground">Comprehensive oversight of global loan repayments.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => runFinancialMaintenance(loans, loanProducts)}
            variant="outline" 
            size="sm" 
            className="h-9 px-4 text-xs font-bold border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 gap-2"
          >
            <ShieldAlert size={14} /> RUN MAINTENANCE
          </Button>
          <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold border-border bg-white">
            Export Ledger
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          title="Collected MTD" 
          value="MWK 1.24M" 
          trend="+12.4%" 
          trendUp={true}
          icon={<DollarSign className="text-primary" size={18} />}
          iconBg="bg-primary/10"
        />
        <StatCard 
          title="Active Arrears" 
          value="MWK 42,800" 
          trend="14 Cases" 
          trendUp={false}
          icon={<AlertCircle className="text-[#EF4444]" size={18} />}
          iconBg="bg-[#FEE2E2]"
        />
        <StatCard 
          title="Projected Cashflow" 
          value="MWK 3.18M" 
          trend="Q2 Forecast" 
          icon={<TrendingUp className="text-[#6366F1]" size={18} />}
          iconBg="bg-[#EEF2FF]"
        />
        <StatCard 
          title="Recovery Rate" 
          value="99.2%" 
          trend="Target: 98%" 
          trendUp={true}
          icon={<CheckCircle2 className="text-[#10B981]" size={18} />}
          iconBg="bg-[#D1FAE5]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border border-border shadow-none rounded-lg overflow-hidden bg-white">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Active Loan Portfolio</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-[11px] border-border">Filter</Button>
            </div>
          </div>
          <Table className="text-[12px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Loan Details</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Balance</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Next Due</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Status</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                    No active loans found.
                  </TableCell>
                </TableRow>
              ) : (
                loans.map(loan => (
                  <RepaymentRow 
                    key={loan.id}
                    loan={loan}
                    role={role}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-5">
          <Card className="border border-border shadow-none rounded-lg bg-white">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Delinquency Tracking</h3>
            </div>
            <div className="p-4 space-y-3">
              <DelinquencyItem 
                client="Global Logistics Ltd" 
                amount="MWK 12,400" 
                days={14} 
                severity="medium" 
              />
              <DelinquencyItem 
                client="TechNova Solutions" 
                amount="MWK 8,200" 
                days={42} 
                severity="high" 
              />
              <DelinquencyItem 
                client="Urban Retail Group" 
                amount="MWK 3,150" 
                days={5} 
                severity="low" 
              />
            </div>
            <div className="p-3 border-t border-border bg-[#F9FAFB]">
              <Button variant="ghost" className="w-full text-[11px] font-bold text-primary h-8">VIEW ALL ARREARS</Button>
            </div>
          </Card>

          <div className="bg-[#1A1C23] text-white p-5 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-sidebar-foreground">
              <TrendingUp size={16} />
              <h4 className="font-bold text-[11px] uppercase tracking-widest">Weekly Insights</h4>
            </div>
            <p className="text-[12px] text-sidebar-foreground leading-relaxed">
              Repayment velocity has increased by <span className="text-white font-bold">8.4%</span> following the new automated reminder rollout.
            </p>
            <div className="pt-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                <span>Collection Target</span>
                <span>84%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[84%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AgentPaymentCollectionView({
  loans,
  clients,
  onCollect,
}: {
  loans: any[],
  clients: any[],
  onCollect: (loan: any, amount: number) => Promise<boolean>,
}) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successState, setSuccessState] = useState<{ clientName: string; amount: number } | null>(null);

  const collectibleLoans = loans.filter((loan) => (loan.outstandingBalance || 0) > 0);
  const clientOptions = clients.filter((client) => collectibleLoans.some((loan) => loan.clientId === client.id || loan.clientName === client.name));
  const selectedLoan = collectibleLoans.find((loan) => loan.id === selectedLoanId) || null;

  const handleContinue = () => {
    if (!selectedClientId || !selectedLoan) {
      toast.error('Select a client and loan to continue.');
      return;
    }
    setAmount(String(Math.min(selectedLoan.outstandingBalance || 0, 20000)));
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!selectedLoan) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Enter a valid repayment amount.');
      return;
    }
    setIsSubmitting(true);
    const success = await onCollect(selectedLoan, numericAmount);
    setIsSubmitting(false);
    if (!success) return;
    setSuccessState({
      clientName: selectedLoan.clientName || clients.find((client) => client.id === selectedLoan.clientId)?.name || 'Client',
      amount: numericAmount,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Payment Collection</h2>
        <p className="text-sm text-slate-500 mt-1">Collect in-person repayments and issue an official receipt immediately.</p>
      </div>

      {successState && (
        <Card className="border border-emerald-200 bg-emerald-50 shadow-none rounded-2xl">
          <CardContent className="p-6">
            <h3 className="text-xl font-black text-emerald-900">Payment Successful</h3>
            <p className="text-sm text-emerald-800 mt-2">
              {successState.clientName} paid {formatCurrency(successState.amount)}. Official Receipt generated.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border border-slate-200 shadow-none rounded-[2rem] bg-white">
        <CardContent className="p-6 space-y-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Step 1: Select Client &amp; Loan</p>
            <p className="text-sm text-slate-500 mt-2">Pick the borrower first, then choose the exact facility you are collecting against.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Clients</h3>
              {clientOptions.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setSelectedLoanId(null);
                    setStep(1);
                    setSuccessState(null);
                  }}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                    selectedClientId === client.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-black">{client.name}</p>
                  <p className={`text-xs mt-1 ${selectedClientId === client.id ? 'text-slate-300' : 'text-slate-500'}`}>{client.phone || 'No phone on file'}</p>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Loans</h3>
              {collectibleLoans
                .filter((loan) => !selectedClientId || loan.clientId === selectedClientId || loan.clientName === clients.find((client) => client.id === selectedClientId)?.name)
                .map((loan) => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => {
                      setSelectedLoanId(loan.id);
                      setSuccessState(null);
                    }}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                      selectedLoanId === loan.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-black text-slate-900">Loan #{loan.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-slate-500 mt-1">Outstanding {formatCurrency(loan.outstandingBalance || 0)}</p>
                  </button>
                ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleContinue} className="bg-slate-900 hover:bg-slate-800 text-white font-black" disabled={!selectedClientId || !selectedLoanId}>
              Continue to Payment
            </Button>
          </div>
        </CardContent>
      </Card>

      {step === 2 && selectedLoan && (
        <Card className="border border-slate-200 shadow-none rounded-[2rem] bg-white">
          <CardContent className="p-6 space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Step 2: Capture Payment</p>
              <h3 className="text-xl font-black text-slate-900 mt-2">Repayment Amount</h3>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Repayment Amount</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 rounded-2xl border-slate-200 font-black text-lg" />
            </div>
            <div className="flex justify-between items-center rounded-2xl bg-slate-50 border border-slate-100 px-4 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Loan Balance</p>
                <p className="text-lg font-black text-slate-900 mt-1">{formatCurrency(selectedLoan.outstandingBalance || 0)}</p>
              </div>
              <Button onClick={handleConfirm} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black">
                {isSubmitting ? 'Processing...' : 'Confirm Collection'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function DelinquencyItem({ client, amount, days, severity }: any) {
  const severityColors = {
    low: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    high: 'bg-red-50 text-red-700'
  };

  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg">
      <div>
        <p className="text-sm font-bold text-foreground">{client}</p>
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">{days} Days Overdue</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-foreground">{amount}</p>
        <Badge className={`border-none text-[9px] font-black uppercase tracking-tighter px-1.5 py-0 h-4 ${severityColors[severity as keyof typeof severityColors]}`}>
          {severity}
        </Badge>
      </div>
    </div>
  );
}

function RepaymentRow({ loan, role }: any) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState<RepaymentScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'repayment_schedule'), 
        where('loanId', '==', loan.id), 
        orderBy('installmentNumber', 'asc')
      );
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RepaymentScheduleItem));
      setSchedule(items);
    } catch (e) {
      handleFirestoreError(e, OperationType.READ, 'repayment_schedule');
    }
    setLoading(false);
  };

  const nextInstallment = schedule.find(i => i.status !== 'PAID');
  const id = loan.id.slice(0, 8).toUpperCase();
  const amount = `MWK ${(loan.amount || 0).toLocaleString()}`;
  const balance = `MWK ${(loan.outstandingBalance || 0).toLocaleString()}`;
  const status = loan.status;
  const dueDate = loan.nextDueDate ? formatDateLabel(loan.nextDueDate) : 'N/A';

  return (
    <>
      <TableRow className="border-border hover:bg-slate-50/50 transition-colors">
        <TableCell className="px-4 py-4">
          <p className="font-bold text-foreground">#{id}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{loan.productName || 'Standard Loan'}</p>
        </TableCell>
        <TableCell className="px-4 py-4">
          <p className="font-bold text-foreground">{balance}</p>
          <p className="text-[10px] text-muted-foreground">Original: {amount}</p>
        </TableCell>
        <TableCell className="px-4 py-4">
          <p className="font-semibold text-foreground">{dueDate}</p>
          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">
            {loan.outstandingBalance > 0 ? (loan.status === 'DEFAULTED' ? 'OVERDUE' : 'UPCOMING') : 'PAID'}
          </p>
        </TableCell>
        <TableCell className="px-4 py-4">
          <Badge className={`border-none text-[10px] font-bold ${
            status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 
            status === 'DEFAULTED' ? 'bg-red-50 text-red-700' :
            'bg-slate-100 text-slate-600'
          }`}>{status}</Badge>
        </TableCell>
        <TableCell className="px-4 py-4 text-right">
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-[11px] font-bold border-border"
              onClick={() => {
                setShowSchedule(true);
                fetchSchedule();
              }}
            >
              SCHEDULE
            </Button>
            {role !== 'CREDIT_ANALYST' && loan.outstandingBalance > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-primary hover:bg-primary/5">
                COLLECT
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {showSchedule && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl w-full max-h-[90vh] overflow-hidden"
            >
              <Card className="border-none shadow-2xl rounded-xl overflow-hidden h-full flex flex-col">
                <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold">Repayment Schedule</h3>
                    <p className="text-slate-400 text-xs mt-1">Loan ID: #{id} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ {loan.clientName}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setShowSchedule(false)}>
                    <X size={20} />
                  </Button>
                </div>
                
                <div className="p-6 flex-1 overflow-auto bg-white">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <RefreshCw className="animate-spin text-slate-300" size={32} />
                      <p className="text-sm text-slate-400 font-bold">Fetching latest amortization data...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Loan</p>
                          <p className="text-sm font-bold">{amount}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Outstanding</p>
                          <p className="text-sm font-bold text-blue-600">{balance}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Interest Rate</p>
                          <p className="text-sm font-bold">{loan.interestRate}% <span className="text-[10px] text-muted-foreground">(Reducing)</span></p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Term</p>
                          <p className="text-sm font-bold">{loan.termMonths} Months</p>
                        </div>
                      </div>

                      <Table className="text-[13px]">
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="font-bold text-slate-900 w-16 px-2">Ins.</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Due Date</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Principal</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Interest</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Penalty</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Total Due</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Paid</TableHead>
                            <TableHead className="font-bold text-slate-900 px-2">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schedule.map(item => (
                            <TableRow key={item.id} className="border-border">
                              <TableCell className="font-bold px-2 py-3 text-slate-500">{item.installmentNumber}</TableCell>
                              <TableCell className="font-medium px-2 py-3">{formatDateLabel(item.dueDate)}</TableCell>
                              <TableCell className="px-2 py-3">MWK {item.principalAmount?.toLocaleString()}</TableCell>
                              <TableCell className="px-2 py-3">MWK {item.interestAmount?.toLocaleString()}</TableCell>
                              <TableCell className="px-2 py-3">
                                {item.penaltyAmount > 0 ? (
                                  <span className="text-red-600 font-bold">MWK {item.penaltyAmount.toLocaleString()}</span>
                                ) : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}
                              </TableCell>
                              <TableCell className="font-black px-2 py-3">MWK {(item.total + (item.penaltyAmount || 0)).toLocaleString()}</TableCell>
                              <TableCell className="px-2 py-3 text-emerald-600 font-bold">MWK {item.paidAmount?.toLocaleString() || 0}</TableCell>
                              <TableCell className="px-2 py-3">
                                <Badge className={`text-[9px] font-black border-none uppercase px-1.5 ${
                                  item.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                                  item.status === 'OVERDUE' ? 'bg-red-50 text-red-700' :
                                  item.status === 'PARTIAL' ? 'bg-amber-50 text-amber-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {item.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                  <Button variant="outline" className="text-xs font-bold" onClick={() => setShowSchedule(false)}>CLOSE</Button>
                  {role !== 'CREDIT_ANALYST' && loan.outstandingBalance > 0 && (
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-8">COLLECT REPAYMENT</Button>
                  )}
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function RepaymentAuditView({ transactions, loans, onVerifyRepayment }: { transactions: any[], loans: any[], onVerifyRepayment: (txId: string, amount: number) => Promise<void> }) {
  const pendingRepayments = transactions.filter(tx => tx.type === 'REPAYMENT' && tx.status === 'PENDING_VERIFICATION');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-slate-200">
        <div>
          <h2 className="text-3xl font-black tracking-tighter italic">Verification Queue</h2>
          <p className="text-slate-400 text-sm font-medium mt-1">Audit proof-of-payment and apply allocation algorithm.</p>
        </div>
        <div className="bg-brand-500/10 border border-brand-500/20 px-6 py-3 rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Total Pending</p>
          <p className="text-2xl font-black">{pendingRepayments.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {pendingRepayments.length === 0 ? (
          <Card className="p-20 flex flex-col items-center justify-center text-slate-300 border-dashed border-2 rounded-[3rem] bg-slate-50/30">
            <ShieldCheck size={64} className="mb-6 grayscale opacity-20" />
            <p className="font-black uppercase tracking-[0.2em] text-xs">All clear</p>
            <p className="text-sm mt-2 font-medium opacity-60">No repayments awaiting verification at this time.</p>
          </Card>
        ) : (
          pendingRepayments.map(tx => {
            const loan = loans.find(l => l.id === tx.loanId);
            return (
              <Card key={tx.id} className="p-8 rounded-[2.5rem] border border-slate-100 shadow-xl hover:border-brand-500/20 transition-all group overflow-hidden">
                <div className="flex flex-col xl:flex-row gap-8">
                  <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-900 group-hover:bg-brand-50 group-hover:text-brand-600 transition-all">
                          <CreditCard size={24} />
                        </div>
                        <div>
                          <h3 className="font-black text-lg text-slate-900 tracking-tight">Repayment: MWK {tx.amount.toLocaleString()}</h3>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loan Ref: {tx.loanId.slice(-8).toUpperCase()} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ {loan?.clientSnapshot?.name || 'Unknown Client'}</p>
                        </div>
                      </div>
                      <Badge className="bg-amber-50 text-amber-600 border-none font-black text-[10px] px-3 py-1.5 rounded-xl uppercase tracking-widest">PENDING VERIFICATION</Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Submitted</p>
                        <p className="text-xs font-bold text-slate-700">{new Date(tx.timestamp).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Channel</p>
                        <p className="text-xs font-bold text-slate-700">{tx.method || 'Paychangu Gateway'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Client ID</p>
                        <p className="text-xs font-bold text-brand-600">Verified</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Allocation Rule</p>
                        <p className="text-xs font-bold text-slate-700">P ? I ? Pr</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <Button 
                        onClick={() => onVerifyRepayment(tx.id, tx.amount)}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-black px-8 h-12 rounded-xl text-xs tracking-tight shadow-lg shadow-brand-500/20"
                      >
                        VERIFY & ALLOCATE
                      </Button>
                      <Button variant="outline" className="h-12 px-6 rounded-xl text-xs font-black border-slate-200">REJECT PROOF</Button>
                    </div>
                  </div>

                  <div className="w-full xl:w-96 space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Evidence / Proof of Payment</p>
                    <div className="aspect-[4/3] rounded-3xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden relative group">
                      {tx.proofUrl ? (
                        <img src={tx.proofUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Proof of Payment" />
                      ) : (
                        <div className="text-center p-6">
                          <EyeOff size={32} className="mx-auto mb-3 opacity-20" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">No visual evidence provided via gateway</p>
                        </div>
                      )}
                      {tx.proofUrl && <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <Button variant="outline" className="bg-white border-none text-slate-900 font-bold h-9">VIEW FULLSIZE</Button>
                      </div>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function LoanOfficerDashboardView({ 
  clients, 
  loans, 
  applications, 
  transactions, 
  onNavigate,
  handleStageTransition 
}: { 
  clients: any[], 
  loans: any[], 
  applications: any[], 
  transactions: any[], 
  onNavigate: (view: View) => void,
  handleStageTransition: (app: any, stage: LoanStage, comment?: string) => Promise<boolean>
}) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pendingApps = applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW');
  const newApps24h = applications.filter(a => {
    const date = getTimestampDate(a.createdAt);
    return date ? date > last24h : false;
  }).length;
  
  const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');
  const overdueLoans = loans.filter(loan => loan.status === 'DEFAULTED');
  const outstandingPortfolio = loans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
  
  const highRiskApps = applications.filter(app => 
    normalizeApplicationStage(app.current_stage, app.status) === 'PENDING' && 
    ((app.crb?.score || 0) < 450 || (app.requestedAmount || 0) > 300000)
  ).length;

  const averageTicketSize = activeLoans.length > 0
    ? activeLoans.reduce((sum, loan) => sum + (loan.amount || 0), 0) / activeLoans.length
    : 0;

  const collectionThisMonth = transactions
    .filter(t => {
      const date = getTimestampDate(t.timestamp);
      const now = new Date();
      return t.type === 'REPAYMENT' && date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const portfolioMix = [
    { name: 'Commercial', value: loans.filter(l => l.loanProduct === 'Commercial Growth Bridge').length, color: '#208CA2' },
    { name: 'SME', value: loans.filter(l => l.loanProduct === 'SME Expansion Fund').length, color: '#42DAD9' },
    { name: 'Personal', value: loans.filter(l => l.loanProduct === 'Personal Asset Loan').length, color: '#0A4969' },
  ].filter(d => d.value > 0);

  const riskQueue = pendingApps
    .map(app => ({
      app,
      clientName: getApplicationClientLabel(app, clients),
      riskScore: app.crb?.score || 300,
      amount: app.requestedAmount || 0
    }))
    .sort((a, b) => a.riskScore - b.riskScore)
    .slice(0, 5);

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-12"
    >
      {/* Header / Hero Section */}
      <motion.div variants={item} className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-8 lg:p-12 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-500/10 to-transparent pointer-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-brand-300 backdrop-blur-md border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              Real-time Operational Status
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter leading-tight italic">
              OFFICER<br />COMMAND CENTER
            </h1>
            <p className="text-slate-400 text-sm max-w-md font-medium leading-relaxed">
              Managing {activeLoans.length} active facilities with {pendingApps.length} fresh applications in the review pipeline.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="glass-card !bg-white/5 !border-white/10 p-6 rounded-3xl text-center min-w-[140px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Approval Velocity</p>
              <p className="text-3xl font-black italic">94%</p>
            </div>
            <div className="glass-card !bg-brand-500/20 !border-brand-500/20 p-6 rounded-3xl text-center min-w-[140px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-300 mb-2">Pending Decision</p>
              <p className="text-3xl font-black italic text-brand-400">{pendingApps.length}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Cluster */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={item}>
          <div className="glass-card p-6 rounded-[2rem] border-l-4 border-l-brand-500 flex items-center justify-between group hover:bg-slate-50 transition-all">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total AUM</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(outstandingPortfolio)}</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 group-hover:scale-110 transition-transform">
              <Briefcase size={24} />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <div className="glass-card p-6 rounded-[2rem] border-l-4 border-l-emerald-500 flex items-center justify-between group hover:bg-slate-50 transition-all">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recovery Rate</p>
              <p className="text-2xl font-black text-slate-900 mt-1">98.2%</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <TrendingUp size={24} />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <div className="glass-card p-6 rounded-[2rem] border-l-4 border-l-amber-500 flex items-center justify-between group hover:bg-slate-50 transition-all">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">High Risk Queue</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{highRiskApps}</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
              <ShieldAlert size={24} />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <div className="glass-card p-6 rounded-[2rem] border-l-4 border-l-indigo-500 flex items-center justify-between group hover:bg-slate-50 transition-all">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Ticket Size</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(averageTicketSize)}</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
              <Target size={24} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Review Queue */}
        <motion.div variants={item} className="lg:col-span-12">
          <div className="glass-card rounded-[2.5rem] overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 italic uppercase">Priority Review Queue</h3>
                <p className="text-xs text-slate-500 font-bold tracking-tight">Applications requiring manual credit assessment.</p>
              </div>
              <Button 
                onClick={() => onNavigate('approvals')}
                className="h-11 px-6 rounded-2xl bg-slate-900 text-white font-black hover:bg-slate-800 transition-all hover:translate-x-1"
              >
                OPEN WORKSPACE
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="px-8 h-12 text-[10px] font-black uppercase tracking-widest text-slate-400">Applicant Identity</TableHead>
                    <TableHead className="px-8 h-12 text-[10px] font-black uppercase tracking-widest text-slate-400">Facility Amount</TableHead>
                    <TableHead className="px-8 h-12 text-[10px] font-black uppercase tracking-widest text-slate-400">Risk Assessment</TableHead>
                    <TableHead className="px-8 h-12 text-[10px] font-black uppercase tracking-widest text-slate-400">SLA Status</TableHead>
                    <TableHead className="px-8 h-12 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApps.slice(0, 5).map(app => {
                    const client = clients.find(c => c.id === app.clientId);
                    const risk = (app.crb?.score || 0) < 450 ? 'HIGH' : (app.crb?.score || 0) < 620 ? 'MEDIUM' : 'LOW';
                    return (
                      <TableRow key={app.id} className="group hover:bg-slate-50/50 border-slate-50 transition-colors">
                        <TableCell className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-900 text-xs">
                              {client?.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-black text-slate-900">{client?.name || 'Unknown Client'}</p>
                              <p className="text-[10px] font-bold text-slate-400 italic">APP-{app.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-5">
                          <p className="font-black text-slate-900">{formatCurrency(app.requestedAmount || 0)}</p>
                          <p className="text-[10px] font-bold text-slate-400">{app.loanProduct}</p>
                        </TableCell>
                        <TableCell className="px-8 py-5">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${
                            risk === 'HIGH' ? 'bg-red-50 text-red-600' : risk === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              risk === 'HIGH' ? 'bg-red-500' : risk === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />
                            {risk} RISK
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-5 font-black text-[11px] text-slate-500">
                          <SLAStatusIndicator submittedAt={app.submittedAt || app.createdAt} />
                        </TableCell>
                        <TableCell className="px-8 py-5 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => onNavigate('approvals')}
                            className="h-9 px-4 rounded-xl font-black text-brand-600 hover:bg-brand-50"
                          >
                            REVIEW CASE
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pendingApps.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-20 text-slate-400 font-bold italic">
                        The decision queue is currently empty.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </motion.div>

        {/* Portfolio Analysis */}
        <motion.div variants={item} className="lg:col-span-8">
          <div className="glass-card rounded-[2.5rem] p-8 h-full">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-slate-900 italic uppercase">Portfolio Mix</h3>
              <p className="text-xs text-slate-500 font-bold">Concentration by asset class.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={portfolioMix} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={5}>
                      {portfolioMix.map((entry, index) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                {portfolioMix.map(pm => (
                  <div key={pm.name} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pm.color }} />
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{pm.name}</span>
                    </div>
                    <span className="font-black text-slate-900">{pm.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Risk Spotlight */}
        <motion.div variants={item} className="lg:col-span-4">
          <div className="glass-card rounded-[2.5rem] p-8 h-full bg-slate-950 text-white">
            <h3 className="text-xl font-black italic uppercase mb-8">Risk Spotlight</h3>
            <div className="space-y-6">
              {riskQueue.length > 0 ? riskQueue.map(rq => (
                <div key={rq.app.id} className="relative p-4 rounded-2xl bg-white/5 border border-white/10 group hover:bg-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-black text-sm truncate pr-4">{rq.clientName}</p>
                    <span className="text-[9px] font-black text-red-400 uppercase tracking-tighter">CRB: {rq.riskScore}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{formatCurrency(rq.amount)}</p>
                    <Button variant="ghost" className="h-6 text-[9px] font-black text-brand-400 p-0" onClick={() => onNavigate('approvals')}>VIEW</Button>
                  </div>
                </div>
              )) : (
                <p className="text-slate-500 italic text-sm text-center py-12">No high-risk items requiring focus.</p>
              )}
              
              <div className="pt-6 border-t border-white/10 text-center">
                <Button 
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white font-black rounded-2xl h-11"
                  onClick={() => onNavigate('approvals')}
                >
                  FULL RISK AUDIT
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}



function LoanProductsView({ products }: { products: LoanProduct[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<LoanProduct>>({
    name: '',
    interestRate: 15,
    maxTerm: 12,
    minAmount: 1000,
    maxAmount: 50000,
    status: 'ACTIVE',
    charges: {
      applicationFee: { type: 'FIXED', value: 2500 },
      processingFee: { type: 'PERCENTAGE', value: 2 },
      disbursementFee: { type: 'FIXED', value: 0 }
    },
    penaltyRate: 500,
    penaltyType: 'FIXED'
  });

  const handleSaveProduct = async () => {
    if (!newProduct.name) {
      toast.error("Product name is required");
      return;
    }
    try {
      await addDoc(collection(db, 'loan_products'), {
        ...newProduct,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success("Loan product created successfully");
      setIsAdding(false);
      setNewProduct({
        name: '',
        interestRate: 15,
        maxTerm: 12,
        minAmount: 1000,
        maxAmount: 50000,
        status: 'ACTIVE',
        charges: {
          applicationFee: { type: 'FIXED', value: 2500 },
          processingFee: { type: 'PERCENTAGE', value: 2 },
          disbursementFee: { type: 'FIXED', value: 0 }
        },
        penaltyRate: 500,
        penaltyType: 'FIXED'
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'loan_products');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Loan Products</h2>
          <p className="text-[12px] text-muted-foreground">Define the rules of lending (interest rates, durations, penalties).</p>
        </div>
        <Button 
          onClick={() => setIsAdding(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold gap-2 h-9"
        >
          <Plus size={16} /> Create Product
        </Button>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[13px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Product Name</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Interest Rate (APR)</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Max Term</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Amount Range</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Status</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                  No loan products defined.
                </TableCell>
              </TableRow>
            ) : (
              products.map(product => (
                <TableRow key={product.id} className="border-border">
                  <TableCell className="px-5 py-3 font-bold text-foreground">{product.name}</TableCell>
                  <TableCell className="px-5 py-3 font-medium">{product.interestRate}%</TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground">{product.maxTerm} months</TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground">
                    MWK {product.minAmount.toLocaleString()} - MWK {product.maxAmount.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      product.status === 'ACTIVE' ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {product.status}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                        <Edit size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md w-full"
            >
              <Card className="border-none shadow-2xl rounded-xl overflow-hidden">
                <div className="bg-brand-600 p-6 text-white">
                  <h3 className="text-lg font-bold">Create Loan Product</h3>
                  <p className="text-brand-100 text-xs mt-1">Define parameters for a new lending product.</p>
                </div>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Product Name</label>
                    <Input 
                      placeholder="e.g. Agricultural Equipment Loan" 
                      className="border-border h-9" 
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Interest Rate (% APR)</label>
                      <Input 
                        type="number" 
                        placeholder="15.0" 
                        className="border-border h-9" 
                        value={newProduct.interestRate}
                        onChange={(e) => setNewProduct({ ...newProduct, interestRate: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Max Term (Months)</label>
                      <Input 
                        type="number" 
                        placeholder="24" 
                        className="border-border h-9" 
                        value={newProduct.maxTerm}
                        onChange={(e) => setNewProduct({ ...newProduct, maxTerm: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">App Fee (MWK)</label>
                      <Input 
                        type="number" 
                        className="border-border h-9" 
                        value={newProduct.charges?.applicationFee?.value}
                        onChange={(e) => setNewProduct({ 
                          ...newProduct, 
                          charges: { 
                            ...newProduct.charges!, 
                            applicationFee: { ...newProduct.charges!.applicationFee, value: parseFloat(e.target.value) } 
                          } 
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Proc Fee (%)</label>
                      <Input 
                        type="number" 
                        className="border-border h-9" 
                        value={newProduct.charges?.processingFee?.value}
                        onChange={(e) => setNewProduct({ 
                          ...newProduct, 
                          charges: { 
                            ...newProduct.charges!, 
                            processingFee: { ...newProduct.charges!.processingFee, value: parseFloat(e.target.value) } 
                          } 
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Penalty Rate</label>
                      <Input 
                        type="number" 
                        className="border-border h-9" 
                        value={newProduct.penaltyRate}
                        onChange={(e) => setNewProduct({ ...newProduct, penaltyRate: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Penalty Type</label>
                      <select 
                        className="w-full h-9 rounded-md border border-border bg-white px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={newProduct.penaltyType}
                        onChange={(e) => setNewProduct({ ...newProduct, penaltyType: e.target.value as ChargeType })}
                      >
                        <option value="FIXED">FIXED (MWK)</option>
                        <option value="PERCENTAGE">PERCENTAGE (%)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1 h-10 font-bold" onClick={() => setIsAdding(false)}>CANCEL</Button>
                    <Button 
                      className="flex-1 h-10 bg-brand-600 hover:bg-brand-700 font-bold text-white" 
                      onClick={handleSaveProduct}
                    >
                      CREATE PRODUCT
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LoansView({
  loans,
  clients,
  title = 'Loan Portfolio',
  description = 'Global view of all active, closed, and defaulted loans.',
}: {
  loans: any[],
  clients: any[],
  title?: string,
  description?: string,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.ceil(loans.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLoans = loans.slice(startIndex, startIndex + pageSize);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-[12px] text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold border-border bg-white">
            <Filter size={14} className="mr-2" /> Filter
          </Button>
        </div>
      </div>
      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[13px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Loan ID</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Client</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Amount</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Balance</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Status</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                  No loans found in the portfolio.
                </TableCell>
              </TableRow>
            ) : (
              paginatedLoans.map(loan => {
                const client = clients.find(c => c.id === loan.clientId);
                return (
                  <TableRow key={loan.id} className="border-border">
                    <TableCell className="px-5 py-3 font-mono text-xs">{loan.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell className="px-5 py-3 font-medium">{client?.name || 'Unknown'}</TableCell>
                    <TableCell className="px-5 py-3">MWK {(loan.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-5 py-3 font-semibold">MWK {(loan.outstandingBalance || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        loan.status === 'ACTIVE' ? 'bg-[#D1FAE5] text-[#065F46]' : 
                        loan.status === 'DEFAULTED' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {loan.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" className="text-xs text-brand-600">View Details</Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        
        {totalPages > 1 && (
          <div className="p-4 border-t border-border bg-[#F9FAFB] flex items-center justify-between">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs font-bold border-border"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                PREVIOUS
              </Button>
              <div className="flex items-center gap-1 mx-2">
                <span className="text-[11px] font-bold text-slate-400">PAGE</span>
                <span className="text-[11px] font-bold text-slate-900">{currentPage} / {totalPages}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs font-bold border-border"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                NEXT
              </Button>
            </div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Showing {startIndex + 1}-{Math.min(startIndex + pageSize, loans.length)} of {loans.length}
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function ReportsView({ 
  loans, 
  applications, 
  transactions, 
  clients,
  repaymentSchedules,
  workflowHistory
}: { 
  loans: any[], 
  applications: any[], 
  transactions: any[], 
  clients: any[],
  repaymentSchedules: any[],
  workflowHistory: any[]
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'portfolio' | 'operations'>('overview');
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  endDate.setHours(23, 59, 59, 999);

  const finStats = calculateFinancialStats(transactions, startDate, endDate);
  const portStats = calculatePortfolioStats(loans, repaymentSchedules);
  const opStats = calculateOperationalStats(applications, workflowHistory);

  const riskDistribution = [
    { name: 'Low Risk', value: loans.filter(l => l.status === 'ACTIVE' && l.crb?.riskLevel === 'LOW').length, color: '#10B981' },
    { name: 'Medium Risk', value: loans.filter(l => l.status === 'ACTIVE' && l.crb?.riskLevel === 'MEDIUM').length, color: '#F59E0B' },
    { name: 'High Risk', value: loans.filter(l => l.status === 'ACTIVE' && l.crb?.riskLevel === 'HIGH').length, color: '#EF4444' },
  ].filter(d => d.value > 0);

  const performanceTrend = Array.from({ length: 6 }).map((_, index) => {
    const bucket = new Date();
    bucket.setDate(1);
    bucket.setMonth(bucket.getMonth() - (5 - index));
    const label = bucket.toLocaleDateString(undefined, { month: 'short' });
    
    const monthlyLoans = loans.filter(l => {
      const d = getTimestampDate(l.disbursedAt || l.createdAt);
      return d && d.getMonth() === bucket.getMonth() && d.getFullYear() === bucket.getFullYear();
    });

    return {
      name: label,
      disbursed: monthlyLoans.reduce((s, l) => s + (l.amount || 0), 0),
      count: monthlyLoans.length
    };
  });

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Disbursed" value={formatCurrency(finStats.disbursed)} trend="In selected period" />
        <StatCard title="Portfolio Revenue" value={formatCurrency(finStats.revenue)} trend="Interest + Fees + Penalties" />
        <StatCard title="Portfolio at Risk" value={`${portStats.parRatio.toFixed(1)}%`} trend={`${formatCurrency(portStats.parAmount)} outstanding`} highlight={portStats.parRatio > 10} />
        <StatCard title="Avg Processing" value={`${opStats.avgProcessingTimeHours.toFixed(1)}h`} trend="Submission to Approval" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-border shadow-none rounded-xl bg-white p-6">
          <h3 className="text-sm font-bold mb-6 text-slate-900 uppercase tracking-widest">Disbursement Trend (Last 6 Months)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceTrend}>
                <defs>
                  <linearGradient id="colorDisbursed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `MWK ${v/1000}k`} />
                <Tooltip />
                <Area type="monotone" dataKey="disbursed" stroke="#2563EB" fillOpacity={1} fill="url(#colorDisbursed)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-xl bg-white p-6">
          <h3 className="text-sm font-bold mb-6 text-slate-900 uppercase tracking-widest">Active Risk Mix</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskDistribution}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderFinancials = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-6 bg-slate-900 text-white rounded-xl border-none">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Net Cash Flow</p>
          <h3 className="text-3xl font-black">{formatCurrency(finStats.netCashFlow)}</h3>
          <div className="mt-4 flex items-center gap-2 text-[11px]">
            <span className="text-emerald-400 font-bold">IN: {formatCurrency(finStats.recovered)}</span>
            <span className="text-slate-500">|</span>
            <span className="text-red-400 font-bold">OUT: {formatCurrency(finStats.disbursed)}</span>
          </div>
        </Card>
        <Card className="p-6 bg-white border border-border rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Revenue Collected</p>
          <h3 className="text-3xl font-black text-slate-900">{formatCurrency(finStats.revenue)}</h3>
          <p className="mt-4 text-[11px] text-slate-500 font-medium">Sum of Interest, Fees, and Penalties.</p>
        </Card>
        <Card className="p-6 bg-white border border-border rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Recovery Rate</p>
          <h3 className="text-3xl font-black text-slate-900">
            {finStats.disbursed > 0 ? ((finStats.recovered / finStats.disbursed) * 100).toFixed(1) : 0}%
          </h3>
          <p className="mt-4 text-[11px] text-slate-500 font-medium">Repayments vs Disbursements in range.</p>
        </Card>
      </div>

      <Card className="border border-border shadow-none rounded-xl bg-white overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-border flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Revenue Breakdown (P&L)</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[10px] font-bold text-brand-600 h-8"
            onClick={() => downloadAsCSV([
              { Category: 'Interest Income', Amount: finStats.interest },
              { Category: 'Service Charges', Amount: finStats.charges },
              { Category: 'Penalty Revenue', Amount: finStats.penalties },
              { Category: 'Total Revenue', Amount: finStats.revenue }
            ], 'Financial_Report')}
          >
            EXPORT AS CSV
          </Button>
        </div>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-slate-600">Interest Income</TableCell>
              <TableCell className="text-right font-bold text-slate-900">{formatCurrency(finStats.interest)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-slate-600">Service Charges / Processing Fees</TableCell>
              <TableCell className="text-right font-bold text-slate-900">{formatCurrency(finStats.charges)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-slate-600">Penalty Revenue</TableCell>
              <TableCell className="text-right font-bold text-slate-900">{formatCurrency(finStats.penalties)}</TableCell>
            </TableRow>
            <TableRow className="bg-slate-50">
              <TableCell className="font-bold text-slate-900">Gross Portfolio Revenue</TableCell>
              <TableCell className="text-right font-black text-brand-600 text-lg">{formatCurrency(finStats.revenue)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );

  const renderPortfolio = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Active Loans" value={portStats.activeCount.toString()} trend="Current healthy accounts" />
        <StatCard title="Outstanding Principal" value={formatCurrency(portStats.totalOutstanding)} trend="Capital in market" />
        <StatCard title="NPL Count" value={portStats.nplCount.toString()} trend="90+ Days Overdue" highlight={portStats.nplCount > 0} />
        <StatCard title="Avg Portfolio Risk" value={portStats.parRatio > 15 ? 'HIGH' : portStats.parRatio > 5 ? 'MEDIUM' : 'LOW'} trend="Based on PAR ratio" />
      </div>

      <Card className="border border-border shadow-none rounded-xl bg-white overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-border flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Portfolio Distribution</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[10px] font-bold text-brand-600 h-8"
            onClick={() => downloadAsCSV(loans.map(l => ({
              ID: l.id,
              Client: l.clientName,
              Amount: l.amount,
              Balance: l.outstandingBalance,
              Status: l.status,
              Risk: l.crb?.riskLevel || 'N/A'
            })), 'Portfolio_Report')}
          >
            EXPORT FULL PORTFOLIO
          </Button>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {['ACTIVE', 'REPAID', 'DEFAULTED'].map(status => {
              const count = loans.filter(l => l.status === status).length;
              const pct = loans.length > 0 ? (count / loans.length) * 100 : 0;
              return (
                <div key={status} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-600 uppercase tracking-widest">{status}</span>
                    <span className="text-slate-900">{count} Loans ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${status === 'ACTIVE' ? 'bg-brand-500' : status === 'REPAID' ? 'bg-emerald-500' : 'bg-red-500'}`} 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );

  const renderOperations = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Applications" value={opStats.total.toString()} trend="Total historic volume" />
        <StatCard title="Approval Rate" value={`${opStats.approvalRate.toFixed(1)}%`} trend={`${opStats.approved} approved`} />
        <StatCard title="Rejection Rate" value={`${opStats.rejectionRate.toFixed(1)}%`} trend={`${opStats.rejected} rejected`} />
        <StatCard title="Avg Turnaround" value={`${opStats.avgProcessingTimeHours.toFixed(1)}h`} trend="Efficiency metric" />
      </div>

      <Card className="border border-border shadow-none rounded-xl bg-white overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-border flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Application Funnel Metrics</h3>
        </div>
        <div className="p-10 flex flex-col items-center">
          <div className="relative w-full max-w-md space-y-4">
            <div className="bg-slate-100 p-4 text-center rounded-lg border border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase">Incoming (100%)</p>
              <h4 className="text-xl font-black text-slate-900">{opStats.total} APPLICATIONS</h4>
            </div>
            <div className="flex justify-center">
              <ArrowDownRight className="text-slate-300" size={24} />
            </div>
            <div className="bg-brand-50 p-4 text-center rounded-lg border border-brand-100">
              <p className="text-xs font-bold text-brand-600 uppercase">Decision Yield ({opStats.approvalRate.toFixed(1)}%)</p>
              <h4 className="text-xl font-black text-brand-700">{opStats.approved} DISBURSED LOANS</h4>
            </div>
          </div>
          <p className="mt-8 text-xs text-center text-slate-500 max-w-sm">
            Operational efficiency is calculated across the end-to-end lifecycle from <b>SUBMITTED</b> to <b>APPROVED/REJECTED</b> states.
          </p>
        </div>
      </Card>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 pb-12"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <BarChart3 className="text-brand-600" size={28} />
            BI & Insights
          </h2>
          <p className="text-sm text-slate-500 font-medium">FastKwacha Real-time Financial Intelligence Layer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
            <Clock size={14} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Period:</span>
            <input 
              type="date" 
              className="bg-transparent border-none text-[11px] font-bold focus:ring-0 p-0 text-slate-700" 
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <span className="text-slate-300 mx-1">ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢</span>
            <input 
              type="date" 
              className="bg-transparent border-none text-[11px] font-bold focus:ring-0 p-0 text-slate-700" 
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1.5 rounded-xl self-start overflow-auto no-scrollbar">
        {[
          { id: 'overview', label: 'DASHBOARD', icon: <PieChartIcon size={14} /> },
          { id: 'financials', label: 'FINANCIAL REPORTS', icon: <DollarSign size={14} /> },
          { id: 'portfolio', label: 'PORTFOLIO ANALYTICS', icon: <Briefcase size={14} /> },
          { id: 'operations', label: 'OPERATIONS', icon: <History size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-white text-brand-600 shadow-sm ring-1 ring-slate-200' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'financials' && renderFinancials()}
          {activeTab === 'portfolio' && renderPortfolio()}
          {activeTab === 'operations' && renderOperations()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}


function AuditLogsView({ users, clients, applications, loans, transactions }: { users: any[], clients: any[], applications: any[], loans: any[], transactions: any[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const logs = buildAuditLogs({ users, clients, applications, loans, transactions });
  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchQuery || [log.user, log.action, log.details, log.category].some(value => String(value || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'ALL' || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Audit & Activity Logs</h2>
          <p className="text-[12px] text-muted-foreground">The system's truth engine. Track every action.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input placeholder="Search logs..." className="pl-9 h-9 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className="h-9 rounded-lg border border-border bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="ALL">All Categories</option>
            <option value="ACCESS">Access</option>
            <option value="KYC">KYC</option>
            <option value="LENDING">Lending</option>
            <option value="PORTFOLIO">Portfolio</option>
            <option value="TRANSACTION">Transaction</option>
          </select>
          <Button variant="outline" className="h-9 text-xs font-semibold">
            <FileDown size={14} className="mr-2" /> Export Logs
          </Button>
        </div>
      </div>
      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-5 w-40">Timestamp</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5 w-48">User / Actor</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5 w-48">Action Type</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map(log => (
              <TableRow key={log.id} className="border-border hover:bg-slate-50">
                <TableCell className="px-5 py-3 font-mono text-slate-500">
                  {formatDateTimeLabel(log.timestamp)}
                </TableCell>
                <TableCell className="px-5 py-3 font-medium">{log.user}</TableCell>
                <TableCell className="px-5 py-3">
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                    {log.action}
                  </span>
                </TableCell>
                <TableCell className="px-5 py-3 text-slate-600">{log.details}</TableCell>
              </TableRow>
            ))}
            {filteredLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic">No audit logs match the current filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-3 border-t border-border flex items-center justify-between bg-white">
          <p className="text-[11px] text-muted-foreground font-medium">Showing {filteredLogs.length} of {logs.length} logs</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-border"><ChevronRight className="rotate-180" size={12} /></Button>
            <Button size="sm" className="h-7 px-2.5 text-[11px] bg-primary">1</Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-border"><ChevronRight size={12} /></Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function UserManagementView({ users, onUpdateUserStatus }: { users: any[], onUpdateUserStatus: (user: any, status: UserStatus) => Promise<void> }) {
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedPendingAgentId, setSelectedPendingAgentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ id: '', name: '', email: '', role: 'AGENT' as UserRole, status: 'ACTIVE' as UserStatus });

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
                          (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const pendingAgents = users.filter(u => u.role === 'AGENT' && u.status === 'PENDING');
  const selectedPendingAgent = pendingAgents.find(agent => agent.id === selectedPendingAgentId) || pendingAgents[0] || null;

  const handleAddUser = async () => {
    const generatedId = `demo-${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
      id: generatedId,
      uid: generatedId,
      name: formData.name,
      email: formData.email,
      role: formData.role,
      status: 'ACTIVE' as UserStatus,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'users'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      toast.success("Stakeholder added successfully.");
    } catch (e: any) {
      if (e.code === 'permission-denied' || e.message?.includes('permission')) {
        saveLocalUser(payload as any);
        toast.success("Stakeholder added successfully (Simulation Mode).");
      } else {
        handleFirestoreError(e, OperationType.CREATE, 'users');
      }
    }
    setIsAdding(false);
    setFormData({ id: '', name: '', email: '', role: 'AGENT', status: 'ACTIVE' });
  };

  const handleEditUser = async () => {
    if (!formData.id) return;
    try {
      if (formData.id.startsWith('demo-') || getLocalUsers().find(u => u.id === formData.id)) {
        saveLocalUser({ ...formData } as any);
        toast.success("Stakeholder updated successfully (Simulation Mode)");
        setIsEditing(false);
        return;
      }
      
      await updateDoc(doc(db, 'users', formData.id), {
        name: formData.name,
        role: formData.role,
        status: formData.status
      });
      toast.success("Stakeholder updated successfully");
      setIsEditing(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${formData.id}`);
    }
  };

  const openEditModal = (user: any) => {
    setFormData({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'AGENT',
      status: normalizeUserStatus(user.status)
    });
    setIsEditing(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">User Management</h2>
          <p className="text-[12px] text-muted-foreground">Command center for onboarding approvals, access, and roles.</p>
        </div>
        <Button 
          onClick={() => {
            setFormData({ id: '', name: '', email: '', role: 'AGENT', status: 'ACTIVE' });
            setIsAdding(true);
          }}
          className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold gap-2 h-9"
        >
          <UserPlus size={16} /> Add User
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Pending Agents" value={pendingAgents.length.toString()} trend="Awaiting review" />
        <StatCard title="Active Users" value={users.filter(u => u.status === 'ACTIVE').length.toString()} trend="Operational" />
        <StatCard title="Suspended" value={users.filter(u => u.status === 'SUSPENDED').length.toString()} trend="Temporarily disabled" />
        <StatCard title="Rejected" value={users.filter(u => u.status === 'REJECTED').length.toString()} trend="Access denied" />
      </div>

      {pendingAgents.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="xl:col-span-1 border border-border shadow-none rounded-lg bg-white overflow-hidden">
            <div className="p-4 border-b border-border bg-amber-50/60">
              <h3 className="text-sm font-bold text-amber-900">Pending Agent Review Queue</h3>
              <p className="text-[12px] text-amber-800 mt-1">Select a submitted agent to inspect the full application details.</p>
            </div>
            <div className="divide-y divide-border">
              {pendingAgents.map(agent => (
                <button
                  key={agent.id}
                  type="button"
                  className={`w-full text-left p-4 transition-colors ${selectedPendingAgent?.id === agent.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                  onClick={() => setSelectedPendingAgentId(agent.id)}
                >
                  <p className="font-semibold text-foreground">{agent.name || 'Unnamed Agent'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{agent.email}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{agent.phone || 'Phone not provided'}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="xl:col-span-2 border border-border shadow-none rounded-lg bg-white overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-[#F9FAFB]">
              <div>
                <h3 className="text-sm font-bold text-foreground">Submitted Agent Credentials & Profile</h3>
                <p className="text-[12px] text-muted-foreground mt-1">Review the captured registration data before approval.</p>
              </div>
              {selectedPendingAgent && (
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700" onClick={() => onUpdateUserStatus(selectedPendingAgent, 'ACTIVE')}>
                    APPROVE AGENT
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold border-red-200 text-red-600 hover:bg-red-50" onClick={() => onUpdateUserStatus(selectedPendingAgent, 'REJECTED')}>
                    REJECT AGENT
                  </Button>
                </div>
              )}
            </div>
            {selectedPendingAgent && (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ReadOnlyDetail label="Full Name" value={selectedPendingAgent.name || 'Not provided'} />
                  <ReadOnlyDetail label="Email Address" value={selectedPendingAgent.email || 'Not provided'} />
                  <ReadOnlyDetail label="Phone Number" value={selectedPendingAgent.phone || 'Not provided'} />
                  <ReadOnlyDetail label="National ID" value={selectedPendingAgent.nationalId || 'Not provided'} />
                  <ReadOnlyDetail label="Address" value={selectedPendingAgent.address || 'Not provided'} />
                  <ReadOnlyDetail label="Guarantor / Reference" value={selectedPendingAgent.guarantorReference || 'Not provided'} />
                  <ReadOnlyDetail label="Photo Upload" value={selectedPendingAgent.profilePhotoName || 'No file uploaded'} />
                  <ReadOnlyDetail label="Temporary Password" value={(selectedPendingAgent as any).demoPassword || 'Not stored'} />
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  This submission is already part of the audit trail. Approving or rejecting it will update the user status and remain visible in the audit dashboard.
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input 
            placeholder="Search by name or email..." 
            className="pl-9 border-border bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          className="h-10 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[150px]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="ALL">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="OFFICER">Officer</option>
          <option value="AGENT">Agent</option>
          <option value="CREDIT_ANALYST">Credit Analyst</option>
        </select>
        <select 
          className="h-10 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[150px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[13px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Name</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Email</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Role</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5">Status</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-11 px-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                  No users found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map(u => (
                <TableRow key={u.id} className="border-border">
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {u.name?.charAt(0) || u.email?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-bold text-foreground">{u.name || 'Unnamed'}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground font-medium">{u.email}</TableCell>
                  <TableCell className="px-5 py-3">
                    <Badge variant="outline" className={`text-[10px] font-bold border-border ${
                      u.role === 'ADMIN' ? 'text-purple-600 bg-purple-50' :
                      u.role === 'OFFICER' ? 'text-blue-600 bg-blue-50' :
                      u.role === 'CREDIT_ANALYST' ? 'text-amber-600 bg-amber-50' :
                      'text-emerald-600 bg-emerald-50'
                    }`}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      getStatusTone(normalizeUserStatus(u.status))
                    }`}>
                      {normalizeUserStatus(u.status)}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openEditModal(u)}>
                        <Edit size={14} />
                      </Button>
                      {normalizeUserStatus(u.status) === 'PENDING' && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => onUpdateUserStatus(u, 'ACTIVE')} title="Approve Agent">
                            <UserCheck size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => onUpdateUserStatus(u, 'REJECTED')} title="Reject Agent">
                            <UserMinus size={14} />
                          </Button>
                        </>
                      )}
                      {normalizeUserStatus(u.status) === 'ACTIVE' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => onUpdateUserStatus(u, 'SUSPENDED')} title="Suspend User">
                          <UserMinus size={14} />
                        </Button>
                      )}
                      {(normalizeUserStatus(u.status) === 'SUSPENDED' || normalizeUserStatus(u.status) === 'REJECTED') && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => onUpdateUserStatus(u, 'ACTIVE')} title="Activate User">
                          <UserCheck size={14} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AnimatePresence>
        {(isAdding || isEditing) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md w-full"
            >
              <Card className="border-none shadow-2xl rounded-xl overflow-hidden">
                <div className="bg-brand-600 p-6 text-white">
                  <h3 className="text-lg font-bold">{isEditing ? 'Edit User' : 'Add New User'}</h3>
                  <p className="text-brand-100 text-xs mt-1">{isEditing ? 'Update user details and roles.' : 'Grant system access to a new team member.'}</p>
                </div>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Full Name</label>
                    <Input 
                      placeholder="Enter name..." 
                      className="border-border" 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Email Address</label>
                    <Input 
                      placeholder="email@fastkwacha.com" 
                      className="border-border" 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      disabled={isEditing} // Email shouldn't be easily changed if it's the auth identifier
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">System Role</label>
                    <select 
                      className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                    >
                      <option value="AGENT">Agent (Field Collections)</option>
                      <option value="OFFICER">Officer (Credit Review)</option>
                      <option value="CREDIT_ANALYST">Credit Analyst (Analysis)</option>
                      <option value="ADMIN">Admin (System Control)</option>
                    </select>
                  </div>
                  {isEditing && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Status</label>
                      <select 
                        className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={formData.status}
                        onChange={e => setFormData({...formData, status: e.target.value as UserStatus})}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="ACTIVE">Active</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                    </div>
                  )}
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1 h-10 font-bold" onClick={() => { setIsAdding(false); setIsEditing(false); }}>CANCEL</Button>
                    <Button className="flex-1 h-10 bg-brand-600 hover:bg-brand-700 font-bold" onClick={isEditing ? handleEditUser : handleAddUser}>
                      {isEditing ? 'SAVE CHANGES' : 'ADD USER'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TransactionsAuditView({ transactions, loans, role }: { transactions: any[], loans: any[], role?: UserRole }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const title = role === 'AGENT' ? 'Transaction History' : 'Transactions Audit';
  const subtitle = role === 'AGENT'
    ? 'Review cash collection records and recent field activity.'
    : 'Follow the money trail. Verify all financial movements.';

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch =
      (t.clientName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (t.id?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (t.reference?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'ALL' || t.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 text-xs font-semibold">
            <FileDown size={14} className="mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-[#F9FAFB]">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input 
              placeholder="Search by ID or Client..." 
              className="pl-9 h-9 text-xs bg-white" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select className="h-9 rounded-lg border border-border bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">All Types</option>
              <option value="DISBURSEMENT">Disbursements</option>
              <option value="REPAYMENT">Repayments</option>
            </select>
          </div>
        </div>
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Txn ID</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Date & Time</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Type</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Amount</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Client</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Handler/Officer</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">
                  No transactions found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map(tx => (
                <TableRow key={tx.id} className="border-border hover:bg-slate-50">
                  <TableCell className="px-5 py-3 font-mono text-[10px] text-slate-500">{tx.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="px-5 py-3 font-mono text-slate-500">
                    {formatDateTimeLabel(tx.timestamp)}
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <Badge variant="outline" className={`text-[10px] font-bold border-border ${
                      tx.type === 'DISBURSEMENT' ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
                    }`}>
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-5 py-3 font-bold text-foreground">MWK {tx.amount?.toLocaleString()}</TableCell>
                  <TableCell className="px-5 py-3 font-medium">{tx.clientName || 'Unknown'}</TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground">{tx.agentEmail || 'System'}</TableCell>
                  <TableCell className="px-5 py-3 text-right">
                    <Badge className={`border-none text-[10px] font-bold ${
                      !tx.reference || (tx.type === 'DISBURSEMENT' && (tx.amount || 0) > Math.max(1000000, loans.length ? (loans.reduce((sum, loan) => sum + (loan.amount || 0), 0) / loans.length) * 2 : 1000000))
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {!tx.reference ? 'CHECK REFERENCE' : 'VERIFIED'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function AnomaliesView({ users, applications, loans, transactions }: { users: any[], applications: any[], loans: any[], transactions: any[] }) {
  const anomalies = buildAnomalies({ users, applications, loans, transactions });
  const criticalAlerts = anomalies.filter(anomaly => anomaly.severity === 'CRITICAL').length;
  const warningAlerts = anomalies.filter(anomaly => anomaly.severity === 'HIGH' || anomaly.severity === 'MEDIUM').length;
  const systemHealth = anomalies.length ? Math.max(70, 100 - anomalies.length * 4) : 100;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Anomaly Detection</h2>
          <p className="text-[12px] text-muted-foreground">Red Flag Engine. Automatically flagged suspicious patterns.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border border-red-200 bg-red-50/50 shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-900">{criticalAlerts}</p>
              <p className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Critical Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-amber-200 bg-amber-50/50 shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
              <ShieldAlert size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">{warningAlerts}</p>
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Warnings</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-emerald-200 bg-emerald-50/50 shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-900">{systemHealth.toFixed(1)}%</p>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">System Health</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Severity</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Type</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Description</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">User</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Time</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {anomalies.map(anomaly => (
              <TableRow key={anomaly.id} className="border-border hover:bg-slate-50">
                <TableCell className="px-5 py-3">
                  <Badge className={`text-[10px] font-bold border-none ${
                    anomaly.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                    anomaly.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                    'bg-amber-400 text-amber-950'
                  }`}>
                    {anomaly.severity}
                  </Badge>
                </TableCell>
                <TableCell className="px-5 py-3 font-mono text-[10px] font-bold text-slate-600">{anomaly.type}</TableCell>
                <TableCell className="px-5 py-3 font-medium text-foreground">{anomaly.description}</TableCell>
                <TableCell className="px-5 py-3 text-muted-foreground">{anomaly.user}</TableCell>
                <TableCell className="px-5 py-3 text-muted-foreground">{getRelativeTimeLabel(anomaly.time)}</TableCell>
                <TableCell className="px-5 py-3 text-right">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                    anomaly.status === 'UNRESOLVED' ? 'bg-red-50 text-red-700' :
                    anomaly.status === 'INVESTIGATING' ? 'bg-amber-50 text-amber-700' :
                    'bg-emerald-50 text-emerald-700'
                  }`}>
                    {anomaly.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {anomalies.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">No anomalies detected from current records.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function UserActivityView({ users, applications, transactions, loans }: { users: any[], applications: any[], transactions: any[], loans: any[] }) {
  const userSessions = users.map(user => {
    const actions = [
      ...transactions.filter(transaction => transaction.agentEmail === user.email).map(transaction => transaction.timestamp),
      ...applications.filter(application => application.metadata?.createdBy?.email === user.email || application.approvedBy === user.email).map(application => application.updatedAt || application.createdAt),
      user.updatedAt || user.createdAt,
    ].map(getTimestampDate).filter(Boolean) as Date[];
    const lastActive = actions.sort((left, right) => right.getTime() - left.getTime())[0] || null;
    return {
      ...user,
      actionCount: actions.length,
      lastActive,
      sessionStatus: normalizeUserStatus(user.status) === 'ACTIVE' && lastActive ? 'ONLINE' : normalizeUserStatus(user.status) === 'SUSPENDED' ? 'SUSPENDED' : 'IDLE',
    };
  }).sort((left, right) => (right.actionCount || 0) - (left.actionCount || 0));

  const activeUsers = userSessions.filter(user => user.sessionStatus === 'ONLINE').length;
  const elevatedUsers = userSessions.filter(user => normalizeUserStatus(user.status) === 'SUSPENDED' || normalizeUserStatus(user.status) === 'PENDING').length;
  const heatmapData = Array.from({ length: 10 }).map((_, index) => {
    const hour = 8 + index;
    const count = transactions.filter(transaction => {
      const date = getTimestampDate(transaction.timestamp);
      return date && date.getHours() === hour;
    }).length + applications.filter(application => {
      const date = getTimestampDate(application.createdAt);
      return date && date.getHours() === hour;
    }).length;
    return count;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">User Activity Monitoring</h2>
          <p className="text-[12px] text-muted-foreground">Track behavior patterns and identify suspicious usage.</p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-blue-50 text-blue-700 border-none">{activeUsers} ACTIVE</Badge>
          <Badge className="bg-amber-50 text-amber-700 border-none">{elevatedUsers} WATCHLIST</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border bg-[#F9FAFB]">
            <h3 className="text-sm font-bold">Active Sessions</h3>
          </div>
          <Table className="text-[12px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-10 px-5">User</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-5">Role</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-5">Last Active</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-5 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userSessions.slice(0, 6).map(user => (
                <TableRow key={user.id} className="border-border">
                  <TableCell className="px-5 py-3 font-medium">{user.email}</TableCell>
                  <TableCell className="px-5 py-3">
                    <Badge variant="outline" className="text-[10px] font-bold">{user.role}</Badge>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-muted-foreground">{user.lastActive ? getRelativeTimeLabel(user.lastActive) : 'No activity'}</TableCell>
                  <TableCell className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className={`w-2 h-2 rounded-full ${user.sessionStatus === 'ONLINE' ? 'bg-emerald-500' : user.sessionStatus === 'SUSPENDED' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                      <span className={`text-[10px] font-bold ${user.sessionStatus === 'ONLINE' ? 'text-emerald-700' : user.sessionStatus === 'SUSPENDED' ? 'text-red-700' : 'text-amber-700'}`}>{user.sessionStatus}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white p-5">
          <h3 className="text-sm font-bold mb-4">Activity Heatmap</h3>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-2">Peak Usage Times</p>
              <div className="flex items-end gap-1 h-16">
                {heatmapData.map((val, i) => (
                  <div key={i} className="flex-1 bg-brand-500 rounded-t-sm" style={{ height: `${(val / 15) * 100}%`, opacity: val / 15 + 0.2 }}></div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>08:00</span>
                <span>12:00</span>
                <span>18:00</span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-2">Most Active Users</p>
              <div className="space-y-2">
                {userSessions.slice(0, 3).map((u, i) => (
                  <div key={i} className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-600 truncate max-w-[120px]">{u.email}</span>
                    <span className="font-bold text-brand-600">{u.actionCount} actions</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-2">Risk Concentration</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {loans.filter(loan => loan.status === 'DEFAULTED').length} defaulted loans and {users.filter(user => normalizeUserStatus(user.status) !== 'ACTIVE').length} non-active users are currently influencing the audit watchlist.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function CasesView({ users, applications, loans, transactions }: { users: any[], applications: any[], loans: any[], transactions: any[] }) {
  const anomalies = buildAnomalies({ users, applications, loans, transactions });
  const [cases, setCases] = useState(() => buildCasesFromAnomalies(anomalies));

  useEffect(() => {
    setCases(buildCasesFromAnomalies(anomalies));
  }, [users, applications, loans, transactions]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Case Management</h2>
          <p className="text-[12px] text-muted-foreground">Investigation workflow for flagged anomalies.</p>
        </div>
        <Button
          className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold gap-2 h-9"
          onClick={() => {
            const nextId = `CASE-${String(cases.length + 1).padStart(3, '0')}`;
            setCases(prev => [
              {
                id: nextId,
                title: 'Manual Investigation',
                status: 'OPEN',
                priority: 'MEDIUM',
                assignee: getActiveSessionEmail() || 'system@fastkwacha.com',
                updated: new Date().toISOString(),
                sourceId: 'MANUAL',
                description: 'Manually opened from the case workspace.',
              },
              ...prev,
            ]);
            toast.success('New investigation case created.');
          }}
        >
          <Plus size={16} /> New Case
        </Button>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Case ID</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Title</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Priority</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Assignee</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Last Updated</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-5 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map(c => (
              <TableRow key={c.id} className="border-border hover:bg-slate-50 cursor-pointer">
                <TableCell className="px-5 py-3 font-mono text-[10px] font-bold text-brand-600">{c.id}</TableCell>
                <TableCell className="px-5 py-3 font-medium text-foreground">{c.title}</TableCell>
                <TableCell className="px-5 py-3">
                  <Badge variant="outline" className={`text-[9px] font-bold border-none ${
                    c.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                    c.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {c.priority}
                  </Badge>
                </TableCell>
                <TableCell className="px-5 py-3 text-muted-foreground">{c.assignee}</TableCell>
                <TableCell className="px-5 py-3 text-muted-foreground">{getRelativeTimeLabel(c.updated)}</TableCell>
                <TableCell className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                      c.status === 'OPEN' ? 'bg-blue-50 text-blue-700' :
                      c.status === 'UNDER REVIEW' ? 'bg-purple-50 text-purple-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {c.status}
                    </span>
                    {c.status !== 'CLOSED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[10px] font-bold text-emerald-600"
                        onClick={() => {
                          setCases(prev => prev.map(item => item.id === c.id ? { ...item, status: 'CLOSED', updated: new Date().toISOString() } : item));
                          toast.success(`${c.id} marked as closed.`);
                        }}
                      >
                        CLOSE
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {cases.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">No investigation cases have been generated.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function SettingsView({ 
  profile, 
  systemSettings, 
  onUpdateSystemSettings, 
  onUpdateProfile 
}: { 
  profile: AuthProfile, 
  systemSettings: SystemSettings, 
  onUpdateSystemSettings: (s: SystemSettings) => void,
  onUpdateProfile: (p: AuthProfile) => void
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'appearance' | 'notifications' | 'system'>('profile');
  const { theme, setTheme } = useTheme();
  
  // Profile Photo State
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  // Password State
  const [passwordState, setPasswordState] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Max 5MB allowed.");
      return;
    }

    try {
      setUploading(true);
      const storageRef = ref(storage, `profiles/${profile.uid}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error("Upload error:", error);
          toast.error("Upload failed. Check permissions.");
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          onUpdateProfile({ ...profile, photoURL: downloadURL } as any);
          toast.success("Profile photo updated successfully!");
          setUploading(false);
        }
      );
    } catch (err) {
      console.error(err);
      toast.error("Storage Error: Identity asset could not be persisted.");
      setUploading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!passwordState.current || !passwordState.new || !passwordState.confirm) {
      toast.error("Please fill all password fields.");
      return;
    }
    if (passwordState.new !== passwordState.confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    if (!PASSWORD_RULE.test(passwordState.new)) {
      toast.error("Security Protocol: Password must be at least 8 characters and include both letters and numbers.");
      return;
    }

    try {
      setPasswordUpdating(true);
      const user = auth.currentUser;
      const sessionEmail = normalizeEmail(sessionProfile?.email || user?.email || '');
      const offlineProfile = sessionEmail ? getLocalUserByEmail(sessionEmail) : null;
      const defaultAccount = sessionEmail ? predefinedRoleAccounts[sessionEmail] : null;

      if (user?.email) {
        const credential = EmailAuthProvider.credential(user.email, passwordState.current);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, passwordState.new);
      } else if (offlineProfile?.passwordHash) {
        const passwordMatches = await verifyStoredPassword(offlineProfile.passwordHash, passwordState.current);
        if (!passwordMatches) {
          throw Object.assign(new Error("Invalid current password."), { code: 'auth/wrong-password' });
        }
      } else if (defaultAccount) {
        if (defaultAccount.password !== passwordState.current) {
          throw Object.assign(new Error("Invalid current password."), { code: 'auth/wrong-password' });
        }
      } else {
        throw new Error("No active session found.");
      }

      if (sessionProfile?.email) {
        await syncLocalPasswordRecord(sessionProfile, passwordState.new);
      }
      
      toast.success("Security status updated. Password changed.");
      setPasswordState({ current: '', new: '', confirm: '' });
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        toast.error("Invalid current password. Checksum fail.");
      } else {
        toast.error("Security update failed. Protocol error.");
      }
    } finally {
      setPasswordUpdating(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile Settings', icon: <Users size={16} />, adminOnly: false },
    { id: 'security', label: 'Account Security', icon: <ShieldAlert size={16} />, adminOnly: false },
    { id: 'appearance', label: 'Appearance', icon: <PieChartIcon size={16} />, adminOnly: false },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} />, adminOnly: false },
    { id: 'system', label: 'System Settings', icon: <Settings size={16} />, adminOnly: true },
  ].filter(tab => !tab.adminOnly || profile.role === 'ADMIN');

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Inner Sidebar */}
        <aside className="w-full md:w-72 space-y-2">
          <div className="mb-6 px-4">
            <h2 className="text-2xl font-black text-slate-900 italic uppercase">Settings</h2>
            <p className="text-xs text-slate-500 font-bold tracking-tight">Terminal customization & security.</p>
          </div>
          <div className="glass-card p-2 rounded-[2rem] space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id 
                    ? 'bg-slate-900 text-white shadow-xl translate-x-2' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="shrink-0">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          <Card className="glass-card rounded-[2.5rem] border-none shadow-2xl overflow-hidden min-h-[600px]">
            <CardContent className="p-10">
              <AnimatePresence mode="wait">
                {activeTab === 'profile' && (
                  <motion.div 
                    key="profile"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 italic uppercase">Profile Settings</h3>
                        <p className="text-sm text-slate-500 font-medium">Update your digital identity and contact protocols.</p>
                      </div>
                      <Badge className="bg-brand-50 text-brand-700 border-none px-4 py-1 font-black text-[10px] tracking-widest uppercase">
                        {profile.role}
                      </Badge>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-8 pb-10 border-b border-slate-100">
                      <div className="relative group">
                        <Avatar className="h-32 w-32 border-4 border-white shadow-2xl rounded-[2.5rem] overflow-hidden">
                          <AvatarImage src={(profile as any).photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} className="object-cover" />
                          <AvatarFallback className="text-3xl font-black bg-slate-100 text-slate-900">{profile.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        {uploading && (
                          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center rounded-[2.5rem] backdrop-blur-sm">
                            <RefreshCw className="text-white animate-spin" size={24} />
                          </div>
                        )}
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute -bottom-2 -right-2 h-10 w-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg hover:bg-brand-700 transition-transform hover:scale-110"
                        >
                          <Plus size={20} />
                        </button>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={handleImageUpload} 
                        />
                      </div>
                      <div className="space-y-1 text-center sm:text-left">
                        <h4 className="text-lg font-black text-slate-900">{profile.name}</h4>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{profile.email}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">{uploading ? 'UPLOADING...' : 'PNG, JPG or GIF. Max 5MB.'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
                        <Input 
                          defaultValue={profile.name} 
                          className="h-12 rounded-2xl border-slate-200 focus:border-brand-500"
                          onChange={(e) => onUpdateProfile({ ...profile, name: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</label>
                        <Input defaultValue={profile.email} disabled className="h-12 rounded-2xl bg-slate-50 border-slate-200 cursor-not-allowed opacity-60" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Number</label>
                        <Input 
                          defaultValue={profile.phone} 
                          placeholder="+265..." 
                          className="h-12 rounded-2xl border-slate-200"
                          onChange={(e) => onUpdateProfile({ ...profile, phone: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">National ID (KYC)</label>
                        {profile.kycComplete ? (
                          <div className="relative">
                            <Input defaultValue={profile.nationalId} disabled className="h-12 rounded-2xl bg-emerald-50 text-emerald-900 border-emerald-100 pr-10 font-bold" />
                            <ShieldCheck className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                          </div>
                        ) : (
                          <Input 
                            defaultValue={profile.nationalId} 
                            placeholder="Enter 12-digit National ID"
                            className="h-12 rounded-2xl border-slate-200"
                            onChange={(e) => onUpdateProfile({ ...profile, nationalId: e.target.value.toUpperCase() })} 
                          />
                        )}
                      </div>
                    </div>

                    {!profile.kycComplete && (
                      <div className="mt-8 p-8 rounded-[2rem] bg-slate-900 text-white border border-white/5 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-brand-500/10 to-transparent" />
                        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6 text-center lg:text-left">
                          <div className="flex items-center gap-5">
                             <div className="w-14 h-14 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                                <ShieldAlert size={28} />
                             </div>
                             <div>
                                <p className="text-lg font-black italic uppercase">Verification Required</p>
                                <p className="text-xs text-slate-400 font-bold tracking-tight">Complete KYC protocol to increase transaction limits and authority.</p>
                             </div>
                          </div>
                          <Button 
                            onClick={() => {
                              if (!profile.phone || !profile.nationalId) {
                                toast.error("Institutional Error: Requirements missing. Please fill Phone and National ID.");
                                return;
                              }
                              onUpdateProfile({ ...profile, kycComplete: true });
                              toast.success("KYC Protocol Initialized. Identity verified.");
                            }}
                            className="bg-brand-500 hover:bg-brand-400 text-white font-black text-xs uppercase tracking-widest px-8 rounded-2xl h-12 shadow-lg shadow-brand-500/20"
                          >
                            VERIFY IDENTITY
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'security' && (
                  <motion.div 
                    key="security"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 italic uppercase">Security Protocols</h3>
                      <p className="text-sm text-slate-500 font-medium">Protect your access and monitor account integrity.</p>
                    </div>
                    
                    <div className="glass-card rounded-[2rem] p-8 border-none bg-slate-50 shadow-inner">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                          <ShieldAlert size={20} />
                        </div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Update Access Key</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Password</label>
                          <Input 
                            type="password" 
                            className="h-12 rounded-2xl border-slate-200"
                            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" 
                            value={passwordState.current}
                            onChange={(e) => setPasswordState(s => ({...s, current: e.target.value}))}
                          />
                        </div>
                        <div className="space-y-2 md:col-start-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Password</label>
                          <Input 
                            type="password" 
                            className="h-12 rounded-2xl border-slate-200"
                            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" 
                            value={passwordState.new}
                            onChange={(e) => setPasswordState(s => ({...s, new: e.target.value}))}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verify New Password</label>
                          <Input 
                            type="password" 
                            className="h-12 rounded-2xl border-slate-200"
                            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" 
                            value={passwordState.confirm}
                            onChange={(e) => setPasswordState(s => ({...s, confirm: e.target.value}))}
                          />
                        </div>
                      </div>
                      <Button 
                        onClick={handlePasswordUpdate}
                        disabled={passwordUpdating}
                        className="bg-slate-900 text-white hover:bg-slate-800 font-black text-xs uppercase tracking-widest h-12 px-8 rounded-2xl gap-2 shadow-xl"
                      >
                        {passwordUpdating ? <RefreshCw className="animate-spin" size={16} /> : <ShieldCheck size={18} />}
                        {passwordUpdating ? 'UPDATING...' : 'CONFIRM SECURITY UPDATE'}
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Login History</h4>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-widest bg-emerald-50 text-emerald-700 border-none font-black">Active Session</Badge>
                      </div>
                      <div className="rounded-[2rem] border border-slate-100 overflow-hidden bg-white">
                        <Table>
                          <TableBody>
                            <TableRow className="border-none hover:bg-slate-50 transition-colors">
                              <TableCell className="px-8 py-5">
                                <div className="flex items-center gap-4">
                                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <Smartphone size={20} className="text-slate-400" />
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-900 text-sm">{profile.lastDevice || 'Secure Terminal Access'}</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Last Auth: {profile.lastLogin ? new Date(profile.lastLogin).toLocaleString() : 'Recently Active'}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-8 py-5 text-right">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">ENCRYPTED SESSION</p>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'appearance' && (
                  <motion.div 
                    key="appearance"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 italic uppercase">Interface Styles</h3>
                      <p className="text-sm text-slate-500 font-medium">Personalize your visual workflow environment.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { id: 'light', label: 'Day Mode', bg: 'bg-white', text: 'text-slate-900', border: 'border-slate-200' },
                        { id: 'dark', label: 'Night Mode', bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-800' },
                        { id: 'system', label: 'Adaptive', bg: 'bg-gradient-to-br from-white to-slate-900', text: 'text-slate-500', border: 'border-slate-200' }
                      ].map((t) => (
                        <Card 
                          key={t.id}
                          className={`cursor-pointer transition-all border-4 rounded-[2.5rem] overflow-hidden group ${theme === t.id ? 'border-brand-500 scale-[1.02] shadow-2xl' : 'border-transparent hover:border-slate-200 shadow-sm'}`}
                          onClick={() => setTheme(t.id as any)}
                        >
                          <CardContent className="p-0">
                            <div className={`h-32 w-full ${t.bg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                              {theme === t.id && <CheckCircle2 className="text-brand-500" size={32} />}
                            </div>
                            <div className="p-5 text-center bg-white border-t border-slate-50">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">{t.label}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'notifications' && (
                  <motion.div 
                    key="notifications"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 italic uppercase">Alert Protocols</h3>
                      <p className="text-sm text-slate-500 font-medium">Manage how the system communicates critical events.</p>
                    </div>
                    <div className="space-y-4">
                      <NotificationToggle 
                        title="Decision Queue Alerts" 
                        description="Receive instant notifications when new applications enter your review pipeline." 
                        icon={<CheckCircle2 size={18} className="text-emerald-500" />}
                      />
                      <NotificationToggle 
                        title="Security Event Logs" 
                        description="Alerts for login attempts, password changes, and sensitive field updates." 
                        icon={<ShieldAlert size={18} className="text-brand-500" />}
                      />
                      <NotificationToggle 
                        title="Compliance Reminders" 
                        description="Schedule alerts for overdue KYC reviews and audit requirements." 
                        icon={<Clock size={18} className="text-amber-500" />}
                      />
                    </div>
                  </motion.div>
                )}

                {activeTab === 'system' && (
                  <motion.div 
                    key="system"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 italic uppercase">Core Configuration</h3>
                        <p className="text-sm text-slate-500 font-medium">Global financial parameters and business logic.</p>
                      </div>
                      <Badge className="bg-red-50 text-red-700 border-none px-4 py-2 font-black text-[10px] tracking-widest uppercase shadow-sm">ADMIN CLEARANCE REQUIRED</Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Standard APR (%)</label>
                        <Input 
                          type="number" 
                          className="h-12 rounded-2xl border-slate-200 font-bold"
                          value={systemSettings.interest_rate_default} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, interest_rate_default: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Facility Tenure (Months)</label>
                        <Input 
                          type="number" 
                          className="h-12 rounded-2xl border-slate-200 font-bold"
                          value={systemSettings.max_loan_duration} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, max_loan_duration: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Default Late Penalty (%)</label>
                        <Input 
                          type="number" 
                          className="h-12 rounded-2xl border-slate-200 font-bold"
                          value={systemSettings.penalty_rate} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, penalty_rate: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reporting Currency</label>
                        <Input 
                          className="h-12 rounded-2xl border-slate-200 font-bold"
                          value={systemSettings.currency} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, currency: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-3 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Institution Branding Name</label>
                        <Input 
                          className="h-12 rounded-2xl border-slate-200 font-bold"
                          value={systemSettings.company_name} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, company_name: e.target.value })} 
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NotificationToggle({ title, description, icon }: { title: string, description: string, icon: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-white hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500 max-w-sm">{description}</p>
        </div>
      </div>
      <div 
        onClick={() => setEnabled(!enabled)}
        className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${enabled ? 'bg-primary' : 'bg-slate-200'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
      </div>
    </div>
  );
}

function useTheme() {
  const { theme, setTheme } = useNextTheme();
  return { theme, setTheme };
}

function AutomationCenterView({ 
  loans, 
  loanProducts, 
  notifications,
  onRunMaintenance,
  onRunReminders,
  onRunAutomation
}: { 
  loans: any[], 
  loanProducts: any[], 
  notifications: any[],
  onRunMaintenance: () => void,
  onRunReminders: () => void,
  onRunAutomation: () => void
}) {
  const logs = JSON.parse(localStorage.getItem(AUTOMATION_LOG_KEY) || '[]');
  const lastRun = localStorage.getItem(AUTOMATION_LAST_RUN_KEY);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 max-w-6xl mx-auto"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Automation Center</h2>
        <p className="text-sm text-muted-foreground mt-1">Control scheduled jobs, background tasks, and event triggers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border shadow-none rounded-xl overflow-hidden bg-white">
          <div className="p-5 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <Zap className="text-blue-600" size={24} />
            </div>
            <h3 className="font-bold text-slate-800">Daily Core Engine</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 h-8">Main daily scheduler (Penalties + Reminders)</p>
            <Button onClick={onRunAutomation} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
              FORCE RUN NOW
            </Button>
            <p className="text-[10px] text-slate-400 mt-3 font-medium">
              Last executed: {lastRun ? new Date(lastRun).toLocaleString() : 'Never'}
            </p>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-xl overflow-hidden bg-white">
          <div className="p-5 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <ShieldAlert className="text-red-600" size={24} />
            </div>
            <h3 className="font-bold text-slate-800">Financial Maintenance</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 h-8">Applies penalties & flags OVERDUE schedules</p>
            <Button onClick={onRunMaintenance} variant="outline" className="w-full border-border font-bold h-9 text-slate-700">
              EXECUTE MANUALLY
            </Button>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-xl overflow-hidden bg-white">
          <div className="p-5 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
              <BellRing className="text-amber-600" size={24} />
            </div>
            <h3 className="font-bold text-slate-800">Payment Reminders</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 h-8">Generates notifications for upcoming dues</p>
            <Button onClick={async () => {
              await onRunReminders();
              toast.success("Payment reminders processed.");
            }} variant="outline" className="w-full border-border font-bold h-9 text-slate-700">
              SEND REMINDERS
            </Button>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-xl overflow-hidden bg-slate-900 text-white">
          <div className="p-5 flex flex-col gap-3 h-full justify-center">
            <h3 className="font-bold uppercase tracking-widest text-xs text-slate-400">System Status</h3>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-sm font-bold">Automation Active</p>
            </div>
            <div className="pt-2 border-t border-slate-800 mt-2">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Active Loans tracked</span>
                <span className="font-bold text-white">{loans.filter(l => l.status === 'ACTIVE').length}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-border shadow-none rounded-xl bg-white overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-bold text-slate-900">Execution Logs</h3>
          </div>
          <div className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700">Execution Time</TableHead>
                  <TableHead className="font-bold text-slate-700">Maintenance</TableHead>
                  <TableHead className="font-bold text-slate-700">Reminders</TableHead>
                  <TableHead className="font-bold text-slate-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500 text-sm">No automation logs recorded yet.</TableCell>
                  </TableRow>
                ) : logs.map((log: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs font-medium text-slate-600">{new Date(log.runAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {log.results?.maintenance?.status === 'OK' ? 
                        <Badge className="bg-emerald-100 text-emerald-700 border-none">Success</Badge> : 
                        <Badge className="bg-red-100 text-red-700 border-none">Failed</Badge>
                      }
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-600">
                      {log.results?.reminders?.count !== undefined ? `${log.results.reminders.count} Sent` : '-'}
                    </TableCell>
                    <TableCell>
                      {log.results?.error ? 
                        <span className="text-xs font-bold text-red-600 truncate max-w-[150px] inline-block" title={log.results.error}>Error</span> :
                        <span className="text-xs font-bold text-slate-600">Complete</span>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-xl bg-white overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-slate-50 shrink-0">
            <h3 className="font-bold text-slate-900 underline decoration-brand-500 decoration-2 underline-offset-4">System Alerts</h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[400px]">
            {notifications.filter((n: any) => n.type === 'SYSTEM' || n.targetRole === 'ALL' || n.targetRole === 'ADMIN').length === 0 ? (
              <div className="p-8 text-center">
                <BellRing className="mx-auto text-slate-300 mb-2" size={24} />
                <p className="text-xs text-slate-500">No system alerts available.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.filter((n: any) => n.type === 'SYSTEM' || n.targetRole === 'ALL' || n.targetRole === 'ADMIN').slice(0, 10).map((n: any) => (
                  <div key={n.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <p className="text-xs font-bold text-slate-800">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-semibold">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : 'Just now'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

    </motion.div>
  );
}

function PaychanguMockModal({ loan, onSuccess, onClose }: { loan: any, onSuccess: (ref: string, amount: number) => void, onClose: () => void }) {
  const [amount, setAmount] = useState(loan.outstandingBalance?.toString() || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'DETAILS' | 'CHECKOUT'>('DETAILS');

  const handleSimulatePayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const ref = `PC-${Math.random().toString(36).substring(7).toUpperCase()}`;
      onSuccess(ref, parseFloat(amount));
      setIsProcessing(false);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-white/20"
      >
        <div className="p-8 pb-4">
          <div className="flex justify-between items-start mb-6">
            <div className="bg-brand-50 p-3 rounded-2xl">
              <CreditCard className="text-brand-600" size={24} />
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
              <X size={20} />
            </button>
          </div>

          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Paychangu Gateway</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Secured by FastKwacha Financial Infrastructure</p>
        </div>

        <div className="px-8 pb-8 space-y-6">
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              <span>Recipient Asset</span>
              <span>Ref: {loan.id.slice(-6)}</span>
            </div>
            <p className="font-bold text-slate-900">{loan.productName || 'FK Loan'}</p>
            <div className="flex justify-between items-end mt-4">
              <p className="text-xs text-slate-500">Target Balance</p>
              <p className="text-lg font-black text-slate-900 tracking-tight">MWK {loan.outstandingBalance?.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Repayment Amount (MWK)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">MK</span>
              <Input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)}
                className="pl-12 h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 text-lg font-black transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="pt-4">
            <Button 
              onClick={handleSimulatePayment} 
              disabled={isProcessing || !amount || parseFloat(amount) <= 0}
              className="w-full h-14 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-black text-lg shadow-xl shadow-brand-500/20 gap-3"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="animate-spin" size={20} /> SECURING FUNDS...
                </>
              ) : (
                <>
                  PAY VIA PAYCHANGU <ChevronRight size={20} />
                </>
              )}
            </Button>
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest mt-6">
              Full encryption enabled &bull; No card data stored
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * PHASE 3: CLIENT-DRIVEN MODULES
 */

function SLAStatusIndicator({ submittedAt }: { submittedAt: any }) {
  if (!submittedAt) return <Badge variant="outline">PENDING</Badge>;
  
  const submittedDate = submittedAt.toDate ? submittedAt.toDate() : new Date(submittedAt);
  const hoursElapsed = (Date.now() - submittedDate.getTime()) / (1000 * 60 * 60);

  if (hoursElapsed > 24) {
    return (
      <div className="flex items-center gap-2 group relative">
        <Badge className="bg-red-50 text-red-600 border-red-100 font-bold px-3 py-1 rounded-full animate-pulse">SLA VIOLATED</Badge>
        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl whitespace-nowrap z-50">
          Decisions must be within 24 hours. Elapsed: {Math.floor(hoursElapsed)}h
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold px-3 py-1 rounded-full">ON TRACK</Badge>
      <span className="text-[10px] text-slate-400 font-medium">{24 - Math.floor(hoursElapsed)}h remaining</span>
    </div>
  );
}

function ClientDashboardView({ 
  view, 
  loans, 
  receipts, 
  profile, 
  notifications,
  clients,
  applications,
  onNavigate, 
  onPay, 
  onViewReceipt,
  handleLogout,
  settings,
  onUpdateSettings,
  uploadDocument,
}: { 
  view: View,
  loans: any[], 
  receipts: ReceiptRecord[], 
  profile: AuthProfile | null, 
  notifications: NotificationRecord[],
  clients: any[],
  applications: any[],
  onNavigate: (v: View) => void, 
  onPay: (loan: any) => void, 
  onViewReceipt: (receipt: ReceiptRecord) => void,
  handleLogout: () => Promise<void>,
  settings: any,
  onUpdateSettings: (newSettings: any) => Promise<void>,
  uploadDocument: any
}) {
  const [loanSubTab, setLoanSubTab] = useState<'my' | 'apply' | 'status' | 'schedule'>('my');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(profile?.name || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editAddress, setEditAddress] = useState(profile?.address || '');
  const [avatarSeed, setAvatarSeed] = useState(profile?.id || 'default');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Loan Application Form State
  const [appAmount, setAppAmount] = useState('');
  const [appTerm, setAppTerm] = useState('3');
  const [appPurpose, setAppPurpose] = useState('');
  const [appProduct, setAppProduct] = useState('');
  const [appCollateral, setAppCollateral] = useState('');
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSavingProfile(true);
    try {
      if (profile.id.startsWith('demo-') || profile.id.startsWith('local-')) {
        const updated = { ...profile, name: editName, phone: editPhone, address: editAddress, avatarSeed };
        saveLocalUser(updated);
        toast.success("Local profile updated.");
      } else {
        await updateDoc(doc(db, 'users', profile.id), {
          name: editName,
          phone: editPhone,
          address: editAddress,
          avatarSeed: avatarSeed,
          updatedAt: serverTimestamp()
        });
        toast.success("Cloud profile updated successfully!");
      }
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast.error("Failed to update profile details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!PASSWORD_RULE.test(newPassword)) {
      toast.error("Password must be at least 8 characters and include both letters and numbers.");
      return;
    }
    setIsChangingPassword(true);
    try {
      if (!profile?.email) {
        throw new Error("No active profile found.");
      }

      const authenticatedUser = auth.currentUser;
      if (authenticatedUser?.email) {
        const credential = EmailAuthProvider.credential(authenticatedUser.email, currentPassword);
        await reauthenticateWithCredential(authenticatedUser, credential);
        await updatePassword(authenticatedUser, newPassword);
      } else {
        const localProfile = getLocalUserByEmail(profile.email);
        const passwordMatches = await verifyStoredPassword(localProfile?.passwordHash, currentPassword);
        if (!passwordMatches) {
          throw Object.assign(new Error("Invalid current password."), { code: 'auth/wrong-password' });
        }
      }

      const passwordHash = await hashLocalPassword(newPassword);
      saveLocalUser({ ...profile, passwordHash } as AuthProfile);
      toast.success("Password updated successfully.");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        toast.error("Current password is incorrect.");
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error("Security re-authentication required. Please logout and login again.");
      } else {
        toast.error(error.message || "Failed to update password.");
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const activeLoans = loans.filter(l => l.status === 'ACTIVE');
  const totalLoanBalance = loans.reduce((acc, l) => acc + (l.outstandingBalance || 0), 0);
  const nextPayment = loans
    .filter(l => l.status === 'ACTIVE' && l.nextDueDate)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())[0];

  const renderDashboard = () => (
    <div className="space-y-10">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <p className="text-[10px] font-black text-brand-600 uppercase tracking-[0.3em]">Command Center</p>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter italic">Welcome, {profile?.name?.split(' ')[0] || 'Client'}</h2>
          <p className="text-slate-500 text-sm font-medium">Your financial overview is up to date.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => onNavigate('loans')} className="bg-slate-900 hover:bg-brand-600 text-white rounded-2xl h-14 px-8 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-slate-900/10">
            APPLY FOR LOAN <Plus size={16} className="ml-2" />
          </Button>
          <Button onClick={() => onNavigate('repayments')} variant="outline" className="border-2 border-slate-200 hover:border-slate-300 rounded-2xl h-14 px-8 font-black text-xs uppercase tracking-widest text-slate-900 transition-all bg-white">
            REPAY MONEY <ArrowUpRight size={16} className="ml-2" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-8 rounded-[2.5rem] border-none bg-brand-600 text-white shadow-2xl shadow-brand-500/20 relative overflow-hidden group">
          <div className="relative z-10 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <Wallet size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Active Balance</p>
              <p className="text-3xl font-black tracking-tighter mt-1">MWK {totalLoanBalance.toLocaleString()}</p>
            </div>
            <div className="pt-2">
              <Badge className="bg-white/10 text-white border-none font-bold text-[8px] uppercase tracking-widest px-3 py-1">
                {activeLoans.length} Active {activeLoans.length === 1 ? 'Facility' : 'Facilities'}
              </Badge>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
        </Card>

        <Card className="p-8 rounded-[2.5rem] border-none bg-slate-900 text-white shadow-2xl shadow-slate-900/20 relative overflow-hidden group">
          <div className="relative z-10 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Next Payment Due</p>
              <p className="text-3xl font-black tracking-tighter mt-1">
                {nextPayment ? new Date(nextPayment.nextDueDate).toLocaleDateString() : 'None'}
              </p>
            </div>
            <div className="pt-2">
              <p className="text-[9px] font-black uppercase text-brand-400 tracking-widest">
                {nextPayment ? `MWK ${nextPayment.repaymentAmount?.toLocaleString()} Pending` : 'All caught up'}
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-500/10 rounded-full -ml-16 -mb-16 blur-2xl"></div>
        </Card>

        <Card className="p-8 rounded-[2.5rem] border border-slate-100 bg-white shadow-xl shadow-slate-500/5 flex flex-col justify-between">
           <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">KYC Status</p>
              <p className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                {profile?.kycComplete ? 'Verified' : 'Incomplete'}
              </p>
            </div>
          </div>
          {!profile?.kycComplete && (
            <Button onClick={() => onNavigate('profile')} variant="link" className="text-brand-600 p-0 h-auto font-black text-[10px] uppercase tracking-widest justify-start mt-4">
              Finish Setup <ArrowRight size={12} className="ml-1" />
            </Button>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-xl font-black text-slate-900 tracking-tight italic uppercase">Recent Activity</h3>
            <button onClick={() => onNavigate('receipts')} className="text-[10px] font-black text-slate-400 hover:text-brand-600 uppercase tracking-widest transition-colors">View All History</button>
          </div>
          <Card className="rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm bg-white">
            {receipts.length === 0 ? (
              <div className="p-16 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-200">
                  <Activity size={32} />
                </div>
                <p className="text-sm text-slate-400 font-medium">No recent transactions recorded.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {receipts.slice(0, 5).map(rcpt => (
                  <div key={rcpt.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer group" onClick={() => onViewReceipt(rcpt)}>
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-all">
                        <History size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{rcpt.transactionType.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">{new Date(rcpt.date).toLocaleDateString()} &bull; {rcpt.receiptId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900 tabular-nums">MWK {rcpt.amount.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Verified</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Notifications Preview */}
        <div className="space-y-6">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-xl font-black text-slate-900 tracking-tight italic uppercase">Alerts</h3>
            <button onClick={() => onNavigate('notifications')} className="text-[10px] font-black text-slate-400 hover:text-brand-600 uppercase tracking-widest transition-colors">Inbox</button>
          </div>
          <Card className="rounded-[2.5rem] p-8 border border-slate-100 shadow-sm bg-slate-50 space-y-6">
             {notifications.length === 0 ? (
               <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full border-2 border-slate-200 flex items-center justify-center mx-auto text-slate-300">
                    <BellRing size={20} />
                  </div>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">No New Alerts</p>
               </div>
             ) : (
                notifications.slice(0, 3).map(n => (
                  <div key={n.id} className="space-y-2 group cursor-pointer" onClick={() => onNavigate('notifications')}>
                    <div className="flex justify-between items-start">
                      <p className="text-xs font-black text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">{n.title}</p>
                      {!n.isRead && <div className="w-2 h-2 rounded-full bg-brand-500 shadow-lg shadow-brand-500/50" />}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{n.message}</p>
                    <p className="text-[9px] text-slate-400 font-medium">{new Date(n.createdAt?.toDate ? n.createdAt.toDate() : n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))
             )}
          </Card>
        </div>
      </div>
    </div>
  );

  const renderLoans = () => (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Loan Management</h2>
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-2xl">
          {(['my', 'apply', 'status', 'schedule'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setLoanSubTab(tab)}
              className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${loanSubTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab === 'my' ? 'My Loans' : tab === 'apply' ? 'New Request' : tab === 'status' ? 'Tracking' : 'Schedule'}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loanSubTab === 'my' && (
          <motion.div key="my" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeLoans.length === 0 ? (
              <Card className="col-span-full py-32 border-dashed border-2 flex flex-col items-center justify-center text-slate-300 rounded-[3rem] bg-slate-50/10">
                <p className="font-black uppercase tracking-widest text-xs">No active facilities found</p>
              </Card>
            ) : (
              activeLoans.map(loan => (
                <Card key={loan.id} className="p-8 rounded-[3rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all group relative overflow-hidden bg-white">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight italic">{loan.productName}</h3>
                      <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mt-1">Ref: {loan.id.slice(-8).toUpperCase()}</p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-600 border-none px-4 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest">ACTIVE</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balance</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums">MWK {loan.outstandingBalance?.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Next Due</p>
                      <p className="text-sm font-black text-brand-600 italic">{new Date(loan.nextDueDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Button onClick={() => onPay(loan)} className="w-full h-14 bg-slate-900 hover:bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl">
                    MAKE REPAYMENT <DollarSign size={16} className="ml-2" />
                  </Button>
                </Card>
              ))
            )}
          </motion.div>
        )}

        {loanSubTab === 'apply' && (
          <motion.div key="apply" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Institutional Credit Application</h3>
               <Button onClick={() => setLoanSubTab('my')} variant="ghost" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-slate-400">Back to Portfolio</Button>
            </div>
            
            <Card className="p-10 rounded-[3rem] border border-slate-100 bg-white shadow-2xl shadow-slate-200/50">
              <ApplicationsView 
                clients={clients}
                applications={applications}
                role="CLIENT"
                sessionProfile={profile}
                uploadDocument={uploadDocument}
              />
            </Card>
          </motion.div>
        )}

        {loanSubTab === 'status' && (
          <motion.div key="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
             {loans.filter(l => l.status !== 'ACTIVE' && l.status !== 'CLOSED').length === 0 ? (
               <div className="py-20 text-center text-slate-300">
                 <p className="font-bold uppercase tracking-widest text-[10px]">No pending applications</p>
               </div>
             ) : (
                loans.filter(l => l.status !== 'ACTIVE' && l.status !== 'CLOSED').map(loan => (
                  <Card key={loan.id} className="p-6 rounded-3xl border border-slate-100 flex items-center justify-between bg-white shadow-sm">
                    <div className="flex items-center gap-6">
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${loan.status === 'SUBMITTED' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                          <Clock size={24} />
                       </div>
                       <div>
                         <p className="font-black text-slate-900">{loan.productName} Request</p>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Submitted {new Date(loan.createdAt).toLocaleDateString()}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-8">
                       <SLAStatusIndicator submittedAt={loan.createdAt} />
                       <Badge className="bg-slate-100 text-slate-600 border-none font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded-xl">{loan.status}</Badge>
                    </div>
                  </Card>
                ))
             )}
          </motion.div>
        )}

        {loanSubTab === 'schedule' && (
          <motion.div key="schedule" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {activeLoans.map(loan => (
                 <Card key={loan.id} className="p-8 rounded-[2.5rem] border border-slate-100 bg-white">
                    <h4 className="font-black text-slate-900 uppercase tracking-widest text-[10px] mb-6 border-b border-slate-50 pb-4">Repayment Timeline: {loan.productName}</h4>
                    <div className="space-y-6">
                       <div className="flex justify-between items-center">
                         <p className="text-xs font-bold text-slate-500">Principal + Interest</p>
                         <p className="font-black text-slate-900 tabular-nums">MWK {loan.amount.toLocaleString()}</p>
                       </div>
                       <div className="flex justify-between items-center">
                         <p className="text-xs font-bold text-slate-500">Term Duration</p>
                         <p className="font-black text-slate-900 uppercase tracking-widest text-[10px]">{loan.tenureMonths} Months</p>
                       </div>
                       <div className="flex justify-between items-center">
                         <p className="text-xs font-bold text-slate-500">Frequency</p>
                         <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-slate-200">{loan.repaymentFrequency}</Badge>
                       </div>
                       <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                         <p className="text-xs font-bold text-slate-900">Calculated Installment</p>
                         <p className="text-lg font-black text-brand-600 tabular-nums">MWK {loan.repaymentAmount?.toLocaleString()}</p>
                       </div>
                    </div>
                 </Card>
               ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderRepayments = () => (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Secure Repayments</h2>
        <p className="text-slate-500 font-medium">Return funds to maintain your credit health and increase future limits.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-10 rounded-[3rem] border-none bg-slate-900 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10 space-y-8">
            <div className="w-16 h-16 rounded-2.5xl bg-white/10 flex items-center justify-center">
              <Zap className="text-brand-400" size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight italic">Instant Liquidation</h3>
              <p className="text-slate-400 text-sm mt-1">Direct integration with Paychangu for automated verification.</p>
            </div>
            <div className="space-y-4">
              {activeLoans.map(loan => (
                <div key={loan.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">{loan.productName}</p>
                    <p className="text-lg font-black tabular-nums">MWK {loan.outstandingBalance?.toLocaleString()}</p>
                  </div>
                  <Button onClick={() => onPay(loan)} className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl h-12 px-6 font-black text-[9px] uppercase tracking-widest">
                    PAY NOW
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        </Card>

        <div className="space-y-6">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest px-4">Manual Proof Submission</h4>
          <Card className="p-8 rounded-[3rem] border border-slate-100 bg-white space-y-6 text-center">
             <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 flex items-center justify-center mx-auto text-slate-400">
                <FileCheck size={32} />
             </div>
             <div className="space-y-2">
               <p className="font-black text-slate-900">Paid via Bank or Cash?</p>
               <p className="text-xs text-slate-500 font-medium">Upload your deposit slip or screenshots for manual reconciliation by our finance team.</p>
             </div>
             <Button variant="outline" className="w-full h-14 border-2 border-slate-100 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50">
               SUBMIT PROOF OF PAYMENT
             </Button>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderReceipts = () => (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">The Vault</h2>
          <p className="text-slate-500 font-medium">Your historical financial proofs, verified and immutable.</p>
        </div>
        <div className="flex gap-2">
           <div className="relative h-12 w-64">
             <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
             <Input className="pl-10 h-full rounded-2xl border-2 border-slate-100 focus:border-brand-500 text-xs font-bold" placeholder="Search Receipt ID..." />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {receipts.length === 0 ? (
          <div className="py-32 text-center text-slate-300">
             <FileDown size={48} className="mx-auto mb-4 opacity-30" />
             <p className="font-bold uppercase tracking-widest text-[10px]">Registry is empty</p>
          </div>
        ) : (
          receipts.map(rcpt => (
            <Card key={rcpt.id} className="p-6 rounded-[2.5rem] border border-slate-100 bg-white hover:shadow-xl transition-all group flex items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-brand-50 group-hover:text-brand-600 flex items-center justify-center font-black text-xs italic transition-all">
                  RCPT
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="font-black text-slate-900 uppercase text-sm">{rcpt.transactionType.replace(/_/g, ' ')}</h4>
                    <Badge className="bg-emerald-50 text-emerald-600 border-none px-3 py-1 font-black text-[7px] tracking-widest uppercase">VERIFIED</Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-1">{rcpt.receiptId} &bull; {new Date(rcpt.date).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                 <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                    <p className="text-xl font-black text-slate-900 tabular-nums">MWK {rcpt.amount.toLocaleString()}</p>
                 </div>
                 <div className="flex gap-2">
                    <Button onClick={() => onViewReceipt(rcpt)} variant="outline" size="icon" className="w-12 h-12 rounded-xl border-slate-100 hover:bg-slate-900 hover:text-white transition-all">
                       <ArrowRight size={18} />
                    </Button>
                    <Button variant="outline" size="icon" className="w-12 h-12 rounded-xl border-slate-100 hover:bg-slate-900 hover:text-white transition-all">
                       <Download size={18} />
                    </Button>
                 </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Notifications</h2>
        <p className="text-slate-500 font-medium">Keep track of status changes and institutional alerts.</p>
      </div>

      <Card className="rounded-[3rem] border border-slate-100 bg-white overflow-hidden shadow-sm">
        {notifications.length === 0 ? (
          <div className="py-32 text-center text-slate-300">
            <BellRing size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold uppercase tracking-widest text-[10px]">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.map(n => (
              <div key={n.id} className={`p-8 hover:bg-slate-50/50 transition-colors flex items-start gap-8 ${!n.isRead ? 'bg-brand-50/10 border-l-4 border-brand-500' : ''}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${!n.isRead ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Bell size={24} />
                </div>
                <div className="flex-1 space-y-2">
                   <div className="flex justify-between items-center">
                     <h4 className={`text-lg font-black tracking-tight ${!n.isRead ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</h4>
                     <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(n.createdAt?.toDate ? n.createdAt.toDate() : n.createdAt).toLocaleString()}</p>
                   </div>
                   <p className="text-slate-500 text-sm leading-relaxed max-w-3xl">{n.message}</p>
                   <div className="pt-2 flex gap-4">
                      <button className="text-[9px] font-black text-brand-600 uppercase tracking-[0.2em] hover:underline">Mark as Read</button>
                      <button className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] hover:underline">Delete</button>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Identity Hub</h2>
        <p className="text-slate-500 font-medium">Maintain your KYC profile to ensure continued access to lending facilities.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-10 rounded-[3rem] border border-slate-100 bg-white space-y-10">
          <div className="flex items-center gap-8 border-b border-slate-50 pb-8">
             <div className="relative group">
               <Avatar className="h-24 w-24 rounded-[2rem] border-4 border-white shadow-2xl transition-transform group-hover:scale-105">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed || profile?.id}`} />
               </Avatar>
               {isEditingProfile && (
                 <button 
                   onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}
                   className="absolute -bottom-2 -right-2 bg-brand-600 text-white p-2 rounded-xl shadow-lg hover:bg-brand-700 transition-colors"
                   title="Refresh Avatar"
                 >
                   <RefreshCw size={14} />
                 </button>
               )}
             </div>
             <div>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">{isEditingProfile ? 'Editing Persona' : profile?.name}</h3>
               <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mt-1">Unique Persona ID: {profile?.id.toUpperCase()}</p>
               <div className="inline-flex items-center gap-2 mt-4 bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full border border-emerald-100">
                  <ShieldCheck size={14} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Identity Verified</span>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name (Legal)</label>
               {isEditingProfile ? (
                 <Input 
                   value={editName} 
                   onChange={(e) => setEditName(e.target.value)} 
                   className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 font-bold" 
                 />
               ) : (
                 <Input readOnly value={profile?.name || ''} className="h-14 rounded-2xl bg-slate-50 border-transparent font-bold" />
               )}
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</label>
               <Input readOnly value={profile?.email || ''} className="h-14 rounded-2xl bg-slate-50 border-transparent font-bold" />
               <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1 ml-1 cursor-not-allowed">Email cannot be changed</p>
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Number</label>
               {isEditingProfile ? (
                 <Input 
                   value={editPhone} 
                   onChange={(e) => setEditPhone(e.target.value)} 
                   className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 font-bold" 
                 />
               ) : (
                 <Input readOnly value={profile?.phone || ''} className="h-14 rounded-2xl bg-slate-50 border-transparent font-bold" />
               )}
             </div>
             <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Residential Location</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                {isEditingProfile ? (
                  <Input 
                    value={editAddress} 
                    onChange={(e) => setEditAddress(e.target.value)} 
                    className="pl-12 h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 font-bold" 
                  />
                ) : (
                  <Input readOnly value={profile?.address || 'Blantyre Municipal'} className="pl-12 h-14 rounded-2xl bg-slate-50 border-transparent font-bold" />
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-between items-center bg-slate-50 -mx-10 -mb-10 p-10 rounded-b-[3rem]">
            <p className="text-xs text-slate-500 font-medium italic">
              {isEditingProfile ? 'Carefully review changes before saving.' : 'Contact support to update restricted legal identifiers.'}
            </p>
            {isEditingProfile ? (
              <div className="flex gap-3">
                <Button 
                  onClick={() => setIsEditingProfile(false)} 
                  variant="outline" 
                  disabled={isSavingProfile}
                  className="rounded-xl h-12 px-8 font-black text-[10px] uppercase tracking-widest border-2 border-slate-200"
                >
                  CANCEL
                </Button>
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSavingProfile}
                  className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl h-12 px-8 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-500/20"
                >
                  {isSavingProfile ? 'SAVING...' : 'SAVE CHANGES'}
                </Button>
              </div>
            ) : (
              <Button 
                onClick={() => {
                  setEditName(profile?.name || '');
                  setEditPhone(profile?.phone || '');
                  setIsEditingProfile(true);
                }} 
                className="bg-slate-900 hover:bg-brand-600 text-white rounded-xl h-12 px-8 font-black text-[10px] uppercase tracking-widest transition-all"
              >
                EDIT PROFILE <Edit size={14} className="ml-2" />
              </Button>
            )}
          </div>
        </Card>

        <div className="space-y-6">
           <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest px-4">KYC Documents</h4>
           <Card className="p-8 rounded-[3rem] border border-slate-100 bg-white space-y-6">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                   <FileText className="text-emerald-600" size={20} />
                   <p className="text-xs font-black text-emerald-900">National ID</p>
                 </div>
                 <Badge className="bg-emerald-600 text-white border-none text-[8px] font-black uppercase">LINKED</Badge>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between grayscale opacity-50">
                 <div className="flex items-center gap-4">
                   <Smartphone className="text-slate-600" size={20} />
                   <p className="text-xs font-black text-slate-900">Proof of Residence</p>
                 </div>
                 <Badge variant="outline" className="text-[8px] font-black uppercase">MISSING</Badge>
              </div>
              <Button onClick={() => onNavigate('settings')} variant="outline" className="w-full h-12 rounded-xl border-2 border-slate-100 font-black text-[9px] uppercase tracking-widest">
                 UPLOAD DOCUMENTS
              </Button>
           </Card>
        </div>
      </div>
    </div>
  );


  const renderSettings = () => (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Terminal Controls</h2>
        <p className="text-slate-500 font-medium">Fine-tune your institutional interface and security parameters.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-10 rounded-[3rem] border border-slate-100 bg-white space-y-10">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Zap size={20} className="text-brand-600" /> Interaction Preferences
            </h3>
            <p className="text-slate-400 text-xs font-medium mt-1">Configure how FastKwacha communicates with you.</p>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Push Notifications</p>
                <p className="text-[10px] text-slate-500 font-medium">Instant alerts for disbursement and due dates.</p>
              </div>
              <Switch 
                checked={settings.notifications} 
                onCheckedChange={(v) => onUpdateSettings({ ...settings, notifications: v })}
              />
            </div>

            <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl">
              <div>
                <p className="text-sm font-bold text-slate-900">Marketing Communications</p>
                <p className="text-[10px] text-slate-500 font-medium">Receive personalized offers and credit limit upgrades.</p>
              </div>
              <Switch 
                checked={settings.marketing} 
                onCheckedChange={(v) => onUpdateSettings({ ...settings, marketing: v })}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/20">
              <div>
                <p className="text-sm font-bold">Biometric Authentication</p>
                <p className="text-[10px] text-slate-400 font-medium">Use face or fingerprint to authorize payments.</p>
              </div>
              <Switch 
                checked={settings.twoFactor} 
                onCheckedChange={(v) => onUpdateSettings({ ...settings, twoFactor: v })}
              />
            </div>
          </div>
        </Card>

        <Card className="p-10 rounded-[3rem] border border-slate-100 bg-white space-y-10">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Lock size={20} className="text-red-600" /> Security Rotation
            </h3>
            <p className="text-slate-400 text-xs font-medium mt-1">Institutional security requires regular password rotation.</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Password</label>
              <Input 
                type="password" 
                placeholder="Current password" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-14 rounded-2xl bg-slate-50 border-transparent font-bold" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Secure Password</label>
              <Input 
                type="password" 
                placeholder="Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-14 rounded-2xl bg-slate-50 border-transparent font-bold" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm New Password</label>
              <Input 
                type="password" 
                placeholder="Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-14 rounded-2xl bg-slate-50 border-transparent font-bold" 
              />
            </div>
            <Button 
              onClick={handleChangePassword}
              disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl h-14 font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20"
            >
              {isChangingPassword ? 'CONSOLIDATING...' : 'UPDATE SECURITY POOL'}
            </Button>

            <div className="p-6 bg-red-50 rounded-2xl border border-red-100 italic">
               <p className="text-[10px] text-red-600 font-bold leading-relaxed">
                 Warning: For institutional security, changing your password may require re-authentication if your session is older than 5 minutes.
               </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="max-w-[1400px] mx-auto pb-20"
    >
      {view === 'dashboard' && renderDashboard()}
      {view === 'loans' && renderLoans()}
      {view === 'repayments' && renderRepayments()}
      {view === 'receipts' && renderReceipts()}
      {view === 'notifications' && renderNotifications()}
      {view === 'profile' && renderProfile()}
      {view === 'settings' && renderSettings()}
    </motion.div>
  );
}
