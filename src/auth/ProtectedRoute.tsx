import * as React from 'react';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { isAuthenticated, role, loading, navigateTo, currentPath } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      if (currentPath !== '/login') {
        navigateTo('/login', { replace: true });
      }
      return;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
      if (currentPath !== '/unauthorized') {
        navigateTo('/unauthorized', { replace: true });
      }
    }
  }, [allowedRoles, currentPath, isAuthenticated, loading, navigateTo, role]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Checking secure access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (allowedRoles && role && !allowedRoles.includes(role)) return null;

  return <>{children}</>;
}
