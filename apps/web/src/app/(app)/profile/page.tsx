'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { Alert, Avatar, Badge, Button, Card, Field, Input, PageHeader } from '@/components/ui';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = {};
      if (name.trim() && name.trim() !== user.name) body.name = name.trim();
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      const updated = await api<User>('/users/me', { method: 'PATCH', body });
      setUser(updated);
      setCurrent('');
      setNew('');
      setMsg({ tone: 'success', text: 'Profile updated.' });
    } catch (err) {
      setMsg({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Your profile" />
      <Card>
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={user.name} size="lg" />
          <div>
            <p className="font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            <Badge tone={user.role === 'ADMIN' ? 'violet' : user.role === 'HOST' ? 'blue' : 'slate'}>{user.role}</Badge>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4">
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Field label="Display name"><Input minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Change password (optional)</legend>
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></Field>
            <Field label="New password" hint="At least 8 characters with a letter and a number."><Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></Field>
          </fieldset>
          <Button type="submit" loading={busy}>Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
