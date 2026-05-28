#![allow(dead_code)]

use crate::{db, github, tray};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Debug, Serialize, Deserialize)]
pub struct ItemsQuery {
    pub repo_id: Option<String>,
    pub priority: Option<String>,
    pub include_dismissed: Option<bool>,
    pub tab: Option<String>,
}

#[tauri::command]
pub fn get_items<R: Runtime>(app: AppHandle<R>, query: ItemsQuery) -> Vec<db::Item> {
    db::get_items(
        &app,
        query.repo_id.as_deref(),
        query.priority.as_deref(),
        query.include_dismissed.unwrap_or(false),
        query.tab.as_deref(),
    )
}

#[tauri::command]
pub fn get_item<R: Runtime>(app: AppHandle<R>, id: String) -> Option<db::Item> {
    db::get_item_by_id(&app, &id)
}

#[tauri::command]
pub fn get_comments<R: Runtime>(app: AppHandle<R>, item_id: String) -> Vec<db::Comment> {
    db::get_comments_for_item(&app, &item_id)
}

#[tauri::command]
pub async fn fetch_item_comments<R: Runtime>(app: AppHandle<R>, item_id: String) -> Result<Vec<db::Comment>, String> {
    let item = db::get_item_by_id(&app, &item_id).ok_or("Item not found")?;

    // Only issues, PRs, and discussions support comments
    if item.item_type != "issue" && item.item_type != "pr" && item.item_type != "discussion" {
        return Ok(Vec::new());
    }

    let parts: Vec<&str> = item.repo_name.split('/').collect();
    let (owner, repo) = if parts.len() >= 2 {
        (parts[0].to_string(), parts[1].to_string())
    } else {
        return Err("Invalid repo name".to_string());
    };
    let number: i64 = item.github_url
        .rsplit('/')
        .next()
        .and_then(|n| n.parse().ok())
        .ok_or("Could not parse issue number")?;
    let token = db::get_setting(&app, "github_token").ok_or("Not authenticated")?;

    let raw = github::fetch_item_comments(&token, &owner, &repo, number).await?;
    let mut comments = Vec::new();
    for (c_id, author, body, created, avatar) in raw {
        comments.push(db::Comment {
            id: c_id.clone(),
            item_id: item_id.clone(),
            author,
            author_association: "NONE".to_string(),
            body,
            created_at: created,
            avatar_url: avatar,
        });
        db::upsert_comment(&app, &c_id, &item_id, &comments.last().unwrap());
    }
    Ok(comments)
}

#[tauri::command]
pub fn get_repos<R: Runtime>(app: AppHandle<R>) -> Vec<db::Repo> {
    db::get_repos_list(&app)
}

#[tauri::command]
pub fn dismiss_item<R: Runtime>(app: AppHandle<R>, id: String) -> bool {
    db::dismiss_item(&app, &id)
}

#[tauri::command]
pub fn dismiss_repo_items<R: Runtime>(app: AppHandle<R>, repo_id: String) -> bool {
    db::dismiss_repo_items(&app, &repo_id)
}

#[tauri::command]
pub fn resize_popover<R: Runtime>(app: AppHandle<R>, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("popover") {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }
}

#[tauri::command]
pub fn get_settings<R: Runtime>(app: AppHandle<R>) -> HashMap<String, String> {
    let keys = [
        "sync_mode",
        "poll_interval_s",
        "slop_sensitivity",
        "stale_days",
        "firsttimer_days",
        "badge_enabled",
        "sound_enabled",
        "theme",
        "compact_mode",
        "bot_auto_collapse",
        "ci_main_weight",
        "github_token",
        "github_username",
    ];

    let mut map = HashMap::new();
    for key in &keys {
        if let Some(value) = db::get_setting(&app, key) {
            if *key == "github_token" && !value.is_empty() {
                map.insert(key.to_string(), "••••••••".to_string());
            } else {
                map.insert(key.to_string(), value);
            }
        }
    }
    map
}

#[tauri::command]
pub fn update_setting<R: Runtime>(app: AppHandle<R>, key: String, value: String) -> bool {
    db::set_setting(&app, &key, &value)
}

#[tauri::command]
pub fn get_summary<R: Runtime>(app: AppHandle<R>) -> db::Summary {
    db::get_summary(&app)
}

#[tauri::command]
pub fn get_sync_status<R: Runtime>(app: AppHandle<R>) -> db::SyncStatus {
    let last_synced = db::get_setting(&app, "last_sync_time").unwrap_or_default();
    let new_items = db::get_items(&app, None, None, false, None).len() as i64;
    db::SyncStatus {
        last_synced,
        repos_checked: db::get_repos_list(&app).len() as i64,
        new_items,
    }
}

// ---- Auth Commands ----

