'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { Field, Input, Select } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import {
  atualizarFuncionarioAction,
  criarFuncionarioAction,
  verificarEmailDisponiveAction,
  type FuncionarioListRow,
} from './actions'
import { perfisAtribuiveisPorAtor, type PerfilFuncionarioUi } from './funcionarioPolicies'
import { FuncionarioPerfilResumo, type PerfilResumoLabels } from './FuncionarioPerfilResumo'

export type FuncionarioModalLabels = PerfilResumoLabels & {
  novo: string
  editar: string
  nome: string
  email: string
  emailHint: string
  emailAvisoCriar: string
  emailEmUso: string
  perfil: string
  idioma: string
  idiomaHintCriar: string
  idiomaHintEditar: string
  senha: string
  senhaNovaOpcional: string
  senhaHint: string
  senhaAceita: string
  salvar: string
  salvarAlteracoes: string
  cadastrar: string
  salvando: string
  cancelar: string
  perfilOperador: string
  perfilGerente: string
  idiomaPt: string
  idiomaZh: string
  grupoDados: string
  grupoAcesso: string
  redefinirSenha: string
  redefinirSenhaSalvar: string
}

type Props = {
  labels: FuncionarioModalLabels
  atorPerfil: string
  funcionario: FuncionarioListRow | null
  onClose: () => void
  onSalvo: (row: FuncionarioListRow) => void
}

export function FuncionarioEditarModal({ labels: L, atorPerfil, funcionario, onClose, onSalvo }: Props) {
  const editando = !!funcionario
  const perfis = perfisAtribuiveisPorAtor(atorPerfil)
  const nomeRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(funcionario?.nome ?? '')
  const [email, setEmail] = useState(funcionario?.email ?? '')
  const [perfil, setPerfil] = useState<PerfilFuncionarioUi>(perfilInicial(funcionario))
  const [idioma, setIdioma] = useState<'pt' | 'zh'>(funcionario?.idioma_preferido === 'zh' ? 'zh' : 'pt')
  const [senha, setSenha] = useState('')
  const [redefinir, setRedefinir] = useState(false)
  const [emailErro, setEmailErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => nomeRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editando && !(await emailLivre(email, setEmailErro, L.emailEmUso, true))) return
    setSalvando(true)
    try {
      const r = editando && funcionario
        ? await atualizarFuncionarioAction({ id: funcionario.id, nome: nome.trim(), perfil, idioma_preferido: idioma })
        : await criarFuncionarioAction({ nome: nome.trim(), email: email.trim(), perfil, idioma_preferido: idioma, senha })
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
      footer={<Rodape L={L} editando={editando} salvando={salvando} onClose={onClose} />}
    >
      <form id="funcionario-form" onSubmit={onSubmit} className="flex flex-col gap-4 pb-1" data-testid="funcionario-form">
        <Grupo titulo={L.grupoDados}>
          <Field id="func-nome" label={L.nome} required>
            <Input ref={nomeRef} value={nome} onChange={(ev) => setNome(ev.target.value)} required minLength={2} autoComplete="name" disabled={salvando} />
          </Field>
          <Field id="func-email" label={L.email} required={!editando} hint={editando ? L.emailHint : undefined} error={emailErro ?? undefined}>
            <Input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              onBlur={() => { if (!editando) void emailLivre(email, setEmailErro, L.emailEmUso, false) }}
              required={!editando}
              disabled={editando || salvando}
              readOnly={editando}
              autoComplete="off"
            />
          </Field>
          {!editando ? <p className="text-caption text-[var(--color-warning-strong)]" role="note">{L.emailAvisoCriar}</p> : null}
        </Grupo>
        <Grupo titulo={L.grupoAcesso}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoPerfil L={L} perfil={perfil} perfis={perfis} salvando={salvando} onChange={setPerfil} />
            <CampoIdioma L={L} idioma={idioma} editando={editando} salvando={salvando} onChange={setIdioma} />
          </div>
          <FuncionarioPerfilResumo perfil={perfil} labels={L} />
          {!editando ? <CampoSenha L={L} senha={senha} obrigatoria salvando={salvando} onChange={setSenha} /> : null}
        </Grupo>
      </form>
      {editando && funcionario ? (
        <RedefinirSenha L={L} aberto={redefinir} onAbrir={() => setRedefinir(true)} funcionario={funcionario} onSalvo={onSalvo} />
      ) : null}
    </DragonModal>
  )
}

function perfilInicial(funcionario: FuncionarioListRow | null): PerfilFuncionarioUi {
  return funcionario?.perfil === 'GERENTE' ? 'GERENTE' : 'OPERADOR'
}

