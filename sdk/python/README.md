# FQGate Python SDK

该 SDK 只依赖 FQGate 公开的本机 HTTP 和 WebSocket 接口，不读取私有源码，也不使用旧版 `TonghuasunCodex` 配置或访问令牌。

## 安装

```powershell
python -m pip install .
```

需要实时流时安装可选依赖：

```powershell
python -m pip install ".[realtime]"
```

## HTTP 示例

```python
from fqgate_client import Client

client = Client.discover()
print(client.health())
print(client.search("贵州茅台"))
print(client.market_data([{"market": "USHA", "code": "600519"}]))
print(client.klines("USHA", "600519", count=30, interval="day", adjust="forward"))
```

未知或新增接口可以直接使用公开路径：

```python
document = client.request("GET", "/openapi.json")
result = client.request("POST", "/v1/market/history/intraday", {
    "market": "USHA",
    "code": "600519",
})
```

完整参数与返回字段以运行中的 <http://127.0.0.1:17281/openapi.json> 为准。

## WebSocket 示例

```python
import asyncio
from fqgate_client import RealtimeClient

async def main():
    client = RealtimeClient.discover()
    async for message in client.subscribe(kind="quote", market="USHA", code="600519"):
        print(message)

asyncio.run(main())
```

SDK 不会把结果上传给项目维护者。云端程序如何处理返回数据由调用方负责。
