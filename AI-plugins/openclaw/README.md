# 在 OpenClaw 中使用 FQGate

## 卸载旧版 `tonghuasun-agent`

如果 OpenClaw 已经安装旧版插件，请先执行：

```powershell
openclaw plugins uninstall tonghuasun-agent --dry-run
openclaw plugins uninstall tonghuasun-agent
openclaw gateway restart
```

第一条命令只预览将被移除的内容；确认目标确实是 `tonghuasun-agent` 后再执行第二条命令。不要同时启用旧版 `tonghuasun-agent` 和新版 `fqgate-agent`；卸载旧插件不会删除 FQGate 主程序或共享配置。

命令说明见 [OpenClaw 官方插件文档](https://docs.openclaw.ai/cli/plugins)。

## FQGate 主程序

本机未安装 FQGate 时，OpenClaw 应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

先按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`，再解压 `fqgate-agent-openclaw-0.3.0.zip` 并执行：

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
