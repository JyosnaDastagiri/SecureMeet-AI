import Link from 'next/link';
import { Video } from 'lucide-react';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-bold text-slate-900">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <Video className="h-4 w-4" aria-hidden />
        </span>
        SecureMeet <span className="text-brand-600">AI</span>
      </Link>
      {children}
    </main>
  );
}
