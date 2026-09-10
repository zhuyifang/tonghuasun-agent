# 在 WorkBuddy 中使用 FQGate

1. 安装并启动兼容的 FQGate `0.1.x`。
2. 在仓库根目录运行 `Build-Distribution.ps1`，导入生成的 `fqgate-agent-workbuddy-0.3.0.zip`。
3. 重启 WorkBuddy，运行 `configure-fqgate`；自动发现失败时提供 FQGate 可执行文件路径。
4. 用 `fqgate_market_market_health` 验证本机 MCP 连接。

WorkBuddy 入口开启了 FQGate 的结构化结果文字兼容模式。文字副本只用于客户端兼容，不代表需要重复调用工具。

真实资金写工具默认隐藏，开启后仍须逐笔确认。持续订阅使用 FQGate 原生流接口。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
