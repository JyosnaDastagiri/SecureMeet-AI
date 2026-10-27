import type { ReactNode } from 'react';
import { Navbar } from '@/components/Navbar';
import { RequireAuth } from '@/components/RequireAuth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </RequireAuth>
  );
}
