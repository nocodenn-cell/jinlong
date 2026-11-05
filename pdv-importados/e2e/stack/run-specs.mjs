// Executa os specs de Golden Flow contra a stack E2E isolada. Credenciais vão só para o ambiente do processo.
// Uso: node e2e/stack/run-specs.mjs [--evidence <pasta fora do repo>]
// Aquecimento: o next dev compila cada rota na primeira visita (pode passar de 45 s, o limite de navegação do login).
// Sobe o servidor, pré-compila /login e /caixa e o Playwright reutiliza esse mesmo servidor.
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pdv = resolve(here, '..', '..')
const read = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]
}))
const e = read(join(here, '.env.e2e'))
const s = JSON.parse(readFileSync(join(here, '.secrets.json'), 'utf8'))
const args = process.argv.slice(2)
const evidence = args.includes('--evidence') ? args[args.indexOf('--evidence') + 1] : join(pdv, 'test-results', 'e2e-stack')
if (!existsSync(join(pdv, 'playwright.config.ts'))) throw new Error('playwright.config.ts não encontrado')

const port = e.E2E_APP_PORT
const apiUrl = `http://localhost:${e.E2E_API_PORT}`
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: e.E2E_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: e.E2E_SERVICE_KEY,
  PLAYWRIGHT_CAIXA_TEST_EMAIL: s.email,
  PLAYWRIGHT_CAIXA_TEST_PASSWORD: s.password,
  PLAYWRIGHT_TEST_PORT: port,
  PLAYWRIGHT_BASE_URL: `http://localhost:${port}`,
  PLAYWRIGHT_E2E_PRODUTO_CODIGO: '7898512340003',
  PLAYWRIGHT_REUSE_SERVER: '1',
}
const specsAll = ['e2e/caixa-golden-flow-cycle5.spec.ts', 'e2e/caixa-venda-multi-pagamento.spec.ts']
const specs = process.env.E2E_SPECS ? process.env.E2E_SPECS.split(',') : specsAll

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
async function aguardar(path, limiteMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < limiteMs) {
    try {
      const r = await fetch(`http://localhost:${port}${path}`, { redirect: 'manual' })
      if (r.status < 500) return { status: r.status, segundos: Math.round((Date.now() - t0) / 1000) }
    } catch { /* servidor ainda subindo */ }
    await sleep(3000)
  }
  throw new Error(`servidor não respondeu em ${path}`)
}

// log do servidor em pasta separada: o Playwright apaga o diretório de --output ao iniciar
const logDir = evidence + '-server';
mkdirSync(logDir, { recursive: true });
const nextLog = openSync(join(logDir, 'next-dev.log'), 'w');
// --prod: build de produção + next start (o caminho previsto em playwright.config.ts via PLAYWRIGHT_E2E_PROD_SERVER=1).
// Sem compilação sob demanda durante o teste: o next dev levava ~36 s para renderizar /caixa e estourava o login.
const prod = args.includes('--prod')
if (prod) {
  const b = spawnSync('npx', ['next', 'build'], { cwd: pdv, env, shell: true, encoding: 'utf8' })
  writeFileSync(join(logDir, 'next-build.log'), (b.stdout ?? '') + (b.stderr ?? ''))
  if (b.status !== 0) { console.error(`next build falhou (exit ${b.status}); ver ${join(logDir, 'next-build.log')}`); process.exit(1) }
  console.log('next build: OK')
}
// Porta precisa estar livre: um servidor antigo responderia no lugar do novo (build diferente, chunks inconsistentes).
try {
  const ocupada = await fetch(`http://localhost:${port}/login`, { redirect: 'manual' })
  throw new Error(`porta ${port} já está em uso (HTTP ${ocupada.status}); encerre o servidor anterior antes de rodar`)
} catch (err) {
  if (String(err.message).includes('já está em uso')) throw err
}
// Executa o binário do Next direto: o PID é o próprio servidor, e taskkill /T encerra a árvore inteira.
const nextBin = join(pdv, 'node_modules', 'next', 'dist', 'bin', 'next')
const next = spawn(process.execPath, [nextBin, prod ? 'start' : 'dev', '-p', port], { cwd: pdv, env, stdio: ['ignore', nextLog, nextLog] })
let status = 1
try {
  console.log('aquecimento /login:', JSON.stringify(await aguardar('/login', 600_000)))
  const logAtual = readFileSync(join(logDir, 'next-dev.log'), 'utf8')
  if (logAtual.includes('EADDRINUSE')) throw new Error('servidor não conseguiu escutar na porta (EADDRINUSE)')
  console.log('aquecimento /caixa:', JSON.stringify(await aguardar('/caixa', 900_000)))
  const r = spawnSync('npx', ['playwright', 'test', ...specs, '--project=chromium', '--reporter=list',
    '--trace=on', `--output=${evidence}`], { cwd: pdv, env, stdio: 'inherit', shell: true })
  status = r.status ?? 1
} finally {
  spawnSync('taskkill', ['/pid', String(next.pid), '/T', '/F'], { stdio: 'ignore' })
}
process.exit(status)
