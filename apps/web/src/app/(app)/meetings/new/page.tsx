'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import type { UserBrief } from '@/lib/types';
import { InvitePicker } from '@/components/InvitePicker';
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from '@/components/ui';

export default function NewMeeting() {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + 10 * 60 * 1000)));
  const [end, setEnd] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [moderation, setModeration] = useState(true);
  const [invitees, setInvitees] = useState<UserBrief[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'PARTICIPANT') {
    return <Alert tone="warning">Only hosts and administrators can schedule meetings. Register a host account or ask an administrator to change your role.</Alert>;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>('/meetings', {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledStart: fromLocalInput(start),
          scheduledEnd: end ? fromLocalInput(end) : undefined,
          waitingRoomEnabled: waitingRoom,
          moderationEnabled: moderation,
          inviteeIds: invitees.map((i) => i.id),
        },
      });
      router.push(`/meetings/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Schedule a meeting" subtitle="Only invited users can join. Invitations are in-app." />
      <Card>
        <form onSubmit={submit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Title">
            <Input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Description (optional)">
            <Textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start">
              <Input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End (optional)">
              <Input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Safety settings</legend>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={waitingRoom} onChange={(e) => setWaitingRoom(e.target.checked)} />
              <span><strong>Waiting room.</strong> Invited people wait until you admit them.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={moderation} onChange={(e) => setModeration(e.target.checked)} />
              <span><strong>Chat moderation.</strong> Rule-based detection of abusive language in chat (not recorded audio or video).</span>
            </label>
          </fieldset>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Invite participants</p>
            <InvitePicker selected={invitees} onChange={setInvitees} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" loading={busy}>Create meeting</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
