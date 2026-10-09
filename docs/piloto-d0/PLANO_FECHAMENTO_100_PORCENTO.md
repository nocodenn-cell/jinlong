# Plano de fechamento 100% — Jinlong

| Campo | Valor |
|---|---|
| **Data** | 2026-10-09 |
| **Base** | Auditoria 360° (`docs/audits/JINLONG_360_AUDITORIA_MATURIDADE_2026_10_09.md`) + P0/P1 reconciliação + SSoT + segurança |
| **Princípio** | “100%” só faz sentido **por meta de negócio**. Fechar tudo de uma vez mistura piloto, SaaS e roadmap infinito. |

---

## 0. O que significa “100%”

Três metas encadeadas. Cada uma tem checklist objetiva. **Não avançar de meta sem fechar a anterior.**

| Meta | Objetivo de negócio | Nota 360° alvo | Decisão que libera |
|---|---|---|---|
| **G1 — Operação contínua 1 loja** | Loja Matriz opera todo dia com recuperação e integridade | ≥ **75** (produto em consolidação) | Operação contínua = **GO** |
| **G2 — Cobrar 1º cliente pagante** | Contrato + suporte + isolamentoação repetível (ainda 1 empresa) | ≥ **82** | Comercialização 1 cliente = **GO** |
| **G3 — SaaS multiempresa** | Várias empresas isoladas + billing | ≥ **90** | Expansão SaaS = **GO** |

Fora destas metas (Contábil, Intelligence, WhatsApp, Bling full, mobile próprio): **roadmap P3** — não entram no “100%” de G1–G2.

---

## 1. Mapa mestre do que falta (por trilha)

### Trilha H — Decisões humanas (bloqueiam engenharia)

| ID | Decisão | Dono | Desbloqueia |
|---|---|---|---|
| H1 | Backup: **upgrade Pro** **ou** ticket Supabase JIT até artifact verde | Ops/Sponsor | G1 |
| H2 | Aceite escrito restore drill prod (destino isolado) | Ops | G1 |
| H3 | Matriz NF-e **R5** = A / B / C | Comercial/Fiscal | Lote migrations + G1 parcial |
| H4 | Auth apply Lotes A→B→C (+ `08120000`) | DBA/Sponsor | Drift CI / merge #488 |
| H5 | Estratégia `163100`: apply (se R5=A) **ou** mover `pending-auth` | Eng+Comercial | Gate tip GREEN |
| H6 | Smoke presencial loja (impressora, rede, login) | Operação | G1 |
| H7 | Política comercial 1º cliente (preço, SLA, suporte) | Product | G2 |
| H8 | Autorizar execução multiempresa em prod | Sponsor | G3 |

### Trilha S — Segurança / isolamento

| ID | Item | Aceite | Meta |
|---|---|---|---|
| S1 | Revalidar e **fechar** P0 `atualizarPrecoVarejoProduto` (loja_id) | Teste negativo cross-loja FAIL + PR merge | G1 |
| S2 | Fechar P1 imagens produto tenant | Mesmo padrão | G1 |
| S3 | Fechar P1 `transferir_estoque_seguro` origem | Prova RPC | G1 |
| S4 | Remover/restringir fallback `LOJA_MATRIZ_ID` | Code + teste | G1 |
| S5 | Plano categorias/marcas/regras_preco por loja (ou doc de risco aceito) | Decisão + mig se GO | G2 |
| S6 | Matriz negativa remota de permissões (BL-D0-010) | Evidência RO + relatório | G1 |

### Trilha B — Backup / continuidade

| ID | Item | Aceite | Meta |
|---|---|---|---|
| B1 | `BACKUP_PRODUCTION_READY` (Opção A ou B verde) | Artifact &lt;25h + freshness monitor | G1 |
| B2 | Restore drill em projeto/DB isolado cronometrado | RTO medido ≤ alvo | G1 |
| B3 | Runbook incidente D0 usável na loja | Checklist 1 página + dono | G1 |
| B4 | Retenção/LGPD processo (não só colunas) | Doc jurídico + fluxo exclusão | G2 |

### Trilha I — Integridade caixa / financeiro / SSoT

| ID | Item | Aceite | Meta |
|---|---|---|---|
| I1 | Reality Check Products→Cash→Financial | Script/prova: painel = \(E(c)\) | G1 |
| I2 | SSOT-001/002: eliminar consumo enganoso de `saldo_atual`/`saldo_pdv` | Audit SSoT atualizado FECHADO | G1 |
| I3 | Fechamento por forma (Lote B) aplicado + smoke | `caixas_fechamento_formas` + fechar caixa | G1 |
| I4 | Lote C (`140000`/`140100`) sem regressão `financeiro_comando` | Diff `pg_proc` + 16/16 financeiro | G1 |
| I5 | Concilição: escopo honesto (CSV ok; open banking = fora G1) | Doc produto | G2 |

