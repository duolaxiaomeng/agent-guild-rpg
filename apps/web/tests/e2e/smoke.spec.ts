import { expect, test } from "@playwright/test";

test("home page shows world shell and teacher page shows review queue", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.getByText("主城区")).toBeVisible();

  await page.goto("http://localhost:3000/teacher");
  await expect(page.getByText("老师工作台")).toBeVisible();
});
