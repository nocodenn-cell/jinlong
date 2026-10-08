# Relatório M1 — Fundação Multiempresa (experimental local)

**Branch:** `cursor/m1-multiempresa-fundacao-1966`  
**Data:** 2026-10-08  
**Ambiente:** PGlite + typecheck sync-outbox · **sem** apply remoto · **sem** dados reais

---

## 1. Entregas

| Item | Local | Evidência |
|---|---|---|
| DDL aditivo `empresas`, `usuario_vinculos`, `plataforma_admins`, `lojas.empresa_id` | `migrations-experimental-m1/` (fora do path CLI) | SQL + README rollback |
| Helpers `fp_*` (fail-closed, compat ADMIN) | mesma migration | testes helpers |
| Guardas RESTRICTIVE PoC (produtos, clientes, fornecedores, contas_receber, caixas) | D16 | 8/8 testes isolamento |
| sync-outbox catálogo por `loja_id` + fail closed sem loja (XT-02) | `functions/sync-outbox/index.ts` | contrato unit + deno check |
| Testes A×B + UUID + dual + concorrência estoque | `npm run test:m1-multiempresa` | `/opt/cursor/artifacts/m1-isolamento-test.log` |

---

## 2. PASS / FAIL / SKIP

| Critério de aceite | Resultado | Nota |
|---|---|---|
| Empresa A não lê/altera B (produtos, clientes, caixa, CR) | **PASS** | PGlite + FORCE RLS + role authenticated |
| Empresa B não acessa A | **PASS** | |
| Usuário dual só contexto autorizado (vínculos) | **PASS** | `fp_lojas_permitidas` retorna A+B |
| UUID conhecido de outro tenant | **PASS** | SELECT/UPDATE vazios sob RLS |
| Catálogo sync sem full dump | **PASS** (contrato) | Edge: exige loja; filtra produtos/regras/atacado |
| Integridade concorrente estoque A∥B | **PASS** | 10+20 → 30/40 |
| RPCs SECURITY DEFINER P0 reescritas | **SKIP** | Fora do corte M1 (etapa 5 ESPEC); listadas como risco |
| Storage / exports / relatórios | **SKIP** | Sem mudança; herdam risco até M2+ |
| Regressão Matriz E2E UI | **SKIP** | Frontend sob Claude Code; não tocado |
| Apply / produção | **SKIP** (proibido) | |

**Suite:** `8/8 PASS` — ver `m1-isolamento-test.log`.

---

## 3. Compatibilidade e rollback

- **Compat:** `usuarios.perfil` / `usuarios.loja_id` intactos (D17). Backfill deriva vínculos; ADMIN sem vínculo (D9).
- **Path CLI:** `migrations-experimental-m1/` **não** entra em `db reset` / drift remoto até promoção consciente.
- **Rollback:** `DROP POLICY tenant_guard`; `DROP FUNCTION fp_*`; `DROP TABLE usuario_vinculos, plataforma_admins`; `ALTER lojas DROP empresa_id`; `DROP empresas` (README).
- **sync-outbox:** mudança de comportamento — dispositivos sem `x-loja-id` e sem `DEFAULT_PDV_LOJA_ID` recebem HTTP 400. Necessário para fechar XT-02.

---

## 4. Tabelas globais / escopo (identificadas, não migradas)

| Tabela | Escopo ESPEC | M1 |
|---|---|---|
| `categorias`, `marcas` | empresa (D4) | pendente coluna `empresa_id` |
| `regras_preco`, `categorias_financeiras`, `pricing_config_versions` | empresa (D12) | sync filtra regras por produto da loja (mitigação parcial) |
| `configuracoes_gerais` | empresa (D13) | sem mudança |
| `feature_flags`, `tipos_movimento_estoque` | plataforma (P) | sem mudança |
| `gtin_lookup_cache`, nonces, telemetry | técnico (T) | revisar acesso direto |

---

## 5. Riscos remanescentes

1. **RPCs DEFINER** ainda confiam em `p_loja_id` / perfil legado (XT-04) — etapa 5.  
2. **Guardas só em 5 tabelas** — 140+ policies PERMISSIVE amplas permanecem.  
3. **service_role** em Server Actions / Edge continua bypass RLS — autorização app-layer obrigatória.  
4. **Drift SSOT remoto** e P0 ops (backup/restore/smoke reais) bloqueiam GO produção.  
5. **Dispositivo sync** ainda não é autoridade de loja (header cliente); M3 vincula dispositivo↔loja.

---

## 6. GO / NO-GO

| Decisão | Veredito | Condição |
|---|---|---|
| Evolução **M2** (helpers em auth_usuario_*, RPC P0, mais guardas) em branch local | **GO CONDICIONAL** | Manter experimental path; expandir testes A×B; não tocar frontend sem coordenação |
| **DDL remoto** / `db push` M1 | **NO-GO** | Drift P0 + autorização humana + staging clone + equivalência E1 |
| Merge M1 em main | **NO-GO** até aceite explícito | Preferir manter experimental; sync-outbox pode ir em PR separado após smoke PDV |
| Ops contínua loja | **NO-GO** | Backup real + restore real + smoke presencial |

---

## 7. Próximo passo (humano)

1. Revalidar CI tip #488 `f594945a` (types-drift).  
2. Decidir apply seletivo SSOT / aceite drift.  
3. Autorizar ou não promoção de `migrations-experimental-m1` → `migrations/` após staging.  
4. Coordenar com Claude Code sessão/`adminPolicy` (etapa 9) quando M2 autorizar.
