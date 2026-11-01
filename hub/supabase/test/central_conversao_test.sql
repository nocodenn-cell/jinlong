-- Central de Conversão (GROWTH-001). Roda depois de rls_test.sql + erp_stub.sql + migration 20261101120000.
-- a = admin do hub, b = autenticado comum, d1/d2 = donos de testes grátis. Cada bloco falha (raise) se a regra não valer.

-- backfill: 1 lead por teste grátis (empresa paga sem trial fica de fora)
do $$ declare n int; begin
  select count(*) into n from public.commercial_leads where origem = 'teste_gratis';
  if n <> 2 then raise exception 'FALHA: backfill criou % leads de teste', n; end if;
  if exists (select 1 from public.commercial_leads where empresa_id = 'e0000000-0000-0000-0000-0000000000a3') then
    raise exception 'FALHA: empresa sem trial virou lead';
  end if;
  if (select channel || '|' || locale || '|' || email from public.commercial_leads where empresa_id = 'e0000000-0000-0000-0000-0000000000a1')
     <> 'email|zh-CN|dono1@exemplo.test' then raise exception 'FALHA: dados do lead de teste'; end if;
end $$;

-- anon: nada das RPCs nem colunas novas
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform public.commercial_trials_listar(null); raise exception 'FALHA: anon listou testes';
  exception when insufficient_privilege then null; end;
  begin perform public.commercial_trial_garantir_lead('e0000000-0000-0000-0000-0000000000a1', null); raise exception 'FALHA: anon criou lead';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.commercial_leads (protocol, product, name, store, contact, channel, locale, empresa_id)
    values ('JL-261023-ABCDEF', 'jinlong', 'X', 'Loja', '11912345678', 'whatsapp', 'pt-BR', 'e0000000-0000-0000-0000-0000000000a1');
    raise exception 'FALHA: anon ligou lead a empresa';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- autenticado comum (inclusive dono de trial): não lista, não converte, não lê planos do hub
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin perform public.commercial_trials_listar(null); raise exception 'FALHA: não-admin listou testes';
  exception when insufficient_privilege then null; end;
  begin perform public.commercial_planos(); raise exception 'FALHA: não-admin leu planos do hub';
  exception when insufficient_privilege then null; end;
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'BASICO', '{}', 1, 1, 'PIX', null, 'tentativa');
    raise exception 'FALHA: não-admin converteu';
  exception when insufficient_privilege then null; end;
  begin perform public.commercial_trial_garantir_lead('e0000000-0000-0000-0000-0000000000a1', '11999999999');
    raise exception 'FALHA: não-admin garantiu lead';
  exception when insufficient_privilege then null; end;
  begin perform 1 from saas.assinaturas; raise exception 'FALHA: autenticado leu saas';
  exception when insufficient_privilege then null; end;
  -- não é DONO de nenhuma empresa: não pede contratação
  begin perform public.commercial_solicitar_contratacao('BASICO', null); raise exception 'FALHA: não-dono solicitou';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
do $$ begin
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'BASICO', '{}', 1, 1, 'PIX', 0, 'eu mesmo');
    raise exception 'FALHA: dono se converteu sozinho';
  exception when insufficient_privilege then null; end;
  -- DONO pede contratação: vira evento na Central (repetido em 10 min não duplica) e não muda assinatura
  if not public.commercial_solicitar_contratacao('REDE', 'Quero 2 lojas') then raise exception 'FALHA: solicitar'; end if;
  perform public.commercial_solicitar_contratacao('REDE', 'de novo');
  begin perform public.commercial_solicitar_contratacao('XPTO', null); raise exception 'FALHA: plano inválido aceito';
  exception when raise_exception then null; end;
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.commercial_lead_events ev join public.commercial_leads l on l.id = ev.lead_id
   where l.empresa_id = 'e0000000-0000-0000-0000-0000000000a1' and ev.kind = 'solicitacao';
  if n <> 1 then raise exception 'FALHA: % solicitações (esperado 1)', n; end if;
  if (select status from saas.assinaturas where empresa_id = 'e0000000-0000-0000-0000-0000000000a1') <> 'TRIAL' then
    raise exception 'FALHA: solicitação alterou assinatura';
  end if;
  if (select interesse from public.commercial_leads where empresa_id = 'e0000000-0000-0000-0000-0000000000a1') <> 'alto' then
    raise exception 'FALHA: interesse não marcado';
  end if;
