use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Item {
    pub id: String,
    pub repo_id: String,
    pub repo_name: String,
    pub item_type: String,
    pub priority: String,
    pub title: String,
    pub detail: String,
    pub score: i64,
    pub is_bot: bool,
    pub is_slop: bool,
    pub is_first_timer: bool,
    pub dismissed: bool,
    pub created_at: String,
    pub updated_at: String,
    pub github_url: String,
    pub emoji: String,
    pub tags: Vec<String>,
    pub comments_count: i64,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Comment {
    pub id: String,
    pub item_id: String,
    pub author: String,
    pub author_association: String,
    pub body: String,
    pub created_at: String,
    pub avatar_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Repo {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub enabled: bool,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Summary {
    pub total_items: i64,
    pub urgent_count: i64,
    pub today_count: i64,
    pub later_count: i64,
    pub noise_count: i64,
    pub repos_count: i64,
    pub critial_cves: i64,
    pub waiting_prs: i64,
    pub first_timers: i64,
    // Severity breakdowns
    pub security_alerts: i64,
    pub ci_failures: i64,
    pub stale_items: i64,
    pub bot_activity: i64,
    pub slop_items: i64,
    pub conflicted_prs: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStatus {
    pub last_synced: String,
    pub repos_checked: i64,
    pub new_items: i64,
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("companion.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS repos (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            last_synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            type TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'noise',
            title TEXT NOT NULL,
            detail TEXT DEFAULT '',
            score INTEGER DEFAULT 0,
            is_bot INTEGER DEFAULT 0,
            is_slop INTEGER DEFAULT 0,
            is_first_timer INTEGER DEFAULT 0,
            dismissed INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            github_url TEXT DEFAULT '',
            raw_payload TEXT DEFAULT '',
            emoji TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            FOREIGN KEY (repo_id) REFERENCES repos(id)
        );

        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            author TEXT NOT NULL,
            author_association TEXT DEFAULT '',
            body TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            avatar_url TEXT DEFAULT '',
            FOREIGN KEY (item_id) REFERENCES items(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_interval_s', '60');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('slop_sensitivity', 'medium');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('stale_days', '7');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('firsttimer_days', '3');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('badge_enabled', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sound_enabled', 'false');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('compact_mode', 'false');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('bot_auto_collapse', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('ci_main_weight', 'high');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('last_sync_time', '');
        ",
    )?;

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
    };
    app.manage(state);

    Ok(())
}

fn get_db<R: Runtime>(app: &AppHandle<R>) -> Arc<Mutex<Connection>> {
    app.state::<AppState>().db.clone()
}

#[allow(unused_variables)]
pub fn get_items<R: Runtime>(
    app: &AppHandle<R>,
    repo_id: Option<&str>,
    priority: Option<&str>,
    include_dismissed: bool,
    tab: Option<&str>,
) -> Vec<Item> {
    let conn = get_db(app);
    let conn = conn.lock().unwrap();
    let mut sql = String::from(
        "SELECT i.id, i.repo_id, COALESCE(r.name, 'unknown') as repo_name, i.type, i.priority, i.title, i.detail, i.score, i.is_bot, i.is_slop, i.is_first_timer, i.dismissed, i.created_at, i.updated_at, i.github_url, i.emoji, i.tags FROM items i LEFT JOIN repos r ON i.repo_id = r.id WHERE 1=1"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(rid) = repo_id {
        sql.push_str(" AND i.repo_id = ?");
        params_vec.push(Box::new(rid.to_string()));
    }

    if !include_dismissed {
        sql.push_str(" AND i.dismissed = 0");
    }

    match tab {
        Some("urgent") => sql.push_str(" AND i.priority = 'urgent'"),
        Some("today") | Some("pending") => sql.push_str(" AND i.priority = 'today'"),
        Some("later") => sql.push_str(" AND i.priority = 'later'"),
        Some("noise") => sql.push_str(" AND i.priority = 'noise'"),
        Some("all") => sql.push_str(" AND i.priority != 'noise'"),
        _ => {}
    }

    sql.push_str(" ORDER BY i.score DESC, i.updated_at DESC LIMIT 200");

    let mut stmt = conn.prepare(&sql).unwrap();
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Item {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                repo_name: row.get(2)?,
                item_type: row.get(3)?,
                priority: row.get(4)?,
                title: row.get(5)?,
                detail: row.get(6)?,
                score: row.get(7)?,
                is_bot: row.get::<_, i64>(8)? != 0,
                is_slop: row.get::<_, i64>(9)? != 0,
                is_first_timer: row.get::<_, i64>(10)? != 0,
                dismissed: row.get::<_, i64>(11)? != 0,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                github_url: row.get(14)?,
                emoji: row.get(15)?,
                tags: serde_json::from_str(
                    &row.get::<_, String>(16)
                        .unwrap_or_else(|_| "[]".to_string()),
                )
                .unwrap_or_default(),
                comments_count: 0,
                body: None,
            })
        })
        .unwrap();

    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_item_by_id<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<Item> {
    let conn = get_db(app);
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT i.id, i.repo_id, COALESCE(r.name, 'unknown') as repo_name, i.type, i.priority, i.title, i.detail, i.score, i.is_bot, i.is_slop, i.is_first_timer, i.dismissed, i.created_at, i.updated_at, i.github_url, i.emoji, i.tags FROM items i LEFT JOIN repos r ON i.repo_id = r.id WHERE i.id = ?"
    ).unwrap();

    stmt.query_row(params![id], |row| {
        Ok(Item {
            id: row.get(0)?,
            repo_id: row.get(1)?,
            repo_name: row.get(2)?,
            item_type: row.get(3)?,
            priority: row.get(4)?,
            title: row.get(5)?,
            detail: row.get(6)?,
            score: row.get(7)?,
            is_bot: row.get::<_, i64>(8)? != 0,
            is_slop: row.get::<_, i64>(9)? != 0,
            is_first_timer: row.get::<_, i64>(10)? != 0,
            dismissed: row.get::<_, i64>(11)? != 0,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            github_url: row.get(14)?,
            emoji: row.get(15)?,
            tags: serde_json::from_str(
                &row.get::<_, String>(16)
                    .unwrap_or_else(|_| "[]".to_string()),
            )
            .unwrap_or_default(),
            comments_count: 0,
            body: None,
        })
    })
    .ok()
}

pub fn get_comments_for_item<R: Runtime>(app: &AppHandle<R>, item_id: &str) -> Vec<Comment> {
    let conn = get_db(app);
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, item_id, author, author_association, body, created_at, avatar_url FROM comments WHERE item_id = ? ORDER BY created_at ASC"
    ).unwrap();

    let rows = stmt
        .query_map(params![item_id], |row| {
            Ok(Comment {
                id: row.get(0)?,
                item_id: row.get(1)?,
                author: row.get(2)?,
                author_association: row.get(3)?,
                body: row.get(4)?,
                created_at: row.get(5)?,
                avatar_url: row.get(6)?,
            })
        })
        .unwrap();

    rows.filter_map(|r| r.ok()).collect()
}

