---
name: configure-fqgate
description: "安装、接入、升级、检查或修复本机 FQGate 与 Codex、Claude、DeepSeek 等 AI 工具的插件或 MCP 连接时使用；覆盖怎么安装、找不到 FQGate、插件不可用、没有工具、连接失败或超时、17281 端口异常等表达。"
---

# 配置 FQGate

插件根目录是本 `SKILL.md` 所在目录向上两级。公共配置器位于插件根目录的 `scripts/configure-fqgate.mjs`。

## 决策规则

- 用户要查行情、账户或执行交易，且 `fqgate` 工具已可调用时，直接使用对应技能，不要重复配置。
- 工具列表为空、MCP 连接失败或用户问安装升级时，先运行只读状态检查；不要先猜路径、改配置或重启程序。
- 安装 `fqgate-agent` 前先检查当前 AI 工具是否仍安装旧版 `tonghuasun-agent`。如果存在，按当前 AI 工具 README 的“卸载旧版”流程完成卸载并确认旧入口消失，再继续安装；不要让两个版本同时启用。
- 状态检查找不到 FQGate 时，先按当前 AI 工具 README 中的正式发行路径获取主程序，不要求用户自行寻找下载地址。只有当前 AI 工具禁止自动下载或运行本机程序时，才把已经确定的官方发行页交给用户操作。
- 配置器只维护共享 Agent 连接配置，不复制、启动或修改 FQGate。配置完成后必须由用户正常启动 FQGate，再复查连接。
- 行情或交易账户未登录不等于 MCP 配置损坏。MCP 已连通时转入登录或数据流程，不要重复安装。

## 典型调用链

首次安装或故障排查：

1. 执行只读检查：

   ```powershell
   node <插件根目录>\scripts\configure-fqgate.mjs status --json
   ```

2. 仅在结果缺少 FQGate 路径时询问用户，然后配置：

   ```powershell
   node <插件根目录>\scripts\configure-fqgate.mjs configure --fqgate-path "<fqgate.exe 或 FQGate.app/Contents/MacOS/fqgate>" --json
   ```

3. 用户明确使用自定义端口时，传完整本机地址：

   ```powershell
   node <插件根目录>\scripts\configure-fqgate.mjs configure --fqgate-path "<路径>" --mcp-url "http://127.0.0.1:<端口>/mcp" --json
   ```

4. 请用户启动 FQGate 后再次运行 `status --json`。只有 `fqgateCompatible=true`、`healthReachable=true`、`mcpReachable=true` 且 `toolCount` 大于零，才能说明连接完成。

## 主程序下载规则

- 优先读取 `https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json`，失败时读取 `https://raw.githubusercontent.com/zhuyifang/tonghuasun-agent/main/fqgate/releases/stable.json`。
- 发行清单必须满足 `component=fqgate`、`channel=stable`、`status=published`，并包含当前系统和架构对应的包；否则停止，不猜测文件名或使用其他版本。
- Gitee 下载路径为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；失败时使用 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`。
- 下载完成后必须同时核对 `size` 和 `sha256`。任何一项不一致都应删除未验证文件并停止，不能启动或配置该文件。
- Windows 主程序放入当前用户的 `%LOCALAPPDATA%\Programs\FQGate\fqgate.exe`；macOS 按发行包结构安装 `FQGate.app`。已有兼容版本时直接复用，不重复下载。

升级时同样先检查当前版本与兼容状态；已有有效路径时复用，不要求用户重新安装或重新选择目录。

## UI 与停止条件

- MCP 配置过程没有插件界面。现有“同花顺行情登录”组件只用于行情账户登录，不能用来修复端口、进程或 MCP 配置。
- 找不到可执行文件、路径无效或需要用户启动程序时停止并等待用户处理。
- 完成一次配置和一次复查后仍不可达时，报告 `status --json` 中的具体失败项并停止；不要循环改端口、重装或重试。
- 地址不是 `127.0.0.1`、`localhost` 或 `::1` 的 `/mcp` 时拒绝配置，不建议公网、局域网、反向代理或凭据参数。

## 安全边界

- 一台电脑上的所有 AI 入口复用同一份配置和同一个 FQGate 实例。
- 旧版卸载只处理 `tonghuasun-agent` 插件、技能、市场或 MCP 入口，不删除 FQGate 主程序、共享配置和用户数据。
- 卸载单个 AI 插件时不删除共享配置。只有用户明确要求移除所有 Agent 连接配置时，才运行 `uninstall --json`。
- 交易写工具是否出现由 FQGate 主界面的“委托下单”和“资金划转”开关决定；不得代替用户开启。
