#!/usr/bin/env bash
# PR-2D — concorrência da devolução (A-7: sem saldo negativo indevido; A-4: sem efeito duplicado).
#
# Usa DUAS sessões reais (transações que se sobrepõem no tempo). Grava dados COMMITADOS: rode só em banco
# descartável (Supabase local/CI), nunca em produção.
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash backend/scripts/devolucao-concorrencia.sh
#   # ou, com o banco no Docker:
#   PSQL="docker exec -i supabase_db_fastproduct psql -U postgres -d pr2d_conc" bash backend/scripts/devolucao-concorrencia.sh
#
# Cenário 1: caixa com R$150 (fundo 50 + venda 100). Duas devoluções de R$100 (vendas distintas) disparadas ao mesmo
#            tempo no MESMO caixa pagador → exatamente UMA passa; a outra falha com SALDO_CAIXA_INSUFICIENTE; a autoridade
#            termina em R$50 (nunca negativa).
# Cenário 2: mesma venda, duas devoluções totais com chaves diferentes ao mesmo tempo → exatamente UMA passa (a outra
#            recebe QTD_EXCEDE_VENDIDA); estoque devolvido uma única vez.
set -euo pipefail

PSQL="${PSQL:-psql ${DB_URL:?defina DB_URL ou PSQL}}"
P="$PSQL -v ON_ERROR_STOP=1 -qAt"

SUF="$(date +%s)$RANDOM"
LOJA="f8$(printf '%06x' $((RANDOM*RANDOM % 16777215)))-0000-4000-8000-000000000001"
GER="f9$(printf '%06x' $((RANDOM*RANDOM % 16777215)))-0000-4000-8000-000000000002"
OP="fa$(printf '%06x' $((RANDOM*RANDOM % 16777215)))-0000-4000-8000-000000000003"
PROD="fb$(printf '%06x' $((RANDOM*RANDOM % 16777215)))-0000-4000-8000-000000000004"
CAT="fc$(printf '%06x' $((RANDOM*RANDOM % 16777215)))-0000-4000-8000-000000000005"

echo "== setup (commitado, banco descartável)"
$P <<SQL >/dev/null
INSERT INTO public.categorias (id, nome) VALUES ('$CAT', 'conc $SUF');
INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES ('$LOJA', 'conc $SUF', 'CONC$SUF', true);
INSERT INTO auth.users (id) VALUES ('$GER'), ('$OP');
INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES ('$GER', 'conc ger', 'GERENTE', true, '$LOJA'), ('$OP', 'conc op', 'OPERADOR', true, '$LOJA');
INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
VALUES ('$PROD', '7899$SUF', 'conc prod', '$CAT', 25.00, 'brasil_nf', false, true, '$LOJA');
INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES ('$PROD', '$LOJA', 1000, 0);
INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES ('$LOJA', 'DINHEIRO', 'Dinheiro', true);
SQL

CAIXA="$($P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" -c "INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id) VALUES ('$OP','ABERTO',now(),50,'$LOJA') RETURNING id" | tail -1)"
echo "caixa=$CAIXA"

vender() {  # $1 = uuid da venda (100 em dinheiro, 4 un x 25)
  $P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" -c "
  SELECT status FROM public.finalizar_venda_transacional_canonica_v4(
    '$1'::uuid, '$CAIXA'::uuid, '$OP'::uuid, '$LOJA'::uuid, 'DINHEIRO', 100, 0, 100,
    '[{\"forma_pagamento\":\"DINHEIRO\",\"valor\":100}]'::jsonb,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', '$PROD', 'quantidade', 4,
      'preco_original', 25, 'preco_unitario', 25, 'tipo_preco', 'VAREJO')),
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)" | tail -1
}
V1="$($P -c "SELECT gen_random_uuid()")"
V2="$($P -c "SELECT gen_random_uuid()")"
V3="$($P -c "SELECT gen_random_uuid()")"
[ "$(vender "$V1")" = "CONCLUIDA" ] && [ "$(vender "$V2")" = "CONCLUIDA" ] && [ "$(vender "$V3")" = "CONCLUIDA" ] \
  || { echo "FALHOU: setup de vendas"; exit 1; }
# fundo 50 + 3 vendas de 100 = 350; para o cenário 1 usamos só V1/V2 → sacamos 150 para deixar exatamente 150 na gaveta
$P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" \
   -c "SELECT 1 FROM public.registrar_movimentacao('$CAIXA'::uuid,'sangria','dinheiro',100,'conc','RETIRADA',NULL,NULL,'conc-sangria-$SUF')" >/dev/null
AUT0="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"
echo "autoridade inicial=$AUT0 (esperado 250 = 50 + 300 - 100)"

