import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";
import {
  assertCommonComponentFrame,
  assertConnectionMask,
  assertRealtimeStatus
} from "./component-frame.qa.mjs";

const targetUrl = "http://127.0.0.1:18792/?component=order-flow";
const outputDirectory = resolve("..", "..", ".tmp", "ui-apps-qa");

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await selectPreviewComponent(page, "L2 - 逐笔委托");
  await page.locator(".order-flow-watch-panel").waitFor({ state: "visible" });

  await page.getByText("航天机电 600151", { exact: true }).first().waitFor();
  const level2Enabled = await waitForDataMode(page);
  if (level2Enabled) {
    const hasRows = await assertLevel2RowsIfPresent(page);
    if (hasRows) await assertVirtualScrolling(page);
  }
  else await assertPermissionLoginDialog(page);
  await assertPreviewFrame(page);
  await assertSmallControls(page);
  await assertStreamTableFontSize(page);
  await assertCommonComponentFrame(page, ".order-flow-watch-panel");
  await assertRealtimeStatus(page, ["已连接"]);
  const activeWithPanel = await waitForActiveSubscriptions(page, (count) => count >= 1, "实时订阅没有建立");

  await page.screenshot({
    path: resolve(outputDirectory, "desktop-order-flow-basic.jpg"),
    type: "jpeg",
    quality: 85,
    fullPage: true
  });
  await page.setViewportSize({ width: 520, height: 900 });
  await assertFilterLayout(page);
  await assertCompactTables(page);
  await assertStreamTableFontSize(page);
  await page.screenshot({
    path: resolve(outputDirectory, "narrow-order-flow-basic.jpg"),
    type: "jpeg",
    quality: 85,
    fullPage: true
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await selectPreviewComponent(page, "登录");
  await page.waitForTimeout(2_000);
  const activeBeforeGracePeriod = await activeSubscriptionCount(page);
  if (activeBeforeGracePeriod < activeWithPanel) {
    throw new Error("面板刚隐藏就断开了 WebSocket，没有保留 10 秒宽限期");
  }
  const activeAfterHidden = await waitForActiveSubscriptions(
    page,
    (count) => count < activeWithPanel,
    "面板隐藏 10 秒后实时订阅数没有减少",
    10_000
  );

  await selectPreviewComponent(page, "L2 - 逐笔委托");
  await waitForActiveSubscriptions(page, (count) => count > activeAfterHidden, "面板恢复可见后没有自动重连");

  const failurePage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const healthRequestTimes = [];
  await failurePage.route("**/v1/market/health", (route) => {
    healthRequestTimes.push(Date.now());
    if (healthRequestTimes.length === 1) return route.fulfill({ status: 503, body: "" });
    return route.continue();
  });
  await failurePage.goto(targetUrl, { waitUntil: "networkidle" });
  await selectPreviewComponent(failurePage, "L2 - 逐笔委托");
  await failurePage.getByText("重连中", { exact: true }).waitFor({ timeout: 10_000 });
  await assertConnectionMask(failurePage);
  await failurePage.screenshot({
    path: resolve(outputDirectory, "desktop-order-flow-reconnecting.jpg"),
    type: "jpeg",
    quality: 85
  });
  await waitFor(() => healthRequestTimes.length >= 2, 7_000, "连接失败后没有自动重试");
  const retryDelay = healthRequestTimes[1] - healthRequestTimes[0];
  if (retryDelay < 2_700 || retryDelay > 4_000) {
    throw new Error(`实时数据重连间隔不符合 3 秒约定：delay=${retryDelay}`);
  }
  if (await failurePage.getByRole("button", { name: "重新连接" }).count()) {
    throw new Error("实时组件仍保留手动重连按钮");
  }
  await failurePage.getByText("正在重连数据服务", { exact: true }).waitFor({
    state: "hidden",
    timeout: 15_000
  });
  await assertRealtimeStatus(failurePage, ["已连接"]);

  process.stdout.write(`L2 - 逐笔委托组件验收通过，截图目录：${outputDirectory}\n`);
} finally {
  await browser.close();
}

async function selectPreviewComponent(page, name) {
  const item = page.locator(".preview-sidebar .arco-menu-item").filter({ hasText: name });
  await item.click();
}

async function activeSubscriptionCount(page) {
  const response = await page.request.get("http://127.0.0.1:17281/v1/market/health");
  const payload = await response.json();
  return Number(payload?.data?.active_subscriptions ?? 0);
}

async function waitForActiveSubscriptions(page, predicate, failureMessage, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = await activeSubscriptionCount(page);
    if (predicate(count)) return count;
    await page.waitForTimeout(150);
  }
  const panelState = await page.evaluate(() => ({
    connection: document.querySelector(".component-connection-status")?.textContent?.trim() ?? "",
    loading: Boolean(document.querySelector(".component-connection-mask")),
    selected: document.querySelector(".security-select")?.textContent?.trim() ?? ""
  }));
  throw new Error(
    `${failureMessage}：active_subscriptions=${await activeSubscriptionCount(page)}, panel=${JSON.stringify(panelState)}`
  );
}

