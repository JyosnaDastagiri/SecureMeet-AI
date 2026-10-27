'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { MeetingListItem } from '@/lib/types';
import { MeetingCard } from '@/components/MeetingCard';
import { Alert, EmptyState, PageHeader, Spinner } from '@/components/ui';

export default function HistoryPage() {
  const [items, setItems] = useState<MeetingListItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<MeetingListItem[]>('/meetings?scope=past')
      .then(setItems)
      .catch((e) => {
        setError(e.message);
        setItems([]);
      });
  }, []);

  return (
    <>
      <PageHeader title="Meeting history" subtitle="Past meetings and how long you attended. Hosts can open a meeting to see its attendance report." />
      {error && <Alert tone="error">{error}</Alert>}
      {items === null ? <Spinner /> : items.length === 0 ? <EmptyState title="No past meetings yet" /> : (
        <div className="grid gap-4 md:grid-cols-2">{items.map((m) => <MeetingCard key={m.id} meeting={m} />)}</div>
      )}
    </>
  );
}
