-- Índices para as FKs de autoria.
--
-- REVISÃO DA DECISÃO ANTERIOR: a migration de autoria documentou "sem índice
-- por ora" com base no volume atual (133 produtos) e na ausência de consulta
-- por autor. O argumento cobre o caminho de LEITURA, mas não o de exclusão: um
-- `ON DELETE SET NULL` em auth.users faz o Postgres varrer a tabela
-- referenciante para achar as linhas a limpar, e sem índice isso é seq scan com
-- lock — o custo cresce com a tabela e a operação é justamente a que não se
-- quer travando (LGPD / direito ao esquecimento). O advisor de performance
-- também sinaliza as três FKs (`unindexed_foreign_keys`).
--
-- Como o custo de manter três índices numa tabela pequena é desprezível e o
-- benefício aparece exatamente no cenário que não se pode ensaiar em produção,
-- a decisão foi revista: indexar agora.
--
-- Índices parciais (`WHERE ... IS NOT NULL`): a maioria esmagadora das linhas
-- tem autoria NULL (produtos anteriores à migration, histórico antigo), e essas
-- linhas não interessam nem ao cascade nem a consulta por autor. O índice
-- parcial cobre o mesmo caso de uso ocupando uma fração do espaço.
--
-- CONCURRENTLY não é usado aqui de propósito: `CREATE INDEX CONCURRENTLY` não
-- pode rodar dentro de bloco transacional, e a CLI do Supabase aplica cada
-- migration em uma transação. Nas dimensões atuais (centenas de linhas) o lock
-- é de milissegundos. Se estas tabelas chegarem à casa dos milhões, criar
-- índice futuro fora do fluxo de migration.

CREATE INDEX IF NOT EXISTS idx_produtos_criado_por
  ON public.produtos (criado_por)
  WHERE criado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_atualizado_por
  ON public.produtos (atualizado_por)
  WHERE atualizado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historico_precos_produto_alterado_por
  ON public.historico_precos_produto (alterado_por)
  WHERE alterado_por IS NOT NULL;
