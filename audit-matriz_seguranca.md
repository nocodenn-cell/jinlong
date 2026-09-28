# Auditoria de Segurança: Matriz Perfil × Operação × Proteção × Bypass

## Perfis Analisados
- **anon** - Acesso anônimo (JWT anon)
- **authenticated** - UJWT authenticated sem perfil específico
- **OPERADOR** - Operador de caixa (perfil restrito)
- **GERENTE** - Gerente de loja
- **DONO** - Dono da empresa (todas as lojas)
- **ADMIN** - Administrador global

---

### 1. escalada de privilégios

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| anon | `REVOKE EXECUTE ON FUNCTION FROM anon` (mig 218, 20260718133633); RPCs com checagem `auth.role() = 'service_role'` interna | ⚠️ Se `search_path` for manipulado para `public`, função `SECURITY DEFINER` roda como `postgres`; 4 funções ainda têm `search_path` mutable (mig 20260621002000) |
| authenticated | Políticas RLS com `EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil IN (...))` | ⚠️ Se usuário não tiver perfil na tabela `usuarios`, política não se aplica; gap se `usuarios` table não tiver linha para o uid |
| OPERADOR | CHECK `perfil IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN')` na tabela `usuarios`; RLS loja-scoped | ⚠️ Pode tentar UPDATE em própria linha de `usuarios` para mudar perfil (política `usuarios_update_idioma_gerente_dono` restringe a GERENTE/DONO/ADMIN) |
| GERENTE/DONO/ADMIN | Políticas com `u.perfil IN ('GERENTE', 'DONO', 'ADMIN')`; RPCs com validação interna de perfil | ✅ Nenhum bypass encontrado; validações são profundas |

---

### 2. alteração do próprio perfil

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| OPERADOR | Política `usuarios_update_idioma_gerente_dono` (mig 044): `USING (auth.uid() = id AND perfil IN ('GERENTE', 'DONO', 'ADMIN'))` | ✅ **BLOQUEADO** — OPERADOR não pode UPDATE próprio perfil (requer perfil GERENTE/DONO/ADMIN) |
| GERENTE | Mesmo política; `idioma_preferido` restrito a `('pt', 'zh', 'zh-HK')` | ✅ **SEGURO** — Apenas ajuste de idioma dentro do conjunto permitido |
| DONO/ADMIN | Mesmo política | ✅ **SEGURO** — Pode alterar próprio idioma preferido |

---

### 3. RLS (Row Level Security)

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| anon | RLS enabled em maioria das tabelas; políticas exigem perfil GERENTE/DONO/ADMIN ou loja match | ⚠️ **RPC bypass** — Funções `SECURITY DEFINER` com `SET search_path = public` rodam como dono (postgres) se chamadas via service_role; anon revogado de EXECUTE nas críticas (mig 218) |
| authenticated | Políticas `TO authenticated` com `USING` baseados em `caixas`, `usuarios`, `loja_id` | ⚠️ **search_path mutable** — 4 funções têm `SET search_path = public` explicitamente (mig 015, 044, 075, 20260621002000); se attacker controlar search_path, pode acessar outras tabelas |
| OPERADOR | `estoque_select_mesma_loja`: `loja_id = (SELECT u.loja_id FROM usuarios u WHERE u.id = auth.uid())` | ✅ **ISOLADO** — Apenas estoque da própria loja |
| GERENTE | `vendas_select_loja`: verifica `caixa.loja_id = usuario.loja_id` AND (operador_id = uid OR perfil IN GERENTE/DONO) | ✅ **LOJA ESCOPED** — Pode ver editar vendas da própria loja |
| DONO | Vê todas as lojas (`u.loja_id` comparison + perfil check) | ✅ **ACESSO TOTAL** — Mas isolado por loja na política `estoque_select_mesma_loja` |
| ADMIN | Mesma estrutura que GERENTE/DONO | ✅ **CONSISTENTE** |

---

### 4. policies (Políticas RLS)

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| Todos | 367+ migrações versionadas; políticas definidas com `EXISTS (SELECT FROM usuarios)` | ⚠️ **Drift de migração** — Se novo tabelas/addas sem política RLS correspondente, ficam abertas para anon/authenticated |
| anon | `REVOKE ALL ON FUNCTION FROM anon` + `REVOKE EXECUTE FROM anon` em RPCs críticas | ✅ **REVOGADO** — anon não pode invocar RPCs críticas |
| authenticated | Políticas `FOR SELECT/INSERT/UPDATE/DELETE TO authenticated` | ⚠️ **Policy gap** — Tabelas criadas após última migração podem faltar políticas; verificar `audit_rls_public_tables.sql` |
| OPERADOR/GERENTE/DONO/ADMIN | Políticas granulares por perfil e loja_id | ✅ **BEM DEFINIDAS** — Cada perfil tem escopo restrito |

