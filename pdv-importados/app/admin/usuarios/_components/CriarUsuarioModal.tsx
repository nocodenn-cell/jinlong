'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { criarUsuario, type PerfilUsuario } from '../actions'
import type { LojaOpcao } from './UsuariosTable'
import { cn } from '@/lib/utils'

const PERFIS: { value: PerfilUsuario; label: string }[] = [
  { value: 'OPERADOR', label: 'Operador (PDV)' },
  { value: 'GERENTE', label: 'Gerente' },
  { value: 'DONO', label: 'Dono' },
  { value: 'ADMIN', label: 'Admin (sistema)' },
]

const inputCls =
  'admin-v2-input w-full px-2.5 py-[7px] text-[12px] outline-none transition-colors'

export function CriarUsuarioModal({
  open,
  onClose,
  lojas,
}: {
  open: boolean
  onClose: () => void
  lojas: LojaOpcao[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setErro(null)
    requestAnimationFrame(() => emailRef.current?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, pending, onClose])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim()
    const senha = String(fd.get('senha') ?? '')
    const nome = String(fd.get('nome') ?? '').trim()
    const perfil = String(fd.get('perfil') ?? '') as PerfilUsuario
    const loja_id = String(fd.get('loja_id') ?? '')
    const idioma = String(fd.get('idioma') ?? 'pt') as 'pt' | 'zh'

    if (!email) { setErro('E-mail obrigatório'); return }
    if (senha.length < 6) { setErro('Senha deve ter no mínimo 6 caracteres'); return }
    if (!nome) { setErro('Nome obrigatório'); return }
    if (!loja_id) { setErro('Selecione uma loja'); return }

    setErro(null)
    startTransition(async () => {
      try {
        const res = await criarUsuario({ email, senha, nome, perfil, loja_id, idioma })
        if (!res.success) {
          setErro(res.error)
          return
        }
        router.refresh()
        onClose()
      } catch {
        setErro('Erro inesperado. Tente novamente.')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="criar-usuario-heading"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={pending ? undefined : onClose}
        aria-hidden
      />
      <div className="admin-v2-panel relative z-10 w-full max-w-md rounded-[14px] p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="criar-usuario-heading" className="text-[15px] font-semibold text-jl-fg-1">
            Novo usuário
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">E-mail *</span>
            <input
              ref={emailRef}
              name="email"
              type="email"
              required
              autoComplete="off"
              disabled={pending}
              className={inputCls}
              placeholder="usuario@empresa.com"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">Senha temporária *</span>
            <input
              name="senha"
              type="text"
              minLength={6}
              required
              autoComplete="new-password"
              disabled={pending}
              className={inputCls}
              placeholder="Mín. 6 caracteres"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">Nome completo *</span>
            <input
              name="nome"
              type="text"
              required
              maxLength={200}
              disabled={pending}
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-jl-fg-3">Perfil *</span>
              <select name="perfil" defaultValue="OPERADOR" disabled={pending} className={inputCls}>
                {PERFIS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-jl-fg-3">Idioma</span>
              <select name="idioma" defaultValue="pt" disabled={pending} className={inputCls}>
                <option value="pt">Português</option>
                <option value="zh">中文</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">Loja *</span>
            <select
              name="loja_id"
              defaultValue={lojas[0]?.id ?? ''}
              disabled={pending}
              className={inputCls}
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>

          {erro ? (
            <p className={cn('admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]')}>{erro}</p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="admin-v2-btn-secondary"
            >
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="admin-v2-btn-primary">
              {pending ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
