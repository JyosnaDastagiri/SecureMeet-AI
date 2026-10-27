/**
 * LOCAL RULE-BASED moderation. This is NOT machine learning and does not call any external AI service.
 * It normalises simple obfuscation (leetspeak, repeated letters) and matches a keyword list.
 * Admins can add custom terms and change thresholds from the admin dashboard.
 */
export type ModerationAction = 'NONE' | 'WARN' | 'BLOCK';
export type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface ModerationSettingsData {
  enabled: boolean;
  warnThreshold: number;
  blockThreshold: number;
  customTerms: string[];
}

export interface ModerationResult {
  action: ModerationAction;
  severity: Severity;
  score: number;
  categories: string[];
  maskedExcerpt: string;
}

interface Category {
  name: string;
  weight: number;
  terms: string[];
}

export const BUILT_IN_CATEGORIES: Category[] = [
  { name: 'profanity', weight: 0.4, terms: ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'crap'] },
  { name: 'insult', weight: 0.5, terms: ['idiot', 'stupid', 'moron', 'dumb', 'loser', 'useless', 'shut up', 'piece of trash'] },
  { name: 'threat', weight: 1.0, terms: ['kill you', 'kill yourself', 'hurt you', 'go die', 'kys', 'i will find you'] },
];
const CUSTOM_WEIGHT = 0.6;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

/** Same-length normalisation, so match positions map back to the original text. */
export function normalise(text: string): string {
  return text.replace(/[013457@$]/g, (c) => LEET[c] ?? c);
}

function termToRegex(term: string): RegExp {
  const body = term
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => (ch === ' ' ? '\\s+' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '+'))
    .join('');
  return new RegExp(`\\b${body}\\b`, 'gi');
}

export function evaluateText(text: string, settings: ModerationSettingsData): ModerationResult {
  const none: ModerationResult = { action: 'NONE', severity: 'NONE', score: 0, categories: [], maskedExcerpt: '' };
  if (!settings.enabled || !text.trim()) return none;

  const normalised = normalise(text);
  const groups: Category[] = [
    ...BUILT_IN_CATEGORIES,
    { name: 'custom', weight: CUSTOM_WEIGHT, terms: settings.customTerms.filter((t) => t.trim().length > 0) },
  ];

  const ranges: Array<[number, number]> = [];
  const matchedTerms = new Set<string>();
  const categories = new Set<string>();
  let score = 0;

  for (const group of groups) {
    for (const term of group.terms) {
      const re = termToRegex(term);
      let m: RegExpExecArray | null;
      let hit = false;
      while ((m = re.exec(normalised)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
        hit = true;
        if (m[0].length === 0) re.lastIndex++;
      }
      if (hit && !matchedTerms.has(`${group.name}:${term}`)) {
        matchedTerms.add(`${group.name}:${term}`);
        categories.add(group.name);
        score += group.weight;
      }
    }
  }

  if (matchedTerms.size === 0) return none;
  score = Math.min(1, Math.round(score * 100) / 100);

  const action: ModerationAction = score >= settings.blockThreshold ? 'BLOCK' : score >= settings.warnThreshold ? 'WARN' : 'NONE';
  const severity: Severity = score >= settings.blockThreshold ? 'HIGH' : score >= settings.warnThreshold ? 'MEDIUM' : 'LOW';

  return { action, severity, score, categories: [...categories], maskedExcerpt: mask(text, ranges) };
}

function mask(original: string, ranges: Array<[number, number]>): string {
  const chars = original.split('');
  for (const [start, end] of ranges) {
    for (let i = start + 1; i < end; i++) if (chars[i] !== ' ') chars[i] = '*';
  }
  return chars.join('').slice(0, 120);
}
