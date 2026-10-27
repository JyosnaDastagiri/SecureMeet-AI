'use client';
import { Check, Crown, MicOff, Send, ShieldAlert, UserX, VolumeX, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMsg, ModerationAlert, PollView, RemotePeer } from '@/lib/useMeetingRoom';
import { Avatar, Button } from './ui';

export function VideoTile({
  name,
  stream,
  muted,
  videoOn,
  audioOn,
  isHost,
  isLocal,
  label,
}: {
  name: string;
  stream?: MediaStream | null;
  muted?: boolean;
  videoOn: boolean;
  audioOn?: boolean;
  isHost?: boolean;
  isLocal?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== (stream ?? null)) el.srcObject = stream ?? null;
  }, [stream]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-800 ring-1 ring-white/10">
      {/* The <video> stays mounted (hidden when the camera is off) so remote audio keeps playing. */}
      <video ref={ref} autoPlay playsInline muted={muted} className={videoOn ? `h-full w-full ${label ? 'object-contain' : 'object-cover'} ${isLocal && !label ? '-scale-x-100' : ''}` : 'hidden'} />
      {!videoOn && (
        <div className="absolute inset-0 grid place-items-center">
          <Avatar name={name} size="lg" />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
        {isHost && <Crown className="h-3 w-3 text-amber-300" aria-label="Host" />}
        <span className="max-w-[10rem] truncate">{label ?? name}{isLocal && !label ? ' (you)' : ''}</span>
        {audioOn === false && !label && <MicOff className="h-3 w-3 text-red-300" aria-label="Muted" />}
      </div>
    </div>
  );
}

