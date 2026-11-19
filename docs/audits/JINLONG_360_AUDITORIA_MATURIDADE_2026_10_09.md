# JINLONG 360° — Auditoria de Maturidade Técnica, Operacional e Comercial

| Campo | Valor |
|---|---|
| **Data** | 2026-10-09 |
| **Modo** | Somente leitura — **sem** implementação, refatoração, migrations remotas ou dados reais |
| **Base Git** | `origin/main` (branch de entrega: `cursor/jinlong-360-auditoria-maturidade-1966`) |
| **Método** | Reutilização de auditorias/docs existentes + inspeção de árvore de código; testes desta sessão = **NÃO EXECUTADOS** salvo quando citado |
| **Confiança na nota geral** | **Média** — forte em inventário documental; fraca em revalidação runtime desta sessão |

**Pergunta final (resumo):** amanhã, em loja real supervisionada, o núcleo PDV web (venda, preço, estoque RPC, cancel/devolução documentados) é o mais confiável; caixa/painel SSoT, backup/PITR, drift de migrations, isolamento multi-tenant e multiempresa ainda oferecem risco material — **não cobrar SaaS multi-cliente** até backup prod + isolamento + gates de domínio fechados.

---

## A. Diagnóstico executivo

### Nota geral

| | |
|---|---|
| **Nota ponderada** | **63 / 100** |
| **Classificação** | **MVP funcional** (faixa 60–74) |
| **Grau de confiança** | **Média** (±6 pontos se P0 segurança de preço ainda aberto em `main` ou se SSOT caixa já remediado em branches não mergeadas) |

### Principais pontos fortes

1. Núcleo PDV web com certificação de go-live D0 em SHA `e1327e62` (`docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md`).
2. SSoT de schema em `backend/supabase/migrations/` (ADR-011) + entity-ssot de telas oficiais (`.cursor/rules/entity-ssot.mdc`).
3. Contratos de domínio e inventários de writers (`docs/adr/ADR-005`…`011`, `docs/regras-negocio/MAPA_DOMINIOS_REGRAS_NEGOCIO.md`).
4. Suíte ampla de gates/scripts (financeiro, RLS, e2e-critical, entity-ssot) — **existência** comprovada; execução nesta auditoria **NÃO VALIDADA**.
5. Fiscal Focus com trilha de auditorias faseadas em `docs/audits/AUDITORIA_PRONTIDAO_FOCUS_NFE_*`.

### Principais fragilidades

1. **Backup/PITR de produção** `BACKUP_PRODUCTION_PENDING` / Free + Opção B JIT falhando (`docs/regras-negocio/GATE_BACKUP_PRODUCAO.md`; P0-2 FAIL).
2. **SSoT caixa/financeiro** ainda com violações documentadas (saldo cache vs \(E(c)\); painel) — `AUDITORIA_SSoT_DOMINIOS.md` (2026-10-07).
3. **Segurança tenant:** P0 `atualizarPrecoVarejoProduto` sem checagem de `loja_id` (`AUDITORIA_SEGURANCA_INTEGRIDADE_2026-09-27.md`) — **revalidação nesta sessão: NÃO VALIDADA** (código pode ter mudado; risco tratado como aberto até prova de fechamento).
4. **Drift Git × remoto** e lotes SSOT pendentes de auth (P1-02 / P0 desbloqueio em branches; não na `main` desta base).
5. **Multiempresa:** especificação fechada, execução produção **não autorizada** (`ESPEC_MULTIEMPRESA_V1.md`).
6. Prontidão cliente pagante histórica: **`NOT READY FOR PAID PILOT`** (`docs/AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md`, 2026-08-31) — convive com GO de código D0; escopos diferentes.

### Conflito de decisões (não achatar)

