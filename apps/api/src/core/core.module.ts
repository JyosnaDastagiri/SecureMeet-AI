import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { MeetingEvents } from './meeting-events';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = loadEnv();
        return { secret: env.JWT_SECRET, signOptions: { expiresIn: env.JWT_EXPIRES_IN } };
      },
    }),
  ],
  providers: [PrismaService, AuditService, MeetingEvents, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, PrismaService, AuditService, MeetingEvents, JwtAuthGuard, RolesGuard],
})
export class CoreModule {}
