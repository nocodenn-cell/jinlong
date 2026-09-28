# Roadmap Técnico — Fluxos Operacionais Jinlong

| Campo | Valor |
|---|---|
| Data | 2026-09-17 |
| Base | `audit-fluxos_operacionais_jinlong.md` (auditoria anterior) + leitura direta do código atual + migrações Postgres + ADRs |
| Estado do código | `main` @ `49b8ed67` (HEAD atual). **PR #416 está ABERTA, não mergeada** — ver nota crítica abaixo |
| Regra de ouro | Nada foi implementado, alterado ou commitado. Este documento é só leitura, investigação e planejamento. |

---

## ⚠️ Nota crítica sobre as fontes pedidas

Dois dos documentos listados como fonte não foram encontrados no repositório após busca recursiva (`find` por nome, extensão e variações de grafia):

- `DOCUMENTO DE ESPECIFICAÇÃO DE ALTERAÇÕES E MELHORIAS DO SISTEMA.pdf`
- `Princípios de Engenharia.txt`

Nenhum PDF existe no repositório inteiro; nenhum arquivo com "Engenharia" ou "Especifica" no nome existe fora de `ONDA2_GAPS_MAPEADOS.md` (que não é o documento pedido). **Não foram usados** porque não existem localmente — se existirem fora do repo, precisam ser anexados para a próxima rodada, porque podem conter decisões de produto que mudam a priorização abaixo (especialmente a decisão sobre Compras × Recebimento, seção E).

Em substituição, usei como fonte de regras/SSOT: `docs/adr/ADR-008-inventory-domain-boundary.md` (fronteira do domínio Inventory, aceito 2026-07-18), `.cursor/rules/entity-ssot.mdc` (telas oficiais de cadastro), e as migrações Postgres que implementam os RPCs de estoque — que são, na prática, a especificação executável mais autoritativa disponível no repositório. `GAP_ANALYSIS.md` (do Claude Design) foi usado só como estava previsto: referência de UX, nunca como SSOT.

**Sobre "pós-PR #416":** o código atual em `main` **não inclui** as mudanças da PR #416 — ela está `OPEN`, `mergeable: true`, branch `claude/jinlong-design-system-analysis-8cin6w`, 4 arquivos, +87/-117 linhas. Ela faz exatamente a reorganização de navegação que a missão anterior recomendou (mover Comissões/Fornecedores/Compras para fora do menu colapsado), mas vai além disso — ver seção G. Tratei `main` (sem a PR) como o "código atual" para toda a auditoria de fluxo, e documentei separadamente o que a PR muda, porque a instrução foi explícita: **não presumir estado que o código não confirma**.

---

## A. Diagnóstico executivo

O problema central continua sendo o mesmo da auditoria anterior — **dado que já existe no backend não chega à tela** (Relatórios sem links, Vendas sem saldo pendente visível, Estoque crítico sem ação de reposição) — mas a investigação mais profunda desta etapa revela três refinamentos importantes que mudam a forma de atacar o problema:

1. **A arquitetura de Compras/Recebimento não é uma falha acidental — é uma decisão em estágios, já documentada.** A migração `20260801120000_recebimento_conferencia_explicita.sql` declara, no próprio comentário de cabeçalho: *"NF-e e ordem de compra NÃO passam a usar `remessas` nesta onda. A coluna `origem_tipo` cria o vocabulário para isso sem mexer nos dois fluxos."* Ou seja: o time já sabia que os três caminhos de entrada de estoque precisariam convergir um dia, já criou o campo que serviria de ponte (`origem_tipo`), e conscientemente adiou a unificação. Isso muda a natureza do problema #2.1 do relatório anterior: não é "consertar um bug", é "retomar uma decisão que já tem um esqueleto pronto no schema". Ver seção E.

2. **O bug de pré-preenchimento na conferência de NF-e é real, confirmado e isolado — não se repete no recebimento manual.** Comparei diretamente os dois formulários: o de recebimento manual (`RecebimentoGerentePageClient.tsx`) usa dois `useState('')` independentes para esperada/conferida, sem nenhum auto-preenchimento, e a RPC que ele chama (`criar_confirmar_remessa_entrada`) rejeita qualquer valor ausente ou ≤0 nos dois campos. Já a tela de NF-e pré-popula o campo "conferido" com a quantidade da nota (`aplicarConferencia`, linha 139) — o oposto exato do que o comentário da própria função vizinha (`buildItensConferenciaPreenchidos`, linhas 69-76) diz que o sistema deveria fazer. É um defeito pontual de um componente, com causa raiz exata e correção pequena — não um problema de arquitetura.

