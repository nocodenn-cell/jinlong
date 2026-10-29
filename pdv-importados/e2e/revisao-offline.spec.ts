/**
 * Fila de revisão de vendas offline (/admin/revisao-offline) — E2E contra Supabase LOCAL.
 *
 * Rodar com 1 worker (eventos e contas compartilhadas):
 *   npx playwright test e2e/revisao-offline.spec.ts --project=chromium --workers=1
 *
 * Fixture sintética: eventos enfileirados com service_role (sync_enfileirar_revisao) nas lojas seed
 * Matriz (empresa A) e Loja B1 (empresa B). Nada de dado real. Cobre:
 *  - gerente A vê só a própria empresa (evento da B não aparece; RPC direto também não acha);
 *  - gerente B não vê nem decide evento da A;
 *  - autoaprovação bloqueada na UI e no servidor;
 *  - justificativa obrigatória (UI e RPC);
 *  - aprovar e rejeitar pela tela + histórico (quem/quando/por quê);
 *  - aprovação concorrente: só uma decisão vale; repetição do mesmo usuário é idempotente.
 */
import crypto from 'node:crypto'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

const MATRIZ = 'a0000001-0000-4000-8000-000000000001'
const LOJA_B1 = 'b0000001-0000-4000-8000-000000000001'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)

test.describe.configure({ mode: 'serial' })
test.skip(!url || !anon || !service || !local || !process.env.PLAYWRIGHT_TEST_EMAIL, 'só Supabase local com service_role e gerente seed')

