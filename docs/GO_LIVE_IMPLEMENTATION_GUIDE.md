# Go-Live Implementation Guide — FastProduct / Jīn Lóng ERP

> 🔒 **DOCUMENTO CONGELADO — Rodada de Implementação R1** (2026-08-04 · consolidado 2026-08-05)
> **Destinatário:** Claude Code (e qualquer agente de implementação).
> **Congelamento:** este guia, `docs/ARQUITETURA_REGRAS_NEGOCIO.md` (v2.1) e
> `docs/ENCERRAMENTO_FASE_ARQUITETURA.md` são **os três documentos de referência da rodada R1**.
> Não são editados durante a execução. Qualquer necessidade de mudança encerra R1 e abre R2.
> **Regra fundamental:** você **não decide arquitetura, não cria regra de negócio e não interpreta auditoria**.
> Tudo já foi decidido. Sua função é implementar conforme este guia e a arquitetura congelada.
> Se encontrar algo não previsto aqui: **pare e reporte**. Não improvise.
>
> ### ✅ Fila única de execução
>
> **Este é o único documento que define ordem de execução no projeto.** Nenhum outro arquivo
> — auditoria, ticket, plano ou catálogo — dita o que implementar primeiro.
>
> | Papel | Documento |
> |---|---|
> | **Fila de execução** | **este guia** (Pacotes 0–6) |
> | Autoridade normativa (o que a regra é) | `docs/ARQUITETURA_REGRAS_NEGOCIO.md` v2.1 |
> | Detalhe de ticket (como corrigir) | `docs/auditoria/**` |
>
> **Consolidação de 2026-08-05:** a segunda fila que existia em
> `docs/auditoria/GO_LIVE_MASTER_FIX_PLAN.md` foi **absorvida** por este guia e rebaixada a
> catálogo de achados. A série F1–F6.1 agora vive no **Pacote 0** (dados e parametrização) e
> dentro dos Pacotes 1, 3, 5 e 6. Mapa de absorção item a item em §4.

---

## 1. Resumo executivo do estado atual

O FastProduct/Jīn Lóng é um ERP SaaS para PMEs em fase **pré-Go-Live**. O código é maduro:
239 migrations, arquitetura de domínio consolidada em `shared-core`, 9 gates de CI executáveis,
RPCs transacionais para venda/caixa/estoque/fiscal, RLS em 199 policies.

Três rodadas de auditoria (somente leitura) mapearam **29 tickets**, **zero corrigidos**. O gargalo
nunca foi descoberta — era decisão. Em 2026-08-04 a direção aprovou **7 ADRs**, encerrando a fase de
arquitetura. O catálogo de regras foi consolidado em **35 RNs** com autoridade única declarada.

Uma frente paralela de auditoria operacional (**F1–F6.1**, 2026-08-03, base de runtime e de banco)
mapeou **39 achados** de parametrização, dados, cadastro, permissão e coerência tela↔backend.
Na consolidação de 2026-08-05 ela foi **integrada a este guia** — ver Pacote 0 e §4.

**Estado por pilar:** Produto 4/5 · Engenharia 4/5 · Operação SaaS 1/5 · Empresa 1/5.

**O que este guia entrega:** 7 pacotes de implementação (0 a 6), ordenados por dependência, cada um
com arquivos, RPCs, migrations, testes e critérios de validação. Nenhum pacote exige decisão nova.

**Fora de escopo desta rodada:** TB-02 e TB-03 (aguardam **PF-01**, parâmetro numérico de preço),
SSOT-03 (aguarda **PF-02**, fuso de agregação) e FLX-02 (decisão comercial de escopo, não de código).

---

## 2. Arquitetura oficial

Fonte única e obrigatória: **`docs/ARQUITETURA_REGRAS_NEGOCIO.md` (v2.1, congelado)**.

Leia antes de qualquer alteração. Pontos que mais importam para esta rodada:

- **Cap. 2 — Autoridade das Regras:** onde cada regra pode mudar. Corrigir **na autoridade**, nunca em volta.
- **Cap. 3 — Estados:** Produto tem **3** estados (`DRAFT/PUBLICADO/INATIVO`); `vendável` é predicado
  derivado de `evaluateProduct`. As 8 demais máquinas estão transcritas do banco.
- **Cap. 7 — Catálogo RN-001..035:** cite o `RN-XXX` em cada PR.
- **Cap. 9 — Padrão de implementação:** ordem obrigatória de correção + `npm run guard:all`.

Documentos de apoio (não normativos, **não são fila**): `docs/MATRIZ_RASTREABILIDADE.md`
(RN → ADR → autoridade → arquivos → teste → estado) · `docs/ARQUITETURA_REGRAS_NEGOCIO_VALIDACAO.md`
§7 (matriz RN→RPC→migration→tabela→trigger→tela→teste — **documento histórico**) ·
`docs/auditoria/` (detalhe de cada ticket) · `.cursor/rules/entity-ssot.mdc` (telas oficiais de CRUD).

**Exceção que não pode ser "corrigida":** `shared-core/src/pricing/calcularPrecoCanonico.ts` é espelho
offline aprovado da RPC `calcular_preco_produto`. Não remover. Alterar preço = alterar RPC **e** espelho
na mesma PR, com golden test passando.

---

## 3. ADRs aprovadas (vinculantes)