3. **A "conferência em um clique" da Ordem de Compra não é um risco de integridade de dados — é só falta de uma pausa na UI.** A RPC `receber_ordem_compra` (migração `295_ordem_compra_conferencia.sql`) é gated no servidor: exige que `registrar_conferencia_ordem_compra` já tenha rodado para todo item (`OC_CONFERENCIA_PENDENTE` se não), e credita estoque **só** a partir de `quantidade_conferida` já persistida — nunca de parâmetro vindo do cliente. O `OcDetalheModal.tsx` só chama as duas em sequência sem pausa visual entre elas; o banco protegeria mesmo se a UI tentasse pular a etapa. Isso rebaixa a severidade desse item de P1 para P2 em relação ao relatório anterior — é ganho de clareza, não correção de um buraco de segurança de dados.

O restante do diagnóstico da auditoria anterior permanece válido e não foi contradito por esta investigação: Relatórios sem CTA, Estoque crítico sem reposição, Vendas↔Financeiro sem link cruzado, cliente invisível no PDV.

---

## B. Matriz de prioridade

| ID | Problema | Fluxo | Severidade | Evidência | Menor solução | Dependência |
|---|---|---|---|---|---|---|
| RM-01 | Conferência de NF-e nasce pré-preenchida com a quantidade da nota, violando a semântica esperado≠conferido que a própria função vizinha foi escrita para proteger | 3 — Importação NF-e | **P0** (integridade de dados) | `ImportarNfePageClient.tsx:132-157` (`aplicarConferencia`) x `:69-76` (comentário de `buildItensConferenciaPreenchidos`) x `:798` (uso no input) | Não popular `qtdConferida` quando `item.quantidade_conferida` for `null` (remover o fallback `?? item.quantidade_nfe`) | Nenhuma |
| RM-02 | Estoque crítico não tem ação de reposição — sem deep-link para Recebimento pré-populado | 7 — Estoque | **P0** | `EstoqueTable.tsx:158-191`; `RecebimentoGerentePageClient.tsx` não lê query param de produto | Botão "Repor" na linha + suporte a `?produto=<id>` no recebimento manual | Nenhuma |
| RM-03 | Nenhuma linha de Relatórios (7 listas) é clicável, apesar do id já vir em todos os DTOs | 8 — Relatórios | **P0** | `RelatoriosContent.tsx:178-511` | Envolver cada linha em `<Link>` usando o id do DTO | Nenhuma |
| RM-04 | "Divergência de Estoque" no relatório é exibida sem nenhum caminho de investigação | 8 — Relatórios | **P0** | `RelatoriosContent.tsx:385-420` | Link "Ver Kardex" reusando `KardexSheet.tsx` já existente | RM-03 (mesmo padrão de link) |
| RM-05 | Risco de duplicidade cross-caminho ao receber mercadoria: recebimento manual usa "origem" em texto livre, sem FK para `ordens_compra`, então a mesma entrega física pode ser lançada duas vezes por caminhos diferentes | 2 — Compras/Recebimento | **P1** (arquitetural, conhecido, com esqueleto de solução já no schema) | `remessas.origem_tipo` (`20260801120000...sql:37-49`) criado e nunca lido por nenhuma UI; `RecebimentoGerentePageClient.tsx` não referencia `ordem_compra_id` | Ver seção E — decisão de produto necessária antes de qualquer código | **Bloqueado por decisão de produto (Sprint 8)** |
| RM-06 | `VendaDetailSheet` nunca exibe `tem_conta_receber`/`valor_aberto_cr`, calculados no backend | 5 — Venda→Financeiro | **P1** | `app/admin/vendas/actions.ts:48-49,168-169` vs `VendaDetailSheet.tsx` | Renderizar os campos já retornados, com link para o título | Nenhuma |
| RM-07 | `receivableReader.ts` não seleciona `venda_id`, então Financeiro não linka de volta para a venda de origem; `VendasTable` não mostra o cliente | 5 — Venda→Financeiro | **P1** | `receivableReader.ts:101`; zero ocorrência de "cliente" em `app/admin/vendas/actions.ts` | Adicionar `venda_id` ao select + nome do cliente na tabela | Nenhuma |
| RM-08 | Recibo de venda nunca mostra o cliente vinculado, mesmo em venda fiado | 4/5 — PDV | **P1** | `CaixaReciboModal.tsx:20-31` (tipo `ReciboVenda` sem campo cliente) | Incluir nome do cliente no recibo quando presente | Nenhuma |
| RM-09 | Vincular cliente à venda no PDV é quase invisível (só Alt+C ou menu "Operações") | 4 — PDV | **P1/P2** | `CaixaOperadorContextBar.tsx`; `CaixaPdvOperacoesMenu.tsx:136-141` | Botão "Cliente" na área principal do carrinho | Nenhuma — reforça RM-08 |
| RM-10 | Kardex e Auditoria leem os mesmos dados (`movimentos_estoque_log`) mas não se linkam | 7 — Estoque | **P1** | `AuditoriaTimeline.tsx:278-294` (texto puro); `KardexSheet.tsx` (sem botão para auditoria) | Link cruzado nos dois sentidos | Nenhuma |
| RM-11 | CTA único de saída de Relatórios ("Abrir estoque") é genérico, não usa o helper de deep-link já existente noutra tela | 8 — Relatórios | **P1** | `RelatoriosContent.tsx:226-230` vs `adminEstoqueProdutoQuery()` usado em `CatalogoTable.tsx:242` | Trocar `href` cru pelo helper existente | Nenhuma |
| RM-12 | Navegação: Comissões/Fornecedores/Compras fora do grupo "Operação" no `main` atual (resolvido numa PR aberta, não mergeada) | Navegação | **P1** (mas ação = revisar PR, não escrever código novo) | `adminV2SidebarNav.ts` (main) vs PR #416 diff | Revisar e mergear PR #416 — ver decisão pendente na seção E sobre Implantação/Diagnóstico | PR #416 já existe; falta decisão + merge |
| RM-13 | Na Ordem de Compra, conferência e crédito de estoque disparam em sequência sem pausa visual (mas o servidor já impede pular a conferência) | 2 — Compras | **P2** (rebaixado nesta investigação — ver diagnóstico item 3) | `OcDetalheModal.tsx:108-128`; gate real em `receber_ordem_compra` (`295_ordem_compra_conferencia.sql:163-173`) | Adicionar 1 tela/modal de confirmação entre as duas chamadas | Nenhuma |
| RM-14 | Recebimento manual usa a RPC fundida "D0" (`criar_confirmar_remessa_entrada`) em vez do par gated que já existe no schema (`registrar_conferencia_remessa`/`confirmar_remessa_entrada`) — decisão MVP documentada, não bug | 2 — Compras/Recebimento | **P2** (dívida documentada, não corrigir sem decisão) | `20260823192024_d0_remessa_quantidade_positiva_atomica.sql:135-139` (comentário admite a fusão) | Não é "menor mudança" — é decisão de produto (Sprint 8) | Sprint 8 |
| RM-15 | Campos fiscais do produto nunca são obrigatórios, escondidos atrás de 2 níveis de "mais detalhes" | 1 — Produto | P1 | `FiscalSection.tsx:14-17`; sem validação em `produtoForm.clientValidation.ts` | Tornar obrigatório NCM/CFOP quando produto ativo | Confirmar regra fiscal com quem decide produto |
| RM-16 | `contasRecebeId` retornado pela RPC de venda nunca chega à UI do PDV | 5 — PDV→Financeiro | P2 | `caixaVendas.impl.ts:416`; zero uso em `CaixaPageClient.tsx` | Toast/confirmação citando o título gerado | Nenhuma |
| RM-17 | Busca de cliente sem resultado no PDV não oferece cadastro rápido | 4 — PDV | P2 | `CaixaSelecionarClienteModal.tsx:133-135` | **Atenção:** `entity-ssot.mdc` **bloqueia** "PDV criar cliente completo" — menor mudança segura é link para `/admin/clientes`, não formulário inline | Nenhuma, mas respeitar SSOT |
| RM-18 | Link de "estoque mínimo" na edição de produto não usa o helper de deep-link já usado noutro ponto do mesmo formulário | 1/7 | P2 | `EstoqueSection.tsx:129-134` vs `ProdutoFormModal.tsx:528-530` | Trocar `href` cru pelo helper `adminEstoqueProdutoQuery()` | Nenhuma |
| RM-19 | i18n hardcoded (pt-BR fixo) nos comprovantes do caixa | 4/6 — PDV | P3 | `CaixaRailTurnoSummary.tsx:70`; `CaixaReciboModal.tsx:83-91`; `CaixaFechamentoReciboModal.tsx:29-37` | Usar `formatBRL(v, locale)`/dicionário já existente no resto do produto | Nenhuma |
| RM-20 | Ajuste de saldo termina em silêncio, sem toast de confirmação | 7 — Estoque | P3 | `AjusteSaldoModal.tsx:70-71` | Adicionar toast de sucesso | Nenhuma |

