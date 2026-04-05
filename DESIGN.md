# Ventured — Ledger Design System

A **dark-first, financial terminal** aesthetic for the Ventured client.
Warm zinc neutrals · gold accent · data-dense · WCAG AA accessible.

---

## Table of Contents

0. [Terminology](#0-terminology)
1. [Principles](#1-principles)
2. [Color Tokens](#2-color-tokens)
3. [Dark & Light Mode](#3-dark--light-mode)
4. [Typography](#4-typography)
5. [Spacing & Layout](#5-spacing--layout)
6. [Border Radius](#6-border-radius)
7. [Shadows & Elevation](#7-shadows--elevation)
8. [Component Index](#8-component-index)
9. [UI Primitive Reference](#9-ui-primitive-reference)
10. [Existing Components](#10-existing-components)
11. [3D Overlay UI](#11-3d-overlay-ui)
12. [Accessibility](#12-accessibility)
13. [Do's and Don'ts](#13-dos-and-donts)

---

## 0. Terminology

| Backend term | Client-facing term | Notes |
|-------------|-------------------|-------|
| `tick` | **day** | The game runs in ticks (1 tick = 1 minute real time = 1 game day). In the client we always say "day" or "days", never "tick". Exception: internal variable names may use `tick` for API compatibility, but user-visible labels must say "day". |
| `quantity_per_tick` | **target stock** | The amount of a resource a buy order aims to keep in stock each day. |
| `cents` | show as **€X.XX** | All monetary values are stored in cents. Always display through `fmtMoney()`. |

---

## 1. Principles

| Principle | Description |
|-----------|-------------|
| **Terminal-first** | Every screen should feel like a sophisticated financial terminal, not a consumer app. Data is the hero. |
| **Dark as default** | The game is played at all hours. Dark mode is the primary experience. Light mode is an opt-in. |
| **Warm, not sterile** | Zinc/stone neutrals instead of cold blue-grays. The palette references aged ledger paper and raw industry. |
| **Gold = value** | The primary accent is gold/amber. It represents money, the "bottom line", and calls to action. Never use blue or indigo for primary actions. |
| **Data density** | Monospace font everywhere. Tabular numbers always. Avoid decorative spacing that hides data. |
| **No defaults** | Never ship a component using Tailwind's default gray, indigo, or `bg-white`. These bypass the theme and break dark mode. |

---

## 2. Color Tokens

All color values are defined as CSS custom properties in `client/src/index.css`.
They are mapped into Tailwind via `tailwind.config.js`.

### Neutral Scale — Warm Zinc

The `gray-*` scale is remapped from Tailwind's cold blue-gray to warm zinc/stone.
**The scale inverts in dark mode** — see §3 for details.

| Token | Light value | Dark value | Common use |
|-------|------------|-----------|------------|
| `gray-50`  | `#fafaf9` | `#0c0a09` | hover bg, elevated surface |
| `gray-100` | `#f5f5f4` | `#1c1917` | **page background** |
| `gray-200` | `#e7e5e4` | `#292524` | **card/panel background**, borders |
| `gray-300` | `#d6d3d1` | `#3c3734` | dividers, subtle borders |
| `gray-400` | `#a8a29e` | `#57534e` | placeholder text, disabled |
| `gray-500` | `#78716c` | `#78716c` | muted text (same both modes) |
| `gray-600` | `#57534e` | `#a8a29e` | secondary / helper text |
| `gray-700` | `#44403c` | `#d6d3d1` | body text |
| `gray-800` | `#292524` | `#e7e5e4` | strong emphasis |
| `gray-900` | `#1c1917` | `#f5f5f4` | **primary text** |
| `gray-950` | `#0c0a09` | `#fafaf9` | near-black / near-white |

### Gold Accent — Primary Brand Colour

`indigo-*` utilities are remapped to gold. Use `indigo-400/500/600` in components as usual —
or use the new `gold-*` semantic tokens in new components.

| Token | Light value | Dark value | Common use |
|-------|------------|-----------|------------|
| `gold` / `indigo-400` | `#b45309` (amber-700) | `#f59e0b` (amber-400) | icon colour, text accent, logo |
| `gold.mid` / `indigo-500` | `#a14407` (amber-800) | `#d97706` (amber-600) | focus ring, hover text |
| `gold.deep` / `indigo-600` | `#d97706` (amber-600) | `#b45309` (amber-700) | **primary button background** |
| `gold.muted` / `indigo-900` | `#fef3c7` (amber-100) | `#451a03` (amber-950) | tinted badge / wash bg |
| `gold.fg` | `#1c1917` | `#0c0a09` | **text ON a gold background** — always use this for button labels |

> **Contrast note:** Gold shades are calibrated per mode. Amber-700 in light mode (vs. `#f5f5f4` bg) reaches 5.5:1. Amber-400 in dark mode (vs. `#1c1917` bg) reaches 7.2:1. Always use `text-gray-900` (which becomes light in dark mode) **or** `text-gold-fg` for text on gold backgrounds.

### Status / Semantic Colours

These are **unchanged** from Tailwind defaults — they read correctly on both dark and light backgrounds.

| Semantic | Token | Value | Use |
|----------|-------|-------|-----|
| Profit / Success | `emerald-400` | `#34d399` | positive values, active status |
| Profit muted bg | `emerald-900/40` | `#064e3b` @ 40% | status badge backgrounds |
| Loss / Error | `rose-400` | `#fb7185` | negative values, errors |
| Loss muted bg | `rose-900/40` | `#4c0519` @ 40% | status badge backgrounds |
| Warning | `amber-400` | `#fbbf24` | tick timer urgent, caution |
| Research | `purple-400` | `#a78bfa` | research progress, science |
| Research muted | `purple-900/40` | `#2e1065` @ 40% | research badge backgrounds |
| Info / Build | `cyan-400` | `#22d3ee` | construction events |
| Market / Trade | `teal-400` | `#2dd4bf` | icons, market info |

### What NOT to use

| ❌ Avoid | ✅ Use instead |
|---------|--------------|
| `bg-white` | `bg-gray-200` (card) or `bg-gray-100` (page) |
| `text-black` | `text-gray-900` |
| `border-gray-*` from hardcoded hex in `style={}` | `border border-gray-200` |
| `bg-indigo-*` with `text-white` | `bg-indigo-600 text-gray-900` (dark) or `text-gold-fg` |
| Any hardcoded hex in JSX | CSS vars or Tailwind tokens |

---

## 3. Dark & Light Mode

### How it works

Dark mode is toggled via the `dark` class on `<html>`. The CSS variable values flip, and because `gray-*` utilities point to those vars, **every component that uses gray adapts automatically** with no additional code.

```
Light mode (default Tailwind gray)     Dark mode (inverted warm zinc)
─────────────────────────────────     ─────────────────────────────
bg-gray-100  →  #f5f5f4  (light)      bg-gray-100  →  #1c1917  (dark)
text-gray-900  →  #1c1917  (dark)     text-gray-900  →  #f5f5f4  (light)
border-gray-200  →  #e7e5e4           border-gray-200  →  #292524
```

### Toggling from React

```tsx
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('bl-theme', isDark ? 'dark' : 'light');
}
```

The init script in `index.html` reads this preference before first paint, so there is no flash.

### Writing new components for both modes

1. Use `bg-gray-100` for page backgrounds, `bg-gray-200` for cards — never `bg-white`.
2. Use `text-gray-900` for primary text, `text-gray-600` for secondary — never hardcoded hex.
3. Status badge backgrounds should always use the `/40` opacity modifier: `bg-emerald-900/40`.
4. For elements visible over the 3D scene, use the `.overlay-panel` class (see §9).

---

## 4. Typography

**One font family: JetBrains Mono.** The game is API-driven and data-heavy. A monospace font reinforces the terminal identity and aligns all numerical columns without effort.

### Scale

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `text-2xl font-bold` | 24px 700 | Page headings (`h1`) |
| `text-xl font-bold` | 20px 700 | Section headings |
| `text-sm font-semibold` | 14px 600 | Panel titles, table headers |
| `text-sm` | 14px 400 | Body copy, descriptions |
| `text-xs` | 12px 400 | Labels, metadata, captions |
| `text-[10px]` | 10px 400 | Tick stamps, fine print only |

### Numbers

Because `font-variant-numeric: tabular-nums` is set globally, all numeric output in the game automatically aligns in columns. Do not disable this.

For currency and large numbers, always use the `fmtMoney()` / `fmtPct()` helpers from `types.ts`.

### Letter spacing

| Use | Class |
|-----|-------|
| Section labels / nav items | `tracking-wide` or `tracking-wider` |
| ALL-CAPS labels above fields | `uppercase tracking-wider` |
| Logo / brand text | `tracking-widest` |
| Normal body text | (default — no class needed) |

---

## 5. Spacing & Layout

### Page layout

```
┌─────────────────────────────────────┐
│  Header  h-12  bg-gray-100           │ ← nav bar
├─────────────────────────────────────┤
│                                     │
│  <main>  p-6  space-y-6             │ ← standard screens
│                                     │
│  <main overflow-hidden flex-col>    │ ← map / chat screens
│                                     │
└─────────────────────────────────────┘
```

### Content rhythm

Use `space-y-6` between top-level sections and `space-y-3` or `space-y-4` inside cards.

### Grid conventions

| Pattern | Classes |
|---------|---------|
| Stat cards row | `grid grid-cols-2 lg:grid-cols-4 gap-4` |
| Two-column form | `grid grid-cols-2 gap-3` |
| Data table | `<table className="w-full text-xs">` with `th` cells having `uppercase tracking-wider` |

---

## 6. Border Radius

The design system uses **deliberately angular** radii. This signals precision and corporate discipline — not softness.

| Token | Value | Use |
|-------|-------|-----|
| `rounded-sm` | 2px | Inline badges, tiny chips |
| `rounded` (default) | 3px | Inputs, selects |
| `rounded-md` | 4px | Buttons |
| `rounded-lg` | 6px | Cards, panels, modals |
| `rounded-xl` | 8px | Floating overlays, dropdowns |
| `rounded-2xl` | 12px | Large overlay panels |
| `rounded-full` | 9999px | Pills, avatar indicators |

---

## 7. Shadows & Elevation

Three elevation levels, all aware of the current mode's edge colour:

| Class | Use |
|-------|-----|
| `shadow-panel` | Standard card / panel (border + soft drop shadow) |
| `shadow-panel-lg` | Modal, large side-panel |
| `shadow-overlay` | Floating element over the 3D scene |

The `Panel` component in `components/Panel.tsx` applies no shadow by default — pass `className="shadow-panel"` when needed.

For scrim (modal backdrop): `bg-black/70 backdrop-blur-sm`

---

## 8. Component Index

### `src/components/ui/` — Design System Primitives

Import from the barrel: `import { Button, Badge, … } from '../components/ui'`

| Component | File | Purpose |
|-----------|------|---------|
| **Button** | `ui/Button.tsx` | All interactive buttons — primary, secondary, ghost, danger |
| **Badge** | `ui/Badge.tsx` | Status/category inline labels; includes `BUILDING_STATUS_VARIANT` map |
| **StatCard** | `ui/StatCard.tsx` | KPI summary tile — label, large value, optional sub-line |
| **ProgressBar** | `ui/ProgressBar.tsx` | Themed progress bars with optional label + percentage |
| **EmptyState** | `ui/EmptyState.tsx` | Zero-content placeholder — emoji, message, optional CTA |
| **Spinner** | `ui/Spinner.tsx` | Inline animated loading indicator |
| **Tabs** | `ui/Tabs.tsx` | Underline tab strip with optional count badges |
| **SectionHeader** | `ui/SectionHeader.tsx` | Screen-level `<h1>` + subtitle + right-aligned action |

### `src/components/` — Business Components

| Component | Purpose |
|-----------|---------|
| **Layout** | App shell: top nav bar, tick countdown, balance, logout |
| **Panel** | Primary content container (header, body, footer, subheader slots) |
| **Modal** + `Field` + `Input` + `Select` | Dialog overlay with form field primitives |
| **SettingsModal** | Multi-tab settings popup (Theme + About); opened from the gear icon in the nav |
| **EtaCountdown** | Live countdown for building construction time remaining |
| **MarketShareChart** | Recharts area chart of citizen market share by player |
| **CompanyList** | 3D-map sidebar — buildings grouped by company or type |
| **ChatOverlay** | Floating chat panel (city + DM) anchored to bottom-left of map |
| **EventLogOverlay** | Floating live-event feed with category filters, anchored bottom-right |
| **UnifiedChatPanel** | Full-screen chat (used in `/chat` route) |
| **AutoSellSection** | Auto-sell configuration for stores |
| **BankPanel** | Banking / balance management panel |
| **SupplySection** | Supply agreement configuration within tile details |
| **PoliticsPanel** | City politics overview and election actions |
| **EventFeed** | Compact event list (used inside other panels) |

### `src/components/` — 3D Scene

These components render exclusively inside the Three.js canvas. Do not apply Tailwind classes directly inside them.

| Component | Purpose |
|-----------|---------|
| **CityScene3D** | Root Three.js canvas + camera + keyboard controls |
| **TileGrid3D** | Renders the isometric city tile grid |
| **BuildingMeshes** | 3D building geometry per tile |
| **TileSelector3D** | Raycasting-based tile selection |
| **TileTooltip3D** | HTML tooltip that follows the 3D cursor |
| **TileDecorations** | Decorative props on tiles (trees, fences, etc.) |
| **RoadNetwork3D** | Procedural road network geometry |
| **FarmAnimals** | Animated animal meshes for farm tiles |
| **MapBorder** | Edge border geometry for the city grid |

---

## 9. UI Primitive Reference

### Button

```tsx
import { Button } from '../components/ui';

// Primary (default)
<Button onClick={…}>Save Changes</Button>

// With icon and loading state
<Button variant="primary" icon={<Plus size={14} />} loading={isSaving}>
  New Building
</Button>

// Variants
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">See more</Button>
<Button variant="danger">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium (default)</Button>
<Button size="lg">Large</Button>
```

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `icon` | `ReactNode` | — | Rendered left of the label |
| `loading` | `boolean` | `false` | Shows spinner, disables interaction |

---

### Badge

```tsx
import { Badge, BUILDING_STATUS_VARIANT } from '../components/ui';

// Status variants
<Badge variant="success">Producing</Badge>
<Badge variant="warning">Building</Badge>
<Badge variant="danger">Missing Resources</Badge>
<Badge variant="research">Active</Badge>
<Badge variant="info">World</Badge>

// Dot-only (used in building lists)
<Badge variant="success" dot />

// Map from building status string
<Badge variant={BUILDING_STATUS_VARIANT[building.status]}>
  {STATUS_LABEL[building.status]}
</Badge>
```

| Variant | Background | Text |
|---------|-----------|------|
| `default` | `gray-200` | `gray-600` |
| `success` | `emerald-900/40` | `emerald-400` |
| `warning` | `amber-900/40` | `amber-400` |
| `danger` | `rose-900/40` | `rose-400` |
| `paused` | `yellow-900/40` | `yellow-400` |
| `info` | `indigo-900/40` | `indigo-400` (gold) |
| `research` | `purple-900/40` | `purple-400` |

---

### StatCard

```tsx
import { StatCard } from '../components/ui';

<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard label="Balance"    value={fmtMoney(balance)} accent="text-emerald-400" />
  <StatCard label="Buildings"  value="12" sub="3 producing · 1 idle" />
  <StatCard label="Reputation" value={fmtPct(rep)} accent="text-rose-400" />
</div>
```

---

### ProgressBar

```tsx
import { ProgressBar } from '../components/ui';

<ProgressBar value={0.65} variant="research" label="Grain Lv3" showPct />
<ProgressBar value={0.3}  variant="profit"  size="sm" />
<ProgressBar value={0.9}  variant="danger"  label="Capacity" showPct />
```

| Variant | Fill |
|---------|------|
| `default` | `bg-indigo-500` (gold) |
| `research` | purple → gold gradient |
| `profit` | `bg-emerald-400` |
| `danger` | `bg-rose-400` |

---

### EmptyState

```tsx
import { EmptyState } from '../components/ui';
import { Button }     from '../components/ui';

<EmptyState
  icon="🏗️"
  message="No buildings yet — buy a tile on the City Map."
  border="dashed"
/>

<EmptyState
  icon="🔬"
  message="No research running."
  action={<Button onClick={startResearch}>Start Research</Button>}
/>
```

---

### Spinner

```tsx
import { Spinner } from '../components/ui';

<Spinner />                            // medium, gold
<Spinner size="sm" />
<Spinner className="text-emerald-400" />

// In a full-screen loading state:
<div className="flex items-center gap-2 text-gray-500 text-sm">
  <Spinner size="sm" /> Loading…
</div>
```

---

### Tabs

```tsx
import { Tabs } from '../components/ui';

const TABS = [
  { value: 'city', label: 'City Chat' },
  { value: 'dm',   label: 'Direct Messages', count: unreadDm },
];

<Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} />
```

---

### SectionHeader

```tsx
import { SectionHeader, Button } from '../components/ui';
import { Plus } from 'lucide-react';

<SectionHeader
  title="Research"
  sub="Improve quality to beat the city median."
  action={
    <Button icon={<Plus size={14} />} onClick={…}>
      Start Research
    </Button>
  }
/>
```

---

## 10. Existing Components

### Panel

`components/Panel.tsx` — the primary content container for all screens.

```tsx
<Panel title="Your Buildings" headerActions={<button>…</button>}>
  {/* scrollable body */}
</Panel>

// Compact variant for nested sub-cards:
<Panel compact title="Inventory" className="shadow-panel">
```

> **Migration note:** The component currently uses `bg-white`. New components and screens should use `bg-gray-200` instead, which correctly adapts to dark mode.

### Modal + Field + Input + Select

`components/Modal.tsx` — full-screen scrim with centered dialog and form primitives.

```tsx
<Modal title="Buy Tile" onClose={onClose} onSubmit={onBuy} submitLabel="Purchase">
  <Field label="Price">
    <Input type="number" value={price} onChange={…} />
  </Field>
  <Field label="Building Type">
    <Select value={type} onChange={…}>
      <option value="factory">Factory</option>
    </Select>
  </Field>
</Modal>
```

- Scrim: `bg-black/70 backdrop-blur-sm`
- Primary button: `bg-indigo-600 text-gray-900` (gold bg, dark label)
- Input/Select anatomy: `bg-gray-100 border border-gray-200 rounded focus:border-indigo-500`

### Navigation

`components/Layout.tsx` — do not put nav links outside this component.

- Active item: `bg-gray-200 text-gray-900`
- Inactive: `text-gray-600 hover:text-gray-900 hover:bg-gray-200/60`
- Logo: `text-indigo-400 font-bold tracking-widest` (resolves to gold)

### EtaCountdown

```tsx
<EtaCountdown ticks={b.construction_ticks_remaining} nextTickAt={nextTickAt} />
// Renders: "4m 12s" or "almost done"
// Default class: text-amber-400 text-xs font-mono
```

### MarketShareChart

```tsx
<MarketShareChart cityId={cityId} historyTicks={60} />
```

Renders a stacked area chart of citizen market share over the last N ticks.



---

## 11. 3D Overlay UI

Panels that float over the Three.js `CityScene3D` have special requirements:

1. **Use `.overlay-panel`** — provides warm semi-transparent bg + `backdrop-filter: blur(12px)`.
2. **Use `shadow-overlay`** — deeper shadow with coloured border ring.
3. **Position with `absolute` / `z-[1001]+`** to clear the Three.js canvas.
4. **Avoid `bg-white`** — it destroys the see-through effect.

```tsx
// ✅ Correct overlay panel
<div className="absolute bottom-4 right-4 z-[1001] overlay-panel rounded-xl shadow-overlay w-80 p-3">
  …
</div>

// ❌ Incorrect — opaque, ignores theme
<div style={{ background: 'rgba(255,255,255,0.97)' }}>
```

The `--overlay-bg` and `--overlay-border` CSS vars automatically switch between a warm warm parchment (light) and charcoal (dark) tone.

### Overlay panel header pattern

```tsx
<div className="flex items-center gap-2 px-3 py-2 border-b border-gray-300/40 shrink-0">
  <SomeIcon size={11} className="text-gold" />
  <span className="text-xs font-semibold text-gray-900 flex-1">Panel Title</span>
  <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
    <X size={13} />
  </button>
</div>
```

---

## 12. Accessibility

### Colour contrast requirements (WCAG AA)

| Foreground | Background | Ratio | Status |
|------------|------------|-------|--------|
| `text-gray-900` | `bg-gray-100` | ≥ 7:1 | ✅ Both modes |
| `text-gray-700` | `bg-gray-100` | ≥ 5:1 | ✅ Both modes |
| `text-gray-600` | `bg-gray-100` | ≥ 4.5:1 | ✅ Both modes |
| `text-gold` (light: amber-700) | `bg-gray-100` | 5.5:1 | ✅ |
| `text-gold` (dark: amber-400) | `bg-gray-100 dark` | 7.2:1 | ✅ |
| `text-gray-900` | `bg-indigo-600` (gold button) | 5.3:1 | ✅ |
| `text-emerald-400` | `bg-gray-100 dark` | 4.8:1 | ✅ |
| `text-rose-400` | `bg-gray-100 dark` | 5.1:1 | ✅ |

### Rules

- **Never place `text-gray-400` on `bg-gray-100`** — both light/dark pass but only just; reserve for truly decorative text.
- **Interactive elements** must have a visible focus ring. Use `focus:border-indigo-500` (gold) or `focus-visible:ring-2 focus-visible:ring-gold`.
- **Icon-only buttons** must have a `title` or `aria-label`.
- **Status badges** must not rely solely on colour — always include a text label.
- **Tabular numbers** are enabled globally. Do not override with `proportional-nums`.

---

## 13. Do's and Don'ts

### ✅ Do

```tsx
// Use semantic gray tokens — they flip for dark mode automatically
<div className="bg-gray-100">
  <h2 className="text-gray-900 font-semibold text-sm">Title</h2>
  <p className="text-gray-600 text-xs">Helper text</p>
</div>

// Use gold (via indigo) for primary actions
<button className="bg-indigo-600 hover:bg-indigo-500 text-gray-900 rounded-md px-4 py-2 text-sm">
  Confirm
</button>

// Use .overlay-panel for anything over the 3D scene
<div className="overlay-panel rounded-xl shadow-overlay p-4">
  …
</div>

// Format money / pct through helpers
<span className="text-emerald-400 font-mono">{fmtMoney(balance)}</span>

// Status badge with muted bg + matching text
<span className="bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded-sm text-xs">
  Producing
</span>
```

### ❌ Don't

```tsx
// Never hardcode background colour in style prop
<div style={{ background: '#ffffff' }}>      {/* breaks dark mode */}
<div style={{ background: 'rgba(255,255,255,0.97)' }}>  {/* use .overlay-panel */}

// Never use bg-white for cards
<div className="bg-white border border-gray-200">  {/* use bg-gray-200 */}

// Never use text-white on anything
<button className="bg-indigo-600 text-white">  {/* use text-gray-900 */}

// Never use raw Tailwind indigo for anything other than the gold mapping
// (i.e. don't use indigo shades outside 300–600 range)
<div className="bg-indigo-100">  {/* not mapped — will render Tailwind's default */}

// Never skip the alpha-value modifier on opacity backgrounds
<div className="bg-emerald-900 opacity-40">  {/* use bg-emerald-900/40 instead */}
```

---

## Appendix: CSS Variable Reference

All variables live in `client/src/index.css`.

```css
/* Set in :root (light) and .dark */
--gray-50  … --gray-950   /* warm zinc neutral scale */
--gold-300 … --gold-muted /* gold accent scale */
--gold-fg                 /* near-black for text on gold */
--overlay-bg              /* rgba() overlay panel bg */
--overlay-border          /* rgba() overlay panel border */
```

To add a new mode-aware colour, add a CSS variable in both `:root` and `.dark`, then expose it in `tailwind.config.js` under `theme.extend.colors`.
