import { type GitHubItem, type Item } from './types';

const PRIORITY_MAP: Record<string, { min: number; max: number }> = {
  urgent: { min: 70, max: 100 },
  today: { min: 40, max: 69 },
  later: { min: 15, max: 39 },
  noise: { min: 0, max: 14 },
};

export function getPriority(score: number): 'urgent' | 'today' | 'later' | 'noise' {
  if (score >= 70) return 'urgent';
  if (score >= 40) return 'today';
  if (score >= 15) return 'later';
  return 'noise';
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#ff3b30';
    case 'today': return '#ff9500';
    case 'later': return '#ffcc00';
    case 'noise': return '#8e8e93';
    default: return '#8e8e93';
  }
}

export function getItemEmoji(type: string, priority: string): string {
  if (priority === 'noise') return '🤖';
  switch (type) {
    case 'security': return '🔒';
    case 'ci': return '⚙️';
    case 'pr': return '🔄';
    case 'issue': return '🐛';
    case 'deps': return '📦';
    case 'discussion': return '💬';
    default: return '📌';
  }
}

export function getTagColor(tag: string): string {
  const colors: Record<string, string> = {
    CVE: '#ff3b30',
    CI: '#007aff',
    PR: '#34c759',
    ISSUE: '#ff9500',
    SECRET: '#af52de',
    DEPS: '#5ac8fa',
    SLOP: '#af52de',
    'AI-SLOP': '#af52de',
    'FIRST-TIMER': '#5ac8fa',
    BOT: '#8e8e93',
    URGENT: '#ff3b30',
    TODAY: '#ff9500',
    LATER: '#ffcc00',
    NOISE: '#8e8e93',
  };
  return colors[tag] || '#8e8e93';
}

export function parseTags(item: Partial<GitHubItem>): string[] {
  const tags: string[] = [];
  if (item.is_bot) tags.push('BOT');
  const typeStr = item.type?.toUpperCase() || '';
  if (['SECURITY', 'CI', 'PR', 'ISSUE', 'DEPS', 'DISCUSSION'].includes(typeStr)) {
    tags.push(typeStr);
  }
  return tags;
}

export function scoreItem(item: GitHubItem): number {
  let score = 0;

  const now = Date.now();
  const created = new Date(item.created_at).getTime();
  const updated = new Date(item.updated_at).getTime();
  const hoursSinceUpdate = (now - updated) / (1000 * 60 * 60);
  const hoursSinceCreation = (now - created) / (1000 * 60 * 60);
  const daysSinceUpdate = hoursSinceUpdate / 24;
  const daysSinceCreation = hoursSinceCreation / 24;

  // Security
  if (item.type === 'security') {
    const detail = item.detail?.toLowerCase() || '';
    if (detail.includes('critical')) score += 60;
    else if (detail.includes('high')) score += 40;
    else if (detail.includes('moderate') || detail.includes('medium')) score += 25;
    if (detail.includes('secret') || detail.includes('credential')) score += 70;
    if (detail.includes('codeql')) score += 30;
  }

  // CI
  if (item.type === 'ci') {
    if (item.detail?.includes('main') || item.detail?.includes('master')) score += 50;
    if (item.detail?.toLowerCase().includes('failed')) score += 10;
    if (item.detail?.includes('deploy')) score += 55;
    if (item.detail?.includes('cron') || item.detail?.includes('schedule')) score += 40;
  }

  // Pull Requests
  if (item.type === 'pr') {
    if (item.author_association === 'FIRST_TIME_CONTRIBUTOR') {
      score += 25;
      if (daysSinceCreation > 3) score += 40;
    }
    if (item.labels?.some(l => l.toLowerCase().includes('merge conflict'))) score += 30;
    if (item.labels?.some(l => l.toLowerCase().includes('changes requested'))) {
      if (daysSinceUpdate > 3) score += 25;
    }
    if (daysSinceUpdate > 7 && daysSinceUpdate <= 30) score += 30;
    if (daysSinceUpdate > 30) score -= 10;
  }

  // Issues
  if (item.type === 'issue') {
    if (daysSinceCreation > 3 && !item.detail?.includes('maintainer')) score += 25;
    if (daysSinceCreation > 7) score += 35;
    if (item.comments_count && item.comments_count >= 3) score += 25;
    if (item.comments_count && item.comments_count >= 5) score += 30;
  }

  // Bots & Noise
  if (item.is_bot) {
    score -= 20;
    if (item.detail?.includes('patch') || item.detail?.includes('minor')) score -= 20;
    if (item.detail?.includes('major')) score += 10;
  }

  // Recency
  if (hoursSinceUpdate <= 2) score += 15;
  else if (hoursSinceUpdate <= 24) score += 8;
  if (daysSinceUpdate > 30) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function isFirstTimer(item: GitHubItem): boolean {
  return item.author_association === 'FIRST_TIME_CONTRIBUTOR' && item.type === 'pr';
}
