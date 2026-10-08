# Próxima fase pós-gate SSoT — decisão de capacidade

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Pré-requisito** | [ESTADO_POS_GATE_SSoT.md](./ESTADO_POS_GATE_SSoT.md) — SSOT-001…004 **GO** |
| **Implementação nesta missão** | **Nenhuma** — só análise + especificação MVP |
| **Pergunta-guia** | Qual o menor próximo investimento que aumenta mais o valor real do Jinlong sem voltar a criar contradições? |

---

## 1. Dívidas restantes — reclassificação

Nenhuma correção automática. Classificação: **P0** bloqueia operação · **P1** risco relevante · **P2** dívida controlada · **P3** melhoria.

| ID | Dívida | Evidência | Classe | Precisa antes do próximo módulo de produto? |
|----|--------|-----------|--------|-----------------------------------------------|
| D1 | `FornecedorCombobox` no form de produto | entity-ssot; SSOT-005 mitigado (writer canônico) | **P2** | Não — não bloquear; não replicar |
| D2 | `criarCliente` morto em Financeiro | Removido no #475 | **—** | N/A (fechado) |
| D3 | Offline sem CR parcial | AUDITORIA SSOT-007; v4 online tem CR | **P1** | Só se a próxima frente for offline/desktop parcial; senão documentar canal |
| D4 | D-P3 / colunas `preco_atacado` vs tiers D0 | SSOT-008 | **P2** | Não para caixa/fechamento; sim antes de pricing novo |
| D5 | Auditoria parcial em alguns domínios | INVENTARIO | **P2** | Não bloqueia MVP de capacidade cash |
| D6 | `check:edge` / Deno `deno.lock` v5 | Pré-merge: lock v5 vs Deno PATH | **P1** (CI/ambiente) | Sim para **confiança de CI edge** antes de mudar fiscal-worker; **não** bloqueia MVP SQL/UI caixa |
| D7 | Remessa vínculo textual (`origem_ref`) | UX-03; MAPA §1.8 | **P2** | Sim antes de Central de Compras / Demanda |
| D8 | Cancelamento fiscal / estado `cancelado` | SSOT-012 fechado no #475 (código); remoto Jinlong pendente | **P1** (ops apply) | Apply remoto quando autorizado; não reabrir módulo |
| D9 | Backup + restore drill piloto | `BACKUP_RESTORE_CANONICO.md`; BL-D0-009 FAIL | **P0** (ops) | Trilha **paralela** ops — não é módulo de produto; exige acesso loja/projeto temp |
| D10 | Smoke na máquina da cliente | `PROXIMA_SPRINT.md` EXT-D0-004 | **P0** (ops) | Paralelo; acesso loja |
| D11 | Fechamento de caixa só dinheiro (PIX/cartão sem conferência) | [ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md](../ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md) | **P1** (produto) | **Candidata vencedora** — capacidade existente |
| D12 | Migrations SSOT no remoto Jinlong | ESTADO_POS_GATE | **P1** (ops) | Antes de depender dos novos guards em produção |
| D13 | Assinatura enqueue 3 vs 4 args (desktop) | BACKLOG_TECNICO | **P1** | Antes de emitir fiscal real no desktop |
| D14 | `fiscal_reaper` não agendado | BACKLOG_TECNICO #20 | **P2** | Junto com ativação Focus |
| D15 | Drift Git↔prod (Fase 1B) | BACKLOG_TECNICO 10–16 | **P1** (DR) | Antes de 2ª loja / rebuild; não bloqueia fechamento por forma |

**Antes do próximo módulo de produto (código):** priorizar **D11** (fechamento por forma) e, em paralelo humano, **D9/D10/D12**. **Não** é necessário fechar D1/D4/D7/D14 para o MVP de fechamento.

---

## 2. Confrontação com a especificação do produto

