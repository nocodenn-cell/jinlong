-- Auditoria final: alteração de permissões e apresentação, sem reescrever dados.
-- NÃO aplicada em produção nesta missão. Revisar e autorizar o rollout separadamente.
BEGIN;

-- Falhar fechado se houver outra policy permissiva desconhecida: PostgreSQL as
-- combina por OR. Uma policy adicional não pode reabrir a exceção cross-loja.
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('contas_pagar','contas_receber','contas_pagar_pagamentos','liquidacoes_receber')
  AND policyname NOT IN ('contas_pagar_gerente','contas_receber_select_loja',
   'contas_receber_loja_isolado','contas_receber_write_gerente_loja','cpp_gerente',
   'liquidacoes_loja_isolado','liquidacoes_select_loja','liquidacoes_write_gerente_loja')
 ) THEN RAISE EXCEPTION 'Financeiro: revisar policies legadas desconhecidas antes do hardening.'; END IF;
END $$;

DROP POLICY IF EXISTS contas_pagar_gerente ON public.contas_pagar;
DROP POLICY IF EXISTS contas_receber_select_loja ON public.contas_receber;
DROP POLICY IF EXISTS contas_receber_loja_isolado ON public.contas_receber;
DROP POLICY IF EXISTS contas_receber_write_gerente_loja ON public.contas_receber;
DROP POLICY IF EXISTS cpp_gerente ON public.contas_pagar_pagamentos;
DROP POLICY IF EXISTS liquidacoes_loja_isolado ON public.liquidacoes_receber;
DROP POLICY IF EXISTS liquidacoes_select_loja ON public.liquidacoes_receber;
DROP POLICY IF EXISTS liquidacoes_write_gerente_loja ON public.liquidacoes_receber;

REVOKE ALL ON public.contas_pagar,public.contas_receber,public.contas_pagar_pagamentos,public.liquidacoes_receber FROM anon,authenticated;
GRANT SELECT ON public.contas_pagar,public.contas_receber,public.contas_pagar_pagamentos,public.liquidacoes_receber TO authenticated;
-- Adapter ReceivableWriter mantém sua criação manual. Baixas, estornos e
-- cancelamentos continuam exclusivamente nas RPCs SECURITY DEFINER existentes.
GRANT INSERT ON public.contas_receber TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['contas_pagar','contas_receber'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY financeiro_titulos_leitura ON public.%I FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=(SELECT auth.uid()) AND u.ativo AND u.perfil IN (''GERENTE'',''DONO'',''ADMIN'') AND u.loja_id=%I.loja_id))',t,t);
 END LOOP;
END $$;

-- Históricos antigos podem ter loja_id nula; a loja autoritativa é a do título.
ALTER TABLE public.contas_pagar_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidacoes_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY financeiro_titulos_leitura ON public.contas_pagar_pagamentos FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.contas_pagar cp WHERE cp.id=contas_pagar_pagamentos.conta_id));
CREATE POLICY financeiro_titulos_leitura ON public.liquidacoes_receber FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.contas_receber cr WHERE cr.id=liquidacoes_receber.titulo_id));

CREATE POLICY financeiro_ar_criacao ON public.contas_receber FOR INSERT TO authenticated
WITH CHECK (
 valor_total>0 AND valor_total NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
 AND valor_total=round(valor_total,2) AND valor_total=valor_aberto AND status='ABERTO'
 AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=(SELECT auth.uid())
  AND u.ativo AND u.perfil IN ('GERENTE','DONO','ADMIN') AND u.loja_id=contas_receber.loja_id)
 AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=contas_receber.cliente_id AND c.loja_id=contas_receber.loja_id)
);

-- Preservar o corpo instalado (inclusive outras correções aprovadas). A mudança
-- é somente excluir a contrapartida de estorno do resultado, como a original.
DO $$ DECLARE fonte text; anterior text := 'm.origem NOT IN (''SALDO_INICIAL'',''TRANSFERENCIA'',''TRANSFERENCIA_PDV'')'; BEGIN
 SELECT pg_get_functiondef('public.financeiro_painel(date,date,integer)'::regprocedure) INTO fonte;
 IF strpos(fonte,anterior)=0 THEN RAISE EXCEPTION 'Financeiro: definição do painel divergente; revisar antes do rollout.'; END IF;
 EXECUTE replace(fonte,anterior,'m.origem NOT IN (''SALDO_INICIAL'',''TRANSFERENCIA'',''TRANSFERENCIA_PDV'',''ESTORNO_TRANSFERENCIA_PDV'')');
END $$;

COMMIT;
