/**
 * Playhead Design System Tokens & Official Exception Registry
 * 
 * Strict Single Source of Truth for tokens across the entire web app.
 * Any hex color outside this set will cause `npm run lint` to fail.
 */

export const DESIGN_TOKENS = {
  // Surface & Backgrounds
  bg: "#0A0A0B",
  panel: "#111113",
  panelRaised: "#17171A",
  input: "#1A1A1E",
  hover: "#1E1E22",
  border: "#232327",
  borderStrong: "#34343A",

  // Text Hierarchy
  text: "#FFFFFF",
  text2: "#A1A1AA",
  text3: "#71717A",

  // Brand & Action
  accent: "#4876F3",
  button: "#3B67E0",
  buttonHover: "#3560D6",

  // Feedback & Accents
  success: "#3FCF8E",
  warning: "#FFBB56",
  danger: "#F0506E",
  purple: "#9787FF",
  pink: "#FA457B",
  black: "#000000",
} as const;

/**
 * Permitted Exceptions Registry
 * As approved by Harsh, these are the ONLY non-token hex colors allowed in the app:
 */
export const DESIGN_EXCEPTIONS = {
  // 1. Google Brand SVG logo colors ("Continue with Google" button)
  google: [
    "#4285F4", // Google Blue
    "#34A853", // Google Green
    "#FBBC05", // Google Yellow
    "#EA4335", // Google Red
  ],

  // 2. Document & PDF white canvas background
  pdfWhite: [
    "#FFFFFF",
    "#F8F9FA",
  ],

  // 3. User content colors: Spreadsheet cell & text color pickers (FortuneSheet)
  spreadsheetPalette: [
    "#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#6c757d", "#495057", "#343a40", "#212529",
    "#dbeafe", "#bfdbfe", "#93c5fd", "#dcfce7", "#bbf7d0", "#86efac", "#fef3c7", "#fde68a", "#fcd34d",
    "#fee2e2", "#fecaca", "#fca5a5", "#f3e8ff", "#e9d5ff", "#d8b4fe",
  ],

  // 4. Video Drawing pen colors (Freehand annotation overlay)
  drawingPens: [
    "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#007aff", "#af52de", "#ff2d55",
    "#eab308", "#ef4444", "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899",
  ],

  // 5. User avatar & label palette (initials fallback background)
  avatars: [
    "#e57373", "#f06292", "#ba68c8", "#9575cd", "#7986cb", "#64b5f6",
    "#4fc3f7", "#4dd0e1", "#4db6ac", "#81c784", "#aed581", "#ffb74d",
    "#ff8a65", "#a1887f", "#90a4ae", "#17a2b8", "#7048e8", "#f03e3e",
    "#c2410c", "#7c3aed", "#0f766e", "#b45309", "#0e7490", "#6d28d9",
  ],

  // 6. Card shape mini previews (11-card-shapes.svg exact colors)
  cardShapes: [
    "#1b1c20", // Spreadsheet mini preview dark container
    "#3a3c44", // Spreadsheet mini preview cell bar
    "#f4f2ee", // Document mini preview white paper
    "#2b2b2b", // Document mini preview title bar
    "#c9c4ba", // Document mini preview text lines
    "#3d5a80", "#e0c3a3", "#f2b134", // Project preview thumbnail 1 illustration
    "#5b3a29", "#f1d3b3", "#e76f51", // Project preview thumbnail 2 illustration
    "#264653", "#e9c46a", "#2a9d8f", // Project preview thumbnail 3 illustration
  ],
} as const;

/**
 * Strict Type Scale (pixels only):
 * 12, 13, 14, 16, 20, 28
 */
export const TYPE_SCALE = [12, 13, 14, 16, 20, 28] as const;

/**
 * Strict Border Radius (pixels only):
 * 6, 8, 10, 12, 16, and full (9999px)
 * - buttons & inputs: 8px (rounded-md)
 * - New button: 10px (rounded-lg)
 * - cards: 12px (rounded-xl)
 * - dialogs: 16px (rounded-2xl)
 * - chips & avatars: full (rounded-full)
 */
export const RADIUS_SCALE = [6, 8, 10, 12, 16, "full"] as const;

/**
 * Framer Motion Transition Tokens
 */
export const MOTION = {
  hover: { scale: 1.015, transition: { duration: 0.15, ease: "easeOut" } },
  tap: { scale: 0.98, transition: { duration: 0.1 } },
  dialogEnter: { opacity: 1, scale: 1, transition: { duration: 0.16, ease: "easeOut" } },
  dialogExit: { opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: "easeIn" } },
  pageEnter: { opacity: 1, transition: { duration: 0.15, ease: "easeOut" } },
} as const;