item_de() { $P -c "SELECT id FROM public.itens_venda WHERE venda_id='$1' LIMIT 1" | tail -1; }
devolver_sql() {  # $1 venda, $2 chave, $3 qtd, $4 valor
  echo "SELECT set_config('request.jwt.claim.sub','$GER',false);
  DO \$\$ BEGIN
    PERFORM * FROM public.devolver_ou_trocar_venda('$1'::uuid, '$2', 'conc', 'DEVOLUCAO',
      jsonb_build_array(jsonb_build_object('item_venda_id','$(item_de "$1")','quantidade',$3)), $4, 'DINHEIRO', NULL, NULL, '$CAIXA'::uuid);
    RAISE NOTICE 'RESULTADO=OK';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'RESULTADO=%', SQLERRM; END \$\$;"
}

# ── Cenário 1 ───────────────────────────────────────────────────────────────────────────────────────
echo "== cenário 1: duas devoluções de 100 (vendas distintas) no mesmo caixa com 250 → segunda de 3 tentativas estoura"
# reduz a gaveta para 150: sangria adicional de 100
$P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" \
   -c "SELECT 1 FROM public.registrar_movimentacao('$CAIXA'::uuid,'sangria','dinheiro',100,'conc2','RETIRADA',NULL,NULL,'conc-sangria2-$SUF')" >/dev/null
AUT1="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"
echo "autoridade antes=$AUT1 (esperado 150)"

# Sessão A segura o lock do caixa por 3s; a B começa 1s depois e deve esperar o commit da A.
( { echo "BEGIN;"; devolver_sql "$V1" "conc-a-$SUF" 4 100; echo "SELECT pg_sleep(3); COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_a.$SUF &
PID_A=$!
sleep 1
( { echo "BEGIN;"; devolver_sql "$V2" "conc-b-$SUF" 4 100; echo "COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_b.$SUF &
PID_B=$!
wait $PID_A $PID_B
RA="$(cat /tmp/conc_a.$SUF)"; RB="$(cat /tmp/conc_b.$SUF)"
echo "A: $RA"; echo "B: $RB"
OKS=$(printf '%s\n%s\n' "$RA" "$RB" | grep -c 'RESULTADO=OK' || true)
INS=$(printf '%s\n%s\n' "$RA" "$RB" | grep -c 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE' || true)
AUT2="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"
echo "autoridade depois=$AUT2"
[ "$OKS" = "1" ] && [ "$INS" = "1" ] || { echo "FALHOU cenário 1: esperado exatamente 1 OK e 1 SALDO_CAIXA_INSUFICIENTE (ok=$OKS insuf=$INS)"; exit 1; }
awk -v a="$AUT2" 'BEGIN{exit !(a>=0)}' || { echo "FALHOU: autoridade negativa"; exit 1; }
[ "$AUT2" = "50.00" ] || { echo "FALHOU: autoridade final deveria ser 50.00, veio $AUT2"; exit 1; }
echo "OK cenário 1 (A-7): uma devolução passou, a outra foi barrada; autoridade=50.00 (nunca negativa)"

# ── Cenário 2 ───────────────────────────────────────────────────────────────────────────────────────
echo "== cenário 2: mesma venda, duas devoluções totais concorrentes com chaves diferentes"
# gaveta com dinheiro suficiente
$P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" \
   -c "SELECT 1 FROM public.registrar_movimentacao('$CAIXA'::uuid,'suprimento','dinheiro',500,'conc3','TROCO',NULL,NULL,'conc-sup-$SUF')" >/dev/null
EST0="$($P -c "SELECT quantidade_atual FROM public.estoque WHERE produto_id='$PROD' AND loja_id='$LOJA'")"
( { echo "BEGIN;"; devolver_sql "$V3" "conc-c-$SUF" 4 100; echo "SELECT pg_sleep(3); COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_c.$SUF &
PID_C=$!
sleep 1
( { echo "BEGIN;"; devolver_sql "$V3" "conc-d-$SUF" 4 100; echo "COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_d.$SUF &
PID_D=$!
wait $PID_C $PID_D
RC="$(cat /tmp/conc_c.$SUF)"; RD="$(cat /tmp/conc_d.$SUF)"
echo "C: $RC"; echo "D: $RD"
OKS=$(printf '%s\n%s\n' "$RC" "$RD" | grep -c 'RESULTADO=OK' || true)
EXC=$(printf '%s\n%s\n' "$RC" "$RD" | grep -c 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA' || true)
EST1="$($P -c "SELECT quantidade_atual FROM public.estoque WHERE produto_id='$PROD' AND loja_id='$LOJA'")"
NOPS="$($P -c "SELECT count(*) FROM public.venda_pos_venda_operacoes WHERE venda_id='$V3'")"
[ "$OKS" = "1" ] && [ "$EXC" = "1" ] && [ "$NOPS" = "1" ] || { echo "FALHOU cenário 2 (ok=$OKS excede=$EXC operacoes=$NOPS)"; exit 1; }
awk -v a="$EST1" -v b="$EST0" 'BEGIN{exit !((a-b)==4)}' || { echo "FALHOU: estoque devolvido deveria ser 4 (antes=$EST0 depois=$EST1)"; exit 1; }
echo "OK cenário 2 (A-4): uma única devolução efetivada; estoque devolvido uma vez (+4)"
echo "devolucao-concorrencia OK"
