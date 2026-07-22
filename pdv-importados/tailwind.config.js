/** @type {import('tailwindcss').Config} */
module.exports = {
  /*
   * Fase 0 — Layout Compiler: modo escuro desativado. O tema é único (claro).
   * Fase 2 · Onda 2 — escalas tipográficas / radius / spacing do SSOT.
   */
  darkMode: ["class", ".theme-dark-disabled"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--color-border)",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "var(--color-brand)",
          foreground: "var(--color-fg-on-brand)",
        },
        secondary: {
          DEFAULT: "var(--color-surface-soft)",
          foreground: "var(--color-fg)",
        },
        destructive: {
          DEFAULT: "var(--color-danger)",
          foreground: "var(--color-fg-on-danger)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          foreground: "var(--color-fg-on-success)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          foreground: "var(--color-warning-fg)",
        },
        muted: {
          DEFAULT: "var(--color-surface-muted)",
          foreground: "var(--color-fg-muted)",
        },
        accent: {
          DEFAULT: "var(--color-brand)",
          foreground: "var(--color-fg-on-brand)",
        },
        popover: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-fg)",
        },
        card: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-fg)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          soft: "var(--color-surface-soft)",
          muted: "var(--color-surface-muted)",
        },
        fg: {
          DEFAULT: "var(--color-fg)",
          muted: "var(--color-fg-muted)",
          subtle: "var(--color-fg-subtle)",
          disabled: "var(--color-fg-disabled)",
        },
        brand: {
          DEFAULT: "var(--color-brand)",
          strong: "var(--color-brand-strong)",
        },
        // Compat Jin Long (ponte → SSOT)
        jl: {
          "surface-base": "var(--jl-surface-base)",
          "surface-elev": "var(--jl-surface-elev)",
          "surface-soft": "var(--jl-surface-soft)",
          "border-1": "var(--jl-border-1)",
          "border-2": "var(--jl-border-2)",
          "fg-1": "var(--jl-fg-1)",
          "fg-2": "var(--jl-fg-2)",
          "fg-3": "var(--jl-fg-3)",
          "accent": "var(--jl-accent)",
          "card-l1-bg": "var(--jl-card-l1-bg)",
          "card-l1-border": "var(--jl-card-l1-border)",
          "card-l1-accent": "var(--jl-card-l1-accent)",
          "card-l1-strip": "var(--jl-card-l1-strip)",
          "card-l2-bg": "var(--jl-card-l2-bg)",
          "card-l2-border": "var(--jl-card-l2-border)",
          "card-l3-bg": "var(--jl-card-l3-bg)",
          "card-l3-border": "var(--jl-card-l3-border)",
        },
      },
      borderRadius: {
        none: "var(--radius-none)",
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        panel: "var(--radius-panel)",
      },
      spacing: {
        0: "var(--space-0)",
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
        20: "var(--space-20)",
        24: "var(--space-24)",
      },
      fontSize: {
        display: ["var(--font-size-display)", { lineHeight: "var(--line-height-tight)", fontWeight: "700" }],
        h1: ["var(--font-size-h1)", { lineHeight: "var(--line-height-tight)", fontWeight: "700" }],
        h2: ["var(--font-size-h2)", { lineHeight: "var(--line-height-tight)", fontWeight: "600" }],
        h3: ["var(--font-size-h3)", { lineHeight: "var(--line-height-snug)", fontWeight: "600" }],
        title: ["var(--font-size-title)", { lineHeight: "var(--line-height-snug)", fontWeight: "600" }],
        subtitle: ["var(--font-size-subtitle)", { lineHeight: "var(--line-height-normal)", fontWeight: "500" }],
        body: ["var(--font-size-body)", { lineHeight: "var(--line-height-normal)" }],
        small: ["var(--font-size-small)", { lineHeight: "var(--line-height-normal)" }],
        caption: ["var(--font-size-caption)", { lineHeight: "var(--line-height-normal)" }],
        mono: ["var(--font-size-mono)", { lineHeight: "var(--line-height-normal)" }],
      },
      fontFamily: {
        sans: ["var(--font-family-sans)"],
        mono: ["var(--font-family-mono)"],
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        card: "var(--shadow-card)",
        modal: "var(--shadow-modal)",
        toast: "var(--shadow-toast)",
        focus: "var(--focus-ring-shadow)",
        none: "var(--shadow-none)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      zIndex: {
        dropdown: "var(--z-dropdown)",
        sticky: "var(--z-sticky)",
        fixed: "var(--z-fixed)",
        modal: "var(--z-modal)",
        popover: "var(--z-popover)",
        tooltip: "var(--z-tooltip)",
        toast: "var(--z-toast)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
