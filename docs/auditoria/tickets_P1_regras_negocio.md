# P1 — Regras de negócio ausentes e integridade

## BR-01

> **STATUS (2026-08-05): FECHADO.** Migration `298_br01_limite_credito_por_modo_loja.sql`
> aplicada e verificada em produção (`pg_get_functiondef`). Decisão (b) do ticket — implementar
> o enforcement, não remover o campo — já estava tomada pela ADR-003 antes desta investigação,
> não decidida aqui.
>
> `pdv_config.modo_limite_credito` (novo, `CHECK IN ('AVISO','BLOQUEIO','AUTORIZACAO_GERENTE')`,
> default `AVISO`). Gate entra em `finalizar_venda_transacional_canonica_v4`, único ponto onde
> `contas_receber` é criado — imediatamente antes do `INSERT`, comparando
> `SUM(contas_receber.valor_aberto WHERE status IN ('ABERTO','PARCIAL')) + saldo_pendente_desta_venda`
> contra `clientes.limite_credito`. `AUTORIZACAO_GERENTE` reutiliza `tokens_desconto_gerente`
> (mesma tabela/mecanismo do desconto, token novo e independente — `p_limite_credito_gerente_token`)
> — não criou mecanismo paralelo, conforme a ADR exige.
>
> **Armadilha pega em `ROLLBACK` antes de aplicar:** `CREATE OR REPLACE` com um parâmetro
> trailing novo não substitui a função — Postgres identifica por nome+tipos, não nome+defaults.
> Ficaria com dois overloads (21 e 22 args) e qualquer chamada nomeada ambígua quebraria com
> "is not unique". Corrigido com `DROP FUNCTION` explícito da assinatura de 21 args antes do
> `CREATE` — mesma armadilha que o FLX-04 já tinha documentado para `receber_ordem_compra`.
>
> **Prova:** 6 cenários em transação com `ROLLBACK` contra produção — venda normal sem cliente
> (regressão, comportamento idêntico); pagamento parcial com cliente dentro do limite (sem gate,
> como antes); pagamento parcial excedendo limite em modo `AVISO` (permite, grava mensagem);
> mesmo caso em `BLOQUEIO` (recusa com `LIMITE_CREDITO_EXCEDIDO`); `AUTORIZACAO_GERENTE` sem
> token (recusa `TOKEN_OBRIGATORIO`); `AUTORIZACAO_GERENTE` com token válido (aceita, consome o
> token). Todos passaram; zero dado residual após o `ROLLBACK`.
>
> **Não fechado nesta migration, sinalizado:** a tela do caixa não tem um fluxo de UI para
> pedir o token de gerente especificamente para override de crédito (o mecanismo de PIN de
> gerente existe e é reutilizado no banco, mas o gatilho "pedir autorização por limite
> excedido" na tela não foi construído). Não bloqueia o piloto porque o modo default é
> `AVISO` — nenhuma loja usa `AUTORIZACAO_GERENTE` hoje, então não há tela que precise disso
> ainda. Vira P1 de UI quando/se alguma loja configurar esse modo. Mensagem de `AVISO` também
> não é hoje mostrada como toast — `caixaVendas.impl.ts` só lê `mensagem` no caminho de erro
> (linha 345-346); no sucesso ela é ignorada. RPC está correta e auditável de qualquer forma
> (dado disponível); exibir é UX incremental, não a regra em si.

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

> **STATUS (2026-08-05): FECHADO.** Migration `300_br03_custo_unitario_snap_servidor.sql`
> aplicada e verificada em produção (`pg_get_functiondef`, 1 overload confirmado). A linha
> `v_custo_unitario_snap := (v_item->>'custo_unitario_snap')::numeric;` foi substituída por
> `SELECT p.preco_custo INTO v_custo_unitario_snap FROM public.produtos p WHERE p.id =
> v_produto_id;` dentro do PASSO 3 de `finalizar_venda_transacional_canonica_v4` — mesma
> estratégia já usada para preço (PASSO 1, `calcular_preco_produto`). Assinatura da função
> não mudou (`CREATE OR REPLACE` seguro, sem armadilha de overload). Provado com 2 cenários
> em transação com `ROLLBACK` antes da aplicação real: produto com `preco_custo` definido
> recebendo payload mentiroso (999.99) grava o valor do cadastro (3.80), ignorando o
> payload; produto com `preco_custo` NULL recebendo payload mentiroso (50.00) grava NULL —
> nunca 0, conforme ADR-007. Zero dado residual (prova em ROLLBACK).

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
