'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { Field, Input, Select, Textarea } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import { validarPinNovo, type ErroPin } from '@/lib/pdv/pinRegras'
import {
  atualizarFuncionarioAction,
  criarFuncionarioAction,
  obterDadosFuncionarioAction,
  verificarEmailDisponiveAction,
  type FuncionarioListRow,
} from './actions'
import { cpfValido, formatarCpf, formatarTelefone, somenteDigitos } from './funcionarioDados'
import {
  perfisAtribuiveisPorAtor,
  type PerfilFuncionarioUi,
} from './funcionarioPolicies'

function validarSenha(senha: string): { ok: boolean; mensagem: string } {
  if (!senha) return { ok: false, mensagem: '' }
  if (senha.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, mensagem: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres` }
  }
  return { ok: true, mensagem: 'Senha aceita' }
}

export type FuncionarioModalLabels = {
  novo: string
  editar: string
  nome: string
  email: string
  emailHint: string
  emailHintNovo: string
  perfil: string
  idioma: string
  senha: string
  senhaNovaOpcional: string
  senhaHint: string
  pin: string
  pinHint: string
  pinConfirmar: string
  pinErros: Record<ErroPin, string>
  salvar: string
  salvando: string
  cancelar: string
  perfilOperador: string
  perfilGerente: string
  idiomaPt: string
  idiomaZh: string
  secaoDados: string
  secaoDadosSub: string
  telefone: string
  telefonePlaceholder: string
  cpf: string
  cpfHint: string
  cpfInvalido: string
  cargo: string
  cargoPlaceholder: string
  admissao: string
  observacoes: string
}

type Props = {
  labels: FuncionarioModalLabels
  atorPerfil: string
  funcionario: FuncionarioListRow | null
  onClose: () => void
  onSalvo: (row: FuncionarioListRow) => void
  /** false enquanto a migration de dados complementares não estiver aplicada. */
  dadosDisponiveis?: boolean
}

export function FuncionarioEditarModal({
  labels: L,
  atorPerfil,
  funcionario,
  onClose,
  onSalvo,
  dadosDisponiveis = false,
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
  const [pin, setPin] = useState('')
  const [pinConf, setPinConf] = useState('')
  const [senhaValidacao, setSenhaValidacao] = useState(validarSenha(''))
  const [emailValidacao, setEmailValidacao] = useState<{ validando: boolean; erro: string | null }>({
    validando: false,
    erro: null,
  })
  const [salvando, setSalvando] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [cargo, setCargo] = useState('')
  const [admissao, setAdmissao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [carregandoDados, setCarregandoDados] = useState(editando && dadosDisponiveis)
  const cpfDigitos = somenteDigitos(cpf)
  const cpfErro = cpfDigitos.length > 0 && (cpfDigitos.length === 11 ? !cpfValido(cpfDigitos) : false)
  const cpfIncompleto = cpfDigitos.length > 0 && cpfDigitos.length < 11

  useEffect(() => {
    if (!editando || !funcionario || !dadosDisponiveis) return
    let vivo = true
    void obterDadosFuncionarioAction(funcionario.id).then((r) => {
      if (!vivo) return
      if (r.ok && r.data) {
        setTelefone(formatarTelefone(r.data.telefone))
        setCpf(r.data.cpf ? formatarCpf(r.data.cpf) : '')
        setCargo(r.data.cargo ?? '')
        setAdmissao(r.data.data_admissao ?? '')
        setObservacoes(r.data.observacoes ?? '')
      }
      setCarregandoDados(false)
    })
    return () => {
      vivo = false
    }
  }, [editando, funcionario, dadosDisponiveis])

  const dados = dadosDisponiveis
    ? { telefone, cpf, cargo, data_admissao: admissao, observacoes }
    : undefined

  useEffect(() => {
    const t = setTimeout(() => nomeRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  async function verificarEmailDisponivel() {
    if (editando || !email.trim()) {
      setEmailValidacao({ validando: false, erro: null })
      return
    }
    setEmailValidacao({ validando: true, erro: null })
    const r = await verificarEmailDisponiveAction(email.trim())
    if (!r.ok || r.data) {
      setEmailValidacao({ validando: false, erro: null })
    } else {
      setEmailValidacao({
        validando: false,
        erro: 'Já existe uma conta com este e-mail.',
      })
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (dadosDisponiveis && (cpfErro || cpfIncompleto)) {
      emitGerenteToast({ kind: 'error', message: L.cpfInvalido })
      return
    }

    // Validar email se houver erro pendente de validação
    if (!editando && emailValidacao.erro) {
      emitGerenteToast({
        kind: 'error',
        message: emailValidacao.erro,
      })
      return
    }

    // Validar email se não foi validado ainda
    if (!editando && !emailValidacao.erro && email.trim()) {
      const r = await verificarEmailDisponiveAction(email.trim())
      if (!r.ok || !r.data) {
        setEmailValidacao({
          validando: false,
          erro: 'Já existe uma conta com este e-mail.',
        })
        emitGerenteToast({
          kind: 'error',
          message: 'Já existe uma conta com este e-mail.',
        })
        return
      }
    }

    setSalvando(true)
    try {
      if (editando && funcionario) {
        const r = await atualizarFuncionarioAction({
          id: funcionario.id,
          nome: nome.trim(),
          perfil,
          idioma_preferido: idioma,
          senhaNova: senha.trim() || undefined,
          dados: carregandoDados ? undefined : dados,
        })
        if (!r.ok) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        onSalvo(r.data)
        onClose()
        return
      }

      if (pin) {
        const erroPin = validarPinNovo(pin, pinConf)
        if (erroPin) {
          emitGerenteToast({ kind: 'error', message: L.pinErros[erroPin] })
          return
        }
      }
      const r = await criarFuncionarioAction({
        nome: nome.trim(),
        email: email.trim(),
        perfil,
        idioma_preferido: idioma,
        senha,
        dados,
        ...(pin ? { pin, pinConfirmacao: pinConf } : {}),
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return // Modal fica aberto para correção do erro
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
          <Button type="submit" form="funcionario-form" variant="primary" disabled={salvando} className="gap-1.5">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
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

        <div className="space-y-1.5">
          <Field
            id="func-email"
            label={L.email}
            required={!editando}
            hint={
              editando
                ? L.emailHint
                : L.emailHintNovo
            }
          >
            <Input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              onBlur={verificarEmailDisponivel}
              required={!editando}
              disabled={editando || salvando || emailValidacao.validando}
              readOnly={editando}
              autoComplete="off"
              aria-describedby={emailValidacao.erro ? 'func-email-error' : undefined}
            />
          </Field>
          {emailValidacao.erro && (
            <p id="func-email-error" className="text-caption text-[var(--color-danger-strong)]">
              {emailValidacao.erro}
            </p>
          )}
        </div>

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
          hint={
            senha
              ? senhaValidacao.mensagem
              : L.senhaHint.replace('{n}', String(PASSWORD_MIN_LENGTH))
          }
        >
          <Input
            type="password"
            value={senha}
            onChange={(ev) => {
              setSenha(ev.target.value)
              setSenhaValidacao(validarSenha(ev.target.value))
            }}
            required={!editando}
            minLength={editando && !senha ? undefined : PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            disabled={salvando}
          />
        </Field>

        {!editando ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="funcionario-pin-inicial">
            <Field id="func-pin" label={L.pin} hint={pin && validarPinNovo(pin, pin) ? L.pinErros[validarPinNovo(pin, pin)!] : L.pinHint}>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(ev) => setPin(ev.target.value.replace(/\D/g, '').slice(0, 4))}
                autoComplete="off"
                disabled={salvando}
                data-testid="funcionario-pin"
              />
            </Field>
            <Field id="func-pin-conf" label={L.pinConfirmar}>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConf}
                onChange={(ev) => setPinConf(ev.target.value.replace(/\D/g, '').slice(0, 4))}
                autoComplete="off"
                disabled={salvando || !pin}
                required={!!pin}
                data-testid="funcionario-pin-confirmar"
              />
            </Field>
          </div>
        ) : null}

        {dadosDisponiveis ? (
          <fieldset
            className="flex flex-col gap-3 border-t border-[var(--color-border-secondary)] pt-4"
            data-testid="funcionario-dados-complementares"
            disabled={salvando || carregandoDados}
          >
            <legend className="sr-only">{L.secaoDados}</legend>
            <div aria-hidden>
              <p className="text-small font-semibold text-fg">{L.secaoDados}</p>
              <p className="text-caption text-fg-subtle">{L.secaoDadosSub}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="func-telefone" label={L.telefone}>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={telefone}
                  onChange={(ev) => setTelefone(ev.target.value)}
                  onBlur={() => setTelefone((t) => formatarTelefone(t.trim()) || t)}
                  placeholder={L.telefonePlaceholder}
                  autoComplete="off"
                  maxLength={20}
                />
              </Field>
              <Field
                id="func-cpf"
                label={L.cpf}
                hint={cpfErro || cpfIncompleto ? undefined : L.cpfHint}
                error={cpfErro ? L.cpfInvalido : undefined}
              >
                <Input
                  inputMode="numeric"
                  value={cpf}
                  onChange={(ev) => setCpf(formatarCpf(ev.target.value))}
                  placeholder="000.000.000-00"
                  autoComplete="off"
                  maxLength={14}
                  aria-invalid={cpfErro || undefined}
                />
              </Field>
              <Field id="func-cargo" label={L.cargo}>
                <Input
                  value={cargo}
                  onChange={(ev) => setCargo(ev.target.value)}
                  placeholder={L.cargoPlaceholder}
                  maxLength={80}
                  autoComplete="organization-title"
                />
              </Field>
              <Field id="func-admissao" label={L.admissao}>
                <Input type="date" value={admissao} onChange={(ev) => setAdmissao(ev.target.value)} />
              </Field>
            </div>
            <Field id="func-observacoes" label={L.observacoes}>
              <Textarea
                value={observacoes}
                onChange={(ev) => setObservacoes(ev.target.value)}
                rows={2}
                maxLength={1000}
              />
            </Field>
          </fieldset>
        ) : null}
      </form>
    </DragonModal>
  )
}
