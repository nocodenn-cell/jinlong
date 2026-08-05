# Encerramento da Fase de Arquitetura — FastProduct / Jīn Lóng ERP

> 🔒 **DOCUMENTO CONGELADO — Referência da Rodada de Implementação R1** (2026-08-04)
> **Natureza:** relatório executivo de encerramento. Somente leitura sobre o código.
> Nenhum código, migration, teste ou auditoria foi alterado nesta missão.
> Alterações em `docs/ARQUITETURA_REGRAS_NEGOCIO.md` foram exclusivamente normativas
> (registro das ADRs aprovadas e correção das contradições apontadas na validação).

---

## Respostas objetivas

### 1. Quantas auditorias foram realizadas?

**Três rodadas**, cobrindo **7 frentes**:

| Rodada | Escopo | Artefatos |
|---|---|---|
| v1 | Segurança, integridade, fluxo fiscal, regras de negócio, cálculos | `docs/auditoria/tickets_P0_*.md`, `tickets_P1_*.md` |
| v2 | + Fonte Única da Verdade (SSoT), com veredito obrigatório por hipótese | `docs/auditoria/v2/` |
| v3 | Tela ↔ Backend (lacuna arrastada das rodadas 1 e 2) | `docs/auditoria/v3/` |

Mais **duas missões de arquitetura** (não são auditorias de descoberta):
consolidação em `ARQUITETURA_REGRAS_NEGOCIO.md` e a validação de coerência
`ARQUITETURA_REGRAS_NEGOCIO_VALIDACAO.md`.

**Mais uma frente operacional, integrada em 2026-08-05:** a série **F1–F6.1** (2026-08-03),
com evidência de runtime e de banco — parametrização, dados de teste, cadastros, trilha e
coerência tela↔backend. Seus **39 achados** foram absorvidos pelo guia de implementação
(Pacote 0 e dentro dos Pacotes 1, 3, 5 e 6). Índice em `docs/auditoria/README.md`.

### 2. Quantos tickets foram consolidados?

**29 tickets**, todos com veredito. Distribuição por prefixo:

| Prefixo | IDs | Qtd |
|---|---|---|
| SEC | 01, 02 | 2 |
| DAT | 01, 02, 03 | 3 |
| FLX | 01, 02, 03, 04 | 4 |
| BR | 01, 02, 03, 04 | 4 |
| CA | 01 | 1 |
| SSOT | 01, 02, 03, 04, 05 | 5 |
| TB | 01, 02, 03, 04, 05, 06, 07 | 7 |
| DESC | 01–12 (descartados, registrados como evidência de investigação) | 12 |

**23 tickets ativos** (CONFIRMADO ou RISCO) + 12 descartados documentados. Somando os vereditos
das três rodadas: 29 registros de ticket, 6 deles P0.

**Corrigidos até esta data: zero.** Todos em **"Em Implementação"** pela Regra de Evidência.

### 3. Quantas RN foram catalogadas?

**35** (`RN-001` a `RN-035`), com autoridade única declarada e estado explícito.

| Estado | Qtd | Significado |
|---|---|---|
| Vigente | 24 | Regra e implementação coincidem |
| Divergente | 11 | Regra é a autoridade; implementação atual não a cumpre; ticket aberto |

Evolução: v1.0 tinha 22 RNs. A validação encontrou **7 regras ativas em produção sem RN**
(catalogadas como RN-023..029) e as ADRs geraram **6 novas** (RN-030..035).

### 4. Quantas ADRs foram aprovadas?

**Sete — ADR-001 a ADR-007**, todas aprovadas pela direção em 2026-08-04 e registradas no
Cap. 8 de `ARQUITETURA_REGRAS_NEGOCIO.md`.

| ADR | Decisão | Desbloqueia |
|---|---|---|
| 001 | Fornecedor pertence à loja | TB-05 (P0) |
| 002 | NCM só é obrigatório na operação fiscal | BR-02 |
| 003 | Limite de crédito parametrizável por loja (3 modos) | BR-01 |
| 004 | Recebimento exige conferência antes de creditar estoque | FLX-04 |
| 005 | Reabertura de caixa com gerente, motivo e trilha | BR-04 |
| 006 | Produto pode existir sem fornecedor | — |
| 007 | Produto pode existir sem custo; jamais assumir custo zero | BR-03 |

