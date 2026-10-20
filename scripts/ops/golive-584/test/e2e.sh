#!/usr/bin/env bash
# Teste ponta a ponta do golive-final-584.sh na réplica local (PG17, porta 55440). Nunca toca prod.
set -uo pipefail
export PGHOST=/tmp PGPORT=55440 PGUSER=postgres
T=/workspace/golive/test; SCRIPT=/workspace/golive-final-584.sh
export PATH="$T/bin:$PATH" STUB_STATE=$T/state DB_URL="postgresql:///golive_e2e?host=/tmp&port=55440&user=postgres"
export CI_ALLOW_SKIPPED="Supabase Preview,rust-tauri-checks" EVID=$T/evid PDV_RESUMO=$T/state/RESUMO.txt BACKUP_RUN_ID=999 PROD_URL=https://erp.example VERCEL_SLEEP=0 VERCEL_POLL=2
TODAY=$(TZ=America/Sao_Paulo date +%F)
pass=0; fail=0
ok(){ echo "PASS  $1"; pass=$((pass+1)); }; ko(){ echo "FAIL  $1"; fail=$((fail+1)); }
hist(){ psql -XAtd golive_e2e -c "select count(*) from supabase_migrations.schema_migrations"; }
resumo(){ cat > $PDV_RESUMO <<R
Diagnostico PDV - $TODAY 08:00:00 (hora local) - maquina PDV1
Backup: C:\\Users\\x\\Desktop\\Backup PDV  (ACL restrita ao usuario atual)
Arquivos copiados: 3 - SHA256 OK
Metodo: sqlite3.exe
integrity_check: ok
VEREDITO: $1
Motivo: teste
R
}
reset(){ psql -Xq -c "drop database if exists golive_e2e" -c "create database golive_e2e template golive_tpl"
  rm -rf $EVID $STUB_STATE; mkdir -p $STUB_STATE
  echo '{"headRefOid":"1448221480a8eb7ffda178aa52d954d0e4b90c71","state":"OPEN","baseRefName":"main","mergeCommit":null}' > $STUB_STATE/pr.json
  echo b89b8824c36fea4bba38731281e247336693c40c > $STUB_STATE/main_sha
  cp $T/ci_checks_584_real.json $STUB_STATE/ci.json
  echo "{\"path\":\".github/workflows/backup-scheduled.yml\",\"conclusion\":\"success\",\"created_at\":\"$(date -u +%FT%TZ)\"}" > $STUB_STATE/backup.json
  echo 75 > $STUB_STATE/sync.v; echo 50 > $STUB_STATE/vg.v
  echo '[{"state":"success","description":"Deployment has completed","environment_url":"https://pdv-importados-abc.vercel.app"}]' > $STUB_STATE/deploy_status.json
  resumo 'COMPATIVEL (Build B ou C)'; }
