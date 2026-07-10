'use client'

import { useCallback, useState, useTransition } from 'react'
import { AlertCircle, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { executarDiagnosticoCaixaAction } from '@/app/admin/diagnostico-caixa/actions'
import type {
  DiagnosticoCaixaResult,
  DiagnosticoCheck,
  DiagnosticoCheckCategoria,
} from '@/lib/caixa/diagnosticoPreProducaoTypes'
import { ROUTES } from '@shared-core/navigation/routes'
import { cn } from '@/lib/utils'

type Props = {
  inicial: DiagnosticoCaixaResult
}

const CATEGORIA_LABEL: Record<DiagnosticoCheckCategoria, string> = {
  migrations: 'Migrations',
  rpc: 'RPCs',
  grants: 'Grants',
  flags: 'Flags de ambiente',
  caixa: 'Caixa',
  estoque: 'Estoque teste',
  config: 'Configuração',
}

function statusIcon(status: DiagnosticoCheck['status']) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'aviso') return <AlertCircle className="h-4 w-4 text-amber-500" />
  return <AlertCircle className="h-4 w-4 text-red-500" />
}

function statusBadgeClass(status: DiagnosticoCheck['status']): string {
  if (status === 'ok') return 'admin-v2-alert-success'
  if (status === 'aviso') return 'admin-v2-alert-warning'
  return 'admin-v2-alert-danger'
}

function vereditoClass(veredito: DiagnosticoCaixaResult['veredito']): string {
  if (veredito === 'PRONTO_PILOTO') return 'admin-v2-alert-success'
  if (veredito === 'BLOQUEADO') return 'admin-v2-alert-danger'
  return 'admin-v2-alert-warning'
}

function agruparChecks(checks: DiagnosticoCheck[]): Map<DiagnosticoCheckCategoria, DiagnosticoCheck[]> {
  const map = new Map<DiagnosticoCheckCategoria, DiagnosticoCheck[]>()
  for (const c of checks) {
    const list = map.get(c.categoria) ?? []
    list.push(c)
    map.set(c.categoria, list)
  }
  return map
}

export function DiagnosticoCaixaContent({ inicial }: Props) {
  const [resultado, setResultado] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const recarregar = useCallback(() => {
    setErro(null)
    startTransition(async () => {
      const res = await executarDiagnosticoCaixaAction()
      if (!res.ok) {
        setErro(res.error)
        return
      }
      const { ok: _ok, ...data } = res
      setResultado(data)
    })
  }, [])

  const grupos = agruparChecks(resultado.checks)

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Diagnóstico do Caixa"
        subtitle="Checklist pré-produção — fluxo normal de venda (sem alterar o PDV)."
        filters={
          <button
            type="button"
            onClick={recarregar}
            disabled={pending}
            className="admin-v2-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold"
          >
            <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
            {pending ? 'Verificando…' : 'Executar novamente'}
          </button>
        }
      />

      <div className={cn('mb-5 rounded-lg px-4 py-3 text-[13px] font-medium', vereditoClass(resultado.veredito))}>
        <p>
          Veredito: <strong>{resultado.veredito}</strong>
          {' · '}
          {resultado.totalFalhas} falha(s), {resultado.totalAvisos} aviso(s)
        </p>
        <p className="mt-1 text-[11px] font-normal opacity-90">
          Produto teste: {resultado.produtoCodigo} · Verificado em{' '}
          {new Date(resultado.verificadoEm).toLocaleString('pt-BR')}
        </p>
      </div>

      {erro ? (
        <div className="admin-v2-alert-danger mb-4 rounded-lg px-3 py-2 text-[12px]">{erro}</div>
      ) : null}

      <SectionCard title="Checklist operacional">
        <div className="flex flex-col gap-6">
          {[...grupos.entries()].map(([categoria, itens]) => (
            <div key={categoria}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-jl-fg-3">
                {CATEGORIA_LABEL[categoria]}
              </h3>
              <ul className="flex flex-col gap-2">
                {itens.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border border-[var(--admin-v2-border)] px-3 py-2',
                      statusBadgeClass(item.status),
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{statusIcon(item.status)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-jl-fg-1">{item.titulo}</p>
                      <p className="mt-0.5 text-[11px] text-jl-fg-2">{item.detalhe}</p>
                      {item.acao ? (
                        <p className="mt-1 text-[10px] font-medium text-jl-fg-3">Ação: {item.acao}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] font-bold uppercase">{item.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="SQL completo (Supabase)">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-jl-fg-3" />
          <div className="text-[12px] text-jl-fg-2">
            <p>
              Para grants, migrations e RLS detalhados, execute no SQL Editor do ambiente alvo:
            </p>
            <p className="mt-2 font-mono text-[11px] text-jl-fg-1">{resultado.sqlScriptPath}</p>
            <p className="mt-2 text-[11px] text-jl-fg-3">
              O resumo deve mostrar <strong>total_falhas = 0</strong> antes do primeiro cliente.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Abertura de loja (resumo)">
        <ul className="list-inside list-disc space-y-1 text-[12px] text-jl-fg-2">
          <li>Banco: migration 243+ e RPC v4 com GRANT para authenticated</li>
          <li>Flags: Supabase URL/anon + STRICT_MANAGER sem typo</li>
          <li>Config: vendas_suspensas desligadas</li>
          <li>Produto teste com estoque na loja</li>
          <li>Operador abre caixa antes da 1ª venda</li>
          <li>
            <a href={ROUTES.caixa.home} className="text-jl-accent underline">
              Ir para o PDV
            </a>{' '}
            e fazer 1 venda teste
          </li>
        </ul>
      </SectionCard>
    </div>
  )
}