| ADR | Decisão | RN | Tickets |
|---|---|---|---|
| **ADR-001** | Fornecedor pertence à loja; isolamento por `loja_id` em todas as entidades relacionadas | RN-009 | TB-05 |
| **ADR-002** | NCM não obrigatório no cadastro; obrigatório só em operação fiscal | RN-002 | BR-02 |
| **ADR-003** | Limite de crédito parametrizável por loja: `AVISO` \| `BLOQUEIO` \| `AUTORIZACAO_GERENTE` | RN-032 | BR-01 |
| **ADR-004** | Recebimento exige conferência antes de creditar estoque; total/parcial/sobra/falta/avaria | RN-033 | FLX-04 |
| **ADR-005** | Reabertura de caixa: GERENTE+, motivo obrigatório, auditoria completa, histórico jamais apagado | RN-034 | BR-04 |
| **ADR-006** | Produto pode existir sem fornecedor; venda permitida; compra exige fornecedor | RN-030 | — |
| **ADR-007** | Produto pode existir sem custo; margem indisponível sem custo válido; **jamais assumir custo zero** | RN-031 | BR-03 |

**Não reinterprete.** Se a implementação parecer exigir desvio de uma ADR, pare e reporte.

---

## 4. Ordem de implementação — 7 pacotes (0 a 6)

Ordem determinada por dependência técnica e severidade. **Não paralelize entre pacotes**; dentro de um
pacote os itens podem ser paralelos salvo indicação.

| # | Pacote | Tickets | Prioridade | Por que nesta posição |
|---|---|---|---|---|
| **0** | **Dados e Parametrização (série F)** | F3-001, F1-01, F1-02, F1-04, F1-06, F1-14 | **P0** | Precede tudo. A base é 100% de teste (F3-001) e 7/7 lojas não têm identificação fiscal — qualquer validação de KPI, trilha ou fiscal feita antes disso mede lixo. Não é código de produto; é dado e configuração |
| **1** | **Segurança de execução (RPC/grants + policy admin)** | SEC-01, SEC-02, SSOT-01, TB-01, **F1-07, F1-08, F6-PER-001, FRN-03** | **P0** | Todos os P0 de autorização do projeto, das duas frentes. O `fallback = allow` da `adminPolicy` e o grant de `anon` são a mesma classe de defeito. Nada entra em produção antes |
| **2** | **Integridade de dados (banco)** | DAT-01, FLX-01, CA-01, DAT-03, DAT-02 | **P0/P1** | Corrige o ledger de estoque; desbloqueia a verificação de SSOT-04 |
| **3** | **Fornecedor multi-tenant (ADR-001)** | TB-05, **F2-FOR-001/F2-PROD-003** | **P0/P1** | Isolado, exige backfill; depende de banco íntegro (pacote 2). Cadastrar fornecedor real (F2-FOR-001) só faz sentido **depois** de `loja_id` existir — caso contrário o registro nasce sem tenant |
| **4** | **Compra e Recebimento (ADR-004, ADR-006)** | FLX-04 | **P1** | Depende de fornecedor por loja (pacote 3) |
| **5** | **Financeiro e Crédito (ADR-003, ADR-007)** | TB-07, BR-01, BR-03, **F1-05** | **P1** | Depende de integridade (pacote 2); independe de 3 e 4. F1-05 (formas de pagamento parametrizáveis) é do mesmo domínio |
| **6** | **Caixa, Cadastro, Auditoria e Coerência** | BR-04, TB-04, TB-06, SSOT-04, FLX-03, SSOT-05, **F6-CMP-001/RC-002, F6.1-VEN-001/RC-001, F6-AUD-001, F6.1-VEN-002, F6-INF-001**, **SSOT-02 (por último)** | **P1/P2** | Fecha reincidência (SSOT-02 é o CI que impede regressão dos pacotes 0–5). Os itens F desta linha são cálculo falso (KPI, comissão) e trilha de cadastro — mesma família de BR-04/TB-04 |

### Mapa de absorção da série F

Registro explícito de onde cada achado F1–F6.1 é executado. **Nenhum item ficou sem destino.**

| Origem | Itens | Destino |
|---|---|---|
| F3 (dados de teste) | F3-001 | **Pacote 0** |
| F1 (parametrização) | F1-01, F1-02, F1-04, F1-06, F1-14 | **Pacote 0** |
| F1 (segurança) | F1-07, F1-08 | **Pacote 1** |
| F6 (permissão) | F6-PER-001, FRN-03 | **Pacote 1** |
| F2 (fornecedor) | F2-FOR-001 / F2-PROD-003 | **Pacote 3** |
| F1 (financeiro) | F1-05 | **Pacote 5** |
| F6 / F6.1 / RC | F6-CMP-001, F6.1-VEN-001, RC-001, RC-002, F6-AUD-001, F6.1-VEN-002, F6-INF-001, F6.1-REL-001 | **Pacote 6** |
| F1 / F2 / F2B / F5 / F6 (P1–P2 de qualidade de dado) | F1-09..13, F1-15, F1-16, F2-PROD-001/002/004..010, F2-CLI-001, F2-USR-001, F2B-01/02, F5-VAL-01..15, F6-VAL-001, F6.1-PROD-001 | **Pós-R1** — `docs/auditoria/GO_LIVE_MASTER_FIX_PLAN.md` §1. Não bloqueiam Go-Live |
| F1 / F2B (fiscal, reescopado) | F1-03, F2B-03 / FRN-01 | **Condicionado a FLX-02.** Se "com fiscal" → entra no Pacote 5; se "sem fiscal" → pós-R1 |

