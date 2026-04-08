-- Remove o hash SHA-256 que correspondia a uma senha de desenvolvimento trivial.
-- Substitui apenas quando o valor ainda é o legado (instalações antigas antes do ajuste em 005).
--
-- Após aplicar: defina uma senha real de gerente no banco (hex SHA-256 do texto) e sincronize
-- `pdv_config` no PDV local. Exemplo para gerar o hex (Node): 
--   node -e "console.log(require('crypto').createHash('sha256').update('SUA_SENHA').digest('hex'))"
-- Depois: UPDATE public.pdv_config SET gerente_senha_sha256 = '<hex>' WHERE id = 1;

UPDATE public.pdv_config
SET gerente_senha_sha256 = 'b70ce4bad0e8696e32bf9742941625d2579a2fe1b4ec0883374b4268a6435ed1'
WHERE id = 1
  AND gerente_senha_sha256 = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
