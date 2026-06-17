'use client'

import { useCallback, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import {
  executarDemoFluxoE2E,
  obterContextoDemoFluxo,
  type DemoContextoInicial,
  type DemoFluxoE2EResult,
  type DemoResultadoPosFluxo,
} from '@/app/demo-fluxo/actions'
import { isPdvEvaluationSuccess } from '@/lib/pdv'
import type { PdvEvaluationOutcome } from '@/lib/pdv'
import { formatBRL } from '@/lib/format/money'

type StepId = 'caixa' | 'venda' | 'fechamento'
type StepStatus = 'idle' | 'running' | 'ok' | 'error'

type StepState = {
  status: StepStatus
  message: string
}

const STEP_LABELS: Record<StepId, string> = {
  caixa: 'Tela de caixa',
  venda: 'Tela de venda',
  fechamento: 'Tela de fechamento',
}

function StepIcon({
  status,
  className = 'h-5 w-5',
}: {
  status: StepStatus
  className?: string
}) {
  if (status === 'running')
    return <Loader2 className={`${className} animate-spin text-blue-600`} />
  if (status === 'ok') return <CheckCircle2 className={`${className} text-emerald-600`} />
  if (status === 'error') return <XCircle className={`${className} text-red-600`} />
  return <Circle className={`${className} text-gray-300`} />
}

function stepsFromResult(result: DemoFluxoE2EResult | null): Record<StepId, StepState> {
  const base: Record<StepId, StepState> = {
    caixa: { status: 'idle', message: 'Aguardando…' },
    venda: { status: 'idle', message: 'Aguardando…' },
    fechamento: { status: 'idle', message: 'Aguardando…' },
  }
  if (!result) return base
  for (const step of result.steps) {
    base[step.id] = {
      status: step.ok ? 'ok' : 'error',
      message: step.message,
    }
  }
  return base
}

type Props = {
  contextoInicial: DemoContextoInicial
}

export function DemoFluxoClient({ contextoInicial }: Props) {
  const [contexto, setContexto] = useState(contextoInicial)
  const [steps, setSteps] = useState<Record<StepId, StepState>>(stepsFromResult(null))
  const [executando, setExecutando] = useState(false)
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<PdvEvaluationOutcome | null>(null)
  const [readBack, setReadBack] = useState<DemoResultadoPosFluxo | null>(null)

  const sucesso = outcome != null && isPdvEvaluationSuccess(outcome)

  const executarFluxoDemo = useCallback(async () => {
    setExecutando(true)
    setErroGlobal(null)
    setOutcome(null)
    setReadBack(null)
    setSteps({
      caixa: { status: 'running', message: 'Executando…' },
      venda: { status: 'idle', message: 'Aguardando…' },
      fechamento: { status: 'idle', message: 'Aguardando…' },
    })

    try {
      const result = await executarDemoFluxoE2E({
        produtoId: contexto.produtoId,
        estoqueAtual: contexto.estoqueAtual,
      })

      setSteps(stepsFromResult(result))

      if (!result.fluxoOk) {
        setErroGlobal(result.fluxoError ?? 'Falha no fluxo demo.')
        return
      }

      if (result.outcome) {
        setOutcome(result.outcome)
      }
      if (result.readBack) {
        setReadBack(result.readBack)
      }

      if (result.outcome?.kind === 'fetch_failed') {
        setErroGlobal(result.outcome.message)
      } else if (result.outcome && !isPdvEvaluationSuccess(result.outcome)) {
        const codes = result.outcome.validation.violations
          .map((v) => `${v.code} (${v.severity})`)
          .join(', ')
        setErroGlobal(codes || 'PDV inconsistente após validação.')
      }

      const ctx = await obterContextoDemoFluxo()
      setContexto(ctx)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha no fluxo demo.'
      setErroGlobal(msg)
    } finally {
      setExecutando(false)
    }
  }, [contexto.estoqueAtual, contexto.produtoId])

  const preReqOk = contexto.preRequisitos
    .filter((p) => p.id !== 'caixa')
    .every((p) => p.ok)

  const validation = outcome?.kind === 'validated' ? outcome.validation : null

  // Veredito derivado APENAS do estado existente dos cards (fluxoOk) — sem lógica nova.
  // Enquanto executando: estado único de processamento (sem simular pipeline interno).
  const statuses: StepStatus[] = [
    steps.caixa.status,
    steps.venda.status,
    steps.fechamento.status,
  ]
  const veredito: 'idle' | 'processando' | 'sucesso' | 'falha' = executando
    ? 'processando'
    : statuses.some((s) => s === 'error')
      ? 'falha'
      : statuses.every((s) => s === 'ok')
        ? 'sucesso'
        : 'idle'

  const vereditoUI: Record<
    typeof veredito,
    { label: string; banner: string; icon: ReactNode }
  > = {
    idle: {
      label: 'Aguardando execução',
      banner: 'border-gray-200 bg-gray-50 text-gray-600',
      icon: <Circle className="h-7 w-7 text-gray-400" />,
    },
    processando: {
      label: 'Processando transação…',
      banner: 'border-blue-200 bg-blue-50 text-blue-700',
      icon: <Loader2 className="h-7 w-7 animate-spin text-blue-600" />,
    },
    sucesso: {
      label: 'SUCESSO — fluxo concluído',
      banner: 'border-emerald-300 bg-emerald-50 text-emerald-700',
      icon: <CheckCircle2 className="h-7 w-7 text-emerald-600" />,
    },
    falha: {
      label: 'FALHA — verifique os cards',
      banner: 'border-red-300 bg-red-50 text-red-700',
      icon: <XCircle className="h-7 w-7 text-red-600" />,
    },
  }

  const cardBorder: Record<StepStatus, string> = {
    idle: 'border-gray-200',
    running: 'border-blue-300',
    ok: 'border-emerald-300',
    error: 'border-red-400',
  }

  const temDiagnostico = erroGlobal != null || outcome != null || !preReqOk

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <PageHeader
        title="Fluxo de Demonstração (E2E)"
        subtitle="Staging — abrir caixa → venda → fechar caixa → validação PDV."
      />

      {/* ───────── CAMADA 1 — VEREDITO (dominante) ───────── */}
      <section aria-label="Veredito do fluxo" className="space-y-4">
        <div
          className={`flex items-center gap-3 rounded-xl border-2 px-6 py-4 text-xl font-bold ${vereditoUI[veredito].banner}`}
          role="status"
          aria-live="polite"
        >
          {vereditoUI[veredito].icon}
          <span>{vereditoUI[veredito].label}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {(['caixa', 'venda', 'fechamento'] as StepId[]).map((id) => {
            const displayStatus: StepStatus = executando ? 'running' : steps[id].status
            const displayMessage = executando ? 'Processando transação…' : steps[id].message
            return (
              <div
                key={id}
                className={`rounded-xl border-2 bg-white p-6 shadow-sm ${cardBorder[displayStatus]}`}
              >
                <div className="flex items-center gap-3">
                  <StepIcon status={displayStatus} className="h-8 w-8" />
                  <h3 className="text-base font-semibold text-jl-fg-1">{STEP_LABELS[id]}</h3>
                </div>
                <p className="mt-3 text-sm text-jl-fg-2">{displayMessage}</p>
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex flex-col items-center gap-2 py-2">
        <button
          type="button"
          disabled={executando || !preReqOk}
          onClick={() => void executarFluxoDemo()}
          className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {executando ? 'EXECUTANDO…' : 'EXECUTAR FLUXO DEMO'}
        </button>
        {!preReqOk ? (
          <p className="text-xs text-gray-500">
            Pré-requisitos pendentes — ver Diagnóstico abaixo.
          </p>
        ) : null}
      </div>

      {/* ───────── CAMADA 2 — PROVA (secundária / evidência) ───────── */}
      {sucesso && readBack?.venda ? (
        <SectionCard
          title="Prova — Saída visível"
          subtitle="Evidência de banco (read-back). Não é o veredito — o veredito está nos cards acima."
        >
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="mb-2 font-medium text-jl-fg-1">Venda na lista</h3>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-jl-fg-3">ID</dt>
                  <dd className="font-mono text-xs">{readBack.venda.id}</dd>
                </div>
                <div>
                  <dt className="text-jl-fg-3">Status</dt>
                  <dd>{readBack.venda.status}</dd>
                </div>
                <div>
                  <dt className="text-jl-fg-3">Total</dt>
                  <dd>{formatBRL(readBack.venda.total_liquido ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-jl-fg-3">Pagamento</dt>
                  <dd>{readBack.venda.forma_pagamento}</dd>
                </div>
              </dl>
              <Link
                href="/admin/vendas"
                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
              >
                Ver em Vendas →
              </Link>
            </div>

            <div>
              <h3 className="mb-2 font-medium text-jl-fg-1">Caixa fechado</h3>
              {readBack.caixa ? (
                <dl className="space-y-1 text-sm">
                  <div>
                    <dt className="text-jl-fg-3">Status</dt>
                    <dd>{readBack.caixa.status}</dd>
                  </div>
                  <div>
                    <dt className="text-jl-fg-3">Valor fechamento</dt>
                    <dd>{formatBRL(readBack.caixa.valor_fechamento ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-jl-fg-3">Diferença</dt>
                    <dd>{formatBRL(readBack.caixa.fechamento_diferenca ?? 0)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-jl-fg-3">Caixa não encontrado.</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-medium text-jl-fg-1">Estoque reduzido</h3>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-jl-fg-3">Produto</dt>
                  <dd>{readBack.produtoNome}</dd>
                </div>
                <div>
                  <dt className="text-jl-fg-3">Antes → Depois</dt>
                  <dd>
                    {readBack.estoqueAntes ?? '—'} → {readBack.estoqueDepois ?? '—'} un.
                  </dd>
                </div>
              </dl>
              <Link
                href="/gerente/produtos"
                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
              >
                Ver estoque →
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* ───────── CAMADA 3 — DIAGNÓSTICO (terciária / debug do sistema) ───────── */}
      {temDiagnostico ? (
        <details className="rounded-lg border border-gray-200 bg-gray-50/70 text-jl-fg-3">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Diagnóstico técnico (debug do sistema) — não é o veredito
          </summary>
          <div className="space-y-4 border-t border-gray-200 p-4">
            {erroGlobal ? (
              <p className="text-sm text-red-600" role="alert">
                <strong>Mensagem do sistema:</strong> {erroGlobal}
              </p>
            ) : null}

            {outcome != null ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Validação PDV ·{' '}
                  {outcome.kind === 'fetch_failed'
                    ? `fetch_failed: ${outcome.code}`
                    : `severitySummary: ${validation?.meta.severitySummary ?? '—'}`}
                </p>
                {outcome.kind === 'fetch_failed' ? (
                  <p className="text-sm text-red-600">{outcome.message}</p>
                ) : validation?.violations.length ? (
                  <ul className="space-y-1 text-sm">
                    {validation.violations.map((v, i) => (
                      <li
                        key={`${v.code}-${i}`}
                        className={v.severity === 'error' ? 'text-red-600' : 'text-amber-700'}
                      >
                        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                        <strong>{v.code}</strong> ({v.severity}) — {v.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Nenhuma violação detectada.
                  </p>
                )}
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Pré-requisitos (seed)
              </p>
              <ul className="space-y-2 text-sm">
                {contexto.preRequisitos.map((p) => (
                  <li key={p.id} className="flex items-start gap-2">
                    {p.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <span>
                      <strong>{p.label}</strong> — {p.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {!preReqOk ? (
                <p className="text-sm text-amber-800">
                  Rode <code className="rounded bg-amber-50 px-1">npm run seed:dev-users</code> e
                  aplique a migration 027 no Supabase. Opcional:{' '}
                  <code className="rounded bg-amber-50 px-1">npm run seed:demo-fluxo</code>
                </p>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  )
}
