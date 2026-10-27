import { BarChart3, Lock, MessageSquareWarning, ShieldCheck, Users, Video } from 'lucide-react';
import Link from 'next/link';

const features = [
  { icon: Lock, title: 'Private by design', text: 'A meeting link is never enough. The server checks invitations and host admission before anyone joins.' },
  { icon: Users, title: 'Waiting room', text: 'Hosts admit, deny or remove participants in real time and see who is waiting.' },
  { icon: Video, title: 'Browser video calls', text: 'WebRTC audio, video and screen sharing with clear device-permission and error messages.' },
  { icon: MessageSquareWarning, title: 'Transparent moderation', text: 'Rule-based detection of abusive chat messages with warnings for the sender and alerts for the host.' },
  { icon: BarChart3, title: 'Attendance & engagement', text: 'Join/leave history and a simple, documented participation indicator — no webcam analysis.' },
  { icon: ShieldCheck, title: 'Admin oversight', text: 'User and meeting management plus an audit log of sensitive actions.' },
];

export default function Landing() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Video className="h-4 w-4" aria-hidden />
          </span>
          SecureMeet <span className="text-brand-600">AI</span>
        </span>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Log in</Link>
          <Link href="/register" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Get started</Link>
        </div>
      </header>

      <section className="bg-gradient-to-b from-ink-900 to-ink-700 text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <p className="mb-4 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-200">FINAL-YEAR B.TECH PROJECT</p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Virtual meetings that stay private and respectful</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Invite registered colleagues, control who enters, collaborate with chat, reactions and polls, and keep conversations safe with transparent, configurable moderation.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/register" className="rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-400">Create an account</Link>
            <Link href="/login" className="rounded-lg border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10">Log in</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-slate-900">Everything a small team needs</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">About the &ldquo;AI&rdquo; in SecureMeet AI</p>
          <p className="mt-1">
            Moderation uses a local rule-based filter (keyword matching with simple obfuscation handling and admin-configurable thresholds). It is not a machine-learning model and sends nothing to external services.
            Meetings are never recorded or transcribed, and no webcam-based emotion analysis is performed.
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">SecureMeet AI — academic project</footer>
    </main>
  );
}
