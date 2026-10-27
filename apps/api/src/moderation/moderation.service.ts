import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { AuditService } from '../core/audit.service';
import { evaluateText, ModerationResult, ModerationSettingsData } from './moderation.rules';

const CACHE_MS = 30_000;

@Injectable()
export class ModerationService {
  private cache?: { value: ModerationSettingsData; at: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSettings(): Promise<ModerationSettingsData> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.moderationSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const value = {
      enabled: row.enabled,
      warnThreshold: row.warnThreshold,
      blockThreshold: row.blockThreshold,
      customTerms: row.customTerms,
    };
    this.cache = { value, at: Date.now() };
    return value;
  }

  async updateSettings(actorId: string, input: Partial<ModerationSettingsData>) {
    const current = await this.getSettings();
    const next: ModerationSettingsData = { ...current, ...input };
    if (next.warnThreshold < 0 || next.blockThreshold > 1 || next.warnThreshold > next.blockThreshold) {
      throw new BadRequestException('Thresholds must satisfy 0 <= warn <= block <= 1');
    }
    next.customTerms = [...new Set(next.customTerms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 40))].slice(0, 100);
    await this.prisma.moderationSetting.upsert({ where: { id: 1 }, create: { id: 1, ...next }, update: next });
    this.cache = undefined;
    await this.audit.log(actorId, 'MODERATION_SETTINGS_UPDATE', 'ModerationSetting', '1', {
      enabled: next.enabled,
      warnThreshold: next.warnThreshold,
      blockThreshold: next.blockThreshold,
      customTermCount: next.customTerms.length,
    });
    return next;
  }

  async evaluate(text: string): Promise<ModerationResult> {
    return evaluateText(text, await this.getSettings());
  }

  /** Stores only categories, score, action and a masked excerpt - never the raw message. */
  async record(meetingId: string, userId: string, result: ModerationResult) {
    return this.prisma.moderationEvent.create({
      data: {
        meetingId,
        userId,
        categories: result.categories,
        severity: result.severity,
        score: result.score,
        action: result.action,
        excerpt: result.maskedExcerpt,
      },
    });
  }
}
