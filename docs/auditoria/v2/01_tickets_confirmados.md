# Tickets novos — rodada 2

## SSOT-01

> **STATUS (2026-08-05): FECHADO.** Migration 289 removeu `v_estoque_inicial` e a string mágica de
> `ajustar_estoque_manual`. Verificado em produção: ausentes. Gate agora deriva só de
> `NOT IN ('GERENTE','DONO','ADMIN')`. Overload de 6 args (wrapper) inalterado, mesma ACL
> (`service_role`-only), sem regressão.


**Título:** `ajustar_estoque_manual` autoriza OPERADOR por comparação de string literal enviada pelo cliente

**Categoria:** Segurança

**Veredito:** CONFIRMADO

**Descrição:**
O overload de 7 argumentos de `ajustar_estoque_manual` concede permissão a OPERADOR quando `p_motivo_codigo = 'ACERTO_INVENTARIO'` **e** `BTRIM(p_observacao) = 'Estoque inicial no cadastro de produto'`. Ambos são parâmetros controlados pelo chamador. A autorização, portanto, não deriva de estado do servidor (papel, contexto de transação, existência de produto recém-criado) — deriva de uma **string mágica** que o cliente escolhe enviar.

**Impacto operacional:** Um OPERADOR autenticado pode alterar o saldo de estoque de qualquer produto da sua loja para qualquer valor, a qualquer momento, bastando enviar a observação exata. O ajuste é gravado no kardex como `ACERTO_INVENTARIO` legítimo — ou seja, a fraude fica indistinguível de um estoque inicial válido na trilha de auditoria.

**Evidências:**
- **Arquivo/dump:** `remote_schema.sql:71-110` (definição vigente em produção)
- **Função:** `public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid)`
- **Trecho:** `IF v_perfil NOT IN ('GERENTE','DONO','ADMIN') AND NOT (v_perfil = 'OPERADOR' AND v_estoque_inicial) THEN RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL'`
- **Migrations:** introduzido por `20260718135500_ajuste_estoque_inicial_operador_pdv.sql`; **deveria** ter sido removido por `20260730093000_...sql:94-120`
- **Tabelas:** `public.estoque`, `public.movimentos_estoque_log`

**Fluxo afetado:** Cadastro → Estoque → (contamina) Relatórios de inventário e CMV

**Comportamento atual:** OPERADOR ajusta estoque livremente usando a string mágica.

**Comportamento esperado:** Conforme a decisão de produto de 2026-07-30 (`.cursor/rules/entity-ssot.mdc`), OPERADOR não deve ajustar estoque. Gate restrito a `GERENTE`/`DONO`/`ADMIN`. Se a exceção de estoque inicial for mantida por necessidade real, ela deve ser derivada de estado do servidor (ex.: produto criado na mesma transação / `client_request_id`), nunca de string do cliente.

**Causa provável:** A migration de revogação falhou silenciosamente (ver SEC-02). O desenho original já era frágil; a correção existe e não vigorou.

**Prioridade:** **P0**

**Arquivos prováveis para correção:** nova migration corretiva; validar contra `remote_schema.sql`

**Dependências:** mesma raiz do SEC-02 — **corrigir juntos, na mesma migration**

**Critério de aceite:**
```sql
SELECT pg_get_functiondef(oid) LIKE '%Estoque inicial no cadastro de produto%' AS ainda_vulneravel
FROM pg_proc WHERE proname = 'ajustar_estoque_manual';
-- esperado: false para todos os overloads
```

---

## SSOT-02

**Título:** Migrations com guarda `DO $$` + `pg_get_functiondef` podem falhar silenciosamente — classe de risco delimitada

**Categoria:** Operação

**Veredito:** CONFIRMADO (o mecanismo) / delimitado a 3 arquivos

**Descrição:**
Três migrations aplicam correções via reescrita textual do corpo da função (`pg_get_functiondef` + `replace` dentro de `DO $$`). Esse padrão falha silenciosamente quando o texto procurado não bate exatamente — a migration completa com sucesso, o registro em `schema_migrations` é gravado, e **nenhum efeito ocorre**. Foi exatamente o que aconteceu com `20260730093000` (nas duas partes).

**Levantamento completo da classe** (varredura por `pg_get_functiondef` em todas as 239 migrations):