Observação: as ADRs aprovadas **não são idênticas** às cinco perguntas pendentes que a auditoria v3
levantou. Duas mudaram de natureza — "Go-Live com fiscal?" foi reclassificada como decisão de escopo
comercial (não bloqueia código) e "conferência: OC ou remessas?" já estava implementada em
`20260801120000` — e três decisões novas entraram (ADR-002, ADR-006, ADR-007), fechando lacunas que
ainda ficariam ambíguas.

### 5. Existem decisões arquiteturais pendentes?

**Não. Zero ADRs pendentes.**

> **Correção de 2026-08-05 (inconsistência I-03).** Este parágrafo afirmava **dois** itens
> pendentes. São **três parâmetros funcionais** (PF-01, PF-02, PF-03) mais uma decisão de
> escopo comercial. A correção já constava de `ARQUITETURA_REGRAS_NEGOCIO.md` v2.1 §11.2 e de
> `ARQUITETURA_R1_FREEZE.md` §1.6; este documento carregava a contagem anterior. **Severidade
> alta:** SSOT-03 dependia de PF-02 sem sinalização, e um agente literal o implementaria
> arbitrando o fuso sozinho.

Restam **três parâmetros funcionais** — nenhum é ADR, nenhum bloqueia os Pacotes 0–6:

| # | Parâmetro pendente | Natureza | Bloqueia |
|---|---|---|---|
| **PF-01** | Faixa válida de preço (`> 0` ou `>= 0`) e comparador atacado × varejo (`<` ou `<=`) | **Parâmetro numérico** de produto | TB-02, TB-03 — **fora do escopo de R1** |
| **PF-02** | Qual fuso é a verdade na agregação diária de vendas: fuso configurável da loja ou fuso do servidor | **Escolha de parâmetro** | SSOT-03 — **fora do escopo de R1**. *Recomendação técnica registrada: fuso da loja* |
| **PF-03** | Modo de crédito padrão no backfill de ADR-003 | **Confirmação de default** (`AVISO`) | parte de BR-01 (Pacote 5) |

E **uma decisão de escopo comercial**, que não é decisão funcional:

| Item | Natureza | Impacto |
|---|---|---|
| Go-Live com ou sem emissão fiscal (FLX-02) | **Decisão comercial de escopo** | Não bloqueia nenhum código; a infra fiscal está construída e o cron apenas desagendado (mig 285). Determina se F1-02, F1-03 e FRN-01 entram em R1 |

Nenhum dos quatro impede a execução dos pacotes planejados.

### 6. Existe alguma contradição conhecida?

**Não. As três contradições identificadas na validação foram resolvidas na v2.0 da arquitetura:**

| # | Contradição | Resolução |
|---|---|---|
| C1 | Princípio de fonte única × espelho offline de pricing | Exceção arquitetural documentada no Cap. 1, com o guard e os testes de paridade que a protegem. Marcada como **não remover** |
| C2 | Cap. 3 definia 5 estados de Produto; banco tem 3 | Cap. 3 alinhado a `DRAFT/PUBLICADO/INATIVO`; `vendável` reclassificado como predicado derivado de `evaluateProduct` |
| C3 | ADR-004 listada como pendente, mas já implementada | Ratificada como decisão aprovada, com referência à migration `20260801120000` |

Além disso, foram fechadas as lacunas de completude: `productEngine` promovido a autoridade no Cap. 2,
as 8 máquinas de estado do banco transcritas no Cap. 3, os 9 guards de CI registrados no Cap. 9 e as
7 regras órfãs catalogadas no Cap. 7.

### 7. O Claude Code possui todas as informações necessárias?

**Sim, para 25 dos 29 tickets** — a totalidade do escopo planejado para R1.

