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
  Bell, 
  Plus,
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
  BarChart3
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
  Legend
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

// Firebase
import { auth, db } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  User,
  createUserWithEmailAndPassword
} from 'firebase/auth';
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
  setDoc
} from 'firebase/firestore';

// Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
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
type View = 'dashboard' | 'clients' | 'applications' | 'approvals' | 'repayments' | 'settings' | 'payments' | 'transactions' | 'due-loans' | 'users' | 'loan-products' | 'loans' | 'reports' | 'audit-logs' | 'transactions-audit' | 'anomalies' | 'user-activity' | 'cases';
type UserRole = 'ADMIN' | 'OFFICER' | 'AGENT' | 'AUDITOR';
type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

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
  createdAt?: any;
}

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
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('AGENT');
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [localSessionProfile, setLocalSessionProfile] = useState<AuthProfile | null>(() => readStoredLocalSessionProfile());
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
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
  const [isRegisteringAgent, setIsRegisteringAgent] = useState(false);
  const registrationHydrationRef = React.useRef<string | null>(null);
  const [showRegistrationSuccessPanel, setShowRegistrationSuccessPanel] = useState(false);
  const sessionProfile = authProfile || localSessionProfile;
  const isPendingAgent = sessionProfile?.role === 'AGENT' && sessionProfile.status === 'PENDING';

  const predefinedRoleAccounts: Record<string, { role: UserRole; password: string; name: string }> = {
    'admin@fastkwacha.com': { role: 'ADMIN', password: 'admin123', name: 'System Admin' },
    'officer@fastkwacha.com': { role: 'OFFICER', password: 'officer123', name: 'Loan Officer' },
    'auditor@fastkwacha.com': { role: 'AUDITOR', password: 'auditor123', name: 'Compliance Auditor' },
  };

  const fetchUserProfileByEmail = async (emailAddress: string) => {
    const q = query(collection(db, 'users'), where('email', '==', normalizeEmail(emailAddress)), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const profileDoc = snapshot.docs[0];
    const data = profileDoc.data() as any;
    return { id: profileDoc.id, ...data, status: normalizeUserStatus(data.status) } as AuthProfile;
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

  useEffect(() => {
    if (!user && !localSessionProfile) return;

    const qClients = query(collection(db, 'clients'), orderBy('createdAt', 'desc'), limit(50));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    const qLoans = query(collection(db, 'loans'), orderBy('disbursedAt', 'desc'), limit(50));
    const unsubLoans = onSnapshot(qLoans, (snapshot) => {
      setLoans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'loans');
    });

    const qApps = query(collection(db, 'applications'), orderBy('createdAt', 'desc'), limit(50));
    const unsubApps = onSnapshot(qApps, (snapshot) => {
      setApplications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'applications');
    });

    const qTrans = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'transactions');
    });

    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return { id: doc.id, ...data, status: normalizeUserStatus(data.status) };
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    // Profile listener for real-time activation
    let unsubProfile = () => {};
    const profileId = authProfile?.id || localSessionProfile?.id;
    if (profileId) {
      unsubProfile = onSnapshot(doc(db, 'users', profileId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          const updatedProfile = { id: docSnap.id, ...data, status: normalizeUserStatus(data.status) } as AuthProfile;
          
          if (authProfile) {
            setAuthProfile(updatedProfile);
          } else if (localSessionProfile) {
            // Only update if something actually changed to avoid infinite loops with the other effect
            if (updatedProfile.status !== localSessionProfile.status || updatedProfile.role !== localSessionProfile.role) {
              setLocalSessionProfile(updatedProfile);
            }
          }
        }
      });
    }

    return () => {
      unsubClients();
      unsubLoans();
      unsubApps();
      unsubTrans();
      unsubUsers();
      unsubProfile();
    };
  }, [user, localSessionProfile]);

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
      await updateDoc(doc(db, 'users', targetUser.id), {
        status,
        updatedAt: serverTimestamp()
      });
      toast.success(`User status updated to ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.id}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setPendingEmailPrompt(null);

    const now = Date.now();
    if (loginAttempts.lockedUntil > now) {
      const waitMinutes = Math.ceil((loginAttempts.lockedUntil - now) / 60000);
      toast.error(`Too many failed login attempts. Try again in ${waitMinutes} minute(s).`);
      return;
    }

    try {
      const normalizedEmail = normalizeEmail(email);
      const predefinedAccount = predefinedRoleAccounts[normalizedEmail];
      if (predefinedAccount) {
        if (password !== predefinedAccount.password) {
          throw { code: 'auth/invalid-login-credentials', message: 'Invalid email or password.' };
        }

        const profile: AuthProfile = {
          id: `local-${predefinedAccount.role.toLowerCase()}`,
          uid: `local-${predefinedAccount.role.toLowerCase()}`,
          name: predefinedAccount.name,
          email: normalizedEmail,
          role: predefinedAccount.role,
          status: 'ACTIVE',
        };
        setLocalSessionProfile(profile);
        setAuthProfile(null);
        setRole(predefinedAccount.role);
        setCurrentView('dashboard');
        setLoginAttempts({ count: 0, lockedUntil: 0 });
        toast.success(`Welcome back, ${profile.name} (${profile.role})`);
        return;
      }

      const profile = await fetchUserProfileByEmail(normalizedEmail);
      if (!profile) {
        setPendingEmailPrompt(normalizedEmail);
        toast.info('Account not found. You can register as an agent below.');
        return;
      }

      if (profile.role !== 'AGENT') {
        toast.error('Use the predefined role accounts for admin, officer, and auditor access.');
        return;
      }
      if ((profile as any).demoPassword !== password) {
        throw { code: 'auth/invalid-login-credentials', message: 'Invalid email or password.' };
      }

      setLocalSessionProfile(profile);
      setAuthProfile(null);
      setRole(profile.role);
      setCurrentView('dashboard');
      setLoginAttempts({ count: 0, lockedUntil: 0 });
      toast.success(`Welcome back, ${profile.name || 'Agent'} (${profile.role})`);
    } catch (error: any) {
      console.error("Login failed", error);
      setLoginError(error.code);

      const nextCount = loginAttempts.count + 1;
      const lockedUntil = nextCount >= 5 ? now + (10 * 60 * 1000) : 0;
      setLoginAttempts({ count: lockedUntil ? 0 : nextCount, lockedUntil });

      if (error.code === 'auth/operation-not-allowed') {
        toast.error("Email/Password login is disabled in Firebase. Enable it in Authentication -> Sign-in method.", { duration: 10000 });
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
        toast.error(lockedUntil ? 'Too many failed attempts. Login has been temporarily locked.' : 'Invalid email or password.');
      } else {
        toast.error(`Authentication Failed: ${error.message}`);
      }
    }
  };

  const handleAgentRegistration = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (isRegisteringAgent) return;
    setIsRegisteringAgent(true);
    const normalizedEmail = normalizeEmail(registrationData.email);

    if (!registrationData.fullName || !normalizedEmail || !registrationData.phone || !registrationData.nationalId || !registrationData.address || !registrationData.password || !registrationData.confirmPassword) {
      toast.error('Complete all required registration fields.');
      setIsRegisteringAgent(false);
      return;
    }
    if (!PASSWORD_RULE.test(registrationData.password)) {
      toast.error('Password must be at least 8 characters and include letters and numbers.');
      setIsRegisteringAgent(false);
      return;
    }
    if (registrationData.password !== registrationData.confirmPassword) {
      toast.error('Passwords do not match.');
      setIsRegisteringAgent(false);
      return;
    }
    if (!PHONE_REGEX.test(formatPhoneDisplay(registrationData.phone))) {
      toast.error('Enter a valid Malawi phone number.');
      setIsRegisteringAgent(false);
      return;
    }
    if (!ID_NUMBER_REGEX.test(registrationData.nationalId.trim().toUpperCase())) {
      toast.error('Enter a valid National ID number.');
      setIsRegisteringAgent(false);
      return;
    }

    console.log('Registration started for email:', normalizedEmail);
    try {
      console.log('Checking for existing email...');
      const existingEmail = await fetchUserProfileByEmail(normalizedEmail);
      if (existingEmail) {
        console.log('Email exists');
        toast.error('Email already registered.');
        setIsRegisteringAgent(false);
        return;
      }
      
      console.log('Checking for duplicate National ID:', registrationData.nationalId);
      const duplicateIdQuery = query(collection(db, 'users'), where('nationalId', '==', registrationData.nationalId.trim().toUpperCase()), limit(1));
      const duplicateIdSnap = await getDocs(duplicateIdQuery);
      if (!duplicateIdSnap.empty) {
        console.log('ID exists');
        toast.error('National ID already registered.');
        setIsRegisteringAgent(false);
        return;
      }
 
      const pendingAgentRef = doc(collection(db, 'users'));
      console.log('Generated Ref ID:', pendingAgentRef.id);
      
      const payload = {
        uid: pendingAgentRef.id,
        name: registrationData.fullName.trim(),
        email: normalizedEmail,
        phone: formatPhoneDisplay(registrationData.phone),
        nationalId: registrationData.nationalId.trim().toUpperCase(),
        address: registrationData.address.trim(),
        guarantorReference: registrationData.guarantorReference.trim(),
        profilePhotoName: registrationFiles.profilePhoto?.name || '',
        demoPassword: registrationData.password,
        role: 'AGENT',
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      console.log('Submitting payload to Firestore:', payload);

      await setDoc(pendingAgentRef, payload);
      console.log('setDoc successful');

      const pendingProfile: AuthProfile = {
        id: pendingAgentRef.id,
        uid: pendingAgentRef.id,
        name: registrationData.fullName.trim(),
        email: normalizedEmail,
        phone: formatPhoneDisplay(registrationData.phone),
        nationalId: registrationData.nationalId.trim().toUpperCase(),
        address: registrationData.address.trim(),
        guarantorReference: registrationData.guarantorReference.trim(),
        profilePhotoName: registrationFiles.profilePhoto?.name || '',
        role: 'AGENT',
        status: 'PENDING',
      };
      setLocalSessionProfile(pendingProfile);
      setUser(null);
      setAuthProfile(null);
      setRole('AGENT');
      setCurrentView('dashboard');
      setShowRegistrationSuccessPanel(true);
      toast.success('Registration submitted. Your agent account is awaiting admin approval within 24 hours.');
      setPendingEmailPrompt(null);
      setRegistrationFiles({ profilePhoto: null });
      setRegistrationData({
        fullName: '',
        email: '',
        phone: '',
        nationalId: '',
        address: '',
        password: '',
        confirmPassword: '',
        guarantorReference: '',
      });
    } catch (error: any) {
      console.error('Agent registration failed - FULL ERROR:', error);
      console.error('Error Code:', error.code);
      console.error('Error Message:', error.message);
      
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        toast.error('Registration Permission Denied. Please ensure Firestore rules allow unauthenticated writes.');
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error('Email already registered.');
      } else {
        toast.error(`Registration Failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsRegisteringAgent(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (localSessionProfile && !user) {
        setLocalSessionProfile(null);
        setAuthProfile(null);
        setRole('AGENT');
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
      <div className="h-screen w-full flex items-center justify-center bg-[#f8fafc] p-6">
        <Card className="max-w-md w-full border-none shadow-2xl overflow-hidden">
          <div className="bg-brand-600 p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <LayoutDashboard size={32} />
            </div>
            <h1 className="text-2xl font-bold">FastKwacha</h1>
            <p className="text-brand-100 text-sm mt-2">Secure Loan Management Infrastructure</p>
          </div>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-bold text-slate-900">{authMode === 'login' ? 'System Authentication' : 'Agent Registration'}</h2>
              <p className="text-slate-500 text-sm">
                {authMode === 'login'
                  ? 'Access the financial core using your authorized account.'
                  : 'Create an agent account for admin review and approval.'}
              </p>
            </div>

            {loginError === 'auth/operation-not-allowed' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] leading-relaxed">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertCircle size={14} />
                  <span>ACTION REQUIRED</span>
                </div>
                <p>Email/Password login is disabled in your Firebase project. To fix this:</p>
                <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                  <li>Open the <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="underline font-bold">Firebase Console</a></li>
                  <li>Go to <b>Authentication</b> → <b>Sign-in method</b></li>
                  <li>Click <b>Add new provider</b> and enable <b>Email/Password</b></li>
                </ol>
              </div>
            )}

            {authMode === 'login' ? (
              <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Email Address</label>
                    <Input 
                      type="email" 
                      placeholder="name@fastkwacha.com" 
                      className="h-11 border-slate-200"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Password</label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      className="h-11 border-slate-200"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit"
                    variant="ghost"
                    className="w-full h-10 text-slate-500 font-bold text-xs hover:bg-slate-50"
                  >
                    Sign In with Email
                  </Button>
                </form>

                {pendingEmailPrompt && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-[12px] text-blue-900 space-y-3">
                    <p>Account not found for <span className="font-bold">{pendingEmailPrompt}</span>. Would you like to register as an Agent?</p>
                    <Button
                      type="button"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                      onClick={() => {
                        setRegistrationData(prev => ({ ...prev, email: pendingEmailPrompt }));
                        setAuthMode('register');
                      }}
                    >
                      Register as Agent
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleAgentRegistration} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Full Name</label>
                  <Input className="h-11 border-slate-200" value={registrationData.fullName} onChange={(e) => setRegistrationData({ ...registrationData, fullName: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Email Address</label>
                  <Input type="email" className="h-11 border-slate-200" value={registrationData.email} onChange={(e) => setRegistrationData({ ...registrationData, email: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Phone Number</label>
                  <Input className="h-11 border-slate-200" value={registrationData.phone} onChange={(e) => setRegistrationData({ ...registrationData, phone: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">National ID</label>
                  <Input className="h-11 border-slate-200" value={registrationData.nationalId} onChange={(e) => setRegistrationData({ ...registrationData, nationalId: e.target.value.toUpperCase() })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Address</label>
                  <Input className="h-11 border-slate-200" value={registrationData.address} onChange={(e) => setRegistrationData({ ...registrationData, address: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Password</label>
                  <Input type="password" className="h-11 border-slate-200" value={registrationData.password} onChange={(e) => setRegistrationData({ ...registrationData, password: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Confirm Password</label>
                  <Input type="password" className="h-11 border-slate-200" value={registrationData.confirmPassword} onChange={(e) => setRegistrationData({ ...registrationData, confirmPassword: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Passport Photo</label>
                  <Input
                    type="file"
                    accept="image/*"
                    className="h-11 border-slate-200 cursor-pointer"
                    onChange={(e) => setRegistrationFiles({ profilePhoto: e.target.files?.[0] || null })}
                  />
                  <p className="text-[11px] text-slate-500">{registrationFiles.profilePhoto?.name || 'Optional image file not selected.'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">Guarantor / Reference</label>
                  <Input className="h-11 border-slate-200" placeholder="Optional" value={registrationData.guarantorReference} onChange={(e) => setRegistrationData({ ...registrationData, guarantorReference: e.target.value })} />
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 h-10 text-xs font-bold" onClick={() => setAuthMode('login')} disabled={isRegisteringAgent}>
                    Back to Login
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-10 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                    disabled={isRegisteringAgent}
                  >
                    {isRegisteringAgent ? 'Submitting...' : 'Submit Agent Registration'}
                  </Button>
                </div>
              </form>
            )}

            {authMode === 'login' && !pendingEmailPrompt && (
              <Button type="button" variant="outline" className="w-full h-10 text-xs font-bold" onClick={() => setAuthMode('register')}>
                New Agent? Register for Access
              </Button>
            )}

            <div className="pt-4 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 leading-relaxed italic">
                Authorized Stakeholder Access Only. All sessions are monitored and encrypted.
              </p>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-widest font-black justify-center pt-2">
              <CheckCircle2 size={12} />
              Encrypted Session
            </div>
          </CardContent>
        </Card>
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
                icon={<Settings size={16} />} 
                label="Settings" 
                active={currentView === 'settings'} 
                onClick={() => setCurrentView('settings')}
                collapsed={!isSidebarOpen}
              />
            </>
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

          {role === 'AUDITOR' && (
            <>
              <NavItem 
                icon={<ShieldAlert size={16} />} 
                label="Audit Logs" 
                active={currentView === 'audit-logs'} 
                onClick={() => setCurrentView('audit-logs')}
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

          {role === 'AGENT' && (
            <>
              <NavItem 
                icon={<UserPlus size={16} />} 
                label="Clients" 
                active={currentView === 'clients'} 
                onClick={() => !isPendingAgent && setCurrentView('clients')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<FileText size={16} />} 
                label="Applications" 
                active={currentView === 'applications'} 
                onClick={() => !isPendingAgent && setCurrentView('applications')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<DollarSign size={16} />} 
                label="Payments" 
                active={currentView === 'payments'} 
                onClick={() => !isPendingAgent && setCurrentView('payments')}
                collapsed={!isSidebarOpen}
              />
              <NavItem 
                icon={<History size={16} />} 
                label="Transactions" 
                active={currentView === 'transactions'} 
                onClick={() => !isPendingAgent && setCurrentView('transactions')}
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
              <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold border-border bg-white">
                Export CSV
              </Button>
              <Button size="sm" className="h-9 px-4 text-xs font-semibold bg-primary text-white" onClick={() => !isPendingAgent && setCurrentView('applications')} disabled={isPendingAgent}>
                + New Application
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
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
                {role === 'AGENT' ? (
                  <AgentDashboardView 
                    clients={clients} 
                    loans={loans} 
                    applications={applications} 
                    onNavigate={(v) => setCurrentView(v)} 
                    transactions={transactions}
                    profile={sessionProfile}
                    showSuccessPanel={showRegistrationSuccessPanel}
                    onDismissSuccessPanel={() => setShowRegistrationSuccessPanel(false)}
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
                {isPendingAgent ? <PendingAgentWorkspace profile={sessionProfile!} /> : <ApplicationsView clients={clients} applications={applications} role={role} />}
              </motion.div>
            )}
            {currentView === 'approvals' && (
              <motion.div key="approvals">
                <ApprovalsView applications={applications} role={role} />
              </motion.div>
            )}
            {currentView === 'repayments' && (
              <motion.div key="repayments">
                <RepaymentsView loans={loans} role={role} />
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
                <LoanProductsView />
              </motion.div>
            )}
            {currentView === 'loans' && (
              <motion.div key="loans">
                <LoansView loans={loans} clients={clients} />
              </motion.div>
            )}
            {currentView === 'reports' && (
              <motion.div key="reports">
                <ReportsView loans={loans} applications={applications} transactions={transactions} clients={clients} />
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
            {currentView === 'settings' && (
              <motion.div key="settings">
                <SystemSettingsView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
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

function DashboardView({ clients, loans, applications, role, users, transactions, onNavigate, onUpdateUserStatus }: { clients: any[], loans: any[], applications: any[], role: UserRole, users: any[], transactions: any[], onNavigate: (view: View) => void, onUpdateUserStatus: (user: any, status: UserStatus) => Promise<void> }) {
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
      />
    );
  }

  if (role === 'AUDITOR') {
    return (
      <AuditorDashboardView
        clients={clients}
        loans={loans}
        applications={applications}
        users={users}
        transactions={transactions}
        onNavigate={onNavigate}
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
      />
    );
  }

  // Fallback
  const totalPortfolioValue = loans.reduce((acc, loan) => acc + (loan.amount || 0), 0);
  const totalDisbursed = transactions.filter(t => t.type === 'DISBURSEMENT').reduce((acc, t) => acc + (t.amount || 0), 0);
  const totalCollected = transactions.filter(t => t.type === 'REPAYMENT').reduce((acc, t) => acc + (t.amount || 0), 0);
  const defaultRate = loans.length > 0 ? (loans.filter(l => l.status === 'DEFAULTED').length / loans.length) * 100 : 0;
  const activeStaff = users.filter(u => u.role === 'AGENT' || u.role === 'OFFICER').length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Executive Overview</h2>
          <p className="text-sm text-slate-500">Live financial map of the entire loan ecosystem.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports')}>
            <BarChart3 size={14} className="mr-2" />
            View Full Reports
          </Button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Portfolio Value" 
          value={`MWK ${totalPortfolioValue.toLocaleString()}`} 
          trend="Total principal issued" 
          icon={<Briefcase className="text-brand-500" size={18} />}
          iconBg="bg-brand-50"
        />
        <StatCard 
          title="Total Disbursed" 
          value={`MWK ${totalDisbursed.toLocaleString()}`} 
          trend="Money out" 
          icon={<DollarSign className="text-blue-500" size={18} />}
          iconBg="bg-blue-50"
        />
        <StatCard 
          title="Total Collected" 
          value={`MWK ${totalCollected.toLocaleString()}`} 
          trend="Money in" 
          icon={<CheckCircle2 className="text-emerald-500" size={18} />}
          iconBg="bg-emerald-50"
        />
        <StatCard 
          title="Outstanding Balance" 
          value={`MWK ${totalOutstanding.toLocaleString()}`} 
          trend="Pending collection" 
          icon={<AlertCircle className="text-amber-500" size={18} />}
          iconBg="bg-amber-50"
        />
        <StatCard 
          title="Default Rate" 
          value={`${defaultRate.toFixed(1)}%`} 
          trend={defaultRate > 5 ? "High risk" : "Healthy"} 
          icon={<AlertCircle className={defaultRate > 5 ? "text-red-500" : "text-emerald-500"} size={18} />}
          iconBg={defaultRate > 5 ? "bg-red-50" : "bg-emerald-50"}
        />
        <StatCard 
          title="Total Clients" 
          value={clients.length.toString()} 
          trend="Registered borrowers" 
          icon={<Users className="text-indigo-500" size={18} />}
          iconBg="bg-indigo-50"
        />
        <StatCard 
          title="Active Staff" 
          value={activeStaff.toString()} 
          trend="Agents & Officers" 
          icon={<UserPlus className="text-purple-500" size={18} />}
          iconBg="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity / Transactions */}
        <Card className="lg:col-span-2 border border-border shadow-none rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-white">
            <h3 className="text-base font-semibold">Latest Ecosystem Activity</h3>
            <Button variant="link" className="text-xs text-brand-500 p-0 h-auto" onClick={() => onNavigate('transactions')}>View All</Button>
          </div>
          <div className="flex-1 overflow-auto">
            <Table className="text-[13px]">
              <TableHeader className="bg-[#F9FAFB]">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-muted-foreground font-semibold h-11 px-5">Type</TableHead>
                  <TableHead className="text-muted-foreground font-semibold h-11 px-5">Amount</TableHead>
                  <TableHead className="text-muted-foreground font-semibold h-11 px-5">Date</TableHead>
                  <TableHead className="text-muted-foreground font-semibold h-11 px-5">Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 5).map((tx, i) => (
                  <TableRow key={tx.id || i} className="border-border">
                    <TableCell className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {tx.type === 'DISBURSEMENT' ? (
                          <DollarSign size={14} className="text-blue-500" />
                        ) : (
                          <CheckCircle2 size={14} className="text-emerald-500" />
                        )}
                        {tx.type}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3 font-semibold">MWK {(tx.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-5 py-3 text-muted-foreground">
                      {tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString() : 'Just now'}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-muted-foreground">{tx.method || 'N/A'}</TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No recent activity</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Portfolio Health */}
        <Card className="border border-border shadow-none rounded-lg bg-white p-5">
          <h3 className="text-base font-semibold mb-5">Portfolio Health</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600 font-medium">Active Loans</span>
                <span className="font-bold">{loans.filter(l => l.status === 'ACTIVE').length}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${loans.length ? (loans.filter(l => l.status === 'ACTIVE').length / loans.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600 font-medium">Pending Approvals</span>
                <span className="font-bold">{applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW').length}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${applications.length ? (applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW').length / applications.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600 font-medium">Defaulted</span>
                <span className="font-bold">{loans.filter(l => l.status === 'DEFAULTED').length}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${defaultRate}%` }} />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function AuditorDashboardView({
  clients,
  loans,
  applications,
  users,
  transactions,
  onNavigate,
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  users: any[],
  transactions: any[],
  onNavigate: (view: View) => void,
}) {
  const auditLogs = buildAuditLogs({ users, clients, applications, loans, transactions });
  const anomalies = buildAnomalies({ users, applications, loans, transactions });
  const activeLoans = loans.filter(loan => loan.status === 'ACTIVE');
  const totalOutstanding = loans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
  const defaultedOutstanding = loans
    .filter(loan => loan.status === 'DEFAULTED')
    .reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
  const riskExposure = totalOutstanding > 0 ? (defaultedOutstanding / totalOutstanding) * 100 : 0;
  const kycCoverage = clients.length > 0 ? (clients.filter(client => getClientIdNumber(client)).length / clients.length) * 100 : 100;
  const suspiciousTransactions = transactions.filter(transaction => !transaction.reference || (transaction.type === 'DISBURSEMENT' && (transaction.amount || 0) > 1000000));
  const auditScore = Math.max(60, Math.round(100 - (anomalies.length * 4) - (100 - kycCoverage) * 0.2 - riskExposure));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-blue-600" size={20} />
          <div>
            <p className="text-sm font-bold text-blue-900">Audit Mode Active</p>
            <p className="text-[11px] text-blue-700 font-medium">Independent oversight is now backed by live portfolio, access, and transaction evidence.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-blue-600 text-white border-none">VERIFIED AUDITOR</Badge>
          <Button variant="outline" size="sm" className="h-9 border-blue-200 text-blue-700 bg-white" onClick={() => onNavigate('audit-logs')}>
            <History size={14} className="mr-2" />
            Open Audit Trail
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Portfolio Under Review" value={formatCurrency(totalOutstanding)} trend="Live outstanding book" icon={<DollarSign className="text-blue-500" size={18} />} iconBg="bg-blue-50" />
        <StatCard title="Open Alerts" value={anomalies.filter(anomaly => anomaly.status !== 'RESOLVED').length.toString()} trend="Requires auditor attention" icon={<ShieldAlert className="text-amber-500" size={18} />} iconBg="bg-amber-50" />
        <StatCard title="Risk Exposure" value={`${riskExposure.toFixed(1)}%`} trend={riskExposure > 10 ? 'Elevated' : 'Within tolerance'} icon={<AlertCircle className={riskExposure > 10 ? 'text-red-500' : 'text-emerald-500'} size={18} />} iconBg={riskExposure > 10 ? 'bg-red-50' : 'bg-emerald-50'} />
        <StatCard title="Audit Score" value={`${auditScore}/100`} trend={auditScore >= 90 ? 'Strong controls' : 'Needs remediation'} icon={<TrendingUp className="text-brand-500" size={18} />} iconBg="bg-brand-50" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 border border-border shadow-none rounded-lg overflow-hidden bg-white">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">System Integrity Log</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Recent platform events reconstructed from live records.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('audit-logs')}>VIEW ALL</Button>
          </div>
          <Table className="text-[12px]">
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Timestamp</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Action</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Actor</TableHead>
                <TableHead className="text-muted-foreground font-semibold h-10 px-4 text-right">Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.slice(0, 6).map(log => (
                <TableRow key={log.id} className="border-border">
                  <TableCell className="px-4 py-3 text-muted-foreground">{formatDateTimeLabel(log.timestamp)}</TableCell>
                  <TableCell className="px-4 py-3 font-bold">{log.action.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="px-4 py-3">{log.user}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Badge variant="outline" className="text-[10px] font-bold border-border">{log.category}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-white p-5">
          <h3 className="text-sm font-bold mb-4">Compliance Checklist</h3>
          <div className="space-y-4">
            {[
              { label: 'KYC Documentation', status: kycCoverage >= 90, detail: `${kycCoverage.toFixed(1)}% coverage` },
              { label: 'Interest Rate Caps', status: loans.every(loan => (loan.interestRate || 0) <= 25), detail: '25% supervisory ceiling' },
              { label: 'Access Governance', status: users.filter(user => normalizeUserStatus(user.status) === 'SUSPENDED').length <= 2, detail: `${users.filter(user => normalizeUserStatus(user.status) === 'SUSPENDED').length} suspended users` },
              { label: 'Transaction Traceability', status: suspiciousTransactions.length === 0, detail: `${suspiciousTransactions.length} entries need review` },
              { label: 'Default Exposure', status: riskExposure <= 10, detail: `${riskExposure.toFixed(1)}% of book` },
            ].map(item => (
              <div key={item.label} className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[12px] font-medium text-slate-600">{item.label}</span>
                  <p className="text-[11px] text-muted-foreground mt-1">{item.detail}</p>
                </div>
                {item.status ? <CheckCircle2 size={16} className="text-emerald-500 mt-0.5" /> : <AlertCircle size={16} className="text-amber-500 mt-0.5" />}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 border border-border shadow-none rounded-lg bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Alert Triage Queue</h3>
              <p className="text-[12px] text-muted-foreground mt-1">High-risk exceptions automatically surfaced for investigation.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-brand-600" onClick={() => onNavigate('anomalies')}>OPEN ALERTS</Button>
          </div>
          <div className="divide-y divide-border">
            {anomalies.slice(0, 6).map(anomaly => (
              <div key={anomaly.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{anomaly.type.replace(/_/g, ' ')}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">{anomaly.description}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">{anomaly.user} • {getRelativeTimeLabel(anomaly.time)}</p>
                </div>
                <Badge className={`border-none text-[10px] font-bold ${anomaly.severity === 'CRITICAL' ? 'bg-red-600 text-white' : anomaly.severity === 'HIGH' ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {anomaly.severity}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-border shadow-none rounded-lg bg-[#1A1C23] text-white p-5">
          <div className="flex items-center gap-2 text-sidebar-foreground mb-4">
            <ShieldAlert size={16} />
            <h4 className="font-bold text-[10px] uppercase tracking-widest">Control Health</h4>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                <span>KYC Coverage</span>
                <span>{kycCoverage.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-brand-400" style={{ width: `${Math.min(100, kycCoverage)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                <span>Alert Resolution</span>
                <span>{anomalies.length ? `${((anomalies.filter(anomaly => anomaly.status === 'RESOLVED').length / anomalies.length) * 100).toFixed(1)}%` : '100.0%'}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${anomalies.length ? (anomalies.filter(anomaly => anomaly.status === 'RESOLVED').length / anomalies.length) * 100 : 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground mb-1.5">
                <span>Controls Passing</span>
                <span>{auditScore}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400" style={{ width: `${auditScore}%` }} />
              </div>
            </div>
          </div>
          <div className="pt-5 space-y-2">
            <Button variant="outline" className="w-full justify-start gap-3 h-10 border-white/15 bg-transparent text-xs font-bold text-white hover:bg-white/5" onClick={() => onNavigate('transactions-audit')}>
              <History size={16} className="text-amber-300" />
              Transactions Audit
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-10 border-white/15 bg-transparent text-xs font-bold text-white hover:bg-white/5" onClick={() => onNavigate('user-activity')}>
              <Users size={16} className="text-blue-300" />
              User Activity
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-10 border-white/15 bg-transparent text-xs font-bold text-white hover:bg-white/5" onClick={() => onNavigate('cases')}>
              <Briefcase size={16} className="text-emerald-300" />
              Investigation Cases
            </Button>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function AdminDashboardView({
  clients,
  loans,
  applications,
  users,
  transactions,
  onNavigate,
  onUpdateUserStatus
}: {
  clients: any[],
  loans: any[],
  applications: any[],
  users: any[],
  transactions: any[],
  onNavigate: (view: View) => void,
  onUpdateUserStatus: (user: any, status: UserStatus) => Promise<void>
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
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports')}>
            <BarChart3 size={14} className="mr-2" />
            View Reports
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
function StatCard({ title, value, trend, trendUp }: any) {
  return (
    <Card className="border border-border shadow-none rounded-lg bg-white">
      <CardContent className="p-4">
        <h4 className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider mb-1 leading-none">{title}</h4>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        <p className={`text-[11px] mt-1 font-medium ${trendUp === true ? 'text-[#10B981]' : trendUp === false ? 'text-[#EF4444]' : 'text-muted-foreground'}`}>
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
          {role !== 'AUDITOR' && (
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

const getClientName = (client: any) => {
  if (client?.name) return client.name;
  const first = client?.firstName || '';
  const last = client?.lastName || '';
  return `${first} ${last}`.trim() || 'Unnamed Client';
};

const getClientPrimaryPhone = (client: any) =>
  client?.phone || client?.primaryPhone || client?.contactInfo?.primaryPhone || '';

const getClientIdNumber = (client: any) =>
  client?.idNumber || client?.personalInfo?.idNumber || '';

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

const formatCurrency = (value: number) => `MWK ${Math.round(value || 0).toLocaleString()}`;

const getTimestampDate = (value: any) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateLabel = (value: any, options?: Intl.DateTimeFormatOptions) => {
  const date = getTimestampDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString(undefined, options || { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTimeLabel = (value: any) => {
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

const getApplicationClientLabel = (application: any, clients: any[]) => {
  const linkedClient = clients.find(client => client.id === application.clientId);
  if (linkedClient) return getClientName(linkedClient);
  return application.clientSnapshot?.name || 'Unknown Client';
};

const buildAuditLogs = ({
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
}) => {
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

const buildAnomalies = ({
  users,
  applications,
  loans,
  transactions,
}: {
  users: any[],
  applications: any[],
  loans: any[],
  transactions: any[],
}) => {
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

function ApplicationsView({ clients, applications, role }: { clients: any[], applications: any[], role: UserRole }) {
  const draftStorageKey = `fastkwacha-application-draft-${role.toLowerCase()}`;
  const [currentStep, setCurrentStep] = useState(1);
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
    if (role === 'AUDITOR') {
      toast.error("Auditors cannot submit applications");
      return;
    }

    for (let step = 1; step <= 4; step += 1) {
      if (!validateStep(step)) {
        setCurrentStep(step);
        return;
      }
    }

    try {
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
        const clientRef = await addDoc(collection(db, 'clients'), clientPayload);
        clientId = clientRef.id;
      } else if (selectedClient?.id) {
        await updateDoc(doc(db, 'clients', selectedClient.id), {
          assignedAgentEmail: createdBy.email,
          updatedAt: serverTimestamp(),
          metadata: {
            ...(selectedClient.metadata || {}),
            lastUpdatedAt: serverTimestamp(),
            lastApplicationBy: createdBy,
          }
        });
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

      await addDoc(collection(db, 'applications'), {
        clientId,
        clientSnapshot,
        originatingAgentEmail: createdBy.email,
        assignedAgentEmail: createdBy.email,
        requestedAmount,
        termMonths,
        purpose: draft.purpose.trim(),
        employmentStatus: draft.employmentStatus,
        annualIncome: monthlyIncome * 12,
        monthlyIncome,
        loanProduct: draft.loanProduct,
        currency: draft.currency,
        status: 'SUBMITTED',
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success(draft.mode === 'new' ? 'Client registered and application submitted successfully' : 'Application submitted successfully');
      resetDraft();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'applications');
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
            {role === 'AUDITOR' ? 'READ ONLY' : 'Drafting'}
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
                    disabled={role === 'AUDITOR'}
                    onClick={() => setDraft(prev => ({ ...prev, mode: 'existing', selectedClientId: prev.selectedClientId || '' }))}
                    className={`px-3 py-2 text-xs font-bold rounded-md ${draft.mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    Existing Client
                  </button>
                  <button
                    type="button"
                    disabled={role === 'AUDITOR'}
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
                    onClick={() => role !== 'AUDITOR' && draft.mode === 'existing' && setDraft(prev => ({ ...prev, selectedClientId: client.id }))}
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
                    <Field label="First Name"><Input value={draft.firstName} onChange={(e) => setDraftField('firstName', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                    <Field label="Last Name"><Input value={draft.lastName} onChange={(e) => setDraftField('lastName', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                    <Field label="Gender">
                      <select value={draft.gender} onChange={(e) => setDraftField('gender', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="">Select gender</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    </Field>
                    <Field label="Date of Birth">
                      <Input type="date" value={draft.dateOfBirth} onChange={(e) => setDraftField('dateOfBirth', e.target.value)} disabled={role === 'AUDITOR'} />
                    </Field>
                    <Field label="National ID / Passport Number">
                      <div className="space-y-2">
                        <Input value={draft.idNumber} onChange={(e) => setDraftField('idNumber', e.target.value.toUpperCase())} disabled={role === 'AUDITOR'} />
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
                      <select value={draft.maritalStatus} onChange={(e) => setDraftField('maritalStatus', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="">Select status</option>
                        <option value="SINGLE">Single</option>
                        <option value="MARRIED">Married</option>
                        <option value="DIVORCED">Divorced</option>
                        <option value="WIDOWED">Widowed</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Primary Phone Number"><Input value={draft.primaryPhone} onChange={(e) => setDraftField('primaryPhone', e.target.value)} disabled={role === 'AUDITOR'} placeholder="+265..." /></Field>
                    <Field label="Secondary Phone Number"><Input value={draft.secondaryPhone} onChange={(e) => setDraftField('secondaryPhone', e.target.value)} disabled={role === 'AUDITOR'} placeholder="Optional" /></Field>
                    <Field label="Email Address"><Input type="email" value={draft.email} onChange={(e) => setDraftField('email', e.target.value)} disabled={role === 'AUDITOR'} placeholder="Optional" /></Field>
                    <Field label="Preferred Contact Method">
                      <select value={draft.preferredContactMethod} onChange={(e) => setDraftField('preferredContactMethod', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="PHONE">Phone</option>
                        <option value="SMS">SMS</option>
                        <option value="EMAIL">Email</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={draft.otpVerified} onChange={(e) => setDraftField('otpVerified', e.target.checked)} disabled={role === 'AUDITOR'} />
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
                  <Field label="District"><Input value={draft.district} onChange={(e) => setDraftField('district', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                  <Field label="Traditional Authority (TA)"><Input value={draft.traditionalAuthority} onChange={(e) => setDraftField('traditionalAuthority', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                  <Field label="Village / Area"><Input value={draft.villageArea} onChange={(e) => setDraftField('villageArea', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                  <Field label="GPS Coordinates"><Input value={draft.gpsCoordinates} onChange={(e) => setDraftField('gpsCoordinates', e.target.value)} disabled={role === 'AUDITOR'} placeholder="Optional" /></Field>
                  <div className="md:col-span-2">
                    <Field label="Physical Address Description">
                      <textarea value={draft.physicalAddress} onChange={(e) => setDraftField('physicalAddress', e.target.value)} disabled={role === 'AUDITOR'} className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none" />
                    </Field>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Employment Status">
                  <select value={draft.employmentStatus} onChange={(e) => setDraftField('employmentStatus', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="EMPLOYED">Employed</option>
                    <option value="SELF_EMPLOYED">Self-employed</option>
                    <option value="UNEMPLOYED">Unemployed</option>
                  </select>
                </Field>
                <Field label="Monthly Income (MWK)"><Input type="number" value={draft.monthlyIncome} onChange={(e) => setDraftField('monthlyIncome', e.target.value)} disabled={role === 'AUDITOR'} min="0" /></Field>
                <Field label="Employer Name"><Input value={draft.employerName} onChange={(e) => setDraftField('employerName', e.target.value)} disabled={role === 'AUDITOR'} placeholder="Required if employed" /></Field>
                <Field label="Business Name"><Input value={draft.businessName} onChange={(e) => setDraftField('businessName', e.target.value)} disabled={role === 'AUDITOR'} placeholder="Required if self-employed" /></Field>
                <div className="md:col-span-2">
                  <Field label="Income Source Description">
                    <textarea value={draft.incomeSourceDescription} onChange={(e) => setDraftField('incomeSourceDescription', e.target.value)} disabled={role === 'AUDITOR'} className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none" placeholder="Salary, farming, business sales, piece work, etc." />
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
                <Field label="Next of Kin / Guarantor Full Name"><Input value={draft.nextOfKinName} onChange={(e) => setDraftField('nextOfKinName', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                <Field label="Relationship"><Input value={draft.nextOfKinRelationship} onChange={(e) => setDraftField('nextOfKinRelationship', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                <Field label="Phone Number"><Input value={draft.nextOfKinPhone} onChange={(e) => setDraftField('nextOfKinPhone', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                <Field label="Address"><Input value={draft.nextOfKinAddress} onChange={(e) => setDraftField('nextOfKinAddress', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="National ID Front Image">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*,.pdf" disabled={role === 'AUDITOR'} onChange={(e) => handleFileChange('idFront', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.idFront ? files.idFront.name : 'No front image selected.'}</p>
                  </div>
                </Field>
                <Field label="National ID Back Image">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*,.pdf" disabled={role === 'AUDITOR'} onChange={(e) => handleFileChange('idBack', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.idBack ? files.idBack.name : 'No back image selected.'}</p>
                  </div>
                </Field>
                <Field label="Proof of Residence File">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*,.pdf" disabled={role === 'AUDITOR'} onChange={(e) => handleFileChange('proofOfResidence', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.proofOfResidence ? files.proofOfResidence.name : 'Optional file not selected.'}</p>
                  </div>
                </Field>
                <Field label="Passport Photo File">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*" disabled={role === 'AUDITOR'} onChange={(e) => handleFileChange('passportPhoto', e)} className="cursor-pointer" />
                    <p className="text-[11px] text-slate-500">{files.passportPhoto ? files.passportPhoto.name : 'Optional file not selected.'}</p>
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Existing Loans">
                  <select value={draft.hasExistingLoans} onChange={(e) => setDraftField('hasExistingLoans', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="NO">No</option>
                    <option value="YES">Yes</option>
                  </select>
                </Field>
                <Field label="Client Status">
                  <select value={draft.clientStatus} onChange={(e) => setDraftField('clientStatus', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="BLACKLISTED">Blacklisted</option>
                  </select>
                </Field>
                {hasExistingLoanDetails && (
                  <>
                    <Field label="Current Lender Name"><Input value={draft.existingLenderName} onChange={(e) => setDraftField('existingLenderName', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                    <Field label="Outstanding Balance (MWK)"><Input type="number" value={draft.outstandingBalance} onChange={(e) => setDraftField('outstandingBalance', e.target.value)} disabled={role === 'AUDITOR'} min="0" /></Field>
                  </>
                )}
                <Field label="Payment Channel">
                  <select value={draft.paymentChannel} onChange={(e) => setDraftField('paymentChannel', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK">Bank</option>
                  </select>
                </Field>
                {usesBankingDetails ? (
                  <>
                    <Field label="Bank Name">
                      <select value={draft.bankName} onChange={(e) => setDraftField('bankName', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="">Select bank</option>
                        {BANK_OPTIONS.map(bank => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Account Name"><Input value={draft.bankAccountName} onChange={(e) => setDraftField('bankAccountName', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                    <Field label="Account Number"><Input value={draft.bankAccountNumber} onChange={(e) => setDraftField('bankAccountNumber', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                    <Field label="Branch"><Input value={draft.bankBranch} onChange={(e) => setDraftField('bankBranch', e.target.value)} disabled={role === 'AUDITOR'} placeholder="Optional" /></Field>
                  </>
                ) : (
                  <>
                    <Field label="Mobile Money Provider">
                      <select value={draft.mobileMoneyProvider} onChange={(e) => setDraftField('mobileMoneyProvider', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="AIRTEL_MONEY">Airtel Money</option>
                        <option value="TNM_MPAMBA">TNM Mpamba</option>
                      </select>
                    </Field>
                    <Field label="Mobile Money Number"><Input value={draft.mobileMoneyNumber} onChange={(e) => setDraftField('mobileMoneyNumber', e.target.value)} disabled={role === 'AUDITOR'} /></Field>
                  </>
                )}
              </div>

              <Card className="bg-slate-50 border-none rounded-xl">
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Loan Product">
                      <select value={draft.loanProduct} onChange={(e) => setDraftField('loanProduct', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="Commercial Growth Bridge">Commercial Growth Bridge</option>
                        <option value="SME Expansion Fund">SME Expansion Fund</option>
                        <option value="Personal Asset Loan">Personal Asset Loan</option>
                      </select>
                    </Field>
                    <Field label="Currency">
                      <select value={draft.currency} onChange={(e) => setDraftField('currency', e.target.value)} disabled={role === 'AUDITOR'} className="w-full h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="MWK">MWK - Malawi Kwacha</option>
                        <option value="USD">USD - United States Dollar</option>
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Requested Amount (MWK)">
                      <Input type="number" min="10000" step="10000" value={draft.requestedAmount} onChange={(e) => setDraftField('requestedAmount', e.target.value)} disabled={role === 'AUDITOR'} />
                    </Field>
                    <Field label="Term (Months)">
                      <Input type="number" min="1" step="1" value={draft.termMonths} onChange={(e) => setDraftField('termMonths', e.target.value)} disabled={role === 'AUDITOR'} />
                    </Field>
                  </div>
                  <Field label="Purpose of Loan">
                    <textarea value={draft.purpose} onChange={(e) => setDraftField('purpose', e.target.value)} disabled={role === 'AUDITOR'} className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm resize-none" placeholder="Describe the reason for this loan request..." />
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
              <Button onClick={() => handleStepChange(currentStep + 1)} className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 font-bold gap-2" disabled={role === 'AUDITOR'}>
                CONTINUE <ChevronRight size={18} />
              </Button>
            ) : (
              role !== 'AUDITOR' && (
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

function ApprovalsView({ applications, role }: { applications: any[], role: UserRole }) {
  const pendingApps = applications.filter(a => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW');
  const reviewerEmail = getActiveSessionEmail();

  const handleApprove = async (app: any) => {
    if (role === 'AUDITOR') {
      toast.error("Auditors cannot approve applications");
      return;
    }
    try {
      const approvedAt = serverTimestamp();
      const clientName = app.clientSnapshot?.name || `Client ${app.clientId?.slice(0, 8)?.toUpperCase() || ''}`.trim();
      const requestedAmount = app.requestedAmount || 0;
      const monthlyIncome = app.monthlyIncome || Math.round((app.annualIncome || 0) / 12);
      const originatingAgentEmail = app.originatingAgentEmail || app.assignedAgentEmail || app.metadata?.createdBy?.email || '';

      await updateDoc(doc(db, 'applications', app.id), {
        status: 'APPROVED',
        approvedAt,
        approvedBy: reviewerEmail || 'system',
        updatedAt: serverTimestamp()
      });

      const disbursedAt = serverTimestamp();
      const loanRef = await addDoc(collection(db, 'loans'), {
        clientId: app.clientId,
        applicationId: app.id,
        clientName,
        amount: requestedAmount,
        outstandingBalance: requestedAmount,
        interestRate: 5.25,
        status: "ACTIVE",
        type: app.loanProduct || "Commercial Growth",
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
          applicationStatus: 'APPROVED',
        },
        disbursedAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'transactions'), {
        loanId: loanRef.id,
        applicationId: app.id,
        clientId: app.clientId,
        clientName,
        type: 'DISBURSEMENT',
        amount: requestedAmount,
        method: app.financialProfile?.paymentChannel || 'SYSTEM',
        reference: `DISB-${app.id.slice(0, 8).toUpperCase()}`,
        agentEmail: reviewerEmail || 'system',
        originatingAgentEmail,
        approvedBy: reviewerEmail || 'system',
        timestamp: serverTimestamp()
      });
      
      toast.success("Application approved and loan disbursed");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'loans/applications');
    }
  };

  const handleReject = async (app: any) => {
    if (role === 'AUDITOR') {
      toast.error("Auditors cannot reject applications");
      return;
    }
    try {
      await updateDoc(doc(db, 'applications', app.id), {
        status: 'REJECTED',
        rejectedBy: reviewerEmail || 'system',
        updatedAt: serverTimestamp()
      });
      toast.info("Application rejected");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'applications');
    }
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
              <div className="p-4 flex-1 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarFallback className="bg-[#F3F4F6] text-primary font-bold text-xs">CL</AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-bold text-[14px] text-foreground">Application #{app.id.slice(0, 8).toUpperCase()}</h4>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Client ID: {app.clientId.slice(0, 8).toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="bg-[#DBEAFE] text-[#1E40AF] px-2 py-0.5 rounded-full text-[10px] font-bold">{app.status}</span>
                </div>

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
              </div>

              <div className="bg-[#F9FAFB] border-l border-border p-4 flex flex-row md:flex-col justify-center gap-2 w-full md:w-48">
                {role !== 'AUDITOR' ? (
                  <>
                    <Button 
                      onClick={() => handleApprove(app)}
                      size="sm"
                      className="w-full h-9 text-[11px] font-bold bg-primary text-white"
                    >
                      APPROVE
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
                ) : (
                  <Badge variant="outline" className="w-full h-9 flex items-center justify-center text-[10px] font-bold border-border text-muted-foreground">READ ONLY</Badge>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  );
}

function RepaymentsView({ loans, role }: { loans: any[], role: UserRole }) {
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
                    id={loan.id.slice(0, 8).toUpperCase()}
                    amount={`MWK ${(loan.amount || 0).toLocaleString()}`}
                    balance={`MWK ${(loan.outstandingBalance || 0).toLocaleString()}`}
                    status={loan.status}
                    dueDate="Oct 12, 2024"
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

function RepaymentRow({ id, amount, balance, status, dueDate, role }: any) {
  return (
    <TableRow className="border-border hover:bg-slate-50/50 transition-colors">
      <TableCell className="px-4 py-4">
        <p className="font-bold text-foreground">#{id}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Standard Term</p>
      </TableCell>
      <TableCell className="px-4 py-4">
        <p className="font-bold text-foreground">{balance}</p>
        <p className="text-[10px] text-muted-foreground">Original: {amount}</p>
      </TableCell>
      <TableCell className="px-4 py-4">
        <p className="font-semibold text-foreground">{dueDate}</p>
        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">In 3 Days</p>
      </TableCell>
      <TableCell className="px-4 py-4">
        <Badge className={`border-none text-[10px] font-bold ${
          status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}>{status}</Badge>
      </TableCell>
      <TableCell className="px-4 py-4 text-right">
        {role !== 'AUDITOR' ? (
          <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-primary hover:bg-primary/5">
            COLLECT
          </Button>
        ) : (
          <Badge variant="outline" className="text-[10px] font-bold border-border text-muted-foreground">READ ONLY</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

function LoanOfficerDashboardView({ clients, loans, applications, transactions, onNavigate }: { clients: any[], loans: any[], applications: any[], transactions: any[], onNavigate: (view: View) => void }) {
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
                <TableHead className="text-muted-foreground font-semibold h-10 px-4">Income</TableHead>
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
                    <TableCell className="px-4 py-3 font-medium text-slate-500">MWK {(app.annualIncome || 0).toLocaleString()}</TableCell>
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

function AgentDashboardView({
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
  const scopedClients = clients.filter(client => isCurrentAgentRecord(client));
  const fallbackClients = scopedClients.length > 0 ? scopedClients : clients;
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
      if ((method === 'AIRTEL' || method === 'MPAMBA') && !reference.trim()) {
        toast.error('Mobile money payments require a transaction reference.');
        return;
      }
      const newBalance = (selectedLoan.outstandingBalance || 0) - paymentAmount;

      // 1. Create Transaction
      await addDoc(collection(db, 'transactions'), {
        loanId: selectedLoan.id,
        clientId: selectedClient.id,
        clientName: getClientName(selectedClient),
        type: 'REPAYMENT',
        amount: paymentAmount,
        method,
        reference: reference.trim(),
        agentEmail: currentAgentEmail,
        collectorEmail: currentAgentEmail,
        originatingAgentEmail: selectedLoan.originatingAgentEmail || selectedLoan.assignedAgentEmail || currentAgentEmail,
        timestamp: serverTimestamp(),
      });

      // 2. Update Loan Balance
      await updateDoc(doc(db, 'loans', selectedLoan.id), {
        outstandingBalance: newBalance,
        status: newBalance <= 0 ? 'REPAID' : 'ACTIVE',
        lastCollectorEmail: currentAgentEmail,
        lastPaymentAt: serverTimestamp(),
        nextDueDate: newBalance <= 0 ? selectedLoan.nextDueDate || null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: serverTimestamp()
      });

      const paymentData = {
        clientName: getClientName(selectedClient),
        loanId: selectedLoan.id,
        amount: paymentAmount,
        method,
        reference: reference.trim(),
        date: new Date().toLocaleString(),
        balanceRemaining: newBalance
      };
      setReceipt(paymentData);
      setStep(3);
      toast.success("Payment successfully recorded");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions/loans');
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
                    {loans.filter(l => l.clientId === selectedClient.id && l.status === 'ACTIVE').map(loan => (
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
                    {loans.filter(l => l.clientId === selectedClient.id && l.status === 'ACTIVE').length === 0 && (
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
                  <div className="grid grid-cols-3 gap-2">
                    {['CASH', 'AIRTEL', 'MPAMBA'].map(m => (
                      <button 
                        key={m}
                        onClick={() => setMethod(m)}
                        className={`py-3 border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${method === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border text-muted-foreground hover:bg-slate-50'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {(method === 'AIRTEL' || method === 'MPAMBA') && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground">Transaction Reference</label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <Input 
                        placeholder="Enter reference number..." 
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
  const scopedClients = clients.filter(client => isCurrentAgentRecord(client));
  const visibleClients = scopedClients.length > 0 ? scopedClients : clients;

  const filteredClients = visibleClients.filter(c => 
    getClientName(c).toLowerCase().includes(search.toLowerCase()) || 
    getClientPrimaryPhone(c).includes(search) || 
    getClientIdNumber(c)?.includes(search)
  );

  const handleRegister = async () => {
    // Prevent duplicates check
    const exists = clients.find(c => c.idNumber === formData.idNumber || c.phone === formData.phone);
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
              const activeLoansCount = loans.filter(l => l.clientId === client.id && l.status === 'ACTIVE').length;
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
  const scopedTransactions = transactions
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
  const scopedClients = clients.filter(client => isCurrentAgentRecord(client));
  const visibleClientIds = new Set((scopedClients.length > 0 ? scopedClients : clients).map(client => client.id));
  const scopedLoans = loans.filter(loan => visibleClientIds.has(loan.clientId) || isCurrentAgentRecord(loan));
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

function LoanProductsView() {
  const [isAdding, setIsAdding] = useState(false);
  const [products, setProducts] = useState([
    { id: '1', name: 'Commercial Growth Bridge', interestRate: 12.5, maxTerm: 36, minAmount: 10000, maxAmount: 500000, status: 'ACTIVE' },
    { id: '2', name: 'SME Expansion Fund', interestRate: 15.0, maxTerm: 24, minAmount: 5000, maxAmount: 100000, status: 'ACTIVE' },
    { id: '3', name: 'Personal Asset Loan', interestRate: 18.0, maxTerm: 12, minAmount: 1000, maxAmount: 25000, status: 'INACTIVE' }
  ]);

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
                    <Input placeholder="e.g. Agricultural Equipment Loan" className="border-border" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Interest Rate (%)</label>
                      <Input type="number" placeholder="15.0" className="border-border" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Max Term (Months)</label>
                      <Input type="number" placeholder="24" className="border-border" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Min Amount (MWK )</label>
                      <Input type="number" placeholder="1000" className="border-border" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Max Amount (MWK )</label>
                      <Input type="number" placeholder="50000" className="border-border" />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1 h-10 font-bold" onClick={() => setIsAdding(false)}>CANCEL</Button>
                    <Button className="flex-1 h-10 bg-brand-600 hover:bg-brand-700 font-bold" onClick={() => {
                      toast.success("Loan product created successfully");
                      setIsAdding(false);
                    }}>CREATE PRODUCT</Button>
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
              loans.map(loan => {
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
      </Card>
    </motion.div>
  );
}

function ReportsView({ loans, applications, transactions, clients }: { loans: any[], applications: any[], transactions: any[], clients: any[] }) {
  const performanceData = Array.from({ length: 6 }).map((_, index) => {
    const bucket = new Date();
    bucket.setDate(1);
    bucket.setMonth(bucket.getMonth() - (5 - index));

    const monthLabel = bucket.toLocaleDateString(undefined, { month: 'short' });
    const monthLoans = loans.filter(loan => {
      const date = getTimestampDate(loan.disbursedAt || loan.createdAt);
      return date && date.getMonth() === bucket.getMonth() && date.getFullYear() === bucket.getFullYear();
    });

    return {
      name: monthLabel,
      active: monthLoans.filter(loan => loan.status === 'ACTIVE').length,
      defaulted: monthLoans.filter(loan => loan.status === 'DEFAULTED').length,
      closed: monthLoans.filter(loan => loan.status === 'REPAID').length,
    };
  });

  const currentMonthTransactions = transactions.filter(transaction => {
    const date = getTimestampDate(transaction.timestamp);
    const now = new Date();
    return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });

  const repaymentData = Array.from({ length: 4 }).map((_, index) => {
    const weekNumber = index + 1;
    const weekTransactions = currentMonthTransactions.filter(transaction => {
      const date = getTimestampDate(transaction.timestamp);
      if (!date) return false;
      return Math.ceil(date.getDate() / 7) === weekNumber;
    });
    const actual = weekTransactions
      .filter(transaction => transaction.type === 'REPAYMENT')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
    const disbursed = weekTransactions
      .filter(transaction => transaction.type === 'DISBURSEMENT')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);

    return {
      name: `Week ${weekNumber}`,
      expected: Math.max(actual, Math.round(disbursed * 0.12)),
      actual,
    };
  });

  const totalDisbursed = transactions.filter(transaction => transaction.type === 'DISBURSEMENT').reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
  const totalCollected = transactions.filter(transaction => transaction.type === 'REPAYMENT').reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
  const recoveryRate = totalDisbursed > 0 ? (totalCollected / totalDisbursed) * 100 : 0;
  const kycCoverage = clients.length > 0 ? (clients.filter(client => getClientIdNumber(client)).length / clients.length) * 100 : 100;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Reports & Analytics</h2>
          <p className="text-[12px] text-muted-foreground">Live operational analytics across lending, recovery, and compliance.</p>
        </div>
        <Button variant="outline" className="h-9 text-xs font-semibold">
          <FileDown size={14} className="mr-2" /> Export All
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Disbursed Capital" value={formatCurrency(totalDisbursed)} trend="Recorded disbursements" />
        <StatCard title="Recovered Cash" value={formatCurrency(totalCollected)} trend={`${recoveryRate.toFixed(1)}% recovery rate`} />
        <StatCard title="Submitted Applications" value={applications.length.toString()} trend="Historic pipeline volume" />
        <StatCard title="KYC Coverage" value={`${kycCoverage.toFixed(1)}%`} trend="Borrower registry completeness" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border shadow-none rounded-lg bg-white p-6">
          <h3 className="text-sm font-semibold mb-6">Portfolio Growth & Health</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDefaulted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                  labelStyle={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="active" name="Active Loans" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorActive)" />
                <Area type="monotone" dataKey="defaulted" name="Defaulted" stroke="#DC2626" strokeWidth={2} fillOpacity={1} fill="url(#colorDefaulted)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        
        <Card className="border border-border shadow-none rounded-lg bg-white p-6">
          <h3 className="text-sm font-semibold mb-6">Collection Efficiency (This Month)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={repaymentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(value) => `MWK ${value/1000}k`} />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                  labelStyle={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}
                  formatter={(value: number) => [`MWK ${value.toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="expected" name="Expected Collection" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="actual" name="Actual Collection" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
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
    try {
      // Note: In a real app, you would use a Cloud Function to create the auth user
      // to avoid exposing admin credentials or requiring the current user to log out.
      // For this demo, we'll just create the Firestore document.
      await addDoc(collection(db, 'users'), {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        status: 'ACTIVE',
        createdAt: serverTimestamp()
      });
      toast.success("Stakeholder added successfully. Note: Auth creation requires Cloud Functions.");
      setIsAdding(false);
      setFormData({ id: '', name: '', email: '', role: 'AGENT', status: 'ACTIVE' });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'users');
    }
  };

  const handleEditUser = async () => {
    if (!formData.id) return;
    try {
      await updateDoc(doc(db, 'users', formData.id), {
        name: formData.name,
        role: formData.role,
        status: formData.status
      });
      toast.success("Stakeholder updated successfully");
      setIsEditing(false);
      setFormData({ id: '', name: '', email: '', role: 'AGENT', status: 'ACTIVE' });
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
          <option value="AUDITOR">Auditor</option>
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
                      u.role === 'AUDITOR' ? 'text-amber-600 bg-amber-50' :
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
                      <option value="AUDITOR">Auditor (Compliance)</option>
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
