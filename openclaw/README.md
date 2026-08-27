# 在 OpenClaw 中使用同花顺

安装同花顺 Agent 后，你可以在 OpenClaw 中查询行情和 K 线、查看账户持仓、读取盘口与逐笔成交，并在需要时使用实时盯盘。

所有功能均免费开放，不设订阅、会员、套餐、试用额度或付费解锁。

## 一句话安装

从[当前仓库的最新版下载页面](../../../releases/latest)下载并解压 OpenClaw 安装包，安装解压后的 `tonghuasun-agent` 文件夹，然后在 OpenClaw 中发送“配置同花顺插件”并按提示完成配置即可。

## 安装

1. 下载名为 `tonghuasun-agent-openclaw-<版本>.zip` 的安装包并解压。
2. 在 PowerShell 中进入解压目录，并确认当前目录下能看到 `tonghuasun-agent` 文件夹，然后执行：

   ```powershell
   openclaw plugins install .\tonghuasun-agent
   openclaw plugins enable tonghuasun-agent
   openclaw gateway restart
   ```

   OpenClaw 首次安装本地目录时可能要求确认文件来源；请核对安装包来自本项目后继续，非交互式安装可在安装命令末尾添加 `--force`。

3. 正常退出同花顺，然后在 OpenClaw 中发送“配置同花顺插件”。
4. 按提示选择同花顺安装目录，配置完成后重新启动同花顺。
5. 再次执行 `openclaw gateway restart`，并在 OpenClaw 中新建一个任务。

你可以使用下面的命令确认插件已经加载：

```powershell
openclaw plugins inspect tonghuasun-agent --runtime --json
```

## 开始使用

安装完成后，可以直接这样提问：

- “工业富联今天的盘口怎么样？”
- “查看贵州茅台最近 60 个交易日的日 K 线。”
- “汇总我的账户资产和当前持仓。”
- “持续观察 600519.SH 的逐笔成交变化。”

## 升级

1. 从[当前仓库的最新版下载页面](../../../releases/latest)获取新的 OpenClaw ZIP 安装包并解压。
2. 执行以下命令覆盖旧版本并重启 Gateway：

   ```powershell
   openclaw plugins install .\tonghuasun-agent --force
   openclaw gateway restart
   ```

3. 正常退出同花顺，在 OpenClaw 中发送“修复同花顺插件”，完成后重新启动同花顺并新建任务。

## 卸载

先正常退出同花顺，并在 OpenClaw 中发送“卸载同花顺插件”；本机映射清理完成后，再执行：

```powershell
openclaw plugins uninstall tonghuasun-agent --dry-run
openclaw plugins uninstall tonghuasun-agent
openclaw gateway restart
```

第一条命令只预览将要删除的内容，确认无误后再执行正式卸载。

## 遇到问题

如果 OpenClaw 没有显示同花顺工具，可以依次执行：

```powershell
openclaw plugins validate --json
openclaw plugins inspect tonghuasun-agent --runtime --json
openclaw plugins doctor --json
openclaw gateway restart
```

如果插件已经加载但无法读取数据，请确认同花顺已经登录并正常运行；仍无法连接时，在 OpenClaw 中发送“检查同花顺插件”。

更多 OpenClaw 插件命令见[官方插件文档](https://docs.openclaw.ai/cli/plugins)。

## 数据与安全

行情和账户数据来自你电脑上的同花顺客户端，本项目不会把这些数据上传给项目维护者。OpenClaw 是否把工具结果交给云端模型处理，取决于你使用的服务和设置，详见[隐私政策](../tonghuasun-mcp/legal/PRIVACY.md)。

本机接口只接受当前电脑的访问。交易工具默认关闭，只有你主动开启后才会出现，下单、撤单和改单前仍需你确认。

这是一个独立开发项目，不是同花顺官方产品。
