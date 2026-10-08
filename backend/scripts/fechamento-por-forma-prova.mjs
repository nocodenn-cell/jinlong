#!/usr/bin/env node
/**
 * Prova operacional PR A — calcular_valor_sistema_por_forma_caixa
 * Uso: node backend/scripts/fechamento-por-forma-prova.mjs
 * Env: DATABASE_URL (default local 54322)
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function sql(q) {
  return execFileSync(
    'psql',
    [DB, '-v', 'ON_ERROR_STOP=1', '-At', '-c', q],
    { encoding: 'utf8' },
  ).trim()
}

function uuidLine(out) {
  const m = out.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )
  assert(!!m, `uuid não encontrado em: ${out}`)
  return m[0]
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

const loja = randomUUID()
const loja2 = randomUUID()
const op = randomUUID()
const ger = randomUUID()
const outro = randomUUID()
const vSplit = randomUUID()
const vPix = randomUUID()
const vDeb = randomUUID()
const vCred = randomUUID()
const vParc = randomUUID()
const vCancel = randomUUID()

console.log('--- seed ---')
sql(`
INSERT INTO auth.users (id, email) VALUES
  ('${op}', 'op-${op}@local.test'),
  ('${ger}', 'ger-${ger}@local.test'),
  ('${outro}', 'ot-${outro}@local.test');
INSERT INTO public.lojas (id, nome) VALUES ('${loja}', 'Loja Forma A'), ('${loja2}', 'Loja Forma B');
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  ('${op}', 'Op Forma', 'OPERADOR', '${loja}', true),
  ('${ger}', 'Ger Forma', 'GERENTE', '${loja}', true),
  ('${outro}', 'Outra', 'GERENTE', '${loja2}', true);
`)

const caixa = uuidLine(sql(`
INSERT INTO public.caixas (operador_id, loja_id, status, valor_inicial, saldo_atual)
VALUES ('${op}', '${loja}', 'ABERTO', 50, 50)
RETURNING id;
`))

sql(`
INSERT INTO public.vendas (id, caixa_id, operador_id, status, forma_pagamento, total_bruto, total_desconto, total_liquido, tipo_venda)
VALUES
  ('${vSplit}', '${caixa}', '${op}', 'CONCLUIDA', 'DINHEIRO', 100, 0, 100, 'SEM_NF'),
  ('${vPix}', '${caixa}', '${op}', 'CONCLUIDA', 'PIX', 25, 0, 25, 'SEM_NF'),
  ('${vDeb}', '${caixa}', '${op}', 'CONCLUIDA', 'CARTAO_DEBITO', 80, 0, 80, 'SEM_NF'),
  ('${vCred}', '${caixa}', '${op}', 'CONCLUIDA', 'CARTAO_CREDITO', 90, 0, 90, 'SEM_NF'),
  ('${vParc}', '${caixa}', '${op}', 'CONCLUIDA', 'DINHEIRO', 20, 0, 20, 'SEM_NF'),
  ('${vCancel}', '${caixa}', '${op}', 'CONCLUIDA', 'PIX', 15, 0, 15, 'SEM_NF');

INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor) VALUES
  ('${vSplit}', 'DINHEIRO', 40),
  ('${vSplit}', 'PIX', 60),
  ('${vPix}', 'PIX', 25),
  ('${vDeb}', 'CARTAO_DEBITO', 80),
  ('${vCred}', 'CARTAO_CREDITO', 90),
  ('${vParc}', 'DINHEIRO', 20),
  ('${vCancel}', 'PIX', 15);

INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
VALUES ('${vSplit}', 10, 'PIX', 'prova parcial', '${op}');

UPDATE public.vendas SET status = 'CANCELADA' WHERE id = '${vCancel}';
INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
VALUES ('${vCancel}', 15, 'PIX', 'cancel sim', '${op}');
`)

console.log('--- mov físico via RPC ---')
sql(`SELECT set_config('request.jwt.claim.sub', '${ger}', true);`)
sql(`
SELECT movimentacao_id::text FROM public.registrar_movimentacao(
  '${caixa}'::uuid, 'suprimento', 'dinheiro', 10, 'prova sup', 'OUTRO',
  NULL, NULL, 'forma-sup-${caixa}', NULL, NULL, NULL, NULL, '${ger}'::uuid, NULL
);
`)
sql(`
SELECT movimentacao_id::text FROM public.registrar_movimentacao(
  '${caixa}'::uuid, 'sangria', 'dinheiro', 5, 'prova sang', 'OUTRO',
  NULL, NULL, 'forma-san-${caixa}', NULL, NULL, NULL, NULL, '${ger}'::uuid, NULL
);
`)

const ec = Number(sql(`SELECT internal.valor_sistema_dinheiro('${caixa}'::uuid);`))
assert(ec === 115, `E(c) esperado 115 got ${ec}`)
console.log('OK E(c)=115 (50+40+20+10-5)')

const rows = sql(`
SELECT forma_pagamento || '=' || valor_sistema::text || ':' || metrica
FROM public.calcular_valor_sistema_por_forma_caixa('${caixa}'::uuid)
ORDER BY 1;
`)
console.log(rows)

const map = Object.fromEntries(
  rows.split('\n').filter(Boolean).map((line) => {
    const [k, rest] = line.split('=')
    const [val, metrica] = rest.split(':')
    return [k, { val: Number(val), metrica }]
  }),
)

assert(map.DINHEIRO.val === ec, `DINHEIRO ${map.DINHEIRO.val} <> E(c) ${ec}`)
assert(map.DINHEIRO.metrica === 'E_C_AUTORIDADE', 'metrica DINHEIRO')
assert(map.PIX.val === 75, `PIX esperado 75 got ${map.PIX.val}`)
assert(map.PIX.metrica === 'REGISTRADO_JINLONG', 'metrica PIX')
assert(map.CARTAO_DEBITO.val === 80, `DEB ${map.CARTAO_DEBITO.val}`)
assert(map.CARTAO_CREDITO.val === 90, `CRED ${map.CARTAO_CREDITO.val}`)
assert(!('FIADO' in map), 'FIADO não deve aparecer')

console.log('OK split/parcial/cancel/devolução/formas')

console.log('--- auth outra loja ---')
const denied = sql(`
SELECT set_config('request.jwt.claim.sub', '${outro}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.calcular_valor_sistema_por_forma_caixa('${caixa}'::uuid);
    RAISE EXCEPTION 'AUTH_SHOULD_DENY';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'AUTH_DENIED_OK';
  WHEN others THEN
    IF SQLERRM ILIKE '%Acesso negado%' THEN
      RAISE NOTICE 'AUTH_DENIED_OK';
    ELSE
      RAISE;
    END IF;
  END;
END $$;
SELECT 'ok';
`)
assert(denied.includes('ok'), `auth: ${denied}`)
console.log('OK auth cross-loja')

console.log('POR_FORMA_PROVA_OK')
