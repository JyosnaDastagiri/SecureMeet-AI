import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { MeetingsModule } from '../meetings/meetings.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({ imports: [MeetingsModule, ModerationModule], providers: [RealtimeGateway] })
export class RealtimeModule {}
