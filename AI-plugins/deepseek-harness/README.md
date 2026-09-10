# 在 DeepSeek Harness 中使用 FQGate

先安装并启动兼容的 FQGate `0.1.x`。在仓库根目录运行 `Build-Distribution.ps1` 生成 npm 包，然后执行：

```powershell
dsh plugin --profile web add <fqgate-agent-deepseek-harness-0.3.0.tgz>
dsh plugin --profile web exec fqgate-agent configure --fqgate-path "<FQGate 可执行文件>" --json
dsh web
```

Cordis 入口通过公共启动器连接 FQGate 自带的 STDIO 桥。连接失败时先运行 `status --json`，不要修改 FQGate 私有文件或把端口暴露到公网。

交易写工具默认隐藏，开启后仍须逐笔确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