Fontes: `Jinlong/06_ROADMAP.md`, `docs/piloto-d0/PROXIMA_SPRINT.md`, `docs/FEATURE_FREEZE_PILOTO.md`, `docs/ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md`, matriz de prontidão.

### Existe requisito operacional básico já prometido/documentado que entrega mais valor que um módulo novo?

**Sim.**

1. **Estabilização operacional do piloto** (smoke + backup/restore + runbook) — P0 oficial (`PROXIMA_SPRINT.md`); reduz risco de parar a loja. É **ops**, depende de acesso externo; não compete como “módulo de engenharia” autônomo neste agente.
2. **Fechamento de caixa por forma de pagamento** — documentado como gap P0/P1 na prontidão (`ONDA3`); dados já em `vendas_pagamentos`; **nunca implementado**; risco concreto de fraude/erro em PIX/cartão invisível no fechamento.
3. Módulos novos (Importações internacionais, Contábil, Intelligence, Mobile app, Demanda) estão sob **feature freeze** / gate de governança até piloto estável e ADR.

**Conclusão da confrontação:** a melhor próxima capacidade de **produto** não é um módulo novo — é **concluir a capacidade de fechamento multi-forma do domínio cash**, apoiada na autoridade \(E(c)\) acabada de fechar. A trilha ops (backup/smoke) permanece P0 em paralelo, sem substituir essa decisão de engenharia.

A recomendação anterior em `REMEDIACAO_SSOT_001_004.md` (“Importações → Contábil → Intelligence”) fica **supersedida** para a *próxima* frente imediata; permanece válida como ordem **depois** das capacidades operacionais básicas.

---

## 3. Matriz comparativa dos candidatos (módulos grandes)

Notas **1–5** (5 = melhor para o critério *agora*). Justificativas com evidência do repositório — sem reponderar para favorecer um desejo prévio.

| Critério | Central Fiscal | Importações | Contabilidade Assistida | Intelligence | Demanda / Central Compras | Mobile / Scanner |
|----------|----------------|-------------|-------------------------|--------------|---------------------------|------------------|
| Valor operacional | 4 — fila/Focus já doem no dia a dia se emitir | 3 — NF-e nacional já existe; internacional raro no piloto | 2 — loja opera sem contábil embutido | 2 — KPIs básicos já no dashboard | 3 — OC parcial já cobre pedido | 3 — scan web/desktop já existe |
| Valor comercial | 4 — NFC-e vende compliance | 4 — narrativa “importados” | 3 — diferencial B2B | 4 — storytelling DI | 3 — reposição | 3 — mobilidade |
| Urgência | 2 — piloto adia Focus (`PROXIMA_SPRINT`) | 2 — freeze + sem ADR | 1 — prematuro | 1 — freeze | 2 — remessa textual aberta | 2 — thin client não urgente |
| Dependências | 3 — Vault/cron/certificado externos | 2 — custo nacionalizado SSoT inexistente | 2 — precisa financial/fiscal estáveis + apply remoto | 3 — \(E(c)\) OK; ainda precisa dados confiáveis ponta a ponta | 2 — ADR compras + vínculo remessa | 4 — contratos já existem |
| Risco (5=baixo risco) | 2 — fiscal/legal alto | 2 — AP/estoque/custo | 2 — segundo ledger | 3 — se read-only | 3 — se só pedido | 4 — se zero regra nova |
| Complexidade (5=baixa) | 2 | 1 | 1 | 2 | 2 | 3 |
| Reutilização | 4 — worker/fila | 2 — pouco reuso do nacional | 2 | 3 — painéis | 3 — OC | 4 — RPCs existentes |
| UX | 3 — hub vs aba | 3 | 2 | 3 | 3 | 4 |
| Dados confiáveis | 3 — pós SSOT-004 | 3 — pós SSOT-003; custo nac. não | 3 — pós SSOT-001/002 | 3 — melhorou com \(E(c)\) | 3 | 4 |
| Fiscal/legal (5=sem dependência regulatória bloqueante) | 1 — SEFAZ/CSC | 2 — DI/impostos | 2 — SPED futuro | 5 | 4 | 5 |
| ROI agora | 2 | 2 | 1 | 2 | 2 | 2 |
| **Soma** | **30** | **26** | **21** | **31** | **30** | **38** |

