'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { Field, Input, Select } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
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
  emailHint: string
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
      dismissable={!salvando}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
            {L.cancelar}
          </Button>
          <Button type="submit" form="funcionario-form" variant="primary" disabled={salvando}>
            {salvando ? L.salvando : L.salvar}
          </Button>
        </>
      }
    >
      <form
        id="funcionario-form"
        onSubmit={onSubmit}
        className="flex flex-col gap-4 pb-1"
        data-testid="funcionario-form"
      >
        <Field id="func-nome" label={L.nome} required>
          <Input
            ref={nomeRef}
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            required
            minLength={2}
            autoComplete="name"
            disabled={salvando}
          />
        </Field>

        <Field
          id="func-email"
          label={L.email}
          required={!editando}
          hint={editando ? L.emailHint : undefined}
        >
          <Input
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required={!editando}
            disabled={editando || salvando}
            readOnly={editando}
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="func-perfil" label={L.perfil} required>
            <Select
              value={perfil}
              onChange={(ev) => setPerfil(ev.target.value as PerfilFuncionarioUi)}
              disabled={salvando}
            >
              {perfis.includes('OPERADOR') ? (
                <option value="OPERADOR">{L.perfilOperador}</option>
              ) : null}
              {perfis.includes('GERENTE') ? (
                <option value="GERENTE">{L.perfilGerente}</option>
              ) : null}
            </Select>
          </Field>
          <Field id="func-idioma" label={L.idioma}>
            <Select
              value={idioma}
              onChange={(ev) => setIdioma(ev.target.value as 'pt' | 'zh')}
              disabled={salvando}
            >
              <option value="pt">{L.idiomaPt}</option>
              <option value="zh">{L.idiomaZh}</option>
            </Select>
          </Field>
        </div>

        <Field
          id="func-senha"
          label={editando ? L.senhaNovaOpcional : L.senha}
          required={!editando}
          hint={L.senhaHint.replace('{n}', String(PASSWORD_MIN_LENGTH))}
        >
          <Input
            type="password"
            value={senha}
            onChange={(ev) => setSenha(ev.target.value)}
            required={!editando}
            minLength={editando && !senha ? undefined : PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            disabled={salvando}
          />
        </Field>
      </form>
    </DragonModal>
  )
}
