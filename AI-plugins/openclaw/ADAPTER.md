## OpenClaw 适配

- 在 OpenClaw 中只通过名为 `fqgate` 的本机 MCP 获取 FQGate 数据。
- 插件根目录由 Agent Plugins 的 `PLUGIN_ROOT` 提供，不要混入其他宿主入口文件。
- 首次配置或连接失败时使用 `configure-fqgate` 技能。
