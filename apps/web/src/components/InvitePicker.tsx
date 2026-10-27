'use client';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { UserBrief } from '@/lib/types';
import { Input } from './ui';

export function InvitePicker({ selected, onChange, excludeIds = [] }: { selected: UserBrief[]; onChange: (u: UserBrief[]) => void; excludeIds?: string[] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserBrief[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setError('');
        setResults(await api<UserBrief[]>(`/users/search?q=${encodeURIComponent(q.trim())}`));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const visible = results.filter((r) => !selected.some((s) => s.id === r.id) && !excludeIds.includes(r.id));

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
        <Input className="pl-9" placeholder="Search registered users by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users to invite" />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {visible.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {visible.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onChange([...selected, u]);
                  setQ('');
                  setResults([]);
                }}
              >
                <span className="font-medium">{u.name}</span>
                <span className="text-slate-500">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800">
              {u.name}
              <button type="button" onClick={() => onChange(selected.filter((s) => s.id !== u.id))} aria-label={`Remove ${u.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
