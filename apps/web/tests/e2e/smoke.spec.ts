import { expect, test } from "@playwright/test";

test("home page shows world shell and teacher page shows review queue", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "主城区" })).toBeVisible();

  await page.goto("/teacher");
  await expect(page.getByRole("heading", { name: "老师工作台" })).toBeVisible();
});
