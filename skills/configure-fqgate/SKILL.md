---
name: configure-fqgate
description: 配置、检查或修复 FQGate 与 AI 客户端之间的本机 MCP 连接。用户提到首次安装、FQGate 路径、MCP 无法连接、17281 端口或插件升级时使用。
---

# 配置 FQGate

插件根目录是本 `SKILL.md` 所在目录向上两级。公共配置器位于插件根目录的 `scripts/configure-fqgate.mjs`。

## 工作流

1. 先执行只读检查：

   ```powershell
   node <插件根目录>\scripts\configure-fqgate.mjs status --json
   ```

2. 如果没有找到 FQGate，只询问用户 FQGate 可执行文件的位置，再执行：

   ```powershell
   node <插件根目录>\scripts\configure-fqgate.mjs configure --fqgate-path "<fqgate.exe 或 FQGate.app/Contents/MacOS/fqgate>" --json
   ```

3. 自定义端口时必须传完整的本机 MCP 地址：

   ```powershell
   node <插件根目录>\scripts\configure-fqgate.mjs configure --fqgate-path "<路径>" --mcp-url "http://127.0.0.1:<端口>/mcp" --json
   ```

4. 配置器写入共享的 Agent 连接配置，不复制 FQGate，不修改 FQGate 程序，也不启动桌面服务。请用户正常启动 FQGate 后再次运行 `status --json`，确认 `fqgateCompatible=true`、`healthReachable=true`、`mcpReachable=true` 且 `toolCount` 大于零。

## 约束

- FQGate 只允许连接 `127.0.0.1`、`localhost` 或 `::1` 的 `/mcp`；不要配置公网、局域网地址、反向代理或凭据参数。
- 一个电脑上的所有 AI 入口复用同一份 FQGate 配置和同一个运行实例。
- 卸载单个 AI 插件时不要删除共享配置。只有用户明确要求移除所有 Agent 连接配置时，才运行 `uninstall --json`。
- 交易写工具是否出现由 FQGate 启动参数 `--enable-mcp-trading-writes` 决定；不要在安装器中私自开启。