| Fonte | Escopo | Veredito |
|---|---|---|
| `CERTIFICACAO_GO_LIVE_E1327E62.md` | Código/release D0 web | **GO** |
| `AUDITORIA_SSoT_DOMINIOS.md` | Expansão Contábil/Importações/Intelligence | **GO CONDICIONAL** / NO-GO módulos grandes |
| `GATE_BACKUP_PRODUCAO.md` | Recuperação | **PENDING / RPO não garantido** |
| `AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md` | Piloto pago | **NOT READY** (snapshot Aug/31) |

---

## B. Matriz de maturidade

### B.1 Dimensões (pesos oficiais)

| Dimensão | Peso | Nota | Evidências-âncora | Pendências / NÃO VALIDADO |
|---|---:|---:|---|---|
| Funcionalidade operacional | 20% | **74** | Certificação D0; rotas `app/admin/*`, `app/caixa/*` | Smoke loja presencial NÃO VALIDADO nesta sessão |
| Confiabilidade e integridade | 20% | **56** | SSoT caixa VIOLAÇÃO; drift migrations; backup FAIL | Reality check Products→Cash→Financial NÃO VALIDADO aqui |
| Segurança e privacidade | 15% | **58** | Auditoria Sep/27; RLS scripts existem; LGPD mig 111 | Re-teste P0 preço; pentest; retenção jurídica |
| Arquitetura e manutenção | 15% | **72** | ADRs 005–011; entity-ssot; monorepo | Dual writers caixa/compras; desktop legado fora D0 |
| UX e usabilidade | 10% | **66** | UI/UX Aug fechado; gaps Bling/discovery | A11y/métricas PDV runtime NÃO VALIDADAS |
| Testes e qualidade | 10% | **64** | Scripts e histórico CI na certificação | **Nenhuma** suite reexecutada nesta auditoria |
| Operação e prontidão SaaS | 10% | **42** | Multiempresa spec only; backup pending; billing ABSENT | Implantação repetível / cobrança NÃO VALIDADAS |
| **Total ponderado** | 100% | **63** | | |

Cálculo: \(0.20\times74 + 0.20\times56 + 0.15\times58 + 0.15\times72 + 0.10\times66 + 0.10\times64 + 0.10\times42 = 63.3\) → **63**.

### B.2 Arquitetura (diagnóstico)

| Tema | Achado | Evidência |
|---|---|---|
| Frontend | Next.js 15 App Router em `pdv-importados`; Admin `/admin`, PDV `/caixa` | `pdv-importados/package.json`, `app/` |
| Desktop | Tauri/Vite offline — **fora do D0** | `pdv-local/`, certificação D0 |
| Backend | Supabase/Postgres, Edge (`fiscal-worker`, `sync-outbox`, …) | `backend/supabase/` |
| Boundaries | Fronteiras de domínio (não hexagonal clássico nomeado) | ADR-005…011 |
| SSoT entidades | Telas oficiais catálogo/clientes/fornecedores/estoque | `.cursor/rules/entity-ssot.mdc` |
| Contratos FE↔BE | Types + RPCs; gate types-drift existe | `check:types-drift` (execução aqui: NÃO VALIDADA) |
| Offline | Outbox desktop | Fora do piloto D0 web |

### B.3 Módulos (0–100)

Legenda de maturidade: código existente ≠ operação comprovada nesta sessão.

