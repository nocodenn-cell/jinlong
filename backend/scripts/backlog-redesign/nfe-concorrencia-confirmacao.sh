#!/usr/bin/env bash
# Concorrência real: duas sessões PostgreSQL confirmam a MESMA NF-e ao mesmo tempo.
# Prova: estoque, kardex e contas a pagar não duplicam (confirmar_importacao_nfe usa FOR UPDATE).
#
# Ambiente: banco local descartável do Supabase CLI (container supabase_db_<project_id>).
# NUNCA executar contra homologação ou produção: o script grava dados comitados.
#
# Uso: backend/scripts/nfe-concorrencia-confirmacao.sh [nome_do_container]
set -euo pipefail

CONTAINER="${1:-supabase_db_fastproduct}"
PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -A -t)
SCRATCH="${TMPDIR:-/tmp}/nfe-conc-$$"
mkdir -p "$SCRATCH"
trap 'rm -rf "$SCRATCH"' EXIT

LOJA='f5100000-0000-4000-8000-0000000000a1'
GERENTE='f5100000-0000-4000-8000-000000000002'
PRODUTO='f5100000-0000-4000-8000-0000000000f1'
CHAVE='35260800000000000000550090000000161000000019'

echo "[1/4] Preparando NF-e de teste (dados comitados no banco local descartável)"
"${PSQL[@]}" <<SQL
-- Dados da rodada anterior (idempotente)
DELETE FROM public.importacoes_nfe WHERE chave_acesso = '$CHAVE';
DO \$p\$
DECLARE
  v_res jsonb; v_imp uuid; v_it uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '$GERENTE', false);
  v_res := public.importar_nfe_transacao(
    p_chave_acesso => '$CHAVE', p_numero_nf => 'CONC-1', p_fornecedor_cnpj => '99888777000166',
    p_fornecedor_nome => 'CONC FORN', p_loja_id => '$LOJA',
    p_itens => jsonb_build_array(jsonb_build_object('nome_produto','CONC','gtin',null,'ref_fornecedor','CONC-REF','ncm',null,
      'u_com','UN','q_com',10,'v_un_com',10.00,'v_prod',100.00,'fator',1,'atualizar_custo',true,'acao','VINCULAR','produto_id_destino','$PRODUTO')),
    p_atualizar_custo => true,
    p_duplicatas => jsonb_build_array(jsonb_build_object('numero','1','data_vencimento',(current_date+30)::text,'valor',100.00)));
  v_imp := (v_res->>'importacao_id')::uuid;
  SELECT id INTO v_it FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = v_imp;
  PERFORM public.registrar_conferencia_nfe(v_imp, jsonb_build_array(jsonb_build_object('item_id', v_it, 'quantidade_conferida', 10, 'divergencia_obs', null)));
  PERFORM set_config('nfe.conc_imp', v_imp::text, false);
END
\$p\$;
SELECT id FROM public.importacoes_nfe WHERE chave_acesso = '$CHAVE';
SQL

IMP=$("${PSQL[@]}" -c "SELECT id FROM public.importacoes_nfe WHERE chave_acesso = '$CHAVE'")
IMP="$(echo "$IMP" | tr -d '[:space:]')"
ESTOQUE_ANTES=$("${PSQL[@]}" -c "SELECT coalesce((SELECT quantidade_atual FROM public.estoque WHERE produto_id='$PRODUTO' AND loja_id='$LOJA'),0)" | tr -d '[:space:]')
echo "    importação=$IMP estoque_antes=$ESTOQUE_ANTES"

echo "[2/4] Duas sessões confirmando a mesma NF-e em paralelo"
run_session() {
  local nome="$1"
  "${PSQL[@]}" > "$SCRATCH/$nome.out" 2>&1 <<SQL || true
SELECT set_config('request.jwt.claim.sub', '$GERENTE', false);
SELECT pg_sleep(0.2);
SELECT public.confirmar_importacao_nfe('$IMP'::uuid);
SQL
  echo "rc=$?" >> "$SCRATCH/$nome.out"
}
run_session sessao_a & PID_A=$!
run_session sessao_b & PID_B=$!
wait "$PID_A" "$PID_B" || true

for s in sessao_a sessao_b; do
  echo "    $s: $(grep -v '^SET\|^ *$\|set_config' "$SCRATCH/$s.out" | tr '\n' ' ' | cut -c1-240)"
done

echo "[3/4] Verificação de integridade"
ESTOQUE_DEPOIS=$("${PSQL[@]}" -c "SELECT coalesce((SELECT quantidade_atual FROM public.estoque WHERE produto_id='$PRODUTO' AND loja_id='$LOJA'),0)" | tr -d '[:space:]')
KARDEX=$("${PSQL[@]}" -c "SELECT count(*) FROM public.movimentos_estoque_log WHERE produto_id='$PRODUTO' AND loja_id='$LOJA' AND tipo_codigo='ENTRADA_NFE' AND observacao LIKE '%$IMP%'" | tr -d '[:space:]')
AP=$("${PSQL[@]}" -c "SELECT count(*) FROM public.contas_pagar WHERE nfe_importacao_id='$IMP'" | tr -d '[:space:]')
AP_VALOR=$("${PSQL[@]}" -c "SELECT coalesce(sum(valor_total),0) FROM public.contas_pagar WHERE nfe_importacao_id='$IMP'" | tr -d '[:space:]')
STATUS=$("${PSQL[@]}" -c "SELECT status FROM public.importacoes_nfe WHERE id='$IMP'" | tr -d '[:space:]')
DELTA=$("${PSQL[@]}" -c "SELECT ($ESTOQUE_DEPOIS) - ($ESTOQUE_ANTES)" | tr -d "[:space:]")
echo "    estoque_delta=$DELTA (esperado 10) kardex_entradas=$KARDEX (esperado 1) ap=$AP valor_ap=$AP_VALOR (esperado 1 de 100.00) status=$STATUS (esperado CONCLUIDA)"

echo "[4/4] Resultado"
OK=1
[ "$DELTA" = "10" ] || [ "$DELTA" = "10.000" ] || OK=0
[ "$KARDEX" = "1" ] || OK=0
[ "$AP" = "1" ] || OK=0
[ "$STATUS" = "CONCLUIDA" ] || OK=0
if [ "$OK" = "1" ]; then echo "PASSOU: uma confirmação efetiva; estoque, kardex e AP sem duplicidade"; else echo "FALHOU"; exit 1; fi
