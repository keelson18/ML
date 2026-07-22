import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// Route guard that only renders children if the user has admin role.
// If not an admin, renders fallback (or nothing if no fallback provided).
export default function AdminRoute({ children, fallback }: Props) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return fallback ?? (
      <div className="flex items-center justify-center py-8 text-sm text-muted">
        Admin access required
      </div>
    );
  }

  return <>{children}</>;
}

