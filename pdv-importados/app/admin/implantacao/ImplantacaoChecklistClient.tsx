'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { InlineAlert, type InlineAlertTone } from '@/components/ui/InlineAlert'
import { emitToast } from '@/lib/gerente/toast'
import {
  autorizarGoLiveAction,
  atualizarItemImplantacaoAction,
  revogarGoLiveAction,
  validarDadosHomologacaoAction,
  type ChecklistItemRow,
  type ChecklistSnapshot,
} from './actions'
import {
  IMPLANTACAO_ITENS,
  IMPLANTACAO_SECOES,
  itemDefByKey,
  type GateStatus,
  type ImplantacaoSecao,
  type ItemStatus,
} from './implantacaoCatalog'
import { montarTimeline } from './evidenciaImplantacao'
import { ImplantacaoTimeline } from './ImplantacaoTimeline'

export type ImplantacaoLabels = {
  gateNaoPronto: string
  gateProntoPendencias: string
  gateGoLive: string
  bloqueiosTitulo: string
  autorizar: string
  autorizando: string
  revogar: string
  revogando: string
  motivoRevogar: string
  observacaoGo: string
  colItem: string
  colStatus: string
  colResponsavel: string
  colData: string
  colObs: string
  statusPendente: string
  statusConcluido: string
  statusNa: string
  obrigatorio: string
  opcional: string
  grupoFiscalHint: string
  salvar: string
  itemSalvo: string
  validarDados: string
  validandoDados: string
  dadosOk: string
  dadosFalha: string
  timelineTitulo: string
  timelineVazio: string
  evidenciaHint: string
  secoes: Record<ImplantacaoSecao, string>
  itens: Record<string, string>
}

type Props = {
  inicial: ChecklistSnapshot
  podeAutorizarGo: boolean
  labels: ImplantacaoLabels
  locale: string
}

function gateAlertTone(gate: GateStatus): InlineAlertTone {
  if (gate === 'GO_LIVE') return 'success'
  if (gate === 'PRONTO_PENDENCIAS') return 'warning'
  return 'danger'
}

function gateLabel(gate: GateStatus, L: ImplantacaoLabels): string {
  if (gate === 'GO_LIVE') return L.gateGoLive
  if (gate === 'PRONTO_PENDENCIAS') return L.gateProntoPendencias
  return L.gateNaoPronto
}

