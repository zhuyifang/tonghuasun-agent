# 在豆包中使用 FQGate

豆包需要同时启用“同花顺免费开源AI插件FQGate”技能和名为“FQGate”的本机 HTTP 连接器。

## 卸载旧版 `tonghuasun-agent`

如果豆包已经安装旧版“同花顺 Agent”，请先在旧版解压目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -Uninstall
```

然后打开豆包的“技能 · 连接器 · 伙伴”，删除旧的“同花顺 Agent”连接器，并新建工作任务。找不到旧版解压目录时，不要手动删除豆包用户目录；新版安装程序会识别并移除由旧版安装程序管理的技能，但旧连接器仍需在豆包中手动删除。

不要同时选中旧版“同花顺 Agent”和新版“同花顺免费开源AI插件FQGate”。以上操作不会删除 FQGate 主程序或共享配置。

## FQGate 主程序

本机未安装 FQGate 时，应从 [Gitee FQGate 发行页](https://gitee.com/qicuo/tonghuasun-agent/releases/tag/fqgate-v0.1.0)下载主程序；Gitee 不可用时使用 [GitHub FQGate 发行页](https://github.com/zhuyifang/tonghuasun-agent/releases/tag/fqgate-v0.1.0)。版本、文件名、大小和 SHA-256 必须以 [FQGate 稳定发行清单](https://gitee.com/qicuo/tonghuasun-agent/raw/main/fqgate/releases/stable.json)为准。主包直链为 `https://gitee.com/qicuo/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`，备用直链为 `https://github.com/zhuyifang/tonghuasun-agent/releases/download/fqgate-v<version>/<fileName>`；不要让用户自行寻找或猜测下载地址。

## 安装

1. 按上面的正式路径下载、校验并启动兼容的 FQGate `0.1.x`；本机已有兼容版本时直接复用。
2. 解压豆包安装包，把目录添加到豆包工作任务并运行：

   ```powershell
   .\setup.ps1 -FQGatePath "<fqgate.exe 路径>"
   ```

3. 在豆包中新建 HTTP 连接器：

   | 项目 | 内容 |
   | --- | --- |
   | 名称 | `FQGate` |
   | 地址 | `http://127.0.0.1:17281/mcp?textCompatibility=true` |
   | 请求头 | 不填写 |

4. 新建工作任务，同时选中“同花顺免费开源AI插件FQGate”技能和连接器，再查询行情验证。

FQGate V2 的本机 MCP 无需设置访问令牌或自定义请求头。持续订阅需使用原生 WebSocket/SSE。

卸载豆包技能可运行 `.\setup.ps1 -Uninstall`；这不会删除共享 FQGate 配置或程序。详情见[隐私政策](../../docs/legal/PRIVACY.md)。