| Migration | Verificação em produção | Resultado |
|---|---|---|
| `20260730093000_revoga_operador_cadastro_produto_pdv.sql` | função ainda contém `'OPERADOR'` | ❌ **FALHOU** (ambas as partes) |
| `278_revoke_anon_authenticated_funcoes_sem_uso_publico.sql` | grants a `anon` nas funções alvo | ✅ aplicou |
| `286_revoke_authenticated_finalizar_venda_transacional_9args.sql` | `finalizar_venda_transacional` (9 args) só tem `service_role` | ✅ aplicou |

**Impacto operacional:** O risco é **contido** — 1 de 3 falhou, e as duas que funcionaram são de revogação de grants (verificáveis). Mas o mecanismo compromete a confiabilidade do registro de migrations: "aplicada" não significa "em vigor".

**Evidências:**
- Varredura: `grep -ln "pg_get_functiondef" backend/supabase/migrations/*.sql` → exatamente 3 arquivos
- Falha: `remote_schema.sql` (função `criar_produto_com_estoque_inicial` e `ajustar_estoque_manual` inalteradas)
- Sucessos: `remote_schema.sql:11804,11809` (apenas `service_role` remanescente)
- Guarda que engole a falha: `20260730093000_...sql:60` → `RAISE NOTICE 'criar_produto_com_estoque_inicial já está sem OPERADOR'`

**Fluxo afetado:** Governança de release / todos os fluxos

**Comportamento atual:** Migration reporta sucesso sem aplicar efeito; `RAISE NOTICE` no ramo "já corrigido" mascara o caso "não encontrei o texto".

**Comportamento esperado:** Migrations que reescrevem função devem (a) preferir `CREATE OR REPLACE FUNCTION` com o corpo completo, em vez de patch textual; ou (b) `RAISE EXCEPTION` — não `NOTICE` — quando o texto esperado não for encontrado, distinguindo "já aplicado" de "não casou".

**Causa provável:** Diferença entre o texto no arquivo e o corpo real em produção (espaços, quebras de linha, ou versão da função divergente por drift anterior).

**Prioridade:** **P1** (o P0 é a consequência: SEC-02 + SSOT-01)

**Arquivos prováveis para correção:** as 3 migrations listadas; pipeline de CI

**Dependências:** nenhuma

**Critério de aceite:** CI que executa `db reset` em banco limpo e faz diff do schema resultante contra o dump de produção; migrations com patch textual falham explicitamente quando não casam.

---

## FLX-04

> **STATUS (2026-08-05): FECHADO.** Migration 295 aplicada e verificada em produção + prova
> funcional (transação com `ROLLBACK`, sem dado residual). Decisão de arquitetura: **opção (a)**
> — conferência nativa em `ordens_compra_itens`, sem tocar em `remessas`.
>
> **Correção de diagnóstico (achado desta auditoria).** *"a coluna `origem_tipo` foi criada
> justamente para isso"* (linha abaixo, "Comportamento esperado") **está errada** — `remessas`
> não tem `origem_tipo` nem `origem_id`, só um campo texto livre (`origem_descricao`), sem FK
> para `ordens_compra`. E `registrar_conferencia_remessa`, citado como "fluxo existente" pelo
> guia de implementação, **não existe** em produção — só `confirmar_remessa_entrada` (o passo
> final) foi construído. "Estender o fluxo existente" não era mecanicamente possível; daí a
> conferência nativa em vez de reusar `remessas`.
>
> **O que foi implementado:** colunas `quantidade_conferida`, `divergencia_obs`,
> `status_conferencia` (`EM_CONFERENCIA/CONFERIDO/DIVERGENTE`), `conferido_por`, `conferido_em`
> em `ordens_compra_itens`. RPC nova `registrar_conferencia_ordem_compra` (grava a contagem,
> não move estoque). `receber_ordem_compra` reescrita: assinatura muda de `(uuid,jsonb)` para
> `(uuid)` — **o payload de quantidade do cliente deixou de existir**; credita só
> `quantidade_conferida`, e só se todos os itens da OC já tiverem sido conferidos
> (`OC_CONFERENCIA_PENDENTE` caso contrário).
>
> **Prova funcional (produção, dados de teste com `ROLLBACK`):** recebimento sem conferência
> foi recusado; conferência com quantidade divergente (8 de 10 esperados) gravou
> `status_conferencia=DIVERGENTE` + auditoria completa; recebimento subsequente creditou
> exatamente 8 no kardex (`movimentos_estoque_log`), não 10 — provando que o valor creditado
> vem do que foi conferido, não do que era esperado nem de qualquer parâmetro externo.
>
> **Camada de aplicação:** `shared-core/src/inventory/contracts.ts` e
> `inventoryMovementWriter.ts` atualizados — o writer agora chama
> `registrar_conferencia_ordem_compra` e depois `receber_ordem_compra(uuid)` em sequência.
> **Contrato externo preservado**: `ReceiveOrdemCompraCommand` (usado por
> `app/gerente/compras/actions.ts`) não mudou — a quantidade que o operador já digitava agora é
> gravada como conferência antes de creditar, sem exigir nova tela. Zero mudança de UI.
> 2 testes novos provam a ordem de chamada e que `receiveOc` nunca é invocado se a conferência
> falhar. 886 testes verdes, `guard:all` e `lint` limpos.
>
> Não mexe em `remessas`/`remessa_itens` (fora de escopo por decisão explícita) nem em cadastro,
> publicação ou venda de produto (ADR-006 preservado).

