const pw = require(
  "/Users/alex/Downloads/game-system-two/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright"
);

const BASE = "http://localhost:3000";
const OUT = "/Users/alex/Downloads/game-system-two/docs/screenshots";

async function waitForReady(page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000);
}

async function loginAs(browser, email, password) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log("  navigating to login...");
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  console.log("  filling credentials...");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  console.log("  waiting for redirect...");
  await page.waitForURL(function (url) { return !url.toString().includes("/login"); }, {
    timeout: 15000,
  });
  await waitForReady(page);
  console.log("  logged in, current url: " + page.url());

  return { context: context, page: page };
}

async function main() {
  console.log("Launching browser...");
  const browser = await pw.chromium.launch({ headless: true });
  var taken = [];

  // Student screenshots
  console.log("Logging in as student...");
  var student = await loginAs(browser, "lin@academy.test", "student-pass-123");

  // 1. login page (unauthenticated)
  console.log("Taking 01-login.png...");
  var loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  var loginPage = await loginCtx.newPage();
  await loginPage.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await loginPage.waitForTimeout(1500);
  await loginPage.screenshot({ path: OUT + "/01-login.png" });
  taken.push(OUT + "/01-login.png");
  console.log("  done 01-login.png");
  await loginCtx.close();

  // 2. home (student)
  console.log("Taking 02-home.png...");
  await student.page.screenshot({ path: OUT + "/02-home.png" });
  taken.push(OUT + "/02-home.png");
  console.log("  done 02-home.png");

  // 3. chat (fullPage)
  console.log("Taking 03-chat.png...");
  await student.page.goto(BASE + "/chat", { waitUntil: "networkidle", timeout: 30000 });
  await waitForReady(student.page);
  await student.page.screenshot({ path: OUT + "/03-chat.png", fullPage: true });
  taken.push(OUT + "/03-chat.png");
  console.log("  done 03-chat.png");

  // 4. guilds (fullPage)
  console.log("Taking 04-guilds.png...");
  await student.page.goto(BASE + "/guilds", { waitUntil: "networkidle", timeout: 30000 });
  await waitForReady(student.page);
  await student.page.screenshot({ path: OUT + "/04-guilds.png", fullPage: true });
  taken.push(OUT + "/04-guilds.png");
  console.log("  done 04-guilds.png");

  await student.context.close();

  // Teacher screenshots
  console.log("Logging in as teacher...");
  var teacher = await loginAs(browser, "teacher@academy.test", "teacher-pass-123");

  // 5. teacher dashboard (fullPage)
  console.log("Taking 05-teacher-dashboard.png...");
  await teacher.page.screenshot({ path: OUT + "/05-teacher-dashboard.png", fullPage: true });
  taken.push(OUT + "/05-teacher-dashboard.png");
  console.log("  done 05-teacher-dashboard.png");

  await teacher.context.close();
  await browser.close();

  console.log("\nAll screenshots saved to:");
  taken.forEach(function (p) { console.log("  " + p); });
}

main().catch(function (err) {
  console.error("Screenshot script failed:", err.message);
  process.exit(1);
});