pub fn upsert_comment<R: Runtime>(app: &AppHandle<R>, id: &str, item_id: &str, comment: &Comment) {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    let _ = conn.execute(
        "INSERT OR REPLACE INTO comments (id, item_id, author, author_association, body, created_at, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![id, item_id, &comment.author, &comment.author_association, &comment.body, &comment.created_at, &comment.avatar_url],
    );
}

pub fn get_repos_list<R: Runtime>(app: &AppHandle<R>) -> Vec<Repo> {
    let conn = get_db(app);
    let conn = conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, owner, enabled, last_synced_at FROM repos ORDER BY name")
        .unwrap();

    let rows = stmt
        .query_map([], |row| {
            Ok(Repo {
                id: row.get(0)?,
                name: row.get(1)?,
                owner: row.get(2)?,
                enabled: row.get::<_, i64>(3)? != 0,
                last_synced_at: row.get(4)?,
            })
        })
        .unwrap();

    rows.filter_map(|r| r.ok()).collect()
}

pub fn set_repo_enabled<R: Runtime>(app: &AppHandle<R>, id: &str, enabled: bool) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE repos SET enabled = ? WHERE id = ?",
        params![enabled as i64, id],
    )
    .is_ok()
}

pub fn delete_repo<R: Runtime>(app: &AppHandle<R>, id: &str) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.execute("DELETE FROM repos WHERE id = ?", params![id]).is_ok()
}

