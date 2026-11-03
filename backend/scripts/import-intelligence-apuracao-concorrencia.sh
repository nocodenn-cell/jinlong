#!/usr/bin/env bash
# D-04 — concorrência real na apuração. Três sessões independentes (transações confirmadas):
#   H: segura o lock da operação por 2 s (mesmo lock que o registro usa);
#   A e B: registram a MESMA apuração (mesma identidade e mesma saída) — esperado: mesmo id, uma linha;
#   C: mesma identidade com saída divergente — esperado: IMPORT_APURACAO_CONFLITO_CONTEUDO.
# Escreve dados fictícios com sufixo único. Só roda contra o container de teste informado.
#
# Uso: PG_CONTAINER=supabase_db_importt1 bash backend/scripts/import-intelligence-apuracao-concorrencia.sh
set -u

C="${PG_CONTAINER:?defina PG_CONTAINER com o container de banco de TESTE isolado}"
case "$C" in
  *prod*|*homolog*|*fastproduct*) echo "recusado: container '$C' não é de teste isolado"; exit 2 ;;
esac

PSQL=(docker exec -i "$C" psql -X -q -At -U postgres -d postgres -v ON_ERROR_STOP=1)
SUF="$(date +%s | tail -c 7)$$"
OUT="$(mktemp -d)"

# ---------------------------------------------------------------- fixture (confirmada) --
EMP="$("${PSQL[@]}" -c "INSERT INTO public.empresas (nome) VALUES ('CONC ${SUF}') RETURNING id;")"
LOJA="$("${PSQL[@]}" -c "INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('CONC L ${SUF}', 'CONC-${SUF}', '${EMP}') RETURNING id;")"
USR="$("${PSQL[@]}" -c "SELECT gen_random_uuid();")"
"${PSQL[@]}" -c "INSERT INTO auth.users (id, email) VALUES ('${USR}', 'conc-${SUF}@teste.local');" >/dev/null
"${PSQL[@]}" -c "INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES ('${USR}', 'CONC ${SUF}', 'GERENTE', '${LOJA}', true);" >/dev/null
"${PSQL[@]}" -c "SET ROLE service_role; SELECT public.ops_definir_modulo_empresa('${EMP}', 'IMPORT_INTELLIGENCE', true, 'contrato conc', 'teste de concorrência', 'teste-conc');" >/dev/null
OP="$("${PSQL[@]}" -c "INSERT INTO public.import_operacoes (empresa_id, loja_importadora_id, referencia, criado_por) VALUES ('${EMP}', '${LOJA}', 'CONC-OP-${SUF}', '${USR}') RETURNING id;")"
VD="$("${PSQL[@]}" -c "SELECT versao_dados FROM public.import_operacoes WHERE id = '${OP}';")"

SAIDA='{"schema_version":"1","engine_version":"landed-cost/0.1.0","status":"OK","divergencias":[],"rateios":[],"despesas_nao_incorporadas":[],"conservacao":{"ok":true},"itens":[]}'
SHA_OK="$(printf 'b%.0s' $(seq 1 64))"
SHA_OUTRO="$(printf 'c%.0s' $(seq 1 64))"

registrar() { # $1 = rótulo, $2 = sha da saída
  "${PSQL[@]}" -c "SET ROLE service_role; SELECT public.import_registrar_apuracao('${OP}', '${USR}', 'APURACAO', ${VD}, '${SAIDA}'::jsonb, '$2');" \
    > "${OUT}/$1.out" 2>&1
}

# ---------------------------------------------------------------- sessões concorrentes --
"${PSQL[@]}" -c "BEGIN; SELECT 1 FROM public.import_operacoes WHERE id = '${OP}' FOR UPDATE; SELECT pg_sleep(2); COMMIT;" \
  > "${OUT}/H.out" 2>&1 &
registrar A "${SHA_OK}" &
registrar B "${SHA_OK}" &
registrar C "${SHA_OUTRO}" &
wait

# ---------------------------------------------------------------- verificação --
ID_A="$(grep -E '^[0-9a-f-]{36}$' "${OUT}/A.out" | tail -1)"
ID_B="$(grep -E '^[0-9a-f-]{36}$' "${OUT}/B.out" | tail -1)"
ERR_C="$(grep -o 'IMPORT_APURACAO_CONFLITO_CONTEUDO' "${OUT}/C.out" | head -1)"
LINHAS="$("${PSQL[@]}" -c "SELECT count(*) FROM public.import_apuracoes WHERE operacao_id = '${OP}';")"
VERSOES="$("${PSQL[@]}" -c "SELECT count(DISTINCT versao) FROM public.import_apuracoes WHERE operacao_id = '${OP}';")"

echo "A id=${ID_A:-<erro>}"
echo "B id=${ID_B:-<erro>}"
echo "C conflito=${ERR_C:-<não ocorreu>}"
echo "linhas=${LINHAS} versoes_distintas=${VERSOES}"

FALHAS=0
[ -n "$ID_A" ] && [ "$ID_A" = "$ID_B" ] || { echo "FALHOU: A e B devem retornar o mesmo id"; FALHAS=$((FALHAS+1)); }
[ "$ERR_C" = "IMPORT_APURACAO_CONFLITO_CONTEUDO" ] || { echo "FALHOU: C deve receber conflito de conteúdo"; FALHAS=$((FALHAS+1)); }
[ "$LINHAS" = "1" ] && [ "$VERSOES" = "1" ] || { echo "FALHOU: deve existir exatamente uma apuração"; FALHAS=$((FALHAS+1)); }

if [ "$FALHAS" -eq 0 ]; then echo "PASSOU: concorrência D-04"; else echo "FALHARAM: ${FALHAS}"; echo "saídas em ${OUT}"; exit 1; fi
