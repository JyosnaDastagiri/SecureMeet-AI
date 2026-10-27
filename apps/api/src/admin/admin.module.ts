import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MeetingsModule } from '../meetings/meetings.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({ imports: [MeetingsModule, ModerationModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
