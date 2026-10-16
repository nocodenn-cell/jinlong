#!/usr/bin/env bash
# UX-04 — Concorrência real (duas sessões) no recebimento de Ordem de Compra.
#
# Prova que o banco permanece consistente quando dois operadores/processos tentam
# receber o MESMO saldo ao mesmo tempo. A sessão 1 recebe e segura a transação
# aberta (pg_sleep) DEPOIS de travar o pedido; a sessão 2 começa no meio disso.
# Sem `FOR UPDATE` no pedido, as duas leriam o saldo antigo e creditariam em dobro.
#
# Cenários:
#   A  dois operadores, chaves diferentes, 60 + 60 com saldo 100  -> um credita, o outro é recusado
#   B  mesma chave (duplo clique / retry concorrente)             -> credita uma vez; o outro recebe o replay
#   C  entrada sem nota vinculada  x  "receber" do pedido         -> vias diferentes também se serializam
#   D  encerrar com falta  x  receber                             -> o recebimento vê o pedido já encerrado
#
# Uso (stack local no ar: `cd backend && npx supabase start`):
#   bash backend/scripts/ux04-oc-recebimento-concorrencia.sh
# Dados de teste são criados COM COMMIT (a concorrência exige) e removidos ao final.

set -uo pipefail
CONT="${SUPABASE_DB_CONTAINER:-supabase_db_fastproduct}"

