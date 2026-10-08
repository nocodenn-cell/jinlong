# M2-A — Matriz negativa (empresa ativa e isolamento)

**Como ler `Estado`:**  
`PASS` = executado nesta sprint ou evidência reproduzível citada · `FAIL` = executado e quebrado · `NÃO EXECUTADO` = projetado, sem run · `BLOQUEADO` = depende de schema/UI/remoto não autorizado.

---

## 1. Cenários obrigatórios

| ID | Cenário | Resultado esperado | Evidência existente | Teste necessário | Estado |
|---|---|---|---|---|---|
| N01 | Usuário A acessa empresa B | Negado (`EMPRESA_NAO_AUTORIZADA` / 0 rows) | M1 C1/C3 (#493); contrato T4 | Revalidar com GUC empresa ativa | PASS (contrato T4); isolamento RLS = evidência M1 |
| N02 | Vínculo A+B sem empresa ativa | `EMPRESA_ATIVA_OBRIGATORIA`; zero acesso operacional | M1 C4 mostra lacuna (vê ambas); contrato T3 | Implementar `fp_empresa_ativa` + middleware | PASS (contrato T3); **FAIL de produto** no PoC M1 até M2-B |
| N03 | Usuário A opera loja de B | `LOJA_FORA_DA_EMPRESA` / `LOJA_NAO_AUTORIZADA` | M1 C2/C7; contrato T5/T6 | RPC + Action com loja B | PASS (contrato); RLS PoC PASS M1 |
| N04 | Empresa ativa revogada na sessão | Próxima request falha fechado | Contrato T9 (vinculo inativo) | UPDATE vinculo + request | PASS (contrato T9); **NÃO EXECUTADO** E2E sessão real |
| N05 | Header `x-loja-id` falsificado | Sync nega ou ignora como authz | main S11 ainda confia; M1 filtra catálogo mas confia header; contrato T6 | Device binding + 403 | PASS (contrato); sync main **FAIL** de isolamento (estático) |
| N06 | RPC DEFINER sem validação tenant | Deve negar após M2; hoje risco aberto | ESPEC §8; S15 | Suite PGlite por RPC P0 | **NÃO EXECUTADO** (NO-GO alterar RPCs) |
| N07 | Offline sync contexto incorreto | Rejeitar outbox de outra loja/empresa | S12 estática | Fixture dispositivo A → payload B | **NÃO EXECUTADO** |
| N08 | Troca empresa com caixa aberto | `CAIXA_ABERTO_BLOQUEIA_TROCA` | Só desenho §4.2 contrato | Action + caixa ABERTO | **NÃO EXECUTADO** |
| N09 | Export/relatório outra empresa | Vazio / 403 | S20 fallback Matriz | Relatório com dual-user | **NÃO EXECUTADO** / **NÃO VERIFICADO** |
| N10 | Storage por UUID conhecido | Read pública imagens = D5 aceito; write negado | ESPEC §10; 0 objetos prod | Upload cross-tenant | **NÃO EXECUTADO** |
| N11 | Webhook/job sem tenant | Fail closed / não processar | Cron fiscal desagendado; worker chave global | Job sintético | **BLOQUEADO** (sem job ativo); risco S14 documentado |
| N12 | Duas abas empresas diferentes | Mesma empresa ativa; request divergente → 409 | Desenho §4.5 | Playwright multi-tab | **NÃO EXECUTADO** (frontend NO-GO) |

---

## 2. Suite executada nesta sprint (M2-A)

**Arquivo:** `backend/scripts/test-m2a-contrato-empresa-ativa.mjs`  
**Comando:** `node --test backend/scripts/test-m2a-contrato-empresa-ativa.mjs`  
**Artefato:** `/opt/cursor/artifacts/m2a-contrato-empresa-ativa.json`

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| T1 | Sem auth | `NAO_AUTENTICADO` | PASS |
| T2 | Sem vínculo | `SEM_VINCULO` | PASS |
| T3 | Dual sem ativa | `EMPRESA_ATIVA_OBRIGATORIA` | PASS |
| T4 | Empresa alheia | `EMPRESA_NAO_AUTORIZADA` | PASS |
| T5 | Loja outra empresa | `LOJA_FORA_DA_EMPRESA` | PASS |
| T6 | Loja B com ativa A | `LOJA_FORA_DA_EMPRESA` | PASS |
| T7 | Única empresa auto | ok | PASS |
| T8 | Dual com ativa A | ok | PASS |
| T9 | Vínculo revogado | `SEM_VINCULO` | PASS |
| T10 | Usuário inativo | `USUARIO_INATIVO` | PASS |

**Total: 10/10 PASS** (algoritmo conceitual — não é prova de RLS/RPC em produção).

---

## 3. Evidências herdadas (não reexecutadas nesta branch)

| Suite | Onde | Resultado | Uso em M2-A |
|---|---|---|---|
| M1 isolamento 8/8 | PR #493 | PASS | Suporta N01/N03 parcial |
| M1 matriz 17/17 | PR #493 | PASS | C1–C8; C4 = lacuna dual |
| #488 types-drift | tip `da0ff15d` | PASS | P0 CI local |
| #488 migration-remote-drift | tip `da0ff15d` | FAIL | Humano — não mascarar |

Na branch M2-A (base `main`) o SQL experimental M1 **não** está presente → reexecução PGlite M1 = **BLOQUEADO** sem cherry-pick (proibido alterar/rebase #493).

---

## 4. Gaps explícitos

1. Nenhuma prova de **revogação mid-session** com cookie Supabase real.  
2. Nenhuma prova de **DEFINER** com empresa ativa.  
3. Nenhuma prova de **sync device binding**.  
4. Nenhuma prova de **exports/Storage/abas**.  

Estes são critérios de aceite de M2-B+, não desta sprint de desenho.
