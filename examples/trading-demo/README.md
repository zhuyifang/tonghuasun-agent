# FQGate 交易接口演示

这个页面用于查看 FQGate 返回的账户、资产、持仓和交易记录，也可以核对委托等操作的请求与返回结果。页面只连接本机 FQGate，不提供模拟数据。

## 启动

先启动 FQGate，再执行：

```powershell
cd examples\trading-demo
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/>。

## 验证

```powershell
npm test
npm run build
```

## 使用提醒

- 页面展示的数据以证券公司最终记录为准。
- 委托、撤单、转账和划转可能影响真实账户与资金，提交前请仔细核对账户、证券代码、价格、数量和金额。
- 请求结果无法确认时，请先查询对应记录，不要重复提交。