async function assertSmallControls(page) {
  const height = await page.locator(".security-select").evaluate(
    (element) => element.getBoundingClientRect().height
  );
  if (height !== 28) throw new Error(`证券选择框没有使用 small 尺寸：height=${height}`);
}

async function assertPermissionLoginDialog(page) {
  await page.getByText("当前账号没有L2权限，无法获取数据", { exact: true }).first().waitFor();
  const loginButtons = page.getByRole("button", { name: "登录同花顺" });
  if (await loginButtons.count() !== 2) {
    throw new Error(`L2 无权限提示没有为两张表提供登录入口：count=${await loginButtons.count()}`);
  }
  await loginButtons.first().click();
  const modal = page.locator(".order-flow-login-modal");
  await modal.waitFor({ state: "visible" });
  await modal.locator(".login-panel").waitFor({ state: "visible" });
  const result = await modal.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    viewportWidth: window.innerWidth,
    title: element.querySelector(".arco-modal-title")?.textContent?.trim() ?? "",
    embeddedCardHeader: Boolean(element.querySelector(".login-panel > .arco-card-header"))
  }));
  if (
    result.width > 420
    || result.width > result.viewportWidth - 32
    || result.title !== "登录同花顺"
    || result.embeddedCardHeader
  ) {
    throw new Error(`登录弹窗尺寸或嵌入模式不符合要求：${JSON.stringify(result)}`);
  }
  await page.screenshot({
    path: resolve(outputDirectory, "desktop-order-flow-login-dialog.jpg"),
    type: "jpeg",
    quality: 85
  });
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });
}

async function waitForDataMode(page) {
  await page.locator(".order-flow-card").getByText(/^(Level-2|普通行情)$/).waitFor({ timeout: 10_000 });
  return page.locator(".order-flow-card").getByText("Level-2", { exact: true }).isVisible();
}

async function assertLevel2RowsIfPresent(page) {
  const title = page.getByText(/挂单 \d+\/\d+ 笔/).first();
  await title.waitFor({ timeout: 10_000 });
  const match = (await title.textContent())?.match(/挂单 \d+\/(\d+) 笔/);
  const total = Number(match?.[1] ?? 0);

  // 实盘逐笔数据在休市、订阅刚建立或当日无记录时允许为空，验收不得依赖伪造行情。
  if (total === 0) return false;

  const amounts = await page.locator(".stream-card:first-child .arco-table-tr")
    .evaluateAll((rows) => rows.slice(1, 6).map((row) => (
      row.querySelector(".arco-table-td:last-child")?.textContent?.trim() ?? ""
    )));
  if (amounts.length === 0 || amounts.some((amount) => !amount || amount === "0" || amount === "—")) {
    throw new Error(`缺失的委托金额没有按价格和委托量计算：${JSON.stringify(amounts)}`);
  }
  return true;
}

