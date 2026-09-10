## Codex 适配

- 在 Codex 中只通过名为 `fqgate` 的本机 MCP 获取 FQGate 数据。
- 首次配置或连接失败时使用 `configure-fqgate` 技能，不要改写用户的全局 MCP 配置。
- 工具返回 `structuredContent` 时优先读取结构化内容；不要重复调用接口只为取得文字副本。
- 工具返回可交互界面时直接使用该界面；界面不可用时仍需根据工具结果给出简洁结论，不要为 Codex 另写一份页面布局。