async function emailLivre(
  email: string,
  setErro: (msg: string | null) => void,
  emUso: string,
  avisar: boolean,
): Promise<boolean> {
  if (!email.trim()) {
    setErro(null)
    return true
  }
  const r = await verificarEmailDisponiveAction(email.trim())
  if (!r.ok || !r.data) {
    setErro(emUso)
    if (avisar) emitGerenteToast({ kind: 'error', message: emUso })
    return false
  }
  setErro(null)
  return true
}

function Rodape({
  L,
  editando,
  salvando,
  onClose,
}: {
  L: FuncionarioModalLabels
  editando: boolean
  salvando: boolean
  onClose: () => void
}) {
  return (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>{L.cancelar}</Button>
      <Button type="submit" form="funcionario-form" variant="primary" disabled={salvando} className="gap-1.5">
        {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {salvando ? L.salvando : editando ? L.salvarAlteracoes : L.cadastrar}
      </Button>
    </>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-small font-semibold text-fg">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function CampoPerfil({
  L,
  perfil,
  perfis,
  salvando,
  onChange,
}: {
  L: FuncionarioModalLabels
  perfil: PerfilFuncionarioUi
  perfis: readonly PerfilFuncionarioUi[]
  salvando: boolean
  onChange: (perfil: PerfilFuncionarioUi) => void
}) {
  return (
    <Field id="func-perfil" label={L.perfil} required>
      <Select value={perfil} onChange={(ev) => onChange(ev.target.value as PerfilFuncionarioUi)} disabled={salvando}>
        {perfis.includes('OPERADOR') ? <option value="OPERADOR">{L.perfilOperador}</option> : null}
        {perfis.includes('GERENTE') ? <option value="GERENTE">{L.perfilGerente}</option> : null}
      </Select>
    </Field>
  )
}

function CampoIdioma({
  L,
  idioma,
  editando,
  salvando,
  onChange,
}: {
  L: FuncionarioModalLabels
  idioma: 'pt' | 'zh'
  editando: boolean
  salvando: boolean
  onChange: (idioma: 'pt' | 'zh') => void
}) {
  return (
    <Field id="func-idioma" label={L.idioma} hint={editando ? L.idiomaHintEditar : L.idiomaHintCriar}>
      <Select value={idioma} onChange={(ev) => onChange(ev.target.value as 'pt' | 'zh')} disabled={salvando}>
        <option value="pt">{L.idiomaPt}</option>
        <option value="zh">{L.idiomaZh}</option>
      </Select>
    </Field>
  )
}

function CampoSenha({
  L,
  senha,
  obrigatoria,
  salvando,
  onChange,
}: {
  L: FuncionarioModalLabels
  senha: string
  obrigatoria: boolean
  salvando: boolean
  onChange: (senha: string) => void
}) {
  const curta = senha.length > 0 && senha.length < PASSWORD_MIN_LENGTH
  const minimo = L.senhaHint.replace('{n}', String(PASSWORD_MIN_LENGTH))
  const hint = !senha || curta ? minimo : L.senhaAceita
  return (
    <Field id="func-senha" label={obrigatoria ? L.senha : L.senhaNovaOpcional} required={obrigatoria} hint={hint}>
      <Input
        type="password"
        value={senha}
        onChange={(ev) => onChange(ev.target.value)}
        required={obrigatoria}
        minLength={obrigatoria || senha ? PASSWORD_MIN_LENGTH : undefined}
        autoComplete="new-password"
        disabled={salvando}
      />
    </Field>
  )
}

function RedefinirSenha({
  L,
  aberto,
  onAbrir,
  funcionario,
  onSalvo,
}: {
  L: FuncionarioModalLabels
  aberto: boolean
  onAbrir: () => void
  funcionario: FuncionarioListRow
  onSalvo: (row: FuncionarioListRow) => void
}) {
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!aberto) {
    return (
      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
        <Button type="button" variant="secondary" onClick={onAbrir}>{L.redefinirSenha}</Button>
      </div>
    )
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const r = await atualizarFuncionarioAction({
        id: funcionario.id,
        nome: funcionario.nome,
        perfil: funcionario.perfil === 'GERENTE' ? 'GERENTE' : 'OPERADOR',
        idioma_preferido: funcionario.idioma_preferido === 'zh' ? 'zh' : 'pt',
        senhaNova: senha.trim(),
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      onSalvo(r.data)
      setSenha('')
    } finally {
      setSalvando(false)
    }
  }
  return (
    <form onSubmit={salvar} className="mt-3 flex flex-col gap-3 border-t border-[var(--color-border)] pt-3" data-testid="funcionario-redefinir-senha">
      <CampoSenha L={L} senha={senha} obrigatoria salvando={salvando} onChange={setSenha} />
      <Button type="submit" variant="secondary" disabled={salvando}>{salvando ? L.salvando : L.redefinirSenhaSalvar}</Button>
    </form>
  )
}
