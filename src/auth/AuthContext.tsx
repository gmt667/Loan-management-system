import * as React from 'react';

export type AppRole = 'CLIENT' | 'OFFICER' | 'AGENT' | 'CREDIT_ANALYST' | 'MANAGER' | 'ADMIN' | null;
export type AppPath = '/login' | '/client' | '/officer' | '/analyst' | '/manager' | '/admin' | '/unauthorized';

export interface AuthContextValue {
  isAuthenticated: boolean;
  role: AppRole;
  loading: boolean;
  currentPath: AppPath;
  navigateTo: (path: AppPath, options?: { replace?: boolean }) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({
  value,
  children,
}: {
  value: AuthContextValue;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
