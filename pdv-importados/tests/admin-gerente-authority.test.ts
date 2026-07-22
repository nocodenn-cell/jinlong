import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeSession, type RawSession } from '@/lib/admin/auth/sessionConsistency'
import type { AdminSession } from '@/lib/admin/auth/types'
import { actionAdminDecision } from '@/lib/admin/policy/adminPolicy'
import { gerenteAdminDecision } from '@/lib/gerente/auth/gerenteAdapter'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mockSupabaseUser } from './helpers/mockSupabaseUser'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GERENTE_ROOT = path.join(ROOT, 'app', 'gerente')

const SCAN_IGNORE = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_IGNORE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, acc)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

describe('gerente authority convergence', () => {
  it('gerenteAdminDecision delega a actionAdminDecision com scope gerente', () => {
    const session: AdminSession = {
      userId: 'mgr-1',
      user: mockSupabaseUser('mgr-1', 'g@test.local'),
      perfil: 'GERENTE',
      idioma: 'pt',
      lojaId: 'loja-1',
    }

    const base = actionAdminDecision(session)
    const gerente = gerenteAdminDecision(session)

    expect(gerente.type).toBe(base.type)
    expect(gerente.reason).toBe(base.reason)
    expect(gerente.scope).toBe('gerente')
  })

  it('operador autenticado recebe deny via pipeline adminPolicy', () => {
    const raw: RawSession = {
      status: 'authenticated',
      user: mockSupabaseUser('op-1', 'op@test.local'),
      usuario: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: null },
    }
    const session = normalizeSession(raw)
    const decision = gerenteAdminDecision(session)

    expect(decision.type).toBe('deny')
    expect(decision.scope).toBe('gerente')
  })

  it('/gerente/** não usa assertGerenteOuDono nem getUsuarioAtual para auth', () => {
    const offenders: string[] = []
    for (const file of walkTsFiles(GERENTE_ROOT)) {
      const source = fs.readFileSync(file, 'utf8')
      if (source.includes('assertGerenteOuDono') || source.includes('getUsuarioAtual')) {
        offenders.push(rel(file))
      }
      if (source.includes('isPerfilPainelGerencial')) {
        offenders.push(`${rel(file)} (isPerfilPainelGerencial)`)
      }
    }
    expect(offenders, `legacy auth em gerente: ${offenders.join(', ')}`).toEqual([])
  })

  it('/gerente/** actions usam assertGerenteSession', () => {
    const actionFiles = walkTsFiles(GERENTE_ROOT).filter((f) => f.endsWith('actions.ts'))
    const missing: string[] = []
    for (const file of actionFiles) {
      const source = fs.readFileSync(file, 'utf8')
      if (!source.includes("'use server'")) continue
      const hasDirectGuard =
        source.includes('assertGerenteSession') ||
        source.includes("from '../shared/actionHelpers'") ||
        source.includes("from '@/app/gerente/shared/actionHelpers'")
      if (!hasDirectGuard) {
        missing.push(rel(file))
      }
    }
    // relatorios/actions.ts é leitura RPC sem guard explícito (RLS) — excluído
    const allowedWithoutGuard = new Set([
      'app/gerente/relatorios/actions.ts',
      'app/gerente/relatorios/vendas/actions.ts',
      // Facade re-export → auth nas actions admin delegadas
      'app/gerente/clientes/actions.ts',
    ])
    const filtered = missing.filter((f) => !allowedWithoutGuard.has(f))
    expect(filtered, `actions sem assertGerenteSession: ${filtered.join(', ')}`).toEqual([])
  })

  it('layout /gerente não importa adminPolicy diretamente nem decide permissão', () => {
    const layoutSrc = fs.readFileSync(path.join(GERENTE_ROOT, 'layout.tsx'), 'utf8')
    expect(layoutSrc).toContain('resolveAdminSession')
    expect(layoutSrc).toMatch(/if\s*\(\s*!session\s*\)/)
    expect(layoutSrc).not.toMatch(/gerenteAdminDecision|canAccessAdmin|isPerfilPainelGerencial|@\/lib\/admin\/policy/)
  })

  it('assertGerenteSession exportado e tipado', () => {
    expect(typeof assertGerenteSession).toBe('function')
  })
})