| Situação | Tickets | Informação suficiente? |
|---|---|---|
| Pacotes 1–6 do guia | SEC-01/02, DAT-01/02/03, FLX-01/03/04, BR-01/03/04, CA-01, SSOT-01..05, TB-01, TB-04..07 | **Sim** — autoridade, migration, tabela, teste e armadilha documentados |
| **Pacote 0 e itens F absorvidos** | F3-001, F1-01/02/04/06/14, F1-07/08, F6-PER-001, F2-FOR-001, F1-05, F6-CMP-001, F6.1-VEN-001, F6-AUD-001 | **Sim** — detalhe em `docs/auditoria/GO_LIVE_MASTER_FIX_PLAN.md` §3 |
| Satisfeito por ADR | BR-02 | **Sim** — ADR-002 define que não há bloqueio; resta confirmar |
| Fora de R1 por parâmetro | TB-02, TB-03 (PF-01) · SSOT-03 (PF-02) | **Não** — falta o parâmetro. Explicitamente excluídos do escopo |
| Fora de R1 por escopo | FLX-02 · F1-03/F2B-03/FRN-01 (condicionados a FLX-02) | **N/A** — decisão comercial |

O que ele tem em mãos: arquitetura congelada com 35 RNs e 7 ADRs, matriz de dependências
RN→RPC→migration→tabela→trigger→tela→teste, 7 pacotes ordenados (0–6) com checklist de arquivos/RPCs/
migrations/testes, checklist de validação em 4 blocos, critérios de Go-Live e 12 regras de conduta.

### 8. Quais riscos permanecem exclusivamente de implementação?

Riscos que **nenhuma decisão arquitetural elimina** — dependem de como o código for escrito:

| # | Risco | Severidade | Mitigação prescrita |
|---|---|---|---|
| R1 | **Migration que "consta aplicada" sem efeito no banco.** Já aconteceu com `20260730093000` (duas partes falharam silenciosamente por guarda `pg_get_functiondef`) | **Alta** | Critério de aceite por introspecção (`pg_get_functiondef`, `pg_constraint`, `pg_policies`), não por registro de migration. SSOT-02 institucionaliza isso no CI |
| R2 | **Backfill de `fornecedores.loja_id`.** Fornecedores sem vínculo de OC/NF-e não têm loja inferível | **Alta** | Guia manda **parar e reportar** em vez de adivinhar. Operação irreversível |
| R3 | **Quebra do PDV offline** ao "corrigir" o espelho de pricing em nome do Princípio 1 | **Alta** | Exceção documentada no Cap. 1 + `pricing-rpc-guard` + golden tests obrigatórios em qualquer PR de preço |
| R4 | **Custo zero fantasma** (ADR-007) escapando por relatório/dashboard/export não coberto | Média | Smoke específico + varredura de `relatorio_margem_por_venda_periodo` e `relatorio_curva_abc_periodo` |
| R5 | **Numeração de migrations com 3 padrões conflitantes** (DAT-02): ordem de aplicação ambígua entre ambientes | Média | `npm run guard:migrations` antes de escrever qualquer migration nova |
| R6 | **Ausência de teste automatizado** em RN-002, 008, 009, 011, 014 e 015 — correções nessas áreas nascem sem evidência verificável | Média | Guia exige criar o teste junto com a correção |
| R7 | **Regressão de imutabilidade de caixa** ao implementar reabertura (ADR-005) contra a mig 206 | Média | Teste de que histórico não é apagado; trilha obrigatória |
| R8 | **Escopo criativo:** agente refatorando além do pedido em código legado | Baixa | Regra 6 de conduta + `.cursor/rules/governance.mdc` |

**Riscos fora do código** (registrados, não bloqueiam a implementação): pilar Operação SaaS em 1/5
— restore não testado, ensaio de rollback não evidenciado, monitoramento parcial. Esses são critérios
de Go-Live (§8.2 do guia), não de implementação.

---

## Observações registradas (sem abrir nova frente)

Conforme instrução, itens notados durante esta missão que **não** viram ticket nem auditoria:

