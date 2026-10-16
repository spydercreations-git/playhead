import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";

const WEB_URL = "http://localhost:3000";

async function runAuthSessionTest() {
  console.log("=== Starting Auth Session & Redirect Smoke Test ===");

  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  try {
    // 1. Signed-out context: zero cookies / tokens
    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();

    // Test 1: Open /projects while signed out -> must redirect to /login
    console.log("Checking /projects while signed out...");
    await page.goto(`${WEB_URL}/projects`);
    await page.waitForURL("**/login**", { timeout: 10000 });
    const projectsUrl = page.url();
    console.log("Current URL after /projects:", projectsUrl);
    if (!projectsUrl.includes("/login") || !projectsUrl.includes("redirect=%2Fprojects")) {
      throw new Error(`Expected /projects to redirect to /login?redirect=%2Fprojects, got: ${projectsUrl}`);
    }
    console.log("✔ /projects redirected to /login?redirect=%2Fprojects");

    // Test 2: Open /documents while signed out -> must redirect to /login
    console.log("Checking /documents while signed out...");
    await page.goto(`${WEB_URL}/documents`);
    await page.waitForURL("**/login**", { timeout: 10000 });
    const documentsUrl = page.url();
    console.log("Current URL after /documents:", documentsUrl);
    if (!documentsUrl.includes("/login") || !documentsUrl.includes("redirect=%2Fdocuments")) {
      throw new Error(`Expected /documents to redirect to /login?redirect=%2Fdocuments, got: ${documentsUrl}`);
    }
    console.log("✔ /documents redirected to /login?redirect=%2Fdocuments");

    // Test 3: Open / while signed out -> must redirect to /login
    console.log("Checking / while signed out...");
    await page.goto(`${WEB_URL}/`);
    await page.waitForURL("**/login**", { timeout: 10000 });
    const rootUrl = page.url();
    console.log("Current URL after /:", rootUrl);
    if (!rootUrl.includes("/login")) {
      throw new Error(`Expected / to redirect to /login, got: ${rootUrl}`);
    }
    console.log("✔ / redirected to /login");

    // Test 4: Sign in as Admin (harsh@idyllproductions.com)
    console.log("Signing in as harsh@idyllproductions.com...");
    await page.goto(`${WEB_URL}/login?redirect=%2Fprojects`, { waitUntil: "networkidle" });

    // Request email code
    await page.fill('input[type="email"]', "harsh@idyllproductions.com");
    await page.click('button:has-text("Email me a sign in code")');

    // Wait for 6-digit screen
    await page.waitForSelector('text=Check your email', { timeout: 10000 });

    // Fetch the 6-digit code from Mailpit API
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
    console.log(`Found sign-in code: ${code}`);

    // Fill the 6 code boxes
    const inputs = await page.$$('input[inputmode="numeric"]');
    for (let i = 0; i < 6; i++) {
      await inputs[i].fill(code[i]);
    }

    // Wait for redirect to /projects
    await page.waitForURL("**/projects", { timeout: 15000 });
    console.log("✔ Successfully signed in and returned to /projects:", page.url());

    // Test 5: Confirm "New project" shows for an Admin
    console.log("Verifying New project button / option for Admin...");

    // Open + New dropdown
    const newButton = await page.waitForSelector('button:has-text("+ New")', { timeout: 5000 });
    await newButton.click();

    // Confirm "Project" is present in the menu
    const projectOption = await page.waitForSelector('button:has-text("Project")', { timeout: 5000 });
    if (!projectOption) {
      throw new Error("New project option not visible for Admin!");
    }
    console.log("✔ 'Project' option is visible in + New menu for Admin");

    // Also check page header "New project" button if present
    const pageNewProjectBtn = await page.$('button:has-text("New project")');
    if (pageNewProjectBtn) {
      console.log("✔ Page level 'New project' button is also present");
    }

    console.log("=================================================");
    console.log("ALL AUTH SESSION & REDIRECT SMOKE TESTS PASSED!");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

runAuthSessionTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
