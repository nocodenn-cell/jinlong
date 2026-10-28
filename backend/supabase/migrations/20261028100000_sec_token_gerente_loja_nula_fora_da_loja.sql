-- Versão renomeada em 28/10/2026 (era 20261022120000_…): a main já tinha 20261023120000 aplicada em produção, e
-- uma versão anterior à última aplicada faz o `supabase db push` recusar (ou exigir --include-all). Conteúdo inalterado.
-- Nunca foi aplicada em produção (conferido em supabase_migrations.schema_migrations, somente leitura).
--
-- SEC: token de gerente de DONO/ADMIN deixa de valer fora da(s) empresa(s) do emissor.
--
-- Antes (20260916120000), um token sem loja_id emitido por DONO/ADMIN passava em qualquer loja — inclusive de
-- OUTRA EMPRESA (o vínculo só olhava o perfil do emissor). Com multiempresa isso vira vazamento entre tenants.
--
-- Correção mínima: mantém exatamente as regras anteriores (emissor ausente ⇒ fora; não-DONO/ADMIN de outra loja
-- ⇒ fora; loja_id gravado divergente ⇒ fora) e acrescenta só a fronteira de empresa: um token emitido por
-- DONO/ADMIN só vale numa loja cuja empresa é a da loja do emissor ou uma empresa onde ele tem vínculo DONO
-- ativo em usuario_vinculos (ou vínculo ativo na própria loja). Preserva o "Padrão A" (DONO autoriza em outra loja da MESMA empresa) e o token sem loja_id
-- emitido por usuário da própria loja — os dois casos legítimos que o sec04 cobre.
--
-- (Versão anterior desta migration tratava QUALQUER loja_id nulo como fora da loja; quebrava os dois casos
-- legítimos acima — sec04-token-gerente-tenant falhava com "token da própria loja marcado como fora".)
--
-- Produção (somente leitura, 2026-10-23): 1 empresa ⇒ o vazamento não é explorável hoje; 0 tokens ativos com
-- loja_id nulo. O corpo atual em produção é idêntico ao da main (difere só em CRLF).
--
-- NÃO APLICAR no Supabase remoto sem revisão do dono.
-- ROLLBACK: recriar a função com o corpo de 20260916120000_sec04_token_gerente_vinculo_loja_v4.sql.

BEGIN;

CREATE OR REPLACE FUNCTION internal.token_gerente_fora_da_loja(
  p_token text,
  p_loja_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.tokens_desconto_gerente t
      LEFT JOIN public.usuarios u ON u.id = t.criado_por
     WHERE t.token = p_token
       AND (
         u.id IS NULL
         OR (u.perfil NOT IN ('DONO', 'ADMIN') AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR (t.loja_id IS NOT NULL
             AND lower(btrim(t.loja_id)) IS DISTINCT FROM p_loja_id::text)
         OR (u.perfil IN ('DONO', 'ADMIN')
             AND NOT EXISTS (
               SELECT 1
                WHERE public.fp_empresa_da_loja(p_loja_id) IS NOT NULL
                  AND (
                    public.fp_empresa_da_loja(u.loja_id) = public.fp_empresa_da_loja(p_loja_id)
                    OR EXISTS (
                      SELECT 1
                        FROM public.usuario_vinculos v
                       WHERE v.usuario_id = u.id
                         AND v.ativo
                         AND v.empresa_id = public.fp_empresa_da_loja(p_loja_id)
                         AND (v.papel = 'DONO' OR v.loja_id = p_loja_id)
                    )
                  )
             ))
       )
  );
$function$;

COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + empresa: true quando o token existe e NÃO vale na loja (emissor ausente; emissor não DONO/ADMIN de outra loja; loja_id do token divergente; ou emissor DONO/ADMIN sem vínculo com a empresa da loja). Token inexistente = false.';

REVOKE ALL ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
