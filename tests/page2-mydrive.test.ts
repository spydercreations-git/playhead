import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";
import fs from "fs";
import path from "path";

const WEB_URL = "http://localhost:3000";

async function loginAsHarsh(context: BrowserContext) {
  const res = await fetch("http://localhost:8080/api/v1/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "harsh@idyllproductions.com" }),
  });
  const data = await res.json();
  const cookiesList = (typeof res.headers.getSetCookie === "function")
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie") || ""];

  let sessionVal = "";
  let csrfVal = data.csrf_token || "";

  for (const c of cookiesList) {
    const sMatch = c.match(/playhead_session=([^;]+)/);
    if (sMatch) sessionVal = sMatch[1];
    const cMatch = c.match(/playhead_csrf=([^;]+)/);
    if (cMatch) csrfVal = cMatch[1];
  }

  console.log("Parsed sessionVal:", sessionVal ? "FOUND" : "MISSING", "csrfVal:", csrfVal ? "FOUND" : "MISSING");

  await context.addCookies([
    {
      name: "playhead_session",
      value: sessionVal,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "playhead_csrf",
      value: csrfVal,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}

async function runPage2MyDriveSmokeTest() {
  console.log("=== Starting Page 2 (My Drive P06 & P07) Smoke Test ===");

  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  try {
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });

    // 1. Authenticate
    console.log("Authenticating as harsh@idyllproductions.com...");
    await loginAsHarsh(context);

    const page: Page = await context.newPage();


    // 2. Navigate to /my-drive
    console.log("Navigating to /my-drive (P06)...");
    await page.goto(`${WEB_URL}/my-drive`, { waitUntil: "networkidle" });
    console.log("Arrived at:", page.url());
    const content = await page.content();
    console.log("HTML snippet:", content.substring(0, 500));

    // Verify P06 Page Elements
    await page.waitForSelector('h1:has-text("My Drive")', { timeout: 8000 });


    await page.waitForSelector('text=Private to you. Move or copy anything into a project when it\'s ready.', { timeout: 5000 });
    await page.waitForSelector('text=Only you can see My Drive', { timeout: 5000 });
    await page.waitForSelector('button:has-text("New folder")', { timeout: 5000 });
    await page.waitForSelector('button:has-text("Upload")', { timeout: 5000 });
    await page.waitForSelector('input[placeholder="Search My Drive"]', { timeout: 5000 });
    console.log("✔ P06 headers and controls verified");

    // Verify default folders exist (Videos, Images, Documents, Music)
    await page.waitForSelector('text=Videos', { timeout: 8000 });
    await page.waitForSelector('text=Images', { timeout: 5000 });
    await page.waitForSelector('text=Documents', { timeout: 5000 });
    await page.waitForSelector('text=Music', { timeout: 5000 });
    console.log("✔ Auto-seeded default folders verified (Videos, Images, Documents, Music)");

    // Save screenshot of P06 Grid View
    const screenshotsDir = path.join(__dirname, "../screenshots");
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, "P06_My_Drive_Grid.png") });
    console.log("✔ Captured P06_My_Drive_Grid.png screenshot");

    // 3. Test View Mode Toggle (Grid -> List)
    console.log("Toggling to List View...");
    await page.click('button[title="List view"]');
    await page.waitForSelector('table', { timeout: 5000 });
    await page.waitForSelector('th:has-text("Name")', { timeout: 5000 });
    await page.waitForSelector('th:has-text("Size")', { timeout: 5000 });
    console.log("✔ P07 table view rendered properly");

    // 4. Test New Folder Modal
    console.log("Creating a custom folder 'Client Pitches 2026'...");
    await page.click('button:has-text("New folder")');
    await page.waitForSelector('h3:has-text("Create new folder")', { timeout: 5000 });
    await page.fill('input[placeholder="Folder name"]', "Client Pitches 2026");
    await page.click('button:has-text("Create")');
    await page.waitForSelector('text=Client Pitches 2026', { timeout: 8000 });
    console.log("✔ Custom folder created and displayed in My Drive");

    // 5. Navigate into a folder (P07 folder contents)
    console.log("Navigating into 'Videos' folder...");
    await page.click('button[title="Grid view"]');
    await page.waitForTimeout(300);
    // Double click or open folder card
    await page.dblclick('text=Videos');
    await page.waitForSelector('span:has-text("Videos")', { timeout: 8000 });
    await page.waitForSelector('button:has-text("My Drive")', { timeout: 5000 });
    console.log("✔ P07 breadcrumb navigation verified: My Drive > Videos");

    // Save screenshot of P07 Folder View
    await page.screenshot({ path: path.join(screenshotsDir, "P07_My_Drive_Folder_List.png") });
    console.log("✔ Captured P07_My_Drive_Folder_List.png screenshot");

    // 6. Navigate back via breadcrumb
    console.log("Navigating back to root via breadcrumb...");
    await page.click('button:has-text("My Drive")');
    await page.waitForSelector('h1:has-text("My Drive")', { timeout: 5000 });
    console.log("✔ Returned to root My Drive");

    console.log("=================================================");
    console.log("PAGE 2 (MY DRIVE P06 & P07) SMOKE TEST PASSED!");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

runPage2MyDriveSmokeTest().catch((err) => {
  console.error("PAGE 2 SMOKE TEST FAILED:", err);
  process.exit(1);
});
