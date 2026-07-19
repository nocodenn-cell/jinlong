'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import { cn } from '@/lib/utils'
import {
  atualizarFuncionarioAction,
  criarFuncionarioAction,
  type FuncionarioListRow,
} from './actions'
import {
  perfisAtribuiveisPorAtor,
  type PerfilFuncionarioUi,
} from './funcionarioPolicies'

export type FuncionarioModalLabels = {
  novo: string
  editar: string
  nome: string
  email: string
  perfil: string
  idioma: string
  senha: string
  senhaNovaOpcional: string
  senhaHint: string
  salvar: string
  salvando: string
  cancelar: string
  perfilOperador: string
  perfilGerente: string
  idiomaPt: string
  idiomaZh: string
}

type Props = {
  labels: FuncionarioModalLabels
  atorPerfil: string
  funcionario: FuncionarioListRow | null
  onClose: () => void
  onSalvo: (row: FuncionarioListRow) => void
}

const inputClass =
  'w-full rounded-md border border-jl-border-1 bg-jl-surface-soft px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'

export function FuncionarioEditarModal({
  labels: L,
  atorPerfil,
  funcionario,
  onClose,
  onSalvo,
}: Props) {
  const editando = !!funcionario
  const perfis = perfisAtribuiveisPorAtor(atorPerfil)
  const nomeRef = useRef<HTMLInputElement>(null)

  const [nome, setNome] = useState(funcionario?.nome ?? '')
  const [email, setEmail] = useState(funcionario?.email ?? '')
  const [perfil, setPerfil] = useState<PerfilFuncionarioUi>(
    (funcionario?.perfil === 'GERENTE' ? 'GERENTE' : 'OPERADOR') as PerfilFuncionarioUi,
  )
  const [idioma, setIdioma] = useState<'pt' | 'zh'>(
    funcionario?.idioma_preferido === 'zh' ? 'zh' : 'pt',
  )
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => nomeRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      if (editando && funcionario) {
        const r = await atualizarFuncionarioAction({
          id: funcionario.id,
          nome: nome.trim(),
          perfil,
          idioma_preferido: idioma,
          senhaNova: senha.trim() || undefined,
        })
        if (!r.ok) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        onSalvo(r.data)
        onClose()
        return
      }

      const r = await criarFuncionarioAction({
        nome: nome.trim(),
        email: email.trim(),
        perfil,
        idioma_preferido: idioma,
        senha,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      onSalvo(r.data)
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <DragonModal
      open
      onClose={onClose}
      title={editando ? L.editar : L.novo}
      size="md"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="funcionario-form">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="func-nome" className="text-xs font-medium text-jl-fg-3">
            {L.nome}
          </label>
          <input
            id="func-nome"
            ref={nomeRef}
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            required
            minLength={2}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="func-email" className="text-xs font-medium text-jl-fg-3">
            {L.email}
          </label>
          <input
            id="func-email"
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required={!editando}
            disabled={editando}
            autoComplete="off"
            className={cn(inputClass, editando && 'opacity-70')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="func-perfil" className="text-xs font-medium text-jl-fg-3">
              {L.perfil}
            </label>
            <select
              id="func-perfil"
              value={perfil}
              onChange={(ev) => setPerfil(ev.target.value as PerfilFuncionarioUi)}
              className={inputClass}
            >
              {perfis.includes('OPERADOR') ? (
                <option value="OPERADOR">{L.perfilOperador}</option>
              ) : null}
              {perfis.includes('GERENTE') ? (
                <option value="GERENTE">{L.perfilGerente}</option>
              ) : null}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="func-idioma" className="text-xs font-medium text-jl-fg-3">
              {L.idioma}
            </label>
            <select
              id="func-idioma"
              value={idioma}
              onChange={(ev) => setIdioma(ev.target.value as 'pt' | 'zh')}
              className={inputClass}
            >
              <option value="pt">{L.idiomaPt}</option>
              <option value="zh">{L.idiomaZh}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="func-senha" className="text-xs font-medium text-jl-fg-3">
            {editando ? L.senhaNovaOpcional : L.senha}
          </label>
          <input
            id="func-senha"
            type="password"
            value={senha}
            onChange={(ev) => setSenha(ev.target.value)}
            required={!editando}
            minLength={editando && !senha ? undefined : PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            className={inputClass}
          />
          <p className="text-[11px] text-jl-fg-3">{L.senhaHint.replace('{n}', String(PASSWORD_MIN_LENGTH))}</p>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            {L.cancelar}
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? L.salvando : L.salvar}
          </Button>
        </div>
      </form>
    </DragonModal>
  )
}
