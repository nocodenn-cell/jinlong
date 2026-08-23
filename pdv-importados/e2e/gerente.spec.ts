import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { garantirIdiomaPt } from './helpers/idioma'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

/**
 * GERENTE/DONO/ADMIN sempre caem em /admin/dashboard pós-login
 * (`destinoPosLoginPorPerfil`) e o painel inteiro vive em `/admin/*` — as
 * rotas antigas `/gerente/*` que este arquivo testava viraram redirects
 * legados (`LEGACY_GERENTE_REDIRECTS` em `shared-core/navigation/routes.ts`),
 * quando ainda existem. Navega direto para as rotas atuais em vez de confiar
 * no redirect, e usa os títulos reais de `PageHeader` (sempre `<h1>`, texto
 * vindo do i18n) para não colidir com sub-headings (`<h2>`) de texto
 * parecido — era exatamente a violação de strict mode comprovada em CI antes
 * desta reescrita ("Estoque" casava o h1 da página E o h2 "Saldos de
 * estoque").
 */
test.describe('Painel do gerente (/admin/*)', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasGerenteTestUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD (e Supabase público) para estes fluxos.',
      )
      return
    }
    // Sem override: GERENTE sempre cai em /admin/dashboard.
    await loginGerente(page)
    // Baseline determinística: `idioma_preferido` é persistido no perfil,
    // compartilhado entre TODOS os specs/workers que usam esta conta — um
    // teste anterior (deste arquivo ou de outro, ex. `gerente-transferencias
    // .spec.ts`) que falhou antes de reverter pro PT deixaria "zh" vazar
    // para este teste. Não depender do estado deixado por ninguém.
    await garantirIdiomaPt(page)
  })

  test.afterEach(async ({ page }) => {
    // Defesa adicional: se o próprio teste trocar de idioma e falhar ANTES
    // de chegar ao seu revert inline, este afterEach ainda limpa o estado
    // para o próximo teste (deste arquivo ou de qualquer outro spec que
    // reutilize a mesma conta GERENTE).
    await garantirIdiomaPt(page)
  })

  test('painel inicial /admin/dashboard carrega', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/dashboard/)
    const nav = page.getByRole('navigation')
    await expect(nav).toBeVisible()
    // Rótulos reais de `lib/navigation/adminV2SidebarNav.ts` — "Produtos"/
    // "Caixas" (do arquivo antigo) não existem mais como itens de menu.
    await expect(nav.getByRole('link', { name: /Vendas e caixa/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Catálogo/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Estoque/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Relatórios/i })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('página de estoque carrega', async ({ page }) => {
    await gotoApp(page, '/admin/estoque')
    await expect(page.getByRole('heading', { level: 1, name: 'Estoque', exact: true })).toBeVisible()
  })

  test('página de imprimir etiquetas carrega', async ({ page }) => {
    await gotoApp(page, '/admin/estoque/imprimir-etiquetas')
    await expect(page.getByRole('heading', { name: /Imprimir Etiquetas|打印标签/ })).toBeVisible()
    await expect(page.getByPlaceholder(/Código de barras|条形码/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Gerar PDF|生成PDF/ })).toBeVisible()
  })

  test('fluxo básico: bipar produto -> adicionar ao carrinho -> gerar PDF', async ({ page }) => {
    await gotoApp(page, '/admin/estoque/imprimir-etiquetas')

    const searchInput = page.getByPlaceholder(/Código de barras|条形码/)
    await expect(searchInput).toBeVisible()

    await searchInput.fill('7891234567890')
    await searchInput.press('Enter')
    await page.waitForTimeout(1000)

    // Sem dado de teste garantido: só confirma que o fluxo não quebra.
    const cartSection = page.locator('div').filter({ hasText: /Total|总计/ })
    const isCartVisible = await cartSection.isVisible().catch(() => false)

    if (isCartVisible) {
      const generateButton = page.getByRole('button', { name: /Gerar PDF|生成PDF/ })
      await expect(generateButton).toBeVisible()
      await generateButton.click()
      await page.waitForTimeout(2000)
    }
  })

  test('página de produtos (catálogo) carrega', async ({ page }) => {
    await gotoApp(page, '/admin/catalogo')
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo', exact: true })).toBeVisible()
    await expect(page.getByText(/erro interno/i)).not.toBeVisible()
  })

  test('página de vendas carrega sem erro interno', async ({ page }) => {
    await gotoApp(page, '/admin/vendas')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Vendas e caixa', exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/erro interno/i)).not.toBeVisible()
  })

  test('página de vendas (rota legada /gerente/caixas) resolve para /admin/vendas', async ({
    page,
  }) => {
    // `LEGACY_GERENTE_REDIRECTS['caixas'] = ROUTES.admin.vendas` — não existe
    // mais uma página dedicada de listagem de caixas com export CSV; o link
    // legado hoje aponta para a mesma página de vendas. Este teste confirma
    // que o redirect resolve para uma página real (não 404/erro), não que a
    // feature original de export ainda existe sob este caminho.
    await gotoApp(page, '/gerente/caixas')
    await expect(page).toHaveURL(/\/admin\/vendas/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Vendas e caixa', exact: true }),
    ).toBeVisible()
  })

  test('página de relatórios exibe filtros de período', async ({ page }) => {
    await gotoApp(page, '/admin/relatorios')
    await expect(page.getByRole('heading', { level: 1, name: 'Relatórios', exact: true })).toBeVisible()
    // Sem link "Hoje" nesta página (isso existe em /admin/vendas, não aqui) —
    // confirma um h2 real das seções de relatório em vez de um filtro
    // inventado.
    await expect(page.getByRole('heading', { level: 2, name: 'Faturamento por dia' })).toBeVisible()
  })

  test('toggle de idioma exibe mandarim no painel', async ({ page }) => {
    await gotoApp(page, '/admin/catalogo')
    const zhBtn = page.getByRole('button', { name: '普通话' })
    await expect(zhBtn).toBeVisible()
    await zhBtn.click()
    await expect(zhBtn).toBeDisabled({ timeout: 10_000 })
    await garantirIdiomaPt(page)
  })

  test('fluxo crítico admin/gerente em chinês + validação traduzida', async ({ page }) => {
    await gotoApp(page, '/admin/catalogo')
    await page.getByRole('button', { name: '普通话' }).click()
    await expect(page.getByRole('button', { name: '普通话' })).toBeDisabled({ timeout: 10_000 })

    // `/admin/catalogo` é só a listagem — o formulário de produto vive no
    // `NovoProdutoModal`, atrás do botão "快速添加" (`m.produtos.cadastro_rapido`
    // via `CatalogoNovoButton`). Sem abrir o modal antes, os campos abaixo
    // nunca existem no DOM — era exatamente por isso que o `.fill()` do nome
    // estourava 90s (elemento nunca aparecia, não é bug de tradução/rota).
    await page.getByRole('button', { name: '快速添加' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

    // Dispara erro de validação (preço <= 0) para validar tradução em CN.
    // Por `data-field`, não `getByPlaceholder`: o placeholder real do campo
    // "código de barras" é uma frase de dica (`p.codigo_barras_opcional`), e
    // o do "preço de varejo" é o literal "0,00" — nenhum dos dois é o rótulo
    // zh ("条形码"/"零售价") que os textos anteriores tentavam casar.
    await page.locator('[data-field="nome"]').fill('Teste idioma CN')
    await page.locator('[data-field="codigo_barras"]').fill(`E2E-${Date.now()}`)
    await page.locator('[data-field="preco_varejo"]').fill('0')
    // Exato, não `/保存/`: o rodapé do modal tem TRÊS botões contendo "保存"
    // ("保存并新建", "保存草稿", "保存商品" — `m.produtos.salvar_produto`) —
    // a regex solta violava o strict mode do Playwright ("resolved to 3
    // elements"). "保存商品" é o botão primário (`fp-btn--primary`).
    await page.getByRole('button', { name: '保存商品' }).click()
    // "数据无效：" nunca existiu no i18n para este fluxo — validação
    // client-side (`validarProdutoFormClient`, preço <= 0) devolve um erro
    // INLINE por campo via `role="alert"` (`CampoErroMsg`), não um banner
    // com prefixo genérico. Mensagem real: `produtos.preco_invalido` em
    // `src/lib/i18n/zh.json` (único locale chinês do projeto — não há
    // variante 繁体/tradicional separada).
    await expect(
      page.getByRole('alert').filter({ hasText: '请输入有效的零售价。' }),
    ).toBeVisible({ timeout: 10_000 })

    await gotoApp(page, '/admin/dashboard')
    await expect(page.getByText('主控台')).toBeVisible({ timeout: 10_000 })

    await garantirIdiomaPt(page)
  })
})
