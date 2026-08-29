# 同花顺 Python SDK

该 SDK 连接用户本机 `happ.exe` 内运行的同花顺服务。接口是否可用取决于同花顺
登录状态、账户权限和本机服务配置。

## 安装

在插件安装目录的 `sdk/python` 下执行：

```powershell
python -m pip install ".[realtime,pandas]"
```

## 查询数据

```python
from tonghuasun_codex import Client

ths = Client.discover()

kline = ths.candles("601727.SH", period=7, adjustment=1, limit=500)  # 0=不复权，1=前复权，2=后复权
ticks = ths.ticks("601727.SH", limit=10_000)
history = ths.trends("600519.SH", trade_date="2026-08-27")
orders = ths.level2("601727.SH", mode="orders", limit=10_000)
```

所有查询方法返回插件 API 的 `data` 原始对象，不会把底层字段压缩成自然语言摘要。需要完整响应信封时使用：

```python
response = ths.request(
    "POST",
    "/api/v2/quotes/snapshot",
    {
        "market": 1,
        "codes": ["601727.SH"],
        "fields": ["latest", "transaction_volume", "transaction_amount"],
    },
    unwrap=False,
)
```

## 实时数据

```python
import asyncio
from tonghuasun_codex import RealtimeClient

async def main():
    client = RealtimeClient.discover()
    async for event in client.stream(
        ["601727.SH"],
        kind="level2_trade",
        fields=["price", "volume", "tradeTime", "side"],
    ):
        print(event)

asyncio.run(main())
```

SDK 中的 `create_subscription`、`poll_subscription` 和 `cancel_subscription` 指实时数据订阅，
不是会员、套餐或付费订阅。

插件只负责返回实时订阅数据；如需保存、计算或转发，请在自己的程序中处理。
