# Local Codex Context Bridge: Linux-enabled fork

[简体中文](README.zh-CN.md) · [Install with Codex](INSTALL.md) · [Security](docs/security.md) · [Protocol](PROTOCOL-ASSUMPTIONS.md)

Give ChatGPT **Chat and Dot read-only access to existing Codex sessions** on your own computers. The bridge uses the official `codex app-server`, preserves native turn/item pagination and source-device labels, and can run behind your own Secure MCP Tunnel. It cannot start, resume, execute, edit or delete Codex work.

This is an independent MIT-licensed derivative of [zoeynine/Local-Codex-Bridge](https://github.com/zoeynine/Local-Codex-Bridge), based on v2.3.4 commit [`5f20b249`](https://github.com/zoeynine/Local-Codex-Bridge/tree/5f20b24940ed3024ed10d6ca45498f30f9750ea9). The original copyright and license are retained. See [third-party notices](THIRD_PARTY_NOTICES.md) for the selected core, changes and dependency licenses. No Gemini or Antigravity integration is included.

This Linux-enabled fork is based on [ye-kaifan/local-codex-context-bridge](https://github.com/ye-kaifan/local-codex-context-bridge) at commit [`567751c`](https://github.com/ye-kaifan/local-codex-context-bridge/commit/567751c23665de6319b9177fbd8dfdd1b7f3b757). It adds Linux foreground setup, POSIX process/path handling, XDG checkpoint defaults, tests and Linux/SSH documentation while preserving the existing read-only boundary. It does not install or deploy a reader, service or Tunnel. Upstream licensing and notices are retained. The inherited Gitee workflow is guarded to the upstream repository and does not run here.

## Give this to your Codex

Run this instruction in Codex on the **server/computer and OS account that owns
the sessions**, or name that target explicitly when giving Codex remote access.

```text
Install https://github.com/Vandermode/dot-context-bridge on the source computer
for read-only Codex history in ChatGPT Chat and Dot. Read INSTALL.md and
docs/onboarding.md. Detect the target OS/account, Node/npm/Git, actual Codex
executable/home and existing installations/connections. Preserve existing work.
Use scripts/onboard.mjs to inspect first, then --apply --prepare in a separate
source checkout to build, configure and validate the local reader. Use --resume
only for a verified existing generated configuration. Continue through all
permitted steps rather than asking me to run each command. Reuse my existing
private Secure MCP Tunnel; generate its local profile only after identifying its
actual ID. Guide me through private connection setup and credential entry.
Pause for genuine login, credential or account-permission approvals; never
create credentials, expose public ports or change unrelated settings silently.
Ask me to select an existing completed session before protected body/search
checks. Pagination means retrieving more history, never resuming a Codex turn.
Keep this bridge read-only: no thread start/resume, command execution or writes.
Isolate only LOCAL Codex from this plugin, its actual registered device
connectors and every discovered bundled SKILL.md. Keep ordinary Chat/Dot
connections and readers running; do not globally uninstall the plugin. Discover
real plugin/app IDs and all installed skill-cache versions, use existing absolute
SKILL.md files and reverify changed cache paths after updates.
Restart local Codex and use a genuinely new local chat to verify native history
and absence of this plugin's tools/skills. Separately verify cloud Chat and Dot
search and turn/item pagination. Report each phase as passed, failed or not run,
with exact blockers. Local smoke, old chats and simulated tests are not cloud
acceptance. Configure background service only with separate authorization.
```

## One-stop local onboarding

From a separate source checkout on the source machine:

```sh
node scripts/onboard.mjs
node scripts/onboard.mjs --apply --prepare
```

The default is inspection only. `--apply --prepare` installs this checkout's npm
dependencies, runs fixed build/test checks, creates a fresh reader configuration,
and runs native schema and metadata smoke checks. It does not install Node or
Codex. Add `--out NEW_DIRECTORY` to choose the output directory. For a verified
existing generated configuration use `--apply --resume --out EXISTING_DIRECTORY`;
no configuration is overwritten.

An optional `--tunnel-id YOUR_EXISTING_TUNNEL_ID` with `--apply` generates a new
private Tunnel profile. It does not create or start a Tunnel, obtain credentials,
or enroll a ChatGPT account. Protected history/search checks require explicit
`--thread EXISTING_THREAD_ID` / `--search "known phrase"`. See the
[onboarding stages and recovery guide](docs/onboarding.md). Private connection,
Chat/Dot acceptance and local Codex isolation remain guided steps with their own
results, not automatic success. The manual commands below remain available.

## Local quick start

Install Git, Node.js **24 or later**, npm, and an official standalone Codex CLI first. Codex is not an npm dependency of this project. Use the account/home that actually contains your sessions.

```sh
git clone https://github.com/Vandermode/dot-context-bridge.git
cd dot-context-bridge
npm ci --ignore-scripts
npm run typecheck
npm test
npm run setup -- --id laptop --label "My laptop"
npm run smoke
```

Setup creates a **new** `.local/` directory with `device.json`, `mcp.json` and `command.json`. It detects Node, resolves Codex from `PATH` or `CODEX_EXE`, honors `CODEX_HOME`, and refuses to overwrite an existing directory. Use `--out NEW_DIRECTORY` for another configuration; use `--codex ABSOLUTE_PATH` and `--codex-home ABSOLUTE_PATH` when detection is insufficient. On Windows, provide the native `codex.exe` if only an npm `.cmd` shim is on `PATH`. New PATH setups retain the selected stable path across symlink updates; explicit paths remain pinned. Use `--follow-updates` to opt a selected executable into registered Windows package updates or stable-path resolution. See [upgrade behavior and migration](docs/executable-updates.md).

The generated `command.json` is the stdio command for your MCP client or Tunnel. Launch **Node directly**, never `npm start` behind MCP: npm's lifecycle output is not JSON-RPC. Local setup does not install a cloud plugin, start a background service, change Codex settings, or create credentials.

[INSTALL.md](INSTALL.md) covers Chat/Dot connection, multiple devices, optional macOS app lifecycle, Windows background setup, Linux setup, Codex isolation, uninstall and recovery. [Linux notes](docs/linux.md) explain SSH/Remote Control session scope and headless-operation limits.

Local isolation disables only this reader's plugin, device connectors and bundled
skills in **LOCAL Codex**. It keeps ordinary Chat/Dot access and background readers
enabled. The fragment generator accepts an existing absolute skill directory or
`SKILL.md` file and emits the file path; repeat `--skill` for every discovered cache
version. It never edits Codex settings. Follow the separate new-local-chat and cloud
history checks in [the isolation runbook](INSTALL.md#5-isolate-the-reader-from-codexs-native-tools),
including rediscovery after cache paths change on update.

## What it exposes

| Tool | Purpose |
| --- | --- |
| `codex_devices` | Identify this source and whether setup is pending. `configured` is not a native availability probe. |
| `codex_threads` | Native title/list filtering, lineage filters and metadata-only reads. |
| `codex_search` | Native full-text search and within-thread occurrence locators. |
| `codex_history` | Lossless native turn pages, then item pages for each turn. |

Each device runs its own reader/connection. Multi-device context is assembled by the client, with each device's results and unavailable status reported separately. There is no cross-device history store, local search index, or dependency on the maintainer's infrastructure.

**History and Search default to `protected`.** Secret-shaped or oversized content rejects the whole page. There is no silent truncation, redaction-as-success, full-thread fallback or automatic switch to `exact`. Explicit per-call `exact` is available but can expose sensitive content; it is not an access-control level. List/metadata responses use the upstream bounded sanitizer and are not lossless transcripts.

Keep the original source, query and cursor scope. Read turns, then items; only `nextCursor: null` ends a range. Empty pages can still have a continuation. Legacy history uses one full turn per page and has no item pagination.

## Compatibility and verification

| Component | Scope |
| --- | --- |
| macOS | Supported; native read-only qualification performed on Apple Silicon with Node 25.1.0 and Codex CLI 0.164.0. |
| Windows | Shared implementation and Windows CI regression coverage; real Codex installation, DPAPI/service and Chat/Dot acceptance still require verification on the target computer. |
| Linux | Foreground reader/setup implemented; deterministic Linux x64 tests and official CLI empty-home listing/search verified. Real account history, services and private Chat/Dot connections still require target-machine acceptance. |
| WSL | Uses the Linux code path with a Linux CLI/home; not independently qualified. Native Windows history is a separate source. |
| Chat / Dot | Current portable schemas retain the deployed compatibility fixes. This new generic package requires end-to-end acceptance on each user's private connection. |

The required native methods/fields matter more than a version comparison. Run `npm run check:native-schema` (it uses the configured executable in `.local/device.json`); for another setup directory pass `-- --config PATH_TO_DEVICE_JSON`. Upgrading Codex may change its experimental APIs. [Protocol notes](PROTOCOL-ASSUMPTIONS.md) describe the contract and limits. [Verification](docs/verification.md) distinguishes deterministic, real-native and unexecuted checks.

## Development

```sh
npm run lint
npm run typecheck
npm test
npm run check:release
npm audit
npm pack
```

The lint command checks JavaScript syntax, whitespace and conflict markers; strict TypeScript checking is separate. CI is configured for macOS, Windows and Ubuntu with Node 24. Tests use synthetic data and do not need accounts or create native sessions. Live smoke tests are opt-in and print verification facts, not transcript content.

The repository contains source and install guidance. It is **not** a publicly hosted MCP endpoint, a shared Tunnel, or an OpenAI-endorsed product.

`npm pack` produces a runtime archive containing built code and setup helpers. For
development/build/tests use the Git checkout above. To use the unpacked runtime
archive, run `node scripts/setup.mjs` from its `package/` directory; no npm runtime
dependencies are needed. Generated `.local/` files are never included in the archive.

For maintainer-only GitHub → Gitee synchronization, see [mirror scope and recovery](docs/mirroring.md). This does not configure a user's own mirror or credentials.
