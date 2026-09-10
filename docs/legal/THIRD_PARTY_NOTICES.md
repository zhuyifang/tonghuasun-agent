# 第三方组件声明

公开 Agent 启动器与配置器只使用 Node.js 标准库，没有运行时 npm 依赖。可选 Python SDK 使用 Python 标准库；WebSocket 功能的可选依赖及许可证以 `sdk/python/pyproject.toml` 为准。

FQGate 是独立发行组件，其 Rust、原生 SDK 和其他第三方依赖必须在 FQGate 发行包中提供对应声明。本仓库不得用旧 Agent 组件的许可证清单替代 FQGate 自己的发行审计结果。

Node.js、Python、各 AI 客户端、同花顺客户端及其依赖分别适用各自许可和服务条款。
