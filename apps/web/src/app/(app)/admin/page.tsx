'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { Role } from '@/lib/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner, statusTone } from '@/components/ui';

type Tab = 'overview' | 'users' | 'meetings' | 'moderation' | 'audit';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ['users', 'Users'], ['meetings', 'Meetings'], ['moderation', 'Moderation'], ['audit', 'Audit log']];
  return (
    <RequireAuth roles={['ADMIN']}>
      <PageHeader title="Administrator dashboard" subtitle="Manage users, meetings and moderation. Every change here is written to the audit log." />
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <Users />}
      {tab === 'meetings' && <Meetings />}
      {tab === 'moderation' && <Moderation />}
      {tab === 'audit' && <Audit />}
    </RequireAuth>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      setData(await api<T>(path));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

function Overview() {
  const { data, error } = useLoad<{
    users: number; usersByRole: Record<string, number>; meetingsByStatus: Record<string, number>; meetingsCreatedLast7Days: number;
    totalChatMessages: number; moderationEvents: number; totalAttendanceMinutes: number;
  }>('/admin/stats');
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  const stat = (label: string, value: number | string) => (
    <Card key={label}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat('Registered users', data.users)}
        {stat('Meetings (last 7 days)', data.meetingsCreatedLast7Days)}
        {stat('Chat messages', data.totalChatMessages)}
        {stat('Moderation events', data.moderationEvents)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="mb-2 font-semibold">Users by role</p>{Object.entries(data.usersByRole).map(([k, v]) => <p key={k} className="text-sm text-slate-600">{k}: {v}</p>)}</Card>
        <Card><p className="mb-2 font-semibold">Meetings by status</p>{Object.keys(data.meetingsByStatus).length === 0 ? <p className="text-sm text-slate-500">None yet</p> : Object.entries(data.meetingsByStatus).map(([k, v]) => <p key={k} className="text-sm text-slate-600">{k}: {v}</p>)}</Card>
        <Card><p className="mb-2 font-semibold">Total attendance</p><p className="text-sm text-slate-600">{data.totalAttendanceMinutes} minutes across completed sessions</p></Card>
      </div>
    </div>
  );
}

