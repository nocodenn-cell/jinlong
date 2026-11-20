-- CRM-001 · prova de regras, RLS, isolamento entre usuários e auditoria (banco descartável).
-- Atores: a = gestor (admin existente), b = autenticado sem papel, c e d = vendedores.
-- Cada verificação falha (raise) se a regra não valer.
\set ON_ERROR_STOP on

create or replace function public.t_erro(p_sql text, p_esperado text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like '%' || p_esperado || '%' and sqlstate <> p_esperado then
      raise exception 'FALHA: esperado % em [%], veio % (%)', p_esperado, p_sql, sqlerrm, sqlstate;
    end if;
    return;
  end;
  raise exception 'FALHA: esperado erro % em [%], mas passou', p_esperado, p_sql;
end $$;
grant execute on function public.t_erro(text, text) to anon, authenticated;

create or replace function public.t_como(p_user text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user, false)
$$;
grant execute on function public.t_como(text) to anon, authenticated;

update auth.users set email = 'gestor@exemplo.test' where id = '00000000-0000-0000-0000-00000000000a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000c', 'vendedor.c@exemplo.test'),
  ('00000000-0000-0000-0000-00000000000d', 'vendedor.d@exemplo.test') on conflict do nothing;

-- dados de partida (antes da migration já existem leads do rls_test e da Central)
create temp table t_antes as select id, status from public.commercial_leads;
grant select on t_antes to authenticated;

-- ── 1. Papel: admin existente vira gestor ───────────────────────────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if not public.is_commercial_admin() or public.commercial_meu_papel() <> 'gestor' then raise exception 'FALHA: admin existente não virou gestor'; end if;
end $$;
select public.commercial_equipe_salvar('vendedor.c@exemplo.test', 'Vendedor C', 'vendedor', true);
select public.commercial_equipe_salvar('VENDEDOR.D@exemplo.test', 'Vendedor D', 'vendedor', true);
select public.t_erro($$select public.commercial_equipe_salvar('ninguem@exemplo.test', 'X', 'vendedor', true)$$, 'COMMERCIAL_USUARIO_NAO_ENCONTRADO');
select public.t_erro($$select public.commercial_equipe_salvar('gestor@exemplo.test', 'Gestor', 'vendedor', true)$$, 'COMMERCIAL_ULTIMO_GESTOR');
select public.t_erro($$select public.commercial_equipe_salvar('gestor@exemplo.test', 'Gestor', 'gestor', false)$$, 'COMMERCIAL_ULTIMO_GESTOR');
do $$ declare n int; begin
  -- leads existentes preservados, mesmo status
  select count(*) into n from public.commercial_leads l join t_antes t using (id) where l.status = t.status;
  if n <> (select count(*) from t_antes) or n = 0 then raise exception 'FALHA: leads existentes alterados'; end if;
end $$;
reset role;