async function assertVirtualScrolling(page) {
  const virtualBody = page.locator(".stream-card:first-child .arco-table-body.arco-virtual-list");
  await virtualBody.waitFor({ state: "visible", timeout: 10_000 });
  const result = await virtualBody.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    overflowY: getComputedStyle(element).overflowY,
    renderedRows: element.querySelectorAll(".arco-table-tr").length
  }));
  if (Math.abs(result.height - 360) > 1 || result.overflowY !== "auto" || result.renderedRows === 0) {
    throw new Error(`逐笔委托表格没有启用 360px 虚拟滚动：${JSON.stringify(result)}`);
  }
}

async function assertFilterLayout(page) {
  const result = await page.locator(".filter-row").evaluate((row) => {
    const rowRect = row.getBoundingClientRect();
    const controls = [...row.querySelectorAll(".filter-control")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    return { height: rowRect.height, left: rowRect.left, right: rowRect.right, controls };
  });
  if (
    result.controls.length !== 2
    || result.height > 28.5
    || Math.abs(result.controls[0].top - result.controls[1].top) > 1
    || result.controls.some((control) => control.left < result.left - 1 || control.right > result.right + 1)
  ) {
    throw new Error(`大单筛选条件在窄宽度下发生换行或溢出：${JSON.stringify(result)}`);
  }
}

async function assertCompactTables(page) {
  const result = await page.locator(".stream-card .arco-table-container").evaluateAll((containers) => (
    containers.map((container) => {
      const containerRect = container.getBoundingClientRect();
      const lastHeader = container.querySelector(".arco-table-th:last-child")?.getBoundingClientRect();
      return {
        classes: container.className,
        containerRight: containerRect.right,
        lastHeaderRight: lastHeader?.right ?? Number.POSITIVE_INFINITY,
        shadow: getComputedStyle(container, "::after").boxShadow
      };
    })
  ));
  if (
    result.length !== 2
    || result.some(({ classes, containerRight, lastHeaderRight, shadow }) => (
      classes.includes("arco-table-scroll-position-left")
      || classes.includes("arco-table-scroll-position-right")
      || lastHeaderRight > containerRight + 1
      || shadow !== "none"
    ))
  ) {
    throw new Error(`窄宽度表格仍有横向裁切或边缘渐变：${JSON.stringify(result)}`);
  }
}

async function assertStreamTableFontSize(page) {
  const fontSizes = await page.locator(
    ".stream-card .arco-card-header-title, .stream-card .arco-table-th .arco-table-cell, .stream-card .arco-table-td .arco-table-cell, .stream-card .arco-empty-description"
  ).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).fontSize));
  if (fontSizes.length === 0 || fontSizes.some((fontSize) => fontSize !== "12px")) {
    throw new Error(`挂单和撤单标题及表格未统一使用 12px 字体：${JSON.stringify(fontSizes)}`);
  }
}

async function assertPreviewFrame(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector(".preview-canvas");
    const panel = document.querySelector(".order-flow-watch-panel");
    if (!(canvas instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;
    const canvasStyle = getComputedStyle(canvas);
    const availableWidth = canvas.clientWidth
      - Number.parseFloat(canvasStyle.paddingLeft)
      - Number.parseFloat(canvasStyle.paddingRight);
    return {
      borderWidth: Number.parseFloat(canvasStyle.borderTopWidth),
      availableWidth,
      panelWidth: panel.getBoundingClientRect().width
    };
  });
  if (!result || result.borderWidth !== 10 || Math.abs(result.availableWidth - result.panelWidth) > 1) {
    throw new Error(`预览区边框或组件宽度不符合要求：${JSON.stringify(result)}`);
  }
}

async function waitFor(predicate, timeout, message) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!predicate()) throw new Error(message);
}
