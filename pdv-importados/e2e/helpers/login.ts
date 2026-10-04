import { expect, type Page } from '@playwright/test'
import { caixaOperadorEmail, caixaOperadorPassword } from './env'
import { E2E_GOTO_DOMCONTENTLOADED, gotoApp, LOGIN_PATH } from './url'

type LoginWaitOptions = {
  timeout?: number
  postLoginUrl?: RegExp
}

/** next dev + HMR: evitar waitUntil=load; 90s cobre compile frio (form/navegação, não o redirect). */
const defaultLoginTimeout = 90_000

/**
 * Destino canônico por perfil pós-login (`destinoPosLoginPorPerfil` em
 * `lib/auth/painelGerencial.ts`): GERENTE/DONO/ADMIN SEMPRE caem em
 * `/admin/dashboard` (nunca `/gerente`); OPERADOR sempre em `/caixa`.
 *
 * SEM `^` no início: `page.waitForURL(regex)` testa contra a URL ABSOLUTA
 * (`http://localhost:3000/admin/dashboard`), não o pathname — um regex
 * ancorado em `^\/admin` nunca bate contra uma string que começa com
 * `http://`. Comprovado ao vivo: a navegação chegou em `/admin/dashboard` e
 * o `waitForURL` mesmo assim estourou 20s de timeout, porque o `^` exigia a
 * string começar com `/` literal. Ainda assim não é um substring qualquer:
 * `\/admin\/dashboard` como literal não bate por acidente em `/caixa` nem em
 * `/gerente/caixas` — só numa URL que realmente contém esse caminho.
 */
const POST_LOGIN_URL_GERENTE = /\/admin\/dashboard(\/|$|\?)/
const POST_LOGIN_URL_OPERADOR = /\/caixa(\/|$|\?)/

/**
 * Redirect pós-login deveria ser questão de segundos sob carga normal — mas
 * 20s comprovadamente não bastam na PRIMEIRA navegação de um worker: a rota
 * de destino (`/admin/dashboard`, `/caixa`) pode precisar da MESMA compilação
 * fria do `next dev` que o próprio `/login`, não só o form. Reproduzido ao
 * vivo: 1ª tentativa estourou 20s parada em "waiting for navigation until
 * commit" (nada além disso no log — não é RBAC nem auth, é rota ainda não
 * compilada), retry imediato (rota já quente) passou em segundos. 45s cobre
 * esse caso sem voltar a herdar os 90s inteiros do formulário.
 */
const POST_LOGIN_REDIRECT_TIMEOUT_MS = 45_000

/**
 * `formTimeout`/`hydratedTimeout` são capados pelo orçamento restante do
 * chamador (`orcamentoRestante()` em `loginWithRetry`), não fixos em 30s
 * cada. Sem isso, os até 60s destas duas esperas nunca eram descontados do
 * orçamento rastreado da função — `loginWithRetry(timeout=90_000)` podia,
 * na prática, consumir ~90s só na 1ª tentativa E AINDA tentar um retry com
 * outros até ~60s de `fillLogin` não orçados, estourando bem além dos 90s
 * documentados e do timeout de teste do Playwright (que mata a página no
 * meio do login) — apontado no code review do PR #315. Passar o orçamento
 * real aqui torna `loginWithRetry` um deadline único e verdadeiramente
 * limitado por `timeout`, em vez de dois relógios independentes.
 */
async function fillLogin(
  page: Page,
  email: string,
  password: string,
  opts?: { formTimeout?: number; hydratedTimeout?: number },
): Promise<void> {
  const formTimeout = opts?.formTimeout ?? 30_000
  const hydratedTimeout = opts?.hydratedTimeout ?? 30_000
  await page.getByTestId('login-form').waitFor({ state: 'visible', timeout: formTimeout })
  await page.locator('[data-testid="login-form"][data-login-hydrated="1"]').waitFor({
    state: 'attached',
    timeout: hydratedTimeout,
  })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-senha').fill(password)
}