pub fn dismiss_item<R: Runtime>(app: &AppHandle<R>, id: &str) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.execute("UPDATE items SET dismissed = 1 WHERE id = ?", params![id])
        .is_ok()
}

pub fn dismiss_repo_items<R: Runtime>(app: &AppHandle<R>, repo_id: &str) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.execute("UPDATE items SET dismissed = 1 WHERE repo_id = ? AND dismissed = 0", params![repo_id])
        .is_ok()
}

pub fn get_setting<R: Runtime>(app: &AppHandle<R>, key: &str) -> Option<String> {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_setting<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        params![key, value],
    )
    .is_ok()
}

pub fn upsert_repo<R: Runtime>(app: &AppHandle<R>, id: &str, name: &str, owner: &str) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO repos (id, name, owner, enabled, last_synced_at) VALUES (?, ?, ?, COALESCE((SELECT enabled FROM repos WHERE id = ?), 1), datetime('now'))",
        params![id, name, owner, id],
    ).is_ok()
}

pub fn upsert_item<R: Runtime>(app: &AppHandle<R>, item: &crate::github::ParsedItem) -> bool {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    let tags_json = serde_json::to_string(&item.tags).unwrap_or_default();
    let result = conn.execute(
        "INSERT OR REPLACE INTO items (id, repo_id, type, priority, title, detail, score, is_bot, is_slop, is_first_timer, dismissed, created_at, updated_at, github_url, emoji, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT dismissed FROM items WHERE id = ?), 0), ?, ?, ?, ?, ?)",
        params![
            item.id, item.repo_id, item.item_type, item.priority,
            item.title, item.detail, item.score,
            item.is_bot as i64, item.is_slop as i64, item.is_first_timer as i64,
            item.id, // for dismissed check
            item.created_at, item.updated_at, item.github_url, item.emoji, tags_json,
        ],
    );
    result.is_ok()
}

pub fn mark_synced<R: Runtime>(app: &AppHandle<R>) {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE settings SET value = ? WHERE key = 'last_sync_time'",
        params![now],
    )
    .ok();
}

pub fn get_summary<R: Runtime>(app: &AppHandle<R>) -> Summary {
    let db = get_db(app);
    let conn = db.lock().unwrap();
    let total_items: i64 = conn
        .query_row("SELECT COUNT(*) FROM items WHERE dismissed = 0", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    let urgent_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE priority = 'urgent' AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let today_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE priority = 'today' AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let later_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE priority = 'later' AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let noise_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE priority = 'noise' AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let repos_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM repos WHERE enabled = 1", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    let critial_cves: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE type = 'security' AND score >= 70 AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let waiting_prs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE type = 'pr' AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let first_timers: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE is_first_timer = 1 AND dismissed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let security_alerts: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE dismissed = 0 AND (type = 'security' OR tags LIKE '%\"CVE\"%')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let ci_failures: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE dismissed = 0 AND (tags LIKE '%\"CI\"%' OR tags LIKE '%\"CI-FAILURE\"%')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let stale_items: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE dismissed = 0 AND (tags LIKE '%\"STALE\"%' OR (priority = 'later' AND type = 'pr'))",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let bot_activity: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE dismissed = 0 AND (is_bot = 1 OR tags LIKE '%\"BOT\"%')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let slop_items: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE dismissed = 0 AND (is_slop = 1 OR tags LIKE '%\"AI-SLOP\"%')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let conflicted_prs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE dismissed = 0 AND tags LIKE '%\"CONFLICT\"%'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Summary {
        total_items,
        urgent_count,
        today_count,
        later_count,
        noise_count,
        repos_count,
        critial_cves,
        waiting_prs,
        first_timers,
        security_alerts,
        ci_failures,
        stale_items,
        bot_activity,
        slop_items,
        conflicted_prs,
    }
}
