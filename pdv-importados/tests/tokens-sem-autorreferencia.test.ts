/**
 * Guard de token: nenhuma custom property pode referenciar A SI MESMA.
 *
 * Pela especificação CSS, `--x: var(--x)` é *guaranteed-invalid*: a
 * propriedade passa a resolver vazio para todos os consumidores. Como
 * `styles/tokens/aliases.css` é carregado DEPOIS de `colors.css` e ambos
 * declaram em `:root`, uma linha auto-referente lá apaga silenciosamente o
 * valor válido do SSOT em todo o app — sem erro de build, sem aviso do
 * navegador.
 *
 * Foi o que aconteceu com `--color-brand-strong`: o hover do botão primário
 * (`background: var(--color-brand-strong)`) virava inválido-em-tempo-de-
 * valor-computado e o fundo caía para `transparent`, deixando o botão azul
 * com rótulo branco invisível ao passar o mouse; `border-color` caía para
 * `currentColor` e desenhava um halo branco. Nove consumidores afetados
 * (fp-btn, controls, admin-v2, badge de Atacado do PDV).
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR_TOKENS = join(__dirname, '..', 'styles', 'tokens')

/** `--nome: ...` no início de uma declaração (ignora linhas comentadas). */
const DECLARACAO = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*([^;]*);/

function declaracoesAutorreferentes(css: string): string[] {
  const achados: string[] = []
  for (const linha of css.split('\n')) {
    if (linha.trimStart().startsWith('*') || linha.trimStart().startsWith('/*')) continue
    const m = DECLARACAO.exec(linha)
    if (!m) continue
    const [, nome, valor] = m
    // `var(--nome)` — com ou sem fallback — apontando para a própria propriedade.
    const usaSiMesma = new RegExp(`var\\(\\s*${nome}\\s*[,)]`).test(valor)
    if (usaSiMesma) achados.push(`${nome}: ${valor.trim()}`)
  }
  return achados
}

describe('tokens CSS — sem autorreferência', () => {
  const arquivos = readdirSync(DIR_TOKENS).filter((f) => f.endsWith('.css'))

  it('encontra os arquivos de token', () => {
    expect(arquivos.length).toBeGreaterThan(0)
  })

  it.each(arquivos)('%s não declara custom property que referencia a si mesma', (arquivo) => {
    const css = readFileSync(join(DIR_TOKENS, arquivo), 'utf8')
    expect(declaracoesAutorreferentes(css)).toEqual([])
  })

  it('o detector realmente pega o padrão que causou o bug', () => {
    expect(declaracoesAutorreferentes('  --color-brand-strong: var(--color-brand-strong);')).toEqual([
      '--color-brand-strong: var(--color-brand-strong)',
    ])
    // Alias legítimo (nomes diferentes) não pode ser acusado.
    expect(declaracoesAutorreferentes('  --accent-strong: var(--color-brand-strong);')).toEqual([])
  })
})
