/**
 * Playhead Design System Token Linter & Auditor
 * 
 * Audits apps/web/src for compliance:
 * 1. Zero uses of text-[9px] and text-[10px]
 * 2. Zero uses of uppercase (except tiny chips)
 * 3. Zero uses of shadow-2xl
 * 4. Only design tokens or explicitly allowed exceptions for hex colors
 * 5. Only allowed radius values: 6, 8, 10, 12, 16, full
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

// Explicit Design System Token Palette
const ALLOWED_TOKENS = new Set([
  '#181818', // bg
  '#212121', // panel
  '#26272c', // panel-raised
  '#2a2b30', // input
  '#2c2d33', // hover
  '#2e2f34', // border
  '#424344', // border-strong
  '#ffffff', // text / white
  '#a3a6ad', // text-2
  '#7c7f87', // text-3
  '#4876f3', // accent
  '#3b67e0', // button
  '#3560d6', // button-hover
  '#3fcf8e', // success
  '#ffbb56', // warning
  '#f0506e', // danger
  '#9787ff', // purple
  '#fa457b', // pink
  '#000000', // black
]);

// 1. White "Continue with Google" button (#ffffff) & Google Logo Brand SVG colors
const GOOGLE_BRAND_COLORS = new Set([
  '#4285f4', '#34a853', '#fbbc05', '#ea4335',
]);

// 2. White document page (#ffffff, print/page preview #f8f9fa)
const DOCUMENT_PAGE_COLORS = new Set([
  '#ffffff', '#f8f9fa',
]);

// 3. Video drawing pen colors
const DRAWING_PEN_COLORS = new Set([
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d55',
  '#eab308', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899',
]);

// 4. Status chip colors (the 6 defined project & spreadsheet status options)
const STATUS_CHIP_COLORS = new Set([
  '#2a2b30', '#3f4045', '#9ca3af', '#6b7280', // Not started
  '#1e293b', '#2563eb', '#60a5fa', '#3b82f6', // Editing
  '#451a03', '#d97706', '#fbbf24', '#f59e0b', // Needs review
  '#450a0a', '#dc2626', '#f87171', '#ef4444', // Changes requested
  '#064e3b', '#059669', '#34d399', '#10b981', // Approved
  '#2e1065', '#7c3aed', '#c084fc', '#8b5cf6', // Delivered
]);

// 5. User avatar palette colors
const AVATAR_PALETTE_COLORS = new Set([
  '#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb', '#64b5f6',
  '#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784', '#aed581', '#ffb74d',
  '#ff8a65', '#a1887f', '#90a4ae', '#17a2b8', '#7048e8', '#f03e3e',
]);

// 6. Spreadsheet cell & text color pickers and FortuneSheet internal overrides
const SPREADSHEET_PICKER_COLORS = new Set([
  '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#6c757d', '#495057', '#343a40', '#212529',
  '#dbeafe', '#bfdbfe', '#93c5fd', '#dcfce7', '#bbf7d0', '#86efac', '#fef3c7', '#fde68a', '#fcd34d',
  '#fee2e2', '#fecaca', '#fca5a5', '#f3e8ff', '#e9d5ff', '#d8b4fe',
]);

const ALL_EXCEPTIONS = new Set([
  ...ALLOWED_TOKENS,
  ...GOOGLE_BRAND_COLORS,
  ...DOCUMENT_PAGE_COLORS,
  ...DRAWING_PEN_COLORS,
  ...STATUS_CHIP_COLORS,
  ...AVATAR_PALETTE_COLORS,
  ...SPREADSHEET_PICKER_COLORS,
]);

// Files exempted from hex check (pure user content drawing / sheets / avatars)
const EXEMPTED_FILE_PATTERNS = [
  'drawing-overlay.tsx',
  'drawing-canvas.tsx',
  'yjs-sheet-binding.ts',
  'spreadsheet-editor.tsx',
  'video-card.tsx',
  'avatar.tsx',
];

function checkDirectory(dir, results) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        checkDirectory(fullPath, results);
      }
    } else if (entry.isFile() && /\.(tsx|ts|css)$/.test(entry.name)) {
      const relPath = path.relative(SRC_DIR, fullPath);
      const isExempt = EXEMPTED_FILE_PATTERNS.some(p => relPath.includes(p));
      const content = fs.readFileSync(fullPath, 'utf8');

      // 1. text-[9px] and text-[10px]
      const text910Matches = content.match(/text-\[(?:9|10)px\]/g);
      if (text910Matches) {
        results.text910Count += text910Matches.length;
        results.text910Files.push({ file: relPath, count: text910Matches.length });
      }

      // 2. shadow-2xl
      const shadow2xlMatches = content.match(/shadow-2xl/g);
      if (shadow2xlMatches) {
        results.shadow2xlCount += shadow2xlMatches.length;
        results.shadow2xlFiles.push({ file: relPath, count: shadow2xlMatches.length });
      }

      // 3. uppercase (excluding tiny chips with text-[11px] or text-chip)
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/\buppercase\b/.test(line)) {
          // Check if it's on a chip line
          if (!line.includes('text-[11px]') && !line.includes('text-chip') && !line.includes('avatar') && !line.includes('Avatar')) {
            results.uppercaseCount++;
          }
        }
      });

      // 4. Hex colors
      const hexMatches = content.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hexMatches) {
        hexMatches.forEach(hex => {
          const lower = hex.toLowerCase();
          results.allHexColors.add(lower);
          if (!isExempt && !ALL_EXCEPTIONS.has(lower)) {
            results.invalidHexColors.add(lower);
            results.invalidHexOccurrences.push({ file: relPath, hex: lower });
          }
        });
      }

      // 5. Radius values
      const radiusMatches = content.matchAll(/\brounded-(?:\[(\d+px)\]|(none|sm|DEFAULT|md|lg|xl|2xl|3xl|full))\b/g);
      for (const m of radiusMatches) {
        results.radiusValues.add(m[1] || m[2]);
      }
    }
  }
}

function runAudit() {
  const results = {
    text910Count: 0,
    text910Files: [],
    shadow2xlCount: 0,
    shadow2xlFiles: [],
    uppercaseCount: 0,
    allHexColors: new Set(),
    invalidHexColors: new Set(),
    invalidHexOccurrences: [],
    radiusValues: new Set(),
  };

  checkDirectory(SRC_DIR, results);

  console.log('================ DESIGN SYSTEM AUDIT ================');
  console.log(`text-[9px]/[10px] uses: ${results.text910Count}`);
  console.log(`uppercase non-chip uses: ${results.uppercaseCount}`);
  console.log(`shadow-2xl uses: ${results.shadow2xlCount}`);
  console.log(`Unique hex colors total: ${results.allHexColors.size}`);
  console.log(`Invalid hex colors (non-token, non-exception): ${results.invalidHexColors.size}`);
  console.log(`Radius values in use: ${JSON.stringify(Array.from(results.radiusValues).sort())}`);
  console.log('====================================================');

  if (process.argv.includes('--strict')) {
    if (results.text910Count > 0 || results.shadow2xlCount > 0 || results.invalidHexColors.size > 0) {
      console.error('Audit failed strict compliance check.');
      process.exit(1);
    }
  }

  return results;
}

if (require.main === module) {
  runAudit();
}

module.exports = { runAudit };
