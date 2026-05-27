'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Plus, X, Tag } from 'lucide-react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  excluirCategoriaAction,
  listarCategoriasAction,
  salvarCategoriaAction,
  type CategoriaInput,
  type CategoriaRow,
} from './actions'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  categoriasIniciais: CategoriaRow[]
}>

export function CategoriasListClient({ idioma, locale, categoriasIniciais }: Props) {
  const m = getMessages(idioma)
  const [categorias, setCategorias] = useState<CategoriaRow[]>(categoriasIniciais)
  const [termo, setTermo] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<CategoriaRow | null>(null)

  async function recarregar() {
    const r = await listarCategoriasAction()
    if (r.ok) setCategorias(r.categorias)
  }

  function abrirNovo() {
    setEmEdicao(null)
    setModalAberto(true)
  }
  function abrirEditar(c: CategoriaRow) {
    setEmEdicao(c)
    setModalAberto(true)
  }
  function onSalvo(c: CategoriaRow) {
    setCategorias((cur) => {
      const i = cur.findIndex((x) => x.id === c.id)
      if (i >= 0) return cur.map((x) => (x.id === c.id ? { ...x, ...c } : x))
      return [c, ...cur]
    })
    emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
    setModalAberto(false)
  }
  async function onExcluir(c: CategoriaRow) {
    const r = await excluirCategoriaAction(c.id)
    if (!r.ok) {
      emitGerenteToast({ kind: 'error', message: r.error })
      return
    }
    setCategorias((cur) => cur.filter((x) => x.id !== c.id))
    emitGerenteToast({ kind: 'success', message: m.categorias.toast_excluida })
  }

  const filtradas = termo.trim()
    ? categorias.filter((c) =>
        c.nome.toLowerCase().includes(termo.trim().toLowerCase()) ||
        (c.descricao ?? '').toLowerCase().includes(termo.trim().toLowerCase()),
      )
    : categorias

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder={m.categorias.placeholder_busca}
          aria-label={m.categorias.placeholder_busca}
          className="app-input h-9 w-full max-w-[360px] rounded-md px-3 text-sm shadow-inner"
        />
        <Button type="button" className="app-btn-accent gap-1.5" onClick={abrirNovo}>
          <Plus className="h-4 w-4" aria-hidden /> {m.categorias.nova}
        </Button>
      </div>

      <GerenteTable
        tone="dragon"
        columns={[
          { key: 'nome', header: m.categorias.col_nome },
          { key: 'desc', header: m.categorias.col_descricao },
          { key: 'produtos', header: m.categorias.col_produtos, width: 120 },
          { key: 'status', header: m.categorias.col_status, width: 100 },
          { key: 'acoes', header: <span className="sr-only">{m.categorias.col_acoes}</span>, width: 90 },
        ]}
      >
        {filtradas.map((c) => (
          <tr key={c.id} className={cn('gerente-fin-row-hover', !c.ativo && 'opacity-60')}>
            <td className="px-3 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-400/15 text-amber-400">
                  <Tag className="h-3.5 w-3.5" aria-hidden />
                </span>
                <strong className={cn('text-foreground', !c.ativo && 'line-through decoration-slate-500')}>
                  {c.nome}
                </strong>
              </div>
            </td>
            <td className="gerente-fin-cell px-3 py-3 text-sm text-muted-foreground">
              {c.descricao ?? '—'}
            </td>
            <td className="px-3 py-3 text-right">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums',
                c.produtos_count > 0 ? 'app-badge-warn' : 'app-badge-neutral',
              )}>
                {c.produtos_count}
              </span>
            </td>
            <td className="px-3 py-3">
              {c.ativo ? (
                <span className="app-badge-positive inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  {m.categorias.status_ativo}
                </span>
              ) : (
                <span className="app-badge-neutral inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                  {m.categorias.status_inativo}
                </span>
              )}
            </td>
            <td className="px-3 py-3">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => abrirEditar(c)}
                  aria-label={`${m.categorias.editar} — ${c.nome}`}
                  title={m.categorias.editar}
                  className="app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <ConfirmActionButton
                  type="button"
                  confirmMessage={
                    c.produtos_count > 0
                      ? `${m.categorias.aviso_com_produtos.replace('{n}', String(c.produtos_count))}`
                      : `${m.categorias.confirmar_exclusao} "${c.nome}"?`
                  }
                  onClick={() => void onExcluir(c)}
                  aria-label={`${m.categorias.excluir} — ${c.nome}`}
                  title={m.categorias.excluir}
                  disabled={c.produtos_count > 0}
                  className={cn(
                    'app-btn-neutral inline-flex h-8 w-8 items-center justify-center rounded-md text-red-300 transition-colors hover:border-red-400/50 hover:text-red-200',
                    c.produtos_count > 0 && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </ConfirmActionButton>
              </div>
            </td>
          </tr>
        ))}

        {filtradas.length === 0 && (
          <tr>
            <td colSpan={5} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>类</div>
              <div className="mt-3 text-sm font-semibold text-foreground">{m.categorias.vazio_titulo}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.categorias.vazio_sub}</div>
            </td>
          </tr>
        )}
      </GerenteTable>

      {modalAberto && (
        <CategoriaModal
          idioma={idioma}
          categoria={emEdicao}
          onClose={() => setModalAberto(false)}
          onSalvo={onSalvo}
        />
      )}
    </>
  )
}

