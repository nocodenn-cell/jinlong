'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '@/lib/auth/passwordPolicy'
import { ROUTES } from '@/lib/navigation/routes'
import {
  isPerfilFuncionarioUi,
  podeAtribuirPerfil,
  podeDesativarAlvo,
  banDurationParaAtivo,
  podeEditarAlvo,
  type PerfilFuncionarioUi,
} from './funcionarioPolicies'
import {
  mascararCpf,
  normalizarDados,
  temAlgumDado,
  type DadosEntrada,
  type DadosErro,
  type FuncionarioDados,
} from './funcionarioDados'
import { derivarPinHash, statusPin, validarPinNovo, type ErroPin, type StatusPin } from '@/lib/pdv/pinOperador'

export type FuncionarioListRow = {
  id: string
  nome: string
  email: string | null
  perfil: string
  idioma_preferido: string
  ativo: boolean
  created_at: string
  /** Dados complementares resumidos para a lista. CPF sempre mascarado aqui. */
  cargo: string | null
  telefone: string | null
  cpf_mascarado: string | null
  data_admissao: string | null
  /** null = recurso de PIN indisponível (migration não aplicada). */
  pin_status?: StatusPin | null
  /** PIN definido pelo gestor: o funcionário deve trocar em "Meu PIN do caixa". */
  pin_trocar?: boolean
}

export type ActionOk<T> = { ok: true; data: T }
export type ActionErr = { ok: false; error: string }
export type ActionResult<T> = ActionOk<T> | ActionErr

const CreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  perfil: z.enum(['OPERADOR', 'GERENTE']),
  idioma_preferido: z.enum(['pt', 'zh']),
  senha: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  pin: z.string().max(8).optional(),
  pinConfirmacao: z.string().max(8).optional(),
})

const PIN_ERRO_MSG: Record<ErroPin, string> = {
  formato: 'O PIN deve ter exatamente 4 dígitos.',
  obvio: 'PIN muito fácil (sequência ou repetição). Escolha outro.',
  confirmacao: 'A confirmação do PIN não confere.',
}

type PinRow = { usuario_id: string; pin_bloqueado_ate: string | null; trocar_no_primeiro_uso: boolean }
type RpcLivre = (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>

/** Status de PIN (sem hash). Tabela ausente ⇒ null (recurso oculto). */
async function carregarPins(admin: AdminClient, ids: string[]): Promise<Map<string, PinRow> | null> {
  if (ids.length === 0) return new Map()
  const { data, error } = await (admin as unknown as {
    from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: PinRow[] | null; error: { code?: string; message?: string } | null }> } }
  })
    .from('usuario_pin')
    .select('usuario_id, pin_bloqueado_ate, trocar_no_primeiro_uso')
    .in('usuario_id', ids)
  if (error) return null
  return new Map((data ?? []).map((r) => [r.usuario_id, r]))
}

function resumoPin(pins: Map<string, PinRow> | null, id: string) {
  if (!pins) return { pin_status: null, pin_trocar: false }
  const p = pins.get(id)
  return { pin_status: statusPin(p), pin_trocar: !!p?.trocar_no_primeiro_uso }
}

async function gravarPinPorGestor(admin: AdminClient, alvoId: string, atorId: string, pin: string): Promise<string | null> {
  const h = derivarPinHash(pin)
  const { error } = await (admin as unknown as { rpc: RpcLivre }).rpc('definir_pin_operador_pdv', {
    p_usuario: alvoId,
    p_hash: h.hash,
    p_salt: h.salt,
    p_iteracoes: h.iteracoes,
    p_ator: atorId,
  })
  if (!error) return null
  if (error.code === '42501') return 'Você não tem permissão para definir o PIN deste funcionário.'
  return 'PIN do caixa indisponível nesta instalação.'
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120),
  perfil: z.enum(['OPERADOR', 'GERENTE']),
  idioma_preferido: z.enum(['pt', 'zh']),
  senhaNova: z.string().max(128).optional(),
})

