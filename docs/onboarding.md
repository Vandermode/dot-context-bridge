# Guided one-stop read-only onboarding

One instruction to a server-local Codex agent can drive environment discovery,
build, local reader configuration, validation and private-connection guidance.
It cannot remove genuine account approvals or make account enrollment fully
automatic. The bridge remains a history reader, not a remote-control agent.
Retrieving another turn/item page never resumes or executes that conversation.

## Start on the right machine

Use the same OS account and Codex home as the sessions to read. Identify the
server explicitly when working over SSH. A remote tool-execution directory is
not evidence that the conversation lives there. Do not use sudo, copy session
stores, read raw session files to bypass a denial, or substitute another account.
See [Linux session placement](linux.md) for SSH, WSL and cloud limitations.

Read the target's instructions and preserve existing installations. Work in a
separate persistent checkout. Required prerequisites are Git, Node.js 24+, npm
and an official standalone Codex CLI. Missing prerequisites require the smallest
supported installation step under the owner's permissions; the wrapper does not
automatically install Node/Codex or replace a bundled runtime.

## Inspect, prepare and apply

From the repository root:

```sh
node scripts/onboard.mjs
node scripts/onboard.mjs --apply --prepare
```

The first invocation inspects only. The second runs `npm ci --ignore-scripts`
and fixed lint/typecheck/test commands in the source checkout, then creates fresh
reader configuration and performs native schema and metadata smoke checks.
`--prepare` requires `--apply` and a source checkout; it is not the runtime-archive
workflow. Without `--prepare`, apply requires the built code to exist already.
Do not treat a failed build as permission to install different dependencies or
change machine security settings.

Choose another new configuration directory with `--out NEW_DIRECTORY`. Setup
refuses to overwrite existing directories. To validate an existing configuration:

```sh
node scripts/onboard.mjs --apply --resume --out EXISTING_DIRECTORY
```

Resume here means resuming **installation validation**, not a Codex conversation.
The wrapper validates existing generated device and command configuration and
does not overwrite it. Inspect partial or mismatched configuration privately; use
a fresh output directory if necessary rather than deleting unknown files. Do not
silently migrate a running installation. Manual setup remains documented in
[INSTALL.md](../INSTALL.md#2-build-and-configure-this-device).

## Opt into protected history checks

Default smoke checks the read-only catalog, write denial and native metadata
listing. It does not prove body retrieval or search. With the owner's chosen
stable, completed thread and known search phrase:

```sh
node scripts/onboard.mjs --apply --resume --out EXISTING_DIRECTORY --thread EXISTING_THREAD_ID --search "known phrase"
```

These flags opt into protected content checks. `--search` searches across the configured
source's threads, even when `--thread` is also supplied; it is not confined to that
thread. No automatic exact-mode fallback
is allowed. Search terms may appear in the local shell's history and process
arguments: choose a non-sensitive phrase and never use a credential as a query.
The smoke test follows at most one continuation per tested range, so it is not a
complete transcript audit. If no cursor exists, record that no continuation was
available rather than claiming a continuation was tested. Empty results with a
non-null cursor are not the end of a range. Native schema compatibility alone
does not establish real-account history visibility.

## Generate an existing private Tunnel profile

First establish the owner's actual Tunnel ID and intended account/workspace.
Then, for example:

```sh
node scripts/onboard.mjs --apply --resume --out EXISTING_DIRECTORY --tunnel-id YOUR_EXISTING_TUNNEL_ID
```

This generates a new `tunnel.yaml` through the existing helper. With `--resume`,
an exactly matching existing profile can be verified unchanged; a mismatched
profile fails rather than being overwritten. The profile references `CONTROL_PLANE_API_KEY`; no secret is
written into it. Generation does not create or start a Tunnel, prove its ownership
or availability, create a runtime key, change permissions, or add a ChatGPT plugin.

Continue with [the private connection steps](../INSTALL.md#3-connect-the-owners-chat-and-dot):
verify the current official tunnel-client, obtain any required account approval,
let the owner enter credentials securely, then run their private connection.
Never put secrets in chat, command arguments, repository files or logs. Account
availability and workspace permissions are genuine prerequisites, not installer
bugs. If access is unavailable, retain the local stdio reader and report the
blocker. Do not expose a public listener as a fallback.

## Report phases independently

Report actual passed, failed and not-run steps, with a concrete blocker and next
step. A local-only result is not end-to-end success. The wrapper does not execute
or certify the following guided phases:

- Private Tunnel runtime and account/workspace connection acceptance.
- Ordinary Chat **and** Dot: source identification, a known session, protected
  search, turn/item retrieval and available native cursors.
- Local Codex isolation: disable only this plugin, its actual registered device
  connectors and discovered bundled skill files; preserve cloud connections.
  Restart and verify in a genuinely new local chat. Rediscover changed skill-cache
  paths after updates. Follow the [isolation runbook](../INSTALL.md#5-isolate-the-reader-from-codexs-native-tools).
- Optional background service: only after foreground acceptance and separate
  authorization. The wrapper never installs a supervisor or enables lingering.

Do not convert `configured`, a generated profile, a healthy Tunnel, synthetic
fixtures, an empty native home or an old chat into an acceptance claim. Windows,
Linux, WSL and each private account connection still need target-machine checks.
No new end-to-end qualification is claimed by this onboarding guide. See the
[verification record](verification.md) for previously established coverage.
