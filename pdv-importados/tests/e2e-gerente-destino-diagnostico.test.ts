/**
 * Tabela de decisão: para onde um GERENTE vai ao pedir `/gerente/vendas`.
 *
 * Por que existe: `e2e/sync-fluxo-gerente.spec.ts` falha com "heading não encontrado",
 * que é o sintoma, não a causa. O destino real discrimina a causa raiz — e o harness
 * do E2E não o captura, porque `postLoginUrl: /\/(caixa|gerente|admin)/` aceita `/caixa`.
 *
 * Este teste trava as três saídas possíveis da cadeia
 * `fetchRawSession → normalizeAdminSession → middlewareAdminDecision`, para que a
 * reprodução manual só precise observar a URL final e ler a resposta nesta tabela:
 *
 *   URL observada  →  causa raiz
 *   ─────────────────────────────────────────────────────────────────────────
 *   /admin/vendas  →  cadeia OK; a falha está depois (render/hidratação/dados)
 *   /caixa         →  perfil lido NÃO é gerencial (perfil nulo/ilegível vira OPERADOR)
 *   /login         →  a linha de `usuarios` não pôde ser lida (RLS/ausente) → db_error
 *
 * A degradação silenciosa é o ponto sensível: `normalizePerfilUsuario` devolve
 * 'OPERADOR' para qualquer valor não reconhecido — incluindo `null` —, então um
 * problema de *dados* se apresenta como decisão de *autorização*, sem erro.
 */
import { describe, expect, it } from 'vitest'
import type { SessionNormalization } from '@/lib/admin/auth/types'
import { middlewareAdminDecision } from '@/lib/admin/policy/adminPolicy'
import { normalizeAdminSession, type RawSession } from '@/lib/admin/auth/sessionConsistency'
import { mockSupabaseUser } from './helpers/mockSupabaseUser'

const USER_ID = 'e2e-gerente'
const user = mockSupabaseUser(USER_ID, 'e2e-gerente@localhost.test')
const ROTA = '/gerente/vendas'

/** Linha de `usuarios` como o seed E2E a cria (seed-dev-users.mjs:184,122,123). */
const linhaSeed = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-matriz', ativo: true }

const autenticado = (usuario: Record<string, unknown>): RawSession =>
  ({ status: 'authenticated', user, usuario }) as RawSession

const decidir = (raw: RawSession) =>
  middlewareAdminDecision(normalizeAdminSession(raw, 'edge') as SessionNormalization, ROTA)

describe('destino do GERENTE em /gerente/vendas', () => {
  it('seed E2E válido é liberado — a cadeia de autorização NÃO é a causa', () => {
    const d = decidir(autenticado(linhaSeed))
    expect(d.type).toBe('allow')
  })

  it('DONO e ADMIN também passam', () => {
    for (const perfil of ['DONO', 'ADMIN']) {
      expect(decidir(autenticado({ ...linhaSeed, perfil })).type).toBe('allow')
    }
  })

  it('caixa/espaços do perfil NÃO são modo de falha — normalizePerfilUsuario faz trim+toUpperCase', () => {
    for (const perfil of ['gerente', 'Gerente', ' GERENTE ', 'dono']) {
      expect(decidir(autenticado({ ...linhaSeed, perfil })).type, `perfil=${perfil}`).toBe('allow')
    }
  })

  it('perfil IRRECONHECÍVEL degrada a OPERADOR e desvia para /caixa (sem erro, sem log)', () => {
    for (const perfil of [null, undefined, '', 'MANAGER', 'operador']) {
      const d = decidir(autenticado({ ...linhaSeed, perfil }))
      expect(d.type, `perfil=${String(perfil)}`).toBe('redirect')
      expect(d, `perfil=${String(perfil)}`).toMatchObject({ target: '/caixa', reason: 'perfil_nao_gerencial' })
    }
  })

  it('linha de usuarios ilegível (RLS/ausente) manda para /login, não para /caixa', () => {
    const d = decidir({ status: 'db_error', user, error: new Error('rls') } as unknown as RawSession)
    expect(d.type).toBe('redirect')
    expect(d.target).toMatch(/^\/login/)
  })

  it('sem loja e inativo são bloqueios distintos de perfil — vão para /login', () => {
    for (const linha of [
      { ...linhaSeed, loja_id: null },
      { ...linhaSeed, ativo: false },
    ]) {
      const d = decidir(autenticado(linha))
      expect(d.type).toBe('redirect')
      expect(d.target).toMatch(/^\/login/)
    }
  })

  it('o regex do harness E2E não distingue sucesso de rebaixamento', () => {
    // Espelha sync-fluxo-gerente.spec.ts:220,290 — documenta a cegueira do harness.
    const postLoginUrl = /\/(caixa|gerente|admin)/
    expect(postLoginUrl.test('/admin/vendas')).toBe(true)
    expect(postLoginUrl.test('/caixa')).toBe(true) // ← aceita o rebaixamento como sucesso
  })
})
