#!/usr/bin/env bash
# golive-final-584.sh — roteiro ÚNICO de implantação do PR #584 (Jinlong). Ver golive-final-584.md.
# Padrão: MODE=dry-run (somente leitura). Mudança real só com MODE=apply + janela aprovada HOJE.
# Cada migration roda numa transação ÚNICA com: DDL do arquivo do repo + linha em supabase_migrations.schema_migrations
# (versão/nome REAIS, statements = conteúdo do arquivo) + verificação de totais/hashes/FKs órfãs. Qualquer divergência
# => RAISE => ROLLBACK da transação inteira => script PARA. Sem `db push`, sem `migration repair`, sem correção manual.
set -Eeuo pipefail
umask 077

# ---------------- configuração ----------------
MODE=${MODE:-dry-run}                       # dry-run | apply | emit (gera os SQL para o MCP execute_sql; não conecta)
[ "$MODE" = emit ] || : "${DB_URL:?defina DB_URL (conexão direta postgres; nunca é impressa) — ou use MODE=emit (MCP)}"
REPO=${REPO:-/workspace/fastproduct}        # checkout do repo no head do #584
PROJECT_REF=${PROJECT_REF:-kbabmewnahysfvlybiak}
GH_REPO=${GH_REPO:-nocodenn-cell/fastproduct}
PR=${PR:-584}
EXPECTED_HEAD_SHA=${EXPECTED_HEAD_SHA:-1448221480a8eb7ffda178aa52d954d0e4b90c71}
EXPECTED_MAIN_SHA=${EXPECTED_MAIN_SHA:-b89b8824c36fea4bba38731281e247336693c40c}
HIST_BASE_N=${HIST_BASE_N:-401}             # histórico de prod lido em 2026-10-20 (somente leitura)
HIST_BASE_MD5=${HIST_BASE_MD5:-7e47b7f041715f5426e6dc3e64f08019}
EVID=${EVID:-$PWD/golive-evidencias}
PDV_RESUMO=${PDV_RESUMO:-}                  # RESUMO-diagnostico.txt do PDV (Gate 0)
GOLIVE_JANELA_APROVADA=${GOLIVE_JANELA_APROVADA:-}   # = data de hoje (AAAA-MM-DD) => janela aprovada
BACKUP_RUN_JSON=${BACKUP_RUN_JSON:-}        # opcional: JSON da execução do backup-scheduled (senão: gh api com BACKUP_RUN_ID)
BACKUP_RUN_ID=${BACKUP_RUN_ID:-}
CI_CHECKS_JSON=${CI_CHECKS_JSON:-}          # opcional: JSON check-runs do head (senão: gh api)
CI_ALLOW_SKIPPED=${CI_ALLOW_SKIPPED:-"Supabase Preview"}  # checks (separados por vírgula) que podem ficar só "skipped" (decisão explícita)
CONVERGIR_180000=${CONVERGIR_180000:-0}     # 1 = autorizado reaplicar a definição do repo da função com diferença só de comentário
PROD_URL=${PROD_URL:-}                      # URL de produção do ERP (smoke)
VERCEL_ENV_RE=${VERCEL_ENV_RE:-'^Production( – pdv-importados)?$'}
EDGE_FUNCS=${EDGE_FUNCS:-"sync-outbox validar-gerente"}
ATE_GATE=${ATE_GATE:-9}                     # executar até este gate (inclusive)
TODAY=$(TZ=America/Sao_Paulo date +%F)
M="$REPO/backend/supabase/migrations"
G2_PAIRS="20261009180000:20261009135940 20261009180001:20261009140739"
G3_LIST="20261006120000 20261007161220 20261007163000 20261007163100 20261007163200 20261007170000 20261007171000 20261007180000 20261007190000 20261016120100"
G4_LIST="20261019120000 20261019140000 20261019150000 20261019160000 20261019170000"
G6_LIST="20261010120000"
TARGETS="20261009180000 20261009180001 $G3_LIST $G4_LIST $G6_LIST"
HASH_TABLES="vendas itens_venda vendas_pagamentos caixas movimentacoes_caixa estoque produtos usuarios clientes lojas formas_pagamento contas_financeiras contas_pagar contas_receber pdv_config documentos_fiscais_pendentes"
# tabelas cujas linhas a migration altera DE PROPÓSITO (backfill), validadas na réplica; demais devem ficar idênticas
declare -A ALLOW_CHANGE=()   # vazio: nenhuma tabela de negócio pode mudar (réplica: lojas/pdv_config inalteradas nas colunas da baseline)

