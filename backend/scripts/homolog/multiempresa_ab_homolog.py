# Gera um bloco DO (A×B + EXPLAIN ANALYZE) para rodar em HOMOLOG via execute_sql.
# Sempre termina em RAISE EXCEPTION ⇒ tudo é desfeito (nada persiste). Uso: python3 multiempresa_ab_homolog.py <n_vendas> > /tmp/ab.sql
# SO4=1 mede só as guardas implantadas. NUNCA rodar em produção.
E1='e0000001-0000-4000-8000-000000000001'; E2='e0000002-0000-4000-8000-0000000000b2'
LA='a0000001-0000-4000-8000-000000000001'; LB='b0000001-0000-4000-8000-0000000000b2'
CXA='d0000001-0000-4000-8000-0000000000a1'; CXB='d0000002-0000-4000-8000-0000000000b2'
U=dict(donoA='10000000-0000-4000-8000-0000000000a1',gerA='10000000-0000-4000-8000-0000000000a2',opA='10000000-0000-4000-8000-0000000000a3',
 donoB='20000000-0000-4000-8000-0000000000b1',gerB='20000000-0000-4000-8000-0000000000b2',opB='20000000-0000-4000-8000-0000000000b3',multi='30000000-0000-4000-8000-0000000000c1')
N=__import__('sys').argv[1] if len(__import__('sys').argv)>1 else '0'
N=int(N)
checks=[]  # (name, uid, hdr, sql scalar text, expected or ERR:pattern)
def c(n,u,sql,exp,h=None): checks.append((n,U[u],h,sql,exp))
c('A vê só clientes A','donoA',"select string_agg(nome,',' order by nome) from clientes where nome like 'HT Cli%'",'HT Cli A')
c('B vê só clientes B','donoB',"select string_agg(nome,',' order by nome) from clientes where nome like 'HT Cli%'",'HT Cli B')
c('B não vê produtos A','donoB',"select count(*)::text from produtos where nome='HT Prod A'",'0')
c('B não vê caixa A','gerB',f"select count(*)::text from caixas where id='{CXA}'",'0')
c('B não vê vendas A','donoB',f"select count(*)::text from vendas where caixa_id='{CXA}'",'0')
c('A vê vendas A','donoA',f"select (count(*)>0)::text from vendas where caixa_id='{CXA}'",'true')
c('B não vê itens_venda A','donoB',f"select count(*)::text from itens_venda iv where iv.venda_id in (select id from vendas v where v.caixa_id='{CXA}') or iv.produto_id in (select id from produtos where nome='HT Prod A')",'0')
c('B não vê pagamentos A','donoB',"select count(*)::text from vendas_pagamentos where valor=11.11",'0')
c('B vê os seus pagamentos','donoB',"select (count(*)>0)::text from vendas_pagamentos where valor=22.22",'true')
c('B não vê itens A (contagem)','donoB',"select count(*)::text from itens_venda where produto_id='ab000001-0000-4000-8000-0000000000a1'",'0')
c('A não insere venda no caixa B','opA',f"insert into vendas(caixa_id,total_bruto,total_liquido,forma_pagamento) values('{CXB}',1,1,'DINHEIRO') returning 'inseriu'",'ERR:')
c('B não altera cliente A','donoB',"with u as (update clientes set nome='hack' where nome='HT Cli A' returning 1) select count(*)::text from u",'0')
c('caixa web cfg A','opA',"select configuracoes_para_caixa_web()->>'desconto_maximo_operador_percentual'",'HTA')
c('caixa web cfg B (padrão)','opB',"select configuracoes_para_caixa_web()->>'desconto_maximo_operador_percentual'",'10.00')
c('B grava config sem tocar A','donoB',"with u as (update configuracoes_gerais set valor='true' where chave='vendas_suspensas' returning empresa_id) select string_agg(empresa_id::text,',') from u",E2)
c('sangria A','opA',"select obter_limite_sangria_sem_gerente()::text",'SANGRIA_A')
c('sangria B','opB',"select obter_limite_sangria_sem_gerente()::numeric::int::text",'999')
c('pricing A','opA',"select obter_pricing_version_ativa()::text",'PRICING_A')
c('pricing B','opB',"select obter_pricing_version_ativa()::text",'c2000000-0000-4000-8000-0000000000b2')
c('relatorio B só a sua','donoB',"select string_agg(empresa_id::text,',') from relatorio_settings",E2)
c('pdv_config B só de B','donoB',f"select (count(*) filter (where empresa_id<>'{E2}'))::text from pdv_config",'0')
c('painel B sem categoria A','donoB',"select (financeiro_painel(current_date-30,current_date,1)::text like '%HT Aluguel A%')::text",'false')
c('comando B recusa categoria A','donoB',"select financeiro_comando('LANCAR_CONTA_PAGAR', jsonb_build_object('categoria_id','f0000001-0000-4000-8000-0000000000a1','valor','10','data','2026-10-19','descricao','t'), gen_random_uuid())::text",'ERR:')
c('caixas desembolso B',"gerB","select string_agg(id::text,',') from listar_caixas_elegiveis_desembolso()",CXB)
c('espera: B não vê de A','opB',"select jsonb_array_length(listar_vendas_em_espera())::text",'0')
c('espera: A vê a sua','opA',"select jsonb_array_length(listar_vendas_em_espera())::text",'1')
c('diagnóstico B não vê produto A','donoB',"select (select x->>'status' from jsonb_array_elements(pdv_diagnostico_pre_producao('7890000009901')->'checks') x where x->>'id'='estoque_produto_existe')",'aviso')
c('diagnóstico A vê produto A','donoA',"select (select x->>'status' from jsonb_array_elements(pdv_diagnostico_pre_producao('7890000009901')->'checks') x where x->>'id'='estoque_produto_existe')",'ok')
c('picker: header E2 com loja ativa A ⇒ nada','multi',"select count(*)::text from clientes where nome like 'HT Cli%'",'0',E2)
c('picker: header E1 ⇒ só A','multi',"select string_agg(nome,',') from clientes where nome like 'HT Cli%'",'HT Cli A',E1)
c('picker: empresa sem vínculo ⇒ nada','multi',"select count(*)::text from clientes where nome like 'HT Cli%'",'0','e0000009-0000-4000-8000-000000000009')
c('header de outra empresa não amplia','opB',"select count(*)::text from clientes where nome like 'HT Cli A'",'0',E1)
c('contexto B via header','multi',"select fp_empresa_contexto(null)::text",E2,E2)

