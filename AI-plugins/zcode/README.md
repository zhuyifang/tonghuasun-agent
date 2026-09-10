# 在 ZCode 中使用 FQGate

1. 安装并启动兼容的 FQGate `0.1.x`。
2. 在仓库根目录运行 `Build-Distribution.ps1`。
3. 解压 `artifacts/fqgate-agent-zcode-marketplace-0.3.0.zip`，在 ZCode 的插件市场中添加该本地市场。
4. 安装并启用“同花顺免费开源AI插件FQGate”，运行 `configure-fqgate`，然后在“设置 → MCP”中确认 `fqgate` 已连接。

自动发现失败时提供 FQGate 可执行文件路径。插件只连接本机 `/mcp`，不配置公网、局域网或反向代理地址。

交易写工具默认隐藏，开启后仍须逐笔确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