run(){ ( "$@" ) > $T/last.out 2>&1; echo $?; }
expect_stop(){ local name=$1 code=$2 pat=$3; shift 3; local rc; rc=$(run env "$@" bash $SCRIPT); if [ "$rc" = "$code" ] && grep -q -- "$pat" $T/last.out; then ok "$name (exit $rc)"; else ko "$name (exit $rc, esperado $code /$pat/)"; tail -3 $T/last.out; fi; }
H0=401
# ---------- recusas do preflight / gates ----------
reset
expect_stop "G0 sem RESUMO" 10 "PDV_RESUMO ausente" PDV_RESUMO=/nao/existe
resumo 'INCOMPATIVEL (Build A - precisa reinstalar)'; expect_stop "G0 Build A recusado" 10 "Build A" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY
resumo 'INDETERMINADO'; expect_stop "G0 INDETERMINADO recusado" 10 "INDETERMINADO" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY
resumo 'COMPATIVEL (Build B ou C)'
sed -i 's/integrity_check: ok/integrity_check: falhou/' $PDV_RESUMO; expect_stop "G0 integrity_check != ok" 10 "integrity_check" MODE=apply; resumo 'COMPATIVEL (Build B ou C)'
expect_stop "G1 sem janela" 11 "janela não aprovada" MODE=apply
expect_stop "G1 janela de outro dia" 11 "janela não aprovada" MODE=apply GOLIVE_JANELA_APROVADA=2026-10-19
echo "{\"path\":\".github/workflows/backup-scheduled.yml\",\"conclusion\":\"success\",\"created_at\":\"$(date -u -d '-1 day' +%FT%TZ)\"}" > $STUB_STATE/backup.json
expect_stop "G1 backup de ontem" 11 "backup não é de hoje" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY
echo "{\"path\":\".github/workflows/backup-scheduled.yml\",\"conclusion\":\"failure\",\"created_at\":\"$(date -u +%FT%TZ)\"}" > $STUB_STATE/backup.json
expect_stop "G1 backup falhou" 11 "backup não concluiu" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY
reset
expect_stop "G1 head SHA divergente" 11 "head" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY EXPECTED_HEAD_SHA=0000000000000000000000000000000000000000 REPO=/workspace/fastproduct || true
sed -i 's/b89b8824c36fea4bba38731281e247336693c40c/ffffffffffffffffffffffffffffffffffffffff/' $STUB_STATE/main_sha; expect_stop "G1 main mudou" 11 "main mudou" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY; reset
jq '.check_runs[0].conclusion="failure"' $T/ci_checks_584_real.json > $STUB_STATE/ci.json; expect_stop "G1 CI com falha" 11 "CI não verde" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY; reset
psql -Xqd golive_e2e -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261018000000','intrusa')"
expect_stop "G1 histórico inesperado" 11 "histórico fora do estado esperado" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY; reset
unset CI_ALLOW_SKIPPED; expect_stop "G1 rust-tauri-checks só skipped => recusa (padrão)" 11 "rust-tauri-checks" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY; export CI_ALLOW_SKIPPED="Supabase Preview,rust-tauri-checks"
# ---------- dry-run completo: nada muda ----------
rc=$(run env ATE_GATE=9 CONVERGIR_180000=1 bash $SCRIPT)
if [ "$rc" = 0 ] && [ "$(hist)" = $H0 ] && grep -q 'G9 \[dry-run\]' $T/last.out && [ ! -s $STUB_STATE/supabase.calls -o -z "$(grep deploy $STUB_STATE/supabase.calls)" ] && ! grep -q "pr merge" $STUB_STATE/gh.calls; then ok "dry-run sem mudanças (exit $rc, histórico $(hist))"; else ko "dry-run (exit $rc)"; tail -5 $T/last.out; fi
cp $T/last.out $T/out_dryrun.txt
# ---------- G2 estrito: diferença de comentário => recusa ----------
reset
expect_stop "G2 recusa sem CONVERGIR (diferença exata reportada)" 12 "NÃO exatamente equivalentes" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY
[ "$(hist)" = $H0 ] && ok "G2 recusa não alterou nada (histórico $H0)" || ko "G2 alterou histórico"
cp $EVID/equiv_diff.txt $T/out_equiv_diff.txt
# ---------- falha forçada no meio do Gate 3 ----------
expect_stop "falha forçada em 20261007163000 para no G3" 13 "falha forçada" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY CONVERGIR_180000=1 GOLIVE_FORCAR_FALHA=20261007163000
n=$(psql -XAtd golive_e2e -c "select count(*) from supabase_migrations.schema_migrations where version in ('20261009180000','20261009180001','20261006120000','20261007161220','20261007163000')")
[ "$n" = 4 ] && ok "após falha: 180000/180001/120000/161220 registrados, 163000 ausente (rollback)" || ko "estado pós-falha n=$n"
# ---------- retomada (idempotente) ----------
expect_stop "retomada para no G6 pedindo confirmação do sync do PDV" 16 "CONFIRM_PDV_SYNC_OK" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY CONVERGIR_180000=1
d=$(psql -XAtd golive_e2e -c "select column_default is not null from information_schema.columns where table_name='caixas' and column_name='loja_id'")
[ "$d" = t ] && ok "G6 não aplicou 20261010120000 sem confirmação (DEFAULT presente)" || ko "DEFAULT removido cedo"
grep -q "sync-outbox: 75 -> 76" $EVID/golive.log && ok "G5 edge sync-outbox 75->76, validar-gerente $(cat $STUB_STATE/vg.v)" || ko "G5"
expect_stop "G9 pede smoke manual" 19 "CONFIRM_SMOKE_MANUAL" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY CONVERGIR_180000=1 CONFIRM_PDV_SYNC_OK=1
rc=$(run env MODE=apply GOLIVE_JANELA_APROVADA=$TODAY CONVERGIR_180000=1 CONFIRM_PDV_SYNC_OK=1 CONFIRM_SMOKE_MANUAL=1 bash $SCRIPT)
[ "$rc" = 0 ] && grep -q "G9 OK" $T/last.out && ok "conclusão G0–G9 (exit 0)" || { ko "conclusão rc=$rc"; tail -5 $T/last.out; }
[ "$(hist)" = $((H0+18)) ] && ok "histórico = 401 + 18 linhas" || ko "histórico $(hist)"
bad=0; for f in /workspace/fastproduct/backend/supabase/migrations/{20261006120000,20261007161220,20261007163000,20261007163100,20261007163200,20261007170000,20261007171000,20261007180000,20261007190000,20261016120100,20261019120000,20261019140000,20261019150000,20261019160000,20261019170000,20261010120000,20261009180000,20261009180001}_*.sql; do b=$(basename $f .sql); v=${b%%_*}; n=${b#*_}
  r=$(psql -XAtd golive_e2e -c "select name||' '||md5(statements[1]) from supabase_migrations.schema_migrations where version='$v'"); [ "$r" = "$n $(md5sum < $f | cut -c1-32)" ] || { bad=1; echo "  $v: $r"; }; done
[ $bad = 0 ] && ok "18 linhas de histórico: versão/nome reais e statements = conteúdo exato do arquivo (md5)" || ko "conteúdo do histórico"
d=$(psql -XAtd golive_e2e -c "select coalesce(column_default,'NULL') from information_schema.columns where table_name='caixas' and column_name='loja_id'"); [ "$d" = NULL ] && ok "caixas.loja_id sem DEFAULT só no fim (G6)" || ko "default $d"
# ---------- reexecução total: nada novo ----------
cp $STUB_STATE/gh.calls /tmp/gh1; H1=$(psql -XAtd golive_e2e -c "select md5(string_agg(version||name||array_to_string(statements,''),',' order by version)) from supabase_migrations.schema_migrations")
rc=$(run env MODE=apply GOLIVE_JANELA_APROVADA=$TODAY CONVERGIR_180000=1 CONFIRM_PDV_SYNC_OK=1 CONFIRM_SMOKE_MANUAL=1 bash $SCRIPT)
H2=$(psql -XAtd golive_e2e -c "select md5(string_agg(version||name||array_to_string(statements,''),',' order by version)) from supabase_migrations.schema_migrations")
[ "$rc" = 0 ] && [ "$H1" = "$H2" ] && [ "$(grep -c 'pr merge' $STUB_STATE/gh.calls)" = 1 ] && [ "$(cat $STUB_STATE/sync.v)" = 76 ] && ok "reexecução idempotente (0 migrations, 0 deploy, 0 merge novos)" || ko "reexecução rc=$rc"
cp $T/last.out $T/out_rerun.txt
# ---------- Vercel SKIPPED não é prova ----------
rm -f $EVID/state/g8.done; echo '[{"state":"success","description":"Build Skipped (ignored build step)","environment_url":"https://x"}]' > $STUB_STATE/deploy_status.json
expect_stop "G8 deploy SKIPPED recusado" 18 "SKIPPED" MODE=apply GOLIVE_JANELA_APROVADA=$TODAY CONVERGIR_180000=1
echo "== $pass PASS / $fail FAIL"
