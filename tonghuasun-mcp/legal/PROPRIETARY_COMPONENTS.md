# 闭源组件边界

本仓库公开 Agent 入口、MCP 适配层、界面、配置器和 Python SDK。用于连接本机同花顺客户端的 C# 插件源码暂时不公开。

公开仓库和发行包可以包含下列编译文件，方便用户直接安装：

- `ThsPlugin.Abstractions.dll`
- `ThsPlugin.Adapters.Hevo.dll`
- `ThsPlugin.Application.dll`
- `ThsPlugin.Contracts.dll`
- `ThsPlugin.Plugin.dll`
- `ThsPlugin.Plugin.deps.json`

这些编译文件不因与公开源码一起分发而获得 AGPL 授权，适用
`NATIVE_COMPONENT_LICENSE.md`。仓库不会公开相应的 C# 源码、项目文件、调试符号、
私有研究资料、签名密钥或本机运行凭据。

只使用公开源码构建时，不会重新生成上述闭源组件；制作完整安装包需要使用项目提供的
已编译文件。
