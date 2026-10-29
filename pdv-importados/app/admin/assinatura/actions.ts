'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { empresaContextoId } from '@/lib/multiempresa/empresaContexto'
import { ROUTES } from '@/lib/navigation/routes'
import { calcularValorMensal, PLANOS_FALLBACK, type PlanoCatalogo } from '@/lib/cobranca/planos'
import { dataVencimento, formaParaAsaas, getAsaas } from '@/lib/cobranca/asaas'
import { autoatendimentoAtivo } from '@/lib/cobranca/autoatendimento'

type R<T> = { ok: true; data: T } | { ok: false; error: string }
type Rpc = { rpc: (fn: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }
type Assin = { status: string; trial_fim: string | null; asaas_customer_id: string | null; asaas_subscription_id: string | null; proximo_vencimento: string | null }
type Estado = { empresa: { nome: string; cnpj: string | null } | null; lojas_ativas: number; assinatura: Assin | null }

async function estadoEmpresa(admin: unknown, empresaId: string): Promise<Estado | null> {
  const { data, error } = await (admin as Rpc).rpc('cobranca_estado_empresa', { p_empresa: empresaId })
  return error ? null : (data as Estado)
}

export type Fatura = {
  id: string; pago_em?: string | null; asaas_payment_id: string; valor_centavos: number; vencimento: string | null; status: string
  link_pagamento: string | null; boleto_url: string | null
}
export type MinhaAssinatura = {
  empresa_id: string; legado: boolean; plano: string | null; addons: string[]; status: string | null
  motivo_status: string | null; trial_fim: string | null; proximo_vencimento: string | null
  qtd_lojas: number | null; qtd_caixas: number | null; forma_pagamento: string | null
  valor_mensal_centavos: number | null; acesso_ate: string | null; recursos: string[] | null; proxima_fatura: Fatura | null
  suspensao_prevista_em: string | null; aviso_vencimento: boolean | null; lojas_ativas: number | null
}

async function catalogo(): Promise<PlanoCatalogo[]> {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as Rpc).rpc('planos_catalogo')
  if (error || !Array.isArray(data) || data.length === 0) return PLANOS_FALLBACK
  return data as PlanoCatalogo[]
}

async function gateDono() {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  if (auth.session.perfil !== 'DONO' && auth.session.perfil !== 'ADMIN') {
    return { ok: false as const, error: 'Somente o DONO gerencia a assinatura. / 仅老板可管理订阅。' }
  }
  const supabase = await createClient()
  const empresaId = await empresaContextoId(supabase)
  if (!empresaId) return { ok: false as const, error: 'Empresa não identificada. / 无法识别公司。' }
  const { data: u } = await supabase.auth.getUser()
  return { ok: true as const, session: auth.session, email: u.user?.email ?? '', empresaId, supabase }
}

export async function carregarAssinaturaAction(): Promise<R<{ assinatura: MinhaAssinatura | null; planos: PlanoCatalogo[]; faturas: Fatura[]; podeGerenciar: boolean; autoatendimento: boolean }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as Rpc).rpc('fp_minha_assinatura')
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    data: {
      assinatura: (data ?? null) as MinhaAssinatura | null,
      planos: await catalogo(),
      faturas: await (async () => {
        const { data: fs } = await (supabase as unknown as Rpc).rpc('fp_minhas_faturas', { p_limite: 24 })
        return Array.isArray(fs) ? (fs as Fatura[]) : []
      })(),
      podeGerenciar: auth.session.perfil === 'DONO' || auth.session.perfil === 'ADMIN',
      autoatendimento: autoatendimentoAtivo(),
    },
  }
}

const SolicitarSchema = z.object({
  plano: z.enum(['BASICO', 'ATACADO', 'REDE']),
  mensagem: z.string().trim().max(500).optional(),
})

/** Pedido de contratação: cai na Central de Conversão do hub. Não cria cobrança nem altera a assinatura. */
export async function solicitarContratacaoAction(input: z.input<typeof SolicitarSchema>): Promise<R<null>> {
  const g = await gateDono()
  if (!g.ok) return { ok: false, error: g.error }
  const p = SolicitarSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Dados do pedido inválidos. / 申请信息无效。' }
  // sessão do próprio DONO: a RPC confere o vínculo DONO da empresa do contexto
  const { error } = await (g.supabase as unknown as Rpc).rpc('commercial_solicitar_contratacao', {
    p_plano: p.data.plano, p_mensagem: p.data.mensagem || null,
  })
  if (error) {
    console.error('[cobranca] solicitar contratação', error.message)
    return { ok: false, error: 'Não foi possível enviar o pedido agora. Tente de novo. / 暂时无法提交，请重试。' }
  }
  return { ok: true, data: null }
}

const AssinarSchema = z.object({
  plano: z.enum(['BASICO', 'ATACADO', 'REDE']),
  addons: z.array(z.enum(['FISCAL'])).max(1).default([]),
  qtdLojas: z.number().int().min(1).max(200),
  qtdCaixas: z.number().int().min(1).max(1000),
  forma: z.enum(['PIX', 'BOLETO', 'CARTAO']),
})