**Título:** `receber_ordem_compra` credita estoque sem etapa de conferência — a proteção da migration 20260801120000 não alcança o caminho real de entrada

**Categoria:** Regra Ausente

**Veredito:** CONFIRMADO

**Descrição:**
A migration `20260801120000_recebimento_conferencia_explicita.sql` corrigiu um problema real e bem diagnosticado: antes, `confirmar_remessa_entrada` creditava `COALESCE(quantidade_conferida, quantidade_esperada)`, produzindo "trilha auditável de uma conferência que não houve". A correção separou `EM_CONFERENCIA → CONFERIDO/DIVERGENTE → CONCLUIDA`.

Porém a própria migration declara no cabeçalho: *"Escopo: NF-e (`importar_nfe_transacao`) e ordem de compra (`receber_ordem_compra`) NÃO passam a usar `remessas` nesta onda."* E registra que `remessas` tem **0 linhas em produção**.

Ou seja: a etapa de conferência foi implementada na tabela que **não** é usada, enquanto os dois caminhos que efetivamente dão entrada de estoque seguem sem conferência. Verifiquei `receber_ordem_compra` em produção: ela credita `(el->>'quantidade_recebida')::numeric` vindo do payload, com validações de auth/perfil/loja/status, mas **nenhuma** verificação de conferência física.

**Impacto operacional:** Entrada de mercadoria por ordem de compra credita no estoque a quantidade que o operador digitou, sem segunda conferência. Divergência entre o que o fornecedor enviou e o que foi lançado não é detectada — e o kardex registra a entrada como fato consumado.

**Evidências:**
- **Migration:** `backend/supabase/migrations/20260801120000_recebimento_conferencia_explicita.sql:1-20` (cabeçalho declarando o escopo excluído e as 0 linhas em `remessas`)
- **Função em produção:** `public.receber_ordem_compra` — `remote_schema.sql`, trecho `v_qtd_rec := COALESCE((el->>'quantidade_recebida')::numeric, 0); ... SET quantidade_recebida = v_qtd_rec`
- **Exceções presentes:** `OC_AUTH`, `OC_PERFIL`, `OC_NAO_ENCONTRADA`, `OC_LOJA`, `OC_STATUS_INVALIDO`, `OC_ITENS_INVALIDOS`, `OC_QTD_INVALIDA` — nenhuma de conferência
- **Tabelas:** `public.ordens_compra`, `public.ordens_compra_itens` (`remote_schema.sql:7880,7899`), `public.remessas` (`:8250`, vazia)
- **Kardex:** `receber_ordem_compra` escreve em `movimentos_estoque_log` (confirmado)

**Fluxo afetado:** **Compra → Recebimento → Estoque** (elo não coberto pela rodada 1)

**Comportamento atual:** Quantidade recebida = quantidade digitada, creditada direto.

**Comportamento esperado:** Decisão de produto necessária. Ou (a) `receber_ordem_compra` passa a exigir conferência análoga à de `remessas`; ou (b) o fluxo de OC é migrado para `remessas`, aproveitando a máquina de estados já construída (a coluna `origem_tipo` foi criada justamente para isso). A situação atual — proteção construída na tabela vazia — é a pior das três.

**Causa provável:** Onda B entregou a máquina de estados mas adiou a migração dos fluxos reais; o adiamento não virou ticket.

**Prioridade:** **P1**

**Arquivos prováveis para correção:** nova migration sobre `receber_ordem_compra`; avaliar `importar_nfe_transacao` no mesmo movimento

**Dependências:** decisão de produto (a) ou (b)

**Critério de aceite:** Entrada de estoque por OC exige transição de conferência explícita, com `conferido_por` e `conferido_em` registrados; tentativa de confirmar sem conferência levanta exceção.
