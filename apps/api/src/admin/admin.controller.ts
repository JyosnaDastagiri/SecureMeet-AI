import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminUpdateUserDto, UpdateModerationDto } from './admin.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.types';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  users() {
    return this.admin.listUsers();
  }

  @Patch('users/:id')
  updateUser(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.admin.updateUser(me, id, dto);
  }

  @Get('meetings')
  meetings() {
    return this.admin.listMeetings();
  }

  @Post('meetings/:id/end')
  @HttpCode(200)
  endMeeting(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.admin.endMeeting(me, id);
  }

  @Get('audit-logs')
  audit(@Query('limit') limit?: string, @Query('action') action?: string) {
    return this.admin.auditLogs(limit ? parseInt(limit, 10) || 100 : 100, action);
  }

  @Get('moderation/settings')
  moderationSettings() {
    return this.admin.moderationSettings();
  }

  @Put('moderation/settings')
  updateModeration(@CurrentUser() me: AuthUser, @Body() dto: UpdateModerationDto) {
    return this.admin.updateModeration(me, dto);
  }

  @Get('moderation/events')
  moderationEvents() {
    return this.admin.moderationEvents();
  }
}
