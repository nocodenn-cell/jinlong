import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { getE2eBaseUrl, getE2eTestPort } from './e2e/helpers/url'

/**
 * Porta do `webServer` / `baseURL` quando não há `PLAYWRIGHT_BASE_URL`.
 * Padrão **3000** = mesmo `npm run dev`; fora do CI, `reuseExistingServer` evita um segundo `next dev`.
 * Isolado (dev em 3000 + E2E próprio): `PLAYWRIGHT_TEST_PORT=3009`.
 */
const e2ePort = getE2eTestPort()
const defaultBase = getE2eBaseUrl()
const baseURL = defaultBase

const isCi = process.env.CI === 'true'

/**
 * Guard de ambiente (go-live): o mesmo projeto Supabase serve produção,
 * Preview e E2E. Rodar o Playwright local com `.env.local` apontado para ele
 * grava em produção (11 vendas de R$ 68,00 em #307/#308). Mesmo padrão de
 * `backend/scripts/fallback-sem-rpc-real.mjs`: só localhost/127.0.0.1.
 * Confere o alvo EFETIVO: `process.env` e, na falta, os `.env*` que o
 * `next dev` carregaria. Override consciente: `ALLOW_NONLOCAL_E2E=1`.
 */
const ALVO_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/

function lerEnvArquivo(nome: string, chave: string): string | undefined {
  const arquivo = path.join(__dirname, nome)
  if (!fs.existsSync(arquivo)) return undefined
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && m[1] === chave) return m[2].replace(/^['"]|['"]$/g, '').trim()
  }
  return undefined
}

function supabaseUrlEfetiva(): string | undefined {
  const doEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (doEnv) return doEnv
  for (const nome of ['.env.development.local', '.env.local', '.env.development', '.env']) {
    const v = lerEnvArquivo(nome, 'NEXT_PUBLIC_SUPABASE_URL')
    if (v) return v
  }
  return undefined
}

if (process.env.ALLOW_NONLOCAL_E2E !== '1') {
  const supabaseUrl = supabaseUrlEfetiva()
  const alvosNaoLocais = [
    supabaseUrl && !ALVO_LOCAL.test(supabaseUrl) ? `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}` : null,
    !ALVO_LOCAL.test(baseURL) ? `baseURL=${baseURL}` : null,
  ].filter(Boolean)
  if (alvosNaoLocais.length > 0) {
    throw new Error(
      `RECUSADO: o alvo do E2E não é local (${alvosNaoLocais.join(', ')}). ` +
        'O E2E não pode rodar contra produção: só roda em localhost/127.0.0.1. ' +
        'Override consciente: ALLOW_NONLOCAL_E2E=1.',
    )
  }
}

/** No CI, sobe Next localmente quando `PLAYWRIGHT_E2E_WITH_DEV=1` (ver workflow opcional). */
const ciWithLocalServer =
  isCi && process.env.PLAYWRIGHT_E2E_WITH_DEV === '1'

/**
 * Suíte E2E geral: `next dev` estoura a heap (~8 min, 4096 MB) e o processo
 * morre; o que vem depois vira `ERR_CONNECTION_REFUSED`. Com
 * `PLAYWRIGHT_E2E_PROD_SERVER=1` o job já rodou `next build` e aqui só sobe
 * `next start`. O E2E crítico não define a flag e continua em `next dev`.
 */
function e2eWebServerCommand(port: string): string {
  if (process.env.PLAYWRIGHT_E2E_PROD_SERVER === '1') {
    return `npx next start -p ${port}`
  }
  return `npx next dev -p ${port}`
}

/**
 * Se a URL do `webServer` já responder, não executa `command` (reutiliza `localhost:${e2ePort}`).
 * `PLAYWRIGHT_REUSE_SERVER=0`: sempre tenta subir via `command` (útil para “sala limpa”; falha se porta ocupada).
 */
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_SERVER === '0'
    ? false
    : !isCi || !ciWithLocalServer

