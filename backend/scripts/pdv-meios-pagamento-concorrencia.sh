#!/usr/bin/env bash
# Dupla finalização SIMULTÂNEA da mesma venda (mesmo p_venda_id = idempotencyKey do PDV) em 2 sessões reais.
# Uso: PSQL_URL=postgres://... bash pdv-meios-pagamento-concorrencia.sh   (banco DESCARTÁVEL — faz COMMIT de fixture sintética)
set -euo pipefail
: "${PSQL_URL:?defina PSQL_URL de um banco local descartável}"
P="psql $PSQL_URL -X -q -v ON_ERROR_STOP=1 -At"
L=e2000001-0000-4000-8000-000000000001; O=e2000002-0000-4000-8000-000000000001; C=e2000003-0000-4000-8000-000000000001
PR=e2000004-0000-4000-8000-000000000001; V=$(cat /proc/sys/kernel/random/uuid)
$P <<SQL
INSERT INTO auth.users (id) VALUES ('$O') ON CONFLICT DO NOTHING;
INSERT INTO public.lojas (id,nome,codigo,ativo) VALUES ('$L','CONC Loja','PAGCONC',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.usuarios (id,nome,perfil,ativo,loja_id) VALUES ('$O','CONC Op','OPERADOR',true,'$L') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.categorias (id,nome) VALUES ('$C','CONC Cat') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.produtos (id,codigo_barras,nome,categoria_id,preco_varejo,origem,tem_nf,ativo,loja_id)
  VALUES ('$PR','7899999992001','CONC Prod','$C',100,'brasil_nf',false,true,'$L') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.estoque (produto_id,loja_id,quantidade_atual,estoque_minimo) VALUES ('$PR','$L',100,0)
  ON CONFLICT (produto_id,loja_id) DO UPDATE SET quantidade_atual=100;
INSERT INTO public.formas_pagamento (loja_id,codigo,nome,ativo) VALUES ('$L','DINHEIRO','Dinheiro',true),('$L','PIX','PIX',true)
  ON CONFLICT (loja_id,codigo) DO UPDATE SET ativo=true;
INSERT INTO public.caixas (operador_id,status,data_abertura,valor_inicial,loja_id)
  SELECT '$O','ABERTO',now(),0,'$L' WHERE NOT EXISTS (SELECT 1 FROM public.caixas WHERE operador_id='$O' AND status='ABERTO');
SQL
CX=$($P -c "SELECT id FROM public.caixas WHERE operador_id='$O' AND status='ABERTO' LIMIT 1")
CALL="SELECT set_config('request.jwt.claim.sub','$O',true);
SELECT status FROM public.finalizar_venda_transacional_canonica_v4('$V','$CX','$O','$L','DINHEIRO',100,0,100,
 '[{\"forma_pagamento\":\"DINHEIRO\",\"valor\":50},{\"forma_pagamento\":\"PIX\",\"valor\":50}]'::jsonb,
 jsonb_build_array(jsonb_build_object('item_id',gen_random_uuid(),'produto_id','$PR','quantidade',1,'preco_original',100,'preco_unitario',100,'tipo_preco','VAREJO')));"
( $P -c "BEGIN; $CALL SELECT pg_sleep(2); COMMIT;" > /tmp/conc1.out 2>&1; echo "s1 exit=$?" >> /tmp/conc1.out ) &
sleep 0.5
( $P -c "BEGIN; $CALL COMMIT;" > /tmp/conc2.out 2>&1; echo "s2 exit=$?" >> /tmp/conc2.out ) &
wait
echo "sessão 1: $(tr '\n' ' ' < /tmp/conc1.out)"; echo "sessão 2: $(tr '\n' ' ' < /tmp/conc2.out)"
R=$($P -c "SELECT (SELECT count(*) FROM public.vendas WHERE id='$V')||'|'||(SELECT count(*)||'/'||sum(valor) FROM public.vendas_pagamentos WHERE venda_id='$V')||'|'||(SELECT quantidade_atual::int FROM public.estoque WHERE produto_id='$PR')")
echo "vendas|pagamentos(qtd/soma)|estoque = $R"
[ "$R" = "1|2/100.00|99" ] && grep -q CONCLUIDA /tmp/conc1.out && grep -q CONCLUIDA /tmp/conc2.out \
  && echo "OK T9 dupla finalização simultânea: 1 venda, 2 parcelas (100.00), estoque baixado 1x" || { echo "T9 FALHOU"; exit 1; }
