'use client'

/**
 * Autocomplete de vínculo opcional com uma Ordem de Compra (S8/RM-14).
 *
 * Mesmo padrão de `ProdutoRecebimentoAutocomplete`: escreve num
 * `<input type="hidden">` (`ordem_compra_id`), busca com debounce, sem
 * pré-seleção. Campo opcional — recebimento sem vínculo não passa por aqui
 * (o hidden input fica vazio e o submit segue exatamente como hoje).
 *
 * A validação de "OC já recebida" NÃO mora aqui — é feita no servidor
 * (`validarVinculoOrdemCompra`, aplicada em `criarRemessaConferencia`) no
 * momento do submit. Este componente só lista o que já é elegível
 * (CONFIRMADA/EM_TRANSITO, via `listarOrdensCompraElegiveisParaVinculo`).
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Input } from '@/components/ui/forms'
import { fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { listarOrdensCompraElegiveisParaVinculo, type OcListaDTO } from '../compras/actions'

type Props = Readonly<{
  disabled?: boolean
  placeholder: string
  semResultadosLabel: string
  minimoLabel: string
  limparLabel: string
  /** `status_CONFIRMADA`/`status_EM_TRANSITO` já resolvidos no idioma da sessão. */
  statusLabels: Readonly<Record<string, string>>
}>

export function OrdemCompraVinculoAutocomplete({
  disabled,
  placeholder,
  semResultadosLabel,
  minimoLabel,
  limparLabel,
  statusLabels,
}: Props) {
  const listId = useId()
  const [termo, setTermo] = useState('')
  const [opcoes, setOpcoes] = useState<OcListaDTO[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [selecionado, setSelecionado] = useState<OcListaDTO | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const termoDebounced = useDebounce(termo, 260)

  useEffect(() => {
    if (selecionado) return
    const t = termoDebounced.trim()
    if (t.length < 2) {
      setOpcoes([])
      return
    }
    let cancelado = false
    setCarregando(true)
    void listarOrdensCompraElegiveisParaVinculo(t)
      .then((rows) => {
        if (cancelado) return
        setOpcoes(rows)
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [termoDebounced, selecionado])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const rotulo = (oc: OcListaDTO) => oc.fornecedor_nome ?? fmtGerenteIdCurto(oc.id)

  const escolher = (oc: OcListaDTO) => {
    setSelecionado(oc)
    setTermo(rotulo(oc))
    setAberto(false)
  }

  const limpar = () => {
    setSelecionado(null)
    setTermo('')
    setOpcoes([])
    setAberto(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name="ordem_compra_id" value={selecionado?.id ?? ''} />

      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          value={termo}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-autocomplete="list"
          className="pl-8"
          onChange={(e) => {
            setSelecionado(null)
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAberto(false)
            if (e.key === 'Enter' && aberto && !selecionado && opcoes.length > 0) {
              e.preventDefault()
              escolher(opcoes[0])
            }
          }}
        />
        {selecionado ? (
          <button
            type="button"
            onClick={limpar}
            disabled={disabled}
            className="fp-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm px-1 text-caption text-fg-subtle hover:text-fg"
          >
            {limparLabel}
          </button>
        ) : null}
      </div>

      {aberto && !selecionado ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] py-1 shadow-lg"
        >
          {carregando ? (
            <li
              role="presentation"
              className="flex items-center gap-2 px-3 py-2 text-caption text-fg-subtle"
            >
              <Loader2 size={12} className="animate-spin" aria-hidden />
            </li>
          ) : termo.trim().length < 2 ? (
            <li role="presentation" className="px-3 py-2 text-caption text-fg-subtle">
              {minimoLabel}
            </li>
          ) : opcoes.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-caption text-fg-subtle">
              {semResultadosLabel}
            </li>
          ) : (
            opcoes.map((oc) => (
              <li key={oc.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => escolher(oc)}
                  className="fp-focus-ring flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-[var(--color-surface-soft)]"
                >
                  <span className="text-body text-fg">{oc.fornecedor_nome ?? fmtGerenteIdCurto(oc.id)}</span>
                  <span className="font-mono text-caption text-fg-subtle">
                    {fmtGerenteIdCurto(oc.id)} · {statusLabels[oc.status] ?? oc.status}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
