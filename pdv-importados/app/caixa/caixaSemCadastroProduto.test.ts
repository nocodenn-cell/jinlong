/**
 * Decisão de produto: o PDV não cadastra produto.
 *
 * O cadastro pertence ao módulo Produtos (gerente/admin). Este teste é uma
 * trava de arquitetura: se alguém religar o cadastro no caixa, ele falha e
 * aponta a decisão em vez de deixar a confusão entre vender e cadastrar voltar
 * por descuido.
 *
 * Vale a superfície do PDV. O componente e a action seguem no repo marcados
 * como código morto, aguardando limpeza — ver
 * `docs/architecture/pdv_cadastro_removido.md`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const RAIZ = join(__dirname, '..', '..')

function ler(caminhoRelativo: string): string {
  return readFileSync(join(RAIZ, caminhoRelativo), 'utf8')
}

function existe(caminhoRelativo: string): boolean {
  return existsSync(join(RAIZ, caminhoRelativo))
}

describe('PDV não cadastra produto', () => {
  const caixaPage = ler('app/caixa/CaixaPageClient.tsx')

  it('CaixaPageClient não referencia o modal de cadastro relâmpago', () => {
    expect(caixaPage).not.toContain('CadastroProdutoRelampagoModal')
  })

  it('CaixaPageClient não chama a action de criar produto', () => {
    expect(caixaPage).not.toContain('criarProdutoRelampagoPdv')
  })

  it('nenhum gancho abre cadastro ao bipar código inexistente', () => {
    // Casa a atribuição da prop, não a palavra: o comentário que explica a
    // decisão no CaixaPageClient cita o nome do callback de propósito.
    expect(caixaPage).not.toMatch(/onProdutoNaoEncontrado\s*[:=]/)
    expect(caixaPage).not.toContain('cadastroRapidoCodigo')
  })

  it('nenhuma superfície do caixa importa o modal', () => {
    // Varre os arquivos do caixa que poderiam reintroduzir a superfície.
    for (const arquivo of [
      'app/caixa/CaixaPageClient.tsx',
      'app/caixa/CaixaFooter.tsx',
      'app/caixa/scan-pipeline/webCaixaScanProcess.ts',
    ]) {
      expect(ler(arquivo), arquivo).not.toContain('CadastroProdutoRelampagoModal')
    }
  })
})

describe('a API de cadastro no PDV foi removida, não só escondida', () => {
  it('a Server Action não existe mais em app/caixa/actions.ts', () => {
    // `actions.ts` é 'use server': export = endpoint POST endereçável mesmo sem
    // UI. Esconder o botão não bastava; a export tinha de sair.
    const actions = ler('app/caixa/actions.ts')
    expect(actions).not.toMatch(/export\s+async\s+function\s+criarProdutoRelampagoPdv/)
  })

  it('os arquivos do cadastro relâmpago foram apagados', () => {
    expect(existe('app/caixa/server/caixaCadastroRelampago.impl.ts')).toBe(false)
    expect(
      existe('components/gerente/produtos/CadastroProdutoRelampagoModal.tsx'),
    ).toBe(false)
  })

  it('o guard de SSoT não abre exceção para /app/caixa/ criar produto', () => {
    const guard = ler('scripts/check-entity-ssot-boundary.mjs')
    expect(guard).not.toContain('caixaCadastroRelampago')
  })
})

describe('mensagem de código inexistente orienta o fluxo correto', () => {
  it('não manda o operador cadastrar no caixa', () => {
    const pt = getMessages('pt').caixa.msg_produto_nao_encontrado_acao
    expect(pt).not.toMatch(/cadastre agora/i)
  })

  it('aponta o módulo de produtos, em pt e zh', () => {
    expect(getMessages('pt').caixa.msg_produto_nao_encontrado_acao).toMatch(
      /Produtos|gerente/i,
    )
    expect(getMessages('zh').caixa.msg_produto_nao_encontrado_acao).toContain('商品')
  })

  it('mantém a alternativa imediata de buscar por nome/SKU', () => {
    expect(getMessages('pt').caixa.msg_produto_nao_encontrado_acao).toMatch(/nome|SKU/i)
  })
})
