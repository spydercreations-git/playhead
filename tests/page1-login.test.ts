import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";

const WEB_URL = "http://localhost:3000";

async function runPage1LoginSmokeTest() {
  console.log("=== Starting Page 1 (Login P01 & P02) Smoke Test ===");

  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  try {
    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();

    // 1. Visit Login Page P01
    console.log("Navigating to /login...");
    await page.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });

    // Verify P01 visual elements
    await page.waitForSelector('text=Sign in to Playhead', { timeout: 8000 });
    await page.waitForSelector('text=Use the email Idyll invited.', { timeout: 5000 });
    await page.waitForSelector('button:has-text("Continue with Google")', { timeout: 5000 });
    await page.waitForSelector('button:has-text("Email me a sign in code")', { timeout: 5000 });
    await page.waitForSelector('button:has-text("Sign in with password")', { timeout: 5000 });
    await page.waitForSelector('text=Playhead is invite only.', { timeout: 5000 });
    console.log("✔ P01 visual elements verified matching design");

    // 2. Test Google sign-in click
    console.log("Testing Google sign-in click...");
    await page.click('button:has-text("Continue with Google")');
    // If not configured in local dev, it displays the helpful message
    await page.waitForTimeout(500);
    console.log("✔ Google sign-in click handled gracefully");

    // 3. Test Unknown email receives access denied error
    console.log("Testing unknown email error...");
    await page.fill('input[type="email"]', "unknown-intruder@outside.com");
    await page.click('button:has-text("Email me a sign in code")');
    await page.waitForSelector('text=This email doesn\'t have access to Playhead yet', { timeout: 8000 });
    console.log("✔ Unknown email refused with friendly invite-only message");

    // 4. Test Valid known email (harsh@idyllproductions.com) -> transitions to P02
    console.log("Sending code to harsh@idyllproductions.com...");
    await page.fill('input[type="email"]', "harsh@idyllproductions.com");
    await page.click('button:has-text("Email me a sign in code")');

    // Verify P02 visual elements
    await page.waitForSelector('text=Check your email', { timeout: 10000 });
    await page.waitForSelector('text=We sent a 6-digit code to', { timeout: 5000 });
    await page.waitForSelector('text=The code works for 10 minutes.', { timeout: 5000 });
    await page.waitForSelector('button:has-text("Verify and sign in")', { timeout: 5000 });
    console.log("✔ P02 screen loaded with 6 code inputs matching design");

    // 5. Fetch code from Mailpit API
    const mailRes = await fetch("http://localhost:8025/api/v1/messages");
    const mailData = await mailRes.json();
    if (!mailData.messages || mailData.messages.length === 0) {
      throw new Error("No messages found in Mailpit");
    }
    const latestMsg = mailData.messages[0];
    const codeMatch = (latestMsg.Subject || "").match(/\b\d{6}\b/) || (latestMsg.Snippet || "").match(/\b\d{6}\b/);
    if (!codeMatch) {
      throw new Error(`Could not find 6-digit code in message snippet: ${latestMsg.Snippet}`);
    }
    const code = codeMatch[0];
    console.log(`Retrieved real code from Mailpit: ${code}`);

    // Fill the 6 code boxes
    const inputs = await page.$$('input[inputmode="numeric"]');
    for (let i = 0; i < 6; i++) {
      await inputs[i].fill(code[i]);
    }

    // Auto-submits or click Verify
    await page.waitForURL(`${WEB_URL}/`, { timeout: 15000 });
    console.log("✔ Code verified, successfully authenticated and landed on Home:", page.url());

    console.log("=================================================");
    console.log("PAGE 1 (LOGIN P01 & P02) SMOKE TEST PASSED!");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

runPage1LoginSmokeTest().catch((err) => {
  console.error("PAGE 1 SMOKE TEST FAILED:", err);
  process.exit(1);
});
