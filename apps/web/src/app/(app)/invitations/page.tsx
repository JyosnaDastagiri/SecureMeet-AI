'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { MyInvitation } from '@/lib/types';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, statusTone } from '@/components/ui';
import { getSharedSocketListener } from '@/lib/notify';

export default function InvitationsPage() {
  const [items, setItems] = useState<MyInvitation[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await api<MyInvitation[]>('/invitations'));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
    // Live updates: the API pushes "invitation:new" to the invited user's socket.
    return getSharedSocketListener(() => load());
  }, [load]);

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setBusy(id + action);
    setError('');
    try {
      await api(`/invitations/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="Invitations" subtitle="Meetings you have been invited to" />
      {error && <Alert tone="error">{error}</Alert>}
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No invitations" text="When a host invites you to a meeting it will show up here." />
      ) : (
        <div className="space-y-3">
          {items.map((inv) => (
            <Card key={inv.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link href={`/meetings/${inv.meeting.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{inv.meeting.title}</Link>
                <p className="text-sm text-slate-500">{inv.meeting.host.name} · {formatDateTime(inv.meeting.scheduledStart)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(inv.meeting.status)}>{inv.meeting.status}</Badge>
                <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                {inv.status !== 'ACCEPTED' && <Button loading={busy === inv.id + 'accept'} onClick={() => respond(inv.id, 'accept')}>Accept</Button>}
                {inv.status !== 'DECLINED' && <Button variant="secondary" loading={busy === inv.id + 'decline'} onClick={() => respond(inv.id, 'decline')}>Decline</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
