#!/usr/bin/env node

/**
 * Real GitHub chaos event generator (no manual GitHub UI steps).
 *
 * Required env:
 * - GITHUB_TOKEN: token with repo access to target repo
 * - TEST_REPO: owner/repo (target repository)
 *
 * Optional env:
 * - BASE_BRANCH: default branch override (auto-detected if omitted)
 * - CHAOS_PREFIX: branch/title prefix (default: vigil-chaos)
 * - CLEANUP: "true" to close created issue/PR at end
 */

const token = process.env.GITHUB_TOKEN;
const testRepo = process.env.TEST_REPO;
const baseBranchOverride = process.env.BASE_BRANCH;
const chaosPrefix = process.env.CHAOS_PREFIX || "vigil-chaos";
const cleanup = String(process.env.CLEANUP || "").toLowerCase() === "true";

if (!token) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}
if (!testRepo || !testRepo.includes("/")) {
  console.error("Missing or invalid TEST_REPO (expected owner/repo)");
  process.exit(1);
}

const [owner, repo] = testRepo.split("/");
const runId = `${Date.now()}`;
const branchName = `${chaosPrefix}/${runId}`;
const marker = `[${chaosPrefix}:${runId}]`;

function gh(path, method = "GET", body) {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "companion-chaos-script",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function ghJson(path, method = "GET", body) {
  const resp = await gh(path, method, body);
  const text = await resp.text();
  const json = text ? JSON.parse(text) : {};
  if (!resp.ok) {
    throw new Error(`${method} ${path} failed (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log(`Starting chaos run for ${owner}/${repo}`);

  const repoInfo = await ghJson(`/repos/${owner}/${repo}`);
  const baseBranch = baseBranchOverride || repoInfo.default_branch;
  console.log(`Base branch: ${baseBranch}`);

  const baseRef = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
  const baseSha = baseRef.object.sha;

  // 1) Create branch
  await ghJson(`/repos/${owner}/${repo}/git/refs`, "POST", {
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });
  console.log(`Created branch: ${branchName}`);

  // 2) Commit a test file on branch to make PR possible
  const filePath = `.vigil-chaos/${runId}.md`;
  const content = Buffer.from(
    `# Vigil Chaos Run\n\nRun: ${runId}\nMarker: ${marker}\nTimestamp: ${new Date().toISOString()}\n`
  ).toString("base64");

  await ghJson(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, "PUT", {
    message: `${marker} add chaos marker file`,
    content,
    branch: branchName,
  });
  console.log(`Committed file: ${filePath}`);

  // 3) Open issue
  const issue = await ghJson(`/repos/${owner}/${repo}/issues`, "POST", {
    title: `${marker} E2E issue chaos scenario`,
    body:
      "Automated chaos issue for Companion testing.\n\n" +
      "- Includes comments\n" +
      "- Will be closed/reopened\n" +
      "- Used to validate polling + scoring visibility",
  });
  console.log(`Opened issue #${issue.number}: ${issue.html_url}`);

  // 4) Comment on issue (new comment signal)
  await ghJson(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, "POST", {
    body: `${marker} automated issue comment`,
  });
  console.log(`Commented on issue #${issue.number}`);

  // 5) Close then reopen issue (lifecycle events)
  await ghJson(`/repos/${owner}/${repo}/issues/${issue.number}`, "PATCH", { state: "closed" });
  await ghJson(`/repos/${owner}/${repo}/issues/${issue.number}`, "PATCH", { state: "open" });
  console.log(`Closed + reopened issue #${issue.number}`);

  // 6) Open PR
  const pr = await ghJson(`/repos/${owner}/${repo}/pulls`, "POST", {
    title: `${marker} E2E PR chaos scenario`,
    head: branchName,
    base: baseBranch,
    body:
      "Automated chaos PR for Companion testing.\n\n" +
      "- Creates PR event\n" +
      "- Adds comment event\n" +
      "- Can be closed in cleanup",
  });
  console.log(`Opened PR #${pr.number}: ${pr.html_url}`);

  // 7) Comment on PR
  await ghJson(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, "POST", {
    body: `${marker} automated PR comment`,
  });
  console.log(`Commented on PR #${pr.number}`);

  if (cleanup) {
    await ghJson(`/repos/${owner}/${repo}/issues/${issue.number}`, "PATCH", { state: "closed" });
    await ghJson(`/repos/${owner}/${repo}/pulls/${pr.number}`, "PATCH", { state: "closed" });
    console.log("Cleanup complete: issue and PR closed");
  } else {
    console.log("Cleanup skipped (set CLEANUP=true to auto-close issue/PR)");
  }

  console.log("\nChaos run summary:");
  console.log(`- Issue: ${issue.html_url}`);
  console.log(`- PR:    ${pr.html_url}`);
  console.log(`- Branch:${branchName}`);
  console.log(`- Marker:${marker}`);
}

main().catch((err) => {
  console.error(`Chaos run failed: ${err.message}`);
  process.exit(1);
});

