'use client';
import { CalendarPlus, History, LayoutDashboard, LogOut, Mail, Menu, ShieldCheck, User as UserIcon, Video, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Avatar, Badge } from './ui';

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(user && user.role !== 'PARTICIPANT' ? [{ href: '/meetings/new', label: 'Schedule', icon: CalendarPlus }] : []),
    { href: '/invitations', label: 'Invitations', icon: Mail },
    { href: '/history', label: 'History', icon: History },
    ...(user?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Video className="h-4 w-4" aria-hidden />
          </span>
          SecureMeet <span className="text-brand-600">AI</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                pathname.startsWith(href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user && (
            <Link href="/profile" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100">
              <Avatar name={user.name} size="sm" />
              <span className="text-sm font-medium text-slate-700">{user.name}</span>
              <Badge tone={user.role === 'ADMIN' ? 'violet' : user.role === 'HOST' ? 'blue' : 'slate'}>{user.role}</Badge>
            </Link>
          )}
          <button onClick={signOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-2 md:hidden">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </Link>
          ))}
          <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <UserIcon className="h-4 w-4" aria-hidden /> Profile
          </Link>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </header>
  );
}
