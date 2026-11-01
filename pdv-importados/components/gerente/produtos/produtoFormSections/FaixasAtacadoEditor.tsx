'use client'

import { parseQuantidadeInteiraEntrada } from '@shared-core/src/formatting'
import { mensagemErroEntrada } from '../form/produtoForm.entrada'
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import {
  listarFaixasAtacado,
  criarFaixaAtacado,
  atualizarFaixaAtacado,
  inativarFaixaAtacado,
  faixasPermitidasNoPlano,
  type FaixaAtacado,
} from '@/app/gerente/produtos/precosAtacadoActions'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { formatBRL } from '@/lib/format/money'
import { useMoneyInput } from '@/hooks/useMoneyInput'

type Props = Readonly<{
  produtoId: string
  p: Mensagens['produtos']
  /** `preco_atacado` do produto (fora da tabela de faixas) — usado só pra
   *  explicar, quando a lista de faixas está vazia, que o preço simples do
   *  catálogo já está ativo via fallback do PDV (não é "atacado inativo"). */
  precoAtacadoCatalogo?: number | null
}>

const IN = 'fp-control fp-control--sm h-8 w-full font-mono text-caption'

function validarFaixa(
  quantidade: number | null,
  preco: number | null,
  faixas: FaixaAtacado[],
  ignorarId: string | null,
  p: Mensagens['produtos'],
): string | null {
  if (quantidade === null || !Number.isInteger(quantidade) || quantidade <= 0) {
    return p.faixa_quantidade_invalida
  }
  if (preco === null || preco <= 0) {
    return p.faixa_preco_invalido
  }
  const duplicada = faixas.some((f) => f.id !== ignorarId && f.quantidade_minima === quantidade)
  if (duplicada) return p.faixa_duplicada
  return null
}

