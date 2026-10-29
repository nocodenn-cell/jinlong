'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { PageHeader, SectionCard, StatusBadge, type StatusBadgeTone } from '@/components/ui/admin-v2'
import { OperationalHubNav } from '@/components/ui/admin-v2/OperationalHubNav'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/navigation/routes'
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  bloqueiosDecisao,
  evidenciasVisiveis,
  type Decisao,
  type ErroRevisao,
  type RevisaoFiltro,
  type RevisaoItem,
  type RevisaoStatus,
} from '@/lib/revisaoOffline/revisaoOffline'
import { decidirRevisaoOffline } from '../actions'

type T = Mensagens['revisao_offline']

type Props = Readonly<{
  t: T
  locale: string
  filtro: RevisaoFiltro
  itens: readonly RevisaoItem[]
  erroLista: ErroRevisao | null
}>

const TOM_STATUS: Record<RevisaoStatus, StatusBadgeTone> = {
  PENDENTE: 'warning',
  APROVADO: 'success',
  REJEITADO: 'danger',
  RECONCILIADO_AUTO: 'neutral',
}
const TOM_CLASSIFICACAO: Record<RevisaoItem['classificacao'], StatusBadgeTone> = {
  ANTES_INATIVACAO: 'success',
  APOS_INATIVACAO: 'danger',
  NAO_COMPROVAVEL: 'warning',
}

function rotulo(map: Record<string, string>, k: string): string {
  return map[k] ?? k
}

function motivoPendencia(t: T, codigo: string): string {
  const m = t.motivos as Record<string, string>
  return m[codigo] ?? fmtTemplate(t.motivos.outro, { codigo })
}

