import Link from "next/link"

export default function JinlongDesignDemo() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--dragon-gold,#d4af37)]/5 via-transparent to-transparent" />
        <div className="mx-auto max-w-4xl">
          <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
            <span className="dragon-gold-text">金龍</span>
            <span className="ml-3 text-foreground">Jinlong</span>
          </h1>
          <p className="mt-4 text-2xl font-medium text-muted-foreground">
            Dragon POS Design System
          </p>
          <p className="mt-6 text-lg text-muted-foreground">
            Sistema de design oriental elegante para aplicações PDV
          </p>
          
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/pdv-importados/caixa"
              className="dragon-btn-primary inline-flex h-12 items-center rounded-lg px-8 text-base font-semibold"
            >
              Acessar Caixa
            </Link>
            <Link
              href="/pdv-importados/gerente"
              className="dragon-btn-jade inline-flex h-12 items-center rounded-lg px-8 text-base font-semibold"
            >
              Painel Gerente
            </Link>
          </div>
        </div>
      </section>

      {/* Color Palette */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Paleta de Cores</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="dragon-card p-6">
              <div className="mb-4 h-24 rounded-lg bg-[var(--dragon-gold,#d4af37)]" />
              <h3 className="font-semibold">Dragon Gold</h3>
              <p className="text-sm text-muted-foreground">Cor primária — decisões e ações</p>
              <code className="mt-2 block text-xs text-muted-foreground">#d4af37</code>
            </div>
            <div className="dragon-card p-6">
              <div className="mb-4 h-24 rounded-lg bg-[var(--dragon-jade,#10b981)]" />
              <h3 className="font-semibold">Dragon Jade</h3>
              <p className="text-sm text-muted-foreground">Sucesso e valores positivos</p>
              <code className="mt-2 block text-xs text-muted-foreground">#10b981</code>
            </div>
            <div className="dragon-card p-6">
              <div className="mb-4 h-24 rounded-lg bg-[var(--dragon-imperial-red,#b91c1c)]" />
              <h3 className="font-semibold">Imperial Red</h3>
              <p className="text-sm text-muted-foreground">Alertas e estados de erro</p>
              <code className="mt-2 block text-xs text-muted-foreground">#b91c1c</code>
            </div>
            <div className="dragon-card p-6">
              <div className="mb-4 h-24 rounded-lg bg-[var(--dragon-cloud-cream,#fff7e8)]" />
              <h3 className="font-semibold">Cloud Cream</h3>
              <p className="text-sm text-muted-foreground">Fundo suave e papel</p>
              <code className="mt-2 block text-xs text-muted-foreground">#fff7e8</code>
            </div>
          </div>
        </div>
      </section>

      {/* Button Variants */}
      <section className="bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Botões</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="dragon-btn-primary h-10 rounded-lg px-6 font-semibold">
              Dragon Gold
            </button>
            <button className="dragon-btn-jade h-10 rounded-lg px-6 font-semibold">
              Dragon Jade
            </button>
            <button className="app-btn-accent h-10 rounded-lg px-6 font-semibold">
              Accent
            </button>
            <button className="app-btn-neutral h-10 rounded-lg px-6 font-semibold">
              Neutral
            </button>
            <button className="app-btn-danger h-10 rounded-lg px-6 font-semibold">
              Danger
            </button>
          </div>
        </div>
      </section>

      {/* Card Variants */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Cards</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="dragon-card p-6">
              <h3 className="text-lg font-semibold">Dragon Card</h3>
              <p className="mt-2 text-muted-foreground">
                Card com borda gradiente dourada/jade no lado esquerdo
              </p>
            </div>
            <div className="dragon-card dragon-seal p-6">
              <h3 className="text-lg font-semibold">Dragon Card + Selo</h3>
              <p className="mt-2 text-muted-foreground">
                Card com selo chinês 福 (prosperidade)
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 shadow-md transition-shadow hover:shadow-lg">
              <h3 className="text-lg font-semibold">Card Elevado</h3>
              <p className="mt-2 text-muted-foreground">
                Card com sombra mais pronunciada e hover elevado
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Badges</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <span className="dragon-badge dragon-badge-gold">Dragon Gold</span>
            <span className="dragon-badge dragon-badge-jade">Dragon Jade</span>
            <span className="dragon-badge dragon-badge-imperial">Imperial Red</span>
            <span className="app-badge-positive rounded-full px-3 py-1 text-xs font-medium">
              Positivo
            </span>
            <span className="app-badge-warn rounded-full px-3 py-1 text-xs font-medium">
              Aviso
            </span>
            <span className="app-badge-danger rounded-full px-3 py-1 text-xs font-medium">
              Perigo
            </span>
          </div>
        </div>
      </section>

      {/* Inputs */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Inputs</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Input Dragon</label>
              <input
                type="text"
                placeholder="Digite algo..."
                className="dragon-input h-10 w-full rounded-lg px-4"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Input Padrão</label>
              <input
                type="text"
                placeholder="Digite algo..."
                className="app-input h-10 w-full rounded-lg px-4"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Status States */}
      <section className="bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-3xl font-bold">Estados</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="dragon-success rounded-lg border p-6">
              <h3 className="font-semibold">Sucesso</h3>
              <p className="mt-1 text-sm opacity-80">Operação concluída com êxito</p>
            </div>
            <div className="dragon-warning rounded-lg border p-6">
              <h3 className="font-semibold">Aviso</h3>
              <p className="mt-1 text-sm opacity-80">Atenção necessária</p>
            </div>
            <div className="dragon-danger rounded-lg border p-6">
              <h3 className="font-semibold">Erro</h3>
              <p className="mt-1 text-sm opacity-80">Algo deu errado</p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-8 text-3xl font-bold">Divisor Oriental</h2>
          <hr className="dragon-divider my-8" />
          <p className="text-muted-foreground">
            Divisor com gradiente dourado no centro
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-12 text-center">
        <p className="text-4xl font-bold dragon-gold-text">金龍</p>
        <p className="mt-2 text-muted-foreground">
          Dragon POS — Sistema PDV para Importados
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Design System Jinlong v1.0
        </p>
      </footer>
    </main>
  )
}
