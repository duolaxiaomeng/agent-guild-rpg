const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require(path.resolve(__dirname, "../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright"));

const prototypeRoot = path.resolve(__dirname, "../prototypes/teacher-main-city-v3");
const screenshotRoot = path.resolve(__dirname, "../artifacts/screenshots/teacher-observer-v3");
const port = 4176;
const baseUrl = `http://127.0.0.1:${port}`;
const zones = [
  { id: "lobby", label: "工作室大厅", marker: "区域入口" },
  { id: "workstations", label: "工位区", marker: "最近心跳" },
  { id: "collab", label: "协作室", marker: "共享记忆" },
  { id: "review", label: "评审区", marker: "证据完整度" },
];
const forbiddenCopy = ["虚线", "路线编号", "PATH ROUTES", "AGENT BEHAVIOR"];

function waitForServer(url, timeoutMs = 8000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() - startedAt > timeoutMs) reject(new Error(`server did not start: ${url}`));
        else setTimeout(probe, 100);
      });
    };
    probe();
  });
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function assertNoRouteOverlay(page) {
  const copy = await page.locator("body").innerText();
  for (const token of forbiddenCopy) assert.equal(copy.includes(token), false, `forbidden route copy: ${token}`);
}

async function run() {
  fs.mkdirSync(screenshotRoot, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(port), "--directory", prototypeRoot], { stdio: "ignore" });
  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({ headless: true });
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto(baseUrl, { waitUntil: "networkidle" });

    for (const zone of zones) {
      await desktop.locator(`[data-zone="${zone.id}"]`).click();
      await assertNoHorizontalOverflow(desktop);
      assert.equal(await desktop.locator("#scene-name").textContent(), zone.label);
      assert.equal(await desktop.locator(`[data-zone-panel="${zone.id}"]`).isVisible(), true);
      const panelText = await desktop.locator("#observer-panel").innerText();
      assert.ok(panelText.includes(zone.marker), `${zone.id} missing marker: ${zone.marker}`);
      assert.ok(panelText.includes("READ ONLY"), `${zone.id} missing read-only boundary`);
      await assertNoRouteOverlay(desktop);
      await desktop.screenshot({ path: path.join(screenshotRoot, `${zone.id}.png`), fullPage: true });
      console.log(`${zone.id}: PASS`);
    }

    await desktop.locator('[data-zone="lobby"]').click();
    await desktop.locator('[data-student="Reception"]').click({ force: true });
    assert.equal(await desktop.locator('[data-person-profile="Reception"]').isVisible(), true);
    assert.ok((await desktop.locator("#observer-panel").innerText()).includes("Reception"));
    await desktop.locator('[data-action="back-zone"]').click();
    assert.equal(await desktop.locator('[data-zone-panel="lobby"]').isVisible(), true);
    await desktop.screenshot({ path: path.join(screenshotRoot, "lobby-reception.png"), fullPage: true });

    await desktop.locator('[data-zone="workstations"]').click();
    await desktop.locator('[data-student="Coder"]').click({ force: true });
    assert.equal(await desktop.locator('[data-person-profile="Coder"]').isVisible(), true);
    assert.ok((await desktop.locator("#observer-panel").innerText()).includes("Coder"));
    await desktop.locator('[data-action="back-zone"]').click();
    assert.equal(await desktop.locator('[data-zone-panel="workstations"]').isVisible(), true);
    await desktop.screenshot({ path: path.join(screenshotRoot, "workstations-coder.png"), fullPage: true });
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(baseUrl, { waitUntil: "networkidle" });
    for (const zone of zones) {
      await mobile.locator(`[data-zone="${zone.id}"]`).click();
      await assertNoHorizontalOverflow(mobile);
    }
    await mobile.close();
    console.log("teacher observer v3 loop: PASS");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(`teacher observer v3 loop: FAIL\n${error.stack || error.message}`);
  process.exitCode = 1;
});