end $$;

-- service_role (cadastro do /teste-gratis): grava telefone no lead
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select public.commercial_trial_garantir_lead('e0000000-0000-0000-0000-0000000000a1', '11 98888-7777');
select set_config('request.jwt.claim.role', '', false);
reset role;
do $$ begin
  if (select contact || '|' || channel from public.commercial_leads where empresa_id = 'e0000000-0000-0000-0000-0000000000a1')
     <> '11 98888-7777|whatsapp' then raise exception 'FALHA: telefone do cadastro'; end if;
end $$;

-- admin: lista com atividade agregada, edita interesse, converte com regras de plano
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare j jsonb; t1 jsonb; r jsonb; n int; begin
  j := public.commercial_trials_listar(null);
  if jsonb_array_length(j) <> 2 then raise exception 'FALHA: lista com % testes', jsonb_array_length(j); end if;
  select x into t1 from jsonb_array_elements(j) x where x->>'empresa_id' = 'e0000000-0000-0000-0000-0000000000a1';
  if (t1->'atividade'->>'produtos_proprios')::int <> 2 then raise exception 'FALHA: produtos próprios %', t1->'atividade'; end if;
  if (t1->'atividade'->>'vendas_total')::int <> 2 or (t1->'atividade'->>'vendas_7d')::int <> 1 then raise exception 'FALHA: vendas %', t1->'atividade'; end if;
  if t1->'atividade'->>'ultimo_acesso' is null or t1->>'solicitou_contratacao_em' is null then raise exception 'FALHA: acesso/solicitação'; end if;
  if t1->'lead'->>'id' is null then raise exception 'FALHA: lead ausente'; end if;
  if jsonb_array_length(public.commercial_trials_listar('e0000000-0000-0000-0000-0000000000a2')) <> 1 then raise exception 'FALHA: filtro por empresa'; end if;
  if jsonb_array_length(public.commercial_planos()) <> 4 then raise exception 'FALHA: planos'; end if;

  update public.commercial_leads set interesse = 'medio', proximo_contato = current_date + 2 where empresa_id = 'e0000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: admin não editou interesse'; end if;
  begin update public.commercial_leads set empresa_id = null where empresa_id = 'e0000000-0000-0000-0000-0000000000a2';
    raise exception 'FALHA: admin trocou empresa do lead pela API';
  exception when insufficient_privilege then null; end;

  -- regras de plano: BASICO comporta só 1 loja; justificativa obrigatória; empresa sem trial não converte
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'BASICO', '{}', 2, 2, 'PIX', null, 'acordado por telefone');
    raise exception 'FALHA: limite de lojas ignorado';
  exception when raise_exception then if sqlerrm <> 'PLANO_LIMITE_LOJAS' then raise; end if; end;
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'BASICO', '{}', 1, 1, 'PIX', null, '');
    raise exception 'FALHA: conversão sem justificativa';
  exception when raise_exception then if sqlerrm <> 'COMMERCIAL_OBSERVACAO_OBRIGATORIA' then raise; end if; end;
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a3', 'BASICO', '{}', 1, 1, 'PIX', null, 'empresa paga');
    raise exception 'FALHA: converteu empresa sem trial';
  exception when raise_exception then if sqlerrm <> 'COMMERCIAL_NAO_E_TESTE' then raise; end if; end;
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'BASICO', '{XPTO}', 1, 1, 'PIX', null, 'addon errado');
    raise exception 'FALHA: addon inválido';
  exception when raise_exception then if sqlerrm <> 'COBRANCA_ADDON_INVALIDO' then raise; end if; end;

  -- valor de tabela: REDE 2 lojas, 3 caixas, + FISCAL = 2×24900 + 1×3900 + 2×5900 = 65500
  r := public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'REDE', '{FISCAL}', 2, 3, 'PIX', null, 'Aprovado em reunião 23/10');
  if (r->>'valor_tabela_centavos')::int <> 65500 or (r->>'valor_mensal_centavos')::int <> 65500 then raise exception 'FALHA: valor %', r; end if;
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a1', 'REDE', '{}', 1, 1, 'PIX', null, 'de novo');
    raise exception 'FALHA: converteu duas vezes';
  exception when raise_exception then if sqlerrm <> 'COMMERCIAL_JA_CLIENTE' then raise; end if; end;

  -- trial expirado/suspenso: valor negociado + reativa as vendas
  r := public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a2', 'ATACADO', '{}', 1, 1, 'UNDEFINED', 15000, 'Desconto de lançamento aprovado');
  if (r->>'valor_mensal_centavos')::int <> 15000 or (r->>'valor_tabela_centavos')::int <> 17900 then raise exception 'FALHA: negociado %', r; end if;