async function waitPostLogin(page: Page, postLoginUrl: RegExp, timeout: number): Promise<void> {
  try {
    await page.waitForURL(postLoginUrl, { timeout, waitUntil: 'commit' })
  } catch (err) {
    const alertTxt = (await page.getByRole('alert').first().textContent({ timeout: 1_000 }).catch(() => null))?.trim()
    const btn = (
      await page.getByRole('button', { name: /Entrar|Entrando/i }).textContent({ timeout: 1_000 }).catch(() => null)
    )?.trim()
    const emailVal = await page.locator('#login-email').inputValue({ timeout: 1_000 }).catch(() => '')
    const detail = [
      alertTxt && `alert=${alertTxt}`,
      btn && `btn=${btn}`,
      emailVal !== undefined && `email=${emailVal || '(vazio)'}`,
      `url=${page.url()}`,
    ]
      .filter(Boolean)
      .join(' | ')
    throw new Error(`Login não navegou para ${postLoginUrl}${detail ? ` (${detail})` : ''}`, {
      cause: err,
    })
  }
}

/**
 * Orçamento mínimo para tentar o retry (navegar + preencher + clicar + esperar
 * o redirect de novo). Abaixo disso o retry não tem como terminar antes do
 * timeout global do Playwright — tentar mesmo assim só troca a causa real da
 * 1ª falha por "Target page, context or browser has been closed" quando o
 * test runner força o fechamento da página no meio da 2ª tentativa.
 */
const ORCAMENTO_MINIMO_RETRY_MS = 20_000

function urlAtualSeguro(page: Page): string {
  return page.isClosed() ? '(página já fechada)' : page.url()
}

/** Retry 1x em PGRST303 / JWT future (skew local Docker). */
export async function loginWithRetry(
  page: Page,
  email: string,
  password: string,
  postLoginUrl: RegExp,
  timeout: number,
): Promise<void> {
  const startedAt = Date.now()
  // Nunca negativo: item 8 do contrato — um orçamento negativo não deve virar
  // "ainda dá tempo" por acidente em nenhuma comparação abaixo.
  const orcamentoRestante = () => Math.max(0, timeout - (Date.now() - startedAt))
  const timeoutRedirect = () => Math.min(POST_LOGIN_REDIRECT_TIMEOUT_MS, orcamentoRestante())
  // Nunca 0: `.waitFor({ timeout: 0 })` do Playwright significa "sem timeout"
  // (espera para sempre), o oposto de "orçamento esgotado". `1_000` é só um
  // piso de segurança — na prática nunca é atingido, porque os pontos de
  // chamada já garantem orçamento suficiente antes de chegar aqui.
  const timeoutFillLogin = () => Math.max(1_000, Math.min(30_000, orcamentoRestante()))

  await gotoApp(page, LOGIN_PATH, E2E_GOTO_DOMCONTENTLOADED)
  await fillLogin(page, email, password, {
    formTimeout: timeoutFillLogin(),
    hydratedTimeout: timeoutFillLogin(),
  })
  await page.getByRole('button', { name: /^Entrar$/ }).click()

  try {
    await waitPostLogin(page, postLoginUrl, timeoutRedirect())
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first)
    const retryable = /PGRST303|JWT issued at future|perfil|email=\(vazio\)|login\?/i.test(msg)
    if (!retryable) throw first

    const restante = orcamentoRestante()
    if (restante < ORCAMENTO_MINIMO_RETRY_MS) {
      throw new Error(
        `loginWithRetry: 1ª tentativa falhou e restam só ${restante}ms de orçamento ` +
          `(mínimo p/ retry: ${ORCAMENTO_MINIMO_RETRY_MS}ms) — abortando sem retry. ` +
          `url=${urlAtualSeguro(page)}, etapa=pós-1ª-tentativa`,
        { cause: first },
      )
    }
    if (page.isClosed()) {
      throw new Error(
        `loginWithRetry: 1ª tentativa falhou e a página já estava fechada antes do retry.`,
        { cause: first },
      )
    }

    // eslint-disable-next-line no-console -- diagnóstico intencional: causa
    // original sanitizada (mensagem, sem stack/credenciais) + URL + etapa.
    console.error('[loginWithRetry] 1ª tentativa falhou, tentando retry', {
      causaOriginal: msg,
      url: urlAtualSeguro(page),
      etapa: 'antes-do-retry',
      orcamentoRestanteMs: restante,
    })

    await page.waitForTimeout(1500)
    if (page.isClosed()) {
      throw new Error(
        `loginWithRetry: página fechou durante a espera de 1.5s antes do retry.`,
        { cause: first },
      )
    }

    try {
      await gotoApp(page, LOGIN_PATH, E2E_GOTO_DOMCONTENTLOADED)
      if (page.isClosed()) throw new Error('página fechou após navegar para o login')
      await fillLogin(page, email, password, {
        formTimeout: timeoutFillLogin(),
        hydratedTimeout: timeoutFillLogin(),
      })
      if (page.isClosed()) throw new Error('página fechou após preencher o formulário')
      await page.getByRole('button', { name: /^Entrar$/ }).click()
      await waitPostLogin(page, postLoginUrl, timeoutRedirect())
    } catch (retryErr) {
      // Nunca substitui `first` — o retry falhando é informação adicional,
      // não a causa. `first` viaja como `cause` mesmo quando o erro do retry
      // é genérico (ex.: "Target page ... has been closed").
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      throw new Error(
        `loginWithRetry: retry também falhou (${retryMsg}) em url=${urlAtualSeguro(page)} ` +
          `— causa original da 1ª tentativa preservada em .cause.`,
        { cause: first },
      )
    }
  }
}

