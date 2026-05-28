# Vigil

A calm, local-first menu bar app for GitHub maintainers. Runs in your menu bar. Surfaces only what needs your attention — no noise, no overload.

[🌐 Landing page](https://emeka-ugbanu-hub.github.io/Vigil)

---

## What it does

Vigil watches your GitHub repos and shows you a scored dashboard of everything that matters:

- **🔴 Urgent** — CVEs, secret leaks, 3rd CI failure in a row, force pushes
- **🟠 Pending** — PRs waiting, first-timers, author bumps, stale items
- **⚪ Later** — Answered discussions, approved PRs, low-score items
- **⚫ Noise** — Bots, Dependabot patches, AI-slop, duplicates

It polls every 30s–5min (adaptive), uses ETags to minimize API calls, and never requests write access to your repos.

---

## How it works

1. **Connect GitHub** — one-time OAuth setup (you own your credentials)
2. **Pick up to 4 repos** — choose what Vigil watches
3. **Menu bar runs silently** — your blocky V logo, always there
4. **Tap for dashboard** — natural-language sentence like *"Hey, @you — you have ● 2 urgent and ● 5 pending items."*
5. **Tap to open inbox** — full list with tabs, repo filters, item details

---

## Install (macOS)

Download the `.dmg` from the [releases page](https://github.com/Emeka-Ugbanu-hub/Vigil/releases/latest). Open it, drag Vigil to Applications. First launch: right-click → Open (Gatekeeper bypass).

## Build from source (Windows & Linux)

### Prerequisites (all platforms)
- **Rust** — https://rustup.rs
- **Node.js 18+** — https://nodejs.org
- **Git**

### Linux — install system deps first
```bash
# Ubuntu / Debian
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

# Fedora
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf

# Arch
sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf
```

### Build (Windows & Linux)
```bash
git clone https://github.com/Emeka-Ugbanu-hub/Vigil.git
cd Vigil
npm install
npm run tauri build
```

**Output:**
- **Windows:** `src-tauri\target\release\bundle\msi\Vigil_0.1.0_x64.msi` — double-click to install
- **Linux:** `src-tauri/target/release/bundle/deb/Vigil_0.1.0_amd64.deb` — `sudo dpkg -i` to install

## Run from source (dev mode)

```bash
git clone https://github.com/Emeka-Ugbanu-hub/Vigil.git
cd Vigil
npm install
npm run tauri dev
# Or if that fails: cd src-tauri && cargo run
```

---

## What it detects

| Signal | Detection method |
|---|---|
| Security advisories (CVEs) | REST API per repo, severity-mapped |
| CI failures | Actions workflow runs, streak-aware |
| Secret scanning alerts | REST API, silent fallback if disabled |
| PR reviews | GraphQL `reviewDecision` + review history |
| Merge conflicts | `mergeable` field + label detection |
| Author bumps | Comment author analysis (OP commented, no reply) |
| Heating up | 3+ unique non-OP commenters |
| Dependabot / Renovate | Bot detection + bump type scoring |
| AI-slop | Slop detector (LLM phrases, templates) |
| First-timer risk | Time-based escalation (3d / 7d) |
| Force pushes | HEAD SHA comparison via compare API |
| Releases & discussions | REST + GraphQL |
| Reopen / duplicate | `stateReason` + label detection |
| Draft → ready | Timeline events |
| Pushed after review | Commit timing vs review timing |

---

## Architecture

- **Frontend:** React + TypeScript, skeuomorphic B&W design
- **Backend:** Rust + Tauri 2
- **Storage:** SQLite (local, no cloud)
- **Polling:** Smart adaptive polling with ETags + notifications tripwire
- **Auth:** GitHub OAuth Device Flow (repo:read + user:read)

---

## Permissions

Vigil requests **read-only** access:
- `repo` — read issues, PRs, CI, releases, security data
- `read:user` — your GitHub username for display

No write access. No admin scope. No org permissions.

---

## License

MIT
