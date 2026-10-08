# Gate M1 → M2 — Validação de isolamento e fechamento P0

**Data:** 2026-10-08  
**Autor:** Cloud Agent (arquitetura / segurança / QA)  
**Branches:** `#488` `da0ff15d` · `#493` `8ff9222d` (+ tip docs desta entrega)  
**Ambiente de prova:** PGlite + Postgres local scratch (`m1_gate_*`, dropado após teste) · dados sintéticos  
**Proibido nesta missão:** apply remoto, merge, deploy, frontend, produção

---

## 1. Estado terminal de CI (PRs)

| PR | Tip | Check relevante | Status | Classificação |
|---|---|---|---|---|
| **#488** | `da0ff15d` | `check:types-drift` (dentro de Supabase local gates) | **PASS** — log: `Tipos em dia com o banco: 7636 linhas.` (run `37814186308`) | Local corrigido (coluna + `financeiro_comando_v1`) |
| **#488** | `da0ff15d` | `Supabase local gates` (job completo) | **PASS** | Local |
| **#488** | `da0ff15d` | `migration-remote-drift` | **FAIL** | **Humano** — 8 SSOT `remote_ausente` + pares HUMAN_GATE + aditivas `140000`/`140100` |
| **#488** | `da0ff15d` | edge/outbox/anti-replay/gitleaks | **PASS** | — |
| **#488** | — | Vercel | SUCCESS/cancel ignored | **Não substitui CI** |
| **#485** | `92f5f22a` | `migration-remote-drift` / `e2e-playwright` | **FAIL** / **FAIL** | Drift humano; e2e **preexistente** |
| **#489** | `26ee17b9` | `e2e-playwright` | **FAIL** | **Preexistente** (docs-only) |
| **#492** | `4dfc8c89` | `e2e-playwright` | **FAIL** | **Preexistente** (docs-only) |
| **#493** | `8ff9222d` | local gates / drift | em andamento ou drift FAIL esperado | Experimental fora de `migrations/` — drift se path detectado; **não mergear** |

Evidência types-drift: `/opt/cursor/artifacts/m1-gate-488-types-drift.log`.

**Conclusão Frente A:** tip `da0ff15d` **fecha a regressão local** de types-drift. Workflow #488 permanece vermelho **somente** por `migration-remote-drift` (decisão humana). Nenhuma baseline foi alterada para mascarar falhas.

---

## 2. Revisão adversarial do M1 (#493)

### 2.1 Achados por pergunta

| Pergunta | Veredito | Detalhe |
|---|---|---|
| `empresa_id` derivado de auth confiável? | **PARCIAL** | Helpers usam `auth.uid()` → `usuario_vinculos`. App/sessão **não** resolve empresa ativa (ESPEC §9). Cliente não grava `empresa_id` nas policies PoC (escopo por `loja_id` via vínculo). |
| Operador A acessa dados B? | **BLOQUEADO nas 5 tabelas PoC** | Provas C1/C3/C7. **Não** nas demais tabelas (sem guarda). |
| Bypass RPC `SECURITY DEFINER`? | **P0 ABERTO** | M1 **não** reescreve RPCs P0 (ESPEC etapa 5). DEFINER ignora RLS — **NÃO VERIFICADO** fechamento; risco catalogado XT-04. |
| RLS cobre S/I/U/D nas 5? | **SIM (PoC)** | `AS RESTRICTIVE FOR ALL` + `USING`/`WITH CHECK` = `fp_pode_loja`. Provas INSERT/UPDATE/DELETE cross-tenant. |
| Associação empresa↔loja↔usuário? | **SIM no DDL** | FK `(loja_id, empresa_id) → lojas(id, empresa_id)` + CHECKs papel. |
| `service_role` sem escopo? | **P0 ABERTO** | `rolbypassrls=true` confirmado. Edge/Actions com service_role continuam autoridade total. |
| Exports / relatórios / Storage? | **NÃO VERIFICADO** | Fora do corte M1. |
| Sync offline? | **MITIGAÇÃO PARCIAL** | Catálogo exige loja + filtra produtos; **header `x-loja-id` ainda é autoridade** (sem vínculo dispositivo). |
| `fp_*` fail-closed? | **SIM** | Sem auth / sem vínculo → false / conjunto vazio (C5/C6 + Postgres local). |
| Dual-empresa sem seletor? | **P0 RESIDUAL** | Helpers + RLS permitem **ambas** as lojas (C4). ESPEC §9 exige fail-closed na sessão — **não implementado**. |
| Compat ADMIN legado? | **P1 / dívida** | `fp_pode_loja` retorna true para `usuarios.perfil='ADMIN'` (D9/D10) — bypass global intencional até corte. |
| Regressão loja Matriz? | **BAIXO no PoC isolado** | DDL aditivo; backfill E1. **NÃO VERIFICADO** E2E Matriz (frontend paralelo). |