---

## C. Top 10 (ordenado por impacto operacional)

1. **RM-01** — Conferência de NF-e nasce pré-preenchida com a quantidade da nota (P0, integridade de dados, causa raiz exata e isolada).
2. **RM-02** — Estoque crítico sem ação de reposição (P0, o operador vê o problema e não consegue agir).
3. **RM-03** — Nenhuma linha de Relatórios é clicável, em 7 listas diferentes (P0, maior alcance).
4. **RM-04** — Divergência de estoque no relatório sem caminho de investigação (P0, alerta sem saída).
5. **RM-05** — Risco de duplicidade cross-caminho no recebimento de mercadoria (P1, mas é a decisão de maior risco financeiro/estoque pendente — precisa investigação de produto antes de código).
6. **RM-06 + RM-07** — Vendas e Financeiro sem link cruzado em nenhum sentido (P1, mesma cadeia causal).
7. **RM-08** — Recibo de venda fiado nunca mostra o cliente vinculado (P1, risco de cobrança).
8. **RM-09** — Cliente quase invisível no PDV (P1/P2, raiz de RM-06/07/08).
9. **RM-10** — Kardex e Auditoria sem link cruzado (P1, dois históricos paralelos).
10. **RM-12** — Navegação: Comissões/Fornecedores/Compras fora de "Operação" — já resolvido numa PR aberta (#416), falta revisão e decisão sobre Implantação/Diagnóstico antes de mergear.

---

## D. Sprints propostas

Cada sprint é pequena, isolada e validável sozinha. A ordem já reflete prioridade (fluxo > clareza > velocidade > consistência > acessibilidade > estética), exceto a Sprint 0, que vem primeiro por ser revisão, não implementação nova.

### Sprint 0 — Revisar e decidir sobre a PR #416 (navegação)
- **Objetivo:** decidir o destino de uma PR já pronta (`claude/jinlong-design-system-analysis-8cin6w`, `mergeable`) que resolve RM-12, antes de escrever qualquer código novo de navegação.
- **Problemas resolvidos:** RM-12 (Comissões/Fornecedores/Compras saem do menu escondido).
- **Ponto que precisa decisão antes do merge:** a PR não apenas move itens — ela **remove Implantação e Diagnóstico do Caixa da navegação para todos os perfis, inclusive ADMIN** (antes eram `adminOnly`, visíveis para a equipe interna; a PR os tira do array de itens inteiramente). Confirmar se isso é intencional (acesso só por URL direta daqui pra frente) ou se deveria continuar existindo um ponto de entrada na navegação para quem tem perfil ADMIN.
- **Arquivos/áreas:** `lib/navigation/adminV2SidebarNav.ts`, `components/ui/admin-v2/SidebarNav.tsx` (já alterados na PR).
- **Dependências:** nenhuma — só decisão + merge.
- **Risco:** baixo (mudança já revisada por si mesma, com testes atualizados).
- **Testes:** os testes da própria PR (`SidebarNav.behavior.test.tsx`, `adminV2SidebarNav.test.ts`) já cobrem os 4 grupos e a ausência de Implantação/Diagnóstico para todos os perfis — rodar e confirmar verde antes de mergear.
- **Critério de conclusão:** PR mergeada (ou rejeitada com justificativa) + decisão sobre Implantação/Diagnóstico registrada em algum lugar rastreável (ADR curto ou comentário na própria PR).

### Sprint 1 — Corrigir pré-preenchimento da conferência de NF-e
- **Objetivo:** o campo "conferido" de cada item nunca deve nascer com o mesmo valor da nota sem ação do operador.
- **Problemas resolvidos:** RM-01.
- **Arquivos:** `app/gerente/estoque/importar-nfe/ImportarNfePageClient.tsx` (função `aplicarConferencia`, linhas 132-157; input de uso, linha 798).
- **Dependências:** nenhuma.
- **Risco:** baixo tecnicamente; médio operacionalmente — muda um comportamento que operadores já usam há tempo (podem estar acostumados a só confirmar sem digitar). Vale um aviso de release note.
- **Testes:** teste unitário garantindo que `aplicarConferencia` não popula `qtdConferida` quando `item.quantidade_conferida` é `null`; smoke manual do fluxo completo de importação (nova importação → conferência → confirmação) confirmando que o campo nasce vazio.
- **Critério de conclusão:** ao abrir uma importação de NF-e nova, nenhum item de conferência mostra número antes do operador digitar (exceto ao retomar uma importação onde já havia contagem salva — esse caso continua pré-preenchido, corretamente).

### Sprint 2 — Estoque crítico → ação de reposição direta
- **Objetivo:** da lista de estoque crítico, ir direto ao formulário de recebimento com o produto já selecionado.
- **Problemas resolvidos:** RM-02.
- **Arquivos:** `app/admin/estoque/_components/EstoqueTable.tsx`, `app/gerente/recebimento/RecebimentoGerentePageClient.tsx` (novo suporte a query param), `shared-core/navigation/routes.ts`.
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Testes:** e2e clicando "Repor" numa linha crítica e confirmando que o formulário de recebimento abre com o produto certo pré-selecionado.
- **Critério de conclusão:** 1 clique da lista "Crítico" até o formulário de recebimento com o produto correto, sem precisar buscar de novo.

### Sprint 3 — Relatórios acionáveis
- **Objetivo:** toda linha de produto/venda nas 7 listas de Relatórios linka para o registro correspondente.
- **Problemas resolvidos:** RM-03.
- **Arquivos:** `app/admin/relatorios/_components/RelatoriosContent.tsx` (todas as listas: `TopProdutosList`, `EstoqueReposicaoList`, `CoberturaEstoqueList`, `DivergenciaEstoqueList`, `SemGiroList`, `CurvaAbcList`, `MargemPorVendaList`, `VendasDetalheList`).
- **Dependências:** nenhuma — o id já existe em todos os DTOs.
- **Risco:** baixo.
- **Testes:** teste unitário/e2e clicando em uma linha de cada lista e confirmando a navegação.
- **Critério de conclusão:** 0 linhas sem link em nenhuma das abas do módulo.

### Sprint 4 — Divergência de estoque → Kardex
- **Objetivo:** da seção "Divergência de Estoque" do relatório, abrir o Kardex do produto.
- **Problemas resolvidos:** RM-04.
- **Arquivos:** `RelatoriosContent.tsx:385-420`, reaproveitando `app/admin/estoque/_components/KardexSheet.tsx`.
- **Dependências:** nenhuma; pode compartilhar padrão de link com a Sprint 3.
- **Risco:** baixo.
- **Testes:** clicar numa linha de divergência abre o Kardex do produto certo.
- **Critério de conclusão:** toda linha de divergência tem uma ação de investigação, não só o número.

### Sprint 5 — Vendas↔Financeiro: expor saldo pendente e cliente
- **Objetivo:** uma venda a prazo mostra seu saldo em aberto e link para o título; o título mostra link de volta para a venda.
- **Problemas resolvidos:** RM-06, RM-07.
- **Arquivos:** `VendaDetailSheet.tsx`, `VendasTable.tsx` (nome do cliente), `receivableReader.ts:101` (adicionar `venda_id` ao select).
- **Dependências:** nenhuma — os campos já são calculados no backend.
- **Risco:** baixo.
- **Testes:** unit no reader confirmando `venda_id` presente; verificação visual abrindo uma venda a prazo e o título correspondente.
- **Critério de conclusão:** abrir uma venda a prazo mostra o saldo aberto com link para o título; abrir o título mostra link de volta para a venda de origem.

### Sprint 6 — Cliente visível: recibo + PDV
- **Objetivo:** (a) o recibo de venda mostra o cliente vinculado quando existir; (b) associar cliente à venda tem um botão visível na área principal do carrinho, sem depender de atalho de teclado.
- **Problemas resolvidos:** RM-08, RM-09.
- **Arquivos:** `CaixaReciboModal.tsx` (tipo `ReciboVenda` + render), `CaixaOperadorContextBar.tsx`/`CaixaPdvOperacoesMenu.tsx`.
- **Dependências:** nenhuma; reforça a Sprint 5 (faz sentido rodar depois, para o conjunto ficar coerente).
- **Risco:** baixo.
- **Testes:** e2e de venda fiado — vincular cliente pelo novo botão, finalizar, conferir nome no recibo (tela e impressão).
- **Critério de conclusão:** toda venda fiado gera recibo com nome do cliente; vincular cliente não exige saber Alt+C.

### Sprint 7 — Kardex ↔ Auditoria
- **Objetivo:** link cruzado entre as duas telas que leem o mesmo histórico de movimentos.
- **Problemas resolvidos:** RM-10.
- **Arquivos:** `KardexSheet.tsx` (link "ver na auditoria"), `AuditoriaTimeline.tsx:278-294` (nome do produto vira link para o Kardex/Estoque).
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Testes:** de um movimento no Kardex, chegar à entrada correspondente na Auditoria, e vice-versa.
- **Critério de conclusão:** as duas telas param de ser becos sem saída uma em relação à outra.

### Sprint 8 — Decisão de produto: vínculo Compras ↔ Recebimento (não é sprint de código)
- **Objetivo:** decidir, com dono de produto, como os três caminhos de entrada de estoque (NF-e, Ordem de Compra, recebimento manual) devem se relacionar daqui pra frente — usando o campo `origem_tipo` que já existe no schema como ponto de partida.
- **Problemas resolvidos:** prepara terreno para RM-05 e RM-14; nenhum código muda nesta sprint.
- **Perguntas que precisam resposta (ver seção E, item 1, para o detalhe completo):**
  - O recebimento manual deve poder referenciar uma Ordem de Compra existente (campo opcional), ou os dois devem continuar deliberadamente separados?
  - Avisar o operador quando o texto livre de "origem" parece coincidir com uma OC em trânsito é suficiente, ou é preciso um vínculo estruturado (FK)?
  - A RPC fundida "D0" (`criar_confirmar_remessa_entrada`) deve ser aposentada em favor do par gated que já existe no schema (`registrar_conferencia_remessa`/`confirmar_remessa_entrada`), reaproximando o recebimento manual do padrão de 2 passos da NF-e e da OC?
- **Arquivos envolvidos numa eventual sprint futura (não agora):** `app/gerente/recebimento/*`, `app/gerente/compras/*`, possível nova migração para FK opcional.
- **Dependências:** nenhuma técnica — é reunião/decisão, registrada como adendo ao ADR-008 ou um ADR novo.
- **Risco:** não aplicável (não há código).
- **Critério de conclusão:** decisão registrada por escrito, com as 3 perguntas acima respondidas, antes de abrir qualquer sprint de código sobre RM-05/RM-14.

---

## E. Investigações antes de implementação

### 1. Compras / Recebimento / NF-e — conclusão da investigação pedida

**Fluxo canônico:** não existe um único "fluxo canônico" hoje — existem **três mecanismos de entrada de estoque, arquiteturalmente distintos e intencionais**, todos convergindo na mesma tabela `estoque` e no mesmo `movimentos_estoque_log` (autoridade única confirmada por `ADR-008`, seção "Fonte de verdade"):

| Caminho | RPCs | Passos | Idempotência | Gate de conferência |
|---|---|---|---|---|
| **NF-e** | `importar_nfe_transacao` → `registrar_conferencia_nfe` → `confirmar_importacao_nfe` | 4 fases, retomável | chave da NF-e | Bloqueia confirmação com itens `EM_CONFERENCIA` (`podeConfirmarEstoque`) — mas UI tem o bug RM-01 |
| **Ordem de Compra** | `registrar_conferencia_ordem_compra` → `receber_ordem_compra` | 2 fases | por OC (`OC_STATUS_INVALIDO` se repetido fora de ordem) | Servidor rejeita (`OC_CONFERENCIA_PENDENTE`) se algum item não foi conferido; credita **só** de `quantidade_conferida` já persistida, nunca de parâmetro do cliente |
| **Recebimento manual** | `criar_confirmar_remessa_entrada` (RPC "D0", fundida) | 1 fase (cria+confere+confirma junto) | `idempotency_key` único por loja | Exige ambos `quantidade_esperada` e `quantidade_conferida` explícitos e >0 no mesmo payload — não há como enviar sem contar, mas também não há pausa entre contar e creditar |

**Isto é intencional, não um acidente:** a migração `20260801120000_recebimento_conferencia_explicita.sql` criou um par de RPCs gated para `remessas` (`registrar_conferencia_remessa` + `confirmar_remessa_entrada`, ambas ainda existentes no schema e funcionalmente corretas) e, no mesmo commit, documentou por escrito que NF-e e OC **não** adotariam essa tabela "nesta onda", com o campo `origem_tipo` servindo de vocabulário para uma unificação futura. Ou seja: **o esqueleto para conectar os três já existe no banco — só não foi usado por nenhuma UI ainda.**

**Onde o estoque é efetivamente alterado:** sempre dentro da própria RPC, nunca na aplicação — confirmado nas 3 migrações lidas (`receber_ordem_compra`, `confirmar_remessa_entrada`, e a fundida `criar_confirmar_remessa_entrada`), todas fazendo `INSERT ... ON CONFLICT DO UPDATE` em `estoque` mais `INSERT` em `movimentos_estoque_log` na mesma transação SQL. Isso está de acordo com o invariante I1 do ADR-008 ("toda alteração de saldo gera movimento").

**Risco real de duplicidade:** existe, mas é mais estreito do que a auditoria anterior supôs. Dentro de cada caminho, idempotência é forte (chave da NF-e; status da OC; `idempotency_key` da remessa). O risco real é **entre caminhos**: nada impede um operador de (a) receber fisicamente uma mercadoria vinculada a uma OC, credita-la via `receber_ordem_compra`, e depois — por engano, ou porque não sabia que a OC existia — lançar a mesma entrega de novo em `/admin/estoque/recebimento` com uma "origem" em texto livre desconectada da OC. Não há nenhum controle sistêmico contra isso, porque o campo "origem" do recebimento manual não é uma FK.

**Sobre idempotência:** funciona corretamente **dentro** de cada mecanismo (comprovado nas 3 RPCs lidas linha a linha). Não existe, e não pode existir sem decisão de produto, uma idempotência **entre** mecanismos — o sistema não tem como saber que dois lançamentos em tabelas diferentes (`ordens_compra_itens` vs `remessa_itens`) se referem ao mesmo evento físico.

**O que a especificação do Jinlong determina:** não encontrei a especificação formal pedida (PDF não existe no repo — ver nota no topo). O que existe é o ADR-008 (aceito), que define a fronteira de domínio mas **não resolve** qual dos 3 caminhos é "o" canônico — ele deliberadamente lista os três como orquestrações paralelas válidas (seção 5, tabela de orquestrações).

**Conclusão:** **sim, precisamos de uma missão exclusiva de definição do fluxo antes de alterar qualquer código aqui** — é a Sprint 8 proposta acima. Não implementar nenhuma unificação, campo novo ou aviso de duplicidade baseado só em suposição, exatamente como a instrução pediu.

### 2. NF-e / Conferência — conclusão

O padrão correto é: **quantidade da NF-e → campo vazio até o operador contar → quantidade conferida (pode ser igual ou diferente) → se diferente, divergência registrada → confirmação → estoque.** A função `buildItensConferenciaPreenchidos` (que monta o payload enviado ao servidor) já implementa esse contrato corretamente e tem um comentário explícito dizendo por quê. O bug está numa camada acima: `aplicarConferencia`, que inicializa o **estado local do formulário** (o que o operador vê no campo) com `item.quantidade_conferida ?? item.quantidade_nfe` — ou seja, quando o servidor ainda não tem uma contagem salva (`quantidade_conferida` é `null`), o campo na tela nasce com a quantidade da nota em vez de vazio.

Isso **viola a semântica operacional "esperado ≠ conferido"**: um operador pode abrir a conferência, nunca tocar em nenhum campo, e clicar "Registrar conferência" seguido de "Confirmar estoque" — e o sistema vai creditar exatamente a quantidade da nota para todo item, como se cada um tivesse sido fisicamente contado e batido 100%. Isso é **P0**, segundo a própria régua da missão ("compromete... integridade dos dados"), porque a conferência é o único controle contra erro de contagem/furto/avaria em mercadoria importada — o núcleo do negócio.

### 3. Claude Design — reclassificação após a investigação de código

| Ideia do Claude Design | Classificação anterior | Reclassificação (com a evidência desta etapa) | Motivo da mudança |
|---|---|---|---|
| `FlowSteps` (trilha de etapas) aplicado à conferência | APROVEITAR a ideia (stepper com estado derivado), com ressalvas | **IGNORAR por enquanto** | Agora sei que existem 3 modelos de dados de status diferentes por trás da "conferência" (`ConferenciaImportacaoNfe`, `status_conferencia` de OC, e o fluxo fundido de `remessas`) — um stepper genérico teria que abstrair 3 máquinas de estado distintas antes mesmo de decidir se elas devem convergir (Sprint 8). Construir a trilha visual antes da Sprint 8 arrisca formalizar visualmente uma unificação que ainda não foi decidida. |
| Resumo comercial lateral fixo na edição de produto | ADAPTAR | **ADAPTAR — mantido** | Não depende de nenhuma decisão de arquitetura pendente; é puramente apresentação de dados já existentes. |
| Botão "Cliente" visível ao lado da busca de produto no PDV | APROVEITAR | **APROVEITAR — mantido, virou RM-09/Sprint 6** | Confirmado como gap real e de baixo risco. |
| "Nova entrada"/"Continuar" disponível tanto no cabeçalho do hub quanto na linha específica | ADAPTAR | **ADAPTAR — mantido, virou o padrão de RM-02 (Sprint 2)** | Reforça exatamente o gap de estoque crítico sem ação por linha. |
| KPI/linha de tabela sempre clicável (padrão do `Dashboard.jsx` do kit) | APROVEITAR | **APROVEITAR — mantido, virou RM-03/RM-04 (Sprints 3-4)** | Confirmado como o padrão que falta em Relatórios; validação independente entre design e auditoria de código. |
| Resumo do turno anterior na tela de abertura de caixa | INVESTIGAR | **INVESTIGAR — sem mudança**, não foi verificado nesta rodada se já existe | Fora do escopo desta investigação (focada em Compras/Recebimento/NF-e/navegação); mantido como pendência. |
| Trilha "Compra → Documento → Conferência → Entrada" como vocabulário único | INVESTIGAR (unificação de vocabulário) | **INVESTIGAR — confirmado como Sprint 8**, não decidir na UI antes da decisão de produto | O próprio `GAP_ANALYSIS.md` do design já recomendava isso; a investigação desta etapa mostra que o banco já tem o campo (`origem_tipo`) esperando essa decisão. |

Nenhuma ideia nova do Claude Design foi promovida a "SSOT" ou a "componente para copiar direto" — todas continuam filtradas pelo padrão: só o que resolve uma jornada real, confirmada em código.

### 4. Outras pendências de confirmação

- Existe ou não um KPI de "contas vencidas" **dentro** do próprio módulo Financeiro (a ausência confirmada na auditoria anterior foi só de link a partir de Dashboard/Relatórios — não foi lido `app/admin/financeiro/page.tsx` inteiro).
- Se Fornecedores/Compras foram colocados no menu "Mais" (estado atual em `main`) por decisão deliberada do commit `d428eaed` ("separa ferramentas internas do menu do cliente") — a PR #416 os move para fora de lá; vale confirmar que isso não contraria a intenção original desse commit.
- Confirmar com quem decide produto se cadastro rápido de cliente a partir da busca do PDV é desejado (RM-17) — hoje **bloqueado** por `entity-ssot.mdc` ("PDV criar cliente completo... bloqueado em código novo"). A menor mudança seria um link para `/admin/clientes`, nunca um formulário inline.
- Localizar (fora do repositório, se existirem) `DOCUMENTO DE ESPECIFICAÇÃO DE ALTERAÇÕES E MELHORIAS DO SISTEMA.pdf` e `Princípios de Engenharia.txt` — podem conter decisões já tomadas sobre exatamente a pergunta da Sprint 8.

---

## F. O que não fazer agora

- **Redesign global** de qualquer módulo.
- **Nova arquitetura** para unificar Compras/Recebimento/NF-e sem passar pela Sprint 8 (decisão de produto primeiro).
- **Novo Design System** ou adoção do Design System do Claude Design como fonte de verdade.
- **Novas abstrações** (ex.: um componente `FlowSteps` genérico reaproveitável em todo o produto).
- **Refatorações sem evidência** — nenhum item deste roadmap nasceu de suposição; todos têm file:line ou migração citada.
- **`FlowSteps` baseado no modelo atual do Claude Design** — reclassificado para IGNORAR nesta rodada (ver seção E.3); o próprio autor do design já havia recomendado isso, e a investigação de código reforça o motivo.
- **Cadastro rápido de cliente inline no PDV** — bloqueado por `entity-ssot.mdc`; se RM-17 for endereçado, é só link para `/admin/clientes`.
- **Consolidação do shell** (`AdminV2Shell` + `GerenteHeaderNav`) — ganho real, mas fora do escopo de fluxo prioritário agora.
- **Aposentar a RPC "D0" (`criar_confirmar_remessa_entrada`)** em favor do par gated (`registrar_conferencia_remessa`/`confirmar_remessa_entrada`) — só depois da Sprint 8, é mudança de contrato de dados, não uma correção pontual.
- **Correções puramente estéticas** (i18n hardcoded pt-BR nos comprovantes, RM-19) — reais, mas P3; não entram nas primeiras sprints.
- Qualquer item sem benefício operacional comprovado por evidência de código ou migração.

---

## G. Navegação — confirmado contra o código atual

**Estado em `main` (HEAD `49b8ed67`, sem PR #416 mergeada — este é o código que roda hoje):**

| Item pedido | Estado atual (main) |
|---|---|
| Grupo "Operação" | Não existe com esse nome — o grupo equivalente se chama **"CORE"** (`ADMIN_V2_CORE_ITEMS`): Visão geral, Vendas, Catálogo, Clientes, Funcionários, Estoque, Auditoria, Financeiro, Relatórios |
| Grupo "Cadastros" | Não existe como grupo separado — Catálogo/Clientes estão dentro de CORE |
| Grupo "Análise" | Não existe como grupo separado — Relatórios está dentro de CORE |
| Grupo "Administração" | Não existe com esse nome — o grupo equivalente se chama **"SISTEMA"** (`ADMIN_V2_SISTEMA_ITEMS`) |
| Comissões | Dentro de `ADMIN_V2_EXPANDED_ITEMS`, no menu **"Mais"**, colapsado por padrão (`useState(false)`) |
| Fornecedores | Idem — dentro de "Mais" |
| Compras | Idem — dentro de "Mais" |
| "Ir para PDV" | Dentro de "SISTEMA", **sem** `adminOnly` — visível a todos os perfis |
| Implantação | Dentro de "SISTEMA", `adminOnly: true` — visível só a perfil ADMIN |
| Diagnóstico do Caixa | Dentro de "SISTEMA", `adminOnly: true` — visível só a perfil ADMIN |
| Provisionamento | Dentro de "SISTEMA", `adminOnly: true` — visível só a perfil ADMIN |

**Estado proposto pela PR #416 (`OPEN`, `mergeable`, branch `claude/jinlong-design-system-analysis-8cin6w` — ainda NÃO é o código que roda):**

| Item pedido | Estado na PR #416 |
|---|---|
| Grupo "Operação" | `ADMIN_V2_OPERACAO_ITEMS`: Visão geral, **Ir para PDV**, Vendas, Estoque, **Compras**, Financeiro, **Comissões** |
| Grupo "Cadastros" | `ADMIN_V2_CADASTROS_ITEMS`: Catálogo, Clientes, **Fornecedores** |
| Grupo "Análise" | `ADMIN_V2_ANALISE_ITEMS`: só Relatórios |
| Grupo "Administração" | `ADMIN_V2_ADMINISTRACAO_ITEMS` (renomeado de "SISTEMA"): Funcionários, Auditoria, Configurações, Provisionamento (`adminOnly`), Suspensão |
| Comissões | Move para **Operação**, sempre visível — resolve RM-12 |
| Fornecedores | Move para **Cadastros**, sempre visível |
| Compras | Move para **Operação**, sempre visível |
| "Ir para PDV" | Move para **Operação** (era "SISTEMA"), continua sem `adminOnly` |
| Implantação | **Removida do array de itens inteiramente** — não aparece mais para nenhum perfil, nem ADMIN. Diferente de antes (que era `adminOnly`, visível ao menos para a equipe interna) |
| Diagnóstico do Caixa | **Removida do array de itens inteiramente** — mesmo caso de Implantação |
| Provisionamento | Continua em Administração, `adminOnly: true` — sem mudança |

**O menu colapsável "Mais" é removido inteiramente na PR** (junto com o `useState`/`ChevronDown` que o implementavam).

**Ponto que precisa decisão humana antes do merge** (repetido da Sprint 0 por ser o único risco real desta PR): a remoção total de Implantação/Diagnóstico do Caixa da navegação — inclusive para ADMIN — é uma mudança de comportamento maior do que "reagrupar itens visíveis". Confirmar se isso é intencional.
