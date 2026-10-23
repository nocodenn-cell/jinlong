'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  definirDivisaoComissao, excluirMetaComissao, salvarConfigComissao, salvarMetaComissao,
  type ConfigComissao, type MetaComissao, type MetaInput, type VendaDivisao,
} from '@/app/gerente/comissoes/moduloActions'

const campo = 'rounded-md border border-jl-border-1 bg-jl-surface px-2 py-1 text-sm'
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = {
  config: ConfigComissao; metas: MetaComissao[]; vendas: VendaDivisao[]; vendedores: { id: string; nome: string }[]
  competencia: string; t: Record<string, string>
}

export function MetasComissaoClient({ config, metas, vendas, vendedores, competencia, t }: Props) {
  const router = useRouter()
  const [pendente, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [cfg, setCfg] = useState(config)
  const novaMeta = (): MetaInput => ({ usuarioId: null, cargo: null, competenciaInicio: competencia, competenciaFim: null, faixas: [{ aPartirDe: 0, bonusPct: 0 }], ativo: true, descricao: null })
  const [m, setM] = useState<MetaInput>(novaMeta())
  const [div, setDiv] = useState<Record<string, { segundo: string; pct: number }>>({})
  const rodar = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) =>
    start(async () => { const r = await fn(); setMsg(r.success ? (ok ?? null) : (r.error ?? '')); router.refresh() })

  return (
    <div className="admin-v2-stack">
      {msg ? <p role="status" className="text-sm">{msg}</p> : null}
      <section className="admin-v2-panel flex flex-wrap items-end gap-4 p-4" data-testid="comissao-config">
        <label className="flex flex-col gap-1 text-sm">{t.cfg_base}
          <select className={campo} value={cfg.base} onChange={(e) => setCfg({ ...cfg, base: e.target.value as ConfigComissao['base'] })}>
            <option value="LIQUIDA">{t.cfg_base_liquida}</option><option value="BRUTA">{t.cfg_base_bruta}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t.cfg_liberacao}
          <select className={campo} value={cfg.liberacao} data-testid="cfg-liberacao" onChange={(e) => setCfg({ ...cfg, liberacao: e.target.value as ConfigComissao['liberacao'] })}>
            <option value="VENDA">{t.cfg_liberacao_venda}</option><option value="RECEBIMENTO">{t.cfg_liberacao_recebimento}</option>
          </select>
        </label>
        <button type="button" disabled={pendente} className="rounded-md bg-jl-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => rodar(() => salvarConfigComissao(cfg), t.cfg_salva)}>{t.salvar}</button>
        <p className="w-full text-xs text-jl-fg-2">{t.cfg_ajuda}</p>
      </section>

      <section className="admin-v2-panel p-4" data-testid="metas">
        <h3 className="mb-2 font-semibold">{t.metas_secao}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">{t.regras_quem}
            <select className={campo} value={m.usuarioId ?? (m.cargo !== null ? `cargo:` : '')} onChange={(e) => {
              const v = e.target.value
              setM({ ...m, usuarioId: v && v !== 'cargo:' ? v : null, cargo: v === 'cargo:' ? '' : null })
            }}>
              <option value="">{t.regras_todos}</option>
              <option value="cargo:">{t.regras_cargo}…</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
            {m.cargo !== null ? <input className={campo} value={m.cargo ?? ''} placeholder={t.regras_cargo_ph} onChange={(e) => setM({ ...m, cargo: e.target.value })} /> : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">{t.metas_de}
            <input className={campo} type="month" value={m.competenciaInicio} onChange={(e) => setM({ ...m, competenciaInicio: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">{t.metas_ate}
            <input className={campo} type="month" value={m.competenciaFim ?? ''} onChange={(e) => setM({ ...m, competenciaFim: e.target.value || null })} />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            {t.metas_faixas}
            {m.faixas.map((f, i) => (
              <span key={i} className="flex items-center gap-1">
                {t.metas_a_partir_de}
                <input className={campo + ' w-28'} type="number" min="0" step="0.01" value={f.aPartirDe} data-testid={`meta-faixa-${i}-min`}
                  onChange={(e) => setM({ ...m, faixas: m.faixas.map((x, j) => (j === i ? { ...x, aPartirDe: Number(e.target.value) } : x)) })} />
                → +
                <input className={campo + ' w-20'} type="number" min="0" max="100" step="0.01" value={f.bonusPct} data-testid={`meta-faixa-${i}-pct`}
                  onChange={(e) => setM({ ...m, faixas: m.faixas.map((x, j) => (j === i ? { ...x, bonusPct: Number(e.target.value) } : x)) })} />%
                {m.faixas.length > 1 ? <button type="button" className="underline" onClick={() => setM({ ...m, faixas: m.faixas.filter((_, j) => j !== i) })}>×</button> : null}
              </span>
            ))}
            {m.faixas.length < 10 ? (
              <button type="button" className="self-start underline" onClick={() => setM({ ...m, faixas: [...m.faixas, { aPartirDe: (m.faixas.at(-1)?.aPartirDe ?? 0) + 1000, bonusPct: 0 }] })}>
                {t.metas_add_faixa}
              </button>
            ) : null}
          </div>
          <button type="button" disabled={pendente} data-testid="meta-salvar" className="rounded-md bg-jl-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => rodar(async () => { const r = await salvarMetaComissao(m); if (r.success) setM(novaMeta()); return r }, t.metas_salva)}>
            {m.id ? t.regras_atualizar : t.metas_adicionar}
          </button>
        </div>
        <p className="mt-2 text-xs text-jl-fg-2">{t.metas_ajuda}</p>
        {metas.length ? (
          <table className="mt-3 w-full text-sm" data-testid="metas-tabela">
            <tbody>
              {metas.map((x) => (
                <tr key={x.id} className="border-t border-jl-border-1">
                  <td className="p-2">{x.usuarioNome ?? (x.cargo ? `${t.regras_cargo}: ${x.cargo}` : t.regras_todos)}</td>
                  <td className="p-2">{x.competenciaInicio} → {x.competenciaFim ?? '∞'}</td>
                  <td className="p-2">{x.faixas.map((f) => `≥ ${brl(f.aPartirDe)}: +${f.bonusPct}%`).join(' · ')}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button type="button" className="mr-3 underline" onClick={() => setM({ id: x.id, usuarioId: x.usuarioId, cargo: x.cargo, competenciaInicio: x.competenciaInicio, competenciaFim: x.competenciaFim, faixas: x.faixas, ativo: x.ativo, descricao: x.descricao })}>{t.regras_editar}</button>
                    <button type="button" className="text-red-700 underline" onClick={() => { if (window.confirm(t.regras_excluir_confirma)) rodar(() => excluirMetaComissao(x.id)) }}>{t.regras_excluir}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="admin-v2-panel overflow-x-auto p-4" data-testid="divisoes">
        <h3 className="mb-2 font-semibold">{t.div_secao}</h3>
        <p className="mb-2 text-xs text-jl-fg-2">{t.div_ajuda}</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-jl-fg-2"><th className="p-2">{t.falhas_col_venda}</th><th className="p-2">{t.rel_col_vendedor}</th><th className="p-2 text-right">{t.rel_col_comissao}</th><th className="p-2">{t.div_com}</th><th className="p-2" /></tr></thead>
          <tbody>
            {vendas.map((v) => {
              const d = div[v.vendaId] ?? { segundo: v.secundarioId ?? '', pct: v.percentual ?? 50 }
              return (
                <tr key={v.vendaId} className="border-t border-jl-border-1">
                  <td className="p-2 font-mono">{v.vendaId.slice(0, 8)} <span className="text-xs text-jl-fg-2">{new Date(v.data).toLocaleDateString()}</span></td>
                  <td className="p-2">{v.operadorNome}</td>
                  <td className="p-2 text-right">{brl(v.valorComissao)}</td>
                  <td className="p-2">
                    <select className={campo} value={d.segundo} onChange={(e) => setDiv({ ...div, [v.vendaId]: { ...d, segundo: e.target.value } })}>
                      <option value="">—</option>{vendedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>{' '}
                    <input className={campo + ' w-16'} type="number" min="1" max="99" value={d.pct} onChange={(e) => setDiv({ ...div, [v.vendaId]: { ...d, pct: Number(e.target.value) } })} />%
                  </td>
                  <td className="p-2 text-right">
                    <button type="button" disabled={pendente} className="underline" onClick={() => rodar(() => definirDivisaoComissao(v.vendaId, d.segundo || null, d.pct || 50), t.div_salva)}>{t.salvar}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