pg()  { docker exec -i "$CONT" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
adm() { docker exec -i "$CONT" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
uuid() { pg -c "select gen_random_uuid()"; }

TMP="$(mktemp -d)"
FAILS=0
ok()   { echo "  ✔ $*"; }
fail() { echo "  ✘ $*"; FAILS=$((FAILS + 1)); }

LOJA="$(uuid)"; U1="$(uuid)"; U2="$(uuid)"; CAT="$(uuid)"; PROD="$(uuid)"

cleanup() {
  adm <<SQL >/dev/null 2>&1
set session_replication_role = replica;
delete from public.ordens_compra_recebimentos where loja_id = '$LOJA';
delete from public.movimentos_estoque_log where loja_id = '$LOJA';
delete from public.remessa_itens where remessa_id in (select id from public.remessas where loja_id = '$LOJA');
delete from public.remessas where loja_id = '$LOJA';
delete from public.estoque where loja_id = '$LOJA';
delete from public.ordens_compra_itens where ordem_id in (select id from public.ordens_compra where loja_id = '$LOJA');
delete from public.ordens_compra where loja_id = '$LOJA';
delete from public.produtos where loja_id = '$LOJA';
delete from public.categorias where id = '$CAT';
delete from public.usuarios where id in ('$U1', '$U2');
delete from auth.users where id in ('$U1', '$U2');
delete from public.formas_pagamento where loja_id = '$LOJA';
delete from public.lojas where id = '$LOJA';
SQL
  rm -rf "$TMP"
}
trap cleanup EXIT

pg <<SQL
insert into auth.users (id) values ('$U1'), ('$U2');
insert into public.lojas (id, nome, codigo, ativo) values ('$LOJA', 'UX04 conc', 'UX04C-' || substr('$LOJA', 1, 8), true);
insert into public.usuarios (id, nome, perfil, ativo, loja_id) values
  ('$U1', 'conc 1', 'GERENTE', true, '$LOJA'), ('$U2', 'conc 2', 'GERENTE', true, '$LOJA');
insert into public.categorias (id, nome) values ('$CAT', 'UX04 conc');
insert into public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, loja_id)
values ('$PROD', '789' || lpad((random() * 1e9)::bigint::text, 10, '0'), 'UX04 conc prod', '$CAT', 10, 5, 'china_manual', false, true, '$LOJA');
SQL

novo_oc() {  # $1 = id da OC ; cria pedido de 100 unidades e devolve o id do item em $ITEM
  pg <<SQL
insert into public.ordens_compra (id, loja_id, status) values ('$1', '$LOJA', 'EM_TRANSITO');
insert into public.ordens_compra_itens (ordem_id, produto_id, quantidade, preco_unitario) values ('$1', '$PROD', 100, 3);
SQL
  ITEM="$(pg -c "select id from public.ordens_compra_itens where ordem_id = '$1'")"
}

estoque()   { pg -c "select trim_scale(coalesce((select quantidade_atual from public.estoque where loja_id='$LOJA' and produto_id='$PROD'),0))"; }
recebido()  { pg -c "select trim_scale(coalesce(sum(quantidade_recebida),0)) from public.ordens_compra_itens where ordem_id='$1'"; }
kardex_n()  { pg -c "select count(*) from public.movimentos_estoque_log where loja_id='$LOJA' and produto_id='$PROD'"; }
zerar()     { adm -c "set session_replication_role = replica; delete from public.estoque where loja_id='$LOJA'; delete from public.movimentos_estoque_log where loja_id='$LOJA';" >/dev/null; }

# roda a sessão 1 (segura o lock) e a sessão 2 (entra no meio); $1/$2 = SQL das sessões
duas_sessoes() {
  local sql1="$1" sql2="$2"
  ( printf '%s\n' "$sql1" | docker exec -i "$CONT" psql -U postgres -d postgres -At > "$TMP/s1.out" 2>&1 ) &
  local p1=$!
  sleep 1.6
  local t0; t0="$(date +%s.%N)"
  ( printf '%s\n' "$sql2" | docker exec -i "$CONT" psql -U postgres -d postgres -At > "$TMP/s2.out" 2>&1 )
  local t1; t1="$(date +%s.%N)"
  wait "$p1"
  ESPERA="$(awk -v a="$t0" -v b="$t1" 'BEGIN { printf "%.1f", b - a }')"
}

sessao() {  # $1=user  $2=comando SQL  $3=segundos de pausa antes do COMMIT
  cat <<SQL
begin;
select set_config('request.jwt.claim.sub', '$1', true);
$2
select pg_sleep(${3:-0});
commit;
SQL
}

rec() { echo "select public.receber_ordem_compra('$1', '[{\"item_id\":\"$2\",\"quantidade_conferida\":$3}]'::jsonb, '$4');"; }

echo "── A) dois operadores, chaves diferentes: 60 + 60 com saldo 100 ──"
OC="$(uuid)"; novo_oc "$OC"; zerar
duas_sessoes "$(sessao "$U1" "$(rec "$OC" "$ITEM" 60 A1)" 4)" "$(sessao "$U2" "$(rec "$OC" "$ITEM" 60 A2)" 0)"
[ "$(estoque)" = "60" ]  && ok "estoque = 60 (só uma das entradas creditou)" || fail "estoque = $(estoque), esperado 60"
[ "$(recebido "$OC")" = "60" ] && ok "recebido = 60" || fail "recebido = $(recebido "$OC"), esperado 60"
[ "$(kardex_n)" = "1" ] && ok "kardex com 1 movimento" || fail "kardex com $(kardex_n) movimentos, esperado 1"
grep -q "OC_QTD_ACIMA_SALDO" "$TMP/s2.out" && ok "sessão 2 recusada com OC_QTD_ACIMA_SALDO" || fail "sessão 2 deveria ser recusada: $(head -c 200 "$TMP/s2.out")"
awk -v e="$ESPERA" 'BEGIN { exit !(e >= 1.5) }' && ok "sessão 2 ESPEROU o lock do pedido (${ESPERA}s)" || fail "sessão 2 não esperou o lock (${ESPERA}s) — sem serialização"

echo "── B) mesma chave (duplo clique / retry concorrente) ──"
OC="$(uuid)"; novo_oc "$OC"; zerar
duas_sessoes "$(sessao "$U1" "$(rec "$OC" "$ITEM" 60 KB)" 4)" "$(sessao "$U1" "$(rec "$OC" "$ITEM" 60 KB)" 0)"
[ "$(estoque)" = "60" ] && ok "estoque = 60 (creditou UMA vez)" || fail "estoque = $(estoque), esperado 60"
[ "$(kardex_n)" = "1" ] && ok "kardex com 1 movimento" || fail "kardex com $(kardex_n) movimentos"
grep -q '"replay": true' "$TMP/s2.out" && ok "sessão 2 recebeu o replay (sem erro)" || fail "sessão 2 deveria receber replay: $(head -c 240 "$TMP/s2.out")"

echo "── C) entrada sem nota vinculada × receber do pedido ──"
OC="$(uuid)"; novo_oc "$OC"; zerar
MANUAL="select public.criar_confirmar_remessa_entrada('C', null, jsonb_build_array(jsonb_build_object('produto_id','$PROD','quantidade_esperada',60,'quantidade_conferida',60)), 'MC', '$OC');"
duas_sessoes "$(sessao "$U1" "$MANUAL" 4)" "$(sessao "$U2" "$(rec "$OC" "$ITEM" 60 C2)" 0)"
[ "$(estoque)" = "60" ] && ok "estoque = 60" || fail "estoque = $(estoque), esperado 60"
[ "$(recebido "$OC")" = "60" ] && ok "recebido = 60" || fail "recebido = $(recebido "$OC")"
grep -q "OC_QTD_ACIMA_SALDO" "$TMP/s2.out" && ok "receber do pedido recusado (a outra via já abateu)" || fail "esperado OC_QTD_ACIMA_SALDO: $(head -c 200 "$TMP/s2.out")"

echo "── D) encerrar com falta × receber ──"
OC="$(uuid)"; novo_oc "$OC"; zerar
pg -c "select set_config('request.jwt.claim.sub','$U1',true); select public.receber_ordem_compra('$OC','[{\"item_id\":\"$ITEM\",\"quantidade_conferida\":30}]'::jsonb,'D0');" >/dev/null
ENC="select public.encerrar_ordem_compra_com_falta('$OC', 'fornecedor não envia o restante');"
duas_sessoes "$(sessao "$U1" "$ENC" 4)" "$(sessao "$U2" "$(rec "$OC" "$ITEM" 10 D2)" 0)"
[ "$(pg -c "select status from public.ordens_compra where id='$OC'")" = "RECEBIDA" ] && ok "pedido encerrado" || fail "pedido deveria estar RECEBIDA"
[ "$(estoque)" = "30" ] && ok "estoque = 30 (o recebimento concorrente NÃO creditou)" || fail "estoque = $(estoque), esperado 30"
grep -q "OC_STATUS_INVALIDO" "$TMP/s2.out" && ok "recebimento recusado com OC_STATUS_INVALIDO" || fail "esperado OC_STATUS_INVALIDO: $(head -c 200 "$TMP/s2.out")"

echo
if [ "$FAILS" -eq 0 ]; then echo "CONCORRÊNCIA: PASSOU"; exit 0; else echo "CONCORRÊNCIA: FALHOU ($FAILS)"; exit 1; fi
