#!/usr/bin/env bash
# Testes SQL do módulo Comissão contra a cadeia real de migrations (RPC canônica v4 e gatilhos existentes).
# Uso: BASE_DB=<banco local com as migrations da main aplicadas> backend/scripts/test-comissao.sh
#   Cria 2 cópias descartáveis: "antes" (main) e "depois" (main + migrations do módulo), roda os testes de cada fase,
#   compara os cenários sem desconto (devem ser idênticos) e prova os rollbacks. Nunca toca produção.
set -euo pipefail
: "${BASE_DB:?defina BASE_DB (banco LOCAL com a cadeia de migrations da main)}"
PSQL=${PSQL:-psql}
CREATEDB=${CREATEDB:-createdb}
DROPDB=${DROPDB:-dropdb}
ROOT=$(cd "$(dirname "$0")/../supabase" && pwd)
T=$ROOT/tests/comissao
ANTES="com_antes_$$"; DEPOIS="com_depois_$$"
trap '$DROPDB --if-exists "$ANTES" >/dev/null 2>&1; $DROPDB --if-exists "$DEPOIS" >/dev/null 2>&1' EXIT
$CREATEDB -T "$BASE_DB" "$ANTES"; $CREATEDB -T "$BASE_DB" "$DEPOIS"
MIGS=$(ls "$ROOT"/migrations/2026102120*_comissao_*.sql | sort)
for m in $MIGS; do echo ">> $(basename "$m")"; $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DEPOIS" -f "$m" >/dev/null 2>&1 || { $PSQL -X -v ON_ERROR_STOP=1 -d "$DEPOIS" -f "$m"; exit 1; }; done
cd "$T"
for t in $(ls p*_*.test.sql | sort); do
  echo "== $t"; $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DEPOIS" -f "$t" 2>&1 | grep -E "ok:|OK|ERROR|FALHOU" | sed 's/^psql:[^ ]* //'
  $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DEPOIS" -f "$t" >/dev/null 2>&1
done
echo "== regressão: cenários sem desconto (main x módulo)"
$PSQL -X -q -v ON_ERROR_STOP=1 -d "$ANTES" -f regressao_cenarios.sql 2>/dev/null | grep '|' > /tmp/com_reg_antes_$$.txt
$PSQL -X -q -v ON_ERROR_STOP=1 -d "$DEPOIS" -f regressao_cenarios.sql 2>/dev/null | grep '|' > /tmp/com_reg_depois_$$.txt
diff /tmp/com_reg_antes_$$.txt /tmp/com_reg_depois_$$.txt && echo "ok: $(wc -l < /tmp/com_reg_antes_$$.txt) cenários idênticos"
echo "== rollback (ordem inversa) restaura as funções da main"
for m in $(echo "$MIGS" | sort -r); do r="$ROOT/rollback/$(basename "${m%.sql}").rollback.sql"; $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DEPOIS" -f "$r" >/dev/null 2>&1; done
DEF="select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','internal') and p.proname ~ 'comiss'"
[ "$($PSQL -X -At -d "$ANTES" -c "$DEF")" = "$($PSQL -X -At -d "$DEPOIS" -c "$DEF")" ] && echo "ok: funções de comissão idênticas à main após rollback"
$PSQL -X -q -v ON_ERROR_STOP=1 -d "$DEPOIS" -f regressao_cenarios.sql 2>/dev/null | grep '|' | diff /tmp/com_reg_antes_$$.txt - && echo "ok: cenários idênticos após rollback"
echo "COMISSAO SQL: OK"
