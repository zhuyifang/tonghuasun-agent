## DeepSeek Harness 适配

- 在 DeepSeek Harness 中只通过名为 `fqgate` 的本机 MCP 获取 FQGate 数据。
- MCP 入口由 Cordis 插件注册；连接失败时先使用 `configure-fqgate` 技能检查共享配置。
- 不把重连视为写操作可重试；真实资金写操作结果未知时仍须停止并查询记录。
