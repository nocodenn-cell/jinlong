---
name: jinlong-design
description: Use this skill to generate well-branded interfaces and assets for Jīn Lóng (金龍 / "Dragon POS"), a bilingual Portuguese / Simplified Chinese point-of-sale system for stores selling imported goods in Brazil. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components (login splash, cashier "caixa" view, manager "gerente" dashboard) for production code or throwaway prototypes/mocks/slides.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available
files. The two source-of-truth files are:

- `README.md` — brand context, content fundamentals, visual foundations,
  iconography, caveats, file index.
- `colors_and_type.css` + `components.css` — load these two stylesheets to
  inherit the entire system (tokens + button/input/badge/card/chip CSS,
  bg-oriental-clouds atmospheric background, dragon brand animations).

If creating visual artifacts (slides, mocks, throwaway prototypes, decks,
etc), **copy assets out** of `assets/` and reference them via relative path
in your static HTML. The dragon emblem, login hero, and ouroboros loader
PNGs do a lot of brand heavy-lifting — use them rather than recreating.

If working on **production code**, you can read the rules in the README to
become an expert in designing with this brand. The original source files
live in https://github.com/nocodenn-cell/fastproduct (`pdv-importados/`
for the Next.js web manager, `pdv-local/` for the Tauri desktop POS).

## Cheat sheet

- **Brand name:** `金龍` (primary, Han, Noto Serif SC) / *Jīn Lóng*
  (romanization, smaller) / "Dragon POS" (internal codename). The product
  is for a Chinese-speaking operator base — **Han leads, romanization is
  the subtitle**, not the other way around.
- **Canonical mark:** `assets/brand-double-dragon.png` — two mirrored
  dragons flanking a lotus with `金龍` inset, baked in brand amber. Drops
  into any artifact without a CSS filter.
- **Accent color:** `#fbbf24` (dark theme) / `#b45309` (light theme). Always
  amber. *Never* introduce a new accent hue.
- **Surface signature:** translucent slate `rgba(15, 23, 42, 0.68)` with
  `backdrop-filter: blur(18px)` on cards/modals, plus a radial amber bloom
  at top-centre of the page bg. Class: `caixa-oriental-root` or
  `bg-oriental-clouds`.
- **Hover signature:** every interactive element gets `translateY(-1px)` +
  `filter: brightness(1.08)` + an **amber-tinted shadow** (rgba 251, 191, 36,
  0.20–0.25). Without this, the UI reads "cold-dark"; with it, "warm-dark".
- **Type:** Noto Sans SC for everything UI (covers PT + 中文 in one face),
  Inter for numbers (tabular-nums), Noto Serif SC for 印 and 金龍 ceremonial
  glyphs, Cinzel for login wordmark only.
- **Iconography:** Lucide (CDN) for generic UI. The canonical brand mark is
  `assets/brand-double-dragon.png` (drop-in amber, no filter needed).
  Legacy single-dragon and ouroboros marks live alongside for receipts +
  loader animations. The character `印` (rotated, imperial-red) is the
  only Han-as-icon.
- **Voice:** Brazilian Portuguese, operational/lojista, imperative verbs.
  Function-key hints `(F8) (F9) (F10)` are part of payment-button copy.
  PT + ZH-CN both ship.

## If the user invokes this skill without other guidance

Ask them what they want to build or design, ask some questions, and act as
an expert designer who outputs **HTML artifacts** _or_ **production code**,
depending on the need. Reference the `ui_kits/` folder for known-good
recreations of the three core product surfaces (login, caixa, gerente) —
copy the JSX components out and remix them; don't redraw from scratch.

Default to producing an HTML file with `colors_and_type.css` +
`components.css` loaded, wrapped in `<div class="caixa-oriental-root">`
for the signature atmospheric background.