function fmtData(iso: string | null, locale: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ImplantacaoChecklistClient({
  inicial,
  podeAutorizarGo,
  labels: L,
  locale,
}: Props) {
  const [snap, setSnap] = useState(inicial)
  const [drafts, setDrafts] = useState<Record<string, ChecklistItemRow>>(() => {
    const m: Record<string, ChecklistItemRow> = {}
    for (const i of inicial.itens) m[i.key] = { ...i }
    return m
  })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [goObs, setGoObs] = useState('')
  const [revogarMotivo, setRevogarMotivo] = useState('')
  const [busyGo, setBusyGo] = useState(false)
  const [busyDados, setBusyDados] = useState(false)

  const bySecao = useMemo(() => {
    const map = new Map<ImplantacaoSecao, typeof IMPLANTACAO_ITENS>()
    for (const secao of IMPLANTACAO_SECOES) {
      map.set(
        secao,
        IMPLANTACAO_ITENS.filter((i) => i.secao === secao),
      )
    }
    return map
  }, [])

  function syncFromSnapshot(next: ChecklistSnapshot) {
    setSnap(next)
    const m: Record<string, ChecklistItemRow> = {}
    for (const i of next.itens) m[i.key] = { ...i }
    setDrafts(m)
  }

  async function salvarItem(key: string) {
    const draft = drafts[key]
    if (!draft) return
    setBusyKey(key)
    try {
      const r = await atualizarItemImplantacaoAction({
        itemKey: key,
        status: draft.status,
        responsavel: draft.responsavel,
        observacoes: draft.observacoes,
        lojaId: snap.lojaId,
      })
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      syncFromSnapshot(r.data)
      emitToast({ kind: 'success', message: L.itemSalvo })
    } finally {
      setBusyKey(null)
    }
  }

  async function onAutorizar() {
    setBusyGo(true)
    try {
      const r = await autorizarGoLiveAction(goObs, snap.lojaId)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      syncFromSnapshot(r.data)
    } finally {
      setBusyGo(false)
    }
  }

  async function onRevogar() {
    setBusyGo(true)
    try {
      const r = await revogarGoLiveAction(revogarMotivo, snap.lojaId)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      syncFromSnapshot(r.data)
      setRevogarMotivo('')
    } finally {
      setBusyGo(false)
    }
  }

  async function onValidarDados() {
    setBusyDados(true)
    try {
      const r = await validarDadosHomologacaoAction(snap.lojaId)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      syncFromSnapshot(r.data.snapshot)
      emitToast({
        kind: r.data.ok ? 'success' : 'error',
        message: r.data.ok ? L.dadosOk : `${L.dadosFalha}: ${r.data.resumo}`,
      })
    } finally {
      setBusyDados(false)
    }
  }

  const locked = snap.goAutorizado
  const timeline = useMemo(() => montarTimeline(snap.itens), [snap.itens])

  return (
    <div className="space-y-6">
      <InlineAlert tone={gateAlertTone(snap.gate)} title={gateLabel(snap.gate, L)}>
        {snap.bloqueios.length > 0 ? (
          <p>
            {L.bloqueiosTitulo}: {snap.bloqueios.length}
          </p>
        ) : null}
        {snap.goAutorizadoEm ? (
          <p className="text-caption">
            {fmtData(snap.goAutorizadoEm, locale)}
            {snap.goObservacao ? ` · ${snap.goObservacao}` : ''}
          </p>
        ) : null}
      </InlineAlert>

      <ImplantacaoTimeline
        titulo={L.timelineTitulo}
        vazio={L.timelineVazio}
        eventos={timeline}
        locale={locale}
        labelItem={(key) => L.itens[key] ?? key}
      />

      {!locked ? (
        <div className="rounded-xl border border-jl-border-1 bg-jl-surface-soft p-4 space-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={busyDados}
            onClick={() => void onValidarDados()}
            data-testid="implantacao-validar-dados"
          >
            {busyDados ? L.validandoDados : L.validarDados}
          </Button>
          <p className="text-[11px] text-jl-fg-3">{L.evidenciaHint}</p>
        </div>
      ) : null}

      {podeAutorizarGo ? (
        <div className="rounded-xl border border-jl-border-1 bg-jl-surface-soft p-4 space-y-3">
          {!locked ? (
            <>
              <label className="block text-xs font-medium text-jl-fg-3" htmlFor="go-obs">
                {L.observacaoGo}
              </label>
              <textarea
                id="go-obs"
                value={goObs}
                onChange={(e) => setGoObs(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-jl-border-1 bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                disabled={busyGo || snap.bloqueios.length > 0}
                onClick={() => void onAutorizar()}
              >
                {busyGo ? L.autorizando : L.autorizar}
              </Button>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-jl-fg-3" htmlFor="go-revogar">
                {L.motivoRevogar}
              </label>
              <input
                id="go-revogar"
                value={revogarMotivo}
                onChange={(e) => setRevogarMotivo(e.target.value)}
                className="w-full rounded-md border border-jl-border-1 bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busyGo}
                onClick={() => void onRevogar()}
              >
                {busyGo ? L.revogando : L.revogar}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {IMPLANTACAO_SECOES.map((secao) => {
        const defs = bySecao.get(secao) ?? []
        return (
          <section key={secao} className="rounded-xl border border-jl-border-1 overflow-hidden">
            <header className="border-b border-jl-border-1 bg-jl-surface-soft px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-jl-fg-2">
                {L.secoes[secao]}
              </h2>
              {secao === 'fiscal' ? (
                <p className="mt-1 text-xs text-jl-fg-3">{L.grupoFiscalHint}</p>
              ) : null}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-jl-border-1 text-left text-[10px] uppercase tracking-wide text-jl-fg-3">
                    <th className="px-3 py-2">{L.colItem}</th>
                    <th className="px-3 py-2 w-36">{L.colStatus}</th>
                    <th className="px-3 py-2 w-40">{L.colResponsavel}</th>
                    <th className="px-3 py-2 w-36">{L.colData}</th>
                    <th className="px-3 py-2">{L.colObs}</th>
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {defs.map((def) => {
                    const draft = drafts[def.key]
                    if (!draft) return null
                    const meta = itemDefByKey(def.key)!
                    return (
                      <tr key={def.key} className="border-b border-jl-border-1/50 align-top">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-jl-fg-1">{L.itens[def.key] ?? def.key}</div>
                          <div className="text-[11px] text-jl-fg-3">
                            {meta.obrigatorio || meta.grupo ? L.obrigatorio : L.opcional}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            disabled={locked}
                            value={draft.status}
                            onChange={(e) =>
                              setDrafts((cur) => ({
                                ...cur,
                                [def.key]: {
                                  ...draft,
                                  status: e.target.value as ItemStatus,
                                },
                              }))
                            }
                            className="w-full rounded-md border border-jl-border-1 bg-background px-2 py-1.5 text-xs"
                          >
                            <option value="PENDENTE">{L.statusPendente}</option>
                            <option value="CONCLUIDO">{L.statusConcluido}</option>
                            <option value="NA">{L.statusNa}</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            disabled={locked}
                            value={draft.responsavel ?? ''}
                            onChange={(e) =>
                              setDrafts((cur) => ({
                                ...cur,
                                [def.key]: { ...draft, responsavel: e.target.value },
                              }))
                            }
                            className="w-full rounded-md border border-jl-border-1 bg-background px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-jl-fg-3 tabular-nums">
                          {fmtData(draft.concluido_em, locale)}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            disabled={locked}
                            value={draft.observacoes ?? ''}
                            onChange={(e) =>
                              setDrafts((cur) => ({
                                ...cur,
                                [def.key]: { ...draft, observacoes: e.target.value },
                              }))
                            }
                            className="w-full rounded-md border border-jl-border-1 bg-background px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={locked || busyKey === def.key}
                            onClick={() => void salvarItem(def.key)}
                          >
                            {L.salvar}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
