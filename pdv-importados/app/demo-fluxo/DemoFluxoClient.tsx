'use client'

import { useCallback, useState } from 'react'
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

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
  if (status === 'ok') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  if (status === 'error') return <XCircle className="h-5 w-5 text-red-600" />
  return <Circle className="h-5 w-5 text-gray-300" />
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Fluxo de Demonstração (E2E)"
        subtitle="Staging — abrir caixa → venda → fechar caixa → validação PDV."
      />

      <SectionCard title="Pré-requisitos (seed)" subtitle="Validação automática ao carregar a página">
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
          <p className="mt-3 text-sm text-amber-800">
            Rode <code className="rounded bg-amber-50 px-1">npm run seed:dev-users</code> e aplique a
            migration 027 no Supabase. Opcional:{' '}
            <code className="rounded bg-amber-50 px-1">npm run seed:demo-fluxo</code>
          </p>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        {(['caixa', 'venda', 'fechamento'] as StepId[]).map((id) => (
          <SectionCard key={id} title={STEP_LABELS[id]}>
            <div className="flex items-start gap-3">
              <StepIcon status={steps[id].status} />
              <p className="text-sm text-jl-fg-2">{steps[id].message}</p>
            </div>
          </SectionCard>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          disabled={executando || !preReqOk}
          onClick={() => void executarFluxoDemo()}
          className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {executando ? 'EXECUTANDO…' : 'EXECUTAR FLUXO DEMO'}
        </button>
        {erroGlobal ? (
          <p className="max-w-lg text-center text-sm text-red-600" role="alert">
            {erroGlobal}
          </p>
        ) : null}
      </div>

      {outcome != null ? (
        <SectionCard
          title={sucesso ? 'Estado PDV validado' : 'Validação PDV'}
          subtitle={
            sucesso
              ? `severitySummary: ${validation?.meta.severitySummary ?? '—'}`
              : outcome.kind === 'fetch_failed'
                ? `fetch_failed: ${outcome.code}`
                : `severitySummary: ${validation?.meta.severitySummary ?? '—'}`
          }
        >
          {outcome.kind === 'fetch_failed' ? (
            <p className="text-sm text-red-600">{outcome.message}</p>
          ) : (
            <div className="space-y-2">
              {validation?.violations.length ? (
                <ul className="space-y-1 text-sm">
                  {validation.violations.map((v, i) => (
                    <li
                      key={`${v.code}-${i}`}
                      className={
                        v.severity === 'error' ? 'text-red-600' : 'text-amber-700'
                      }
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
          )}
        </SectionCard>
      ) : null}

      {sucesso && readBack?.venda ? (
        <SectionCard title="Saída visível" subtitle="Read-back informativo (não define sucesso)">
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
    </div>
  )
}
