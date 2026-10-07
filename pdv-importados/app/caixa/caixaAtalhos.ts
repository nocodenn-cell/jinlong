/**
 * Fonte única dos atalhos de teclado do PDV (UX-009).
 *
 * O handler (`useCaixaKeyboardShortcuts`), a ajuda (F1 — `CaixaKeyboardShortcutsReference`) e o menu
 * Operações (`CaixaPdvOperacoesMenu`) consomem ESTE mapa: tecla, modificadores e o texto exibido saem
 * do mesmo objeto, então não há como a legenda divergir do que o teclado realmente faz.
 *
 * Modificadores: `true` = obrigatório, `false` = proibido, ausente = ignorado (comportamento histórico
 * das teclas F, que disparam mesmo com modificadores).
 * Regra de integridade (testada): nenhuma combinação de tecla pertence a duas ações.
 */

type Modificadores = { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }

export type CaixaTecla = Modificadores & {
  /** `KeyboardEvent.code` (um ou vários equivalentes, ex.: Digit1/Numpad1). */
  code: string | readonly string[]
  /** Texto exibido ao operador. */
  label: string
}

export type CaixaAtalho = readonly CaixaTecla[]

const f = (code: string): CaixaTecla => ({ code, label: code })
const alt = (letra: string): CaixaTecla => ({
  code: `Key${letra}`,
  label: `Alt+${letra}`,
  alt: true,
  ctrl: false,
  shift: false,
  meta: false,
})
const digito = (n: 1 | 2 | 3 | 4): CaixaAtalho => [
  {
    code: [`Digit${n}`, `Numpad${n}`],
    label: String(n),
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  },
]

export const CAIXA_ATALHOS = {
  ajuda: [f('F1')],
  buscar: [f('F2'), { code: 'KeyB', label: 'Ctrl+B', ctrl: true, shift: false, alt: false }],
  /** Drawer único de descontos (manual / comercial / gerente). */
  aplicarDesconto: [f('F3')],
  /** Consulta rápida (preço/estoque) — migrada de F3 para liberar desconto. */
  consultaRapida: [f('F7')],
  finalizar: [
    f('F4'),
    f('F9'),
    {
      code: 'Enter',
      label: 'Enter',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
  ],
  fecharCaixa: [f('F6')],
  novoCupom: [f('F8')],
  reimprimir: [f('F12')],
  desfazerRemocao: [
    { code: 'KeyZ', label: 'Ctrl+Z', ctrl: true, shift: false, alt: false, meta: false },
  ],
  suprimento: [{ code: 'KeyS', label: 'Ctrl+Shift+S', ctrl: true, shift: true }],
  sangria: [{ code: 'KeyR', label: 'Ctrl+Shift+R', ctrl: true, shift: true }],
  /** PDV clássico — Alt+<letra>. */
  focoProduto: [alt('Z')],
  cliente: [alt('C')],
  pagamento: [alt('B')],
  excluirVenda: [alt('Q')],
  finalizarClassico: [alt('S')],
  /** Teclas 1–4 → forma de pagamento, na ordem do seletor: Dinheiro, PIX, Crédito, Débito. */
  metodoPagamento: [digito(1), digito(2), digito(3), digito(4)],
} as const satisfies Record<string, CaixaAtalho | readonly CaixaAtalho[]>

type EventoTecla = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>

function teclaCombina(t: CaixaTecla, e: EventoTecla): boolean {
  const codes = typeof t.code === 'string' ? [t.code] : t.code
  if (!codes.includes(e.code)) return false
  if (t.ctrl !== undefined && t.ctrl !== e.ctrlKey) return false
  if (t.shift !== undefined && t.shift !== e.shiftKey) return false
  if (t.alt !== undefined && t.alt !== e.altKey) return false
  if (t.meta !== undefined && t.meta !== e.metaKey) return false
  return true
}

/** O evento aciona este atalho? (mesma regra para o handler e para os testes) */
export function atalhoCombina(atalho: CaixaAtalho, e: EventoTecla): boolean {
  return atalho.some((t) => teclaCombina(t, e))
}

/** Texto exibido na ajuda/menu: "F4 / F9", "Alt+C"… */
export function atalhoRotulo(atalho: CaixaAtalho): string {
  return atalho.map((t) => t.label).join(' / ')
}
