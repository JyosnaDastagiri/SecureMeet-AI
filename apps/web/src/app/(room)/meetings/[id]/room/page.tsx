'use client';
import { LogOut, MessageSquare, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Smile, Users, Video, VideoOff, BarChart3, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useMeetingRoom } from '@/lib/useMeetingRoom';
import { ChatPanel, PeoplePanel, PollsPanel, VideoTile } from '@/components/room';
import { Alert, Button, Spinner } from '@/components/ui';

type Tab = 'chat' | 'people' | 'polls';
const EMOJIS = ['👍', '👏', '❤️', '😂', '🎉', '😮'];

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [entered, setEntered] = useState(false);
  const room = useMeetingRoom(id, entered);
  const [tab, setTab] = useState<Tab>('chat');
  const [panelOpen, setPanelOpen] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);

  // ----- pre-join screen (also gives the browser the user gesture it needs to play audio) -----
  if (!entered) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl bg-ink-800 p-8 text-center ring-1 ring-white/10">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600"><Video className="h-6 w-6" /></span>
          <h1 className="mt-4 text-xl font-bold">Ready to join?</h1>
          <p className="mt-2 text-sm text-slate-300">Your microphone and camera stay <strong>off</strong> until you turn them on inside the meeting. Nothing is recorded.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => setEntered(true)}>Join meeting</Button>
            <Link href={`/meetings/${id}`} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Back to details</Link>
          </div>
        </div>
      </Shell>
    );
  }

  const exit = async () => {
    await room.leave();
    router.push(`/meetings/${id}`);
  };

  // ----- terminal / transitional states -----
  const endState: Record<string, { title: string; text: string }> = {
    denied: { title: 'Entry denied', text: 'The host did not admit you to this meeting.' },
    removed: { title: 'You were removed', text: 'The host removed you from this meeting.' },
    ended: { title: 'Meeting ended', text: 'The meeting has ended. Thanks for joining!' },
    replaced: { title: 'Joined elsewhere', text: 'You joined this meeting from another tab or device, so this session was closed.' },
  };
  if (endState[room.phase]) {
    const s = endState[room.phase];
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl bg-ink-800 p-8 text-center ring-1 ring-white/10">
          <h1 className="text-xl font-bold">{s.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{s.text}</p>
          <Link href={`/meetings/${id}`} className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold hover:bg-brand-500">Back to meeting</Link>
        </div>
      </Shell>
    );
  }
  if (room.phase === 'error') {
    return (
      <Shell>
        <div className="mx-auto max-w-md space-y-4">
          <Alert tone="error">{room.error ?? 'Something went wrong.'}</Alert>
          <div className="flex gap-2">
            <Button onClick={() => { setEntered(false); }}>Try again</Button>
            <Link href={`/meetings/${id}`} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Back to details</Link>
          </div>
        </div>
      </Shell>
    );
  }
  if (room.phase === 'waiting') {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl bg-ink-800 p-8 text-center ring-1 ring-white/10">
          <Spinner label="" />
          <h1 className="text-xl font-bold">Waiting for the host</h1>
          <p className="mt-2 text-sm text-slate-300">The host will let you in shortly. Keep this tab open.</p>
          <Button variant="secondary" className="mt-6" onClick={exit}>Leave waiting room</Button>
        </div>
      </Shell>
    );
  }
  if (room.phase !== 'joined') {
    return (
      <Shell>
        <Spinner label={room.error ?? 'Connecting to the meeting…'} />
      </Shell>
    );
  }

  const peerList = Object.values(room.peers);
  const tiles = 1 + peerList.length + peerList.filter((p) => p.screen).length + (room.local.screen ? 1 : 0);
  const gridCols = tiles <= 1 ? 'grid-cols-1 max-w-3xl' : tiles <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';

  const ctrl = (active: boolean, danger = false) =>
    `grid h-12 w-12 place-items-center rounded-full transition ${danger ? 'bg-red-600 hover:bg-red-500' : active ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600/90 hover:bg-red-500'}`;

  return (
    <Shell>
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{room.title}</h1>
            <p className="text-xs text-slate-400">{peerList.length + 1} in meeting · rule-based chat moderation {room.moderationOn ? 'on' : 'off'} · not recorded</p>
          </div>
          <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" onClick={() => setPanelOpen((v) => !v)} aria-label="Toggle side panel"><MessageSquare className="h-5 w-5" /></button>
        </header>

        {/* notices */}
        <div className="pointer-events-none absolute right-4 top-16 z-40 w-80 space-y-2" aria-live="polite">
          {room.notices.map((n) => (
            <div key={n.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2 text-sm shadow-lg ${n.kind === 'alert' ? 'bg-red-600' : n.kind === 'warning' ? 'bg-amber-500 text-black' : 'bg-slate-700'}`}>
              <span className="flex-1">{n.text}</span>
              <button onClick={() => room.dismissNotice(n.id)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {/* floating reactions */}
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2" aria-hidden>
          {room.reactions.map((r, i) => (
            <span key={r.id} className="animate-float-up absolute text-4xl" style={{ left: `${(i % 6) * 36 - 90}px` }} title={r.name}>{r.emoji}</span>
          ))}
        </div>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-4">
            <div className={`grid w-full gap-3 ${gridCols}`}>
              {room.local.screen && <VideoTile name={user?.name ?? 'You'} stream={room.localScreen} muted videoOn audioOn label="Your screen" />}
              <VideoTile name={user?.name ?? 'You'} stream={room.localCam} muted isLocal videoOn={room.local.video} audioOn={room.local.audio} isHost={room.isHost} />
              {peerList.map((p) => (
                <VideoTile key={p.userId} name={p.name} stream={p.stream} videoOn={p.video} audioOn={p.audio} isHost={p.isHost} />
              ))}
              {peerList.filter((p) => p.screen).map((p) => (
                <VideoTile key={`${p.userId}-screen`} name={p.name} stream={p.screenStream} videoOn audioOn label={`${p.name}'s screen`} />
              ))}
            </div>
          </main>

          {panelOpen && (
            <aside className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-full flex-col border-l border-white/10 bg-ink-900 pt-14 lg:static lg:pt-0" aria-label="Meeting side panel">
              <div className="flex border-b border-white/10" role="tablist">
                {([['chat', 'Chat', MessageSquare], ['people', 'People', Users], ['polls', 'Polls', BarChart3]] as const).map(([key, label, Icon]) => (
                  <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`relative flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium ${tab === key ? 'border-b-2 border-brand-400 text-white' : 'text-slate-400 hover:text-white'}`}>
                    <Icon className="h-4 w-4" aria-hidden /> {label}
                    {key === 'people' && room.isHost && room.waiting.length > 0 && <span className="absolute right-3 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">{room.waiting.length}</span>}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                {tab === 'chat' && <ChatPanel messages={room.messages} selfId={room.selfId} onSend={room.sendChat} />}
                {tab === 'people' && (
                  <PeoplePanel isHost={room.isHost} selfId={room.selfId} selfName={user?.name ?? 'You'} peers={peerList} waiting={room.waiting} alerts={room.alerts}
                    onAdmit={(uid) => room.hostAction('host:admit', uid)} onDeny={(uid) => room.hostAction('host:deny', uid)} onRemove={(uid) => room.hostAction('host:remove', uid)}
                    onMute={(uid) => room.hostAction('host:mute', uid)} onMuteAll={() => room.muteAll()} />
                )}
                {tab === 'polls' && <PollsPanel polls={room.polls} isHost={room.isHost} onCreate={room.createPoll} onVote={room.vote} onClose={room.closePoll} />}
              </div>
            </aside>
          )}
        </div>

        <footer className="relative flex items-center justify-center gap-3 border-t border-white/10 px-4 py-3">
          <button onClick={room.toggleMic} className={ctrl(room.local.audio)} aria-pressed={room.local.audio} aria-label={room.local.audio ? 'Turn microphone off' : 'Turn microphone on'} title={room.local.audio ? 'Mute' : 'Unmute'}>
            {room.local.audio ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button onClick={room.toggleCamera} className={ctrl(room.local.video)} aria-pressed={room.local.video} aria-label={room.local.video ? 'Turn camera off' : 'Turn camera on'} title={room.local.video ? 'Stop video' : 'Start video'}>
            {room.local.video ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <button onClick={room.toggleScreen} className={`grid h-12 w-12 place-items-center rounded-full ${room.local.screen ? 'bg-brand-600 hover:bg-brand-500' : 'bg-white/10 hover:bg-white/20'}`} aria-pressed={room.local.screen} aria-label={room.local.screen ? 'Stop sharing screen' : 'Share screen'} title="Share screen">
            {room.local.screen ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowEmoji((v) => !v)} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Send a reaction" aria-expanded={showEmoji}><Smile className="h-5 w-5" /></button>
            {showEmoji && (
              <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-ink-700 p-2 shadow-xl ring-1 ring-white/10">
                {EMOJIS.map((e) => (
                  <button key={e} className="rounded-full p-1.5 text-2xl hover:bg-white/10" onClick={() => { room.sendReaction(e); setShowEmoji(false); }} aria-label={`React ${e}`}>{e}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setPanelOpen((v) => !v)} className="hidden h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20 lg:grid" aria-label="Toggle side panel"><MessageSquare className="h-5 w-5" /></button>
          <button onClick={exit} className={ctrl(true, true)} aria-label="Leave meeting" title="Leave"><LogOut className="h-5 w-5" /></button>
          {room.isHost && (
            <button onClick={() => { if (confirm('End the meeting for everyone?')) room.endMeeting(); }} className="flex h-12 items-center gap-2 rounded-full bg-red-700 px-4 text-sm font-semibold hover:bg-red-600" aria-label="End meeting for everyone">
              <PhoneOff className="h-4 w-4" /> End
            </button>
          )}
        </footer>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="relative min-h-screen bg-ink-900 p-0 text-white [&>div:not(.relative)]:mt-0 [&>div.mx-auto]:mt-24">{children}</div>;
}
