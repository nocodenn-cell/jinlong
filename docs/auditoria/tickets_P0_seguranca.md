
---

# P0 — BLOQUEADORES DE GO-LIVE

## SEC-01

**Título:** `baixar_estoque_venda` é executável por `anon` (usuário não autenticado) e não valida loja nem papel

**Descrição do problema:**
A função `public.baixar_estoque_venda(p_loja_id uuid, p_itens jsonb)` está presente em produção com `GRANT ALL ... TO "anon"`. Ela **não é** `SECURITY DEFINER` (roda como invoker) mas recebe `p_loja_id` como parâmetro livre e faz `UPDATE estoque` direto, sem verificar se o chamador pertence à loja, sem verificar perfil e sem registrar kardex/auditoria. Não passa por `decrementar_estoque_seguro`, portanto não gera `movimentos_estoque_log` nem `estoque_baixas`.

**Impacto operacional:** Qualquer portador da chave `anon` (que é pública por definição em app Supabase) pode tentar decrementar estoque arbitrário de **qualquer loja** informando o `loja_id`. Mesmo que a RLS de `estoque` limite o UPDATE em alguns caminhos, a superfície não deveria existir; e a baixa feita por aqui é invisível ao kardex, corrompendo o inventário sem trilha.

**Evidência encontrada:**
- Função: `public.baixar_estoque_venda(uuid, jsonb)` — `remote_schema.sql` (corpo: `UPDATE estoque SET quantidade_atual = quantidade_atual - item.qtd WHERE produto_id = ... AND loja_id = p_loja_id`)
- Grant: `remote_schema.sql:11680` → `GRANT ALL ON FUNCTION "public"."baixar_estoque_venda"(...) TO "anon";`
- Contraste: `backend/supabase/migrations/278_revoke_anon_authenticated_funcoes_sem_uso_publico.sql` fez esse trabalho para outras funções, mas **não cobriu esta**.
- Tabela afetada: `public.estoque`

**Comportamento atual:** `anon` e `authenticated` têm EXECUTE. A função não checa `auth.uid()`, não checa `usuarios.perfil`, não checa se `p_loja_id` é a loja do chamador, e não escreve em `movimentos_estoque_log`.

**Comportamento esperado:** Função revogada de `anon` e `authenticated`. Se ainda houver uso legítimo, deve ser reescrita para derivar `loja_id` da sessão (`usuarios.loja_id`), exigir perfil, e delegar a `decrementar_estoque_seguro` para manter kardex e idempotência. Se não houver uso, `DROP FUNCTION`.

**Risco:** Manipulação de estoque por terceiro não autenticado; divergência de inventário sem rastro; fraude operacional indetectável.

**Prioridade sugerida:** **P0**

**Arquivos prováveis para correção:**
- nova migration `backend/supabase/migrations/289_revoke_baixar_estoque_venda.sql`
- verificar chamadores: `pdv-importados/`, `pdv-local/` (grep `baixar_estoque_venda`)

---

## SEC-02

**Título:** Produção ainda permite OPERADOR criar produto — migration `20260730093000` consta aplicada mas seu efeito não está no banco

**Descrição do problema:**
A migration `20260730093000_revoga_operador_cadastro_produto_pdv.sql` remove `'OPERADOR'` do gate de `criar_produto_com_estoque_inicial`, trocando `IF v_perfil NOT IN ('OPERADOR','GERENTE','DONO','ADMIN')` por `IF v_perfil NOT IN ('GERENTE','DONO','ADMIN')`. O `migration_status_current.txt` lista `20260730093000` como **aplicada**. Porém o dump de produção (`remote_schema.sql`, gerado em 2026-08-02, dois dias DEPOIS) mostra a função ainda com `'OPERADOR'` na lista e o COMMENT antigo `'Cria produto + estoque. OPERADOR ok para PDV relâmpago.'`.

**Impacto operacional:** A regra de negócio decidida pelo Diretor de Produto ("PDV não cadastra produto") está documentada, versionada, marcada como aplicada — e **não vigora em produção**. Governança está reportando verde sobre um controle inexistente. Este é o mesmo padrão de falha do cron fiscal (ver FLX-02): o sistema mente sobre o próprio estado.

**Evidência encontrada:**
- Esperado: `backend/supabase/migrations/20260730093000_revoga_operador_cadastro_produto_pdv.sql:35-38` (troca do fragmento de perfil)
- Registro de aplicação: `backend/docs/auditoria/supabase-migration-repair-20260802/migration_status_current.txt` → linha `20260730093000 | 20260730093000 | 2026-07-30 09:30:00`
- Real em produção: `remote_schema.sql`, função `public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid)` → `IF v_perfil NOT IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN') THEN RAISE EXCEPTION 'CRIAR_PRODUTO_PERFIL'`
- COMMENT em produção: `'Cria produto + estoque. OPERADOR ok para PDV relâmpago.'`
- Regra de produto violada: `.cursor/rules/entity-ssot.mdc` → "PDV não cadastra produto (2026-07-30)"

**Comportamento atual:** OPERADOR autenticado pode invocar a RPC e criar produto. A defesa restante é apenas a Server Action (`assertGerenteSession`) — ou seja, **defesa só no frontend**; chamada direta à RPC contorna.

**Comportamento esperado:** Função em produção sem `'OPERADOR'`. Além disso: entender **por que** a migration constou aplicada sem efeito (provável `DO $$` com guarda que caiu no ramo "já está sem OPERADOR" / `RAISE NOTICE` silencioso, ver linha 60 do arquivo) e corrigir o padrão.

**Risco:** Bypass de política de produto por chamada direta à RPC; e — mais grave — perda de confiança em todo o registro de migrations. Se esta falhou silenciosamente, outras podem ter falhado.

**Prioridade sugerida:** **P0**

**Arquivos prováveis para correção:**
- `backend/supabase/migrations/20260730093000_revoga_operador_cadastro_produto_pdv.sql` (revisar guarda idempotente que engoliu a falha)
- nova migration corretiva `290_forca_revoga_operador_criar_produto.sql`
- **ação de auditoria:** revalidar as demais migrations `DO $$`-guardadas contra o dump
