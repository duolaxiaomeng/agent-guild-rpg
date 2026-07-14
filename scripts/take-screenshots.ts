// Run: npx tsx scripts/take-screenshots.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pw = require(
  "/Users/alex/Downloads/game-system-two/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright"
);

const BASE = "http://localhost:3000";
const OUT = "/Users/alex/Downloads/game-system-two/docs/screenshots";

/** @param {import('playwright').Page} page */
async function waitForReady(page: any) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await page.waitForTimeout(2000);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {string} email
 * @param {string} password
 */
async function loginAs(browser: any, email: string, password: string) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1000);

  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  await page.waitForURL((url: URL) => !url.toString().includes("/login"), {
    timeout: 15_000,
  });
  await waitForReady(page);

  return { context, page };
}

async function main() {
  const browser = await pw.chromium.launch({ headless: true });
  const taken: string[] = [];

  // ── Student screenshots ──────────────────────────────────────────────────
  const student = await loginAs(browser, "lin@academy.test", "student-pass-123");

  // 1. login page (unauthenticated)
  {
    const loginCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(`${BASE}/login`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await loginPage.waitForTimeout(1500);
    const path = `${OUT}/01-login.png`;
    await loginPage.screenshot({ path });
    taken.push(path);
    console.log("✓ 01-login.png");
    await loginCtx.close();
  }

  // 2. home (student)
  {
    const path = `${OUT}/02-home.png`;
    await student.page.screenshot({ path });
    taken.push(path);
    console.log("✓ 02-home.png");
  }

  // 3. chat (fullPage)
  {
    await student.page.goto(`${BASE}/chat`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await waitForReady(student.page);
    const path = `${OUT}/03-chat.png`;
    await student.page.screenshot({ path, fullPage: true });
    taken.push(path);
    console.log("✓ 03-chat.png (fullPage)");
  }

  // 4. guilds (fullPage)
  {
    await student.page.goto(`${BASE}/guilds`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await waitForReady(student.page);
    const path = `${OUT}/04-guilds.png`;
    await student.page.screenshot({ path, fullPage: true });
    taken.push(path);
    console.log("✓ 04-guilds.png (fullPage)");
  }

  await student.context.close();

  // ── Teacher screenshots ───────────────────────────────────────────────────
  const teacher = await loginAs(browser, "teacher@academy.test", "teacher-pass-123");

  // 5. teacher dashboard (fullPage)
  {
    const path = `${OUT}/05-teacher-dashboard.png`;
    await teacher.page.screenshot({ path, fullPage: true });
    taken.push(path);
    console.log("✓ 05-teacher-dashboard.png (fullPage)");
  }

  await teacher.context.close();
  await browser.close();

  console.log("\nAll screenshots saved to:");
  taken.forEach((p) => console.log("  " + p));
}

main().catch((err: Error) => {
  console.error("Screenshot script failed:", err.message);
  process.exit(1);
});
