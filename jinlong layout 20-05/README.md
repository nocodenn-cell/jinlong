# Jīn Lóng (Dragon POS) — Design System

> A bilingual Portuguese / Simplified Chinese point-of-sale system for stores
> selling imported goods in Brazil. Internal codename **Dragon POS**;
> consumer-facing brand **Jīn Lóng** (金龍, "Golden Dragon").

This design system distills the visual + interaction language of the
[`nocodenn-cell/fastproduct`](https://github.com/nocodenn-cell/fastproduct)
monorepo into a portable folder for designing new screens, slides, and
prototypes against the same brand. Everything here was extracted from
production CSS tokens, branded React components, and the live product UI.

---

## What is Dragon POS / Jīn Lóng?

A **PDV** (*ponto de venda* — point of sale) targeted at retailers selling
imported Chinese goods to Brazilian shopkeepers. The product ships as a
monorepo with two surfaces that share one identity:

| Surface | Stack | Role |
|---|---|---|
| **`pdv-importados`** — Painel Gerente / Caixa Web | Next.js (App Router), React 19, Supabase Auth | Manager + cashier dashboards, fiscal/financial reports, stock, login. Web-served, used on tablets and shop desktops. |
| **`pdv-local`** — PDV Desktop | Tauri 2 + React 19 + Vite + SQLite | Offline-first cashier app for the actual checkout terminal, with an outbox that syncs to Supabase. Same visual language as the web manager. |

Both products are bilingual (PT-BR + 简体中文) — operators are typically
Brazilian-Chinese shopkeepers, so screens carry both Portuguese labels and
Han characters depending on the configured `idioma`. Identity is
unapologetically *oriental + premium*: a golden dragon coiled around a sun,
imperial-red seal stamps for authorisation, jade for confirmed value, slate
+ amber glassmorphism throughout.

### Source repositories (not preloaded — request access if needed)

- **GitHub:** https://github.com/nocodenn-cell/fastproduct
  - Web app: `pdv-importados/`
  - Desktop app: `pdv-local/`
  - Source-of-truth tokens: `pdv-importados/styles/tokens/{base,semantic,component,theme}.css`
  - Branded effects + animations: `pdv-importados/styles/theme-oriental.css`
  - Internal docs: `pdv-importados/DESIGN_SYSTEM_STORYBOOK.md`, `README_DESIGN_SYSTEM.md`

If you want to go deeper than this folder — for instance, recreating a
specific gerente screen exactly — open the GitHub repo and read those token
files alongside the component you need.

---

## Content fundamentals

The product UI is written in **Brazilian Portuguese**, with **Simplified
Chinese** appearing in three roles:

1. **Brand ceremony** — the wordmark line *Jīn Lóng | 金龍* on splash, login, header.
2. **The 印 character** as an authorisation-seal icon (manager-approval flow).
3. **Full Chinese rendering** of any UI string when `idioma=zh` is selected (operators flip language per-shift).

### Tone & voice

- **Direct, operational, lojista-friendly.** This is a tool for shop owners,
  not consumers. Copy stays short, declarative, and informational.
- **`você` is implicit, rarely written.** Action labels are bare verbs:
  *"Finalizar venda"*, *"Abrir caixa"*, *"Importar NF-e"* — not
  *"Finalize sua venda"*. Imperative is the default mode.
- **Section headers are bare nouns**, not sentences:
  *"Carrinho"*, *"Resumo da venda"*, *"Estoque crítico"*, *"Atividades recentes"*.
- **Casing follows Portuguese sentence-case for body**; titles are
  Title Case in the manager dashboard headers. Tracked-out UPPERCASE eyebrows
  appear above subsections (e.g. *"RESUMO DA SEMANA"*). All-caps body is avoided.
- **Numbers always tabular**, currency as `R$ 1.234,56`. Negative values are
  written with a leading minus sign in jade-red (`-R$ 24,50`).

### Emoji and informal motifs

- **Emoji is rare and functional only.** When it appears it carries meaning
  the icon-font cannot: 🔒 for "caixa fechado", 🛒 for empty-cart state, ⚠️ for
  the closed-cashier banner, 📊 for the summary panel. Never decorative.
- **Han characters are used as iconography** for ceremonial moments —
  primarily `印` (yìn, "seal") on the manager-approval chip.

### Examples of in-product copy

| Surface | Real string |
|---|---|
| Login | *"Jīn Lóng &nbsp;\|&nbsp; 金龍"* (wordmark) · *"Entrar"* / *"Entrando…"* (button) |
| Caixa header | *"Caixa: 01"* · *"Operador: João"* · *"⚠️ CAIXA FECHADO"* |
| Caixa empty state | *"Carrinho vazio · Adicione produtos usando o campo de busca abaixo"* |
| Payment buttons | *"PIX (F8)"* · *"CARTÃO (F9)"* · *"DINHEIRO (F10)"* (function-key hint always visible) |
| Gerente KPI | *"Faturamento hoje"* · *"Ticket médio hoje"* · *"vs. dia anterior"* |
| Alert | *"Configure o Supabase no arquivo .env.local e reinicie o servidor."* — instructive, not apologetic |

**Keyboard shortcuts are part of the copy.** PDV operators work blind on the
keyboard; the function-key hint is always rendered next to the label.

---

## Visual foundations

### Colors

Three brand hues + slate neutrals.

| Token | Role | Hex |
|---|---|---|
| `--accent` (Dragon Gold) | All primary CTAs, totals, brand wordmark, highlights | `#fbbf24` (dark) / `#b45309` (light) |
| Dragon Jade `--success` | Confirmed entries, success states, positive deltas | `#10b981` |
| Imperial Red `--danger` | Destructive actions, alerts, seal stamps | `#b91c1c` |
| Night slate `--surface*` | Glass surface base, page background | `#0f172a` → `#020617` |
| Cloud cream `--surface-solid` (light) | Light theme background tint | `#fff7e8` |

Two app themes: **`noturno`** (default — dark slate with bright amber accent;
glassmorphism reads strongest here) and **`novem`** (light — cream + warm
amber, used on optional manager screens).

### Typography

- **Body / UI:** `Noto Sans SC` (covers PT-BR + 简体中文 in one face — this is
  intentional; mixed-language strings render without a font swap).
- **Numbers:** `Inter` with `tabular-nums` + `tnum` features.
- **Han display / ceremonial wordmark:** `Noto Serif SC`, used for `金龍`
  as the **primary brand name** at large size (the product is for a
  Chinese-speaking operator base; Han characters lead, Latin is the
  subtitle).
- **Login wordmark only:** `Cinzel` — a serif with classical letterforms,
  used as the romanization line under `金龍` on the login splash.
- **Operational base size: 15 px** (`0.9375rem`). 16 px is reserved for body
  reading flows; 14 px for compact tables.

### Spacing

4 px scale, with semantic component / layout / section steps. The most-used
gaps in the product are `--space-4` (16, between fields), `--space-6` (24,
section spacing), and `--space-8` (32, between dashboard sections).

### Radii

| Token | Use |
|---|---|
| `--radius-md` (6 px) | Buttons, inputs |
| `--radius-lg` (8 px) | Cards, panels |
| `--radius-xl` (12 px) | Modals, payment buttons, glass cards |
| `--radius-2xl` (16 px) | Mobile-only emphasised CTAs |
| `--radius-full` | Chips, badges, status pills |

### Backgrounds & atmosphere

- **Page background is never flat.** The `caixa-oriental-root` and
  `bg-oriental-clouds` classes layer a `linear-gradient(180deg, #1f2937 → #0b1220)`
  with a small **radial amber bloom** at top-centre (`circle at 50% -10%`).
  A pseudo-element overlays five soft radial "cloud" smears at `opacity: 0.12`.
- **No repeating patterns, no photographic backgrounds.** The hand-drawn
  `chinese-mountains.svg` ribbon is the only ornamental shape, used at very
  low opacity (~0.14) as a foot motif.
- **Imagery is colour-graded warm** — the dragon hero PNGs are gold/amber on
  near-black backgrounds. No cool blues, no monochrome. When a photo is
  needed, the system expects an amber-graded shot, never a stock-cool image.

### Glassmorphism & transparency

- The signature surface is **translucent slate** (`rgba(15, 23, 42, 0.68)`)
  with `backdrop-filter: blur(18px)`. This is canon — every modal, gerente
  card, and caixa panel uses it.
- **`backdrop-filter` is mandatory** on `.dragon-glass-card` and
  `.dragon-glass-backdrop`; remove the blur and the surface looks broken.
- **Insets:** glass cards carry a 1 px white top-inset shadow (`inset 0 1px 0 0 rgb(255 255 255 / 0.04)`)
  to suggest light catching the upper edge.
- **Borders are translucent slate** (`rgba(148, 163, 184, 0.38)`), never
  solid — they need to blend with the blurred backdrop.

### Animation & easing

- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` for everything default;
  `cubic-bezier(0.22, 1, 0.36, 1)` for page-enter "breath".
- **Durations:** 150 ms (buttons, chips), 200 ms (inputs), 300 ms (modals).
- **Three named brand animations:**
  - `dragon-fade-rise` + `dragon-breathe` — the login hero dragon fades up
    then breathes (subtle opacity + drop-shadow pulse, 3.2 s loop).
  - `dragon-orbit` — the loading indicator rotates the dragon icon a full
    1.25 s revolution (the "ouroboros loader").
  - `imperial-seal-breathe` — the 印 chop pulses scale 1 → 1.06 → 1 every
    1.8 s when manager approval is required.
- **Reduced motion is honoured** — `prefers-reduced-motion: reduce` kills
  all brand animations and button transforms; only colour-shift feedback remains.

### Hover, press, focus

- **Hover always combines three things on primary buttons:**
  `filter: brightness(1.08)` + `translateY(-1px)` + the signature amber-tinted
  shadow `0 4px 12px rgba(251, 191, 36, 0.25)`. This "amber bloom" is the
  most consistent visual fingerprint of the system.
- **Neutral hover:** border picks up amber (`border-color: var(--accent)`),
  background mixes 15 % amber into the surface, same translate.
- **Press:** returns to `translateY(0)` with the shallower base shadow.
- **Focus ring:** two-stop amber halo —
  `0 0 0 2px (surface 65%)` + `0 0 0 4px (accent 42%)` — never the browser default.

### Shadows

The system uses two shadow families:

1. **Neutral elevation** (sm → 2xl) — pure black-alpha, for cards/panels.
2. **Amber bloom** — `rgba(251, 191, 36, 0.20–0.25)` — exclusively for
   *hover* states on interactive elements. This is what makes the UI feel
   "warm" instead of "cold-dark".

### Cards

- Default card: `app-card` — `var(--surface)` with `1 px` translucent slate
  border, `--radius-lg` (8 px), `--shadow-sm`, `--space-5` (20 px) padding.
- Elevated card: `app-card-elev` — `var(--surface-elev)` (rgba 0.78),
  `--radius-xl` (12 px), `--shadow-xl` + glass inset, `--space-6` padding.
- **Cards do not use coloured left-borders** — accent comes from the
  *content* (an amber KPI value, a jade chip), not the chrome.

### Layout rules

- **The cashier (`caixa`) viewport is fixed `h-screen`.** Cart list scrolls;
  header, search bar, and payment column do not.
- **Manager dashboards are scrollable** with a sticky top toolbar.
  `--gerente-sticky-top: 6.75rem` reserves header space.
- **Max content width: `max-w-7xl`** (1280 px) for manager pages — wider
  feels marketing-y, narrower feels cramped on shop desktops.
- **Two-column layouts** are 7:3 (cart : payment) at desktop, stacked on mobile.

---

## Iconography

The product uses **three icon vocabularies**, picked deliberately:

1. **Lucide React icons** (CDN-available, MIT) — for all generic UI:
   `QrCode`, `CreditCard`, `Coins`, `Clock`, `DollarSign`, `ShoppingCart`,
   `TrendingUp`, `Percent`, `AlertCircle`, `PackageX`, `Activity`, `Receipt`,
   `Boxes`, `Wallet`. Stroke weight `1.5` is the product default.
   - In this kit, **load Lucide from CDN** (`unpkg.com/lucide-static@latest`)
     and reference glyphs by name. No icons are bundled locally.
2. **Branded PNG / SVG art** for ceremonial moments (`assets/`):
   - `brand-double-dragon.png` — ★ **canonical mark.** Two mirrored dragons
     flanking a lotus, with `金龍` inset between them, baked in brand amber
     (`#fbbf24`) on transparent background. Used as the favicon, the
     gerente top-bar mark, the login hero, and any header lockup. The PNG
     ships pre-tinted, so you can drop it into a slide or doc without any
     CSS filter.
   - `dragon-imperial-amber.png` — legacy solo golden-dragon-around-sun mark.
     Kept for receipts and any backwards-compatible reference, but the
     **canonical mark is the double-dragon lockup above**.
   - `dragon-ouroboros-amber.png` / `dragon-ouroboros-mark.png` —
     ouroboros marks used inside the `dragon-orbit-wrap` loader animation.
   - `dragon-principal-bg.png` / `theme-nuvem-clouds.png` — background
     ornamentation (rarely used at >0.15 opacity).
   - `chinese-mountains.svg` — a low-amplitude mountain-silhouette ribbon
     used as a foot motif at low opacity.
   - `jinlong-lockup.svg` — horizontal lockup combining the canonical mark
     with the `金龍` / *Jīn Lóng* wordmark (used in marketing / receipts).
   - `favicon-icon.svg` — wraps the canonical mark for use as `<link rel="icon">`.
3. **Han characters as icons** — exactly one in product use: `印` ("seal"),
   rendered in the `ImperialSealIcon` component as a rotated stamp (red,
   serif, slightly off-axis). It pulses when manager approval is required.

**No emoji as decoration.** The only emoji in production strings are
functional state markers (🔒 closed, 🛒 empty, ⚠️ warning, 📊 summary).
**No invented SVGs** — when a glyph is needed and Lucide doesn't have it,
substitute the nearest Lucide match and flag it. Hand-rolled
geometric SVG illustrations are not part of the brand.

---

## File index

```
README.md                      ← you are here
SKILL.md                       ← skill descriptor for Claude / Claude Code
colors_and_type.css            ← consolidated tokens (base + semantic + typography)
components.css                 ← signature button / input / badge / card / chip CSS
preview/                       ← Design System tab cards (one card per concept)
assets/                        ← logos, brand marks, dragon art
  brand-double-dragon.png        ← ★ canonical mark (two dragons + 金龍, amber)
  dragon-imperial-amber.png      ← legacy solo dragon (receipts)
  dragon-brand-mark.png          ← alt mark variant
  dragon-ouroboros-amber.png     ← amber ouroboros (loader / decoration)
  dragon-ouroboros-mark.png      ← solid ouroboros mark
  dragon-principal-bg.png        ← gerente background composition
  theme-nuvem-clouds.png         ← cloud-texture overlay
  dragon-jade-emblem.svg         ← SVG wrapper around dragon-imperial-amber
  jinlong-lockup.svg             ← horizontal brand lockup
  chinese-mountains.svg          ← low-opacity foot motif
  favicon-icon.svg               ← favicon source (wraps the canonical mark)
ui_kits/
  login/                       ← login splash (canonical mark, 金龍 primary)
    index.html, *.jsx, README.md
  caixa/                       ← PDV cashier (cart + F-key payment + live total)
    index.html, caixa-extras.css, *.jsx, README.md
  gerente/                     ← manager dashboard (KPIs, sparkline, stock, activity)
    index.html, gerente-extras.css, *.jsx, README.md
```

### Caveats / known substitutions

- **Fonts are loaded from Google Fonts** rather than bundled as TTF — the
  product itself self-hosts a small set, but this kit uses
  `Noto Sans SC`, `Noto Serif SC`, `Inter`, and `Cinzel` from
  `fonts.googleapis.com` so designs render without any setup. If you need
  pixel-exact glyph metrics, copy the product's font files in instead.
- **Icons:** the UI kits inline a few Lucide SVGs directly (search,
  receipt, package-x, etc.) rather than loading the full Lucide icon font.
  If you need many icons in a new design, load the official Lucide CDN
  (`https://unpkg.com/lucide@latest`) — same glyph set the product uses.
- **No printable receipt template** is included — the product's
  `dragon-decreto-frame` (receipt with amber/jade watermark) is documented
  in the original `theme-oriental.css` but not re-implemented here. Open
  an iteration if you need slides or mocks for receipts.
- **The `pdv-local` Tauri desktop app** shares its visual language with
  `pdv-importados` (caixa screen) — the `ui_kits/caixa/` kit covers both.
  If a Tauri-specific component (window chrome, native menu) is needed,
  flag and we'll add it.
- **Mobile layouts** are sketched in the source `CaixaGridLayout.tsx` but
  the UI kits here are desktop-first. The CSS includes mobile hit-target
  overrides at `<640px` but the kit composition stays desktop.

---

## How to use

1. **In an HTML mock or slide:** load `colors_and_type.css` + `components.css`,
   then write markup with the `app-*` and `dragon-*` classes. Wrap the page
   in `<div class="caixa-oriental-root">` for the signature atmospheric bg.
2. **In a React prototype:** copy any of the JSX components out of
   `ui_kits/<surface>/` — they're small, self-contained, and re-use only the
   two CSS files above.
3. **For variations / new screens:** explore the `fastproduct` repo
   alongside this kit for component-level reference.
