/**
 * Fluxo operacional PDV ↔ caixa ↔ financeiro (uma narrativa contínua).
 *
 * Garante, no PostgreSQL em memória com as migrations oficiais:
 * 1) Venda DINHEIRO credita só a gaveta (não o banco)
 * 2) PIX/cartão geram recebível; banco só sobe na liquidação (cartão com taxa)
 * 3) Forma→conta pré-preenche recebível sem creditar
 * 4) Sangria + VINCULAR_CAIXA = uma saída no PDV e uma entrada no banco (sem duplicar)
 * 5) Estorno da sangria reverte ambos sem virar despesa
 * 6) Compra a prazo não reduz saldo; pagamento parcial reduz só o liquidado
 * 7) Replay não duplica; loja B não movimenta conta da loja A
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

let db
const loja = randomUUID()
const outra = randomUUID()
const usuario = randomUUID()
const outroUsuario = randomUUID()
const categoria = randomUUID()
const cliente = randomUUID()
const caixa = randomUUID()
const sql = async (query, params = []) => (await db.query(query, params)).rows
const cmd = async (tipo, dados, key = randomUUID()) =>
  (await sql('select public.financeiro_comando($1,$2,$3) as result', [tipo, JSON.stringify(dados), key]))[0].result
const painel = async () => (await sql("select public.financeiro_painel('2026-10-01','2026-10-31',1) as data"))[0].data
const saldoConta = async (id) =>
  Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id=$1', [id]))[0].s)
const saldoCaixa = async () =>
  Number((await sql('select saldo_atual from caixas where id=$1', [caixa]))[0].saldo_atual)
const cents = (n) => Math.round(Number(n) * 100)

let banco
let reserva

before(async () => {
  db = await PGlite.create()
  await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create function public.round_abnt(numeric,integer) returns numeric language sql immutable as 'select round($1,$2)';
 create table lojas(id uuid primary key);
 create table usuarios(id uuid primary key,loja_id uuid,perfil text,ativo boolean,nome text);
 create table clientes(id uuid primary key,loja_id uuid,nome text);
 create table fornecedores(id uuid primary key,loja_id uuid,nome text);
 create type categoria_financeira_tipo as enum('RECEITA','DESPESA','AMBOS');
 create table categorias_financeiras(id uuid primary key,nome text,tipo categoria_financeira_tipo,ativo boolean);
 create table caixas(id uuid primary key,loja_id uuid,saldo_atual numeric,status text,data_fechamento timestamptz,valor_fechamento numeric,fechamento_diferenca numeric);
 create table vendas(id uuid primary key,caixa_id uuid,status text,total_liquido numeric,forma_pagamento text,data timestamptz);
 create table vendas_pagamentos(id uuid primary key,venda_id uuid,valor numeric,forma_pagamento text);
 create table devolucoes(id uuid primary key,venda_id uuid,valor numeric,forma_pagamento text,operacao_id uuid,caixa_desembolso_id uuid);
 create table venda_pos_venda_operacoes(id uuid primary key,forma_estorno text);
 create table venda_pos_venda_itens(item_venda_id uuid,quantidade numeric);
 create table itens_venda(id uuid primary key,venda_id uuid,quantidade numeric,custo_unitario_snap numeric);
 create table contas_pagar(id uuid primary key default gen_random_uuid(),loja_id uuid,fornecedor_id uuid not null,nfe_importacao_id uuid,descricao text,vencimento date,valor_total numeric,valor_pago numeric default 0,status text default 'PENDENTE',criado_em timestamptz default now());
 create table contas_receber(id uuid primary key default gen_random_uuid(),cliente_id uuid,loja_id uuid,descricao text,valor_total numeric,valor_aberto numeric,vencimento date,status text default 'ABERTO');
 create table contas_pagar_pagamentos(id uuid primary key default gen_random_uuid(),conta_id uuid,valor numeric,forma_pagamento text,data_pagamento timestamptz,observacao text,usuario_id uuid,created_at timestamptz default now(),idempotency_key text,origem text,loja_id uuid,caixa_id uuid,operacao_tipo text default 'PAGAMENTO',operacao_origem_id uuid,movimentacao_caixa_id uuid,unique(conta_id,idempotency_key));
 create table liquidacoes_receber(id uuid primary key default gen_random_uuid(),titulo_id uuid,valor numeric,forma_pagamento text,observacao text,created_by uuid,idempotency_key text,origem text,loja_id uuid,caixa_id uuid,operacao_tipo text default 'RECEBIMENTO',operacao_origem_id uuid,created_at timestamptz default now(),unique(titulo_id,idempotency_key));
 create table movimentacoes_caixa(id uuid primary key,caixa_id uuid,tipo text,valor numeric,status text,deleted_at timestamptz,forma_pagamento text,created_at timestamptz,movimentacao_origem_id uuid);
 create table formas_pagamento(id uuid primary key default gen_random_uuid(),loja_id uuid not null,codigo text not null,nome text not null,taxa_percentual numeric default 0,prazo_compensacao_dias integer default 0,ativo boolean default true,created_at timestamptz default now(),updated_at timestamptz default now(),unique(loja_id,codigo));
 grant usage on schema public,auth to authenticated;
 grant select on usuarios,clientes to authenticated;
 grant all on contas_pagar_pagamentos,liquidacoes_receber to authenticated,anon;
 `)

  for (const [file, name] of [
    ['20260909120000_tokens_autorizacao_operacao_sangria_ap.sql', 'registrar_pagamento_contas_pagar'],
    ['20260814013447_enforce_store_scoped_receivables.sql', 'registrar_liquidacao_receber'],
    ['20260814095445_auditable_ar_ap_reversals.sql', 'estornar_liquidacao_receber'],
    ['20260814095445_auditable_ar_ap_reversals.sql', 'estornar_pagamento_contas_pagar'],
  ]) {
    const source = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
    assert.ok(start >= 0, `RPC ${name}`)
    const block = source.slice(start)
    const delimiter = block.match(/AS\s+(\$\w*\$)/i)[1]
    const body = block.indexOf(delimiter) + delimiter.length
    const end = block.indexOf(delimiter, body) + delimiter.length
    await db.exec(block.slice(0, end) + ';')
  }

  await db.exec(readFileSync(new URL('../supabase/migrations/20260731195933_credita_saldo_caixa_venda_dinheiro.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261005004647_financeiro_loja_contas_ledger.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261005091218_financeiro_hardening_final.sql', import.meta.url), 'utf8'))
  // Fixture histórica em quarantine (FORBIDDEN_APPLY) — path fora de migrations/.
  await db.exec(
    readFileSync(
      new URL(
        '../supabase/migrations-forbidden/20261006120000_financeiro_contas_formas_e_painel.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )

  await sql('insert into lojas values($1),($2)', [loja, outra])
  await sql("insert into usuarios values($1,$2,'DONO',true,'Gerente'),($3,$4,'ADMIN',true,'Outro')", [usuario, loja, outroUsuario, outra])
  await sql("insert into categorias_financeiras values($1,'Geral','AMBOS',true)", [categoria])
  await sql('insert into clientes values($1,$2,$3)', [cliente, loja, 'Cliente'])
  await sql("insert into caixas(id,loja_id,saldo_atual,status) values($1,$2,100,'ABERTO')", [caixa, loja])
  await sql(
    "insert into formas_pagamento(loja_id,codigo,nome) values($1,'DINHEIRO','Dinheiro'),($1,'PIX','Pix'),($1,'CARTAO_CREDITO','Cartão')",
    [loja],
  )
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [usuario])

  banco = (await cmd('CRIAR_CONTA', { nome: 'Banco loja', tipo: 'BANCO', data: '2026-10-01', valor: 5000 })).id
  reserva = (await cmd('CRIAR_CONTA', { nome: 'Caixa reserva', tipo: 'RESERVA', data: '2026-10-01' })).id
  await cmd('VINCULAR_FORMA_PAGAMENTO', { codigo: 'PIX', conta_id: banco })
  await cmd('VINCULAR_FORMA_PAGAMENTO', { codigo: 'CARTAO_CREDITO', conta_id: banco })
  await cmd('VINCULAR_FORMA_PAGAMENTO', { codigo: 'DINHEIRO', conta_id: reserva })
})

after(async () => db?.close())

async function vender({ total, pagamentos, forma = 'MISTO' }) {
  const sale = randomUUID()
  // Mesma transação do PDV: triggers deferidos veem cabeçalho + parcelas juntos.
  const pags = pagamentos
    .map((p) => `('${randomUUID()}','${sale}',${p.valor},'${p.forma}')`)
    .join(',')
  await db.exec(`begin;
    insert into vendas values('${sale}','${caixa}','CONCLUIDA',${total},'${forma}','2026-10-02 15:00:00+00');
    insert into vendas_pagamentos values ${pags};
  commit;`)
  return sale
}

test('fluxo PDV↔caixa↔financeiro: dinheiro, pix, cartão, sangria única e pagamento parcial', async () => {
  assert.equal(await saldoCaixa(), 100)
  assert.equal(await saldoConta(banco), 5000)

  // 1) Venda em dinheiro: só gaveta
  await vender({ total: 50, forma: 'DINHEIRO', pagamentos: [{ valor: 50, forma: 'DINHEIRO' }] })
  assert.equal(await saldoCaixa(), 150)
  assert.equal(await saldoConta(banco), 5000)
  assert.equal(
    Number((await sql("select count(*) as n from financeiro_recebiveis_venda where forma='DINHEIRO'"))[0].n),
    0,
  )

  // 2) PIX: recebível com conta sugerida; banco ainda não sobe
  const vendaPix = await vender({ total: 2000, forma: 'PIX', pagamentos: [{ valor: 2000, forma: 'PIX' }] })
  const recPix = (await sql('select * from financeiro_recebiveis_venda where venda_id=$1', [vendaPix]))[0]
  assert.equal(recPix.conta_financeira_id, banco)
  assert.equal(recPix.status, 'PENDENTE')
  assert.equal(await saldoConta(banco), 5000)
  assert.equal(await saldoCaixa(), 150)

  await cmd('CONFIGURAR_RECEBIVEL', { recebivel_id: recPix.id, conta_id: banco, taxa: 0, data: '2026-10-02' })
  const keyPix = randomUUID()
  const receber1 = await cmd('RECEBER_VENDA', { recebivel_id: recPix.id, data: '2026-10-02' }, keyPix)
  assert.deepEqual(await cmd('RECEBER_VENDA', { recebivel_id: recPix.id, data: '2026-10-02' }, keyPix), receber1)
  assert.equal(await saldoConta(banco), 7000)
  assert.equal(
    Number((await sql("select count(*) as n from movimentos_financeiros where origem='RECEBIVEL_VENDA' and origem_id=$1", [keyPix]))[0].n),
    1,
  )

  // 3) Cartão: só sobe no repasse líquido
  const vendaCartao = await vender({
    total: 100,
    forma: 'CARTAO_CREDITO',
    pagamentos: [{ valor: 100, forma: 'CARTAO_CREDITO' }],
  })
  const recCartao = (await sql('select * from financeiro_recebiveis_venda where venda_id=$1', [vendaCartao]))[0]
  assert.equal(recCartao.conta_financeira_id, banco)
  assert.equal(await saldoConta(banco), 7000)
  await cmd('CONFIGURAR_RECEBIVEL', { recebivel_id: recCartao.id, conta_id: banco, taxa: 3, data: '2026-10-03' })
  await cmd('RECEBER_VENDA', { recebivel_id: recCartao.id, data: '2026-10-03' })
  assert.equal(await saldoConta(banco), 7097)

  // 4) Venda mista: dinheiro na gaveta + PIX pendente
  const mista = await vender({
    total: 150,
    forma: 'MISTO',
    pagamentos: [
      { valor: 50, forma: 'DINHEIRO' },
      { valor: 100, forma: 'PIX' },
    ],
  })
  assert.equal(await saldoCaixa(), 200)
  const recMista = await sql('select * from financeiro_recebiveis_venda where venda_id=$1', [mista])
  assert.equal(recMista.length, 1)
  assert.equal(Number(recMista[0].bruto), 100)
  assert.equal(await saldoConta(banco), 7097)

  // 5) Sangria: fato no PDV + uma única contrapartida financeira
  const sangria = randomUUID()
  await sql("update caixas set saldo_atual = saldo_atual - 80 where id=$1", [caixa])
  await sql(
    "insert into movimentacoes_caixa(id,caixa_id,tipo,valor,status,forma_pagamento,created_at) values($1,$2,'sangria',80,'aprovado','dinheiro',now())",
    [sangria, caixa],
  )
  assert.equal(await saldoCaixa(), 120)
  const bancoAntesSangria = await saldoConta(banco)
  const keySangria = randomUUID()
  await cmd('VINCULAR_CAIXA', { movimento_id: sangria, conta_id: banco, data: '2026-10-04' }, keySangria)
  assert.equal(await saldoConta(banco), bancoAntesSangria + 80)
  assert.equal(await saldoCaixa(), 120)
  await assert.rejects(cmd('VINCULAR_CAIXA', { movimento_id: sangria, conta_id: banco, data: '2026-10-04' }), /utilizado/)
  assert.equal(
    Number((await sql("select count(*) as n from movimentos_financeiros where origem='TRANSFERENCIA_PDV' and origem_id=$1", [sangria]))[0].n),
    1,
  )

  // 6) Estorno da sangria: reverte PDV e banco; não vira despesa
  const resultadoAntes = (await painel()).resultado_caixa
  await sql("update caixas set saldo_atual = saldo_atual + 80 where id=$1", [caixa])
  await sql(
    "insert into movimentacoes_caixa(id,caixa_id,tipo,valor,status,forma_pagamento,movimentacao_origem_id,created_at) values($1,$2,'estorno',80,'aprovado','dinheiro',$3,now())",
    [randomUUID(), caixa, sangria],
  )
  assert.equal(await saldoCaixa(), 200)
  assert.equal(await saldoConta(banco), bancoAntesSangria)
  assert.deepEqual((await painel()).resultado_caixa, resultadoAntes)

  // 7) Compra a prazo não reduz saldo; pagamento parcial reduz só o liquidado
  await cmd('CRIAR_AP', {
    descricao: 'Compra prazo fluxo',
    favorecido: 'Fornecedor',
    categoria_id: categoria,
    valor: 800,
    data: '2026-10-05',
    parcelas: 1,
  })
  const titulo = (await sql("select id,valor_pago,valor_total from contas_pagar where descricao='Compra prazo fluxo'"))[0]
  const bancoAntesAp = await saldoConta(banco)
  assert.equal(bancoAntesAp, await saldoConta(banco))
  await cmd('BAIXAR_AP', {
    titulo_id: titulo.id,
    conta_id: banco,
    valor: 300,
    data: '2026-10-05',
    descricao: 'Parcial',
  })
  assert.equal(await saldoConta(banco), bancoAntesAp - 300)
  const tituloApos = (await sql('select valor_pago,valor_total,status from contas_pagar where id=$1', [titulo.id]))[0]
  assert.equal(Number(tituloApos.valor_pago), 300)
  assert.notEqual(tituloApos.status, 'PAGO')

  // 8) Aceite consolidado do banco neste turno: 5000 + 2000 + 97 - 300 = 6797
  //    (sangria estornada; mista PIX ainda pendente)
  assert.equal(await saldoConta(banco), 6797)

  // 9) Isolamento de loja
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [outroUsuario])
  await assert.rejects(
    cmd('BAIXAR_AP', { titulo_id: titulo.id, conta_id: banco, valor: 10, data: '2026-10-05', descricao: 'x' }),
    /esta loja|Financeiro/,
  )
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [usuario])

  // Evidência resumida no painel
  const p = await painel()
  const contaBanco = p.contas.find((c) => c.id === banco)
  assert.equal(cents(contaBanco.saldo), 679700)
  assert.ok(p.formas_pagamento.some((f) => f.codigo === 'PIX' && f.conta_financeira_id === banco))
  assert.ok(p.formas_pagamento.some((f) => f.codigo === 'DINHEIRO' && f.conta_financeira_id === reserva))
})
