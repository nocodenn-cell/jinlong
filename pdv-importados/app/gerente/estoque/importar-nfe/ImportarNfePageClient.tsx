'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ConsequenciaOperacao,
  PageHeader,
  SectionCard,
  type EfeitoOperacao,
} from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusChip } from '@/components/ui/StatusChip'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/lib/format/money'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { Checkbox, Input, Textarea } from '@/components/ui/forms'
import { ROUTES, hrefFinanceiroPagar } from '@shared-core/navigation/routes'
import type { NfeParsed } from '@/lib/nfe/nfeParser'
import type {
  ConferenciaImportacaoNfe,
  ImportacaoNfePendente,
  ItemConferenciaNfe,
  LinhaPreviewNfe,
  ProdutoVinculoOpcao,
  StatusItemNfe,
} from './actions'
import {
  buscarProdutosParaVinculo,
  confirmarImportacaoNfe,
  executarImportacaoNfe,
  listarImportacoesNfePendentes,
  obterConferenciaImportacaoNfe,
  previewImportacaoNfe,
  registrarConferenciaNfe,
} from './actions'
import { ParcelasNfeSection, somaParcelas } from './ParcelasNfeSection'
import { VinculoOrdemCompra } from './VinculoOrdemCompra'

type Props = Readonly<{
  idioma: Idioma
  embeddedInAdminHub?: boolean
  /**
   * Importação a abrir já na conferência. Vem de `?id=` — é o que faz o link
   * "NF-e #123" de Contas a pagar voltar para a nota que originou o título.
   */
  importacaoIdInicial?: string | null
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

function statusBadgeKey(status: StatusItemNfe): string {
  if (status === 'RECONHECIDO_DEPARA') return 'ATIVO'
  if (status === 'RECONHECIDO_EAN') return 'TEM_NF'
  return 'ALERTA'
}

type EfeitosNfeLabels = Readonly<{
  estoque: string
  custo: string
  financeiro: string
  financeiroZero: string
  irreversivel: string
}>

type EfeitosNfeArgs = Readonly<{
  itens: number
  parcelas: number
  totalParcelas: string
  atualizaCusto: boolean
  labels: EfeitosNfeLabels
}>

/** Efeitos declarados ao operador antes de confirmar a entrada da NF-e. */
export function efeitosConfirmacaoNfe(args: EfeitosNfeArgs): EfeitoOperacao[] {
  const { itens, parcelas, totalParcelas, atualizaCusto, labels } = args
  const financeiro =
    parcelas > 0
      ? labels.financeiro.replace('{{n}}', String(parcelas)).replace('{{total}}', totalParcelas)
      : labels.financeiroZero

  const efeitos: EfeitoOperacao[] = [
    { tom: 'estoque', texto: labels.estoque.replace('{{n}}', String(itens)) },
  ]
  if (atualizaCusto) efeitos.push({ tom: 'estoque', texto: labels.custo })
  efeitos.push({ tom: 'financeiro', texto: financeiro })
  efeitos.push({ tom: 'alerta', texto: labels.irreversivel })
  return efeitos
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
  importacaoIdInicial = null,
}: Props) {
  const m = getMessages(idioma)
  const mi = m.estoque.import_nfe
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
  const [pendentes, setPendentes] = useState<ImportacaoNfePendente[]>([])
  const [estoqueAtualizadoOk, setEstoqueAtualizadoOk] = useState(false)

  const carregarPendentes = useCallback(async () => {
    const r = await listarImportacoesNfePendentes()
    if (r.success) setPendentes(r.data)
  }, [])

  useEffect(() => {
    void carregarPendentes()
  }, [carregarPendentes])

  const aplicarConferencia = useCallback((c: ConferenciaImportacaoNfe) => {
    setConferencia(c)
    setEstoqueAtualizadoOk(c.status === 'CONCLUIDA')
    setQtdConferida((prev) => {
      const next = { ...prev }
      for (const item of c.itens) {
        if (next[item.item_id] === undefined) {
          next[item.item_id] = String(item.quantidade_conferida ?? item.quantidade_nfe)
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

  // Abre direto a importação pedida na URL (link "NF-e #123" de Contas a
  // pagar). Roda uma vez: depois disso quem manda é a navegação do operador.
  const importacaoAbertaRef = useRef(false)
  useEffect(() => {
    if (!importacaoIdInicial || importacaoAbertaRef.current) return
    importacaoAbertaRef.current = true
    void obterConferenciaImportacaoNfe(importacaoIdInicial).then((r) => {
      if (r.success) aplicarConferencia(r.data)
    })
  }, [importacaoIdInicial, aplicarConferencia])

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

  const { mutate: previewMut, loading: previewLoading } = useGerenteMutation(
    async (xml: string) => {
      const r = await previewImportacaoNfe(xml)
      if (!r.success) throw new Error(r.error)
      setParsed(r.data.parsed)
      setLinhas(
        r.data.linhas.map((l) => ({
          ...l,
          fator: 1,
          atualizar_custo: atualizarGlobalRef.current,
          acao: l.status_produto === 'DESCONHECIDO' ? null : 'VINCULAR',
          produto_id_destino: l.produto_id,
          vinculo_nome: l.produto_nome,
        })),
      )
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
      onSuccess: () => {
        setEstoqueAtualizadoOk(true)
        void carregarPendentes()
      },
    }),
    [mi.confirmar_estoque_ok, carregarPendentes],
  )

  const { mutate: confirmarMut, loading: confirmarLoading } = useGerenteMutation(
    async (importacaoId: string) => {
      const r = await confirmarImportacaoNfe({ importacao_id: importacaoId })
      if (!r.success) throw new Error(r.error)
      return null
    },
    confirmarOpts,
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
    setQtdConferida({})
    setObsDivergencia({})
    setEstoqueAtualizadoOk(false)
    // A lista de pendentes foi carregada antes desta importação existir —
    // sem recarregar, "Limpar" para adiar a conferência esconde a NF-e que
    // acabou de ser processada até a próxima navegação para a página.
    if (tinhaConferenciaEmAberto) void carregarPendentes()
  }

  const itensPendentesConferencia = useMemo(
    () => (conferencia?.itens ?? []).filter((i) => i.status_conferencia === 'EM_CONFERENCIA'),
    [conferencia],
  )
  const podeConfirmarEstoque =
    !!conferencia &&
    conferencia.status === 'EM_CONFERENCIA' &&
    conferencia.itens.length > 0 &&
    itensPendentesConferencia.length === 0

  const parcelasLabels = useMemo(
    () => ({
      titulo: mi.parcelas_titulo,
      hint: mi.parcelas_hint,
      colNumero: mi.parcelas_col_numero,
      colVencimento: mi.parcelas_col_vencimento,
      colValor: mi.parcelas_col_valor,
      total: mi.parcelas_total,
      vazio: mi.parcelas_vazio,
    }),
    [mi],
  )

  const efeitosConfirmacao = useMemo<readonly EfeitoOperacao[]>(() => {
    if (!conferencia) return []
    return efeitosConfirmacaoNfe({
      itens: conferencia.itens.length,
      parcelas: conferencia.parcelas.length,
      totalParcelas: formatBRL(somaParcelas(conferencia.parcelas)),
      atualizaCusto: conferencia.itens.some((i) => i.atualizar_custo),
      labels: {
        estoque: mi.consequencia_estoque,
        custo: mi.consequencia_custo,
        financeiro: mi.consequencia_financeiro,
        financeiroZero: mi.consequencia_financeiro_zero,
        irreversivel: mi.consequencia_irreversivel,
      },
    })
  }, [conferencia, mi])

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
              l.status_produto === 'RECONHECIDO_DEPARA'
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
      <PageHeader title={mi.titulo} subtitle={mi.subtitulo} />

      {!embeddedInAdminHub ? (
        <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
          ← {mi.voltar}
        </Link>
      ) : null}

      {pendentes.length > 0 && !conferencia ? (
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

      {/* Entrada concluída: a área de upload sai de cena. Deixá-la no topo,
          ainda com o XML colado e o botão de pré-visualização ativo, sugeria
          que a mesma nota podia ser importada de novo. */}
      {estoqueAtualizadoOk ? null : (
      <section
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
          placeholder="XML (opcional colar conteúdo)"
          className="mt-4 h-24 font-mono text-caption"
          spellCheck={false}
        />
      </section>
      )}

      {/* Em repouso a tela não dizia nada sobre o que vem depois do XML. O
          operador só descobria a etapa de conferência depois de importar. */}
      {!parsed && !conferencia ? (
        <ConsequenciaOperacao
          titulo={mi.passos_titulo}
          efeitos={[
            { tom: 'documento', texto: mi.passo_1 },
            { tom: 'estoque', texto: mi.passo_2 },
            { tom: 'financeiro', texto: mi.passo_3 },
          ]}
        />
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

          {/* As parcelas são conhecidas desde a leitura do XML — mostrar já aqui
              evita que o operador descubra o compromisso financeiro só no fim. */}
          <ParcelasNfeSection
            parcelas={parsed.duplicatas}
            locale={locale}
            labels={parcelasLabels}
          />
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
                      <td className="max-w-[14rem] truncate py-1.5 pr-2 font-medium">
                        {item.produto_nome}
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
                          disabled={estoqueAtualizadoOk}
                          value={qtdConferida[item.item_id] ?? String(item.quantidade_nfe)}
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
                            disabled={estoqueAtualizadoOk}
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

          <VinculoOrdemCompra
            importacaoId={conferencia.importacao_id}
            ordemCompraId={conferencia.ordem_compra_id}
            disabled={estoqueAtualizadoOk}
            onVinculado={() => {
              void obterConferenciaImportacaoNfe(conferencia.importacao_id).then((r) => {
                if (r.success) aplicarConferencia(r.data)
              })
            }}
            labels={{
              titulo: mi.vinculo_oc_titulo,
              hint: mi.vinculo_oc_hint,
              placeholder: mi.vinculo_oc_placeholder,
              vincular: mi.vinculo_oc_btn,
              vinculado: mi.vinculo_oc_vinculado,
              semOrdens: mi.vinculo_oc_sem_ordens,
              sucesso: mi.vinculo_oc_sucesso,
            }}
          />

          <ParcelasNfeSection
            parcelas={conferencia.parcelas}
            locale={locale}
            labels={parcelasLabels}
          />

          {estoqueAtualizadoOk ? (
            <ConsequenciaOperacao
              className="mt-4"
              titulo={mi.concluido_titulo}
              efeitos={[{ tom: 'documento', texto: mi.concluido_sub }]}
              acoes={
                <>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={hrefFinanceiroPagar()}>{mi.ir_contas_pagar}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={ROUTES.admin.estoque}>{mi.ir_estoque}</Link>
                  </Button>
                </>
              }
            />
          ) : (
            <ConsequenciaOperacao
              className="mt-4"
              titulo={mi.consequencia_titulo}
              efeitos={efeitosConfirmacao}
            />
          )}

          <div className="mt-4 flex flex-col items-end gap-2">
            {estoqueAtualizadoOk ? (
              <p className="text-body font-medium text-[var(--color-success-strong)]">
                {mi.confirmar_estoque_ok}
              </p>
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
