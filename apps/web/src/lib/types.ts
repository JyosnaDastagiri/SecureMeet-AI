export type Role = 'PARTICIPANT' | 'HOST' | 'ADMIN';
export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt?: string;
}
export interface UserBrief {
  id: string;
  name: string;
  email: string;
}
export interface MeetingListItem {
  id: string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  scheduledStart: string;
  scheduledEnd: string | null;
  hostId: string;
  host: { id: string; name: string };
  isHost: boolean;
  myInvitationStatus: InvitationStatus | null;
  myAttendedSeconds?: number;
  _count: { invitations: number };
}
export interface InvitationRow {
  id: string;
  status: InvitationStatus;
  invitee: UserBrief;
}
export interface MeetingDetail {
  id: string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  scheduledStart: string;
  scheduledEnd: string | null;
  startedAt: string | null;
  endedAt: string | null;
  waitingRoomEnabled: boolean;
  moderationEnabled: boolean;
  host: UserBrief;
  access: 'HOST' | 'INVITEE' | 'ADMIN';
  canJoin: boolean;
  myInvitationId: string | null;
  myInvitationStatus: InvitationStatus | null;
  invitations: InvitationRow[];
}
export interface MyInvitation {
  id: string;
  status: InvitationStatus;
  createdAt: string;
  meeting: { id: string; title: string; status: MeetingStatus; scheduledStart: string; host: { id: string; name: string } };
}
export interface ReportRow {
  user: UserBrief;
  firstJoinedAt: string;
  lastLeftAt: string | null;
  sessions: number;
  attendedSeconds: number;
  attendancePercent: number;
  messages: number;
  votes: number;
  engagement: { score: number; label: 'High' | 'Medium' | 'Low' };
}
export interface MeetingReport {
  meeting: { id: string; title: string; status: MeetingStatus; startedAt: string | null; endedAt: string | null; durationSeconds: number };
  pollsTotal: number;
  totalMessages: number;
  participants: ReportRow[];
  method: string;
}
