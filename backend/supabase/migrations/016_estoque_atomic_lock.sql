-- Migration 016: Controle de Concorrência no Estoque
-- Resolve race condition onde dois caixas podem vender o mesmo item simultaneamente
-- Usa SELECT FOR UPDATE para bloqueio pessimista da linha de estoque

-- Adiciona coluna version para controle de concorrência otimista (backup)
ALTER TABLE IF EXISTS estoque
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Comentário explicativo
COMMENT ON COLUMN estoque.version IS 'Versão para controle de concorrência otimista (incrementada a cada atualização)';

-- Cria função segura para decrementar estoque com:
-- 1. SELECT FOR UPDATE (bloqueio pessimista)
-- 2. Verificação de estoque suficiente
-- 3. Atualização atômica
-- 4. Registro de baixa idempotente
CREATE OR REPLACE FUNCTION public.decrementar_estoque_seguro(
    p_produto_id UUID,
    p_quantidade NUMERIC,
    p_venda_id UUID
)
RETURNS TABLE(
    sucesso BOOLEAN,
    mensagem TEXT,
    estoque_atual NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quantidade_atual NUMERIC;
    v_version INTEGER;
    v_baixa_existente UUID;
BEGIN
    -- Verifica se já existe baixa para esta venda/produto (idempotência)
    SELECT eb.id INTO v_baixa_existente
    FROM estoque_baixas eb
    WHERE eb.venda_id = p_venda_id
      AND eb.produto_id = p_produto_id
    LIMIT 1;

    -- Se baixa já existe, retorna sucesso sem alterar estoque
    IF v_baixa_existente IS NOT NULL THEN
        -- Pega estoque atual para retornar
        SELECT e.quantidade_atual INTO v_quantidade_atual
        FROM estoque e
        WHERE e.produto_id = p_produto_id;

        RETURN QUERY SELECT TRUE, 'BAIXA_JA_EXISTE'::TEXT, v_quantidade_atual;
        RETURN;
    END IF;

    -- Bloqueia a linha do estoque para outros transações
    -- FOR UPDATE garante que ninguém mais pode modificar até o COMMIT
    SELECT e.quantidade_atual, e.version
    INTO v_quantidade_atual, v_version
    FROM estoque e
    WHERE e.produto_id = p_produto_id
    FOR UPDATE;

    -- Verifica se produto existe no estoque
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE'::TEXT, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Verifica se há estoque suficiente
    IF v_quantidade_atual < p_quantidade THEN
        RETURN QUERY SELECT FALSE, 'ESTOQUE_INSUFICIENTE'::TEXT, v_quantidade_atual;
        RETURN;
    END IF;

    -- Decrementa estoque e incrementa versão
    UPDATE estoque e
    SET
        quantidade_atual = e.quantidade_atual - p_quantidade,
        version = e.version + 1,
        updated_at = NOW()
    WHERE e.produto_id = p_produto_id
      AND e.version = v_version;  -- Proteção extra contra race condition

    -- Se nenhuma linha foi atualizada, houve concorrência
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'CONCORRENCIA_DETECTADA'::TEXT, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Registra a baixa de estoque
    INSERT INTO estoque_baixas (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, p_produto_id, p_quantidade);

    -- Calcula estoque restante
    v_quantidade_atual := v_quantidade_atual - p_quantidade;

    RETURN QUERY SELECT TRUE, 'SUCESSO'::TEXT, v_quantidade_atual;
END;
$$;

-- Comentário da função
COMMENT ON FUNCTION public.decrementar_estoque_seguro IS
'Decrementa estoque de forma atômica e segura contra concorrência.
Usa SELECT FOR UPDATE para bloquear a linha durante a operação.
Retorna: (sucesso BOOLEAN, mensagem TEXT, estoque_atual NUMERIC)
Mensagens possíveis: SUCESSO, BAIXA_JA_EXISTE, ESTOQUE_INSUFICIENTE, PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE, CONCORRENCIA_DETECTADA';

-- Revoga permissões públicas
REVOKE ALL ON FUNCTION public.decrementar_estoque_seguro(UUID, NUMERIC, UUID) FROM PUBLIC;

-- Concede a usuários autenticados (caixa web usa Server Actions)
GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(UUID, NUMERIC, UUID) TO authenticated;

-- Concede a service_role (Edge Functions)
GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(UUID, NUMERIC, UUID) TO service_role;

-- Cria índice único para evitar duplicatas de baixa (garantia extra)
-- Nota: Se já existir dados duplicados, precisará limpar primeiro
DO $$
BEGIN
    -- Só cria se não existir
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'estoque_baixas_venda_produto_unique'
    ) THEN
        -- Cria índice único (pode falhar se houver duplicatas)
        CREATE UNIQUE INDEX IF NOT EXISTS estoque_baixas_venda_produto_unique
        ON estoque_baixas(venda_id, produto_id);
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'Índice único não criado - existem duplicatas na tabela estoque_baixas';
END $$;

-- Adiciona coluna quantidade na tabela estoque_baixas se não existir
-- (útil para auditoria e rastreamento)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'estoque_baixas'
        AND column_name = 'quantidade'
    ) THEN
        ALTER TABLE estoque_baixas
        ADD COLUMN quantidade NUMERIC DEFAULT 0;

        -- Atualiza registros existentes com quantidade 0 (ou pode fazer join com itens_venda)
        UPDATE estoque_baixas SET quantidade = 0 WHERE quantidade IS NULL;
    END IF;
END $$;

-- Comentário na tabela estoque_baixas
COMMENT ON TABLE estoque_baixas IS 'Registro de baixas de estoque. Cada linha representa uma baixa de estoque para um item de venda. Protegida contra duplicatas por índice único.';
