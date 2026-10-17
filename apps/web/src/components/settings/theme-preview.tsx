// apps/web/src/components/settings/theme-preview.tsx
// One component draws all 6 theme cards from the REAL tokens.
// How: each card sets data-theme="<name>" on its own wrapper, so var(--panel), var(--button) etc.
// inside it resolve to THAT theme's colours (globals.css selectors must be [data-theme="..."], not only on <html>).

"use client";

import { Icon } from "@/components/ui/icon";

export const THEMES = [
  { id: "blue", name: "Blue", sub: "Midnight" },
  { id: "green", name: "Green", sub: "Forest" },
  { id: "yellow", name: "Yellow", sub: "Sunburst" },
  { id: "purple", name: "Purple", sub: "Violet" },
  { id: "orange", name: "Orange", sub: "Ember" },
  { id: "pink", name: "Pink", sub: "Rose" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

function MiniApp() {
  return (
    <div className="relative h-[120px] overflow-hidden rounded-lg bg-[var(--bg)]">
      {/* bottom glow, same token as the app */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--bg-glow)" }} />
      {/* sidebar */}
      <div className="absolute inset-y-0 left-0 w-11 border-r border-[var(--border)] bg-[var(--panel)] p-2">
        <div className="mb-2 h-2 w-7 rounded-sm bg-[var(--button)]" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mb-2 h-1 w-6 rounded-sm bg-[var(--text-3)] opacity-60" />
        ))}
      </div>
      {/* content */}
      <div className="absolute inset-y-0 left-11 right-0 p-3">
        <div className="mb-2 h-1.5 w-16 rounded-sm bg-[var(--text)] opacity-70" />
        <div className="mb-3 flex gap-1">
          <div className="h-3.5 w-7 rounded bg-[var(--button)]" />
          <div className="h-3.5 w-7 rounded border border-[var(--border)] bg-[var(--panel)]" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 rounded-md border border-[var(--border)] bg-[var(--panel)]" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ThemePreviewCard({
  theme,
  selected,
  onSelect,
}: {
  theme: (typeof THEMES)[number];
  selected: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${theme.name} theme`}
      onClick={() => onSelect(theme.id)}
      className={[
        "group w-full rounded-xl border bg-[var(--panel)] p-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        selected ? "border-2 border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--border-strong)]",
      ].join(" ")}
    >
      {/* only the mini app uses the card's own theme */}
      <div data-theme={theme.id}>
        <MiniApp />
      </div>
      <div className="flex items-center justify-between px-1 pb-0.5 pt-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">{theme.name}</div>
          <div className="text-xs text-[var(--text-3)]">{theme.sub}</div>
        </div>
        {selected && (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--accent)]">
            <Icon name="check" size={16} className="text-white" />
          </span>
        )}
      </div>
    </button>
  );
}

export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (id: ThemeId) => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-4">
      {THEMES.map((t) => (
        <ThemePreviewCard key={t.id} theme={t} selected={t.id === value} onSelect={onChange} />
      ))}
    </div>
  );
}
