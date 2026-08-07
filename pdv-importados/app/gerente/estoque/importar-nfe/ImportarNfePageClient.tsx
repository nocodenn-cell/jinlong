'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusChip } from '@/components/ui/StatusChip'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/lib/format/money'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitToast } from '@/lib/gerente/toast'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { Checkbox, Input, Textarea } from '@/components/ui/forms'
import { ROUTES } from '@shared-core/navigation/routes'
import type { NfeParsed } from '@/lib/nfe/nfeParser'
import type {
  ConferenciaNfeItemInput,
  LinhaConferenciaNfe,
  LinhaPreviewNfe,
  ProdutoVinculoOpcao,
  StatusItemNfe,
} from './actions'
import {
  buscarProdutosParaVinculo,
  confirmarConferenciaImportacaoNfe,
  executarImportacaoNfe,
  obterItensConferenciaNfe,
  previewImportacaoNfe,
} from './actions'

type Props = Readonly<{ idioma: Idioma }>

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

function linhaResolvida(l: LinhaEditavel): boolean {
  if (l.acao === 'CRIAR') return true
  return l.acao === 'VINCULAR' && !!l.produto_id_destino
}

export function ImportarNfePageClient({ idioma }: Props) {
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

  // FLX-05: importar só registra para conferência — nada foi creditado ainda.
  // A conferência (quantidade fisicamente contada) é uma etapa separada,
  // pré-preenchida com o valor da nota mas editável pelo operador.
  const [importacaoId, setImportacaoId] = useState<string | null>(null)
  const [linhasConferencia, setLinhasConferencia] = useState<
    Array<LinhaConferenciaNfe & { quantidadeConferida: number; divergenciaObs: string }>
  >([])
  const [conferenciaConcluida, setConferenciaConcluida] = useState(false)

  const previewOpts = useMemo(() => ({}), [])
  const importOpts = useMemo(
    () => ({
      successMessage: mi.import_registrado,
      onSuccess: (data: { produtos_novos: number }) => {
        setDraftNovos(data.produtos_novos > 0 ? data.produtos_novos : null)
        if (data.produtos_novos > 0) {
          emitToast({
            kind: 'info',
            message: mi.import_draft_aviso.replace('{{n}}', String(data.produtos_novos)),
          })
        }
      },
    }),
    [mi.import_registrado, mi.import_draft_aviso],
  )

  const confirmOpts = useMemo(
    () => ({ successMessage: mi.conferencia_ok }),
    [mi.conferencia_ok],
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
      setImportacaoId(null)
      setLinhasConferencia([])
      setConferenciaConcluida(false)
      return null
    },
    previewOpts,
  )

  const { mutate: importMut, loading: importLoading } = useGerenteMutation(
    async (payload: Parameters<typeof executarImportacaoNfe>[0]) => {
      const r = await executarImportacaoNfe(payload)
      if (!r.success) throw new Error(r.error)

      const conf = await obterItensConferenciaNfe(r.data.importacao_id)
      if (!conf.success) throw new Error(conf.error)

      setImportacaoId(r.data.importacao_id)
      setLinhasConferencia(
        conf.data.map((l) => ({ ...l, quantidadeConferida: l.quantidadeNfe, divergenciaObs: '' })),
      )
      return r.data
    },
    importOpts,
  )

  const { mutate: confirmMut, loading: confirmLoading } = useGerenteMutation(
    async (_input: null) => {
      if (!importacaoId) return null
      const itens: ConferenciaNfeItemInput[] = linhasConferencia.map((l) => ({
        itemId: l.itemId,
        quantidadeConferida: l.quantidadeConferida,
        divergenciaObs: l.divergenciaObs.trim() || null,
      }))
      const r = await confirmarConferenciaImportacaoNfe({ importacaoId, itens })
      if (!r.success) throw new Error(r.error)
      setConferenciaConcluida(true)
      return null
    },
    confirmOpts,
  )

  const setLinhaConferencia = useCallback(
    (itemId: string, patch: Partial<{ quantidadeConferida: number; divergenciaObs: string }>) => {
      setLinhasConferencia((rows) =>
        rows.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)),
      )
    },
    [],
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
  const podeImportar =
    !!parsed && linhas.length > 0 && !previewLoading && tudoResolvido && !importacaoId
  const podeConfirmarConferencia =
    !!importacaoId && linhasConferencia.length > 0 && !conferenciaConcluida

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
    setXmlText('')
    setParsed(null)
    setLinhas([])
    setDraftNovos(null)
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
    <div className={`admin-v2-page space-y-4 ${fontClass}`}>
      <PageHeader title={mi.titulo} subtitle={mi.subtitulo} />

      <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
        ← {mi.voltar}
      </Link>

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

      {parsed ? (
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
        </SectionCard>
      ) : null}

      {reconhecidos.length > 0 ? (
        <SectionCard title={mi.secao_reconhecidos} subtitle={mi.secao_reconhecidos_hint}>
          <DataTable
            columns={reconhecidosColumns}
            data={reconhecidos}
            rowKey={({ linha: l, idx }) => `rec-${l.ref_fornecedor}-${idx}`}
            compact
          />
        </SectionCard>
      ) : null}

      {desconhecidos.length > 0 ? (
        <SectionCard title={mi.secao_desconhecidos} subtitle={mi.secao_desconhecidos_hint}>
          <DataTable
            columns={desconhecidosColumns}
            data={desconhecidos}
            rowKey={({ linha: l, idx }) => `desc-${l.ref_fornecedor}-${idx}`}
            compact
          />
        </SectionCard>
      ) : null}

      {linhas.length > 0 ? (
        <div className="flex flex-col items-end gap-2">
          {!tudoResolvido ? (
            <p className="text-caption font-medium text-[var(--color-warning-strong)]">
              {mi.resolver_pendentes}
            </p>
          ) : null}
          {draftNovos != null && draftNovos > 0 ? (
            <div className="w-full rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-body text-[var(--color-warning-strong)]">
              <p>{mi.import_draft_aviso.replace('{{n}}', String(draftNovos))}</p>
              <Link
                href={`${ROUTES.admin.catalogo}?status=inativos`}
                className="mt-1 inline-block font-medium underline hover:no-underline"
              >
                Ir ao catálogo →
              </Link>
            </div>
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

      {linhasConferencia.length > 0 ? (
        <SectionCard title={mi.conferencia_titulo} subtitle={mi.conferencia_hint}>
          {conferenciaConcluida ? (
            <p className="text-body font-medium text-[var(--color-success-strong)]">
              {mi.conferencia_concluida}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="text-left text-fg-muted">
                      <th className="py-1 pr-2">{mi.col_item}</th>
                      <th className="py-1 pr-2 text-right">{mi.col_q_xml}</th>
                      <th className="py-1 pr-2 text-right">{mi.col_qtd_conferida}</th>
                      <th className="py-1">{mi.col_divergencia_obs}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasConferencia.map((l) => {
                      const divergente = l.quantidadeConferida !== l.quantidadeNfe
                      return (
                        <tr key={l.itemId} className="border-t border-[var(--color-border)]">
                          <td className="py-1.5 pr-2 font-medium">{l.produtoNome}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{l.quantidadeNfe}</td>
                          <td className="py-1.5 pr-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.001}
                              controlSize="sm"
                              value={l.quantidadeConferida}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setLinhaConferencia(l.itemId, {
                                  quantidadeConferida: Number.isFinite(v) && v >= 0 ? v : 0,
                                })
                              }}
                              className={`text-right ${divergente ? 'border-[var(--color-warning-border)]' : ''}`}
                            />
                          </td>
                          <td className="py-1.5">
                            {divergente ? (
                              <Input
                                type="text"
                                controlSize="sm"
                                placeholder={mi.divergencia_obs_placeholder}
                                value={l.divergenciaObs}
                                onChange={(e) =>
                                  setLinhaConferencia(l.itemId, { divergenciaObs: e.target.value })
                                }
                              />
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  disabled={!podeConfirmarConferencia}
                  loading={confirmLoading}
                  onClick={() => void confirmMut(null)}
                >
                  {mi.btn_confirmar_conferencia}
                </Button>
              </div>
            </>
          )}
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
