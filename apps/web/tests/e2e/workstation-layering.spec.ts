import { expect, test } from "@playwright/test";

test("workstations render a non-empty layered desk scene", async ({ page, context }, testInfo) => {
  const renderDelay = Number(process.env.WORKSTATION_VISUAL_WAIT_MS ?? 4_000);
  test.setTimeout(renderDelay + 15_000);
  await context.addCookies([
    {
      name: "agent-guild-session-token",
      value: "e2e-session-token",
      url: "http://localhost:3100",
    },
  ]);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const tab = page.getByRole("tab", { name: "💻 工位区" });
  await expect(tab).toBeVisible();
  await tab.click();

  const shell = page.locator('section[data-active-zone="workstations"]');
  await expect(shell).toBeVisible();
  const canvas = page.locator("#pixel-world canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(renderDelay);
  const screenshot = await canvas.screenshot({
    path: testInfo.outputPath("workstations-layered.png"),
    animations: "disabled",
  });
  expect(screenshot.byteLength).toBeGreaterThan(100_000);
});