/** Breakpoint `lg` do Tailwind — mesmo valor de `hidden lg:flex` em `AdminV2Shell.tsx`. */
const ADMIN_V2_DESKTOP_BREAKPOINT_PX = 1024

/**
 * Prova de RBAC pós-login do GERENTE: a URL sozinha não prova que o RBAC
 * autorizou o perfil certo, só a navegação do painel prova.
 *
 * Abaixo de `lg` (1024px) o `<aside>` que contém o `<nav>` fica `hidden`
 * (`AdminV2Shell.tsx`) — a navegação real só existe dentro do
 * `AdminV2MobileNavDrawer`, atrás do botão "Navegação", e só depois de
 * clicado. `getByRole('navigation')` direto sem abrir o drawer nunca
 * encontra nada em viewport mobile — não é falha de RBAC nem de login, é o
 * layout responsivo funcionando como desenhado. Comprovado ao vivo: as duas
 * projects mobile (`mobile-chrome-pixel`, `mobile-safari-iphone`) falhavam
 * 100% das vezes nesse ponto enquanto `chromium` passava.
 */
export async function assertGerenteNavVisible(page: Page): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 0
  if (viewportWidth === 0 || viewportWidth >= ADMIN_V2_DESKTOP_BREAKPOINT_PX) {
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 10_000 })
    return
  }
  const menuButton = page.getByRole('button', { name: 'Navegação' })
  await expect(menuButton).toBeVisible({ timeout: 10_000 })
  await menuButton.click()
  await expect(page.getByRole('dialog', { name: 'Navegação' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 10_000 })
  // Fecha de novo para não vazar o drawer aberto (backdrop cobrindo a tela
  // inteira) para o corpo do teste que chamou `loginGerente`.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Navegação' })).not.toBeVisible({ timeout: 10_000 })
}

export async function loginGerente(
  page: Page,
  options: LoginWaitOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? defaultLoginTimeout
  const postLoginUrl = options.postLoginUrl ?? POST_LOGIN_URL_GERENTE
  await loginWithRetry(
    page,
    process.env.PLAYWRIGHT_TEST_EMAIL!,
    process.env.PLAYWRIGHT_TEST_PASSWORD!,
    postLoginUrl,
    timeout,
  )
  await assertGerenteNavVisible(page)
}

export async function loginCaixaOperador(
  page: Page,
  options: LoginWaitOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? defaultLoginTimeout
  const postLoginUrl = options.postLoginUrl ?? POST_LOGIN_URL_OPERADOR
  await loginWithRetry(page, caixaOperadorEmail(), caixaOperadorPassword(), postLoginUrl, timeout)
  // Confirma que saiu de verdade do formulário de login (não só que a URL
  // mudou por um instante antes de eventualmente voltar).
  await expect(page.locator('#login-email')).not.toBeAttached({ timeout: 10_000 })
}
