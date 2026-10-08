# M2-B — Relatório F1–F3 (contexto seguro de empresa ativa)

**Branch:** `cursor/m2b-empresa-ativa-contexto-1966`  
**Data:** 2026-10-08  
**Escopo autorizado:** F1–F3 local · **NO-GO:** merge, DDL remoto, deploy, UI

Preserva D-M2A-1…5. Conflito explícito com D9: `fp_pode_loja` **não** escala `perfil=ADMIN`; só `fp_eh_plataforma()` (alinhado a F3 / D1).

---

## 1. Diff por fase

### F1 — Contrato de contexto

| Artefato | Mudança |
|---|---|
| `pdv-importados/lib/admin/auth/tenantContext.ts` | Resolver puro fail-closed |
| `pdv-importados/lib/admin/auth/assertTenantContext.ts` | Assert tipado + mapeamento policy |
| SQL `fp_empresa_ativa` / `fp_pode_loja` / validações em `fp_set_empresa_ativa` | Identidade auth.uid; vínculos; loja∈empresa; sem LOJA_MATRIZ; cliente não é autoridade |

### F2 — Persistência e consistência

| Artefato | Mudança |
|---|---|
| `usuario_contexto_ativo` | PK usuario, empresa, loja, **version** |
| `fp_set_empresa_ativa` | Advisory lock, prova vínculo, caixa aberto, version conflict |
| `fp_assert_contexto_consistente` | Request atrasada / abas → `EMPRESA_DIVERGENTE` |
| `fp_lojas_permitidas` | Intersecta empresa ativa; dual sem seleção → vazio |

**Semântica transacional:** `pg_advisory_xact_lock(hash(uid))` serializa trocas; `version` detecta write stale entre abas (`CONTEXTO_VERSION_CONFLITO`). Operação com `empresa_esperada ≠ ativa` falha explícita — sem redirect silencioso.

### F3 — Sessão / helpers

| Artefato | Mudança |
|---|---|
| `sessionConsistency.ts` | Carrega vínculos/contexto se tabelas existem; bloqueia `empresa_ativa_obrigatoria` etc. |
| `types.ts` | Novos `SessionBlockedReason`; `AdminSession.empresaId` |
| `sessionContext.ts` | **Remove** `?? LOJA_MATRIZ_ID`; expõe `getGerenteEmpresaId` |
| `adminPolicy.ts` | Reasons tipados; sem redirecionar para outra empresa |
| Soft-path | Sem tabelas M1 → legado `usuarios.loja_id` (compat Matriz) |

**Não migrado (proposital):** actions em `app/**` que ainda fazem `?? LOJA_MATRIZ_ID` após `getGerenteLojaId` — residual P1; fora de F1–F3 UI ban.

---

## 2. Testes

| Suite | Resultado | Evidência |
|---|---|---|
| `npm run test:m2b-contexto` | **14/14 PASS** | `m2b-contexto-resultado.json` |
| `npm run test:m2b-tenant-resolver` | **5/5 PASS** | `m2b-tenant-resolver.json` |
| Vitest app (`tenantContext.test.ts`) | **SKIP** | vite/vitest ausentes no env cloud |
| Isolamento E2E RPC DEFINER produção | **SKIP** | Fora F1–F3 |
| UI seletor / Playwright abas | **SKIP** | UI NO-GO |

Casos PGlite cobertos: dual sem ativa, single auto, set/troca, divergente, adulteração empresa/loja, sem vínculo, revogação, caixa aberto, version race, GUC adulterada, ADMIN sem escalonamento.

---

## 3. Riscos remanescentes

| ID | Sev | Item |
|---|---|---|
| R-P0-01 | P0 | DEFINER RPCs ainda sem `fp_assert_contexto` (F5) |
| R-P0-02 | P0 | service_role Actions sem `assertTenantContext` (F4) |
| R-P0-03 | P0 | sync-outbox main ainda full catalog (F6) |
| R-P1-01 | P1 | Callers `app/**` com `?? LOJA_MATRIZ_ID` |
| R-P1-02 | P1 | Soft-path legado se select vínculos falhar por RLS/erro |
| R-P2-01 | P2 | Contexto órfão não é DELETE automático (só ignorado) |

---

## 4. Compatibilidade

- Usuário 1 empresa / Matriz: `fp_empresa_ativa` auto; sessão resolve mesma loja.  
- Sem tabelas experimentais: `tenant.available=false` → comportamento pré-M2 (`sem_loja` se falta loja_id).  
- ADMIN global via perfil **reduzido** no helper SQL experimental (mais restrito que D9 transitório).

---

## 5. Rollback

1. Parar de carregar `loadTenantSnapshot` (reverter `sessionConsistency`).  
2. Restaurar `getGerenteLojaId` com fallback (se necessário emergência).  
3. `DROP` objetos M2 SQL (`usuario_contexto_ativo`, setters); opcionalmente restaurar `fp_lojas_permitidas` M1.  
4. Testes M2-B deixam de ser exigidos no CI até reautorização.

---

## 6. GO / NO-GO próxima fase local

| Alvo | Veredito |
|---|---|
| F1–F3 locais (esta entrega) | **GO** (testes PASS) |
| F4 (`assertTenantContext` em service_role actions) | **GO CONDICIONAL** local |
| F5–F7 DEFINER/RLS/sync | **GO CONDICIONAL** após F4 |
| Merge / DDL remoto / UI / produção | **NO-GO** |
