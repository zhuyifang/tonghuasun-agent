import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";
import { assertCommonComponentFrame } from "./component-frame.qa.mjs";

const targetUrl = "http://127.0.0.1:18792/?component=information";
const outputDirectory = resolve("..", "..", ".tmp", "ui-apps-qa");

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const requests = [];
  await page.route("**/v1/market/information/news", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length > 1) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    await route.continue();
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".information-panel").waitFor();
  await page.getByText("航天机电资讯", { exact: true }).waitFor();
  await page.locator(".information-item").first().waitFor({ timeout: 35_000 });
  assertInformationRequest(requests[0]);
  await assertSingleDisplayFormat(page);
  await assertFeedContent(page);
  await assertPreviewFrame(page);
  await assertViewportFit(page);
  await assertCommonComponentFrame(page, ".information-panel");

  const settledHeight = await elementHeight(page, ".component-frame");
  const refreshRequest = page.waitForRequest((request) => (
    request.url().includes("/v1/market/information/news")
    && request.postDataJSON()?.text_id === 14339
  ));
  await page.getByRole("button", { name: "刷新数据" }).click();
  await refreshRequest;
  await page.locator(".information-loading").waitFor({ state: "visible" });
  if (await elementHeight(page, ".component-frame") !== settledHeight) {
    throw new Error("资讯刷新时改变了组件高度。");
  }
  await page.locator(".information-loading").waitFor({ state: "hidden", timeout: 35_000 });
  assertInformationRequest(requests.at(-1));

  await page.screenshot({
    path: resolve(outputDirectory, "desktop-information.jpg"),
    type: "jpeg",
    quality: 88,
    fullPage: true
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(120);
  await assertSingleDisplayFormat(page);
  await assertPreviewFrame(page);
  await assertViewportFit(page);
  await assertCommonComponentFrame(page, ".information-panel");
  await page.screenshot({
    path: resolve(outputDirectory, "mobile-information.jpg"),
    type: "jpeg",
    quality: 88,
    fullPage: true
  });

  process.stdout.write(`资讯组件验收通过，截图目录：${outputDirectory}\n`);
} finally {
  await browser.close();
}

function assertInformationRequest(request) {
  const expected = {
    market: "USHA",
    code: "600151",
    text_id: 14339,
    last_text_time: 0,
    summary: true
  };
  if (JSON.stringify(request) !== JSON.stringify(expected)) {
    throw new Error(`资讯预览没有使用唯一的真实个股资讯查询：${JSON.stringify(request)}`);
  }
}

async function assertSingleDisplayFormat(page) {
  if (await page.locator(".category-control").count()) {
    throw new Error("通用资讯组件中仍存在查询类型切换栏。");
  }
  for (const label of ["市场快讯", "个股资讯", "公告"]) {
    if (await page.getByText(label, { exact: true }).count()) {
      throw new Error(`通用资讯组件中仍展示查询模式：${label}`);
    }
  }
  const title = await page.locator(".information-toolbar").textContent();
  if (title?.trim() !== "航天机电资讯") {
    throw new Error(`资讯标题没有由调用上下文提供：${title}`);
  }
}

async function assertFeedContent(page) {
  const result = await page.locator(".information-item").first().evaluate((element) => ({
    title: element.querySelector(".information-title")?.textContent?.trim() ?? "",
    source: element.querySelector(".information-source")?.textContent?.trim() ?? "",
    summary: element.querySelector(".information-summary")?.textContent?.trim() ?? "",
    time: element.querySelector("time")?.textContent?.trim() ?? "",
    href: element.querySelector(".information-link")?.getAttribute("href") ?? ""
  }));
  if (!result.title || !result.source || !result.summary || !result.time) {
    throw new Error(`真实资讯字段没有完整展示：${JSON.stringify(result)}`);
  }
  if (result.href && !/^https?:\/\//.test(result.href)) {
    throw new Error(`资讯原文地址不安全：${result.href}`);
  }
}

async function assertPreviewFrame(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector(".preview-canvas");
    const panel = document.querySelector(".information-panel");
    if (!(canvas instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;
    const canvasStyle = getComputedStyle(canvas);
    const availableWidth = canvas.clientWidth
      - Number.parseFloat(canvasStyle.paddingLeft)
      - Number.parseFloat(canvasStyle.paddingRight);
    return {
      borderWidth: Number.parseFloat(canvasStyle.borderTopWidth),
      padding: Number.parseFloat(canvasStyle.paddingTop),
      availableWidth,
      panelWidth: panel.getBoundingClientRect().width
    };
  });
  if (
    !result
    || result.borderWidth !== 10
    || result.padding !== 0
    || Math.abs(result.availableWidth - result.panelWidth) > 1
  ) {
    throw new Error(`资讯预览区或组件宽度不符合要求：${JSON.stringify(result)}`);
  }
}

async function assertViewportFit(page) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  if (result.scrollWidth > result.viewportWidth) {
    throw new Error(`资讯页面存在横向裁切：${JSON.stringify(result)}`);
  }
}

async function elementHeight(page, selector) {
  return page.locator(selector).evaluate((element) => element.getBoundingClientRect().height);
}
