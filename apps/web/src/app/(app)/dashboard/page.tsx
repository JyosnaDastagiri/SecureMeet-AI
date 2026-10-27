'use client';
import { CalendarPlus, Mail } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { MeetingListItem, MyInvitation } from '@/lib/types';
import { MeetingCard } from '@/components/MeetingCard';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { Button } from '@/components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [m, inv] = await Promise.all([api<MeetingListItem[]>('/meetings?scope=upcoming'), api<MyInvitation[]>('/invitations')]);
        setMeetings(m);
        setPending(inv.filter((i) => i.status === 'PENDING').length);
      } catch (e) {
        setError((e as Error).message);
        setMeetings([]);
      }
    })();
  }, []);

  const canCreate = user?.role !== 'PARTICIPANT';

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle="Your upcoming and live meetings"
        actions={
          canCreate ? (
            <Link href="/meetings/new">
              <Button><CalendarPlus className="h-4 w-4" aria-hidden /> Schedule meeting</Button>
            </Link>
          ) : undefined
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {pending > 0 && (
        <Link href="/invitations" className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Mail className="h-4 w-4" aria-hidden />
          You have {pending} pending invitation{pending > 1 ? 's' : ''}. Review them →
        </Link>
      )}
      {meetings === null ? (
        <Spinner />
      ) : meetings.length === 0 ? (
        <EmptyState
          title="No upcoming meetings"
          text={canCreate ? 'Schedule a meeting and invite registered users.' : 'When a host invites you, the meeting will appear here after you accept.'}
          action={canCreate ? <Link href="/meetings/new"><Button>Schedule a meeting</Button></Link> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}
      <Card className="mt-8 bg-slate-50 text-sm text-slate-600">
        Tip: devices (microphone, camera) stay off until you turn them on inside the meeting. Meetings are never recorded.
      </Card>
    </>
  );
}
