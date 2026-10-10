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
import { e2eProdutoCodigoBarras } from './helpers/env'

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
    if (found?.id) {
      const { data: usuario, error: usuarioErr } = await admin
        .from('usuarios')
        .select('id')
        .eq('id', found.id)
        .maybeSingle()
      if (usuarioErr) throw usuarioErr
      if (!usuario?.id) {
        throw new Error(`Operador E2E sem linha em public.usuarios (FK vendas): ${email}`)
      }
      return usuario.id as string
    }
    if ((data.users?.length ?? 0) < 200) break
  }
  throw new Error(`Operador E2E não encontrado (rode seed E2E): ${email}`)
}

async function garantirProdutoEEstoqueParaTeste() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  const admin = createClient(url, serviceRole)

  const codigo = e2eProdutoCodigoBarras()
  const { data: prod, error: prodErr } = await admin
    .from('produtos')
    .select('id, preco_varejo, loja_id')
    .eq('codigo_barras', codigo)
    .maybeSingle()

  if (prodErr || !prod?.id) {
    throw new Error(
      `Produto seed «${codigo}» não encontrado: ${prodErr?.message ?? 'sem retorno'} (migration 027 / PLAYWRIGHT_E2E_PRODUTO_CODIGO).`,
    )
  }

  const lojaId = (prod.loja_id as string | null) ?? LOJA_MATRIZ_ID
  const { error: estqErr } = await admin.from('estoque').upsert(
    {
      loja_id: lojaId,
      produto_id: prod.id,
      quantidade_atual: 25,
      estoque_minimo: 0,
    },
    { onConflict: 'loja_id,produto_id' },
  )
  if (estqErr) throw new Error(`Falha ao preparar estoque E2E: ${estqErr.message}`)

  return { produtoId: prod.id as string, preco: Number(prod.preco_varejo ?? 9.9) }
}

async function ensureCaixaAbertoOperador(
  admin: ReturnType<typeof createClient>,
  operadorId: string,
): Promise<string> {
  // uq_caixas_operador_aberto (mig 288/310): no máximo 1 ABERTO por operador.
  // Reutilizar evita INSERT silencioso ignorado + caixa_id fantasma no payload.
  const { data: aberto, error: selErr } = await admin
    .from('caixas')
    .select('id')
    .eq('operador_id', operadorId)
    .eq('status', 'ABERTO')
    .maybeSingle()
  if (selErr) throw new Error(`Falha ao buscar caixa ABERTO E2E: ${selErr.message}`)
  if (aberto?.id) return aberto.id as string

  const caixaId = crypto.randomUUID()
  const { error: caixaErr } = await admin.from('caixas').insert({
    id: caixaId,
    operador_id: operadorId,
    loja_id: LOJA_MATRIZ_ID,
    valor_inicial: 0,
    status: 'ABERTO',
  })
  if (caixaErr) throw new Error(`Falha ao preparar caixa E2E: ${caixaErr.message}`)
  return caixaId
}

