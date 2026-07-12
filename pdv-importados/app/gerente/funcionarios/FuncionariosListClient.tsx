'use client'

import { useCallback, useState, useTransition } from 'react'
import { Plus, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import {
  cadastrarFuncionario,
  definirFuncionarioAtivo,
  listarFuncionarios,
  type FuncionarioRow,
} from './actions'

type Props = Readonly<{
  idioma: Idioma
  funcionariosIniciais: FuncionarioRow[]
  podeCriarGerente: boolean
}>

type FormState = { nome: string; email: string; perfil: 'OPERADOR' | 'GERENTE'; senha: string }

const FORM_VAZIO: FormState = { nome: '', email: '', perfil: 'OPERADOR', senha: '' }

function fmtData(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale)
}

export function FuncionariosListClient({ idioma, funcionariosIniciais, podeCriarGerente }: Props) {
  const m = getMessages(idioma).funcionarios
  const locale = idioma === 'zh' ? 'zh-CN' : 'pt-BR'
  const [funcionarios, setFuncionarios] = useState<FuncionarioRow[]>(funcionariosIniciais)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)
  const [formAberto, setFormAberto] = useState(false)
  const [pending, startTransition] = useTransition()

  const recarregar = useCallback(async () => {
    const res = await listarFuncionarios()
    if (res.success) setFuncionarios(res.data)
  }, [])

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      startTransition(async () => {
        const res = await cadastrarFuncionario(form)
        if (!res.success) {
          emitGerenteToast({ kind: 'error', message: res.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: m.msg_criado })
        setForm(FORM_VAZIO)
        setFormAberto(false)
        await recarregar()
      })
    },
    [form, m.msg_criado, recarregar],
  )

  const onToggleAtivo = useCallback(
    (f: FuncionarioRow) => {
      startTransition(async () => {
        const res = await definirFuncionarioAtivo({ id: f.id, ativo: !f.ativo })
        if (!res.success) {
          emitGerenteToast({ kind: 'error', message: res.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: f.ativo ? m.msg_desativado : m.msg_ativado })
        await recarregar()
      })
    },
    [m.msg_ativado, m.msg_desativado, recarregar],
  )

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-jl-fg-1">{m.titulo}</h1>
          <p className="text-xs text-jl-fg-3">{m.subtitulo}</p>
        </div>
        <Button type="button" onClick={() => setFormAberto((v) => !v)} className="gap-1">
          <Plus className="h-4 w-4" aria-hidden />
          {m.novo}
        </Button>
      </header>

      {formAberto ? (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-lg border border-jl-border-1 bg-jl-surface-elev p-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-jl-fg-2">{m.campo_nome}</span>
            <input
              required
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="rounded border border-jl-border-1 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-jl-fg-2">{m.campo_email}</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded border border-jl-border-1 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-jl-fg-2">{m.campo_perfil}</span>
            <select
              value={form.perfil}
              onChange={(e) => setForm((f) => ({ ...f, perfil: e.target.value as FormState['perfil'] }))}
              className="rounded border border-jl-border-1 bg-transparent px-2 py-1.5 text-sm"
            >
              <option value="OPERADOR">{m.perfil_operador}</option>
              {podeCriarGerente ? <option value="GERENTE">{m.perfil_gerente}</option> : null}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-jl-fg-2">{m.campo_senha}</span>
            <input
              required
              type="text"
              minLength={8}
              value={form.senha}
              onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
              className="rounded border border-jl-border-1 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-[11px] text-jl-fg-3 sm:col-span-2">{m.aviso_senha}</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? m.salvando : m.salvar}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFormAberto(false)}>
              {m.cancelar}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-jl-border-1">
        <table className="w-full text-left text-sm">
          <thead className="bg-jl-surface-elev text-[11px] uppercase tracking-wide text-jl-fg-3">
            <tr className="border-b border-jl-border-1">
              <th className="px-3 py-2 font-semibold">{m.col_nome}</th>
              <th className="px-3 py-2 font-semibold">{m.col_perfil}</th>
              <th className="px-3 py-2 font-semibold">{m.col_status}</th>
              <th className="px-3 py-2 font-semibold">{m.col_criado}</th>
              <th className="px-3 py-2 text-right font-semibold">{m.col_acoes}</th>
            </tr>
          </thead>
          <tbody>
            {funcionarios.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-jl-fg-3">
                  {m.vazio}
                </td>
              </tr>
            ) : (
              funcionarios.map((f) => (
                <tr key={f.id} className="border-b border-jl-border-1/60">
                  <td className="px-3 py-2 font-medium">{f.nome}</td>
                  <td className="px-3 py-2 text-jl-fg-2">{f.perfil}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        f.ativo
                          ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400'
                          : 'rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400'
                      }
                    >
                      {f.ativo ? m.status_ativo : m.status_inativo}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-jl-fg-3">{fmtData(f.criadoEm, locale)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 gap-1 text-xs"
                      disabled={pending}
                      onClick={() => onToggleAtivo(f)}
                    >
                      {f.ativo ? (
                        <UserX className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {f.ativo ? m.acao_desativar : m.acao_ativar}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
