---
name: account-query
description: "使用本机 FQGate 检查同花顺行情账号是否登录、打开扫码或短信登录、使用本机缓存登录，或查看交易账户、总资产、余额、可用资金、持仓盈亏、委托成交、资金流水、交割单、银行卡、银证记录、信用账户与担保品数据时使用；只读查询，不执行下单撤单或转账。"
---

# FQGate 账户查询

账户和资金数据只能来自当前 AI 客户端加载的 `fqgate` MCP。工具失败时不得用估算、网页数据或旧对话内容替代。

## 决策规则

- 先区分行情账户状态与券商交易账户数据。行情状态只调用 `fqgate_market_market_health`；这项检查不能证明交易会话有效。
- 查询交易数据时使用当前有效 `sessionId` 调用 `fqgate_trade_trading_accounts`，并沿用返回的 `accountId` 与 `tradingMode`。行情登录与交易会话相互独立，不为查询交易账户额外调用行情健康检查。
- 只有一个已认证账户且用户没有限制账户类型时可直接查询；存在多个普通或信用账户时，展示脱敏后的候选项并让用户选择。
- 资产、持仓、委托、成交等使用范围最窄的对应工具。用户指定日期时直接传日期范围，不先拉取大量历史记录再筛选。
- 所有后续调用沿用同一登录会话返回的三元组，不根据账号显示文本拼接 `sessionId`、`accountId` 或 `tradingMode`。
- 只展示回答问题所需的字段；完整账号、会话标识及其他无关敏感内容必须隐藏或脱敏。

## 典型调用链

- “我还有多少可用资金”：`fqgate_trade_trading_accounts` → 选择账户 → `fqgate_trade_assets`。
- “我持有哪些股票/盈亏多少”：账户确认 → `fqgate_trade_positions`，需要汇总时明确区分工具字段和 AI 计算。
- “今天是否成交/订单还在吗”：账户确认 → `fqgate_trade_orders` 和/或 `fqgate_trade_trades`，按合同编号或证券过滤。
- “查上月流水/交割单”：账户确认 → `fqgate_trade_fund_flows` 或 `fqgate_trade_settlements`，传完整开始与结束日期。
- “查银行卡/银证记录/担保品”：账户确认 → `fqgate_trade_bank_accounts`、`fqgate_trade_bank_transfers`、`fqgate_trade_collateral_securities` 或 `fqgate_trade_collateral_transfer_flows`。

## 登录与 UI

- 当前已有“同花顺行情登录”UI 只登录行情账户，不登录券商交易账户，也不能产生交易 `sessionId`。
- 行情快捷登录只在用户明确要求后调用 `fqgate_market_cached_login`；扫码登录可调用 `fqgate_market_qr_login_begin` 展示现有登录组件，并由在场用户扫码确认。
- 没有有效交易会话时，不要求用户把资金账号、交易密码或短信验证码发到聊天中。当前客户端若没有安全的交易登录 UI，应请用户在 FQGate 本机界面完成交易登录后再继续。
- `fqgate_trade_login` 没有配套交易登录 UI，且需要敏感参数。只有用户明确选择在当前 AI 服务中传递这些内容并理解其可能由模型服务处理时才能调用；否则引导用户在其信任的本机界面完成登录。
- 查询结果目前以结构化数据或文本展示；不要声称存在尚未提供的资产、持仓或交易登录面板。

## 停止条件与安全边界

- 缺少有效 `sessionId`、账户选择不明确或会话已失效时停止查询，等待用户登录或选择。
- 权限未开启、工具不存在、返回账户不匹配或查询范围被券商拒绝时，报告原始可理解原因，不改用其他账户重试。
- 用户从查询转为要求下单、撤单、转账或划转时，立即切换到 `trade-execution` 的逐笔确认流程；查询本身不构成交易授权。
- 不回显密码、验证码、完整资金账号或完整会话标识，不把账户数据写入文件或长期保存，除非用户另有明确请求和授权。
