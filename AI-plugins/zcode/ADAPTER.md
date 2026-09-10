## ZCode 适配

- 在 ZCode 中只通过名为 `fqgate` 的本机 MCP 获取 FQGate 数据。
- 插件根目录由 `ZCODE_PLUGIN_ROOT` 提供，不要引用其他宿主的根目录变量。
- 首次配置或连接失败时使用 `configure-fqgate` 技能。
