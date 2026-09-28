# UX-02.1 — Lacunas do Blueprint fechadas, correções seguras e decisões de produto

| Campo | Valor |
|---|---|
| Data | 2026-09-18 |
| Base | `docs/BLUEPRINT_OPERACIONAL_UX02.md` + `docs/AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md` |
| Modo | Engineer loop autônomo — investigar → verificar → implementar se seguro → testar → commit local. **Sem push, sem PR.** |
| Regra | Autonomia de engenharia ≠ autonomia para inventar regra de produto. Onde a correção dependia de decidir comportamento de negócio, **parei e registrei aqui.** |
| Legendas | **[C]** confirmado no código · **[I]** inferido, não executado · **[?]** não verificado |

---

## 1. O que foi corrigido (9 commits locais, `5e953be5..b5346fc9`)

| # | Commit | Item | O que mudou | Toca regra/RPC/schema? |
|---|---|---|---|---|
| 1 | `e45e4445` | **BP-A3** | Link "NF-e #…" de Contas a pagar abre a importação de origem | Não |
| 2 | `e4deed1a` | **BP-E1 / D5** | Aba "A pagar" aceita `?fornecedor_id=` (UUID validado) | Não |
| 3 | `ace1613c` | **BP-E1 / A2** | NF-e concluída informa as contas a pagar geradas + links Financeiro/Estoque | Não (só leitura) |
| 4 | `3d91092d` | **E3** | Estado vazio de Contas a pagar deixa de prometer "lançar nova conta" | Não (só copy) |
| 5 | `c4949f45` | **E12** | Mensagem de venda cita a "Conta a receber gerada" quando a RPC criou título | Não (só feedback) |
| 6 | `82229e17` | **PDV → admin** | Menu Operações do PDV ganha "Painel de gestão" (GERENTE/DONO/ADMIN, nova aba) | Não (mesma regra do middleware) |
| 7 | `54c869c9` | **BP-F1** (mitigação) | Ajuda no campo de vínculo com OC + aviso de duplicidade no pedido em trânsito + teste de caracterização | Não (só texto/teste) |
| 8 | `dbfaaca7` | **A1** | Formulário de "Entrada sem nota" limpa após confirmar (evita 2º clique duplicar) | Não |
| 9 | `b5346fc9` | **BP-E1 / D5** | Fornecedores: atalho "Contas a pagar" por linha | Não |

**Verificações:** typecheck limpo · `npm run lint` 0 erros (1 warning pré-existente em e2e) · `check:entity-ssot` OK · suíte completa: **261 arquivos passam**; 1 falha pré-existente de ambiente (`produtosFiscalEdicao.integration.test.ts` exige Postgres local — `fetch failed` no setup). Testes de regressão dos itens 1 e 8 tiveram **verificação de mutação** (desligar a correção derruba o teste).

**Limite da verificação:** o comportamento de UI foi provado por testes de componente em jsdom; **não** foi visto num navegador real (exige login Supabase). **Nenhum banco foi consultado ou alterado.**

---

## 2. Decisões de produto necessárias

### D-1 · Vínculo Pedido de compra ↔ Entrada de mercadoria (E1 + BP-F1)

**QUESTÃO.** O que deve acontecer com uma Ordem de Compra quando a mercadoria dela é recebida por outro caminho (Entrada sem nota ou NF-e)? Hoje nada.

**EVIDÊNCIA.**
- Existem **três motores independentes** que creditam estoque: `receber_ordem_compra` (OC), `criar_confirmar_remessa_entrada` (entrada sem nota) e `confirmar_importacao_nfe` (NF-e) [C].
- **Não existe nenhuma relação persistida entre eles.** Único FK envolvendo OC: `ordens_compra_itens.ordem_id → ordens_compra` (`109_ordens_compra.sql`). `remessas` e `importacoes_nfe` não referenciam OC [C]. O único elo comum é `fornecedor_id`.
- `criar_confirmar_remessa_entrada(p_origem, p_observacao, p_itens, p_idempotency_key)` não recebe id de OC e não toca `ordens_compra` [C, `20260828150000_…sql`]. `receber_ordem_compra` exige `status = 'EM_TRANSITO'` e conferência completa, e não consulta remessas [C, `20260805193920_295_…sql`].
- O campo "Vincular a uma Ordem de Compra" (S8/RM-14, "Opção 1") **só valida**: recusa OC já `RECEBIDA` e nada mais [C, `actions.ts`, `actions.validation.ts`]. Foi decisão consciente e documentada da S8.
- **Demonstração técnica** (análise estática + teste de caracterização `actions.vinculoOc.naoBaixaOc.characterization.test.ts`): com OC `EM_TRANSITO` vinculada, a action chama a RPC sem o id da OC e não escreve em `ordens_compra`. Logo a OC continua "Em trânsito" e o botão "Registrar recebimento" do pedido segue disponível.
- **[I]** O cenário de dupla entrada de estoque **não foi executado contra um banco** — é consequência direta dos dois caminhos acima, não uma reprodução ponta a ponta.

