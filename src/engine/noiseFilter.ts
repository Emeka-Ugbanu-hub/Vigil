import type { Item } from './types';

export function shouldFilter(item: Item): boolean {
  if (item.is_bot) return true;

  if (item.is_slop) return true;

  if (item.priority === 'noise') return true;

  if (item.tags.includes('DUPLICATE') || item.tags.includes('duplicate')) return true;

  const now = Date.now();
  const updated = new Date(item.updated_at).getTime();
  const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > 30) return true;

  const title = item.title.toLowerCase();
  if (title.startsWith('update dependency') || title.startsWith('chore(deps)')) return true;

  return false;
}
