# M2-A — GO / NO-GO

**Data:** 2026-10-08 · **Branch docs:** `cursor/m2a-empresa-ativa-contrato-1966`  
**Código base auditado:** `main` @ `ea917430`

---

## 1. Decisões fechadas nesta sprint

| # | Decisão |
|---|---|
| D-M2A-1 | Arquitetura recomendada: **híbrido** contexto persistido no servidor + revalidação por request (não JWT claim; não confiar em header/cookie sozinhos). |
| D-M2A-2 | Fontes de verdade: Auth JWT = identidade; `usuario_vinculos` = escopo; contexto ativo = seleção server-side; params cliente = só seleção. |
| D-M2A-3 | Fail-closed dual sem empresa ativa (`EMPRESA_ATIVA_OBRIGATORIA`). |
| D-M2A-4 | Abas compartilham uma empresa ativa; divergência → 409. |
| D-M2A-5 | Troca de empresa com caixa aberto: **bloquear** por default (produto pode afrouxar depois). |
| D-M2A-6 | M2-A = documentação + teste de algoritmo; **sem** DDL/ERP/UI. |
| D-M2A-7 | `migration-remote-drift` permanece FAIL humano — não mascarar. |

---

## 2. Decisões pendentes (humano)

| # | Pergunta | Impacto |
|---|---|---|
| H1 | Aprovar D-M2A-1…5 como base do M2-B? | Desbloqueia implementação local |
| H2 | Promover path `migrations-experimental-m1` (#493) vs continuar experimental? | Onde viverá F1–F2 |
| H3 | Apply seletivo SSOT / aceite drift (#488)? | CI mergeabilidade |
| H4 | Prioridade sync-outbox (F6) vs RPCs DEFINER (F5)? | Ordem P0 |
| H5 | UI seletor: Claude Code em paralelo — contrato de eventos? | F8 |
| H6 | ADMIN legado: prazo do corte D9? | Helper compat |
| H7 | Backup/restore/smoke reais (ops contínua) | Fora M2 mas bloqueia produção |

---

## 3. Bloqueadores P0 (ainda abertos)

| ID | Bloqueador | Fecha em |
|---|---|---|
| V-P0-01 | DEFINER sem `fp_*` | F5 |
| V-P0-02 | service_role Actions sem TenantContext | F4 |
| V-P0-03 | Dual sem empresa ativa (PoC M1) | F2–F3 |
| V-P0-04 | sync `x-loja-id` / catalog main | F6 (+ #493 parcial) |
| V-P0-05 | Tabelas críticas sem guarda | F7 |
| S02/S03 | `LOJA_MATRIZ_ID` fallback | F3 |
| Drift | `migration-remote-drift` | H3 |

---

## 4. Riscos residuais aceitos no desenho

- Cookie/DB contexto pode atrasar 1 request após revogação de vínculo (mitiga: revalidar sempre).  
- Imagens públicas por UUID (D5) — vazamento de URL ≠ authz de escrita.  
- Compat ADMIN global até corte.  
- Evidências N06–N12 ainda não executadas.

---

## 5. Evidências M2-A

| Item | Resultado |
|---|---|
| Contrato algoritmo 10 casos | **PASS** (`m2a-contrato-empresa-ativa.json`) |
| Inventário superfícies S01–S26 | Documentado (estático) |
| Reexecução suite M1 nesta branch | **BLOQUEADO** (SQL só no #493; não rebase) |
| CI #488 types-drift | **PASS** (tip `da0ff15d`, run 37814186308) |
| CI #488 migration-remote-drift | **FAIL** (humano) |

---

## 6. Recomendação

| Alvo | Veredito | Fundamentação |
|---|---|---|
| **Concluir sprint M2-A (desenho)** | **GO** | Contrato, mapa, matriz, plano e testes de algoritmo entregues |
| **Iniciar implementação local M2-B (F1–F3)** | **GO CONDICIONAL** | Condicionado a **H1** + manter experimental/local; sem remoto |
| **Implementar F4–F7 sem H1** | **NO-GO** | Escopo amplo demais sem aprovação |
| **Merge PRs multiempresa / #493 / #488** | **NO-GO** | Drift + experimental |
| **DDL remoto / produção / ops contínua** | **NO-GO** | Inalterado: backup/restore/smoke reais + autorização |

### Frase de autorização sugerida (humano)

> “Aprovo D-M2A-1…5 e autorizo M2-B fases 1–3 **somente** em branch experimental local, sem `db push`, sem merge, sem frontend até contrato de UI.”

Sem essa frase (ou equivalente), **não iniciar M2-B automaticamente**.
