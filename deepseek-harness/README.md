# 在 DeepSeek Harness 中使用同花顺

## 安装

在仓库根目录运行 `Build-Distribution.ps1` 生成 DeepSeek Harness 安装包，
然后执行：

```powershell
dsh plugin --profile web add <安装包路径>
dsh plugin --profile web exec tonghuasun-agent configure --json
dsh web
```

配置器会引导你选择同花顺安装目录。配置完成后重启同花顺，再重新启动
DeepSeek Harness。

## 开始使用

可以直接询问证券行情、K 线、账户持仓或实时盯盘信息。交易工具默认关闭；
启用后，下单、撤单和改单仍需用户确认。

行情和账户数据来自你电脑上的同花顺客户端，本项目不会把这些数据上传给项目维护者。DeepSeek Harness 是否把工具结果交给云端模型处理，取决于你使用的服务和设置，详见[隐私政策](../tonghuasun-mcp/legal/PRIVACY.md)。

本项目不是同花顺官方产品。