---

### 5. RPCs SECURITY DEFINER

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| anon | `REVOKE EXECUTE FROM anon` em todas as `SECURITY DEFINER` (mig 218 + 20260718133633); resta apenas `authenticated` + `service_role` | ✅ **REVOGADO** — 0 ocorrências de anon execute em funções críticas |
| authenticated | `GRANT EXECUTE TO authenticated` em funções críticas (finalizar_venda v4, decrementar_estoque_seguro, calcular_preco_produto) | ⚠️ **Checagem interna** — Funções validam `auth.role()` e `auth.uid()` + perfil `usuarios`, mas `SECURITY DEFINER` significa que **se a validação interna falhar ou for contornada, roda como dono** |
| OPERADOR | `decrementar_estoque_idempotente`: `IF auth.role() IS DISTINCT FROM 'service_role' THEN checa vendas.operador_id = auth.uid()` | ✅ **OPERADOR PODE DECREMENTAR PRÓPRIO estoque** desde que venda seja dele |
| GERENTE/DONO/ADMIN | Todas as funções `FINALIZAR_VENDA_*` , `TRANSFERIR_ESTOQUE_ENTRE_LOJAS`, `REGISTRAR_LIQUIDACAO` — validam perfil + loja_id | ✅ **APENAS GERENTE/DONO/ADMIN** — OPERADOR chamada resulta em exceção `REMESSA_PERFIL` / `TRANSFERENCIA_PERFIL` |

---

### 6. APIs/actions

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| anon | API routes em `app/api/` envolvem edge functions; `validar-gerente` tem rate limiting (USER/IP/DEVICE/GLOBAL) | ⚠️ **Falsificação de HMAC** — `sync-outbox` function usa HMAC authentication; se chave HMAC vazar, anon pode postar eventos |
| authenticated | Rotas `/api/caixa/` e `/api/gerente/` são thin wrappers; chamam edge functions ou supabase direct | ✅ **Fluxo controlado** — Next.js server components + createServerClient com cookie session |
| OPERADOR | Pode acessar APIs de caixa (scan, cart, payment); APIs de gerente requerem token de validação de senha | ✅ **FLUXO CORRETO** — Gerente flow separado do operador flow |
| GERENTE/DONO/ADMIN | Acesso a `/app/gerente/` com preço config, relatórios, operadores | ⚠️ **IDOR potencial** — Rotas de relatório podem ser acessadas por ID; RLS policies no backend devem proteger |

---

### 7. acesso direto ao Supabase

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| anon | `anon` role revocado de EXECUTE em 100+ funções SECURITY DEFINER; `service_role` usado por edge functions | ✅ **REVOGADO** — anon não tem acesso direto a tabelas críticas |
| authenticated | Conexão via `createServerClient` com cookie session; RLS aplica automaticamente | ⚠️ **Cookie/theft** — Se cookie Supabase for roubado, attacker tem acesso como usuário vítima |
| OPERADOR/GERENTE/DONO/ADMIN | `service_role` bypasses RLS entirely — usado por edge functions (sync-outbox, fiscal-worker) | ⚠️ **Compromisso de service_role key** — Se chave service_role vazar, attacker tem acesso total, bypassando todas as RLS |

---

### 8. IDOR/BOLA (Insecure Direct Object Reference / Broken Object Level Authorization)

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| Todos | RLS policies com `caixa_id`, `venda_id`, `loja_id` checks; RPCs validam `venda.operador_id = auth.uid()` | ⚠️ **Bypass via RPC** — Se RPC não validar ownership corretamente, attacker pode acessar objetos de outros usuários |
| OPERADOR | `vendas_select_loja`: `vendas.operador_id = auth.uid() OR u.perfil IN GERENTE/DONO` | ✅ **ISOLADO** — Operador só vê suas próprias vendas |
| GERENTE | Pode ver todas as vendas da loja (`caixa.loja_id = usuario.loja_id`) | ✅ **LOJA SCOPED** — Não pode ver vendas de outras lojas |
| DONO | Vende todas as lojas | ✅ **ACESSO TOTAL** — Mas com visão consolidada |
| Geral | `finalizar_venda_transacional_canonica_v4`: valida `venda_id` existence + loja scope | ✅ **VALIDADO** — RPC checa que venda pertence à loja do operador |

---

