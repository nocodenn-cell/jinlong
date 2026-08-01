#!/usr/bin/env node
/**
 * Guarda de invalidação de cache por evento de domínio.
 *
 * Regra: server action declara O QUE ACONTECEU (`revalidarDominio('venda.finalizada')`),
 * nunca QUAL TELA MEXER (`revalidatePath('/admin/vendas')`). O mapa evento → telas
 * mora só em `lib/navigation/revalidarDominio.ts`.
 *
 * Motivo: antes desta guarda havia 53 chamadas para `/gerente/*` — rotas que hoje
 * são redirect, portanto no-ops — enquanto telas canônicas `/admin/*` ficavam sem
 * revalidação nenhuma. Sangria não atualizava /admin/vendas; recebimento não
 * atualizava /admin/estoque.
 *
 * Uso: node scripts/check-revalidate-boundary.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Único módulo autorizado a chamar `revalidatePath`. */
const AUTORIDADE = '/lib/navigation/revalidarDominio.ts'

/**
 * Exceções conscientes — fora do domínio operacional mapeado.
 * Não acrescente nada aqui sem antes tentar modelar o evento.
 */
const EXCECOES = [
  // Troca de idioma / provisionamento / implantação: chrome e fluxos de setup,
  // não eventos do domínio operacional da loja.
  '/app/gerente/idioma/actions.ts',
  '/app/caixa/idioma/actions.ts',
  '/app/admin/provisionamento/actions.ts',
  '/app/admin/implantacao/actions.ts',
  '/app/admin/funcionarios/actions.ts',
]

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'coverage') continue
      walk(p, files)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

const normRoot = normalize(ROOT).replace(/\\/g, '/')
const rel = (abs) => normalize(abs).replace(/\\/g, '/').slice(normRoot.length)

const alvos = [
  ...walk(join(ROOT, 'app')),
  ...walk(join(ROOT, 'lib')),
  ...walk(join(ROOT, 'components')),
]

let falhou = false

for (const file of alvos) {
  const r = rel(file)
  if (r === AUTORIDADE || EXCECOES.some((e) => r.endsWith(e))) continue

  const conteudo = readFileSync(file, 'utf8')

  if (/\brevalidatePath\s*\(/.test(conteudo)) {
    console.error(
      `[revalidate] ${r} chama revalidatePath direto — use revalidarDominio('<evento>')`,
    )
    falhou = true
  }

  // Rotas /gerente/* são redirects: revalidá-las é sempre no-op.
  const mortas = conteudo.match(/['"`]\/gerente\/[^'"`]*['"`]/g)
  if (mortas && /revalidat/i.test(conteudo)) {
    console.error(
      `[revalidate] ${r} referencia rota legada em revalidação: ${[...new Set(mortas)].join(', ')}`,
    )
    falhou = true
  }
}

if (falhou) {
  console.error('\nMapa evento → telas: lib/navigation/revalidarDominio.ts')
  process.exit(1)
}

console.log('check-revalidate-boundary: OK')
