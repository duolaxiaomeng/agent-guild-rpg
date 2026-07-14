import { expect, test } from "@playwright/test";

test("authenticated shell pages render their safe degraded states", async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addCookies([
    {
      name: "agent-guild-session-token",
      value: "e2e-session-token",
      url: "http://localhost:3100",
    },
  ]);

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "主城区" })).toBeVisible();

  const tablist = page.getByRole("tablist", { name: "世界区域导航" });
  const degraded = page.getByText("实时教学 API 暂不可达");
  const hasTabs = await tablist.isVisible().catch(() => false);
  const hasDegraded = await degraded.isVisible().catch(() => false);
  expect(hasTabs || hasDegraded).toBe(true);

  await expect(tablist).toBeVisible();
  const worldShell = page.locator("section[data-active-zone]");
  await expect(worldShell).toHaveAttribute("data-hud-safe-top", "56");
  await expect(worldShell).toHaveAttribute("data-hud-safe-bottom", "72");
  const canvas = page.locator("#pixel-world canvas");
  await expect(canvas).toBeVisible({ timeout: 120_000 });
  const canvasSize = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);

  for (const zone of [
    { name: "🏢 工作室大厅", id: "lobby" },
    { name: "🤝 协作室", id: "collab-room" },
    { name: "✅ 评审区", id: "review-station" },
  ]) {
    await page.getByRole("tab", { name: zone.name }).click();
    await expect(worldShell).toHaveAttribute("data-active-zone", zone.id);
    await expect(page.getByRole("tab", { name: zone.name })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(350);
  }

  const teacherPage = await context.newPage();
  await teacherPage.goto("/teacher", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(teacherPage.getByRole("heading", { name: "老师工作台" })).toBeVisible();
  const teacherDegraded = teacherPage.getByText("教学 API 暂不可达，请稍后刷新重试。");
  const teacherLoginPrompt = teacherPage.getByText("请先登录老师账号。");
  const teacherForbidden = teacherPage.getByText("当前账号无权进入老师工作台。");
  const hasTeacherSafeState =
    (await teacherDegraded.isVisible().catch(() => false)) ||
    (await teacherLoginPrompt.isVisible().catch(() => false)) ||
    (await teacherForbidden.isVisible().catch(() => false));

  expect(hasTeacherSafeState).toBe(true);
});
