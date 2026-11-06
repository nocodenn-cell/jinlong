/**
 * Troca Segura de Operador — tipos e regras puras (sem servidor), usáveis no cliente e testáveis.
 * Gaveta do turno: responsável = quem abriu; operador ativo = quem está no caixa agora; vendedor = comissão.
 */

export const BLOQUEIO_PADRAO_MIN = 3
/** Canal entre abas do mesmo navegador: qualquer troca/bloqueio recarrega as outras abas do caixa. */
export const CANAL_TROCA_OPERADOR = 'jl-caixa-operador'

export type TrocaErro =
  | 'sessao'
  | 'em_uso'
  | 'outro_caixa'
  | 'nao_operador'
  | 'caixa_fechado'
  | 'nao_encontrado'
  | 'indisponivel'
  | 'pin_invalido'
  | 'pin_incorreto'
  | 'pin_bloqueado'
  | 'pin_bloqueado_gerente'
  | 'sem_pin'

/** Códigos RAISE do banco (migration 20261023200000) → erro tipado; desconhecido = indisponível. */
const CODIGOS: ReadonlyArray<[string, TrocaErro]> = [
  ['TROCA_CAIXA_EM_USO', 'em_uso'],
  ['TROCA_OPERADOR_COM_OUTRO_CAIXA', 'outro_caixa'],
  ['TROCA_NAO_E_OPERADOR_ATIVO', 'nao_operador'],
  ['TROCA_CAIXA_FECHADO', 'caixa_fechado'],
  ['TROCA_CAIXA_NAO_ENCONTRADO', 'nao_encontrado'],
  ['TROCA_NAO_AUTENTICADO', 'sessao'],
]

export function erroTroca(message: string | null | undefined): TrocaErro {
  const msg = message ?? ''
  return CODIGOS.find(([c]) => msg.includes(c))?.[1] ?? 'indisponivel'
}

export type CaixaLiberado = { caixaId: string; responsavelNome: string; dataAbertura: string | null }

export type TrocaContexto = {
  /** Caixa em que o usuário da sessão é o operador ativo (pode vender). */
  operando: { caixaId: string; responsavelId: string; responsavelNome: string } | null
  /** Caixa do usuário bloqueado (aguarda PIN). */
  bloqueado: { caixaId: string } | null
  /** Turno aberto pelo usuário que está com outra pessoa (ou liberado / bloqueado). */
  proprioEmUso: { caixaId: string; operadorNome: string | null; liberado: boolean; bloqueado: boolean } | null
  /** Turnos da loja liberados para alguém assumir. */
  liberados: CaixaLiberado[]
  pin: { exigido: boolean; minutos: number }
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export function parseTrocaContexto(raw: unknown, pin: TrocaContexto['pin']): TrocaContexto {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const obj = (k: string) => (r[k] && typeof r[k] === 'object' && !Array.isArray(r[k]) ? (r[k] as Record<string, unknown>) : null)
  const op = obj('operando')
  const bl = obj('bloqueado')
  const pe = obj('proprio_em_uso')
  const lib = Array.isArray(r.liberados) ? (r.liberados as Record<string, unknown>[]) : []
  return {
    operando: op && texto(op.caixa_id)
      ? { caixaId: String(op.caixa_id), responsavelId: String(op.responsavel_id ?? ''), responsavelNome: texto(op.responsavel_nome) ?? '—' }
      : null,
    bloqueado: bl && texto(bl.caixa_id) ? { caixaId: String(bl.caixa_id) } : null,
    proprioEmUso: pe && texto(pe.caixa_id)
      ? { caixaId: String(pe.caixa_id), operadorNome: texto(pe.operador_nome), liberado: pe.liberado === true, bloqueado: pe.bloqueado === true }
      : null,
    liberados: lib
      .filter((x) => texto(x?.caixa_id))
      .map((x) => ({ caixaId: String(x.caixa_id), responsavelNome: texto(x.responsavel_nome) ?? '—', dataAbertura: texto(x.data_abertura) })),
    pin,
  }
}

/** "Turno de: X" só quando o responsável não é quem está operando. */
export function responsavelDiferente(ctx: TrocaContexto | null, usuarioId: string | null): string | null {
  if (!ctx?.operando || !usuarioId) return null
  return ctx.operando.responsavelId && ctx.operando.responsavelId !== usuarioId ? ctx.operando.responsavelNome : null
}

export type MotivoTrocaBloqueada = 'carrinho' | 'finalizando' | 'processando' | null

/** Pré-condições no cliente (o servidor revalida a identidade e o caixa). Venda em espera fica com quem a criou. */
export function motivoTrocaBloqueada(s: { itensNoCarrinho: number; finalizando: boolean; processandoCaixa: boolean }): MotivoTrocaBloqueada {
  if (s.finalizando) return 'finalizando'
  if (s.processandoCaixa) return 'processando'
  if (s.itensNoCarrinho > 0) return 'carrinho'
  return null
}

export function minutosBloqueio(m: unknown): number {
  const n = Number(m)
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : BLOQUEIO_PADRAO_MIN
}
