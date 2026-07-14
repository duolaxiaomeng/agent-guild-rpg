const { chromium } = require("/Users/alex/Downloads/game-system-two/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(12000);
  
  const dir = path.resolve(__dirname, "../../artifacts/screenshots/world");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: dir + "/office-lobby.png" });
  console.log("Lobby done");
  
  const tabs = await page.getByRole("tab").all();
  console.log("Found " + tabs.length + " tabs");
  
  if (tabs.length >= 4) {
    await tabs[1].click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: dir + "/office-workstations.png" });
    console.log("Workstations done");
    
    await tabs[2].click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: dir + "/office-collab.png" });
    console.log("Collab room done");
    
    await tabs[3].click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: dir + "/office-review.png" });
    console.log("Review station done");
  }
  
  await browser.close();
  console.log("All done!");
}

main().catch(e => { console.error(e.message); process.exit(1); });
