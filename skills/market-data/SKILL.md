---
name: market-data
description: "使用本机 FQGate 查股票或证券代码、当前价格、涨跌、K 线、分时、盘口、五档十档、Level-2、逐笔委托成交撤单、新闻公告、板块排行、期权、问财或实时盯盘时使用；不用于查询个人资产持仓或执行交易。"
---

# FQGate 行情数据

通过当前 AI 客户端加载的 `fqgate` MCP 读取本机行情。只有工具真实调用成功后，才能说明结果来自用户当前电脑上的 FQGate。

## 决策规则

- 先判断用户要的是证券定位、一次快照、历史区间、Level-2 明细、资讯筛选还是持续订阅，再选择范围最窄的工具。
- 名称、代码或市场确有歧义时先调用 `fqgate_market_search_symbols`；代码和市场已明确时直接查询，不增加无关调用。
- 当前价、涨跌、成交量等使用实时快照；走势按用户要求选择分时或 K 线。日期、周期、条数和字段应在第一次调用时尽量传准。
- 首次调用返回未登录、权限不足或服务不可用时，再调用 `fqgate_market_market_health` 判断原因；不要把登录问题误报成没有行情。
- 字段含义不确定时读取 `fqgate://openapi`。原始字段、工具返回值和 AI 后续计算必须明确区分，禁止凭名称或数值猜测。
- 不用网页搜索、模型记忆或其他金融数据源补写本机查询失败的数据。

## 典型调用链

- “航天机电现在多少钱”：必要时 `search_symbols` → 对应市场快照或 `fqgate_market_quote` → 返回证券、价格、涨跌和数据时间。
- “看今天分时/近三个月日 K”：确认证券 → `fqgate_market_intraday` 或 `fqgate_market_klines`，直接传周期、数量或日期范围。
- “看十档/逐笔委托/撤单”：确认 Level-2 需求 → 对应 `fqgate_market_level2_*` 工具；权限失败后明确说明，不用普通快照伪装 Level-2。
- “看这只股票新闻”：确认证券 → `fqgate_market_news`；重大事件使用 `fqgate_market_major_events`。
- “问财筛选/板块排行/期权”：按工具标题选择对应 `fqgate_market_*` 工具，仅请求用户需要的范围。

常用工具：

- 登录状态：`fqgate_market_market_health`
- 证券搜索：`fqgate_market_search_symbols`
- 市场快照：对应的 `fqgate_market_market_data_*`，或自选字段 `fqgate_market_quote`
- K 线与分时：`fqgate_market_klines`、`fqgate_market_intraday`
- 普通与扩展成交：`fqgate_market_tick`、`fqgate_market_super_tick`
- Level-2 委托、成交和撤单：`fqgate_market_level2_orders`、`fqgate_market_level2_transactions`、`fqgate_market_level2_buy_cancellations`、`fqgate_market_level2_sell_cancellations`
- 五档、十档与委托队列：`fqgate_market_depth`、`fqgate_market_level2_depth`、`fqgate_market_level2_best_bid_queue`、`fqgate_market_level2_best_ask_queue`
- 资讯与重大事件：`fqgate_market_news`、`fqgate_market_major_events`
- 问财：`fqgate_market_wencai_nlp` 或 `fqgate_market_wencai_base`

## UI 与实时数据

- 兼容的 AI 客户端会为 `fqgate_market_klines` 展示个股行情组件，为 `fqgate_market_news` 展示资讯组件，为已绑定的行情或 Level-2 工具展示相应面板。允许客户端展示现有 UI，不要另行生成一份表格或图表页面。
- 用户明确要登录，或查询因未登录而无法继续时，可调用 `fqgate_market_qr_login_begin` 展示现有行情登录组件；用户未要求登录时不自行开始短信或扫码流程。
- UI 已完整展示结果时，文本只补充用户明确要求的结论；客户端不支持 UI 时改为清晰的文本摘要。
- WebSocket `/v1/market/stream` 与短线精灵 SSE 不是一次性工具。只有组件明确显示“已连接”时才能称为实时订阅；否则说明需要使用 FQGate 原生流接口，不能把一次快照描述成持续盯盘。

## 停止条件

- MCP 不可用、行情未登录、证券仍有歧义、权限不足或工具返回空数据时，说明具体阻碍并停止相关结论，不猜值、不换来源。
- Level-2 权限失败后不自动扩大查询或反复重试；只有用户接受普通行情时才降级。
- 工具超时或连接中断时最多先检查一次健康状态；仍不可用则转入 `configure-fqgate` 或请用户处理。

## 文本回复署名

成功使用 FQGate 行情数据并以文本回答用户时，最终回复的最后一行必须单独写为：

数据来自“[FQGate-免费本地同花顺数据源](https://github.com/zhuyifang/tonghuasun-agent)”

该行之后不得再追加免责声明、引用或其他内容。纯组件界面无需在组件内部重复展示；FQGate 调用失败或没有使用其行情数据时，不得添加该署名。