function fail(error: string): ActionErr {
  return { ok: false, error }
}

const DADOS_ERRO_MSG: Record<DadosErro, string> = {
  cpf: 'CPF inválido. Confira os dígitos.',
  telefone: 'Telefone/WhatsApp inválido. Use DDD + número.',
  cargo: 'Cargo/função muito longo (máx. 80 caracteres).',
  data_admissao: 'Data de admissão inválida.',
  observacoes: 'Observações muito longas (máx. 1000 caracteres).',
}

type AdminClient = ReturnType<typeof createAdminClient>
type DadosRow = FuncionarioDados & { usuario_id: string }

/** Tabela ainda não criada (migration 20261021190000 não aplicada) ⇒ recurso fica oculto, sem quebrar nada. */
function isTabelaAusente(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /funcionario_dados/i.test(err.message ?? '') && /not find|does not exist|schema cache/i.test(err.message ?? '')
}

async function carregarDados(
  admin: AdminClient,
  ids: string[],
): Promise<{ disponivel: boolean; porId: Map<string, DadosRow> }> {
  const porId = new Map<string, DadosRow>()
  if (ids.length === 0) {
    const probe = await admin.from('funcionario_dados').select('usuario_id').limit(1)
    return { disponivel: !isTabelaAusente(probe.error), porId }
  }
  const { data, error } = await admin
    .from('funcionario_dados')
    .select('usuario_id, telefone, cpf, cargo, data_admissao, observacoes')
    .in('usuario_id', ids)
  if (error) {
    if (!isTabelaAusente(error)) console.error('[funcionarios.dados.load]', error.message)
    return { disponivel: !isTabelaAusente(error), porId }
  }
  for (const r of data ?? []) porId.set(r.usuario_id, r)
  return { disponivel: true, porId }
}

async function empresaDaLoja(admin: AdminClient, lojaId: string): Promise<string | null> {
  const { data } = await admin.from('lojas').select('empresa_id').eq('id', lojaId).maybeSingle()
  return (data as { empresa_id?: string | null } | null)?.empresa_id ?? null
}

/** Grava (upsert) os dados complementares. Retorna mensagem de erro amigável ou null. */
async function salvarDados(
  admin: AdminClient,
  usuarioId: string,
  lojaId: string,
  dados: FuncionarioDados,
  existia: boolean,
): Promise<string | null> {
  if (!existia && !temAlgumDado(dados)) return null
  const empresaId = await empresaDaLoja(admin, lojaId)
  if (!empresaId) return 'Loja sem empresa vinculada.'
  const { error } = await admin
    .from('funcionario_dados')
    .upsert({ usuario_id: usuarioId, empresa_id: empresaId, ...dados }, { onConflict: 'usuario_id' })
  if (!error) return null
  if (isTabelaAusente(error)) return 'Dados complementares ainda não estão disponíveis nesta instalação.'
  if (error.code === '23505') return 'Já existe um funcionário com este CPF nesta empresa.'
  return error.message
}

function resumoDados(d: DadosRow | undefined) {
  return {
    cargo: d?.cargo ?? null,
    telefone: d?.telefone ?? null,
    cpf_mascarado: mascararCpf(d?.cpf),
    data_admissao: d?.data_admissao ?? null,
  }
}

function revalidateFuncionarios(): void {
  revalidatePath(ROUTES.admin.funcionarios)
}

async function requireLojaSession() {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  if (!auth.session.lojaId) {
    return { ok: false as const, error: 'Conta sem loja vinculada.' }
  }
  return { ok: true as const, session: auth.session }
}

async function emailPorUsuarioId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) return null
  return data.user?.email ?? null
}

