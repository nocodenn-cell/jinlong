#!/usr/bin/env bash
# RN-03 — testes de banco (homologação local). Usa o banco local supabase_db_fastproduct.
set -u
DB="docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=0"
OP=c01fc2fe-e6b1-475c-bd1a-41e0c88a4956   # operador e2e (dono da espera)
OUTRO=4d40f1d1-99d9-4f9d-91c4-c782b08c968e # gerente e2e (não é o dono)
LOJA=a0000001-0000-4000-8000-000000000001
SESS="select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); select set_config('request.jwt.claim.sub','%s', true);"
sess() { printf "$SESS" "$1" "$1"; }

echo "== 0. Fixture: caixa aberto do operador e uma venda em espera nova (commit)"
MSYS_NO_PATHCONV=1 $DB <<SQL
do \$\$ begin
  if not exists (select 1 from caixas where operador_id='$OP' and status='ABERTO') then
    insert into caixas (operador_id, loja_id, valor_inicial, status, data_abertura)
    values ('$OP', '$LOJA', 100, 'ABERTO', now());
  end if;
end \$\$;
insert into vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, itens, totais, status)
select '$LOJA', '$OP', c.id, (select coalesce(max(numero_local),0)+1 from vendas_em_espera), '[]', '{}', 'EM_ESPERA'
from caixas c where c.operador_id='$OP' and c.status='ABERTO' limit 1
returning id;
SQL

ESPERA=$(MSYS_NO_PATHCONV=1 $DB -tA -c "select id from vendas_em_espera where status='EM_ESPERA' and operador_id='$OP' order by criada_em desc limit 1")
echo "espera de teste: $ESPERA"

echo "== 1. Descarte com motivo válido pelo dono (esperado: DESCARTADA + autor + data)"
MSYS_NO_PATHCONV=1 $DB -tA <<SQL
begin;
$(sess $OP)
select public.descartar_venda_em_espera('$ESPERA'::uuid, 'Cliente desistiu da compra');
select status, descartada_por = '$OP'::uuid as autor_ok, descartada_em is not null as data_ok, descartada_motivo from vendas_em_espera where id='$ESPERA';
commit;
SQL

echo "== 2. Repetição do descarte (esperado: venda_em_espera_nao_encontrada)"
MSYS_NO_PATHCONV=1 $DB -tA <<SQL 2>&1 | grep -i "erro\|error\|nao_encontrada" | head -2
begin;
$(sess $OP)
select public.descartar_venda_em_espera('$ESPERA'::uuid, 'Repetição do descarte');
rollback;
SQL

echo "== 3. Motivo vazio ou curto (esperado: motivo_obrigatorio)"
ESP2=$(MSYS_NO_PATHCONV=1 $DB -tA -c "insert into vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, itens, totais, status) select '$LOJA','$OP', c.id, 900+floor(random()*90)::int, '[]','{}','EM_ESPERA' from caixas c where c.operador_id='$OP' and c.status='ABERTO' limit 1 returning id")
MSYS_NO_PATHCONV=1 $DB -tA <<SQL 2>&1 | grep -i "motivo_obrigatorio" | head -1
begin;
$(sess $OP)
select public.descartar_venda_em_espera('$ESP2'::uuid, '  ');
rollback;
SQL

echo "== 4. Descarte por outro usuário (esperado: permissao_negada)"
MSYS_NO_PATHCONV=1 $DB -tA <<SQL 2>&1 | grep -i "permissao_negada" | head -1
begin;
$(sess $OUTRO)
select public.descartar_venda_em_espera('$ESP2'::uuid, 'Tentativa de outro usuário');
rollback;
SQL

echo "== 5. Sem sessão (esperado: sessao_expirada)"
MSYS_NO_PATHCONV=1 $DB -tA <<SQL 2>&1 | grep -i "sessao_expirada" | head -1
begin;
select set_config('request.jwt.claim.sub','', true);
select public.descartar_venda_em_espera('$ESP2'::uuid, 'Sem sessão');
rollback;
SQL

