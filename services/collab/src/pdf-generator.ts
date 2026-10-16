import { chromium, Browser } from "playwright-core";
import { parseHTML } from "linkedom";

export interface PdfExportOptions {
  html: string;
  title?: string;
  background?: string; // e.g. '#ffffff', '#f8f9fa', '#181818', or custom hex
  theme_color?: string; // default '#3B67E0' (for headings, links, table headers)
  size?: "A4" | "Letter";
  margins?: "normal" | "narrow";
  orientation?: "portrait" | "landscape";
  fit_to_width?: boolean;
  include_team_notes?: boolean;
}

/**
 * Checks if a hex color is dark based on perceived luminance.
 */
function isColorDark(hex: string): boolean {
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (cleanHex.length !== 6) return false;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 128;
}

/**
 * Sanitizes HTML and removes team notes if not explicitly included or for client views.
 */
export function sanitizeHtmlAndFilterTeamNotes(rawHtml: string, includeTeamNotes: boolean): string {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${rawHtml}</body></html>`);

  // Remove scripts, styles, objects, and iframes for security
  const dangerousTags = document.querySelectorAll("script, iframe, object, embed, form, input, button");
  dangerousTags.forEach((el: any) => el.remove());

  // Remove all event handlers like onload, onclick, onerror
  const allElements = document.querySelectorAll("*");
  allElements.forEach((el: any) => {
    const attrs = Array.from(el.attributes || []) as any[];
    for (const attr of attrs) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Team notes filtering
  const teamNoteSelectors = [
    'div[data-type="team_notes"]',
    'div[data-type="team-notes"]',
    "div.team-notes",
    "team-notes",
    "teamnotes",
  ];

  if (!includeTeamNotes) {
    for (const sel of teamNoteSelectors) {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((n: any) => n.remove());
    }
  } else {
    // Style team notes with a callout container if present
    for (const sel of teamNoteSelectors) {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((n: any) => {
        n.setAttribute("class", "pdf-team-note-callout");
      });
    }
  }

  return document.body.innerHTML;
}

/**
 * Wraps content with full styled HTML document conforming to specs:
 * - Proper page breaks, no cut tables or images
 * - Inter font throughout
 * - Custom page background and theme colors for headings, links, table headers
 * - Page numbers in footer
 * - Tabular numbers for numbers/tables
 */
export function buildPrintableHtml(options: PdfExportOptions): string {
  const bg = options.background || "#ffffff";
  const theme = options.theme_color || "#3B67E0";
  const dark = isColorDark(bg);
  const textColor = dark ? "#EDEDED" : "#111827";
  const textMuted = dark ? "#9E9E9E" : "#6B7280";
  const borderColor = dark ? "#33353B" : "#E5E7EB";
  const tableHeaderBg = dark ? "#24252A" : "#F3F4F6";
  const calloutBg = dark ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.08)";
  const calloutBorder = "#F59E0B";

  const sanitizedBody = sanitizeHtmlAndFilterTeamNotes(options.html, !!options.include_team_notes);

  const orientation = options.orientation || "portrait";
  const fitWidthCss = options.fit_to_width
    ? `
      table { width: 100% !important; max-width: 100% !important; table-layout: auto !important; }
      td, th { word-break: break-word !important; }
    `
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${options.title || "Export"}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    @page {
      size: ${options.size || "A4"} ${orientation};
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      background-color: ${bg} !important;
      color: ${textColor} !important;
      -webkit-font-smoothing: antialiased;
    }

    /* Proper page breaks and avoiding split tables/images */
    table, tr, td, th, img, pre, blockquote, figure, .pdf-team-note-callout {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    .page-break {
      page-break-after: always !important;
      break-after: always !important;
    }

    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid !important;
      break-after: avoid !important;
      color: ${theme} !important;
      font-weight: 600;
      line-height: 1.25;
      margin-top: 1.4em;
      margin-bottom: 0.6em;
    }

    h1 { font-size: 24px; border-bottom: 2px solid ${theme}; padding-bottom: 6px; }
    h2 { font-size: 19px; }
    h3 { font-size: 16px; }
    h4 { font-size: 14px; }

    p {
      margin-top: 0;
      margin-bottom: 0.9em;
    }

    a {
      color: ${theme} !important;
      text-decoration: underline;
    }

    /* Tables & Tabular numbers */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.2em 0;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      border: 1px solid ${borderColor};
    }

    th {
      background-color: ${tableHeaderBg} !important;
      color: ${theme} !important;
      font-weight: 600;
      text-align: left;
      padding: 8px 12px;
      border: 1px solid ${borderColor};
      font-variant-numeric: tabular-nums;
    }

    td {
      padding: 8px 12px;
      border: 1px solid ${borderColor};
      font-variant-numeric: tabular-nums;
    }

    tr:nth-child(even) td {
      background-color: ${dark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.015)"};
    }

    /* Images */
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1em 0;
      border-radius: 4px;
    }

    /* Team notes callout */
    .pdf-team-note-callout {
      margin: 1.2em 0;
      padding: 12px 16px;
      background-color: ${calloutBg} !important;
      border-left: 4px solid ${calloutBorder} !important;
      border-radius: 0 6px 6px 0;
      font-size: 12.5px;
    }

    .pdf-team-note-callout::before {
      content: "TEAM NOTE";
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: ${calloutBorder};
      margin-bottom: 4px;
    }

    /* Spreadsheets fit to width */
    ${fitWidthCss}
  </style>
</head>
<body>
  ${sanitizedBody}
</body>
</html>`;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  // Attempt 1: Default Playwright bundled Chromium
  try {
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    return browserInstance;
  } catch (err: any) {
    // Attempt 2: Fallback to system Google Chrome (Mac or Linux)
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ];

    for (const execPath of candidates) {
      try {
        browserInstance = await chromium.launch({
          executablePath: execPath,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        return browserInstance;
      } catch {
        // try next
      }
    }

    throw new Error(`Failed to launch headless browser: ${err?.message || err}`);
  }
}

/**
 * Generates a PDF buffer from content using headless Chromium.
 */
export async function generatePdf(options: PdfExportOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const fullHtml = buildPrintableHtml(options);
    await page.setContent(fullHtml, { waitUntil: "networkidle" });

    // Wait for fonts to finish rendering
    await page.evaluate(async () => {
      if (document.fonts) {
        await document.fonts.ready;
      }
    });

    const isNarrow = options.margins === "narrow";
    const marginObj = isNarrow
      ? { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" }
      : { top: "20mm", bottom: "22mm", left: "20mm", right: "20mm" };

    const footerTemplate = `
      <div style="font-family: 'Inter', -apple-system, sans-serif; font-size: 8px; width: 100%; text-align: center; color: #888888; padding-bottom: 4px;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    `;

    const pdfBuffer = await page.pdf({
      format: options.size || "A4",
      landscape: options.orientation === "landscape",
      margin: marginObj,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}
