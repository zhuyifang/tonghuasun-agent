---
name: account-query
description: 使用本机 FQGate 查询行情登录状态、交易账户、资产、持仓、委托、成交、资金流水、交割单、银行或信用账户数据时使用。
---

# FQGate 账户查询

账户和资金数据只能来自当前 AI 客户端加载的 `fqgate` MCP。工具失败时不得使用估算、网页数据或旧对话内容替代。

## 查询顺序

1. 用 `fqgate_market_market_health` 检查行情登录状态。
2. 查询交易数据前必须取得有效的 `sessionId`。已有会话时调用 `fqgate_trade_trading_accounts`，再让用户明确选择 `accountId` 和 `tradingMode`。
3. 根据用户需求调用 `fqgate_trade_assets`、`fqgate_trade_positions`、`fqgate_trade_orders`、`fqgate_trade_trades`、`fqgate_trade_fund_flows` 或 `fqgate_trade_settlements`。
4. 银证与信用账户查询分别使用 `fqgate_trade_bank_accounts`、`fqgate_trade_bank_transfers`、`fqgate_trade_collateral_securities` 和 `fqgate_trade_collateral_transfer_flows`。

所有账户查询都必须沿用同一会话返回的 `sessionId`、`accountId` 和 `tradingMode`，不能根据账号显示文本自行拼接标识。

## 登录与敏感信息

- 行情快捷登录可以在用户明确要求后调用 `fqgate_market_cached_login`；扫码登录只在用户在场时使用，并把二维码与状态交给用户处理。
- 不要求用户把行情密码、资金账号、交易密码或短信验证码发送到聊天中。
- `fqgate_trade_login` 需要敏感参数。只有用户明确选择在当前 AI 服务中传递这些内容并理解其可能由模型服务处理时才能调用；否则请用户改用其信任的本机调用方式。
- 只展示完成问题所需的最少账户字段，不在无关输出中回显密码、完整账号或会话标识。
