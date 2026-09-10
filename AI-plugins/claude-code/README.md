# 在 Claude Code 中使用 FQGate

## 卸载旧版 `tonghuasun-agent`

如果 Claude Code 已经安装旧版插件，请依次执行：

```text
/plugin uninstall tonghuasun-agent@tonghuasun-agent
/plugin marketplace remove tonghuasun-agent
/reload-plugins
```

如果第一条命令提示找不到默认范围中的插件，请运行 `/plugin`，进入“Installed”页，从实际安装范围中卸载 `tonghuasun-agent`，然后移除旧市场并重新加载。不要同时启用旧版 `tonghuasun-agent` 和新版 `fqgate-agent`；卸载旧插件不会删除 FQGate 主程序或共享配置。

命令说明见 [Claude Code 官方插件文档](https://code.claude.com/docs/en/discover-plugins)。

## FQGate 主程序

本机未安装 FQGate 时，Claude Code 应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

## 安装

先按上面的正式路径安装并启动兼容的 FQGate `0.1.x`，然后在 Claude Code 中依次执行：

```text
/plugin marketplace add zhuyifang/tonghuasun-agent
/plugin install fqgate-agent@tonghuasun-agent
/reload-plugins
```

重新加载后，新建任务并确认名为 `fqgate` 的 MCP 已连接。需要离线安装时，从 [0.3.0 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/v0.3.0)下载 `fqgate-agent-claude-code-0.3.0.zip`，核对发行清单中的 SHA-256 后再导入。

## 使用边界

插件可以查询 FQGate 提供的行情、Level-2、账户和交易记录。持续订阅需使用 FQGate 原生 WebSocket/SSE，不把一次快照描述成持续盯盘。

交易写工具默认隐藏，开启后仍须逐笔核对并取得明确确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)和[使用条款](../../docs/legal/TERMS.md)。