/** Assina (1ª vez, inclusive fim do trial) ou troca de plano. Cobrança recorrente mensal no Asaas. */
export async function assinarPlanoAction(input: z.input<typeof AssinarSchema>): Promise<R<{ valorCentavos: number; proximoVencimento: string }>> {
  const g = await gateDono()
  if (!g.ok) return { ok: false, error: g.error }
  // GROWTH-001: contratação passa pelo comercial; sem a flag, nada é criado no Asaas
  if (!autoatendimentoAtivo()) return { ok: false, error: 'A contratação é feita com a nossa equipe: use “Solicitar contratação”. / 请使用“申请开通”。' }
  const p = AssinarSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Dados do plano inválidos.' }
  const d = p.data

  let valor
  try {
    valor = calcularValorMensal(await catalogo(), d.plano, d.addons, d.qtdLojas, d.qtdCaixas)
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === 'PLANO_LIMITE_LOJAS' ? 'Esse plano não comporta tantas lojas: escolha Rede. / 该方案门店数量不足，请选择“连锁”。' : 'Plano inválido.' }
  }

  const admin = createAdminClient()
  const estado = await estadoEmpresa(admin, g.empresaId)
  if (!estado) return { ok: false, error: 'Não foi possível ler a assinatura. / 无法读取订阅。' }
  const atual = estado.assinatura
  const emp = estado.empresa
  const lojasReais = estado.lojas_ativas
  if ((lojasReais ?? 0) > d.qtdLojas) return { ok: false, error: `Sua empresa já tem ${lojasReais} lojas ativas. / 已有 ${lojasReais} 家营业门店。` }

  const asaas = getAsaas()
  const descricao = `Jinlong ${d.plano}${d.addons.length ? ' + ' + d.addons.join('+') : ''} (${d.qtdLojas} loja/${d.qtdCaixas} caixa)`
  const trialAtivo = atual?.status === 'TRIAL' && atual?.trial_fim && new Date(atual.trial_fim) > new Date()
  // 1ª cobrança: no fim do trial (se ainda ativo) ou amanhã
  const proximo = trialAtivo ? new Date(atual!.trial_fim as string).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : dataVencimento(1)

  try {
    let customer: string | null = atual?.asaas_customer_id ?? null
    let sub: string | null = atual?.asaas_subscription_id ?? null
    let venc = atual?.proximo_vencimento ?? proximo
    if (!customer) {
      customer = (await asaas.criarCliente({
        nome: emp?.nome ?? 'Empresa', email: g.email, cpfCnpj: emp?.cnpj ?? null, externalReference: g.empresaId,
      })).id
    }
    const ativaNoAsaas = sub && atual?.status !== 'CANCELADA'
    if (ativaNoAsaas) {
      await asaas.atualizarAssinatura(sub!, { valor: valor.totalCentavos / 100, billingType: formaParaAsaas(d.forma), descricao, updatePendingPayments: true })
    } else {
      const s = await asaas.criarAssinatura({
        customer, valor: valor.totalCentavos / 100, billingType: formaParaAsaas(d.forma), nextDueDate: proximo, descricao, externalReference: g.empresaId,
      })
      sub = s.id
      venc = s.nextDueDate
    }
    const { error } = await (admin as unknown as Rpc).rpc('cobranca_registrar_assinatura', {
      p_empresa: g.empresaId, p_plano: d.plano, p_addons: d.addons, p_qtd_lojas: d.qtdLojas, p_qtd_caixas: d.qtdCaixas,
      p_forma: d.forma, p_valor_centavos: valor.totalCentavos, p_asaas_customer: customer, p_asaas_subscription: sub,
      p_proximo_vencimento: venc,
    })
    if (error) throw new Error(error.message)
    revalidatePath(ROUTES.admin.assinatura)
    return { ok: true, data: { valorCentavos: valor.totalCentavos, proximoVencimento: venc } }
  } catch (e) {
    console.error('[cobranca] assinar', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Não foi possível registrar no Asaas agora. Tente de novo. / 暂时无法提交，请重试。' }
  }
}

export async function cancelarAssinaturaAction(): Promise<R<null>> {
  const g = await gateDono()
  if (!g.ok) return { ok: false, error: g.error }
  const admin = createAdminClient()
  const atual = (await estadoEmpresa(admin, g.empresaId))?.assinatura
  if (!atual || atual.status === 'CANCELADA') return { ok: false, error: 'Não há assinatura ativa. / 没有有效订阅。' }
  try {
    if (atual.asaas_subscription_id) await getAsaas().cancelarAssinatura(atual.asaas_subscription_id)
    const { error } = await (admin as unknown as Rpc).rpc('cobranca_cancelar', { p_empresa: g.empresaId })
    if (error) throw new Error(error.message)
  } catch (e) {
    console.error('[cobranca] cancelar', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Não foi possível cancelar agora. / 暂时无法取消。' }
  }
  revalidatePath(ROUTES.admin.assinatura)
  return { ok: true, data: null }
}

/** QR/copia-e-cola Pix da fatura em aberto (confere que a fatura é da empresa da sessão). */
export async function pixDaFaturaAction(asaasPaymentId: string): Promise<R<{ payload: string; imagemBase64: string }>> {
  const g = await gateDono()
  if (!g.ok) return { ok: false, error: g.error }
  // fp_minhas_faturas já filtra pela empresa da sessão (fp_pode_empresa)
  const { data: lista } = await (g.supabase as unknown as Rpc).rpc('fp_minhas_faturas', { p_limite: 100 })
  const f = (Array.isArray(lista) ? (lista as Fatura[]) : []).find((x) => x.asaas_payment_id === asaasPaymentId)
  if (!f || !['PENDENTE', 'VENCIDA'].includes(f.status)) return { ok: false, error: 'Fatura não encontrada. / 未找到账单。' }
  try {
    const pix = await getAsaas().pixQrCode(asaasPaymentId)
    return { ok: true, data: { payload: pix.payload, imagemBase64: pix.encodedImage } }
  } catch {
    return { ok: false, error: 'Pix indisponível; use o link de pagamento. / Pix 暂不可用，请使用付款链接。' }
  }
}