1. **`docs/` tem alta densidade de documentos de estado sobrepostos** (múltiplos `GO_LIVE_*`,
   `BL1_*`, `BL2_*`, `AUDITORIA_*` na raiz e em subpastas). Não é problema técnico, mas aumenta o
   risco de um agente consultar um documento superado. O congelamento desta rodada mitiga
   parcialmente ao declarar explicitamente quais são os três documentos de referência.
2. **`pdv-importados/supabase/migrations` contém 7 migrations** paralelas ao diretório canônico
   `backend/supabase/migrations` (239). Coerente com DAT-02; apenas registrado.
3. **Existem quatro gerações de `finalizar_venda_transacional`** no histórico (base, v2, v3, v4).
   Já resolvido: v2/v3 são stubs `LEGACY_DISABLED_USE_V4` com grants revogados e `guard:rpc` ativo.
   Registrado como RN-020 — nenhuma ação necessária.

---

## Estado final da fase

| Dimensão | Antes desta missão | Depois |
|---|---|---|
| Auditorias | 3 rodadas, 29 tickets, 0 corrigidos | idem — **fase encerrada** |
| ADRs pendentes | 5 | **0** |
| Contradições na arquitetura | 3 | **0** |
| RNs catalogadas | 22 | **35** |
| Regras ativas sem RN | 7 | **0** |
| Máquinas de estado documentadas | 1 (e divergente) | **9** (alinhadas ao banco) |
| Plano de execução | inexistente | **7 pacotes ordenados (0–6) com validação** |

---

# VEREDITO

## ✅ APTO PARA IMPLEMENTAÇÃO

### Justificativa técnica

**1. Nenhuma decisão arquitetural pendente.** As 7 ADRs cobrem todos os pontos que travavam execução:
isolamento de fornecedor, fronteira de obrigatoriedade fiscal, política de crédito, conferência de
recebimento, reabertura de caixa, opcionalidade de fornecedor e tratamento de custo ausente. O agente
implementador não precisa escolher modelo de dados, política de autorização nem semântica de regra.

**2. Nenhuma contradição na autoridade funcional.** As três contradições detectadas na validação de
coerência foram resolvidas na v2.0. A mais perigosa (C1) tinha potencial de fazer um agente obediente
ao documento quebrar o PDV offline; agora está explicitamente protegida.

**3. Toda regra tem autoridade nomeada e verificada no código.** As 35 RNs apontam para RPCs, triggers,
constraints e módulos que **existem** — confirmado por varredura das 239 migrations e de `shared-core`.
Nenhuma autoridade é fictícia, e nenhuma regra ativa em produção ficou fora do catálogo.

**4. O escopo de R1 é integralmente implementável sem criar regra nova.** Os 7 pacotes (0–6) cobrem 25 dos 29
tickets. Os 4 restantes foram **explicitamente excluídos** com motivo declarado (2 por parâmetro numérico
não decidido, 1 por decisão comercial, 1 satisfeito por ADR) — o agente não vai tropeçar neles achando
que deveria implementá-los.

**5. Existe caminho de evidência para cada correção.** Critério de aceite por introspecção de banco,
9 gates de CI executáveis, smoke por pacote e regras de regressão. A Regra de Evidência é aplicável
na prática, não apenas declarada.

### Condição de validade deste veredito

APTO **para o escopo R1 definido** — os 7 pacotes (0–6). **Não** é declaração de aptidão para Go-Live:
os critérios de Go-Live (§8 do guia) incluem bloqueantes operacionais e de negócio ainda não atendidos,
notadamente restore testado, ensaio de rollback e o pilar Empresa em 1/5.

### Nota final de governança

Três rodadas de auditoria produziram 29 tickets e zero correções. O desequilíbrio apontado pelo EMS
— estrutura muito à frente das evidências — está agora resolvido na única direção que o resolvia:
**decisão tomada e execução liberada.** A partir desta data, o indicador que importa deixa de ser
"tickets mapeados" e passa a ser **"tickets fechados com evidência verificada em produção"**.
O primeiro relatório dessa métrica deve sair ao fim do Pacote 1.
