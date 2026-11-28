-- REVISÃO D6 (preço de atacado exige gatilho) — NÃO EXECUTAR SEM AUTORIZAÇÃO.
-- Pré-check em 2026-11-19: 7 produtos com atacado sem gatilho; 64 com gatilho sem atacado.
-- D6 é validação do app (lib/gerente/paresAtacado.ts), não trigger no banco. Não quebra venda;
-- impede salvar esses produtos até serem corrigidos.
--
-- Parte A — leitura (seguro). Lista completa para a decisão do dono.
SELECT id, nome, preco_atacado, quantidade_gatilho_atacado,
       CASE WHEN preco_atacado IS NOT NULL AND quantidade_gatilho_atacado IS NULL
            THEN 'ATACADO_SEM_GATILHO' ELSE 'GATILHO_SEM_ATACADO' END AS problema,
       -- cadastros de teste/QA: nome começa com colchetes, QA, Produto E2E ou Missao
       (nome ~* '^(\[|QA CSV|Produto E2E|Missao)' OR nome ~* 'smoke|teste') AS parece_teste
FROM public.produtos
WHERE (preco_atacado IS NOT NULL) <> (quantidade_gatilho_atacado IS NOT NULL)
ORDER BY problema, parece_teste, nome;

-- Parte B — decisões propostas (NÃO aplicadas). Escolher UMA por produto, com o dono.
--
-- B1. ATACADO_SEM_GATILHO (produtos reais, ex.: 'agua 1L', 'PANELA AÇO', 'pendrive', 'gato'):
--     Opção 1: definir o gatilho (quantidade mínima) -> UPDATE produtos SET quantidade_gatilho_atacado = <N> WHERE id = '<uuid>';
--     Opção 2: remover o atacado -> UPDATE produtos SET preco_atacado = NULL WHERE id = '<uuid>';
--
-- B2. GATILHO_SEM_ATACADO com gatilho = 0 (quase todos, e de teste): sem preço de atacado, o gatilho
--     é lixo. Proposta: limpar o gatilho.
--     UPDATE produtos SET quantidade_gatilho_atacado = NULL
--      WHERE preco_atacado IS NULL AND quantidade_gatilho_atacado = 0 AND <id in (...)>;
--
-- B3. GATILHO_SEM_ATACADO com gatilho > 0 e produto real ('banco branco', 'caneca do budha', gatilho 5):
--     decidir se o atacado deve existir (preço) ou se o gatilho sai. Mesma regra de B1.
--
-- Os cadastros de teste (QA CSV, Produto E2E Sync, [SMOKE], [TESTE REMOVIDO], Missao4) devem ser
-- arquivados, não apagados. Decisão do dono e autorização separada.
--
-- Após a decisão, rodar a Parte A de novo: o resultado esperado é zero linhas.
