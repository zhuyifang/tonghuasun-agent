# 在 DeepSeek Harness 中使用 FQGate

## 卸载旧版 `tonghuasun-agent`

如果 `web` 配置已经安装旧版插件，请先关闭正在运行的 DeepSeek Harness，再执行：

```powershell
dsh plugin --profile web remove tonghuasun-agent-deepseek-harness
dsh plugin --profile web list
dsh web
```

第二条命令用于确认旧包已不在安装列表中。不要同时加载旧版 `tonghuasun-agent` 和新版 `fqgate-agent`；移除旧包不会删除 FQGate 主程序或共享配置。

命令说明见 [DeepSeek Harness 官方 CLI 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)。

## FQGate 主程序

本机未安装 FQGate 时，DeepSeek Harness 应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

先按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`。在仓库根目录运行 `Build-Distribution.ps1` 生成 npm 包，然后执行：

```powershell
dsh plugin --profile web add <fqgate-agent-deepseek-harness-0.3.0.tgz>
dsh plugin --profile web exec fqgate-agent configure --fqgate-path "<FQGate 可执行文件>" --json
dsh web
```

Cordis 入口通过公共启动器连接 FQGate 自带的 STDIO 桥。连接失败时先运行 `status --json`，不要修改 FQGate 私有文件或把端口暴露到公网。

交易写工具默认隐藏，开启后仍须逐笔确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
