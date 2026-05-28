export interface SlopSignals {
  triggered: string[];
  count: number;
}

export function detectSlop(item: {
  title?: string;
  body?: string;
  author_association?: string;
  created_at?: string;
  labels?: string[];
  is_bot?: boolean;
}): SlopSignals {
  const signals: string[] = [];

  if (item.is_bot) {
    signals.push('Bot account');
    return { triggered: signals, count: signals.length };
  }

  if ((item.title?.length || 0) < 20) {
    signals.push('Title length < 20 characters');
  }

  if (!item.body || item.body.length < 50) {
    signals.push('PR description < 50 characters or empty');
  }

  if (item.title && /^(fix bug|update readme|improve code|add feature|fix issue|update file)/i.test(item.title)) {
    signals.push('Generic title pattern matched');
  }

  if (item.author_association === 'FIRST_TIME_CONTRIBUTOR' && !item.body) {
    signals.push('First-time contributor with no description');
  }

  return { triggered: signals, count: signals.length };
}

export function isSlop(signals: SlopSignals, sensitivity: string): boolean {
  if (sensitivity === 'off') return false;
  const threshold = sensitivity === 'low' ? 4 : sensitivity === 'medium' ? 3 : 2;
  return signals.count >= threshold;
}
