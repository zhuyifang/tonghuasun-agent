# 在千问中使用 FQGate

## 安装

1. 安装并启动兼容的 FQGate `0.1.x`，并至少进入过一次千问“工作任务”。
2. 解压千问安装包并运行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -FQGatePath "<fqgate.exe 路径>"
   ```

3. 等待千问重新加载工具后新建工作任务，确认 `fqgate` MCP 已连接。

安装器会写入四个按职责拆分的技能和一个 FQGate MCP 入口；不会复制或修改 FQGate。重复运行同一版本不会覆盖用户创建的同名技能或 MCP 配置。

千问入口启用结构化结果文字兼容模式。持续订阅需使用 FQGate 原生 WebSocket/SSE，不把一次快照描述成持续盯盘。

卸载千问入口可运行 `setup.ps1 -Uninstall`；共享 FQGate 配置和程序会保留。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
