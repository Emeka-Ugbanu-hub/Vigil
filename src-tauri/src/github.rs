#![allow(dead_code)]

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---- Types ----

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceFlowResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeviceCodeRequest {
    client_id: String,
    scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct AccessTokenRequest {
    client_id: String,
    device_code: String,
    grant_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AccessTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GraphQLQuery {
    query: String,
    variables: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GraphQLResponse {
    data: Option<GraphQLData>,
    errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GraphQLError {
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GraphQLData {
    #[serde(default)]
    repository: Option<RepositoryData>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryData {
    #[serde(default)]
    issues: IssueConnection,
    #[serde(default)]
    pull_requests: PRConnection,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct IssueConnection {
    #[serde(default)]
    nodes: Vec<IssueNode>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct PRConnection {
    #[serde(default)]
    nodes: Vec<PRNode>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueNode {
    id: String,
    title: String,
    url: String,
    state: String,
    created_at: String,
    updated_at: String,
    body: Option<String>,
    author: Option<Actor>,
    #[serde(default)]
    labels: LabelConnection,
    comments: CountConnection,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PRNode {
    id: String,
    title: String,
    url: String,
    state: String,
    created_at: String,
    updated_at: String,
    body: Option<String>,
    author: Option<Actor>,
    #[serde(default)]
    labels: LabelConnection,
    comments: CountConnection,
    mergeable: Option<String>,
    reviews: CountConnection,
    additions: Option<i64>,
    deletions: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Actor {
    login: String,
    #[serde(rename = "__typename")]
    typename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct LabelConnection {
    #[serde(default)]
    nodes: Vec<LabelNode>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LabelNode {
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CountConnection {
    total_count: i64,
}

impl Default for CountConnection {
    fn default() -> Self {
        CountConnection { total_count: 0 }
    }
}

#[derive(Debug, Clone)]
pub struct ParsedItem {
    pub id: String,
    pub repo_id: String,
    pub repo_name: String,
    pub item_type: String,
    pub title: String,
    pub detail: String,
    pub score: i64,
    pub priority: String,
    pub is_bot: bool,
    pub is_slop: bool,
    pub is_first_timer: bool,
    pub created_at: String,
    pub updated_at: String,
    pub github_url: String,
    pub emoji: String,
    pub tags: Vec<String>,
    pub author_association: String,
    pub comments_count: i64,
    pub body: Option<String>,
    pub labels: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AvailableRepo {
    pub id: String,
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub private: bool,
    pub description: Option<String>,
}

// ---- OAuth Device Flow ----

pub async fn start_device_flow(client_id: &str) -> Result<DeviceFlowResponse, String> {
    let client = reqwest::Client::new();
    let params = DeviceCodeRequest {
        client_id: client_id.to_string(),
        scope: "repo,read:user".to_string(),
    };

    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Device code request failed: {}", e))?;

    let body: DeviceCodeResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse device code response failed: {}", e))?;

    Ok(DeviceFlowResponse {
        device_code: body.device_code,
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        interval: body.interval.max(5),
    })
}

pub async fn poll_for_token(
    client_id: &str,
    device_code: &str,
    interval: u64,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let params = AccessTokenRequest {
        client_id: client_id.to_string(),
        device_code: device_code.to_string(),
        grant_type: "urn:ietf:params:oauth:grant-type:device_code".to_string(),
    };

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token poll failed: {}", e))?;

        let body: AccessTokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Parse token response failed: {}", e))?;

        if let Some(token) = body.access_token {
            return Ok(token);
        }

        match body.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                // Wait extra time on slow_down
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
            Some(e) => {
                return Err(format!(
                    "Auth error: {} - {}",
                    e,
                    body.error_description.unwrap_or_default()
                ))
            }
            None => return Err("No token and no error in response".to_string()),
        }
    }
}

// ---- GraphQL Query ----

const REPO_QUERY: &str = r#"
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    issues(first: 20, states: [OPEN], orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        id, title, url, state, createdAt, updatedAt, body
        author { login, __typename }
        labels(first: 10) { nodes { name } }
        comments { totalCount }
        stateReason
        comments(first: 15) { nodes { author { login } body createdAt } }
      }
    }
    pullRequests(first: 30, states: [OPEN], orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        id, title, url, state, createdAt, updatedAt, body
        author { login, __typename }
        labels(first: 10) { nodes { name } }
        comments { totalCount }
        mergeable, reviews { totalCount }, additions, deletions
        isDraft
        reviewDecision
        stateReason
        comments(first: 15) { nodes { author { login } body createdAt } }
        reviews(first: 10, states: [APPROVED, CHANGES_REQUESTED]) {
          nodes { state author { login } createdAt }
        }
        commits(first: 1) { nodes { commit { committedDate author { name } } } }
        timelineItems(first: 10, itemTypes: [READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]) {
          nodes { __typename ... on ReadyForReviewEvent { createdAt } ... on ConvertToDraftEvent { createdAt } }
        }
        statusCheckRollup: commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 10) { nodes { state context targetUrl } } } } } }
        reviewRequests(first: 5) { nodes { requestedReviewer { ... on User { login } } } }
        assignees(first: 3) { nodes { login } }
      }
    }
    discussions(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        id, title, url, createdAt, updatedAt, body
        author { login }
        comments { totalCount }
        answer { isAnswer }
      }
    }
  }
}
"#;

pub async fn fetch_repo_items(
    token: &str,
    owner: &str,
    repo: &str,
    repo_id: &str,
    repo_full_name: &str,
    slop_sensitivity: &str,
    etag: Option<String>,
) -> Result<(Vec<ParsedItem>, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut vars = HashMap::new();
    vars.insert("owner".to_string(), owner.to_string());
    vars.insert("repo".to_string(), repo.to_string());

    let query = GraphQLQuery {
        query: REPO_QUERY.to_string(),
        variables: vars,
    };

    let mut req = client
        .post("https://api.github.com/graphql")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "companion-app/0.1.0")
        .json(&query);

    if let Some(ref e) = etag {
        req = req.header("If-None-Match", e);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("GraphQL request failed: {}", e))?;

    let new_etag = resp.headers().get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if resp.status() == 304 {
        return Ok((Vec::new(), etag));
    }

    if !resp.status().is_success() {
        return Err(format!(
            "GitHub API returned {} for {}/{}",
            resp.status(),
            owner,
            repo
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse response: {}", e))?;

    // Log GraphQL errors if any
    if let Some(errors) = body.get("errors").and_then(|e| e.as_array()) {
        for e in errors {
            if let Some(msg) = e.get("message").and_then(|m| m.as_str()) {
                eprintln!("GraphQL error for {}/{}: {}", owner, repo, msg);
            }
        }
    }

    let mut items = Vec::new();

    // Navigate: data → repository
    let repo_node = match body
        .get("data")
        .and_then(|d| d.get("repository"))
    {
        Some(r) if !r.is_null() => r,
        _ => return Ok((items, new_etag)), // repo not found or no access — skip silently
    };

    // Parse issues
    if let Some(issues) = repo_node
        .get("issues")
        .and_then(|i| i.get("nodes"))
        .and_then(|n| n.as_array())
    {
        for node in issues {
            items.push(parse_issue_node(node, repo_id, repo_full_name, slop_sensitivity));
        }
    }

    // Parse pull requests
    if let Some(prs) = repo_node
        .get("pullRequests")
        .and_then(|p| p.get("nodes"))
        .and_then(|n| n.as_array())
    {
        for node in prs {
            items.push(parse_pr_node(node, repo_id, repo_full_name, slop_sensitivity));
        }
    }

    // Parse discussions
    if let Some(discussions) = repo_node
        .get("discussions")
        .and_then(|d| d.get("nodes"))
        .and_then(|n| n.as_array())
    {
        for node in discussions {
            items.push(parse_discussion_node(node, repo_id, repo_full_name, slop_sensitivity));
        }
    }

    Ok((items, new_etag))
}

fn apply_scoring(mut item: ParsedItem, slop_sensitivity: &str) -> ParsedItem {
    let score = score_parsed_item(&item);
    let slop = detect_slop(&item.title, item.body.as_deref(), item.is_bot);
    let is_slop = is_slop_flagged(&slop, slop_sensitivity);
    let final_score = if is_slop { score.min(14) } else { score };

    item.score = final_score;
    item.priority = priority_from_score(final_score);
    item.is_slop = is_slop;
    if is_slop && !item.tags.contains(&"AI-SLOP".to_string()) {
        item.tags.push("AI-SLOP".to_string());
    }

    item
}

// ---- Scoring Engine ----

fn priority_from_score(score: i64) -> String {
    if score >= 70 { "urgent".to_string() }
    else if score >= 40 { "today".to_string() }
    else if score >= 15 { "later".to_string() }
    else { "noise".to_string() }
}

pub fn get_priority_color(priority: &str) -> &str {
    match priority { "urgent" => "#ff3b30", "today" => "#ff9500", "later" => "#ffd25a", _ => "#8e8e93" }
}

pub fn get_item_emoji(item_type: &str, _priority: &str) -> &'static str {
    match item_type { "security" => "🔒", "ci" => "❌", "pr" => "🔄", "issue" => "🐛", "discussion" => "💬", "release" => "📦", _ => "📌" }
}

pub fn score_parsed_item(item: &ParsedItem) -> i64 {
    let mut score: i64 = 0;
    let now = Utc::now();
    let created = chrono::DateTime::parse_from_rfc3339(&item.created_at).map(|d| d.with_timezone(&Utc)).unwrap_or(now);
    let updated = chrono::DateTime::parse_from_rfc3339(&item.updated_at).map(|d| d.with_timezone(&Utc)).unwrap_or(now);
    let hours_since_update = (now - updated).num_hours() as f64;
    let hours_since_creation = (now - created).num_hours() as f64;
    let days_since_update = hours_since_update / 24.0;
    let days_since_creation = hours_since_creation / 24.0;

    match item.item_type.as_str() {
        "security" => {
            let d = item.detail.to_lowercase();
            if d.contains("critical") { score += 60; }
            else if d.contains("high") { score += 40; }
            else if d.contains("moderate") || d.contains("medium") { score += 25; }
            if d.contains("secret") || d.contains("credential") { score += 70; }
        }
        "ci" => {
            if item.detail.to_lowercase().contains("failed") { score += 20; }
            if item.detail.contains("main") || item.detail.contains("master") { score += 30; }
            else { score += 10; }
            if item.detail.contains("deploy") { score += 25; }
            if item.detail.contains("cron") || item.detail.contains("schedule") { score += 20; }
            if item.tags.contains(&"CI-FAILURE".to_string()) { score += 15; }
        }
        "issue" => {
            if days_since_creation > 3.0 && !item.is_bot { score += 25; }
            if days_since_creation > 7.0 && !item.is_bot { score += 35; }
            if item.comments_count >= 3 { score += 15; }
            if item.comments_count >= 5 { score += 20; }
            if item.comments_count >= 1 && days_since_creation > 3.0 && !item.is_bot { score += 10; }
            if item.tags.contains(&"REOPENED".to_string()) { score += 40; }
            if item.tags.contains(&"DUPLICATE".to_string()) { score -= 30; }
            if item.tags.contains(&"AUTHOR-BUMP".to_string()) { score += 20; }
            if item.tags.contains(&"MAINTAINER-REPLIED".to_string()) { score -= 15; }
            if item.tags.contains(&"HEATING-UP".to_string()) { score += 20; }
        }
        "release" => {
            score += 15;
            if item.tags.contains(&"PRE-RELEASE".to_string()) { score += 10; } else { score += 5; }
        }
        "discussion" => {
            score += 10;
            if item.comments_count >= 5 { score += 20; }
            if item.tags.contains(&"ANSWERED".to_string()) { score -= 15; }
        }
        _ => {}
    }

    if item.item_type == "pr" {
        if item.is_first_timer {
            score += 25;
            if days_since_creation > 3.0 { score += 25; }
            if days_since_creation > 7.0 { score += 35; }
        }
        if !item.is_bot && days_since_creation > 3.0 { score += 15; }
        if !item.is_bot && days_since_creation > 7.0 { score += 20; }
        for label in &item.labels {
            let ll = label.to_lowercase();
            if ll.contains("merge conflict") { score += 30; }
            if ll.contains("changes requested") && days_since_update > 3.0 { score += 25; }
        }
        if days_since_update > 7.0 && days_since_update <= 30.0 { score += 20; }
        if days_since_update > 30.0 { score -= 15; }
        if item.tags.contains(&"CHANGES-REQUESTED".to_string()) { score += 30; }
        if item.tags.contains(&"APPROVED".to_string()) { score -= 20; }
        if item.tags.contains(&"DRAFT".to_string()) { score -= 10; }
        if item.tags.contains(&"REOPENED".to_string()) { score += 35; }
        if item.tags.contains(&"DUPLICATE".to_string()) { score -= 30; }
        if item.tags.contains(&"DRAFT→READY".to_string()) { score += 15; }
        if item.tags.contains(&"PUSHED-AFTER-REVIEW".to_string()) { score += 20; }
        if item.tags.contains(&"CHECK-FAILURE".to_string()) { score += 25; }
        if item.tags.contains(&"REVIEW-REQUIRED".to_string()) { score += 10; }
        if item.tags.contains(&"AUTHOR-BUMP".to_string()) { score += 20; }
        if item.tags.contains(&"MAINTAINER-REPLIED".to_string()) { score -= 15; }
        if item.tags.contains(&"HEATING-UP".to_string()) { score += 20; }
        if item.tags.contains(&"REVIEW-REQUESTED".to_string()) { score += 15; }
        if item.tags.contains(&"ASSIGNED".to_string()) { score += 10; }
    }

    if item.is_bot {
        score -= 30;
        let tl = item.title.to_lowercase();
        let dl = item.detail.to_lowercase();
        if tl.contains("dependabot") || tl.contains("renovate") || dl.contains("dependabot") || dl.contains("renovate") {
            if tl.contains("major") || dl.contains("major") { score += 15; }
            else if tl.contains("patch") || dl.contains("patch") { score -= 25; }
        }
    }

    if hours_since_update <= 2.0 { score += 15; }
    else if hours_since_update <= 24.0 { score += 8; }
    if days_since_update > 30.0 { score -= 10; }

    score.clamp(0, 100)
}

pub fn detect_slop(title: &str, body: Option<&str>, is_bot: bool) -> Vec<String> {
    let mut signals = Vec::new();
    if is_bot { signals.push("Bot account".to_string()); }
    let text = format!("{} {}", title.to_lowercase(), body.unwrap_or("").to_lowercase());
    if text.contains("fixes #") || text.contains("closes #") { signals.push("Auto-linked PR".to_string()); }
    if text.contains("bump version") || text.contains("bump") && text.contains("version") { signals.push("Version bump".to_string()); }
    if text.contains("generated by") || text.contains("auto-generated") { signals.push("Generated content".to_string()); }
    if text.contains("i'm sorry") || text.contains("as an ai") || text.contains("as a large language") { signals.push("LLM phrase".to_string()); }
    if text.contains("feel free") && text.contains("do not hesitate") { signals.push("Template phrase".to_string()); }
    signals
}

pub fn is_slop_flagged(signals: &[String], sensitivity: &str) -> bool {
    let count = signals.len();
    match sensitivity {
        "high" => count >= 1,
        "medium" => count >= 2,
        _ => count >= 3,
    }
}

fn parse_issue_node(node: &serde_json::Value, repo_id: &str, repo_name: &str, slop_sensitivity: &str) -> ParsedItem {
    let author_login = node.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()).unwrap_or("").to_string();
    let typename = node.get("author").and_then(|a| a.get("__typename")).and_then(|t| t.as_str()).unwrap_or("").to_string();
    let is_bot = typename == "Bot" || author_login.contains("[bot]");
    let labels: Vec<String> = node.get("labels").and_then(|l| l.get("nodes")).and_then(|n| n.as_array())
        .map(|arr| arr.iter().filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
    let created_at = node.get("createdAt").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated_at = node.get("updatedAt").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let title = node.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let url = node.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let body = node.get("body").and_then(|b| b.as_str()).map(|s| s.to_string());
    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let comments_count = node.get("comments").and_then(|c| c.get("totalCount")).and_then(|t| t.as_i64()).unwrap_or(0);
    let detail = format!("Issue opened by @{} · {} comments", author_login, comments_count);
    let recent_comments = node.get("comments").and_then(|c| c.get("nodes")).and_then(|n| n.as_array()).map(|arr| arr.to_vec()).unwrap_or_default();
    let non_author_comments: Vec<_> = recent_comments.iter().filter(|c| {
        let login = c.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()).unwrap_or("");
        login != author_login
    }).collect();
    let has_reply = !non_author_comments.is_empty();
    let unique_non_authors: std::collections::HashSet<&str> = non_author_comments.iter()
        .filter_map(|c| c.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()))
        .collect();
    let is_heating_up = unique_non_authors.len() >= 3;
    let has_author_bump = recent_comments.len() > 0
        && !has_reply
        && recent_comments.iter().any(|c| c.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()) == Some(&author_login));
    let mut extra_tags = vec![];
    if has_author_bump { extra_tags.push("AUTHOR-BUMP".to_string()); }
    if has_reply { extra_tags.push("MAINTAINER-REPLIED".to_string()); }
    if is_heating_up { extra_tags.push("HEATING-UP".to_string()); }

    let parsed = ParsedItem {
        id: format!("issue_{}", id), repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "issue".to_string(), title, detail, score: 0, priority: "noise".to_string(),
        is_bot, is_slop: false, is_first_timer: false, created_at: created_at.clone(), updated_at,
        github_url: url, emoji: "🐛".to_string(),
        tags: { let mut t = vec!["ISSUE".to_string()]; t.extend(extra_tags); t },
        author_association: "NONE".to_string(), comments_count, body, labels,
    };

    let score = score_parsed_item(&parsed);
    let mut tags = parsed.tags.clone();
    let slop = detect_slop(&parsed.title, parsed.body.as_deref(), is_bot);
    let is_slop = is_slop_flagged(&slop, slop_sensitivity);
    let final_score = if is_slop { score.min(14) } else { score };
    if is_slop { tags.push("AI-SLOP".to_string()); }
    if is_bot { tags.push("BOT".to_string()); }
    if node.get("stateReason").and_then(|s| s.as_str()).unwrap_or("") == "REOPENED" { tags.push("REOPENED".to_string()); }
    for label in &parsed.labels { if label.to_lowercase().contains("duplicate") { tags.push("DUPLICATE".to_string()); break; } }
    ParsedItem { score: final_score, priority: priority_from_score(final_score), is_slop, is_first_timer: false, tags, ..parsed }
}

fn parse_pr_node(node: &serde_json::Value, repo_id: &str, repo_name: &str, slop_sensitivity: &str) -> ParsedItem {
    let author_login = node.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()).unwrap_or("").to_string();
    let typename = node.get("author").and_then(|a| a.get("__typename")).and_then(|t| t.as_str()).unwrap_or("").to_string();
    let is_bot = typename == "Bot" || author_login.contains("[bot]");
    let labels: Vec<String> = node.get("labels").and_then(|l| l.get("nodes")).and_then(|n| n.as_array())
        .map(|arr| arr.iter().filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
    let created_at = node.get("createdAt").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated_at = node.get("updatedAt").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let title = node.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let url = node.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let body = node.get("body").and_then(|b| b.as_str()).map(|s| s.to_string());
    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let comments_count = node.get("comments").and_then(|c| c.get("totalCount")).and_then(|t| t.as_i64()).unwrap_or(0);
    let reviews_count = node.get("reviews").and_then(|r| r.get("totalCount")).and_then(|t| t.as_i64()).unwrap_or(0);
    let additions = node.get("additions").and_then(|a| a.as_i64()).unwrap_or(0);
    let deletions = node.get("deletions").and_then(|d| d.as_i64()).unwrap_or(0);

    let reviews = node.get("reviews").and_then(|r| r.get("nodes")).and_then(|n| n.as_array()).map(|arr| arr.to_vec()).unwrap_or_default();
    let has_changes_requested = reviews.iter().any(|r| r.get("state").and_then(|s| s.as_str()) == Some("CHANGES_REQUESTED"));
    let _has_approved = reviews.iter().any(|r| r.get("state").and_then(|s| s.as_str()) == Some("APPROVED"));
    let _last_review_author = reviews.last().and_then(|r| r.get("author")).and_then(|a| a.get("login")).and_then(|l| l.as_str()).unwrap_or("");
    let _last_review_state = reviews.last().and_then(|r| r.get("state")).and_then(|s| s.as_str()).unwrap_or("");
    let last_review_date = reviews.last().and_then(|r| r.get("createdAt")).and_then(|d| d.as_str()).unwrap_or("").to_string();

    let commits = node.get("commits").and_then(|c| c.get("nodes")).and_then(|n| n.as_array()).map(|arr| arr.to_vec()).unwrap_or_default();
    let last_commit_date = commits.last().and_then(|c| c.get("commit")).and_then(|c| c.get("committedDate")).and_then(|d| d.as_str()).unwrap_or("").to_string();
    let last_commit_author = commits.last().and_then(|c| c.get("commit")).and_then(|c| c.get("author")).and_then(|a| a.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
    let mut author_pushed_after_review = false;
    if has_changes_requested && !last_review_date.is_empty() && !last_commit_date.is_empty() {
        if last_commit_date > last_review_date && last_commit_author == author_login { author_pushed_after_review = true; }
    }

    let timeline = node.get("timelineItems").and_then(|t| t.get("nodes")).and_then(|n| n.as_array()).map(|arr| arr.to_vec()).unwrap_or_default();
    let was_converted_from_draft = timeline.iter().any(|t| t.get("__typename").and_then(|tn| tn.as_str()) == Some("ReadyForReviewEvent"));

    let check_state = node.get("statusCheckRollup").and_then(|s| s.get("state")).and_then(|s| s.as_str()).unwrap_or("").to_string();
    let check_contexts = node.get("statusCheckRollup").and_then(|s| s.get("contexts")).and_then(|c| c.as_array()).map(|arr| arr.to_vec()).unwrap_or_default();
    let has_failing_checks = check_state == "FAILURE" || check_state == "ERROR" || check_contexts.iter().any(|ctx| { let s = ctx.get("state").and_then(|s| s.as_str()).unwrap_or(""); s == "FAILURE" || s == "ERROR" });

    // Review requests
    let review_requested_users: Vec<String> = node.get("reviewRequests").and_then(|r| r.get("nodes")).and_then(|n| n.as_array())
        .map(|arr| arr.iter().filter_map(|r| r.get("requestedReviewer").and_then(|rr| rr.get("login")).and_then(|l| l.as_str()).map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let has_review_request = !review_requested_users.is_empty();

    // Assignees
    let assignee_logins: Vec<String> = node.get("assignees").and_then(|a| a.get("nodes")).and_then(|n| n.as_array())
        .map(|arr| arr.iter().filter_map(|a| a.get("login").and_then(|l| l.as_str()).map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let has_assignee = !assignee_logins.is_empty();

    let detail = format!("PR by @{} · {} comments · {} reviews · +{}/-{} lines", author_login, comments_count, reviews_count, additions, deletions);

    // Comment analysis
    let recent_comments = node.get("comments").and_then(|c| c.get("nodes")).and_then(|n| n.as_array()).map(|arr| arr.to_vec()).unwrap_or_default();
    let non_author_comments: Vec<_> = recent_comments.iter().filter(|c| {
        let login = c.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()).unwrap_or("");
        login != author_login
    }).collect();
    let has_reply = !non_author_comments.is_empty();
    let unique_non_authors: std::collections::HashSet<&str> = non_author_comments.iter()
        .filter_map(|c| c.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()))
        .collect();
    let is_heating_up = unique_non_authors.len() >= 3;
    let has_author_bump = recent_comments.len() > 0
        && !has_reply
        && recent_comments.iter().any(|c| c.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()) == Some(&author_login));
    let mut extra_tags = vec![];
    if has_author_bump { extra_tags.push("AUTHOR-BUMP".to_string()); }
    if has_reply { extra_tags.push("MAINTAINER-REPLIED".to_string()); }
    if is_heating_up { extra_tags.push("HEATING-UP".to_string()); }

    let parsed = ParsedItem {
        id: format!("pr_{}", id), repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "pr".to_string(), title, detail, score: 0, priority: "noise".to_string(),
        is_bot, is_slop: false, is_first_timer: false, created_at: created_at.clone(), updated_at,
        github_url: url, emoji: "🔄".to_string(), tags: { let mut t = vec!["PR".to_string()]; t.extend(extra_tags); t },
        author_association: "NONE".to_string(), comments_count, body, labels,
    };

    let score = score_parsed_item(&parsed);
    let slop = detect_slop(&parsed.title, parsed.body.as_deref(), is_bot);
    let is_slop = is_slop_flagged(&slop, slop_sensitivity);
    let final_score = if is_slop { score.min(14) } else { score };
    let mut tags = parsed.tags.clone();
    if is_slop { tags.push("AI-SLOP".to_string()); }
    if is_bot { tags.push("BOT".to_string()); }
    let mergeable = node.get("mergeable").and_then(|m| m.as_str()).map(|s| s.to_string());
    if mergeable.as_deref() == Some("CONFLICTING") { tags.push("CONFLICT".to_string()); }
    let is_draft = node.get("isDraft").and_then(|d| d.as_bool()).unwrap_or(false);
    if is_draft { tags.push("DRAFT".to_string()); }
    let review_decision = node.get("reviewDecision").and_then(|r| r.as_str()).unwrap_or("");
    if review_decision == "APPROVED" { tags.push("APPROVED".to_string()); }
    else if review_decision == "CHANGES_REQUESTED" { tags.push("CHANGES-REQUESTED".to_string()); }
    else if review_decision == "REVIEW_REQUIRED" { tags.push("REVIEW-REQUIRED".to_string()); }
    if was_converted_from_draft { tags.push("DRAFT→READY".to_string()); }
    if author_pushed_after_review { tags.push("PUSHED-AFTER-REVIEW".to_string()); }
    if has_failing_checks { tags.push("CHECK-FAILURE".to_string()); }
    if has_review_request { tags.push("REVIEW-REQUESTED".to_string()); }
    if has_assignee { tags.push("ASSIGNED".to_string()); }
    if node.get("stateReason").and_then(|s| s.as_str()).unwrap_or("") == "REOPENED" { tags.push("REOPENED".to_string()); }
    for label in &parsed.labels { if label.to_lowercase().contains("duplicate") { tags.push("DUPLICATE".to_string()); break; } }
    ParsedItem { score: final_score, priority: priority_from_score(final_score), is_slop, is_first_timer: false, tags, ..parsed }
}

fn parse_discussion_node(node: &serde_json::Value, repo_id: &str, repo_name: &str, slop_sensitivity: &str) -> ParsedItem {
    let author_login = node.get("author").and_then(|a| a.get("login")).and_then(|l| l.as_str()).unwrap_or("").to_string();
    let created_at = node.get("createdAt").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated_at = node.get("updatedAt").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let title = node.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let url = node.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let body = node.get("body").and_then(|b| b.as_str()).map(|s| s.to_string());
    let id = node.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let comments_count = node.get("comments").and_then(|c| c.get("totalCount")).and_then(|t| t.as_i64()).unwrap_or(0);
    let is_answered = node.get("answer").and_then(|a| a.get("isAnswer")).and_then(|b| b.as_bool()).unwrap_or(false);
    let detail = format!("Discussion by @{} · {} comments", author_login, comments_count);
    let mut tags = vec!["DISCUSSION".to_string()];
    if is_answered { tags.push("ANSWERED".to_string()); }

    let parsed = ParsedItem {
        id: format!("disc_{}", id), repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "discussion".to_string(), title, detail, score: 0, priority: "noise".to_string(),
        is_bot: false, is_slop: false, is_first_timer: false, created_at: created_at.clone(), updated_at,
        github_url: url, emoji: "💬".to_string(), tags, author_association: "NONE".to_string(),
        comments_count, body, labels: vec![],
    };

    let score = score_parsed_item(&parsed);
    let slop = detect_slop(&parsed.title, parsed.body.as_deref(), false);
    let is_slop = is_slop_flagged(&slop, slop_sensitivity);
    let final_score = if is_slop { score.min(14) } else { score };
    let mut tags = parsed.tags.clone();
    if is_slop { tags.push("AI-SLOP".to_string()); }
    ParsedItem { score: final_score, priority: priority_from_score(final_score), is_slop, is_first_timer: false, tags, ..parsed }
}

// ---- Workflow Runs (CI) ----

pub async fn fetch_repo_workflows(token: &str, owner: &str, repo: &str, repo_id: &str, repo_full_name: &str, slop_sensitivity: &str, etag: Option<String>) -> Result<(Vec<ParsedItem>, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut req = client.get(format!("https://api.github.com/repos/{}/{}/actions/runs?status=failure&per_page=5", owner, repo))
        .header("Authorization", format!("Bearer {}", token)).header("User-Agent", "companion-app/0.1.0").header("Accept", "application/vnd.github.v3+json");
    if let Some(ref e) = etag { req = req.header("If-None-Match", e); }
    let resp = req.send().await.map_err(|e| format!("Workflow API failed: {}", e))?;
    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    if resp.status() == 304 { return Ok((Vec::new(), etag)); }
    if !resp.status().is_success() { return Ok((Vec::new(), None)); }
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Workflow parse: {}", e))?;
    let runs = match body.get("workflow_runs").and_then(|r| r.as_array()) { Some(r) => r, None => return Ok((Vec::new(), new_etag)) };
    let mut items = Vec::new();
    for run in runs {
        if run.get("conclusion").and_then(|c| c.as_str()).unwrap_or("") != "failure" { continue; }
        let run_id = run.get("id").and_then(|i| i.as_i64()).unwrap_or(0);
        let name = run.get("name").and_then(|n| n.as_str()).unwrap_or("CI").to_string();
        let branch = run.get("head_branch").and_then(|b| b.as_str()).unwrap_or("").to_string();
        let url = run.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let created = run.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
        let updated = run.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let is_main = branch == "main" || branch == "master";
        let parsed = ParsedItem {
            id: format!("wf_{}", run_id), repo_id: repo_id.to_string(), repo_name: repo_full_name.to_string(),
            item_type: "ci".to_string(), title: format!("{} failed", name),
            detail: format!("{} failed on {}", name, branch), score: 0, priority: "noise".to_string(),
            is_bot: false, is_slop: false, is_first_timer: false, created_at: created, updated_at: updated,
            github_url: url, emoji: "❌".to_string(),
            tags: if is_main { vec!["CI".to_string(), "CI-FAILURE".to_string(), "MAIN".to_string()] } else { vec!["CI".to_string(), "CI-FAILURE".to_string()] },
            author_association: "NONE".to_string(), comments_count: 0, body: None, labels: vec![],
        };
        items.push(apply_scoring(parsed, slop_sensitivity));
    }
    Ok((items, new_etag))
}

// ---- Security Advisories ----

pub async fn fetch_security_advisories(token: &str, owner: &str, repo: &str, repo_id: &str, repo_full_name: &str, slop_sensitivity: &str, etag: Option<String>) -> Result<(Vec<ParsedItem>, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut req = client.get(format!("https://api.github.com/repos/{}/{}/security-advisories?state=published&per_page=10", owner, repo))
        .header("Authorization", format!("Bearer {}", token)).header("User-Agent", "companion-app/0.1.0").header("Accept", "application/vnd.github.v3+json");
    if let Some(ref e) = etag { req = req.header("If-None-Match", e); }
    let resp = req.send().await.map_err(|e| format!("Security advisories API failed: {}", e))?;
    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    if resp.status() == 304 { return Ok((Vec::new(), etag)); }
    if !resp.status().is_success() { return Ok((Vec::new(), None)); }
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Security advisories parse: {}", e))?;
    let empty = Vec::new();
    let advisories = body.as_array().unwrap_or(&empty);
    let mut items = Vec::new();
    for adv in advisories {
        let ghsa_id = adv.get("ghsa_id").and_then(|i| i.as_str()).unwrap_or("").to_string();
        let severity = adv.get("severity").and_then(|s| s.as_str()).unwrap_or("").to_string();
        let summary = adv.get("summary").and_then(|s| s.as_str()).unwrap_or("").to_string();
        let description = adv.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string();
        let url = adv.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let created = adv.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
        let updated = adv.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let cve_id = adv.get("cve_id").and_then(|c| c.as_str()).unwrap_or("").to_string();
        let title = if !cve_id.is_empty() { format!("{} ({})", cve_id, severity) } else { format!("{} ({})", ghsa_id, severity) };
        let detail = format!("{}: {}", severity.to_uppercase(), summary);
        let mut tags = vec!["SECURITY".to_string()];
        if !cve_id.is_empty() { tags.push("CVE".to_string()); tags.push(cve_id); }
        if severity == "critical" || severity == "high" { tags.push("URGENT".to_string()); }
        let parsed = ParsedItem {
            id: format!("sec_{}", ghsa_id), repo_id: repo_id.to_string(), repo_name: repo_full_name.to_string(),
            item_type: "security".to_string(), title, detail, score: 0, priority: "noise".to_string(),
            is_bot: false, is_slop: false, is_first_timer: false, created_at: created, updated_at: updated,
            github_url: url, emoji: "🔒".to_string(), tags, author_association: "NONE".to_string(),
            comments_count: 0, body: Some(description), labels: vec![],
        };
        items.push(apply_scoring(parsed, slop_sensitivity));
    }
    Ok((items, new_etag))
}

// ---- Secret Scanning Alerts ----

pub async fn fetch_secret_scanning(token: &str, owner: &str, repo: &str, repo_id: &str, repo_full_name: &str, slop_sensitivity: &str, etag: Option<String>) -> Result<(Vec<ParsedItem>, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut req = client.get(format!("https://api.github.com/repos/{}/{}/secret-scanning/alerts?state=open&per_page=10", owner, repo))
        .header("Authorization", format!("Bearer {}", token)).header("User-Agent", "companion-app/0.1.0").header("Accept", "application/vnd.github.v3+json");
    if let Some(ref e) = etag { req = req.header("If-None-Match", e); }
    let resp = req.send().await.map_err(|e| format!("Secret scanning API failed: {}", e))?;
    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    if resp.status() == 304 { return Ok((Vec::new(), etag)); }
    if !resp.status().is_success() { return Ok((Vec::new(), None)); }
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Secret scanning parse: {}", e))?;
    let empty = Vec::new();
    let alerts = body.as_array().unwrap_or(&empty);
    let mut items = Vec::new();
    for alert in alerts {
        let number = alert.get("number").and_then(|n| n.as_i64()).unwrap_or(0);
        let secret_type = alert.get("secret_type").and_then(|s| s.as_str()).unwrap_or("").to_string();
        let state = alert.get("state").and_then(|s| s.as_str()).unwrap_or("").to_string();
        if state != "open" { continue; }
        let url = alert.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let created = alert.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
        let updated = alert.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let parsed = ParsedItem {
            id: format!("secret_{}", number), repo_id: repo_id.to_string(), repo_name: repo_full_name.to_string(),
            item_type: "security".to_string(), title: format!("Secret leak: {}", secret_type),
            detail: format!("{} secret exposed", secret_type), score: 0, priority: "noise".to_string(),
            is_bot: false, is_slop: false, is_first_timer: false, created_at: created, updated_at: updated,
            github_url: url, emoji: "🔑".to_string(),
            tags: vec!["SECRET".to_string(), "SECURITY".to_string(), "URGENT".to_string()],
            author_association: "NONE".to_string(), comments_count: 0, body: None, labels: vec![],
        };
        items.push(apply_scoring(parsed, slop_sensitivity));
    }
    Ok((items, new_etag))
}

// ---- Releases ----

pub async fn fetch_releases(token: &str, owner: &str, repo: &str, repo_id: &str, repo_full_name: &str, slop_sensitivity: &str, etag: Option<String>) -> Result<(Vec<ParsedItem>, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut req = client.get(format!("https://api.github.com/repos/{}/{}/releases?per_page=5", owner, repo))
        .header("Authorization", format!("Bearer {}", token)).header("User-Agent", "companion-app/0.1.0").header("Accept", "application/vnd.github.v3+json");
    if let Some(ref e) = etag { req = req.header("If-None-Match", e); }
    let resp = req.send().await.map_err(|e| format!("Releases API failed: {}", e))?;
    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    if resp.status() == 304 { return Ok((Vec::new(), etag)); }
    if !resp.status().is_success() { return Ok((Vec::new(), None)); }
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Releases parse: {}", e))?;
    let empty = Vec::new();
    let releases = body.as_array().unwrap_or(&empty);
    let mut items = Vec::new();
    for rel in releases {
        let id = rel.get("id").and_then(|n| n.as_i64()).unwrap_or(0);
        let name = rel.get("name").and_then(|n| n.as_str()).or_else(|| rel.get("tag_name").and_then(|t| t.as_str())).unwrap_or("").to_string();
        let body_text = rel.get("body").and_then(|b| b.as_str()).unwrap_or("").to_string();
        let published = rel.get("published_at").and_then(|p| p.as_str()).unwrap_or("").to_string();
        let url = rel.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
        let prerelease = rel.get("prerelease").and_then(|p| p.as_bool()).unwrap_or(false);
        let draft = rel.get("draft").and_then(|d| d.as_bool()).unwrap_or(false);
        if draft { continue; }
        let detail = if prerelease { format!("Pre-release {} published", name) } else { format!("Release {} published", name) };
        let mut tags = vec!["RELEASE".to_string()];
        if prerelease { tags.push("PRE-RELEASE".to_string()); }
        let parsed = ParsedItem {
            id: format!("rel_{}", id), repo_id: repo_id.to_string(), repo_name: repo_full_name.to_string(),
            item_type: "release".to_string(), title: name, detail, score: 0, priority: "noise".to_string(),
            is_bot: false, is_slop: false, is_first_timer: false, created_at: published.clone(), updated_at: published,
            github_url: url, emoji: "📦".to_string(), tags, author_association: "NONE".to_string(),
            comments_count: 0, body: Some(body_text), labels: vec![],
        };
        items.push(apply_scoring(parsed, slop_sensitivity));
    }
    Ok((items, new_etag))
}

// ---- Notifications Tripwire ----

pub async fn fetch_notifications(
    token: &str,
    etag: Option<String>,
) -> Result<(Vec<String>, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut req = client
        .get("https://api.github.com/notifications?all=true&participating=false")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "companion-app/0.1.0")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(ref e) = etag {
        req = req.header("If-None-Match", e);
    }

    let resp = req.send().await.map_err(|e| format!("Notifications API: {}", e))?;
    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());

    if resp.status() == 304 {
        return Ok((Vec::new(), etag));
    }
    if !resp.status().is_success() {
        return Ok((Vec::new(), None));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Notifications parse: {}", e))?;
    let empty = Vec::new();
    let arr = body.as_array().unwrap_or(&empty);
    let mut repos = Vec::new();
    for n in arr {
        if let Some(repo) = n.get("repository").and_then(|r| r.get("full_name")).and_then(|f| f.as_str()) {
            repos.push(repo.to_string());
        }
    }
    Ok((repos, new_etag))
}

// ---- Force Push Detection ----

pub async fn check_force_push(
    token: &str,
    owner: &str,
    repo: &str,
    last_sha: Option<String>,
) -> Result<(String, bool), String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://api.github.com/repos/{}/{}/git/ref/heads/main", owner, repo))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "companion-app/0.1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send().await.map_err(|e| format!("Ref API: {}", e))?;

    if !resp.status().is_success() {
        return Err("Failed to get HEAD".to_string());
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let new_sha = body.get("object").and_then(|o| o.get("sha")).and_then(|s| s.as_str()).unwrap_or("").to_string();
    if new_sha.is_empty() {
        return Err("No SHA".to_string());
    }

    let was_forced = if let Some(ref old) = last_sha {
        if old != &new_sha {
            // Check if this was a fast-forward or force push
            let comp_resp = client
                .get(format!("https://api.github.com/repos/{}/{}/compare/{}...{}", owner, repo, old, new_sha))
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "companion-app/0.1.0")
                .header("Accept", "application/vnd.github.v3+json")
                .send().await;

            if let Ok(resp) = comp_resp {
                if resp.status().is_success() {
                    let comp: serde_json::Value = resp.json().await.unwrap_or_default();
                    comp.get("status").and_then(|s| s.as_str()) == Some("diverged")
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    Ok((new_sha, was_forced))
}

pub async fn fetch_user_repos(token: &str) -> Result<Vec<AvailableRepo>, String> {
    let client = reqwest::Client::new();
    let mut all_repos = Vec::new();
    let mut page = 1u32;
    loop {
        let resp = client.get(format!("https://api.github.com/user/repos?per_page=100&page={}&sort=updated&type=all", page))
            .header("Authorization", format!("Bearer {}", token)).header("User-Agent", "companion-app/0.1.0").header("Accept", "application/vnd.github.v3+json")
            .send().await.map_err(|e| format!("Failed to fetch repos: {}", e))?;
        let items: Vec<serde_json::Value> = resp.json().await.map_err(|e| format!("Failed to parse repos: {}", e))?;
        if items.is_empty() { break; }
        for item in &items {
            all_repos.push(AvailableRepo {
                id: item["id"].to_string(),
                name: item["name"].as_str().unwrap_or("").to_string(),
                full_name: item["full_name"].as_str().unwrap_or("").to_string(),
                owner: item["owner"]["login"].as_str().unwrap_or("").to_string(),
                private: item["private"].as_bool().unwrap_or(false),
                description: item["description"].as_str().map(|s| s.to_string()),
            });
        }
        if items.len() < 100 { break; }
        page += 1;
    }
    Ok(all_repos)
}

// ---- Comments ----

pub async fn fetch_item_comments(token: &str, owner: &str, repo: &str, number: i64) -> Result<Vec<(String, String, String, String, String)>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://api.github.com/repos/{}/{}/issues/{}/comments?per_page=30", owner, repo, number))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "companion-app/0.1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send().await.map_err(|e| format!("Comments API failed: {}", e))?;

    if !resp.status().is_success() { return Ok(Vec::new()); }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Comments parse: {}", e))?;
    let empty = Vec::new();
    let arr = body.as_array().unwrap_or(&empty);
    let mut comments = Vec::new();
    for c in arr {
        let id = c.get("id").and_then(|i| i.as_i64()).map(|i| i.to_string()).unwrap_or_default();
        let author = c.get("user").and_then(|u| u.get("login")).and_then(|l| l.as_str()).unwrap_or("").to_string();
        let body = c.get("body").and_then(|b| b.as_str()).unwrap_or("").to_string();
        let created = c.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
        let avatar = c.get("user").and_then(|u| u.get("avatar_url")).and_then(|a| a.as_str()).unwrap_or("").to_string();
        comments.push((id, author, body, created, avatar));
    }
    Ok(comments)
}

pub fn parse_webhook_event(event: &str, payload: &serde_json::Value, repo_id: &str, repo_name: &str, sensitivity: &str) -> Option<ParsedItem> {
    match event {
        "issues" => parse_issue_event(payload, repo_id, repo_name, sensitivity),
        "pull_request" => parse_pr_event(payload, repo_id, repo_name, sensitivity),
        "workflow_run" => parse_workflow_event(payload, repo_id, repo_name, sensitivity),
        "secret_scanning_alert" => parse_secret_alert(payload, repo_id, repo_name, sensitivity),
        "repository_vulnerability_alert" => parse_vulnerability_alert(payload, repo_id, repo_name, sensitivity),
        _ => None,
    }
}

fn parse_issue_event(payload: &serde_json::Value, repo_id: &str, repo_name: &str, sensitivity: &str) -> Option<ParsedItem> {
    let action = payload.get("action").and_then(|a| a.as_str()).unwrap_or("");
    if action != "opened" && action != "reopened" { return None; }
    let issue = payload.get("issue")?;
    let id = issue.get("node_id").and_then(|i| i.as_str())?;
    let title = issue.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let url = issue.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let created = issue.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated = issue.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let body = issue.get("body").and_then(|b| b.as_str()).map(|s| s.to_string());
    let user = issue.get("user").and_then(|u| u.get("login")).and_then(|l| l.as_str()).unwrap_or("").to_string();
    let comments_count = issue.get("comments").and_then(|c| c.as_i64()).unwrap_or(0);
    let is_bot = issue.get("user").and_then(|u| u.get("type")).and_then(|t| t.as_str()).unwrap_or("") == "Bot" || user.contains("[bot]");
    let mut tags = vec!["ISSUE".to_string()];
    if action == "reopened" { tags.push("REOPENED".to_string()); }
    let labels: Vec<String> = issue.get("labels").and_then(|l| l.as_array())
        .map(|arr| arr.iter().filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
    for label in &labels { if label.to_lowercase().contains("duplicate") { tags.push("DUPLICATE".to_string()); break; } }
    let item = ParsedItem {
        id: format!("issue_{}", id), repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "issue".to_string(), title, detail: format!("Issue by @{} · {} comments", user, comments_count),
        score: 0, priority: "noise".to_string(), is_bot, is_slop: false, is_first_timer: false,
        created_at: created, updated_at: updated, github_url: url, emoji: "🐛".to_string(),
        tags, author_association: "NONE".to_string(), comments_count, body, labels,
    };
    apply_scoring(item, sensitivity).into()
}

fn parse_pr_event(payload: &serde_json::Value, repo_id: &str, repo_name: &str, sensitivity: &str) -> Option<ParsedItem> {
    let action = payload.get("action").and_then(|a| a.as_str()).unwrap_or("");
    if action != "opened" && action != "reopened" && action != "synchronize" { return None; }
    let pr = payload.get("pull_request")?;
    let id = pr.get("node_id").and_then(|i| i.as_str())?;
    let title = pr.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let url = pr.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let created = pr.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated = pr.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let body = pr.get("body").and_then(|b| b.as_str()).map(|s| s.to_string());
    let user = pr.get("user").and_then(|u| u.get("login")).and_then(|l| l.as_str()).unwrap_or("").to_string();
    let comments_count = pr.get("comments").and_then(|c| c.as_i64()).unwrap_or(0);
    let is_bot = pr.get("user").and_then(|u| u.get("type")).and_then(|t| t.as_str()).unwrap_or("") == "Bot" || user.contains("[bot]");
    let is_first_timer = pr.get("author_association").and_then(|a| a.as_str()).unwrap_or("") == "FIRST_TIME_CONTRIBUTOR";
    let labels: Vec<String> = pr.get("labels").and_then(|l| l.as_array())
        .map(|arr| arr.iter().filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
    let mergeable = pr.get("mergeable").and_then(|m| m.as_str()).unwrap_or("");
    let detail = format!("PR by @{} · {} comments", user, comments_count);
    let mut tags = vec!["PR".to_string()];
    if is_first_timer { tags.push("FIRST-TIMER".to_string()); }
    if mergeable == "CONFLICTING" { tags.push("CONFLICT".to_string()); }
    if action == "reopened" { tags.push("REOPENED".to_string()); }
    for label in &labels { if label.to_lowercase().contains("duplicate") { tags.push("DUPLICATE".to_string()); break; } }
    let item = ParsedItem {
        id: format!("pr_{}", id), repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "pr".to_string(), title, detail, score: 0, priority: "noise".to_string(),
        is_bot, is_slop: false, is_first_timer, created_at: created, updated_at: updated,
        github_url: url, emoji: "🔄".to_string(), tags, author_association: "NONE".to_string(),
        comments_count, body, labels,
    };
    Some(apply_scoring(item, sensitivity))
}

fn parse_workflow_event(payload: &serde_json::Value, repo_id: &str, repo_name: &str, sensitivity: &str) -> Option<ParsedItem> {
    let action = payload.get("action").and_then(|a| a.as_str()).unwrap_or("");
    if action != "completed" { return None; }
    let wf = payload.get("workflow_run")?;
    let conclusion = wf.get("conclusion").and_then(|c| c.as_str()).unwrap_or("");
    if conclusion == "success" { return None; }
    let id = wf.get("id").and_then(|i| i.as_i64()).map(|i| format!("wf_{}", i)).unwrap_or_default();
    let name = wf.get("name").and_then(|n| n.as_str()).unwrap_or("CI").to_string();
    let branch = wf.get("head_branch").and_then(|b| b.as_str()).unwrap_or("").to_string();
    let url = wf.get("html_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let created = wf.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated = wf.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let is_main = branch == "main" || branch == "master";
    let item = ParsedItem {
        id, repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "ci".to_string(), title: format!("{} failed", name),
        detail: format!("{} failed on {}", name, branch), score: 0, priority: "noise".to_string(),
        is_bot: false, is_slop: false, is_first_timer: false, created_at: created, updated_at: updated,
        github_url: url, emoji: "❌".to_string(),
        tags: if is_main { vec!["CI".to_string(), "CI-FAILURE".to_string(), "MAIN".to_string()] } else { vec!["CI".to_string(), "CI-FAILURE".to_string()] },
        author_association: "NONE".to_string(), comments_count: 0, body: None, labels: vec![],
    };
    Some(apply_scoring(item, sensitivity))
}

fn parse_secret_alert(payload: &serde_json::Value, repo_id: &str, repo_name: &str, sensitivity: &str) -> Option<ParsedItem> {
    let alert = payload.get("alert")?;
    let id = alert.get("number").and_then(|n| n.as_i64()).map(|n| format!("secret_{}", n)).unwrap_or_default();
    let secret_type = alert.get("secret_type").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let url = payload.get("repository").and_then(|r| r.get("html_url")).and_then(|u| u.as_str()).unwrap_or("").to_string();
    let created = alert.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated = alert.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let item = ParsedItem {
        id, repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "security".to_string(), title: format!("Secret leak: {}", secret_type),
        detail: format!("{} secret exposed", secret_type), score: 0, priority: "noise".to_string(),
        is_bot: false, is_slop: false, is_first_timer: false, created_at: created, updated_at: updated,
        github_url: url, emoji: "🔑".to_string(),
        tags: vec!["SECRET".to_string(), "SECURITY".to_string(), "URGENT".to_string()],
        author_association: "NONE".to_string(), comments_count: 0, body: None, labels: vec![],
    };
    Some(apply_scoring(item, sensitivity))
}

fn parse_vulnerability_alert(payload: &serde_json::Value, repo_id: &str, repo_name: &str, sensitivity: &str) -> Option<ParsedItem> {
    let alert = payload.get("alert")?;
    let id = alert.get("number").and_then(|n| n.as_i64()).map(|n| format!("vuln_{}", n)).unwrap_or_default();
    let severity = alert.get("security_advisory").and_then(|s| s.get("severity")).and_then(|s| s.as_str()).unwrap_or("").to_string();
    let summary = alert.get("security_advisory").and_then(|s| s.get("summary")).and_then(|s| s.as_str()).unwrap_or("").to_string();
    let cve = alert.get("security_advisory").and_then(|s| s.get("cve_id")).and_then(|c| c.as_str()).unwrap_or("").to_string();
    let url = alert.get("security_advisory").and_then(|s| s.get("html_url")).and_then(|u| u.as_str()).unwrap_or("").to_string();
    let created = alert.get("created_at").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let updated = alert.get("updated_at").and_then(|u| u.as_str()).unwrap_or("").to_string();
    let title = if !cve.is_empty() { format!("{} ({})", cve, severity) } else { format!("Vuln ({})", severity) };
    let mut tags = vec!["SECURITY".to_string()];
    if !cve.is_empty() { tags.push("CVE".to_string()); }
    if severity == "critical" || severity == "high" { tags.push("URGENT".to_string()); }
    let item = ParsedItem {
        id, repo_id: repo_id.to_string(), repo_name: repo_name.to_string(),
        item_type: "security".to_string(), title, detail: summary, score: 0, priority: "noise".to_string(),
        is_bot: false, is_slop: false, is_first_timer: false, created_at: created, updated_at: updated,
        github_url: url, emoji: "🔒".to_string(), tags, author_association: "NONE".to_string(),
        comments_count: 0, body: None, labels: vec![],
    };
    Some(apply_scoring(item, sensitivity))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::Instant;

    fn iso_now() -> String {
        Utc::now().to_rfc3339()
    }

    fn base_item() -> ParsedItem {
        let now = iso_now();
        ParsedItem {
            id: "x".to_string(),
            repo_id: "1".to_string(),
            repo_name: "owner/repo".to_string(),
            item_type: "pr".to_string(),
            title: "Refactor payment reconciliation retry path".to_string(),
            detail: "PR by @dev · 4 comments".to_string(),
            score: 0,
            priority: "noise".to_string(),
            is_bot: false,
            is_slop: false,
            is_first_timer: false,
            created_at: now.clone(),
            updated_at: now,
            github_url: "https://github.com/owner/repo/pull/1".to_string(),
            emoji: "🔄".to_string(),
            tags: vec!["PR".to_string()],
            author_association: "MEMBER".to_string(),
            comments_count: 4,
            body: Some(
                "This PR fixes a race in retries and adds regression coverage for queue drains."
                    .to_string(),
            ),
            labels: vec![],
        }
    }

    #[test]
    fn parses_pr_opened_and_adds_expected_flags() {
        let payload = json!({
            "action": "opened",
            "pull_request": {
                "node_id": "PR_kwDOAA",
                "title": "Fix queue deadlock under burst traffic",
                "html_url": "https://github.com/o/r/pull/44",
                "created_at": "2026-05-20T10:00:00Z",
                "updated_at": "2026-05-20T10:10:00Z",
                "body": "Detailed fix description with root-cause and tests to validate behavior under chaos.",
                "comments": 6,
                "user": { "login": "newcontrib", "type": "User" },
                "author_association": "FIRST_TIME_CONTRIBUTOR",
                "labels": [{ "name": "merge conflict" }],
                "mergeable": "CONFLICTING"
            }
        });

        let item = parse_webhook_event("pull_request", &payload, "1", "o/r", "medium")
            .expect("PR payload should parse");

        assert_eq!(item.item_type, "pr");
        assert_eq!(item.id, "pr_PR_kwDOAA");
        assert!(item.is_first_timer);
        assert!(item.tags.iter().any(|t| t == "FIRST-TIMER"));
        assert!(item.tags.iter().any(|t| t == "CONFLICT"));
        assert!(item.score >= 15);
    }

    #[test]
    fn ignores_closed_events() {
        let issue_payload = json!({
            "action": "closed",
            "issue": {
                "node_id": "I_kwDOAA",
                "title": "Something",
                "html_url": "https://github.com/o/r/issues/1",
                "created_at": "2026-05-20T10:00:00Z",
                "updated_at": "2026-05-20T10:00:00Z"
            }
        });
        let pr_payload = json!({
            "action": "closed",
            "pull_request": {
                "node_id": "PR_kwDOAA",
                "title": "Something",
                "html_url": "https://github.com/o/r/pull/1",
                "created_at": "2026-05-20T10:00:00Z",
                "updated_at": "2026-05-20T10:00:00Z"
            }
        });

        assert!(parse_webhook_event("issues", &issue_payload, "1", "o/r", "medium").is_none());
        assert!(parse_webhook_event("pull_request", &pr_payload, "1", "o/r", "medium").is_none());
    }

    #[test]
    fn malformed_payloads_fail_safe_without_panics() {
        let junk = json!({"action": "opened"});
        let bad_types = json!({
            "action": "opened",
            "pull_request": {
                "node_id": 123,
                "title": true
            }
        });

        assert!(parse_webhook_event("pull_request", &junk, "1", "o/r", "high").is_none());
        assert!(parse_webhook_event("pull_request", &bad_types, "1", "o/r", "high").is_none());
        assert!(parse_webhook_event("unknown_event", &json!({}), "1", "o/r", "high").is_none());
    }

    #[test]
    fn slop_sensitivity_thresholds_behave_as_expected() {
        let signals = vec![
            "Title length < 20 characters".to_string(),
            "PR description < 50 characters or empty".to_string(),
            "Generic title pattern matched".to_string(),
        ];

        assert!(!is_slop_flagged(&signals, "off"));
        assert!(!is_slop_flagged(&signals, "low"));
        assert!(is_slop_flagged(&signals, "medium"));
        assert!(is_slop_flagged(&signals, "high"));
    }

    #[test]
    fn score_rewards_first_timers_and_penalizes_bots() {
        let mut first_timer = base_item();
        first_timer.is_first_timer = true;
        first_timer.author_association = "FIRST_TIME_CONTRIBUTOR".to_string();

        let mut bot = base_item();
        bot.is_bot = true;
        bot.detail = "PR by @dependabot[bot] · patch minor".to_string();
        bot.title = "fix bug".to_string();
        bot.body = Some("tiny".to_string());

        let first_timer_score = score_parsed_item(&first_timer);
        let bot_score = score_parsed_item(&bot);

        assert!(first_timer_score > bot_score);
    }

    #[test]
    fn security_alerts_stay_high_priority() {
        let payload = json!({
            "alert": {
                "number": 7,
                "secret_type_display": "GitHub Personal Access Token",
                "html_url": "https://github.com/o/r/security/secret-scanning/7",
                "created_at": "2026-05-20T11:00:00Z"
            }
        });

        let item = parse_webhook_event("secret_scanning_alert", &payload, "1", "o/r", "medium")
            .expect("secret alert should parse");
        assert_eq!(item.item_type, "security");
        assert_eq!(item.priority, "urgent");
        assert!(item.score >= 70);
    }

    fn issue_payload(idx: usize) -> serde_json::Value {
        json!({
            "action": if idx.is_multiple_of(17) { "closed" } else { "opened" },
            "issue": {
                "node_id": format!("I_NODE_{}", idx),
                "title": if idx.is_multiple_of(11) { "fix bug".to_string() } else { format!("Issue {}: production behavior drift", idx) },
                "html_url": format!("https://github.com/o/r/issues/{}", idx),
                "created_at": "2026-05-20T10:00:00Z",
                "updated_at": "2026-05-20T10:10:00Z",
                "body": if idx.is_multiple_of(13) { "" } else { "Detailed issue body with clear repro steps and impact narrative." },
                "comments": (idx % 9) as i64,
                "user": { "login": if idx.is_multiple_of(8) { "bot[bot]" } else { "human-dev" }, "type": if idx.is_multiple_of(8) { "Bot" } else { "User" } },
                "labels": [{"name": if idx.is_multiple_of(5) { "bug" } else { "triage" }}],
                "author_association": if idx.is_multiple_of(7) { "FIRST_TIME_CONTRIBUTOR" } else { "MEMBER" }
            }
        })
    }

    fn pr_payload(idx: usize) -> serde_json::Value {
        json!({
            "action": if idx.is_multiple_of(19) { "closed" } else { "opened" },
            "pull_request": {
                "node_id": format!("PR_NODE_{}", idx),
                "title": if idx.is_multiple_of(10) { "update readme".to_string() } else { format!("PR {}: stabilize retry behavior under load", idx) },
                "html_url": format!("https://github.com/o/r/pull/{}", idx),
                "created_at": "2026-05-20T10:00:00Z",
                "updated_at": "2026-05-20T10:10:00Z",
                "body": if idx.is_multiple_of(9) { "small change" } else { "Longer PR description with migration notes, risk analysis, and validation checklist." },
                "comments": (idx % 14) as i64,
                "user": { "login": if idx.is_multiple_of(6) { "dependabot[bot]" } else { "maintainer" }, "type": if idx.is_multiple_of(6) { "Bot" } else { "User" } },
                "author_association": if idx.is_multiple_of(12) { "FIRST_TIME_CONTRIBUTOR" } else { "MEMBER" },
                "labels": [{"name": if idx.is_multiple_of(4) { "merge conflict" } else { "enhancement" }}],
                "mergeable": if idx.is_multiple_of(4) { "CONFLICTING" } else { "MERGEABLE" }
            }
        })
    }

    fn workflow_payload(idx: usize) -> serde_json::Value {
        let branch = if idx.is_multiple_of(3) {
            "main"
        } else {
            "feature-x"
        };
        let conclusion = if idx.is_multiple_of(2) {
            "failure"
        } else {
            "success"
        };
        json!({
            "workflow_run": {
                "id": idx as i64,
                "name": if idx.is_multiple_of(5) { "deploy" } else { "ci" },
                "conclusion": conclusion,
                "html_url": format!("https://github.com/o/r/actions/runs/{}", idx),
                "created_at": "2026-05-20T10:00:00Z",
                "updated_at": "2026-05-20T10:10:00Z",
                "head_branch": branch
            }
        })
    }

    #[test]
    fn chaos_full_fixture_replay_batch() {
        let mut produced = 0usize;
        let mut urgent = 0usize;
        let mut slop = 0usize;

        for idx in 0..1200usize {
            let (event, payload) = match idx % 5 {
                0 => ("issues", issue_payload(idx)),
                1 => ("pull_request", pr_payload(idx)),
                2 => ("workflow_run", workflow_payload(idx)),
                3 => (
                    "secret_scanning_alert",
                    json!({
                        "alert": {
                            "number": idx as i64,
                            "secret_type_display": "GitHub Token",
                            "html_url": format!("https://github.com/o/r/security/secret-scanning/{}", idx),
                            "created_at": "2026-05-20T10:00:00Z"
                        }
                    }),
                ),
                _ => (
                    "repository_vulnerability_alert",
                    json!({
                        "alert": {
                            "id": idx as i64,
                            "affected_package_name": "openssl",
                            "severity": if idx.is_multiple_of(2) { "high" } else { "moderate" },
                            "html_url": format!("https://github.com/o/r/security/dependabot/{}", idx),
                            "created_at": "2026-05-20T10:00:00Z"
                        }
                    }),
                ),
            };

            if let Some(item) = parse_webhook_event(event, &payload, "1", "o/r", "medium") {
                produced += 1;
                if item.priority == "urgent" {
                    urgent += 1;
                }
                if item.is_slop {
                    slop += 1;
                }
                assert!((0..=100).contains(&item.score));
                assert!(["urgent", "today", "later", "noise"].contains(&item.priority.as_str()));
                assert!(!item.id.is_empty());
                assert!(!item.github_url.is_empty());
            }
        }

        assert!(produced > 800, "expected many parsed items, got {}", produced);
        assert!(urgent > 50, "expected urgent items from security/ci mix");
        assert!(slop > 0, "expected some slop-tagged items");
    }

    #[test]
    fn chaos_full_fuzz_like_mutations_no_panics() {
        let weird_payloads = vec![
            json!({}),
            json!({"pull_request": null}),
            json!({"action": true, "pull_request": {"node_id": 99}}),
            json!({"action": "opened", "issue": {"node_id": "X", "title": 42}}),
            json!({"workflow_run": {"id": "bad", "name": null}}),
            json!({"alert": {"number": "NaN", "created_at": []}}),
            json!({"action": "opened", "pull_request": {
                "node_id": "PR_X",
                "title": "x",
                "html_url": "https://github.com/o/r/pull/1",
                "created_at": "not-a-date",
                "updated_at": "not-a-date",
                "body": "x",
                "comments": -1,
                "user": {"login": "x", "type": "User"},
                "labels": [{"name": "merge conflict"}],
                "author_association": "NONE",
                "mergeable": "UNKNOWN"
            }}),
        ];

        for payload in &weird_payloads {
            let _ = parse_webhook_event("pull_request", payload, "1", "o/r", "high");
            let _ = parse_webhook_event("issues", payload, "1", "o/r", "high");
            let _ = parse_webhook_event("workflow_run", payload, "1", "o/r", "high");
            let _ = parse_webhook_event("secret_scanning_alert", payload, "1", "o/r", "high");
            let _ =
                parse_webhook_event("repository_vulnerability_alert", payload, "1", "o/r", "high");
        }
    }

    #[test]
    fn chaos_full_soak_cycles_stable_invariants() {
        let started = Instant::now();
        let mut seen = 0usize;
        let mut bad = 0usize;

        for cycle in 0..60usize {
            for idx in 0..150usize {
                let global_idx = cycle * 150 + idx;
                let payload = if idx.is_multiple_of(2) {
                    pr_payload(global_idx)
                } else {
                    issue_payload(global_idx)
                };
                let event = if idx.is_multiple_of(2) {
                    "pull_request"
                } else {
                    "issues"
                };
                if let Some(item) = parse_webhook_event(event, &payload, "1", "o/r", "medium") {
                    seen += 1;
                    let valid = (0..=100).contains(&item.score)
                        && ["urgent", "today", "later", "noise"].contains(&item.priority.as_str())
                        && !item.id.is_empty();
                    if !valid {
                        bad += 1;
                    }
                }
            }
        }

        let elapsed = started.elapsed();
        assert!(seen > 5000, "expected high-volume parsed items, got {}", seen);
        assert_eq!(bad, 0, "found invalid invariants in soak run");
        assert!(
            elapsed.as_secs_f64() < 10.0,
            "soak test unexpectedly slow: {:.2}s",
            elapsed.as_secs_f64()
        );
    }

}
