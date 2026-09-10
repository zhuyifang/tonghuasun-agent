# 在 Claude Code 中使用 FQGate

## 安装

V2 插件 `0.3.0` 尚未发布。仓库根目录的 Claude 插件市场目前仍指向已发布的旧版 `0.2.13`，因此不要使用旧市场命令验证 V2，否则安装到的不是本目录中的 FQGate 适配器。

开发验证时，先安装兼容的 FQGate `0.1.x`，在仓库根目录执行：

```powershell
node .\installer\runtime\configure-fqgate.mjs configure `
  --fqgate-path "F:\path\to\fqgate.exe" `
  --json
.\Build-Distribution.ps1
```

构建产物是 `artifacts/fqgate-agent-claude-code-0.3.0.zip`。该包用于本地开发导入和打包验证；正式安装命令会在 FQGate 下载地址、校验值和 Claude 市场条目一并发布后补充。导入后重新加载插件，并确认名为 `fqgate` 的 MCP 已连接。

## 使用边界

插件可以查询 FQGate 提供的行情、Level-2、账户和交易记录。持续订阅需使用 FQGate 原生 WebSocket/SSE，不把一次快照描述成持续盯盘。

交易写工具默认隐藏，开启后仍须逐笔核对并取得明确确认。详情见[隐私政策](../../docs/legal/PRIVACY.md)和[使用条款](../../docs/legal/TERMS.md)。