**Fora desta rodada:** TB-02, TB-03 (aguardam **PF-01** — parâmetro de preço) · **SSOT-03 (aguarda PF-02
— qual fuso é a verdade na agregação diária)** · BR-02 (satisfeito por ADR-002 —
NCM não bloqueia venda; apenas confirmar que nenhum bloqueio existe) · FLX-02 (decisão de escopo).

> **Atualização da consolidação final (v2.1 da arquitetura):** SSOT-03 saiu do Pacote 6. Depende de
> **PF-02**, decisão funcional ainda aberta. Ver Cap. 8 de `ARQUITETURA_REGRAS_NEGOCIO.md`.
> Antes de qualquer conflito de regra durante a implementação, consultar o **Cap. 1-A — Precedência
> entre Regras (P1–P6)**: ele resolve o desempate, e o agente **não arbitra**.

---

## 5. Dependências entre tickets

```
F3-001 ─┬─> F6.1-REL-001               (limpar base antes de medir qualquer indicador)
        ├─> F6.1-VEN-001 / RC-001      (KPI validado sobre base real)
        └─> F2-USR-001                 (reter 1 Dono real)
F1-01 ──> F1-02                        (CNPJ antes de ligar a fila fiscal — se FLX-02 = "com fiscal")
F1-04 ──> F1-06 ──> F6-INF-001         (pdv_config existe → config por loja → aviso na tela)

F1-08 ──> F6-PER-001 ──> F1-07         (mapear as 9 rotas ANTES de virar fallback=deny)
SEC-02 ─┬─> SSOT-01 ─┬─> TB-01         (mesma raiz: grants/efeito de migration)
        │            │
SEC-01 ─┘            └─> SSOT-02       (CI que impede reincidência)

DAT-01 ──> CA-01 ──> SSOT-04           (quantidade gravada → escala → kardex)
FLX-01 ──> DAT-01                      (FK antes de confiar no ledger)

TB-05 ─┬─> F2-FOR-001                  (loja_id ANTES de cadastrar fornecedor real)
       └─> FLX-04                      (fornecedor por loja antes de conferência de OC)

TB-07 (independente)
BR-01 ──> (config de loja)             (ADR-003 exige parâmetro por loja)
BR-03 ──> RN-031/RN-035                (custo do servidor antes de margem)
F1-05 (independente, mesmo domínio do pacote 5)
BR-04 (independente, depende só de ADR-005)
TB-04, TB-06, FLX-03, SSOT-05 (independentes)
F5-VAL-01..04 ──> F6-AUD-001           (validar trilha ANTES de criar tabela nova)
F5-VAL-15 ─────> F6.1-VEN-002
SSOT-03 ──> PF-02 (fuso)                FORA DE R1: aguarda decisão funcional
F1-03 / F2B-03 / FRN-01 ──> FLX-02      CONDICIONADO: só entra se "Go-Live com fiscal"
```

**Regras de dependência:**

- **F3-001 precede todo o resto.** É o único item cuja ausência invalida a evidência de todos os
  outros — KPI, trilha e relatório medidos sobre base de teste não provam nada. É também o único
  destrutivo: exige backup verificado e execução prévia em staging.
- **F1-08 antes de F1-07.** Inverter o `fallback` para `deny` com rotas ainda não mapeadas derruba
  acesso legítimo. Mapear primeiro, inverter depois.
- **TB-05 antes de F2-FOR-001.** Fornecedor cadastrado antes de `loja_id` existir nasce sem tenant.
- **F5 antes de F6-AUD-001.** A frente 5 fechou com zero falhas confirmadas; presumir ausência de
  trilha sem validar em runtime produz tabela redundante.

- **SSOT-02 deve ser o último item do pacote 6.** É o CI que verifica *efeito* de migration em produção
  (`pg_get_functiondef`), e só faz sentido depois que os pacotes 1–5 produziram as migrations que ele guardará.
- **DAT-02** (numeração de migrations com 3 padrões conflitantes) afeta **todos** os pacotes: qualquer
  migration nova deve seguir o padrão validado por `npm run guard:migrations` antes de ser escrita.
- **SEC-02/SSOT-01 têm uma armadilha conhecida:** a migration `20260730093000` consta aplicada mas seu
  efeito **não está no banco** (guarda `pg_get_functiondef` falhou silenciosamente). Critério de aceite:
  verificar em produção com `pg_get_functiondef`, **não** o registro de migration aplicada.

---

## 6. Checklist de implementação por pacote

### Pacote 0 — Dados e Parametrização (P0, série F) — 🟡 PARCIAL (2026-08-05)

> **F1-04 FECHADO.** Gap real não era dado (as 5 lojas sem `pdv_config` são 100% teste/seed,
> escopo de F3-001) — era o wizard de provisionamento não compensar loja órfã se `pdv_config`
> falhasse depois. Corrigido: compensação (desativa a loja) no `catch`, mesma lógica já usada
> para o usuário de Auth. **F1-06/F1-14 PARCIAL FECHADO.** Migration `297` — whitelist de
> `chave` + `atualizado_por` gravado nos dois escritores de `configuracoes_gerais`; `loja_id`
> explicitamente não implementado (risco: toca caminho de checkout ativo em produção, ver nota
> em `AUDITORIA_F1_PARAMETRIZACAO.md`). **F3-001 e F1-02 NÃO EXECUTADOS** — F3-001 é destrutivo
> e o pré-requisito operacional (backup + restore ensaiado, §8.2/11) não está evidenciado; F1-02
> depende de **FLX-02** (decisão comercial ainda não tomada). **F1-01 investigado, não
> corrigido** — depende dos dados reais que ninguém além do cliente pode fornecer, e o "gate
> duro" citado como correção mínima parece deliberadamente relaxado para modo "Stub fiscal";
> endurecê-lo sem saber se FLX-02 decidiu "com fiscal" arrisca travar a implantação por um
> requisito que pode não se aplicar ainda. Detalhe: `docs/AUDITORIA_F1_PARAMETRIZACAO.md`
> (notas F1-01, F1-04, F1-06/F1-14).

