#!/usr/bin/env bash
# Validação reproduzível da tranche de segurança (20261028100000 → 20261028122000) em CONTÊINER DESCARTÁVEL.
#
# Segurança: não aceita DB_URL nem aponta para Supabase. Usa apenas `docker exec` num contêiner local criado
# por este script, com dados sintéticos do snapshot `hub_seeded:snap` (estado pré-tranche). Remove o contêiner ao final.
#
# Uso:  IMG=hub_seeded:snap backend/scripts/tranche-seguranca-validar.sh
# Saída: uma linha por suíte (PASSOU / FALHOU / NÃO TESTADO) e o resultado do rollback em cadeia.
set -uo pipefail

IMG="${IMG:-hub_seeded:snap}"
NAME="${NAME:-tranche_val_$$}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
M="$ROOT/backend/supabase/migrations"
R="$ROOT/backend/supabase/rollback"
S="$ROOT/backend/scripts"
TMP="$(mktemp -d)"
TRANCHE=(
  20261028100000_sec_token_gerente_loja_nula_fora_da_loja
  20261028110000_corte_admin_papeis
  20261028120100_sec_tokens_usuario_inativo_revogacao
  20261028121000_provisionamento_automatico_bloqueado
  20261028122000_admin_residual_escopo_ativo
)
# Suítes deste repositório que rodam sobre a tranche (ver docs/ops/TRANCHE_VALIDACAO_2026-11-05.md)
SUITES=(
  sec-tokens-usuario-inativo
  sec04-token-gerente-tenant
  tokens-autorizacao-operacao
  tokens-autorizacao-adversarial
  listar-caixas-elegiveis-desembolso
  provisionamento-wizard-trial
  recuperacao-acesso-tokens
)

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT

docker run -d --name "$NAME" "$IMG" >/dev/null || { echo "ERRO: não criou o contêiner a partir de $IMG"; exit 1; }
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U supabase_admin -d postgres >/dev/null 2>&1 && break
  sleep 2
done

P()  { docker exec -i "$NAME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
PT() { docker exec -i "$NAME" psql -U supabase_admin -d postgres -tA "$@"; }

# Assinatura: definições e ACLs das funções afetadas (md5 de pg_get_functiondef + proacl)
SIG_SQL="select n.nspname||'.'||p.proname||' '||md5(pg_get_functiondef(p.oid))||' '||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='internal' and p.proname in ('token_gerente_fora_da_loja','tg_token_gerente_consumo','tg_revogar_tokens_usuario','fp_revogar_tokens_usuario','fp_usuario_ativo_com_papel','fp_aprovador_ativo_na_empresa','fp_token_gerente_motivo_invalido','plataforma_provisionar_empresa_nucleo')) or (n.nspname='public' and p.proname in ('fp_token_gerente_vale_na_loja','consumir_token_autorizacao_operacao','plataforma_provisionar_empresa','auth_usuario_gerencial_loja','produtos_custos_autorizados','listar_caixas_elegiveis_desembolso','fp_admin_legado','auth_usuario_eh_admin','fp_pode_loja','vincular_usuario_loja')) order by 1;"

echo "== baseline"
PT -c "$SIG_SQL" > "$TMP/sig_base.txt"
echo "   funções assinadas: $(wc -l < "$TMP/sig_base.txt")"

echo "== aplicação da tranche (ordem fixa, sem outras pendentes)"
for f in "${TRANCHE[@]}"; do
  if P < "$M/$f.sql" > "$TMP/apply_$f.log" 2>&1; then echo "   APLICADA  $f"; else echo "   FALHOU    $f"; sed -n 1,3p "$TMP/apply_$f.log"; exit 1; fi
done

echo "== suítes"
for t in "${SUITES[@]}"; do
  f="$S/$t.test.sql"
  [ -f "$f" ] || { echo "   NÃO TESTADO  $t (arquivo ausente)"; continue; }
  docker exec -i "$NAME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=0 < "$f" > "$TMP/$t.out" 2>&1
  ex=$?
  if [ $ex -eq 0 ] && ! grep -q "NOT OK\|FALHOU\|^ERROR" "$TMP/$t.out"; then
    echo "   PASSOU       $t"
  else
    echo "   FALHOU       $t (exit=$ex)"; grep -m2 "^ERROR\|NOT OK\|FALHOU" "$TMP/$t.out" | sed 's/^/                 /'
  fi
done

echo "== rollback em cadeia (ordem inversa)"
for f in 20261028122000_admin_residual_escopo_ativo 20261028121000_provisionamento_automatico_bloqueado 20261028120100_sec_tokens_usuario_inativo_revogacao 20261028110000_corte_admin_papeis 20261028100000_sec_token_gerente_loja_nula_fora_da_loja; do
  if P < "$R/$f.rollback.sql" > "$TMP/rb_$f.log" 2>&1; then echo "   REVERTIDA    $f"; else echo "   FALHOU       $f"; sed -n 1,3p "$TMP/rb_$f.log"; exit 1; fi
done
PT -c "$SIG_SQL" > "$TMP/sig_rolled.txt"
if diff -q "$TMP/sig_base.txt" "$TMP/sig_rolled.txt" >/dev/null; then
  echo "   RESULTADO: funções e ACLs idênticas ao baseline após o rollback"
else
  echo "   RESULTADO: DIVERGE do baseline"; diff "$TMP/sig_base.txt" "$TMP/sig_rolled.txt" | head -6
fi
