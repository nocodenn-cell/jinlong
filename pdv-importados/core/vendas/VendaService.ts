/**
 * Esboço do domínio de vendas — implementação completa virá com PDV + Supabase.
 * PDV local (Tauri) pode registrar vendas offline e sincronizar depois.
 */

export type FormaPagamento = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'OUTRO'

export interface ItemVendaDraft {
  produtoId: string
  quantidade: number
  precoUnitario: number
  precoOriginal: number
}

export interface RegistrarVendaInput {
  caixaSessaoId?: string
  itens: ItemVendaDraft[]
  formaPagamento: FormaPagamento
  totalLiquido: number
}

/** Contrato futuro: persistir venda + itens + movimento de caixa */
export interface VendaRepositoryPort {
  registrarVenda(input: RegistrarVendaInput): Promise<
    { ok: true; vendaId: string } | { ok: false; message: string }
  >
}

export class VendaService {
  constructor(private readonly repo: VendaRepositoryPort) {}

  async registrar(input: RegistrarVendaInput) {
    if (!input.itens.length) {
      return { ok: false as const, message: 'Carrinho vazio' }
    }
    return this.repo.registrarVenda(input)
  }
}
