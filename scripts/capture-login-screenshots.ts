import { chromium } from "../services/collab/node_modules/playwright-core";
import * as path from "path";

const WEB_URL = "http://localhost:3000";

async function capture() {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  try {
    // 1. Capture 1440x900 Login (P01)
    const context1440 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page1440 = await context1440.newPage();
    await page1440.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });
    await page1440.waitForSelector('text=Sign in to Playhead');
    await page1440.waitForTimeout(1000); // Wait for video and layout to settle

    await page1440.screenshot({
      path: path.resolve(process.cwd(), "screenshots/P01_Login_Option_B_1440.png"),
      fullPage: false,
    });
    console.log("Saved screenshots/P01_Login_Option_B_1440.png");

    // 2. Trigger Code screen (P02) at 1440x900
    await page1440.fill('input[type="email"]', "harsh@idyllproductions.com");
    await page1440.click('button:has-text("Email me a sign in code")');
    await page1440.waitForSelector('text=Check your email');
    await page1440.waitForTimeout(500);

    await page1440.screenshot({
      path: path.resolve(process.cwd(), "screenshots/P02_Login_Code_Option_B_1440.png"),
      fullPage: false,
    });
    console.log("Saved screenshots/P02_Login_Code_Option_B_1440.png");
    await context1440.close();

    // 3. Capture 375x812 Mobile Login
    const context375 = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
    });
    const page375 = await context375.newPage();
    await page375.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });
    await page375.waitForSelector('text=Sign in to Playhead');
    await page375.waitForTimeout(500);

    await page375.screenshot({
      path: path.resolve(process.cwd(), "screenshots/M01_Login_Option_B_375.png"),
      fullPage: false,
    });
    console.log("Saved screenshots/M01_Login_Option_B_375.png");
    await context375.close();

    console.log("All screenshots captured successfully!");
  } finally {
    await browser.close();
  }
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
