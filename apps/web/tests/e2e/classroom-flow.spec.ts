import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect.poll(async () => {
    const sessionCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "agent-guild-session-token"
    );
    return sessionCookie?.value ?? "";
  }).not.toBe("");
}

test("teacher advances a classroom and an assistant resolves student help", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await login(page, "teacher@academy.test", "teacher-pass-123");
  await page.goto("/teacher");
  const start = page.getByRole("button", { name: "开始" });
  if (await start.isEnabled()) {
    await start.click();
  } else {
    await expect(page.getByText("课堂进行中")).toBeVisible();
  }
  await expect(
    page
      .getByRole("region", { name: "课堂指挥台" })
      .getByText(/^(讲解|个人实践|互测|提交)$/)
  ).toBeVisible({ timeout: 20_000 });

  const student = await browser.newPage();
  await login(student, "lin@academy.test", "student-pass-123");
  await student.goto("/");
  await expect(
    student.getByRole("region", { name: "学生课堂状态" }).getByText(/^(讲解|个人实践|互测|提交)$/)
  ).toBeVisible({ timeout: 20_000 });
  const helpMessage = `课堂 E2E 求助 ${Date.now()}`;
  await student.getByRole("button", { name: "举手求助" }).click();
  await student.getByLabel("问题描述").fill(helpMessage);
  await student.getByRole("button", { name: "提交求助" }).click();

  const assistant = await browser.newPage();
  await login(assistant, "kai@academy.test", "student-pass-789");
  await assistant.goto("/teacher");
  const helpItem = assistant.getByRole("listitem").filter({ hasText: helpMessage });
  await expect(helpItem).toBeVisible();
  await helpItem.getByRole("button", { name: "认领" }).click();
  await helpItem.getByLabel(/处理备注-/).fill("已协助完成课堂任务");
  await helpItem.getByRole("button", { name: "解决" }).click();
  await expect(assistant.getByText("求助已解决。")).toBeVisible();
  await expect(student.getByText(/已解决|已处理/)).toBeVisible({ timeout: 20_000 });

  await assistant.close();
  await student.close();
});