async function enviarVendaViaSync(params: { produtoId: string; preco: number }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  const admin = createClient(url, serviceRole)
  const operadorId = await resolveOperadorIdE2E(admin)

  const vendaId = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  const caixaId = await ensureCaixaAbertoOperador(admin, operadorId)
  const total = Math.round(params.preco * 100) / 100

  const payload = {
    venda_id: vendaId,
    caixa_id: caixaId,
    loja_id: LOJA_MATRIZ_ID,
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
      // A função só confia no HMAC (X-SYNC-*) — `verify_jwt = false` está
      // declarado em `backend/supabase/functions/sync-outbox/config.toml` para
      // isso mesmo (dispositivo offline não tem sessão Supabase). Mas o
      // `supabase start` local (CI incluído) não honra esse config.toml por
      // função ao servir edge functions — comprovado com curl direto: sem
      // Authorization, Kong responde 401 "Missing authorization header" ANTES
      // de chegar no código da função (que nem referencia esse header).
      // Reproduzido localmente com o mesmo erro exato da CI. Enviar um
      // Authorization válido aqui é inofensivo em produção (onde o gateway já
      // ignora o header por causa do verify_jwt=false real) e fecha a lacuna
      // do stack local/CI sem tocar na função nem no seu esquema de auth.
      Authorization: `Bearer ${serviceRole}`,
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

  const { data: vendaRow, error: vendaErr } = await admin
    .from('vendas')
    .select('id')
    .eq('id', vendaId)
    .maybeSingle()
  if (vendaErr) throw new Error(`Pós-sync lookup venda: ${vendaErr.message}`)
  if (!vendaRow?.id) {
    throw new Error(`Venda ${vendaId} não persistiu após sync-outbox (processed sem linha).`)
  }

  return { vendaId, caixaId }
}

test.describe('Fluxo crítico sync-outbox -> gerente/vendas', () => {
  // Harness: loginGerente pode retry até ~90s; não alterar timeout global do Playwright.
  test.describe.configure({ timeout: 90_000 })

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

    // Artifact CI #1100: GERENTE autentica e a app redireciona para /admin/dashboard.
    await loginGerente(page, { postLoginUrl: /\/(caixa|gerente|admin)/ })

    await gotoApp(page, '/gerente/vendas')
    // Artifact CI #1105: /vendas/i casa 2 headings (h1 "Vendas e caixa" + h2 "Vendas do dia").
    await expect(page.getByRole('heading', { name: 'Vendas e caixa' })).toBeVisible()

    // VendasTable: texto "#XXXXXX" + title=UUID (não accessible name da célula).
    let found = false
    for (let i = 0; i < 8; i++) {
      if (await page.getByTitle(vendaId).isVisible().catch(() => false)) {
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

    // Contratos distintos: workflow seta AUTO_ENQUEUE_FISCAL_ON_SALE (caixa web);
    // Edge pós-sync usa AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE (opt-in, default off).
    // Informa loja para desambiguar as assinaturas 3-arg e 4-arg presentes no schema canônico.
    const { error: enqErr } = await admin.rpc('fiscal_enfileirar_documento_venda', {
      p_venda_id: vendaId,
      p_tipo_doc: 'NFC_E_STUB',
      p_payload: { origem: 'e2e_sync_fluxo', venda_id: vendaId },
      p_loja_id: LOJA_MATRIZ_ID,
    })
    expect(enqErr?.message, `fiscal_enfileirar: ${enqErr?.message}`).toBeFalsy()

    const { data: doc, error: docErr } = await admin
      .from('documentos_fiscais_pendentes')
      .select('id')
      .eq('venda_id', vendaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    expect(docErr?.message).toBeFalsy()
    expect(doc?.id, 'Documento fiscal não encontrado para a venda criada no teste.').toBeTruthy()

    // Artifact CI #1102/#1103: fiscal_marcar_erro 3-arg ambíguo; 6-arg quebra
    // (coluna erro_normalizado ausente no remoto). Usa normalizado com
    // p_error_code (assinatura presente e alinhada ao schema atual).
    const { error: errRpc } = await admin.rpc('fiscal_marcar_erro_normalizado', {
      p_documento_id: doc!.id,
      p_erro: 'E2E_TIMELINE_ERRO',
      p_transitorio: true,
      p_error_code: 'E2E_TIMELINE_ERRO',
      p_error_category: 'FALHA_COMUNICACAO_PROVIDER',
      p_retryable: true,
    })
    expect(errRpc?.message).toBeFalsy()

    await loginGerente(page, { postLoginUrl: /\/(caixa|gerente|admin)/ })

    await gotoApp(page, `/admin/financeiro/documento/${doc!.id}`)
    await expect(page).toHaveURL(/\/admin\/financeiro\/documento\//)
    await expect(page.getByRole('heading', { name: /Documento fiscal/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Timeline/i })).toBeVisible()
    await expect(page.getByText(/Erro atual/i)).toBeVisible()
    await expect(page.getByText('E2E_TIMELINE_ERRO', { exact: true })).toBeVisible()
  })
})