#[tauri::command]
pub async fn start_auth<R: Runtime>(
    app: AppHandle<R>,
) -> Result<github::DeviceFlowResponse, String> {
    let client_id = db::get_setting(&app, "github_client_id").unwrap_or_else(|| "".to_string());

    if client_id.is_empty() {
        return Err("NO_CLIENT_ID: Please enter your GitHub OAuth App Client ID.".to_string());
    }

    if client_id.trim().len() < 8 {
        return Err("INVALID_CLIENT_ID: Client ID is too short. Check your clipboard.".to_string());
    }

    let flow = github::start_device_flow(&client_id).await.map_err(|e| {
        if e.contains("incorrect") || e.contains("invalid") || e.contains("401") {
            "DEVICE_FLOW_REJECTED: The Client ID was rejected by GitHub. It may be expired or invalid.".to_string()
        } else if e.contains("timeout") || e.contains("timed out") {
            "AUTHORIZATION_TIMEOUT: GitHub took too long to respond. Check your connection and try again.".to_string()
        } else {
            format!("GitHub error: {}", e)
        }
    })?;

    // Save pending flow info so we can resume polling after popover close
    db::set_setting(&app, "pending_device_code", &flow.device_code);
    db::set_setting(&app, "pending_interval", &flow.interval.to_string());

    // Spawn background polling that survives popover close
    let app_clone = app.clone();
    let client_id = client_id.clone();
    let device_code = flow.device_code.clone();
    let interval = flow.interval;
    tauri::async_runtime::spawn(async move {
        match github::poll_for_token(&client_id, &device_code, interval).await {
            Ok(token) => {
                db::set_setting(&app_clone, "github_token", &token);
                // Clear pending state
                db::set_setting(&app_clone, "pending_device_code", "");
                db::set_setting(&app_clone, "pending_interval", "");

                // Fetch username
                let client = reqwest::Client::new();
                let user_resp = client
                    .get("https://api.github.com/user")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("User-Agent", "companion-app/0.1.0")
                    .send()
                    .await;
                if let Ok(resp) = user_resp {
                    if let Ok(user) = resp.json::<serde_json::Value>().await {
                        if let Some(login) = user.get("login").and_then(|l| l.as_str()) {
                            db::set_setting(&app_clone, "github_username", login);
                        }
                        if let Some(avatar) = user.get("avatar_url").and_then(|a| a.as_str()) {
                            db::set_setting(&app_clone, "github_avatar_url", avatar);
                        }
                    }
                }

                let _ = app_clone.emit("auth-complete", ());
            }
            Err(e) => {
                eprintln!("Background auth polling failed: {e}");
                db::set_setting(&app_clone, "pending_device_code", "");
                db::set_setting(&app_clone, "pending_interval", "");
            }
        }
    });

    Ok(flow)
}

#[tauri::command]
pub fn is_authenticated<R: Runtime>(app: AppHandle<R>) -> bool {
    db::get_setting(&app, "github_token")
        .map(|t| !t.is_empty())
        .unwrap_or(false)
}

#[tauri::command]
pub fn get_pending_auth<R: Runtime>(app: AppHandle<R>) -> bool {
    let code = db::get_setting(&app, "pending_device_code").unwrap_or_default();
    !code.is_empty()
}

#[tauri::command]
pub async fn test_client_id<R: Runtime>(app: AppHandle<R>, client_id: String) -> Result<String, String> {
    if client_id.trim().is_empty() {
        return Err("NO_CLIENT_ID: Client ID is empty.".to_string());
    }
    if client_id.trim().len() < 8 {
        return Err("Client ID too short.".to_string());
    }
    github::start_device_flow(&client_id.trim()).await?;
    Ok("valid".to_string())
}

#[tauri::command]
pub fn get_auth_state<R: Runtime>(app: AppHandle<R>) -> String {
    let has_token = db::get_setting(&app, "github_token").map(|t| !t.is_empty()).unwrap_or(false);
    let pending = db::get_setting(&app, "pending_device_code")
        .map(|c| !c.is_empty()).unwrap_or(false);
    let username = db::get_setting(&app, "github_username").unwrap_or_default();

    if has_token && !username.is_empty() {
        format!("connected:{}", username)
    } else if has_token {
        "connected".to_string()
    } else if pending {
        "waiting".to_string()
    } else {
        "disconnected".to_string()
    }
}

#[tauri::command]
pub fn disconnect_github<R: Runtime>(app: AppHandle<R>) -> bool {
    db::set_setting(&app, "github_token", "");
    db::set_setting(&app, "github_username", "");
    db::set_setting(&app, "github_avatar_url", "");
    true
}

// ---- Repo Selection Commands ----

