# Plano incremental — multiempresa (estratégia A)

**Pré-requisito absoluto:** estabilização P0 (backup recuperável + restore + smoke + SSOT apply autorizado).  
**Sem billing** nesta trilha.  
**Frontend Claude:** não tocar UI admin/PDV nesta trilha salvo contrato RPC estável.

---

## Sprint M0 — Fechar P0 ops (paralelo)

| | |
|---|---|
| Escopo | Merge #489/#488/#485 sob aceite; backup dispatch; restore drill; smoke loja; apply SSOT seletivo |
| Dependências | Auth humana |
| Arquivos | workflows backup; migrations `20261007*` (apply seletivo) |
| Riscos | Apply `163100` sem GO comercial; regressão PIX se `120000` |
| Rollback | Não aplicar / repair status |
| Testes | Gates existentes + restore synth |
| Aceite | Artifact SUCCESS + restore DESTINO + smoke PASS |
| GO/NO-GO | **NO-GO** início M1 até backup+restore OK |

---

## Sprint M1 — DDL aditiva (D17) — **requer aprovação**

| | |
|---|---|
| Escopo | `empresas`, `usuario_vinculos`, `plataforma_admins`; `lojas.empresa_id` nullable; backfill empresa “Jinlong Matriz”; helpers `fp_*` (sem trocar policies ainda) |
| Dependências | M0 GO; aprovação humana D17 |
| Arquivos | 1–2 migrations novas; seeds; testes PGlite helpers |
| Riscos | Drift; provisionamento ainda sem empresa |
| Compat | `usuarios.perfil`/`loja_id` permanecem (D8/D17) |
| Rollback | DROP objetos novos (aditivo) |
| Testes + | Helpers retornam lojas da empresa 1 |
| Testes − | Sem vínculo → fail closed |
| Aceite | DDL em local/homolog; prod só com auth |
| GO/NO-GO etapa | Aprovar DDL antes de merge |

---

## Sprint M2 — RESTRICTIVE guards protótipo (D16)

| | |
|---|---|
| Escopo | Guarda RESTRICTIVE em 3–5 tabelas críticas (produtos, vendas, estoque, clientes, fornecedores) |
| Dependências | M1 |
| Riscos | Quebra DONO/ADMIN legados; E2E |
| Testes − | UUID cross-empresa |
| Aceite | XT-01 parcial fechado nas tabelas do protótipo |

---

## Sprint M3 — Sync-outbox redesenho (D6)

| | |
|---|---|
| Escopo | Filtrar catálogo por `loja_id` autorizado; rejeitar header sem vínculo |
| Dependências | M1 (ideal) ou filtro loja estrito temporário |
| Riscos | Desktop desatualizado |
| Aceite | XT-02 FAIL→PASS |

---

## Sprint M4 — Escopo empresa em tabelas globais (D4/D12/D13)

| | |
|---|---|
| Escopo | `empresa_id` em categorias/marcas/regras/config; migração dados |
| Dependências | M2 |
| Riscos | Dados órfãos; UI Claude |
| Aceite | XT-03 mitigado |

---

## Sprint M5 — Provisionamento + unicidade (D11)

| | |
|---|---|
| Escopo | `ensureLoja` por empresa; UNIQUE (empresa_id, codigo); remover UNIQUE global |
| Dependências | M1 + fluxos criação loja gravam empresa_id |
| Aceite | XT-07 PASS |

---

## Sprint M6 — Corte legado

| | |
|---|---|
| Escopo | Sessão empresa ativa; reduzir Padrão A; espelhar perfil→vínculos; remover fallbacks Matriz |
| Dependências | M2–M5 estáveis |
| Aceite | D18; sem LOJA_MATRIZ_ID silencioso |

---

## Fora de escopo até M6 GO

- Billing / planos comerciais  
- Schema-per-tenant (B) ou projeto-per-tenant (C)  
- Microsserviços  
- Alterações amplas de frontend (coordenar com Claude)
