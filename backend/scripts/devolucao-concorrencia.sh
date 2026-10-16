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
# Cenário 3: DOIS caixas elegíveis, duas devoluções (vendas distintas) em caixas DIFERENTES ao mesmo tempo → ambas passam
#            e a segunda NÃO espera o lock do caixa da primeira (sem serialização indevida nem deadlock); cada caixa
#            paga só a sua.
# Cenário 4: a MESMA venda disputada por duas sessões usando caixas diferentes → exatamente UMA passa; só o caixa da
#            vencedora é debitado (o outro caixa fica intacto).
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
INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES ('$LOJA', 'DINHEIRO', 'Dinheiro', true) ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
SQL

CAIXA="$($P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" -c "INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id) VALUES ('$OP','ABERTO',now(),50,'$LOJA') RETURNING id" | tail -1)"
echo "caixa=$CAIXA"

vender() {  # $1 = uuid da venda (100 em dinheiro, 4 un x 25); $2 = produto (padrão: $PROD)
  $P -c "SELECT set_config('request.jwt.claim.sub','$OP',false)" -c "
  SELECT status FROM public.finalizar_venda_transacional_canonica_v4(
    '$1'::uuid, '$CAIXA'::uuid, '$OP'::uuid, '$LOJA'::uuid, 'DINHEIRO', 100, 0, 100,
    '[{\"forma_pagamento\":\"DINHEIRO\",\"valor\":100}]'::jsonb,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', '${2:-$PROD}', 'quantidade', 4,
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
devolver_sql() {  # $1 venda, $2 chave, $3 qtd, $4 valor, $5 caixa (padrão: $CAIXA)
  echo "SELECT set_config('request.jwt.claim.sub','$GER',false);
  DO \$\$ DECLARE t0 timestamptz := clock_timestamp(); BEGIN
    PERFORM * FROM public.devolver_ou_trocar_venda('$1'::uuid, '$2', 'conc', 'DEVOLUCAO',
      jsonb_build_array(jsonb_build_object('item_venda_id','$(item_de "$1")','quantidade',$3)), $4, 'DINHEIRO', NULL, NULL, '${5:-$CAIXA}'::uuid);
    RAISE NOTICE 'RESULTADO=OK DUR_MS=%', round(extract(epoch FROM clock_timestamp() - t0) * 1000);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'RESULTADO=% DUR_MS=%', SQLERRM, round(extract(epoch FROM clock_timestamp() - t0) * 1000); END \$\$;"
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

# ── Cenário 3 ───────────────────────────────────────────────────────────────────────────────────────
echo "== cenário 3: dois caixas elegíveis, devoluções simultâneas em caixas diferentes"
OP2="fd$(printf '%06x' $((RANDOM*RANDOM % 16777215)))-0000-4000-8000-000000000006"
$P -c "INSERT INTO auth.users (id) VALUES ('$OP2')" \
   -c "INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES ('$OP2', 'conc op2', 'OPERADOR', true, '$LOJA')" >/dev/null
CAIXA2="$($P -c "SELECT set_config('request.jwt.claim.sub','$OP2',false)" -c "INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id) VALUES ('$OP2','ABERTO',now(),300,'$LOJA') RETURNING id" | sed -n 2p)"
# Produto distinto para V5: devoluções do MESMO produto disputam a mesma linha de estoque (serialização inerente ao
# estoque, não ao caixa). Com produtos diferentes, o caixa é o único recurso potencialmente compartilhado.
PROD2="$($P -c "SELECT gen_random_uuid()")"
$P -c "INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id) VALUES ('$PROD2', '8899$SUF', 'conc prod2', '$CAT', 25.00, 'brasil_nf', false, true, '$LOJA')" \
   -c "INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES ('$PROD2', '$LOJA', 1000, 0)" >/dev/null
V4="$($P -c "SELECT gen_random_uuid()")"; V5="$($P -c "SELECT gen_random_uuid()")"; V6="$($P -c "SELECT gen_random_uuid()")"
[ "$(vender "$V4")" = "CONCLUIDA" ] && [ "$(vender "$V5" "$PROD2")" = "CONCLUIDA" ] && [ "$(vender "$V6")" = "CONCLUIDA" ] \
  || { echo "FALHOU: setup de vendas (cenários 3/4)"; exit 1; }
A1_ANTES="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"; A2_ANTES="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA2')")"
echo "caixa1=$A1_ANTES caixa2=$A2_ANTES"
# E segura o lock do caixa1 por 6s (> lock_timeout de 4s da RPC). A duração de F é medida DENTRO do banco
# (clock_timestamp): shell/docker acrescentam ~1s por chamada e mascarariam a espera. Se F dependesse do lock do
# caixa1 ela estouraria o lock_timeout (falha) ou levaria segundos dentro do banco.
( { echo "BEGIN;"; devolver_sql "$V4" "conc-e-$SUF" 4 100 "$CAIXA"; echo "SELECT pg_sleep(6); COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_e.$SUF &
PID_E=$!
sleep 1
( { echo "BEGIN;"; devolver_sql "$V5" "conc-f-$SUF" 4 100 "$CAIXA2"; echo "COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_f.$SUF
wait $PID_E
RE="$(cat /tmp/conc_e.$SUF)"; RF="$(cat /tmp/conc_f.$SUF)"
F_MS="$(echo "$RF" | sed -n 's/.*DUR_MS=\([0-9]*\).*/\1/p')"
echo "E: $RE"; echo "F: $RF (dentro do banco: ${F_MS}ms enquanto E segurava o lock do caixa1)"
echo "$RE" | grep -q 'RESULTADO=OK' && echo "$RF" | grep -q 'RESULTADO=OK' || { echo "FALHOU cenário 3: as duas deveriam passar"; exit 1; }
[ -n "$F_MS" ] && [ "$F_MS" -lt 1000 ] || { echo "FALHOU cenário 3: a sessão F esperou por outro caixa (${F_MS:-?}ms dentro do banco)"; exit 1; }
A1="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"; A2="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA2')")"
awk -v a="$A1" -v b="$A1_ANTES" 'BEGIN{exit !((b-a)==100)}' && awk -v a="$A2" -v b="$A2_ANTES" 'BEGIN{exit !((b-a)==100)}' \
  || { echo "FALHOU cenário 3: cada caixa deveria pagar exatamente 100 (caixa1 $A1_ANTES→$A1; caixa2 $A2_ANTES→$A2)"; exit 1; }
echo "OK cenário 3: caixas distintos não se serializam (F=${F_MS}ms dentro do banco) e cada um pagou só a sua devolução"

# ── Cenário 4 ───────────────────────────────────────────────────────────────────────────────────────
echo "== cenário 4: mesma venda, sessões usando caixas diferentes"
A1_ANTES="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"; A2_ANTES="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA2')")"
( { echo "BEGIN;"; devolver_sql "$V6" "conc-g-$SUF" 4 100 "$CAIXA"; echo "SELECT pg_sleep(3); COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_g.$SUF &
PID_G=$!
sleep 1
( { echo "BEGIN;"; devolver_sql "$V6" "conc-h-$SUF" 4 100 "$CAIXA2"; echo "COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 2>&1 | grep RESULTADO || true ) > /tmp/conc_h.$SUF &
PID_H=$!
wait $PID_G $PID_H
RG="$(cat /tmp/conc_g.$SUF)"; RH="$(cat /tmp/conc_h.$SUF)"
echo "G(caixa1): $RG"; echo "H(caixa2): $RH"
OKS=$(printf '%s\n%s\n' "$RG" "$RH" | grep -c 'RESULTADO=OK' || true)
EXC=$(printf '%s\n%s\n' "$RG" "$RH" | grep -c 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA' || true)
NOPS="$($P -c "SELECT count(*) FROM public.venda_pos_venda_operacoes WHERE venda_id='$V6'")"
A1="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA')")"; A2="$($P -c "SELECT internal.valor_sistema_dinheiro('$CAIXA2')")"
[ "$OKS" = "1" ] && [ "$EXC" = "1" ] && [ "$NOPS" = "1" ] || { echo "FALHOU cenário 4 (ok=$OKS excede=$EXC operacoes=$NOPS)"; exit 1; }
D1=$(awk -v a="$A1" -v b="$A1_ANTES" 'BEGIN{print b-a}'); D2=$(awk -v a="$A2" -v b="$A2_ANTES" 'BEGIN{print b-a}')
awk -v x="$D1" -v y="$D2" 'BEGIN{exit !((x==100 && y==0) || (x==0 && y==100))}' \
  || { echo "FALHOU cenário 4: exatamente um caixa deveria pagar 100 (caixa1 -$D1; caixa2 -$D2)"; exit 1; }
echo "OK cenário 4: uma só devolução efetivada; somente o caixa vencedor foi debitado (caixa1 -$D1, caixa2 -$D2)"
echo "devolucao-concorrencia OK"
