/**
 * Esboço de sessão de caixa (abertura/fechamento/sangria).
 * Painel cloud pode consultar; PDV local abre/fecha offline e sincroniza.
 */

export interface AbrirCaixaInput {
  usuarioId: string
  trocoInicial: number
  identificadorCaixa?: string
}

export interface MovimentoCaixaInput {
  caixaId: string
  tipo: 'SANGRIA' | 'SUPRIMENTO'
  valor: number
  observacao?: string
}

export interface CaixaRepositoryPort {
  abrir(input: AbrirCaixaInput): Promise<
    { ok: true; caixaId: string } | { ok: false; message: string }
  >
  fechar(caixaId: string): Promise<{ ok: true } | { ok: false; message: string }>
  registrarMovimento(
    input: MovimentoCaixaInput
  ): Promise<{ ok: true } | { ok: false; message: string }>
}

export class CaixaService {
  constructor(private readonly repo: CaixaRepositoryPort) {}

  abrir(input: AbrirCaixaInput) {
    if (input.trocoInicial < 0) {
      return Promise.resolve({
        ok: false as const,
        message: 'Troco inicial inválido',
      })
    }
    return this.repo.abrir(input)
  }

  fechar(caixaId: string) {
    return this.repo.fechar(caixaId)
  }
}
