import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  assertSyncFlowEnvInCi,
  hasSyncFlowEnv,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

function hmacSha256Hex(secret: string, content: string): string {
  return crypto.createHmac('sha256', secret).update(content).digest('hex')
}

async function resolveOperadorIdE2E(admin: ReturnType<typeof createClient>) {
  const email =
    process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL?.trim() || 'e2e-operador@localhost.test'
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found?.id) return found.id
    if ((data.users?.length ?? 0) < 200) break
  }
  throw new Error(`Operador E2E não encontrado (rode seed E2E): ${email}`)
}

async function garantirProdutoEEstoqueParaTeste() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  const admin = createClient(url, serviceRole)

  const codigo = `E2E-SYNC-${Date.now()}`
  const nome = `Produto E2E Sync ${new Date().toISOString().slice(11, 19)}`

  const { data: prod, error: prodErr } = await admin
    .from('produtos')
    .insert({
      loja_id: LOJA_MATRIZ_ID,
      nome,
      codigo_barras: codigo,
      preco_varejo: 9.9,
      preco_atacado: null,
      origem: 'china_manual',
      tem_nf: false,
      unidade_medida: 'UN',
      ativo: true,
    })
    .select('id, preco_varejo')
    .single()

  if (prodErr || !prod) {
    throw new Error(`Falha ao criar produto E2E: ${prodErr?.message ?? 'sem retorno'}`)
  }

  const { error: estqErr } = await admin.from('estoque').upsert({
    loja_id: LOJA_MATRIZ_ID,
    produto_id: prod.id,
    quantidade_atual: 25,
    estoque_minimo: 0,
  })
  if (estqErr) throw new Error(`Falha ao preparar estoque E2E: ${estqErr.message}`)

  return { produtoId: prod.id as string, preco: Number(prod.preco_varejo ?? 9.9) }
}

async function enviarVendaViaSync(params: { produtoId: string; preco: number }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  const admin = createClient(url, serviceRole)
  const operadorId = await resolveOperadorIdE2E(admin)

  const vendaId = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  const caixaId = crypto.randomUUID()
  const total = Math.round(params.preco * 100) / 100

  const { error: caixaErr } = await admin.from('caixas').insert({
    id: caixaId,
    operador_id: operadorId,
    loja_id: LOJA_MATRIZ_ID,
    valor_inicial: 0,
    status: 'ABERTO',
  })
  if (caixaErr && !String(caixaErr.message).includes('duplicate')) {
    throw new Error(`Falha ao preparar caixa E2E: ${caixaErr.message}`)
  }

  const payload = {
    venda_id: vendaId,
    caixa_id: caixaId,
    operador_id: operadorId,
    troco_inicial_caixa: 0,
    forma_pagamento: 'DINHEIRO',
    total_bruto: total,
    total_desconto: 0,
    total_liquido: total,
    desconto_gerente_percentual: null,
    desconto_gerente_valor: null,
    gerente_id: null,
    itens: [
      {
        item_id: crypto.randomUUID(),
        produto_id: params.produtoId,
        nome: 'Item E2E Sync',
        quantidade: 1,
        preco_original: total,
        preco_unitario: total,
      },
    ],
  }

  const reqBody = JSON.stringify({
    events: [
      {
        id: eventId,
        tipo: 'VENDA_REGISTRADA',
        payload_json: JSON.stringify(payload),
        created_at: new Date().toISOString(),
      },
    ],
  })

  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomUUID()
  const device = 'e2e-sync-fluxo'
  const toSign = `${ts}.${nonce}.${device}.${reqBody}`
  const signature = hmacSha256Hex(process.env.SYNC_KEY!.trim(), toSign)

  const syncRes = await fetch(process.env.SYNC_ENDPOINT!.trim(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SYNC-KEY': process.env.SYNC_KEY!.trim(),
      'X-SYNC-TS': ts,
      'X-SYNC-NONCE': nonce,
      'X-SYNC-SIGNATURE': signature,
      'x-device-fingerprint': device,
      'x-loja-id': LOJA_MATRIZ_ID,
    },
    body: reqBody,
  })
  const syncJson = (await syncRes.json()) as {
    ok?: boolean
    processed?: string[]
    failed?: Array<{ id: string; error: string }>
    request_id?: string
    error?: string
  }

  expect(syncRes.ok, `sync-outbox HTTP ${syncRes.status}: ${JSON.stringify(syncJson)}`).toBe(true)
  expect(syncJson.ok).toBe(true)
  expect(
    syncJson.failed ?? [],
    `eventos com falha: ${JSON.stringify(syncJson.failed)}`,
  ).toHaveLength(0)
  expect(syncJson.processed ?? []).toContain(eventId)

  return { vendaId }
}