Não é código de produto: é **dado e configuração**. Precede tudo porque os pacotes 1–6 são
verificados por evidência, e evidência sobre base 100% de teste não prova nada.

| Item | Conteúdo |
|---|---|
| **Tickets** | F3-001, F1-01, F1-02, F1-04, F1-06, F1-14 |
| **RN** | RN-009 (toda entidade pertence a uma loja), RN-022 |
| **Arquivos** | `app/admin/provisionamento/provisionamentoDefaults.ts`; `app/gerente/configuracoes/actions.ts`; wizard de provisionamento; `/admin/implantacao` |
| **RPCs** | — (majoritariamente dados e Server Actions) |
| **Migrations** | `lojas`: CNPJ/razão social/IE/endereço **NOT NULL para loja ativa não-teste**; `pdv_config` criado na mesma transação da loja; `configuracoes_gerais` com `loja_id` + `atualizado_por` |
| **Testes** | `provisionamentoDefaults.test.ts` atualizado; teste de que chave fora da whitelist é rejeitada; teste de que alteração na Loja A não afeta a Loja B |
| **Documentação** | `docs/auditoria/AUDITORIA_F3_DADOS_TESTE.md` (ordem de FK da limpeza) e `AUDITORIA_F1_PARAMETRIZACAO.md` (detalhe por item) |
| **Aceite** | `SELECT count(*) FROM lojas WHERE ativo AND cnpj IS NULL` = 0 · `COUNT(lojas ativas) = COUNT(pdv_config)` · contagem 0 para padrões `QA\|SMOKE\|CTR\|TX\|E2E\|Probe\|Demo\|PROBE_\|SMOKE_` · ≥1 Dono real ativo |
| **Armadilha** | **F3-001 é destrutivo e irreversível.** Rodar em staging primeiro, com backup verificado, na ordem de FK de `AUDITORIA_F3_DADOS_TESTE.md` §5. Nenhum `DELETE` em produção sem restore ensaiado (critério §8.2/7) |
| **Nota de escopo** | `auto_enqueue_fiscal = true` (F1-02) só se aplica se **FLX-02** decidir "Go-Live com fiscal". Sem essa decisão, F1-02 fica pendente e não bloqueia o pacote |

### Pacote 1 — Segurança de execução (P0) — ✅ FECHADO (2026-08-05)

> SEC-02, SSOT-01, TB-01: fechados — migration `20260805151822_289` aplicada e verificada em
> produção (`pg_get_functiondef`, ACL). SEC-01: exposição fechada (`anon`/`authenticated`
> revogados); `DROP` fica como limpeza P2, não-bloqueante (zero uso em `pg_stat_statements`,
> janela desde 2026-06-02). F1-07/F1-08/F6-PER-001/FRN-03: fechados em `abee0cc4`
> (`adminPolicy.ts` — cobertura de rotas, diferenciação de perfil, fallback `deny`).
> Evidência completa: `docs/auditoria/tickets_P0_seguranca.md`, `docs/auditoria/v2/01_tickets_confirmados.md`,
> `docs/auditoria/tickets_P1_P2_restantes.md`.

| Item | Conteúdo |
|---|---|
| **Tickets** | SEC-01, SEC-02, SSOT-01, TB-01, **F1-07, F1-08, F6-PER-001, FRN-03** |
| **RN** | RN-016 (permissão é do banco), RN-019 |
| **Arquivos** | `backend/supabase/migrations/` (nova migration); `pdv-importados/lib/admin/policy/adminPolicy.ts`; middleware; `pdv-importados/app/admin/produtos/*` (apenas se a Server Action divergir da RPC) |
| **RPCs** | `criar_produto_com_estoque_inicial`, `ajustar_estoque_manual`, `baixar_estoque_venda` |
| **Migrations** | 1 nova: revogar `anon` de `baixar_estoque_venda`; remover `'OPERADOR'` de `criar_produto_com_estoque_inicial`; remover a exceção por string literal `'Estoque inicial no cadastro de produto'` em `ajustar_estoque_manual`; validar loja e papel |
| **Camada de aplicação (série F)** | `adminPolicy.ts`: recursos sensíveis (`financeiro`, `comissoes`, `configuracoes`, `suspensao`) → `['DONO','ADMIN']`; mapear as **9 rotas `/admin`** ausentes de `RESOURCE_PROFILES`; **`fallback` passa de `allow` para `deny`** |
| **Testes** | Teste de autorização por perfil para cada RPC (OPERADOR deve falhar); teste que **enumera `app/admin/*` e falha se alguma rota não estiver declarada**; teste de que sessão GERENTE recebe `deny` em recurso financeiro; `guard:rpc`, `guard:routes` |
| **Documentação** | Atualizar Cap. 7 (RN-016 → `Vigente`) só após verificação em produção |
| **Armadilha** | Não usar guarda `pg_get_functiondef` como condicional de aplicação — foi exatamente o que falhou. **`fallback = deny` é mudança de comportamento com risco de quebrar rota legítima**: mapear as 9 rotas **antes** de inverter o fallback, nunca na mesma etapa |