**OPÇÕES.**
1. **Só avisar** (o que foi feito agora): a UI diz que o vínculo não baixa o pedido e que lançar por dois caminhos duplica o estoque. Risco residual permanece.
2. **Vínculo estruturado** entrada → pedido (novo campo/FK + status Total/Parcial, como o Bling documenta) e a entrada passa a mudar o estado da OC. Exige migration + mudança de RPC.
3. **O pedido deixa de ter "Receber" próprio** e sempre recebe via Nota fiscal de entrada / Entrada sem nota, com vínculo. Muda a jornada de Compras.

**IMPACTO.** (1) nenhum. (2) fecha a duplicidade e habilita "pedido ↔ nota ↔ contas a pagar"; toca schema, 2 RPCs e o ADR-008. (3) simplifica o modelo mental, mas é a mudança mais visível.

**DECISÃO NECESSÁRIA.** Escolher 1, 2 ou 3 (recomendação do Blueprint: 1 agora, 2 depois de dados reais de uso). Qualquer que seja, **o texto de ajuda e o aviso do commit 7 devem ser revistos**.

---

### D-2 · "Entrada de mercadoria" e a exposição no menu (E2)

**QUESTÃO.** Como o lojista encontra "lançar a nota fiscal de entrada"? Menu novo, página de decisão ou só rotular melhor dentro do hub de Estoque?

**EVIDÊNCIA.**
- Hoje a NF-e é a 4ª de 5 abas do hub Estoque ("Importar NF-e") e há um botão no cabeçalho de Estoque [C]. Fornecedores/Compras/Comissões estão no grupo "Mais", fechado por padrão [C].
- **Conflito com decisões registradas:** `adminV2SidebarNav.test.ts` trava (a) "CORE tem no máximo 10 itens (Sprint 6 — redução de carga cognitiva)" — o CORE já tem exatamente 10 — e (b) "recebimento e transferências não são entradas separadas na sidebar" (hubs). O commit `d428eaed` subiu Recebimento/Relatórios de "Mais" para o CORE com o argumento "tarefa diária de loja"; depois o hub de Estoque absorveu o Recebimento.
- Logo: **adicionar "Nota fiscal de entrada" ao menu ou promover Compras/Fornecedores exige revogar decisões travadas em teste.**

**OPÇÕES.**
1. **Manter o menu**; só nomear pela intenção dentro do hub ("Importar NF-e" → "Nota fiscal de entrada"; "Recebimento" → "Entrada sem nota").
2. **Levantar o teto de 10 / a regra "hub, não sidebar"** e expor "Nota fiscal de entrada" e "Compras" no menu (o regrupamento do Blueprint §4.1).
3. **Página "Entrada de mercadoria"** com 3 portas (nota / sem nota / pedido) — exige decidir D-1.
4. Busca global por intenção.

**IMPACTO.** (1) baixo, resolve parte do vocabulário. (2) muda a navegação de todos os clientes. (3) resolve a descoberta por inteiro, depende de D-1.

**DECISÃO NECESSÁRIA.** Confirmar se a decisão de Sprint 6 (≤10 itens + hubs) **continua valendo** ou é substituída pelo Blueprint. Nada de navegação foi alterado por isso.

---

### D-3 · Contas a pagar independentes de NF-e (E3)

**QUESTÃO.** O Jinlong terá contas a pagar que não nascem de uma NF-e (aluguel, energia, frete avulso)?

