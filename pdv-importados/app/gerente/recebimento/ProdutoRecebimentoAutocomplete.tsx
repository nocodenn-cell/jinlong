'use client'

/**
 * Autocomplete de produto do recebimento.
 *
 * Antes era um `<select>` com os 500 primeiros produtos ativos: acima do teto o
 * item não aparecia, sem erro nem aviso, e mesmo abaixo dele achar um produto
 * numa lista de centenas de `<option>` é inviável no balcão.
 *
 * Mantém o contrato do formulário: escreve em um `<input type="hidden">` chamado
 * `produto_id`, então o submit existente não muda.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Input } from '@/components/ui/forms'
import {
  buscarProdutosRecebimento,
  type RecebimentoProdutoBusca,
} from './actions'

type Props = Readonly<{
  disabled?: boolean
  placeholder: string
  semResultadosLabel: string
  minimoLabel: string
  limparLabel: string
  /** Pré-seleciona o produto (ex.: deep-link "Repor" a partir do estoque crítico). */
  valorInicial?: RecebimentoProdutoBusca | null
  /** Avisa o formulário quando um produto é escolhido/limpo (para mostrar o nome na confirmação). */
  onChange?: (produto: RecebimentoProdutoBusca | null) => void
}>

/**
 * Escolha automática para leitor de código de barras: um único resultado, ou um resultado cujo
 * código de barras é exatamente o termo digitado. Com mais de um candidato o operador decide.
 */
function escolhaAutomatica(
  lista: readonly RecebimentoProdutoBusca[],
  termo: string,
): RecebimentoProdutoBusca | null {
  if (lista.length === 1) return lista[0]
  const exatos = lista.filter((p) => p.codigo_barras !== null && p.codigo_barras === termo)
  return exatos.length === 1 ? exatos[0] : null
}

export function ProdutoRecebimentoAutocomplete({
  disabled,
  placeholder,
  semResultadosLabel,
  minimoLabel,
  limparLabel,
  valorInicial = null,
  onChange,
}: Props) {
  const listId = useId()
  const [termo, setTermo] = useState(() =>
    valorInicial
      ? valorInicial.codigo_barras
        ? `${valorInicial.nome} · ${valorInicial.codigo_barras}`
        : valorInicial.nome
      : '',
  )
  const [opcoes, setOpcoes] = useState<RecebimentoProdutoBusca[]>([])
  // Termo a que `opcoes` responde: o Enter só confia na lista quando ela é do que está digitado.
  // Um leitor de código de barras digita e envia Enter antes do debounce; sem essa checagem o Enter
  // escolheria o 1º item de uma busca ANTERIOR (produto errado).
  const [termoDasOpcoes, setTermoDasOpcoes] = useState('')
  const termoAtualRef = useRef('')
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [selecionado, setSelecionado] = useState<RecebimentoProdutoBusca | null>(valorInicial)
  const wrapRef = useRef<HTMLDivElement>(null)

  const termoDebounced = useDebounce(termo, 260)

  useEffect(() => {
    termoAtualRef.current = termo.trim()
  }, [termo])

  useEffect(() => {
    // Já escolheu: não fica buscando enquanto o campo mostra o nome escolhido.
    if (selecionado) return
    const t = termoDebounced.trim()
    if (t.length < 2) {
      setOpcoes([])
      return
    }
    let cancelado = false
    setCarregando(true)
    void buscarProdutosRecebimento(t)
      .then((r) => {
        if (cancelado) return
        setOpcoes(r.success ? r.data : [])
        setTermoDasOpcoes(t)
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

  const escolher = (p: RecebimentoProdutoBusca) => {
    setSelecionado(p)
    setTermo(p.codigo_barras ? `${p.nome} · ${p.codigo_barras}` : p.nome)
    setAberto(false)
    onChange?.(p)
  }

  const limpar = () => {
    setSelecionado(null)
    setTermo('')
    setOpcoes([])
    setTermoDasOpcoes('')
    setAberto(false)
    onChange?.(null)
  }

  // Enter nunca envia o formulário a partir deste campo (produto vazio = erro; produto escolhido =
  // confirmação acidental). Escolhe o que a lista mostra ou, sem lista do termo atual (leitor de
  // código de barras), busca na hora e só escolhe sozinho se o resultado for inequívoco.
  const aoEnter = async () => {
    if (selecionado) return
    const t = termo.trim()
    if (t.length < 2) return
    if (termoDasOpcoes === t && opcoes.length > 0) {
      escolher(opcoes[0])
      return
    }
    setCarregando(true)
    setAberto(true)
    try {
      const r = await buscarProdutosRecebimento(t)
      if (termoAtualRef.current !== t) return // o operador continuou digitando
      const lista = r.success ? r.data : []
      setOpcoes(lista)
      setTermoDasOpcoes(t)
      const unico = escolhaAutomatica(lista, t)
      if (unico) escolher(unico)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name="produto_id" value={selecionado?.id ?? ''} />

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
            if (selecionado) onChange?.(null)
            setSelecionado(null)
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAberto(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              void aoEnter()
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
          {/* Estados de aviso não são escolhas: `role="presentation"` evita que
              o leitor de tela os anuncie como opções da lista. */}
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
            // `role="option"` fica no elemento focável (o botão) e o `<li>` sai do
            // caminho com `role="none"`: uma `option` não pode conter controle
            // interativo, e o listbox precisa das options como filhas diretas.
            opcoes.map((p) => (
              <li key={p.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => escolher(p)}
                  className="fp-focus-ring flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-[var(--color-surface-soft)]"
                >
                  <span className="text-body text-fg">{p.nome}</span>
                  {p.codigo_barras ? (
                    <span className="font-mono text-caption text-fg-subtle">
                      {p.codigo_barras}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
