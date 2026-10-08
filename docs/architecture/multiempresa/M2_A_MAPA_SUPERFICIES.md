# M2-A — Mapa de superfícies de ataque (isolamento multiempresa)

**Base:** `main` @ `ea917430` (inspeção estática + leituras de arquivo)  
**Nota:** Mitigações de catálogo sync do PR #493 **não** estão na `main` — registrar risco conforme HEAD atual.

Legenda evidência: `ESTÁTICO` = código lido · `M1` = prova no PR #493 · `NÃO VERIFICADO` = sem prova runtime nesta sprint.

---

## 1. Inventário

| ID | Arquivo:linha | Superfície | Risco | Evidência | Mitigação proposta | Pri |
|---|---|---|---|---|---|---|
| S01 | `pdv-importados/lib/admin/auth/sessionConsistency.ts:33,67-76,165-169,244-247` | Sessão: `perfil`+`loja_id` únicos; sem empresa | Modelo legado single-loja | ESTÁTICO | Estender RawSession (ESPEC §9); fail-closed dual | P0 |
| S02 | `pdv-importados/lib/gerente/auth/sessionContext.ts:15-18` | `getGerenteLojaId` → `?? LOJA_MATRIZ_ID` | Fallback silencioso de tenant | ESTÁTICO | Remover fallback; erro explícito | P0 |
| S03 | `pdv-importados/lib/auth/lojaUsuario.ts:4` | Constante `LOJA_MATRIZ_ID` | Hardcode Matriz | ESTÁTICO | Instrumentar usos → eliminar | P0 |
| S04 | `pdv-importados/lib/admin/policy/adminPolicy.ts:138-197` | Middleware authz painel | Sem `EMPRESA_ATIVA_*` | ESTÁTICO | Novos blockedReason | P0 |
| S05 | `pdv-importados/middleware.ts:29-66` | Edge gate `/admin|/gerente|/caixa` | Depende S01/S04 | ESTÁTICO | Propagar empresa ativa | P0 |
| S06 | `pdv-importados/lib/supabase/admin.ts:19-28` | `createAdminClient` service_role | Bypass RLS total | ESTÁTICO | Assert TenantContext antes de qualquer query | P0 |
| S07 | `pdv-importados/app/admin/funcionarios/actions.ts` (~55–100+) | CRUD usuários via service_role | Vazamento se filtro loja falhar | ESTÁTICO | Gate + `loja ∈ lojasPermitidas(empresaAtiva)` | P0 |
| S08 | `pdv-importados/app/admin/provisionamento/actions.ts` (~407+) | Provisiona lojas/users (ADMIN) | Blast radius plataforma | ESTÁTICO | Exigir `fp_eh_plataforma` (D1) | P0 |
| S09 | `pdv-importados/app/gerente/estoque/actions.ts` (~72–125) | service_role + `p_ator_id` | DEFINER/ator forjado | ESTÁTICO | Validar loja/ator vs sessão | P0 |
| S10 | `pdv-importados/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc.ts:177+` | RPC produto+estoque service_role | Cross-loja se params errados | ESTÁTICO | `fp_pode_loja` na RPC + assert TS | P0 |
| S11 | `backend/supabase/functions/sync-outbox/index.ts:755-761,764-811,941-954` | HMAC + service_role; catálogo **sem** filtro loja na main; `x-loja-id` client | Full catalog dump / write outbox | ESTÁTICO main; M1 mitiga parcial no #493 | Fail-closed loja; bind dispositivo↔loja; filtrar catálogo | P0 |
| S12 | `backend/supabase/functions/sync-outbox/index.ts:672-753` | POST venda/caixa sem checagem de loja do dispositivo | Write cross-tenant | ESTÁTICO | Escopo por dispositivo | P0 |
| S13 | `backend/supabase/functions/validar-gerente/index.ts:173-237` | Body `loja_id` + service_role | Loja cliente em token legado | ESTÁTICO | Loja do solicitante/vínculo | P1 |
| S14 | `backend/supabase/functions/fiscal-worker/index.ts:32-43,105-107` | Chave global + claim fila | Worker multi-loja com um segredo | ESTÁTICO | Manter; validar `fp_empresa_operacional` por doc | P1 |
| S15 | RPCs `SECURITY DEFINER` com `p_loja_id` (ex.: `ajustar_estoque_manual*`, `finalizar_venda_*`, `listar_vendas_gerente`, `importar_nfe_transacao`) | Authz variável; ignora RLS | Cross-empresa se helper fraco | ESTÁTICO + ESPEC §8 | Trocar para `fp_pode_loja` + empresa ativa | P0 |
| S16 | `auth_usuario_gerencial_loja` (mig `20260719032927_*`) | Helper: ADMIN global; GERENTE=loja | DONO não global (drift Padrão A) | ESTÁTICO | Reimplementar sobre `fp_*` | P1 |
| S17 | Storage `produto-imagens` (mig `20260904100000_*`) | Public read; write via produtos | URL por UUID; write herda RLS produto | ESTÁTICO / ESPEC §10 | Explicitar `fp_pode_loja` no write | P2 |
| S18 | Storage XML fiscal (privado, service_role) | Sem policy auth | Leak se UI futura sem escopo | ESTÁTICO | SELECT por loja/empresa | P2 |
| S19 | `app/gerente/financeiro/actions.ts` (~200–218) | Invoca fiscal-worker global | Qualquer GERENTE drena fila | ESTÁTICO | Escopo / role | P1 |
| S20 | Relatórios `app/gerente/relatorios/*` + `?? LOJA_MATRIZ_ID` | Exports/KPIs | Dados Matriz se loja null | ESTÁTICO (padrão) | Contexto obrigatório | P1 |
| S21 | Caixa `app/caixa/server/*` + fallbacks Matriz | PDV online | Escrita na loja errada | ESTÁTICO | Sem fallback; loja da sessão | P0 |
| S22 | Cookie JWT `sb-*-auth-token` compartilhado entre abas | Sessão | Abas compartilham tenant — OK se 1 empresa ativa | ESTÁTICO | Troca empresa server-side | P2 |
| S23 | `sessionConsistency.ts:101-115` | Dica `sub` sem verificar assinatura | Mitigado por `getUser` | ESTÁTICO | Manter; nunca autorizar só com dica | P1 |
| S24 | Webhook/cron fiscal | Desagendado (`20260731201800_*`) | Histórico | ESTÁTICO | N/A ativo | P2 |
| S25 | Tabelas sem guarda M1 (vendas, estoque, …) | RLS legado PERMISSIVE | Cross-tenant se multiempresa | M1 GATE | Lotes RESTRICTIVE | P0 |
| S26 | Dual-user sem empresa ativa (PoC `fp_*`) | Helpers unem todas as lojas | V-P0-03 | M1 C4 PASS (lacuna) | `fp_empresa_ativa` fail-closed | P0 |

