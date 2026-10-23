/**
 * Login rápido do operador por PIN (P0) — lógica pura, sem DOM/Tauri (testável).
 * Decisões do Damatta: caixa do terminal (a troca não fecha o caixa), PIN de 4 dígitos, bloqueio em 3 min.
 * Só vale quando a loja liga `exigir_pin_operador` (padrão desligado ⇒ PDV idêntico ao de hoje).
 */

export type OperadorPublico = {
  usuario_id: string
  nome: string
  papel: string
  idioma: string
  tem_pin: boolean
}

export type OperadorAtual = { usuario_id: string; nome: string; papel: string }

export type OperadoresStatus = {
  disponivel: boolean
  expirado: boolean
  exigir_pin_operador: boolean
  bloqueio_inatividade_min: number
  expira_em: string | null
  operadores: OperadorPublico[]
  operador_atual: OperadorAtual | null
}

export type ValidarPinResultado = {
  ok: boolean
  offline: boolean
  usuario_id: string | null
  nome: string | null
  papel: string | null
  erro: string | null
  bloqueado_ate_unix: number | null
  evento_id: string | null
}

export const TAMANHO_PIN = 4
export const BLOQUEIO_PADRAO_MIN = 3

export const T = {
  trocar: 'Trocar operador / 切换操作员',
  telaTitulo: 'Quem vai usar o caixa? / 谁来使用收银台？',
  digitePin: 'Digite seu PIN / 请输入PIN码',
  voltar: 'Voltar / 返回',
  apagar: 'Apagar / 删除',
  limpar: 'Limpar / 清除',
  confirmar: 'Confirmar / 确认',
  cancelar: 'Cancelar / 取消',
  carrinhoMantido: 'O carrinho e o caixa continuam abertos. / 购物车和收银台保持打开。',
  semPin: 'Sem PIN — cadastre em “Meu PIN do caixa” no painel. / 未设置PIN — 请在后台“我的收银PIN”设置。',
  nenhumComPin: 'Nenhum operador desta loja tem PIN. Peça ao gerente. / 本店没有设置PIN的操作员，请联系经理。',
  operador: 'Operador / 操作员',
  gerenteTitulo: 'Autorização do gerente / 经理授权',
  gerenteEscolha: 'Gerente / 经理',
  semGerente: 'Nenhum gerente com PIN nesta loja. / 本店没有设置PIN的经理。',
  offline: 'conferido offline / 离线验证',
  descontoPercent: (max: number) => `Desconto especial em % (máx. ${max}%) / 特别折扣 %（最高 ${max}%）`,
} as const

/** Modo PIN só liga com o flag da loja E pelo menos um operador com PIN (nunca tranca a loja inteira). */
export function modoPinAtivo(s: OperadoresStatus | null | undefined): boolean {
  return Boolean(s && s.disponivel && s.exigir_pin_operador && s.operadores.some((o) => o.tem_pin))
}

export function gerentesComPin(s: OperadoresStatus | null | undefined): OperadorPublico[] {
  if (!s || !s.disponivel) return []
  return s.operadores.filter((o) => o.tem_pin && (o.papel === 'GERENTE' || o.papel === 'DONO'))
}

export function minutosBloqueio(s: OperadoresStatus | null | undefined): number {
  const m = Number(s?.bloqueio_inatividade_min)
  return Number.isFinite(m) && m >= 1 && m <= 60 ? m : BLOQUEIO_PADRAO_MIN
}

/** Teclado físico/numérico no campo de PIN. Retorna o novo valor e se deve enviar. */
export function aplicarTeclaPin(atual: string, tecla: string): { valor: string; enviar: boolean } {
  if (/^[0-9]$/.test(tecla)) {
    if (atual.length >= TAMANHO_PIN) return { valor: atual, enviar: false }
    const valor = atual + tecla
    return { valor, enviar: valor.length === TAMANHO_PIN }
  }
  if (tecla === 'Backspace') return { valor: atual.slice(0, -1), enviar: false }
  if (tecla === 'Escape' || tecla === 'Delete') return { valor: '', enviar: false }
  if (tecla === 'Enter') return { valor: atual, enviar: atual.length === TAMANHO_PIN }
  return { valor: atual, enviar: false }
}

export function mensagemErroPin(r: Pick<ValidarPinResultado, 'erro' | 'bloqueado_ate_unix'>, agoraMs = Date.now()): string {
  switch (r.erro) {
    case 'PIN_INCORRETO':
      return 'PIN incorreto. / PIN码错误。'
    case 'PIN_BLOQUEADO': {
      const min = r.bloqueado_ate_unix ? Math.max(1, Math.ceil((r.bloqueado_ate_unix * 1000 - agoraMs) / 60000)) : 5
      return `Muitas tentativas. Tente em ${min} min. / 尝试次数过多，请 ${min} 分钟后再试。`
    }
    case 'PIN_BLOQUEADO_GERENTE':
      return 'PIN bloqueado. O gerente precisa liberar no painel. / PIN已锁定，需经理在后台解锁。'
    case 'SEM_PIN':
      return T.semPin
    case 'PIN_SEM_PERMISSAO':
      return 'Este PIN não é de gerente. / 此PIN不是经理PIN。'
    case 'SEM_CACHE':
      return 'Sem conexão e sem lista de operadores atualizada (7 dias). Conecte à internet. / 无网络且操作员列表已过期（7天），请联网。'
    case 'PIN_INVALIDO':
      return 'O PIN tem 4 números. / PIN为4位数字。'
    default:
      return 'Não foi possível conferir o PIN. Tente de novo. / 无法验证PIN，请重试。'
  }
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}
