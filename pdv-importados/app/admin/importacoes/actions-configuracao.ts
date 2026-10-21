'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { UFS } from '@shared-core/src/import'
import { ROUTES } from '@/lib/navigation/routes'
import { actionImportacoes } from '@/lib/import/hub/gateImportacoes'
import { chaveErro } from '@/lib/import/hub/elegibilidade'
import type { ResultadoAcao } from './actions'

/**
 * Configuração nacional de importação (UF do importador, porto/modal, % efetivo de ICMS e
 * alíquotas informadas pelo cliente/despachante). Escrita só por RPC; o banco deriva a empresa.
 */
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }
const Pct = z.string().regex(/^\d{1,2}([.,]\d{1,4})?$/)
const falha = (erro: string) => ({ ok: false as const, erro })
const norm = (v: string) => v.replace(',', '.')

const Config = z.object({
  uf_importador: z.string().refine((u) => UFS.includes(u)),
  porto_padrao: z.string().max(80).optional().nullable(),
  modal_padrao: z.enum(['MARITIMO', 'AEREO', 'RODOVIARIO']).or(z.literal('')).optional().nullable(),
  icms_efetivo_pct: Pct.or(z.literal('')).optional().nullable(),
  regime_incentivo_nome: z.string().max(120).optional().nullable(),
  aviso_aceito: z.literal(true),
})
const Override = z.object({
  tributo: z.enum(['II', 'IPI', 'PIS_IMPORTACAO', 'COFINS_IMPORTACAO', 'ICMS', 'CBS', 'IBS']),
  ncm_prefixo: z.string().regex(/^\d{0,8}$/),
  aliquota_pct: Pct,
  nota: z.string().max(200).optional().nullable(),
})

async function chamar(fn: string, args: Record<string, unknown>): Promise<ResultadoAcao> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const { error } = await (gate.ctx.client as unknown as Rpc).rpc(fn, args)
  if (error) return falha(chaveErro(error.message))
  revalidatePath(ROUTES.admin.importacoes, 'layout')
  return { ok: true, data: undefined }
}

export async function salvarConfigImportacaoAction(input: unknown): Promise<ResultadoAcao> {
  const p = Config.safeParse(input)
  if (!p.success) return falha('erro_valor_invalido')
  const d = p.data
  return chamar('import_salvar_parametros_empresa', { p_dados: {
    uf_importador: d.uf_importador, porto_padrao: d.porto_padrao ?? null, modal_padrao: d.modal_padrao || null,
    icms_efetivo_pct: d.icms_efetivo_pct ? norm(d.icms_efetivo_pct) : null, regime_incentivo_nome: d.regime_incentivo_nome ?? null,
    aviso_aceito: true,
  } })
}

export async function salvarOverrideTributoAction(input: unknown): Promise<ResultadoAcao> {
  const p = Override.safeParse(input)
  if (!p.success) return falha('erro_valor_invalido')
  return chamar('import_salvar_override_tributo', { p_dados: { ...p.data, aliquota_pct: norm(p.data.aliquota_pct) } })
}

export async function removerOverrideTributoAction(id: string): Promise<ResultadoAcao> {
  if (!z.string().uuid().safeParse(id).success) return falha('erro_valor_invalido')
  return chamar('import_remover_override_tributo', { p_id: id })
}
