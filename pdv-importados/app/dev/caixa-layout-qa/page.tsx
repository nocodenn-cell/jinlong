'use client'

/**
 * Harness visual do layout 3 colunas do PDV — só desenvolvimento.
 * Cenários via ?s=vazio|um|varios|nome-longo|desconto|troco e ?w=pdv|desktop
 */
import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getMessages } from '@/i18n/getMessages'
import { CaixaAtalhosProdutosGrid } from '@/app/caixa/CaixaAtalhosProdutosGrid'
import { CAIXA_ATALHOS_PRODUTOS_PADRAO } from '@/app/caixa/caixaAtalhosProdutos'
import { CaixaCheckoutTotaisPanel } from '@/app/caixa/CaixaCheckoutTotaisPanel'
import { CaixaDescontoDrawer } from '@/app/caixa/CaixaDescontoDrawer'
import { CaixaPdvMetodoPagamentoSelector } from '@/app/caixa/CaixaPdvMetodoPagamentoSelector'
import type { MetodoPagamentoUi } from '@/app/caixa/caixaMetodoPagamento'
import { Button } from '@/components/ui/button'

type Scenario = 'vazio' | 'um' | 'varios' | 'nome-longo' | 'desconto' | 'troco'

const SCENARIOS: readonly Scenario[] = [
  'vazio',
  'um',
  'varios',
  'nome-longo',
  'desconto',
  'troco',
] as const

const LABELS: Record<Scenario, string> = {
  vazio: 'Vazio',
  um: '1 item',
  varios: 'Vários',
  'nome-longo': 'Nome longo',
  desconto: 'Desconto',
  troco: 'Troco',
}

const ITENS: Record<Exclude<Scenario, 'vazio'>, Array<{ nome: string; qtd: number; unit: number }>> = {
  um: [{ nome: 'Água 500ml', qtd: 1, unit: 3.5 }],
  varios: [
    { nome: 'Água 500ml', qtd: 2, unit: 3.5 },
    { nome: 'Café expresso', qtd: 1, unit: 6 },
    { nome: 'Sacola plástica', qtd: 3, unit: 0.5 },
  ],
  'nome-longo': [
    {
      nome: 'Molho de soja premium importado garrafa pet 1 litro com tampa hermética',
      qtd: 1,
      unit: 24.9,
    },
  ],
  desconto: [{ nome: 'Caixa de chá', qtd: 2, unit: 50 }],
  troco: [{ nome: 'Suco', qtd: 1, unit: 8 }],
}

function parseScenario(raw: string | null): Scenario {
  if (raw && (SCENARIOS as readonly string[]).includes(raw)) return raw as Scenario
  return 'varios'
}

function CaixaLayoutQaInner() {
  const m = getMessages('pt')
  const router = useRouter()
  const params = useSearchParams()
  const scenario = parseScenario(params.get('s'))
  const viewport = params.get('w') === 'desktop' ? 'desktop' : 'pdv'
  const drawer = params.get('drawer') === '1'
  const metodoParam = params.get('pay')
  const metodo: MetodoPagamentoUi =
    metodoParam === 'pix' ||
    metodoParam === 'credito' ||
    metodoParam === 'debito' ||
    metodoParam === 'dinheiro'
      ? metodoParam
      : 'dinheiro'

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k)
        else next.set(k, v)
      }
      router.replace(`/dev/caixa-layout-qa?${next.toString()}`)
    },
    [params, router],
  )

  const itens = scenario === 'vazio' ? [] : ITENS[scenario]
  const subtotal = itens.reduce((s, i) => s + i.qtd * i.unit, 0)
  const desconto = scenario === 'desconto' ? 10 : 0
  const total = subtotal - desconto
  const recebido = scenario === 'troco' ? 20 : metodo === 'dinheiro' && total > 0 ? total : null
  const troco = scenario === 'troco' ? 12 : null

  const metodoPanel = useMemo(
    () => (
      <CaixaPdvMetodoPagamentoSelector
        m={m}
        value={metodo}
        onChange={(v) => setQuery({ pay: v })}
      />
    ),
    [m, metodo, setQuery],
  )

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground"
      data-testid="caixa-layout-qa"
      data-scenario={scenario}
      style={{ width: viewport === 'pdv' ? 1366 : 1024, margin: '0 auto' }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <strong>QA layout /caixa</strong>
        {SCENARIOS.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            data-testid={`qa-scenario-${id}`}
            variant={scenario === id ? 'default' : 'outline'}
            onClick={() => setQuery({ s: id })}
          >
            {LABELS[id]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="qa-abrir-f3"
          onClick={() => setQuery({ drawer: '1' })}
        >
          Abrir F3
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="qa-viewport"
          onClick={() => setQuery({ w: viewport === 'pdv' ? 'desktop' : 'pdv' })}
        >
          {viewport === 'pdv' ? '1366px' : '1024px'}
        </Button>
      </div>

      <div className="grid h-[calc(100dvh-3rem)] grid-cols-[minmax(16rem,22rem)_minmax(0,1.6fr)_minmax(18rem,24rem)] gap-3 p-3">
        <section className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-3">
          <input
            className="h-14 w-full shrink-0 rounded-md border border-border px-3 text-lg"
            placeholder={m.caixa.busca_placeholder}
            aria-label="busca-qa"
          />
          <CaixaAtalhosProdutosGrid atalhos={CAIXA_ATALHOS_PRODUTOS_PADRAO} onSelecionar={() => {}} />
        </section>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.caixa.cart_empty_sem_pedido}</p>
            ) : (
              <ul className="divide-y border-border">
                {itens.map((item) => (
                  <li
                    key={item.nome}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-2 py-3"
                  >
                    <span className="truncate text-lg font-bold" title={item.nome}>
                      {item.nome}
                    </span>
                    <span className="tabular-nums text-base font-semibold">{item.qtd}×</span>
                    <span className="tabular-nums text-lg font-bold">
                      R$ {(item.qtd * item.unit).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <CaixaCheckoutTotaisPanel
          m={m}
          moedaPrefixo="R$"
          subtotal={subtotal}
          descontoTotal={desconto}
          totalFinal={total}
          descontoPercentual={desconto > 0 ? 10 : 0}
          valorRecebido={recebido}
          troco={troco}
          onAbrirDesconto={() => setQuery({ drawer: '1' })}
          onFinalizar={() => {}}
          finalizando={false}
          finalizarDisabled={itens.length === 0}
          metodoPagamentoPanel={metodoPanel}
        />
      </div>

      <CaixaDescontoDrawer
        open={drawer}
        onClose={() => setQuery({ drawer: null })}
        idioma="pt"
        limiteManual={10}
        subtotal={subtotal}
        descontoPercentualAtual={desconto > 0 ? 10 : 0}
        onSolicitarComercial={() => setQuery({ drawer: null })}
        onLimparComercial={() => {}}
        onAbrirGerente={() => setQuery({ drawer: null })}
        podeComercialDinheiro={metodo === 'dinheiro'}
      />
    </div>
  )
}

export default function CaixaLayoutQaPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Carregando QA…</div>}>
      <CaixaLayoutQaInner />
    </Suspense>
  )
}
