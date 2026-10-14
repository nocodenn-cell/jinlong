import { test } from '@playwright/test'
import { gotoApp } from './helpers/url'
import { loginGerente } from './helpers/login'

// TEMPORÁRIO (investigação de memória; não versionar). Visita as rotas que os specs afetados usam.
const ROTAS = (process.env.MEM_ROUTES ?? '/admin/dashboard,/admin/estoque,/admin/estoque/imprimir-etiquetas,/admin/catalogo,/admin/vendas,/gerente/caixas,/admin/relatorios').split(',')

test('visita rotas em sequência', async ({ page }) => {
  test.setTimeout(900_000)
  await loginGerente(page)
  for (const rota of ROTAS) {
    const t0 = Date.now()
    await gotoApp(page, rota)
    await page.waitForLoadState('networkidle').catch(() => {})
    console.log(`ROTA ${rota} ${Date.now() - t0}ms`)
  }
})
