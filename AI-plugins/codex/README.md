# 在 Codex 中使用 FQGate

本插件把 Codex 直接连接到当前电脑上运行中的 FQGate。行情、账户和交易工具由 FQGate 提供；插件负责连接和使用规范。

支持界面的工具会直接显示由 FQGate 提供的交互组件。组件与独立预览使用同一份界面，不会因为 Codex 适配而维护第二套布局；界面尚未加载时，查询结果仍会以文字正常返回。

当前界面资源覆盖行情登录、个股行情、资讯、多股行情和 L2 逐笔委托；是否显示对应界面，由已安装的 FQGate 版本和本次调用结果决定。

## 卸载旧版 `tonghuasun-agent`

如果 Codex 已经安装旧版 `tonghuasun-agent`（旧显示名“同花顺 Agent”），请先完成以下操作：

1. 打开 Codex 的 Plugins 页面，进入“已安装”列表。
2. 打开 `tonghuasun-agent` 的详情页，选择“卸载插件”。
3. 确认它不再显示为已安装，然后新建任务。

不要同时保留旧版 `tonghuasun-agent` 和新版 `fqgate-agent`。卸载旧插件不会删除 FQGate 主程序或共享配置。

## FQGate 主程序

本机未安装 FQGate 时，Codex 应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

## 安装与配置

1. 按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`；本机已有兼容版本时直接复用。
2. 在仓库根目录运行 `Build-Distribution.ps1`，在 Codex 的 Plugins 页面安装生成的 `fqgate-agent-codex-0.3.0.zip`。
3. 新建任务并发送“配置 FQGate”。自动发现失败时，只需提供 `fqgate.exe` 或 `FQGate.app/Contents/MacOS/fqgate` 的路径。
4. 确认检查结果中的 `mcpReachable=true` 且 `toolCount` 大于零。

Codex 插件的安装方式见 [OpenAI 官方插件说明](https://learn.chatgpt.com/docs/plugins)。

## 使用边界

可以查询行情、K 线、Level-2、账户、资产、持仓、委托和成交。持续 WebSocket/SSE 订阅不是一次性 MCP 工具，应使用 FQGate 原生流接口。

真实资金写工具默认隐藏。只有用户自行开启 FQGate 的交易写开关并逐笔确认后才能调用；超时或结果未知时禁止自动重试。

FQGate 数据可能由用户选择的 Codex 服务处理，详情见[隐私政策](../../docs/legal/PRIVACY.md)。
