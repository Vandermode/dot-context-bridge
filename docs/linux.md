# Linux setup and session scope

Linux now has a native POSIX platform policy and foreground setup. Use Node.js 24+
and an official Linux Codex executable under the same OS user and `CODEX_HOME` as
the sessions to be read. No desktop GUI is required. Setup does not install a
service, configure SSH, create a Tunnel, grant access or migrate history.

## Prepare and verify

From a separate checkout, build and run the synthetic tests first:

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run check:release
npm run setup -- --id linux --label "My Linux computer"
npm run check:native-schema
npm run smoke
```

Use `--codex ABSOLUTE_LINUX_EXECUTABLE` and `--codex-home ABSOLUTE_HOME` when
detection is insufficient. The default home is `CODEX_HOME`, then `~/.codex`;
this is separate from the shared platform policy's checkpoint default under
`$XDG_STATE_HOME/LocalCodexBridge/checkpoints` or
`~/.local/state/LocalCodexBridge/checkpoints`. Relative/empty XDG values are ignored.
The reader itself does not create checkpoints.

New PATH setups retain the selected stable symlink path. Explicit `--codex` and
`CODEX_EXE` pins remain pinned unless `--follow-updates` is supplied. POSIX execute
permissions are required. A missing or denied selected binary does not cause a
fallback to another account or installation. Do not use `sudo` to work around a
source-account mismatch.

Review `.local/command.json` and launch its absolute Node command directly from
your authorized stdio client or private Tunnel. Do not launch `npm start` as MCP,
expose a public port, or add the reader to local Codex's own tool configuration.
Read [INSTALL.md](../INSTALL.md) for private connection setup and local isolation.

## Which machine owns the conversation?

The bridge launches one local `codex app-server` for one configured `CODEX_HOME`.
It reads only threads exposed by that server's allowed native methods. It is not
an SSH client, a cloud-history connector, or a cross-device history replicator.

| Workflow | Where to validate the reader |
| --- | --- |
| Codex CLI started on Linux, including after SSH login | The same Linux user and Codex home. |
| Desktop Codex project connected through SSH | Official docs say the app starts an app-server on the SSH host. Validate the matching remote user/home, rather than assuming the laptop has those threads. |
| A local Codex agent executing an `ssh` command | Running a command remotely does not by itself move the conversation. Check the original agent's app-server/store. |
| Codex Remote Control | Identify the controlled host and any explicit chat handoff; verify that particular thread through its native reader. The UI alone does not prove where history is available. |
| Work Cloud/local execution or `exec-server` | Local workspace/tool execution does not establish that cloud conversations are in the local Codex store. Cloud-history access is not implemented by this bridge. |

These are architecture-based placement rules, not proof of a particular account's
history visibility. Ephemeral, provider-filtered, archived or unsupported-version
threads can be absent. Use supported native metadata to verify a known completed
thread. Do not inspect/copy raw session files to evade a refusal or infer that an
empty default list means the entire account has no history.

Official references:
- [Configuration and local state](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)
- [Remote connections and SSH hosts](https://learn.chatgpt.com/docs/remote-connections#connect-to-an-ssh-host)
- [Cloud work with local access](https://learn.chatgpt.com/docs/enterprise/cloud-local-access)
- [App-server protocol](https://learn.chatgpt.com/docs/app-server)

## Background operation and limits

Foreground verification comes first. If the owner later authorizes background
operation, use their user-level supervisor (for example, `systemd --user`) and the
same absolute paths/home. This release does not install a Linux service, enable
lingering, change login/security settings, manage credentials, or implement desktop
app lifecycle tracking. Never place Tunnel keys in a unit, command argument or
repository. A headless credential store may require a separate approved setup.

WSL uses this Linux code path when Node and Codex run inside the distribution.
It is a distinct source from native Windows Codex; do not point it at Windows
authentication or session files and assume compatibility. WSL, Linux ARM64,
real SSH/Remote Control account history, Linux credential stores, persistent
services and Chat/Dot Tunnel acceptance have not been qualified by fixture tests.

On the target machine, separately verify the installed native schema, a completed
thread's protected search and turn/item pagination, local plugin isolation in a
new chat, and ordinary cloud Chat/Dot access. Report each as passed, failed or not
run. See the [verification record](verification.md#linux-port-verification).
