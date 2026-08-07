/**
 * Fonte única dos rótulos de tecla do PDV.
 *
 * Os atalhos já existiam e funcionavam; o texto da tecla é que estava repetido —
 * inline em `CaixaPdvOperacoesMenu` e outra vez em
 * `CaixaKeyboardShortcutsReference`. Duas listas divergem na primeira vez que um
 * atalho muda, e aí a interface passa a anunciar tecla que não faz nada.
 *
 * Isto NÃO registra nem intercepta teclas: o comportamento continua inteiro em
 * `useCaixaKeyboardShortcuts`. Aqui é só o nome que o operador lê.
 *
 * Cada valor abaixo foi conferido contra o `switch` do hook — não contra a
 * documentação, que já divergia (ex.: `F2` foca a busca, não seleciona cliente).
 */

export const CAIXA_ATALHOS = {
  /** `useCaixaKeyboardShortcuts` — F4 ou F9. */
  finalizarVenda: 'F4 / F9',
  /** F1 — único que age com a própria referência aberta. */
  ajuda: 'F1',
  /** F2 ou Ctrl+B — ambos chamam `onFocarBusca`. */
  focarBusca: 'F2 / Ctrl+B',
  consultaRapida: 'F3',
  fecharCaixa: 'F6',
  novoCupom: 'F8',
  reimprimir: 'F12',
  suprimento: 'Ctrl+Shift+S',
  sangria: 'Ctrl+Shift+R',
  desfazerRemocao: 'Ctrl+Z',
  /** Bloco Alt — só ativo quando `pdvClassicAtalhos` está presente. */
  excluirVenda: 'Alt+Q',
  selecionarCliente: 'Alt+C',
} as const

export type CaixaAtalhoKey = keyof typeof CAIXA_ATALHOS

/**
 * Sufixo de tecla para rótulo de botão: `Finalizar` → `Finalizar (F4 / F9)`.
 * Aceita `undefined` de propósito, para o chamador não precisar ramificar.
 */
export function comAtalho(label: string, atalho?: string): string {
  return atalho ? `${label} (${atalho})` : label
}