async function mapRow(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    id: string
    nome: string
    perfil: string
    idioma_preferido: string
    ativo: boolean | null
    created_at: string
  },
  dados?: DadosRow,
): Promise<FuncionarioListRow> {
  return {
    id: row.id,
    nome: row.nome,
    email: await emailPorUsuarioId(admin, row.id),
    perfil: row.perfil,
    idioma_preferido: row.idioma_preferido,
    ativo: row.ativo !== false,
    created_at: row.created_at,
    ...resumoDados(dados),
  }
}

export async function listarFuncionariosAction(): Promise<ActionResult<FuncionarioListRow[]>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('usuarios')
      .select('id, nome, perfil, idioma_preferido, ativo, created_at')
      .eq('loja_id', gate.session.lojaId!)
      .order('nome', { ascending: true })
      .limit(100)

    if (error) return fail(error.message)

    const ids = (data ?? []).map((r) => r.id)
    const [{ porId }, pins] = await Promise.all([carregarDados(admin, ids), carregarPins(admin, ids)])
    const rows = await Promise.all(
      (data ?? []).map(async (r) => ({ ...(await mapRow(admin, r, porId.get(r.id))), ...resumoPin(pins, r.id) })),
    )
    return { ok: true, data: rows }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao listar funcionários.')
  }
}

/** Indica se a tabela de dados complementares existe (migration aplicada). */
export async function dadosComplementaresDisponiveisAction(): Promise<boolean> {
  const gate = await requireLojaSession()
  if (!gate.ok) return false
  try {
    return (await carregarDados(createAdminClient(), [])).disponivel
  } catch {
    return false
  }
}

/** Dados completos (CPF sem máscara) para o formulário de edição. Só DONO/GERENTE (gate) da mesma loja. */
export async function obterDadosFuncionarioAction(id: string): Promise<ActionResult<FuncionarioDados | null>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)
  if (!z.string().uuid().safeParse(id).success) return fail('Identificador inválido.')
  try {
    const admin = createAdminClient()
    const { data: alvo } = await admin.from('usuarios').select('id, loja_id').eq('id', id).maybeSingle()
    if (!alvo || alvo.loja_id !== gate.session.lojaId) return fail('Funcionário não encontrado.')
    const { disponivel, porId } = await carregarDados(admin, [id])
    if (!disponivel) return { ok: true, data: null }
    const d = porId.get(id)
    return {
      ok: true,
      data: {
        telefone: d?.telefone ?? null,
        cpf: d?.cpf ?? null,
        cargo: d?.cargo ?? null,
        data_admissao: d?.data_admissao ?? null,
        observacoes: d?.observacoes ?? null,
      },
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao carregar dados.')
  }
}

