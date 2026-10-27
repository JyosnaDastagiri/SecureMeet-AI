import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CollabService } from './collab.service';
import { CreateMeetingDto, InviteDto, UpdateMeetingDto } from './meetings.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.types';

@Controller()
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly collab: CollabService,
  ) {}

  @Post('meetings')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user, dto);
  }

  @Get('meetings')
  list(@CurrentUser() user: AuthUser, @Query('scope') scope = 'upcoming') {
    if (scope !== 'upcoming' && scope !== 'past') throw new BadRequestException('scope must be upcoming or past');
    return this.meetings.list(user, scope);
  }

  @Get('meetings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.getForUser(user, id);
  }

  @Patch('meetings/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(user, id, dto);
  }

  @Post('meetings/:id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.endMeeting(user, id);
  }

  @Post('meetings/:id/invite')
  @HttpCode(200)
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InviteDto) {
    return this.meetings.invite(user, id, dto.userIds);
  }

  @Delete('meetings/:id/invitations/:invitationId')
  removeInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('invitationId') invitationId: string) {
    return this.meetings.removeInvitation(user, id, invitationId);
  }

  @Get('meetings/:id/report')
  report(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.report(user, id);
  }

  @Get('meetings/:id/messages')
  async messages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.collab.assertCanRead(user, id);
    return this.collab.recentMessages(id, 200);
  }

  @Get('meetings/:id/polls')
  async polls(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.collab.assertCanRead(user, id);
    return this.collab.listPolls(id, user.id);
  }

  @Get('invitations')
  invitations(@CurrentUser() user: AuthUser) {
    return this.meetings.myInvitations(user);
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.respond(user, id, 'ACCEPTED');
  }

  @Post('invitations/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.respond(user, id, 'DECLINED');
  }
}
