#!/usr/bin/env bash
# Prova DETERMINÍSTICA da corrida em `atualizar_produto_com_faixa_atacado`.
#
# POR QUE NÃO BASTA Promise.all: duas chamadas concorrentes via PostgREST não
# garantem entrelaçamento — o pool pode serializá-las e a janela da corrida é
# curta demais. Um smoke assim passa mesmo com a função SEM lock, ou seja, não
# tem dentes. Verificado em 2026-08-16: removi o `FOR UPDATE` e o teste com
# Promise.all continuou verde.
#
# Aqui o entrelaçamento é FORÇADO com duas sessões psql e uma janela explícita:
#
#   Sessão A: BEGIN; atualizar(gatilho=20); pg_sleep(4); COMMIT;
#   Sessão B:        (1s depois) BEGIN; atualizar(gatilho=30); COMMIT;
#
#   COM FOR UPDATE  → B bloqueia no lock da linha até A commitar; ao seguir, lê
#                     gatilho=20 (já commitado) e desativa a faixa 20.
#                     Resultado: 1 faixa derivada ativa (30).
#   SEM FOR UPDATE  → B lê gatilho=10 (a alteração de A ainda não commitou),
#                     insere a 30 e desativa a 10 — a faixa 20 de A sobrevive.
#                     Resultado: 2 faixas derivadas ativas (20 e 30) para um
#                     único gatilho no produto. É exatamente a divergência que
#                     a RPC deve impedir.
#
# Uso:
#   backend/scripts/concorrencia-faixa-atacado.sh
#   backend/scripts/concorrencia-faixa-atacado.sh --esperar-falha   # controle negativo
set -uo pipefail

CONTAINER="${CONTAINER:-supabase_db_fastproduct}"
ESPERAR_FALHA=0
[ "${1:-}" = "--esperar-falha" ] && ESPERAR_FALHA=1

PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -t -A)

echo "=== Corrida produto + faixa de atacado (entrelaçamento forçado) ==="