### Trilha M — Migrations / CI / #488

| ID | Item | Aceite | Meta |
|---|---|---|---|
| M1 | Merge tip #488 (quarantine `120000`) **após** caminho drift | `blocking=[]` ou política `163100` | G1 |
| M2 | Apply Lote A (sem 163100) com auth | schema + smokes A | G1 |
| M3 | Apply Lote B | idem | G1 |
| M4 | Apply Lote C | idem | G1 |
| M5 | Resolver `163100` (H3+H5) | Gate tip GREEN | G1 |
| M6 | Auth apply `08120000` (DROP POLICY fiscal) | Policy ausente + INSERT false | G1 |
| M7 | Pares HUMAN_GATE se MCP≠filename | Registry válido | G1 |
| M8 | `types-drift` + `fechamento-por-forma-prova` verdes em CI/local | Jobs PASS | G1 |

### Trilha O — Operação / qualidade / UX piloto

| ID | Item | Aceite | Meta |
|---|---|---|---|
| O1 | Smoke autenticado loja (venda, sangria, fechar, cancel) | Checklist assinado | G1 |
| O2 | Reexecutar suíte crítica local/CI e arquivar evidência | financeiro + e2e-critical PASS | G1 |
| O3 | Observabilidade mínima (Sentry/alerta) no piloto | 1 alerta real testado | G1 |
| O4 | UX discovery P2 (Compras/NF-e/relatórios fantasma) | Issues fechadas ou adiadas com aceite | G2 |
| O5 | Flakes Playwright: harness only (não “100% verde” produto) | e2e-critical estável | G2 |

### Trilha C — Comercial / SaaS

| ID | Item | Aceite | Meta |
|---|---|---|---|
| C1 | Pacote implantação 1 cliente (runbook + checklist) | Usado 1× | G2 |
| C2 | Suporte L1 (horário, canal, escalação) | Doc + responsável | G2 |
| C3 | Contrato / cobrança mensal (mesmo que manual) | Fluxo financeiro empresa | G2 |
| C4 | Multiempresa F1–Fn conforme `ESPEC_MULTIEMPRESA_V1.md` | Gates D* verdes em prod | G3 |
| C5 | Isolamento total + billing multi-tenant | Pen-test tenant + billing | G3 |

---

## 2. Programa em ondas (ordem obrigatória)

```text
ONDA 0  Decisões H1–H3 (+ kickoff H6)
   ↓
ONDA 1  Segurança S1–S4 + Backup B1–B3     →  desbloqueia risco de loja
   ↓
ONDA 2  Integridade I1–I2 + Migrations M2–M4/M6–M8 + merge M1/M5
   ↓
ONDA 3  Operação O1–O3 + Reality Check final →  GATE G1 = GO operação contínua
   ↓
ONDA 4  G2: S5, B4, I5, O4–O5, C1–C3      →  GATE G2 = GO 1º cliente pago
   ↓
ONDA 5  G3: H8, C4–C5                       →  GATE G3 = GO SaaS
```

### Onda 0 — Kickoff humano (sem código)

**Done quando:** H1 decidido (Pro vs insistir JIT); H3 R5 preenchido; janela H6 agendada.

### Onda 1 — Parar a sangria (segurança + DR)

**Paralelo permitido:** S1–S4 em PRs pequenos; B1–B2 com Ops.

**Done quando:**

- [ ] S1 fechado com prova negativa  
- [ ] B1 `BACKUP_PRODUCTION_READY`  
- [ ] B2 restore cronometrado  
- [ ] B3 runbook incidente publicado  

**STOP:** qualquer P0 segurança aberto → não iniciar Onda 2 remota.

### Onda 2 — Integridade + reconciliação schema

Ordem remota (já validada localmente):

1. Snapshot RPCs + auth humana (H4)  
2. Lote A → smoke →  
3. Lote B → smoke →  
4. Lote C → smoke →  
5. `08120000` →  
6. Fechar `163100` (H5) →  
7. Merge #488 quando `blocking=[]`  

Em paralelo código: I1–I2 (painel/E(c)).

**Done quando:** drift tip GREEN; SSoT-001/002 FECHADOS na auditoria de domínio; financeiro 16/16 + caixa smoke PASS.

### Onda 3 — Prova na loja (G1)

**Done quando:**

- [ ] O1 smoke presencial PASS  
- [ ] O2 evidências CI/local arquivadas  
- [ ] O3 alerta testado  
- [ ] Reauditoria 360° rápida: dimensão Confiabilidade ≥70, Segurança ≥70, SaaS ainda pode ser baixa  

