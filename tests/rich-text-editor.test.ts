import { chromium, BrowserContext, Page } from "../services/collab/node_modules/playwright-core";

const API_URL = "http://localhost:8080/api/v1";
const WEB_URL = "http://localhost:3000";

async function loginAsHarsh(context: BrowserContext) {
  console.log("Authenticating as harsh@idyllproductions.com via dev-login...");
  const res = await fetch(`${API_URL}/auth/dev-login`, {
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

async function runRichTextEditorTests() {
  console.log("=== Starting Rich Text Editor Playwright Tests ===");

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

    console.log("1. Navigating to /tasks...");
    await page.goto(`${WEB_URL}/tasks`, { waitUntil: "networkidle" });

    // Open Assign New Task modal
    console.log("2. Opening Assign new task modal...");
    const assignBtn = page.locator('button:has-text("Assign new task")').first();
    await assignBtn.waitFor({ state: "visible", timeout: 10000 });
    await assignBtn.click();

    // Wait for the modal dialog to appear
    await page.waitForSelector('text="Assign new task"', { timeout: 10000 });
    console.log("✔ Assign new task modal opened");

    // Locate the brief editor and its toolbar
    const editor = page.locator('.playhead-editor[contenteditable="true"]').first();
    await editor.waitFor({ state: "visible", timeout: 10000 });

    const boldBtn = page.locator('button[title*="Bold"]').first();
    const italicBtn = page.locator('button[title*="Italic"]').first();
    const undoBtn = page.locator('button[title*="Undo"]').first();
    const styleDropdownBtn = page.locator('button[title="Text style"]').first();

    // TEST 1: Undo is disabled in an empty editor
    console.log("3. Verifying Undo is disabled in empty editor...");
    const isUndoDisabled = await undoBtn.isDisabled();
    if (!isUndoDisabled) {
      throw new Error("Expected Undo button to be disabled in empty editor!");
    }
    console.log("✔ Undo is disabled in empty editor");

    // Focus editor
    await editor.click();
    // Clear any default placeholder content if present
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");

    // TEST 2: Click Bold with nothing selected, type "hello":
    // The text is bold and Bold is shown as on.
    console.log("4. Testing Bold toggle before typing 'hello'...");
    await boldBtn.click();

    // Check that Bold is active immediately
    const boldClassBeforeTyping = await boldBtn.getAttribute("class");
    if (!boldClassBeforeTyping?.includes("bg-[#4876F3]/15")) {
      throw new Error(`Expected Bold button to be active after click, but class was: ${boldClassBeforeTyping}`);
    }
    console.log("✔ Bold button is ON before typing");

    await page.keyboard.type("hello");
    await page.waitForTimeout(100);

    const htmlAfterHello = await editor.innerHTML();
    console.log("HTML after typing 'hello':", htmlAfterHello);
    if (!htmlAfterHello.includes("<strong>hello</strong>") && !htmlAfterHello.includes("<b>hello</b>")) {
      throw new Error(`Expected 'hello' to be wrapped in strong/b, got: ${htmlAfterHello}`);
    }

    const boldClassAfterTyping = await boldBtn.getAttribute("class");
    if (!boldClassAfterTyping?.includes("bg-[#4876F3]/15")) {
      throw new Error(`Expected Bold button to remain ON after typing 'hello', got: ${boldClassAfterTyping}`);
    }
    console.log("✔ Text is bold and Bold button remains ON");

    // TEST 3: Click Bold again, type " world":
    // " world" is not bold and Bold is off.
    console.log("5. Testing Bold toggle off and typing ' world'...");
    await boldBtn.click();
    await page.waitForTimeout(50);

    const boldClassAfterToggleOff = await boldBtn.getAttribute("class");
    if (boldClassAfterToggleOff?.includes("bg-[#4876F3]/15")) {
      throw new Error("Expected Bold button to be OFF after clicking again!");
    }
    console.log("✔ Bold button is OFF");

    await page.keyboard.type(" world");
    await page.waitForTimeout(100);

    const htmlAfterWorld = await editor.innerHTML();
    console.log("HTML after typing ' world':", htmlAfterWorld);
    // 'world' should not be inside strong
    if (htmlAfterWorld.includes("<strong>hello world</strong>") || htmlAfterWorld.includes("<strong>world</strong>")) {
      throw new Error(`Expected ' world' to be normal (not bold), got: ${htmlAfterWorld}`);
    }
    console.log("✔ ' world' is normal text and Bold is off");

    // TEST 4: Turn on Bold + Italic, type " both":
    // Text is bold and italic, both buttons on.
    console.log("6. Testing Bold + Italic toggle and typing ' both'...");
    await boldBtn.click();
    await italicBtn.click();
    await page.waitForTimeout(50);

    const boldClassBoth = await boldBtn.getAttribute("class");
    const italicClassBoth = await italicBtn.getAttribute("class");
    if (!boldClassBoth?.includes("bg-[#4876F3]/15") || !italicClassBoth?.includes("bg-[#4876F3]/15")) {
      throw new Error(`Expected BOTH Bold and Italic to be ON, got bold=${boldClassBoth}, italic=${italicClassBoth}`);
    }
    console.log("✔ Both Bold and Italic buttons are ON before typing");

    await page.keyboard.type(" both");
    await page.waitForTimeout(100);

    const htmlAfterBoth = await editor.innerHTML();
    console.log("HTML after typing ' both':", htmlAfterBoth);
    const hasBothMarks =
      (htmlAfterBoth.includes("<strong><em>") && htmlAfterBoth.includes("both")) ||
      (htmlAfterBoth.includes("<em><strong>") && htmlAfterBoth.includes("both"));
    if (!hasBothMarks) {
      throw new Error(`Expected ' both' to be both bold and italic, got: ${htmlAfterBoth}`);
    }

    const boldClassAfterBoth = await boldBtn.getAttribute("class");
    const italicClassAfterBoth = await italicBtn.getAttribute("class");
    if (!boldClassAfterBoth?.includes("bg-[#4876F3]/15") || !italicClassAfterBoth?.includes("bg-[#4876F3]/15")) {
      throw new Error("Expected both buttons to stay ON after typing");
    }
    console.log("✔ Text is bold and italic, both buttons on");

    // TEST 5: Choose Large heading:
    // The line becomes 26px and the dropdown says "Large heading".
    console.log("7. Testing Large heading selection...");
    await styleDropdownBtn.click();
    await page.waitForSelector('button[data-style-option="h1"]', { timeout: 5000 });

    const largeHeadingOption = page.locator('button[data-style-option="h1"]').first();
    await largeHeadingOption.click();
    await page.waitForTimeout(100);

    // Verify dropdown label now says "Large heading"
    const dropdownText = await styleDropdownBtn.innerText();
    console.log("Dropdown label after selection:", dropdownText);
    if (!dropdownText.includes("Large heading")) {
      throw new Error(`Expected dropdown label to display 'Large heading', got: '${dropdownText}'`);
    }
    console.log("✔ Dropdown label displays 'Large heading'");

    // Verify line became an h1 and has 26px font-size and 34px line-height
    const h1Element = editor.locator("h1").first();
    const isH1Visible = await h1Element.isVisible();
    if (!isH1Visible) {
      throw new Error("Expected line to become <h1>!");
    }

    const h1Typography = await h1Element.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
      };
    });
    console.log("H1 Computed Typography:", h1Typography);
    if (h1Typography.fontSize !== "26px") {
      throw new Error(`Expected H1 font-size to be 26px, got: ${h1Typography.fontSize}`);
    }
    if (h1Typography.lineHeight !== "34px") {
      throw new Error(`Expected H1 line-height to be 34px, got: ${h1Typography.lineHeight}`);
    }
    console.log("✔ H1 computed styles verified: 26px font-size, 34px line-height");

    // TEST 6: Put the cursor in existing bold text: Bold shows as on
    console.log("8. Testing cursor in existing bold text...");
    // Click on the 'hello' text inside the editor
    await editor.locator("strong").first().click();
    await page.waitForTimeout(100);

    const boldClassInBold = await boldBtn.getAttribute("class");
    if (!boldClassInBold?.includes("bg-[#4876F3]/15")) {
      throw new Error(`Expected Bold button to be ON when cursor is in bold text, got: ${boldClassInBold}`);
    }
    console.log("✔ Cursor placed in bold text lights up Bold button");

    // TEST 7: Selecting the same style again turns it back to Normal text
    console.log("9. Testing toggle back to Normal text by choosing Large heading again...");
    await styleDropdownBtn.click();
    await page.waitForSelector('button[data-style-option="h1"]', { timeout: 5000 });
    await page.locator('button[data-style-option="h1"]').first().click();
    await page.waitForTimeout(100);

    const dropdownTextReverted = await styleDropdownBtn.innerText();
    console.log("Dropdown label after toggling off Large heading:", dropdownTextReverted);
    if (!dropdownTextReverted.includes("Normal text")) {
      throw new Error(`Expected dropdown to revert to 'Normal text', got: '${dropdownTextReverted}'`);
    }
    const h1Count = await editor.locator("h1").count();
    if (h1Count !== 0) {
      throw new Error("Expected h1 to be converted back to normal paragraph!");
    }
    console.log("✔ Selecting same style successfully turns line back to Normal text");

    console.log("=================================================");
    console.log("ALL RICH TEXT EDITOR PLAYWRIGHT TESTS PASSED!");
    console.log("=================================================");
  } finally {
    await browser.close();
  }
}

runRichTextEditorTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