### 2.2 Cobertura de isolamento (tabela × operação)

| Tabela | SELECT | INSERT | UPDATE | DELETE | Notas |
|---|---|---|---|---|---|
| `produtos` | PASS (PoC) | PASS (denied cross) | PASS (denied move) | PASS (no-op cross) | Guarda RESTRICTIVE |
| `clientes` | PASS (suite base) | **NÃO VERIFICADO** I/U/D dedicados | idem | idem | Guarda presente |
| `fornecedores` | **NÃO VERIFICADO** dedicado | — | — | — | Guarda presente; sem caso C* |
| `contas_receber` | PASS (C3) | **NÃO VERIFICADO** mutações | — | — | Guarda presente |
| `caixas` | PASS (suite base) | **NÃO VERIFICADO** mutações | — | — | Guarda presente |
| `vendas` / `itens_venda` / `estoque` / `movimentos_*` | **SEM GUARDA** | — | — | — | **Descobertas** |
| `categorias` / `marcas` / `regras_preco` | **SEM `empresa_id`** | — | — | — | Globais (D4/D12 pendentes) |
| `empresas` / `usuario_vinculos` | SELECT policy | escrita sem policy auth | — | — | Escrita só servidor (intenção) |

### 2.3 Vulnerabilidades / lacunas

| ID | Sev | Título | Estado |
|---|---|---|---|
| V-P0-01 | **P0** | RPCs SECURITY DEFINER sem `fp_pode_loja` | Aberto (M2) |
| V-P0-02 | **P0** | `service_role` em Edge/Actions sem assert de tenant | Aberto |
| V-P0-03 | **P0** | Usuário dual vê ambas empresas sem seletor de empresa ativa | Confirmado C4 |
| V-P0-04 | **P0** | sync-outbox confia em `x-loja-id` (HMAC≠vínculo dispositivo) | Mitigação parcial |
| V-P0-05 | **P0** | Tabelas críticas sem `tenant_guard` (vendas, estoque, …) | Aberto |
| V-P1-01 | **P1** | ADMIN legado = acesso global em `fp_pode_loja` | Dívida D9 |
| V-P1-02 | **P1** | Tabelas empresa (categorias/marcas/regras) sem escopo | D4/D12 |
| V-P1-03 | **P1** | Storage / exports / relatórios | NÃO VERIFICADO |
| V-P2-01 | **P2** | `lojas.codigo` UNIQUE global ainda (D11) | Provisionamento |
| V-P2-02 | **P2** | Cobertura de mutações incompleta em clientes/fornecedores/caixas | Teste |

---

## 3. Matriz de testes negativos (Frente C)

**Harness:** `npm run test:m1-matriz-negativa` → **17/17 PASS**  
**Artefato:** `/opt/cursor/artifacts/m1-matriz-negativa.json`  
**Postgres local:** apply OK + A vê 1 produto / cross B = 0 (`m1-postgres-local-negativo.log`)

| ID | Cenário | Esperado | Observado | Resultado |
|---|---|---|---|---|
| C1 | Op A / loja A1 | só A1; UUID B vazio | só A1; 0 | PASS |
| C2 | Op A2 / loja A2 (mesma empresa) | só A2; UUID A1 vazio | só A2; 0 | PASS |
| C3 | Op B / loja B1 | só B1 em produtos e CR | só B1 | PASS |
| C4 | Dual A+B | helpers listam ambas; RLS vê ambas (risco documentado) | A1+B1 | PASS (lacuna P0-03) |
| C5 | Sem vínculo | `fp_pode_loja=false`; 0 rows | false; 0 | PASS |
| C6 | Sem auth | ativo=false; pode=false; empresas=0 | f/f/0 | PASS |
| C7 | Manipulação IDs | INSERT/UPDATE/DELETE cross negados | denied / intacto | PASS |
| C8 | Sync + service_role | sem loja→400; filtro por loja; bypassrls=true | conforme | PASS |