function FaixaFormRow({
  p,
  inicial,
  faixasExistentes,
  ignorarId,
  onCancelar,
  onSalvar,
}: {
  p: Mensagens['produtos']
  inicial?: FaixaAtacado
  faixasExistentes: FaixaAtacado[]
  ignorarId: string | null
  onCancelar?: () => void
  onSalvar: (quantidade: number, preco: number) => Promise<void>
}) {
  const [quantidadeTexto, setQuantidadeTexto] = useState(
    inicial ? String(inicial.quantidade_minima) : '',
  )
  const precoInput = useMoneyInput(inicial?.preco_unitario ?? null, { estrito: true })
  const [salvando, setSalvando] = useState(false)

  const confirmar = useCallback(async () => {
    const qtdEntrada = parseQuantidadeInteiraEntrada(quantidadeTexto)
    const precoEntrada = precoInput.validar()
    const erroEntrada =
      mensagemErroEntrada(qtdEntrada, 'quantidade', p) ??
      mensagemErroEntrada(precoEntrada, 'moeda', p)
    if (erroEntrada) {
      emitGerenteToast({ kind: 'error', message: erroEntrada })
      return
    }
    const quantidade = qtdEntrada.ok ? qtdEntrada.value : null
    const preco = precoInput.parse()
    const erro = validarFaixa(quantidade, preco, faixasExistentes, ignorarId, p)
    if (erro) {
      emitGerenteToast({ kind: 'error', message: erro })
      return
    }
    setSalvando(true)
    try {
      await onSalvar(quantidade as number, preco as number)
    } finally {
      setSalvando(false)
    }
  }, [quantidadeTexto, precoInput, faixasExistentes, ignorarId, p, onSalvar])

  return (
    <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-md border border-jl-accent/40 bg-white/[.03] p-2">
      <input
        type="text"
        inputMode="numeric"
        className={IN}
        placeholder={p.faixa_quantidade_placeholder}
        value={quantidadeTexto}
        onChange={(e) => setQuantidadeTexto(e.target.value)}
        disabled={salvando}
        autoFocus
      />
      <input
        type="text"
        inputMode="decimal"
        className={IN}
        placeholder="0,00"
        value={precoInput.display}
        onChange={precoInput.onChange}
        disabled={salvando}
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando}
          className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50"
          title={p.faixa_confirmar}
        >
          <Check size={14} />
        </button>
        {onCancelar ? (
          <button
            type="button"
            onClick={onCancelar}
            disabled={salvando}
            className="flex h-8 w-8 items-center justify-center rounded-md text-jl-fg-3 hover:bg-white/10 disabled:opacity-50"
            title={p.faixa_cancelar}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Editor CRUD de faixas de preço atacado (tabela `precos_atacado`). Remover
 *  inativa a faixa (ativo=false) em vez de excluir fisicamente. */
export function FaixasAtacadoEditor({ produtoId, p, precoAtacadoCatalogo }: Props) {
  const [faixas, setFaixas] = useState<FaixaAtacado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [mostrandoNova, setMostrandoNova] = useState(false)
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  // Plano sem `faixas_preco` (Básico): esconde a criação/edição; o servidor também recusa.
  const [permitido, setPermitido] = useState(true)
  useEffect(() => {
    let vivo = true
    faixasPermitidasNoPlano().then((ok) => { if (vivo) setPermitido(ok) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await listarFaixasAtacado(produtoId)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setFaixas(r.data)
    } finally {
      setCarregando(false)
    }
  }, [produtoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const salvarNova = useCallback(async (quantidade: number, preco: number) => {
    const r = await criarFaixaAtacado({ produto_id: produtoId, quantidade_minima: quantidade, preco_unitario: preco })
    if (!r.success) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setMostrandoNova(false)
    await carregar()
  }, [produtoId, carregar])

  const salvarEdicao = useCallback(async (id: string, quantidade: number, preco: number) => {
    const r = await atualizarFaixaAtacado({ id, produto_id: produtoId, quantidade_minima: quantidade, preco_unitario: preco })
    if (!r.success) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setEditandoId(null)
    await carregar()
  }, [produtoId, carregar])

  const remover = useCallback(async (id: string) => {
    setRemovendoId(id)
    try {
      const r = await inativarFaixaAtacado({ id, produto_id: produtoId })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      await carregar()
    } finally {
      setRemovendoId(null)
    }
  }, [produtoId, carregar])

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 px-2 text-caption font-semibold uppercase tracking-wider text-jl-fg-3">
        <span>{p.faixa_col_quantidade}</span>
        <span>{p.faixa_col_preco}</span>
        <span />
      </div>

      <div className="space-y-1.5">
        {carregando ? (
          <p className="px-2 text-xs text-jl-fg-3">{p.faixa_carregando}</p>
        ) : faixas.length === 0 && !mostrandoNova ? (
          <p className="px-2 text-xs text-jl-fg-3">
            {precoAtacadoCatalogo != null && precoAtacadoCatalogo > 0
              ? p.faixa_vazio_com_fallback.replace('{{preco}}', formatBRL(precoAtacadoCatalogo))
              : p.faixa_vazio}
          </p>
        ) : null}

        {faixas.map((f) =>
          editandoId === f.id ? (
            <FaixaFormRow
              key={f.id}
              p={p}
              inicial={f}
              faixasExistentes={faixas}
              ignorarId={f.id}
              onCancelar={() => setEditandoId(null)}
              onSalvar={(q, v) => salvarEdicao(f.id, q, v)}
            />
          ) : (
            <div
              key={f.id}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-md border border-[var(--color-border-secondary)] p-2"
            >
              <span className="text-xs font-mono text-jl-fg-1">{f.quantidade_minima}+ {p.faixa_unidades}</span>
              <span className="text-xs font-mono text-jl-fg-1">{formatBRL(f.preco_unitario)}</span>
              <div className="flex gap-1">
                {permitido ? <button
                  type="button"
                  onClick={() => setEditandoId(f.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-jl-fg-3 hover:bg-white/10"
                  title={p.faixa_editar}
                >
                  <Pencil size={13} />
                </button> : null}
                <button
                  type="button"
                  onClick={() => void remover(f.id)}
                  disabled={removendoId === f.id}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                  title={p.faixa_remover}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ),
        )}

        {mostrandoNova ? (
          <FaixaFormRow
            p={p}
            faixasExistentes={faixas}
            ignorarId={null}
            onCancelar={() => setMostrandoNova(false)}
            onSalvar={salvarNova}
          />
        ) : null}
      </div>

      {!permitido ? (
        <p className="mt-2 text-xs text-jl-fg-3" data-testid="faixas-plano-bloqueado">
          Faixas de preço não inclusas no seu plano — faça upgrade em Assinatura. / 您的方案不包含阶梯价格。
        </p>
      ) : !mostrandoNova ? (
        <button
          type="button"
          onClick={() => setMostrandoNova(true)}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-jl-accent hover:underline"
        >
          <Plus size={13} /> {p.faixa_adicionar}
        </button>
      ) : null}
    </div>
  )
}