// ————————————————————————————————————————————————————
// Modal de criação / edição
// ————————————————————————————————————————————————————

type ModalProps = Readonly<{
  idioma: Idioma
  categoria: CategoriaRow | null
  onClose: () => void
  onSalvo: (c: CategoriaRow) => void
}>

function CategoriaModal({ idioma, categoria, onClose, onSalvo }: ModalProps) {
  const m = getMessages(idioma)
  const editando = !!categoria

  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [descricao, setDescricao] = useState(categoria?.descricao ?? '')
  const [ativo, setAtivo] = useState(categoria?.ativo ?? true)
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const nomeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const triggerEl = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => nomeRef.current?.focus(), 30)

    const onKey = (e: KeyboardEvent) => {
      if (salvando) return
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
      } else if (e.key === 'Tab') {
        const f = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!f || f.length === 0) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      triggerEl?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvando])

  function sujo(): boolean {
    if (!editando) return !!(nome || descricao || !ativo)
    return (
      nome !== categoria!.nome ||
      (descricao || '') !== (categoria!.descricao ?? '') ||
      ativo !== categoria!.ativo
    )
  }

  const fechar = useCallback(() => {
    if (sujo() && !confirm(m.categorias.confirmar_descartar)) return
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, descricao, ativo, categoria, onClose, m])

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = m.categorias.err_nome_obrigatorio
    else if (nome.trim().length < 2) e.nome = m.categorias.err_nome_curto
    else if (nome.trim().length > 60) e.nome = m.categorias.err_nome_longo
    if (descricao && descricao.length > 200) e.descricao = m.categorias.err_descricao_longa
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    setSalvando(true)
    try {
      const input: CategoriaInput = {
        id: categoria?.id,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        ativo,
      }
      const r = await salvarCategoriaAction(input)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      // Preservar produtos_count na edição
      if (categoria) {
        onSalvo({ ...r.categoria, produtos_count: categoria.produtos_count })
      } else {
        onSalvo(r.categoria)
      }
    } finally {
      setSalvando(false)
    }
  }

  const finIn = 'h-10 w-full rounded-md px-3 text-sm app-input'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando) fechar()
      }}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-modal-titulo"
        className="dragon-glass-card flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-border px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Tag className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" aria-hidden />
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {editando ? m.categorias.modal_editar : m.categorias.modal_nova} · 类别
                </p>
                <CardTitle id="cat-modal-titulo" className="text-lg font-semibold text-foreground">
                  {editando ? categoria!.nome : m.categorias.modal_nova}
                </CardTitle>
              </div>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label={m.comum.fechar ?? 'Fechar'}
              disabled={salvando}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md app-border border text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </CardHeader>

        <form onSubmit={submeter} className="flex flex-1 min-h-0 flex-col">
          <CardContent className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <label className="block text-xs font-medium text-muted-foreground">
              {m.categorias.field_nome}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
              <input
                ref={nomeRef}
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                  if (erros.nome) setErros((x) => ({ ...x, nome: null }))
                }}
                disabled={salvando}
                required
                maxLength={60}
                aria-invalid={!!erros.nome}
                className={cn(`${finIn} mt-1`, erros.nome && 'border-red-400/60')}
              />
              {erros.nome && <span className="mt-1 block text-xs text-red-300">{erros.nome}</span>}
            </label>

            <label className="block text-xs font-medium text-muted-foreground">
              {m.categorias.field_descricao}
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                disabled={salvando}
                maxLength={200}
                rows={3}
                placeholder={m.categorias.placeholder_descricao}
                className={cn('app-input mt-1 w-full rounded-md px-3 py-2 text-sm', erros.descricao && 'border-red-400/60')}
              />
              {erros.descricao && <span className="mt-1 block text-xs text-red-300">{erros.descricao}</span>}
              <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                {(descricao ?? '').length} / 200
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-md app-border border bg-slate-950/45 px-3 py-2.5 text-xs font-medium">
              <input type="checkbox" checked={ativo} className="h-4 w-4 rounded"
                onChange={(e) => setAtivo(e.target.checked)} />
              <span className="text-foreground">{m.categorias.field_ativo}</span>
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({ativo ? m.categorias.ativa_label : m.categorias.inativa_label})
              </span>
            </label>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-border px-5 py-3 sm:px-6">
            <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={salvando}>
              {m.comum.cancelar}
            </Button>
            <Button type="submit" className="app-btn-accent" disabled={salvando}>
              {salvando ? m.comum.carregando ?? '…' : editando ? m.categorias.btn_salvar : m.categorias.btn_cadastrar}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
