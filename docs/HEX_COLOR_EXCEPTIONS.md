# Hex Color Exceptions & Palette Rationale

This document lists all allowed hex colors across the Playhead frontend codebase, documenting why each color is permitted outside of the 19 primary system tokens.

---

## 1. Core Design System Tokens (19 Colors)
These are the foundational design tokens defined in Foundations/01:

| Hex | Token Name | Usage |
| --- | --- | --- |
| `#181818` | `bg` | Application canvas & base page background |
| `#212121` | `panel` | Sidebar, top header, card body, dialogue boxes |
| `#26272C` | `panel-raised` | Raised surfaces, card tab silhouettes |
| `#2A2B30` | `input` | Input backgrounds, search box, secondary button default |
| `#2C2D33` | `hover` | Interactive hover states, active sidebar nav row |
| `#2E2F34` | `border` | Standard hairline borders, dividers, subtle separators |
| `#424344` | `border-strong` | Active, hover, and focused card & input borders |
| `#FFFFFF` | `text` / `white` | Primary headings, active labels, white button surface |
| `#A3A6AD` | `text-2` | Secondary text, inactive tab labels, muted metadata |
| `#7C7F87` | `text-3` | Tertiary text, timestamp labels, subtle icon fills |
| `#4876F3` | `accent` | Brand interactive accent, focus rings, link hover |
| `#3B67E0` | `button` | Primary button background |
| `#3560D6` | `button-hover` | Primary button hover state |
| `#3FCF8E` | `success` | Approved status badge, spreadsheet brand green |
| `#FFBB56` | `warning` | Video card category, Needs review chip, timeline mark |
| `#F0506E` | `danger` | Delete dialogs, error alerts, Changes requested chip |
| `#9787FF` | `purple` | Music category, Team only confidential badge |
| `#FA457B` | `pink` | Image category, notification badge, reviews counter |
| `#000000` | `black` | High-contrast overlays, pure black video backdrops |

---

## 2. Google Brand Authentication Colors (4 Colors)
Used solely for the official Google SVG logo on the "Continue with Google" sign-in button:
- `#4285F4` (Google Blue)
- `#34A853` (Google Green)
- `#FBBC05` (Google Yellow)
- `#EA4335` (Google Red)

---

## 3. Video Review Drawing Canvas Palette (14 Colors)
Video frame drawing annotations require distinct pen colors so reviewers can mark footage clearly:
- `#FF3B30`, `#FF5500`, `#FF9500`, `#FFB800`, `#FFCC00`, `#EAB308` (Reds, Oranges, Yellows)
- `#34C759`, `#10B981` (Greens)
- `#007AFF`, `#3B82F6`, `#0088FF` (Blues)
- `#AF52DE`, `#8B5CF6`, `#EC4899`, `#FF2D55`, `#FF334B` (Purples & Pinks)

---

## 4. User Avatar Palette (24 Colors)
To ensure every collaborator and client contact has an identifiable avatar background color without requiring manual configuration:
- Pastels & jewel tones: `#E57373`, `#F06292`, `#BA68C8`, `#9575CD`, `#7986CB`, `#64B5F6`, `#4FC3F7`, `#4DD0E1`, `#4DD6AC`, `#81C784`, `#AED581`, `#FFB74D`, `#FF8A65`, `#A1887F`, `#90A4AE`, `#17A2B8`, `#7048E8`, `#F03E3E`, `#C2410C`, `#7C3AED`, `#0F766E`, `#B45309`, `#0E7490`, `#6D28D9`.

---

## 5. Spreadsheet Cell & Text Highlight Palette (24 Colors)
Used inside the FortuneSheet spreadsheet editor for table cell fills and font formatting:
- Grayscale & Neutrals: `#F8F9FA`, `#E9ECEF`, `#DEE2E6`, `#CED4DA`, `#ADB5BD`, `#6C757D`, `#495057`, `#343A40`, `#212529`
- Soft Pastels: `#DBEAFE`, `#BFDBFE`, `#93C5FD`, `#DCFCE7`, `#BBF7D0`, `#86EFAC`, `#FEF3C7`, `#FDE68A`, `#FCD34D`, `#FEE2E2`, `#FECACA`, `#FCA5A5`, `#F3E8FF`, `#E9D5FF`, `#D8B4FE`

---

## 6. Status Chip Colors (12 Shades)
For the 6 defined asset and spreadsheet row statuses (Background at 16% opacity and border/text):
- Not started: `#2A2B30`, `#3F4045`, `#9CA3AF`, `#6B7280`
- Editing: `#1E293B`, `#2563EB`, `#60A5FA`
- Needs review: `#451A03`, `#FFBB56`, `#FBBF24`
- Changes requested: `#450A0A`, `#F0506E`, `#F87171`
- Approved: `#064E3B`, `#059669`, `#34D399`
- Delivered: `#2E1065`, `#7C3AED`, `#C084FC`

---

## 7. Card Shapes Silhouette Previews (11 Colors)
Exact preview colors extracted from `Boards/02 Components/11-card-shapes.svg` for mini artwork cards:
- `#1B1C20`, `#3A3C44`, `#F4F2EE`, `#2B2B2B`, `#C9C4BA`, `#3D5A80`, `#E0C3A3`, `#F2B134`, `#5B3A29`, `#F1D3B3`, `#E76F51`, `#264653`, `#E9C46A`, `#2A9D8F`.

---

## 8. Document & PDF Print Surface (2 Colors)
White paper document previews:
- `#FFFFFF` (Document canvas)
- `#F8F9FA` (Print preview page border contrast)
