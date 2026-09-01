---
name: tonghuasun-agent
description: 查询当前电脑同花顺远航版中的实时行情、K 线、Level2、短线精灵、自选股、问财、账户资产、持仓、委托和成交数据时使用。
---

# 同花顺 Agent

使用当前 AI 客户端加载的 `tonghuasun-agent` MCP 或“同花顺 Agent”连接器，读取用户当前电脑上的同花顺远航版数据。

## 数据边界

- 只有工具实际调用成功后，才能说明数据来自用户当前电脑上的同花顺远航版。
- 工具不可用或调用失败时，直接说明本机插件或同花顺远航版需要检查，不要改用模型知识、网页搜索或其他金融数据源冒充本机结果。
- 返回数据的权限和时效以用户当前登录的同花顺远航版为准。
- 明确区分接口原始字段与 AI 计算、归类或分析的内容。接口没有返回的结论不得写成原始数据。

## 工具选择

- 股票当前表现：`ths_stock_brief`
- K 线图：`ths_render_candle_chart`
- 原始 K 线、分时或 Tick 累计行情：`ths_price_series`
- Level2 逐笔委托：`ths_order_flow`，`mode=orders`
- Level2 逐笔成交：`ths_order_flow`，`mode=trades`
- Level2 撤单：`ths_order_flow`，`mode=cancels`
- 委托档位：`ths_order_flow`，`mode=levels`
- 持续查看实时挂单、撤单和当前价：`ths_order_flow_watch`
- 短线精灵异动：`ths_short_term_events`
- 自选股：`ths_watchlist_self`
- 问财：`ths_wencai_query`
- 个股资讯、公告、研报或市场快讯：`ths_news_query`
- 完整实时行情字段或多股比较：`ths_quote_snapshot`
- 账户资产、持仓和持仓盈亏：`ths_portfolio_positions`
- 指定证券的当日委托：先调用 `ths_trade_accounts` 获取当前账户引用，再调用 `ths_trade_orders`

直接把股票名称或代码交给上述工具。只有工具返回真实歧义时，才调用 `ths_security_search`。

用户只要求简单行情或安装后的连通性验证时，只调用 `ths_stock_brief`；成功返回后直接给出结果，不要再调用完整快照、REST API 或接口文档做重复验证。

## Level2 口径

- 用户说逐笔委托、挂单明细、委托队列时，使用 `ths_order_flow` 的 `orders` 模式。
- 用户说逐笔成交、成交明细时，使用 `ths_order_flow` 的 `trades` 模式。
- 用户说撤单明细时，使用 `ths_order_flow` 的 `cancels` 模式。
- 调用 `ths_order_flow` 时必须传 `limit`：用户指定多少条就传多少；用户没有指定时传 20。不要先请求大批量数据再下载或二次解析。
- 不要用分钟行情、资金流汇总、五档快照或 `ths_price_series` 的 Tick 累计行情替代 Level2 逐笔明细。

## 原始字段

- 字段定义以本机接口文档 `http://127.0.0.1:17180/docs` 为准。遇到不熟悉的原始字段时先查接口说明，不要根据字段名或数值猜测含义。
- 展示买卖方向时优先使用插件整理后的 `side`。`volclass` 是原始位标记，不是委托量级，不得据此生成“小单”“中单”“大单”或集合竞价等分类。
- 如果用户要求自行划分大中小单，必须明确计算口径和阈值，并注明这是 AI 基于原始数量或金额计算的分类，不是接口原始字段。

## 交易边界

名称以 `_api_only` 结尾的交易工具只用于告知用户对应能力仅支持本机 API 调用，不能通过 MCP 执行下单、撤单或改单。不要把能力说明当成已经完成的交易。