test.describe('Fluxo crítico sync-outbox -> gerente/vendas', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
    assertSyncFlowEnvInCi()
  })

  test('venda enviada pela Edge aparece no gerente', async ({ page }, testInfo) => {
    if (!hasSyncFlowEnv()) {
      testInfo.skip(
        true,
        'Local: defina NEXT_PUBLIC_SUPABASE_URL, PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, SYNC_ENDPOINT e SYNC_KEY.',
      )
      return
    }

    const { produtoId, preco } = await garantirProdutoEEstoqueParaTeste()
    const { vendaId } = await enviarVendaViaSync({ produtoId, preco })

    await loginGerente(page, { postLoginUrl: /\/(caixa|gerente)/ })

    await gotoApp(page, '/gerente/vendas')
    await expect(page.getByRole('heading', { name: /vendas/i })).toBeVisible()

    const vendaPrefix = `${vendaId.slice(0, 8)}…`
    let found = false
    for (let i = 0; i < 8; i++) {
      if (await page.getByText(vendaPrefix).first().isVisible().catch(() => false)) {
        found = true
        break
      }
      await page.reload()
      await page.waitForTimeout(800)
    }
    expect(found, `Venda ${vendaId} não apareceu em /gerente/vendas`).toBe(true)
  })

  test('timeline fiscal no detalhe exibe evento de erro', async ({ page }, testInfo) => {
    if (!hasSyncFlowEnv()) {
      testInfo.skip(
        true,
        'Local: defina NEXT_PUBLIC_SUPABASE_URL, PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, SYNC_ENDPOINT e SYNC_KEY.',
      )
      return
    }

    const { produtoId, preco } = await garantirProdutoEEstoqueParaTeste()
    const { vendaId } = await enviarVendaViaSync({ produtoId, preco })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
    const admin = createClient(url, serviceRole)

    const { data: doc, error: docErr } = await admin
      .from('documentos_fiscais_pendentes')
      .select('id')
      .eq('venda_id', vendaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    expect(docErr?.message).toBeFalsy()
    expect(doc?.id, 'Documento fiscal não encontrado para a venda criada no teste.').toBeTruthy()

    const { error: errRpc } = await admin.rpc('fiscal_marcar_erro', {
      p_documento_id: doc!.id,
      p_mensagem: 'E2E_TIMELINE_ERRO',
      p_retryable: true,
    })
    expect(errRpc?.message).toBeFalsy()

    await loginGerente(page, { postLoginUrl: /\/(caixa|gerente)/ })

    await gotoApp(page, '/gerente/financeiro')
    await expect(page.getByRole('heading', { name: /financeiro/i })).toBeVisible()

    const vendaPrefix = `${vendaId.slice(0, 8)}...`
    const row = page.locator('tr').filter({ hasText: vendaPrefix }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByRole('link', { name: /ver timeline/i }).click()

    await expect(page).toHaveURL(/\/gerente\/financeiro\/documento\//)
    await expect(page.getByRole('heading', { name: /Documento fiscal/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Timeline/i })).toBeVisible()
    await expect(page.getByText(/Erro atual/i)).toBeVisible()
    await expect(page.getByText(/E2E_TIMELINE_ERRO/)).toBeVisible()
  })
})
