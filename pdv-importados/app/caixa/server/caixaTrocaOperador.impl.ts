import { timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLojaIdUsuario } from '@/lib/auth/lojaUsuario'
import { derivarPinHash } from '@/lib/pdv/pinOperador'
import { BLOQUEIO_PADRAO_MIN, erroTroca, parseTrocaContexto, type TrocaContexto, type TrocaErro } from '@/app/caixa/caixaTrocaOperadorRegras'

/**
 * Troca Segura de Operador (migration 20261023200000). Identidade = sempre a sessão Supabase do servidor;
 * o PIN só desbloqueia o MESMO operador (conferido aqui, nunca no cliente).
 */

// RPCs novas ainda fora do database.types gerado.
type RpcLivre = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>

type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; erro: TrocaErro }

async function sessao() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user, call: supabase.rpc.bind(supabase) as unknown as RpcLivre }
}

/** Flags do PIN da loja (mesma regra da Edge sync-outbox: loja, depois padrão da empresa). */
async function pinDaLoja(lojaId: string | null, usuarioId: string) {
  if (!lojaId) return { ativo: false, minutos: BLOQUEIO_PADRAO_MIN }
  try {
    const admin = createAdminClient()
    const cols = 'exigir_pin_operador, bloqueio_inatividade_min'
    let { data } = await admin.from('pdv_config').select(cols).eq('loja_id', lojaId).maybeSingle()
    if (!data) {
      const { data: loja } = await admin.from('lojas').select('empresa_id').eq('id', lojaId).maybeSingle()
      const empresaId = (loja as { empresa_id?: string | null } | null)?.empresa_id
      if (empresaId) {
        const r = await admin.from('pdv_config').select(cols).is('loja_id', null).eq('empresa_id', empresaId).maybeSingle()
        data = r.data
      }
    }
    const cfg = (data ?? {}) as { exigir_pin_operador?: boolean; bloqueio_inatividade_min?: number }
    const minutos = Number(cfg.bloqueio_inatividade_min) > 0 ? Number(cfg.bloqueio_inatividade_min) : BLOQUEIO_PADRAO_MIN
    if (cfg.exigir_pin_operador !== true) return { ativo: false, minutos }
    const { data: pin } = await admin.from('usuario_pin').select('usuario_id').eq('usuario_id', usuarioId).maybeSingle()
    return { ativo: !!pin, minutos }
  } catch {
    return { ativo: false, minutos: BLOQUEIO_PADRAO_MIN }
  }
}

export async function obterContextoTrocaImpl(): Promise<Resultado<TrocaContexto>> {
  const { supabase, user, call } = await sessao()
  if (!user) return { ok: false, erro: 'sessao' }
  const { data, error } = await call('pdv_troca_contexto')
  // Banco sem a migration: a troca simplesmente não aparece (PDV idêntico ao de hoje).
  if (error) return { ok: false, erro: 'indisponivel' }
  const lojaId = await getLojaIdUsuario(supabase, user.id)
  return { ok: true, data: parseTrocaContexto(data, await pinDaLoja(lojaId, user.id)) }
}

async function chamar(fn: string, args?: Record<string, unknown>): Promise<Resultado> {
  const { user, call } = await sessao()
  if (!user) return { ok: false, erro: 'sessao' }
  const { error } = await call(fn, args)
  if (error) return { ok: false, erro: erroTroca(error.message) }
  revalidatePath('/caixa')
  revalidatePath('/gerente/caixas')
  return { ok: true, data: undefined }
}

export async function liberarCaixaOperadorImpl(caixaId: string): Promise<Resultado> {
  return chamar('liberar_caixa_operador', { p_caixa_id: caixaId })
}

export async function assumirCaixaOperadorImpl(caixaId: string): Promise<Resultado> {
  return chamar('assumir_caixa_operador', { p_caixa_id: caixaId })
}

export async function bloquearCaixaOperadorImpl(motivo: 'INATIVIDADE' | 'MANUAL'): Promise<Resultado> {
  return chamar('bloquear_caixa_operador', { p_motivo: motivo })
}

/**
 * Desbloqueio pelo PIN do usuário DA SESSÃO. Contador 5/10 no banco (pdv_pin_registrar_tentativa), evento de
 * auditoria e desbloqueio via service_role — o cliente nunca escolhe de quem é o PIN.
 */
export async function desbloquearCaixaComPinImpl(pin: string): Promise<Resultado> {
  const valor = String(pin ?? '').trim()
  if (!/^[0-9]{4}$/.test(valor)) return { ok: false, erro: 'pin_invalido' }
  const { supabase, user } = await sessao()
  if (!user) return { ok: false, erro: 'sessao' }
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, erro: 'indisponivel' }
  }
  const adminRpc = admin.rpc.bind(admin) as unknown as RpcLivre
  const { data: linha } = await admin
    .from('usuario_pin')
    .select('pin_hash, pin_salt, pin_iteracoes, pin_bloqueado_ate')
    .eq('usuario_id', user.id)
    .maybeSingle()
  const p = linha as { pin_hash: string; pin_salt: string; pin_iteracoes: number; pin_bloqueado_ate: string | null } | null
  if (!p) return { ok: false, erro: 'sem_pin' }
  const lojaId = await getLojaIdUsuario(supabase, user.id)
  const evento = async (tipo: 'PIN_ERRADO' | 'BLOQUEADO') => {
    if (!lojaId) return
    await admin.from('pdv_operador_eventos').insert({
      id: crypto.randomUUID(), loja_id: lojaId, usuario_id: user.id, tipo, origem: 'online', detalhe: { desbloqueio_caixa: true },
    } as never)
  }
  if (p.pin_bloqueado_ate && (p.pin_bloqueado_ate === 'infinity' || Date.parse(p.pin_bloqueado_ate) > Date.now())) {
    await evento('BLOQUEADO')
    return { ok: false, erro: p.pin_bloqueado_ate === 'infinity' ? 'pin_bloqueado_gerente' : 'pin_bloqueado' }
  }
  const calc = derivarPinHash(valor, p.pin_salt, p.pin_iteracoes).hash
  const ok = calc.length === p.pin_hash.length && timingSafeEqual(Buffer.from(calc), Buffer.from(p.pin_hash))
  const { data: est } = await adminRpc('pdv_pin_registrar_tentativa', { p_usuario: user.id, p_ok: ok })
  if (!ok) {
    await evento('PIN_ERRADO')
    const r = (Array.isArray(est) ? est[0] : est) as { bloqueado_ate?: string | null } | null
    const ate = r?.bloqueado_ate ?? null
    if (ate === 'infinity') return { ok: false, erro: 'pin_bloqueado_gerente' }
    if (ate && Date.parse(ate) > Date.now()) return { ok: false, erro: 'pin_bloqueado' }
    return { ok: false, erro: 'pin_incorreto' }
  }
  const { error } = await adminRpc('desbloquear_caixa_operador', { p_usuario: user.id })
  if (error) return { ok: false, erro: 'indisponivel' }
  revalidatePath('/caixa')
  return { ok: true, data: undefined }
}