# ── Cenário ───────────────────────────────────────────────────────────────────
IDS=$("${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_ator uuid; v_loja uuid; v_prod uuid;
BEGIN
  DELETE FROM public.precos_atacado WHERE produto_id IN
    (SELECT id FROM public.produtos WHERE nome LIKE '__CONC_FAIXA__%');
  DELETE FROM public.estoque WHERE produto_id IN
    (SELECT id FROM public.produtos WHERE nome LIKE '__CONC_FAIXA__%');
  DELETE FROM public.produtos WHERE nome LIKE '__CONC_FAIXA__%';

  v_loja := 'a0000001-0000-4000-8000-000000000001';

  -- Ator próprio: um banco recém-resetado não tem usuários, e depender de um
  -- ator pré-existente tornava o script dependente do estado do ambiente.
  SELECT u.id INTO v_ator
  FROM public.usuarios u
  WHERE u.perfil IN ('GERENTE','DONO','ADMIN') AND u.ativo AND u.loja_id = v_loja
  LIMIT 1;

  IF v_ator IS NULL THEN
    v_ator := '00000000-0000-4000-8000-00000000c0c0'::uuid;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    VALUES (v_ator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'conc-faixa@local.test', '', now(), now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo)
    VALUES (v_ator, 'Ator Concorrencia', 'GERENTE', v_loja, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.produtos (nome, preco_varejo, origem, loja_id, preco_atacado, quantidade_gatilho_atacado)
  VALUES ('__CONC_FAIXA__', 100, 'brasil_nf', v_loja, 30, 10)
  RETURNING id INTO v_prod;

  -- faixa derivada inicial (gatilho 10) + uma manual que deve sobreviver
  INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
  VALUES (v_prod, 10, 30, NULL, true), (v_prod, 100, 20, NULL, true);

  CREATE TEMP TABLE IF NOT EXISTS _ctx (prod uuid, ator uuid) ON COMMIT PRESERVE ROWS;
  DELETE FROM _ctx;
  INSERT INTO _ctx VALUES (v_prod, v_ator);
END $$;
SELECT prod || ' ' || ator FROM _ctx;
SQL
)
PROD=$(echo "$IDS" | tail -1 | awk '{print $1}')
ATOR=$(echo "$IDS" | tail -1 | awk '{print $2}')

if [ -z "$PROD" ] || [ -z "$ATOR" ]; then
  echo "ABORTADO: não consegui montar o cenário (prod='$PROD' ator='$ATOR')"
  exit 2
fi
echo "produto=$PROD ator=$ATOR  (estado inicial: gatilho=10, faixas ativas 10 e 100)"

# ── Sessão A: segura a transação aberta por 4s ────────────────────────────────
(
  "${PSQL[@]}" <<SQL
BEGIN;
SELECT public.atualizar_produto_com_faixa_atacado(
  '$PROD'::uuid,
  '{"preco_atacado": 25, "quantidade_gatilho_atacado": 20}'::jsonb,
  '$ATOR'::uuid,
  '{"quantidade_minima": 20, "preco_unitario": 25}'::jsonb
);
SELECT pg_sleep(4);
COMMIT;
SQL
) > /dev/null 2>&1 &
PID_A=$!

sleep 1

# ── Sessão B: entra no meio da transação de A ─────────────────────────────────
echo "sessão B entrando enquanto A está aberta..."
"${PSQL[@]}" <<SQL > /dev/null 2>&1
BEGIN;
SELECT public.atualizar_produto_com_faixa_atacado(
  '$PROD'::uuid,
  '{"preco_atacado": 22, "quantidade_gatilho_atacado": 30}'::jsonb,
  '$ATOR'::uuid,
  '{"quantidade_minima": 30, "preco_unitario": 22}'::jsonb
);
COMMIT;
SQL

wait $PID_A

# ── Estado final ──────────────────────────────────────────────────────────────
RESULTADO=$("${PSQL[@]}" <<SQL
SELECT
  (SELECT quantidade_gatilho_atacado FROM public.produtos WHERE id = '$PROD') || '|' ||
  (SELECT preco_atacado FROM public.produtos WHERE id = '$PROD') || '|' ||
  (SELECT coalesce(string_agg(quantidade_minima::text || ':' || preco_unitario::text, ',' ORDER BY quantidade_minima), '')
     FROM public.precos_atacado
    WHERE produto_id = '$PROD' AND ativo AND loja_id IS NULL AND quantidade_minima <> 100) || '|' ||
  (SELECT count(*) FROM public.precos_atacado
    WHERE produto_id = '$PROD' AND ativo AND loja_id IS NULL AND quantidade_minima <> 100) || '|' ||
  (SELECT count(*) FROM public.precos_atacado
    WHERE produto_id = '$PROD' AND ativo AND quantidade_minima = 100);
SQL
)
RESULTADO=$(echo "$RESULTADO" | tail -1)
GATILHO=$(echo "$RESULTADO" | cut -d'|' -f1)
PRECO=$(echo "$RESULTADO" | cut -d'|' -f2)
DERIVADAS=$(echo "$RESULTADO" | cut -d'|' -f3)
N_DERIVADAS=$(echo "$RESULTADO" | cut -d'|' -f4)
N_MANUAL=$(echo "$RESULTADO" | cut -d'|' -f5)

echo "estado final: gatilho=$GATILHO preco_atacado=$PRECO derivadas_ativas=[$DERIVADAS] manual=$N_MANUAL"

FALHAS=0
if [ "$N_DERIVADAS" != "1" ]; then
  echo "FALHA existe(m) $N_DERIVADAS faixa(s) derivada(s) ativa(s); esperado exatamente 1"
  FALHAS=$((FALHAS + 1))
else
  echo "PASS  exatamente 1 faixa derivada ativa"
fi
if [ "${DERIVADAS%%:*}" != "$GATILHO" ]; then
  echo "FALHA a faixa derivada ativa ($DERIVADAS) não corresponde ao gatilho do produto ($GATILHO)"
  FALHAS=$((FALHAS + 1))
else
  echo "PASS  faixa derivada corresponde ao gatilho final do produto"
fi
if [ "$N_MANUAL" != "1" ]; then
  echo "FALHA faixa manual (100) não sobreviveu"
  FALHAS=$((FALHAS + 1))
else
  echo "PASS  faixa manual preservada"
fi

# ── Limpeza ───────────────────────────────────────────────────────────────────
"${PSQL[@]}" <<SQL > /dev/null 2>&1
DELETE FROM public.precos_atacado WHERE produto_id = '$PROD';
DELETE FROM public.estoque WHERE produto_id = '$PROD';
DELETE FROM public.produtos WHERE id = '$PROD';
SQL
echo "dados de teste removidos."

if [ "$ESPERAR_FALHA" = "1" ]; then
  if [ "$FALHAS" -gt 0 ]; then
    echo "=== CONTROLE NEGATIVO OK: sem o lock, a corrida foi detectada ($FALHAS falha(s)) ==="
    exit 0
  fi
  echo "=== CONTROLE NEGATIVO FALHOU: o teste NÃO detectou a corrida — teste sem dentes ==="
  exit 1
fi

if [ "$FALHAS" -gt 0 ]; then
  echo "=== $FALHAS falha(s): a corrida NÃO está protegida ==="
  exit 1
fi
echo "=== corrida protegida: estado final consistente ==="
