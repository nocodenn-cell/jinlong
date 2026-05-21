'use client'

import type { InputHTMLAttributes } from 'react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { ConfiguracaoGeralRow } from './actions'
import { atualizarConfiguracao } from './actions'

type Props = Readonly<{
  idioma: Idioma
  rowsInicial: ConfiguracaoGeralRow[]
  erroLista: string | null
}>

type Grupo = 'financeiro' | 'caixa' | 'estoque' | 'importacao'

const CHAVES_POR_GRUPO: Record<Grupo, readonly string[]> = {
  financeiro: ['comissao_padrao_percentual'],
  caixa: ['desconto_maximo_operador_percentual', 'cancelamento_maximo_valor_sem_gerente'],
  estoque: ['estoque_minimo_padrao'],
  importacao: ['lead_time_min_dias', 'lead_time_max_dias'],
}

function labelChave(m: ReturnType<typeof getMessages>, chave: string): string {
  const labels: Record<string, string> = {
    comissao_padrao_percentual: m.configuracoes.chave_comissao_padrao_percentual,
    desconto_maximo_operador_percentual: m.configuracoes.chave_desconto_maximo_operador_percentual,
    cancelamento_maximo_valor_sem_gerente: m.configuracoes.chave_cancelamento_maximo_valor_sem_gerente,
    estoque_minimo_padrao: m.configuracoes.chave_estoque_minimo_padrao,
    lead_time_min_dias: m.configuracoes.chave_lead_time_min_dias,
    lead_time_max_dias: m.configuracoes.chave_lead_time_max_dias,
  }
  return labels[chave] ?? chave
}

function inputPropsForTipo(
  tipo: ConfiguracaoGeralRow['tipo_dado'],
): { step?: string; min?: string; inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'] } {
  if (tipo === 'percent') return { step: '0.1', min: '0', inputMode: 'decimal' }
  if (tipo === 'money') return { step: '0.01', min: '0', inputMode: 'decimal' }
  if (tipo === 'integer') return { step: '1', min: '0', inputMode: 'numeric' }
  return { inputMode: 'text' }
}

export function ConfiguracoesGerentePageClient({ idioma, rowsInicial, erroLista }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rowsInicial.map((r) => [r.chave, r.valor])),
  )

  useEffect(() => {
    setDrafts(Object.fromEntries(rowsInicial.map((r) => [r.chave, r.valor])))
  }, [rowsInicial])

  const porChave = useMemo(() => new Map(rowsInicial.map((r) => [r.chave, r])), [rowsInicial])

  const salvarOpts = useMemo(
    () => ({
      successMessage: m.configuracoes.salvo_sucesso,
      onSuccess: () => {
        router.refresh()
      },
    }),
    [m.configuracoes.salvo_sucesso, router],
  )

  const { mutate: salvar, loading } = useGerenteMutation(
    async (payload: { chave: string; valor: string }) => {
      const r = await atualizarConfiguracao(payload)
      if (!r.success) throw new Error(r.error)
      return null
    },
    salvarOpts,
  )

  const onSalvarChave = useCallback(
    async (chave: string) => {
      const valor = (drafts[chave] ?? '').trim()
      if (!valor) {
        emitGerenteToast({ kind: 'error', message: m.configuracoes.erro_valor_vazio })
        return
      }
      await salvar({ chave, valor })
    },
    [drafts, m.configuracoes.erro_valor_vazio, salvar],
  )

  const cardClass =
    'rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm'

  return (
    <div className={cn('mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6', idioma === 'zh' ? 'font-chinese' : '')}>
      <GerenteFilterBar title={m.configuracoes.titulo} />
      <p className="gerente-fin-muted -mt-2 text-sm">{m.configuracoes.subtitulo}</p>

      {erroLista ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erroLista}
        </p>
      ) : null}

      {(Object.keys(CHAVES_POR_GRUPO) as Grupo[]).map((grupo) => {
        const titulo = m.configuracoes[`grupo_${grupo}` as keyof typeof m.configuracoes]
        const chaves = CHAVES_POR_GRUPO[grupo]
        return (
          <section key={grupo} className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
              {typeof titulo === 'string' ? titulo : grupo}
            </h2>
            <ul className="flex flex-col gap-4">
              {chaves.map((chave) => {
                const row = porChave.get(chave)
                if (!row) return null
                const ip = inputPropsForTipo(row.tipo_dado)
                const prefixo = row.tipo_dado === 'money' ? 'R$' : null
                return (
                  <li key={chave} className="flex flex-col gap-2 border-b border-border/60 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{labelChave(m, chave)}</span>
                    </div>
                    {row.descricao ? (
                      <p className="text-xs text-muted-foreground">{row.descricao}</p>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-2">
                      {prefixo ? (
                        <span className="pb-2 text-xs font-medium text-muted-foreground">{prefixo}</span>
                      ) : null}
                      <input
                        className="h-9 min-w-[8rem] flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
                        value={drafts[chave] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [chave]: e.target.value }))}
                        type={row.tipo_dado === 'integer' ? 'number' : 'text'}
                        {...ip}
                      />
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void onSalvarChave(chave)}
                        className="h-9 shrink-0 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
                      >
                        {loading ? '…' : m.configuracoes.btn_salvar}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