### 9. permissões frontend vs backend

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| Todos | Frontend (Next.js) não confia em dados do cliente; todas as operações críticas vão por edge functions/RPCs | ✅ **ARQUITETURA CORRETA** — Frontend apenas UI; lógica no backend |
| OPERADOR | Frontend `app/caixa/` chama edge functions via `supabase.functions.invoke` com session cookie | ✅ **ISOLADO** — Frontend não tem acesso direto às RPCs REST |
| GERENTE/DONO/ADMIN | Frontend `app/gerente/` tem botões/relatórios; permissões reais vêm do RLS + RPC checks | ⚠️ **Frontend pode mostrar operação que backend bloqueia** — UI deve desabilitar botões baseando-se em `perfil` do usuário, mas a segurança é no backend |
| Geral | `search_path = public` em 4 funções RPC — dado que frontend não controla search_path, risco é baixo | ✅ **BAIXO RISCO** — search_path é definido na função, não pelo cliente |

---

### 10. operações administrativas

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| ADMIN | Políticas com `u.perfil IN ('GERENTE', 'DONO', 'ADMIN')`; funções `SECURITY DEFINER` validam perfil | ✅ **ADMIN TEM ACESSO AMPLO** — Mas restrito por `loja_id` na maioria das políticas |
| ADMIN | `lojas_write_gerente`: `EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN'))` | ✅ **ADMIN PODE GERENCIAR LOJAS** — Mas com escopo de loja nos dados |
| ADMIN | `confirmar_remessa_entrada` (SECURITY DEFINER): valida `u.perfil IN GERENTE/DONO/ADMIN` + `u.loja_id = p_remessa_id` | ✅ **ADMIN PODE CONFIRMAR REMESSAS** — Apenas da própria loja |
| ADMIN | `transferir_estoque_entre_lojas` (SECURITY DEFINER): valida perfil + loja_origem ≠ loja_destino | ✅ **ADMIN PODE TRANSFERIR** — Entre lojas diferentes, com validação de estoque |

---

### 11. isolamento por loja/empresa

| Perfil | Proteção | Bypass Possível |
|--------|----------|-----------------|
| OPERADOR | `estoque_select_mesma_loja`: `loja_id = (SELECT u.loja_id FROM usuarios u WHERE u.id = auth.uid())` | ✅ **ISOLADO** — Apenas própria loja |
| OPERADOR | `vendas_select_loja`: via `caixas c INNER JOIN usuarios u ON u.id = auth.uid() WHERE c.id = vendas.caixa_id AND c.loja_id = u.loja_id` | ✅ **ISOLADO** — Vendas da própria loja somente |
| GERENTE | Mesmo padrão do operador + pode ver todas as da loja (`u.perfil IN GERENTE/DONO`) | ✅ **LOJA ESCOPED** — Gerente da loja vê todas as vendas/estoque da loja |
| DONO | Políticas `gerente_all` (`perfil IN GERENTE/DONO/ADMIN`) | ✅ **ACESSO A TODAS LOJAS** — Dono tem visão consolidada em todas |
| ADMIN | Mesmo padrão do DONO | ✅ **CONSISTENTE** — Admin tem mesma visão que DONO |
| ⚠️ **Bypass potencial** | Se `usuarios.loja_id` for NULL ou mismatching com `caixas.loja_id`, políticas podem retornar falso positivo/negativo | ⚠️ **DRIFT DE LOJA** — Se `usuarios.loja_id` não for atualizado quando operador mudar de loja, RLS pode permitir acesso indevido ou bloquear acesso correto |

---

## Resumo de Hallazgos Críticos

1. **anon execute revogado** — Todas as funções críticas tiveram EXECUTE revogado de `anon` (migrações 218, 20260718133633). ✅
2. **RPCs com checagem interna** — Todas as `SECURITY DEFINER` validam `auth.uid()`, perfil do usuário e `loja_id` antes de operar. ✅
3. **4 funções com `search_path = public`** — Migrações 015, 044, 075, 20260621002000 explicitamente definem `SET search_path = public`. Risco médio se attacker conseguir manipular o contexto. ⚠️
4. **service_role bypassa RLS** — Usado por edge functions; se chave vazar, acesso total. ⚠️
5. **Isolamento por loja é forte** — Todas as políticas críticas usam `caixas.loja_id = usuarios.loja_id` ou comparação direta. ✅
6. **Perfil ADMIN/DONO têm visão consolidada** — Podem acessar dados de todas as lojas, mas com políticas consistentes. ✅
7. **Gap potencial: política em tabelas novas** — Qualquer tabela criada após a última migração sem política RLS correspondente fica exposta. ✅ Verificar com `audit_rls_public_tables.sql`