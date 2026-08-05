# P1 — Regras de negócio ausentes e integridade

## BR-01

**Título:** `clientes.limite_credito` existe no schema mas nenhuma RPC o valida — limite de crédito é decorativo

**Descrição do problema:**
A coluna `limite_credito numeric(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0)` existe desde `035_fiado_fiscal_stub.sql:48` e é exposta em views para o gerente. Busca por enforcement em todas as 239 migrations retorna **zero** ocorrências de `limite_credito` fora da definição da coluna e de `SELECT`s de view. Nenhuma RPC compara saldo devedor do cliente contra o limite.

**Impacto operacional:** O gerente cadastra um limite de crédito na tela, o valor persiste, aparece em relatório — e não restringe absolutamente nada. É um controle de risco financeiro que existe apenas visualmente.

**Nuance importante:** as migrations `246_remover_venda_fiado.sql` e `283_consolida_constraints_fiado.sql` removeram a venda fiado do sistema por decisão de produto. Então hoje o limite não tem o que limitar *na venda*. Porém `contas_receber` e `liquidacoes_receber` seguem ativos (`24702_finalizar_venda_v4_contas_receber_automatico.sql`), ou seja, **ainda existe crédito a receber** — e ele não é confrontado com limite algum.

**Evidência encontrada:**
- Definição: `backend/supabase/migrations/035_fiado_fiscal_stub.sql:48`
- Exposição em view: `253_clientes_tipo_endereco_e_view_gerente.sql:74`, `20260717033836_278_fix_v_clientes_gerente_ultima_compra.sql:11`
- Ausência de enforcement: varredura em `backend/supabase/migrations/*.sql` — nenhuma linha de `IF ... limite_credito` ou comparação em RPC
- Contas a receber ativas: `24702_finalizar_venda_v4_contas_receber_automatico.sql`

**Comportamento atual:** Campo gravado e exibido; jamais consultado para decisão.

**Comportamento esperado:** Uma das duas — decisão de produto necessária:
- (a) **Remover o campo** da tela e do schema, se crédito a cliente não é mais um conceito do produto (coerente com a remoção do fiado); ou
- (b) **Implementar o enforcement** em `finalizar_venda_transacional_canonica_v4` quando a venda gera `contas_receber`, bloqueando se `saldo_devedor + valor_venda > limite_credito`.

**Risco:** Inadimplência sem teto; gerente confia em um controle inexistente (risco de decisão baseada em falsa segurança).

**Prioridade sugerida:** **P1**

**Arquivos prováveis para correção:**
- `backend/supabase/migrations/` — nova migration
- `pdv-importados/app/admin/clientes/` (se opção a)

---

## BR-02

**Título:** Não há regra que impeça venda de produto sem NCM — bloqueio fiscal ausente no caminho da venda

**Descrição do problema:**
Existe `CHECK (ncm IS NULL OR ncm ~ '^\d{8}$')` em `210_fiscal_campos_produto.sql:26` — isto é, valida **formato quando preenchido**, mas permite explicitamente `NULL`. Nenhuma RPC do caminho de venda verifica presença de NCM. As únicas verificações de NCM existentes estão no fluxo de **importação de NF-e** (`211`, `233`), não na venda.

**Impacto operacional:** Produto sem NCM é vendável. Quando o módulo fiscal for religado (FLX-02), essas vendas não terão como gerar documento válido — e a descoberta acontecerá no momento da emissão, com a venda já concluída e o cliente já fora da loja.

**Evidência encontrada:**
- Constraint permissiva: `backend/supabase/migrations/210_fiscal_campos_produto.sql:26` → `CHECK (ncm IS NULL OR ncm ~ '^\d{8}$')`
- Validação existe só na importação: `211_vinculos_fornecedor_produto_depara.sql:205,320`; `233_import_nfe_status_draft.sql:215`
- Ausente no caminho de venda: nenhuma referência a `ncm` em `272_reconciliacao_bl1_...` (RPC v4 vigente)

**Comportamento atual:** Venda conclui normalmente com produto sem NCM/CFOP/CEST.

**Comportamento esperado:** Acoplado à decisão de FLX-02. Se fiscal entra no Go-Live, a venda deve bloquear (ou ao menos avisar no PDV) produto sem NCM. Recomendo *gate* no cadastro: produto só vai para status `PUBLICADO` com NCM preenchido — barra na origem em vez de no caixa.

**Risco:** Impossibilidade de emitir documento fiscal para vendas já realizadas; retrabalho de cadastro sob pressão.

**Prioridade sugerida:** **P1** (sobe para P0 se FLX-02 for resolvido pela opção "com fiscal")

**Arquivos prováveis para correção:**
- nova migration com validação em `criar_produto_com_estoque_inicial` / transição para `PUBLICADO`
- `pdv-importados/app/admin/catalogo/`

---

## BR-03

**Título:** `custo_unitario_snap` é enviado pelo cliente sem validação no servidor — margem e CMV manipuláveis pelo frontend

**Descrição do problema:**
O snapshot de custo unitário gravado em `itens_venda` vem do payload montado no frontend e é repassado à RPC sem que o backend o confronte com `produtos.preco_custo`. Diferente dos totais de venda — que o backend **recalcula** e valida com tolerância de 0,02 (bom design, ver CA-01) — o custo é aceito como veio.

**Impacto operacional:** Todo relatório de margem e CMV (`relatorio_margem_por_venda_periodo`, curva ABC) é construído sobre um número que o cliente pode enviar arbitrariamente. Não é vetor de fraude financeira direta (não altera o valor cobrado), mas corrompe a base de decisão gerencial sobre precificação.

**Evidência encontrada:**
- Coluna: `backend/supabase/migrations/235_observabilidade_pdv_visual.sql:15` → `add column if not exists custo_unitario_snap numeric(10,2)`
- Leitura do payload sem validação: `235_observabilidade_pdv_visual.sql:153` → `v_custo_unitario_snap := (v_item->>'custo_unitario_snap')::numeric;`
- Origem no cliente: `pdv-importados/app/caixa/server/caixaVendas.impl.ts:266` → `custo_unitario_snap: i.custoUnitarioSnap`
- Contraste (o que o backend faz certo com preço): `272_reconciliacao_bl1_...:217-221` → recalcula via `calcular_preco_produto` e compara

**Comportamento atual:** Valor do cliente gravado sem conferência.

**Comportamento esperado:** O backend deve **derivar** `custo_unitario_snap` de `produtos.preco_custo` no momento da venda (mesma estratégia já usada para preço), ignorando o valor do payload — ou validá-lo contra o cadastro e rejeitar divergência.

**Risco:** Relatórios de margem e CMV não confiáveis; decisão de precificação sobre dado corrompido.

**Prioridade sugerida:** **P1**

**Arquivos prováveis para correção:**
- nova migration alterando a RPC v4 vigente (base: `272_reconciliacao_bl1_descontos_token_auditoria_motivo.sql`)
- `pdv-importados/app/caixa/server/caixaVendas.impl.ts`