export default defineConfig({
  testDir: './e2e',
  // 150s, não 90s: `loginGerente`/`loginCaixaOperador` (e2e/helpers/login.ts) chamam
  // `loginWithRetry` com orçamento de até 90s (`defaultLoginTimeout`), e desde a correção
  // do P1 do code review do PR #315 esse orçamento é um deadline único e verdadeiramente
  // limitado (`fillLogin` agora recebe o orçamento restante em vez de dois timeouts fixos
  // de 30s cada não descontados) — mas um teste com `beforeEach` fazendo login PARTILHA o
  // timeout do teste com o corpo do teste. Se o timeout global fosse igual aos 90s do
  // próprio orçamento de login, um login no pior caso (perto de 90s) não deixaria tempo
  // NENHUM para as asserções do corpo do teste rodarem depois. 150s dá ~60s de folga real
  // para o corpo do teste após um login no pior caso, sem precisar que cada spec
  // reconfigure `describe.configure({timeout})` manualmente (só sync-fluxo-gerente.spec.ts
  // fazia isso antes). Sem essa folga, o Playwright mata a página no meio do login/corpo
  // do teste e o teardown fecha a página enquanto o catch de diagnóstico do login ainda
  // tenta lê-la, produzindo o erro secundário "Target page, context or browser has been
  // closed" que mascara a causa real.
  timeout: 150_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /**
     * `dependencies` entre os dois projetos mobile (não `workers: 1`, e não
     * depende de `chromium` — evita serializar a suíte inteira atrás de 3
     * arquivos): os 3 arquivos abaixo compartilham UMA única conta GERENTE
     * (`PLAYWRIGHT_TEST_EMAIL`), cujo `idioma_preferido` é uma coluna
     * persistida no perfil — sem isolamento por worker/projeto. Comprovado
     * ao vivo: `mobile-chrome-pixel` e `mobile-safari-iphone` rodando
     * `gerente.spec.ts` ao mesmo tempo (2 workers, mesma conta) — "painel
     * inicial /admin/dashboard carrega" falhou com "element(s) not found"
     * nos DOIS, porque um worker tinha acabado de rodar o teste de toggle
     * de idioma enquanto o outro ainda esperava texto em PT.
     * `mobile-safari-iphone` agora só começa depois de `mobile-chrome-pixel`
     * terminar — paralelismo dentro de cada projeto continua intacto, só os
     * dois donos concorrentes da mesma conta deixam de coexistir.
     * Risco residual documentado, não coberto por este encadeamento: os
     * mesmos 3 arquivos também existem em `chromium` (sem restrição de
     * `testMatch`) e podem rodar concorrentemente com qualquer um dos dois
     * projetos mobile, ou entre si dentro do mesmo projeto se `workers > 1`
     * agendar mais de um desses arquivos ao mesmo tempo — mitigação
     * completa exigiria contas GERENTE dedicadas por arquivo/projeto (fora
     * do escopo desta correção; não encadeado com `chromium` de propósito,
     * para não atrasar toda a suíte atrás de só 3 arquivos).
     */
    {
      name: 'mobile-chrome-pixel',
      use: { ...devices['Pixel 7'] },
      testMatch: [
        '**/e2e/admin-idioma.spec.ts',
        '**/e2e/gerente.spec.ts',
        '**/e2e/login-contrato-perfil.spec.ts',
      ],
    },
    {
      name: 'mobile-safari-iphone',
      use: { ...devices['iPhone 14'] },
      testMatch: [
        '**/e2e/admin-idioma.spec.ts',
        '**/e2e/gerente.spec.ts',
        '**/e2e/login-contrato-perfil.spec.ts',
      ],
      dependencies: ['mobile-chrome-pixel'],
    },
  ],
  webServer:
    ciWithLocalServer || !isCi
      ? {
          command: e2eWebServerCommand(e2ePort),
          url: defaultBase,
          reuseExistingServer,
          timeout: 120_000,
          // CI #1226: `next dev` reiniciou 3× por "memory threshold". Heap
          // maior reduz o thrash — mas NÃO 8192: runners github-hosted ~7GB;
          // 8GB (CI #1227) matou o runner ("lost communication"). 4096 cabe.
          env: {
            ...process.env,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096']
              .filter(Boolean)
              .join(' '),
          },
        }
      : undefined,
})
