import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAPACIDADES_PERFIL, capacidadesDoPerfil } from './capacidadesPerfil'

/**
 * O resumo de capacidades é DESCRIÇÃO, não autoridade.
 *
 * Estes testes protegem duas coisas:
 *  1. que ele cubra exatamente os perfis que o RBAC tem — nem a mais (inventar
 *     perfil é criar permissão que não existe), nem a menos;
 *  2. que ninguém o transforme em fonte de decisão de autorização.
 */

const raiz = join(__dirname, '..', '..')

describe('CAPACIDADES_PERFIL — cobertura do RBAC real', () => {
  it('cobre os 4 perfis do RBAC, sem inventar nenhum', () => {
    expect(Object.keys(CAPACIDADES_PERFIL).sort()).toEqual([
      'ADMIN',
      'DONO',
      'GERENTE',
      'OPERADOR',
    ])
  })

  it('perfil desconhecido devolve null em vez de um resumo vazio', () => {
    // Resumo vazio pareceria "não permite nada" — pior que não mostrar.
    expect(capacidadesDoPerfil('FINANCEIRO')).toBeNull()
    expect(capacidadesDoPerfil('')).toBeNull()
  })

  it('todo perfil declara ao menos uma permissão', () => {
    for (const [perfil, caps] of Object.entries(CAPACIDADES_PERFIL)) {
      expect(caps.permite.length, perfil).toBeGreaterThan(0)
    }
  })

  it('só DONO anuncia visão macro multi-loja', () => {
    // Espelha `vendas_select_dono_todas_lojas` / `estoque_select_dono_todas_lojas`,
    // que condicionam a perfil = 'DONO' sem escopo de loja.
    const comMacro = Object.entries(CAPACIDADES_PERFIL)
      .filter(([, c]) => c.permite.some((t) => /todas as lojas/i.test(t)))
      .map(([p]) => p)
    expect(comMacro).toEqual(['DONO'])
  })
})

describe('CAPACIDADES_PERFIL — não é autoridade de permissão', () => {
  it('nenhum caminho de autenticação/autorização importa este módulo', () => {
    const guardas = [
      join(raiz, 'lib', 'admin', 'auth', 'sessionConsistency.ts'),
      join(raiz, 'lib', 'admin', 'policy', 'adminPolicy.ts'),
      join(raiz, 'lib', 'auth', 'usuarioAtual.ts'),
      join(raiz, 'middleware.ts'),
    ]
    for (const arquivo of guardas) {
      const conteudo = readFileSync(arquivo, 'utf8')
      expect(conteudo, arquivo).not.toContain('capacidadesPerfil')
      expect(conteudo, arquivo).not.toContain('CAPACIDADES_PERFIL')
    }
  })
})
