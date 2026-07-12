-- Migration: Remove suporte ao idioma zh-HK (chinês tradicional)
-- Mantém apenas 'pt' e 'zh'

-- 1. Atualizar usuários existentes
UPDATE public.usuarios
SET idioma_preferido = 'zh'
WHERE idioma_preferido = 'zh-HK';

-- 2. Remover constraint antiga
ALTER TABLE public.usuarios
DROP CONSTRAINT IF EXISTS usuarios_idioma_preferido_check;

-- 3. Criar nova constraint com apenas pt e zh
ALTER TABLE public.usuarios
ADD CONSTRAINT usuarios_idioma_preferido_check
CHECK (idioma_preferido IN ('pt', 'zh'));

-- 4. Atualizar RLS policies se houver referência a zh-HK (opcional)
-- Nenhuma acão adicional necessária para as políticas atuais.
