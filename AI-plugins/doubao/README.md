# 在豆包中使用 FQGate

豆包需要同时启用“同花顺免费开源AI插件FQGate”技能和名为“FQGate”的本机 HTTP 连接器。

## 安装

1. 安装并启动兼容的 FQGate `0.1.x`。
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