### Capacidade existente (fora da tabela de módulos novos)

| Critério | Fechamento por forma (cash) | Estabilização ops (backup/smoke) |
|----------|----------------------------|----------------------------------|
| Valor operacional | **5** — detecta divergência PIX/cartão hoje invisível | **5** — recupera loja |
| Valor comercial | **4** — confiança do dono no dinheiro do turno | **3** — higiene, não feature de venda |
| Urgência | **5** — Onda 3 / prontidão | **5** — P0 oficial piloto |
| Dependências | **5** — \(E(c)\) GO; dados em `vendas_pagamentos` | **2** — acesso loja / projeto temp |
| Risco (baixo=5) | **4** — se **não** alterar RPC dinheiro-only | **4** — ops controlado |
| Complexidade (baixa=5) | **4** — diagnóstico já recorta MVP | **3** — pouco código, muita coordenação |
| Reutilização | **5** — CTEs existentes; `relatorio_consistencia_vendas` | **3** |
| UX | **5** — menos erro no fechamento | **2** — sem tela |
| Dados | **5** | **3** |
| Fiscal/legal | **5** | **5** |
| ROI agora | **5** | **4** (alto valor, mas não entregável só por PR de código) |
| **Soma** | **52** | **39** |

Mobile/Scanner “ganha” entre módulos novos por ser thin client barato, mas **não** supera fechar o gap de dinheiro do turno. Intelligence soma 31 por ROI/urgência baixos sob freeze.

---

## 4. DAG de dependências (código real)

```
[products] ──┐
[inventory] ─┼──► [purchases parcial] ──► (ADR) ──► Demanda / Central Compras
             └──► NF-e nacional (estoque+AP) ──► (ADR + custo nac.) ──► Importações internacionais
                                                                          │
[sales] ──► [cash E(c)] ──► Fechamento por forma (próxima)                │
        └──► [financial AR/AP] ──────────────────────────────┐            │
                                                              ├──► Contabilidade Assistida (read+conciliação)
[fiscal fila/RPC] ──► (Vault/Focus/reaper) ──► Central Fiscal │
                                                              └──► Intelligence (read-only)

[cash/sales/inventory estáveis] ──► Mobile/Scanner (thin client)
```

| Módulo / capacidade | Pode começar agora? | Depende de | Read-only inicial? | Exige ADR/contrato antes? |
|---------------------|---------------------|------------|--------------------|---------------------------|
| **Fechamento por forma** | **Sim** | SSOT-001/002 GO (feito) | Não (escreve fechamento) | Contrato Onda 3 já esboçado; checklist feature |
| Estabilização ops | Sim (humano) | Acesso loja | N/A | Runbook |
| Central Fiscal (hub/ativação) | Parcial (UI hub) / **Não** emissão | Certificado, Vault, unify enqueue desktop | UI sim | Checklist Focus |
| Importações internacionais | **Não** | SSOT-003 + ADR custo nacionalizado | Não | **Sim ADR** |
| Contabilidade | **Não** | Financial/fiscal estáveis + apply remoto | **Sim** no início | **Sim ADR** |
| Intelligence | **Não** como módulo | Números confiáveis + freeze | **Sim** obrigatório | ADR + Número Explicável |
| Demanda/Compras | **Não** | Remessa FK + ADR purchases | Pedido sim | **Sim ADR** |
| Mobile/Scanner app | Adiar | Contratos estáveis | Thin client | ADR interface |

---

## 5. Recomendação

# PRÓXIMA FASE RECOMENDADA: Fechamento de caixa por forma de pagamento

*(capacidade existente do domínio `cash` — **não** um módulo ERP novo)*

