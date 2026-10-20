import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";

const WEB_URL = "http://localhost:3000";

function normalizeColor(rgbOrHex: string): string {
  if (rgbOrHex.startsWith("#")) {
    return rgbOrHex.toUpperCase();
  }
  const match = rgbOrHex.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgbOrHex.toUpperCase();
  const r = parseInt(match[1], 10).toString(16).padStart(2, "0");
  const g = parseInt(match[2], 10).toString(16).padStart(2, "0");
  const b = parseInt(match[3], 10).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

async function runSingleThemeTest() {
  console.log("=== Starting Playhead Single Neutral Dark Grey Theme Test ===");

  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  try {
    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();

    // 1. Load login page (public route)
    console.log("Checking login page tokens...");
    await page.goto(`${WEB_URL}/login`);
    await page.waitForSelector("body", { timeout: 10000 });

    // Verify <html> has NO data-theme attribute
    const dataThemeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    if (dataThemeAttr) {
      throw new Error(`Expected NO data-theme attribute on <html>, but found: ${dataThemeAttr}`);
    }
    console.log("✔ No data-theme attribute on <html>");

    // Verify computed CSS variables in :root for single dark grey theme
    const themeTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--bg").trim(),
        panel: style.getPropertyValue("--panel").trim(),
        panelRaised: style.getPropertyValue("--panel-raised").trim(),
        input: style.getPropertyValue("--input").trim(),
        hover: style.getPropertyValue("--hover").trim(),
        border: style.getPropertyValue("--border").trim(),
        borderStrong: style.getPropertyValue("--border-strong").trim(),
        accent: style.getPropertyValue("--accent").trim(),
        button: style.getPropertyValue("--button").trim(),
        buttonHover: style.getPropertyValue("--button-hover").trim(),
        buttonText: style.getPropertyValue("--button-text").trim(),
        text: style.getPropertyValue("--text").trim(),
        text2: style.getPropertyValue("--text-2").trim(),
        text3: style.getPropertyValue("--text-3").trim(),
      };
    });

    console.log("Computed theme tokens on :root:", themeTokens);

    if (normalizeColor(themeTokens.bg) !== "#0F0F10") {
      throw new Error(`Expected --bg to be #0F0F10, got: ${themeTokens.bg}`);
    }
    if (normalizeColor(themeTokens.panel) !== "#161618") {
      throw new Error(`Expected --panel to be #161618, got: ${themeTokens.panel}`);
    }
    if (normalizeColor(themeTokens.panelRaised) !== "#1C1C1F") {
      throw new Error(`Expected --panel-raised to be #1C1C1F, got: ${themeTokens.panelRaised}`);
    }
    if (normalizeColor(themeTokens.input) !== "#1F1F23") {
      throw new Error(`Expected --input to be #1F1F23, got: ${themeTokens.input}`);
    }
    if (normalizeColor(themeTokens.hover) !== "#242428") {
      throw new Error(`Expected --hover to be #242428, got: ${themeTokens.hover}`);
    }
    if (normalizeColor(themeTokens.border) !== "#2A2A2E") {
      throw new Error(`Expected --border to be #2A2A2E, got: ${themeTokens.border}`);
    }
    if (normalizeColor(themeTokens.borderStrong) !== "#3A3A40") {
      throw new Error(`Expected --border-strong to be #3A3A40, got: ${themeTokens.borderStrong}`);
    }
    if (normalizeColor(themeTokens.accent) !== "#4876F3") {
      throw new Error(`Expected --accent to be #4876F3, got: ${themeTokens.accent}`);
    }
    if (normalizeColor(themeTokens.button) !== "#3B67E0") {
      throw new Error(`Expected --button to be #3B67E0, got: ${themeTokens.button}`);
    }
    if (normalizeColor(themeTokens.buttonHover) !== "#3560D6") {
      throw new Error(`Expected --button-hover to be #3560D6, got: ${themeTokens.buttonHover}`);
    }
    if (normalizeColor(themeTokens.text) !== "#FFFFFF") {
      throw new Error(`Expected --text to be #FFFFFF, got: ${themeTokens.text}`);
    }
    if (normalizeColor(themeTokens.text2) !== "#A1A1AA") {
      throw new Error(`Expected --text-2 to be #A1A1AA, got: ${themeTokens.text2}`);
    }
    if (normalizeColor(themeTokens.text3) !== "#71717A") {
      throw new Error(`Expected --text-3 to be #71717A, got: ${themeTokens.text3}`);
    }
    console.log("✔ Single neutral dark grey tokens match exact specification");

    // 2. Verify no background glow layer in DOM
    const glowElements = await page.$$('[style*="bg-glow"]');
    if (glowElements.length > 0) {
      throw new Error(`Expected 0 bg-glow elements in DOM, found: ${glowElements.length}`);
    }
    console.log("✔ No background glow elements in DOM");

    // 3. Test Neutral theme on review route
    console.log("Checking route-based neutral theme on review route...");
    await page.goto(`${WEB_URL}/review`);
    await page.waitForTimeout(500);

    const neutralAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme-neutral"));
    if (neutralAttr !== "true") {
      throw new Error(`Expected data-theme-neutral="true" on review route, got: ${neutralAttr}`);
    }
    console.log("✔ data-theme-neutral attribute is active on review route");

    const neutralTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--bg").trim(),
        panel: style.getPropertyValue("--panel").trim(),
        border: style.getPropertyValue("--border").trim(),
      };
    });

    console.log("Computed neutral tokens on review route:", neutralTokens);
    if (normalizeColor(neutralTokens.bg) !== "#0A0A0B") {
      throw new Error(`Expected review --bg to be #0A0A0B, got: ${neutralTokens.bg}`);
    }
    if (normalizeColor(neutralTokens.panel) !== "#111113") {
      throw new Error(`Expected review --panel to be #111113, got: ${neutralTokens.panel}`);
    }
    if (normalizeColor(neutralTokens.border) !== "#232327") {
      throw new Error(`Expected review --border to be #232327, got: ${neutralTokens.border}`);
    }
    console.log("✔ Review page renders plain neutral dark look (#0A0A0B / #111113 / #232327)");

    console.log("=================================================");
    console.log("ALL SINGLE THEME & NEUTRAL REVIEW TESTS PASSED!");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

runSingleThemeTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
