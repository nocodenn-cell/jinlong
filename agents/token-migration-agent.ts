import type { ThemeFinding, TokenMigration, TokenMigrationResult } from './types.js'

export function run(findings: ThemeFinding[]): TokenMigrationResult {
  const migrations: TokenMigration[] = findings
    .filter(f => f.suggestion !== null)
    .map(f => ({
      file: f.file,
      line: f.line,
      original: f.value,
      suggested: f.suggestion as string,
    }))

  const patchLines: string[] = []
  const byFile = new Map<string, TokenMigration[]>()
  for (const m of migrations) {
    const list = byFile.get(m.file) ?? []
    list.push(m)
    byFile.set(m.file, list)
  }

  for (const [file, migs] of byFile) {
    patchLines.push(`--- a/${file}`)
    patchLines.push(`+++ b/${file}  (sugestões — não aplicar automaticamente)`)
    for (const m of migs) {
      patchLines.push(`@@ linha ${m.line} @@`)
      patchLines.push(`-  ${m.original}`)
      patchLines.push(`+  ${m.suggested}`)
    }
    patchLines.push('')
  }

  return {
    agent: 'token-migration',
    timestamp: new Date().toISOString(),
    totalMigrations: migrations.length,
    migrations,
    patchPreview: patchLines.join('\n'),
  }
}