---

## 4. Proposta mínima M2 (somente desenho)

**Objetivo:** fechar V-P0-03 e preparar contrato de autorização sem ampliar schema comercial.

### 4.1 Escopo

1. **Empresa ativa segura**  
   - Sessão server-side: `empresaId` única derivada de `usuario_vinculos` ativos.  
   - 0 empresas → bloqueio; 1 → auto; >1 sem seletor → **fail closed** (ESPEC §9).  
   - Opcional GUC `request.fp.empresa_id` setada só pelo servidor após verificação de vínculo (nunca do cliente).

2. **Contrato autorização empresa ↔ loja ↔ operador**  
   - Extender `fp_pode_loja` / novo `fp_pode_loja_empresa(loja, empresa)` exigindo `loja.empresa_id = empresa_ativa`.  
   - Dual-user deixa de ver B quando empresa ativa = A.

3. **Propagação de contexto**  
   - API/Server Actions: carregar contexto via SSOT helpers (não `LOJA_MATRIZ_ID` fallback).  
   - Offline/sync: dispositivo vinculado à loja no servidor; `x-loja-id` só seleciona entre lojas permitidas do dispositivo (fecha V-P0-04).  
   - Banco: preferir GUC/claim server-set; nunca confiar em `empresa_id` do payload.

4. **Compatibilidade loja atual**  
   - Cliente 1 (E1/Matriz): equivalência — um vínculo → mesma loja de hoje.  
   - Manter `usuarios.perfil/loja_id` espelho; ADMIN legado permanece até D9.

5. **Migração / rollback**  
   - Continuam em `migrations-experimental-m1/` até autorização.  
   - M2 = helpers + (opcional) `fp_empresa_ativa()` + testes; **sem** novas colunas comerciais.  
   - Rollback: `CREATE OR REPLACE` helpers anteriores; dropar GUC usage; sync-outbox revert se necessário.

### 4.2 Fora de escopo M2

- Telas / seletor UI completo (coordenar Claude Code).  
- Billing, categorias/marcas `empresa_id` (M3/M4).  
- Reescrita massiva de 146 policies (continua por lotes).  
- DDL remoto.

### 4.3 Critérios de aceite M2 (proposta)

- Dual-user com empresa ativa A **não** lê B.  
- Sem empresa ativa → zero rows nas tabelas guardadas.  
- Pelo menos 3 RPCs DEFINER P0 checadas com `fp_*`.  
- Sync: header loja fora do conjunto do dispositivo → 403.  
- Suite negativa C1–C8 + novos C4b (empresa ativa) verdes.

---

## 5. GO / NO-GO

| Decisão | Veredito | Condição |
|---|---|---|
| **M2 local (desenho aprovado → implementação helpers/contexto)** | **GO CONDICIONAL** | Aceitar V-P0-01…05 como backlog explícito do M2; não expandir schema; não tocar frontend sem coordenação |
| **Merge #493 / #488 / #485 / #489** | **NO-GO** automático | Drift humano e/ou e2e; #493 experimental |
| **DDL remoto M1/M2** | **NO-GO** | Autorização humana + staging + equivalência E1 |
| **Produção / ops contínua** | **NO-GO** | Backup real + restore real + smoke presencial |

---

## 6. Evidências

| Artefato | Conteúdo |
|---|---|
| `/opt/cursor/artifacts/m1-gate-488-types-drift.log` | CI types-drift PASS |
| `/opt/cursor/artifacts/m1-matriz-negativa.json` | 17 casos C1–C8 |
| `/opt/cursor/artifacts/m1-matriz-negativa.log` | runner |
| `/opt/cursor/artifacts/m1-postgres-local-apply.log` | apply SQL em Postgres local |
| `/opt/cursor/artifacts/m1-postgres-local-negativo.log` | smoke A×B em Postgres real |

## 7. Pare humano

1. Aceitar ou apply seletivo do drift #488.  
2. Aprovar (ou ajustar) desenho M2 §4 antes de código de sessão/GUC.  
3. Manter #493 draft até decisão de promoção do path experimental.
