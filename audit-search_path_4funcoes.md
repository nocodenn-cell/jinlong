# AUDITORIA CIRÚRGICA 01 — SECURITY DEFINER / search_path

## A. Matriz das 4 funções (migrações 015, 044, 075, 20260621002000)

| Função | Migration | SECURITY DEFINER | search_path | Risco Concreto | Classificação |
| ------ | --------- | ---------------- | ----------- | -------------- | ------------- |
| `decrementar_estoque_idempotente(uuid, numeric, uuid)` | 015 | SIM | `public` | ⚠️ search_path público em função SECURITY DEFINER, mas com validações internas de `auth.role()` e `auth.uid()` + checagem de posse da venda. Risco baixo, mas existente se search_path for manipulado. | HARDENING RECOMENDADO |
| `registrar_venda_com_itens(...)` | 015 | SIM | `public` | ⚠️ Execute revogado de `anon` (mig 218) e de `authenticated` — apenas `service_role` pode executar. Função não é chamada pelo app web. | FALSO POSITIVO (contexto: não é invocável por authenticated) |
| `confirmar_remessa_entrada(p_remessa_id uuid)` | 044 | SIM | `public` | ⚠️ Função SECURITY DEFINER com validações profundas de perfil (GERENTE/DONO/ADMIN) + loja_id. Objetos acessados via `public.` prefix — mas como função definida como `public` com `search_path = public`, o Postgres resolverá objetos sem schema qualificação no contexto do chamador. Risco médio de shadowing se contexto for alterado. | HARDENING RECOMENDADO |
| `transferir_estoque_entre_lojas(...)` | 044 | SIM | `public` | ⚠️ Valida perfil + loja_origem ≠ loja_destino + estoque suficiente. Como função SECURITY DEFINER com `search_path = public`, objetos `public.tabela` são resolvidos no contexto do chamador (postgres dono). Risco de escalada se validações internas forem contornadas. | HARDENING RECOMENDADO |
| `registrar_liquidacao_receber(p_titulo_id uuid, p_valor numeric, p_forma_pagamento text, p_observacao text DEFAULT NULL)` | 044 | SIM | `public` | ⚠️ Valida perfil + valor > 0 + título existe. Como função SECURITY DEFINER com `search_path = public`, acesso a `public.contas_receber`, `public.liquidacoes_receber`. Risco baixo — validações são rigorosas. | HARDENING RECOMENDADO |
| `fiscal_reprocessar_documento(p_documento_id uuid)` | 044 | SIM | `public` | ⚠️ Inusitada: checa `current_user <> 'postgres'` primeiro. Se `current_user = 'postgres'` (conexão direta), pula checagem de perfil. Se conexão via JWT authenticated, checa perfil. Como função SECURITY DEFINER, roda como owner (postgres) se bypassarem RLS. Risco: conexão direta como postgres pularia todas as validações. | VULNERABILIDADE CONFIRMADA (especialmente para acesso direto DB) |
| `importar_nfe_transacao(...)` | 075 | SIM | `public` | ⚠️ Validação completa: perfil + loja_id + CNPJ + chave NF-e + itens. Como função SECURITY DEFINER com `search_path = public`, acesso a múltiplas tabelas (fornecedores, produtos, estoque, importacoes_nfe, movimentos_estoque_log). Risco: se attacker conseguir injetar `search_path`, poderia acessar outras tabelas. Porém, validações de perfil e loja_id são feitas antes de quaisquer operações de escrita. | HARDENING RECOMENDADO |
| *Migração 20260621002000* | 20260621002000 | NÃO APLICÁVEL | — | Esta migration contém APENAS ALTER POLICY statements para wrap de initplan RLS. Não define funções SECURITY DEFINER com search_path = public. | INFORMAÇÃO COMPLEMENTAR |

---

## B. Vulnerabilidades confirmadas

### 1. `fiscal_reprocessar_documento` (migração 044)
- **Evidence**: Function has `SECURITY DEFINER`, `SET search_path = public`, and checks `IF current_user <> 'postgres'` THEN validate profile. If connection is made directly as `postgres` (possible via `service_role` connection string or direct psql), the profile check is SKIPPED entirely, and the function runs with full `postgres` privileges.
- **Technical details**:
  - File: `044_usuario_perfil_admin_rls.sql`, lines 659-697
  - Function: `public.fiscal_reprocessar_documento(uuid)`
  - Line 670: `IF current_user <> 'postgres' THEN` — profile validation is SKIPPED when connected as postgres
  - The function updates `documentos_fiscais_pendentes` and could potentially be exploited if there's a way to connect as `postgres` or bypass the `current_user` check
- **Classificação**: VULNERABILIDADE CONFIRMADA — risco específico de conexão direta como postgres pulando validações de perfil

---

## C. Hardening recomendado

### 1. `decrementar_estoque_idempotente` (migração 015)
- **Current**: `SET search_path = public` without fixing search_path
- **Recommendation**: Add explicit schema qualification to all `public.tabela` references, OR move `SET search_path = pg_catalog` and qualify all table references
- **Arquivo**: `015_security_rpc_hardening.sql`, lines 6-46
- **Risco de regressão**: Baixo — as validações internas (`auth.role()`, `auth.uid()`, checagem de venda) continuarão funcionando
- **Teste necessário**: Verificar se remover `SET search_path = public` quebra alguma chamada existente

### 2. `confirmar_remessa_entrada` (migração 044)
- **Current**: `SET search_path = public` 
- **Recommendation**: Fix search_path to `pg_catalog` and qualify all table references with `public.` schema, OR add internal check to force execution context
- **Arquivo**: `044_usuario_perfil_admin_rls.sql`, lines 399-466
- **Risco de regressão**: Baixo — as validações de perfil e loja_id são feitas no início da função
- **Teste necessário**: Confirmar que qualificar tabelas com `public.` não quebra o initplan do RLS

