'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, tokenStore } from './api';

/**
 * Meeting room client: one Socket.IO connection + a WebRTC mesh (one RTCPeerConnection per remote peer).
 *
 * Design notes (see docs/ARCHITECTURE.md):
 *  - The newest joiner always creates the offer, so there is never an offer collision ("glare").
 *  - Every connection has 3 fixed transceivers: [0] microphone, [1] camera, [2] screen share.
 *    Turning devices on/off uses RTCRtpSender.replaceTrack(), so no renegotiation is needed.
 *  - A device is reported as ON only after getUserMedia/getDisplayMedia succeeded.
 *  - Turning a device off stops the track, which releases the camera/microphone (indicator light goes off).
 */

export type Phase = 'idle' | 'connecting' | 'waiting' | 'joined' | 'denied' | 'removed' | 'ended' | 'replaced' | 'error';

export interface MediaFlags {
  audio: boolean;
  video: boolean;
  screen: boolean;
}
export interface RemotePeer extends MediaFlags {
  userId: string;
  name: string;
  isHost: boolean;
  stream?: MediaStream;
  screenStream?: MediaStream;
}
export interface ChatMsg {
  id: string;
  userId: string;
  name: string;
  content: string;
  flagged: boolean;
  createdAt: string;
}
export interface PollView {
  id: string;
  question: string;
  isOpen: boolean;
  totalVotes: number;
  options: Array<{ id: string; text: string; votes: number }>;
  myVoteOptionId?: string | null;
}
export interface FloatingReaction {
  id: number;
  emoji: string;
  name: string;
}
export interface Notice {
  id: number;
  kind: 'info' | 'warning' | 'alert';
  text: string;
}
export interface ModerationAlert {
  id: number;
  userId: string;
  name: string;
  action: string;
  categories: string[];
  excerpt: string;
  at: string;
}

interface Snapshot {
  meeting: { id: string; title: string; hostId: string; moderationEnabled: boolean };
  selfId: string;
  isHost: boolean;
  peers: Array<{ userId: string; name: string; isHost: boolean; media: MediaFlags }>;
  messages: ChatMsg[];
  polls: PollView[];
  waiting: Array<{ userId: string; name: string }>;
}

interface PeerConn {
  pc: RTCPeerConnection;
  stream: MediaStream;
  screenStream: MediaStream;
  senders: { audio?: RTCRtpSender; cam?: RTCRtpSender; screen?: RTCRtpSender };
  pendingCandidates: RTCIceCandidateInit[];
  remoteReady: boolean;
}

type Ack = { ok: boolean; error?: string; [k: string]: any };
type DeviceKind = 'audio' | 'cam' | 'screen';

const ICE_SERVERS: RTCIceServer[] = (process.env.NEXT_PUBLIC_STUN_URLS ?? 'stun:stun.l.google.com:19302')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean)
  .map((urls) => ({ urls }));

export function describeMediaError(err: unknown, what: string): string {
  const name = (err as DOMException)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Permission to use the ${what} was denied. Allow access in your browser's site settings and try again.`;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return `No ${what} was found. Connect one and try again.`;
    case 'NotReadableError':
    case 'TrackStartError':
      return `The ${what} is in use by another application or browser. Close it there and try again.`;
    case 'OverconstrainedError':
      return `Your ${what} does not support the requested settings.`;
    case 'AbortError':
      return `The ${what} request was interrupted. Please try again.`;
    default:
      return `Could not start the ${what}${name ? ` (${name})` : ''}.`;
  }
}