export async function criarFuncionarioAction(input: {
  nome: string
  email: string
  perfil: PerfilFuncionarioUi
  idioma_preferido: 'pt' | 'zh'
  senha: string
  dados?: DadosEntrada
}): Promise<ActionResult<FuncionarioListRow>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos. Verifique nome, e-mail, perfil e senha.')

  if (!podeAtribuirPerfil(gate.session.perfil, parsed.data.perfil)) {
    return fail('Você não tem permissão para criar este perfil.')
  }

  const senhaCheck = validateNewPassword(parsed.data.senha, parsed.data.senha)
  if (!senhaCheck.ok) return fail(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)

  const dadosNorm = normalizarDados(input.dados)
  if (!dadosNorm.ok) return fail(DADOS_ERRO_MSG[dadosNorm.campo])

  const pinInicial = (parsed.data.pin ?? '').trim()
  if (pinInicial) {
    const erroPin = validarPinNovo(pinInicial, (parsed.data.pinConfirmacao ?? '').trim())
    if (erroPin) return fail(PIN_ERRO_MSG[erroPin])
  }

  let createdUserId: string | null = null
  try {
    const admin = createAdminClient()
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.senha,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.nome },
    })

    if (authErr || !created.user) {
      const msg = authErr?.message ?? 'Falha ao criar usuário no Auth.'
      if (/already|registered|exists|duplicate/i.test(msg)) {
        return fail('Já existe uma conta com este e-mail.')
      }
      return fail(msg)
    }

    createdUserId = created.user.id
    const { error: dbErr } = await admin.from('usuarios').insert({
      id: created.user.id,
      nome: parsed.data.nome,
      perfil: parsed.data.perfil,
      idioma_preferido: parsed.data.idioma_preferido,
      loja_id: gate.session.lojaId!,
      ativo: true,
    })

    if (dbErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      createdUserId = null
      return fail(dbErr.message)
    }

    // Multiempresa (§11): grava o vínculo validando, no servidor, que o ATOR pode a loja.
    // Função ausente (migration fase 2 ainda não aplicada) ⇒ segue como antes (o trigger legado cobre).
    const { error: vincErr } = await (
      admin as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>
      }
    ).rpc('vincular_usuario_loja', {
      p_usuario: created.user.id,
      p_loja: gate.session.lojaId!,
      p_papel: parsed.data.perfil,
      p_ator: gate.session.userId,
    })
    if (vincErr && !isFuncaoAusente(vincErr)) {
      await admin.from('usuarios').delete().eq('id', created.user.id)
      await admin.auth.admin.deleteUser(created.user.id)
      createdUserId = null
      return fail('Não foi possível vincular o funcionário a esta loja.')
    }

    // Dados complementares são opcionais: falha aqui não desfaz a conta (login já funciona),
    // mas é reportada para o gestor corrigir na edição.
    let avisoDados: string | null = null
    if (temAlgumDado(dadosNorm.data)) {
      avisoDados = await salvarDados(admin, created.user.id, gate.session.lojaId!, dadosNorm.data, false)
    }

    // PIN inicial opcional: falha não desfaz a conta; o gestor define depois pela lista.
    let avisoPin: string | null = null
    if (pinInicial) avisoPin = await gravarPinPorGestor(admin, created.user.id, gate.session.userId, pinInicial)

    revalidateFuncionarios()
    if (avisoDados) return fail(`Funcionário criado, mas os dados complementares não foram salvos: ${avisoDados}`)
    if (avisoPin) return fail(`Funcionário criado, mas o PIN não foi salvo: ${avisoPin}`)
    const row = await mapRow(admin, {
      id: created.user.id,
      nome: parsed.data.nome,
      perfil: parsed.data.perfil,
      idioma_preferido: parsed.data.idioma_preferido,
      ativo: true,
      created_at: new Date().toISOString(),
    }, { usuario_id: created.user.id, ...dadosNorm.data })
    return {
      ok: true,
      data: { ...row, pin_status: pinInicial ? 'ativo' : 'sem', pin_trocar: !!pinInicial },
    }
  } catch (e) {
    if (createdUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(createdUserId)
      } catch {
        // best-effort cleanup
      }
    }
    return fail(e instanceof Error ? e.message : 'Erro ao criar funcionário.')
  }
}

