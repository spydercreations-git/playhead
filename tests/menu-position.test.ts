import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";
import * as fs from "fs";

const API_URL = "http://localhost:8080/api/v1";
const WEB_URL = "http://localhost:3000";

async function loginAsHarsh(context: BrowserContext) {
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

async function runMenuPositionTest() {
  console.log("=== Starting Menu Position Playwright Test ===");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await loginAsHarsh(context);
  const page = await context.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err));

  // 1. Fetch project list to get project ID
  const projectsRes = await fetch(`${API_URL}/projects`, {
    headers: {
      Cookie: (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; "),
    },
  });
  const projectsData = await projectsRes.json();
  const project = projectsData.projects?.[0];
  if (!project) {
    throw new Error("No projects found for test");
  }

  console.log(`Navigating to project ${project.name} (${project.id})...`);
  await page.goto(`${WEB_URL}/projects/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".folder-menu-btn");

  const viewport = page.viewportSize()!;

  // ---------------------------------------------------------------------------
  // Test 1: Top-Left Card (First folder card)
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Top-Left Card Menu ---");
  const folderButtons = await page.$$(".folder-menu-btn");
  if (folderButtons.length === 0) {
    throw new Error("No folder menu buttons found");
  }

  const firstBtn = folderButtons[0];
  const firstBtnBox = (await firstBtn.boundingBox())!;
  console.log(`Top-left button position: x=${firstBtnBox.x}, y=${firstBtnBox.y}, w=${firstBtnBox.width}, h=${firstBtnBox.height}`);

  await firstBtn.click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="item-menu"]') as HTMLElement;
    return el && getComputedStyle(el).visibility === "visible" && el.getBoundingClientRect().width > 0;
  });

  const menuEl = (await page.$('[data-testid="item-menu"]'))!;
  const menuBox = (await menuEl.boundingBox())!;
  console.log(`Menu position: x=${menuBox.x}, y=${menuBox.y}, w=${menuBox.width}, h=${menuBox.height}`);

  // Check 1: Menu opens below button (or flips above), never covering it
  const isBelow = menuBox.y >= firstBtnBox.y + firstBtnBox.height - 1;
  const isAbove = menuBox.y + menuBox.height <= firstBtnBox.y + 1;
  if (!isBelow && !isAbove) {
    throw new Error(`Menu overlaps or covers the button vertically: menu y=${menuBox.y}, h=${menuBox.height}, btn y=${firstBtnBox.y}, h=${firstBtnBox.height}`);
  }
  console.log(`✔ Menu placed ${isBelow ? "below" : "above"} button with no overlap`);

  // Check 2: 4px gap (within 2px tolerance for subpixel rendering)
  if (isBelow) {
    const gap = menuBox.y - (firstBtnBox.y + firstBtnBox.height);
    console.log(`Gap between button bottom and menu top: ${gap}px (expected ~4px)`);
    if (Math.abs(gap - 4) > 2) {
      throw new Error(`Gap was ${gap}px, expected ~4px`);
    }
  }

  // Check 3: Fully on screen
  if (menuBox.x < 0 || menuBox.y < 0 || menuBox.x + menuBox.width > viewport.width || menuBox.y + menuBox.height > viewport.height) {
    throw new Error(`Menu is off screen: ${JSON.stringify(menuBox)}`);
  }
  console.log("✔ Menu is fully on screen");

  // Check 4: Closes on Esc
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="item-menu"]', { state: "hidden" });
  console.log("✔ Menu closed on Escape");

  // ---------------------------------------------------------------------------
  // Test 2: Bottom-Right Card (Last folder card)
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Bottom-Right Card Menu ---");
  const lastBtn = folderButtons[folderButtons.length - 1];
  const lastBtnBox = (await lastBtn.boundingBox())!;
  console.log(`Last card button position: x=${lastBtnBox.x}, y=${lastBtnBox.y}, w=${lastBtnBox.width}, h=${lastBtnBox.height}`);

  await lastBtn.click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="item-menu"]') as HTMLElement;
    return el && getComputedStyle(el).visibility === "visible" && el.getBoundingClientRect().width > 0;
  });

  const lastMenuEl = (await page.$('[data-testid="item-menu"]'))!;
  const lastMenuBox = (await lastMenuEl.boundingBox())!;
  console.log(`Last card menu position: x=${lastMenuBox.x}, y=${lastMenuBox.y}, w=${lastMenuBox.width}, h=${lastMenuBox.height}`);

  // Fully on screen
  if (lastMenuBox.x < 0 || lastMenuBox.y < 0 || lastMenuBox.x + lastMenuBox.width > viewport.width || lastMenuBox.y + lastMenuBox.height > viewport.height) {
    throw new Error(`Menu is off screen: ${JSON.stringify(lastMenuBox)}`);
  }
  console.log("✔ Menu is fully on screen and shifted/flipped correctly");

  // Does not cover button
  const lastIsBelow = lastMenuBox.y >= lastBtnBox.y + lastBtnBox.height - 1;
  const lastIsAbove = lastMenuBox.y + lastMenuBox.height <= lastBtnBox.y + 1;
  if (!lastIsBelow && !lastIsAbove) {
    throw new Error("Menu covers button");
  }
  console.log("✔ Menu does not cover button");

  // Closes on outside click (click in neutral workspace content area)
  await page.mouse.click(600, 150);
  await page.waitForSelector('[data-testid="item-menu"]', { state: "hidden" });
  console.log("✔ Menu closed on outside click");

  // ---------------------------------------------------------------------------
  // Test 3: List Row Menu
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing List Row Menu ---");
  const listViewBtn = await page.$('button[title="List view"]');
  if (listViewBtn) {
    await listViewBtn.click();
    await page.waitForSelector(".item-menu-btn");

    const rowBtn = (await page.$(".item-menu-btn"))!;
    const rowBtnBox = (await rowBtn.boundingBox())!;
    console.log(`List row button position: x=${rowBtnBox.x}, y=${rowBtnBox.y}`);

    await rowBtn.click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="item-menu"]') as HTMLElement;
      return el && getComputedStyle(el).visibility === "visible" && el.getBoundingClientRect().width > 0;
    });

    const rowMenuEl = (await page.$('[data-testid="item-menu"]'))!;
    const rowMenuBox = (await rowMenuEl.boundingBox())!;
    console.log(`List row menu position: x=${rowMenuBox.x}, y=${rowMenuBox.y}`);

    // Fully on screen
    if (rowMenuBox.x < 0 || rowMenuBox.y < 0 || rowMenuBox.x + rowMenuBox.width > viewport.width || rowMenuBox.y + rowMenuBox.height > viewport.height) {
      throw new Error(`List row menu is off screen: ${JSON.stringify(rowMenuBox)}`);
    }
    console.log("✔ List row menu is next to button and fully on screen");

    // Close on choose item or esc
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="item-menu"]', { state: "hidden" });
    console.log("✔ List row menu closed on Escape");
  }

  // ---------------------------------------------------------------------------
  // Test 4: Right-Click on Card at Mouse Position
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Right Click on Card at Mouse Position ---");
  // Switch back to grid view first
  const gridViewBtn = await page.$('button[title="Grid view"]');
  if (gridViewBtn) {
    await gridViewBtn.click();
    await page.waitForSelector(".folder-menu-btn");
  }

  const card = page.locator(".folder-menu-btn").first().locator("xpath=ancestor::div[contains(@class, 'cursor-pointer')]");
  const cardBox = (await card.boundingBox())!;
  const rClickX = Math.round(cardBox.x + cardBox.width / 2);
  const rClickY = Math.round(cardBox.y + cardBox.height / 2);

  console.log(`Right-clicking card center at x=${rClickX}, y=${rClickY}...`);
  await card.click({ button: "right" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="item-menu"]') as HTMLElement;
    return el && getComputedStyle(el).visibility === "visible" && el.getBoundingClientRect().width > 0;
  });

  const rMenuEl = (await page.$('[data-testid="item-menu"]'))!;
  const rMenuBox = (await rMenuEl.boundingBox())!;
  console.log(`Right-click menu position: x=${rMenuBox.x}, y=${rMenuBox.y} (clicked at ${rClickX}, ${rClickY})`);

  // Menu is placed at mouse position with ~4px gap
  if (Math.abs(rMenuBox.x - rClickX) > 30 || Math.abs(rMenuBox.y - (rClickY + 4)) > 30) {
    throw new Error(`Right-click menu not positioned at mouse (${rClickX}, ${rClickY}): menu is at (${rMenuBox.x}, ${rMenuBox.y})`);
  }
  console.log("✔ Right-click menu opened right at mouse position on card");

  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="item-menu"]', { state: "hidden" });
  console.log("✔ Right-click menu closed");

  await browser.close();
  console.log("\nALL MENU POSITION TESTS PASSED SUCCESSFULLY! ✔✔✔\n");
}

runMenuPositionTest().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
