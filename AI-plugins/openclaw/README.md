# 在 OpenClaw 中使用 FQGate

先安装并启动兼容的 FQGate `0.1.x`，再解压 `fqgate-agent-openclaw-0.3.0.zip` 并执行：

```powershell
openclaw plugins install .\fqgate-agent
openclaw plugins enable fqgate-agent
openclaw gateway restart
```

随后发送“配置 FQGate”。自动发现失败时提供 FQGate 可执行文件路径。可用以下命令检查入口：

```powershell
openclaw plugins inspect fqgate-agent --runtime --json
```

升级时使用 `openclaw plugins install .\fqgate-agent --force` 后重启 Gateway。卸载前可先运行 `openclaw plugins uninstall fqgate-agent --dry-run`；卸载单个入口不会删除共享 FQGate 配置或程序。

交易写工具默认隐藏，开启后仍须逐笔确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
