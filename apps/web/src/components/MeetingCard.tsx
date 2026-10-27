import { Calendar, Users } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime, formatDuration } from '@/lib/format';
import type { MeetingListItem } from '@/lib/types';
import { Badge, Card, statusTone } from './ui';

export function MeetingCard({ meeting }: { meeting: MeetingListItem }) {
  return (
    <Link href={`/meetings/${meeting.id}`} className="block rounded-xl focus-visible:ring-offset-2">
      <Card className="transition hover:border-brand-300 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{meeting.title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">Hosted by {meeting.isHost ? 'you' : meeting.host.name}</p>
          </div>
          <Badge tone={statusTone(meeting.status)}>{meeting.status}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4" aria-hidden /> {formatDateTime(meeting.scheduledStart)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" aria-hidden /> {meeting._count.invitations} invited
          </span>
          {meeting.myAttendedSeconds !== undefined && <span>You attended {formatDuration(meeting.myAttendedSeconds)}</span>}
          {!meeting.isHost && meeting.myInvitationStatus === 'PENDING' && <Badge tone="amber">Invitation pending</Badge>}
        </div>
      </Card>
    </Link>
  );
}
