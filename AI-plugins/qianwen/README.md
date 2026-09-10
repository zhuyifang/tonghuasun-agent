# 在千问中使用 FQGate

## 卸载旧版 `tonghuasun-agent`

如果千问已经安装旧版“同花顺 Agent”，请先在旧版解压目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -Uninstall
```

等待千问重新加载工具，然后新建工作任务，确认旧的 `tonghuasun-agent` 技能和 MCP 已不再出现。找不到旧版解压目录时，不要手动修改千问用户目录；新版安装程序会识别并移除由旧版安装程序管理的技能和 MCP 入口。

不要同时保留旧版 `tonghuasun-agent` 和新版 `fqgate-agent`。以上操作不会删除 FQGate 主程序或共享配置。

## FQGate 主程序

本机未安装 FQGate 时，应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

## 安装

1. 按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`，并至少进入过一次千问“工作任务”；本机已有兼容版本时直接复用。
2. 解压千问安装包并运行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -FQGatePath "<fqgate.exe 路径>"
   ```

3. 等待千问重新加载工具后新建工作任务，确认 `fqgate` MCP 已连接。

安装器只会写入“同花顺免费实时数据代理”和“同花顺实盘交易代理”两个技能，以及一个 FQGate MCP 入口；不会复制或修改 FQGate。重复运行同一版本不会覆盖用户创建的同名技能或 MCP 配置。

千问入口启用结构化结果文字兼容模式。持续订阅需使用 FQGate 原生 WebSocket/SSE，不把一次快照描述成持续盯盘。

卸载千问入口可运行 `setup.ps1 -Uninstall`；共享 FQGate 配置和程序会保留。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