### 3. `transferir_estoque_entre_lojas` (migração 044)
- **Current**: `SET search_path = public`
- **Recommendation**: Same as above — fix search_path or qualify references
- **Arquivo**: `044_usuario_perfil_admin_rls.sql`, lines 468-554
- **Risco de regressão**: Baixo
- **Teste necessário**: Verificar qualificar todas as tabelas (estoque, estoque_baixas, movimentos_estoque_log, remessas)

### 4. `registrar_liquidacao_receber` (migração 044)
- **Current**: `SET search_path = public`
- **Recommendation**: Same hardening
- **Arquivo**: `044_usuario_perfil_admin_rls.sql`, lines 599-654
- **Risco de regressão**: Baixo
- **Teste necessário**: Confirmar qualificar `public.contas_receber`, `public.liquidacoes_receber`

### 5. `importar_nfe_transacao` (migração 075)
- **Current**: `SET search_path = public` with extensive internal validations
- **Recommendation**: Fix search_path to `pg_catalog` and qualify all `public.tabela` references. The internal validations (perfil, loja_id, CNPJ) are good but search_path mutable remains risk.
- **Arquivo**: `075_importacao_nfe_compra.sql`, lines 114-343
- **Risco de regressão**: Baixo — as validações são feitas no início da função
- **Teste necessário**: Confirmar que qualificar tabelas (fornecedores, produtos, estoque, importacoes_nfe, etc.) não quebra a lógica

### 6. `registrar_venda_com_itens` (migração 015)
- **Classification**: FALSO POSITIVO no contexto atual
- **Reason**: Execute revogado tanto de `anon` quanto de `authenticated` — apenas `service_role` (Edge functions) pode executar. O app web Next.js nunca chama esta RPC diretamente. O risco de `search_path hijacking` é irrelevante pois não há caminho de chamada do cliente authenticated.
- **Arquivo**: `015_security_rpc_hardening.sql`, lines 55-81
- **Ação**: Nenhuma correção necessária neste contexto

---

## D. Falsos positivos

| Função | Motivo |
| ------ | -------- |
| `registrar_venda_com_itens` (015) | Execute revogado de `authenticated` e `anon` — apenas service_role chama. Não é invocável por usuário authenticated via API ou RPC. O `search_path = public` é irrelevante pois não há caminho de execução do cliente. |
| Todas as funções onde `GRANT EXECUTE TO authenticated` foi revogado | Se o grant não existe, o usuário não consegue executar a função independente do search_path. Migração 218 e 20260718133633 revogaram corretamente. |

---

## E. Recomendação futura para Claude Code

### 1. Corrigir `search_path` em 5 funções SECURITY DEFINER

**Funções-alvo**:
- `public.decrementar_estoque_idempotente(uuid, numeric, uuid)` — mig 015
- `public.confirmar_remessa_entrada(p_remessa_id uuid)` — mig 044
- `public.transferir_estoque_entre_lojas(...)` — mig 044
- `public.registrar_liquidacao_receber(...)` — mig 044
- `public.importar_nfe_transacao(...)` — mig 075

**Alteração mínima**:
```
-- Substituir: SET search_path = public
-- Por: SET search_path = pg_catalog
--
-- Depois qualificar todas as referências a tabelas sem schema:
-- de: loja_id = (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
-- para: loja_id = (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
--
-- Ou alternativa: manter search_path = public BUT qualifier all table names with public. prefix
-- Ex: public.estoque.em vez de estoque.em

**Risco de regressão**: Baixo a médio — requer verificar todas as referências a tabelas não qualificadas dentro de cada função. O benefício é eliminar o risco de search_path hijacking completamente.

**Teste necessário**:
1. Rodar `SELECT proname, prosrc FROM pg_proc WHERE proname IN ('decrementar_estoque_idempotente', 'confirmar_remessa_entrada', 'transferir_estoque_entre_lojas', 'registrar_liquidacao_receber', 'importar_nfe_transacao')`
2. Confirmar que a função `pg_get_functiondef(oid)` contém `SET search_path = pg_catalog` ou que todas as tabelas estão qualificadas com `public.`
3. Executar `supabase functions invoke` tests para confirmar que RPCs ainda funcionam
4. Verificar advisor `auth_rls_initplan` após alteração

### 2. Tratar `fiscal_reprocessar_documento` risco de conexão postgres

**Problema**: A checagem `IF current_user <> 'postgres'` significa que conexão direta como postgres pula toda validação de perfil.

**Alteração recomendada**: Remover a condicional `current_user <> 'postgres'` e SIEMPRE validar perfil, independentemente do usuário atual. Ou adicionar `RAISE EXCEPTION` se `current_user = 'postgres'` para impedir acesso direto.

**Arquivo**: `044_usuario_perfil_admin_rls.sql`, lines 659-697

**Risco de regressão**: Baixo — esta mudança aumenta a segurança ao impedir que conexões diretas como postgres pulam validações.

**Teste necessário**: Confirmar que a função ainda funciona corretamente quando chamada via authenticated JWT (com perfil validado) e que tentar executar via conexão direta como postgres agora falha com exceção apropriada.

### 3. Documentar que `registrar_venda_com_itens` não é risco

**Contexto**: Esta função tem `search_path = public` mas `GRANT EXECUTE TO authenticated` foi revogado. Apenas service_role pode executar.

**Ação**: Apenas documentar neste relatório que o `search_path = public` nestes casos não é vulnerabilidade pelo motivo de não haver caminho de execução pelo authenticated usuário.

---
FIM DA AUDITORIA CIRÚRGICA 01