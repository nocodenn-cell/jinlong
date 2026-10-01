-- ROLLBACK de 20261001100500 (lista de caixas elegíveis para desembolso).
-- NÃO é uma migration; aplicar manualmente só se necessário. A app deve voltar a ler `caixas` antes (ou a
-- action `listarCaixasElegiveisDevolucaoAction` falhará e o modal mostrará lista vazia).
DROP FUNCTION IF EXISTS public.listar_caixas_elegiveis_desembolso();
