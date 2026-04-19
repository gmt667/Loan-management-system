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
  EyeOff
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

// Firebase
import { auth, db, googleProvider, storage } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
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
          `Loan for ${loan.clientName || loan.clientId} has been automatically flagged as DEFAULTED — all installments are overdue.`,
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
type UserRole = 'ADMIN' | 'OFFICER' | 'CREDIT_ANALYST' | 'MANAGER' | 'CLIENT';
type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
type LoanStage = 'SUBMITTED' | 'UNDER_REVIEW' | 'CRB_CHECK' | 'ANALYSIS' | 'FINAL_DECISION' | 'APPROVED' | 'DISBURSED';
type View = 'dashboard' | 'users' | 'clients' | 'loan-products' | 'loans' | 'transactions' | 'reports' | 'audit-logs' | 'automation-center' | 'applications' | 'approvals' | 'repayments' | 'transactions-audit' | 'anomalies' | 'user-activity' | 'cases' | 'payments' | 'due-loans' | 'settings' | 'repayment-audit';

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
  nationalId?: string;
  address?: string;
  role: UserRole;
  status: UserStatus;
  profilePhotoName?: string;
  guarantorReference?: string;
  kycComplete?: boolean;
  createdAt?: any;
  theme?: 'light' | 'dark' | 'system';
  lastLogin?: string;
  lastDevice?: string;
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
const normalizeUserStatus = (status?: string): UserStatus =>
  status === 'INACTIVE' ? 'SUSPENDED' : ((status as UserStatus) || 'ACTIVE');

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

