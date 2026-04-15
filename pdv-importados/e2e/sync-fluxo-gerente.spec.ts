import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  assertSyncFlowEnvInCi,
  hasSyncFlowEnv,
} from './helpers/env'

const LOGIN_PATH = '/login'
const LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'

function hmacSha256Hex(secret: string, content: string): string {
  return crypto.createHmac('sha256', secret).update(content).digest('hex')
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
    const vendaId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const caixaId = crypto.randomUUID()
    const total = Math.round(preco * 100) / 100

    const payload = {
      venda_id: vendaId,
      caixa_id: caixaId,
      operador_id: null,
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
          produto_id: produtoId,
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
    const nonce = crypto.randomBytes(16).toString('hex')
    const toSign = `${ts}.${nonce}.${reqBody}`
    const signature = hmacSha256Hex(process.env.SYNC_KEY!.trim(), toSign)

    const syncRes = await fetch(process.env.SYNC_ENDPOINT!.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SYNC-KEY': process.env.SYNC_KEY!.trim(),
        'X-SYNC-TS': ts,
        'X-SYNC-NONCE': nonce,
        'X-SYNC-SIGNATURE': signature,
        'x-device-fingerprint': 'e2e-sync-fluxo',
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
    expect(syncJson.failed ?? []).toHaveLength(0)
    expect(syncJson.processed ?? []).toContain(eventId)

    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
    await page.getByPlaceholder('Senha').fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })

    await page.goto('/gerente/vendas')
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
})
