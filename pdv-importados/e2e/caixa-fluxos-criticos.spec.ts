import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser } from './helpers/env'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { loginCaixaOperador } from './helpers/login'
import { gotoApp } from './helpers/url'
import {
  confirmarModalValorNumerico,
  MODAL_TITULO_FECHAR,
} from './helpers/caixaModais'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — fluxos críticos (abrir → sangria → fechar)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_CAIXA_TEST_EMAIL e PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR) + Supabase público. Gerente não acessa /caixa.',
      )
      return
    }
    await loginCaixaOperador(page, { postLoginUrl: /\/(caixa|gerente)/ })
  })

  test('fluxo: abrir caixa → sangria R$50 → limpar cupom → fechar com valor do sistema', async ({
    page,
  }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)

    await ensureCaixaAberto(page, '120')

    // Layout clássico: sangria fica no menu Operações (não há mais botão "Sangria (-)").
    await page.getByRole('button', { name: /^Operações$/i }).click()
    // Nome acessível inclui atalho: "Sangria Ctrl+Shift+R"
    await page.getByRole('menuitem', { name: /Sangria/i }).click()
    await expect(page.getByRole('dialog')).toContainText(/Registrar sangria|Confirmar sangria/i, {
      timeout: 10_000,
    })
    const confirmarAbertura = page.getByRole('button', { name: /^Confirmar$/i })
    if (await confirmarAbertura.isVisible().catch(() => false)) {
      await confirmarAbertura.click()
    }
    await expect(page.getByRole('dialog')).toContainText(/Registrar sangria/i, { timeout: 10_000 })
    // `,`, não `.`: os botões de valor rápido usam `formatDecimalBRL`
    // (lib/format/money.ts), que formata via `toLocaleString('pt-BR', ...)`
    // — separador decimal pt-BR é vírgula ("R$ 50,00"), nunca ponto. Um
    // regex com `\.` (ponto literal) nunca casava o nome acessível real,
    // travando 150s num locator estruturalmente inexistente — não era
    // ECONNRESET nem flakiness. Asserção curta e diagnóstica antes do clique
    // (não um `.click()` cego): se o valor mudar de novo no futuro, falha
    // rápido apontando exatamente para este locator, não para um timeout
    // genérico de 150s.
    const btnValorRapido50 = page.getByRole('button', { name: /R\$\s*50,00/ })
    await expect(btnValorRapido50).toBeVisible({ timeout: 10_000 })
    await btnValorRapido50.click()
    await page.getByRole('button', { name: /^Confirmar$/ }).click()
    // Filtrado por texto, não `getByRole('status')` sozinho: o toast "Caixa
    // aberto (...)" de `ensureCaixaAberto` ainda não tinha se auto-dispensado
    // quando o toast de sangria aparece — dois toasts com role="status" ao
    // mesmo tempo é um estado real de UI (empilhamento de notificações), não
    // um bug; violava o strict mode do Playwright, não travava por role
    // incorreto (isso já foi corrigido — ver comentário acima em
    // `useCaixaStatusMovimentacoes.ts` sobre o `kind: "success"` ausente).
    await expect(
      page.getByRole('status').filter({ hasText: /registrada com sucesso|pendente|gerente/i }),
    ).toBeVisible({ timeout: 25_000 })

    // O sucesso da sangria abre automaticamente o modal "Comprovante de
    // Sangria" (`CaixaMovimentacaoReciboModal`) por cima da tela — seu
    // backdrop intercepta cliques em QUALQUER botão atrás dele até ser
    // fechado. O teste nunca fechava esse modal antes de tentar continuar.
    await page
      .getByRole('dialog', { name: /Comprovante de Sangria/i })
      .getByRole('button', { name: /^Fechar$/ })
      .click()

    // "Novo cupom" não existe mais — o botão atual é "Nova venda (+)"
    // (`handleNovaVendaOuEspera`, useCaixaVendasEmEspera.ts): com o carrinho
    // vazio (nenhum produto foi adicionado neste teste, só a sangria), ele
    // cai no branch `itens.length === 0` e chama `novoCupom()` direto — o
    // mesmo efeito que "Novo cupom" tinha, só com rótulo atual. Mesmo botão
    // já usado com o nome certo em caixa-venda-em-espera.spec.ts.
    await page.getByRole('button', { name: /Nova venda \(\+\)/ }).click()

    // "Saldo estimado" nunca existiu na UI atual — o cabeçalho mostra
    // "Fundo: {{valor}}" (`CaixaPdvTopBar.tsx`, `m.caixa.topbar_fundo`), com
    // `valorSistemaDinheiro` (RPC `obter_status_caixa_operador`) já refletindo
    // fundo inicial − sangrias + vendas, não um valor estático de abertura.
    // `test.skip()` aqui SEMPRE disparava, em qualquer execução — não era
    // um branch condicional de "blind closure" (comprovado: `pdv_config
    // .blind_closure = false` neste ambiente), então uma precondição
    // obrigatória do fluxo crítico nunca era exercida. Falha explícita, não
    // skip: se "Fundo:" não aparecer com caixa aberto e blind closure
    // desligado, é uma regressão real, não um caminho alternativo esperado.
    const headerText = await page.locator('header').innerText()
    expect(headerText, 'cabeçalho do caixa deveria exibir "Fundo:" com blind closure desligado').toContain(
      'Fundo:',
    )
    const m = headerText.match(/Fundo:\s*R\$\s*([\d.,]+)/i)
    // `.` é separador de milhar em pt-BR (`formatDecimalBRL`), não decimal —
    // remove TODOS antes de trocar a vírgula decimal por ponto.
    const bruto = m?.[1]?.replace(/\./g, '').replace(',', '.').trim()
    expect(bruto, `não foi possível ler o valor de "Fundo:" no cabeçalho (texto: "${headerText}")`).toBeTruthy()
    expect(Number.isNaN(Number.parseFloat(bruto!)), `valor de "Fundo:" não é numérico: "${bruto}"`).toBe(false)

    await page.getByRole('button', { name: /Fechar caixa|结算收银台|結算收銀台/ }).click()
    await confirmarModalValorNumerico(page, MODAL_TITULO_FECHAR, bruto)
    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado\./i, { timeout: 25_000 })
  })
})