#[tauri::command]
pub async fn fetch_available_repos<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<github::AvailableRepo>, String> {
    let token = db::get_setting(&app, "github_token").ok_or("Not authenticated")?;
    if token.is_empty() {
        return Err("Not authenticated".to_string());
    }
    let repos = github::fetch_user_repos(&token).await?;

    // Filter out repos already in the DB — only show unadded ones
    let existing: std::collections::HashSet<String> =
        db::get_repos_list(&app).into_iter().map(|r| r.id).collect();
    let new_repos: Vec<_> = repos.into_iter().filter(|r| !existing.contains(&r.id)).collect();

    Ok(new_repos)
}

#[tauri::command]
pub fn set_enabled_repos<R: Runtime>(app: AppHandle<R>, repo_ids: Vec<String>) -> bool {
    let all = db::get_repos_list(&app);

    for repo in &all {
        let enable = repo_ids.contains(&repo.id);
        db::set_repo_enabled(&app, &repo.id, enable);
    }

    true
}

#[tauri::command]
pub fn set_repo_enabled<R: Runtime>(app: AppHandle<R>, repo_id: String, enabled: bool) -> bool {
    db::set_repo_enabled(&app, &repo_id, enabled)
}

#[tauri::command]
pub fn remove_repo<R: Runtime>(app: AppHandle<R>, repo_id: String) -> bool {
    db::delete_repo(&app, &repo_id)
}

#[tauri::command]
pub async fn add_repo<R: Runtime>(
    app: AppHandle<R>,
    owner: String,
    name: String,
) -> Result<(), String> {
    let token = db::get_setting(&app, "github_token").ok_or("Not authenticated")?;
    if token.is_empty() {
        return Err("Not authenticated".to_string());
    }

    // Look up repo info from GitHub REST API
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://api.github.com/repos/{}/{}", owner, name))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "companion-app/0.1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch repo: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Repo not found or not accessible: {}/{}",
            owner, name
        ));
    }

    let repo: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse repo: {}", e))?;

    let id = repo["id"].to_string();
    let full_name = format!("{}/{}", owner, name);

    db::upsert_repo(&app, &id, &full_name, &owner);

    Ok(())
}

// ---- Sync Commands ----

#[tauri::command]
pub async fn force_sync<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let token =
        db::get_setting(&app, "github_token").ok_or_else(|| "Not authenticated".to_string())?;

    if token.is_empty() {
        return Err("Not authenticated".to_string());
    }

    let repos = db::get_repos_list(&app);
    let slop_sensitivity =
        db::get_setting(&app, "slop_sensitivity").unwrap_or_else(|| "medium".to_string());
    let mut synced = 0u64;
    let mut failed = Vec::new();
    let mut queried = 0u64;

    for repo in &repos {
        if !repo.enabled {
            continue;
        }
        let parts: Vec<&str> = repo.name.split('/').collect();
        if parts.len() < 2 {
            continue;
        }
        let owner = parts[0];
        let name = parts[1];

        queried += 1;
        match github::fetch_repo_items(&token, owner, name, &repo.id, &repo.name, &slop_sensitivity, None).await {
            Ok((items, _)) => {
                for item in &items { db::upsert_item(&app, item); synced += 1; }
                db::upsert_repo(&app, &repo.id, &repo.name, owner);
            }
            Err(e) => { eprintln!("Sync error: {} {} - {}", owner, name, e); failed.push(format!("{}/{}", owner, name)); }
        }

        for (source, log_errors) in &[("workflows", true), ("security", true), ("secrets", false), ("releases", true)] {
            let result = match *source {
                "workflows" => github::fetch_repo_workflows(&token, owner, name, &repo.id, &repo.name, &slop_sensitivity, None).await,
                "security" => github::fetch_security_advisories(&token, owner, name, &repo.id, &repo.name, &slop_sensitivity, None).await,
                "secrets" => github::fetch_secret_scanning(&token, owner, name, &repo.id, &repo.name, &slop_sensitivity, None).await,
                _ => github::fetch_releases(&token, owner, name, &repo.id, &repo.name, &slop_sensitivity, None).await,
            };
            match result {
                Ok((items, _)) => { for item in &items { db::upsert_item(&app, item); synced += 1; } }
                Err(e) => { if *log_errors { eprintln!("{} poll error {} {}: {}", source, owner, name, e); } }
            }
        }
    }

    db::mark_synced(&app);

    let summary = db::get_summary(&app);
    tray::update_badge(&app, summary.urgent_count, summary.total_items);

    let _ = app.emit("items-updated", serde_json::json!({ "new_items": synced }));
    let _ = app.emit(
        "summary-updated",
        serde_json::json!({
            "total": summary.total_items,
            "urgent": summary.urgent_count,
        }),
    );

    let mut msg = format!("Synced {} items across {} repos", synced, queried);
    if !failed.is_empty() {
        msg.push_str(&format!(". {} failed (see logs)", failed.len()));
    }
    Ok(msg)
}
