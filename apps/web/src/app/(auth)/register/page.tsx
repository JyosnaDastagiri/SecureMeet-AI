'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'PARTICIPANT' as 'PARTICIPANT' | 'HOST' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const passwordProblem =
    form.password.length > 0 && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
      ? 'Use at least 8 characters with a letter and a number.'
      : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (passwordProblem) return;
    setBusy(true);
    setError('');
    try {
      await register({ ...form, email: form.email.trim(), name: form.name.trim() });
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name">
          <Input required minLength={2} maxLength={60} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" error={passwordProblem} hint="At least 8 characters, including a letter and a number.">
          <Input type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="I want to" hint="Hosts can schedule meetings. Administrator accounts can only be granted by an existing administrator.">
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'PARTICIPANT' | 'HOST' })}
          >
            <option value="PARTICIPANT">Join meetings I am invited to (participant)</option>
            <option value="HOST">Schedule and host meetings (host)</option>
          </select>
        </Field>
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already registered? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
      </p>
    </Card>
  );
}
