import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GUARD = path.join(ROOT, 'scripts', 'check-pdv-domain-boundary.mjs')

function runGuard(): { status: number; stderr: string; stdout: string } {
  try {
    const stdout = execFileSync('node', [GUARD], { cwd: ROOT, encoding: 'utf8' })
    return { status: 0, stderr: '', stdout }
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string }
    return { status: err.status, stderr: err.stderr, stdout: err.stdout }
  }
}

describe('pdv-domain-boundary guard', () => {
  it('script registrado no package.json (guard:core / guard:all)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts?.['check:pdv-domain-boundary']).toContain('check-pdv-domain-boundary')

    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8'))
    expect(rootPkg.scripts?.['guard:all']).toContain('check:pdv-domain-boundary')
  })

  it('passa hoje contra o repositório real (baseline sem violações)', () => {
    const res = runGuard()
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('OK')
  })

  it('falha se um arquivo novo em app/caixa acessar produtos direto, fora dos ports sancionados', () => {
    const fixture = path.join(ROOT, 'app', 'caixa', '__fixture_violacao_boundary.ts')
    fs.writeFileSync(
      fixture,
      "export async function violacao(supabase: any) {\n  return supabase.from('produtos').select('*')\n}\n",
    )
    try {
      const res = runGuard()
      expect(res.status).not.toBe(0)
      expect(res.stderr + res.stdout).toContain('__fixture_violacao_boundary.ts')
      expect(res.stderr + res.stdout).toContain('produtos')
    } finally {
      fs.rmSync(fixture, { force: true })
    }
  })

  it('não falha para os arquivos port sancionados (mesma query, arquivo permitido)', () => {
    const fixture = path.join(ROOT, 'app', 'caixa', 'server', 'caixaCatalogo.impl.ts')
    const original = fs.readFileSync(fixture, 'utf8')
    expect(original).toMatch(/\.from\(['"]produtos['"]\)/)
    const res = runGuard()
    expect(res.status).toBe(0)
  })
})