| # | Módulo | Nota | Existente | Incompleto / ausente | Qualidade | Testes (existência) | Risco ops | Evidências |
|---|---|---:|---|---|---|---|---|---|
| 1 | PDV / frente de caixa | **78** | Venda, scan, atalhos, abertura turno | Cadastro produto removido (intencional) | Alta no D0 | Vitest/e2e-critical docs | Médio (offline desktop fora) | `app/caixa/`; `pdv_cadastro_removido.md`; certificação |
| 2 | Cadastro produtos | **72** | Catálogo admin, tiers, imagens | Cross-write NF-e custo | Média-alta | Guards vendabilidade | P0 preço tenant (sec) | `app/admin/catalogo/`; sec audit L173–201 actions |
| 3 | Varejo / atacado | **75** | `calcular_preco_produto`, shared-core | Validação loja real NÃO VALIDADA aqui | Alta em código | Specs pricing | Baixo-médio | `shared-core`; migs pricing |
| 4 | Estoque / inventário | **70** | Saldos, kardex, transfer, NF-e import | Linha-zero / writers inventário | Média | Scripts estoque | Médio | `app/admin/estoque/*`; inventory writers |
| 5 | Compras / fornecedores | **58** | Fornecedores, OC, recebimento | 3 vias ≠ contrato econômico único; SSOT-003 | Média | Concurrency NFe scripts | **Alto** p/ expansão | SSoT audit Compras ATENÇÃO |
| 6 | Clientes | **68** | CRUD admin; LGPD cols | Consent WhatsApp FORA_D0 | Média | Parcial | Baixo | `app/admin/clientes/`; mig 111 |
| 7 | Financeiro / conciliação | **60** | Hub financeiro, CSV conciliação | Banco open banking ausente; painel vs E(c) | Média | `test:financeiro-loja` (não rodado aqui) | **Alto** | `app/admin/financeiro/`; SSoT |
| 8 | AP / AR | **62** | Abas recebíveis/contas pagar; writers | Origem opcional SSOT-011 | Média | Financeiro scripts | Médio-alto | `receivableWriter` / payable |
| 9 | Abertura / fechamento caixa | **65** | Sessão, fechar RPC | Fechamento por forma / gates; snapshot remoto pode faltar | Média | `test:pdv-caixa-financeiro` NÃO VAL. | **Alto** se painel diverge | `caixaFechamentoServer.ts`; GATE_FECHAMENTO_* |
| 10 | Fiscal NF-e/NFC-e | **64** | Fila + worker Focus; audits fase | Homolog real / cancel remoto / INSERT grant residual | Média | Fiscal-insert (NÃO VAL. aqui) | Médio | `fiscal-worker`; Focus audits; P0 desbloqueio (branch) |
| 11 | Relatórios | **55** | `app/admin/relatorios/` | Deep-links “fantasma” (UX Bling) | Média-baixa | Poucos | Médio (decisão errada) | `AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md` |
| 12 | Auditoria / rastreio | **60** | Tela auditoria + eventos venda/fiscal | Não é SIEM; cobertura parcial | Média | Timeline tests | Médio | `app/admin/auditoria/` |
| 13 | Usuários / permissões | **63** | Funcionários, matriz auth | Matriz negativa remota BLOQUEADA (BL-D0-010) | Média | RLS scripts NÃO VAL. | Médio | `AUTHORIZATION_MATRIX.md` |
| 14 | Multiempresa / multiloja | **28** | Spec D1–D19 | Execução prod não autorizada; 1 loja | Spec only | — | **Bloqueia SaaS** | `ESPEC_MULTIEMPRESA_V1.md` |
| 15 | Integrações externas | **50** | Focus; sync-outbox desktop | Bling/WhatsApp ausentes no D0 | Parcial | — | Médio | Focus audits; DIV WhatsApp |
| 16 | Backup / restauração | **25** | `backup.sh`, runbooks, CI Opção B | Free sem daily; JIT 0/30; restore prod não ensaiado | Procedimento local sintético em branch P0 | Drill sintético (outra branch) | **P0 ops** | `GATE_BACKUP_PRODUCAO.md`; P0-2 |

### B.4 Segurança e LGPD

