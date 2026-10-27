import { evaluateText, ModerationSettingsData, normalise } from './moderation.rules';
import { engagementScore } from '../meetings/meetings.service';

const settings: ModerationSettingsData = { enabled: true, warnThreshold: 0.4, blockThreshold: 0.8, customTerms: [] };

describe('local moderation rules', () => {
  it('lets clean messages through', () => {
    const r = evaluateText('Good morning everyone, shall we start?', settings);
    expect(r.action).toBe('NONE');
    expect(r.score).toBe(0);
  });

  it('does not flag words that merely contain a listed term', () => {
    expect(evaluateText('Please assign the task, it is a classic', settings).action).toBe('NONE');
  });

  it('warns on a single insult', () => {
    const r = evaluateText('that was stupid', settings);
    expect(r.action).toBe('WARN');
    expect(r.categories).toContain('insult');
  });

  it('blocks threats', () => {
    expect(evaluateText('I will kill you', settings).action).toBe('BLOCK');
  });

  it('blocks combined profanity and insults', () => {
    expect(evaluateText('you stupid idiot, shit', settings).action).toBe('BLOCK');
  });

  it('detects leetspeak and repeated letters', () => {
    expect(normalise('st00pid')).toBe('stoopid');
    expect(evaluateText('you are such an 1d1ot', settings).action).toBe('WARN');
    expect(evaluateText('you are stuuupid', settings).action).toBe('WARN');
  });

  it('masks matched words in the stored excerpt', () => {
    expect(evaluateText('You idiot', settings).maskedExcerpt).toBe('You i****');
  });

  it('supports admin custom terms and thresholds', () => {
    const custom = { ...settings, customTerms: ['bananas'] };
    expect(evaluateText('this is bananas', custom).action).toBe('WARN');
    expect(evaluateText('this is bananas', { ...custom, warnThreshold: 0.7, blockThreshold: 0.9 }).action).toBe('NONE');
  });

  it('is disabled when settings.enabled is false', () => {
    expect(evaluateText('I will kill you', { ...settings, enabled: false }).action).toBe('NONE');
  });
});

describe('engagement indicator', () => {
  it('scores full attendance with no other activity as Medium/High boundary values', () => {
    const r = engagementScore({ attendanceRatio: 1, messages: 0, votes: 0, pollsTotal: 0 });
    expect(r.score).toBe(75); // 60 / (60 + 20)
    expect(r.label).toBe('High');
  });
  it('scores no attendance as Low', () => {
    expect(engagementScore({ attendanceRatio: 0, messages: 0, votes: 0, pollsTotal: 2 }).label).toBe('Low');
  });
  it('includes poll participation only when polls exist', () => {
    const withPoll = engagementScore({ attendanceRatio: 1, messages: 5, votes: 0, pollsTotal: 1 });
    expect(withPoll.score).toBe(80); // (60 + 20 + 0) / 100
  });
});