select public.t_como('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select public.t_erro($$select public.commercial_equipe_salvar('vendedor.d@exemplo.test', 'D', 'gestor', true)$$, 'COMMERCIAL_ACESSO_NEGADO');
do $$ begin
  if public.is_commercial_admin() or not public.is_commercial_member() or public.commercial_meu_papel() <> 'vendedor' then
    raise exception 'FALHA: papel do vendedor';
  end if;
end $$;
reset role;

-- ── 2. Leads de teste (cadastro manual) e duplicidade ────────────────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000a');
create temp table t_ids (k text primary key, id uuid);
grant select, insert on t_ids to authenticated;
insert into t_ids values
  ('L1', public.commercial_lead_criar('jinlong', 'Fictício Um', 'Loja Um', '11 98888-0001', 'whatsapp', 'prospeccao')),
  ('L2', public.commercial_lead_criar('jinlong', 'Fictício Dois', 'Loja Dois', '11 98888-0002', 'whatsapp', 'indicacao')),
  ('L3', public.commercial_lead_criar('venddi', 'Fictício Três', 'Loja Três', '11 98888-0003', 'whatsapp', 'evento'));
select public.t_erro($$select public.commercial_lead_criar('jinlong', 'Outro', 'Outra', '(11) 98888-0001', 'whatsapp', 'outro')$$, 'COMMERCIAL_LEAD_DUPLICADO');
select public.t_erro($$select public.commercial_lead_criar('jinlong', 'Outro', 'Outra', '11 97777-0000', 'whatsapp', 'site')$$, 'COMMERCIAL_ORIGEM_INVALIDA');
select public.t_erro($$select public.commercial_lead_criar('jinlong', 'X', 'Outra', '11 97777-0000', 'whatsapp', 'outro')$$, 'COMMERCIAL_CAMPO_INVALIDO');
insert into t_ids values ('L4', public.commercial_lead_criar('jinlong', 'Fictício Quatro', 'Loja Quatro', '11 98888-0001', 'whatsapp', 'outro', p_forcar => true));
do $$ begin
  if (select protocol from public.commercial_leads where id = (select id from t_ids where k = 'L3')) !~ '^VD-' then raise exception 'FALHA: protocolo venddi'; end if;
end $$;
-- distribuição: L1 sem responsável, L2 → c, L3 → d, L4 → c
select public.commercial_lead_atribuir((select id from t_ids where k = 'L1'), null);
select public.commercial_lead_atribuir((select id from t_ids where k = 'L2'), '00000000-0000-0000-0000-00000000000c');
select public.commercial_lead_atribuir((select id from t_ids where k = 'L3'), '00000000-0000-0000-0000-00000000000d');
select public.commercial_lead_atribuir((select id from t_ids where k = 'L4'), '00000000-0000-0000-0000-00000000000c');
select public.t_erro($$select public.commercial_lead_atribuir((select id from t_ids where k = 'L1'), '00000000-0000-0000-0000-00000000000b')$$, 'COMMERCIAL_RESPONSAVEL_INVALIDO');
reset role;

-- ── 3. Isolamento: vendedor só vê os seus e os sem responsável ────────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000c');
do $$ declare n int; begin
  select count(*) into n from public.commercial_leads where id in (select id from t_ids);
  if n <> 3 then raise exception 'FALHA: vendedor C viu % leads de teste (esperado 3: L1, L2, L4)', n; end if;
  if exists (select 1 from public.commercial_leads where id = (select id from t_ids where k = 'L3')) then raise exception 'FALHA: C viu lead de D'; end if;
  if exists (select 1 from public.commercial_leads where owner_id is distinct from auth.uid() and owner_id is not null) then raise exception 'FALHA: C viu lead de outro dono'; end if;
  select count(*) into n from public.commercial_customers; if n <> 0 then raise exception 'FALHA: vendedor viu clientes'; end if;
  select count(*) into n from public.commercial_audit; if n <> 0 then raise exception 'FALHA: vendedor leu auditoria'; end if;
  select count(*) into n from public.commercial_lead_events where lead_id = (select id from t_ids where k = 'L3');
  if n <> 0 then raise exception 'FALHA: C viu histórico de lead de D'; end if;
end $$;
-- C não mexe em lead de D (nem descobre que existe)
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L3'), 'qualificacao')$$, 'COMMERCIAL_LEAD_NAO_ENCONTRADO');
select public.t_erro($$select public.commercial_lead_atribuir((select id from t_ids where k = 'L3'), auth.uid())$$, 'COMMERCIAL_LEAD_NAO_ENCONTRADO');
select public.t_erro($$insert into public.commercial_lead_events (lead_id, kind, body) values ((select id from t_ids where k = 'L3'), 'nota', 'invasão')$$, 'row-level security');
-- C não forja eventos de sistema nem autor
select public.t_erro($$insert into public.commercial_lead_events (lead_id, kind, body) values ((select id from t_ids where k = 'L2'), 'conversao', 'falso')$$, 'row-level security');
select public.t_erro($$insert into public.commercial_lead_events (lead_id, kind, body, author) values ((select id from t_ids where k = 'L2'), 'nota', 'x', '00000000-0000-0000-0000-00000000000a')$$, 'row-level security');
-- escrita direta de etapa/responsável é proibida (só RPC)
select public.t_erro($$update public.commercial_leads set status = 'perdido' where id = (select id from t_ids where k = 'L2')$$, '42501');
select public.t_erro($$update public.commercial_leads set owner_id = auth.uid()$$, '42501');
-- C não reatribui lead sem dono para outra pessoa, mas pode "puxar" para si
select public.t_erro($$select public.commercial_lead_atribuir((select id from t_ids where k = 'L1'), '00000000-0000-0000-0000-00000000000d')$$, 'COMMERCIAL_ACESSO_NEGADO');
select public.commercial_lead_atribuir((select id from t_ids where k = 'L1'), auth.uid());
select public.t_erro($$select public.commercial_lead_atribuir((select id from t_ids where k = 'L1'), null)$$, 'COMMERCIAL_ACESSO_NEGADO');
reset role;

set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if exists (select 1 from public.commercial_leads where id = (select id from t_ids where k = 'L1')) then raise exception 'FALHA: D ainda vê L1 após C puxar'; end if;
  if not exists (select 1 from public.commercial_leads where id = (select id from t_ids where k = 'L3')) then raise exception 'FALHA: D não vê o próprio lead'; end if;
end $$;
reset role;

set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  select count(*) into n from public.commercial_leads; if n <> 0 then raise exception 'FALHA: não-membro viu leads'; end if;
  select count(*) into n from public.commercial_stages; if n <> 0 then raise exception 'FALHA: não-membro viu etapas'; end if;
  select count(*) into n from public.commercial_activities; if n <> 0 then raise exception 'FALHA: não-membro viu atividades'; end if;
  select count(*) into n from public.commercial_proposals; if n <> 0 then raise exception 'FALHA: não-membro viu propostas'; end if;
end $$;
select public.t_erro($$select public.commercial_lead_criar('jinlong', 'Intruso', 'Loja X', '11 96666-0000', 'whatsapp', 'outro')$$, 'COMMERCIAL_ACESSO_NEGADO');
select public.t_erro($$select public.commercial_equipe_listar()$$, 'COMMERCIAL_ACESSO_NEGADO');
reset role;

-- anon: nada nas tabelas novas nem nas RPCs
set role anon;
select public.t_erro($$select 1 from public.commercial_activities$$, '42501');
select public.t_erro($$select 1 from public.commercial_proposals$$, '42501');
select public.t_erro($$select 1 from public.commercial_audit$$, '42501');
select public.t_erro($$select 1 from public.commercial_stages$$, '42501');
select public.t_erro($$select public.commercial_lead_mover(gen_random_uuid(), 'perdido', 'x')$$, '42501');
select public.t_erro($$select public.commercial_lead_criar('jinlong', 'A', 'B', 'C', 'whatsapp', 'outro')$$, '42501');
reset role;

-- ── 4. Pipeline: transições válidas/ inválidas e motivo de perda ─────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000c');
select public.commercial_lead_mover((select id from t_ids where k = 'L2'), 'qualificacao');
do $$ begin
  if (select primeiro_atendimento_em from public.commercial_leads where id = (select id from t_ids where k = 'L2')) is null then
    raise exception 'FALHA: primeiro atendimento não registrado ao sair de Novo';
  end if;
end $$;
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L2'), 'contratado')$$, 'COMMERCIAL_USE_CONVERSAO');
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L2'), 'inexistente')$$, 'COMMERCIAL_ETAPA_INVALIDA');
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L4'), 'perdido')$$, 'COMMERCIAL_MOTIVO_PERDA_OBRIGATORIO');
select public.commercial_lead_mover((select id from t_ids where k = 'L4'), 'perdido', 'Sem orçamento este ano');
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L4'), 'qualificacao')$$, 'COMMERCIAL_MOTIVO_REABERTURA_OBRIGATORIO');
select public.commercial_lead_mover((select id from t_ids where k = 'L4'), 'qualificacao', 'Voltou a ter interesse');
select public.commercial_lead_mover((select id from t_ids where k = 'L4'), 'perdido', 'Fechou com concorrente');
do $$ declare n int; begin
  if (select motivo_perda from public.commercial_leads where id = (select id from t_ids where k = 'L4')) <> 'Fechou com concorrente' then raise exception 'FALHA: motivo de perda'; end if;
  select count(*) into n from public.commercial_lead_events where lead_id = (select id from t_ids where k = 'L4') and kind = 'status' and author = auth.uid();
  if n <> 3 then raise exception 'FALHA: movimentações registradas % (esperado 3)', n; end if;
end $$;
-- contato registrado alimenta último contato
insert into public.commercial_lead_events (lead_id, kind, body) values ((select id from t_ids where k = 'L2'), 'contato', 'Ligação de apresentação');
do $$ begin
  if (select ultimo_contato_em from public.commercial_leads where id = (select id from t_ids where k = 'L2')) is null then raise exception 'FALHA: último contato'; end if;
end $$;

-- ── 5. Edição de dados ──────────────────────────────────────────────────────
select public.commercial_lead_atualizar((select id from t_ids where k = 'L2'),
  '{"email":"ficticio.dois@exemplo.test","uf":"SP","city":"São Paulo","funcionarios":12,"unidades":2,"observacoes":"Quer integrar 2 lojas"}');
select public.t_erro($$select public.commercial_lead_atualizar((select id from t_ids where k = 'L2'), '{"status":"contratado"}')$$, 'COMMERCIAL_CAMPO_INVALIDO');
select public.t_erro($$select public.commercial_lead_atualizar((select id from t_ids where k = 'L2'), '{"owner_id":null}')$$, 'COMMERCIAL_CAMPO_INVALIDO');
select public.t_erro($$select public.commercial_lead_atualizar((select id from t_ids where k = 'L2'), '{"uf":"sao paulo"}')$$, 'COMMERCIAL_CAMPO_INVALIDO');
select public.t_erro($$select public.commercial_lead_atualizar((select id from t_ids where k = 'L2'), '{"funcionarios":"muitos"}')$$, 'COMMERCIAL_CAMPO_INVALIDO');
select public.t_erro($$select public.commercial_lead_atualizar((select id from t_ids where k = 'L2'), '{"name":null}')$$, 'COMMERCIAL_CAMPO_OBRIGATORIO');
do $$ begin
  if not exists (select 1 from public.commercial_lead_events where lead_id = (select id from t_ids where k = 'L2') and kind = 'edicao'
                  and body like 'Campos alterados:%' and body not like '%Quer integrar%' and body not like '%exemplo.test%') then
    raise exception 'FALHA: histórico de edição (sem valores pessoais)';
  end if;
end $$;

-- ── 6. Agenda ───────────────────────────────────────────────────────────────
insert into t_ids values ('A1', public.commercial_atividade_agendar((select id from t_ids where k = 'L2'), 'demonstracao', 'Demonstração online', now() + interval '2 days'));
select public.t_erro($$select public.commercial_atividade_agendar((select id from t_ids where k = 'L2'), 'ligacao', 'Ligar', now() + interval '1 day', '00000000-0000-0000-0000-00000000000d')$$, 'COMMERCIAL_ACESSO_NEGADO');
select public.t_erro($$select public.commercial_atividade_agendar((select id from t_ids where k = 'L2'), 'festa', 'X', now() + interval '1 day')$$, 'COMMERCIAL_CAMPO_INVALIDO');
select public.t_erro($$select public.commercial_atividade_agendar((select id from t_ids where k = 'L2'), 'ligacao', 'Ligar', now() + interval '2 years')$$, 'COMMERCIAL_DATA_INVALIDA');
select public.t_erro($$select public.commercial_atividade_agendar((select id from t_ids where k = 'L4'), 'ligacao', 'Ligar', now() + interval '1 day')$$, 'COMMERCIAL_LEAD_ENCERRADO');
select public.t_erro($$select public.commercial_atividade_concluir((select id from t_ids where k = 'A1'), '')$$, 'COMMERCIAL_RESULTADO_OBRIGATORIO');
select public.commercial_atividade_concluir((select id from t_ids where k = 'A1'), 'Demonstração feita, pediu proposta');
select public.t_erro($$select public.commercial_atividade_concluir((select id from t_ids where k = 'A1'), 'de novo')$$, 'COMMERCIAL_ATIVIDADE_ENCERRADA');
do $$ begin
  if not exists (select 1 from public.commercial_lead_events where lead_id = (select id from t_ids where k = 'L2') and kind = 'contato' and body like 'Concluída (demonstracao)%') then
    raise exception 'FALHA: atividade concluída não virou contato';
  end if;
end $$;
reset role;
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if exists (select 1 from public.commercial_activities where id = (select id from t_ids where k = 'A1')) then raise exception 'FALHA: D viu atividade de lead de C'; end if;
end $$;
select public.t_erro($$select public.commercial_atividade_concluir((select id from t_ids where k = 'A1'), 'x x')$$, 'COMMERCIAL_ATIVIDADE_NAO_ENCONTRADA');
reset role;

-- ── 7. Propostas (preço só de saas.planos) ──────────────────────────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000c');
insert into t_ids values ('P1', public.commercial_proposta_criar((select id from t_ids where k = 'L2'), 'BASICO', '{}', 1, 1, null, 'Pagamento mensal', current_date + 15));
do $$ declare p public.commercial_proposals; begin
  select * into p from public.commercial_proposals where id = (select id from t_ids where k = 'P1');
  if p.valor_tabela_centavos <> 9900 or p.valor_mensal_centavos <> 9900 or not p.preco_tabela_provisorio or p.status <> 'rascunho' or p.versao <> 1 then
    raise exception 'FALHA: proposta com valor de tabela (%, %, %)', p.valor_tabela_centavos, p.valor_mensal_centavos, p.preco_tabela_provisorio;
  end if;
end $$;
select public.t_erro($$select public.commercial_proposta_criar((select id from t_ids where k = 'L2'), null, '{}', null, null, null, null, current_date + 10)$$, 'COMMERCIAL_VALOR_OBRIGATORIO');
select public.t_erro($$select public.commercial_proposta_criar((select id from t_ids where k = 'L2'), 'INVENTADO', '{}', 1, 1, null, null, current_date + 10)$$, 'COBRANCA_PLANO_INVALIDO');
select public.t_erro($$select public.commercial_proposta_criar((select id from t_ids where k = 'L2'), null, '{FISCAL}', 1, 1, 100, null, current_date + 10)$$, 'COBRANCA_PLANO_INVALIDO');
select public.t_erro($$select public.commercial_proposta_criar((select id from t_ids where k = 'L2'), 'BASICO', '{}', 1, 1, null, null, current_date - 1)$$, 'COMMERCIAL_VALIDADE_INVALIDA');
select public.t_erro($$select public.commercial_proposta_status((select id from t_ids where k = 'P1'), 'aceita')$$, 'COMMERCIAL_TRANSICAO_PROPOSTA_INVALIDA');
select public.commercial_proposta_status((select id from t_ids where k = 'P1'), 'enviada');
do $$ begin
  if (select status from public.commercial_leads where id = (select id from t_ids where k = 'L2')) <> 'proposta' then raise exception 'FALHA: enviar proposta não moveu o lead'; end if;
end $$;
select public.commercial_proposta_status((select id from t_ids where k = 'P1'), 'em_negociacao', 'Pediu desconto');
do $$ begin
  if (select status from public.commercial_leads where id = (select id from t_ids where k = 'L2')) <> 'negociacao' then raise exception 'FALHA: negociação não moveu o lead'; end if;
end $$;
-- vendedor não converte (toda contratação passa pelo gestor)
select public.t_erro($$select public.commercial_lead_converter((select id from t_ids where k = 'L2'), (select id from t_ids where k = 'P1'), 'Fechado por telefone')$$, 'COMMERCIAL_ACESSO_NEGADO');
reset role;

-- ── 8. Conversão sem duplicidade ────────────────────────────────────────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000a');
select public.t_erro($$select public.commercial_lead_converter((select id from t_ids where k = 'L2'), (select id from t_ids where k = 'P1'), 'ok')$$, 'COMMERCIAL_OBSERVACAO_OBRIGATORIA');
select public.commercial_lead_converter((select id from t_ids where k = 'L2'), (select id from t_ids where k = 'P1'), 'Aceite por e-mail em 20/11');
do $$ declare n int; begin
  select count(*) into n from public.commercial_customers where lead_id = (select id from t_ids where k = 'L2');
  if n <> 1 then raise exception 'FALHA: cliente da conversão (%)', n; end if;
  if (select status from public.commercial_leads where id = (select id from t_ids where k = 'L2')) <> 'contratado' then raise exception 'FALHA: lead não convertido'; end if;
  if (select status from public.commercial_proposals where id = (select id from t_ids where k = 'P1')) <> 'aceita' then raise exception 'FALHA: proposta não aceita'; end if;
  if (select monthly_value from public.commercial_customers where lead_id = (select id from t_ids where k = 'L2')) <> 99.00 then raise exception 'FALHA: valor do cliente'; end if;
end $$;
select public.t_erro($$select public.commercial_lead_converter((select id from t_ids where k = 'L2'), (select id from t_ids where k = 'P1'), 'De novo, duplicando')$$, 'COMMERCIAL_JA_CLIENTE');
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L2'), 'negociacao')$$, 'COMMERCIAL_LEAD_CONVERTIDO');
-- mesmo cliente por outro lead (mesma loja, mesmo produto) → bloqueado
insert into t_ids values ('L5', public.commercial_lead_criar('jinlong', 'Fictício Cinco', 'LOJA DOIS ', '11 95555-0005', 'whatsapp', 'outro'));
insert into t_ids values ('P5', public.commercial_proposta_criar((select id from t_ids where k = 'L5'), null, '{}', null, null, 15000, 'Valor negociado', current_date + 5));
select public.commercial_proposta_status((select id from t_ids where k = 'P5'), 'enviada');
select public.t_erro($$select public.commercial_lead_converter((select id from t_ids where k = 'L5'), (select id from t_ids where k = 'P5'), 'Tentativa duplicada')$$, 'COMMERCIAL_CLIENTE_DUPLICADO');
-- proposta em rascunho não converte
insert into t_ids values ('P6', public.commercial_proposta_criar((select id from t_ids where k = 'L5'), null, '{}', null, null, 12000, null, current_date + 5));
select public.t_erro($$select public.commercial_lead_converter((select id from t_ids where k = 'L5'), (select id from t_ids where k = 'P6'), 'Rascunho não vale')$$, 'COMMERCIAL_PROPOSTA_NAO_CONVERTIVEL');
-- teste grátis converte só pela Central
select public.t_erro($$select public.commercial_lead_converter((select id from public.commercial_leads where origem = 'teste_gratis' and status <> 'contratado' limit 1), gen_random_uuid(), 'Pela via errada')$$, 'COMMERCIAL_USE_CENTRAL');
-- clientes: inserção direta proibida
select public.t_erro($$insert into public.commercial_customers (product, store_name) values ('jinlong', 'Duplicada à mão')$$, '42501');

-- ── 9. Etapas configuráveis ─────────────────────────────────────────────────
select public.commercial_etapa_salvar('qualificacao', 'Qualificar', 20, true);
select public.commercial_etapa_salvar('pos_demo', 'Pós-demonstração', 45, true);
select public.t_erro($$select public.commercial_etapa_salvar('novo', 'Novo', 10, false)$$, 'COMMERCIAL_ETAPA_SISTEMA');
select public.t_erro($$select public.commercial_etapa_salvar('perdido', 'Perdido', 5, true)$$, 'COMMERCIAL_ETAPA_SISTEMA');
select public.t_erro($$select public.commercial_etapa_salvar('outra', 'Outra', 95, true)$$, 'COMMERCIAL_ORDEM_INVALIDA');
select public.commercial_lead_mover((select id from t_ids where k = 'L5'), 'qualificacao');
select public.t_erro($$select public.commercial_etapa_salvar('qualificacao', 'Qualificar', 20, false)$$, 'COMMERCIAL_ETAPA_EM_USO');
select public.commercial_etapa_salvar('pos_demo', 'Pós-demonstração', 45, false);
select public.t_erro($$select public.commercial_lead_mover((select id from t_ids where k = 'L5'), 'pos_demo')$$, 'COMMERCIAL_ETAPA_INVALIDA');
reset role;
select public.t_como('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select public.t_erro($$select public.commercial_etapa_salvar('qualificacao', 'Hack', 20, true)$$, 'COMMERCIAL_ACESSO_NEGADO');
reset role;

-- ── 10. Auditoria: registra ator e campos; nunca valores pessoais ───────────
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000a');
do $$ declare r public.commercial_audit; begin
  select * into r from public.commercial_audit
   where tabela = 'commercial_leads' and registro = (select id::text from t_ids where k = 'L2') and 'email' = any (campos)
   order by id desc limit 1;
  if r.id is null then raise exception 'FALHA: edição não auditada'; end if;
  if r.ator <> '00000000-0000-0000-0000-00000000000c' then raise exception 'FALHA: ator da auditoria'; end if;
  if r.depois ? 'email' or r.depois ? 'observacoes' or r.depois::text like '%exemplo.test%' then raise exception 'FALHA: auditoria guardou dado pessoal'; end if;
  if not (r.depois ? 'uf' and r.depois ? 'funcionarios') then raise exception 'FALHA: auditoria sem valores não pessoais'; end if;
  if not exists (select 1 from public.commercial_audit where tabela = 'commercial_admins' and acao = 'INSERT') then raise exception 'FALHA: equipe não auditada'; end if;
  if not exists (select 1 from public.commercial_audit where tabela = 'commercial_proposals' and 'status' = any (campos)) then raise exception 'FALHA: proposta não auditada'; end if;
end $$;
select public.t_erro($$delete from public.commercial_audit$$, '42501');
select public.t_erro($$update public.commercial_audit set ator = null$$, '42501');
reset role;

drop function public.t_erro(text, text);
drop function public.t_como(text);
select 'CRM OK' as resultado;