**EVIDÊNCIA.**
- Não existe caminho de criação manual: nenhum `INSERT` em `contas_pagar` no app e nenhuma RPC de criação; a única origem é `confirmar_importacao_nfe` [C]. A tela já avisa: *"Contas a pagar vêm só da importação de NF-e — sem lançamento manual"* (`contas_pagar.origem_nfe_hint`).
- **A única promessa falsa era o estado vazio** ("…ou lance uma nova conta a pagar" / zh "新增") — corrigida (commit 4).
- Existem categorias financeiras de despesa ("usadas nos lançamentos") sem lançamento de despesa que as use.
- ADR-010 dá ao Financial a autoridade de AP, mas lista só `PayableReader` e `PayablePaymentService` — **não há `PayableWriter`** no contrato.

**OPÇÕES.** (a) permitir conta a pagar manual (descrição, fornecedor opcional, categoria, valor, vencimento, parcelas) — exige novo writer/RPC; (b) manter AP = só NF-e e tratar despesas em outro módulo depois.

**IMPACTO.** (a) faz "quanto devo" refletir o negócio real; toca ADR-010, RPC e RLS. (b) mantém o modelo, mas "quanto devo" fica incompleto.

**DECISÃO NECESSÁRIA.** (a) ou (b). **Não foi inventado lançamento manual.**

**Achados de qualidade de dado (exigem migration, também bloqueados):** títulos gerados pela NF-e saem com `descricao` vazia e `nfe_numero` recebe o número da **duplicata**, não o da NF-e [C, `20260830110000_…sql:126-135`]. Correção = alterar `confirmar_importacao_nfe` (+ backfill).

---

### D-4 · Venda a prazo (E12)

**QUESTÃO.** O que é "venda a prazo" no Jinlong: quando nasce um título, com que vencimento, com quais formas de pagamento, e o "fiado" é permitido?

**EVIDÊNCIA.**
- A RPC de finalização **rejeita** a forma de pagamento `FIADO` (`FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO`) [C].
- Mas se sobra **saldo pendente** (soma das parcelas < total) **e há cliente**, a RPC valida o limite de crédito (`pdv_config.modo_limite_credito`: `AVISO` / `BLOQUEIO` / `AUTORIZACAO_GERENTE`) e **cria `contas_receber`** com `valor_aberto = saldo` [C, `20260902140300_…sql`]. Sem cliente: erro `SALDO_PENDENTE_EXIGE_CLIENTE`.
- **O título nasce sem vencimento**: a coluna `contas_receber.vencimento` existe (nullable) e o `INSERT` da RPC não a preenche [C]. Ou seja, "a prazo" sem prazo.
- Copy do produto que convive: "Novas vendas fiado estão desabilitadas" (Financeiro), "Criação e baixa de fiado foram desabilitadas", e "Valor máximo permitido para compras a prazo" (limite de crédito em Clientes) [C, `pt.json`]. A aba Financeiro dizia "somente leitura", mas permite Liquidar, Estornar e "Novo título a receber" [C].

**O que foi feito sem decidir nada:** a mensagem de venda passou a citar a conta a receber que a RPC **já** cria (commit 5). Não alterei regra de crédito, formas de pagamento nem quando o título nasce. **Não toquei** nas frases "fiado desabilitado": corrigi-las exigiria dizer qual é a política.

**OPÇÕES.** (a) "A prazo" = pagamento parcial com cliente (como hoje) e passa a se chamar assim na UI, com vencimento obrigatório; (b) forma explícita "A prazo/Fiado" reabilitada; (c) sem crédito: saldo pendente deixa de gerar título.

**IMPACTO.** (a)/(b) exigem definir vencimento (schema/RPC); (c) remove funcionalidade e afeta o limite de crédito.

**DECISÃO NECESSÁRIA.** Definir o modelo (a/b/c), o vencimento e a copy oficial. Só depois vale reescrever os subtítulos do Financeiro/Clientes.

---

### D-5 · Fiscal (não tocado)

Fora do escopo desta missão e **bloqueado por regra**: o vínculo Venda ↔ Documento fiscal (`venda_id` como UUID cru; badge "Emitida" derivado de `vendas.numero_nf`, que **[I]** nenhuma migração atualiza) e o escopo real da NFC-e (modo stub) dependem de decisão fiscal. Nada foi alterado.

---

## 3. Itens do Blueprint NÃO implementados e por quê