def q(s): return "'"+s.replace("'","''")+"'"
sql=[]
sql.append(f"""DO $ht$
DECLARE r record; res jsonb := '[]'::jsonb; v text; perf jsonb := '[]'::jsonb; p json; t0 timestamptz; i int;
  cfgA text; sangA text; prA text;
BEGIN
  INSERT INTO empresas(id,nome) VALUES ('{E2}','HT Empresa B');
  INSERT INTO lojas(id,nome,empresa_id) VALUES ('{LB}','HT Loja B','{E2}');
  INSERT INTO auth.users(id) SELECT unnest(ARRAY['{"','".join(U.values())}']::uuid[]);
  INSERT INTO usuarios(id,nome,perfil,loja_id) VALUES
   ('{U['donoA']}','HT Dono A','DONO','{LA}'),('{U['gerA']}','HT Ger A','GERENTE','{LA}'),('{U['opA']}','HT Op A','OPERADOR','{LA}'),
   ('{U['donoB']}','HT Dono B','DONO','{LB}'),('{U['gerB']}','HT Ger B','GERENTE','{LB}'),('{U['opB']}','HT Op B','OPERADOR','{LB}'),
   ('{U['multi']}','HT Multi','GERENTE','{LA}');
  INSERT INTO usuario_vinculos(usuario_id,empresa_id,loja_id,papel) VALUES ('{U['multi']}','{E2}','{LB}','GERENTE') ON CONFLICT DO NOTHING;
  INSERT INTO caixas(id,loja_id,status,operador_id) VALUES ('{CXA}','{LA}','ABERTO','{U['opA']}'),('{CXB}','{LB}','ABERTO','{U['opB']}');
  INSERT INTO categorias_financeiras(id,nome,empresa_id) VALUES ('f0000001-0000-4000-8000-0000000000a1','HT Aluguel A','{E1}'),('f0000002-0000-4000-8000-0000000000b2','HT Aluguel B','{E2}');
  INSERT INTO produtos(id,nome,preco_varejo,origem,loja_id,codigo_barras) VALUES
   ('ab000001-0000-4000-8000-0000000000a1','HT Prod A',10,'china_manual','{LA}','7890000009901'),('ab000002-0000-4000-8000-0000000000b2','HT Prod B',20,'china_manual','{LB}','7890000009902');
  INSERT INTO clientes(nome,loja_id) VALUES ('HT Cli A','{LA}'),('HT Cli B','{LB}');
  INSERT INTO vendas_em_espera(loja_id,operador_id,numero_local) VALUES ('{LA}','{U['opA']}',1);
  UPDATE pdv_config SET limite_sangria_sem_gerente=999 WHERE empresa_id='{E2}' AND loja_id IS NULL;
  UPDATE pricing_config_versions SET is_active=false WHERE empresa_id='{E2}';
  INSERT INTO pricing_config_versions(id,label,is_active,empresa_id) VALUES ('c2000000-0000-4000-8000-0000000000b2','HT B v1',true,'{E2}');
  SELECT valor INTO cfgA FROM configuracoes_gerais WHERE empresa_id='{E1}' AND chave='desconto_maximo_operador_percentual';
  sangA := obter_limite_sangria_sem_gerente_ref();
  SELECT id::text INTO prA FROM pricing_config_versions WHERE empresa_id='{E1}' AND is_active;
  -- volume para EXPLAIN: turnos realistas (1 caixa por ~20 vendas)
  CREATE TEMP TABLE ht_cx ON COMMIT DROP AS SELECT gen_random_uuid() id, k FROM generate_series(0, greatest({N}/20,1)-1) k;
  INSERT INTO caixas(id,loja_id,status,operador_id)
    SELECT id, CASE WHEN k%2=0 THEN '{LA}'::uuid ELSE '{LB}'::uuid END, 'ABERTO', NULL::uuid FROM ht_cx;
  INSERT INTO vendas(id,caixa_id,operador_id,total_bruto,total_liquido,forma_pagamento,created_at)
    SELECT gen_random_uuid(), c.id, CASE WHEN c.k%2=0 THEN '{U['opA']}'::uuid ELSE '{U['opB']}'::uuid END, 11.11,11.11,'DINHEIRO', now()-(g%60)*interval '1 day'
      FROM generate_series(1,{N}) g JOIN ht_cx c ON c.k = g % greatest({N}/20,1);
  INSERT INTO vendas(caixa_id,operador_id,total_bruto,total_liquido,forma_pagamento) VALUES ('{CXA}','{U['opA']}',1,1,'DINHEIRO'),('{CXB}','{U['opB']}',1,1,'DINHEIRO');
  INSERT INTO itens_venda(venda_id,produto_id,quantidade,preco_unitario_original,preco_unitario,tipo_preco)
    SELECT v.id, CASE WHEN c.loja_id='{LA}' THEN 'ab000001-0000-4000-8000-0000000000a1'::uuid ELSE 'ab000002-0000-4000-8000-0000000000b2'::uuid END,1,11.11,11.11,'VAREJO'
      FROM vendas v JOIN caixas c ON c.id=v.caixa_id, generate_series(1,2) WHERE c.loja_id IN ('{LA}','{LB}');
  INSERT INTO vendas_pagamentos(venda_id,forma_pagamento,valor)
    SELECT v.id,'DINHEIRO',CASE WHEN c.loja_id='{LA}' THEN 11.11 ELSE 22.22 END FROM vendas v JOIN caixas c ON c.id=v.caixa_id WHERE c.loja_id IN ('{LA}','{LB}');
  ANALYZE vendas; ANALYZE itens_venda; ANALYZE vendas_pagamentos;
""")
for n,uid,h,s,exp in checks:
    hdr = '{"x-fp-empresa":"%s"}'%h if h else '{}'
    sql.append(f"""  BEGIN
    PERFORM set_config('request.jwt.claim.sub','{uid}',true), set_config('request.jwt.claim.role','authenticated',true),
      set_config('request.jwt.claims',json_build_object('sub','{uid}','role','authenticated')::text,true), set_config('request.headers',{q(hdr)},true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE {q(s)} INTO v; EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; v := 'ERR:'||SQLERRM; END;
  res := res || jsonb_build_object('n',{q(n)},'got',v,'exp',replace(replace(replace({q(exp)},'HTA',coalesce(cfgA,'')),'SANGRIA_A',coalesce(sangA,'')),'PRICING_A',coalesce(prA,'')));
""")
perfq=[('vendas 30d agregado',"select count(*), sum(total_liquido) from vendas where created_at > now()-interval '30 days'"),
 ('vendas últimas 50',"select * from vendas order by created_at desc limit 50"),
 ('itens_venda 7d join',"select iv.produto_id, sum(iv.quantidade) from itens_venda iv join vendas v on v.id=iv.venda_id where v.created_at > now()-interval '7 days' group by 1"),
 ('itens_venda count',"select count(*) from itens_venda"),
 ('vendas_pagamentos por forma',"select forma_pagamento, sum(valor) from vendas_pagamentos group by 1")]