end $$;
reset role;

do $$ declare a saas.assinaturas; n int; begin
  select * into a from saas.assinaturas where empresa_id = 'e0000000-0000-0000-0000-0000000000a1';
  if a.status <> 'ATIVA' or a.motivo_status <> 'CONVERSAO_MANUAL' or a.plano_codigo <> 'REDE' or a.qtd_lojas <> 2
     or a.asaas_subscription_id is not null then raise exception 'FALHA: assinatura convertida %', to_jsonb(a); end if;
  if (select plano from public.empresas where id = 'e0000000-0000-0000-0000-0000000000a1') <> 'REDE' then raise exception 'FALHA: empresas.plano'; end if;
  select * into a from saas.assinaturas where empresa_id = 'e0000000-0000-0000-0000-0000000000a2';
  if a.status <> 'ATIVA' or a.suspensao_aplicada then raise exception 'FALHA: suspensão do trial não desfeita'; end if;
  if (select valor from public.configuracoes_gerais where empresa_id = 'e0000000-0000-0000-0000-0000000000a2' and chave = 'vendas_suspensas') <> 'false' then
    raise exception 'FALHA: vendas continuam suspensas';
  end if;
  -- auditoria com ator e origem
  -- (a reativação do trial suspenso também é auditada: 1 empresa pode ter 2 linhas)
  select count(distinct empresa_id) into n from saas.assinatura_auditoria
   where origem = 'hub_conversao_manual' and ator = '00000000-0000-0000-0000-00000000000a' and depois->>'status' = 'ATIVA';
  if n <> 2 then raise exception 'FALHA: auditoria (% empresas)', n; end if;
  -- funil comercial: contratado + evento de conversão + loja contratada
  select count(*) into n from public.commercial_leads where origem = 'teste_gratis' and status = 'contratado';
  if n <> 2 then raise exception 'FALHA: leads contratados %', n; end if;
  select count(*) into n from public.commercial_lead_events where kind = 'conversao' and author = '00000000-0000-0000-0000-00000000000a';
  if n <> 2 then raise exception 'FALHA: eventos de conversão %', n; end if;
  if (select monthly_value from public.commercial_customers c join public.commercial_leads l on l.id = c.lead_id
       where l.empresa_id = 'e0000000-0000-0000-0000-0000000000a2') <> 150.00 then raise exception 'FALHA: cliente contratado'; end if;
end $$;

-- assinatura já criada no Asaas pelo cliente não é convertida à mão (evita cobrança dupla)
insert into public.empresas (id, nome) values ('e0000000-0000-0000-0000-0000000000a4', 'Loja Asaas');
insert into saas.assinaturas (empresa_id, plano_codigo, status, trial_fim, asaas_subscription_id)
values ('e0000000-0000-0000-0000-0000000000a4', 'BASICO', 'TRIAL', now() + interval '5 days', 'sub_ficticio');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin perform public.commercial_converter_trial('e0000000-0000-0000-0000-0000000000a4', 'BASICO', '{}', 1, 1, 'PIX', null, 'tentar');
    raise exception 'FALHA: converteu com cobrança Asaas';
  exception when raise_exception then if sqlerrm <> 'COMMERCIAL_TEM_COBRANCA_ASAAS' then raise; end if; end;
  -- trial sem lead (cadastro falhou ao criar o lead): aparece na lista e o admin cria o lead
  if (select x->'lead' from jsonb_array_elements(public.commercial_trials_listar('e0000000-0000-0000-0000-0000000000a4')) x) <> 'null'::jsonb then
    raise exception 'FALHA: lead inesperado';
  end if;
  if public.commercial_trial_garantir_lead('e0000000-0000-0000-0000-0000000000a4', null) is null then raise exception 'FALHA: garantir lead'; end if;
end $$;
reset role;