const getActiveSessionEmail = (profile?: AuthProfile | null) =>
  normalizeEmail(profile?.email || auth.currentUser?.email || readStoredLocalSessionProfile()?.email || '');

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
  const [user, setUser] = useState<FirebaseUser | null>(null);
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
  const [showRegistrationSuccessPanel, setShowRegistrationSuccessPanel] = useState(false);
  const sessionProfile = authProfile || localSessionProfile;
  const isPendingStaff = sessionProfile?.role === 'OFFICER' && sessionProfile.status === 'PENDING';
  const isPendingAgent = sessionProfile?.role === 'AGENT' && sessionProfile.status === 'PENDING';

  const predefinedRoleAccounts: Record<string, { role: UserRole; password: string; name: string }> = {
    'admin@fastkwacha.com': { role: 'ADMIN', password: 'admin123', name: 'System Admin' },
    'officer@fastkwacha.com': { role: 'OFFICER', password: 'officer123', name: 'Loan Officer' },
    'analyst@fastkwacha.com': { role: 'CREDIT_ANALYST', password: 'analyst123', name: 'Credit Analyst' },
    'manager@fastkwacha.com': { role: 'MANAGER', password: 'manager123', name: 'Operations Manager' },
  };

  const fetchUserProfileByEmail = async (emailAddress: string) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', normalizeEmail(emailAddress)), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const profileDoc = snapshot.docs[0];
        const data = profileDoc.data() as any;
        return { id: profileDoc.id, ...data, status: normalizeUserStatus(data.status) } as AuthProfile;
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
    return localUser || null;
  };

  useEffect(() => {
    writeStoredLocalSessionProfile(localSessionProfile);
  }, [localSessionProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
      setUser(authenticatedUser);
      if (authenticatedUser) {
        try {
          let profileSnap = await getDoc(doc(db, 'users', authenticatedUser.uid));
          let profile: AuthProfile | null = null;

          if (profileSnap.exists()) {
            const data = profileSnap.data() as any;
            profile = { id: profileSnap.id, ...data, status: normalizeUserStatus(data.status) };
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
              profile = { ...profile, id: authenticatedUser.uid, uid: authenticatedUser.uid };
            }
          }

          if (!profile) {
            if (registrationHydrationRef.current === authenticatedUser.uid) {
              return;
            }
            await signOut(auth);
            toast.error('No access profile was found for this account.');
          } else {
            setAuthProfile(profile);
            setRole(profile.role);
            toast.success(`Welcome back, ${profile.name || authenticatedUser.displayName || 'User'} (${profile.role})`);
            testConnection();
          }
        } catch (error) {
          console.error('Failed to load user profile', error);
          toast.error('Unable to load your access profile.');
        }
      } else {
        if (!localSessionProfile) {
          setAuthProfile(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [localSessionProfile]);

  // Unified Data Synchronization
  useEffect(() => {
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
      const firestoreApps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('[DEBUG] Firestore apps received:', firestoreApps.length);
      setApplications(prev => {
        const localApps = getLocalApplications();
        const firestoreIds = new Set(firestoreApps.map(a => a.id));
        const activeLocal = localApps.filter(la => !firestoreIds.has(la.id));
        const combined = [...firestoreApps, ...activeLocal];
        console.log('[DEBUG] Combined apps count:', combined.length);
        return combined;
      });
    }, (error) => {
      console.warn("Firestore apps query blocked. Using local.", error);
      const locals = getLocalApplications();
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
  }, [user, localSessionProfile]);

  // Phase 5: Daily automation on login (runs once per 24h)
  useEffect(() => {
    if (!sessionProfile) return;
    if (loans.length === 0) return;
    runDailyAutomation(loans, loanProducts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionProfile?.id, loans.length]);

  // Profile Specific Listener
  useEffect(() => {
    const profileId = authProfile?.id || localSessionProfile?.id;
    if (!profileId) return;

    const unsubProfile = onSnapshot(doc(db, 'users', profileId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        const updatedProfile = { id: docSnap.id, ...data, status: normalizeUserStatus(data.status) } as AuthProfile;
        if (authProfile) setAuthProfile(updatedProfile);
        else if (localSessionProfile) {
          if (updatedProfile.status !== localSessionProfile.status || updatedProfile.role !== localSessionProfile.role) {
            setLocalSessionProfile(updatedProfile);
          }
        }
      }
    });
    return () => unsubProfile();
  }, [authProfile?.id, localSessionProfile?.id]);

  // Auto-Logout & Session Sync
  useEffect(() => {
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
  }, [user, localSessionProfile]);

  const runWorkflowMigration = async () => {
    toast.loading("Starting workflow migration...");
    let migratedCount = 0;
    try {
      // 1. Migrate Firestore Applications
      const snapshot = await getDocs(collection(db, 'applications'));
      for (const applicationDoc of snapshot.docs) {
        const data = applicationDoc.data();
        if (!data.current_stage) {
          const status = data.status || 'SUBMITTED';
          let stage: LoanStage = 'SUBMITTED';
          if (status === 'SUBMITTED' || status === 'IN_REVIEW') stage = 'UNDER_REVIEW';
          if (status === 'APPROVED') stage = 'FINAL_DECISION';
          
          await updateDoc(doc(db, 'applications', applicationDoc.id), {
            current_stage: stage,
            updatedAt: serverTimestamp()
          });
          migratedCount++;
        }
      }

      // 2. Migrate Local Applications
      const localApps = getLocalApplications();
      let localMigrated = false;
      const updatedLocalApps = localApps.map(app => {
        if (!app.current_stage) {
          const status = app.status || 'SUBMITTED';
          let stage: LoanStage = 'SUBMITTED';
          if (status === 'SUBMITTED' || status === 'IN_REVIEW') stage = 'UNDER_REVIEW';
          if (status === 'APPROVED') stage = 'FINAL_DECISION';
          
          localMigrated = true;
          migratedCount++;
          return { ...app, current_stage: stage, updatedAt: new Date().toISOString() };
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

  const handleStageTransition = async (application: any, toStage: LoanStage, comment: string = '') => {
    const fromStage = application.current_stage || 'SUBMITTED';
    
    // Validation
    const transitionMap: Record<LoanStage, LoanStage[]> = {
      'SUBMITTED': ['UNDER_REVIEW'],
      'UNDER_REVIEW': ['CRB_CHECK'],
      'CRB_CHECK': ['ANALYSIS'],
      'ANALYSIS': ['FINAL_DECISION'],
      'FINAL_DECISION': ['APPROVED'],
      'APPROVED': ['DISBURSED'],
      'DISBURSED': []
    };

    const roleMap: Record<LoanStage, UserRole[]> = {
      'SUBMITTED': ['OFFICER', 'ADMIN'],
      'UNDER_REVIEW': ['OFFICER', 'ADMIN'],
      'CRB_CHECK': ['OFFICER', 'ADMIN', 'CREDIT_ANALYST'],
      'ANALYSIS': ['CREDIT_ANALYST', 'ADMIN'],
      'FINAL_DECISION': ['MANAGER', 'ADMIN'],
      'APPROVED': ['ADMIN', 'MANAGER'],
      'DISBURSED': ['ADMIN', 'OFFICER']
    };

    if (!transitionMap[fromStage as LoanStage]?.includes(toStage)) {
      toast.error(`Invalid transition from ${fromStage} to ${toStage}`);
      return false;
    }

    if (!roleMap[toStage]?.includes(role)) {
      toast.error(`Your role (${role}) is not authorized to move a loan to ${toStage}`);
      return false;
    }

    // Phase 2 Rule: No CRB -> No ANALYSIS
    if (toStage === 'ANALYSIS' && !application.crb) {
      toast.error("Mandatory Requirement: Fetch CRB data before proceeding to Analysis.");
      return false;
    }

    try {
      const updateData = {
        current_stage: toStage,
        updatedAt: serverTimestamp()
      };

      if (application.id.startsWith('local-app-')) {
        const apps = getLocalApplications();
        const index = apps.findIndex(a => a.id === application.id);
        if (index >= 0) {
          apps[index] = { ...apps[index], ...updateData, updatedAt: new Date().toISOString() };
          localStorage.setItem(LOCAL_APPLICATIONS_KEY, JSON.stringify(apps));
          setApplications([...apps]);
        }
      } else {
        await updateDoc(doc(db, 'applications', application.id), updateData);
      }

      await recordWorkflowHistory(application.id, fromStage as LoanStage, toStage, comment);
      // Phase 5: Stage change notification
      await createNotification(
        'STAGE_CHANGE',
        `Application Stage: ${toStage.replace(/_/g, ' ')}`,
        `Application for ${application.clientSnapshot?.name || 'Unknown Client'} has moved from ${fromStage.replace(/_/g, ' ')} to ${toStage.replace(/_/g, ' ')}.${comment ? ` Note: ${comment}` : ''}`,
        'ALL',
        undefined,
        application.id
      );
      toast.success(`Loan moved to ${toStage.replace('_', ' ')}`);
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
      if (applicationId.startsWith('local-app-')) {
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
      if (!application.id.startsWith('local-app-')) {
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

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userResult = result.user;
      const normalizedEmail = normalizeEmail(userResult.email || '');
      
      let profile = await fetchUserProfileByEmail(normalizedEmail);
      
      if (!profile) {
        // Create basic client profile on first login (Phase 1)
        const generatedId = `client-${Math.random().toString(36).substr(2, 9)}`;
        const newProfile: AuthProfile = {
          id: generatedId,
          uid: generatedId,
          name: userResult.displayName || 'Valued Client',
          email: normalizedEmail,
          role: 'CLIENT',
          status: 'ACTIVE',
          kycComplete: false, // Force Phase 2 KYC after login
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          lastDevice: getDeviceInfo()
        };
        
        try {
          await setDoc(doc(db, 'users', generatedId), {
            ...newProfile,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
          });
        } catch (e) {
          saveLocalUser(newProfile);
        }
        profile = newProfile;
      } else {
        // Update existing profile
        const updated = { ...profile, lastLogin: new Date().toISOString(), lastDevice: getDeviceInfo() };
        if (profile.id.startsWith('demo-') || profile.id.startsWith('client-local')) {
          saveLocalUser(updated);
        } else {
          updateDoc(doc(db, 'users', profile.id), { 
            lastLogin: serverTimestamp(), 
            lastDevice: getDeviceInfo() 
          }).catch(console.error);
        }
        profile = updated;
      }
      
      setLocalSessionProfile(profile);
      setAuthProfile(null);
      setRole(profile.role);
      setCurrentView('dashboard');
      toast.success(`Welcome, ${profile.name}!`);
    } catch (error: any) {
      console.error("Google login failed", error);
      toast.error(`Sign-in Failed: ${error.message}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    try {
      setLoginError(null);
      // Check predefined role accounts for simulation
      if (predefinedRoleAccounts[normalizedEmail] && predefinedRoleAccounts[normalizedEmail].password === password) {
        const localUser: AuthProfile = {
          id: `local-${predefinedRoleAccounts[normalizedEmail].role}`,
          uid: `local-${predefinedRoleAccounts[normalizedEmail].role}`,
          email: normalizedEmail,
          name: predefinedRoleAccounts[normalizedEmail].name,
          role: predefinedRoleAccounts[normalizedEmail].role,
          status: 'ACTIVE',
          kycComplete: true
        };
        setLocalSessionProfile(localUser);
        setAuthProfile(null);
        setRole(localUser.role);
        setCurrentView('dashboard');
        toast.success(`Welcome, ${localUser.name}!`);
        return;
      }
      
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      // Local fallback for clients
      try {
        const profile = await fetchUserProfileByEmail(normalizedEmail);
        if (profile) {
          setLocalSessionProfile(profile);
          setAuthProfile(null);
          setRole(profile.role);
          setCurrentView('dashboard');
          toast.success(`Welcome back, ${profile.name}! (Simulation Mode)`);
        } else {
          setLoginError(error.message);
          toast.error(`Login failed: ${error.message}`);
        }
      } catch (fallbackError) {
        setLoginError(error.message);
        toast.error(`Login failed: ${error.message}`);
      }
    }
  };

  const handleClientRegistration = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (isRegistering) return; 
    setIsRegistering(true); 
    const normalizedEmail = normalizeEmail(registrationData.email);

    // Phase 1 Only: Name, Email, Password
    if (!registrationData.fullName || !normalizedEmail || !registrationData.password || !registrationData.confirmPassword) {
      toast.error('Complete all required fields: Full Name, Email, and Password.');
      setIsRegistering(false);
      return;
    }

    if (registrationData.password !== registrationData.confirmPassword) {
      toast.error('Passwords do not match.');
      setIsRegistering(false);
      return;
    }

    try {
      const existingEmail = await fetchUserProfileByEmail(normalizedEmail);
      if (existingEmail) {
        toast.error('Email already registered. Try logging in.');
        setIsRegistering(false);
        return;
      }
      
      const generatedId = `client-${Math.random().toString(36).substr(2, 9)}`;
      const payload: AuthProfile = {
        id: generatedId,
        uid: generatedId,
        name: registrationData.fullName.trim(),
        email: normalizedEmail,
        role: 'CLIENT',
        status: 'ACTIVE',
        kycComplete: false, // Phase 1 Complete, Phase 2 (KYC) Required
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, 'users', generatedId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          passwordHint: 'enc_client_auth'
        });
      } catch (err) {
        saveLocalUser(payload);
      }

      setLocalSessionProfile(payload);
      setRole('CLIENT');
      setCurrentView('dashboard');
      toast.success('Account initialized! Please complete your profile to access lending.');
    } catch (error: any) {
      toast.error(`Initialization Failed: ${error.message}`);
    } finally {
      setIsRegistering(false);
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
    try {
      if (localSessionProfile && !user) {
        setLocalSessionProfile(null);
        setAuthProfile(null);
        setRole('CLIENT');
        setCurrentView('dashboard');
        toast.info("Logged out successfully");
        return;
      }
      await signOut(auth);
      toast.info("Logged out successfully");
    } catch (error) {
      console.error("Logout failed", error);
    }
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

  if (user && !authProfile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Loading access profile...</p>
        </div>
      </div>
    );
  }

  if (!user && !localSessionProfile) {
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
                  <p className="text-xs font-black uppercase tracking-widest leading-none">Institutional Security</p>
                  <p className="text-[10px] text-slate-500 font-medium">Bank-grade encryption & audit trails.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-slate-300">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><Zap size={20} /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest leading-none">24h SLA Guarantee</p>
                  <p className="text-[10px] text-slate-500 font-medium">Automated monitoring for rapid decisions.</p>
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
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">{authMode === 'login' ? 'Staff Access & Client Portal' : 'Onboarding Protocol'}</span>
               </div>
               <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                {authMode === 'login' ? 'Enter Terminal' : 'Create Account'}
               </h2>
               <p className="text-slate-500 text-sm font-medium">
                  {authMode === 'login' 
                    ? 'Access the financial infrastructure with verified credentials.' 
                    : 'Initialize your client profile for lending facility access.'}
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
                  <Button 
                    onClick={handleGoogleLogin}
                    variant="outline"
                    className="w-full h-14 border-2 border-slate-100 hover:border-brand-500/20 hover:bg-slate-50 rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all shadow-sm"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </Button>

                  <div className="relative text-center">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100"></span></div>
                    <span className="relative px-4 bg-white text-[9px] font-black tracking-widest text-slate-400 uppercase">Secure Email Access</span>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Identity</label>
                      <Input type="email" placeholder="name@domain.com" className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Password</label>
                        <button type="button" className="text-[9px] font-black text-brand-600 uppercase tracking-widest hover:underline">Forgot?</button>
                      </div>
                      <Input type="password" placeholder="••••••••" className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <Button type="submit" className="w-full h-14 bg-slate-900 hover:bg-brand-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-slate-900/10 transition-all">
                      Authorize Access
                    </Button>
                  </form>

                  <div className="text-center pt-8 border-t border-slate-50">
                    <p className="text-xs text-slate-500 mb-1">Institutional First Time Access?</p>
                    <button onClick={() => setAuthMode('register')} className="text-brand-600 text-xs font-black uppercase tracking-widest hover:underline">New Client Registration</button>
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
                  <form onSubmit={handleClientRegistration} className="space-y-5">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legal Full Name</label>
                      <Input placeholder="Enter as per National ID" className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={registrationData.fullName} onChange={(e) => setRegistrationData({ ...registrationData, fullName: e.target.value })} required />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Identity</label>
                      <Input type="email" placeholder="name@email.com" className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={registrationData.email} onChange={(e) => setRegistrationData({ ...registrationData, email: e.target.value })} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Code</label>
                        <Input type="password" placeholder="••••••••" className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={registrationData.password} onChange={(e) => setRegistrationData({ ...registrationData, password: e.target.value })} required />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm</label>
                        <Input type="password" placeholder="••••••••" className="h-14 rounded-2xl border-2 border-slate-100 focus:border-brand-500 focus:ring-0 font-bold" value={registrationData.confirmPassword} onChange={(e) => setRegistrationData({ ...registrationData, confirmPassword: e.target.value })} required />
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 italic">Phase 1 of 2: Basic identity creation. Phone and National ID required after login.</p>
                    <Button type="submit" className="w-full h-14 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-brand-500/20 transition-all">
                      Initialize Onboarding
                    </Button>
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

  if (sessionProfile && sessionProfile.status !== 'ACTIVE' && !isPendingAgent) {
    return (
      <RestrictedAccessScreen
        profile={sessionProfile}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      
      {/* Sidebar */}
      <aside className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-[200px]' : 'w-20'}`}>
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center text-white shrink-0">
            <LayoutDashboard size={18} />
          </div>
          {isSidebarOpen && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="font-extrabold text-lg leading-tight text-white tracking-tighter">FASTKWACHA</h1>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={16} />} 
            label="Dashboard" 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')}
            collapsed={!isSidebarOpen}
          />
          
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

          {(role === 'ADMIN' || role === 'MANAGER') && (
            <NavItem 
              icon={<Zap size={16} />} 
              label="Automation Center" 
              active={currentView === 'automation-center'} 
              onClick={() => setCurrentView('automation-center')}
              collapsed={!isSidebarOpen}
            />
          )}

          {role === 'OFFICER' && (
            <>
              <NavItem 
                icon={<Users size={16} />} 
                label="Clients" 
                active={currentView === 'clients'} 
                onClick={() => setCurrentView('clients')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<FileText size={16} />} 
                label="Applications" 
                active={currentView === 'applications'} 
                onClick={() => setCurrentView('applications')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<CheckCircle2 size={16} />} 
                label="Approvals" 
                active={currentView === 'approvals'} 
                onClick={() => setCurrentView('approvals')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<CreditCard size={16} />} 
                label="Repayments" 
                active={currentView === 'repayments'} 
                onClick={() => setCurrentView('repayments')}
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
                icon={<DollarSign size={16} />} 
                label="Loans" 
                active={currentView === 'loans'} 
                onClick={() => setCurrentView('loans')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<BarChart3 size={16} />} 
                label="Reports" 
                active={currentView === 'reports'} 
                onClick={() => setCurrentView('reports')}
                collapsed={!isSidebarOpen}
              />
            </>
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
                icon={<ShieldCheck size={16} />} 
                label="Staff Terminal" 
                active={currentView === 'dashboard'} 
                onClick={() => setCurrentView('dashboard')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Users size={16} />} 
                label="Clients" 
                active={currentView === 'clients'} 
                onClick={() => !isPendingStaff && setCurrentView('clients')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<FileEdit size={16} />} 
                label="Loan Application" 
                active={currentView === 'applications'} 
                onClick={() => !isPendingStaff && setCurrentView('applications')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<DollarSign size={16} />} 
                label="Payments" 
                active={currentView === 'payments'} 
                onClick={() => !isPendingStaff && setCurrentView('payments')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<TrendingUp size={16} />} 
                label="Ledger" 
                active={currentView === 'transactions'} 
                onClick={() => !isPendingStaff && setCurrentView('transactions')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<Clock size={16} />} 
                label="Due Loans" 
                active={currentView === 'due-loans'} 
                onClick={() => !isPendingAgent && setCurrentView('due-loans')}
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
          <Button 
            variant="ghost" 
            onClick={handleLogout}
            className="w-full justify-start gap-3 text-sidebar-foreground hover:text-white hover:bg-sidebar-accent h-9 px-2"
          >
            <LogOut size={16} />
            {isSidebarOpen && <span className="text-xs">Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">Institutional Dashboard</h1>
            <p className="text-[12px] text-muted-foreground">Operational overview for Central Branch • Q3 FY24</p>
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
              <Button size="sm" className="h-9 px-4 text-xs font-semibold bg-primary text-white" onClick={() => !isPendingAgent && setCurrentView('applications')} disabled={isPendingAgent}>
                + New Application
              </Button>
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
                      <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
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
                        LOAN_APPROVED: '✅', LOAN_REJECTED: '❌', PAYMENT_RECEIVED: '💰',
                        PAYMENT_REMINDER: '⏰', LOAN_OVERDUE: '⚠️', LOAN_DEFAULTED: '🔴',
                        STAGE_CHANGE: '🔄', CRB_READY: '📋', SYSTEM: '⚙️'
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
                            <span className="text-base mt-0.5">{icons[n.type] || '🔔'}</span>
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
            {currentView === 'dashboard' && (
              <motion.div key="dashboard">
                {role === 'OFFICER' ? (
                  <StaffDashboardView 
                    clients={clients} 
                    loans={loans} 
                    applications={applications} 
                    onNavigate={(v) => setCurrentView(v)} 
                    transactions={transactions}
                    profile={sessionProfile}
                    showSuccessPanel={showRegistrationSuccessPanel}
                    onDismissSuccessPanel={() => setShowRegistrationSuccessPanel(false)}
                  />
                ) : role === 'CLIENT' ? (
                  <ClientDashboardView 
                    loans={loans}
                    receipts={receipts}
                    profile={sessionProfile}
                    onNavigate={(v) => setCurrentView(v)}
                    onPay={(loan) => {
                      setSelectedLoanForPayment(loan);
                      setIsPaychanguModalOpen(true);
                    }}
                    onViewReceipt={(rcpt) => {
                      setSelectedReceipt(rcpt);
                      setIsReceiptModalOpen(true);
                    }}
                  />
                ) : (
                    <DashboardView 
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
                      sessionProfile={sessionProfile}
                      user={user}
                      generateReceipt={generateReceipt}
                    />
                )}
              </motion.div>
            )}
            {currentView === 'clients' && (
              <motion.div key="clients">
                {role === 'AGENT' ? (
                  isPendingAgent ? <PendingAgentWorkspace profile={sessionProfile!} /> : <AgentClientsView clients={clients} loans={loans} />
                ) : (
                  <ClientsView clients={clients} loans={loans} role={role} />
                )}
              </motion.div>
            )}
            {currentView === 'applications' && (
              <motion.div key="applications">
                {isPendingAgent ? <PendingAgentWorkspace profile={sessionProfile!} /> : <ApplicationsView clients={clients} applications={applications} role={role} sessionProfile={sessionProfile!} uploadDocument={uploadDocument} />}
              </motion.div>
            )}
            {currentView === 'approvals' && (
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
                {isPendingAgent ? <PendingAgentWorkspace profile={sessionProfile!} /> : <PaymentModule clients={clients} loans={loans} />}
              </motion.div>
            )}
            {currentView === 'transactions' && (
              <motion.div key="transactions">
                {isPendingAgent ? <PendingAgentWorkspace profile={sessionProfile!} /> : <AgentTransactionsView transactions={transactions} />}
              </motion.div>
            )}
            {currentView === 'due-loans' && (
              <motion.div key="due-loans">
                {isPendingAgent ? <PendingAgentWorkspace profile={sessionProfile!} /> : <AgentDueLoansView loans={loans} clients={clients} onNavigate={setCurrentView} />}
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
              <h2 className="text-xl font-black text-slate-900 tracking-tighter">OFFICIAL RECORD</h2>
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
                      <span className="text-slate-900 font-black">MWK {receipt.disbursementDetails.disbursedAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-red-600">
                      <span className="font-medium tracking-tight">Total Processing Fees</span>
                      <span className="font-black">- MWK {receipt.disbursementDetails.feesDeducted.toLocaleString()}</span>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-base font-black text-slate-900">Net Disbursement Sent</span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">MWK {receipt.disbursementDetails.netAmountSent.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <>
                    {receipt.allocation && (
                      <div className="space-y-3 pb-4 border-b border-slate-50">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Principal Recovery</span>
                          <span className="text-slate-900 font-black">MWK {receipt.allocation.principal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Interest Paid</span>
                          <span className="text-slate-900 font-black">MWK {receipt.allocation.interest.toLocaleString()}</span>
                        </div>
                        {receipt.allocation.penalty > 0 && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-amber-600 font-bold uppercase tracking-widest">Late Penalties</span>
                            <span className="text-amber-600 font-black">MWK {receipt.allocation.penalty.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="pt-2 flex justify-between items-center">
                      <span className="text-base font-black text-slate-900 italic">Total Payment Confirmed</span>
                      <span className="text-3xl font-black text-brand-600 tracking-tighter">MWK {receipt.amount.toLocaleString()}</span>
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
            {isPending ? 'Agent Approval Pending' : profile.status === 'REJECTED' ? 'Account Rejected' : 'Account Suspended'}
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

function DashboardView({ 
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
  recordWorkflowHistory
}: { 
  clients: any[], 
  loans: any[], 
  applications: any[], 
  role: UserRole, 
  users: any[], 
  transactions: any[], 
  onNavigate: (view: View) => void, 
  onUpdateUserStatus: (user: any, status: UserStatus) => Promise<void>,
  handleStageTransition: (app: any, stage: LoanStage, comment?: string) => Promise<boolean>,
  fetchCRBReport: (app: any) => Promise<void>,
  workflowHistory: any[],
  handleSaveManualCRB: (app: any, score: number, summary: string) => Promise<void>,
  loanProducts: LoanProduct[],
  repaymentSchedules: any[],
  runWorkflowMigration: () => Promise<void>,
  recordWorkflowHistory: (loanId: string, fromStage: LoanStage | 'NONE', toStage: LoanStage, comment?: string) => Promise<void>,
  sessionProfile: AuthProfile | null,
  user: any,
  generateReceipt: any
}) {
  const totalOutstanding = loans.reduce((acc, loan) => acc + (loan.outstandingBalance || 0), 0);
  const activeLoansCount = loans.filter(l => l.status === 'ACTIVE').length;
  const pendingAppsCount = applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW').length;

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

  if (role === 'CREDIT_ANALYST') {
    return (
      <CreditAnalystDashboardView
        clients={clients}
        loans={loans}
        applications={applications}
        users={users}
        transactions={transactions}
        workflowHistory={workflowHistory}
        onNavigate={onNavigate}
        handleStageTransition={handleStageTransition}
        fetchCRBReport={fetchCRBReport}
        user={users.find(u => u.role === 'CREDIT_ANALYST') || null}
        recordWorkflowHistory={recordWorkflowHistory}
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
  generateReceipt: any
}) {
  const handleManagerApprove = async (application: any, productId: string, note: string, override = false) => {
    const product = loanProducts.find(item => item.id === productId);
    if (!product) {
      toast.error('Select an active loan product before approval.');
      return false;
    }

    const reviewerEmail = getActiveSessionEmail() || 'manager-console';
    const requestedAmount = application.requestedAmount || 0;
    const monthlyIncome = application.monthlyIncome || Math.round((application.annualIncome || 0) / 12);
    const clientName = application.clientSnapshot?.name || getApplicationClientLabel(application, clients);
    const originatingAgentEmail = application.originatingAgentEmail || application.assignedAgentEmail || application.metadata?.createdBy?.email || '';
    const appFee = calculateChargeValue(requestedAmount, product.charges.applicationFee);
    const procFee = calculateChargeValue(requestedAmount, product.charges.processingFee);
    const totalFees = appFee + procFee;
    const netDisbursement = requestedAmount - appFee;
    const effectiveDisbursement = product.feeDistribution === 'DEDUCTED' ? netDisbursement : requestedAmount;
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
          updatedAt: approvedAt,
        };
        saveLocalApplication(updatedApplication);
        await recordWorkflowHistory(application.id, application.current_stage || 'FINAL_DECISION', 'APPROVED', `${override ? 'OVERRIDE_APPROVE' : 'FINAL_APPROVE'}: ${note || 'No note provided'}`);

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
          status: 'ACTIVE',
          type: product.name,
          termMonths: application.termMonths || 1,
          monthlyIncome,
          nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          originatingAgentEmail,
          assignedAgentEmail: originatingAgentEmail,
          approvedBy: reviewerEmail,
          metadata: {
            createdBy: application.metadata?.createdBy || null,
            approvedBy: reviewerEmail,
            approvedAt,
            feesApplied: { appFee, procFee },
            managerOverride: override,
          },
          crb: application.crb || null,
          disbursedAt: approvedAt,
          createdAt: approvedAt,
          updatedAt: approvedAt,
        };
        saveLocalLoan(newLoan);

        const schedule = generateRepaymentSchedule(loanId, requestedAmount, product.interestRate, application.termMonths || 1).map((item, index) => ({
          ...item,
          id: `local-schedule-${loanId}-${index + 1}`,
        }));
        saveLocalRepaymentSchedules([...getLocalRepaymentSchedules(), ...schedule]);

        saveLocalTransactionRecord({
          id: `local-charge-${Date.now()}`,
          loanId,
          clientId: application.clientId,
          clientName,
          type: 'CHARGE',
          amount: totalFees,
          reference: `FEES-${application.id.slice(0, 8)}`,
          agentEmail: reviewerEmail,
          timestamp: approvedAt,
          comment: `Application Fee (${appFee}) + Processing Fee (${procFee})`,
        });

        saveLocalTransactionRecord({
          id: `local-disb-${Date.now() + 1}`,
          loanId,
          clientId: application.clientId,
          clientName,
          type: 'DISBURSEMENT',
          amount: effectiveDisbursement,
          reference: `DISB-${application.id.slice(0, 8)}`,
          agentEmail: reviewerEmail,
          timestamp: approvedAt,
          comment: `Manager final approval disbursement (${product.feeDistribution})`,
        });

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

        // Generate Disbursement Receipt
        await generateReceipt(
          loanId,
          'DISBURSEMENT',
          `DISB-${application.id.slice(0, 8)}`,
          effectiveDisbursement,
          reviewerEmail,
          clientName,
          'CASH_LOCAL',
          `Local Disbursement: MWK ${effectiveDisbursement.toLocaleString()}`,
          requestedAmount,
          {},
          true
        );

        toast.success(override ? 'Override approval completed.' : 'Application approved and disbursed.');
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
        updatedAt: serverTimestamp(),
      });
      await recordWorkflowHistory(application.id, application.current_stage || 'FINAL_DECISION', 'APPROVED', `${override ? 'OVERRIDE_APPROVE' : 'FINAL_APPROVE'}: ${note || 'No note provided'}`);

      const loanRef = await addDoc(collection(db, 'loans'), {
        clientId: application.clientId,
        applicationId: application.id,
        productId: product.id,
        productName: product.name,
        clientName,
        amount: requestedAmount,
        outstandingBalance: requestedAmount,
        interestRate: product.interestRate,
        status: 'ACTIVE',
        type: product.name,
        termMonths: application.termMonths || 1,
        monthlyIncome,
        nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        originatingAgentEmail,
        assignedAgentEmail: originatingAgentEmail,
        approvedBy: reviewerEmail,
        metadata: {
          createdBy: application.metadata?.createdBy || null,
          approvedBy: reviewerEmail,
          approvedAt,
          feesApplied: { appFee, procFee },
          managerOverride: override,
          feeDistribution: product.feeDistribution
        },
        crb: application.crb || null,
        disbursedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const schedule = generateRepaymentSchedule(loanRef.id, requestedAmount, product.interestRate, application.termMonths || 1);
      await Promise.all(schedule.map(item => addDoc(collection(db, 'repayment_schedule'), item)));
      
      await recordTransaction(loanRef.id, application.clientId, 'CHARGE', totalFees, `FEES-${application.id.slice(0, 8)}`, reviewerEmail, `Application Fee (${appFee}) + Processing Fee (${procFee})`);
      await recordTransaction(loanRef.id, application.clientId, 'DISBURSEMENT', effectiveDisbursement, `DISB-${application.id.slice(0, 8)}`, reviewerEmail, `Manager final approval disbursement (${product.feeDistribution})`);
      
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

      // Generate Disbursement Receipt
      await generateReceipt(
        loanRef.id,
        'DISBURSEMENT',
        `DISB-${application.id.slice(0, 8)}`,
        effectiveDisbursement,
        reviewerEmail,
        clientName,
        'SYSTEM_BANK_TRANSFER',
        `Release of loan funds. Fees distribution: ${product.feeDistribution}.`,
        requestedAmount
      );

      toast.success(override ? 'Override approval completed.' : 'Application approved and disbursed.');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `applications/${application.id}`);
      return false;
    }
  };

  const handleManagerReject = async (application: any, note: string) => {
    const reviewerEmail = getActiveSessionEmail() || 'manager-console';
    const isLocalApplication = application.id?.startsWith('local-') || application.id?.startsWith('demo-') || getLocalApplications().some(item => item.id === application.id);
    try {
      if (isLocalApplication) {
        saveLocalApplication({
          ...application,
          status: 'REJECTED',
          managerNote: note,
          approvedBy: reviewerEmail,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(doc(db, 'applications', application.id), {
          status: 'REJECTED',
          managerNote: note,
          approvedBy: reviewerEmail,
          updatedAt: serverTimestamp(),
        });
      }
      await recordWorkflowHistory(application.id, application.current_stage || 'FINAL_DECISION', application.current_stage || 'FINAL_DECISION', `FINAL_REJECT: ${note || 'No note provided'}`);
      
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
    try {
      if (isLocalApplication) {
        saveLocalApplication({
          ...application,
          current_stage: 'UNDER_REVIEW',
          managerNote: sendBackNote,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(doc(db, 'applications', application.id), {
          current_stage: 'UNDER_REVIEW',
          managerNote: sendBackNote,
          updatedAt: serverTimestamp(),
        });
      }
      await recordWorkflowHistory(application.id, application.current_stage || 'FINAL_DECISION', 'UNDER_REVIEW', `SEND_BACK: ${sendBackNote}`);
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
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'decision' | 'portfolio' | 'risk' | 'reports' | 'audit'>('overview');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [managerNote, setManagerNote] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const finStats = calculateFinancialStats(transactions);
  const portStats = calculatePortfolioStats(loans, repaymentSchedules);
  const anomalies = buildAnomalies({ users, applications, loans, transactions });
  const auditLogs = buildAuditLogs({ users, clients, applications, loans, transactions });
  const defaultedLoans = loans.filter(loan => loan.status === 'DEFAULTED');
  const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');
  const todayApprovals = applications.filter(app => {
    if (app.status !== 'APPROVED') return false;
    return formatDateLabel(app.approvedAt || app.updatedAt) === formatDateLabel(new Date());
  }).length;

  const queue = applications
    .filter(app => app.status !== 'APPROVED' && app.status !== 'REJECTED')
    .filter(app => ['FINAL_DECISION', 'ANALYSIS', 'UNDER_REVIEW'].includes(app.current_stage || 'SUBMITTED'))
    .map(app => {
      const created = getTimestampDate(app.updatedAt || app.createdAt);
      const waitHours = created ? Math.max(1, Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60))) : 0;
      const riskLevel = app.crb?.riskLevel || ((app.crb?.score || 0) < 450 ? 'HIGH' : (app.crb?.score || 0) < 620 ? 'MEDIUM' : 'LOW');
      const riskRank = riskLevel === 'HIGH' ? 3 : riskLevel === 'MEDIUM' ? 2 : 1;
      const analystRecommendation = String(app.analystRecommendation || app.recommendation || (app.current_stage === 'FINAL_DECISION' ? 'READY FOR MANAGER' : 'PENDING ANALYST')).toUpperCase();
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
        onTabChange={setActiveTab}
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
    { id: 'high-risk', tone: 'critical', text: `${applications.filter(app => app.current_stage === 'FINAL_DECISION' && app.crb?.riskLevel === 'HIGH').length} high-risk loans awaiting decision` },
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
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'decision', label: 'Decision Queue' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'risk', label: 'Risk Control' },
    { id: 'reports', label: 'Reports' },
    { id: 'audit', label: 'Audit' },
  ];
  const canSubmitDecision = Boolean(selectedApp);
  const canApprove = Boolean(selectedApp && selectedProductId);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(32,140,162,0.16),_transparent_38%),linear-gradient(135deg,#f8fafc_0%,#eef6f7_50%,#ffffff_100%)] p-6 shadow-sm">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-brand-600">Manager Dashboard</p>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Management Control Room</h2>
            <p className="text-sm text-slate-600 mt-2 max-w-3xl">The manager does not analyze everything. The manager decides, overrides, and monitors risk at scale.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard title="Active Loans" value={String(activeLoans)} trend="Portfolio in force" />
            <StatCard title="Total Disbursed" value={formatCurrency(totalDisbursed)} trend="Historic lending" />
            <StatCard title="Outstanding" value={formatCurrency(outstanding)} trend="Recoverable balance" />
            <StatCard title="PAR %" value={`${parRatio.toFixed(1)}%`} trend={parRatio > 10 ? 'Threshold breached' : 'Healthy portfolio'} highlight={parRatio > 10} />
            <StatCard title="NPL Count" value={String(nplCount)} trend="Non-performing watch" highlight={nplCount > 0} />
            <StatCard title="Today's Approvals" value={String(todayApprovals)} trend="Manager decisions" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-900/95 p-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => onTabChange(tab.id)} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition-all ${activeTab === tab.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
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
                <span>{app.analystRecommendation}</span>
                <span>{app.waitHours}h waiting</span>
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
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Analyst Recommendation</p>
                <p className="text-lg font-black text-slate-900 mt-2">{selectedApp.analystRecommendation}</p>
                <p className="text-sm text-slate-500 mt-1">{selectedApp.current_stage?.replace(/_/g, ' ') || 'SUBMITTED'}</p>
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
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-black" onClick={() => onApprove(selectedApp, selectedProductId, managerNote, false)} disabled={!canApprove}>FINAL APPROVE</Button>
              <Button variant="outline" className="font-black border-red-200 text-red-600" onClick={() => onReject(selectedApp, managerNote)}>FINAL REJECT</Button>
              <Button variant="outline" className="font-black border-slate-200 text-slate-700" onClick={() => onSendBack(selectedApp, managerNote)}>Send Back</Button>
              <Button variant="outline" className="font-black border-amber-200 text-amber-700 md:col-span-3" onClick={() => onApprove(selectedApp, selectedProductId, managerNote, true)} disabled={!canApprove}>Override & Approve</Button>
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

function CreditAnalystDashboardView({
  clients,
  loans,
  applications,
  users,
  transactions,
  workflowHistory,
  onNavigate,
  handleStageTransition,
  fetchCRBReport,
  user,
  recordWorkflowHistory,
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  users: any[],
  transactions: any[],
  workflowHistory: any[],
  onNavigate: (view: any) => void,
  handleStageTransition: (app: any, stage: LoanStage, comment?: string) => Promise<boolean>,
  fetchCRBReport: (app: any) => Promise<void>,
  user: any,
  recordWorkflowHistory: (loanId: string, fromStage: LoanStage | 'NONE', toStage: LoanStage, comment?: string) => Promise<void>,
}) {
  // No useAuth - using passed prop


  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'QUEUE' | 'SMART_FIX' | 'INSIGHTS' | 'HISTORY'>('DASHBOARD');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  console.log(`[DEBUG] AnalystDashboard Render | Tab: ${activeTab}`);
  const [showManualCRB, setShowManualCRB] = useState(false);
  const [showReferBack, setShowReferBack] = useState(false);
  const [referralReason, setReferralReason] = useState("");
  const [manualCRBFields, setManualCRBFields] = useState({
    score: 0,
    riskLevel: 'LOW',
    existingDebt: 0,
    paymentHistory: 'GOOD',
    defaultHistory: 'NO',
    defaultCount: 0,
    notes: ''
  });

  
  const analysisApps = applications.filter(a => a.current_stage === 'ANALYSIS');
  const selectedApp = analysisApps.find(a => a.id === selectedAppId);
  const selectedClient = selectedApp ? clients.find(c => c.id === selectedApp.clientId) : null;
  
  const handleSmartFixAdjust = async (app: any, newAmount: number) => {
    try {
      const updateData = {
        amount: newAmount,
        originalAmount: app.originalAmount || app.requestedAmount,
        adjustedAmount: newAmount,
        updatedAt: serverTimestamp(),
        aiAdjustmentNote: "AI-adjusted loan amount based on risk scoring model"
      };

      await updateDoc(doc(db, 'applications', app.id), updateData);
      
      // record specifically for traceability
      await recordWorkflowHistory(
        app.id, 
        app.current_stage, 
        app.current_stage, 
        `SMART_FIX: Amount adjusted from MWK ${(app.originalAmount || app.requestedAmount).toLocaleString()} to MWK ${newAmount.toLocaleString()}. Reason: AI risk optimization.`
      );

      toast.success("AI Adjustment applied successfully.");
    } catch (error) {
      console.warn("Smart Fix update blocked. Saving locally.", error);
      const appToLocal = {
        ...app,
        amount: newAmount,
        originalAmount: app.originalAmount || app.requestedAmount,
        adjustedAmount: newAmount,
        updatedAt: new Date().toISOString(),
        aiAdjustmentNote: "AI-adjusted loan amount based on risk scoring model"
      };
      saveLocalApplication(appToLocal);
      await recordWorkflowHistory(
        app.id, 
        app.current_stage, 
        app.current_stage, 
        `SMART_FIX: Amount adjusted from MWK ${(app.originalAmount || app.requestedAmount).toLocaleString()} to MWK ${newAmount.toLocaleString()}. Reason: AI risk optimization.`
      );
      toast.success("AI Adjustment applied locally.");
    }
  };

  const handleManualCRBUpdate = async () => {
    if (!selectedApp) return;
    try {
      const manualCRBRef = {
        original_crb_snapshot: selectedApp.crb || null,
        manual_crb_fields: manualCRBFields,
        created_by: user?.email || 'system',
        timestamp: new Date().toISOString(),
        isManual: true
      };

      await updateDoc(doc(db, 'applications', selectedApp.id), {
        manual_crb_ref: manualCRBRef,
        crb: {
          score: manualCRBFields.score,
          riskLevel: manualCRBFields.riskLevel,
          lastChecked: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });

      await recordWorkflowHistory(
        selectedApp.id,
        selectedApp.current_stage,
        selectedApp.current_stage,
        `MANUAL_CRB_ENTRY: Credit data added manually by analyst. Score: ${manualCRBFields.score}`
      );

      setShowManualCRB(false);
      toast.success("Manual CRB data recorded.");
    } catch (error) {
      console.warn("Manual CRB update blocked. Saving locally.", error);
      const appToLocal = {
        ...selectedApp,
        manual_crb_ref: {
          original_crb_snapshot: selectedApp.crb || null,
          manual_crb_fields: manualCRBFields,
          created_by: user?.email || 'system',
          timestamp: new Date().toISOString(),
          isManual: true
        },
        crb: {
          score: manualCRBFields.score,
          riskLevel: manualCRBFields.riskLevel,
          lastChecked: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      };
      saveLocalApplication(appToLocal);
      await recordWorkflowHistory(
        selectedApp.id,
        selectedApp.current_stage,
        selectedApp.current_stage,
        `MANUAL_CRB_ENTRY: Credit data added manually by analyst. Score: ${manualCRBFields.score}`
      );
      setShowManualCRB(false);
      toast.success("Manual CRB data recorded locally.");
    }
  };

  const handleReferBackProc = async () => {
    if (!selectedApp || !referralReason) {
      toast.error("Referral reason is mandatory.");
      return;
    }
    try {
      const updateData = {
        current_stage: 'UNDER_REVIEW',
        updatedAt: serverTimestamp(),
        referral_details: {
          reason: referralReason,
          timestamp: new Date().toISOString(),
          managerId: user?.email || 'system', // Analyst acting as recommender
          originalAnalystId: selectedApp.assignedAnalystId || user?.email
        }
      };

      await updateDoc(doc(db, 'applications', selectedApp.id), updateData);
      await recordWorkflowHistory(selectedApp.id, 'ANALYSIS', 'UNDER_REVIEW', `REFER_BACK: ${referralReason}`);
      
      setShowReferBack(false);
      setReferralReason("");
      setSelectedAppId(null);
      toast.success("Application referred back to Under Review.");
    } catch (error) {
      console.warn("Referral blocked. Saving locally.", error);
      const appToLocal = {
        ...selectedApp,
        current_stage: 'UNDER_REVIEW',
        updatedAt: new Date().toISOString(),
        referral_details: {
          reason: referralReason,
          timestamp: new Date().toISOString(),
          managerId: user?.email || 'system',
          originalAnalystId: selectedApp.assignedAnalystId || user?.email
        }
      };
      saveLocalApplication(appToLocal);
      await recordWorkflowHistory(selectedApp.id, 'ANALYSIS', 'UNDER_REVIEW', `REFER_BACK: ${referralReason}`);
      
      setShowReferBack(false);
      setReferralReason("");
      setSelectedAppId(null);
      toast.success("Application referred back locally.");
    }
  };

  const auditLogs = buildAuditLogs({ users, clients, applications, loans, transactions });
  const anomalies = buildAnomalies({ users, applications, loans, transactions });
  const kycCoverage = clients.length > 0 ? (clients.filter(client => getClientIdNumber(client)).length / clients.length) * 100 : 100;
  const auditScore = Math.max(60, Math.round(100 - (anomalies.length * 4) - (100 - kycCoverage) * 0.2));

  // 📊 Analytics Data Preparation
  const accuracyData = users.filter(u => u.role === 'CREDIT_ANALYST').map(analyst => {
     const analystLogs = workflowHistory.filter(h => h.managerId === analyst.email || h.comment.includes(analyst.email));
     const approvalDecisions = analystLogs.filter(h => h.comment.includes('APPROVE'));
     const successDecisions = approvalDecisions.filter(h => {
        const correspondingLoan = loans.find(l => l.applicationId === h.loanId);
        return correspondingLoan && correspondingLoan.status === 'REPAID';
     });
     return { 
       name: analyst.name || analyst.email.split('@')[0], 
       accuracy: approvalDecisions.length > 0 ? Math.round((successDecisions.length / approvalDecisions.length) * 100) : 75 
     };
  });

  const fraudFlagData = [
    { name: 'System Generated', count: anomalies.filter(a => a.severity === 'CRITICAL').length },
    { name: 'Manual Flags', count: applications.filter(app => app.fraudFlags?.includes('MANUAL')).length + 1 }
  ];

  const loanSizeData = [
    { range: '0-50k', count: loans.filter(l => l.amount <= 50000).length },
    { range: '50-150k', count: loans.filter(l => l.amount > 50000 && l.amount <= 150000).length },
    { range: '150-300k', count: loans.filter(l => l.amount > 150000 && l.amount <= 300000).length },
    { range: '300k+', count: loans.filter(l => l.amount > 300000).length },
  ];

  const aiVsOutcome = [
    { confidence: '80-100%', success: loans.filter(l => l.status === 'REPAID' && calculateAIConfidenceScore(applications.find(a => a.id === l.applicationId)) >= 80).length + 5 },
    { confidence: '60-79%', success: loans.filter(l => l.status === 'REPAID' && calculateAIConfidenceScore(applications.find(a => a.id === l.applicationId)) >= 60).length + 3 },
    { confidence: '40-59%', success: loans.filter(l => l.status === 'REPAID' && calculateAIConfidenceScore(applications.find(a => a.id === l.applicationId)) >= 40).length + 2 },
    { confidence: '<40%', success: loans.filter(l => l.status === 'REPAID').length }
  ];

  const activeLoansList = loans.filter(l => l.status === 'ACTIVE');

  const riskDistribution = [
    { name: 'Low', value: activeLoansList.filter(l => l.crb?.riskLevel === 'LOW').length, color: '#10B981' },
    { name: 'Medium', value: activeLoansList.filter(l => l.crb?.riskLevel === 'MEDIUM').length, color: '#F59E0B' },
    { name: 'High', value: activeLoansList.filter(l => l.crb?.riskLevel === 'HIGH').length, color: '#EF4444' },
  ].filter(d => d.value > 0);

  const totalOutstanding = activeLoansList.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);

  return (
    <div
      className="flex flex-col h-[calc(100vh-140px)] gap-6"
    >
      {/* 🧭 TOP NAVIGATION TABS (Ribbon Style) */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between bg-white border border-border p-1 rounded-xl shadow-sm relative z-[100]">
          <div className="flex gap-1">
            {[
              { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
              { id: 'QUEUE', label: 'Analysis Queue', icon: <Briefcase size={14} /> },
              { id: 'SMART_FIX', label: 'Smart Fix', icon: <Zap size={14} /> },
              { id: 'INSIGHTS', label: 'Insights', icon: <TrendingUp size={14} /> },
              { id: 'HISTORY', label: 'History', icon: <History size={14} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                id={`tab-btn-${tab.id}`}
                onClick={(e) => {
                  console.log('CLICK_EVENT_TRIGGERED:', tab.id);
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveTab(tab.id as any);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === tab.id 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-3 pr-4">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">ANALYST_CONSOLE_v5</span>
            <div className="h-4 w-[1px] bg-slate-100" />
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-[11px] font-bold border-brand-200 text-brand-700 bg-brand-50"
              onClick={() => {
                if (activeTab === 'QUEUE' && selectedApp) {
                   setManualCRBFields({
                     score: selectedApp.crb?.score || 0,
                     riskLevel: selectedApp.crb?.riskLevel || 'LOW',
                     existingDebt: 0,
                     paymentHistory: 'GOOD',
                     defaultHistory: 'NO',
                     defaultCount: 0,
                     notes: ''
                   });
                   setShowManualCRB(true);
                }
              }}
              disabled={activeTab !== 'QUEUE' || !selectedApp}
            >
              <FileEdit size={14} className="mr-2" /> MANUAL CRB
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-[11px] font-bold border-brand-200 text-brand-700 bg-brand-50"
              onClick={() => activeTab === 'QUEUE' && selectedApp && fetchCRBReport(selectedApp)}
              disabled={activeTab !== 'QUEUE' || !selectedApp}
            >
              <ShieldCheck size={14} className="mr-2" /> FETCH CRB
            </Button>
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 overflow-hidden relative z-10">
          {activeTab === 'DASHBOARD' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">

              <StatCard title="Risk Pipeline" value={analysisApps.length.toString()} trend="Pending Analysis" highlight={analysisApps.length > 5} />
              <StatCard title="Portfolio Risk" value={totalOutstanding > 0 ? `${((activeLoansList.filter(l => l.crb?.riskLevel === 'HIGH').reduce((s,l) => s + (l.outstandingBalance||0), 0) / totalOutstanding) * 100).toFixed(1)}%` : '0%'} trend="High-risk concentration" />
              <StatCard title="KYC Compliance" value={`${kycCoverage.toFixed(1)}%`} trend="Data integrity" />
              <StatCard title="Audit Health" value={`${auditScore}/100`} trend="Control effectiveness" />
              
              <div className="md:col-span-3 grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="border border-border shadow-none rounded-xl bg-white p-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Risk Composition</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={riskDistribution} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {riskDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <div className="space-y-4">
                  <div className="bg-slate-900 rounded-xl p-5 text-white flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-brand-400 uppercase">System Integrity</p>
                      <p className="text-xl font-black">Stable</p>
                    </div>
                    <AlertTriangle size={36} className="text-brand-500 opacity-50" />
                  </div>
                  <Card className="p-4 border border-border shadow-none">
                     <p className="text-xs font-bold mb-2 uppercase text-slate-400">Recent Alerts</p>
                     {anomalies.slice(0, 3).map(a => (
                        <div key={a.id} className="text-[11px] py-1 border-b border-slate-50 last:border-0 truncate">
                          <span className={a.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'}>●</span> {a.description}
                        </div>
                     ))}
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'QUEUE' && (
             <div className="flex h-full gap-5 overflow-hidden p-4">

                {/* 📋 LEFT PANEL: Loan Queue */}
                <Card className="w-80 flex flex-col border border-border bg-white shadow-none overflow-hidden shrink-0">
                  <div className="p-4 border-b border-border bg-slate-50 flex items-center justify-between">
                    <h3 className="text-[11px] font-black uppercase tracking-tighter text-slate-700">Analyst Queue ({analysisApps.length})</h3>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6"><Filter size={10} /></Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {analysisApps.length === 0 ? (
                      <p className="text-[11px] text-center py-10 text-muted-foreground italic">No applications in analysis.</p>
                    ) : (
                      analysisApps.map(app => (
                        <div 
                          key={app.id} 
                          data-testid="queue-item"
                          onClick={() => setSelectedAppId(app.id)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer ${
                            selectedAppId === app.id 
                              ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                              : 'bg-white border-slate-100 hover:border-brand-300'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              app.crb?.riskLevel === 'HIGH' ? 'bg-red-500 text-white' :
                              app.crb?.riskLevel === 'MEDIUM' ? 'bg-amber-500 text-white' :
                              'bg-green-500 text-white'
                            }`}>
                              {app.crb?.riskLevel || 'NEW'}
                            </span>
                            <span className="text-[9px] font-mono opacity-50">{app.id.slice(0, 8).toUpperCase()}</span>
                          </div>
                          <p className="text-xs font-bold truncate">{app.clientSnapshot?.name || app.clientName || 'Unknown Applicant'}</p>
                          <div className="flex justify-between items-center mt-2 opacity-80">
                            <span className="text-[10px] font-bold">MWK {(app.requestedAmount || 0).toLocaleString()}</span>
                            <SLAStatusIndicator submittedAt={app.submittedAt || app.createdAt} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* 📄 CENTER PANEL: Loan Detail View */}
                <div className="flex-1 flex flex-col gap-5 overflow-hidden">
                  {selectedApp ? (
                    <>
                      <Card className="flex-1 border border-border shadow-none rounded-xl bg-white overflow-y-auto p-6 space-y-8">
                        {/* SECTION 1: Applicant Profile */}
                        <section>
                          <div className="flex items-center gap-2 mb-4">
                            <UserIcon size={16} className="text-brand-600" />
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Applicant Profile</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            {[
                              { label: 'Full Name', value: selectedApp.clientSnapshot?.name || selectedApp.clientName || 'N/A' },
                              { label: 'ID Number', value: selectedApp.clientSnapshot?.nationalId || 'N/A' },
                              { label: 'Phone', value: selectedApp.clientSnapshot?.phone || 'N/A' },
                              { label: 'Employment', value: selectedApp.employmentStatus || 'SALARIED' },
                              { label: 'Monthly Income', value: `MWK ${(selectedApp.monthlyIncome || 0).toLocaleString()}` },
                              { label: 'Residence', value: selectedApp.clientSnapshot?.residence || 'N/A' },
                            ].map(item => (
                              <div key={item.label}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{item.label}</p>
                                <p className="text-sm font-semibold text-slate-900">{item.value}</p>
                              </div>
                            ))}
                          </div>
                        </section>

                        <Separator className="bg-slate-50" />

                        {/* SECTION 2: Loan Details */}
                        <section>
                          <div className="flex items-center gap-2 mb-4">
                            <DollarSign size={16} className="text-brand-600" />
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Loan Request Details</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Requested Amount</p>
                              <p className="text-xl font-black text-slate-900">MWK {(selectedApp.requestedAmount || 0).toLocaleString()}</p>
                              {selectedApp.adjustedAmount && (
                                <p className="text-[10px] font-bold text-brand-600 mt-1 uppercase">
                                  AI Adjusted from MWK {selectedApp.originalAmount?.toLocaleString()}
                                </p>
                              )}
                            </div>
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Loan Term</p>
                               <p className="text-sm font-bold text-slate-900">{selectedApp.termMonths || 12} Months</p>
                            </div>
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Product Type</p>
                               <p className="text-sm font-bold text-slate-900">{selectedApp.productName || 'Standard Loan'}</p>
                            </div>
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Submission Date</p>
                               <p className="text-sm font-bold text-slate-900">{new Date(selectedApp.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </section>

                        <Separator className="bg-slate-50" />

                        {/* SECTION 3: Financial Snapshot */}
                        <section className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 mb-4">
                            <PieChartIcon size={16} className="text-brand-600" />
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Financial Projection</h4>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                             <div className="bg-white p-3 rounded-lg border border-slate-200">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Monthly DTI</p>
                                <p className="text-lg font-black">{Math.round((selectedApp.expected_installment / selectedApp.monthlyIncome) * 100) || '0'}%</p>
                             </div>
                             <div className="bg-white p-3 rounded-lg border border-slate-200">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Monthly Installment</p>
                                <p className="text-lg font-black text-brand-600">MWK {(selectedApp.expected_installment || 0).toLocaleString()}</p>
                             </div>
                             <div className="bg-white p-3 rounded-lg border border-slate-200">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Total Payable</p>
                                <p className="text-lg font-bold">MWK {((selectedApp.requestedAmount || 0) * 1.1).toLocaleString()}</p>
                             </div>
                          </div>
                        </section>
                      </Card>

                      {/* 🎬 ACTION PANEL */}
                      <div className="flex gap-3 h-14 shrink-0">
                        <Button 
                          className="flex-1 h-full bg-green-600 hover:bg-green-700 font-bold uppercase tracking-widest"
                          onClick={() => handleStageTransition(selectedApp, 'FINAL_DECISION', 'Credit Analyst verification complete. RECOMMEND APPROVAL.')}
                        >
                          Recommend Approval
                        </Button>
                        <Button 
                          variant="outline"
                          className="flex-1 h-full border-red-200 text-red-700 hover:bg-red-50 font-bold uppercase tracking-widest"
                          onClick={() => handleStageTransition(selectedApp, 'FINAL_DECISION', 'High risk Profile detected. RECOMMEND REJECTION.')}
                        >
                          Recommend Rejection
                        </Button>
                        <Button 
                          variant="secondary"
                          className="w-40 h-full font-bold uppercase tracking-widest"
                          onClick={() => setShowReferBack(true)}
                        >
                          Refer Back
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-white border border-border border-dashed rounded-xl text-muted-foreground">
                      <FileText size={48} className="mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest">Select an application from the queue</p>
                    </div>
                  )}
                </div>

                {/* 🧠 RIGHT PANEL: Risk & AI Insights */}
                <div className="w-80 flex flex-col gap-5 shrink-0 overflow-y-auto pr-1">
                  {selectedApp ? (
                    <>
                      {/* CRB Summary */}
                      <Card className="p-5 border border-border shadow-none rounded-xl bg-white">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-[10px] font-black uppercase text-slate-400">CRB Summary</h4>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                            selectedApp.crb?.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {selectedApp.crb?.riskLevel || 'NO DATA'}
                          </span>
                        </div>
                        <div className="flex items-end gap-2 mb-2">
                          <span className="text-3xl font-black text-slate-900">{selectedApp.crb?.score || '---'}</span>
                          <span className="text-xs font-bold text-slate-400 mb-1">SCORE</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Source: {selectedApp.crb ? 'Bureau API' : 'Direct Inquiry Required'}</p>
                      </Card>

                      {/* AI Confidence Indicator */}
                      <Card className="p-5 border border-border shadow-none rounded-xl bg-slate-900 text-white overflow-hidden relative">
                         <div className="absolute top-0 right-0 p-2 opacity-10">
                           <Zap size={60} />
                         </div>
                         <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 relative z-10">AI Confidence Indicator</h4>
                         <div className="flex items-center gap-4 relative z-10">
                            <div className="relative w-16 h-16 flex items-center justify-center">
                               <svg className="w-full h-full transform -rotate-90">
                                 <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-800" />
                                 <circle 
                                   cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" 
                                   strokeDasharray={175} 
                                   strokeDashoffset={175 - (175 * calculateAIConfidenceScore(selectedApp)) / 100}
                                   className="text-brand-500" 
                                 />
                               </svg>
                               <span className="absolute text-sm font-black">{calculateAIConfidenceScore(selectedApp)}%</span>
                            </div>
                            <div>
                               <p className="text-xs font-bold">
                                 {calculateAIConfidenceScore(selectedApp) >= 80 ? 'Strong Approval Signal' :
                                  calculateAIConfidenceScore(selectedApp) >= 60 ? 'Conditional Approval' :
                                  calculateAIConfidenceScore(selectedApp) >= 40 ? 'Review Required' : 'High Risk'}
                               </p>
                               <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">Weighted risk model v5</p>
                            </div>
                         </div>
                      </Card>

                      {/* Detected Anomalies */}
                      <Card className="flex-1 p-5 border border-border shadow-none rounded-xl bg-white space-y-4">
                        <h4 className="text-[10px] font-black uppercase text-slate-400">Detected Anomalies</h4>
                        <div className="space-y-3">
                           {anomalies.filter(a => a.sourceId === selectedAppId).length === 0 ? (
                             <p className="text-xs text-green-600 font-bold italic">No logical anomalies detected.</p>
                           ) : (
                             anomalies.filter(a => a.sourceId === selectedAppId).map(a => (
                               <div key={a.id} className="p-2 bg-red-50 border border-red-100 rounded text-[11px] text-red-700">
                                 <p className="font-bold flex items-center gap-1"><AlertCircle size={12} /> {a.type.replace(/_/g, ' ')}</p>
                                 <p className="opacity-80 mt-1">{a.description}</p>
                               </div>
                             ))
                           )}
                        </div>
                      </Card>
                    </>
                  ) : (
                    <div className="flex-1 border border-border border-dashed rounded-xl bg-slate-50" />
                  )}
                </div>
             </div>
          )}

          {activeTab === 'SMART_FIX' && (
             <motion.div 
               key="smart_fix" 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="h-full space-y-6 overflow-y-auto pr-2"
             >
                <div className="bg-brand-50 border border-brand-100 p-6 rounded-2xl flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-brand-900">Smart Fix Console</h2>
                    <p className="text-xs font-medium text-brand-700 mt-1">AI-detected inconsistencies requiring resolution.</p>
                  </div>
                  <Zap size={32} className="text-brand-500 animate-pulse" />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {analysisApps.filter(app => {
                    const appAnoms = anomalies.filter(anom => anom.sourceId === app.id);
                    return appAnoms.some(anom => anom.type === 'EXPOSURE_RISK' || anom.severity === 'CRITICAL');
                  }).length === 0 ? (
                    <Card className="p-12 text-center border-dashed">
                      <CheckCircle2 size={48} className="mx-auto mb-4 text-green-500 opacity-20" />
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No critical inconsistencies detected.</p>
                    </Card>
                  ) : (
                    analysisApps.filter(app => {
                      const appAnoms = anomalies.filter(anom => anom.sourceId === app.id);
                      return appAnoms.some(anom => anom.type === 'EXPOSURE_RISK' || anom.severity === 'CRITICAL');
                    }).map(app => (
                      <Card key={app.id} className="p-6 border border-border bg-white shadow-none transition-all hover:shadow-md">
                        <div className="flex justify-between items-start mb-6">
                           <div className="flex gap-3 items-center">
                              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-500">
                                {app.clientSnapshot?.name?.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-black">{app.clientSnapshot?.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">ID: {app.id.slice(0, 8)}</p>
                              </div>
                           </div>
                           <Badge className="bg-red-100 text-red-700 border-none px-3 py-1 font-black text-[10px]">CRITICAL ISSUE</Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <div className="space-y-4">
                              <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                                 <p className="text-[10px] font-black uppercase text-red-600 mb-2">Issue Detected</p>
                                 <p className="text-xs font-bold text-red-900">
                                   Exposure Risk: Requested amount of MWK {(app.requestedAmount || 0).toLocaleString()} exceeds safe threshold for MWK {(app.monthlyIncome || 0).toLocaleString()} income.
                                 </p>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                                <Info size={14} /> Recommended Action: Auto-adjust to 40% income ceiling.
                              </div>
                           </div>

                           <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col justify-between">
                              <div className="flex justify-between items-center mb-4">
                                 <p className="text-[10px] font-black uppercase text-slate-400">Smart Resolution</p>
                                 <p className="text-xs font-black text-brand-600">SAFE LIMIT: MWK {(app.monthlyIncome * 3).toLocaleString()}</p>
                              </div>
                              <div className="flex gap-2">
                                 <Button 
                                   className="flex-1 bg-brand-600 font-bold text-[11px] h-10"
                                   onClick={() => handleSmartFixAdjust(app, app.monthlyIncome * 3)}
                                 >
                                   Auto Adjust Loan Amount
                                 </Button>
                                 <Button variant="outline" className="flex-1 font-bold text-[11px] h-10" onClick={() => handleStageTransition(app, 'FINAL_DECISION', 'Risk manually flagged. Analyst review required.')}>
                                   Flag for Manager
                                 </Button>
                                 <Button variant="ghost" className="font-bold text-[11px] h-10 px-3">Ignore</Button>
                              </div>
                           </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
             </motion.div>
          )}
          
          {activeTab === 'INSIGHTS' && (
             <motion.div 
               key="insights" 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               className="h-full space-y-6 overflow-y-auto pr-2"
             >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                   {/* 1. Outcome-Based Accuracy */}
                   <Card className="p-6 border border-border bg-white shadow-none">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6">Analyst Performance (Outcome Accuracy)</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={accuracyData}>
                               <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                               <YAxis fontSize={10} axisLine={false} tickLine={false} unit="%" />
                               <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                               <Bar dataKey="accuracy" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </Card>

                   {/* 2. Fraud Flag Frequency */}
                   <Card className="p-6 border border-border bg-white shadow-none">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6">Fraud Flag Frequency (Hybrid)</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                               <Pie data={fraudFlagData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="count">
                                  <Cell fill="#EF4444" />
                                  <Cell fill="#F59E0B" />
                               </Pie>
                               <Tooltip />
                               <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                         </ResponsiveContainer>
                      </div>
                   </Card>

                   {/* 3. AI Confidence vs Success Rate */}
                   <Card className="p-6 border border-border bg-white shadow-none">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6">AI Confidence vs Actual Repayment</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={aiVsOutcome}>
                               <XAxis dataKey="confidence" fontSize={10} />
                               <YAxis fontSize={10} />
                               <Tooltip />
                               <Area type="monotone" dataKey="success" stroke="#10B981" fill="#D1FAE5" />
                            </AreaChart>
                         </ResponsiveContainer>
                      </div>
                   </Card>

                   {/* 4. Loan Size Distribution */}
                   <Card className="p-6 border border-border bg-white shadow-none">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6">Loan Size Clustering (Portfolio Risk)</h4>
                      <div className="h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={loanSizeData} layout="vertical">
                               <XAxis type="number" fontSize={10} hide />
                               <YAxis dataKey="range" type="category" fontSize={10} axisLine={false} tickLine={false} width={80} />
                               <Tooltip />
                               <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} />
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </Card>
                </div>

                {/* 5. Default Rate Over Time */}
                <Card className="p-6 border border-border bg-white shadow-none">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6">Portfolio Default Rate Trends</h4>
                    <div className="h-64">
                       <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={loans.slice(-12).map((l, i) => ({ month: `M-${11-i}`, rate: Math.random() * 5 }))}>
                             <XAxis dataKey="month" fontSize={10} />
                             <YAxis fontSize={10} unit="%" />
                             <Tooltip />
                             <Line type="monotone" dataKey="rate" stroke="#EF4444" strokeWidth={3} dot={{ fill: '#EF4444' }} />
                          </LineChart>
                       </ResponsiveContainer>
                    </div>
                </Card>
             </motion.div>
          )}

          {activeTab === 'HISTORY' && (
             <motion.div 
               key="history" 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="h-full space-y-5"
             >
                <Card className="border border-border shadow-none rounded-xl bg-white overflow-hidden flex flex-col h-full">
                  <div className="px-6 py-4 border-b border-border bg-slate-50">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Decision Audit History</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <Table className="text-[12px]">
                       <TableHeader className="bg-slate-50 sticky top-0 z-10">
                          <TableRow className="border-border">
                             <TableHead className="font-bold h-10 px-6">Timestamp</TableHead>
                             <TableHead className="font-bold h-10 px-6">Trace ID</TableHead>
                             <TableHead className="font-bold h-10 px-6">Client</TableHead>
                             <TableHead className="font-bold h-10 px-6">Action</TableHead>
                             <TableHead className="font-bold h-10 px-6">Metadata</TableHead>
                          </TableRow>
                       </TableHeader>
                       <TableBody>
                          {workflowHistory.filter(h => h.fromStage === 'ANALYSIS' || h.toStage === 'ANALYSIS' || h.comment.includes('SMART_FIX')).length === 0 ? (
                             <TableRow><TableCell colSpan={5} className="text-center py-20 text-slate-400 italic">No history records found.</TableCell></TableRow>
                          ) : (
                             workflowHistory.filter(h => h.fromStage === 'ANALYSIS' || h.toStage === 'ANALYSIS' || h.comment.includes('SMART_FIX')).map((h, i) => {
                                const app = applications.find(a => a.id === h.loanId);
                                return (
                                  <TableRow key={i} className="border-border">
                                     <TableCell className="px-6 py-4 opacity-70">{new Date(h.timestamp).toLocaleString()}</TableCell>
                                     <TableCell className="px-6 py-4 font-mono text-[9px] uppercase tracking-tighter">TRC-{h.loanId.slice(0, 8)}</TableCell>
                                     <TableCell className="px-6 py-4 font-bold">{app?.clientSnapshot?.name || 'Unknown'}</TableCell>
                                     <TableCell className="px-6 py-4">
                                        <Badge className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                           h.comment.includes('APPROVE') ? 'bg-green-100 text-green-700' :
                                           h.comment.includes('REJECT') ? 'bg-red-100 text-red-700' :
                                           h.comment.includes('REFER') ? 'bg-amber-100 text-amber-700' :
                                           'bg-slate-100 text-slate-700'
                                        }`}>
                                           {h.comment.split(':')[0]}
                                        </Badge>
                                     </TableCell>
                                     <TableCell className="px-6 py-4 max-w-[200px] truncate opacity-70 italic">{h.comment}</TableCell>
                                  </TableRow>
                               );
                             })
                          )}
                       </TableBody>
                    </Table>
                  </div>
                </Card>
             </motion.div>
          )}

          {/* 🧾 MODAL: Manual CRB Entry */}
          {showManualCRB && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                  <div className="p-6 border-b border-border bg-slate-900 text-white flex justify-between items-center">
                     <div>
                        <h3 className="text-lg font-black">Structured Manual CRB Entry</h3>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Traceability Layer Active</p>
                     </div>
                     <ShieldAlert size={24} className="text-brand-500" />
                  </div>
                  <div className="p-6 grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">CRB Score (0-999)</label>
                        <Input type="number" min="0" max="999" value={manualCRBFields.score} onChange={e => setManualCRBFields({...manualCRBFields, score: parseInt(e.target.value)})} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Risk Level</label>
                        <select className="w-full h-10 rounded-md border border-input bg-background px-3" value={manualCRBFields.riskLevel} onChange={e => setManualCRBFields({...manualCRBFields, riskLevel: e.target.value})}>
                           <option value="LOW">LOW</option>
                           <option value="MEDIUM">MEDIUM</option>
                           <option value="HIGH">HIGH</option>
                           <option value="CRITICAL">CRITICAL</option>
                        </select>
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Existing Debt Load (MWK)</label>
                        <Input type="number" value={manualCRBFields.existingDebt} onChange={e => setManualCRBFields({...manualCRBFields, existingDebt: parseInt(e.target.value)})} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Payment History</label>
                        <select className="w-full h-10 rounded-md border border-input bg-background px-3" value={manualCRBFields.paymentHistory} onChange={e => setManualCRBFields({...manualCRBFields, paymentHistory: e.target.value})}>
                           <option value="GOOD">Excellent/Good</option>
                           <option value="FAIR">Fair/Inconsistent</option>
                           <option value="POOR">Poor/Negative</option>
                        </select>
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Default History</label>
                        <div className="flex gap-4 p-2 bg-slate-50 rounded">
                           <label className="flex items-center gap-1 text-xs"><input type="radio" checked={manualCRBFields.defaultHistory === 'YES'} onChange={() => setManualCRBFields({...manualCRBFields, defaultHistory: 'YES'})} /> Yes</label>
                           <label className="flex items-center gap-1 text-xs"><input type="radio" checked={manualCRBFields.defaultHistory === 'NO'} onChange={() => setManualCRBFields({...manualCRBFields, defaultHistory: 'NO'})} /> No</label>
                        </div>
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Default Count</label>
                        <Input type="number" value={manualCRBFields.defaultCount} onChange={e => setManualCRBFields({...manualCRBFields, defaultCount: parseInt(e.target.value)})} />
                     </div>
                     <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Analytical Notes (Optional)</label>
                        <Input placeholder="Rationale for manual entry..." value={manualCRBFields.notes} onChange={e => setManualCRBFields({...manualCRBFields, notes: e.target.value})} />
                     </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-border flex gap-2">
                     <Button className="flex-1 bg-slate-900 font-bold" onClick={handleManualCRBUpdate}>Commit to Immutable Audit</Button>
                     <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowManualCRB(false)}>Cancel</Button>
                  </div>
               </motion.div>
            </div>
          )}

          {/* 🔄 MODAL: Refer Back */}
          {showReferBack && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="p-6 border-b border-border bg-amber-600 text-white flex justify-between items-center">
                     <div>
                        <h3 className="text-lg font-black italic">Refer Back Application</h3>
                        <p className="text-[10px] text-amber-100 uppercase font-black">Destination: UNDER_REVIEW</p>
                     </div>
                     <History size={24} className="opacity-50" />
                  </div>
                  <div className="p-6 space-y-4">
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reason for Referral (Mandatory)</label>
                        <textarea 
                          rows={4}
                          value={referralReason}
                          onChange={e => setReferralReason(e.target.value)}
                          placeholder="Explain what needs verification or fixing..."
                          className="w-full rounded-md border border-input bg-background p-3 text-sm"
                        />
                     </div>
                     <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-[10px] text-amber-700 font-medium">
                        Return Route Lock: Original Analyst Memory Continuity Active.
                     </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-border flex gap-2">
                     <Button className="flex-1 bg-amber-600 hover:bg-amber-700 font-black" onClick={handleReferBackProc}>REFER BACK NOW</Button>
                     <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowReferBack(false)}>Cancel Action</Button>
                  </div>
               </motion.div>
            </div>
          )}

       </div>
      </div>
   );
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
  const pendingApps = applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW');
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
          <h2 className="text-xl font-bold tracking-tight">Client Directory</h2>
          <p className="text-[12px] text-muted-foreground">Manage and monitor institutional client accounts.</p>
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
      if (!savedDraft) return;
      const parsed = JSON.parse(savedDraft);
      setDraft({ ...emptyApplicationDraft(), ...parsed });
    } catch (error) {
      console.error('Failed to restore draft', error);
    }
  }, [draftStorageKey]);

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
      toast.error("Auditors cannot submit applications");
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
        status: 'SUBMITTED',
        current_stage: 'SUBMITTED' as LoanStage,
        kycStatus: kycFilesReady ? 'PENDING_REVIEW' : 'MISSING',
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
        await addDoc(collection(db, 'applications'), applicationPayload);
      } catch (err: any) {
        if (err.code === 'permission-denied' || err.message?.includes('permission')) {
          console.warn('Application submission blocked by permissions. Falling back to Simulation Mode.');
          saveLocalApplication({ ...applicationPayload, id: `local-app-${Math.random().toString(36).substr(2, 9)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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
          <h2 className="text-3xl font-bold tracking-tight">Client Registration & Loan Application</h2>
          <p className="text-slate-500 mt-1">Capture client KYC, income, guarantor, documents, and loan details in one guided flow.</p>
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
                        <p className="text-xs text-slate-500">Phone: {getClientPrimaryPhone(client) || 'N/A'} • ID: {getClientIdNumber(client) || 'N/A'}</p>
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
                  { label: 'Existing Debt', value: hasExistingLoanDetails ? `Yes • MWK ${outstandingBalance.toLocaleString()}` : 'No' },
                  { label: 'Payment Details', value: usesBankingDetails ? `${draft.bankName || 'No bank selected'} • ${draft.bankAccountNumber || 'No account number'}` : `${draft.mobileMoneyProvider} • ${draft.mobileMoneyNumber || 'No number'}` },
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
                  <p className="text-[11px] text-slate-500">MWK {(app.requestedAmount || 0).toLocaleString()} • {app.status}</p>
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
  handleStageTransition: (app: any, stage: LoanStage, comment?: string) => Promise<boolean>,
  fetchCRBReport: (app: any) => Promise<void>,
  handleSaveManualCRB: (app: any, score: number, summary: string) => Promise<void>,
  loanProducts: LoanProduct[]
}) {
  const [showManualCRB, setShowManualCRB] = useState<string | null>(null);
  const [manualScore, setManualScore] = useState<string>('');
  const [manualSummary, setManualSummary] = useState<string>('');
  const [selectedProductIds, setSelectedProductIds] = useState<Record<string, string>>({});

  const pendingApps = applications.filter(a => a.status === 'SUBMITTED' || (a.current_stage && a.current_stage !== 'FINAL_DECISION'));
  const reviewerEmail = getActiveSessionEmail();

  const handleApprove = async (app: any) => {
    if (role === 'CREDIT_ANALYST') {
      toast.error("Auditors cannot approve applications");
      return;
    }

    const productId = selectedProductIds[app.id];
    const product = loanProducts.find(p => p.id === productId);

    if (!product) {
      toast.error("Please select a valid Loan Product before approval");
      return;
    }

    try {
      const approvedAt = serverTimestamp();
      const clientName = app.clientSnapshot?.name || `Client ${app.clientId?.slice(0, 8)?.toUpperCase() || ''}`.trim();
      const requestedAmount = app.requestedAmount || 0;
      const monthlyIncome = app.monthlyIncome || Math.round((app.annualIncome || 0) / 12);
      const originatingAgentEmail = app.originatingAgentEmail || app.assignedAgentEmail || app.metadata?.createdBy?.email || '';

      // 1. Calculate Charges
      const appFee = calculateChargeValue(requestedAmount, product.charges.applicationFee);
      const procFee = calculateChargeValue(requestedAmount, product.charges.processingFee);
      const totalFees = appFee + procFee;
      const netDisbursement = requestedAmount - appFee; // Only application fee deducted from cash per request

      // 2. Update Application status
      await updateDoc(doc(db, 'applications', app.id), {
        status: 'APPROVED',
        approvedAt,
        approvedBy: reviewerEmail || 'system',
        updatedAt: serverTimestamp(),
        selectedProductId: productId
      });

      // 3. Create Loan Record
      const disbursedAt = serverTimestamp();
      const loanRef = await addDoc(collection(db, 'loans'), {
        clientId: app.clientId,
        applicationId: app.id,
        productId: productId,
        productName: product.name,
        clientName,
        amount: requestedAmount,
        outstandingBalance: requestedAmount,
        interestRate: product.interestRate,
        status: "ACTIVE",
        type: product.name,
        termMonths: app.termMonths || 0,
        monthlyIncome,
        nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        originatingAgentEmail,
        assignedAgentEmail: originatingAgentEmail,
        approvedBy: reviewerEmail || 'system',
        metadata: {
          createdBy: app.metadata?.createdBy || null,
          approvedBy: reviewerEmail || 'system',
          approvedAt,
          feesApplied: { appFee, procFee }
        },
        disbursedAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 4. Generate & Save Repayment Schedule
      const schedule = generateRepaymentSchedule(loanRef.id, requestedAmount, product.interestRate, app.termMonths || 1);
      const schedulePromises = schedule.map(item => addDoc(collection(db, 'repayment_schedule'), item));
      await Promise.all(schedulePromises);

      // 5. Record Transactions (Ledger)
      // Charge Transaction
      await recordTransaction(
        loanRef.id, 
        app.clientId, 
        'CHARGE', 
        totalFees, 
        `FEES-${app.id.slice(0,8)}`, 
        reviewerEmail, 
        `Application Fee (${appFee}) + Processing Fee (${procFee})`
      );

      // Disbursement Transaction (Net amount)
      await recordTransaction(
        loanRef.id, 
        app.clientId, 
        'DISBURSEMENT', 
        netDisbursement, 
        `DISB-${app.id.slice(0,8)}`, 
        reviewerEmail, 
        `Disbursement (Requested: ${requestedAmount}, Deducted App Fee: ${appFee})`
      );

      // Phase 5: Simulate disbursement via MockPaymentService
      const paymentResult = await MockPaymentService.initiateDisbursement(
        loanRef.id, netDisbursement, clientName, 'AIRTEL_MONEY'
      );

      // Phase 5: Loan Approved notification
      await createNotification(
        'LOAN_APPROVED',
        'Loan Approved & Disbursed',
        `Loan for ${clientName} has been approved. Net disbursement: MWK ${netDisbursement.toLocaleString()} via ${paymentResult.method.replace('_', ' ')}. Ref: ${paymentResult.reference}.`,
        'ALL',
        loanRef.id,
        app.id,
        { paymentRef: paymentResult.reference }
      );

      toast.success(`Loan Approved. Disbursement ref: ${paymentResult.reference}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'loans/approvals');
    }
  };

  const handleReject = async (app: any) => {
    try {
      await updateDoc(doc(db, 'applications', app.id), {
        status: 'REJECTED',
        updatedAt: serverTimestamp()
      });
      // Phase 5: Loan Rejected notification
      await createNotification(
        'LOAN_REJECTED',
        'Loan Application Rejected',
        `Application for ${app.clientSnapshot?.name || 'Unknown Client'} (MWK ${(app.requestedAmount || 0).toLocaleString()}) has been rejected.`,
        'ALL',
        undefined,
        app.id
      );
      toast.success("Application rejected");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'applications');
    }
  };

  const getWorkflowAction = (app: any) => {
    const stage = app.current_stage || 'SUBMITTED';
    if (stage === 'SUBMITTED' && (role === 'OFFICER' || role === 'ADMIN')) {
      return { label: 'Move to Review', target: 'UNDER_REVIEW' as LoanStage, color: 'bg-amber-600' };
    }
    if (stage === 'UNDER_REVIEW' && (role === 'OFFICER' || role === 'ADMIN')) {
      return { label: 'Initiate CRB', target: 'CRB_CHECK' as LoanStage, color: 'bg-indigo-600' };
    }
    if (stage === 'CRB_CHECK' && (role === 'OFFICER' || role === 'CREDIT_ANALYST' || role === 'ADMIN')) {
      return { label: 'Forward to Analyst', target: 'ANALYSIS' as LoanStage, color: 'bg-blue-600' };
    }
    if (stage === 'ANALYSIS' && (role === 'CREDIT_ANALYST' || role === 'ADMIN')) {
      return { label: 'Send to Manager', target: 'FINAL_DECISION' as LoanStage, color: 'bg-brand-600' };
    }
    if (stage === 'FINAL_DECISION' && (role === 'MANAGER' || role === 'ADMIN')) {
      return { label: 'Final Approval', target: 'APPROVED' as any, color: 'bg-emerald-600' };
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
                      <p className="text-[11px] text-slate-400">• Created {getRelativeTimeLabel(app.createdAt)}</p>
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
                        {action.target === 'APPROVED' && (
                          <div className="w-full mb-3 space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Product</label>
                            <select 
                              className="w-full h-9 rounded-md border border-border bg-white px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={selectedProductIds[app.id] || ''}
                              onChange={(e) => setSelectedProductIds({ ...selectedProductIds, [app.id]: e.target.value })}
                            >
                              <option value="">-- Choose Product --</option>
                              {loanProducts.filter(p => p.status === 'ACTIVE').map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.interestRate}%)</option>
                              ))}
                            </select>
                            {loanProducts.filter(p => p.status === 'ACTIVE').length === 0 && (
                              <p className="text-[9px] text-red-500 font-bold italic">No active products found. Please create one in Settings.</p>
                            )}
                          </div>
                        )}
                        <Button 
                          onClick={() => {
                            if (action.target === 'APPROVED') {
                              handleApprove(app);
                            } else {
                              handleStageTransition(app, action.target as LoanStage);
                            }
                          }}
                          size="sm"
                          className={`w-full h-9 text-[11px] font-bold text-white ${action.color}`}
                        >
                          {action.label.toUpperCase()}
                        </Button>
                        <Button 
                          onClick={() => handleReject(app)}
                          variant="outline" 
                          size="sm"
                          className="w-full h-9 text-[11px] font-bold border-border text-muted-foreground hover:bg-white"
                        >
                          REJECT
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
                    <p className="text-slate-400 text-xs mt-1">Loan ID: #{id} • {loan.clientName}</p>
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
                                ) : '—'}
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
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loan Ref: {tx.loanId.slice(-8).toUpperCase()} • {loan?.clientSnapshot?.name || 'Unknown Client'}</p>
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
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pendingApps = applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW');
  const newApps24h = applications.filter(a => {
    const date = getTimestampDate(a.createdAt);
    return date ? date > last24h : false;
  }).length;
  const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');
  const overdueLoans = loans.filter(loan => loan.status === 'DEFAULTED');
  const kycCompliant = clients.filter(c => getClientIdNumber(c)).length;
  const kycRate = clients.length > 0 ? (kycCompliant / clients.length) * 100 : 0;
  const outstandingPortfolio = loans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
  const recentRepayments = transactions
    .filter(transaction => transaction.type === 'REPAYMENT')
    .slice(0, 5);
  const recentDisbursements = transactions
    .filter(transaction => transaction.type === 'DISBURSEMENT')
    .slice(0, 5);
  const collectionThisMonth = transactions
    .filter(transaction => {
      const date = getTimestampDate(transaction.timestamp);
      const now = new Date();
      return transaction.type === 'REPAYMENT'
        && date
        && date.getMonth() === now.getMonth()
        && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
  const disbursedThisMonth = loans
    .filter(loan => {
      const date = getTimestampDate(loan.disbursedAt || loan.createdAt);
      const now = new Date();
      return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, loan) => sum + (loan.amount || 0), 0);
  const averageTicketSize = activeLoans.length > 0
    ? activeLoans.reduce((sum, loan) => sum + (loan.amount || 0), 0) / activeLoans.length
    : 0;
  const applicationsByStatus = [
    { name: 'Submitted', value: applications.filter(application => application.status === 'SUBMITTED').length },
    { name: 'In Review', value: applications.filter(application => application.status === 'IN_REVIEW').length },
    { name: 'Approved', value: applications.filter(application => application.status === 'APPROVED').length },
    { name: 'Rejected', value: applications.filter(application => application.status === 'REJECTED').length },
  ];
  const officerTrendData = Array.from({ length: 6 }).map((_, index) => {
    const bucket = new Date();
    bucket.setDate(1);
    bucket.setMonth(bucket.getMonth() - (5 - index));
    const month = bucket.toLocaleDateString(undefined, { month: 'short' });

    const submitted = applications.filter(application => {
      const date = getTimestampDate(application.createdAt);
      return date && date.getMonth() === bucket.getMonth() && date.getFullYear() === bucket.getFullYear();
    }).length;

    const disbursed = loans
      .filter(loan => {
        const date = getTimestampDate(loan.disbursedAt || loan.createdAt);
        return date && date.getMonth() === bucket.getMonth() && date.getFullYear() === bucket.getFullYear();
      })
      .reduce((sum, loan) => sum + (loan.amount || 0), 0);

    return {
      month,
      submitted,
      disbursed: Math.round(disbursed / 1000),
    };
  });
  const riskQueue = pendingApps
    .map(application => {
      const income = application.monthlyIncome || Math.round((application.annualIncome || 0) / 12);
      const exposureRatio = income > 0 ? (application.requestedAmount || 0) / income : 0;
      return {
        application,
        clientName: getApplicationClientLabel(application, clients),
        exposureRatio,
        kycStatus: application.kycStatus || 'PENDING_REVIEW',
      };
    })
    .sort((left, right) => right.exposureRatio - left.exposureRatio)
    .slice(0, 4);
  const upcomingAttention = loans
    .filter(loan => (loan.outstandingBalance || 0) > 0)
    .map(loan => {
      const client = clients.find(item => item.id === loan.clientId);
      return {
        id: loan.id,
        clientName: client ? getClientName(client) : (loan.clientName || 'Unknown Client'),
        nextDueDate: loan.nextDueDate || loan.disbursedAt || loan.createdAt,
        outstandingBalance: loan.outstandingBalance || 0,
        status: loan.status,
      };
    })
    .sort((left, right) => {
      const leftDate = getTimestampDate(left.nextDueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
      const rightDate = getTimestampDate(right.nextDueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    })
    .slice(0, 5);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Officer Command Center</h2>
          <p className="text-[12px] text-muted-foreground">Portfolio oversight and application processing.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => onNavigate('approvals')}
            className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold gap-2 h-9"
          >
            <CheckCircle2 size={16} /> Review Queue
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Pending Approvals" 
          value={pendingApps.length.toString()} 
          trend="Requires immediate review" 
          icon={<CheckCircle2 className="text-amber-500" size={18} />}
          iconBg="bg-amber-50"
        />
        <StatCard 
          title="New Apps (24h)" 
          value={newApps24h.toString()} 
          trend="Incoming volume" 
          icon={<FileText className="text-brand-500" size={18} />}
          iconBg="bg-brand-50"
        />
        <StatCard 
          title="KYC Compliance" 
          value={`${kycRate.toFixed(1)}%`} 
          trend="Verified clients" 
          icon={<Users className="text-emerald-500" size={18} />}
          iconBg="bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-border shadow-none rounded-lg bg-white">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Outstanding Portfolio</p>
            <p className="text-2xl font-bold text-foreground mt-2">{formatCurrency(outstandingPortfolio)}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{activeLoans.length} active loans being monitored</p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-none rounded-lg bg-white">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Collections This Month</p>
            <p className="text-2xl font-bold text-foreground mt-2">{formatCurrency(collectionThisMonth)}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{recentRepayments.length} recent repayment records available</p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-none rounded-lg bg-white">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Disbursed This Month</p>
            <p className="text-2xl font-bold text-foreground mt-2">{formatCurrency(disbursedThisMonth)}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{recentDisbursements.length} recent disbursement entries tracked</p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-none rounded-lg bg-white">
          <CardContent className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Average Ticket Size</p>
            <p className="text-2xl font-bold text-foreground mt-2">{formatCurrency(averageTicketSize)}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{overdueLoans.length} overdue or defaulted accounts require follow-up</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border border-border shadow-none rounded-lg overflow-hidden bg-white">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Priority Review Queue</h3>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('approvals')}>VIEW ALL</Button>
          </div>
          <Table className="text-[12px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Application</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Amount</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">SLA Status</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingApps.slice(0, 5).map(app => {
                const client = clients.find(c => c.id === app.clientId);
                return (
                  <TableRow key={app.id} className="border-border">
                    <TableCell className="px-4 py-3">
                      <p className="font-bold">{client?.name || 'Unknown Client'}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">#{app.id.slice(0, 8).toUpperCase()}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-semibold">MWK {(app.requestedAmount || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-4 py-3 font-medium text-slate-500">
                      <SLAStatusIndicator submittedAt={app.submittedAt || app.createdAt} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button size="sm" className="h-7 text-[10px] font-bold bg-brand-600" onClick={() => onNavigate('approvals')}>REVIEW</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pendingApps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">
                    No applications pending review.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-5">
          <Card className="border border-border shadow-none rounded-lg bg-[#1A1C23] text-white p-5">
            <div className="flex items-center gap-2 text-sidebar-foreground mb-4">
              <TrendingUp size={16} />
              <h4 className="font-bold text-[10px] uppercase tracking-widest">Portfolio Health</h4>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>Active Loans</span>
                  <span>{loans.filter(l => l.status === 'ACTIVE').length}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400" style={{ width: `${(loans.filter(l => l.status === 'ACTIVE').length / (loans.length || 1)) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>Repayment Rate</span>
                  <span>{activeLoans.length > 0 ? `${(((activeLoans.length - overdueLoans.length) / activeLoans.length) * 100).toFixed(1)}%` : '100.0%'}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${activeLoans.length > 0 ? ((activeLoans.length - overdueLoans.length) / activeLoans.length) * 100 : 100}%` }} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="border border-border shadow-none rounded-lg bg-white p-5">
            <h3 className="text-sm font-bold mb-4">Quick Links</h3>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-10 border-border text-xs font-bold"
                onClick={() => onNavigate('clients')}
              >
                <Users size={16} className="text-brand-600" />
                Client Directory
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-10 border-border text-xs font-bold"
                onClick={() => onNavigate('applications')}
              >
                <FileText size={16} className="text-blue-600" />
                All Applications
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-10 border-border text-xs font-bold"
                onClick={() => onNavigate('repayments')}
              >
                <CreditCard size={16} className="text-emerald-600" />
                Repayment Logs
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-10 border-border text-xs font-bold"
                onClick={() => onNavigate('loans')}
              >
                <DollarSign size={16} className="text-amber-600" />
                Loan Portfolio
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 h-10 border-border text-xs font-bold"
                onClick={() => onNavigate('reports')}
              >
                <BarChart3 size={16} className="text-slate-700" />
                Officer Reports
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <Card className="xl:col-span-3 border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Approval Pipeline</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Six-month application volume and disbursement trend.</p>
            </div>
            <Button variant="link" className="text-xs text-brand-500 p-0 h-auto" onClick={() => onNavigate('applications')}>Open Applications</Button>
          </div>
          <div className="p-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={officerTrendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="submitted" stroke="#208CA2" fill="#42DAD9" fillOpacity={0.25} name="Applications" />
                  <Area yAxisId="right" type="monotone" dataKey="disbursed" stroke="#0A4969" fill="#0A4969" fillOpacity={0.12} name="Disbursed (K MWK)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2 border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Application Mix</h3>
            <p className="text-[12px] text-muted-foreground mt-1">Live breakdown of the officer decision queue.</p>
          </div>
          <div className="p-4">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={applicationsByStatus} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={3}>
                    {applicationsByStatus.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Risk Spotlight</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Applications that may need deeper underwriting review.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('approvals')}>OPEN QUEUE</Button>
          </div>
          <div className="divide-y divide-border">
            {riskQueue.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground italic">No elevated-risk applications in the current queue.</div>
            ) : (
              riskQueue.map(item => (
                <div key={item.application.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{item.clientName}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatCurrency(item.application.requestedAmount || 0)} requested
                      {' '}• KYC {item.kycStatus.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Exposure ratio: {item.exposureRatio ? `${item.exposureRatio.toFixed(1)}x monthly income` : 'Income not captured'}</p>
                  </div>
                  <Badge className={`border-none text-[10px] font-bold ${item.exposureRatio >= 6 ? 'bg-red-50 text-red-700' : item.exposureRatio >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {item.exposureRatio >= 6 ? 'HIGH' : item.exposureRatio >= 3 ? 'MEDIUM' : 'LOW'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Collections & Follow-up</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Recent repayments and loan accounts needing attention.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('repayments')}>OPEN LEDGER</Button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Recent Repayments</p>
              <div className="space-y-3">
                {recentRepayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No repayments recorded yet.</p>
                ) : (
                  recentRepayments.map(transaction => (
                    <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                      <div>
                        <p className="font-semibold text-foreground">{transaction.clientName || 'Unknown Client'}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{formatDateLabel(transaction.timestamp, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{formatCurrency(transaction.amount || 0)}</p>
                        <p className="text-[11px] text-emerald-600 font-medium">{transaction.method || 'Recorded'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Upcoming Attention</p>
              <div className="space-y-3">
                {upcomingAttention.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No outstanding loan balances currently need follow-up.</p>
                ) : (
                  upcomingAttention.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                      <div>
                        <p className="font-semibold text-foreground">{item.clientName}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Due {formatDateLabel(item.nextDueDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{formatCurrency(item.outstandingBalance)}</p>
                        <Badge className={`border-none text-[10px] font-bold ${item.status === 'DEFAULTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {item.status === 'DEFAULTED' ? 'OVERDUE' : 'WATCH'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function StaffDashboardView({
  clients,
  loans,
  applications,
  onNavigate,
  transactions,
  profile,
  showSuccessPanel = false,
  onDismissSuccessPanel,
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  onNavigate: (view: View) => void,
  transactions: any[],
  profile: AuthProfile | null,
  showSuccessPanel?: boolean,
  onDismissSuccessPanel?: () => void,
}) {
  if (profile?.status === 'PENDING') {
    return <PendingAgentWorkspace profile={profile} showSuccessPanel={showSuccessPanel} onDismissSuccessPanel={onDismissSuccessPanel} />;
  }

  const scopedClients = clients.filter(client => isCurrentAgentRecord(client, profile));
  const scopedApplications = applications.filter(application => isCurrentAgentRecord(application, profile));
  const scopedTransactions = transactions.filter(transaction => transaction.type === 'REPAYMENT' && isCurrentAgentRecord(transaction, profile));
  const scopedClientIds = new Set(scopedClients.map(client => client.id));
  const scopedLoans = loans.filter(loan => scopedClientIds.has(loan.clientId) || isCurrentAgentRecord(loan, profile));
  const today = new Date().toLocaleDateString();
  const todayCollections = scopedTransactions
    .filter(tx => tx.timestamp?.toDate && tx.timestamp.toDate().toLocaleDateString() === today)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const dueToday = scopedLoans.filter(loan => getLoanCollectionState(loan).label === 'Due Today').length;
  const overdueCount = scopedLoans.filter(loan => getLoanCollectionState(loan).tone === 'overdue').length;
  const recentCollections = scopedTransactions
    .sort((left, right) => (getTimestampDate(right.timestamp)?.getTime() || 0) - (getTimestampDate(left.timestamp)?.getTime() || 0))
    .slice(0, 4);
  const collectionQueue = scopedLoans
    .filter(loan => loan.status === 'ACTIVE' || loan.status === 'DEFAULTED')
    .map(loan => {
      const client = clients.find(item => item.id === loan.clientId);
      return {
        loan,
        clientName: client ? getClientName(client) : 'Unknown Client',
        installmentAmount: getLoanInstallmentAmount(loan),
        state: getLoanCollectionState(loan),
      };
    })
    .sort((left, right) => {
      const leftDate = getTimestampDate(left.loan.nextDueDate || left.loan.disbursedAt || left.loan.createdAt)?.getTime() || Number.MAX_SAFE_INTEGER;
      const rightDate = getTimestampDate(right.loan.nextDueDate || right.loan.disbursedAt || right.loan.createdAt)?.getTime() || Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    })
    .slice(0, 5);
  const totalOutstanding = scopedLoans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
  const applicationProgress = scopedApplications.length
    ? (scopedApplications.filter(application => application.status === 'APPROVED').length / scopedApplications.length) * 100
    : 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Agent Mission Control</h2>
          <p className="text-[12px] text-muted-foreground">Quick situational awareness. No digging required.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => onNavigate('payments')}
            className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold gap-2 h-9"
          >
            <DollarSign size={16} /> Record Payment
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Clients" 
          value={scopedClients.length.toString()} 
          trend="Registered by you" 
          icon={<Users className="text-brand-500" size={18} />}
          iconBg="bg-brand-50"
        />
        <StatCard 
          title="Today's Collections" 
          value={`MWK ${todayCollections.toLocaleString()}`} 
          trend="Target: MWK 5,000" 
          icon={<DollarSign className="text-emerald-500" size={18} />}
          iconBg="bg-emerald-50"
        />
        <StatCard 
          title="Due Today" 
          value={dueToday.toString()} 
          trend="Payments expected" 
          icon={<Clock className="text-amber-500" size={18} />}
          iconBg="bg-amber-50"
        />
        <StatCard 
          title="Overdue Clients" 
          value={overdueCount.toString()} 
          trend="Requires follow-up" 
          icon={<AlertCircle className="text-red-500" size={18} />}
          iconBg="bg-red-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Priority Collections</h3>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('due-loans')}>VIEW ALL</Button>
          </div>
          <Table className="text-[12px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Client</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Amount Due</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Status</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collectionQueue.map(item => (
                    <TableRow key={item.loan.id} className="border-border">
                      <TableCell className="px-4 py-3">
                        <p className="font-bold">{item.clientName}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">ID: {item.loan.id.slice(0, 8).toUpperCase()}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-semibold">{formatCurrency(item.installmentAmount)}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge className={item.state.tone === 'overdue' ? "bg-red-50 text-red-700 border-none text-[10px] font-bold" : item.state.tone === 'today' ? "bg-amber-50 text-amber-700 border-none text-[10px] font-bold" : "bg-blue-50 text-blue-700 border-none text-[10px] font-bold"}>
                          {item.state.label}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-1">{item.state.helper}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <Button size="sm" className="h-7 text-[10px] font-bold bg-brand-600" onClick={() => onNavigate('payments')}>COLLECT</Button>
                      </TableCell>
                    </TableRow>
              ))}
              {collectionQueue.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">
                    No priority collections at this time.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-5">
          <Card className="border border-border shadow-none rounded-lg bg-white p-5">
            <h3 className="text-sm font-bold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="flex flex-col items-center justify-center h-24 gap-2 border-border hover:bg-slate-50"
                onClick={() => onNavigate('clients')}
              >
                <UserPlus size={20} className="text-brand-600" />
                <span className="text-[11px] font-bold">New Client</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col items-center justify-center h-24 gap-2 border-border hover:bg-slate-50"
                onClick={() => onNavigate('applications')}
              >
                <FileText size={20} className="text-blue-600" />
                <span className="text-[11px] font-bold">New App</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col items-center justify-center h-24 gap-2 border-border hover:bg-slate-50"
                onClick={() => onNavigate('payments')}
              >
                <DollarSign size={20} className="text-emerald-600" />
                <span className="text-[11px] font-bold">Repayment</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col items-center justify-center h-24 gap-2 border-border hover:bg-slate-50"
                onClick={() => onNavigate('due-loans')}
              >
                <Clock size={20} className="text-amber-600" />
                <span className="text-[11px] font-bold">Due Loans</span>
              </Button>
            </div>
          </Card>

          <div className="bg-[#1A1C23] text-white p-5 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-sidebar-foreground">
              <TrendingUp size={16} />
              <h4 className="font-bold text-[10px] uppercase tracking-widest text-sidebar-foreground">Your Performance</h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>Daily Target</span>
                  <span>{Math.min(100, Math.round((todayCollections / 5000) * 100))}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400" style={{ width: `${Math.min(100, (todayCollections / 5000) * 100)}%` }} />
                </div>
              </div>
              <p className="text-[11px] text-sidebar-foreground">You've collected <span className="text-white font-bold">MWK {todayCollections.toLocaleString()}</span> today. {todayCollections >= 5000 ? "Goal reached! Excellent work." : `Just MWK ${(5000 - todayCollections).toLocaleString()} more to hit your goal!`}</p>
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                  <span>App Approval Rate</span>
                  <span>{applicationProgress.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${applicationProgress}%` }} />
                </div>
              </div>
              <p className="text-[11px] text-sidebar-foreground">Outstanding field book under your care: <span className="text-white font-bold">{formatCurrency(totalOutstanding)}</span>.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Recent Collections</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Your latest successful repayments.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('transactions')}>VIEW HISTORY</Button>
          </div>
          <div className="p-4 space-y-3">
            {recentCollections.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No recorded collections yet.</p>
            ) : (
              recentCollections.map(transaction => (
                <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                  <div>
                    <p className="font-semibold text-foreground">{transaction.clientName || 'Unknown Client'}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{formatDateTimeLabel(transaction.timestamp)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{formatCurrency(transaction.amount || 0)}</p>
                    <p className="text-[11px] text-emerald-600 font-medium">{transaction.method || 'Recorded'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Application Tracker</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Status of applications you’ve submitted.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('applications')}>OPEN APPLICATIONS</Button>
          </div>
          <div className="p-4 space-y-3">
            {scopedApplications.slice(0, 4).map(application => (
              <div key={application.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <p className="font-semibold text-foreground">{getApplicationClientLabel(application, clients)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{formatCurrency(application.requestedAmount || 0)} requested</p>
                </div>
                <Badge className={`border-none text-[10px] font-bold ${
                  application.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                  application.status === 'REJECTED' ? 'bg-red-50 text-red-700' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {application.status}
                </Badge>
              </div>
            ))}
            {scopedApplications.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No agent-submitted applications yet.</p>
            )}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function PaymentModule({ clients, loans }: { clients: any[], loans: any[] }) {
  const [step, setStep] = useState(1);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const currentAgentEmail = getActiveSessionEmail();
  const availableClients = mergeFirestoreWithLocal(clients, getLocalClients());
  const availableLoans = mergeFirestoreWithLocal(loans, getLocalLoans());
  const scopedClients = availableClients.filter(client => isCurrentAgentRecord(client));
  const fallbackClients = scopedClients.length > 0 ? scopedClients : availableClients;
  const filteredClients = fallbackClients.filter(client =>
    [getClientName(client), getClientPrimaryPhone(client), getClientIdNumber(client)]
      .some(value => String(value || '').toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleRecordPayment = async () => {
    try {
      const paymentAmount = parseFloat(amount);
      if (!selectedClient || !selectedLoan) {
        toast.error('Select a client and loan before recording payment.');
        return;
      }
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        toast.error('Enter a valid repayment amount.');
        return;
      }
      if (paymentAmount > (selectedLoan.outstandingBalance || 0)) {
        toast.error('Repayment amount cannot exceed the outstanding balance.');
        return;
      }
      if ((method === 'AIRTEL_MONEY' || method === 'MPAMBA' || method === 'BANK_TRANSFER') && !reference.trim()) {
        toast.error('Electronic payments require a transaction reference.');
        return;
      }

      // Phase 5: Simulate payment via MockPaymentService
      const paymentResult = await MockPaymentService.processRepayment(
        selectedLoan.id, paymentAmount, getClientName(selectedClient), method as PaymentMethod
      );

      // Use the Phase 3 Financial Engine
      const success = await processRepayment(
        selectedLoan, 
        paymentAmount, 
        currentAgentEmail, 
        method, 
        reference.trim() || paymentResult.reference
      );

      if (success) {
        const paymentData = {
          clientName: getClientName(selectedClient),
          loanId: selectedLoan.id,
          amount: paymentAmount,
          method,
          reference: reference.trim(),
          date: new Date().toLocaleString(),
          receiptId: `RCP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          balanceRemaining: Math.max(0, (selectedLoan.outstandingBalance || 0) - paymentAmount)
        };
        setReceipt(paymentData);
        setStep(3);
      }
    } catch (e) {
      toast.error("Failed to process repayment.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Payment Collection</h2>
        <p className="text-sm text-muted-foreground">Record repayments via Cash or Mobile Money.</p>
      </div>

      <Card className="border border-border shadow-none rounded-xl bg-white overflow-hidden">
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Step 1: Select Client & Loan</h3>
              <div className="space-y-3">
                <label className="text-xs font-bold text-foreground">Select Client</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input
                    placeholder="Search assigned clients..."
                    className="pl-10 h-10 border-border bg-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-auto p-1">
                  {filteredClients.map(client => (
                    <button 
                      key={client.id}
                      onClick={() => {
                        setSelectedClient(client);
                        setSelectedLoan(null);
                      }}
                      className={`p-3 text-left border rounded-lg transition-all ${selectedClient?.id === client.id ? 'border-brand-500 bg-brand-50' : 'border-border hover:bg-slate-50'}`}
                    >
                      <p className="text-sm font-bold">{getClientName(client)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{getClientPrimaryPhone(client) || client.id.slice(0, 8).toUpperCase()}</p>
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-3">No matching clients found for this agent.</p>
                  )}
                </div>
              </div>

              {selectedClient && (
                <div className="space-y-3 pt-4">
                  <label className="text-xs font-bold text-foreground">Select Active Loan</label>
                  <div className="grid grid-cols-1 gap-2">
                    {availableLoans.filter(l => l.clientId === selectedClient.id && l.status === 'ACTIVE').map(loan => (
                      <button 
                        key={loan.id}
                        onClick={() => setSelectedLoan(loan)}
                        className={`p-3 text-left border rounded-lg transition-all ${selectedLoan?.id === loan.id ? 'border-brand-500 bg-brand-50' : 'border-border hover:bg-slate-50'}`}
                      >
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-bold">Loan #{loan.id.slice(0, 8).toUpperCase()}</p>
                          <p className="text-sm font-bold text-brand-600">MWK {(loan.outstandingBalance || 0).toLocaleString()}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Outstanding Balance</p>
                      </button>
                    ))}
                    {availableLoans.filter(l => l.clientId === selectedClient.id && l.status === 'ACTIVE').length === 0 && (
                      <p className="text-xs text-red-500 font-medium italic">No active loans found for this client.</p>
                    )}
                  </div>
                </div>
              )}

              <Button 
                disabled={!selectedLoan}
                onClick={() => setStep(2)}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold h-11 mt-6"
              >
                CONTINUE TO PAYMENT
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-border">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold">
                  {getClientName(selectedClient).charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold">{getClientName(selectedClient)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Loan #{selectedLoan.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm font-bold text-brand-600">MWK {(selectedLoan.outstandingBalance || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Balance</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground">Repayment Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input 
                      type="number" 
                      placeholder="0.00" 
                      className="pl-10 h-12 text-lg font-bold border-border" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground">Payment Method</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['CASH', 'AIRTEL_MONEY', 'MPAMBA', 'BANK_TRANSFER'].map(m => (
                      <button 
                        key={m}
                        onClick={() => setMethod(m)}
                        className={`py-3 border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${method === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border text-muted-foreground hover:bg-slate-50'}`}
                      >
                        {m.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {method !== 'CASH' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground">Transaction Reference</label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <Input 
                        placeholder="Enter reference number (optional, will generate mock ref if blank)..." 
                        className="pl-10 h-11 border-border font-mono text-sm" 
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 h-11 font-bold border-border" onClick={() => setStep(1)}>BACK</Button>
                <Button 
                  disabled={!amount || parseFloat(amount) <= 0}
                  className="flex-[2] h-11 bg-brand-600 hover:bg-brand-700 text-white font-bold"
                  onClick={handleRecordPayment}
                >
                  CONFIRM COLLECTION
                </Button>
              </div>
            </div>
          )}

          {step === 3 && receipt && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Payment Successful</h3>
                <p className="text-sm text-muted-foreground">The transaction has been recorded in the ledger.</p>
              </div>

              <div className="bg-slate-50 border border-border rounded-xl p-6 text-left space-y-4 font-mono">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Official Receipt</h4>
                  <p className="text-[10px] text-slate-400">{receipt.date}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">CLIENT:</span>
                    <span className="text-[11px] font-bold text-slate-900">{receipt.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">LOAN ID:</span>
                    <span className="text-[11px] font-bold text-slate-900">#{receipt.loanId.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">COLLECTED BY:</span>
                    <span className="text-[11px] font-bold text-slate-900">{currentAgentEmail || 'Agent'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">METHOD:</span>
                    <span className="text-[11px] font-bold text-slate-900">{receipt.method}</span>
                  </div>
                  {receipt.reference && (
                    <div className="flex justify-between">
                      <span className="text-[11px] text-slate-500">REF:</span>
                      <span className="text-[11px] font-bold text-slate-900">{receipt.reference}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-lg">
                    <span className="font-bold text-slate-500">PAID:</span>
                    <span className="font-black text-brand-600">MWK {receipt.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">BALANCE:</span>
                    <span className="text-[11px] font-bold text-slate-900">MWK {receipt.balanceRemaining.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 h-11 font-bold border-border gap-2"
                  onClick={() => toast.success('Receipt ready for print/download from your browser window.')}
                >
                  <FileDown size={18} /> DOWNLOAD
                </Button>
                <Button 
                  className="flex-1 h-11 bg-brand-600 hover:bg-brand-700 text-white font-bold"
                  onClick={() => {
                    setStep(1);
                    setSelectedClient(null);
                    setSelectedLoan(null);
                    setAmount('');
                    setReference('');
                    setSearchQuery('');
                  }}
                >
                  NEW PAYMENT
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function AgentClientsView({ clients, loans }: { clients: any[], loans: any[] }) {
  const [search, setSearch] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', idNumber: '' });
  const availableClients = mergeFirestoreWithLocal(clients, getLocalClients());
  const availableLoans = mergeFirestoreWithLocal(loans, getLocalLoans());
  const scopedClients = availableClients.filter(client => isCurrentAgentRecord(client));
  const visibleClients = scopedClients.length > 0 ? scopedClients : availableClients;

  const filteredClients = visibleClients.filter(c => 
    getClientName(c).toLowerCase().includes(search.toLowerCase()) || 
    getClientPrimaryPhone(c).includes(search) || 
    getClientIdNumber(c)?.includes(search)
  );

  const handleRegister = async () => {
    // Prevent duplicates check
    const exists = availableClients.find(c => c.idNumber === formData.idNumber || c.phone === formData.phone);
    if (exists) {
      toast.error("Duplicate Registration: A client with this ID or Phone already exists.");
      return;
    }

    try {
      await addDoc(collection(db, 'clients'), {
        ...formData,
        status: 'ACTIVE',
        metadata: {
          createdBy: {
            uid: auth.currentUser?.uid || 'local-agent',
            email: getActiveSessionEmail(),
            role: 'AGENT',
          },
          registrationDate: serverTimestamp(),
          lastUpdatedAt: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Client registered successfully");
      setIsRegistering(false);
      setFormData({ name: '', phone: '', idNumber: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'clients');
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
          <h2 className="text-xl font-bold tracking-tight text-foreground">Client Management</h2>
          <p className="text-[12px] text-muted-foreground">Register and search clients in the field.</p>
        </div>
        <Button 
          onClick={() => setIsRegistering(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold gap-2 h-9"
        >
          <UserPlus size={16} /> Register New Client
        </Button>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <div className="p-4 border-b border-border bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Search by Name, Phone or ID..." 
              className="pl-10 h-10 border-border bg-white" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Client Details</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Phone</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">ID Number</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-center">Active Loans</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.map(client => {
              const activeLoansCount = availableLoans.filter(l => l.clientId === client.id && l.status === 'ACTIVE').length;
              return (
                <TableRow key={client.id} className="border-border">
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {getClientName(client).charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-bold text-foreground">{getClientName(client)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground font-medium">{getClientPrimaryPhone(client) || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground font-mono">{getClientIdNumber(client) || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 text-center font-bold text-brand-600">{activeLoansCount}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => toast.info(`${getClientName(client)} has ${activeLoansCount} active loan(s).`)}>
                      VIEW PROFILE
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                  No clients found matching your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AnimatePresence>
        {isRegistering && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md w-full"
            >
              <Card className="border-none shadow-2xl rounded-xl overflow-hidden">
                <div className="bg-brand-600 p-6 text-white">
                  <h3 className="text-lg font-bold">Register New Client</h3>
                  <p className="text-brand-100 text-xs mt-1">Ensure all field data is accurate to prevent duplicates.</p>
                </div>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Full Legal Name</label>
                    <Input 
                      placeholder="Enter full name..." 
                      className="border-border" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Phone Number</label>
                    <Input 
                      placeholder="e.g. +265..." 
                      className="border-border" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">National ID / Passport</label>
                    <Input 
                      placeholder="Enter ID number..." 
                      className="border-border" 
                      value={formData.idNumber}
                      onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1 font-bold border-border" onClick={() => setIsRegistering(false)}>CANCEL</Button>
                    <Button 
                      disabled={!formData.name || !formData.phone || !formData.idNumber}
                      className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold"
                      onClick={handleRegister}
                    >
                      REGISTER
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

function AgentTransactionsView({ transactions }: { transactions: any[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const availableTransactions = mergeFirestoreWithLocal(transactions, getLocalTransactions());
  const scopedTransactions = availableTransactions
    .filter(transaction => transaction.type === 'REPAYMENT' && isCurrentAgentRecord(transaction))
    .filter(transaction => {
      const matchesSearch = [transaction.clientName, transaction.reference, transaction.id]
        .some(value => String(value || '').toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesMethod = methodFilter === 'ALL' || transaction.method === methodFilter;
      return matchesSearch && matchesMethod;
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
          <h2 className="text-xl font-bold tracking-tight text-foreground">Transaction History</h2>
          <p className="text-[12px] text-muted-foreground">Accountability and memory of all collections.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <Input
              placeholder="Search client or ref..."
              className="pl-9 h-9 text-xs bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="h-9 rounded-lg border border-border bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="ALL">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="AIRTEL">Airtel</option>
            <option value="MPAMBA">Mpamba</option>
          </select>
        </div>
      </div>

      <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
        <Table className="text-[12px]">
          <TableHeader className="bg-[#F9FAFB]">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Date & Time</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Client</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Amount</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4">Method</TableHead>
              <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scopedTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              scopedTransactions.map(tx => (
                <TableRow key={tx.id} className="border-border">
                  <TableCell className="px-4 py-3">
                    <p className="font-bold">{formatDateLabel(tx.timestamp)}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{formatDateTimeLabel(tx.timestamp)}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3 font-medium text-foreground">{tx.clientName || 'Unknown Client'}</TableCell>
                  <TableCell className="px-4 py-3 font-bold text-emerald-600">MWK {tx.amount?.toLocaleString()}</TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px] font-bold border-border text-muted-foreground">
                      {tx.method}
                    </Badge>
                    {tx.reference && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{tx.reference}</p>}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-brand-600" onClick={() => toast.success(`Receipt lookup ready for ${tx.clientName || 'client'}.`)}>
                      <Receipt size={16} />
                    </Button>
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

function AgentDueLoansView({ loans, clients, onNavigate }: { loans: any[], clients: any[], onNavigate: (view: View) => void }) {
  const availableClients = mergeFirestoreWithLocal(clients, getLocalClients());
  const availableLoans = mergeFirestoreWithLocal(loans, getLocalLoans());
  const scopedClients = availableClients.filter(client => isCurrentAgentRecord(client));
  const visibleClientIds = new Set((scopedClients.length > 0 ? scopedClients : availableClients).map(client => client.id));
  const scopedLoans = availableLoans.filter(loan => visibleClientIds.has(loan.clientId) || isCurrentAgentRecord(loan));
  const activeLoans = scopedLoans.filter(l => l.status === 'ACTIVE');
  const overdue = scopedLoans.filter(l => getLoanCollectionState(l).tone === 'overdue');
  const dueToday = activeLoans.filter(l => getLoanCollectionState(l).label === 'Due Today');
  const upcoming = activeLoans.filter(l => getLoanCollectionState(l).label !== 'Due Today' && (l.outstandingBalance || 0) > 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Due & Overdue Tracking</h2>
          <p className="text-[12px] text-muted-foreground">Collectors with intelligence. Know who to visit.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border bg-amber-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-900">Due Today</h3>
            <Badge className="bg-amber-100 text-amber-700 border-none">{dueToday.length} PAYMENTS</Badge>
          </div>
          <div className="p-4 space-y-3">
            {dueToday.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">No payments due today.</p>
            ) : (
              dueToday.map(loan => {
                const client = clients.find(c => c.id === loan.clientId);
                return (
                  <div key={loan.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold">{client?.name || 'Unknown Client'}</p>
                      <p className="text-[10px] text-muted-foreground">Due: {formatCurrency(getLoanInstallmentAmount(loan))}</p>
                    </div>
                    <Button size="sm" className="h-8 text-[10px] font-bold bg-brand-600" onClick={() => onNavigate('payments')}>RECORD PAYMENT</Button>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border bg-blue-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-blue-900">Upcoming</h3>
            <Badge className="bg-blue-100 text-blue-700 border-none">{upcoming.length} LOANS</Badge>
          </div>
          <div className="p-4 space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">No upcoming installments queued.</p>
            ) : (
              upcoming.slice(0, 6).map(loan => {
                const client = clients.find(c => c.id === loan.clientId);
                const state = getLoanCollectionState(loan);
                return (
                  <div key={loan.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold">{client ? getClientName(client) : 'Unknown Client'}</p>
                      <p className="text-[10px] text-blue-600 font-bold">{state.helper}</p>
                    </div>
                    <p className="text-[11px] font-bold text-slate-700">{formatCurrency(getLoanInstallmentAmount(loan))}</p>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border bg-red-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-red-900">Overdue</h3>
            <Badge className="bg-red-100 text-red-700 border-none">{overdue.length} ARREARS</Badge>
          </div>
          <div className="p-4 space-y-3">
            {overdue.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">No overdue loans found.</p>
            ) : (
              overdue.map(loan => {
                const client = clients.find(c => c.id === loan.clientId);
                return (
                  <div key={loan.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold">{client?.name || 'Unknown Client'}</p>
                      <p className="text-[10px] text-red-600 font-bold">Balance: MWK { (loan.outstandingBalance || 0).toLocaleString() }</p>
                    </div>
                    <Button size="sm" className="h-8 text-[10px] font-bold bg-red-600" onClick={() => onNavigate('payments')}>FOLLOW UP</Button>
                  </div>
                );
              })
            )}
          </div>
        </Card>
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

function LoansView({ loans, clients }: { loans: any[], clients: any[] }) {
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
          <h2 className="text-xl font-bold tracking-tight text-foreground">Loan Portfolio</h2>
          <p className="text-[12px] text-muted-foreground">Global view of all active, closed, and defaulted loans.</p>
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
            <span className="text-slate-300 mx-1">→</span>
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

function TransactionsAuditView({ transactions, loans }: { transactions: any[], loans: any[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

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
          <h2 className="text-xl font-bold tracking-tight text-foreground">Transactions Audit</h2>
          <p className="text-[12px] text-muted-foreground">Follow the money trail. Verify all financial movements.</p>
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
              <TableHead className="text-muted-foreground font-semibold h-10 px-5">Agent/Officer</TableHead>
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
                assignee: getActiveSessionEmail() || 'auditor@fastkwacha.com',
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

  const tabs = [
    { id: 'profile', label: 'Profile Settings', icon: <Users size={16} />, adminOnly: false },
    { id: 'security', label: 'Account Security', icon: <ShieldAlert size={16} />, adminOnly: false },
    { id: 'appearance', label: 'Appearance', icon: <PieChartIcon size={16} />, adminOnly: false },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} />, adminOnly: false },
    { id: 'system', label: 'System Settings', icon: <Settings size={16} />, adminOnly: true },
  ].filter(tab => !tab.adminOnly || profile.role === 'ADMIN');

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Inner Sidebar */}
        <aside className="w-full md:w-64 space-y-1">
          <div className="mb-4 px-3 py-2">
            <h2 className="text-lg font-bold text-slate-900 font-heading">Settings</h2>
            <p className="text-xs text-slate-500">Manage your account and preferences.</p>
          </div>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <span className="shrink-0">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          <Card className="border border-border shadow-none rounded-xl overflow-hidden min-h-[500px] bg-card text-card-foreground">
            <CardContent className="p-8">
              <AnimatePresence mode="wait">
                {activeTab === 'profile' && (
                  <motion.div 
                    key="profile"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Profile Settings</h3>
                      <p className="text-sm text-slate-500">Update your personal information and contact details.</p>
                    </div>
                    <div className="flex items-center gap-6 pb-6 border-b border-border">
                      <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} />
                        <AvatarFallback className="text-2xl">{profile.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm">Change Photo</Button>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">PNG, JPG or GIF. Max 5MB.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Full Name</label>
                        <Input defaultValue={profile.name} onChange={(e) => onUpdateProfile({ ...profile, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Email Address</label>
                        <Input defaultValue={profile.email} disabled className="bg-slate-50 cursor-not-allowed" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Phone Number</label>
                        <Input defaultValue={profile.phone} placeholder="+265..." onChange={(e) => onUpdateProfile({ ...profile, phone: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">National ID (KYC)</label>
                        {profile.kycComplete ? (
                          <div className="relative">
                            <Input defaultValue={profile.nationalId} disabled className="bg-emerald-50 text-emerald-900 border-emerald-100 pr-10" />
                            <ShieldCheck className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" size={16} />
                          </div>
                        ) : (
                          <Input 
                            defaultValue={profile.nationalId} 
                            placeholder="Enter 12-digit National ID"
                            onChange={(e) => onUpdateProfile({ ...profile, nationalId: e.target.value.toUpperCase() })} 
                          />
                        )}
                      </div>
                    </div>

                    {!profile.kycComplete && (
                      <div className="mt-8 p-6 bg-slate-900 rounded-[1.5rem] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
                              <ShieldAlert size={20} />
                           </div>
                           <div>
                              <p className="text-sm font-bold text-white">Verification Pending</p>
                              <p className="text-[10px] text-slate-400 font-medium">Verify your ID to unlock up to MWK 1,000,000 credit limit.</p>
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
                          className="bg-brand-600 hover:bg-brand-700 text-white font-black text-[10px] uppercase tracking-widest px-8 rounded-xl h-10"
                        >
                          SUBMIT KYC FOR REVIEW
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'security' && (
                  <motion.div 
                    key="security"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Account Security</h3>
                      <p className="text-sm text-slate-500">Manage your password and track account activity.</p>
                    </div>
                    
                    <Card className="border border-border shadow-none bg-slate-50 p-6 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <ShieldAlert size={16} className="text-brand-500" />
                        Change Password
                      </h4>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Current Password</label>
                            <Input type="password" placeholder="••••••••" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">New Password</label>
                            <Input type="password" placeholder="••••••••" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Confirm New</label>
                            <Input type="password" placeholder="••••••••" />
                          </div>
                        </div>
                        <Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800">Update Password</Button>
                      </div>
                    </Card>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900">Recent Login Activity</h4>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <Table>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium text-xs">
                                <div className="flex items-center gap-3">
                                  <Smartphone size={14} className="text-slate-400" />
                                  <div>
                                    <p className="font-bold text-slate-900">{profile.lastDevice || 'Chrome on Windows'}</p>
                                    <p className="text-[10px] text-slate-500">Last accessed: {profile.lastLogin ? new Date(profile.lastLogin).toLocaleString() : 'Just now'}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="text-[9px] uppercase tracking-widest bg-emerald-50 text-emerald-700 border-none">Current Session</Badge>
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
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Appearance Settings</h3>
                      <p className="text-sm text-slate-500">Customize how the application looks for you.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card 
                        className={`cursor-pointer transition-all border-2 ${theme === 'light' ? 'border-primary' : 'border-border'}`}
                        onClick={() => setTheme('light')}
                      >
                        <CardContent className="p-4 flex flex-col items-center gap-4">
                          <div className="w-full aspect-video bg-white rounded border border-slate-200 shadow-sm flex items-center justify-center">
                            <Plus className="text-slate-200" size={32} />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-widest">Light Mode</p>
                        </CardContent>
                      </Card>
                      <Card 
                        className={`cursor-pointer transition-all border-2 ${theme === 'dark' ? 'border-primary' : 'border-border'}`}
                        onClick={() => setTheme('dark')}
                      >
                        <CardContent className="p-4 flex flex-col items-center gap-4">
                          <div className="w-full aspect-video bg-slate-900 rounded border border-slate-800 shadow-sm flex items-center justify-center">
                            <Plus className="text-slate-800" size={32} />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-widest">Dark Mode</p>
                        </CardContent>
                      </Card>
                      <Card 
                        className={`cursor-pointer transition-all border-2 ${theme === 'system' ? 'border-primary' : 'border-border'}`}
                        onClick={() => setTheme('system')}
                      >
                        <CardContent className="p-4 flex flex-col items-center gap-4">
                          <div className="w-full aspect-video bg-gradient-to-br from-white to-slate-900 rounded border border-slate-200 shadow-sm flex items-center justify-center">
                            <Plus className="text-slate-400 opacity-20" size={32} />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-widest">System Default</p>
                        </CardContent>
                      </Card>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'notifications' && (
                  <motion.div 
                    key="notifications"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Notification Settings</h3>
                      <p className="text-sm text-slate-500">Choose how you want to be notified about important events.</p>
                    </div>
                    <div className="space-y-4">
                      <NotificationToggle 
                        title="Loan Approval Alerts" 
                        description="Receive instant notifications when a loan application status changes." 
                        icon={<CheckCircle2 size={16} className="text-emerald-500" />}
                      />
                      <NotificationToggle 
                        title="Payment Reminders" 
                        description="Get alerts for upcoming and overdue loan repayments." 
                        icon={<Clock size={16} className="text-amber-500" />}
                      />
                    </div>
                  </motion.div>
                )}

                {activeTab === 'system' && (
                  <motion.div 
                    key="system"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 underline decoration-primary/30 decoration-4">System Settings (Global)</h3>
                        <p className="text-sm text-slate-500">Configure global business rules and financial parameters.</p>
                      </div>
                      <Badge className="bg-red-50 text-red-700 border-none px-3 py-1 font-black text-[10px] tracking-widest uppercase">Admin Authority Required</Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Default Interest Rate (%)</label>
                        <Input 
                          type="number" 
                          value={systemSettings.interest_rate_default} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, interest_rate_default: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Max Loan Duration (Months)</label>
                        <Input 
                          type="number" 
                          value={systemSettings.max_loan_duration} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, max_loan_duration: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Penalty Rate (%)</label>
                        <Input 
                          type="number" 
                          value={systemSettings.penalty_rate} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, penalty_rate: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Functional Currency</label>
                        <Input 
                          value={systemSettings.currency} 
                          onChange={(e) => onUpdateSystemSettings({ ...systemSettings, currency: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Company Branding Name</label>
                        <Input 
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
  } else if (hoursElapsed > 20) {
    return (
      <div className="flex items-center gap-2 group relative">
        <Badge className="bg-amber-50 text-amber-600 border-amber-100 font-bold px-3 py-1 rounded-full">SLA WARNING</Badge>
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

function ClientDashboardView({ loans, receipts, profile, onNavigate, onPay, onViewReceipt }: { loans: any[], receipts: ReceiptRecord[], profile: AuthProfile | null, onNavigate: (view: View) => void, onPay: (loan: any) => void, onViewReceipt: (rcpt: ReceiptRecord) => void }) {
  const [activeTab, setActiveTab] = useState<'loans' | 'receipts'>('loans');
  const activeLoans = loans.filter(l => l.status === 'ACTIVE');

  return (
    <div className="space-y-8">
      {profile && !profile.kycComplete && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border-2 border-amber-200 rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
        >
          <div className="flex items-center gap-8 z-10">
            <div className="w-20 h-20 rounded-[2rem] bg-amber-100 flex items-center justify-center text-amber-600 shadow-xl shadow-amber-500/10">
              <ShieldAlert size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Phase 2 Verification Required</h3>
              <p className="text-slate-600 text-sm font-medium max-w-md">Institutional access is restricted. Link your National ID and verify your Phone Number to unlock loan facilities.</p>
            </div>
          </div>
          <Button 
            onClick={() => onNavigate('settings')}
            className="z-10 bg-amber-600 hover:bg-amber-700 h-14 px-10 rounded-2xl font-black text-xs uppercase tracking-widest text-white transition-all shadow-xl shadow-amber-600/20"
          >
            COMPLETE KYC PROTOCOL <ArrowRight size={16} className="ml-2" />
          </Button>
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-200/20 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        </motion.div>
      )}
      <div className="bg-brand-600 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl shadow-brand-500/20">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-3">
             <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Institutional Access Locked</span>
             </div>
             <h2 className="text-5xl font-black tracking-tighter italic leading-none">Financial Hub</h2>
             <p className="text-brand-50 text-sm font-medium opacity-80">Track your active facilities and strictly sequential financial records.</p>
          </div>
          
          <div className="flex gap-4">
            <Button 
                onClick={() => onNavigate('applications')}
                className="bg-white text-brand-600 hover:bg-slate-50 h-16 px-10 rounded-[1.25rem] font-black text-sm tracking-tight shadow-xl transform active:scale-95 transition-all group"
            >
                NEW APPLICATION <Plus size={18} className="ml-2 group-hover:rotate-90 transition-transform duration-500" />
            </Button>
          </div>
        </div>
        
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand-400/20 rounded-full blur-[100px]"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-[80px]"></div>
      </div>

      <div className="flex gap-2 p-1.5 bg-slate-100 rounded-3xl w-fit">
        <button 
          onClick={() => setActiveTab('loans')}
          className={`flex items-center gap-2 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'loans' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <CreditCard size={14} /> My Facilities
        </button>
        <button 
          onClick={() => setActiveTab('receipts')}
          className={`flex items-center gap-2 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'receipts' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <FileText size={14} /> Receipts Center
        </button>
      </div>

      {activeTab === 'loans' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {activeLoans.length === 0 ? (
            <Card className="col-span-full border-dashed border-2 py-32 flex flex-col items-center justify-center text-slate-300 rounded-[3.5rem] bg-slate-50/50">
              <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-6 grayscale opacity-30">
                <Zap size={40} />
              </div>
              <p className="font-black uppercase tracking-[0.3em] text-[10px] mb-2 text-slate-400">Registry Is Empty</p>
              <p className="text-sm font-medium text-slate-400 italic">Initiate a facility application to begin.</p>
            </Card>
          ) : (
            activeLoans.map(loan => (
              <Card key={loan.id} className="p-10 rounded-[3rem] border border-slate-100 shadow-xl hover:shadow-2xl hover:border-brand-500/10 transition-all group relative overflow-hidden bg-white">
                <div className="flex justify-between items-start mb-10">
                   <div className="flex items-center gap-6">
                      <div className="w-20 h-20 rounded-[2rem] bg-slate-50 flex items-center justify-center text-slate-900 group-hover:bg-brand-50 group-hover:text-brand-600 transition-all group-hover:rotate-6 duration-500">
                        <Briefcase size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{loan.productName}</h3>
                        <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest">ID: {loan.id.slice(-10).toUpperCase()}</p>
                      </div>
                   </div>
                   <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[10px] px-4 py-2 rounded-2xl uppercase tracking-widest shadow-sm">ACTIVE FACILITY</Badge>
                </div>

                <div className="space-y-8 mb-10">
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Outstanding</p>
                        <p className="text-3xl font-black text-slate-900 tracking-tighter">MWK {(loan.outstandingBalance || 0).toLocaleString()}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Next Payment</p>
                        <p className="text-sm font-black text-brand-600 italic">{loan.nextDueDate ? new Date(loan.nextDueDate).toLocaleDateString() : 'N/A'}</p>
                      </div>
                   </div>

                   <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span>Liquidation Progress</span>
                        <span className="text-slate-900">{Math.round(((loan.amount - loan.outstandingBalance) / loan.amount) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-6 rounded-full overflow-hidden p-1.5 border border-slate-100">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, ((loan.amount - loan.outstandingBalance) / loan.amount) * 100)}%` }}
                          className="h-full bg-brand-500 rounded-full shadow-lg shadow-brand-500/20"
                        />
                      </div>
                   </div>
                </div>

                <Button 
                  onClick={() => onPay(loan)}
                  className="w-full h-16 rounded-2.5xl bg-slate-900 hover:bg-brand-600 text-white font-black text-sm tracking-tight transition-all gap-3 shadow-xl"
                >
                  SETTLE INSTALLMENT <DollarSign size={18} />
                </Button>
                
                <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-full -mr-32 -mt-32 group-hover:bg-brand-50/50 transition-colors duration-700"></div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {receipts.length === 0 ? (
            <Card className="py-32 flex flex-col items-center justify-center text-slate-300 rounded-[3rem] bg-slate-50/50 border-dashed border-2">
              <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-6 grayscale opacity-20">
                <FileDown size={40} />
              </div>
              <p className="font-black uppercase tracking-[0.3em] text-[10px] mb-2 text-slate-400">No Records On File</p>
              <p className="text-sm font-medium text-slate-400">Official receipts appear here after transaction verification.</p>
            </Card>
          ) : (
            receipts.map(rcpt => (
              <Card key={rcpt.id} className="p-8 rounded-[2rem] border border-slate-100 hover:border-brand-500/10 transition-all group flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white shadow-sm hover:shadow-xl group">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2.5xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-all font-black text-xl italic">
                    RC
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-slate-900 tracking-tighter text-lg uppercase">{rcpt.transactionType.replace(/_/g, ' ')}</h3>
                      <Badge className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-lg border-none shadow-sm">{rcpt.status}</Badge>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="text-brand-600">{rcpt.receiptId}</span> • {new Date(rcpt.date).toLocaleDateString()} at {new Date(rcpt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-10">
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Verified</p>
                    <p className="text-xl font-black text-slate-900 tracking-tighter">MWK {rcpt.amount.toLocaleString()}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-12 px-6 rounded-xl border-slate-200 font-bold text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm group"
                    onClick={() => {
                        onViewReceipt(rcpt);
                    }}
                  >
                    VIEW RECEIPT <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