| Controle | Implementado? | Evidência documental | Pendência |
|---|---|---|---|
| Isolamento loja (RLS/RPC) | Parcial | Policies + audits | P0/P1 Sep/27; categorias globais |
| Authn/z | Sim (perfis) | `assertGerenteSession`, matriz | Escalada via actions |
| Segredos | Processo | `.cursor/rules/security.mdc`, `.env.example` | Operação humana |
| LGPD técnica | Parcial (cols consent) | mig 111 | Fluxo jurídico/consentimento produto; exclusão/retenção **NÃO VALIDADAS** como conformidade |
| Backup/DR | **Não comprovado em prod** | GATE backup | Continuity **NO-GO** pago |
| Conformidade LGPD plena | **Não declarar** | — | Jurídico / DPA / bases legais |

### B.5 Confiabilidade operacional (cenários)

| Cenário | Status nesta auditoria |
|---|---|
| Venda multi-pagamento | **NÃO VALIDADO** (código+testes existem; não executados) |
| Venda atacado | **NÃO VALIDADO** |
| Cancelamento / devolução | **NÃO VALIDADO** (histórico certificação cita specs) |
| Atualização estoque | **NÃO VALIDADO** |
| Recebimentos parciais | **NÃO VALIDADO** |
| Sangria / suprimento | **NÃO VALIDADO** |
| Fechamento de caixa | **NÃO VALIDADO** |
| Falha de conexão / recuperação | **NÃO VALIDADO** |
| Concorrência / idempotência financeira | **NÃO VALIDADO** (scripts `test:financeiro*` existem) |

Proibido: banco compartilhado prod/homolog — **não usado** para escrita.

### B.6 UX (síntese)

| Tema | Achado | Evidência |
|---|---|---|
| PDV atalhos / recibos | Sprint crítica UI fechada (Aug) | `AUDITORIA_UI_UX_2026-08.md` |
| Discovery / vocabulário | Compras sob “Mais”; NF-e pouco exposta | `AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md` |
| Fontes/velocidade PDV | **NÃO VALIDADO** em loja real nesta sessão | — |
| i18n pt/zh | Existe; flakes E2E históricos | Certificação Playwright |
| A11y / responsivo | Dívida DS parcial | DS governance docs |

### B.7 Engenharia

| Tema | Existência | Executado aqui |
|---|---|---|
| typecheck/lint/build | Scripts monorepo | **NÃO VALIDADO** |
| Unit/integration | Vitest amplos | **NÃO VALIDADO** |
| E2E critical | Pipeline documentado PASS em `e1327e62` | **NÃO VALIDADO** agora |
| CI drift migrations | Gate `migration-remote-drift` | Estado atual CI **NÃO VALIDADO** |
| Observabilidade | System alerts / fiscal timeline | Parcial |
| Migrations segurança | Deny-list / forbidden (branches P0) | Tip #488 não mergeado em `main` |

---

## C. Riscos

### P0 — bloqueia operação ou risco crítico

| ID | Risco | Evidência |
|---|---|---|
| R-P0-1 | Sem backup/PITR comprovável em produção | `GATE_BACKUP_PRODUCAO.md`; P0-2 FAIL |
| R-P0-2 | Possível alteração de preço cross-tenant (se ainda aberto) | `AUDITORIA_SEGURANCA_…` risco #1 — **revalidar** |
| R-P0-3 | Divergência saldo caixa cache vs autoridade \(E(c)\) / painel | `AUDITORIA_SSoT_DOMINIOS.md` SSOT-001/002 |

### P1 — antes de expansão

| ID | Risco |
|---|---|
| R-P1-1 | Drift migrations SSOT / apply remoto sem auth |
| R-P1-2 | Contrato econômico NF-e entrada (163100 / R5) |
| R-P1-3 | Isolamento imagens/transfer/categorias globais (sec P1) |
| R-P1-4 | Fechamento por forma / snapshot incompleto remoto |
| R-P1-5 | Matriz negativa remota de permissões não ensaiada |

### P2 — importante, não bloqueante piloto supervisionado

| ID | Risco |
|---|---|
| R-P2-1 | UX discovery (Compras/NF-e/relatórios) |
| R-P2-2 | Desktop offline fora D0 vs expectativa comercial |
| R-P2-3 | Playwright completo flaky |