**Gate G1:** Operação contínua = **GO** (ainda 1 loja, 1 empresa).

### Onda 4 — Cobrar (G2)

**Done quando:** C1–C3 + S5 + B4 + higiene UX O4.

**Gate G2:** Comercialização 1 cliente = **GO**.

### Onda 5 — SaaS (G3)

Só após G2 estável. Executar `ESPEC_MULTIEMPRESA_V1` por fases + isolamento + billing.

**Gate G3:** SaaS multiempresa = **GO**.

---

## 3. Critérios de aceite por gate (objetivos)

### Gate G1 — Operação contínua

| # | Critério | Prova |
|---|---|---|
| G1.1 | Backup prod fresco + restore ensaiado | Artifact + relatório RTO |
| G1.2 | Zero P0 segurança aberto | Issue/PR + teste negativo |
| G1.3 | Caixa: número do painel explicável por \(E(c)\) | Reality Check |
| G1.4 | Drift migrations tip alinhado (ou dívida zero) | CI `migration-remote-drift` GREEN |
| G1.5 | Smoke loja 1 dia típico | Checklist H6 |
| G1.6 | Runbook incidente | Doc + dono |

### Gate G2 — 1º cliente pago

| # | Critério | Prova |
|---|---|---|
| G2.1 | G1 verde | — |
| G2.2 | Implantação repetida em ambiente limpo | Checklist C1 |
| G2.3 | Suporte L1 definido | C2 |
| G2.4 | Cobrança mensal operacional (mesmo manual) | C3 |
| G2.5 | LGPD processo mínimo | B4 |

### Gate G3 — SaaS

| # | Critério | Prova |
|---|---|---|
| G3.1 | G2 verde estável | — |
| G3.2 | ≥2 empresas isoladas em prod | Testes tenant |
| G3.3 | Billing multi-tenant | Fluxo |
| G3.4 | Pen-test / matriz negativa multiempresa | Relatório |

---

## 4. O que NÃO entra no “100%” de G1–G2

- WhatsApp / marketing LGPD avançado  
- Contábil / Intelligence / Demanda / Mobile com regra própria  
- Paridade Odoo/ERPNext  
- Playwright 100% verde (harness ≠ produto)  
- Open banking  
- Desktop offline como canal D0  

Esses itens só após G2, sob roadmap P3.

---

## 5. Ordem de PRs / trabalho de engenharia (tático)

| Ordem | PR / entrega | Depende |
|---|---|---|
| 1 | Fix segurança S1 (+ S2–S4 se no mesmo domínio) | — |
| 2 | Docs/ops backup (já parcialmente em P0) + evidência B1/B2 | H1 |
| 3 | Reality Check / painel I1–I2 | — |
| 4 | Merge #488 + apply lotes (ops, não só PR) | H1, H4, preferível S1 |
| 5 | Fechamento `163100` / pending-auth | H3, H5 |
| 6 | Evidência O2 + fechar gaps CI (`types-drift` em runner saudável) | Docker/CI |
| 7 | Pacote G2 (C1–C3) | G1 |
| 8 | Multiempresa G3 | H8, G2 |

PRs abertos a preservar/consolidar (não reescrever): #488, #498/#499/#500 (docs P1/P0), #508 (360°), multiempresa M1/M2*, backup #506.

---

## 6. RACI resumido

| Papel | Responsável por |
|---|---|
| Sponsor | H1, H3, H4, H7, H8 |
| Ops/DBA | B1–B3, apply migrations, restore |
| Eng backend | S*, I*, M* código, fiscal grants |
| Eng frontend | O4, painel Reality Check UI |
| QA | O1–O2, regressão gates |
| Product | C1–C3, escopo “fora G1” |

---

## 7. Definição de “plano 100% concluído”

O plano está **100% executado** quando:

1. Gates **G1 + G2 + G3** estão **GO** com evidências arquivadas, **ou**  
2. Sponsor assina por escrito que G3 (SaaS) fica **adiado** e o “100%” contratado era só **G1** ou **G1+G2**.

Sem essa escolha, “fechar 100% de tudo” é indefinido.

**Recomendação:** assinar meta **G1+G2** como “100% do produto cobrável 1 loja”; G3 como programa separado.

---

## 8. Primeira ação (amanhã)

1. Sponsor: escolher **H1** (Pro vs JIT) e preencher **H3** (R5).  
2. Eng: abrir/fechar **S1** (P0 preço) com prova.  
3. Ops: disparar caminho backup até **B1**.  
4. Não apply remoto até B1 + S1.

---

*Plano vivo — atualizar checkboxes a cada onda. Fontes: auditoria 360°, P0 desbloqueio, P1-02, SSoT domínios, GATE backup, auditoria segurança.*
