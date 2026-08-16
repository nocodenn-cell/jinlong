#!/usr/bin/env node
/**
 * Smoke de isolamento por loja em `produtos` / `historico_precos_produto`,
 * exercitado pelo PostgREST REAL (Data API), não por mock.
 *
 * POR QUE VIA HTTP: os testes de unidade cobrem o guard de aplicação
 * (`assertProdutoDaLojaSessao`), mas o vetor comprovado em 2026-08-16 era
 * justamente o acesso DIRETO ao Data API, que não passa por código nosso.
 * Só uma chamada HTTP autenticada com JWT de usuário real prova que a RLS —
 * e não a aplicação — está barrando.
 *
 * Cenário: duas lojas (A e B), um GERENTE em cada, e um ADMIN (global).
 * Cada ator recebe um JWT de verdade emitido pelo GoTrue local.
 *
 * Uso (stack local em pé):
 *   node backend/scripts/rls-produtos-tenant-rest-smoke.mjs
 *
 * Só roda contra localhost — recusa qualquer outra URL, para não haver
 * chance de criar usuários/produtos de teste em ambiente compartilhado.
 */

import { createClient } from '@supabase/supabase-js'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) {
  console.error(`RECUSADO: este smoke cria dados e só roda em localhost. URL recebida: ${API_URL}`)
  process.exit(2)
}

const admin = createClient(API_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const LOJA_A = 'a0000001-0000-4000-8000-000000000001'
const LOJA_B = 'a0000002-0000-4000-8000-000000000002'
const SENHA = 'smoke-tenant-123456'
const SUFIXO = 'rls-tenant-smoke'

const resultados = []
let falhas = 0

function checar(nome, condicao, detalhe = '') {
  const ok = Boolean(condicao)
  if (!ok) falhas += 1
  resultados.push({ ok, nome, detalhe })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

/** Varre TODAS as páginas — `listUsers` pagina, e um resíduo fora da 1ª página
 *  fazia a limpeza falhar silenciosamente e o createUser seguinte estourar. */
async function acharUsuarioPorEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    const achado = users.find((u) => u.email === email)
    if (achado) return achado
    if (users.length < 200) return null
  }
  return null
}

async function criarAtor({ email, nome, perfil, lojaId }) {
  // Limpa execução anterior, se houver.
  const previo = await acharUsuarioPorEmail(email)
  if (previo) {
    await admin.from('usuarios').delete().eq('id', previo.id)
    await admin.auth.admin.deleteUser(previo.id)
  }

  let { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  })
  // Corrida/resíduo: reaproveita o usuário existente em vez de abortar a suíte.
  if (error && /already been registered/i.test(error.message)) {
    const existente = await acharUsuarioPorEmail(email)
    if (!existente) throw new Error(`createUser ${email}: ${error.message}`)
    await admin.auth.admin.updateUserById(existente.id, { password: SENHA })
    data = { user: existente }
    error = null
  }
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  const id = data.user.id

  const { error: upErr } = await admin
    .from('usuarios')
    .upsert({ id, nome, perfil, loja_id: lojaId, ativo: true })
  if (upErr) throw new Error(`upsert usuarios ${email}: ${upErr.message}`)

  const sessao = createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginErr } = await sessao.auth.signInWithPassword({ email, password: SENHA })
  if (loginErr) throw new Error(`signIn ${email}: ${loginErr.message}`)

  return { id, client: sessao, email }
}

async function limpar() {
  const { data: alvos } = await admin.from('produtos').select('id').like('nome', `%${SUFIXO}%`)
  const ids = (alvos ?? []).map((p) => p.id)
  if (ids.length > 0) {
    // Dependências primeiro: as FKs para produtos não são todas ON DELETE CASCADE.
    await admin.from('precos_atacado').delete().in('produto_id', ids)
    await admin.from('produto_create_requests').delete().in('produto_id', ids)
    await admin.from('estoque').delete().in('produto_id', ids)
    await admin.from('produtos').delete().in('id', ids)
  }
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    for (const u of users) {
      if (u.email?.includes(SUFIXO)) {
        await admin.from('usuarios').delete().eq('id', u.id)
        await admin.auth.admin.deleteUser(u.id)
      }
    }
    if (users.length < 200) break
  }
}

