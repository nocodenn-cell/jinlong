import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAIXA_ATALHOS, comAtalho } from './caixaAtalhos'

/**
 * Guarda contra "atalho anunciado que não existe".
 *
 * O rótulo da tecla estava repetido inline em dois arquivos. Interface que
 * promete `Alt+C` depois de o handler sumir é pior que interface sem atalho:
 * o operador tenta, nada acontece, e ele deixa de confiar nos outros.
 *
 * Estes testes leem o handler real (`useCaixaKeyboardShortcuts`) e exigem que
 * cada tecla anunciada tenha tratamento correspondente lá.
 */

const hook = readFileSync(
  join(__dirname, 'hooks', 'useCaixaKeyboardShortcuts.ts'),
  'utf8',
)

/** "F4 / F9" → ["F4", "F9"] · "Ctrl+Shift+S" → ["Ctrl+Shift+S"] */
function teclas(rotulo: string): string[] {
  return rotulo.split('/').map((s) => s.trim())
}

/** Converte o rótulo humano no `e.code` que o hook compara. */
function codeEsperado(tecla: string): string {
  const ultima = tecla.split('+').pop()!
  if (/^F\d{1,2}$/.test(ultima)) return `"${ultima}"`
  return `"Key${ultima.toUpperCase()}"`
}

describe('CAIXA_ATALHOS — toda tecla anunciada tem handler', () => {
  for (const [nome, rotulo] of Object.entries(CAIXA_ATALHOS)) {
    it(`${nome} (${rotulo}) é tratado em useCaixaKeyboardShortcuts`, () => {
      for (const tecla of teclas(rotulo)) {
        expect(hook, `${nome}: ${tecla}`).toContain(codeEsperado(tecla))
      }
    })
  }
})

describe('CAIXA_ATALHOS — valores conferidos contra o hook', () => {
  it('F2 foca a busca; NÃO seleciona cliente', () => {
    // Regressão de documentação: a referência de atalhos já descreveu F2 como
    // seleção de cliente. O hook chama onFocarBusca.
    const bloco = hook.slice(hook.indexOf('e.code === "F2"'))
    expect(bloco.slice(0, 120)).toContain('onFocarBusca')
    expect(CAIXA_ATALHOS.focarBusca).toContain('F2')
    expect(CAIXA_ATALHOS.selecionarCliente).not.toContain('F2')
  })

  it('finalizar aceita F4 e F9', () => {
    expect(hook).toContain('e.code === "F4" || e.code === "F9"')
    expect(CAIXA_ATALHOS.finalizarVenda).toBe('F4 / F9')
  })

  it('não há tecla duplicada entre ações distintas', () => {
    const todas = Object.values(CAIXA_ATALHOS).flatMap(teclas)
    expect(new Set(todas).size).toBe(todas.length)
  })
})

describe('comAtalho', () => {
  it('anexa a tecla quando existe', () => {
    expect(comAtalho('Sangria', CAIXA_ATALHOS.sangria)).toBe('Sangria (Ctrl+Shift+R)')
  })

  it('devolve o rótulo intacto quando a ação não tem atalho', () => {
    expect(comAtalho('Histórico', undefined)).toBe('Histórico')
  })
})