---

## 2. Resumo por prioridade

### P0 (bloqueiam confiança multiempresa)

S01–S12, S15, S21, S25, S26 — sessão sem empresa, fallback Matriz, service_role sem assert, sync catalog/write, DEFINER, PDV, tabelas descobertas, dual sem seletor.

### P1

S13, S14, S16, S19, S20, S23 — tokens gerente, fiscal worker, helpers legados, relatórios, JWT hint.

### P2

S17, S18, S22, S24 — storage público/XML, cookies multi-aba (aceitável com 1 ativa), cron morto.

---

## 3. O que **não** declarar seguro

| Afirmação | Estado |
|---|---|
| “RLS protege tudo” | **Falso** na main; PoC só 5 tabelas no #493 |
| “sync-outbox isolado” | **Falso** na main (S11) |
| “service_role actions OK porque há assertAdminSession” | **Insuficiente** sem TenantContext empresa+loja |
| “Storage isolado” | **NÃO VERIFICADO** runtime |
| “Exports isolados” | **NÃO VERIFICADO** |

---

## 4. Relação com XT (PR #492)

| XT | Superfícies |
|---|---|
| XT-01 sem `empresas` | S01 (main) |
| XT-02 sync catalog | S11 |
| XT-03 tabelas globais | S25 + categorias/marcas |
| XT-04 DEFINER | S15 |
| XT-07 provisionamento código global | S08 |
