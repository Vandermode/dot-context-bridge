# Local Codex Context Bridge：Linux 支持分支

让 ChatGPT 普通 **Chat 和 Dot 只读检索本机或多台电脑的 Codex 会话**。通过官方 `codex app-server` 读取，保留设备来源、turn/item 原生分页和 protected 内容策略。不能启动、继续执行、修改或删除 Codex 会话。

这是 [Local-Codex-Bridge](https://github.com/zoeynine/Local-Codex-Bridge) 的独立衍生项目，基于 v2.3.4 / `5f20b24940ed3024ed10d6ca45498f30f9750ea9`，沿用 MIT 并保留原版权。仅包含只读上下文功能，不包含 Gemini、Antigravity 私有扩展。详见 [许可说明](THIRD_PARTY_NOTICES.md)。

此分支基于 [ye-kaifan/local-codex-context-bridge](https://github.com/ye-kaifan/local-codex-context-bridge) 的 [`567751c`](https://github.com/ye-kaifan/local-codex-context-bridge/commit/567751c23665de6319b9177fbd8dfdd1b7f3b757)，新增 Linux 前台 setup、POSIX 路径与子进程处理、XDG checkpoint 默认路径、测试及 Linux/SSH 文档，保留原有只读边界和许可。发布代码不会安装或部署读取器、后台服务或 Tunnel。继承的 Gitee 工作流仅允许上游仓库运行，不会在本仓库执行。

## 直接发给自己的 Codex

在**实际保存会话的服务器/电脑及其 OS 账号**中把以下指令交给 Codex；远程操作时明确指定目标。

```text
请在源电脑安装 https://github.com/Vandermode/dot-context-bridge，
让 ChatGPT Chat 和 Dot 只读访问我的 Codex 历史。先读 INSTALL.md 和
docs/onboarding.md。检测目标系统、账号、Node/npm/Git、实际 Codex
可执行文件和 home，以及已有安装和私有连接，保留现有工作和配置。
先运行 scripts/onboard.mjs 检查；在独立源码目录使用 --apply --prepare
完成构建、配置和本地验证。仅对验证过的已有生成配置使用 --resume。
在权限允许范围内连续完成流程，不要每一步都让我手动执行命令。
确认我的已有私有 Secure MCP Tunnel ID 后生成配置，并引导我完成私有连接。
真正涉及本人登录、凭据输入或新增账号权限时暂停；不要擅自创建凭据、
开放公网端口或改变无关设置。正文/搜索验证前让我指定已有的已完成会话。
“连续分页”只指继续读取历史，不能继续执行会话，不添加启动、续接或写入能力。
隔离只针对 LOCAL Codex：停用这个插件、实际设备连接器及所有已发现的随附
SKILL.md，保留普通 Chat/Dot 连接和读取器，不要全局卸载插件。发现实际
插件/连接器 ID 和所有已安装版本的技能缓存，用真实存在的 SKILL.md 绝对
路径配置禁用。升级改变缓存路径后重新发现并复验。
重启本地 Codex，真正新开本地聊天验证原生 history 与工具/技能隔离；另在
普通 Chat 和 Dot 分别验证搜索与 turn/item 分页。逐项报告通过、失败或未执行
及具体阻碍，不把本地 smoke、旧聊天或模拟测试当作云端验收。
后台服务需要另行授权，不要默默启用。
```

## 一站式本地配置

在源机器的独立源码目录运行：

```sh
node scripts/onboard.mjs
node scripts/onboard.mjs --apply --prepare
```

默认只检查；`--apply --prepare` 安装该源码目录的 npm 依赖，运行固定构建/测试，
生成全新读取器配置，再检查原生 schema 和元数据读取。缺少 Node 或 Codex 时不会
自动安装，也不会使用 sudo。用 `--out 新目录` 选择配置位置；已有生成配置经过
核对后可用 `--apply --resume --out 已有目录` 重新验证，不覆盖配置。

配合 `--apply --tunnel-id 已有TUNNEL_ID` 可生成新的私有 Tunnel 配置文件，
但不会创建或启动 Tunnel、创建凭据或自动开通 ChatGPT 账号连接。
`--thread 已有会话ID` / `--search "已知短语"` 明确选择 protected 正文/搜索验证，
不会自动切换 exact。私有连接、普通 Chat/Dot 验收及本地 Codex 隔离仍是分阶段
引导完成，不能把本地通过当作全部接通。详见 [一站式流程与恢复](docs/onboarding.md)。
下面的手动流程仍然可用。

## 本地安装

前提：Git、Node.js 24+、npm、官方独立 Codex CLI。Windows 如只有 `codex.cmd`，需找到实际原生 `codex.exe` 后传入 `--codex`。

```sh
git clone https://github.com/Vandermode/dot-context-bridge.git
cd dot-context-bridge
npm ci --ignore-scripts
npm run typecheck
npm test
npm run setup -- --id laptop --label "我的笔记本"
npm run smoke
```

安装脚本只在新的 `.local/` 目录生成当前设备配置和 stdio 启动命令，不覆盖已有目录、不改 Codex 设置、不创建凭据、不自动启用后台服务。已有 `.local/` 时使用 `--out 新目录`。实际目录不同可加 `--codex-home 绝对路径`。

之后按 [INSTALL.md](INSTALL.md) 配置自己的 Chat/Dot 私有连接。多台电脑各自运行读取端和 Tunnel，互不依赖转发；统一插件仅引用用户自己的连接 ID。该项目没有公共读取服务器，也不提供维护者的组织、账号或 Tunnel。

## 已保留的修复和边界

- 对外 schema 移除 8 处冗余 `\\S` 正则，避免 Dot 将其当成全字符串匹配；服务端仍检查非空、类型和长度。
- macOS 后台服务使用 `ProcessType=Standard`，避免 Background 调度限制导致原生搜索超时；读取请求仍为 20 秒上限，不承诺所有查询都能在限时内完成。
- 部署后只在 LOCAL Codex 配置停用这个插件、相关设备连接器及随附技能，保留普通 Chat/Dot 连接和后台读取器，避免干扰 Codex 原生会话读取。配置片段生成器接受真实存在的技能绝对目录或 `SKILL.md` 文件，统一输出文件路径并去重；可重复 `--skill` 覆盖实际发现的多个版本缓存。它不会自动改运行配置。升级导致路径变化时必须重新发现并复验。
- 工具路由和底层原生请求两层限制只读，禁止执行和原生批准响应。
- protected 整页拒绝含疑似凭据或超限内容，不静默截断，不自动切换 exact。exact 显式调用仍可能暴露敏感内容。
- `nextCursor:null` 才表示当前范围结束；空页不一定结束。完整历史应先遍历 turn，再遍历各 turn 的 item，并报告未读范围。

macOS Apple Silicon 已做真实原生读取验证。Windows 有共享代码和 CI 测试，但真实 Codex、后台服务和 Chat/Dot 接入仍需在目标机验收。Linux 已支持前台读取器和 setup，在 Linux x64 上通过模拟回归及官方 CLI 的空目录 listing/search 检查；真实账号历史、后台服务和私有 Chat/Dot 接入仍需目标机验收。WSL 使用 Linux 代码路径，但未单独验收，不自动读取 Windows 会话。当前通用包没有替换维护者的现有安装，也没有借用旧会话中的“测试通过”作为本次发布验收。

Linux 读取范围由运行读取器的用户和 `CODEX_HOME` 决定。通过 SSH 在远端运行的 Codex app-server，应对接远端同一用户的目录；本地代理仅执行 SSH 命令，不代表会话迁到远端。Remote Control 的界面位置也不能证明历史存储位置，Work Cloud/exec-server 的执行目录不保证保存云端会话。详见 [Linux 安装与会话边界](docs/linux.md)。

隔离验收分开进行：重启本地 Codex 后真正新开聊天，检查相关工具与技能已停用，
并读取已知会话的原生 history；随后在普通 Chat 和 Dot 中各自实测云端读取器。
旧聊天可能保留已加载上下文，不能证明新配置生效。详见 [安装与复验流程](INSTALL.md#5-isolate-the-reader-from-codexs-native-tools)。

[安装、卸载与恢复](INSTALL.md) · [安全模型](docs/security.md) · [验证范围](docs/verification.md) · [英文说明](README.md)

`npm run check:native-schema` 会优先检查 `.local/device.json` 中实际配置的 Codex。使用其他配置目录时，加 `-- --config 配置目录/device.json`，避免误检 PATH 中另一份安装。

上游的 GitHub → Gitee 工作流在此分支中不会执行；其范围与故障恢复见 [镜像说明](docs/mirroring.md)。

## 可执行文件升级

新 PATH 安装保存所选稳定入口，不再固化符号链接指向的版本目录。已有配置和显式 `--codex`/`CODEX_EXE` 继续严格固定；只有添加 `--follow-updates` 才按当前用户的同一 Windows 注册包或原稳定路径跟随升级。不会扫描其他安装、切换 Codex home 或重放失败请求。原生进程已退出或协议失败时仍须重启读取器。迁移和验证步骤见 [升级说明](docs/executable-updates.md)。