export async function atualizarFuncionarioAction(input: {
  id: string
  nome: string
  perfil: PerfilFuncionarioUi
  idioma_preferido: 'pt' | 'zh'
  senhaNova?: string
  /** Ausente = não mexe nos dados complementares (compatível com chamadas antigas). */
  dados?: DadosEntrada
}): Promise<ActionResult<FuncionarioListRow>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  const parsed = UpdateSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos.')

  const dadosNorm = input.dados ? normalizarDados(input.dados) : null
  if (dadosNorm && !dadosNorm.ok) return fail(DADOS_ERRO_MSG[dadosNorm.campo])

  try {
    const admin = createAdminClient()
    const { data: alvo, error: loadErr } = await admin
      .from('usuarios')
      .select('id, nome, perfil, idioma_preferido, ativo, created_at, loja_id')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (loadErr || !alvo) return fail('Funcionário não encontrado.')
    if (alvo.loja_id !== gate.session.lojaId) return fail('Funcionário de outra loja.')

    const ator = { id: gate.session.userId, perfil: gate.session.perfil }
    if (!podeEditarAlvo(ator, { id: alvo.id, perfil: alvo.perfil })) {
      return fail('Você não tem permissão para editar este funcionário.')
    }

    if (!podeAtribuirPerfil(gate.session.perfil, parsed.data.perfil)) {
      return fail('Você não tem permissão para atribuir este perfil.')
    }
    if (!isPerfilFuncionarioUi(parsed.data.perfil)) {
      return fail('Perfil inválido.')
    }

    const { error: updErr } = await admin
      .from('usuarios')
      .update({
        nome: parsed.data.nome,
        perfil: parsed.data.perfil,
        idioma_preferido: parsed.data.idioma_preferido,
      })
      .eq('id', parsed.data.id)
      .eq('loja_id', gate.session.lojaId!)

    if (updErr) return fail(updErr.message)

    const atual = (await carregarDados(admin, [alvo.id])).porId.get(alvo.id)
    let dadosFinais: DadosRow | undefined = atual
    if (dadosNorm?.ok) {
      const erroDados = await salvarDados(admin, alvo.id, gate.session.lojaId!, dadosNorm.data, !!atual)
      if (erroDados) return fail(erroDados)
      dadosFinais = { usuario_id: alvo.id, ...dadosNorm.data }
    }

    const senhaNova = parsed.data.senhaNova?.trim()
    if (senhaNova) {
      const check = validateNewPassword(senhaNova, senhaNova)
      if (!check.ok) {
        return fail(`A nova senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
      }
      const { error: pwdErr } = await admin.auth.admin.updateUserById(parsed.data.id, {
        password: senhaNova,
      })
      if (pwdErr) return fail(pwdErr.message)
    }

    const { error: metaErr } = await admin.auth.admin.updateUserById(parsed.data.id, {
      user_metadata: { full_name: parsed.data.nome },
    })
    if (metaErr) {
      // nome em usuarios já gravado — não falha a ação
      console.error('[funcionarios.update.meta]', metaErr.message)
    }

    revalidateFuncionarios()
    return {
      ok: true,
      data: await mapRow(admin, {
        id: alvo.id,
        nome: parsed.data.nome,
        perfil: parsed.data.perfil,
        idioma_preferido: parsed.data.idioma_preferido,
        ativo: alvo.ativo,
        created_at: alvo.created_at,
      }, dadosFinais),
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao atualizar funcionário.')
  }
}

export async function verificarEmailDisponiveAction(email: string): Promise<ActionResult<boolean>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  if (!z.string().email().safeParse(email.trim()).success) {
    return fail('Email inválido.')
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers()
    const exists = data.users.some((u) => u.email === email.toLowerCase().trim())
    return { ok: true, data: !exists }
  } catch {
    return { ok: true, data: true }
  }
}

export async function definirAtivoFuncionarioAction(
  id: string,
  ativo: boolean,
): Promise<ActionResult<{ id: string; ativo: boolean }>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)
  if (!z.string().uuid().safeParse(id).success) return fail('Identificador inválido.')

  try {
    const admin = createAdminClient()
    const { data: alvo, error: loadErr } = await admin
      .from('usuarios')
      .select('id, perfil, loja_id, ativo')
      .eq('id', id)
      .maybeSingle()

    if (loadErr || !alvo) return fail('Funcionário não encontrado.')
    if (alvo.loja_id !== gate.session.lojaId) return fail('Funcionário de outra loja.')

    const ator = { id: gate.session.userId, perfil: gate.session.perfil }
    if (!podeDesativarAlvo(ator, { id: alvo.id, perfil: alvo.perfil })) {
      return fail(
        ativo
          ? 'Você não tem permissão para reativar este funcionário.'
          : 'Você não pode desativar esta conta.',
      )
    }

    const { error } = await admin
      .from('usuarios')
      .update({ ativo })
      .eq('id', id)
      .eq('loja_id', gate.session.lojaId!)

    if (error) return fail(error.message)

    // 20261028 (decisão do dono, item 3): inativar também bloqueia o login/refresh no Auth; reativar desbloqueia.
    // O banco já nega tudo ao inativo (RLS + revogação de tokens); isto corta a sessão na origem.
    const { error: banErr } = await admin.auth.admin.updateUserById(id, { ban_duration: banDurationParaAtivo(ativo) })
    if (banErr) {
      // Sem o Auth alinhado, o login continuaria bloqueado (ou liberado) após a mudança: desfaz o status
      // no banco para o funcionário seguir no estado anterior e a ação poder ser repetida.
      console.error('[funcionarios] ban/unban no Auth falhou', banErr.message)
      await admin.from('usuarios').update({ ativo: alvo.ativo }).eq('id', id).eq('loja_id', gate.session.lojaId!)
      return fail('Não foi possível atualizar o acesso no Auth. Tente novamente. / 无法更新登录权限，请重试。')
    }

    revalidateFuncionarios()
    return { ok: true, data: { id, ativo } }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao alterar status.')
  }
}

function isFuncaoAusente(err: { code?: string; message?: string }): boolean {
  return err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(err.message ?? '')
}

/** Alvo da mesma loja que o ator pode editar (mesma regra da tela). */
async function alvoGerenciavel(admin: AdminClient, id: string, ator: { id: string; perfil: string }, lojaId: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const { data } = await admin.from('usuarios').select('id, perfil, loja_id').eq('id', id).maybeSingle()
  if (!data || data.loja_id !== lojaId) return null
  if (data.id === ator.id || !podeEditarAlvo(ator, data)) return null
  return data
}

export async function definirPinFuncionarioAction(
  id: string,
  pin: string,
  confirmacao: string,
): Promise<ActionResult<{ pin_status: StatusPin; pin_trocar: boolean }>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)
  const p = String(pin ?? '').trim()
  const erroPin = validarPinNovo(p, String(confirmacao ?? '').trim())
  if (erroPin) return fail(PIN_ERRO_MSG[erroPin])
  try {
    const admin = createAdminClient()
    const ator = { id: gate.session.userId, perfil: gate.session.perfil }
    if (!(await alvoGerenciavel(admin, id, ator, gate.session.lojaId!))) {
      return fail('Você não tem permissão para definir o PIN deste funcionário.')
    }
    const erro = await gravarPinPorGestor(admin, id, ator.id, p)
    if (erro) return fail(erro)
    revalidateFuncionarios()
    return { ok: true, data: { pin_status: 'ativo', pin_trocar: true } }
  } catch {
    return fail('Erro ao definir o PIN.')
  }
}

export async function desbloquearPinFuncionarioAction(id: string): Promise<ActionResult<{ pin_status: StatusPin }>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)
  try {
    const admin = createAdminClient()
    const ator = { id: gate.session.userId, perfil: gate.session.perfil }
    if (!(await alvoGerenciavel(admin, id, ator, gate.session.lojaId!))) {
      return fail('Você não tem permissão para desbloquear este funcionário.')
    }
    const { error } = await (admin as unknown as { rpc: RpcLivre }).rpc('desbloquear_pin_operador_pdv', {
      p_usuario: id,
      p_ator: ator.id,
    })
    if (error) {
      if (error.code === '42501') return fail('Você não tem permissão para desbloquear este funcionário.')
      if (error.code === 'P0002') return fail('Este funcionário ainda não tem PIN.')
      return fail('PIN do caixa indisponível nesta instalação.')
    }
    revalidateFuncionarios()
    return { ok: true, data: { pin_status: 'ativo' } }
  } catch {
    return fail('Erro ao desbloquear o PIN.')
  }
}