| Item | Por quê |
|---|---|
| **BP-F1 (correção de fato)** | Exige decidir como a OC muda de estado (D-1) e alterar RPC. Feita só a mitigação de UX. |
| **E1 — vínculo OC ↔ NF-e ↔ Recebimento** | **Não há relação de dados** para deep-link; criar exige FK/migration (STOP). Implementado somente o que usa IDs existentes: NF-e ↔ Contas a pagar ↔ Fornecedor. |
| **E2 — menu / página "Entrada de mercadoria"** | Contraria decisões travadas em teste (D-2) e a página depende de D-1. |
| **E3 — lançamento manual de conta a pagar** | Decisão de produto (D-3). |
| **E12 — semântica da venda a prazo, vencimento, copy de "fiado"** | Decisão de produto (D-4). |
| Rótulos novos ("Nota fiscal de entrada", "Entrada sem nota", "Pedidos de compra") | Matriz de nomenclatura ainda não foi aprovada; renomear sozinho seria decisão de produto. |
| Recibo de venda com "saldo a receber" | Continuação natural do commit 5, mas mexe no layout de impressão; fora do escopo seguro. |
| KPIs de Contas a pagar com total real (BP-F3) | Candidato à próxima missão (correção de leitura, sem RPC); não estava na lista desta. |
| Migração de dados de AP (`descricao`, `nfe_numero`) | Migration + backfill (D-3). |

---

## 4. Correções ao Blueprint UX-02 (errata)

1. **ERRO NO BLUEPRINT — BP-D3 e §2.2.** O Blueprint sugeria, após receber um pedido, o CTA/texto *"Tem a nota? Lance-a em Nota fiscal de entrada"*. **Isso induz a creditar o estoque duas vezes**: a OC já creditou; a NF-e credita de novo, e nada as liga. **Substituído por:** após receber o pedido, oferecer apenas "Ver estoque", e — enquanto D-1 não sair — **avisar** (como no commit 7), nunca **orientar** a lançar a nota. O mesmo vale para o aviso "há pedido em trânsito deste fornecedor" ao importar uma NF-e: só como alerta, nunca como caminho.
2. **§3 F10 (venda a prazo).** O Blueprint tratava "fiado desabilitado" como contradição de copy. Correção: o texto é **verdadeiro** para a *forma* `FIADO`; a ambiguidade real é a coexistência com o crédito por saldo pendente e a **ausência de vencimento** (D-4).
3. **§4.1 / BP-B1 (menu sem "Mais").** Conflita com a decisão de Sprint 6 (≤10 no CORE + hubs). O item vira **dependente de D-2**, não S1 automática.
4. **§5 N-4 ("quanto devo a um fornecedor").** Agora existe caminho real: Fornecedores › "Contas a pagar" (`?tab=pagar&fornecedor_id=`). Continua faltando o **total em aberto por fornecedor** (KPI de AP soma só as linhas carregadas — BP-F3).
5. **Status dos itens do catálogo §11:** **feitos** BP-A3, A1, D5 (filtro + atalho), E3-copy, PDV→painel (B5); **parciais** BP-A2 (resumo de contas + 2 links; faltam produtos novos, etiquetas, aviso de fornecedor criado), BP-D4 (mensagem; falta recibo), BP-A6 (só o estado vazio), BP-F1 (só mitigação); **bloqueados** BP-B1/B2, BP-E1..E3, E12, BP-F2/F3.
6. **Roadmap.** S1 ("Achar") passa a **começar por D-2** (decisão), S2/S4/S5/S6 estão **parcialmente entregues**, S8 (integridade) depende de D-1 e D-3. Ordem revisada: **S0 (D-1..D-4) → S2' (restante) → S3 (Início) → S5' (KPIs reais de AP) → S1 (menu, se D-2 liberar) → S8**.

---

## 5. Próxima missão recomendada

**UX-03 — Decisões + KPIs reais + Início que orienta.** Uma sessão de decisão (D-1, D-2, D-3, D-4) de ~90 min com dono de produto, mais duas entregas autônomas que **não dependem** delas: (i) KPIs de Contas a pagar com total real (leitura, sem RPC) e ordenação/destaque de vencidos; (ii) cartões "O que fazer agora" no Início usando dados existentes (importações NF-e aguardando conferência, contas a receber vencidas, estoque baixo). Depois, conforme as decisões: rótulos por intenção, página de Entrada de mercadoria e o vínculo estruturado.
