# 在 Codex 中使用 FQGate

本插件把 Codex 连接到当前电脑上运行中的 FQGate。行情、账户和交易工具由 FQGate 提供；插件只负责本机发现、STDIO 连接和使用规范。

支持界面的工具会直接显示由 FQGate 提供的交互组件。组件与独立预览使用同一份界面，不会因为 Codex 适配而维护第二套布局；界面尚未加载时，查询结果仍会以文字正常返回。

当前界面资源覆盖行情登录、个股行情、资讯、多股行情和 L2 逐笔委托；是否显示对应界面，由已安装的 FQGate 版本和本次调用结果决定。

## 安装与配置

1. 安装并启动兼容的 FQGate `0.1.x`。当前公开包状态见 [FQGate 集成信息](../../fqgate/README.md)。
2. 在仓库根目录运行 `Build-Distribution.ps1`，在 Codex 的 Plugins 页面安装生成的 `fqgate-agent-codex-0.3.0.zip`。
3. 新建任务并发送“配置 FQGate”。自动发现失败时，只需提供 `fqgate.exe` 或 `FQGate.app/Contents/MacOS/fqgate` 的路径。
4. 确认检查结果中的 `mcpReachable=true` 且 `toolCount` 大于零。

Codex 插件的安装方式见 [OpenAI 官方插件说明](https://learn.chatgpt.com/docs/plugins)。

## 使用边界

可以查询行情、K 线、Level-2、账户、资产、持仓、委托和成交。持续 WebSocket/SSE 订阅不是一次性 MCP 工具，应使用 FQGate 原生流接口。

真实资金写工具默认隐藏。只有用户自行开启 FQGate 的交易写开关并逐笔确认后才能调用；超时或结果未知时禁止自动重试。

FQGate 数据可能由用户选择的 Codex 服务处理，详情见[隐私政策](../../docs/legal/PRIVACY.md)。
