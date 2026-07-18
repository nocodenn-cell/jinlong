'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Package, Sparkles } from 'lucide-react'
import { criarProdutoRelampagoPdv } from '@/app/caixa/actions'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { useMoneyInput } from '@/hooks/useMoneyInput'
import type { Mensagens } from '@/i18n/getMessages'
import type { SugestaoCadastroProduto } from '@/core/ports/gtinLookup'
import {
  emitCadastroDuration,
  fetchSugestaoCadastro,
  fontesLabel,
} from '@/lib/gerente/cadastroSugestaoClient'
import { cn } from '@/lib/utils'
import { focusOnEnter } from './form/focusOnEnter'

export type CadastroProdutoRelampagoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  codigoBarras: string
  m: Mensagens
  /** Após criar PUBLICADO — pai reprocessa o scan / adiciona ao cupom. */
  onSalvoEVender: (codigoBarras: string) => void
}>

/**
 * Cadastro mínimo no momento operacional (PDV) + sugestão GTIN (Fase 3).
 * SSoT: mutação via `criarProduto`; UI em components/gerente/produtos.
 */
export function CadastroProdutoRelampagoModal({
  open,
  onOpenChange,
  codigoBarras,
  m,
  onSalvoEVender,
}: CadastroProdutoRelampagoModalProps) {
  const c = m.caixa
  const p = m.produtos
  const [nome, setNome] = useState('')
  const [estoqueQty, setEstoqueQty] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingSugestao, setLoadingSugestao] = useState(false)
  const [sugestao, setSugestao] = useState<SugestaoCadastroProduto | null>(null)
  const precoInput = useMoneyInput()
  const nomeRef = useRef<HTMLInputElement>(null)
  const precoRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const openedAtRef = useRef(0)
  const tituloId = useId()

  useEffect(() => {
    if (!open) return
    setNome('')
    setEstoqueQty('')
    setErro(null)
    setSugestao(null)
    precoInput.reset()
    openedAtRef.current = Date.now()

    let cancelled = false
    setLoadingSugestao(true)
    void fetchSugestaoCadastro(codigoBarras).then((s) => {
      if (cancelled) return
      setLoadingSugestao(false)
      if (!s) {
        queueMicrotask(() => nomeRef.current?.focus())
        return
      }
      setSugestao(s)
      if (s.jaCadastrado) {
        setErro(c.cadastro_rapido_ja_cadastrado)
        queueMicrotask(() => confirmRef.current?.focus())
        return
      }
      if (s.nome) setNome(s.nome)
      if (s.precoVarejo != null && s.precoVarejo > 0) {
        precoInput.reset(s.precoVarejo)
      }
      queueMicrotask(() => {
        if (s.knownSuggestion) confirmRef.current?.focus()
        else if (s.nome) precoRef.current?.focus()
        else nomeRef.current?.focus()
      })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset + lookup só ao abrir
  }, [open, codigoBarras])

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  const salvarEVender = useCallback(async () => {
    if (sugestao?.jaCadastrado && sugestao.produtoIdExistente) {
      const codigo = codigoBarras.trim()
      emitCadastroDuration({
        surface: 'pdv_relampago',
        openedAt: openedAtRef.current,
        knownSuggestion: true,
        fonteSugestao: fontesLabel(sugestao.fontes),
        gtin: sugestao.gtin,
        sucesso: true,
      })
      onOpenChange(false)
      onSalvoEVender(codigo)
      return
    }

    const nomeTrim = nome.trim()
    if (nomeTrim.length < 2) {
      setErro(c.cadastro_rapido_erro_nome)
      return
    }
    const preco = precoInput.parse()
    if (preco == null || preco <= 0) {
      setErro(c.cadastro_rapido_erro_preco)
      return
    }
    const qty = Number.parseInt(estoqueQty.replace(/\D/g, '') || '0', 10)
    const estoque = Number.isFinite(qty) && qty > 0 ? qty : 0

    setSaving(true)
    setErro(null)
    try {
      const clientRequestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : null
      const r = await criarProdutoRelampagoPdv({
        nome: nomeTrim,
        codigo_barras: codigoBarras.trim() || null,
        codigo_interno: null,
        referencia_fornecedor: null,
        nome_reduzido_pdv: null,
        localizacao_prateleira: null,
        preco_varejo: preco,
        preco_atacado: null,
        preco_custo: sugestao?.precoCusto ?? null,
        permitir_abaixo_custo: false,
        quantidade_gatilho_atacado: null,
        origem: 'china_manual',
        tem_nf: false,
        unidade_medida: 'UN',
        observacao: null,
        categoria_id: sugestao?.categoriaId ?? null,
        marca_id: null,
        fornecedor_id: null,
        ncm: sugestao?.ncm ?? null,
        cfop_produto: null,
        csosn: '400',
        cest: null,
        cst_pis: '07',
        cst_cofins: '07',
        estoque_inicial_quantidade: estoque,
        estoque_inicial_minimo: 0,
        client_request_id: clientRequestId,
      })
      if (!r.success) {
        const msg = r.error || c.cadastro_rapido_erro_permissao
        const permissao =
          /gerente|dono|administrador|permissão|permission|login/i.test(msg)
        setErro(permissao ? c.cadastro_rapido_erro_permissao : msg)
        emitCadastroDuration({
          surface: 'pdv_relampago',
          openedAt: openedAtRef.current,
          knownSuggestion: sugestao?.knownSuggestion ?? false,
          fonteSugestao: sugestao ? fontesLabel(sugestao.fontes) : null,
          gtin: sugestao?.gtin ?? codigoBarras,
          sucesso: false,
        })
        return
      }
      emitCadastroDuration({
        surface: 'pdv_relampago',
        openedAt: openedAtRef.current,
        knownSuggestion: sugestao?.knownSuggestion ?? false,
        fonteSugestao: sugestao ? fontesLabel(sugestao.fontes) : null,
        gtin: sugestao?.gtin ?? codigoBarras,
        sucesso: true,
      })
      const codigo = codigoBarras.trim() || nomeTrim
      onOpenChange(false)
      onSalvoEVender(codigo)
    } finally {
      setSaving(false)
    }
  }, [
    sugestao,
    nome,
    precoInput,
    estoqueQty,
    codigoBarras,
    c,
    onOpenChange,
    onSalvoEVender,
  ])

  if (!open) return null

  const inputClass = cn(
    'mt-1 w-full rounded-md border border-jl-border-1 bg-jl-surface px-3 py-2 text-sm text-jl-fg-1',
    'outline-none focus:border-jl-accent',
  )

  const ctaLabel = sugestao?.jaCadastrado
    ? c.cadastro_rapido_usar_existente
    : c.cadastro_rapido_salvar_vender

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="sm"
      icon={Package}
      title={<span id={tituloId}>{c.cadastro_rapido_titulo}</span>}
      subtitle={c.cadastro_rapido_subtitulo}
      dismissable={!saving}
      closeLabel={c.cadastro_rapido_cancelar}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            className="app-btn-neutral"
            disabled={saving}
            onClick={fechar}
          >
            {c.cadastro_rapido_cancelar}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            className="app-btn-accent"
            disabled={saving || loadingSugestao}
            onClick={() => void salvarEVender()}
          >
            {saving ? '…' : ctaLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-jl-fg-3">{p.codigo_barras}</p>
          <p className="mt-1 font-mono text-sm font-semibold text-jl-fg-1">
            {codigoBarras || '—'}
          </p>
        </div>

        {loadingSugestao ? (
          <p className="flex items-center gap-1.5 text-[11px] text-jl-fg-3">
            <Sparkles size={12} aria-hidden />
            {c.cadastro_rapido_buscando_sugestao}
          </p>
        ) : null}

        {sugestao && !loadingSugestao && sugestao.fontes[0] !== 'nenhuma' ? (
          <p className="rounded-md border border-jl-accent/30 bg-jl-accent/10 px-3 py-2 text-[11px] text-jl-fg-2">
            <span className="font-semibold">{c.cadastro_rapido_sugestao_titulo}</span>
            {' · '}
            {fontesLabel(sugestao.fontes)}
            {sugestao.categoriaNome
              ? ` · ${p.categoria_label}: ${sugestao.categoriaNome}`
              : null}
            {sugestao.knownSuggestion ? ` · ${c.cadastro_rapido_confirmar_hint}` : null}
          </p>
        ) : null}

        <label className="block text-xs font-medium text-jl-fg-3">
          {c.cadastro_rapido_nome} *
          <input
            ref={nomeRef}
            className={inputClass}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={saving || Boolean(sugestao?.jaCadastrado)}
            autoComplete="off"
            onKeyDown={(e) => focusOnEnter(e, precoRef.current)}
          />
        </label>
        <label className="block text-xs font-medium text-jl-fg-3">
          {c.cadastro_rapido_preco} *
          <input
            ref={precoRef}
            type="text"
            inputMode="decimal"
            className={cn(inputClass, 'font-mono')}
            value={precoInput.display}
            onChange={precoInput.onChange}
            disabled={saving || Boolean(sugestao?.jaCadastrado)}
            placeholder="0,00"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void salvarEVender()
              }
            }}
          />
        </label>
        {!sugestao?.jaCadastrado ? (
          <label className="block text-xs font-medium text-jl-fg-3">
            {c.cadastro_rapido_estoque}
            <input
              type="text"
              inputMode="numeric"
              className={cn(inputClass, 'font-mono')}
              value={estoqueQty}
              onChange={(e) => setEstoqueQty(e.target.value.replace(/\D/g, ''))}
              disabled={saving}
              placeholder="0"
            />
          </label>
        ) : null}
        {erro ? (
          <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        ) : null}
      </div>
    </DragonModal>
  )
}