### Pacote 2 — Integridade de dados (P0/P1) — ✅ FECHADO (2026-08-05)

> Migrations `291_estoque_baixas_integridade` e `293_documentos_fiscais_dlq_enable_rls` aplicadas
> e verificadas em produção. **DAT-02 movido para pós Go-Live** (tooling de CI, não migration de
> dado). Achado extra: o COALESCE defeituoso de DAT-01 estava em `v_kardex_unificado`, não na view
> citada no ticket original; `v_estoque_ledger_divergencia` constava aplicada e não existia em
> produção (drift classe SEC-02), restaurada. Detalhe: `docs/auditoria/tickets_P0_integridade.md`,
> `docs/auditoria/tickets_P1_P2_restantes.md`.

| Item | Conteúdo |
|---|---|
| **Tickets** | DAT-01, FLX-01, CA-01, DAT-03, DAT-02 |
| **RN** | RN-005, RN-012, RN-013 |
| **Arquivos** | `backend/supabase/migrations/`; caminho de escrita de `estoque_baixas` |
| **RPCs** | `decrementar_estoque_seguro`, `decrementar_estoque_idempotente` |
| **Migrations** | `estoque_baixas.quantidade` passa a ser gravada e vira `numeric(10,3)`; FKs de `estoque_baixas` → `vendas` e `produtos`; RLS em `documentos_fiscais_dlq`; padronização de numeração |
| **Testes** | `inventory.spec.ts`; teste de que a view de divergência deixa de zerar; teste de rejeição de órfão |
| **Documentação** | — |
| **Armadilha** | `estoque_baixas` é o **único** outlier sem FK num sistema que acerta no resto — correção pontual, não refatoração do módulo |

### Pacote 3 — Fornecedor multi-tenant (P0/P1, ADR-001/ADR-006) — 🟡 PARCIAL (2026-08-05)

> **TB-05 FECHADO.** Migration `294_fornecedores_multi_tenant` aplicada e verificada em produção:
> `loja_id NOT NULL` + FK, `uq_fornecedores_loja_cnpj`, policy `fornecedores_loja_isolado`
> (espelha `clientes_loja_isolado`). Zero backfill (tabela vazia). `importar_nfe_transacao`
> corrigida no mesmo commit — teria quebrado em runtime (`ON CONFLICT (cnpj)` não bate mais com
> a unique composta).
>
> **F2-FOR-001 NÃO FECHADO — bloqueador real é outro.** As telas de fornecedor
> (`app/gerente/fornecedores/actions.ts`, `app/admin/compras/page.tsx`) consultam colunas que
> nunca existiram no schema real (`documento`, `tipo`, `endereco_*`, `ativo`) — quebradas em
> runtime hoje, independente de TB-05. Corrigir isso é decisão de escopo (simplificar a tela
> para o schema real vs. desenhar as colunas que faltam), fora do que uma migration de
> multi-tenant resolve. Detalhe: `docs/auditoria/tickets/GO_LIVE_TICKETS_F2_CADASTROS.md`.
>
> Nenhum bloqueio foi criado em cadastro, publicação ou venda de produto (ADR-006 preservado).



| Item | Conteúdo |
|---|---|
| **Tickets** | TB-05, **F2-FOR-001 / F2-PROD-003** |
| **RN** | RN-009, RN-030 |
| **Arquivos** | `backend/supabase/migrations/`; `pdv-importados/app/admin/fornecedores/*`; considerar policy em `shared-core/src/` (hoje inexistente) |
| **RPCs** | `importar_nfe_transacao` (resolve fornecedor por CNPJ) |
| **Migrations** | `fornecedores.loja_id NOT NULL` + FK → `lojas`; **backfill obrigatório** dos registros existentes; `DROP INDEX uq_fornecedores_cnpj`; `CREATE UNIQUE INDEX (loja_id, cnpj)`; reescrever policy `fornecedores_gerente_all` para filtrar por loja |
| **Testes** | `testar_isolamento_loja` / `verificar_rls_ativo`; teste de que loja A não vê fornecedor de loja B; teste de que o mesmo CNPJ pode existir em duas lojas |
| **Documentação** | Cap. 7: RN-009 → `Vigente` após evidência |
| **Armadilha** | `ordens_compra.fornecedor_id` é `ON DELETE SET NULL` — o backfill não pode órfãos. Definir a loja de cada fornecedor pela OC/NF-e de origem; fornecedores sem vínculo exigem decisão **antes** de rodar (reportar, não adivinhar) |
| **Ordem interna** | `loja_id` **antes** do cadastro de fornecedor real (F2-FOR-001). Cadastrar primeiro cria registro sem tenant, que o backfill terá de adivinhar |
| **Limite de escopo (ADR-006)** | F2-FOR-001 destrava **Compras**. É proibido introduzir exigência de fornecedor no cadastro, na publicação ou na venda de produto — ADR-006 permite explicitamente produto sem fornecedor. Teste de regressão obrigatório |

### Pacote 4 — Compra e Recebimento (P1, ADR-004/006) — ✅ FECHADO (2026-08-05)

> Migration `295_ordem_compra_conferencia` aplicada e verificada em produção, incluindo prova
> funcional end-to-end (transação com `ROLLBACK`). Decisão de arquitetura: conferência nativa em
> `ordens_compra_itens` — `remessas` não tinha ponte estrutural com `ordens_compra`
> (`origem_tipo` citado no guia original não existe) nem a RPC de conferência que o guia mandava
> "estender" (`registrar_conferencia_remessa` não existe em produção). `receber_ordem_compra`
> muda de `(uuid,jsonb)` para `(uuid)` — credita só `quantidade_conferida`, nunca payload do
> cliente. `shared-core`/writer atualizados; contrato externo (`ReceiveOrdemCompraCommand`)
> preservado, zero mudança de UI. Detalhe: `docs/auditoria/v2/01_tickets_confirmados.md` (FLX-04).

