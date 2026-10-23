'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  excluirRegraComissao, salvarRegraComissao, simularRegraComissao,
  type OpcoesRegras, type PreviaRegra, type RegraComissaoLinha, type RegraInput,
} from '@/app/gerente/comissoes/moduloActions'
import { nivelRegra } from '@/lib/comissao/regras'

const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const vazio = (): RegraInput => ({
  somenteEstaLoja: false, usuarioId: null, cargo: null, produtoId: null, categoriaId: null, canal: null,
  tipoCalculo: 'percentual', valor: 0, vigenciaInicio: hoje(), vigenciaFim: null, ativo: true, descricao: null,
})
const campo = 'rounded-md border border-jl-border-1 bg-jl-surface px-2 py-1 text-sm'

function valorTxt(tipo: string, v: number) {
  return tipo === 'fixo' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/un' : `${v.toLocaleString('pt-BR')}%`
}

export function RegrasComissaoClient({ regras, opcoes, t }: { regras: RegraComissaoLinha[]; opcoes: OpcoesRegras; t: Record<string, string> }) {
  const router = useRouter()
  const [f, setF] = useState<RegraInput>(vazio())
  const [msg, setMsg] = useState<string | null>(null)
  const [pendente, start] = useTransition()
  const [sim, setSim] = useState({ vendedorId: '', produtoId: '', canal: 'VAREJO' as 'VAREJO' | 'ATACADO', data: hoje() })
  const [previa, setPrevia] = useState<PreviaRegra | null>(null)
  const set = <K extends keyof RegraInput>(k: K, v: RegraInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const quem = f.usuarioId ? 'usuario' : f.cargo !== null ? 'cargo' : 'todos'
  const oque = f.produtoId ? 'produto' : f.categoriaId ? 'categoria' : 'tudo'

  const descrever = (r: RegraComissaoLinha) =>
    [
      r.usuarioNome ? `${t.regras_funcionario}: ${r.usuarioNome}` : r.cargo ? `${t.regras_cargo}: ${r.cargo}` : t.regras_todos,
      r.produtoNome ? `${t.regras_produto}: ${r.produtoNome}` : r.categoriaNome ? `${t.regras_categoria}: ${r.categoriaNome}` : null,
      r.canal ? (r.canal === 'ATACADO' ? t.regras_atacado : t.regras_varejo) : null,
      r.lojaId ? t.regras_so_loja : null,
    ].filter(Boolean).join(' · ')

  return (
    <div className="admin-v2-stack">
      <form
        className="admin-v2-panel grid gap-3 p-4 md:grid-cols-4"
        data-testid="regra-form"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const r = await salvarRegraComissao(f)
            if (!r.success) { setMsg(r.error); return }
            setMsg(t.regras_salva); setF(vazio()); router.refresh()
          })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">{t.regras_quem}
          <select className={campo} value={quem} data-testid="regra-quem" onChange={(e) => {
            const v = e.target.value
            setF((x) => ({ ...x, usuarioId: v === 'usuario' ? (opcoes.vendedores[0]?.id ?? null) : null, cargo: v === 'cargo' ? (opcoes.cargos[0] ?? '') : null }))
          }}>
            <option value="todos">{t.regras_todos}</option><option value="usuario">{t.regras_funcionario}</option><option value="cargo">{t.regras_cargo}</option>
          </select>
          {quem === 'usuario' ? (
            <select className={campo} value={f.usuarioId ?? ''} data-testid="regra-usuario" onChange={(e) => set('usuarioId', e.target.value || null)}>
              {opcoes.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          ) : quem === 'cargo' ? (
            <>
              <input className={campo} list="cargos-comissao" value={f.cargo ?? ''} data-testid="regra-cargo" placeholder={t.regras_cargo_ph} onChange={(e) => set('cargo', e.target.value)} />
              <datalist id="cargos-comissao">{opcoes.cargos.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm">{t.regras_o_que}
          <select className={campo} value={oque} data-testid="regra-oque" onChange={(e) => {
            const v = e.target.value
            setF((x) => ({ ...x, produtoId: v === 'produto' ? (opcoes.produtos[0]?.id ?? null) : null, categoriaId: v === 'categoria' ? (opcoes.categorias[0]?.id ?? null) : null }))
          }}>
            <option value="tudo">{t.regras_tudo}</option><option value="categoria">{t.regras_categoria}</option><option value="produto">{t.regras_produto}</option>
          </select>
          {oque === 'produto' ? (
            <select className={campo} value={f.produtoId ?? ''} onChange={(e) => set('produtoId', e.target.value || null)}>
              {opcoes.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          ) : oque === 'categoria' ? (
            <select className={campo} value={f.categoriaId ?? ''} onChange={(e) => set('categoriaId', e.target.value || null)}>
              {opcoes.categorias.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm">{t.regras_canal}
          <select className={campo} value={f.canal ?? ''} data-testid="regra-canal" onChange={(e) => set('canal', (e.target.value || null) as RegraInput['canal'])}>
            <option value="">{t.regras_ambos}</option><option value="VAREJO">{t.regras_varejo}</option><option value="ATACADO">{t.regras_atacado}</option>
          </select>
          <span className="flex items-center gap-2"><input type="checkbox" checked={f.somenteEstaLoja} onChange={(e) => set('somenteEstaLoja', e.target.checked)} />{t.regras_so_loja}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t.regras_valor}
          <span className="flex gap-2">
            <select className={campo} value={f.tipoCalculo} data-testid="regra-tipo" onChange={(e) => set('tipoCalculo', e.target.value as RegraInput['tipoCalculo'])}>
              <option value="percentual">%</option><option value="fixo">{t.regras_fixo_un}</option>
            </select>
            <input className={campo + ' w-28'} type="number" step="0.01" min="0" value={f.valor} data-testid="regra-valor" onChange={(e) => set('valor', Number(e.target.value))} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t.regras_vigencia_inicio}
          <input className={campo} type="date" value={f.vigenciaInicio} onChange={(e) => set('vigenciaInicio', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t.regras_vigencia_fim}
          <input className={campo} type="date" value={f.vigenciaFim ?? ''} onChange={(e) => set('vigenciaFim', e.target.value || null)} />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-1">{t.regras_descricao}
          <input className={campo} maxLength={200} value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value || null)} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={pendente} data-testid="regra-salvar" className="rounded-md bg-jl-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {f.id ? t.regras_atualizar : t.regras_adicionar}
          </button>
          {f.id ? <button type="button" className="text-sm underline" onClick={() => setF(vazio())}>{t.regras_cancelar}</button> : null}
        </div>
        {msg ? <p role="status" className="text-sm md:col-span-4">{msg}</p> : null}
      </form>

      <section className="admin-v2-panel p-4" data-testid="regra-previa">
        <h3 className="mb-2 font-semibold">{t.regras_previa_titulo}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <select className={campo} value={sim.vendedorId} data-testid="previa-vendedor" onChange={(e) => setSim({ ...sim, vendedorId: e.target.value })}>
            <option value="">{t.regras_funcionario}…</option>{opcoes.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
          <select className={campo} value={sim.produtoId} data-testid="previa-produto" onChange={(e) => setSim({ ...sim, produtoId: e.target.value })}>
            <option value="">{t.regras_produto}…</option>{opcoes.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select className={campo} value={sim.canal} onChange={(e) => setSim({ ...sim, canal: e.target.value as 'VAREJO' | 'ATACADO' })}>
            <option value="VAREJO">{t.regras_varejo}</option><option value="ATACADO">{t.regras_atacado}</option>
          </select>
          <input className={campo} type="date" value={sim.data} onChange={(e) => setSim({ ...sim, data: e.target.value })} />
          <button type="button" data-testid="previa-calcular" className="rounded-md border border-jl-border-1 px-3 py-1.5 text-sm font-semibold"
            onClick={() => start(async () => { const r = await simularRegraComissao(sim); if (r.success) setPrevia(r.data); else { setPrevia(null); setMsg(r.error) } })}>
            {t.regras_previa_ver}
          </button>
        </div>
        {previa ? (
          <p className="mt-2 text-sm" data-testid="previa-resultado">
            <strong>{valorTxt(previa.tipoCalculo, previa.valor)}</strong>{' — '}
            {previa.regraId
              ? `${t.regras_previa_regra} ${descrever(regras.find((r) => r.id === previa.regraId) ?? regras[0])} (${t.regras_nivel} ${previa.nivel})`
              : t[`regras_origem_${previa.origem.toLowerCase()}`] ?? previa.origem}
            {previa.cargo ? ` · ${t.regras_cargo}: ${previa.cargo}` : ''}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-jl-fg-2">{t.regras_precedencia}</p>
      </section>

      <div className="admin-v2-panel overflow-x-auto">
        {regras.length === 0 ? <p className="p-4 text-sm text-jl-fg-2">{t.regras_vazio}</p> : (
          <table className="w-full text-sm" data-testid="regras-tabela">
            <thead><tr className="text-left text-jl-fg-2">
              <th className="p-2">{t.regras_col_regra}</th><th className="p-2">{t.regras_nivel}</th><th className="p-2 text-right">{t.regras_valor}</th>
              <th className="p-2">{t.regras_col_vigencia}</th><th className="p-2">{t.regras_col_status}</th><th className="p-2" />
            </tr></thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id} className={'border-t border-jl-border-1 ' + (r.ativo ? '' : 'opacity-50')}>
                  <td className="p-2">{descrever(r)}{r.descricao ? <div className="text-xs text-jl-fg-2">{r.descricao}</div> : null}</td>
                  <td className="p-2">{nivelRegra(r)}</td>
                  <td className="p-2 text-right">{valorTxt(r.tipoCalculo, r.valor)}</td>
                  <td className="p-2">{r.vigenciaInicio}{' → '}{r.vigenciaFim ?? '∞'}</td>
                  <td className="p-2">{r.ativo ? t.regras_ativa : t.regras_inativa}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button type="button" className="mr-3 underline" onClick={() => setF({
                      id: r.id, somenteEstaLoja: !!r.lojaId, usuarioId: r.usuarioId, cargo: r.cargo, produtoId: r.produtoId, categoriaId: r.categoriaId,
                      canal: r.canal, tipoCalculo: r.tipoCalculo, valor: r.valor, vigenciaInicio: r.vigenciaInicio, vigenciaFim: r.vigenciaFim, ativo: r.ativo, descricao: r.descricao,
                    })}>{t.regras_editar}</button>
                    <button type="button" className="mr-3 underline" onClick={() => start(async () => {
                      const res = await salvarRegraComissao({
                        id: r.id, somenteEstaLoja: !!r.lojaId, usuarioId: r.usuarioId, cargo: r.cargo, produtoId: r.produtoId, categoriaId: r.categoriaId,
                        canal: r.canal, tipoCalculo: r.tipoCalculo, valor: r.valor, vigenciaInicio: r.vigenciaInicio, vigenciaFim: r.vigenciaFim, ativo: !r.ativo, descricao: r.descricao,
                      })
                      if (!res.success) setMsg(res.error); router.refresh()
                    })}>{r.ativo ? t.regras_desativar : t.regras_ativar}</button>
                    <button type="button" className="text-red-700 underline" onClick={() => {
                      if (!window.confirm(t.regras_excluir_confirma)) return
                      start(async () => { const res = await excluirRegraComissao(r.id); if (!res.success) setMsg(res.error); router.refresh() })
                    }}>{t.regras_excluir}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