async function main() {
  console.log(`\n=== Smoke RLS tenant produtos (PostgREST real) — ${API_URL} ===\n`)
  await limpar()

  const gerenteA = await criarAtor({
    email: `gerente-a-${SUFIXO}@local.test`,
    nome: 'Gerente A',
    perfil: 'GERENTE',
    lojaId: LOJA_A,
  })
  const gerenteB = await criarAtor({
    email: `gerente-b-${SUFIXO}@local.test`,
    nome: 'Gerente B',
    perfil: 'GERENTE',
    lojaId: LOJA_B,
  })
  const adminAtor = await criarAtor({
    email: `admin-${SUFIXO}@local.test`,
    nome: 'Admin Global',
    perfil: 'ADMIN',
    lojaId: LOJA_A,
  })

  // Produto na loja B, criado com service_role (fora da RLS) para servir de alvo.
  const { data: prodB, error: errProdB } = await admin
    .from('produtos')
    .insert({
      nome: `Produto Loja B ${SUFIXO}`,
      preco_varejo: 100,
      origem: 'brasil_nf',
      loja_id: LOJA_B,
      criado_por: gerenteB.id,
      atualizado_por: gerenteB.id,
    })
    .select('id')
    .single()
  if (errProdB) throw new Error(`insert produto B: ${errProdB.message}`)

  // Gera histórico de preços no produto da loja B.
  const { error: errHist } = await admin
    .from('produtos')
    .update({ preco_varejo: 250 })
    .eq('id', prodB.id)
  if (errHist) throw new Error(`update preco B: ${errHist.message}`)

  const { data: prodA } = await admin
    .from('produtos')
    .insert({
      nome: `Produto Loja A ${SUFIXO}`,
      preco_varejo: 10,
      origem: 'brasil_nf',
      loja_id: LOJA_A,
      criado_por: gerenteA.id,
      atualizado_por: gerenteA.id,
    })
    .select('id')
    .single()

  console.log('--- LEITURA de produto ---')

  const leB = await gerenteB.client.from('produtos').select('id, nome, preco_varejo').eq('id', prodB.id)
  checar('gerente B LÊ produto da própria loja', (leB.data ?? []).length === 1)

  const leACross = await gerenteA.client
    .from('produtos')
    .select('id, nome, preco_varejo, criado_por')
    .eq('id', prodB.id)
  checar(
    'gerente A NÃO lê produto da loja B',
    (leACross.data ?? []).length === 0,
    `linhas=${(leACross.data ?? []).length}`,
  )

  const leAdmin = await adminAtor.client.from('produtos').select('id').eq('id', prodB.id)
  checar('ADMIN lê produto de qualquer loja (acesso global preservado)', (leAdmin.data ?? []).length === 1)

  console.log('--- ESCRITA de produto ---')

  const escreveCross = await gerenteA.client
    .from('produtos')
    .update({ preco_varejo: 1 })
    .eq('id', prodB.id)
    .select('id')
  checar(
    'gerente A NÃO altera preço de produto da loja B',
    (escreveCross.data ?? []).length === 0,
    escreveCross.error ? `erro=${escreveCross.error.code}` : 'nenhuma linha afetada',
  )

  const { data: confereB } = await admin.from('produtos').select('preco_varejo').eq('id', prodB.id).single()
  checar(
    'preço do produto da loja B permaneceu intacto',
    Number(confereB.preco_varejo) === 250,
    `preco=${confereB.preco_varejo}`,
  )

  const escrevePropria = await gerenteA.client
    .from('produtos')
    .update({ preco_varejo: 33 })
    .eq('id', prodA.id)
    .select('id')
  checar('gerente A altera produto da PRÓPRIA loja (sem regressão)', (escrevePropria.data ?? []).length === 1)

  const escreveAdmin = await adminAtor.client
    .from('produtos')
    .update({ preco_varejo: 260 })
    .eq('id', prodB.id)
    .select('id')
  checar('ADMIN altera produto de outra loja (acesso global preservado)', (escreveAdmin.data ?? []).length === 1)

  console.log('--- MOVER produto entre lojas (WITH CHECK) ---')

  const moveCross = await gerenteA.client
    .from('produtos')
    .update({ loja_id: LOJA_B })
    .eq('id', prodA.id)
    .select('id')
  checar(
    'gerente A NÃO move produto da própria loja para a loja B',
    (moveCross.data ?? []).length === 0,
    moveCross.error ? `erro=${moveCross.error.code}` : 'nenhuma linha afetada',
  )

  console.log('--- INSERT em outra loja ---')

  const insereCross = await gerenteA.client
    .from('produtos')
    .insert({
      nome: `Intruso ${SUFIXO}`,
      preco_varejo: 5,
      origem: 'brasil_nf',
      loja_id: LOJA_B,
    })
    .select('id')
  checar(
    'gerente A NÃO insere produto na loja B',
    !!insereCross.error || (insereCross.data ?? []).length === 0,
    insereCross.error ? `erro=${insereCross.error.code}` : '',
  )

  console.log('--- HISTÓRICO de preços ---')

  const histB = await gerenteB.client
    .from('historico_precos_produto')
    .select('id, preco_varejo_anterior, preco_varejo_novo')
    .eq('produto_id', prodB.id)
  checar('gerente B lê histórico da própria loja', (histB.data ?? []).length >= 1)

  const histCross = await gerenteA.client
    .from('historico_precos_produto')
    .select('id, preco_varejo_anterior, preco_varejo_novo, alterado_por')
    .eq('produto_id', prodB.id)
  checar(
    'gerente A NÃO lê histórico de preços da loja B',
    (histCross.data ?? []).length === 0,
    `linhas=${(histCross.data ?? []).length}`,
  )

  const histAdmin = await adminAtor.client
    .from('historico_precos_produto')
    .select('id')
    .eq('produto_id', prodB.id)
  checar('ADMIN lê histórico de qualquer loja', (histAdmin.data ?? []).length >= 1)

  console.log('--- AUTORIA (colunas criado_por/atualizado_por) ---')

  const autoriaCross = await gerenteA.client
    .from('produtos')
    .select('criado_por, atualizado_por')
    .eq('id', prodB.id)
  checar('gerente A NÃO lê autoria de produto da loja B', (autoriaCross.data ?? []).length === 0)

  console.log('--- LISTAGEM via RPC list_produtos_gerente_filtrados ---')

  const rpcCross = await gerenteA.client.rpc('list_produtos_gerente_filtrados', {
    p_loja_id: LOJA_B,
    p_situacao: 'todos',
    p_origem_filtro: 'all',
    p_nf_filtro: 'all',
    p_estoque_filtro: 'todos',
    p_imagens_filtro: 'todos',
    p_tags_filtro: null,
    p_categoria_id: null,
    p_marca_id: null,
    p_fornecedor_id: null,
    p_busca: SUFIXO,
    p_page: 1,
    p_page_size: 50,
  })
  checar(
    'gerente A NÃO lista produtos da loja B via RPC (mesmo passando p_loja_id da B)',
    (rpcCross.data ?? []).length === 0,
    `linhas=${(rpcCross.data ?? []).length}`,
  )

  const rpcPropria = await gerenteA.client.rpc('list_produtos_gerente_filtrados', {
    p_loja_id: LOJA_A,
    p_situacao: 'todos',
    p_origem_filtro: 'all',
    p_nf_filtro: 'all',
    p_estoque_filtro: 'todos',
    p_imagens_filtro: 'todos',
    p_tags_filtro: null,
    p_categoria_id: null,
    p_marca_id: null,
    p_fornecedor_id: null,
    p_busca: SUFIXO,
    p_page: 1,
    p_page_size: 50,
  })
  checar('gerente A lista produtos da PRÓPRIA loja via RPC', (rpcPropria.data ?? []).length >= 1)

  console.log('--- AUTORIA ATÔMICA na criação (RPC) ---')

  // A RPC de criação é concedida só a `service_role` (revogada de PUBLIC pela
  // migration 221) — o caminho real da aplicação é o client admin passando
  // `p_ator_id`, exatamente como abaixo. Chamá-la como `authenticated` daria
  // "permission denied", que é o comportamento correto e esperado.
  const criar = await admin.rpc('criar_produto_com_estoque_inicial', {
    p_payload: {
      nome: `Criado por RPC ${SUFIXO}`,
      preco_varejo: 42,
      origem: 'brasil_nf',
      estoque_inicial_quantidade: 0,
      estoque_inicial_minimo: 0,
    },
    p_ator_id: gerenteA.id,
    p_request_id: null,
  })
  const novoId = criar.data?.produto_id
  checar('RPC de criação retornou produto', !!novoId, criar.error?.message ?? '')

  if (novoId) {
    const { data: autoriaNova } = await admin
      .from('produtos')
      .select('criado_por, atualizado_por')
      .eq('id', novoId)
      .single()
    checar(
      'criado_por preenchido DENTRO da própria RPC (sem follow-up da aplicação)',
      autoriaNova.criado_por === gerenteA.id,
      `criado_por=${autoriaNova.criado_por}`,
    )
    checar(
      'atualizado_por preenchido na mesma transação',
      autoriaNova.atualizado_por === gerenteA.id,
      `atualizado_por=${autoriaNova.atualizado_por}`,
    )
  }

  console.log('--- TRANSACIONALIDADE produto + faixa de atacado ---')

  if (novoId) {
    const okTx = await gerenteA.client.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: novoId,
      p_payload: { preco_atacado: 30, quantidade_gatilho_atacado: 10 },
      p_ator_id: gerenteA.id,
      p_faixa: { quantidade_minima: 10, preco_unitario: 30 },
    })
    checar('RPC transacional sincronizou produto + faixa', okTx.data?.faixa_sincronizada === true, okTx.error?.message ?? '')

    const { data: faixas } = await admin
      .from('precos_atacado')
      .select('quantidade_minima, preco_unitario')
      .eq('produto_id', novoId)
      .eq('ativo', true)
    const { data: prodTx } = await admin
      .from('produtos')
      .select('preco_atacado, quantidade_gatilho_atacado')
      .eq('id', novoId)
      .single()
    checar(
      'produto.preco_atacado e precos_atacado CONVERGEM',
      Number(prodTx.preco_atacado) === 30 && Number(faixas?.[0]?.preco_unitario) === 30,
      `produto=${prodTx.preco_atacado} faixa=${faixas?.[0]?.preco_unitario}`,
    )

    // Faixa inválida deve derrubar TAMBÉM a alteração do produto (atomicidade).
    const txInvalida = await gerenteA.client.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: novoId,
      p_payload: { preco_atacado: 999 },
      p_ator_id: gerenteA.id,
      p_faixa: { quantidade_minima: -5, preco_unitario: 999 },
    })
    const { data: prodAposFalha } = await admin
      .from('produtos')
      .select('preco_atacado')
      .eq('id', novoId)
      .single()
    checar(
      'falha na faixa faz ROLLBACK da alteração do produto (sem estado parcial)',
      !!txInvalida.error && Number(prodAposFalha.preco_atacado) === 30,
      `erro=${txInvalida.error?.message ?? 'nenhum'} preco_atacado=${prodAposFalha.preco_atacado}`,
    )

    // Tenant também na RPC transacional.
    const txCross = await gerenteA.client.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: prodB.id,
      p_payload: { preco_varejo: 1 },
      p_ator_id: gerenteA.id,
      p_faixa: null,
    })
    checar(
      'RPC transacional recusa produto de outra loja',
      !!txCross.error,
      txCross.error?.message ?? 'sem erro (inesperado)',
    )

    console.log('--- TROCA e REMOÇÃO da faixa derivada do catálogo ---')

    // Faixa manual adicional, em outra quantidade — deve sobreviver a tudo.
    await admin
      .from('precos_atacado')
      .insert({ produto_id: novoId, quantidade_minima: 100, preco_unitario: 20, loja_id: null, ativo: true })

    // Gatilho 10 → 20: a faixa 10 (derivada do catálogo) deve ser desativada.
    const troca = await gerenteA.client.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: novoId,
      p_payload: { preco_atacado: 28, quantidade_gatilho_atacado: 20 },
      p_ator_id: gerenteA.id,
      p_faixa: { quantidade_minima: 20, preco_unitario: 28 },
    })
    const { data: aposTroca } = await admin
      .from('precos_atacado')
      .select('quantidade_minima, preco_unitario, ativo')
      .eq('produto_id', novoId)
      .order('quantidade_minima')
    const ativasTroca = (aposTroca ?? []).filter((f) => f.ativo).map((f) => f.quantidade_minima)
    checar(
      'gatilho 10→20 desativa a faixa 10 (não fica faixa órfã ativa)',
      !ativasTroca.includes(10) && ativasTroca.includes(20),
      `ativas=[${ativasTroca}] desativadas=${troca.data?.faixas_desativadas}`,
    )
    checar(
      'faixa manual em outra quantidade (100) é preservada',
      ativasTroca.includes(100),
      `ativas=[${ativasTroca}]`,
    )

    // Remoção: catálogo deixa de ter atacado → a faixa derivada sai de cena.
    await gerenteA.client.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: novoId,
      p_payload: { preco_atacado: null, quantidade_gatilho_atacado: null },
      p_ator_id: gerenteA.id,
      p_faixa: null,
    })
    const { data: aposRemocao } = await admin
      .from('precos_atacado')
      .select('quantidade_minima, ativo')
      .eq('produto_id', novoId)
    const ativasRemocao = (aposRemocao ?? []).filter((f) => f.ativo).map((f) => f.quantidade_minima)
    checar(
      'remover preço/gatilho desativa a faixa derivada',
      !ativasRemocao.includes(20),
      `ativas=[${ativasRemocao}]`,
    )
    checar(
      'faixa manual continua ativa após a remoção do atacado do catálogo',
      ativasRemocao.includes(100),
      `ativas=[${ativasRemocao}]`,
    )

    // Update que NÃO toca em atacado não pode desativar nada.
    await admin
      .from('produtos')
      .update({ preco_atacado: 15, quantidade_gatilho_atacado: 5 })
      .eq('id', novoId)
    await admin
      .from('precos_atacado')
      .insert({ produto_id: novoId, quantidade_minima: 5, preco_unitario: 15, loja_id: null, ativo: true })
    await gerenteA.client.rpc('atualizar_produto_com_faixa_atacado', {
      p_produto_id: novoId,
      p_payload: { nome: `Só o nome mudou ${SUFIXO}` },
      p_ator_id: gerenteA.id,
      p_faixa: null,
    })
    const { data: aposNome } = await admin
      .from('precos_atacado')
      .select('quantidade_minima, ativo')
      .eq('produto_id', novoId)
    const ativasNome = (aposNome ?? []).filter((f) => f.ativo).map((f) => f.quantidade_minima)
    checar(
      'update que não mexe em atacado NÃO desativa faixa alguma',
      ativasNome.includes(5) && ativasNome.includes(100),
      `ativas=[${ativasNome}]`,
    )

    console.log('--- IDEMPOTÊNCIA da criação (escopo e concorrência) ---')

    const reqId = '99999999-9999-4999-8999-999999999999'
    const primeira = await admin.rpc('criar_produto_com_estoque_inicial', {
      p_payload: { nome: `Idempotente ${SUFIXO}`, preco_varejo: 7, origem: 'brasil_nf' },
      p_ator_id: gerenteA.id,
      p_request_id: reqId,
    })
    const replay = await admin.rpc('criar_produto_com_estoque_inicial', {
      p_payload: { nome: `Idempotente ${SUFIXO}`, preco_varejo: 7, origem: 'brasil_nf' },
      p_ator_id: gerenteA.id,
      p_request_id: reqId,
    })
    checar(
      'replay do mesmo request devolve o MESMO produto',
      replay.data?.replayed === true && replay.data?.produto_id === primeira.data?.produto_id,
      `replayed=${replay.data?.replayed}`,
    )

    // Mesmo request_id reutilizado por gerente de OUTRA loja: não pode virar
    // oráculo do produto alheio.
    const replayOutraLoja = await admin.rpc('criar_produto_com_estoque_inicial', {
      p_payload: { nome: `Intruso ${SUFIXO}`, preco_varejo: 7, origem: 'brasil_nf' },
      p_ator_id: gerenteB.id,
      p_request_id: reqId,
    })
    checar(
      'replay do request por ator de OUTRA loja é recusado (sem vazar produto_id)',
      !!replayOutraLoja.error &&
        String(replayOutraLoja.error.message).includes('CRIAR_PRODUTO_REQUEST_OUTRA_LOJA'),
      replayOutraLoja.error?.message ?? `retornou produto_id=${replayOutraLoja.data?.produto_id}`,
    )

    // Concorrência: duas chamadas simultâneas com o mesmo request novo.
    const reqConc = '88888888-8888-4888-8888-888888888888'
    const [c1, c2] = await Promise.all([
      admin.rpc('criar_produto_com_estoque_inicial', {
        p_payload: { nome: `Concorrente ${SUFIXO}`, preco_varejo: 9, origem: 'brasil_nf' },
        p_ator_id: gerenteA.id,
        p_request_id: reqConc,
      }),
      admin.rpc('criar_produto_com_estoque_inicial', {
        p_payload: { nome: `Concorrente ${SUFIXO}`, preco_varejo: 9, origem: 'brasil_nf' },
        p_ator_id: gerenteA.id,
        p_request_id: reqConc,
      }),
    ])
    const { count: qtdConcorrentes } = await admin
      .from('produtos')
      .select('id', { count: 'exact', head: true })
      .eq('nome', `Concorrente ${SUFIXO}`)
    checar(
      'duas criações simultâneas com o mesmo request criam UM só produto',
      qtdConcorrentes === 1 && c1.data?.produto_id === c2.data?.produto_id,
      `produtos=${qtdConcorrentes} ids_iguais=${c1.data?.produto_id === c2.data?.produto_id}`,
    )

    // Autor explícito no histórico mesmo em contexto privilegiado.
    // Procura por QUALQUER evento com o ator — e não pelo mais recente: os
    // passos acima incluem updates feitos direto com service_role (sem sessão
    // e sem app.ator_id), que legitimamente gravam alterado_por = NULL. O que
    // se prova aqui é que as alterações feitas PELA RPC carregam o autor.
    const { data: histAtor } = await admin
      .from('historico_precos_produto')
      .select('alterado_por')
      .eq('produto_id', novoId)
      .eq('alterado_por', gerenteA.id)
    checar(
      'histórico de preço registrou o ator nas alterações via RPC privilegiada',
      (histAtor ?? []).length >= 1,
      `eventos com ator=${(histAtor ?? []).length}`,
    )
  }

  await limpar()

  console.log(`\n=== ${resultados.length - falhas}/${resultados.length} verificações passaram ===`)
  if (falhas > 0) {
    console.error(`${falhas} FALHA(S).`)
    process.exit(1)
  }
  console.log('Dados de teste removidos.')
}

main().catch(async (e) => {
  console.error('ERRO:', e.message)
  try {
    await limpar()
  } catch {
    /* limpeza best-effort */
  }
  process.exit(1)
})
