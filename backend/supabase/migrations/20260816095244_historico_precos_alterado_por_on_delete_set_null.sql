-- Migration: corrige FK de historico_precos_produto.alterado_por para ON DELETE SET NULL
--
-- ACHADO (sprint de reconciliação de migrations, 2026-08-16): ao validar o
-- fallback "usuário removido" da auditoria de produto (migração
-- produtos_autoria_criado_atualizado_por) em ambiente local isolado, uma
-- exclusão real de auth.users falhou com foreign_key_violation apontando
-- para esta constraint (`historico_precos_produto_alterado_por_fkey`),
-- criada em 20260709184734_259_historico_precos_produto.sql sem ON DELETE
-- SET NULL. Efeito prático: um usuário que já alterou o preço de QUALQUER
-- produto nunca pode ser removido de auth.users (nem para atender LGPD/
-- direito ao esquecimento) sem primeiro apagar seu próprio histórico de
-- preços — o que destruiria auditoria, o oposto do propósito da tabela.
--
-- Escopo desta migration: só a FK abaixo. Não foi feita auditoria exaustiva
-- de outras FKs para auth.users no schema (fora do escopo desta sprint).

ALTER TABLE public.historico_precos_produto
  DROP CONSTRAINT IF EXISTS historico_precos_produto_alterado_por_fkey,
  ADD CONSTRAINT historico_precos_produto_alterado_por_fkey
    FOREIGN KEY (alterado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
