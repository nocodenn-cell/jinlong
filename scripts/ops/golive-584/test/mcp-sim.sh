#!/usr/bin/env bash
# Simula a execução por MCP execute_sql: cada arquivo é enviado como UMA string (protocolo simples), como o MCP faz.
set -uo pipefail
export PGHOST=/tmp PGPORT=55440 PGUSER=postgres
T=/workspace/golive/test; S=/workspace/golive-final-584.sh; DB=golive_mcp
mcp(){ psql -XAt -d $DB -v ON_ERROR_STOP=1 -c "$(cat "$1")"; }   # 1 string = 1 chamada execute_sql
pass=0; fail=0; ok(){ echo "PASS  $1"; pass=$((pass+1)); }; ko(){ echo "FAIL  $1"; fail=$((fail+1)); }
psql -Xq -c "drop database if exists $DB" -c "create database $DB template golive_tpl" 2>/dev/null
rm -rf $T/evm; E=$T/evm
EVID=$E MODE=emit CONVERGIR_180000=1 bash $S >/dev/null 2>&1
[ "$(mcp $E/mcp/01_colunas.sql)" = "$(cat /workspace/golive/ops/baseline_cols.tsv)" ] && ok "colunas = esquema congelado" || ko "colunas"
[ "$(mcp $E/mcp/02_historico.sql)" = "401 7e47b7f041715f5426e6dc3e64f08019" ] && ok "histórico esperado (401/7e47b7f0)" || ko "hist"
[ "$(mcp $E/mcp/03_orfas.sql)" = 0 ] && ok "0 órfãs" || ko "órfãs"
mcp $E/mcp/04_baseline.sql > $E/baseline_fp.txt
EVID=$E MODE=emit CONVERGIR_180000=1 bash $S >/dev/null 2>&1; ls $E/mcp | tr '\n' ' '; echo
# falha forçada no modo MCP: arquivo inteiro numa chamada => nada fica
GOLIVE_FORCAR_FALHA=20261006120000 EVID=$E MODE=emit CONVERGIR_180000=1 bash $S >/dev/null 2>&1; cp $E/mcp/20_g3_20261006120000.sql $E/forcado.sql
EVID=$E MODE=emit CONVERGIR_180000=1 bash $S >/dev/null 2>&1
H0=$(psql -XAtd $DB -c "select count(*) from supabase_migrations.schema_migrations")
mcp $E/mcp/10_g2_equivalentes.sql >/dev/null 2>&1 && ok "G2 via 1 chamada: registrado" || ko "G2"
src=$(psql -XAtd $DB -c "select md5(prosrc) from pg_proc where oid='public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure")
[ "$src" = 0f6b1bdf336aa456b59d47b954e3d93b ] && ok "CONVERGIR: corpo = repo (0f6b1bdf), ACL/dono/deps rechecados na transação" || ko "conv $src"
mcp $E/mcp/10_g2_equivalentes.sql >/dev/null 2>$E/e && ko "G2 2ª vez aceitou" || { grep -q "já no histórico" $E/e && ok "G2 2ª execução recusada (guarda de histórico)"; }
before=$(psql -XAtd $DB -c "select count(*) from supabase_migrations.schema_migrations")
mcp $E/forcado.sql >/dev/null 2>$E/e; after=$(psql -XAtd $DB -c "select count(*) from supabase_migrations.schema_migrations"); c=$(psql -XAtd $DB -c "select count(*) from information_schema.columns where table_name='formas_pagamento' and column_name='conta_financeira_id'")
[ "$before" = "$after" ] && [ "$c" = 0 ] && grep -q "falha forçada" $E/e && ok "falha forçada em 1 chamada: rollback total (sem coluna, sem histórico)" || ko "forçada b=$before a=$after c=$c"
for f in $E/mcp/2*_g3_*.sql $E/mcp/4*_g4_*.sql; do mcp $f >/dev/null 2>$E/e || { ko "$(basename $f): $(head -c 200 $E/e)"; break; }; done
[ "$(psql -XAtd $DB -c "select count(*) from supabase_migrations.schema_migrations")" = $((H0+17)) ] && ok "G2–G4 via MCP: 17 linhas, sem 20261010120000" || ko "contagem"
[ "$(mcp $E/mcp/07_caixas_default.sql)" != NULL ] && ok "DEFAULT caixas.loja_id intacto antes do G6" || ko "default"
mcp $E/mcp/20_g3_20261006120000.sql >/dev/null 2>$E/e && ko "reaplicou" || { grep -q "já no histórico" $E/e && ok "reexecução de migration já aplicada recusada (guarda)"; }
mcp $E/mcp/60_g6_20261010120000.sql >/dev/null 2>$E/e && ok "G6 via MCP" || ko "G6 $(head -c 200 $E/e)"
[ "$(mcp $E/mcp/07_caixas_default.sql)" = NULL ] && ok "DEFAULT removido só no G6" || ko "g6 default"
[ "$(mcp $E/mcp/02_historico.sql)" = "401 7e47b7f041715f5426e6dc3e64f08019" ] && [ "$(psql -XAtd $DB -c "select count(*) from supabase_migrations.schema_migrations")" = $((H0+18)) ] && ok "histórico final 401+18, nada fora dos alvos" || ko "hist final"
# mesmo estado final que o modo psql (e2e)
q='select md5(string_agg(version||name||md5(array_to_string(statements,chr(10))),$$,$$ order by version)) from supabase_migrations.schema_migrations'
[ "$(psql -XAtd $DB -c "$q")" = "$(psql -XAtd golive_e2e -c "$q")" ] && ok "histórico idêntico ao do modo psql (e2e)" || ko "hist != e2e"
for d in $DB golive_e2e; do psql -XAtd $d -c "select md5(string_agg(p.oid::regprocedure::text||md5(prosrc)||coalesce(array_to_string(proconfig,','),'')||coalesce(proacl::text,''),',' order by p.oid::regprocedure::text)) from pg_proc p where pronamespace='public'::regnamespace"; done | uniq | wc -l | grep -q '^1$' && ok "funções idênticas MCP x psql" || ko "funções diferem"
python3 -c "import json;[print(' ',x['name'],len(x['files']),[f['name'] for f in x['files']]) for x in [json.load(open('$E/mcp/50_edge_'+n+'.json')) for n in ('sync-outbox','validar-gerente')]]"
echo "== $pass PASS / $fail FAIL"
