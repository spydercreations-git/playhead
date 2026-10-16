# Playhead Icon System

## Overview

Playhead uses **Google Material Symbols Rounded, Weight 300** exclusively. All icons are rendered as pure inline SVGs (not icon fonts) to prevent layout shifts, ensure instant SSR rendering, and maintain crisp subpixel alignment across all display resolutions.

The legacy `lucide-react` dependency has been completely removed from `apps/web/package.json`. All 56+ frontend files now import icons directly from `@/components/ui/icon`.

---

## Architecture

The icon system consists of two primary files:

1. **`apps/web/src/components/ui/icon-data.ts`**
   - Contains 145+ pre-extracted, optimized SVG path strings (`viewBox="0 -960 960 960"`) corresponding to Google Material Symbols Rounded 300.
   - Includes bidirectional mapping between legacy PascalCase Lucide icon names (e.g. `FolderPlus`, `MoreHorizontal`, `Sparkles`) and canonical snake_case Material Symbol names (e.g. `create_new_folder`, `more_horiz`, `auto_awesome`).
   - Supports outline and filled path variants.

2. **`apps/web/src/components/ui/icon.tsx`**
   - The universal `<Icon name="..." />` component.
   - `createIcon(name)` factory function providing drop-in compatibility for named component imports (e.g. `import { Plus, Check, Trash } from "@/components/ui/icon"`).
   - Backwards-compatible `LucideIcon` type export.

---

## Icon Specifications

| Size | Pixels | Usage |
|---|---|---|
| Compact | 16px | Inline metadata, badges, table actions, compact dropdowns |
| Default Inline | 18px | Chips, card actions, file type indicators |
| Standard UI | 20px | Navigation items, buttons, form controls, search bars |
| Large / Hero | 24px | Top bar actions, modal headers, empty state graphics |

### Style Rules
- **Stroke/Weight**: 300 (Google Material Symbols Rounded 300).
- **Style**: Outline by default.
- **Filled**: Reserved strictly for active or selected states (e.g., active sidebar navigation item, starred items, selected tabs) via the `filled` boolean prop.
- **Color**: Automatically inherits text color (`currentColor`) unless overridden via `color` or Tailwind `text-*` classes.
- **Motion**: Icons inherit parent component micro-interactions (hover scale 1.015, active press 0.98).

---

## Usage Examples

### 1. Direct Component Import (Preferred)
```tsx
import { Plus, Folder, Trash, Star } from "@/components/ui/icon";

export function ActionButtons() {
  return (
    <div className="flex items-center gap-2">
      <button className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-white/80">
        <Plus size={18} />
        New
      </button>
      <Star size={18} filled className="text-amber-400" />
    </div>
  );
}
```

### 2. Universal `<Icon />` Component
```tsx
import { Icon } from "@/components/ui/icon";

export function DynamicIcon({ name, active }: { name: string; active?: boolean }) {
  return <Icon name={name} size={20} filled={active} className="text-[#F2F2F2]" />;
}
```

### 3. File Type Badges & Legacy Helpers
```tsx
import { FileTypeBadge, PlayheadIcon, PlayheadLogoWithText } from "@/components/icons";

// Renders 32px circular icon badge with type-specific color tint
<FileTypeBadge type="video/mp4" size={32} color="#FFBB56" withBackground />
```

---

## Supported Material Symbols

Every symbol used in Playhead Figma designs (`Boards/01 Foundations`, `Boards/02 Components`, `Boards/03 Modals`, `Pages/P01`–`P29`) is cataloged, including:

- **Navigation**: `home`, `cloud`, `corporate_fare`, `folder_open`, `description`, `table_chart`, `rate_review`, `share`, `star`, `delete`, `group`, `settings`, `storage`
- **Actions**: `add`, `upload`, `download`, `search`, `edit`, `content_copy`, `refresh`, `close`, `more_horiz`, `more_vert`, `filter_list`, `sort`
- **Media**: `movie`, `image`, `music_note`, `play_arrow`, `pause`, `volume_up`, `volume_off`, `fullscreen`
- **Status & Feedback**: `check`, `check_circle`, `error`, `warning`, `info`, `help`, `lock`, `lock_open`, `visibility`, `visibility_off`
- **Collaboration**: `chat_bubble`, `comment`, `history`, `schedule`, `bookmark`, `thumb_up`, `sentiment_satisfied`, `auto_awesome`
