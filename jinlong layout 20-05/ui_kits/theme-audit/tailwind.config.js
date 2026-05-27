/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // —— shadcn tokens (HSL) — mantidos ——————————————————————
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // —— Jīn Lóng design-system tokens ——————————————————————————
        // Estes apontam para CSS vars já definidas em colors_and_type.css
        // (`:root, [data-app-theme='noturno']` e `[data-app-theme='novem']`).
        // O valor muda automaticamente conforme o `data-app-theme` ativo.
        //
        // Use SEMPRE estes em vez de classes Tailwind cruas (`bg-slate-950/55`,
        // `text-slate-100`, etc.) — só assim a UI respeita Noturno ↔ Nuvem.
        'jl-surface': 'var(--surface)',
        'jl-surface-soft': 'var(--surface-soft)',
        'jl-surface-overlay': 'var(--surface-overlay)',
        'jl-surface-solid': 'var(--surface-solid)',
        'jl-surface-elev': 'var(--surface-elev)',

        'jl-fg-1': 'var(--fg-1)',
        'jl-fg-2': 'var(--fg-2)',
        'jl-fg-3': 'var(--fg-3)',
        'jl-fg-disabled': 'var(--fg-disabled)',
        'jl-fg-inverse': 'var(--fg-inverse)',

        'jl-border-1': 'var(--border-1)',
        'jl-border-2': 'var(--border-2)',
        'jl-border-strong': 'var(--border-strong)',

        'jl-accent': 'var(--accent)',
        'jl-accent-strong': 'var(--accent-strong)',
        'jl-accent-deep': 'var(--accent-deep)',
        'jl-accent-contrast': 'var(--accent-contrast)',

        'jl-success': 'var(--success)',
        'jl-danger': 'var(--danger)',
        'jl-warning': 'var(--warning)',
        'jl-info': 'var(--info)',
      },
      backgroundImage: {
        'jl-page': 'var(--bg-page)',
      },
      boxShadow: {
        'jl-amber-hover': 'var(--shadow-amber-hover)',
        'jl-amber-soft': 'var(--shadow-amber-soft)',
        'jl-glass-inset': 'var(--shadow-glass-inset)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