export function useMeetingRoom(meetingId: string, enabled: boolean) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [selfId, setSelfId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [moderationOn, setModerationOn] = useState(false);
  const [peers, setPeers] = useState<Record<string, RemotePeer>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [polls, setPolls] = useState<PollView[]>([]);
  const [waiting, setWaiting] = useState<Array<{ userId: string; name: string }>>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [alerts, setAlerts] = useState<ModerationAlert[]>([]);
  const [local, setLocal] = useState<MediaFlags>({ audio: false, video: false, screen: false });
  const [localCam, setLocalCam] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const connsRef = useRef<Map<string, PeerConn>>(new Map());
  const tracksRef = useRef<{ audio: MediaStreamTrack | null; cam: MediaStreamTrack | null; screen: MediaStreamTrack | null }>({
    audio: null,
    cam: null,
    screen: null,
  });
  const busyRef = useRef<{ audio: boolean; cam: boolean; screen: boolean }>({ audio: false, cam: false, screen: false });
  const flagsRef = useRef<MediaFlags>({ audio: false, video: false, screen: false });
  const phaseRef = useRef<Phase>('idle');
  const idRef = useRef(1);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const pushNotice = useCallback((kind: Notice['kind'], text: string) => {
    const id = idRef.current++;
    setNotices((n) => [...n.slice(-3), { id, kind, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 9000);
  }, []);
  const dismissNotice = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  const ask = useCallback(
    (event: string, payload?: unknown): Promise<Ack> =>
      new Promise((resolve) => {
        const s = socketRef.current;
        if (!s || !s.connected) return resolve({ ok: false, error: 'Not connected to the server' });
        s.timeout(8000).emit(event, payload, (err: Error | null, res: Ack) => resolve(err ? { ok: false, error: 'The server did not respond' } : res));
      }),
    [],
  );

  const signal = useCallback((to: string, data: { type: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RTCIceCandidateInit }) => {
    socketRef.current?.emit('rtc:signal', { to, data });
  }, []);

  // ---------- local media bookkeeping ----------
  const applyTrack = useCallback((kind: DeviceKind, track: MediaStreamTrack | null) => {
    tracksRef.current[kind] = track;
    connsRef.current.forEach((c) => c.senders[kind]?.replaceTrack(track).catch(() => undefined));
  }, []);

  const setFlags = useCallback((patch: Partial<MediaFlags>) => {
    flagsRef.current = { ...flagsRef.current, ...patch };
    setLocal(flagsRef.current);
    if (phaseRef.current === 'joined') socketRef.current?.emit('media:state', flagsRef.current);
  }, []);

  const stopDevice = useCallback(
    (kind: DeviceKind) => {
      const t = tracksRef.current[kind];
      if (t) {
        t.onended = null;
        t.stop();
      }
      applyTrack(kind, null);
      if (kind === 'audio') setFlags({ audio: false });
      if (kind === 'cam') {
        setLocalCam(null);
        setFlags({ video: false });
      }
      if (kind === 'screen') {
        setLocalScreen(null);
        setFlags({ screen: false });
      }
    },
    [applyTrack, setFlags],
  );

  const startDevice = useCallback(
    async (kind: DeviceKind) => {
      if (busyRef.current[kind]) return; // prevents duplicate getUserMedia calls from double clicks
      busyRef.current[kind] = true;
      try {
        const md = navigator.mediaDevices;
        if (!md || (kind !== 'screen' && !md.getUserMedia)) {
          pushNotice('warning', 'Media devices are unavailable. Use a modern browser on http://localhost or HTTPS.');
          return;
        }
        let stream: MediaStream;
        if (kind === 'screen') {
          if (!md.getDisplayMedia) {
            pushNotice('warning', 'Screen sharing is not supported in this browser.');
            return;
          }
          stream = await md.getDisplayMedia({ video: true, audio: false });
        } else if (kind === 'audio') {
          stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        } else {
          stream = await md.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } });
        }
        const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (!track) throw new DOMException('No track', 'NotFoundError');
        if (phaseRef.current === 'idle' || phaseRef.current === 'ended' || socketRef.current === null) {
          track.stop(); // the room was closed while the permission prompt was open
          return;
        }
        track.onended = () => {
          stopDevice(kind);
          if (kind === 'screen') pushNotice('info', 'Screen sharing stopped.');
          else pushNotice('warning', `Your ${kind === 'audio' ? 'microphone' : 'camera'} was disconnected.`);
        };
        applyTrack(kind, track);
        if (kind === 'audio') setFlags({ audio: true });
        if (kind === 'cam') {
          setLocalCam(new MediaStream([track]));
          setFlags({ video: true });
        }
        if (kind === 'screen') {
          setLocalScreen(new MediaStream([track]));
          setFlags({ screen: true });
        }
      } catch (err) {
        const what = kind === 'audio' ? 'microphone' : kind === 'cam' ? 'camera' : 'screen share';
        if ((err as DOMException)?.name === 'NotAllowedError' && kind === 'screen') {
          pushNotice('info', 'Screen sharing was cancelled.');
        } else {
          pushNotice('warning', describeMediaError(err, what));
        }
        // flags are deliberately left unchanged: a failed start never shows the device as ON
      } finally {
        busyRef.current[kind] = false;
      }
    },
    [applyTrack, pushNotice, setFlags, stopDevice],
  );

  const toggleMic = useCallback(() => (tracksRef.current.audio ? stopDevice('audio') : void startDevice('audio')), [startDevice, stopDevice]);
  const toggleCamera = useCallback(() => (tracksRef.current.cam ? stopDevice('cam') : void startDevice('cam')), [startDevice, stopDevice]);
  const toggleScreen = useCallback(() => (tracksRef.current.screen ? stopDevice('screen') : void startDevice('screen')), [startDevice, stopDevice]);

  // ---------- WebRTC mesh ----------
  const attachLocalTracks = useCallback((conn: PeerConn) => {
    (['audio', 'cam', 'screen'] as DeviceKind[]).forEach((k) => {
      const t = tracksRef.current[k];
      if (t) conn.senders[k]?.replaceTrack(t).catch(() => undefined);
    });
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const conn = connsRef.current.get(peerId);
    if (!conn) return;
    conn.pc.onicecandidate = null;
    conn.pc.ontrack = null;
    conn.pc.onconnectionstatechange = null;
    try {
      conn.pc.close();
    } catch {
      /* already closed */
    }
    connsRef.current.delete(peerId);
  }, []);

  const createConn = useCallback(
    (peerId: string): PeerConn => {
      closePeer(peerId);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const conn: PeerConn = { pc, stream: new MediaStream(), screenStream: new MediaStream(), senders: {}, pendingCandidates: [], remoteReady: false };
      pc.onicecandidate = (e) => {
        if (e.candidate) signal(peerId, { type: 'candidate', candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        const index = pc.getTransceivers().indexOf(e.transceiver);
        const target = index === 2 ? conn.screenStream : conn.stream;
        if (!target.getTracks().includes(e.track)) target.addTrack(e.track);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pushNotice('warning', 'A peer connection failed. Network restrictions may require a TURN server (see Troubleshooting).');
      };
      connsRef.current.set(peerId, conn);
      setPeers((p) => (p[peerId] ? { ...p, [peerId]: { ...p[peerId], stream: conn.stream, screenStream: conn.screenStream } } : p));
      return conn;
    },
    [closePeer, pushNotice, signal],
  );

  const startOffer = useCallback(
    async (peerId: string) => {
      const conn = createConn(peerId);
      const { pc } = conn;
      const a = pc.addTransceiver('audio', { direction: 'sendrecv' });
      const c = pc.addTransceiver('video', { direction: 'sendrecv' });
      const s = pc.addTransceiver('video', { direction: 'sendrecv' });
      conn.senders = { audio: a.sender, cam: c.sender, screen: s.sender };
      attachLocalTracks(conn);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(peerId, { type: 'offer', sdp: offer.sdp });
    },
    [attachLocalTracks, createConn, signal],
  );

  const flushCandidates = useCallback(async (conn: PeerConn) => {
    conn.remoteReady = true;
    for (const cand of conn.pendingCandidates.splice(0)) await conn.pc.addIceCandidate(cand).catch(() => undefined);
  }, []);

  const handleSignal = useCallback(
    async (from: string, data: { type: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RTCIceCandidateInit }) => {
      try {
        if (data.type === 'offer' && data.sdp) {
          const conn = createConn(from);
          await conn.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          const ts = conn.pc.getTransceivers();
          ts.forEach((t) => (t.direction = 'sendrecv'));
          conn.senders = { audio: ts[0]?.sender, cam: ts[1]?.sender, screen: ts[2]?.sender };
          attachLocalTracks(conn);
          const answer = await conn.pc.createAnswer();
          await conn.pc.setLocalDescription(answer);
          signal(from, { type: 'answer', sdp: answer.sdp });
          await flushCandidates(conn);
        } else if (data.type === 'answer' && data.sdp) {
          const conn = connsRef.current.get(from);
          if (!conn) return;
          await conn.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await flushCandidates(conn);
        } else if (data.type === 'candidate' && data.candidate) {
          const conn = connsRef.current.get(from);
          if (!conn) return;
          if (conn.remoteReady) await conn.pc.addIceCandidate(data.candidate).catch(() => undefined);
          else conn.pendingCandidates.push(data.candidate);
        }
      } catch (err) {
        pushNotice('warning', `Could not connect to a participant: ${(err as Error).message}`);
      }
    },
    [attachLocalTracks, createConn, flushCandidates, pushNotice, signal],
  );

  // ---------- teardown ----------
  const teardown = useCallback(() => {
    (['audio', 'cam', 'screen'] as DeviceKind[]).forEach((k) => {
      const t = tracksRef.current[k];
      if (t) {
        t.onended = null;
        t.stop();
      }
      tracksRef.current[k] = null;
    });
    flagsRef.current = { audio: false, video: false, screen: false };
    setLocal(flagsRef.current);
    setLocalCam(null);
    setLocalScreen(null);
    [...connsRef.current.keys()].forEach(closePeer);
    setPeers({});
    const s = socketRef.current;
    if (s) {
      s.removeAllListeners();
      s.disconnect();
    }
    socketRef.current = null;
  }, [closePeer]);

  const leave = useCallback(async () => {
    const s = socketRef.current;
    if (s?.connected) await ask('room:leave');
    teardown();
    setPhaseBoth('idle');
  }, [ask, setPhaseBoth, teardown]);

  // ---------- socket lifecycle ----------
  useEffect(() => {
    if (!enabled) return;
    const token = tokenStore.get();
    if (!token) {
      setError('You are not signed in.');
      setPhaseBoth('error');
      return;
    }
    setError(null);
    setPhaseBoth('connecting');

    const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'], reconnectionAttempts: 6 });
    socketRef.current = socket;
    let disposed = false;

    const applySnapshot = (snap: Snapshot) => {
      setTitle(snap.meeting.title);
      setSelfId(snap.selfId);
      setIsHost(snap.isHost);
      setModerationOn(snap.meeting.moderationEnabled);
      setMessages(snap.messages);
      setPolls(snap.polls);
      setWaiting(snap.waiting);
      const next: Record<string, RemotePeer> = {};
      snap.peers.forEach((p) => (next[p.userId] = { userId: p.userId, name: p.name, isHost: p.isHost, ...p.media }));
      setPeers(next);
      setPhaseBoth('joined');
      socket.emit('media:state', flagsRef.current); // re-announce devices that stayed on across a reconnect
      // We are the newest joiner, so we create the offers.
      snap.peers.forEach((p) => {
        startOffer(p.userId).catch((e) => pushNotice('warning', `Could not start a connection: ${e.message}`));
      });
    };

    const join = () => {
      socket.emit('room:join', { meetingId }, (res: Ack) => {
        if (disposed) return;
        if (!res?.ok) {
          setError(res?.error ?? 'Could not join this meeting.');
          setPhaseBoth('error');
          return;
        }
        if (res.state === 'WAITING') setPhaseBoth('waiting');
        else applySnapshot(res.snapshot as Snapshot);
      });
    };

    const finish = (phase: Phase) => {
      if (disposed) return;
      teardown();
      setPhaseBoth(phase);
    };

    socket.on('connect', () => {
      setPhaseBoth('connecting');
      join();
    });
    socket.on('disconnect', () => {
      if (disposed || phaseRef.current === 'idle') return;
      [...connsRef.current.keys()].forEach(closePeer);
      setPeers({});
      if (!['denied', 'removed', 'ended', 'replaced'].includes(phaseRef.current)) setPhaseBoth('connecting');
    });
    socket.on('connect_error', (err) => {
      if (disposed) return;
      if (err.message === 'unauthorized') {
        setError('Your session has expired. Please log in again.');
        setPhaseBoth('error');
        socket.disconnect();
      } else if (socket.active === false || phaseRef.current === 'connecting') {
        setError(`Cannot reach the server at ${API_URL}. Is the API running?`);
      }
    });

    socket.on('admitted', (snap: Snapshot) => applySnapshot(snap));
    socket.on('denied', () => finish('denied'));
    socket.on('removed', () => finish('removed'));
    socket.on('meeting:ended', () => finish('ended'));
    socket.on('session:replaced', () => finish('replaced'));

    socket.on('peer:joined', (p: { userId: string; name: string; isHost: boolean; media: MediaFlags }) => {
      setPeers((prev) => {
        const conn = connsRef.current.get(p.userId);
        return {
          ...prev,
          [p.userId]: { userId: p.userId, name: p.name, isHost: p.isHost, ...p.media, stream: prev[p.userId]?.stream ?? conn?.stream, screenStream: prev[p.userId]?.screenStream ?? conn?.screenStream },
        };
      });
      pushNotice('info', `${p.name} joined`);
    });
    socket.on('peer:left', ({ userId }: { userId: string }) => {
      closePeer(userId);
      setPeers((prev) => {
        const who = prev[userId];
        if (who) pushNotice('info', `${who.name} left`);
        const { [userId]: _removed, ...rest } = prev;
        return rest;
      });
    });
    socket.on('media:state', (m: MediaFlags & { userId: string }) => setPeers((prev) => (prev[m.userId] ? { ...prev, [m.userId]: { ...prev[m.userId], audio: m.audio, video: m.video, screen: m.screen } } : prev)));
    socket.on('rtc:signal', ({ from, data }: { from: string; data: any }) => void handleSignal(from, data));

    socket.on('chat:message', (m: ChatMsg) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].slice(-300))));
    socket.on('reaction', (r: { name: string; emoji: string }) => {
      const id = idRef.current++;
      setReactions((prev) => [...prev.slice(-12), { id, emoji: r.emoji, name: r.name }]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== id)), 3400);
    });
    socket.on('poll:created', (p: PollView) => setPolls((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p])));
    socket.on('poll:updated', (p: PollView) => setPolls((prev) => prev.map((x) => (x.id === p.id ? { ...p, myVoteOptionId: x.myVoteOptionId } : x))));
    socket.on('waiting:update', (list: Array<{ userId: string; name: string }>) => setWaiting(list));
    socket.on('moderation:warning', (w: { message: string; action: string }) => pushNotice(w.action === 'BLOCK' ? 'alert' : 'warning', w.message));
    socket.on('moderation:alert', (a: Omit<ModerationAlert, 'id'>) => {
      const id = idRef.current++;
      setAlerts((prev) => [{ ...a, id }, ...prev].slice(0, 30));
      pushNotice('alert', `Moderation: ${a.name}'s message was ${a.action === 'BLOCK' ? 'blocked' : 'flagged'} (${a.categories.join(', ')})`);
    });
    socket.on('host:mute-request', () => {
      if (tracksRef.current.audio) {
        stopDevice('audio');
        pushNotice('info', 'The host muted your microphone. You can unmute yourself when ready.');
      }
    });

    return () => {
      disposed = true;
      teardown();
      phaseRef.current = 'idle';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, meetingId]);

  // ---------- actions ----------
  const sendChat = useCallback((content: string) => ask('chat:send', { content }), [ask]);
  const sendReaction = useCallback((emoji: string) => ask('reaction:send', { emoji }), [ask]);
  const createPoll = useCallback((question: string, options: string[]) => ask('poll:create', { question, options }), [ask]);
  const closePoll = useCallback((pollId: string) => ask('poll:close', { pollId }), [ask]);
  const vote = useCallback(
    async (pollId: string, optionId: string) => {
      const res = await ask('poll:vote', { pollId, optionId });
      if (res.ok) setPolls((prev) => prev.map((p) => (p.id === pollId ? { ...p, myVoteOptionId: optionId } : p)));
      return res;
    },
    [ask],
  );
  const hostAction = useCallback(
    async (event: 'host:admit' | 'host:deny' | 'host:remove' | 'host:mute', userId: string) => {
      const res = await ask(event, { userId });
      if (!res.ok) pushNotice('warning', res.error ?? 'Action failed');
      return res;
    },
    [ask, pushNotice],
  );
  const muteAll = useCallback(() => ask('host:mute-all'), [ask]);
  const endMeeting = useCallback(async () => {
    const res = await ask('host:end');
    if (!res.ok) pushNotice('warning', res.error ?? 'Could not end the meeting');
    return res;
  }, [ask, pushNotice]);

  return {
    phase, error, title, selfId, isHost, moderationOn, peers, messages, polls, waiting, reactions, notices, alerts,
    local, localCam, localScreen,
    toggleMic, toggleCamera, toggleScreen, leave, dismissNotice,
    sendChat, sendReaction, createPoll, closePoll, vote, hostAction, muteAll, endMeeting,
  };
}
