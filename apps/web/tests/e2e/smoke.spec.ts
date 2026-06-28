import { expect, test } from "@playwright/test";

test("home page shows world shell and teacher page shows review queue", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "主城区" })).toBeVisible();
  await expect(
    page.getByText("实时教学 API 暂不可达，主城区已降级为空态展示。")
  ).toBeVisible();

  await page.goto("/teacher");
  await expect(page.getByRole("heading", { name: "老师工作台" })).toBeVisible();
  await expect(
    page.getByText("评审与关卡数据暂不可达，当前显示安全空态。")
  ).toBeVisible();
});
