# 在 ZCode 中使用 FQGate

## 卸载旧版 `tonghuasun-agent`

如果 ZCode 已经安装旧版 `tonghuasun-agent`（旧显示名“同花顺 Agent”），请先完成以下操作：

1. 打开“设置 → 插件”，从顶部的“已安装”列表进入“同花顺 Agent”详情页。
2. 选择卸载，确认旧插件已从已安装列表中移除。
3. 如果以前手动添加过名为 `tonghuasun-agent` 的市场源，点击搜索框上方的齿轮，在“市场源”中将它移除。
4. 新建任务，确认旧插件的技能和 MCP 入口已经消失。

不要同时启用旧版 `tonghuasun-agent` 和新版 `fqgate-agent`。卸载旧插件不会删除 FQGate 主程序或共享配置。

界面入口见 [ZCode 官方插件文档](https://zcode.z.ai/cn/docs/plugin)。

## FQGate 主程序

FQGate 主程序从 [FQGate 官方下载页](https://github.com/zhuyifang/fqgate-releases/releases/tag/fqgate-v0.1.0)获取。AI 安装时，先读取 [FQGate 稳定版清单](https://raw.githubusercontent.com/zhuyifang/fqgate-releases/main/releases/stable.json)，按当前系统选择文件并核对大小和 SHA-256。直接下载地址为 `https://github.com/zhuyifang/fqgate-releases/releases/download/fqgate-v<version>/<fileName>`。

安装完成后，为 FQGate 创建一个桌面快捷方式，方便以后启动。安装结束前，确认 FQGate 已经启动、名为 `fqgate` 的连接已经成功，并且能够读取工具列表或完成健康检查。

Windows 用户可以在仓库根目录运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\runtime\install-fqgate.ps1`；使用已经解压的插件安装包时，运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-fqgate.ps1`。命令会完成正式版下载、校验、固定目录安装、快捷方式创建、启动和连接检查。

1. 按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`；本机已有兼容版本时直接复用。
2. 在仓库根目录运行 `Build-Distribution.ps1`。
3. 解压 `artifacts/fqgate-agent-zcode-marketplace-0.3.0.zip`，在 ZCode 的插件市场中添加该本地市场。
4. 安装并启用“同花顺免费开源AI插件FQGate”，调用“同花顺免费实时数据代理”检查连接，然后在“设置 → MCP”中确认 `fqgate` 已连接。

自动发现失败时提供 FQGate 可执行文件路径。插件只连接本机 `/mcp`，不配置公网、局域网或反向代理地址。

交易写工具默认隐藏，开启后仍须逐笔确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