export function RevisaoOfflineContent({ t, locale, filtro, itens, erroLista }: Props) {
  const router = useRouter()
  const [atualizando, startTransition] = useTransition()
  const [aberto, setAberto] = useState<string | null>(null)
  const [decidindo, setDecidindo] = useState<{ item: RevisaoItem; decisao: Decisao } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<ErroRevisao | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  // Trava síncrona contra duplo clique (o banco também é idempotente e trava a linha).
  const enviando = useRef(false)

  const pendentes = filtro === 'PENDENTE'
  const motivoOk = motivo.trim().length >= MOTIVO_MIN && motivo.trim().length <= MOTIVO_MAX

  const abrirDecisao = (item: RevisaoItem, decisao: Decisao) => {
    setErro(null)
    setSucesso(null)
    setMotivo('')
    setDecidindo({ item, decisao })
  }

  const confirmar = async () => {
    if (!decidindo || !motivoOk || enviando.current) return
    enviando.current = true
    setSalvando(true)
    setErro(null)
    try {
      const r = await decidirRevisaoOffline({ id: decidindo.item.id, decisao: decidindo.decisao, motivo: motivo.trim() })
      if (!r.ok) {
        setErro(r.erro)
        if (r.erro === 'ja_decidida' || r.erro === 'sem_permissao') {
          setDecidindo(null)
          startTransition(() => router.refresh())
        }
        return
      }
      setSucesso(r.idempotente ? t.sucesso_idempotente : r.status === 'APROVADO' ? t.sucesso_aprovado : t.sucesso_rejeitado)
      setDecidindo(null)
      setMotivo('')
      startTransition(() => router.refresh())
    } finally {
      enviando.current = false
      setSalvando(false)
    }
  }

  const resumoTexto = (it: RevisaoItem): string => {
    const r = it.resumo
    const partes: string[] = []
    if (r.totalLiquido !== undefined) partes.push(`${t.resumo.total}: ${formatBRL(r.totalLiquido, locale)}`)
    if (r.itens !== undefined) partes.push(`${t.resumo.itens}: ${r.itens}`)
    if (r.formaPagamento) partes.push(`${t.resumo.forma}: ${r.formaPagamento}`)
    if (r.valorInicial !== undefined) partes.push(`${t.resumo.valor_inicial}: ${formatBRL(r.valorInicial, locale)}`)
    if (r.valorFechamento !== undefined) partes.push(`${t.resumo.valor_fechamento}: ${formatBRL(r.valorFechamento, locale)}`)
    if (r.valor !== undefined) partes.push(`${t.resumo.valor}: ${formatBRL(r.valor, locale)}`)
    return partes.join(' · ') || '—'
  }

  return (
    <div className="admin-v2-page" data-testid="revisao-offline">
      <PageHeader title={t.titulo} subtitle={t.subtitulo} />
      <OperationalHubNav hub="vendas" />

      <div className="mb-3 flex items-start gap-2 text-[12px] text-jl-fg-2">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
        <p>{t.ajuda}</p>
      </div>

      <nav className="mb-4 flex gap-2" aria-label={t.titulo}>
        <Link
          href={ROUTES.admin.revisaoOffline}
          aria-current={pendentes ? 'page' : undefined}
          data-testid="revisao-aba-pendentes"
          className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${pendentes ? 'bg-jl-accent/15 text-jl-fg-1' : 'text-jl-fg-3'}`}
        >
          {t.aba_pendentes}
        </Link>
        <Link
          href={`${ROUTES.admin.revisaoOffline}?aba=historico`}
          aria-current={!pendentes ? 'page' : undefined}
          data-testid="revisao-aba-historico"
          className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${!pendentes ? 'bg-jl-accent/15 text-jl-fg-1' : 'text-jl-fg-3'}`}
        >
          {t.aba_historico}
        </Link>
      </nav>

      {erroLista ? (
        <div className="admin-v2-alert-danger mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {t.erros[erroLista]}
        </div>
      ) : null}
      {erro && !decidindo ? (
        <div className="admin-v2-alert-danger mb-4 rounded-lg px-3 py-2 text-[12px]" role="alert" data-testid="revisao-erro">
          {t.erros[erro]}
        </div>
      ) : null}
      {sucesso ? (
        <div className="admin-v2-alert-success mb-4 rounded-lg px-3 py-2 text-[12px]" role="status" data-testid="revisao-sucesso">
          {sucesso}
        </div>
      ) : null}

      <SectionCard title={pendentes ? t.aba_pendentes : t.aba_historico}>
        {itens.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-jl-fg-3" data-testid="revisao-vazio">
            {pendentes ? t.vazio_pendentes : t.vazio_historico}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-v2-dense-table w-full border-collapse text-left text-small" data-testid="revisao-tabela">
              <thead>
                <tr>
                  <th>{t.col_recebido}</th>
                  <th>{t.col_loja}</th>
                  <th>{t.col_tipo}</th>
                  <th>{t.col_operador}</th>
                  <th>{t.col_classificacao}</th>
                  <th>{t.col_pendencia}</th>
                  <th>{pendentes ? t.col_acoes : t.col_decisao}</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const b = bloqueiosDecisao(it)
                  const expandido = aberto === it.id
                  return (
                    <Fragment key={it.id}>
                      <tr data-testid="revisao-linha" data-event-id={it.eventId} data-status={it.status}>
                        <td>{formatDateTimeOrDash(it.recebidoEm, locale)}</td>
                        <td>{it.lojaNome}</td>
                        <td>{rotulo(t.tipos, it.tipo)}</td>
                        <td>
                          {it.operadorNome ?? t.operador_desconhecido}
                          {it.operadorAtivo === false ? (
                            <span className="ml-1 text-[11px] text-jl-fg-3">({t.operador_inativo})</span>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge tone={TOM_CLASSIFICACAO[it.classificacao]}>
                            {rotulo(t.classificacoes, it.classificacao)}
                          </StatusBadge>
                        </td>
                        <td className="max-w-[280px] text-[12px]">{motivoPendencia(t, it.motivo)}</td>
                        <td>
                          {pendentes ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="success"
                                data-testid="revisao-aprovar"
                                disabled={b.aprovar !== null || salvando || atualizando}
                                onClick={() => abrirDecisao(it, 'APROVAR')}
                              >
                                {t.aprovar}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                data-testid="revisao-rejeitar"
                                disabled={b.rejeitar !== null || salvando || atualizando}
                                onClick={() => abrirDecisao(it, 'REJEITAR')}
                              >
                                {t.rejeitar}
                              </Button>
                              {b.aprovar === 'meu_evento' ? (
                                <span className="text-[11px] text-jl-fg-3" data-testid="revisao-bloqueio-meu-evento">
                                  {t.bloqueio_meu_evento}
                                </span>
                              ) : b.aprovar === 'fora_de_ordem' ? (
                                <span className="text-[11px] text-jl-fg-3" data-testid="revisao-bloqueio-ordem">
                                  {fmtTemplate(t.bloqueio_fora_de_ordem, { n: it.anterioresPendentes })}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-[12px]" data-testid="revisao-decisao">
                              <StatusBadge tone={TOM_STATUS[it.status]}>{rotulo(t.status, it.status)}</StatusBadge>
                              <div className="mt-1 text-jl-fg-2">
                                {t.decidido_por}: {it.decididoPorNome ?? '—'} · {t.decidido_em}:{' '}
                                {formatDateTimeOrDash(it.decididoEm, locale)}
                              </div>
                              {it.decisaoMotivo ? (
                                <div className="mt-0.5 text-jl-fg-3">
                                  {t.decisao_motivo}: {it.decisaoMotivo}
                                </div>
                              ) : null}
                            </div>
                          )}
                          <button
                            type="button"
                            className="mt-1 block text-[11px] text-jl-accent underline"
                            aria-expanded={expandido}
                            data-testid="revisao-detalhes"
                            onClick={() => setAberto(expandido ? null : it.id)}
                          >
                            {expandido ? t.ocultar_detalhes : t.ver_detalhes}
                          </button>
                        </td>
                      </tr>
                      {expandido ? (
                        <tr data-testid="revisao-detalhe">
                          <td colSpan={7} className="bg-[var(--color-surface-soft)] text-[12px]">
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 p-2 md:grid-cols-2">
                              <dt className="font-medium">{t.detalhe_pendencia}</dt>
                              <dd>{motivoPendencia(t, it.motivo)}</dd>
                              <dt className="font-medium">{t.detalhe_classificacao}</dt>
                              <dd>{rotulo(t.classificacoes, it.classificacao)}</dd>
                              <dt className="font-medium">{t.detalhe_resumo}</dt>
                              <dd>{resumoTexto(it)}</dd>
                              <dt className="font-medium">{t.detalhe_horario_pdv}</dt>
                              <dd>
                                {formatDateTimeOrDash(it.horarioDispositivo, locale, 'medium')}{' '}
                                <span className="text-jl-fg-3">{t.detalhe_horario_aviso}</span>
                              </dd>
                              <dt className="font-medium">{t.detalhe_origem}</dt>
                              <dd>{rotulo(t.origens, it.origem)}</dd>
                              <dt className="font-medium">{t.detalhe_evento}</dt>
                              <dd className="font-mono">{it.eventId}</dd>
                              {it.caixaId ? (
                                <>
                                  <dt className="font-medium">{t.detalhe_caixa}</dt>
                                  <dd className="font-mono">{it.caixaId}</dd>
                                </>
                              ) : null}
                              {it.vendaId ? (
                                <>
                                  <dt className="font-medium">{t.detalhe_venda}</dt>
                                  <dd className="font-mono">{it.vendaId}</dd>
                                </>
                              ) : null}
                            </dl>
                            {evidenciasVisiveis(it.evidencias).length > 0 ? (
                              <div className="p-2">
                                <p className="mb-1 font-medium">{t.detalhe_evidencias}</p>
                                <ul className="list-disc pl-5" data-testid="revisao-evidencias">
                                  {evidenciasVisiveis(it.evidencias).map(([k, v]) => (
                                    <li key={k}>
                                      {rotulo(t.evidencias, k)}: {/^\d{4}-\d{2}-\d{2}T/.test(v) ? formatDateTimeOrDash(v, locale, 'medium') : v}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {decidindo ? (
        <DragonModal
          open
          onClose={() => (salvando ? undefined : setDecidindo(null))}
          variant={decidindo.decisao === 'REJEITAR' ? 'danger' : 'default'}
          size="sm"
          title={decidindo.decisao === 'APROVAR' ? t.confirmar_aprovar_titulo : t.confirmar_rejeitar_titulo}
          dismissable={!salvando}
          closeLabel={t.fechar}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setDecidindo(null)} disabled={salvando}>
                {t.cancelar}
              </Button>
              <Button
                type="button"
                variant={decidindo.decisao === 'APROVAR' ? 'success' : 'danger'}
                data-testid="revisao-confirmar"
                onClick={() => void confirmar()}
                disabled={!motivoOk || salvando}
              >
                {salvando ? t.salvando : decidindo.decisao === 'APROVAR' ? t.aprovar : t.rejeitar}
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-jl-fg-2">
            {decidindo.decisao === 'APROVAR' ? t.confirmar_aprovar_texto : t.confirmar_rejeitar_texto}
          </p>
          <p className="mb-3 text-[12px] text-jl-fg-2">
            {rotulo(t.tipos, decidindo.item.tipo)} · {decidindo.item.operadorNome ?? t.operador_desconhecido} ·{' '}
            {motivoPendencia(t, decidindo.item.motivo)}
          </p>
          <label htmlFor="revisao-motivo" className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-jl-fg-3">
            {t.motivo_label}
          </label>
          <textarea
            id="revisao-motivo"
            data-testid="revisao-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
            placeholder={t.motivo_placeholder}
            className="admin-v2-input w-full px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
            rows={4}
            maxLength={MOTIVO_MAX}
            required
          />
          <p className="mt-1 text-[10px] text-jl-fg-3">
            {fmtTemplate(t.motivo_contador, { n: motivo.length, max: MOTIVO_MAX })}
            {!motivoOk && motivo.length > 0 ? ` · ${fmtTemplate(t.motivo_minimo, { min: MOTIVO_MIN })}` : ''}
          </p>
          {erro ? (
            <div className="admin-v2-alert-danger mt-3 rounded-lg px-3 py-2 text-[12px]" role="alert" data-testid="revisao-erro-modal">
              {t.erros[erro]}
            </div>
          ) : null}
        </DragonModal>
      ) : null}
    </div>
  )
}