1. **Problema real:** o fechamento só confere dinheiro físico; PIX/cartão/fiado registrados em `vendas_pagamentos` não entram na conferência — divergência passa “OK” (`ONDA3`).
2. **Usuário beneficiado:** operador de caixa + gerente/dono (turno e auditoria do dia).
3. **Valor operacional:** detecta erro/fraude em meios eletrônicos no momento do fechamento.
4. **Valor comercial:** aumenta confiança no PDV Jinlong sem prometer NFC-e ou BI.
5. **Por que agora:** autoridade \(E(c)\) acabou de ser fechada; dados por forma já existem; diagnóstico e SSOT proposto já escritos; ROI máximo entre opções imediatas.
6. **Por que os outros ficam depois:** Importações/Contábil/Intelligence/Demanda violam freeze ou faltam ADR; Central Fiscal real depende de certificado/Vault; Mobile não resolve o buraco de dinheiro; ops backup é paralelo e não substitui esta entrega de produto.
7. **Dependências:** tip #476 mergeado + migrations no ambiente alvo; **não** alterar `calcular_valor_sistema_dinheiro_caixa`.
8. **Riscos:** confundir esperado por forma com \(E(c)\) da gaveta; regressão Gate 3; escopo inchado (relatórios históricos) no primeiro PR.
9. **Escopo mínimo:** ver §6 (MVP) — 1º PR = RPC read-only `calcular_valor_sistema_por_forma_caixa` + testes.
10. **Critérios de sucesso:** esperado por forma reproduzível; fechamento UI com campos por forma; `saldo_atual`/\(E(c)\) dinheiro inalterados nos testes adversariais; zero dupla contabilização.

**Trilha paralela (não misturar no mesmo PR):** estabilização ops piloto (D9/D10) + apply migrations Jinlong (D12) sob aceite humano.

---

## 6. Especificação MVP (não implementar)

### Problema
Fechamento de turno não confere valores por forma de pagamento; apenas dinheiro na gaveta.

### Usuários
Operador (fecha caixa); Gerente/Dono (audita diferença).

### Jornada atual
Abrir caixa → vender (split) → fechar com **um** valor contado → sistema compara só com \(E(c)\) dinheiro → PIX/cartão ignorados.

### Jornada proposta
Abrir → vender → fechar: UI mostra **esperado por forma** (sistema) → operador informa **contado por forma** (eletrônicos = extrato maquininha/PIX) → persiste diferenças por forma → recibo lista formas → \(E(c)\) dinheiro permanece autoridade da gaveta.

### Escopo MVP
1. RPC leitura `calcular_valor_sistema_por_forma_caixa(caixa_id)`.
2. Extensão de `fechar_caixa_atomico` (ou wrapper) para payload por forma + tabela `caixas_fechamento_formas`.
3. UI fechamento: campos por forma ativa; pré-preencher esperado.
4. Manter `p_valor_contado` / `fechamento_diferenca` dinheiro por compatibilidade.
5. Testes SQL: soma por forma (incl. split); regressão Gate 3 (dinheiro-only em \(E(c)\)/`saldo_atual`).

### Fora do escopo
- Alterar `calcular_valor_sistema_dinheiro_caixa`.
- Conciliação bancária / TEF / API PIX.
- Relatório histórico agregado (PRs seguintes Onda 3).
- Importações, Contábil, Intelligence, Mobile app, Focus real.
- Event Sourcing / CQRS / bus / microserviços.

### Domínio dono
**cash**

### Entidades
`caixas`, `vendas_pagamentos` (leitura), nova `caixas_fechamento_formas` (MVP escrita).

### Fonte de verdade
- Dinheiro gaveta: \(E(c)\) (inalterado).
- Esperado por forma: nova RPC agregando fatos de venda/AR conforme regras Onda 3 (sem substituir \(E(c)\)).
- Informado por forma: input do fechamento persistido.

