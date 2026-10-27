import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: audit failures must not break the user's request. Never pass secrets in metadata. */
  async log(
    actorId: string | null,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          entity,
          entityId,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed (${action}): ${(err as Error).message}`);
    }
  }
}
