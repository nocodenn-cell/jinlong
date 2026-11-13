#!/usr/bin/env node
/**
 * Resumo por spec do relatório JSON do Playwright (`playwright-report/results.json`).
 *
 * Por que existe: o job e2e-playwright só mostrava "N passed / M failed", sem dizer qual
 * spec passou ou falhou. Isto transforma o relatório em uma tabela por arquivo, escrita no
 * GITHUB_STEP_SUMMARY (e no stdout), para que o resultado de cada spec fique verificável
 * no próprio run (VAL-01).
 *
 * Uso: node scripts/e2e-resumo-por-spec.mjs [caminho/do/results.json]
 * Sem argumento, lê `playwright-report/results.json` a partir do cwd.
 * Sai com código 0 mesmo se o relatório não existir: quem decide se o job passou é o Playwright.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Specs que precisam aparecer explicitamente no resumo (VAL-01). */
export const SPECS_VAL01 = ['caixa-golden-flow-cycle5.spec.ts', 'caixa-pagamento-atalhos.spec.ts']

/**
 * Achata o relatório JSON do Playwright em { arquivo: { passed, failed, flaky, skipped, falhas[] } }.
 * `status` do teste: expected (passou), unexpected (falhou), flaky (falhou e passou em retry), skipped.
 */
export function resumirPorSpec(relatorio) {
  const porArquivo = {}

  const registrar = (arquivo, titulo, status, erro) => {
    const alvo = (porArquivo[arquivo] ??= { passed: 0, failed: 0, flaky: 0, skipped: 0, falhas: [] })
    if (status === 'expected') alvo.passed += 1
    else if (status === 'unexpected') {
      alvo.failed += 1
      alvo.falhas.push({ titulo, erro })
    } else if (status === 'flaky') alvo.flaky += 1
    else alvo.skipped += 1
  }

  const percorrer = (suite) => {
    for (const spec of suite.specs ?? []) {
      const arquivo = spec.file ?? suite.file ?? '(desconhecido)'
      for (const teste of spec.tests ?? []) {
        const resultados = teste.results ?? []
        const ultimo = resultados[resultados.length - 1]
        const erro = ultimo?.error?.message?.split('\n')[0]
        registrar(path.basename(arquivo), spec.title, teste.status, erro)
      }
    }
    for (const filho of suite.suites ?? []) percorrer(filho)
  }

  for (const suite of relatorio.suites ?? []) percorrer(suite)
  return porArquivo
}

/** Markdown com uma linha por arquivo e destaque para os specs da VAL-01. */
export function gerarMarkdown(resumo) {
  const linhas = [
    '## E2E Playwright — resultado por spec',
    '',
    '| Spec | Passou | Falhou | Flaky | Pulado | VAL-01 |',
    '|---|---:|---:|---:|---:|:---:|',
  ]
  for (const arquivo of Object.keys(resumo).sort()) {
    const r = resumo[arquivo]
    const marca = SPECS_VAL01.includes(arquivo) ? 'sim' : ''
    linhas.push(`| ${arquivo} | ${r.passed} | ${r.failed} | ${r.flaky} | ${r.skipped} | ${marca} |`)
  }
  const falhas = Object.entries(resumo).flatMap(([arquivo, r]) =>
    r.falhas.map((f) => `- \`${arquivo}\` › ${f.titulo}${f.erro ? ` — ${f.erro}` : ''}`),
  )
  if (falhas.length > 0) linhas.push('', '### Testes que falharam', '', ...falhas)
  const faltando = SPECS_VAL01.filter((s) => !(s in resumo))
  if (faltando.length > 0) {
    linhas.push('', `**Specs da VAL-01 ausentes do relatório:** ${faltando.join(', ')} — VAL-01 NÃO VERIFICADA.`)
  }
  return linhas.join('\n') + '\n'
}

function main() {
  const alvo = process.argv[2] ?? path.join(process.cwd(), 'playwright-report', 'results.json')
  if (!fs.existsSync(alvo)) {
    const msg = `Relatório não encontrado em ${alvo}: VAL-01 NÃO VERIFICADA.`
    console.log(msg)
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${msg}\n`)
    return
  }
  const relatorio = JSON.parse(fs.readFileSync(alvo, 'utf8'))
  const md = gerarMarkdown(resumirPorSpec(relatorio))
  console.log(md)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