### Writers autorizados
RPC de fechamento (SECURITY DEFINER / papéis atuais de fechar caixa).

### Readers
UI `/caixa` fechamento; recibo; (depois) relatórios gerente.

### Eventos
`CAIXA_FECHADO` enriquecido com breakdown por forma (ou evento filho) — sem barramento genérico.

### Contratos entre domínios
- **sales → cash:** apenas leitura de `vendas_pagamentos` / fatos já gravados; cash não reescreve venda.
- **financial → cash:** liquidações AR em dinheiro já entram em \(E(c)\); formas eletrônicas só no breakdown de esperado, não na gaveta.

### Consequências de estoque
Nenhuma.

### Consequências financeiras
Nenhuma criação de AR/AP; só auditoria de turno.

### Consequências fiscais
Nenhuma.

### Auditoria
Linhas em `caixas_fechamento_formas` + ator do fechamento (padrão atual de `fechar_caixa_atomico`).

### Número Explicável
Cada “esperado” cita forma, caixa_id, componentes (vendas/movs conforme SQL da RPC) e que **não** é \(E(c)\) salvo para `DINHEIRO`.

### Permissões
Mesmos papéis que hoje fecham caixa; sem novo perfil.

### UX principal
Tela de fechamento: lista formas com esperado | informado | diferença; destaque dinheiro = gaveta; CTA único “Fechar caixa”.

### Estados vazios/erro/loading
- Sem vendas no turno: esperados zerados, ainda exige confirmação.
- Forma não usada: ocultar ou zerar.
- Erro RPC: bloquear fechamento com mensagem acionável.
- Loading: desabilitar submit.

### Testes necessários
- SQL: split payment; PIX não altera `saldo_atual`; soma formas = total vendas pagas do turno (com regras AR).
- Vitest/component: formulário envia payload por forma.
- Regressão: adversarial Gate 3/4 intactos.
- `check:entity-ssot` se tocar boundary.

### Observabilidade
Log/metric: diferença por forma no fechamento (sem PII).

### Rollback
Feature flag ou coluna nullable: fechamento antigo (só dinheiro) continua válido se payload por forma ausente.

### Métricas de sucesso
- % fechamentos com breakdown por forma.
- Contagem de diferenças ≠ 0 em PIX/cartão (antes era 0 por definição).
- Zero regressão em testes \(E(c)\)/sangria/cancel.

---

## 7. Gate de implementação

## READY

- Problema validado (Onda 3 + prontidão).
- Domínio dono claro (`cash`).
- SSoT: \(E(c)\) dinheiro vs esperado-por-forma **separados**.
- Contratos esboçados; sem duplicar AP/estoque/fiscal.
- Dependências disponíveis (SSOT-001/002 GO; dados em `vendas_pagamentos`).
- MVP suficientemente pequeno (primeiro PR pode ser só RPC read-only).

**Condições humanas antes do 1º PR de código:**

1. Merge revisado da stack #473–#476 (ou tip #476) sem duplicar commits.
2. Decisão de apply das migrations no ambiente alvo (não Jinlong remoto sem autorização).
3. Aceite explícito do escopo MVP (sem puxar Contábil/Focus).

**Não READY para:** Importações / Contábil / Intelligence / Demanda / Mobile app / emissão Focus real — faltam ADR, freeze, ou dependências externas.

---

## 8. Saída executiva

| # | Entrega |
|---|---------|
| 1 | Estado pós-gate → [ESTADO_POS_GATE_SSoT.md](./ESTADO_POS_GATE_SSoT.md) |
| 2 | Dívidas priorizadas → §1 |
| 3 | Matriz candidatos → §3 |
| 4 | DAG → §4 |
| 5 | **Uma** capacidade → Fechamento de caixa por forma de pagamento |
| 6 | MVP → §6 |
| 7 | **READY** (capacidade escolhida) / **NOT READY** (módulos grandes) → §7 |
