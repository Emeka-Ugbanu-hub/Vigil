export type ItemType = 'security' | 'ci' | 'pr' | 'issue' | 'deps' | 'discussion' | 'release' | 'force_push';

export type Priority = 'urgent' | 'today' | 'later' | 'noise';

export type Tab = 'all' | 'urgent' | 'pending' | 'later' | 'noise';

export interface Repo {
  id: string;
  name: string;
  owner: string;
  enabled: boolean;
  last_synced_at: string | null;
}

export interface Item {
  id: string;
  repo_id: string;
  repo_name: string;
  item_type: ItemType;
  priority: Priority;
  title: string;
  detail: string;
  score: number;
  is_bot: boolean;
  is_slop: boolean;
  is_first_timer: boolean;
  dismissed: boolean;
  created_at: string;
  updated_at: string;
  github_url: string;
  emoji: string;
  tags: string[];
  comments_count: number;
  body: string | null;
}

export interface Comment {
  id: string;
  item_id: string;
  author: string;
  author_association: string;
  body: string;
  created_at: string;
  avatar_url: string;
}

export interface Summary {
  total_items: number;
  urgent_count: number;
  today_count: number;
  later_count: number;
  noise_count: number;
  repos_count: number;
  critial_cves: number;
  waiting_prs: number;
  first_timers: number;
  security_alerts: number;
  ci_failures: number;
  stale_items: number;
  bot_activity: number;
  slop_items: number;
  conflicted_prs: number;
}

export interface SyncStatus {
  last_synced: string;
  repos_checked: number;
  new_items: number;
}

export interface GitHubItem {
  id: string;
  type: ItemType;
  title: string;
  detail: string;
  created_at: string;
  updated_at: string;
  github_url: string;
  repo_id: string;
  repo_name: string;
  is_bot: boolean;
  author_association?: string;
  body?: string;
  labels?: string[];
  comments_count?: number;
  state?: string;
}

export interface AppState {
  screen: 'popover' | 'inbox' | 'detail' | 'settings';
  selectedItemId: string | null;
  activeTab: Tab;
  summary: Summary | null;
  settings: Record<string, string> | null;
}