mkdir -p "$EVID/sql" "$EVID/state"; chmod 700 "$EVID"
LOG="$EVID/golive.log"
log(){ printf '%s [%s] %s\n' "$(TZ=America/Sao_Paulo date '+%F %T BRT')" "$MODE" "$*" | tee -a "$LOG" >&2; }
stop(){ log "PARADA no Gate $1: $2"; echo "PARADA Gate $1: $2" > "$EVID/state/PARADO"; exit $((10+$1)); }
q(){ psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "$1"; }
runf(){ psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$1"; }
done_(){ [ -f "$EVID/state/g$1.done" ]; }
mark(){ echo "$(TZ=America/Sao_Paulo date '+%F %T BRT') $2" > "$EVID/state/g$1.done"; }
apply_only(){ [ "$MODE" = apply ]; }
file_of(){ local f; f=$(ls "$M"/"$1"_*.sql 2>/dev/null | head -1); [ -n "$f" ] || stop "$2" "arquivo da migration $1 não encontrado"; echo "$f"; }
in_hist(){ [ "$(q "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$1'")" = 1 ]; }
rm -f "$EVID/state/PARADO"
OPS=${EQ_DIR:-"$(cd "$(dirname "$0")" && pwd)/golive/ops"}
cols_sql(){ local inl; inl=$(printf "'%s'," $HASH_TABLES); echo "SELECT c.relname||chr(9)||string_agg(quote_ident(a.attname), ',' ORDER BY a.attname COLLATE \"C\") FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname IN (${inl%,}) GROUP BY c.relname ORDER BY array_position(ARRAY[${inl%,}]::text[], c.relname::text)"; }
log "início; ATE_GATE=$ATE_GATE"

# ---------------- consultas de verificação (texto SQL puro; servem para psql e MCP) ----------------
fp_sql(){ # impressão digital: contagem + md5 por tabela (colunas da baseline) + totais; $1 = tabelas a excluir
  local excl=" ${1:-} " parts=() t cols
  for t in $HASH_TABLES; do
    [[ $excl == *" $t "* ]] && continue
    cols=$(grep "^$t	" "$EVID/baseline_cols.tsv" | cut -f2) || true
    [ -n "$cols" ] || continue
    parts+=("(SELECT '$t:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW($cols)::text) h FROM public.$t) s)")
  done
  parts+=("(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)")
  local out="" x; for x in "${parts[@]}"; do out+="${out:+||' # '||}$x"; done; echo "SELECT $out"
}
ORPH_SQL="WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk"
HIST_SQL(){ local inl; inl=$(printf "'%s'," $TARGETS); echo "SELECT count(*)||' '||md5(coalesce(string_agg(version||':'||coalesce(name,''),',' ORDER BY version),'')) FROM supabase_migrations.schema_migrations WHERE version NOT IN (${inl%,})"; }

# ---------------- transação de uma migration ----------------
# gera $EVID/sql/<versão>.sql: BEGIN; timeouts; corpo do arquivo (sem o BEGIN/COMMIT de topo); INSERT no histórico; checagens; COMMIT
build_txn(){ local gate=$1 ver=$2 f name body tag out excl expect
  f=$(file_of "$ver" "$gate"); name=$(basename "$f" .sql); name=${name#*_}
  out="$EVID/sql/$ver.sql"; tag="golive_stmt_$(sha256sum "$f" | cut -c1-12)"
  grep -q "\$$tag\$" "$f" && stop "$gate" "tag de citação colide com $f"
  local nb nc; nb=$(grep -cE '^\s*BEGIN\s*;\s*$' "$f" || true); nc=$(grep -cE '^\s*COMMIT\s*;\s*$' "$f" || true)
  [ "$nb" = "$nc" ] && [ "$nb" -le 1 ] || stop "$gate" "$name: BEGIN/COMMIT de topo inesperados ($nb/$nc)"
  excl=${ALLOW_CHANGE[$ver]:-}
  expect=$(grep -v -E "^($(echo $excl | tr ' ' '|')):" "$EVID/baseline_fp.txt" 2>/dev/null | tr '\n' '\001' | sed 's/\x01$//' ) || true
  { echo "-- golive-final-584 :: $ver $name :: sha256 $(sha256sum "$f" | cut -c1-64)"
    echo "BEGIN;"
    echo "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';"
    echo "DO \$g\$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='$ver') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '$ver'; END IF; END \$g\$;"
    grep -v -E '^\s*(BEGIN|COMMIT)\s*;\s*$' "$f"
    echo ";"
    printf "INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('%s', '%s', ARRAY[\$%s\$" "$ver" "$name" "$tag"; cat "$f"; printf '$%s$]);\n' "$tag"
    echo "DO \$chk\$ DECLARE v text; o bigint; BEGIN"
    echo "  SELECT replace(($(fp_sql "$excl")), ' # ', chr(1)) INTO v;"
    echo "  IF v IS DISTINCT FROM \$b\$$expect\$b\$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após $ver: %', replace(v, chr(1), ' # '); END IF;"
    echo "  $ORPH_SQL INTO o;" | sed 's/^  WITH/  WITH/'
    echo "  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após $ver', o; END IF;"
    echo "  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='$ver' AND name='$name') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente $ver'; END IF;"
    echo "END \$chk\$;"
    [ -n "${GOLIVE_FORCAR_FALHA:-}" ] && [ "$GOLIVE_FORCAR_FALHA" = "$ver" ] && echo "DO \$f\$ BEGIN RAISE EXCEPTION 'GOLIVE_STOP: falha forçada de teste em $ver'; END \$f\$;"
    echo "COMMIT;"; } > "$out"
  sha256sum "$out" > "$out.sha256"; echo "$out"
}
# O bloco ORPH_SQL tem 'SELECT count(*) ... FROM fk' => vira 'SELECT ... INTO o' via plpgsql (SELECT expr FROM ... INTO o é válido)

# Transação do Gate 2 (texto SQL puro: psql -f ou MCP execute_sql). 180001 = SÓ registro; 180000 = registro
# (+ com CONVERGIR_180000=1, a definição do repo de pdv_registrar_alertas_margem_venda, única diferença: 2 linhas de comentário).
# Rechecagem AUTOMÁTICA dentro da transação: antes = snapshot de prod (22 itens + metadados/dependentes da função);
# depois = estado do arquivo do repo; texto já aplicado em prod (md5) = o comprovado equivalente. Qualquer desvio => ROLLBACK.
build_g2(){ local conv=$1 EQ=${EQ_DIR:-"$(cd "$(dirname "$0")" && pwd)/golive/ops"} out="$EVID/sql/g2_registro_equivalentes.sql" fpq dq
  fpq=$(grep -v '^--' "$EQ/fp_equiv.sql" | sed 's/;\s*$//'); dq=$(grep -v '^--' "$EQ/fp_equiv_deps.sql" | sed 's/;\s*$//')
  chk(){ echo "DO \$c\$ DECLARE fpv text; dpv text; BEGIN SELECT string_agg(k||'|'||v,E'\n' ORDER BY k COLLATE \"C\") INTO fpv FROM ($fpq) z(k,v);"
         echo "SELECT string_agg(k,E'\n' ORDER BY k COLLATE \"C\") INTO dpv FROM ($dq) d(k);"
         echo "IF fpv IS DISTINCT FROM \$e\$$(cat "$1")\$e\$ THEN RAISE EXCEPTION 'GOLIVE_STOP: 22 itens 180000/180001 ($2) divergem: %', fpv; END IF;"
         echo "IF dpv IS DISTINCT FROM \$d\$$(cat "$EQ/deps_esperado.txt")\$d\$ THEN RAISE EXCEPTION 'GOLIVE_STOP: dono/ACL/volatilidade/dependentes de pdv_registrar_alertas_margem_venda mudaram ($2): %', dpv; END IF; END \$c\$;"; }
  { echo "-- golive-final-584 :: Gate 2 :: CONVERGIR_180000=$conv"
    echo "BEGIN;"; echo "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s';"
    echo "DO \$g\$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261009180000','20261009180001')) THEN RAISE EXCEPTION 'GOLIVE_STOP: 180000/180001 já no histórico'; END IF;"
    echo "IF (SELECT md5(array_to_string(statements,E'\n')) FROM supabase_migrations.schema_migrations WHERE version='20261009135940') IS DISTINCT FROM 'b0506e6c36e1a091510de0a9f48b39bb'"
    echo "OR (SELECT md5(array_to_string(statements,E'\n')) FROM supabase_migrations.schema_migrations WHERE version='20261009140739') IS DISTINCT FROM '130ae0f34490fe0fe2b496634b0ced47'"
    echo "THEN RAISE EXCEPTION 'GOLIVE_STOP: texto aplicado em prod (135940/140739) não é o comprovado'; END IF; END \$g\$;"
    chk "$EQ/fp_prod_snapshot.txt" "antes"
    if [ "$conv" = 1 ]; then
      python3 - "$(file_of 20261009180000 2)" <<'PY'
import sys,re
s=open(sys.argv[1]).read()
m=re.search(r"CREATE OR REPLACE FUNCTION public\.pdv_registrar_alertas_margem_venda\(p_venda_id uuid\).*?\n\$\$;\n",s,re.S); print(m.group(0))
PY
    fi
    for p in $G2_PAIRS; do ver=${p%%:*}; f=$(file_of "$ver" 2); name=$(basename "$f" .sql); name=${name#*_}; tag="golive_stmt_$(sha256sum "$f"|cut -c1-12)"
      printf "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('%s','%s',ARRAY[\$%s\$" "$ver" "$name" "$tag"; cat "$f"; printf "\$%s\$]);\n" "$tag"; done
    if [ "$conv" = 1 ]; then chk "$EQ/fp_equiv_esperado.txt" "depois"; else chk "$EQ/fp_prod_snapshot.txt" "depois"; fi
    echo "DO \$h\$ BEGIN IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261009180000','20261009180001')) <> 2 THEN RAISE EXCEPTION 'GOLIVE_STOP: histórico G2'; END IF; END \$h\$;"
    echo "COMMIT;"; } > "$out"; sha256sum "$out" > "$out.sha256"; echo "$out"
}

apply_mig(){ local gate=$1 ver=$2 out
  if in_hist "$ver"; then log "G$gate $ver: já no histórico — pulado (idempotente)"; return 0; fi
  out=$(build_txn "$gate" "$ver")
  if ! apply_only; then log "G$gate $ver: [dry-run] transação gerada $out (não executada)"; return 0; fi
  log "G$gate $ver: aplicando (transação única)"
  if ! runf "$out" >>"$LOG" 2>"$EVID/sql/$ver.err"; then
    stop "$gate" "$ver falhou e foi revertida (ROLLBACK): $(grep -m1 -E 'ERROR|GOLIVE_STOP' "$EVID/sql/$ver.err" | cut -c1-300)"
  fi
  in_hist "$ver" || stop "$gate" "$ver: COMMIT sem linha de histórico"
  log "G$gate $ver: OK (DDL + histórico + totais/hashes + 0 órfãs)"
}


# ================= MODE=emit — execução pelo MCP (Supabase execute_sql / GitHub MCP), sem DB_URL nem token =================
edge_manifest(){ python3 - "$REPO/backend/supabase/functions" "$1" "$2" <<'PY'
import sys,os,re,json
root,fn,out=sys.argv[1],sys.argv[2],sys.argv[3]; base=os.path.join(root,fn); seen={}; todo=[os.path.join(base,'index.ts')]
pat=re.compile(r"""(?:from|import)\s*\(?\s*["'](\.{1,2}/[^"']+)["']""")
while todo:
  f=os.path.normpath(todo.pop())
  if f in seen or not os.path.exists(f): continue
  src=open(f).read(); seen[f]=src
  for m in pat.finditer(src): todo.append(os.path.join(os.path.dirname(f),m.group(1)))
for extra in ('deno.json','deno.jsonc','import_map.json'):
  q=os.path.join(base,extra)
  if os.path.exists(q): seen[os.path.normpath(q)]=open(q).read()
files=[{"name":os.path.relpath(k,base),"content":v} for k,v in sorted(seen.items())]
json.dump({"name":fn,"entrypoint_path":"index.ts","files":files},open(out,'w'),ensure_ascii=False)
print(fn, len(files), "arquivos:", ", ".join(x["name"] for x in files))
PY
}
if [ "$MODE" = emit ]; then
  D="$EVID/mcp"; mkdir -p "$D"; cp "$OPS/baseline_cols.tsv" "$EVID/baseline_cols.tsv"
  cols_sql > "$D/01_colunas.sql"; HIST_SQL > "$D/02_historico.sql"; echo "$ORPH_SQL" > "$D/03_orfas.sql"
  echo "SELECT replace(($(fp_sql "")), ' # ', chr(10)) AS baseline" > "$D/04_baseline.sql"
  cp "$OPS/fp_equiv.sql" "$D/05_equiv_22.sql"; cp "$OPS/fp_equiv_deps.sql" "$D/06_equiv_deps.sql"
  echo "SELECT coalesce(column_default,'NULL') FROM information_schema.columns WHERE table_schema='public' AND table_name='caixas' AND column_name='loja_id'" > "$D/07_caixas_default.sql"
  if [ -f "$EVID/baseline_fp.txt" ]; then
    cp "$(build_g2 "$CONVERGIR_180000")" "$D/10_g2_equivalentes.sql"; i=20
    for v in $G3_LIST; do cp "$(build_txn 3 "$v")" "$D/${i}_g3_$v.sql"; i=$((i+1)); done; i=40
    for v in $G4_LIST; do cp "$(build_txn 4 "$v")" "$D/${i}_g4_$v.sql"; i=$((i+1)); done
    cp "$(build_txn 6 20261010120000)" "$D/60_g6_20261010120000.sql"
  fi
  for fn in $EDGE_FUNCS; do edge_manifest "$fn" "$D/50_edge_$fn.json" | tee -a "$LOG" >&2; done
  ( cd "$D" && sha256sum ./*.sql ./*.json > SHA256SUMS )
  log "emit: arquivos em $D ($(ls "$D" | wc -l)). Sem baseline_fp.txt só os de leitura foram gerados."
  exit 0
fi

# ================= GATE 0 — veredito do PDV =================
if [ "$ATE_GATE" -ge 0 ]; then
  [ -n "$PDV_RESUMO" ] && [ -f "$PDV_RESUMO" ] || stop 0 "PDV_RESUMO ausente (rodar pdv-diagnostico-backup.ps1 no PDV)"
  R=$(tr -d '\r' < "$PDV_RESUMO")
  grep -q '^Arquivos copiados: .* - SHA256 OK' <<<"$R" || stop 0 "backup do PDV sem 'SHA256 OK'"
  grep -q '^integrity_check: ok$' <<<"$R" || stop 0 "integrity_check do SQLite não é 'ok'"
  V=$(grep -m1 '^VEREDITO: ' <<<"$R" | cut -d' ' -f2-)
  case "$V" in
    "COMPATIVEL (Build B"*|"COMPATIVEL (Build C"*) cp "$PDV_RESUMO" "$EVID/RESUMO-pdv.txt"; echo "$V" > "$EVID/state/pdv_veredito"; log "G0 OK: $V";;
    *) stop 0 "veredito do PDV '$V' — Build A: reinstalar o PDV e rodar o diagnóstico de novo; INDETERMINADO: resolver antes";;
  esac
fi

# ================= GATE 1 — preflight =================
if [ "$ATE_GATE" -ge 1 ]; then
  [ "$MODE" = dry-run ] || [ "$MODE" = apply ] || stop 1 "MODE inválido"
  if apply_only; then [ "$GOLIVE_JANELA_APROVADA" = "$TODAY" ] || stop 1 "janela não aprovada para hoje ($TODAY): defina GOLIVE_JANELA_APROVADA=$TODAY"; fi
  # backup de hoje
  if [ -z "$BACKUP_RUN_JSON" ]; then [ -n "$BACKUP_RUN_ID" ] || stop 1 "informe BACKUP_RUN_ID ou BACKUP_RUN_JSON"
    BACKUP_RUN_JSON="$EVID/backup_run.json"; gh api "repos/$GH_REPO/actions/runs/$BACKUP_RUN_ID" > "$BACKUP_RUN_JSON" || stop 1 "não li a execução do backup"; fi
  read -r BWF BCONC BAT < <(jq -r '[.path // .name, .conclusion, .created_at]|@tsv' "$BACKUP_RUN_JSON")
  [[ $BWF == *backup-scheduled* ]] || stop 1 "execução de backup não é do backup-scheduled ($BWF)"
  [ "$BCONC" = success ] || stop 1 "backup não concluiu com sucesso ($BCONC)"
  [ "$(TZ=America/Sao_Paulo date -d "$BAT" +%F)" = "$TODAY" ] || stop 1 "backup não é de hoje ($BAT UTC)"
  cp "$BACKUP_RUN_JSON" "$EVID/backup_run.json" 2>/dev/null || true
  # CI e SHAs
  [ "$(git -C "$REPO" rev-parse HEAD)" = "$EXPECTED_HEAD_SHA" ] || stop 1 "checkout local != head esperado do #$PR"
  [ -z "$(git -C "$REPO" status --porcelain -- backend/supabase)" ] || stop 1 "checkout local com alterações em backend/supabase"
  PRJ=$(gh pr view "$PR" -R "$GH_REPO" --json headRefOid,state,baseRefName,mergeCommit) || stop 1 "gh pr view falhou"
  PSTATE=$(jq -r .state <<<"$PRJ")
  if [ "$PSTATE" != MERGED ]; then
    [ "$(jq -r .headRefOid <<<"$PRJ")" = "$EXPECTED_HEAD_SHA" ] || stop 1 "head do PR mudou (SHA != esperado): refazer CI/validação"
    [ "$(gh api "repos/$GH_REPO/commits/main" -q .sha)" = "$EXPECTED_MAIN_SHA" ] || stop 1 "main mudou desde o CI verde (SHA != esperado)"
    if [ -z "$CI_CHECKS_JSON" ]; then CI_CHECKS_JSON="$EVID/ci_checks.json"; gh api "repos/$GH_REPO/commits/$EXPECTED_HEAD_SHA/check-runs?per_page=100" > "$CI_CHECKS_JSON" || stop 1 "não li os checks do CI"; fi
    BAD=$(jq -r '[.check_runs[]] as $c | ($c|map(select(.status!="completed" or (.conclusion|IN("failure","cancelled","timed_out","action_required","stale"))))|map(.name)) + ([$c[]|.name]|unique|map(. as $n|select(($c|map(select(.name==$n and .conclusion=="success"))|length)==0 and (($allow|split(",")|any(.[]; .==$n))|not)))) | unique | join(", ")' --arg allow "$CI_ALLOW_SKIPPED" "$CI_CHECKS_JSON")
    [ -z "$BAD" ] || stop 1 "CI não verde no head: $BAD"
    jq -e --arg s "$EXPECTED_HEAD_SHA" '[.check_runs[].head_sha]|all(.==$s)' "$CI_CHECKS_JSON" >/dev/null || stop 1 "checks de outro SHA"
  fi
  # histórico: fora dos 18 alvos, idêntico ao lido de prod
  H=$(q "$(HIST_SQL)"); [ "$H" = "$HIST_BASE_N $HIST_BASE_MD5" ] || stop 1 "histórico fora do estado esperado ($H)"
  # baseline (só na 1ª vez; reexecuções reutilizam)
  cp "$OPS/baseline_cols.tsv" "$EVID/baseline_cols.tsv"
  if [ ! -f "$EVID/baseline_fp.txt" ]; then
    COLS_NOW=$(q "$(cols_sql)"); [ "$COLS_NOW" = "$(cat "$OPS/baseline_cols.tsv")" ] || stop 1 "colunas das tabelas de negócio diferem do esquema congelado (ops/baseline_cols.tsv)"
    q "SELECT replace(($(fp_sql "")), ' # ', chr(10))" > "$EVID/baseline_fp.txt"
    log "G1 baseline capturada ($(wc -l < "$EVID/baseline_fp.txt") linhas)"
  fi
  O=$(q "$ORPH_SQL"); [ "$O" = 0 ] || stop 1 "baseline com $O FK(s) órfã(s)"
  NOWFP=$(q "SELECT replace(($(fp_sql "")), ' # ', chr(10))")
  if ! done_ 3 && ! in_hist 20261006120000; then [ "$NOWFP" = "$(cat "$EVID/baseline_fp.txt")" ] || stop 1 "dados mudaram desde a baseline (alguém operando?)"; fi
  log "G1 OK: janela=${GOLIVE_JANELA_APROVADA:-n/a} backup=$BAT CI=$EXPECTED_HEAD_SHA histórico=$H órfãs=0"
fi

# ================= GATE 2 — equivalência 20261009180000/180001 =================
if [ "$ATE_GATE" -ge 2 ] && in_hist 20261009180000 && in_hist 20261009180001; then log "G2: 180000/180001 já registrados — pulado"
elif [ "$ATE_GATE" -ge 2 ]; then
  EQ=${EQ_DIR:-"$(cd "$(dirname "$0")" && pwd)/golive/ops"}; [ -f "$EQ/fp_equiv_esperado.txt" ] || stop 2 "evidência esperada ausente ($EQ)"
  for p in $G2_PAIRS; do ver=${p%%:*}; old=${p##*:}
    if in_hist "$ver"; then log "G2 $ver: já registrado — pulado"; continue; fi
    f=$(file_of "$ver" 2); name=$(basename "$f" .sql); name=${name#*_}
    # (a) texto aplicado em prod (histórico, versão carimbada) == arquivo do repo, sem comentários/espaços
    norm(){ python3 -c 'import sys,re;s=sys.stdin.read().replace("\r","");s="\n".join(l for l in s.split("\n") if not l.strip().startswith("--"));print(re.sub(r"\s+"," ",s).strip())'; }
    A=$(norm < "$f" | md5sum | cut -c1-32)
    B=$(q "SELECT array_to_string(statements, E'\n') FROM supabase_migrations.schema_migrations WHERE version='$old'" | norm | md5sum | cut -c1-32)
    [ "$A" = "$B" ] || stop 2 "$ver: texto aplicado em prod ($old) difere do arquivo do repo"
    echo "$ver repo_norm=$A prod_${old}_norm=$B" >> "$EVID/equivalencia.txt"
  done
  # (b) estado atual dos objetos == estado produzido pelo arquivo do repo (impressão digital esperada, medida na réplica)
  q "$(cat "$EQ/fp_equiv.sql")" > "$EVID/equiv_fp_atual.txt"
  if ! diff "$EQ/fp_equiv_esperado.txt" "$EVID/equiv_fp_atual.txt" > "$EVID/equiv_diff.txt"; then
    ONLY_COMMENT=$(grep -c '' "$EVID/equiv_diff.txt" | xargs test 4 -eq && grep -q '^< fn_margem_src|0f6b1bdf336aa456b59d47b954e3d93b|' "$EVID/equiv_diff.txt" && grep -q '^> fn_margem_src|2af2dfc1834f407dea03b9df306fbacb|' "$EVID/equiv_diff.txt" && echo 1 || echo 0)
    if [ "$ONLY_COMMENT" = 1 ] && [ "$CONVERGIR_180000" = 1 ]; then
      log "G2: única diferença = 2 linhas de comentário no corpo de pdv_registrar_alertas_margem_venda; CONVERGIR_180000=1 => reaplicar a definição do repo (mesmo comportamento) na transação do registro"
      CONV=1
    else
      stop 2 "180000/180001 NÃO exatamente equivalentes — diferenças em $EVID/equiv_diff.txt$([ "$ONLY_COMMENT" = 1 ] && echo ' (só comentário no corpo de pdv_registrar_alertas_margem_venda; decisão do dono: CONVERGIR_180000=1)')"
    fi
  else CONV=0; fi
  if ! in_hist 20261009180000 || ! in_hist 20261009180001; then
    out=$(build_g2 "${CONV:-0}")
    if apply_only; then runf "$out" >>"$LOG" 2>"$out.err" || stop 2 "registro de equivalentes revertido: $(grep -m1 -E 'ERROR|GOLIVE' "$out.err" | cut -c1-300)"
      in_hist 20261009180000 && in_hist 20261009180001 || stop 2 "registro ausente após COMMIT"; log "G2 OK: 180000/180001 registrados com evidência"
    else log "G2 [dry-run] equivalência comprovada$([ "${CONV:-0}" = 1 ] && echo ' (com convergência de comentário)'); registro em $out"; fi
  fi
fi

# ================= GATE 3 — 10 migrations da main sem dependência de edge =================
if [ "$ATE_GATE" -ge 3 ]; then for v in $G3_LIST; do apply_mig 3 "$v"; done; apply_only && mark 3 ok; fi
# ================= GATE 4 — #584 fases 1–5 =================
if [ "$ATE_GATE" -ge 4 ]; then for v in $G4_LIST; do apply_mig 4 "$v"; done; apply_only && mark 4 ok; fi

# ================= GATE 5 — Edge Functions do #584 =================
edge_ver(){ supabase functions list --project-ref "$PROJECT_REF" -o json | jq -r --arg n "$1" '.[]|select(.slug==$n)|.version'; }
if [ "$ATE_GATE" -ge 5 ]; then
  for v in $G3_LIST $G4_LIST; do apply_only && { in_hist "$v" || stop 5 "$v ausente: edge só depois dos Gates 3–4"; }; done
  for fn in $EDGE_FUNCS; do
    if [ -f "$EVID/state/edge_$fn" ]; then log "G5 $fn: já publicado ($(cat "$EVID/state/edge_$fn")) — pulado"; continue; fi
    pre=$(edge_ver "$fn") || stop 5 "não li versão da edge $fn"
    if ! apply_only; then log "G5 [dry-run] publicaria $fn (versão atual $pre) de $EXPECTED_HEAD_SHA"; continue; fi
    (cd "$REPO/backend" && supabase functions deploy "$fn" --project-ref "$PROJECT_REF") >>"$LOG" 2>&1 || stop 5 "deploy da edge $fn falhou (versão anterior $pre continua ativa)"
    post=$(edge_ver "$fn"); [ -n "$post" ] && [ "$post" -gt "$pre" ] || stop 5 "edge $fn sem versão nova ($pre -> $post)"
    echo "$pre->$post $EXPECTED_HEAD_SHA" > "$EVID/state/edge_$fn"; log "G5 $fn: $pre -> $post"
  done
  if apply_only; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$PROJECT_REF.supabase.co/functions/v1/sync-outbox" -H 'content-type: application/json' -d '{}')
    [[ $code =~ ^(400|401|403)$ ]] || stop 5 "sync-outbox não rejeitou requisição sem assinatura (HTTP $code)"
    log "G5 OK: sync-outbox rejeita requisição não assinada (HTTP $code)"; mark 5 ok
  fi
fi

# ================= GATE 6 — 20261010120000 (DROP DEFAULT caixas.loja_id) =================
if [ "$ATE_GATE" -ge 6 ]; then
  if ! in_hist 20261010120000 && apply_only; then
    [ -f "$EVID/state/pdv_veredito" ] || stop 6 "sem veredito B/C do PDV (Gate 0)"
    done_ 5 || stop 6 "sync-outbox nova não publicada/verificada (Gate 5)"
    [ "${CONFIRM_PDV_SYNC_OK:-}" = 1 ] || stop 6 "confirme CONFIRM_PDV_SYNC_OK=1: PDV aberto, status de sync verde e fila pendente=0 com a edge nova"
  fi
  for v in $G6_LIST; do apply_mig 6 "$v"; done
  if apply_only; then d=$(q "SELECT coalesce(column_default,'NULL') FROM information_schema.columns WHERE table_schema='public' AND table_name='caixas' AND column_name='loja_id'"); [ "$d" = NULL ] || stop 6 "DEFAULT ainda presente"; mark 6 ok; fi
fi

# ================= GATE 7 — merge do #584 (merge commit) =================
if [ "$ATE_GATE" -ge 7 ]; then
  st=$(gh pr view "$PR" -R "$GH_REPO" --json state -q .state)
  if [ "$st" = MERGED ]; then log "G7: #$PR já mergeado — pulado"
  elif apply_only; then
    for v in $TARGETS; do in_hist "$v" || stop 7 "$v ausente: merge só com prod alinhado"; done
    gh pr merge "$PR" -R "$GH_REPO" --merge --match-head-commit "$EXPECTED_HEAD_SHA" >>"$LOG" 2>&1 || stop 7 "merge recusado (head mudou ou proteção de branch)"
  else log "G7 [dry-run] faria: gh pr merge $PR --merge --match-head-commit $EXPECTED_HEAD_SHA"; fi
  if apply_only; then MSHA=$(gh pr view "$PR" -R "$GH_REPO" --json mergeCommit -q .mergeCommit.oid); [ -n "$MSHA" ] || stop 7 "sem merge commit"; echo "$MSHA" > "$EVID/state/merge_sha"; mark 7 "$MSHA"; log "G7 OK: merge $MSHA"; fi
fi

# ================= GATE 8 — deploy real na Vercel =================
if [ "$ATE_GATE" -ge 8 ] && apply_only && done_ 8; then log "G8: já verificado ($(cat "$EVID/state/g8.done")) — pulado"
elif [ "$ATE_GATE" -ge 8 ] && apply_only; then
  MSHA=$(cat "$EVID/state/merge_sha"); ok=""
  for i in $(seq 1 ${VERCEL_POLL:-30}); do
    DEPS=$(gh api "repos/$GH_REPO/deployments?sha=$MSHA&per_page=50") || stop 8 "não li deployments"
    for id in $(jq -r --arg re "$VERCEL_ENV_RE" '.[]|select(.environment|test($re))|.id' <<<"$DEPS"); do
      S=$(gh api "repos/$GH_REPO/deployments/$id/statuses" -q '.[0]|[.state,(.description//""),(.environment_url//"")]|@tsv')
      IFS=$'\t' read -r sst sdesc surl <<<"$S"
      [[ ${sdesc,,} =~ skip|ignor|cancel ]] && stop 8 "deploy de produção SKIPPED/ignorado/cancelado ($sdesc) — não é prova"
      [ "$sst" = failure ] || [ "$sst" = error ] && stop 8 "deploy de produção falhou ($sdesc)"
      [ "$sst" = success ] && [ -n "$surl" ] && { ok="$surl"; break 2; }
    done; sleep ${VERCEL_SLEEP:-30}
  done
  [ -n "$ok" ] || stop 8 "nenhum deploy de produção com sucesso para $MSHA"
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$ok")" = 200 ] || stop 8 "URL do deploy não responde 200"
  log "G8 OK: produção $ok (sha $MSHA)"; mark 8 "$ok"
fi

# ================= GATE 9 — smoke não destrutivo =================
if [ "$ATE_GATE" -ge 9 ]; then
  for v in $TARGETS; do in_hist "$v" || { apply_only && stop 9 "$v ausente do histórico"; }; done
  H=$(q "$(HIST_SQL)"); [ "$H" = "$HIST_BASE_N $HIST_BASE_MD5" ] || stop 9 "histórico fora dos alvos mudou ($H)"
  O=$(q "$ORPH_SQL"); [ "$O" = 0 ] || stop 9 "$O FK(s) com órfãos"
  if apply_only; then
    # totais/hashes: idênticos à baseline, exceto tabelas com backfill esperado
    EXP=$(grep -v -E "^($(echo ${ALLOW_CHANGE[@]} | tr ' ' '|')):" "$EVID/baseline_fp.txt")
    NOW=$(q "SELECT replace(($(fp_sql "${ALLOW_CHANGE[*]}")), ' # ', chr(10))"); [ "$NOW" = "$EXP" ] || stop 9 "totais/hashes mudaram"
    [ -n "$PROD_URL" ] && { c=$(curl -s -o /dev/null -w '%{http_code}' "$PROD_URL"); [ "$c" = 200 ] || stop 9 "ERP em produção HTTP $c"; }
    [ "${CONFIRM_SMOKE_MANUAL:-}" = 1 ] || stop 9 "faça o smoke manual (login dono, painel, relatório de vendas, fechamento por forma, PDV sync verde/fila 0 — SEM venda real) e rode de novo com CONFIRM_SMOKE_MANUAL=1"
    mark 9 ok; log "G9 OK: implantação concluída"
  else log "G9 [dry-run] verificações de leitura OK (histórico, órfãs=0)"; fi
fi
log "fim (MODE=$MODE, até Gate $ATE_GATE)"
