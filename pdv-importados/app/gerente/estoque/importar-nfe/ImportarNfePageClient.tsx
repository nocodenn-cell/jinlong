'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusChip } from '@/components/ui/StatusChip'
import { Button } from '@/components/ui/button'
import { NotaManualForm } from './NotaManualForm'
import { DocumentoEntregaLink } from './DocumentoEntregaLink'
import { formatBRL } from '@/lib/format/money'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import { Checkbox, Input, Textarea } from '@/components/ui/forms'
import { ROUTES, adminFinanceiroContasPagarFornecedorQuery } from '@/lib/navigation/routes'
import type { NfeParsed } from '@/lib/nfe/nfeParser'
import type {
  ConferenciaImportacaoNfe,
  ConfirmarImportacaoNfeResultado,
  ImportacaoNfePendente,
  ItemConferenciaNfe,
  LinhaPreviewNfe,
  ProdutoVinculoOpcao,
  ResumoContasPagarImportacaoNfe,
  StatusItemNfe,
} from './actions'
import {
  buscarProdutosParaVinculo,
  confirmarImportacaoNfe,
  executarImportacaoNfe,
  listarImportacoesNfePendentes,
  listarNotasLancadas,
  type NotaLancada,
  obterConferenciaImportacaoNfe,
  obterResumoContasPagarImportacaoNfe,
  previewImportacaoNfe,
  registrarConferenciaNfe,
  vincularImportacaoNfeOrdemCompra,
} from './actions'
import { OrdemCompraVinculoAutocomplete } from '@/app/gerente/recebimento/OrdemCompraVinculoAutocomplete'
import { fmtQtd } from '@/app/gerente/compras/ocRecebimento'
import { fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'

type Props = Readonly<{
  semDocumento?: boolean
  produtoInicial?: import('@/app/gerente/recebimento/RecebimentoGerentePageClient').RecebimentoProdutoOpt | null
  idioma: Idioma
  embeddedInAdminHub?: boolean
  historicoOnly?: boolean
  /** Deep-link `?importacao=<id>`: abre essa importação (aberta ou concluída) ao montar. */
  importacaoInicialId?: string | null
}>

type LinhaEditavel = LinhaPreviewNfe & {
  fator: number
  atualizar_custo: boolean
  acao: 'VINCULAR' | 'CRIAR' | null
  produto_id_destino: string | null
  vinculo_nome: string | null
}

type LinhaComIndice = { linha: LinhaEditavel; idx: number }

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

/** `YYYY-MM-DD` → data local (evita o recuo de 1 dia de `new Date('YYYY-MM-DD')` em fusos negativos). */
function fmtVencimento(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function statusBadgeKey(status: StatusItemNfe): string {
  if (status === 'RECONHECIDO_DEPARA' || status === 'RECONHECIDO_CATALOGO') return 'ATIVO'
  if (status === 'RECONHECIDO_EAN') return 'TEM_NF'
  return 'ALERTA'
}

function linhaResolvida(l: LinhaEditavel): boolean {
  if (l.acao === 'CRIAR') return true
  return l.acao === 'VINCULAR' && !!l.produto_id_destino
}

export type ItemConferenciaPreenchido = {
  item_id: string
  quantidade_conferida: number
  divergencia_obs: string | null
}

/**
 * Valor inicial do campo de conferência ao carregar/retomar uma importação.
 * Só usa uma contagem já salva no servidor (retomada) — nunca a quantidade
 * da nota. `null` significa "campo começa vazio": o operador ainda não
 * contou este item, e mostrar a quantidade da nota aqui seria indistinguível
 * de uma contagem física real. Extraída como função pura para ser testável
 * sem montar o componente, no mesmo espírito de `buildItensConferenciaPreenchidos`.
 */
export function valorInicialQtdConferida(
  item: Pick<ItemConferenciaNfe, 'quantidade_conferida'>,
): string | null {
  return item.quantidade_conferida !== null ? String(item.quantidade_conferida) : null
}

/**
 * Monta o payload de `registrar_conferencia_nfe` só com itens que o operador
 * de fato preencheu. Um campo em branco/ausente significa "ainda não contei
 * este item" — nunca vira silenciosamente a quantidade da nota (achado de
 * revisão pré-merge da PR1: sem isto, limpar o campo produzia o mesmo efeito
 * que confirmar a quantidade da nota, sem contagem física real). Extraída
 * como função pura só para ser testável sem montar o componente.
 */
export function buildItensConferenciaPreenchidos(
  itens: ReadonlyArray<ItemConferenciaNfe>,
  qtdConferida: Readonly<Record<string, string>>,
  obsDivergencia: Readonly<Record<string, string>>,
): ItemConferenciaPreenchido[] {
  return itens.flatMap((item) => {
    const raw = qtdConferida[item.item_id]
    if (raw === undefined || raw.trim() === '') return []
    const qtd = Number(raw)
    if (!Number.isFinite(qtd) || qtd < 0) return []
    const obs = (obsDivergencia[item.item_id] ?? '').trim()
    return [
      {
        item_id: item.item_id,
        quantidade_conferida: qtd,
        divergencia_obs: obs.length > 0 ? obs : null,
      },
    ]
  })
}

export function ImportarNfePageClient({
  idioma,
  embeddedInAdminHub = false,
  historicoOnly = false,
  importacaoInicialId = null,
  semDocumento = false,
  produtoInicial = null,
}: Props) {
  const m = getMessages(idioma)
  const mi = useMemo(() => semDocumento ? {
    ...m.estoque.import_nfe,
    manual_titulo: m.gerente.recebimento_page.entrada_manual_titulo,
    manual_ajuda: m.gerente.recebimento_page.via_sem_documento_ajuda,
    manual_itens: m.gerente.recebimento_page.entrada_manual_itens,
    manual_item_desc: m.gerente.recebimento_page.label_produto,
    numero_nf: m.gerente.recebimento_page.entrada_manual_referencia,
  } : m.estoque.import_nfe, [m, semDocumento])
  const locale = localeFromIdioma(idioma)
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'

  const [xmlText, setXmlText] = useState('')
  const [parsed, setParsed] = useState<NfeParsed | null>(null)
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([])
  const [atualizarGlobal, setAtualizarGlobal] = useState(true)
  const atualizarGlobalRef = useRef(true)
  atualizarGlobalRef.current = atualizarGlobal
  const [dragOver, setDragOver] = useState(false)
  const [draftNovos, setDraftNovos] = useState<number | null>(null)

  // FLX-05: etapa de conferência — importar_nfe_transacao só cadastra/vincula
  // catálogo; o crédito de estoque/custo só acontece depois que o operador
  // confere a quantidade recebida item a item (registrar_conferencia_nfe) e
  // confirma (confirmar_importacao_nfe).
  const [conferencia, setConferencia] = useState<ConferenciaImportacaoNfe | null>(null)
  const [qtdConferida, setQtdConferida] = useState<Record<string, string>>({})
  const [obsDivergencia, setObsDivergencia] = useState<Record<string, string>>({})
  const [associarEntrega, setAssociarEntrega] = useState(false)
  const [historicoBusca, setHistoricoBusca] = useState('')
  const [historicoPagina, setHistoricoPagina] = useState(1)
  const [historicoErro, setHistoricoErro] = useState<string | null>(null)
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [pendentesErro, setPendentesErro] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<ImportacaoNfePendente[]>([])
  const [estoqueAtualizadoOk, setEstoqueAtualizadoOk] = useState(false)
  const [resumoContasPagar, setResumoContasPagar] = useState<ResumoContasPagarImportacaoNfe | null>(null)
  // UX-04: o que a confirmação fez no pedido relacionado (saldo, se fechou). `null` = sem pedido.
  const [resultadoOc, setResultadoOc] = useState<string | null>(null)

  const carregarPendentes = useCallback(async () => {
    try {
      const r = await listarImportacoesNfePendentes()
      setPendentesErro(r.success ? null : r.error)
      if (r.success) setPendentes(r.data)
    } catch { setPendentesErro('Falha ao consultar conferências pendentes.') }
  }, [])

  const [lancadas, setLancadas] = useState<NotaLancada[]>([])
  const historicoRequest = useRef(0)
  const carregarLancadas = useCallback(async () => {
    const request = ++historicoRequest.current
    setHistoricoLoading(true)
    try {
      const result = await listarNotasLancadas({ busca: historicoBusca, pagina: historicoPagina })
      if (request !== historicoRequest.current) return
      setHistoricoErro(result.success ? null : result.error)
      setLancadas(result.success ? result.data : [])
    } catch {
      if (request === historicoRequest.current) setHistoricoErro(idioma === 'pt' ? 'Falha ao consultar entradas.' : '查询入库失败。')
    } finally {
      if (request === historicoRequest.current) setHistoricoLoading(false)
    }
  }, [historicoBusca, historicoPagina, idioma])

  useEffect(() => {
    void carregarPendentes()
    void carregarLancadas()
  }, [carregarPendentes, carregarLancadas])

  const aplicarConferencia = useCallback((c: ConferenciaImportacaoNfe) => {
    setConferencia(c)
    setEstoqueAtualizadoOk(c.status === 'CONCLUIDA')
    setQtdConferida((prev) => {
      const next = { ...prev }
      for (const item of c.itens) {
        if (next[item.item_id] === undefined) {
          const valor = valorInicialQtdConferida(item)
          if (valor !== null) next[item.item_id] = valor
        }
      }
      return next
    })
    // Retomar uma conferência (após recarregar a página ou reabrir uma
    // pendente) precisa devolver a observação de divergência já salva —
    // sem isso, o próximo "Registrar conferência" sobrescreveria com null
    // toda observação anterior, mesmo de itens que não mudaram.
    setObsDivergencia((prev) => {
      const next = { ...prev }
      for (const item of c.itens) {
        if (next[item.item_id] === undefined && item.divergencia_obs) {
          next[item.item_id] = item.divergencia_obs
        }
      }
      return next
    })
  }, [])

  const previewOpts = useMemo(() => ({}), [])
  const importOpts = useMemo(
    () => ({
      successMessage: mi.import_ok,
      onSuccess: (data: { importacao_id: string | null; produtos_novos: number }) => {
        setDraftNovos(data.produtos_novos > 0 ? data.produtos_novos : null)
        if (data.produtos_novos > 0) {
          emitGerenteToast({
            kind: 'info',
            message: mi.import_draft_aviso.replace('{{n}}', String(data.produtos_novos)),
          })
        }
        if (data.importacao_id) {
          void obterConferenciaImportacaoNfe(data.importacao_id).then((r) => {
            if (r.success) aplicarConferencia(r.data)
          })
        }
      },
    }),
    [mi.import_ok, mi.import_draft_aviso, aplicarConferencia],
  )

  const aplicarPreview = useCallback(
    (data: { parsed: NfeParsed; linhas: LinhaPreviewNfe[] }) => {
      setParsed(data.parsed)
      setLinhas(
        data.linhas.map((l) => ({
          ...l,
          fator: 1,
          atualizar_custo: atualizarGlobalRef.current,
          acao: l.status_produto === 'DESCONHECIDO' ? null : 'VINCULAR',
          produto_id_destino: l.produto_id,
          vinculo_nome: l.produto_nome,
        })),
      )
    },
    [],
  )

  const { mutate: previewMut, loading: previewLoading } = useGerenteMutation(
    async (xml: string) => {
      const r = await previewImportacaoNfe(xml)
      if (!r.success) throw new Error(r.error)
      aplicarPreview(r.data)
      return null
    },
    previewOpts,
  )

  const { mutate: importMut, loading: importLoading } = useGerenteMutation(
    async (payload: Parameters<typeof executarImportacaoNfe>[0]) => {
      const r = await executarImportacaoNfe(payload)
      if (!r.success) throw new Error(r.error)
      return r.data
    },
    importOpts,
  )

  const { mutate: retomarMut, loading: retomarLoading } = useGerenteMutation(
    async (importacaoId: string) => {
      const r = await obterConferenciaImportacaoNfe(importacaoId)
      if (!r.success) throw new Error(r.error)
      aplicarConferencia(r.data)
      return null
    },
  )

  // Depois de "dar entrada" (ou ao abrir uma importação já concluída) mostra o que
  // a confirmação gerou no financeiro: `confirmar_importacao_nfe` cria as contas
  // a pagar a partir das duplicatas do XML, mas a tela nunca dizia isso.
  const importacaoConcluidaId = estoqueAtualizadoOk ? (conferencia?.importacao_id ?? null) : null
  useEffect(() => {
    if (!importacaoConcluidaId) {
      setResumoContasPagar(null)
      return
    }
    let cancelado = false
    void obterResumoContasPagarImportacaoNfe(importacaoConcluidaId).then((r) => {
      if (!cancelado && r.success) setResumoContasPagar(r.data)
    })
    return () => {
      cancelado = true
    }
  }, [importacaoConcluidaId])

  const importacaoInicialAbertaRef = useRef(false)
  useEffect(() => {
    if (!importacaoInicialId || importacaoInicialAbertaRef.current) return
    importacaoInicialAbertaRef.current = true
    void retomarMut(importacaoInicialId)
  }, [importacaoInicialId, retomarMut])

  const registrarOpts = useMemo(
    () => ({
      successMessage: mi.conferencia_registrada,
      onSuccess: () => {
        if (conferencia) {
          void obterConferenciaImportacaoNfe(conferencia.importacao_id).then((r) => {
            if (r.success) aplicarConferencia(r.data)
          })
        }
      },
    }),
    [mi.conferencia_registrada, conferencia, aplicarConferencia],
  )

  const { mutate: registrarMut, loading: registrarLoading } = useGerenteMutation(
    async (c: ConferenciaImportacaoNfe) => {
      const itens = buildItensConferenciaPreenchidos(c.itens, qtdConferida, obsDivergencia)
      if (itens.length === 0) {
        throw new Error(mi.conferencia_nenhum_item_preenchido)
      }
      const r = await registrarConferenciaNfe({ importacao_id: c.importacao_id, itens })
      if (!r.success) throw new Error(r.error)
      return r.data
    },
    registrarOpts,
  )

  const confirmarOpts = useMemo(
    () => ({
      successMessage: mi.confirmar_estoque_ok,
      onSuccess: (res: ConfirmarImportacaoNfeResultado) => {
        setEstoqueAtualizadoOk(true)
        void carregarPendentes()
        void carregarLancadas()
        const oc = res?.oc
        if (oc) {
          const vars = {
            oc: fmtGerenteIdCurto(oc.oc_id),
            abatido: fmtQtd(res.abatido),
            recebido: fmtQtd(oc.recebido_total),
            pedido: fmtQtd(oc.pedido_total),
            faltam: fmtQtd(oc.pendente_total),
          }
          setResultadoOc(fmtTemplate(oc.encerrada ? mi.oc_resultado_completo : mi.oc_resultado_parcial, vars))
        } else {
          setResultadoOc(null)
        }
      },
    }),
    [mi.confirmar_estoque_ok, mi.oc_resultado_completo, mi.oc_resultado_parcial, carregarPendentes, carregarLancadas],
  )

  const { mutate: confirmarMut, loading: confirmarLoading } = useGerenteMutation(
    async (importacaoId: string) => {
      if (!podeConfirmarEstoque) throw new Error(mi.confirmar_estoque_pendente)
      const r = await confirmarImportacaoNfe({ importacao_id: importacaoId })
      if (!r.success) throw new Error(r.error)
      return r.data
    },
    confirmarOpts,
  )

  // Relaciona (ou desfaz) a NF-e a um pedido — sempre escolha do operador, nunca presumido.
  const { mutate: vincularOcMut, loading: vincularOcLoading } = useGerenteMutation(
    async (p: { importacaoId: string; ocId: string | null }) => {
      const r = await vincularImportacaoNfeOrdemCompra({
        importacao_id: p.importacaoId,
        ordem_compra_id: p.ocId,
      })
      if (!r.success) throw new Error(r.error)
      const atual = await obterConferenciaImportacaoNfe(p.importacaoId)
      if (atual.success) aplicarConferencia(atual.data)
      return p.ocId
    },
    {
      onSuccess: (ocId) => {
        emitGerenteToast({ kind: 'success', message: ocId ? mi.oc_vinculo_ok : mi.oc_desvinculo_ok })
      },
    },
  )

  const onFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.xml')) {
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const t = typeof reader.result === 'string' ? reader.result : ''
        setXmlText(t)
        void previewMut(t)
      }
      reader.readAsText(file, 'UTF-8')
    },
    [previewMut],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files[0]
      if (f) onFile(f)
    },
    [onFile],
  )

  const custoUnit = (l: LinhaEditavel) => {
    if (!l.fator || l.fator <= 0) return 0
    return l.v_un_com / l.fator
  }

  const setLinha = useCallback((idx: number, patch: Partial<LinhaEditavel>) => {
    setLinhas((rows) => rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }, [])

  const reconhecidos = useMemo(
    (): LinhaComIndice[] =>
      linhas
        .map((l, idx) => ({ linha: l, idx }))
        .filter(({ linha }) => linha.status_produto !== 'DESCONHECIDO'),
    [linhas],
  )
  const desconhecidos = useMemo(
    (): LinhaComIndice[] =>
      linhas
        .map((l, idx) => ({ linha: l, idx }))
        .filter(({ linha }) => linha.status_produto === 'DESCONHECIDO'),
    [linhas],
  )

  const tudoResolvido = linhas.length > 0 && linhas.every(linhaResolvida)
  const podeImportar = !!parsed && linhas.length > 0 && !previewLoading && tudoResolvido

  const handleImportar = () => {
    if (!parsed || !tudoResolvido) return
    const base = {
      origem_manual: parsed.origem_manual,
      chave_acesso: parsed.chave_acesso,
      numero_nf: parsed.numero_nf,
      emitente_cnpj: onlyDigits(parsed.emitente.cnpj),
      emitente_nome: parsed.emitente.nome,
      atualizar_custo_padrao: atualizarGlobal,
      duplicatas: parsed.duplicatas ?? [],
      linhas: linhas.map((l) => ({
        nome_produto: l.nome_produto,
        gtin: l.gtin,
        ref_fornecedor: l.ref_fornecedor,
        ncm: l.ncm,
        u_com: l.u_com,
        q_com: l.q_com,
        v_un_com: l.v_un_com,
        fator: l.fator,
        atualizar_custo: l.atualizar_custo,
        acao: (l.acao ?? 'CRIAR') as 'VINCULAR' | 'CRIAR',
        produto_id_destino: l.acao === 'CRIAR' ? null : l.produto_id_destino,
      })),
    }
    void importMut(base)
  }

  const limpar = () => {
    const tinhaConferenciaEmAberto = !!conferencia && !estoqueAtualizadoOk
    setXmlText('')
    setParsed(null)
    setLinhas([])
    setDraftNovos(null)
    setConferencia(null)
    setAssociarEntrega(false)
    setQtdConferida({})
    setObsDivergencia({})
    setEstoqueAtualizadoOk(false)
    setResultadoOc(null)
    // A lista de pendentes foi carregada antes desta importação existir —
    // sem recarregar, "Limpar" para adiar a conferência esconde a NF-e que
    // acabou de ser processada até a próxima navegação para a página.
    if (tinhaConferenciaEmAberto) void carregarPendentes()
  }

  const itensPendentesConferencia = useMemo(
    () => (conferencia?.itens ?? []).filter((i) => i.status_conferencia === 'EM_CONFERENCIA'),
    [conferencia],
  )
  const conferenciaAlterada = (conferencia?.itens ?? []).some((item) => {
    const raw = qtdConferida[item.item_id]
    const quantidade = raw === undefined || raw.trim() === '' ? null : Number(raw)
    const observacao = (obsDivergencia[item.item_id] ?? '').trim() || null
    return quantidade !== item.quantidade_conferida || observacao !== item.divergencia_obs
  })
  const conferenciaPronta =
    !!conferencia &&
    conferencia.status === 'EM_CONFERENCIA' &&
    conferencia.itens.length > 0 &&
    itensPendentesConferencia.length === 0 &&
    !conferenciaAlterada &&
    !registrarLoading &&
    !confirmarLoading

  const podeConfirmarEstoque = conferenciaPronta && (!associarEntrega || !!conferencia?.entrega_anterior_id)

  const divergeDaNota = (item: ItemConferenciaNfe): boolean => {
    const raw = qtdConferida[item.item_id]
    if (raw === undefined || raw === '') return false
    const qtd = Number(raw)
    return Number.isFinite(qtd) && qtd !== item.quantidade_nfe
  }

  const reconhecidosColumns: Column<LinhaComIndice>[] = useMemo(
    () => [
      {
        key: 'nome',
        header: mi.col_item,
        cell: ({ linha: l }) => (
          <div className="max-w-[12rem] text-caption font-medium leading-snug">
            {l.nome_produto}
            {l.vinculo_nome ? (
              <span className="mt-0.5 block text-caption text-fg-muted">
                {mi.vinculado_a}: {l.vinculo_nome}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'ref',
        header: mi.col_ref,
        cell: ({ linha: l }) => (
          <span className="font-mono text-caption">{l.ref_fornecedor}</span>
        ),
      },
      {
        key: 'gtin',
        header: mi.col_gtin,
        cell: ({ linha: l }) => (
          <span className="font-mono text-caption">{l.gtin ?? '—'}</span>
        ),
      },
      {
        key: 'st',
        header: mi.col_status,
        cell: ({ linha: l }) => (
          <StatusChip
            status={statusBadgeKey(l.status_produto)}
            label={
              l.status_produto === 'RECONHECIDO_CATALOGO'
                ? l.produto_nome ?? l.nome_produto
                : l.status_produto === 'RECONHECIDO_DEPARA'
                ? mi.status_reconhecido_depara
                : mi.status_reconhecido_ean
            }
          />
        ),
      },
      {
        key: 'q',
        header: mi.col_q_xml,
        align: 'right',
        cell: ({ linha: l }) => (
          <span className="tabular-nums text-caption">{l.q_com}</span>
        ),
      },
      {
        key: 'un',
        header: mi.col_un_nf,
        cell: ({ linha: l }) => <span className="text-caption">{l.u_com ?? '—'}</span>,
      },
      {
        key: 'fat',
        header: mi.col_fator,
        width: '5rem',
        cell: ({ linha: l, idx }) => (
          <Input
            type="number"
            min={0.001}
            step={0.001}
            controlSize="sm"
            value={l.fator}
            onChange={(e) => {
              const v = Number(e.target.value)
              setLinha(idx, { fator: v > 0 ? v : 1 })
            }}
            className="text-right"
          />
        ),
      },
      {
        key: 'custo',
        header: mi.col_custo_unit,
        align: 'right',
        cell: ({ linha: l }) => (
          <span className="tabular-nums text-caption font-semibold">
            {formatBRL(custoUnit(l), locale)}
          </span>
        ),
      },
      {
        key: 'ac',
        header: mi.atualizar_custo_linha,
        width: '6rem',
        align: 'center',
        cell: ({ linha: l, idx }) => (
          <Checkbox
            checked={l.atualizar_custo}
            onChange={(e) => setLinha(idx, { atualizar_custo: e.target.checked })}
            title={mi.atualizar_custo_linha}
            aria-label={mi.atualizar_custo_linha}
          />
        ),
      },
    ],
    [locale, mi, setLinha],
  )

  const desconhecidosColumns: Column<LinhaComIndice>[] = useMemo(
    () => [
      {
        key: 'nome',
        header: mi.col_item,
        cell: ({ linha: l }) => (
          <div className="max-w-[12rem] text-caption font-medium leading-snug">{l.nome_produto}</div>
        ),
      },
      {
        key: 'ref',
        header: mi.col_ref,
        cell: ({ linha: l }) => (
          <span className="font-mono text-caption">{l.ref_fornecedor}</span>
        ),
      },
      {
        key: 'gtin',
        header: mi.col_gtin,
        cell: ({ linha: l }) => (
          <span className="font-mono text-caption">{l.gtin ?? '—'}</span>
        ),
      },
      {
        key: 'q',
        header: mi.col_q_xml,
        align: 'right',
        cell: ({ linha: l }) => (
          <span className="tabular-nums text-caption">{l.q_com}</span>
        ),
      },
      {
        key: 'fat',
        header: mi.col_fator,
        width: '5rem',
        cell: ({ linha: l, idx }) => (
          <Input
            type="number"
            min={0.001}
            step={0.001}
            controlSize="sm"
            value={l.fator}
            onChange={(e) => {
              const v = Number(e.target.value)
              setLinha(idx, { fator: v > 0 ? v : 1 })
            }}
            className="text-right"
          />
        ),
      },
      {
        key: 'custo',
        header: mi.col_custo_unit,
        align: 'right',
        cell: ({ linha: l }) => (
          <span className="tabular-nums text-caption font-semibold">
            {formatBRL(custoUnit(l), locale)}
          </span>
        ),
      },
      {
        key: 'res',
        header: mi.col_resolucao,
        width: '18rem',
        cell: ({ linha: l, idx }) => (
          <ResolverDesconhecido
            linha={l}
            labels={{
              buscar_placeholder: mi.buscar_placeholder,
              buscar_vazio: mi.buscar_vazio,
              acao_cadastrar_novo: mi.acao_cadastrar_novo,
              acao_trocar: mi.acao_trocar,
              novo_produto: mi.novo_produto,
              vinculado_a: mi.vinculado_a,
            }}
            onVincular={(prod) =>
              setLinha(idx, {
                acao: 'VINCULAR',
                produto_id_destino: prod.id,
                vinculo_nome: prod.nome,
              })
            }
            onCriar={() =>
              setLinha(idx, { acao: 'CRIAR', produto_id_destino: null, vinculo_nome: null })
            }
            onTrocar={() =>
              setLinha(idx, { acao: null, produto_id_destino: null, vinculo_nome: null })
            }
          />
        ),
      },
    ],
    [locale, mi, setLinha],
  )

  return (
    <div
      className={
        embeddedInAdminHub
          ? `space-y-4 ${fontClass}`
          : `admin-v2-page space-y-4 ${fontClass}`
      }
    >
      {!semDocumento && !embeddedInAdminHub ? <PageHeader title={mi.titulo} subtitle={mi.subtitulo} /> : null}

      {!embeddedInAdminHub ? (
        <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
          ← {mi.voltar}
        </Link>
      ) : null}

      {historicoOnly && pendentesErro ? <p role="alert">{pendentesErro}</p> : null}
      {historicoOnly && !conferencia ? <div className="flex flex-wrap gap-2">
        <Input aria-label={idioma === 'pt' ? 'Buscar documento ou fornecedor' : '搜索单据或供应商'}
          placeholder={idioma === 'pt' ? 'Documento ou fornecedor' : '单据或供应商'} value={historicoBusca}
          onChange={(e) => { setHistoricoBusca(e.target.value); setHistoricoPagina(1) }} />
        <Button variant="outline" disabled={historicoPagina <= 1 || historicoLoading} onClick={() => setHistoricoPagina((page) => page - 1)}>{idioma === 'pt' ? 'Anterior' : '上一页'}</Button>
        <span className="self-center text-caption">{historicoPagina}</span>
        <Button variant="outline" disabled={lancadas.length < 30 || historicoLoading} onClick={() => setHistoricoPagina((page) => page + 1)}>{idioma === 'pt' ? 'Próxima' : '下一页'}</Button>
        {historicoErro ? <p role="alert">{historicoErro}</p> : null}
        {!historicoLoading && !historicoErro && lancadas.length === 0 ? <p>{idioma === 'pt' ? 'Nenhuma entrada encontrada.' : '未找到入库记录。'}</p> : null}
      </div> : null}
      {historicoOnly && lancadas.length > 0 && !conferencia ? (
        <SectionCard title={mi.lancadas_titulo} subtitle={mi.lancadas_hint}>
          <ul className="divide-y divide-[var(--color-border)]" data-testid="notas-lancadas">
            {lancadas.map((n) => (
              <li key={n.importacao_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium">
                    {n.numero_nf ? `${mi.numero_nf} ${n.numero_nf}` : mi.pendentes_sem_numero} —{' '}
                    <span className="text-fg-muted">{n.fornecedor_nome}</span>
                    {n.fornecedor_cnpj ? (
                      <span className="ml-2 font-mono text-caption text-fg-muted">{n.fornecedor_cnpj}</span>
                    ) : null}
                  </p>
                  <p className="text-caption text-fg-muted">
                    {fmtGerenteDateTime(n.created_at, locale)} · {n.itens_total} {mi.lancadas_itens} ·{' '}
                    {fmtQtd(n.unidades_total)} {mi.lancadas_unidades} · {mi.lancadas_valor}{' '}
                    {formatBRL(n.valor_total)}
                  </p>
                  <p
                    className={`text-caption font-semibold ${
                      n.a_pagar > 0 ? 'text-[var(--color-warning-strong)]' : 'text-[var(--color-success-strong)]'
                    }`}
                  >
                    {n.a_pagar > 0
                      ? `${mi.lancadas_a_pagar}: ${formatBRL(n.a_pagar)}`
                      : mi.lancadas_quitada}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={retomarLoading}
                  onClick={() => void retomarMut(n.importacao_id)}
                >
                  {mi.lancadas_abrir}
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {historicoOnly && pendentes.length > 0 && !conferencia ? (
        <SectionCard title={mi.pendentes_titulo} subtitle={mi.pendentes_hint}>
          <ul className="divide-y divide-[var(--color-border)]">
            {pendentes.map((p) => (
              <li key={p.importacao_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium">
                    {p.numero_nf ? `${mi.numero_nf} ${p.numero_nf}` : mi.pendentes_sem_numero} —{' '}
                    <span className="text-fg-muted">{p.fornecedor_nome}</span>
                  </p>
                  <p className="text-caption text-fg-muted">
                    {mi.pendentes_col_itens}: {p.itens_conferidos}/{p.itens_total}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={retomarLoading}
                  onClick={() => void retomarMut(p.importacao_id)}
                >
                  {mi.pendentes_btn_retomar}
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {!historicoOnly && !parsed && !conferencia && !semDocumento ? <section
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`admin-v2-section-card rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragOver
            ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]'
            : 'border-[var(--color-border)]'
        }`}
      >
        <p className="mb-3 text-center text-body text-fg-muted">{mi.drop_hint}</p>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <input
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            id="xml-upload"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
          <Button asChild variant="outline" size="sm">
            <label htmlFor="xml-upload" className="cursor-pointer">
              XML
            </label>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!xmlText.trim() || previewLoading}
            loading={previewLoading}
            onClick={() => void previewMut(xmlText)}
          >
            {mi.btn_preview}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={limpar}>
            {mi.limpar}
          </Button>
        </div>
        <Textarea
          value={xmlText}
          onChange={(e) => setXmlText(e.target.value)}
          placeholder={idioma === 'pt' ? 'XML (opcional colar conteúdo)' : 'XML（可直接粘贴内容）'}
          className="mt-4 h-24 font-mono text-caption"
          spellCheck={false}
        />
        <NotaManualForm idioma={idioma} mi={mi} onPreview={aplicarPreview} />
      </section> : !historicoOnly && !parsed && !conferencia ? (
        <NotaManualForm idioma={idioma} mi={mi} onPreview={aplicarPreview} semDocumento produtoInicial={produtoInicial} />
      ) : null}

      {parsed && !conferencia ? (
        <SectionCard title={mi.emitente}>
          <p className="text-body">
            <span className="text-fg-muted">{parsed.emitente.nome}</span>
            <span className="mx-2 font-mono text-caption opacity-80">
              {onlyDigits(parsed.emitente.cnpj)}
            </span>
          </p>
          <p className="font-mono text-caption opacity-90">
            <span className="text-fg-muted">{mi.chave}: </span>
            {parsed.chave_acesso}
          </p>
          {parsed.numero_nf ? (
            <p className="text-body">
              <span className="text-fg-muted">{mi.numero_nf}: </span>
              {parsed.numero_nf}
            </p>
          ) : null}
          {(parsed.duplicatas?.length ?? 0) > 0 ? (
            <p className="text-body" data-testid="previa-contas-pagar">
              <span className="text-fg-muted">Contas a pagar que serão geradas: </span>
              {parsed.duplicatas.length} {parsed.duplicatas.length === 1 ? 'parcela' : 'parcelas'} ·{' '}
              {formatBRL(parsed.duplicatas.reduce((t, d) => t + d.valor, 0))}
            </p>
          ) : (
            <p className="text-body text-[var(--color-warning-strong)]">
              Esta nota não tem parcelas: nenhuma conta a pagar será gerada.
            </p>
          )}

          <label className="mt-2 flex items-center gap-2 text-body">
            <Checkbox
              checked={atualizarGlobal}
              onChange={(e) => {
                const v = e.target.checked
                setAtualizarGlobal(v)
                setLinhas((rows) => rows.map((r) => ({ ...r, atualizar_custo: v })))
              }}
            />
            {mi.atualizar_custo_global}
          </label>
        </SectionCard>
      ) : null}

      {reconhecidos.length > 0 && !conferencia ? (
        <SectionCard title={mi.secao_reconhecidos} subtitle={mi.secao_reconhecidos_hint}>
          <DataTable
            columns={reconhecidosColumns}
            data={reconhecidos}
            rowKey={({ linha: l, idx }) => `rec-${l.ref_fornecedor}-${idx}`}
            compact
          />
        </SectionCard>
      ) : null}

      {desconhecidos.length > 0 && !conferencia ? (
        <SectionCard title={mi.secao_desconhecidos} subtitle={mi.secao_desconhecidos_hint}>
          <DataTable
            columns={desconhecidosColumns}
            data={desconhecidos}
            rowKey={({ linha: l, idx }) => `desc-${l.ref_fornecedor}-${idx}`}
            compact
          />
        </SectionCard>
      ) : null}

      {linhas.length > 0 && !conferencia ? (
        <div className="flex flex-col items-end gap-2">
          {!tudoResolvido ? (
            <p className="text-caption font-medium text-[var(--color-warning-strong)]">
              {mi.resolver_pendentes}
            </p>
          ) : null}
          <Button
            type="button"
            variant="primary"
            disabled={!podeImportar}
            loading={importLoading}
            onClick={() => handleImportar()}
          >
            {mi.btn_importar}
          </Button>
        </div>
      ) : null}

      {conferencia ? (
        <SectionCard
          title={mi.secao_conferencia}
          subtitle={estoqueAtualizadoOk ? mi.secao_conferencia_concluida : mi.secao_conferencia_hint}
        >
          {draftNovos != null && draftNovos > 0 ? (
            <div className="mb-3 w-full rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-body text-[var(--color-warning-strong)]">
              <p>{mi.import_draft_aviso.replace('{{n}}', String(draftNovos))}</p>
              <Link
                href={`${ROUTES.admin.catalogo}?status=inativos`}
                className="mt-1 inline-block font-medium underline hover:no-underline"
              >
                Ir ao catálogo →
              </Link>
            </div>
          ) : null}

          {/* UX-04 — a NF-e pode ser relacionada a um pedido (escolha do operador). */}
          {(conferencia.status === 'EM_CONFERENCIA' && !estoqueAtualizadoOk) || conferencia.ordem_compra ? (
            <div
              className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2"
              data-testid="nfe-oc-vinculo"
            >
              <p className="text-caption font-semibold text-fg-muted">{mi.oc_titulo}</p>
              {conferencia.status === 'EM_CONFERENCIA' ? <DocumentoEntregaLink key={conferencia.importacao_id} importacaoId={conferencia.importacao_id}
                entregaId={conferencia.entrega_anterior_id} zh={idioma === 'zh'}
                podeAssociar={conferenciaPronta} onSelecionarModo={setAssociarEntrega}
                onAssociada={() => { void obterConferenciaImportacaoNfe(conferencia.importacao_id).then((result) => {
                  if (result.success) aplicarConferencia(result.data)
                  else emitGerenteToast({ kind: 'error', message: result.error })
                }) }} /> : conferencia.entrega_anterior_id ? <p>{idioma === 'pt' ? 'Documento associado à entrega; sem novo crédito de estoque.' : '单据已关联收货，未再次增加库存。'}</p> : null}
              {conferencia.ordem_compra ? (
                <>
                  <p className="mt-1 text-body" data-testid="nfe-oc-vinculada">
                    {fmtTemplate(mi.oc_vinculada, {
                      oc: fmtGerenteIdCurto(conferencia.ordem_compra.oc_id),
                      fornecedor: conferencia.ordem_compra.fornecedor_nome ?? '—',
                      recebido: fmtQtd(conferencia.ordem_compra.recebido_total),
                      pedido: fmtQtd(conferencia.ordem_compra.pedido_total),
                      faltam: fmtQtd(conferencia.ordem_compra.pendente_total),
                    })}
                  </p>
                  {conferencia.ordem_compra.itens_fora_do_pedido.length > 0 ? (
                    <p className="mt-1 text-caption text-[var(--color-warning-strong)]" data-testid="nfe-oc-fora">
                      {fmtTemplate(mi.oc_fora_do_pedido, {
                        itens: conferencia.ordem_compra.itens_fora_do_pedido.join(', '),
                      })}
                    </p>
                  ) : null}
                  {conferencia.status === 'EM_CONFERENCIA' && !estoqueAtualizadoOk ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      loading={vincularOcLoading}
                      onClick={() =>
                        void vincularOcMut({ importacaoId: conferencia.importacao_id, ocId: null })
                      }
                    >
                      {mi.oc_desvincular}
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mb-1.5 text-caption text-fg-subtle">{mi.oc_ajuda}</p>
                  <OrdemCompraVinculoAutocomplete
                    disabled={vincularOcLoading}
                    placeholder={m.gerente.recebimento_page.ph_ordem_compra_busca}
                    semResultadosLabel={m.gerente.recebimento_page.ordem_compra_sem_resultados}
                    minimoLabel={m.gerente.recebimento_page.produto_busca_minimo}
                    limparLabel={m.gerente.recebimento_page.produto_limpar}
                    statusLabels={{
                      CONFIRMADA: m.compras.status_CONFIRMADA,
                      EM_TRANSITO: m.compras.status_EM_TRANSITO,
                    }}
                    faltamLabel={(n) => fmtTemplate(m.gerente.recebimento_page.oc_faltam_opcao, { n })}
                    onChange={(oc) => {
                      if (oc) void vincularOcMut({ importacaoId: conferencia.importacao_id, ocId: oc.id })
                    }}
                  />
                </>
              )}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr className="text-left text-fg-muted">
                  <th className="py-1 pr-2">{mi.col_item}</th>
                  <th className="py-1 pr-2 text-right">{mi.col_qtd_nfe}</th>
                  <th className="py-1 pr-2 text-right">{mi.col_qtd_conferida}</th>
                  <th className="py-1 pr-2">{mi.col_divergencia_obs}</th>
                  <th className="py-1 pr-2">{mi.col_status}</th>
                </tr>
              </thead>
              <tbody>
                {conferencia.itens.map((item) => {
                  const diverge = divergeDaNota(item)
                  return (
                    <tr key={item.item_id} className="border-t border-[var(--color-border)]">
                      <td className="max-w-[14rem] break-words py-1.5 pr-2 font-medium">
                        {item.produto_nome}
                        {estoqueAtualizadoOk ? <p className="mt-1 text-caption font-normal text-fg-muted">
                          {idioma === 'pt' ? 'Custo do documento / custo atual do catálogo: ' : '单据成本 / 当前商品成本：'}
                          {formatBRL(item.custo_unitario, locale)} / {item.produto_custo_atual == null ? '—' : formatBRL(item.produto_custo_atual, locale)}
                        </p> : null}
                        {item.produto_codigo_barras ? (
                          <span className="ml-2 font-mono text-fg-muted">
                            {item.produto_codigo_barras}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{item.quantidade_nfe}</td>
                      <td className="py-1.5 pr-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.001}
                          controlSize="sm"
                          disabled={estoqueAtualizadoOk || registrarLoading || confirmarLoading}
                          value={qtdConferida[item.item_id] ?? ''}
                          onChange={(e) =>
                            setQtdConferida((prev) => ({ ...prev, [item.item_id]: e.target.value }))
                          }
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        {diverge ? (
                          <Input
                            type="text"
                            controlSize="sm"
                            disabled={estoqueAtualizadoOk || registrarLoading || confirmarLoading}
                            placeholder={mi.divergencia_obs_placeholder}
                            value={obsDivergencia[item.item_id] ?? ''}
                            onChange={(e) =>
                              setObsDivergencia((prev) => ({
                                ...prev,
                                [item.item_id]: e.target.value,
                              }))
                            }
                            className="w-full"
                          />
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <StatusChip
                          status={
                            item.status_conferencia === 'CONFERIDO'
                              ? 'ATIVO'
                              : item.status_conferencia === 'DIVERGENTE'
                                ? 'ALERTA'
                                : 'INATIVO'
                          }
                          label={
                            item.status_conferencia === 'CONFERIDO'
                              ? mi.status_conferido
                              : item.status_conferencia === 'DIVERGENTE'
                                ? mi.status_divergente
                                : mi.status_aguardando
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col items-end gap-2">
            {estoqueAtualizadoOk ? (
              <>
                <p className="text-body font-medium text-[var(--color-success-strong)]">
                  {conferencia.entrega_anterior_id ? (idioma === 'pt' ? 'Documento confirmado sem novo crédito de estoque.' : '单据已确认，未再次增加库存。') : mi.confirmar_estoque_ok}
                </p>
                {resultadoOc ? (
                  <p className="text-body" role="status" data-testid="nfe-oc-resultado">
                    {resultadoOc}
                  </p>
                ) : null}
                {resumoContasPagar ? (
                  <p className="text-body text-fg-muted" data-testid="nfe-contas-pagar-resumo">
                    {resumoContasPagar.quantidade > 0
                      ? mi.contas_pagar_geradas
                          .replace('{{n}}', String(resumoContasPagar.quantidade))
                          .replace('{{valor}}', formatBRL(resumoContasPagar.valor_total))
                          .replace(
                            '{{data}}',
                            resumoContasPagar.primeiro_vencimento
                              ? fmtVencimento(resumoContasPagar.primeiro_vencimento, locale)
                              : '—',
                          )
                      : mi.contas_pagar_nenhuma}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {resumoContasPagar && resumoContasPagar.quantidade > 0 && resumoContasPagar.fornecedor_id ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={adminFinanceiroContasPagarFornecedorQuery(resumoContasPagar.fornecedor_id)}>
                        {mi.btn_ver_contas_pagar}
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={ROUTES.admin.estoque}>{mi.btn_ver_estoque}</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                {!podeConfirmarEstoque ? (
                  <p className="text-caption font-medium text-[var(--color-warning-strong)]">
                    {mi.confirmar_estoque_pendente}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    loading={registrarLoading}
                    disabled={confirmarLoading}
                    onClick={() => void registrarMut(conferencia)}
                  >
                    {mi.btn_registrar_conferencia}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!podeConfirmarEstoque}
                    loading={confirmarLoading}
                    onClick={() => void confirmarMut(conferencia.importacao_id)}
                  >
                    {mi.btn_confirmar_estoque}
                  </Button>
                </div>
              </>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={limpar}>
              {mi.limpar}
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

type ResolverLabels = {
  buscar_placeholder: string
  buscar_vazio: string
  acao_cadastrar_novo: string
  acao_trocar: string
  novo_produto: string
  vinculado_a: string
}

function ResolverDesconhecido({
  linha,
  labels,
  onVincular,
  onCriar,
  onTrocar,
}: {
  linha: LinhaEditavel
  labels: ResolverLabels
  onVincular: (prod: ProdutoVinculoOpcao) => void
  onCriar: () => void
  onTrocar: () => void
}) {
  const [termo, setTermo] = useState('')
  const [opcoes, setOpcoes] = useState<ProdutoVinculoOpcao[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)

  if (linha.acao === 'CRIAR') {
    return (
      <div className="flex items-center justify-between gap-2">
        <StatusChip status="ATIVO" label={labels.novo_produto} />
        <Button type="button" variant="ghost" size="sm" className="h-auto px-1 text-caption" onClick={onTrocar}>
          {labels.acao_trocar}
        </Button>
      </div>
    )
  }
  if (linha.acao === 'VINCULAR' && linha.produto_id_destino) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-caption">
          <span className="text-fg-muted">{labels.vinculado_a}: </span>
          {linha.vinculo_nome ?? linha.produto_id_destino}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-auto px-1 text-caption" onClick={onTrocar}>
          {labels.acao_trocar}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          type="text"
          controlSize="sm"
          value={termo}
          placeholder={labels.buscar_placeholder}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
        />
        <BuscaResultados
          termo={termo}
          aberto={aberto}
          buscando={buscando}
          setBuscando={setBuscando}
          opcoes={opcoes}
          setOpcoes={setOpcoes}
          vazioLabel={labels.buscar_vazio}
          onSelecionar={(prod) => {
            setAberto(false)
            setTermo('')
            onVincular(prod)
          }}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed text-caption"
        onClick={onCriar}
      >
        + {labels.acao_cadastrar_novo}
      </Button>
    </div>
  )
}

function BuscaResultados({
  termo,
  aberto,
  buscando,
  setBuscando,
  opcoes,
  setOpcoes,
  vazioLabel,
  onSelecionar,
}: {
  termo: string
  aberto: boolean
  buscando: boolean
  setBuscando: (v: boolean) => void
  opcoes: ProdutoVinculoOpcao[]
  setOpcoes: (v: ProdutoVinculoOpcao[]) => void
  vazioLabel: string
  onSelecionar: (prod: ProdutoVinculoOpcao) => void
}) {
  useEffect(() => {
    const t = termo.trim()
    if (!aberto || t.length < 2) {
      setOpcoes([])
      return
    }
    let cancelado = false
    setBuscando(true)
    const timer = setTimeout(async () => {
      const r = await buscarProdutosParaVinculo(t)
      if (cancelado) return
      setOpcoes(r.success ? r.data : [])
      setBuscando(false)
    }, 250)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [termo, aberto, setBuscando, setOpcoes])

  if (!aberto || termo.trim().length < 2) return null

  return (
    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
      {buscando ? (
        <p className="px-2 py-2 text-caption text-fg-muted">…</p>
      ) : opcoes.length === 0 ? (
        <p className="px-2 py-2 text-caption text-fg-muted">{vazioLabel}</p>
      ) : (
        opcoes.map((p) => (
          <button
            key={p.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelecionar(p)
            }}
            className="block w-full px-2 py-1.5 text-left text-caption hover:bg-[var(--color-surface-soft)]"
          >
            <span className="font-medium">{p.nome}</span>
            {p.codigo_barras ? (
              <span className="ml-2 font-mono text-caption text-fg-muted">{p.codigo_barras}</span>
            ) : null}
          </button>
        ))
      )}
    </div>
  )
}
