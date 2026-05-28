mod activate;
mod commands;
mod db;
mod github;
mod tray;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub struct NotifiedItems {
    pub ids: Mutex<HashSet<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            db::init(app.handle())?;
            tray::create_tray(app.handle())?;
            activate::install_outside_click_monitor(app.handle());

            // Track notified items this session
            app.manage(NotifiedItems {
                ids: Mutex::new(HashSet::new()),
            });

            // Start polling loop if in polling mode
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_polling_loop(handle).await;
            });

            // Prewarm popover after Vite is ready (fixes first-click delay)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                tray::prewarm_popover(&handle);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_items,
            commands::get_item,
            commands::get_comments,
            commands::fetch_item_comments,
            commands::get_repos,
            commands::dismiss_item,
            commands::dismiss_repo_items,
            commands::resize_popover,
            commands::get_settings,
            commands::update_setting,
            commands::get_summary,
            commands::get_sync_status,
            commands::start_auth,
            commands::get_pending_auth,
            commands::test_client_id,
            commands::get_auth_state,
            commands::force_sync,
            commands::is_authenticated,
            commands::disconnect_github,
            commands::fetch_available_repos,
            commands::set_enabled_repos,
            commands::set_repo_enabled,
            commands::remove_repo,
            commands::add_repo,
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { .. } => {
                let _ = window.hide();
            }
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "popover" {
                    let _ = window.hide();
                }
            }
            tauri::WindowEvent::Moved(pos) => {
                if window.label() == "popover" {
                    let app = window.app_handle();
                    let _ = crate::db::set_setting(app, "popover_x", &pos.x.to_string());
                    let _ = crate::db::set_setting(app, "popover_y", &pos.y.to_string());
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running companion");
}

async fn start_polling_loop<R: Runtime>(app: AppHandle<R>) {
    loop {
        let token = db::get_setting(&app, "github_token");
        if let Some(token) = token {
            if !token.is_empty() {
                let _ = smart_poll::<R>(&app, &token).await;
                check_notifications::<R>(&app).await;
                update_badge_from_summary::<R>(&app);
                let interval = db::get_setting(&app, "poll_interval_s")
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(60)
                    .clamp(30, 300);
                tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
            } else {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            }
        } else {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    }
}

async fn smart_poll<R: Runtime>(app: &AppHandle<R>, token: &str) -> bool {
    let repos = db::get_repos_list(app);
    let slop = db::get_setting(app, "slop_sensitivity").unwrap_or_else(|| "medium".to_string());
    let mut new_items = 0u64;
    let mut found_any = false;

    // ── Step 1: Notifications tripwire ──
    let notif_etag = db::get_setting(app, "etag_notifications");
    let (notifs, notif_new_etag) = match github::fetch_notifications(token, notif_etag).await {
        Ok((n, e)) => (n, e),
        Err(_) => (vec![], None), // API fail → scan all repos below
    };
    if let Some(ref e) = notif_new_etag { let _ = db::set_setting(app, "etag_notifications", e); }
    let notif_repos: std::collections::HashSet<String> = notifs.into_iter().collect();
    let have_notifs = !notif_repos.is_empty();

    for repo in &repos {
        if !repo.enabled { continue; }
        let parts: Vec<&str> = repo.name.split('/').collect();
        if parts.len() < 2 { continue; }
        let owner = parts[0];
        let name = parts[1];

        // ETag helpers
        let etag = |key: &str| db::get_setting(app, &format!("etag_{}_{}/{}", key, owner, name));
        let save_etag = |key: &str, val: &Option<String>| {
            if let Some(ref v) = val { let _ = db::set_setting(app, &format!("etag_{}_{}/{}", key, owner, name), v); }
        };

        // CI streak: load before polling
        let ci_key = format!("ci_fail_streak_{}/{}", owner, name);
        let ci_streak: u64 = db::get_setting(app, &ci_key).and_then(|s| s.parse().ok()).unwrap_or(0);

        // ── Step 2: Only deep-scan repos with notifications ──
        let should_scan = !have_notifs || notif_repos.contains(&repo.name);
        if should_scan {
            // GraphQL
            let etg = etag("graphql");
            match github::fetch_repo_items(token, owner, name, &repo.id, &repo.name, &slop, etg).await {
                Ok((items, new_etag)) => {
                    save_etag("graphql", &new_etag);
                    for item in &items { if db::upsert_item(app, item) { new_items += 1; found_any = true; } }
                    db::upsert_repo(app, &repo.id, &repo.name, owner);
                }
                Err(e) => eprintln!("Poll {}: {}", repo.name, e),
            }

            // REST sources
            for source in ["workflows", "security", "releases"].iter() {
                let etg = etag(source);
                let result = match *source {
                    "workflows" => github::fetch_repo_workflows(token, owner, name, &repo.id, &repo.name, &slop, etg).await,
                    "security" => github::fetch_security_advisories(token, owner, name, &repo.id, &repo.name, &slop, etg).await,
                    _ => github::fetch_releases(token, owner, name, &repo.id, &repo.name, &slop, etg).await,
                };
                if let Ok((items, new_etag)) = result {
                    save_etag(source, &new_etag);
                    let mut had_ci_failure = false;
                    for item in &items {
                        if db::upsert_item(app, item) { new_items += 1; found_any = true; }
                        if source == &"workflows" && item.item_type == "ci" {
                            had_ci_failure = true;
                            // Boost score for consecutive failures
                            let streak_boost = (ci_streak as i64).min(3) * 10;
                            if streak_boost > 0 {
                                let mut boosted = item.clone();
                                boosted.score = (boosted.score + streak_boost).min(100);
                                if ci_streak >= 2 { boosted.tags.push("CI-STREAK".to_string()); }
                                let _ = db::upsert_item(app, &boosted);
                            }
                        }
                    }
                    if had_ci_failure {
                        let _ = db::set_setting(app, &ci_key, &(ci_streak + 1).to_string());
                    }
                }
            }
        }

        // ── Step 3: Force push detection ──
        let head_key = format!("last_main_sha_{}/{}", owner, name);
        let last_sha = db::get_setting(app, &head_key);
        let last_sha_clone = last_sha.clone();
        if let Ok((new_sha, was_forced)) = github::check_force_push(token, owner, name, last_sha).await {
            let _ = db::set_setting(app, &head_key, &new_sha);
            if was_forced {
                let prev = last_sha_clone.unwrap_or_default();
                let now = ::chrono::Utc::now().to_rfc3339();
                let item = crate::github::ParsedItem {
                    id: format!("fp_{}", new_sha),
                    repo_id: repo.id.clone(),
                    repo_name: repo.name.clone(),
                    item_type: "force_push".to_string(),
                    title: "Force push detected on main".to_string(),
                    detail: format!("HEAD moved from {} to {} — history was rewritten", prev, new_sha),
                    score: 80,
                    priority: "urgent".to_string(),
                    is_bot: false, is_slop: false, is_first_timer: false,
                    created_at: now.clone(), updated_at: now,
                    github_url: format!("https://github.com/{}/{}/commits/main", owner, name),
                    emoji: "💥".to_string(),
                    tags: vec!["FORCE-PUSH".to_string(), "URGENT".to_string()],
                    author_association: "NONE".to_string(),
                    comments_count: 0, body: None, labels: vec![],
                };
                if db::upsert_item(app, &item) { new_items += 1; found_any = true; }
            }
        }

        // ── Step 4: Always-run secret scanning (lightweight) ──
        let etg = etag("secrets");
        if let Ok((items, new_etag)) = github::fetch_secret_scanning(token, owner, name, &repo.id, &repo.name, &slop, etg).await {
            save_etag("secrets", &new_etag);
            for item in &items { if db::upsert_item(app, item) { new_items += 1; found_any = true; } }
        }
    }

    db::mark_synced(app);
    let _ = app.emit("items-updated", serde_json::json!({ "new_items": new_items }));
    found_any
}

async fn check_notifications<R: Runtime>(app: &AppHandle<R>) {
    let summary = db::get_summary(app);
    if summary.urgent_count > 0 {
        if let Some(state) = app.try_state::<NotifiedItems>() {
            let mut notified = state.ids.lock().unwrap();

            // Get all urgent items that haven't been notified
            let urgent_items = db::get_items(app, None, None, false, Some("urgent"));
            for item in &urgent_items {
                if !notified.contains(&item.id) {
                    notified.insert(item.id.clone());

                    // Send OS notification
                    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
                    {
                        use tauri_plugin_notification::NotificationExt;
                        let _ = app
                            .notification()
                            .builder()
                            .title("Vigil")
                            .body(format!("🔴 {}: {}", item.title, item.detail))
                            .show();
                    }
                }
            }
        }
    }
}

fn update_badge_from_summary<R: Runtime>(app: &AppHandle<R>) {
    let summary = db::get_summary(app);
    tray::update_badge(app, summary.urgent_count, summary.total_items);

    let _ = app.emit(
        "summary-updated",
        serde_json::json!({
            "total": summary.total_items,
            "urgent": summary.urgent_count,
            "today": summary.today_count,
        }),
    );
}