### P3 — evolução

| ID | Risco |
|---|---|
| R-P3-1 | Multiempresa SaaS |
| R-P3-2 | Integrações Bling/WhatsApp/open banking |
| R-P3-3 | Contábil / Intelligence |

---

## D. Plano de evolução (3 sprints recomendadas)

| Sprint | Foco | Dependências | Aceite objetivo | Esforço* | Benefício |
|---|---|---|---|---|---|
| **S1** | Backup prod READY + fechar/revalidar P0 segurança preço | Auth humana Pro/JIT; token | `BACKUP_PRODUCTION_READY` + prova UPDATE preço cross-loja falha | M | Desbloqueia piloto contínuo |
| **S2** | Reality Check caixa/financeiro (SSOT-001/002) + apply Lote A auth | S1; auth migrations | Painel alinhado a \(E(c)\); drift A reduzido | M–G | Integridade diária |
| **S3** | Decisão R5/163100 + fechamento por forma + matriz permissões remota | S2; comercial | R5 preenchida; smoke fechamento; BL-D0-010 parcial | M | Expansão compras/fiscal entrada |

\*Esforço relativo (P/M/G), sem calendário.

---

## E. Decisão GO/NO-GO

| Decisão | Veredito | Bloqueadores |
|---|---|---|
| 1. Piloto presencial **supervisionado** | **GO CONDICIONAL** | Backup FAIL (aceite risco explícito); smoke loja; operador treinado; sem multiempresa |
| 2. Operação real **contínua** | **NO-GO** | Backup/PITR; SSoT caixa; revalidar P0 segurança |
| 3. Comercialização **novos clientes** | **NO-GO** | Isolamento tenant; billing ABSENT; prontidão paga histórica; suporte runbook incompleto |
| 4. Expansão **SaaS multiempresa** | **NO-GO** | Spec sem execução; sync-outbox fora do cut; isolamento global tables |

---

## Comparativo Bling / Odoo / ERPNext

Somente onde há evidência verificável no repo: `docs/AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md` aponta gaps de **descoberta/vocabulário** vs Bling (não é benchmark funcional completo). Comparativo Odoo/ERPNext de paridade de módulos: **ABSENTE** como estudo formal — **não inventado**.

---

## Resposta à pergunta final

**Confiáveis o bastante para piloto supervisionado (web D0):** venda PDV, precificação documentada, fluxo de catálogo/estoque via telas oficiais, cancel/devolução cobertos por testes históricos (não reexecutados aqui), fila fiscal com worker.

**Riscos materiais no dia a dia:** fechamento/painel de caixa vs autoridade; recuperação após desastre (sem backup); possível falha de isolamento de preço entre lojas; entradas de compra sem obrigação financeira clara; drift schema se apply cego.

**Antes de cobrar pelo produto (SaaS):** backup prod READY, fechar P0 segurança tenant, Reality Check caixa→financeiro, decisão comercial NF-e entrada, matriz de suporte/implantação, e **não** vender multiempresa até a spec estar implementada e ensaiada.

---

## Apêndice — fontes reutilizadas

- `docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md`
- `docs/AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md`
- `docs/regras-negocio/AUDITORIA_SSoT_DOMINIOS.md`
- `AUDITORIA_SEGURANCA_INTEGRIDADE_2026-09-27.md`
- `docs/regras-negocio/GATE_BACKUP_PRODUCAO.md`
- `docs/architecture/ESPEC_MULTIEMPRESA_V1.md`
- `docs/AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md`
- `AUDITORIA_UI_UX_2026-08.md`
- Branches P0/P1 (não em `main`): desbloqueio backup/`163100`/SSOT-004 — citar como trabalho paralelo, não estado `main`

---

*Fim da auditoria 360°. Nenhuma alteração de produto além deste relatório.*