export function ChatPanel({ messages, selfId, onSend }: { messages: ChatMsg[]; selfId: string; onSend: (text: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError('');
    const res = await onSend(content);
    setBusy(false);
    if (res.ok) setText('');
    else setError(res.error ?? 'Message not sent');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No messages yet. Say hello!</p>}
        {messages.map((m) => (
          <div key={m.id} className={`text-sm ${m.userId === selfId ? 'text-right' : ''}`}>
            <p className="text-xs text-slate-400">{m.userId === selfId ? 'You' : m.name} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className={`mt-0.5 inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-left ${m.userId === selfId ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-100'}`}>{m.content}</p>
            {m.flagged && <p className="text-[11px] text-amber-400">flagged for host review</p>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="border-t border-white/10 p-3">
        {error && <p className="mb-2 text-xs text-red-400" role="alert">{error}</p>}
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type a message" aria-label="Chat message" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
          <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-brand-600 px-3 text-white hover:bg-brand-500 disabled:opacity-50" aria-label="Send message"><Send className="h-4 w-4" /></button>
        </div>
      </form>
    </div>
  );
}

export function PeoplePanel({
  isHost, selfId, selfName, peers, waiting, alerts, onAdmit, onDeny, onRemove, onMute, onMuteAll,
}: {
  isHost: boolean; selfId: string; selfName: string; peers: RemotePeer[]; waiting: Array<{ userId: string; name: string }>; alerts: ModerationAlert[];
  onAdmit: (id: string) => void; onDeny: (id: string) => void; onRemove: (id: string) => void; onMute: (id: string) => void; onMuteAll: () => void;
}) {
  return (
    <div className="h-full space-y-5 overflow-y-auto p-3 text-sm">
      {isHost && waiting.length > 0 && (
        <section aria-label="Waiting room">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">Waiting room ({waiting.length})</h3>
          <ul className="space-y-2">
            {waiting.map((w) => (
              <li key={w.userId} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
                <span className="truncate">{w.name}</span>
                <span className="flex gap-1">
                  <button onClick={() => onAdmit(w.userId)} className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-500" aria-label={`Admit ${w.name}`}><Check className="h-4 w-4" /></button>
                  <button onClick={() => onDeny(w.userId)} className="rounded bg-red-600 p-1.5 text-white hover:bg-red-500" aria-label={`Deny ${w.name}`}><X className="h-4 w-4" /></button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Participants">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">In the meeting ({peers.length + 1})</h3>
          {isHost && peers.length > 0 && <button onClick={onMuteAll} className="inline-flex items-center gap-1 text-xs text-brand-300 hover:text-brand-200"><VolumeX className="h-3.5 w-3.5" /> Ask all to mute</button>}
        </div>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 rounded-lg bg-white/5 p-2"><Avatar name={selfName} size="sm" /> <span className="truncate">{selfName} (you)</span></li>
          {peers.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
              <span className="flex min-w-0 items-center gap-2"><Avatar name={p.name} size="sm" /><span className="truncate">{p.name}</span>{p.isHost && <Crown className="h-3.5 w-3.5 text-amber-300" aria-label="Host" />}{!p.audio && <MicOff className="h-3.5 w-3.5 text-slate-400" aria-label="Muted" />}</span>
              {isHost && p.userId !== selfId && (
                <span className="flex gap-1">
                  <button onClick={() => onMute(p.userId)} className="rounded p-1.5 text-slate-300 hover:bg-white/10" aria-label={`Ask ${p.name} to mute`} title="Ask to mute"><MicOff className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Remove ${p.name} from the meeting?`)) onRemove(p.userId); }} className="rounded p-1.5 text-red-300 hover:bg-white/10" aria-label={`Remove ${p.name}`} title="Remove"><UserX className="h-4 w-4" /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {isHost && (
        <section aria-label="Moderation alerts">
          <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400"><ShieldAlert className="h-3.5 w-3.5" /> Moderation alerts</h3>
          {alerts.length === 0 ? <p className="text-xs text-slate-500">None so far. Detection is rule-based and applies to chat text only.</p> : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="rounded-lg bg-red-500/10 p-2 text-xs text-red-200">
                  <p className="font-semibold">{a.name} · {a.action === 'BLOCK' ? 'message blocked' : 'message flagged'} · {a.categories.join(', ')}</p>
                  <p className="mt-0.5 font-mono text-red-300">{a.excerpt}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export function PollsPanel({
  polls, isHost, onCreate, onVote, onClose,
}: {
  polls: PollView[]; isHost: boolean;
  onCreate: (q: string, options: string[]) => Promise<{ ok: boolean; error?: string }>;
  onVote: (pollId: string, optionId: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: (pollId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await onCreate(question.trim(), options.map((o) => o.trim()).filter(Boolean));
    if (res.ok) {
      setCreating(false);
      setQuestion('');
      setOptions(['', '']);
    } else setError(res.error ?? 'Could not create the poll');
  };
  const vote = async (pollId: string, optionId: string) => {
    const res = await onVote(pollId, optionId);
    if (!res.ok) setError(res.error ?? 'Vote failed');
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-3 text-sm">
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      {isHost && !creating && <Button className="w-full" onClick={() => setCreating(true)}>Create a poll</Button>}
      {isHost && creating && (
        <form onSubmit={create} className="space-y-2 rounded-lg bg-white/5 p-3">
          <input required minLength={3} maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question" aria-label="Poll question" className="w-full rounded border border-white/10 bg-ink-900 px-2 py-1.5 text-white" />
          {options.map((o, i) => (
            <input key={i} value={o} maxLength={100} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className="w-full rounded border border-white/10 bg-ink-900 px-2 py-1.5 text-white" />
          ))}
          {options.length < 6 && <button type="button" className="text-xs text-brand-300" onClick={() => setOptions([...options, ''])}>+ Add option</button>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="text-slate-300" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Launch</Button></div>
        </form>
      )}
      {polls.length === 0 && !creating && <p className="py-6 text-center text-slate-400">No polls yet.</p>}
      {[...polls].reverse().map((p) => {
        const voted = !!p.myVoteOptionId;
        const canVote = p.isOpen && !voted;
        return (
          <div key={p.id} className="rounded-lg bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white">{p.question}</p>
              {!p.isOpen && <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] uppercase">Closed</span>}
            </div>
            <ul className="mt-2 space-y-2">
              {p.options.map((o) => {
                const pct = p.totalVotes ? Math.round((o.votes / p.totalVotes) * 100) : 0;
                const mine = p.myVoteOptionId === o.id;
                return (
                  <li key={o.id}>
                    <button disabled={!canVote} onClick={() => vote(p.id, o.id)} className={`relative w-full overflow-hidden rounded border px-3 py-2 text-left ${mine ? 'border-brand-400' : 'border-white/10'} ${canVote ? 'hover:bg-white/10' : 'cursor-default'}`}>
                      <span className="absolute inset-y-0 left-0 bg-brand-600/30" style={{ width: `${pct}%` }} aria-hidden />
                      <span className="relative flex justify-between gap-2"><span>{o.text}{mine && ' ✓'}</span><span className="text-slate-300">{o.votes} · {pct}%</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{p.totalVotes} vote{p.totalVotes === 1 ? '' : 's'}{canVote ? ' · choose one (final)' : ''}</span>
              {isHost && p.isOpen && <button onClick={() => onClose(p.id)} className="text-brand-300 hover:text-brand-200">Close poll</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