variants=[('fase4',''),('hash','ALTER POLICY tenant_guard ON public.vendas USING (caixa_id IN (SELECT fpc.id FROM fp_guarda.caixa fpc WHERE fpc.loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]) OR (fpc.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid)))) OR (caixa_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid))) OR (SELECT public.fp_admin_legado())) WITH CHECK (caixa_id IN (SELECT fpc.id FROM fp_guarda.caixa fpc WHERE fpc.loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]) OR (fpc.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid)))) OR (caixa_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid))) OR (SELECT public.fp_admin_legado())); ALTER POLICY tenant_guard ON public.vendas_pagamentos USING (venda_id IN (SELECT fpv.id FROM fp_guarda.venda fpv WHERE fpv.loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]) OR (fpv.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid)))) OR (SELECT public.fp_admin_legado())) WITH CHECK (venda_id IN (SELECT fpv.id FROM fp_guarda.venda fpv WHERE fpv.loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]) OR (fpv.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid)))) OR (SELECT public.fp_admin_legado())); ALTER POLICY tenant_guard ON public.itens_venda USING (venda_id IN (SELECT fpv.id FROM fp_guarda.venda fpv WHERE fpv.loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]) OR (fpv.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid)))) OR (SELECT public.fp_admin_legado())) WITH CHECK (venda_id IN (SELECT fpv.id FROM fp_guarda.venda fpv WHERE fpv.loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]) OR (fpv.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid)))) OR (SELECT public.fp_admin_legado()));'),('fase2_original',"FOR r IN SELECT * FROM internal.fp_guardas_originais WHERE tabela IN ('vendas','vendas_pagamentos','itens_venda','caixas') LOOP EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s) WITH CHECK (%s)', r.tabela, r.qual, r.with_check); END LOOP;"),('sem_guarda',"DROP POLICY tenant_guard ON vendas; DROP POLICY tenant_guard ON vendas_pagamentos; DROP POLICY tenant_guard ON itens_venda; DROP POLICY tenant_guard ON caixas;")]
for vname,vsql in (variants[:1] if __import__('os').environ.get('SO4') else variants):
  sql.append('  '+vsql+'\n')
  for n,s in perfq:
    for who in (['postgres','donoA'] if vname=='fase4' else ['donoA']):
        pre = "" if who=='postgres' else f"""PERFORM set_config('request.jwt.claim.sub','{U['donoA']}',true), set_config('request.jwt.claims',json_build_object('sub','{U['donoA']}','role','authenticated')::text,true), set_config('request.headers','{{}}',true); EXECUTE 'SET LOCAL ROLE authenticated';"""
        sql.append(f"""  BEGIN {pre}
    EXECUTE {q('explain (analyze, buffers, format json) '+s)} INTO p; EXECUTE 'RESET ROLE';
    perf := perf || jsonb_build_object('q',{q(n)},'como','{who}','ms',(p->0->>'Execution Time')::numeric,'rows',p->0->'Plan'->>'Actual Rows','var','{vname}');
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; perf := perf || jsonb_build_object('q',{q(n)},'como','{who}','err',SQLERRM); END;
""")
sql.append("""  RAISE EXCEPTION 'HTRESULT%', jsonb_build_object('checks',res,'perf',perf)::text;
END $ht$;""")
s=''.join(sql).replace("obter_limite_sangria_sem_gerente_ref()",f"(SELECT limite_sangria_sem_gerente::text FROM pdv_config WHERE id=fp_pdv_config_id('{LA}'))")
print(s)