function Users() {
  const { user: me } = useAuth();
  const { data, error, reload } = useLoad<Array<{ id: string; email: string; name: string; role: Role; isActive: boolean; createdAt: string; _count: { hostedMeetings: number } }>>('/admin/users');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const update = async (id: string, body: { role?: Role; isActive?: boolean }) => {
    setErr('');
    setMsg('');
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      setMsg('User updated.');
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      {msg && <Alert tone="success">{msg}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">User</th><th>Role</th><th>Status</th><th>Hosted</th><th>Joined</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><p className="font-medium">{u.name}</p><p className="text-slate-500">{u.email}</p></td>
                <td>
                  <select aria-label={`Role for ${u.name}`} disabled={u.id === me?.id} value={u.role} onChange={(e) => update(u.id, { role: e.target.value as Role })} className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100">
                    <option value="PARTICIPANT">PARTICIPANT</option><option value="HOST">HOST</option><option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>
                  <Button variant={u.isActive ? 'secondary' : 'primary'} disabled={u.id === me?.id} onClick={() => update(u.id, { isActive: !u.isActive })}>{u.isActive ? 'Deactivate' : 'Activate'}</Button>
                </td>
                <td>{u._count.hostedMeetings}</td>
                <td className="pr-4 text-slate-500">{formatDateTime(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Meetings() {
  const { data, error, reload } = useLoad<Array<{ id: string; title: string; status: string; scheduledStart: string; host: { name: string }; _count: { invitations: number; chatMessages: number } }>>('/admin/meetings');
  const [err, setErr] = useState('');
  const end = async (id: string) => {
    if (!confirm('End or cancel this meeting?')) return;
    try {
      await api(`/admin/meetings/${id}/end`, { method: 'POST' });
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      {err && <Alert tone="error">{err}</Alert>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Meeting</th><th>Host</th><th>Status</th><th>Invited</th><th>Messages</th><th>Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No meetings yet.</td></tr>}
            {data.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3"><p className="font-medium">{m.title}</p><p className="text-slate-500">{formatDateTime(m.scheduledStart)}</p></td>
                <td>{m.host.name}</td>
                <td><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                <td>{m._count.invitations}</td>
                <td>{m._count.chatMessages}</td>
                <td>{(m.status === 'LIVE' || m.status === 'SCHEDULED') && <Button variant="danger" onClick={() => end(m.id)}>{m.status === 'LIVE' ? 'End' : 'Cancel'}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Moderation() {
  const settings = useLoad<{ enabled: boolean; warnThreshold: number; blockThreshold: number; customTerms: string[] }>('/admin/moderation/settings');
  const events = useLoad<Array<{ id: string; createdAt: string; categories: string[]; severity: string; score: number; action: string; excerpt: string; user: { name: string }; meeting: { title: string } }>>('/admin/moderation/events');
  const [form, setForm] = useState<{ enabled: boolean; warn: string; block: string; terms: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (settings.data) setForm({ enabled: settings.data.enabled, warn: String(settings.data.warnThreshold), block: String(settings.data.blockThreshold), terms: settings.data.customTerms.join(', ') });
  }, [settings.data]);

  const save = async () => {
    if (!form) return;
    setMsg(null);
    try {
      await api('/admin/moderation/settings', {
        method: 'PUT',
        body: { enabled: form.enabled, warnThreshold: Number(form.warn), blockThreshold: Number(form.block), customTerms: form.terms.split(',').map((t) => t.trim()).filter(Boolean) },
      });
      setMsg({ tone: 'success', text: 'Moderation settings saved (applies within 30 seconds).' });
      await settings.reload();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    }
  };

  if (settings.error) return <Alert tone="error">{settings.error}</Alert>;
  if (!form) return <Spinner />;
  return (
    <div className="space-y-5">
      <Alert tone="info">This is a <strong>local rule-based</strong> filter, not a machine-learning model. Each matched term adds to a 0–1 score: profanity 0.4, insult 0.5, threat 1.0, custom 0.6. A score at or above the warn threshold flags the message; at or above the block threshold the message is not delivered. Only a masked excerpt is stored.</Alert>
      <Card className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Moderation enabled globally</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Warn threshold (0–1)"><Input type="number" step="0.05" min="0" max="1" value={form.warn} onChange={(e) => setForm({ ...form, warn: e.target.value })} /></Field>
          <Field label="Block threshold (0–1)"><Input type="number" step="0.05" min="0" max="1" value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} /></Field>
        </div>
        <Field label="Custom blocked terms" hint="Comma-separated words or phrases."><Input value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></Field>
        <Button onClick={save}>Save settings</Button>
      </Card>
      <Card className="overflow-x-auto p-0">
        <p className="px-4 pt-4 font-semibold">Recent moderation events</p>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">When</th><th>User</th><th>Meeting</th><th>Action</th><th>Score</th><th>Categories</th><th>Masked excerpt</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {events.data?.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>No events yet.</td></tr>}
            {events.data?.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">{formatDateTime(e.createdAt)}</td><td>{e.user.name}</td><td>{e.meeting.title}</td>
                <td><Badge tone={e.action === 'BLOCK' ? 'red' : 'amber'}>{e.action}</Badge></td><td>{e.score}</td><td>{e.categories.join(', ')}</td><td className="font-mono text-xs">{e.excerpt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Audit() {
  const { data, error } = useLoad<Array<{ id: string; createdAt: string; action: string; entity: string; entityId: string | null; actor: { name: string; email: string } | null; metadata: unknown }>>('/admin/audit-logs?limit=150');
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
              <td>{l.actor ? l.actor.name : <span className="text-slate-400">system / anonymous</span>}</td>
              <td className="font-mono text-xs">{l.action}</td>
              <td className="text-slate-500">{l.entity}</td>
              <td className="max-w-xs truncate font-mono text-xs text-slate-500">{l.metadata ? JSON.stringify(l.metadata) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
