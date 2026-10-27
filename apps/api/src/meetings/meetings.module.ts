import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { CollabService } from './collab.service';

@Module({
  controllers: [MeetingsController],
  providers: [MeetingsService, CollabService],
  exports: [MeetingsService, CollabService],
})
export class MeetingsModule {}