| Item | Conteúdo |
|---|---|
| **Tickets** | FLX-04 |
| **RN** | RN-033, RN-030 |
| **Arquivos** | `shared-core/src/inventory/policies/recebimentoStatus.ts` (já tem as transições); telas `/admin/estoque/*` |
| **RPCs** | `receber_ordem_compra` (não pode creditar sem conferência), `registrar_conferencia_remessa`, `confirmar_remessa_entrada` |
| **Migrations** | Alinhar `receber_ordem_compra` ao fluxo `remessas`; suportar as 5 modalidades (total/parcial/sobra/falta/avaria) |
| **Testes** | `recebimentoStatus.spec.ts` estendido; teste de que confirmar sem conferência levanta `RECEBIMENTO_CONFERENCIA_PENDENTE` |
| **Documentação** | Cap. 3 (estados de recebimento já transcritos) |
| **Armadilha** | A migration `20260801120000` **já implementou** conferência em `remessas`. Não recriar — estender `receber_ordem_compra` para usar o fluxo existente |

### Pacote 5 — Financeiro e Crédito (P1, ADR-003/007) — 🟡 PARCIAL (2026-08-05)

> **BR-01 FECHADO.** Migration `298` — `pdv_config.modo_limite_credito`
> (AVISO/BLOQUEIO/AUTORIZACAO_GERENTE, default AVISO) + gate em
> `finalizar_venda_transacional_canonica_v4` antes de criar `contas_receber`.
> `AUTORIZACAO_GERENTE` reutiliza `tokens_desconto_gerente`. Provado com 6 cenários em
> `ROLLBACK` contra produção. Pendência sinalizada (não bloqueia — modo default é AVISO,
> nenhuma loja usa AUTORIZACAO_GERENTE): tela do caixa não tem fluxo de UI para pedir o token
> de gerente especificamente para override de crédito.
>
> **TB-07 FECHADO.** Migration `299` — guarda `PAGAMENTO_EXCEDE_SALDO` em
> `registrar_pagamento_contas_pagar` (simétrica à de `registrar_liquidacao_receber`) + CHECK
> `valor_pago <= valor_total`. Provado com 4 cenários em `ROLLBACK`.
>
> **BR-03 FECHADO.** Migration `300` — `custo_unitario_snap` passa a ser derivado de
> `produtos.preco_custo` dentro do PASSO 3 de `finalizar_venda_transacional_canonica_v4`,
> nunca aceito do payload do cliente (mesma estratégia já usada para preço no PASSO 1).
> `CREATE OR REPLACE` seguro (assinatura inalterada). Provado com 2 cenários em `ROLLBACK`:
> produto com custo definido ignora payload mentiroso e grava o valor do cadastro; produto
> sem custo grava `NULL` — nunca `0` (ADR-007).
>
> **F1-05 ainda aberto**, pausado por decisão explícita: antes de continuar, verificar em
> venda real de ponta a ponta que BR-01 + TB-07 + BR-03 convergem sem regressão no fluxo de
> caixa. Detalhe: `docs/auditoria/tickets_P1_regras_negocio.md` (BR-01, BR-03),
> `docs/auditoria/v3/03_financeiro.md` (TB-07).

| Item | Conteúdo |
|---|---|
| **Tickets** | TB-07, BR-01, BR-03, **F1-05** |
| **RN** | RN-003, RN-032, RN-031, RN-035 |
| **Arquivos** | `shared-core/src/financial/*`; RPC de venda; configuração da loja; `app/caixa/finalizarVendaValidation.ts` (F1-05) |
| **RPCs** | `registrar_pagamento_contas_pagar`, `registrar_liquidacao_receber`, `finalizar_venda_transacional_canonica_v4` |
| **Migrations** | CHECK `valor_pago <= valor_total` em `contas_pagar` (TB-07); parâmetro de modo de crédito por loja (`AVISO`/`BLOQUEIO`/`AUTORIZACAO_GERENTE`); `custo_unitario_snap` derivado no servidor; tabela `formas_pagamento` por loja (F1-05) |
| **Testes** | `financial.spec.ts`; teste de pagamento acima do saldo rejeitado; teste dos 3 modos de crédito; teste de que custo ausente → margem `NULL`, **nunca** `0`; teste de que nova forma de pagamento entra sem alterar código |
| **Documentação** | Cap. 7: RN-003, RN-031, RN-032, RN-035 |
| **Restrição de contrato (F1-05)** | **Fiado permanece OUT do piloto D0** — requisito negativo do contrato, removido pelas migrations `246_remover_venda_fiado` e `284_devolucoes_remove_fiado`. A parametrização de formas de pagamento **não** pode reintroduzi-lo |
| **Armadilha** | **ADR-007 é absoluta**: em nenhum caminho (RPC, relatório, dashboard, export) custo ausente pode virar zero. Verificar `relatorio_margem_por_venda_periodo` e `relatorio_curva_abc_periodo` |

### Pacote 6 — Caixa, Cadastro, Auditoria e Coerência (P1/P2, ADR-005)

