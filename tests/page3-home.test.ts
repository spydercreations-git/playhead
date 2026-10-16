import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";
import * as fs from "fs";
import * as path from "path";

const API_URL = "http://localhost:8080/api/v1";
const WEB_URL = "http://localhost:3000";

async function loginAsHarsh(context: BrowserContext) {
  console.log("Authenticating as harsh@idyllproductions.com...");
  const res = await fetch("http://localhost:8080/api/v1/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "harsh@idyllproductions.com" }),
  });

  if (!res.ok) {
    throw new Error(`Dev login failed with status ${res.status}`);
  }

  const data = await res.json();
  const cookiesList = typeof res.headers.getSetCookie === "function"
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

async function runPage3HomeSmokeTest() {
  console.log("=== Starting Page 3 (Home P03, P04, P05) Smoke Test ===");

  if (!fs.existsSync("screenshots")) {
    fs.mkdirSync("screenshots", { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  try {
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await loginAsHarsh(context);

    const page: Page = await context.newPage();

    // 1. Visit Home (P03 / P05)
    console.log("Navigating to Home /...");
    await page.goto(`${WEB_URL}/`, { waitUntil: "networkidle" });
    console.log("Current page URL:", page.url());
    const pageHtml = await page.content();
    console.log("Current page content snippet:", pageHtml.substring(0, 800));

    // Verify Greeting banner
    await page.waitForSelector('h1', { timeout: 10000 });
    const h1Text = await page.textContent('h1');
    console.log("Found h1 text:", h1Text);

    // Verify 4 Default My Drive Folders
    await page.waitForSelector('text=Videos', { timeout: 5000 });
    await page.waitForSelector('text=Images', { timeout: 5000 });
    await page.waitForSelector('text=Documents', { timeout: 5000 });
    await page.waitForSelector('text=Music', { timeout: 5000 });
    console.log("✔ Real My Drive 4 default folders displayed");

    // Verify Dropzone (P05)
    await page.waitForSelector('text=Drop files anywhere to upload', { timeout: 5000 });
    await page.waitForSelector('text=They go to My Drive. Only you can see them.', { timeout: 5000 });
    await page.waitForSelector('button:has-text("Choose files")', { timeout: 5000 });
    console.log("✔ P05 upload dropzone verified");

    // Capture P03 / P05 Home screenshot
    await page.screenshot({ path: "screenshots/P03_Home_Real_Data.png" });
    console.log("✔ Captured screenshots/P03_Home_Real_Data.png");

    // 2. Test P04: New Menu
    console.log("Testing P04 + New Menu...");
    const newBtn = await page.waitForSelector('button:has-text("New")', { timeout: 5000 });
    await newBtn.click();

    await page.waitForSelector('text=Create in My Drive', { timeout: 5000 });
    await page.waitForSelector('text=New folder', { timeout: 5000 });
    await page.waitForSelector('text=New document', { timeout: 5000 });
    await page.waitForSelector('text=New spreadsheet', { timeout: 5000 });
    await page.waitForSelector('text=Upload files', { timeout: 5000 });
    console.log("✔ P04 New dropdown menu opened and verified");

    await page.screenshot({ path: "screenshots/P04_Home_New_Menu.png" });
    console.log("✔ Captured screenshots/P04_Home_New_Menu.png");

    // Close menu by clicking outside
    await page.click('body', { position: { x: 500, y: 100 } });
    await page.waitForTimeout(300);

    // 3. Test Direct Upload from Home into My Drive
    console.log("Testing direct file upload from Home...");
    const testFilePath = path.join(__dirname, "sample-home-upload.png");
    fs.writeFileSync(testFilePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("Hidden file input not found on Home");
    }

    await fileInput.setInputFiles(testFilePath);

    // Wait for upload toast / success notification
    await page.waitForSelector('text=Uploaded "sample-home-upload.png" to My Drive', { timeout: 15000 });
    console.log("✔ Direct upload to My Drive completed successfully");

    // Clean up temporary test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    // Verify Recent items section is rendered with the newly uploaded item
    await page.waitForSelector('text=Recent folders', { timeout: 5000 });
    await page.waitForSelector('text=sample-home-upload.png', { timeout: 5000 });
    console.log("✔ Recent items updated with uploaded file");

    await page.screenshot({ path: "screenshots/P05_Home_First_Time_Uploaded.png" });
    console.log("✔ Captured screenshots/P05_Home_First_Time_Uploaded.png");

    console.log("=================================================");
    console.log("PAGE 3 (HOME P03, P04, P05) SMOKE TEST PASSED!");
    console.log("=================================================");
  } catch (err) {
    console.error("PAGE 3 HOME SMOKE TEST FAILED:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runPage3HomeSmokeTest();
