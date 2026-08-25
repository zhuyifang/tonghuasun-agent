# 同花顺 Agent

### 这是一个独立开发项目，不是同花顺官方产品

在 Codex、Claude Code、WorkBuddy、ZCode、OpenClaw 或 DeepSeek Harness 中，直接查询你电脑上的同花顺行情、K 线、持仓、委托和成交数据。

所有功能均免费开放，不设订阅、会员、套餐、试用额度或付费解锁。

## 项目地址

- 国内仓库：[Gitee](https://gitee.com/qicuo/tonghuasun-agent)
- GitHub 仓库：[GitHub](https://github.com/zhuyifang/tonghuasun-agent)

## 一句话安装

在你正在使用的 AI 助手中直接发送
> 安装并配置同花顺插件，项目地址：<https://gitee.com/qicuo/tonghuasun-agent.git>

- 按提示选择同花顺安装目录，完成后重启同花顺；如果当前任务没有显示新工具，新建一个任务即可，只有刷新异常时才需要重启 AI 助手；
- 如果自动安装失败，再前往 [GitHub 最新版下载页](https://github.com/zhuyifang/tonghuasun-agent/releases/latest) 或 [Gitee 发行版下载页](https://gitee.com/qicuo/tonghuasun-agent/releases) 下载对应的安装包手动安装。

## 选择你使用的 Agent

- [在 Codex 中安装](./codex/README.md)
- [在 Claude Code 中安装](./claude-code/README.md)
- [在 WorkBuddy 中安装](./workbuddy/README.md)
- [在 ZCode 中安装](./zcode/README.md)
- [在 OpenClaw 中安装](./openclaw/README.md)
- [在 DeepSeek Harness 中安装](./deepseek-harness/README.md)

## 你可以直接这样问

- “工业富联今天的盘口怎么样？”
- “查看贵州茅台最近一个月的日 K 线。”
- “汇总我的账户资产和当前持仓。”
- “显示今天的委托、成交和撤单记录。”
- “持续观察这只股票的逐笔成交变化。”

## 使用前准备

- 使用 Windows 10 或 Windows 11。
- 电脑上已安装同花顺远航版，下载地址：https://download.10jqka.com.cn/index/download/id/275/
- 当前开发与验证环境为同花顺远航版 11.4.1.3；配置器会识别本机客户端和版本信息，其他版本如遇兼容问题请提交 Issue。
- 核心插件目前尚未使用 Windows 代码签名，发行包提供 SHA-256 清单供你核对文件；如果不能接受闭源且未签名的组件，请不要安装或开启交易功能。
- 查询实时行情、账户或交易数据时，请保持同花顺已登录并正常运行。
- 首次安装或升级后，请重启同花顺；如果 Agent 没有显示新工具，也请重启 Agent 或新建一个任务。

## 文档与交流

- 本机接口文档：[127.0.0.1:17180/docs](http://127.0.0.1:17180/docs)
- 抖音群：[点击加入](https://v.douyin.com/group/387998743372)

<p align="center">
  <a href="https://v.douyin.com/group/387998743372">
    <img src="./assets/community/douyin-group-qr.png" alt="抖音群二维码" width="180">
  </a>
</p>

## 关于交易功能

交易工具默认关闭，只有你主动开启后才会出现；下单、撤单和改单前仍需你确认，插件不会自行发起交易。

## 数据与隐私

行情和账户数据由你电脑上的同花顺客户端提供，服务只监听本机地址；本机访问令牌不会写入公开仓库或安装包模板。

## 支持项目

<p align="center">
  <a href="./assets/support/support-banner.png">
    <img src="./assets/support/support-banner.png" alt="如果这个项目对你有帮助，欢迎打赏支持" width="100%">
  </a>
</p>

如果这个项目对你有帮助，欢迎打赏支持；打赏完全自愿，不影响任何功能、问题反馈或后续更新。

赞助者：<a href="https://v.douyin.com/N-xSLIPMP-M/"><img src="./assets/sponsors/im-kim.png" alt="I'm Kim" width="32" height="32"></a> [**I'm Kim**](https://v.douyin.com/N-xSLIPMP-M/)

## 项目说明

这是一个独立开发项目，不是同花顺官方产品；Agent 入口、配置器、传输桥和 SDK 依据 AGPL-3.0-only 开源，C# 开发的同花顺本机插件暂时闭源，许可证与隐私说明见 [`tonghuasun-mcp/legal`](./tonghuasun-mcp/legal/)。
