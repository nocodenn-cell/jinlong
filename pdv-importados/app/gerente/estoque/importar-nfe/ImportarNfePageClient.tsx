'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { formatBRL } from '@/lib/format/money'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import type { NfeParsed } from '@/lib/nfe/nfeParser'
import type { LinhaPreviewNfe, ProdutoVinculoOpcao, StatusItemNfe } from './actions'
import {
  buscarProdutosParaVinculo,
  executarImportacaoNfe,
  previewImportacaoNfe,
} from './actions'

type Props = Readonly<{ idioma: Idioma }>

type LinhaEditavel = LinhaPreviewNfe & {
  fator: number
  atualizar_custo: boolean
  // Resolução decidida na conferência (null = desconhecido sem decisão).
  acao: 'VINCULAR' | 'CRIAR' | null
  produto_id_destino: string | null
  vinculo_nome: string | null
}

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

  const previewOpts = useMemo(() => ({}), [])
  const importOpts = useMemo(() => ({ successMessage: mi.import_ok }), [mi.import_ok])

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
    () => linhas.map((l, idx) => ({ l, idx })).filter(({ l }) => l.status_produto !== 'DESCONHECIDO'),
    [linhas],
  )
  const desconhecidos = useMemo(
    () => linhas.map((l, idx) => ({ l, idx })).filter(({ l }) => l.status_produto === 'DESCONHECIDO'),
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
    setXmlText('')
    setParsed(null)
    setLinhas([])
  }

  return (
    <div className={`mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6 ${fontClass}`}>
      <GerenteFilterBar title={mi.titulo} />
      <p className="gerente-fin-muted -mt-2 text-sm leading-relaxed">{mi.subtitulo}</p>

      <Link href="/gerente/estoque" className="gerente-nav-back text-sm font-medium hover:underline">
        ← {mi.voltar}
      </Link>

      <section
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`dragon-glass-card rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragOver ? 'border-amber-500/60 bg-amber-500/5' : 'app-border'
        }`}
      >
        <p className="mb-3 text-center text-sm gerente-fin-muted">{mi.drop_hint}</p>
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
          <label
            htmlFor="xml-upload"
            className="gerente-btn-cursor cursor-pointer rounded-md border px-4 py-2 text-sm font-medium app-border app-surface-soft hover:opacity-90"
          >
            XML
          </label>
          <button
            type="button"
            disabled={!xmlText.trim() || previewLoading}
            onClick={() => void previewMut(xmlText)}
            className="rounded-md px-4 py-2 text-sm font-semibold app-btn-accent disabled:opacity-50"
          >
            {previewLoading ? '…' : mi.btn_preview}
          </button>
          <button type="button" onClick={limpar} className="text-sm gerente-fin-muted hover:underline">
            {mi.limpar}
          </button>
        </div>
        <textarea
          value={xmlText}
          onChange={(e) => setXmlText(e.target.value)}
          placeholder="XML (opcional colar conteúdo)"
          className="mt-4 h-24 w-full rounded-md border p-2 font-mono text-[11px] app-border app-input"
          spellCheck={false}
        />
      </section>

      {parsed ? (
        <section className="dragon-glass-card space-y-3 rounded-xl p-4">
          <h2 className="gerente-section-accent text-sm font-semibold">{mi.emitente}</h2>
          <p className="text-sm">
            <span className="gerente-fin-muted">{parsed.emitente.nome}</span>
            <span className="mx-2 font-mono text-xs opacity-80">{onlyDigits(parsed.emitente.cnpj)}</span>
          </p>
          <p className="font-mono text-[11px] opacity-90">
            <span className="gerente-fin-muted">{mi.chave}: </span>
            {parsed.chave_acesso}
          </p>
          {parsed.numero_nf ? (
            <p className="text-sm">
              <span className="gerente-fin-muted">{mi.numero_nf}: </span>
              {parsed.numero_nf}
            </p>
          ) : null}

          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={atualizarGlobal}
              onChange={(e) => {
                const v = e.target.checked
                setAtualizarGlobal(v)
                setLinhas((rows) => rows.map((r) => ({ ...r, atualizar_custo: v })))
              }}
              className="h-4 w-4 rounded app-border"
            />
            {mi.atualizar_custo_global}
          </label>
        </section>
      ) : null}

      {reconhecidos.length > 0 ? (
        <section className="dragon-glass-card overflow-hidden rounded-xl">
          <div className="gerente-fin-divider border-b px-3 py-2.5">
            <h2 className="gerente-section-accent text-sm font-semibold">{mi.secao_reconhecidos}</h2>
            <p className="gerente-fin-muted mt-0.5 text-xs">{mi.secao_reconhecidos_hint}</p>
          </div>
          <div className="overflow-x-auto p-2">
            <GerenteTable
              tone="dragon"
              columns={[
                { key: 'nome', header: mi.col_item },
                { key: 'ref', header: mi.col_ref },
                { key: 'gtin', header: mi.col_gtin },
                { key: 'st', header: mi.col_status },
                { key: 'q', header: mi.col_q_xml },
                { key: 'un', header: mi.col_un_nf },
                { key: 'fat', header: mi.col_fator, width: '5rem' },
                { key: 'custo', header: mi.col_custo_unit },
                { key: 'ac', header: mi.atualizar_custo_linha, width: '6rem' },
              ]}
            >
              {reconhecidos.map(({ l, idx }) => (
                <tr key={`rec-${l.ref_fornecedor}-${idx}`} className="gerente-fin-row-hover">
                  <td className="gerente-fin-cell max-w-[12rem] px-2 py-2 text-xs font-medium leading-snug">
                    {l.nome_produto}
                    {l.vinculo_nome ? (
                      <span className="mt-0.5 block text-[10px] gerente-fin-muted">
                        {mi.vinculado_a}: {l.vinculo_nome}
                      </span>
                    ) : null}
                  </td>
                  <td className="gerente-fin-cell px-2 py-2 font-mono text-[11px]">{l.ref_fornecedor}</td>
                  <td className="gerente-fin-cell px-2 py-2 font-mono text-[11px]">{l.gtin ?? '—'}</td>
                  <td className="px-2 py-2">
                    <GerenteStatusBadge
                      status={statusBadgeKey(l.status_produto)}
                      label={
                        l.status_produto === 'RECONHECIDO_DEPARA'
                          ? mi.status_reconhecido_depara
                          : mi.status_reconhecido_ean
                      }
                    />
                  </td>
                  <td className="gerente-fin-cell px-2 py-2 text-right tabular-nums text-xs">{l.q_com}</td>
                  <td className="gerente-fin-cell px-2 py-2 text-xs">{l.u_com ?? '—'}</td>
                  <td className="gerente-fin-cell px-1 py-1">
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={l.fator}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setLinha(idx, { fator: v > 0 ? v : 1 })
                      }}
                      className="w-full rounded-md border px-1 py-1 text-right text-xs app-input"
                    />
                  </td>
                  <td className="gerente-fin-cell px-2 py-2 text-right text-xs font-semibold tabular-nums">
                    {formatBRL(custoUnit(l), locale)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={l.atualizar_custo}
                      onChange={(e) => setLinha(idx, { atualizar_custo: e.target.checked })}
                      className="h-4 w-4 rounded app-border"
                      title={mi.atualizar_custo_linha}
                    />
                  </td>
                </tr>
              ))}
            </GerenteTable>
          </div>
        </section>
      ) : null}

      {desconhecidos.length > 0 ? (
        <section className="dragon-glass-card overflow-hidden rounded-xl">
          <div className="gerente-fin-divider border-b px-3 py-2.5">
            <h2 className="gerente-section-accent text-sm font-semibold">{mi.secao_desconhecidos}</h2>
            <p className="gerente-fin-muted mt-0.5 text-xs">{mi.secao_desconhecidos_hint}</p>
          </div>
          <div className="overflow-x-auto p-2">
            <GerenteTable
              tone="dragon"
              columns={[
                { key: 'nome', header: mi.col_item },
                { key: 'ref', header: mi.col_ref },
                { key: 'gtin', header: mi.col_gtin },
                { key: 'q', header: mi.col_q_xml },
                { key: 'fat', header: mi.col_fator, width: '5rem' },
                { key: 'custo', header: mi.col_custo_unit },
                { key: 'res', header: mi.col_resolucao, width: '18rem' },
              ]}
            >
              {desconhecidos.map(({ l, idx }) => (
                <tr key={`desc-${l.ref_fornecedor}-${idx}`} className="gerente-fin-row-hover">
                  <td className="gerente-fin-cell max-w-[12rem] px-2 py-2 text-xs font-medium leading-snug">
                    {l.nome_produto}
                  </td>
                  <td className="gerente-fin-cell px-2 py-2 font-mono text-[11px]">{l.ref_fornecedor}</td>
                  <td className="gerente-fin-cell px-2 py-2 font-mono text-[11px]">{l.gtin ?? '—'}</td>
                  <td className="gerente-fin-cell px-2 py-2 text-right tabular-nums text-xs">{l.q_com}</td>
                  <td className="gerente-fin-cell px-1 py-1">
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={l.fator}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setLinha(idx, { fator: v > 0 ? v : 1 })
                      }}
                      className="w-full rounded-md border px-1 py-1 text-right text-xs app-input"
                    />
                  </td>
                  <td className="gerente-fin-cell px-2 py-2 text-right text-xs font-semibold tabular-nums">
                    {formatBRL(custoUnit(l), locale)}
                  </td>
                  <td className="px-2 py-2">
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
                  </td>
                </tr>
              ))}
            </GerenteTable>
          </div>
        </section>
      ) : null}

      {linhas.length > 0 ? (
        <div className="flex flex-col items-end gap-2">
          {!tudoResolvido ? (
            <p className="text-xs font-medium text-amber-600">{mi.resolver_pendentes}</p>
          ) : null}
          <button
            type="button"
            disabled={!podeImportar || importLoading}
            onClick={() => handleImportar()}
            className="rounded-md px-4 py-2 text-sm font-semibold app-btn-accent disabled:opacity-50"
          >
            {importLoading ? '…' : mi.btn_importar}
          </button>
        </div>
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

  // Resolução já decidida → mostra chip + "Trocar".
  if (linha.acao === 'CRIAR') {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
          {labels.novo_produto}
        </span>
        <button type="button" onClick={onTrocar} className="text-[11px] gerente-fin-muted hover:underline">
          {labels.acao_trocar}
        </button>
      </div>
    )
  }
  if (linha.acao === 'VINCULAR' && linha.produto_id_destino) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs">
          <span className="gerente-fin-muted">{labels.vinculado_a}: </span>
          {linha.vinculo_nome ?? linha.produto_id_destino}
        </span>
        <button type="button" onClick={onTrocar} className="text-[11px] gerente-fin-muted hover:underline">
          {labels.acao_trocar}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type="text"
          value={termo}
          placeholder={labels.buscar_placeholder}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          className="w-full rounded-md border px-2 py-1 text-xs app-input"
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
      <button
        type="button"
        onClick={onCriar}
        className="w-full rounded-md border border-dashed px-2 py-1 text-[11px] font-medium app-border hover:opacity-80"
      >
        + {labels.acao_cadastrar_novo}
      </button>
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
    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border app-border app-surface shadow-lg">
      {buscando ? (
        <p className="px-2 py-2 text-[11px] gerente-fin-muted">…</p>
      ) : opcoes.length === 0 ? (
        <p className="px-2 py-2 text-[11px] gerente-fin-muted">{vazioLabel}</p>
      ) : (
        opcoes.map((p) => (
          <button
            key={p.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelecionar(p)
            }}
            className="block w-full px-2 py-1.5 text-left text-xs gerente-fin-row-hover"
          >
            <span className="font-medium">{p.nome}</span>
            {p.codigo_barras ? (
              <span className="ml-2 font-mono text-[10px] gerente-fin-muted">{p.codigo_barras}</span>
            ) : null}
          </button>
        ))
      )}
    </div>
  )
}