echo "== 6. Escrita direta marcando DESCARTADA sem autor (esperado: violação do CHECK)"
MSYS_NO_PATHCONV=1 $DB -tA <<SQL 2>&1 | grep -i "descarte_auditavel" | head -1
begin;
update vendas_em_espera set status='DESCARTADA', descartada_motivo='direto' where id='$ESP2';
rollback;
SQL

echo "== 7. Histórico preservado (linha DESCARTADA antiga continua sem autor)"
MSYS_NO_PATHCONV=1 $DB -tA -c "select count(*) as descartadas_antigas_sem_autor from vendas_em_espera where status='DESCARTADA' and descartada_por is null"

echo "== 8. Descarte simultâneo da mesma espera (duas sessões): só uma vence"
ESP3=$(MSYS_NO_PATHCONV=1 $DB -tA -c "insert into vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, itens, totais, status) select '$LOJA','$OP', c.id, 950+floor(random()*40)::int, '[]','{}','EM_ESPERA' from caixas c where c.operador_id='$OP' and c.status='ABERTO' limit 1 returning id")
( MSYS_NO_PATHCONV=1 $DB -tA <<SQL > /c/Users/aoliv/AppData/Local/Temp/claude/pdv/race_a.txt 2>&1
begin;
$(sess $OP)
select public.descartar_venda_em_espera('$ESP3'::uuid, 'Corrida A');
select pg_sleep(2);
commit;
SQL
) &
sleep 0.5
( MSYS_NO_PATHCONV=1 $DB -tA <<SQL > /c/Users/aoliv/AppData/Local/Temp/claude/pdv/race_b.txt 2>&1
begin;
$(sess $OP)
select public.descartar_venda_em_espera('$ESP3'::uuid, 'Corrida B');
commit;
SQL
) &
wait
echo "-- sessão A:"; grep -v "^$" /c/Users/aoliv/AppData/Local/Temp/claude/pdv/race_a.txt | tail -3
echo "-- sessão B:"; grep -v "^$" /c/Users/aoliv/AppData/Local/Temp/claude/pdv/race_b.txt | tail -3
MSYS_NO_PATHCONV=1 $DB -tA -c "select status, descartada_motivo, descartada_por is not null from vendas_em_espera where id='$ESP3'"

echo "== 9. Fechamento concorrente com descarte em andamento (A descarta sem commit; B fecha)"
ESP4=$(MSYS_NO_PATHCONV=1 $DB -tA -c "insert into vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, itens, totais, status) select '$LOJA','$OP', c.id, 990+floor(random()*9)::int, '[]','{}','EM_ESPERA' from caixas c where c.operador_id='$OP' and c.status='ABERTO' limit 1 returning id")
( MSYS_NO_PATHCONV=1 $DB -tA <<SQL > /c/Users/aoliv/AppData/Local/Temp/claude/pdv/close_a.txt 2>&1
begin;
$(sess $OP)
select public.descartar_venda_em_espera('$ESP4'::uuid, 'Descarte concorrente com fechamento');
select pg_sleep(3);
commit;
SQL
) &
sleep 0.5
( MSYS_NO_PATHCONV=1 $DB -tA <<SQL > /c/Users/aoliv/AppData/Local/Temp/claude/pdv/close_b.txt 2>&1
begin;
$(sess $OP)
select * from internal.fechar_caixa_atomico('$OP'::uuid, 100, 'fechamento concorrente de teste');
commit;
SQL
) &
wait
echo "-- descarte (A):"; grep -v "^$" /c/Users/aoliv/AppData/Local/Temp/claude/pdv/close_a.txt | tail -2
echo "-- fechamento (B):"; grep -v "^$" /c/Users/aoliv/AppData/Local/Temp/claude/pdv/close_b.txt | tail -3
MSYS_NO_PATHCONV=1 $DB -tA -c "select status from caixas where operador_id='$OP' order by data_abertura desc limit 1"
