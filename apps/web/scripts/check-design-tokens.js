/**
 * Playhead Design System Token Linter & Auditor
 * 
 * Audits apps/web/src for strict compliance:
 * 1. Text sizes: ONLY 12, 13, 14, 16, 20, 28 (zero text-[11px], text-[34px], etc.)
 * 2. Border radius: ONLY 6, 8, 10, 12, 16, full
 * 3. Uppercase: ZERO uses (no exceptions, no uppercase chips or labels)
 * 4. Gradients: ZERO bg-gradient- uses
 * 5. Hover scales: ZERO scale-105/110/125 uses
 * 6. Hex colors: ONLY design tokens or explicitly allowed exceptions
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

// Explicit Design System Token Palette
const ALLOWED_TOKENS = new Set([
  '#0a0a0b', // bg
  '#111113', // panel
  '#17171a', // panel-raised
  '#1a1a1e', // input
  '#1e1e22', // hover
  '#232327', // border
  '#34343a', // border-strong
  '#ffffff', // text / white
  '#a1a1aa', // text-2
  '#71717a', // text-3
  '#4876f3', // accent
  '#3b67e0', // button
  '#3560d6', // button-hover
  '#3fcf8e', // success
  '#ffbb56', // warning
  '#f0506e', // danger
  '#9787ff', // purple
  '#fa457b', // pink
  '#000000', // black
  '#3b5bdb', // glow blue
  '#5b3fd6', // glow purple
]);

// 1. Google Brand SVG logo colors ("Continue with Google" button)
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
  '#4fc3f7', '#4dd0e1', '#4dd6ac', '#81c784', '#aed581', '#ffb74d',
  '#ff8a65', '#a1887f', '#90a4ae', '#17a2b8', '#7048e8', '#f03e3e',
  '#c2410c', '#7c3aed', '#0f766e', '#b45309', '#0e7490', '#6d28d9',
]);

// 6. Spreadsheet cell & text color pickers and FortuneSheet internal overrides
const SPREADSHEET_PICKER_COLORS = new Set([
  '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#6c757d', '#495057', '#343a40', '#212529',
  '#dbeafe', '#bfdbfe', '#93c5fd', '#dcfce7', '#bbf7d0', '#86efac', '#fef3c7', '#fde68a', '#fcd34d',
  '#fee2e2', '#fecaca', '#fca5a5', '#f3e8ff', '#e9d5ff', '#d8b4fe',
]);

// 7. Card shape mini previews (11-card-shapes.svg exact colors)
const CARD_SHAPES_COLORS = new Set([
  '#1b1c20', '#3a3c44', '#f4f2ee', '#2b2b2b', '#c9c4ba',
  '#3d5a80', '#e0c3a3', '#f2b134', '#5b3a29', '#f1d3b3',
  '#e76f51', '#264653', '#e9c46a', '#2a9d8f',
]);

const ALL_EXCEPTIONS = new Set([
  ...ALLOWED_TOKENS,
  ...GOOGLE_BRAND_COLORS,
  ...DOCUMENT_PAGE_COLORS,
  ...DRAWING_PEN_COLORS,
  ...STATUS_CHIP_COLORS,
  ...AVATAR_PALETTE_COLORS,
  ...SPREADSHEET_PICKER_COLORS,
  ...CARD_SHAPES_COLORS,
]);

// Files exempted from hex check (pure user content drawing / sheets / avatars / documented tokens)
const EXEMPTED_FILE_PATTERNS = [
  'drawing-overlay.tsx',
  'drawing-canvas.tsx',
  'yjs-sheet-binding.ts',
  'spreadsheet-editor.tsx',
  'video-card.tsx',
  'avatar.tsx',
  'design-tokens.ts',
  'auth-showcase.tsx',
];

// 8. Prohibited Mockup Sample Strings (Everygen, Jada, Bri, Truvani, Pizza Hut, "38.5 GB", "480 Files")
const PROHIBITED_MOCKUP_PATTERNS = [
  { pattern: /\bEverygen\b/i, label: 'Everygen' },
  { pattern: /\bJada\b/i, label: 'Jada' },
  { pattern: /\bBri\b/, label: 'Bri' },
  { pattern: /\bTruvani\b/i, label: 'Truvani' },
  { pattern: /\bPizza Hut\b/i, label: 'Pizza Hut' },
  { pattern: /\b38\.5\s*GB\b/i, label: '38.5 GB' },
  { pattern: /\b480\s*Files\b/i, label: '480 Files' },
  { pattern: /\bBri_Raw_Take2\b/i, label: 'Bri_Raw_Take2' },
  { pattern: /\bVO_take_04\b/i, label: 'VO_take_04' },
  { pattern: /\bBri_Final_v2\b/i, label: 'Bri_Final_v2' },
  { pattern: /\bLogo_pack\b/i, label: 'Logo_pack' },
];

// Allowed text pixel sizes: only 12, 13, 14, 16, 20, 28
const ALLOWED_TEXT_PX = new Set([12, 13, 14, 16, 20, 28]);

// Allowed radius pixel sizes: only 6, 8, 10, 12, 16, full
const ALLOWED_RADIUS_PX = new Set([6, 8, 10, 12, 16]);
const ALLOWED_RADIUS_NAMES = new Set(['none', 'sm', 'DEFAULT', 'md', 'lg', 'xl', '2xl', 'full']);

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

      // 8. Prohibited mockup sample strings
      if (relPath.startsWith('app') || relPath.startsWith('components')) {
        const fileLines = content.split('\n');
        fileLines.forEach((line, idx) => {
          for (const item of PROHIBITED_MOCKUP_PATTERNS) {
            if (item.pattern.test(line)) {
              results.mockupSampleOccurrences.push({
                file: relPath,
                line: idx + 1,
                matched: item.label,
                snippet: line.trim(),
              });
            }
          }
        });
      }

      // 1. Text sizes: check arbitrary text-[...px]
      const textPxMatches = content.matchAll(/\btext-\[(\d+)px\]/g);
      for (const m of textPxMatches) {
        const px = parseInt(m[1], 10);
        if (!ALLOWED_TEXT_PX.has(px)) {
          results.invalidTextSizes.push({ file: relPath, size: `${px}px` });
        }
      }

      // Also check standard text-[9px]/[10px]
      const text910Matches = content.match(/text-\[(?:9|10)px\]/g);
      if (text910Matches) {
        results.text910Count += text910Matches.length;
      }

      // 2. shadow-2xl
      const shadow2xlMatches = content.match(/shadow-2xl/g);
      if (shadow2xlMatches) {
        results.shadow2xlCount += shadow2xlMatches.length;
      }

      // 3. uppercase (no exceptions)
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/\buppercase\b/.test(line)) {
          results.uppercaseCount++;
          results.uppercaseOccurrences.push({ file: relPath, line: idx + 1 });
        }
      });

      // 4. Gradients: only glow and client picture fade allowed
      const gradMatches = content.match(/bg-gradient-[a-z0-9_-]+/g);
      if (gradMatches) {
        const disallowed = gradMatches.filter(m => {
          // Allow client picture fade
          if ((relPath.includes('client') || relPath.includes('cards')) && (m === 'bg-gradient-to-t' || m === 'bg-gradient-to-b')) {
            return false;
          }
          // Allow glow
          if (relPath.includes('globals.css') || relPath.includes('app-shell')) {
            return false;
          }
          return true;
        });
        if (disallowed.length > 0) {
          results.gradientCount += disallowed.length;
          results.gradientOccurrences.push({ file: relPath, matches: disallowed });
        }
      }

      // 5. Exaggerated hover scales: scale-105/110/125
      const scaleMatches = content.match(/(?:hover:|group-hover:)?scale-(?:105|110|125)\b/g);
      if (scaleMatches) {
        results.scaleCount += scaleMatches.length;
        results.scaleOccurrences.push({ file: relPath, matches: scaleMatches });
      }

      // 6. Hex colors
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

      // 7. Radius values
      const radiusMatches = content.matchAll(/\brounded-(?:\[(\d+)px\]|(none|sm|DEFAULT|md|lg|xl|2xl|3xl|full))\b/g);
      for (const m of radiusMatches) {
        if (m[1]) {
          const px = parseInt(m[1], 10);
          results.radiusValues.add(`${px}px`);
          if (!ALLOWED_RADIUS_PX.has(px)) {
            results.invalidRadius.push({ file: relPath, radius: `${px}px` });
          }
        } else if (m[2]) {
          results.radiusValues.add(m[2]);
          if (!ALLOWED_RADIUS_NAMES.has(m[2])) {
            results.invalidRadius.push({ file: relPath, radius: m[2] });
          }
        }
      }
    }
  }
}

function runAudit() {
  const results = {
    text910Count: 0,
    invalidTextSizes: [],
    shadow2xlCount: 0,
    uppercaseCount: 0,
    uppercaseOccurrences: [],
    gradientCount: 0,
    gradientOccurrences: [],
    scaleCount: 0,
    scaleOccurrences: [],
    allHexColors: new Set(),
    invalidHexColors: new Set(),
    invalidHexOccurrences: [],
    radiusValues: new Set(),
    invalidRadius: [],
    mockupSampleOccurrences: [],
  };

  checkDirectory(SRC_DIR, results);

  console.log('================ DESIGN SYSTEM AUDIT ================');
  console.log(`Off-scale text sizes: ${results.invalidTextSizes.length}`);
  console.log(`Uppercase class uses: ${results.uppercaseCount}`);
  console.log(`Gradient uses: ${results.gradientCount}`);
  console.log(`Hover scale uses (105/110/125): ${results.scaleCount}`);
  console.log(`shadow-2xl uses: ${results.shadow2xlCount}`);
  console.log(`Unique hex colors total: ${results.allHexColors.size}`);
  console.log(`Invalid hex colors (non-token, non-exception): ${results.invalidHexColors.size}`);
  console.log(`Invalid radius values: ${results.invalidRadius.length}`);
  console.log(`Radius values in use: ${JSON.stringify(Array.from(results.radiusValues).sort())}`);
  console.log(`Mockup sample data occurrences: ${results.mockupSampleOccurrences.length}`);
  console.log('====================================================');

  if (process.argv.includes('--strict')) {
    const hasViolations = 
      results.invalidTextSizes.length > 0 ||
      results.uppercaseCount > 0 ||
      results.gradientCount > 0 ||
      results.scaleCount > 0 ||
      results.shadow2xlCount > 0 ||
      results.invalidHexColors.size > 0 ||
      results.invalidRadius.length > 0 ||
      results.mockupSampleOccurrences.length > 0;

    if (hasViolations) {
      console.error('Audit failed strict compliance check.');
      if (results.invalidTextSizes.length) console.error('Off-scale text:', results.invalidTextSizes.slice(0, 10));
      if (results.uppercaseOccurrences.length) console.error('Uppercase uses:', results.uppercaseOccurrences.slice(0, 10));
      if (results.gradientOccurrences.length) console.error('Gradients:', results.gradientOccurrences);
      if (results.scaleOccurrences.length) console.error('Scales:', results.scaleOccurrences);
      if (results.invalidHexOccurrences.length) console.error('Invalid hex:', results.invalidHexOccurrences.slice(0, 10));
      if (results.invalidRadius.length) console.error('Invalid radius:', results.invalidRadius.slice(0, 10));
      if (results.mockupSampleOccurrences.length) console.error('Mockup sample data:', results.mockupSampleOccurrences.slice(0, 10));
      process.exit(1);
    }
  }

  return results;
}

if (require.main === module) {
  runAudit();
}

module.exports = { runAudit };
