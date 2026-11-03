/**
 * F4 — integração REAL (Supabase local: GoTrue + PostgREST + Postgres) do Import Intelligence.
 *
 * Gate F4: operação salva e reaberta, cálculo reprodutível e isolado, sem efeito nos módulos
 * operacionais. Usa o motor real (shared-core) e JWT reais.
 *
 * Só roda com SUPABASE_URL local + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY no ambiente
 * (`supabase status -o env`). Sem elas: skip. Nunca aponta para host remoto.
 * Cria dados FICTÍCIOS com sufixo único; não apaga nada (banco local descartável).
 */
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  aprovarApuracao,
  apurarOperacao,
  sha256Canonico,
  verificarApuracaoGuardada,
  type ClienteImport,
} from './importIntelligence'
import { calcularLandedCost } from '@shared-core/src/import'

const URL_BASE = process.env.SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE)
const habilitado = LOCAL && !!ANON && !!SERVICE

const RUN = randomUUID().slice(0, 8)
const SENHA = `F4-int-${randomUUID()}`

let admin: SupabaseClient
let donoA: SupabaseClient
let gerenteA: SupabaseClient
let donoB: SupabaseClient
const ids: Record<string, string> = {}

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, rotulo: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${rotulo}: ${error.message}`)
  return data
}

async function usuario(rotulo: string, perfil: string, lojaId: string): Promise<SupabaseClient> {
  const email = `${rotulo}.${RUN}@f4-int.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser ${rotulo}: ${error?.message}`)
  ids[rotulo] = data.user.id
  await ok(admin.from('usuarios').insert({ id: data.user.id, nome: `F4 ${rotulo}`, perfil, loja_id: lojaId, ativo: true }), `usuarios ${rotulo}`)
  const c = createClient(URL_BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const s = await c.auth.signInWithPassword({ email, password: SENHA })
  if (s.error) throw new Error(`login ${rotulo}: ${s.error.message}`)
  return c
}

const comoImport = (c: SupabaseClient) => c as unknown as ClienteImport

describe.skipIf(!habilitado)('Import Intelligence — integração real (F4)', () => {
  beforeAll(async () => {
    admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
    const [empA] = await ok(admin.from('empresas').insert({ nome: `F4 int A ${RUN}` }).select('id'), 'empresa A')
    const [empB] = await ok(admin.from('empresas').insert({ nome: `F4 int B ${RUN}` }).select('id'), 'empresa B')
    ids.empA = empA.id
    ids.empB = empB.id
    const [lojaA] = await ok(admin.from('lojas').insert({ nome: `F4 int A1 ${RUN}`, codigo: `F4I-A-${RUN}`, empresa_id: empA.id }).select('id'), 'loja A')
    const [lojaB] = await ok(admin.from('lojas').insert({ nome: `F4 int B1 ${RUN}`, codigo: `F4I-B-${RUN}`, empresa_id: empB.id }).select('id'), 'loja B')
    ids.lojaA = lojaA.id
    // ERP da loja A, para provar que o Import Intelligence não toca estoque, AP nem preço
    const [prod] = await ok(admin.from('produtos').insert({ nome: `F4 int produto ${RUN}`, preco_varejo: 12.34, origem: 'china_manual', tem_nf: false, loja_id: lojaA.id }).select('id'), 'produto A')
    await ok(admin.from('estoque').insert({ loja_id: lojaA.id, produto_id: prod.id, quantidade_atual: 7 }), 'estoque A')
    donoA = await usuario('dono-a', 'DONO', lojaA.id)
    gerenteA = await usuario('gerente-a', 'GERENTE', lojaA.id)
    donoB = await usuario('dono-b', 'DONO', lojaB.id)
    for (const emp of [empA.id, empB.id]) {
      await ok(admin.rpc('ops_definir_modulo_empresa', {
        p_empresa: emp, p_modulo: 'IMPORT_INTELLIGENCE', p_habilitado: true,
        p_autorizado_por: `contrato fictício ${RUN}`, p_motivo: 'integração F4 (homologação local)', p_origem: 'teste-integracao-f4',
      }), 'habilitar módulo')
    }
  }, 60_000)

  it('salva, reabre, recalcula igual, aprova pelo servidor e não toca o ERP; B não vê A', async () => {
    // Snapshot restrito à loja do teste: outros testes de integração escrevem em produtos em paralelo
    const antes = {
      estoque: await ok(admin.from('estoque').select('produto_id, quantidade_atual').eq('loja_id', ids.lojaA).order('produto_id'), 'estoque'),
      ap: await ok(admin.from('contas_pagar').select('id').eq('loja_id', ids.lojaA), 'contas_pagar'),
      precos: await ok(admin.from('produtos').select('id, preco_varejo, preco_custo').eq('loja_id', ids.lojaA).order('id'), 'precos'),
    }
    expect(antes.estoque.length).toBe(1)
    expect(antes.precos.length).toBe(1)

    // 1. GERENTE cria e preenche (tenant derivado da loja)
    const op = (await ok(gerenteA.rpc('import_criar_operacao', {
      p_loja_importadora: ids.lojaA, p_referencia: `IMP-${RUN}`, p_descricao: 'Container de teste',
    }), 'criar')) as string
    const item = (p: Record<string, string>) => ok(gerenteA.rpc('import_salvar_item', { p_operacao: op, p_item: p }), 'item')
    await item({ descricao: 'Parafuso M6', moeda: 'USD', valor_mercadoria_moeda: '1000.000000', valor_aduaneiro_brl: '5432.109877',
      quantidade_comercial: '100.000', unidade_comercial: 'CX', fator_para_estoque: '50.000000', quantidade_estoque: '5000.000', peso_bruto_kg: '210.000' })
    await item({ descricao: 'Arruela', moeda: 'USD', valor_mercadoria_moeda: '500.000000', valor_aduaneiro_brl: '2716.054938',
      quantidade_comercial: '10.000', unidade_comercial: 'CX', fator_para_estoque: '100.000000', quantidade_estoque: '1000.000', peso_bruto_kg: '90.000' })
    const lanc = (tipo: string, d: Record<string, unknown>) =>
      ok(gerenteA.rpc('import_salvar_lancamento', { p_operacao: op, p_tipo: tipo, p_dados: d }), tipo)
    await lanc('CAMBIO', { moeda: 'USD', taxa: '5.4321098765', fonte: 'DECLARADA_DI', data: '2026-10-01' })
    await lanc('DESPESA', { tipo: 'FRETE', moeda: 'USD', valor: '300.000000', incorporavel: 'SIM', atribuicao_modo: 'RATEIO',
      criterio: 'PESO_BRUTO', justificativa: 'Frete marítimo rateado pelo peso bruto do BL' })
    await lanc('DESPESA', { tipo: 'DESPACHANTE', moeda: 'BRL', valor: '1500.000000', incorporavel: 'SIM', atribuicao_modo: 'RATEIO',
      criterio: 'VALOR_ADUANEIRO', justificativa: 'Honorários do despachante pelo valor aduaneiro' })

    // 2. Apuração com o motor real
    const ap = await apurarOperacao(comoImport(gerenteA), admin, op, 'APURACAO')
    if (!ap.ok) throw new Error(`apurar: ${ap.motivo} ${ap.detalhe ?? ''}`)
    expect(ap.status).toBe('OK')
    expect(ap.saida.conservacao.ok).toBe(true)

    // 3. Reabrir (novo client, nova leitura): entrada e saída guardadas reproduzem o cálculo
    const { data: guardada } = await donoA.from('import_apuracoes').select('entrada, saida, saida_sha256, entrada_sha256').eq('id', ap.apuracaoId).single()
    expect(guardada).toBeTruthy()
    const recalculo = calcularLandedCost(guardada!.entrada)
    expect(recalculo.ok).toBe(true)
    expect(sha256Canonico(recalculo.ok ? recalculo.value : null)).toBe(guardada!.saida_sha256)
    expect(sha256Canonico(guardada!.saida)).toBe(guardada!.saida_sha256)
    const v = await verificarApuracaoGuardada(comoImport(donoA), ap.apuracaoId)
    expect(v).toMatchObject({ ok: true, aprovavel: true, confere: true })

    // custo unitário com 6 casas guardado sem perda
    const { data: itensAp } = await donoA.from('import_apuracao_itens').select('custo_unitario_brl').eq('apuracao_id', ap.apuracaoId)
    expect(itensAp!.length).toBe(2)
    for (const i of itensAp!) expect(String(i.custo_unitario_brl)).toMatch(/^\d+\.\d{6}$/)

    // 4. Isolamento: DONO de B (licenciado) não vê nada de A; GERENTE não aprova
    const { data: bOps } = await donoB.from('import_operacoes').select('id')
    expect(bOps).toEqual([])
    const { data: bAp } = await donoB.from('import_apuracoes').select('id').eq('id', ap.apuracaoId)
    expect(bAp).toEqual([])
    const bEscreve = await donoB.rpc('import_salvar_item', { p_operacao: op, p_item: { descricao: 'x' } })
    expect(bEscreve.error?.message).toMatch(/IMPORT_NAO_AUTORIZADO/)
    const gerAprova = await aprovarApuracao(comoImport(gerenteA), admin, ap.apuracaoId, 'gerente tentando aprovar')
    expect(gerAprova).toMatchObject({ ok: false, motivo: 'MODULO_NEGADO' })
    const direto = await donoA.rpc('import_aprovar_apuracao', { p_apuracao: ap.apuracaoId, p_ator: ids['dono-a'], p_motivo: 'direto pela API', p_verificacao: { recalculo_confere: true } })
    expect(direto.error).toBeTruthy()

    // 5. Aprovação pelo servidor — desde a F5 exige lançamentos conferidos (conferir não muda a versão dos dados)
    const semConferencia = await aprovarApuracao(comoImport(donoA), admin, ap.apuracaoId, 'antes da conferência')
    expect(semConferencia.ok).toBe(false)
    const despesas = await ok(gerenteA.from('import_despesas').select('id').eq('operacao_id', op), 'despesas')
    for (const d of despesas as { id: string }[]) {
      await ok(gerenteA.rpc('import_conferir_lancamento', { p_operacao: op, p_tipo: 'DESPESA', p_id: d.id, p_status: 'CONFERIDO' }), 'conferir')
    }
    const aprov = await aprovarApuracao(comoImport(donoA), admin, ap.apuracaoId, 'Custos conferidos com DI, invoice e BL')
    expect(aprov).toEqual({ ok: true })
    const { data: opDepois } = await donoA.from('import_operacoes').select('status, apuracao_aprovada_id').eq('id', op).single()
    expect(opDepois).toEqual({ status: 'APROVADA', apuracao_aprovada_id: ap.apuracaoId })

    // 6. ERP intocado
    const depois = {
      estoque: await ok(admin.from('estoque').select('produto_id, quantidade_atual').eq('loja_id', ids.lojaA).order('produto_id'), 'estoque'),
      ap: await ok(admin.from('contas_pagar').select('id').eq('loja_id', ids.lojaA), 'contas_pagar'),
      precos: await ok(admin.from('produtos').select('id, preco_varejo, preco_custo').eq('loja_id', ids.lojaA).order('id'), 'precos'),
    }
    expect(depois).toEqual(antes)
  }, 60_000)

  it('documentos (D8): bucket privado por empresa/operação, sha256, sem sobrescrita nem exclusão', async () => {
    const op = (await ok(donoA.rpc('import_criar_operacao', {
      p_loja_importadora: ids.lojaA, p_referencia: `DOC-${RUN}`,
    }), 'criar')) as string
    const conteudo = new TextEncoder().encode(`invoice fictícia ${RUN}`)
    const sha = (await import('node:crypto')).createHash('sha256').update(conteudo).digest('hex')
    const caminho = `${ids.empA}/${op}/invoice-${RUN}.pdf`

    const up = await donoA.storage.from('import-documentos').upload(caminho, conteudo, { contentType: 'application/pdf' })
    expect(up.error).toBeNull()
    const reg = await donoA.rpc('import_registrar_documento', {
      p_operacao: op, p_tipo: 'INVOICE', p_numero: 'INV-1', p_data: '2026-09-20',
      p_storage_path: caminho, p_sha256: sha, p_tamanho: conteudo.byteLength, p_mime: 'application/pdf',
    })
    expect(reg.error).toBeNull()

    // A lê e confere a integridade
    const down = await donoA.storage.from('import-documentos').download(caminho)
    expect(down.error).toBeNull()
    const baixado = new Uint8Array(await down.data!.arrayBuffer())
    expect((await import('node:crypto')).createHash('sha256').update(baixado).digest('hex')).toBe(sha)

    // B não lê nem grava no caminho de A
    const bDown = await donoB.storage.from('import-documentos').download(caminho)
    expect(bDown.error).toBeTruthy()
    const bUp = await donoB.storage.from('import-documentos').upload(`${ids.empA}/${op}/intruso.pdf`, conteudo)
    expect(bUp.error).toBeTruthy()

    // Ninguém sobrescreve nem apaga (sem policy de UPDATE/DELETE)
    const sobrescreve = await donoA.storage.from('import-documentos').upload(caminho, new Uint8Array([1]), { upsert: true })
    expect(sobrescreve.error).toBeTruthy()
    await donoA.storage.from('import-documentos').remove([caminho])
    const aindaExiste = await admin.storage.from('import-documentos').download(caminho)
    expect(aindaExiste.error).toBeNull()

    // bucket não é público
    const { data: bucket } = await admin.storage.getBucket('import-documentos')
    expect(bucket?.public).toBe(false)
  }, 60_000)
})