const run = `E2E-RV-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
const ev = {
  aprovar: `${run}-A-APROVAR`,
  rejeitar: `${run}-A-REJEITAR`,
  meu: `${run}-A-MEU`,
  outraEmpresa: `${run}-B`,
  corrida: `${run}-A-CORRIDA`,
}
const ids: Record<string, string> = {}
const caixas: Record<string, string> = {}
let admin: SupabaseClient
let uid: { gerenteA: string; donoA: string; opInativoA: string; gerenteB: string }
const senhaB = crypto.randomBytes(18).toString('base64url')

async function idPorEmail(email: string): Promise<string> {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) return u.id
    if (data.users.length < 200) break
  }
  throw new Error(`usuário seed ausente: ${email}`)
}

async function enfileirar(eventId: string, loja: string, operador: string | null): Promise<string> {
  const caixa = crypto.randomUUID()
  caixas[eventId] = caixa
  const payload = JSON.stringify({ valor_inicial: 12.5 })
  const { data, error } = await admin.rpc('sync_enfileirar_revisao', {
    p: {
      event_id: eventId,
      tipo: 'CAIXA_ABERTO',
      payload,
      payload_sha256: crypto.createHash('sha256').update(payload).digest('hex'),
      origem: 'legado',
      loja_id: loja,
      caixa_id: caixa,
      operador_id: operador,
      horario_dispositivo: new Date().toISOString(),
      classificacao: 'APOS_INATIVACAO',
      motivo: 'OPERADOR_SEM_ACESSO_NO_RECEBIMENTO',
      evidencias: { perdeu_acesso_em: '2026-10-01T12:00:00Z', recebimentos: 1 },
    },
  } as never)
  if (error) throw new Error(`enfileirar ${eventId}: ${error.message}`)
  const id = (data as { id?: string } | null)?.id
  if (!id) throw new Error(`enfileirar ${eventId}: sem id (${JSON.stringify(data)})`)
  return id
}

async function clienteComo(email: string, senha: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

async function statusNoBanco(id: string) {
  const { data, error } = await admin
    .from('sync_eventos_revisao')
    .select('status, decidido_por, decidido_em, decisao_motivo')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as { status: string; decidido_por: string | null; decidido_em: string | null; decisao_motivo: string | null }
}

/** Em `next dev` o primeiro clique pode chegar antes da hidratação: repete até o efeito aparecer. */
async function clicarAte(page: Page, alvo: Locator, efeito: Locator) {
  await expect(async () => {
    if (!(await efeito.isVisible())) await alvo.click()
    await expect(efeito).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

/** uq_caixas_operador_aberto: 1 caixa ABERTO por operador. Aprovar CAIXA_ABERTO cria um; fecha os do operador sintético. */
async function fecharCaixasDoOperadorSintetico() {
  const { error } = await admin
    .from('caixas')
    .update({ status: 'FECHADO', data_fechamento: new Date().toISOString(), valor_fechamento: 12.5, fechamento_diferenca: 0 })
    .eq('operador_id', uid.opInativoA)
    .eq('status', 'ABERTO')
  if (error) throw new Error(`fechar caixas do operador sintético: ${error.message}`)
}

const linha = (page: Page, eventId: string) => page.locator(`[data-testid="revisao-linha"][data-event-id="${eventId}"]`)

test.beforeAll(async () => {
  admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  uid = {
    gerenteA: await idPorEmail(process.env.PLAYWRIGHT_TEST_EMAIL!),
    donoA: await idPorEmail('dono.seed@local.test'),
    opInativoA: await idPorEmail('op.inativo.a@homolog.local'),
    gerenteB: await idPorEmail('gerente.b@homolog.local'),
  }
  // Senha aleatória só desta execução para o gerente sintético da empresa B (nunca gravada em arquivo).
  const { error: pwErr } = await admin.auth.admin.updateUserById(uid.gerenteB, { password: senhaB })
  if (pwErr) throw pwErr
  // Aprovar CAIXA_ABERTO cria o caixa; fecha caixas ABERTO que execuções anteriores deixaram para o operador sintético.
  await fecharCaixasDoOperadorSintetico()
  ids.aprovar = await enfileirar(ev.aprovar, MATRIZ, uid.opInativoA)
  ids.rejeitar = await enfileirar(ev.rejeitar, MATRIZ, uid.opInativoA)
  ids.meu = await enfileirar(ev.meu, MATRIZ, uid.gerenteA)
  ids.outraEmpresa = await enfileirar(ev.outraEmpresa, LOJA_B1, null)
  ids.corrida = await enfileirar(ev.corrida, MATRIZ, uid.opInativoA)
})

test('gerente A vê os pendentes da própria empresa e nunca os da empresa B', async ({ page }) => {
  await loginGerente(page)
  await gotoApp(page, '/admin/revisao-offline')
  await expect(page.getByTestId('revisao-offline')).toBeVisible({ timeout: 30_000 })
  await expect(linha(page, ev.aprovar)).toBeVisible()
  await expect(linha(page, ev.meu)).toBeVisible()
  await expect(linha(page, ev.outraEmpresa)).toHaveCount(0)
  // motivo da pendência traduzido + detalhes
  await expect(linha(page, ev.aprovar)).toContainText('Operador sem acesso quando o evento chegou')
  await clicarAte(page, linha(page, ev.aprovar).getByTestId('revisao-detalhes'), page.getByTestId('revisao-detalhe'))
  await expect(page.getByTestId('revisao-detalhe')).toContainText('não serve de prova')
})

test('servidor: gerente A não acha evento da empresa B; gerente B não vê nem decide evento da A', async () => {
  const gA = await clienteComo(process.env.PLAYWRIGHT_TEST_EMAIL!, process.env.PLAYWRIGHT_TEST_PASSWORD!)
  const r1 = await gA.rpc('revisar_evento_offline', { p_id: ids.outraEmpresa, p_decisao: 'REJEITAR', p_motivo: 'tentativa cruzada' } as never)
  expect(r1.error?.message).toContain('REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO')

  const gB = await clienteComo('gerente.b@homolog.local', senhaB)
  const lista = await gB.rpc('listar_revisoes_offline', { p_status: 'TODOS', p_limite: 200 } as never)
  expect(lista.error).toBeNull()
  const eventos = ((lista.data ?? []) as Array<{ event_id: string; loja_id: string }>).filter((r) => r.event_id.startsWith(run))
  expect(eventos.map((r) => r.event_id)).toEqual([ev.outraEmpresa])
  expect(eventos.every((r) => r.loja_id === LOJA_B1)).toBe(true)
  const r2 = await gB.rpc('revisar_evento_offline', { p_id: ids.aprovar, p_decisao: 'APROVAR', p_motivo: 'tentativa cruzada' } as never)
  expect(r2.error?.message).toContain('REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO')
  // leitura direta da tabela também não vaza (RLS/grants)
  const direto = await gB.from('sync_eventos_revisao').select('id').eq('id', ids.aprovar)
  expect(direto.data ?? []).toHaveLength(0)
  expect((await statusNoBanco(ids.aprovar)).status).toBe('PENDENTE')
  expect((await statusNoBanco(ids.outraEmpresa)).status).toBe('PENDENTE')
})

test('autoaprovação: botões desabilitados na tela e RPC recusado no servidor', async ({ page }) => {
  await loginGerente(page)
  await gotoApp(page, '/admin/revisao-offline')
  const l = linha(page, ev.meu)
  await expect(l).toBeVisible({ timeout: 30_000 })
  await expect(l.getByTestId('revisao-aprovar')).toBeDisabled()
  await expect(l.getByTestId('revisao-rejeitar')).toBeDisabled()
  await expect(l.getByTestId('revisao-bloqueio-meu-evento')).toBeVisible()

  const gA = await clienteComo(process.env.PLAYWRIGHT_TEST_EMAIL!, process.env.PLAYWRIGHT_TEST_PASSWORD!)
  for (const decisao of ['APROVAR', 'REJEITAR']) {
    const r = await gA.rpc('revisar_evento_offline', { p_id: ids.meu, p_decisao: decisao, p_motivo: 'eu mesmo aprovo' } as never)
    expect(r.error?.message).toContain('REVISAO_AUTOAPROVACAO_PROIBIDA')
  }
  expect((await statusNoBanco(ids.meu)).status).toBe('PENDENTE')
})

test('justificativa obrigatória; aprovar pela tela grava quem/quando/por quê e aparece no histórico', async ({ page }) => {
  // servidor recusa sem justificativa mesmo fora da UI
  const gA = await clienteComo(process.env.PLAYWRIGHT_TEST_EMAIL!, process.env.PLAYWRIGHT_TEST_PASSWORD!)
  const semMotivo = await gA.rpc('revisar_evento_offline', { p_id: ids.aprovar, p_decisao: 'APROVAR', p_motivo: '  ' } as never)
  expect(semMotivo.error?.message).toContain('REVISAO_MOTIVO_OBRIGATORIO')

  await loginGerente(page)
  await gotoApp(page, '/admin/revisao-offline')
  await clicarAte(page, linha(page, ev.aprovar).getByTestId('revisao-aprovar'), page.getByTestId('revisao-motivo'))
  const confirmar = page.getByTestId('revisao-confirmar')
  await expect(confirmar).toBeDisabled()
  await page.getByTestId('revisao-motivo').fill('abc')
  await expect(confirmar).toBeDisabled()
  const motivo = `Conferido com o gerente de turno ${run}`
  await page.getByTestId('revisao-motivo').fill(motivo)
  await expect(confirmar).toBeEnabled()
  await confirmar.click()
  await expect(page.getByTestId('revisao-sucesso')).toHaveText('Evento aprovado e gravado.', { timeout: 30_000 })
  await expect(linha(page, ev.aprovar)).toHaveCount(0, { timeout: 30_000 })

  const db = await statusNoBanco(ids.aprovar)
  expect(db).toMatchObject({ status: 'APROVADO', decidido_por: uid.gerenteA, decisao_motivo: motivo })
  expect(db.decidido_em).toBeTruthy()
  const caixa = await admin.from('caixas').select('loja_id, operador_id, valor_inicial').eq('id', caixas[ev.aprovar]).single()
  expect(caixa.data).toMatchObject({ loja_id: MATRIZ, operador_id: uid.opInativoA, valor_inicial: 12.5 })

  await page.getByTestId('revisao-aba-historico').click()
  const h = linha(page, ev.aprovar)
  await expect(h).toBeVisible({ timeout: 30_000 })
  await expect(h).toHaveAttribute('data-status', 'APROVADO')
  await expect(h.getByTestId('revisao-decisao')).toContainText(motivo)
  await expect(h.getByTestId('revisao-aprovar')).toHaveCount(0)

  // repetir a mesma decisão é idempotente e não reaplica
  const rep = await gA.rpc('revisar_evento_offline', { p_id: ids.aprovar, p_decisao: 'APROVAR', p_motivo: 'de novo' } as never)
  expect(rep.error).toBeNull()
  expect(rep.data).toMatchObject({ status: 'APROVADO', idempotente: true })
  expect((await statusNoBanco(ids.aprovar)).decisao_motivo).toBe(motivo)
})

test('rejeitar pela tela não cria efeito e fica no histórico', async ({ page }) => {
  await loginGerente(page)
  await gotoApp(page, '/admin/revisao-offline')
  await clicarAte(page, linha(page, ev.rejeitar).getByTestId('revisao-rejeitar'), page.getByTestId('revisao-motivo'))
  const motivo = `Venda duplicada no PDV ${run}`
  await page.getByTestId('revisao-motivo').fill(motivo)
  await page.getByTestId('revisao-confirmar').click()
  await expect(page.getByTestId('revisao-sucesso')).toHaveText('Evento rejeitado.', { timeout: 30_000 })
  expect(await statusNoBanco(ids.rejeitar)).toMatchObject({ status: 'REJEITADO', decidido_por: uid.gerenteA, decisao_motivo: motivo })
  const caixa = await admin.from('caixas').select('id').eq('id', caixas[ev.rejeitar])
  expect(caixa.data ?? []).toHaveLength(0)
  await gotoApp(page, '/admin/revisao-offline?aba=historico')
  await expect(linha(page, ev.rejeitar)).toHaveAttribute('data-status', 'REJEITADO', { timeout: 30_000 })
})

test('decisão concorrente: só uma vale, a outra recebe REVISAO_JA_DECIDIDA', async () => {
  const gA = await clienteComo(process.env.PLAYWRIGHT_TEST_EMAIL!, process.env.PLAYWRIGHT_TEST_PASSWORD!)
  const dA = await clienteComo('dono.seed@local.test', process.env.PLAYWRIGHT_TEST_PASSWORD!)
  await fecharCaixasDoOperadorSintetico() // o teste de aprovação abriu um caixa para o mesmo operador
  const [r1, r2] = await Promise.all([
    gA.rpc('revisar_evento_offline', { p_id: ids.corrida, p_decisao: 'APROVAR', p_motivo: 'gerente aprova' } as never),
    dA.rpc('revisar_evento_offline', { p_id: ids.corrida, p_decisao: 'APROVAR', p_motivo: 'dono aprova' } as never),
  ])
  const ok = [r1, r2].filter((r) => !r.error)
  const falhas = [r1, r2].filter((r) => r.error)
  expect(ok, JSON.stringify([r1.error, r2.error])).toHaveLength(1)
  expect(falhas).toHaveLength(1)
  expect(falhas[0].error!.message).toContain('REVISAO_JA_DECIDIDA')
  const db = await statusNoBanco(ids.corrida)
  expect(db.status).toBe('APROVADO')
  expect([uid.gerenteA, uid.donoA]).toContain(db.decidido_por)
  // um único caixa criado
  const caixa = await admin.from('caixas').select('id').eq('id', caixas[ev.corrida])
  expect(caixa.data ?? []).toHaveLength(1)
})
