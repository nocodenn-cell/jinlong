# M2-A — Plano de implementação incremental (para M2-B+)

**Escopo deste documento:** ordem de trabalho **após** aprovação humana do desenho.  
**Esta sprint (M2-A) não executa as fases abaixo.**

Dependências externas: DDL experimental (#446/#493) reconciliado; drift SSOT (#488) sob decisão humana; frontend seletor coordenado com Claude Code.

---

## 1. Fases

| Fase | Nome | Entrega | Depende | Rollback |
|---|---|---|---|---|
| **0** | Pré-requisitos | GO humano M2-A; path migrations experimental decidido; não aplicar remoto | — | — |
| **1** | Contexto persistido | Tabela `usuario_contexto_ativo` (usuario_id PK, empresa_id, loja_id null, updated_at) + RPC DEFINER `fp_set_empresa_ativa` com prova de vínculo | 0 + DDL vínculos | DROP TABLE/RPC |
| **2** | Helpers fail-closed | `fp_empresa_ativa()`; `fp_lojas_permitidas` intersecta empresa ativa; dual sem GUC/contexto → conjunto vazio | 1 + PoC `fp_*` | Restaurar corpo helpers |
| **3** | Sessão servidor | Estender `getRawSession` / `adminPolicy` com empresaId + motivos fail-closed; **remover** uso novo de `LOJA_MATRIZ_ID` (instrumentar existentes) | 1–2 | Reverter sessionConsistency |
| **4** | Server Actions service_role | Wrapper `assertTenantContext()` obrigatório em S06–S10 | 3 | Remover wrapper (volta risco) |
| **5** | RPCs DEFINER P0 | Top 5: estoque ajustar, finalizar venda, listar vendas, import NFe, transferir estoque — checagem `fp_pode_loja` + empresa | 2 | Corpo anterior |
| **6** | Sync-outbox | Device↔loja; catálogo filtrado; POST outbox valida loja do dispositivo; header não autoriza | 3 (contrato loja) | Reverter Edge |
| **7** | Guardas RLS lote 2 | `estoque`, `vendas`/`itens` (join), `movimentos_caixa` | 2 | DROP POLICY tenant_guard |
| **8** | UI seletor (fora deste agente) | Seletor empresa quando >1; bloqueio caixa na troca | 3 | Feature flag off |
| **9** | Gates | Suites N01–N12 automatizadas; CI local obrigatório | 1–7 | — |

---

## 2. Arquivos previstos (M2-B, não criar agora)

| Área | Arquivos |
|---|---|
| SQL | `backend/supabase/migrations-experimental-m1/*` ou promoções controladas |
| Sessão | `pdv-importados/lib/admin/auth/sessionConsistency.ts`, `adminPolicy.ts`, `sessionContext.ts` |
| Assert | novo `lib/admin/auth/assertTenantContext.ts` |
| Sync | `backend/supabase/functions/sync-outbox/index.ts` |
| Testes | `backend/scripts/test-m2*-*.mjs`; espelhar matriz N* |
| Docs | atualizar GATE + este plano com checkmarks |

**Proibido sem autorização:** `pdv-importados/app/**` UI, site comercial, `supabase db push`.

---

## 3. Testes e gates por fase

| Fase | Gate |
|---|---|
| 1–2 | PGlite: dual sem ativa = 0 rows; com ativa A ≠ B |
| 3 | Unit session: códigos de erro; cliente 1 equivalência Matriz |
| 4 | Smoke actions com mock session (sem service_role “nu”) |
| 5 | Negativo DEFINER por função |
| 6 | Deno/unit: catalog filter + 403 device |
| 7 | Matriz S/I/U/D nas novas tabelas |
| 9 | `npm run test:m1-matriz-negativa` + `test:m2a-*` + novos m2b verdes |

CI: **não** mascarar `migration-remote-drift`. Types-drift deve permanecer PASS.

---

## 4. Critérios de aceite M2 (implementação)

1. Dual-user sem empresa ativa → bloqueio middleware + 0 rows RLS.  
2. Dual-user com ativa A → não lê/escreve B (tabelas guardadas + RPCs P0).  
3. `x-loja-id` fora do set do dispositivo → 403.  
4. Nenhum path novo com `?? LOJA_MATRIZ_ID`.  
5. service_role actions exigem `assertTenantContext`.  
6. Cliente 1 (1 empresa): comportamento operacional equivalente.  
7. Rollback documentado testado em local.  
8. Matriz N01–N08 no mínimo PASS automatizado.

---

## 5. Ordem de dependências (diagrama)

```
DDL vínculos (#446/#493)
        ↓
F1 contexto ativo → F2 helpers fail-closed
        ↓
F3 sessão/policy → F4 actions → F8 UI
        ↓
F5 RPCs P0 → F7 mais RLS
        ↓
F6 sync-outbox (pode paralelizar após F3)
        ↓
F9 gates CI
```

---

## 6. Estimativa de invasividade (técnica, não calendário)

| Fase | Invasividade | Risco regressão Matriz |
|---|---|---|
| 1–2 | Baixa (aditivo SQL local) | Baixo se single-empresa auto |
| 3–4 | Média (auth path) | Médio — exigir equivalência |
| 5–7 | Alta (DEFINER/RLS) | Alto — bateria E1 |
| 6 | Média (Edge PDV) | Médio — smoke desktop |
| 8 | UI | Coordenação Claude Code |
