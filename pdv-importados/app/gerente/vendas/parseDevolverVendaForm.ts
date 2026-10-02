import { z } from 'zod'

export const FORMAS_ESTORNO_DEVOLUCAO = [
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
  'CREDITO_CLIENTE',
] as const

export const TIPOS_POS_VENDA = ['DEVOLUCAO', 'TROCA'] as const

const itemDevolucaoSchema = z.object({
  itemVendaId: z.string().uuid(),
  quantidade: z.number().positive(),
})

export const devolverVendaInputSchema = z.object({
  vendaId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  motivo: z.string().trim().min(2).max(500),
  tipo: z.enum(TIPOS_POS_VENDA),
  itens: z.array(itemDevolucaoSchema).min(1),
  valorEstorno: z.number().positive(),
  formaEstorno: z.enum(FORMAS_ESTORNO_DEVOLUCAO),
  vendaSubstitutaId: z.string().uuid().optional(),
  /** Caixa aberto que desembolsa o dinheiro (regra 0/1/N do servidor). Omitido = o servidor usa o único elegível, se houver. */
  caixaId: z.string().uuid().optional(),
})

export type DevolverVendaInput = z.infer<typeof devolverVendaInputSchema>

export function parseDevolverVendaForm(formData: FormData): DevolverVendaInput | null {
  const rawItens = formData.get('itens_json')
  let itens: unknown = []
  if (typeof rawItens === 'string' && rawItens.trim()) {
    try {
      itens = JSON.parse(rawItens)
    } catch {
      return null
    }
  }

  const parsed = devolverVendaInputSchema.safeParse({
    vendaId: formData.get('venda_id'),
    idempotencyKey: formData.get('idempotency_key'),
    motivo: formData.get('motivo'),
    tipo: formData.get('tipo'),
    itens,
    valorEstorno: Number(formData.get('valor_estorno')),
    formaEstorno: formData.get('forma_estorno'),
    vendaSubstitutaId: formData.get('venda_substituta_id') || undefined,
    caixaId: formData.get('caixa_id') || undefined,
  })

  return parsed.success ? parsed.data : null
}
