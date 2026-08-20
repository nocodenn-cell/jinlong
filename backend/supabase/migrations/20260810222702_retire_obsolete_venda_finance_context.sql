-- Retira o espelho financeiro passivo venda_finance_context.
--
-- A migration histórica 252 permanece imutável e pode criar estes objetos em
-- um replay greenfield. Produção não os possui e nenhum consumidor runtime foi
-- encontrado. Esta tombstone faz os dois estados convergirem para o schema
-- canônico atual: autoridades financeiras continuam em vendas_pagamentos,
-- contas_receber e caixa.
--
-- Ordem deliberada: triggers -> trigger functions -> função de sincronização
-- -> tabela. Não usar CASCADE: qualquer dependência externa inesperada deve
-- interromper a migration para revisão, em vez de ser removida silenciosamente.

DROP TRIGGER IF EXISTS trg_finance_context_pagamento
  ON public.vendas_pagamentos;

DROP TRIGGER IF EXISTS trg_finance_context_conta
  ON public.contas_receber;

DROP FUNCTION IF EXISTS public.trg_finance_context_via_pagamento();
DROP FUNCTION IF EXISTS public.trg_finance_context_via_conta();
DROP FUNCTION IF EXISTS public.sincronizar_finance_context_venda(uuid);

-- Policies, índices e constraints pertencentes à tabela são removidos pelo
-- DROP TABLE normal. Dependências externas não são removidas implicitamente.
DROP TABLE IF EXISTS public.venda_finance_context;
