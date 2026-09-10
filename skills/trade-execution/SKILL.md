---
name: trade-execution
description: 用户明确要求通过 FQGate 下单、撤单、申购新股、银证转账或担保品划转时使用；用于真实资金相关操作的核对与确认。
---

# FQGate 交易执行

FQGate 默认隐藏真实资金写工具。只有用户自行以 `--enable-mcp-trading-writes` 启动 FQGate 后，这些工具才会出现；工具出现不等于用户授权任何一笔操作。

## 强制确认

调用任何写工具前，必须在同一对话中向用户展示将要提交的完整关键参数，并取得针对该笔操作的明确确认：

- 下单 `fqgate_trade_place_order`：`accountId`、登录会话、`businessType`、`securityCode`、价格、数量和唯一的 `idempotencyKey`；
- 撤单 `fqgate_trade_cancel`：`sessionId`、`accountId`、`tradingMode`、目标委托的合同编号、市场代码、股东账户、信用撤单所需原始字段及 `clientRequestId`；
- 新股申购 `fqgate_trade_subscribe_ipo`：会话、账户、交易模式、申购代码、市场代码、股东账户、发行价格、数量及 `clientRequestId`；
- 银证转账 `fqgate_trade_transfer_bank`：会话、账户、银行、币种、方向、金额、实际认证要求及 `clientRequestId`；
- 担保品划转 `fqgate_trade_transfer_collateral`：会话、信用账户、证券、方向、数量及 `clientRequestId`。

确认之后不得改变任何已展示参数。一个确认只适用于一笔确定操作，不能复用于后续交易、批量交易或参数变化后的请求。

## 结果未知与防重

- 下单使用唯一的 `idempotencyKey`；其余写操作使用唯一的 `clientRequestId`。任何唯一操作编号都不得复用到另一笔业务。
- 超时、连接中断或结果未知时禁止自动重试。先查询委托、转账或划转记录，仍无法确认时让用户在券商正式渠道核对。
- “已受理”不等于成交、到账、配号或最终成功，必须按对应记录查询结果描述。
- 不执行用户没有明确要求的批量下单、自动追单、自动撤单或无人值守交易。
