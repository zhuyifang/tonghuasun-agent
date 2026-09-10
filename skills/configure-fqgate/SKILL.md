---
name: configure-fqgate
description: "安装、接入、升级、检查或修复本机 FQGate 与 Codex、Claude、DeepSeek 等 AI 工具的插件或 MCP 连接时使用；覆盖怎么安装、找不到 FQGate、插件不可用、没有工具、连接失败或超时、17281 端口异常等表达。"
---

# 配置 FQGate

插件根目录是本 `SKILL.md` 所在目录向上两级。公共配置器位于插件根目录的 `scripts/configure-fqgate.mjs`。

## 决策规则

- 用户要查行情、账户或执行交易，且 `fqgate` 工具已可调用时，直接使用对应技能，不要重复配置。
- 工具列表为空、MCP 连接失败或用户问安装升级时，先运行只读状态检查；不要先猜路径、改配置或重启程序。
- 状态检查找不到 FQGate 时，只询问可执行文件位置。Windows 使用 `fqgate.exe`，macOS 使用 `FQGate.app/Contents/MacOS/fqgate`。
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

升级时同样先检查当前版本与兼容状态；已有有效路径时复用，不要求用户重新安装或重新选择目录。

## UI 与停止条件

- MCP 配置过程没有插件界面。现有“同花顺行情登录”组件只用于行情账户登录，不能用来修复端口、进程或 MCP 配置。
- 找不到可执行文件、路径无效或需要用户启动程序时停止并等待用户处理。
- 完成一次配置和一次复查后仍不可达时，报告 `status --json` 中的具体失败项并停止；不要循环改端口、重装或重试。
- 地址不是 `127.0.0.1`、`localhost` 或 `::1` 的 `/mcp` 时拒绝配置，不建议公网、局域网、反向代理或凭据参数。

## 安全边界

- 一台电脑上的所有 AI 入口复用同一份配置和同一个 FQGate 实例。
- 卸载单个 AI 插件时不删除共享配置。只有用户明确要求移除所有 Agent 连接配置时，才运行 `uninstall --json`。
- 交易写工具是否出现由 FQGate 主界面的“委托下单”和“资金划转”开关决定；不得代替用户开启。
