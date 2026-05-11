-- @deprecated Este script não faz parte da cadeia oficial de migrations.
-- A fonte de verdade é `backend/supabase/migrations/` (ex.: `083_finalizar_venda_ordem_loja_fiscal_v3.sql`).
-- Não aplicar em produção — o DDL abaixo diverge do schema atual (tabelas/colunas).
--
-- Migration: RPC Unificada para Finalização de Venda com Transação Atômica
-- Elimina o risco de "venda ficar pelo caminho"

-- Drop da RPC antiga (se existir)
DROP FUNCTION IF EXISTS finalizar_venda_transacional_canonica_v2;

-- Nova RPC unificada com transação atômica
CREATE OR REPLACE FUNCTION finalizar_venda_transacional_canonica_v3(
    p_venda_id UUID,
    p_caixa_id UUID,
    p_operador_id UUID,
    p_loja_id UUID,
    p_forma_pagamento TEXT,
    p_total_bruto NUMERIC,
    p_total_desconto NUMERIC,
    p_total_liquido NUMERIC,
    p_pagamentos JSONB,
    p_itens JSONB,
    p_desconto_gerente_token TEXT DEFAULT NULL,
    p_desconto_gerente_percentual NUMERIC DEFAULT NULL,
    p_strict_manager_discount_auth BOOLEAN DEFAULT FALSE,
    p_fiscal_auto_enqueue BOOLEAN DEFAULT TRUE,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL,
    p_terminal_id TEXT DEFAULT NULL
) 
RETURNS TABLE(
    venda_id UUID,
    status TEXT,
    mensagem TEXT,
    documento_fiscal_id UUID,
    dados_fiscais JSONB,
    itens_atualizados JSONB,
    estoque_baixado JSONB
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_item JSONB;
    v_produto_id UUID;
    v_quantidade NUMERIC;
    v_estoque_atual NUMERIC;
    v_estoque_novo NUMERIC;
    v_preco_unitario NUMERIC;
    v_desconto_unitario NUMERIC;
    v_tipo_preco TEXT;
    v_documento_fiscal_id UUID;
    v_fiscal_payload JSONB;
    v_error_message TEXT;
    v_itens_result JSONB := '[]'::JSONB;
    v_estoque_result JSONB := '[]'::JSONB;
    v_forma_pagamento_principal TEXT;
BEGIN
    -- BEGIN implícito pela função PostgreSQL
    
    -- 0. Verificar idempotência (evitar duplicatas)
    IF EXISTS (SELECT 1 FROM vendas WHERE id = p_venda_id) THEN
        -- Venda já existe, retornar dados existentes
        RETURN QUERY SELECT 
            v.id::UUID,
            'JA_EXISTE'::TEXT,
            'Venda já processada anteriormente.'::TEXT,
            COALESCE(ff.id, NULL::UUID)::UUID,
            COALESCE(
                jsonb_build_object(
                    'documento_id', ff.id,
                    'status', ff.status,
                    'payload', ff.payload
                ), 
                NULL::JSONB
            )::JSONB,
            NULL::JSONB,
            NULL::JSONB
        FROM vendas v
        LEFT JOIN fiscal_fila ff ON ff.venda_id = v.id
        WHERE v.id = p_venda_id
        LIMIT 1;
        RETURN;
    END IF;

    -- 1. Validar estado do caixa
    IF NOT EXISTS (
        SELECT 1 FROM caixas 
        WHERE id = p_caixa_id 
        AND operador_id = p_operador_id 
        AND status = 'ABERTO'
    ) THEN
        RETURN QUERY SELECT 
            p_venda_id::UUID,
            'ERRO_CAIXA_FECHADO'::TEXT,
            'Caixa fechado. Abra o caixa antes de finalizar a venda.'::TEXT,
            NULL::UUID,
            NULL::JSONB,
            NULL::JSONB,
            NULL::JSONB;
        RETURN;
    END IF;
    
    -- 2. Bloquear linhas de estoque para evitar concorrência
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
        v_produto_id := (v_item->>'produto_id')::UUID;
        
        -- Bloquear linha de estoque
        SELECT quantidade_atual INTO v_estoque_atual
        FROM estoque 
        WHERE produto_id = v_produto_id 
        AND loja_id = p_loja_id
        FOR UPDATE;
        
        -- Validar se estoque existe
        IF v_estoque_atual IS NULL THEN
            RETURN QUERY SELECT 
                p_venda_id::UUID,
                'ERRO_ESTOQUE_INEXISTENTE'::TEXT,
                format('Produto sem linha de estoque (id %s).', v_produto_id)::TEXT,
                NULL::UUID,
                NULL::JSONB,
                NULL::JSONB,
                NULL::JSONB;
            RETURN;
        END IF;
        
        -- Validar quantidade disponível
        v_quantidade := (v_item->>'quantidade')::NUMERIC;
        IF v_estoque_atual < v_quantidade THEN
            RETURN QUERY SELECT 
                p_venda_id::UUID,
                'ERRO_ESTOQUE_INSUFICIENTE'::TEXT,
                format('Estoque insuficiente para produto %s: solicitado %s, disponível %s.', 
                       v_produto_id, v_quantidade, v_estoque_atual)::TEXT,
                NULL::UUID,
                NULL::JSONB,
                NULL::JSONB,
                NULL::JSONB;
            RETURN;
        END IF;
    END LOOP;
    
    -- 3. Inserir venda principal
    INSERT INTO vendas (
        id, caixa_id, operador_id, loja_id,
        data_venda, forma_pagamento, status,
        total_bruto, total_desconto, total_liquido,
        desconto_gerente_token, desconto_gerente_percentual,
        ip_address, user_agent, device_id, terminal_id
    ) VALUES (
        p_venda_id, p_caixa_id, p_operador_id, p_loja_id,
        NOW(), p_forma_pagamento, 'CONCLUIDA',
        p_total_bruto, p_total_desconto, p_total_liquido,
        p_desconto_gerente_token, p_desconto_gerente_percentual,
        p_ip_address, p_user_agent, p_device_id, p_terminal_id
    );
    
    -- 4. Inserir itens da venda e baixar estoque
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
        v_produto_id := (v_item->>'produto_id')::UUID;
        v_quantidade := (v_item->>'quantidade')::NUMERIC;
        v_preco_unitario := (v_item->>'preco_unitario')::NUMERIC;
        v_desconto_unitario := COALESCE((v_item->>'desconto_unitario')::NUMERIC, 0);
        v_tipo_preco := v_item->>'tipo_preco';
        
        -- Inserir item da venda
        INSERT INTO venda_itens (
            id, venda_id, produto_id, quantidade,
            preco_original, preco_unitario, desconto_unitario,
            tipo_preco, data_inclusao
        ) VALUES (
            (v_item->>'item_id')::UUID,
            p_venda_id,
            v_produto_id,
            v_quantidade,
            (v_item->>'preco_original')::NUMERIC,
            v_preco_unitario,
            v_desconto_unitario,
            v_tipo_preco,
            NOW()
        );
        
        -- Baixar estoque atômico
        UPDATE estoque 
        SET quantidade_atual = quantidade_atual - v_quantidade,
            data_ultima_baixa = NOW()
        WHERE produto_id = v_produto_id 
        AND loja_id = p_loja_id
        RETURNING quantidade_atual INTO v_estoque_novo;
        
        -- Coletar dados para retorno
        v_itens_result := v_itens_result || jsonb_build_object(
            'produto_id', v_produto_id,
            'quantidade', v_quantidade,
            'estoque_anterior', v_estoque_atual,
            'estoque_atual', v_estoque_novo
        );
        
        v_estoque_result := v_estoque_result || jsonb_build_object(
            'produto_id', v_produto_id,
            'quantidade_baixada', v_quantidade,
            'estoque_restante', v_estoque_novo
        );
    END LOOP;
    
    -- 5. Inserir pagamentos
    IF p_pagamentos IS NOT NULL THEN
        INSERT INTO venda_pagamentos (venda_id, forma_pagamento, valor, data_pagamento)
        SELECT 
            p_venda_id,
            (pag->>'forma_pagamento')::TEXT,
            (pag->>'valor')::NUMERIC,
            NOW()
        FROM jsonb_array_elements(p_pagamentos) AS pag;
    END IF;
    
    -- 6. Gerar documento fiscal na mesma transação
    IF p_fiscal_auto_enqueue THEN
        -- Determinar forma de pagamento principal para o fiscal
        v_forma_pagamento_principal := (
            SELECT forma_pagamento 
            FROM jsonb_array_elements(p_pagamentos) 
            LIMIT 1
        )->>'forma_pagamento';
        
        -- Criar payload fiscal
        v_fiscal_payload := jsonb_build_object(
            'origem', 'caixa_web',
            'venda_id', p_venda_id,
            'loja_id', p_loja_id,
            'caixa_id', p_caixa_id,
            'operador_id', p_operador_id,
            'forma_pagamento', v_forma_pagamento_principal,
            'pagamentos', p_pagamentos,
            'totais', jsonb_build_object(
                'bruto', p_total_bruto,
                'desconto', p_total_desconto,
                'liquido', p_total_liquido
            ),
            'itens', p_itens
        );
        
        -- Enfileirar documento fiscal
        INSERT INTO fiscal_fila (
            venda_id, tipo_documento, status, payload,
            data_criacao, data_processamento
        ) VALUES (
            p_venda_id,
            CASE WHEN process.env.FISCAL_DEFAULT_DOC_TYPE = 'NFCE' THEN 'NFCE'
                 WHEN process.env.FISCAL_DEFAULT_DOC_TYPE = 'NFE' THEN 'NFE'
                 ELSE 'NFC_E_STUB' END,
            'PENDENTE',
            v_fiscal_payload,
            NOW(),
            NULL
        ) RETURNING id INTO v_documento_fiscal_id;
    END IF;
    
    -- 7. Retornar sucesso com todos os dados
    RETURN QUERY SELECT 
        p_venda_id::UUID,
        'CONCLUIDA'::TEXT,
        'Venda finalizada com sucesso.'::TEXT,
        v_documento_fiscal_id::UUID,
        jsonb_build_object(
            'documento_id', v_documento_fiscal_id,
            'status', 'PENDENTE',
            'payload', v_fiscal_payload
        )::JSONB,
        v_itens_result::JSONB,
        v_estoque_result::JSONB;
    
    -- COMMIT implícito ao final da função
    EXCEPTION
        WHEN OTHERS THEN
            -- ROLLBACK automático do PostgreSQL
            GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
            RETURN QUERY SELECT 
                p_venda_id::UUID,
                'ERRO_TRANSACAO'::TEXT,
                format('Erro na finalização: %s', v_error_message)::TEXT,
                NULL::UUID,
                NULL::JSONB,
                NULL::JSONB,
                NULL::JSONB;
END;
$$;

-- Grant de permissão
GRANT EXECUTE ON FUNCTION finalizar_venda_transacional_canonica_v3 TO authenticated, anon;

-- Criar índice para performance (se não existir)
CREATE INDEX IF NOT EXISTS idx_estoque_produto_loja_update 
ON estoque(produto_id, loja_id) 
WHERE quantidade_atual > 0;
