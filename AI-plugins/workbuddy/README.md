# 在 WorkBuddy 中使用 FQGate

## 卸载旧版 `tonghuasun-agent`

如果 WorkBuddy 已经安装旧版 `tonghuasun-agent`（旧显示名“同花顺 Agent”），请先完成以下操作：

1. 打开 WorkBuddy 的插件管理页面，进入“已安装”列表。
2. 打开“同花顺 Agent”的详情，选择卸载。
3. 确认旧插件已经从已安装列表中移除，然后重启 WorkBuddy。

不要同时启用旧版 `tonghuasun-agent` 和新版 `fqgate-agent`。卸载旧插件不会删除 FQGate 主程序或共享配置。

界面入口见 [WorkBuddy 官方插件文档](https://www.codebuddy.cn/docs/workbuddy/Plugins)。

## FQGate 主程序

本机未安装 FQGate 时，WorkBuddy 应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

1. 按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`；本机已有兼容版本时直接复用。
2. 从 [0.3.0 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/v0.3.0)下载并校验 `fqgate-agent-workbuddy-0.3.0.zip`。
3. 在 WorkBuddy 终端执行以下命令；发行包本身就是正式插件市场，不需要再创建“本机验收市场”：

   ```powershell
   codebuddy plugin marketplace add .\fqgate-agent-workbuddy-0.3.0.zip --name fqgate-official
   codebuddy plugin install fqgate-agent@fqgate-official
   ```

4. 重启 WorkBuddy，运行 `configure-fqgate`；自动发现失败时提供 FQGate 可执行文件路径。
5. 用 `fqgate_market_market_health` 验证本机 MCP 连接。

WorkBuddy 入口开启了 FQGate 的结构化结果文字兼容模式。文字副本只用于客户端兼容，不代表需要重复调用工具。

真实资金写工具默认隐藏，开启后仍须逐笔确认。持续订阅使用 FQGate 原生流接口。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
