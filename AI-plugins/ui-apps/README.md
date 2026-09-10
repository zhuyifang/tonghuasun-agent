# FQGate 插件界面项目

这是跨 AI 工具共用的界面项目。开发入口左侧列出组件名称，点击后可在右侧直接预览组件。

## 本地预览

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:18792` 即可查看开发入口。

## AI 工具内嵌组件

插件界面使用 MCP Apps 标准与支持该标准的 AI 工具通信。页面入口、标题、版本和接口绑定统一维护在 `mcp-apps/apps.json`。新增页面后只改这一份配置，构建、开发同步和正式发布都会自动读取它。

执行以下命令可生成供 FQGate 返回的独立界面资源和开发清单：

```powershell
npm run build:mcp-apps
```

产物位于 `dist/mcp-apps/`，包括 `manifest.json` 和清单列出的所有自包含 HTML。当前页面包括：

- `login.html`：行情登录。
- `candle.html`：个股行情。
- `information.html`：市场快讯、个股资讯和公告。
- `market-quotes.html`：多股行情预留入口。
- `order-flow.html`：L2 逐笔委托预留入口。

每个文件都已包含自身所需的脚本和样式，可由 FQGate 直接作为 `ui://fqgate/*.html` 资源返回。开发预览外壳不会进入这些文件。`manifest.json` 同时记录文件大小和 SHA-256，FQGate 可在加载前校验页面是否完整。

## 开发发布

```powershell
npm run dev:publish
```

命令首次运行会检查类型、构建全部页面，并发布到 `FQGate/target/debug/mcp-apps/`；之后监听 `src/` 和 `mcp-apps/`，修改后自动重新构建、校验并发布。可通过 `FQGATE_DEV_MCP_APPS_DIR` 指定其他开发目录。

也可以在公开仓库根目录执行 `npm run dev:publish`。

## 正式发布

正式发布会生成稳定通道指针、版本清单、页面和签名：

```powershell
npm run release:mcp-apps -- --signing-key-file D:\安全目录\mcp-apps-private.pem
```

也可通过 `FQGATE_MCP_APPS_ED25519_PRIVATE_KEY` 提供 PEM 私钥。未提供 Ed25519 私钥时命令必须失败，不会生成未签名的正式包。私钥不得放进项目目录或提交到仓库。完整格式见 [MCP Apps 发布规范](../../fqgate/mcp-apps/发布规范.md)。

登录、个股行情和资讯的普通数据请求通过 MCP 工具完成。多股行情与逐笔委托的实时推送仍需验证 AI 工具对本机 WebSocket 的安全支持；验证完成前不应把这两个入口标记为已在对应 AI 工具中可用。

## 目录说明

- `src/components/`：不同 AI 工具共用的界面组件。
- `src/adapters/local-api/`：FQGate 本机接口适配。
- `src/adapters/mcp-app/`：MCP Apps 标准通信和工具调用适配。
- `src/adapters/vendors/`：不同 AI 工具的接入适配。
- `src/mcp-apps/`：独立资源入口，只挂载公共组件，不维护另一份界面。
- `src/shared/`：公共类型和约定。

界面使用组件默认样式；支持统一尺寸的组件由根配置统一设为 `small`。

所有组件共用顶部状态栏，左侧展示免费数据源与开源仓库入口；右侧按组件类型展示实时连接状态或刷新按钮。实时组件断开后每 3 秒自动重连，重连期间使用不改变页面尺寸的全组件加载层；不可见满 10 秒后暂停订阅，恢复可见时自动连接。

当前组件均直接连接本机 FQGate，不提供模拟数据：

- 行情登录：支持 App 扫码和短信验证码登录。
- 个股行情 K 线：展示真实历史 K 线和当前行情。
- 资讯：展示市场快讯、个股资讯和公告，提供来源、摘要和原文入口。
- 多股行情：支持批量快照、单连接实时推送、真实日内走势、行情排序和大列表虚拟滚动。
- L2 - 逐笔委托：展示 Level-2 逐笔委托与撤单；没有 Level-2 权限时自动回退到普通实时行情。面板不可见满 10 秒后断开实时订阅，恢复可见时自动连接。

接口不可用时，组件只显示明确的真实错误，不生成占位行情。

## 维护约定

`src/components/` 是唯一界面源码。任何 AI 工具适配层都只能处理通信、宿主能力和入口挂载，不能复制组件模板或另建专用布局。组件布局发生变化后，重新执行 `npm run build:mcp-apps` 即可更新全部入口。

执行以下命令可检查首屏工具结果不会重复请求，并验证五个资源均为完整的自包含文件：

```powershell
npm run test:mcp-apps
```
