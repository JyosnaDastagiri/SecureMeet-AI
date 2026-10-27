'use client';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Alert, Spinner } from './ui';

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <Spinner label="Checking your session…" />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert tone="error">You do not have permission to view this page.</Alert>
      </div>
    );
  }
  return <>{children}</>;
}
