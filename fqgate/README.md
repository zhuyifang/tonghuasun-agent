# FQGate 公开集成信息

本目录只记录 AI 插件所兼容的 FQGate 版本、公开发行地址和校验信息，不包含 FQGate 私有源码、调试符号、密钥或本机数据。

当前 V2 插件代码兼容 FQGate `0.1.x`，默认连接 `http://127.0.0.1:17281/mcp`。准确关系见 [compatibility.json](./compatibility.json)。

## 当前发行状态

`compatibility.json` 中的 `release.status` 目前是 `unpublished`，表示 FQGate `0.1.0` 的公开安装包地址和 SHA-256 尚未登记。因此，现阶段只能在开发机上通过 `--fqgate-path` 指定已经构建的 FQGate 可执行文件；不能把本目录描述成可供终端用户下载的正式版本。

正式发布时，应为 Windows x64、macOS arm64 和 macOS x64 分别登记以下信息：

- 发行文件名；
- 指向明确 FQGate 版本标签的下载地址，不能使用会漂移到其他组件的 `releases/latest`；
- 文件大小和 SHA-256；
- 目标平台的实机验收状态。

大型二进制文件只放在公开仓库 Release 中，不提交到 Git。FQGate 与 Agent 插件继续独立管理版本。

版本说明、稳定通道清单和自动更新的发布步骤见 [FQGate 发布与更新规范](./发布规范.md)。