| Item | Conteúdo |
|---|---|
| **Tickets** | BR-04, TB-04, TB-06, SSOT-04, FLX-03, SSOT-05, **F6-CMP-001/RC-002, F6.1-VEN-001/RC-001, F6-AUD-001, F6.1-VEN-002, F6-INF-001**, **SSOT-02 (por último)** — SSOT-03 removido: aguarda PF-02 |
| **RN** | RN-034, RN-010, RN-017, RN-021, RN-015, RN-028 |
| **Arquivos** | `shared-core/src/customers/policies/validateClienteInput.ts`; `pdv-importados/app/admin/clientes/customerWriter.ts`; `app/admin/funcionarios/FuncionarioEditarModal.tsx` + `actions.ts`; `app/admin/vendas/page.tsx`; `app/gerente/shared/actionHelpers.ts`; dashboards |
| **RPCs** | Nova RPC de reabertura de caixa; RPC de escrita de cliente (hoje é `INSERT` direto); `kpis_venda_eventos_gerente` (passar a ser consumida pela tela — RC-001); `resumo_comissoes_por_operador` (RC-002) |
| **Migrations** | Estado/trilha de reabertura de caixa preservando imutabilidade (mig 206); CHECK de formato CPF/CNPJ e e-mail em `clientes`; fuso da loja no histórico do operador; tabela de trilha de cadastro (F6-AUD-001) |
| **Testes** | `validateClienteInput.spec.ts` espelhado em teste de banco; teste de que reabertura sem motivo falha; teste de que histórico não é apagado; KPI validado contra `SELECT sum(total_liquido)` com >1 página e filtro de período; teste de que `comissao_percentual` persiste |
| **Documentação** | Cap. 7: RN-010, RN-017, RN-034 |
| **Decisão pendente (F6-AUD-001)** | Duas auditorias propuseram nomes diferentes para a mesma tabela de trilha de cadastro: **`auditoria_cadastros`** (`AUDITORIA_FUNCIONAL_COMPLETA_GO_LIVE.md` §B1) e **`produtos_auditoria`** (`PLANO_VALIDACAO_F5_RUNTIME.md` §C1–C3). **Escolher um nome antes de escrever a migration** — a proposta genérica (`auditoria_cadastros`, com coluna `entidade`) cobre os 16 módulos de uma vez a partir de `actionHelpers.ts`; a específica cobre só produto. Não criar as duas |
| **Ordem interna** | **F6-AUD-001 e F6.1-VEN-002 dependem de F5-VAL-01..04/15** (`PLANO_VALIDACAO_F5_RUNTIME.md`): validar em runtime **antes** de assumir que a trilha não existe. A F5 fechou com **zero falhas confirmadas** — são tickets de validação, não de correção |
| **Armadilha** | **SSOT-02 por último**: é o CI que verifica efeito real de migration. Implementado antes, guardaria um estado que ainda vai mudar |

---

## 7. Checklist de validação (obrigatório ao fim de cada pacote)

Nenhum pacote é considerado concluído sem os quatro blocos abaixo. **Regra de Evidência:** sem evidência
verificável, o status é **"Em Implementação"**, mesmo com o merge feito.

### 7.1 Testes

```bash
npm run guard:all        # 9 gates de arquitetura — falha aqui = implementação errada
npm run lint
npm run typecheck
npm run test
npm run check            # checks do backend (edge)
npm run build
```

### 7.2 Smoke (manual, por pacote)

| Pacote | Smoke mínimo |
|---|---|
| 0 | Contagem de padrões de teste (`QA\|SMOKE\|CTR\|TX\|E2E\|Probe\|Demo`) = 0 · loja ativa com CNPJ/razão/IE/endereço · toda loja ativa com linha em `pdv_config` · alterar config na Loja A não muda a Loja B |
| 1 | Login OPERADOR → tentar criar produto (deve falhar) → tentar ajustar estoque com a string literal (deve falhar) · sessão GERENTE em `/admin/financeiro` e `/admin/suspensao` → **deve receber `deny`** · rota `/admin` não declarada → **deve receber `deny`** (fallback) |
| 2 | Registrar venda → conferir `estoque_baixas.quantidade` gravada e FK íntegra |
| 3 | Loja A e loja B cadastram o **mesmo CNPJ** → ambas conseguem; nenhuma vê o fornecedor da outra · produto **sem** fornecedor continua publicável e vendável (ADR-006) |
| 4 | OC → recebimento sem conferência (deve falhar) → conferir com falta → estoque credita só o conferido |
| 5 | Pagar acima do saldo (deve falhar); produto sem custo → margem em branco, **não** zero; cadastrar nova forma de pagamento sem deploy; **fiado não aparece como opção** |
| 6 | Reabrir caixa como OPERADOR (deve falhar); como GERENTE sem motivo (deve falhar); com motivo (trilha gravada) · KPI de vendas com filtro de período e >1 página bate com `SELECT sum(total_liquido)` · editar funcionário grava `comissao_percentual` e o resumo de comissões deixa de zerar |

### 7.3 Regressão

- `npm run test:e2e:critical`
- `npm run gate:pdv` (simulador de gate de produção)
- `npm run stress:pdv:check` (consistência) — obrigatório nos pacotes 1, 2 e 5
- Paridade offline: `offlineRpcEquivalence.golden.test.ts` — obrigatório em qualquer PR que toque preço
- `npm run validate:production`

### 7.4 Auditoria / evidência

Para cada ticket fechado, registrar:

1. **Verificação em produção por introspecção**, não por registro de migration:
   `pg_get_functiondef` para RPC, `pg_constraint` para CHECK/FK/UNIQUE, `pg_policies` para RLS.
