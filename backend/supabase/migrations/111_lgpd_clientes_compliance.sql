-- ============================================================
-- Migration 111: LGPD Compliance — tabela clientes
--
-- 1. Corrige mismatch: adiciona coluna `email` que o front-end
--    já referencia mas não existia no schema SQL.
-- 2. Adiciona campos de controle de consentimento (LGPD Art. 7):
--    - termos_aceitos_em
--    - consentimento_privacidade_em
--
-- Todas as colunas usam IF NOT EXISTS para ser idempotente
-- caso já tenham sido criadas via dashboard Supabase.
-- ============================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS email                        TEXT        NULL,
  ADD COLUMN IF NOT EXISTS termos_aceitos_em            TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS consentimento_privacidade_em TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.clientes.email IS
  'E-mail de contato do cliente (dado pessoal sujeito à LGPD).';

COMMENT ON COLUMN public.clientes.termos_aceitos_em IS
  'Registro do momento em que o cliente aceitou os Termos de Uso '
  '(base legal LGPD Art. 7, I — consentimento).';

COMMENT ON COLUMN public.clientes.consentimento_privacidade_em IS
  'Registro do momento em que o cliente aceitou a Política de Privacidade '
  '(base legal LGPD Art. 7, I — consentimento).';
