'use client';
import { Clock, Lock, ShieldAlert, Trash2, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime, formatDuration, fromLocalInput, toLocalInput } from '@/lib/format';
import type { MeetingDetail, MeetingReport, UserBrief } from '@/lib/types';
import { InvitePicker } from '@/components/InvitePicker';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner, statusTone, Textarea } from '@/components/ui';

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [newInvitees, setNewInvitees] = useState<UserBrief[]>([]);
  const [report, setReport] = useState<MeetingReport | null>(null);

  const load = useCallback(async () => {
    try {
      setMeeting(await api<MeetingDetail>(`/meetings/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isManager = meeting?.access === 'HOST' || meeting?.access === 'ADMIN';
  const showReport = isManager && (meeting?.status === 'LIVE' || meeting?.status === 'ENDED');

  useEffect(() => {
    if (!showReport) return;
    api<MeetingReport>(`/meetings/${id}/report`).then(setReport).catch(() => setReport(null));
  }, [showReport, id, meeting?.status]);

  const act = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      if (success) setNotice(success);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!meeting) return error ? <Alert tone="error">{error}</Alert> : <Spinner />;

  const active = meeting.status === 'SCHEDULED' || meeting.status === 'LIVE';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={meeting.title}
        subtitle={`Hosted by ${meeting.host.name}`}
        actions={
          meeting.canJoin ? (
            <Link href={`/meetings/${meeting.id}/room`}>
              <Button><Video className="h-4 w-4" aria-hidden /> {meeting.access === 'HOST' ? (meeting.status === 'LIVE' ? 'Rejoin' : 'Start meeting') : 'Join'}</Button>
            </Link>
          ) : undefined
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {meeting.access === 'INVITEE' && meeting.myInvitationStatus === 'PENDING' && active && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>You have been invited to this meeting.</span>
            <span className="flex gap-2">
              <Button loading={busy === 'accept'} onClick={() => act('accept', () => api(`/invitations/${meeting.myInvitationId}/accept`, { method: 'POST' }), 'Invitation accepted.')}>Accept</Button>
              <Button variant="secondary" loading={busy === 'decline'} onClick={() => act('decline', () => api(`/invitations/${meeting.myInvitationId}/decline`, { method: 'POST' }), 'Invitation declined.')}>Decline</Button>
            </span>
          </div>
        </Alert>
      )}
      {meeting.access === 'INVITEE' && meeting.status === 'SCHEDULED' && meeting.canJoin && (
        <Alert tone="info">The host has not started the meeting yet. You can join once the status shows LIVE.</Alert>
      )}

      <Card>
        {editing && isManager ? (
          <EditForm meeting={meeting} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); setNotice('Meeting updated.'); await load(); }} />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <Badge tone={statusTone(meeting.status)}>{meeting.status}</Badge>
              {isManager && active && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
            </div>
            {meeting.description && <p className="text-slate-700">{meeting.description}</p>}
            <p className="flex items-center gap-2 text-slate-600"><Clock className="h-4 w-4" aria-hidden /> {formatDateTime(meeting.scheduledStart)}{meeting.scheduledEnd ? ` – ${formatDateTime(meeting.scheduledEnd)}` : ''}</p>
            <p className="flex items-center gap-2 text-slate-600"><Lock className="h-4 w-4" aria-hidden /> Waiting room: {meeting.waitingRoomEnabled ? 'on' : 'off'}</p>
            <p className="flex items-center gap-2 text-slate-600"><ShieldAlert className="h-4 w-4" aria-hidden /> Chat moderation: {meeting.moderationEnabled ? 'on (rule-based)' : 'off'}</p>
            {meeting.startedAt && <p className="text-slate-600">Started {formatDateTime(meeting.startedAt)}{meeting.endedAt ? ` · Ended ${formatDateTime(meeting.endedAt)}` : ''}</p>}
          </div>
        )}
      </Card>

      {isManager && (
        <Card>
          <h2 className="font-semibold text-slate-900">Invitations ({meeting.invitations.length})</h2>
          {meeting.invitations.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nobody has been invited yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {meeting.invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span><span className="font-medium">{inv.invitee.name}</span> <span className="text-slate-500">{inv.invitee.email}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                    {active && (
                      <button className="rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Revoke invitation for ${inv.invitee.name}`} onClick={() => act(`rev-${inv.id}`, () => api(`/meetings/${id}/invitations/${inv.id}`, { method: 'DELETE' }), 'Invitation revoked.')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {active && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Invite more people</p>
              <InvitePicker selected={newInvitees} onChange={setNewInvitees} excludeIds={meeting.invitations.map((i) => i.invitee.id)} />
              {newInvitees.length > 0 && (
                <Button className="mt-3" loading={busy === 'invite'} onClick={() => act('invite', async () => { await api(`/meetings/${id}/invite`, { body: { userIds: newInvitees.map((u) => u.id) } }); setNewInvitees([]); }, 'Invitations sent.')}>
                  Send {newInvitees.length} invitation{newInvitees.length > 1 ? 's' : ''}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {isManager && active && (
        <Card>
          <h2 className="font-semibold text-slate-900">{meeting.status === 'LIVE' ? 'End meeting' : 'Cancel meeting'}</h2>
          <p className="mt-1 text-sm text-slate-500">{meeting.status === 'LIVE' ? 'Ends the meeting for everyone and closes attendance records.' : 'Cancels this scheduled meeting.'}</p>
          <Button variant="danger" className="mt-3" loading={busy === 'end'} onClick={() => { if (confirm('Are you sure?')) act('end', () => api(`/meetings/${id}/end`, { method: 'POST' }), 'Meeting closed.'); }}>
            {meeting.status === 'LIVE' ? 'End for everyone' : 'Cancel meeting'}
          </Button>
        </Card>
      )}

      {report && <ReportCard report={report} />}
    </div>
  );
}

function EditForm({ meeting, onCancel, onSaved }: { meeting: MeetingDetail; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description ?? '');
  const [start, setStart] = useState(toLocalInput(new Date(meeting.scheduledStart)));
  const [end, setEnd] = useState(meeting.scheduledEnd ? toLocalInput(new Date(meeting.scheduledEnd)) : '');
  const [waiting, setWaiting] = useState(meeting.waitingRoomEnabled);
  const [moderation, setModeration] = useState(meeting.moderationEnabled);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/meetings/${meeting.id}`, {
        method: 'PATCH',
        body: { title: title.trim(), description: description.trim(), scheduledStart: fromLocalInput(start), scheduledEnd: end ? fromLocalInput(end) : undefined, waitingRoomEnabled: waiting, moderationEnabled: moderation },
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /> Waiting room</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={moderation} onChange={(e) => setModeration(e.target.checked)} /> Chat moderation</label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button loading={busy} onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: MeetingReport }) {
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Attendance &amp; engagement</h2>
      <p className="mt-1 text-sm text-slate-500">
        Duration {formatDuration(report.meeting.durationSeconds)} · {report.totalMessages} chat messages · {report.pollsTotal} poll(s)
      </p>
      {report.participants.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No attendance recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Participant</th><th className="pr-3">First joined</th><th className="pr-3">Time in meeting</th><th className="pr-3">Messages</th><th className="pr-3">Votes</th><th>Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.participants.map((r) => (
                <tr key={r.user.id}>
                  <td className="py-2 pr-3 font-medium">{r.user.name}</td>
                  <td className="pr-3">{formatDateTime(r.firstJoinedAt)}</td>
                  <td className="pr-3">{formatDuration(r.attendedSeconds)} ({r.attendancePercent}%)</td>
                  <td className="pr-3">{r.messages}</td>
                  <td className="pr-3">{r.votes}</td>
                  <td><Badge tone={r.engagement.label === 'High' ? 'green' : r.engagement.label === 'Medium' ? 'amber' : 'red'}>{r.engagement.label} · {r.engagement.score}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{report.method}</p>
    </Card>
  );
}