2. Link da PR aprovada e do run de CI verde.
3. Atualização do **estado da RN** no Cap. 7 (`Divergente` → `Vigente`).
4. Nota no ticket original em `docs/auditoria/` — **sem reescrever a auditoria**, apenas anexando evidência.

---

## 8. Critérios de Go-Live

O ERP é considerado apto quando **todos** os itens abaixo estiverem satisfeitos com evidência verificável.

### 8.1 Bloqueantes absolutos (sem exceção)

| # | Critério | Origem |
|---|---|---|
| 1 | Nenhum P0 aberto: SEC-01, SEC-02, SSOT-01, TB-05, DAT-01, FLX-01 fechados e **verificados em produção** | Pacotes 1–3 |
| 2 | Isolamento multi-tenant provado para toda entidade de negócio (`testar_isolamento_loja` verde) | ADR-001 / RN-009 |
| 3 | Nenhuma RPC de escrita executável por `anon`; nenhuma autorização dependente de string enviada pelo cliente | RN-016 |
| 4 | Ledger de estoque íntegro: `quantidade` gravada, FKs presentes, kardex consistente | RN-005/013 |
| 5 | `npm run guard:all` + `npm run ci` verdes na branch de release | Cap. 9 |
| 6 | Custo ausente jamais vira zero em nenhum caminho de margem/CMV | ADR-007 |
| 7 | **Base sem nenhum registro de padrão de teste** em tabela operacional; ≥1 Dono real ativo | F3-001 (Pacote 0) |
| 8 | **Loja ativa com CNPJ, razão social, IE e endereço**; toda loja ativa com linha em `pdv_config` | F1-01, F1-04 (Pacote 0) |
| 9 | **Toda rota `/admin` declarada em `RESOURCE_PROFILES`; `fallback = deny`; GERENTE recebe `deny` em recurso financeiro** | F1-07, F1-08 (Pacote 1) |
| 10 | **Nenhum indicador calculado sobre página parcial** — KPI de vendas confere com agregação de banco | RC-001 / F6.1-VEN-001 (Pacote 6) |

### 8.2 Bloqueantes operacionais (pilar Operação SaaS — hoje 1/5)

| # | Critério | Estado |
|---|---|---|
| 11 | Backup verificado com **restore testado**; RPO ≤ 24h e RTO ≤ 4h comprovados em ensaio | não evidenciado — **pré-requisito de F3-001**, que é destrutivo |
| 12 | Monitoramento e alerta ativos com dono definido e canal de plantão | parcial |
| 13 | Runbook de incidente e rollback executado ao menos uma vez em staging | `ROLLBACK_HOTLINE_PLAYBOOK.md` existe; ensaio não evidenciado |
| 14 | Trilha de auditoria íntegra: `relatorio_consistencia_vendas` sem divergência no período de homologação | verificar |

### 8.3 Bloqueantes de negócio (pilar Empresa — hoje 1/5)

| # | Critério |
|---|---|
| 15 | Decisão de escopo fiscal (FLX-02) tomada e, se "com fiscal", elo fiscal religado ponta a ponta — incluindo F1-02 (`auto_enqueue_fiscal`) e F1-03/FRN-01 (NCM na fronteira de emissão) |
| 16 | Cliente consegue **comprar, aprender, usar e cancelar** (contrato, preço, onboarding, ajuda, cancelamento) |

### 8.4 Não bloqueantes desta rodada

TB-02 e TB-03 (parâmetro de preço), SSOT-03 (aguarda PF-02), todos os P2 e os itens de
qualidade de dado da série F listados no mapa de absorção (§4) como **pós-R1**.
Registrados, fora do gate de Go-Live R1.

---

## 9. Regras de conduta para o agente implementador

1. **Não decida arquitetura.** Tudo está em `ARQUITETURA_REGRAS_NEGOCIO.md` e nas 7 ADRs.
2. **Não crie regra de negócio.** Se precisar de uma regra que não tem `RN-XXX`, **pare e reporte**.
   O prefixo `RN-XXX` é **exclusivo** do Cap. 7 da arquitetura — nunca use esse rótulo para
   nomear ticket, achado ou hipótese.
3. **Não reinterprete auditoria.** Os tickets estão fechados em veredito; implemente o que está escrito.
   **Em conflito entre uma auditoria e uma ADR, a ADR vence** — as auditorias F1–F6.1 são de
   2026-08-03 e antecedem a aprovação das ADRs (2026-08-04).
4. **Siga apenas esta fila.** Nenhum outro documento define ordem de execução. Se encontrar um
   que pareça definir, ele está superado — **pare e reporte**.
5. **Corrija na autoridade** (Cap. 2), remova duplicações, nunca crie fonte de verdade nova.
6. **Um pacote por vez**, na ordem — **começando pelo Pacote 0**. Não paralelize entre pacotes.
7. **Escopo cirúrgico:** não refatore o que não foi pedido; sinalize dívida no resumo da PR.
8. **Cite o `RN-XXX` e o ticket** em cada PR.
9. **Verifique efeito, não intenção:** migration aplicada ≠ efeito no banco. Já falhou aqui uma vez.
10. **Nunca assuma custo zero** (ADR-007), **nunca apague histórico** (ADR-005).
11. **Nada destrutivo sem restore ensaiado.** Vale sobretudo para F3-001 (Pacote 0): staging
    primeiro, backup verificado, ordem de FK documentada.
12. **Ao terminar, reporte:** o que foi feito, evidência, riscos e próximo passo.


