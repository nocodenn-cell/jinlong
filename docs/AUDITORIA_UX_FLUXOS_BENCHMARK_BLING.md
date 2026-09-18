# Auditoria UX/UI e Fluxos Operacionais do Jinlong — Benchmark Bling

| Campo | Valor |
|---|---|
| Data | 2026-09-18 |
| Motivação | Visita real a cliente: "o sistema parece distante de um ERP maduro", "as telas não têm fluxo", e a pergunta que não conseguimos responder na hora — **"onde eu coloco uma nota fiscal de entrada?"** |
| Escopo | `pdv-importados/` (produto real, estado atual do código) |
| Estado do código | `main` @ `5e953be5` (2026-09-18) + 5 arquivos com edição em andamento não commitada (`CaixaCartList.tsx`, `ProdutoFormModal.tsx`, `adminChineseUiLabels.ts`, `pt.json`, `zh.json` — já revisados no estado atual em disco, não bloqueiam esta auditoria) |
| Método | 4 investigações paralelas de código (evidência file:line) + verificação direta de um achado crítico + pesquisa na documentação pública oficial do Bling (`ajuda.bling.com.br`, artigos lidos na íntegra) como benchmark |
| Regra de ouro | Nada foi implementado, alterado, commitado ou revertido. Este documento é só leitura e análise. |

---

## 1. Diagnóstico executivo

**A frase do cliente — "não tem fluxo" — não é sobre falta de funcionalidade. É sobre vocabulário e descoberta.**

A investigação confirma isso de forma direta e mensurável, respondendo primeiro à pergunta que motivou esta missão: **hoje, nenhum rótulo de menu do Jinlong contém as palavras "nota fiscal", "NF-e" ou "entrada".** A única ocorrência clicável dessas palavras no sistema inteiro é a 4ª aba (de 5) dentro do hub "Estoque" — um rótulo genérico que não sugere, por si, onde lançar uma nota de compra. Não há CTA no dashboard, não há busca global, não há breadcrumb de ajuda. Um operador que chega com uma nota física em mãos precisa: clicar em "Estoque" (rótulo que não fala de nota fiscal) → cair na aba "Saldos" (não é o que precisa) → notar a barra de abas secundária → escolher entre "Recebimento" (parece certo, mas é manual/sem XML) e "Importar NF-e" (correto, mas a 4ª opção). **A jornada quebra exatamente no primeiro clique.**

Por comparação direta (ver seção 4), o Bling — usado aqui como benchmark de maturidade operacional, não como modelo a copiar — resolve esse primeiro clique com um item de menu que usa literalmente as mesmas palavras do lojista: **"Estoque › Notas Fiscais de Entrada"**. A diferença não está na profundidade da navegação (2 cliques em ambos os casos), está inteiramente na nomenclatura e na ausência de destaque.

Um segundo achado, tão importante quanto o primeiro: **grande parte do ERP relacionado a suprimentos vive atrás de um menu colapsado chamado "Mais"**, que abre fechado por padrão (`useState(false)`). Fornecedores, Compras e Comissões — ou seja, a metade inteira do fluxo "Produto → Fornecedor → Compra" — não aparece na primeira tela do menu. Isso não é um detalhe estético: é a causa raiz de por que o cliente relatou "não sei operar" — metade do sistema literalmente não está visível até um clique extra que ele não sabia que precisava dar.

Um terceiro achado, mais sutil e potencialmente mais perigoso: **existe pelo menos um caso de "correção fantasma"** — um link que existe, tem `href`, `hover:underline`, parece corrigido em qualquer revisão de código superficial, mas a página de destino ignora silenciosamente o parâmetro e não faz nada com ele (seção 3, item P0-3). Isso é relevante porque mostra que "existe um `<Link>`" não é suficiente evidência de que um fluxo foi de fato fechado — é preciso testar clicando.

Um quarto achado, este positivo e que muda a leitura de tudo: **o time já está corrigindo esse tipo de problema, e rápido.** Os últimos 15 commits antes desta auditoria (`G-01` a `G-12`, `N-01` a `N-03`, `S8/S9`) são, quase todos, exatamente este tipo de correção — deep-links, remoção de dialogs nativos, exposição de dados já calculados no backend. Um dos itens que a auditoria anterior (17/09) havia classificado como P0 crítico — a conferência de NF-e nascer pré-preenchida com a quantidade da nota, violando a semântica "esperado ≠ conferido" — **já está corrigido no código atual** (verificado nesta auditoria, ver seção 10). Ou seja: o produto não está estagnado; a lacuna real está em completar essa frente de trabalho com foco em *descoberta* (como entrar no fluxo), não só em *continuidade* (como sair de uma tela para a próxima já dentro do fluxo).

---

## 2. Mapa dos fluxos

| Fluxo | Onde começa | Ação principal | Próximo passo esperado | Como sabe que terminou | CTAs para a próxima etapa |
|---|---|---|---|---|---|
| 1. Produto → Fornecedor → Compra | `/admin/catalogo` → "Novo" | Salvar produto (RPC única) | Comprar do fornecedor vinculado | Toast de sucesso + tela pós-salvo | "Ajustar estoque" / "Imprimir etiqueta" — **nenhum CTA para Compras** |
| 2. Fornecedor → Compra → Recebimento → Estoque | `/admin/fornecedores` ou `/admin/compras` (escondido em "Mais") | Criar OC / registrar recebimento / importar NF-e (3 caminhos paralelos) | Conferir fisicamente e creditar estoque | Status da OC muda; toast (na maioria dos casos) | Deep-link Fornecedor→Nova OC (G-03); vínculo opcional OC↔Recebimento (S8) |
| 3. NF-e de entrada → Conferência → Estoque | `/admin/estoque` (aba 4/5 "Importar NF-e") | Upload XML → classificar itens → conferir → confirmar | Estoque creditado, financeiro refletido (pagamento) | Estoque atualizado; sem confirmação textual de que o pagamento foi lançado | Nenhum — fim de linha, operador precisa ir a Financeiro manualmente |
| 4. Cliente → Venda → Pagamento → Caixa | `/caixa` | Vincular cliente (agora visível) → carrinho → pagamento → finalizar | Título a receber gerado (se fiado) | Recibo + toast — **mas sem menção ao título gerado** | Nenhum CTA "ver título" no momento da venda |
| 5. Venda → Financeiro | `/admin/vendas` ou `/admin/clientes` | Ver saldo em aberto do cliente | Ir ao título e liquidar | Link "Ver no financeiro" (G-07, corrigido no mesmo dia) | Funciona nos dois sentidos hoje (venda→financeiro e financeiro→venda) |
| 6. Caixa → Fechamento | `/caixa` (botão no topo) | Contar valores, fechar turno | Ver histórico / abrir novo turno | Comprovante modal — **sem CTA de próximo passo explícito** | Só "Imprimir"/"Fechar"; próximo turno é inferido pela mudança de rótulo do botão |
| 7. Estoque → Kardex/Auditoria | `/admin/estoque` | Investigar mudança de saldo | Ver histórico do produto | Sheet do Kardex abre; link cruzado com Auditoria funciona | Ícone de histórico por linha + link "ver na auditoria"/"ver Kardex" nos dois sentidos |
| 8. Relatórios → Ação | `/admin/relatorios` | Ver KPI/lista | Investigar o registro específico | **Parcial** — Vendas e Divergência de Estoque funcionam; Top Produtos/Sem Giro/Curva ABC/Cobertura de Estoque **não** | Links existem visualmente, mas a página de destino não lê o parâmetro (achado P0) |

---

## 3. Problemas encontrados (evidência concreta)

### P0 — podem comprometer a operação ou a confiança no sistema

**P0-1 — Nenhum rótulo de navegação contém "nota fiscal"/"NF-e"/"entrada".**
`pdv-importados/lib/navigation/adminV2SidebarNav.ts:39-92` — os 10 itens do grupo CORE (sempre visível) são: Visão geral, Vendas e caixa, Caixas, Catálogo, Clientes, Funcionários, Estoque, Auditoria, Financeiro e fiscal, Relatórios. Só o *hint* (tooltip) de "Estoque" cita "NF-e" (linha 74) — e um hint não é lido antes do clique. A única string "NF-e" clicável do sistema fica em `lib/navigation/estoqueHubNav.ts:19`, como a 4ª de 5 abas dentro do hub Estoque. Não existe busca global nem command palette (`Ctrl+K`) em lugar nenhum do admin.

**P0-2 — Fornecedores/Compras/Comissões escondidos atrás de um menu colapsado, fechado por padrão.**
`components/ui/admin-v2/SidebarNav.tsx:44` — `const [showMore, setShowMore] = useState(false)`. `adminV2SidebarNav.ts:88-92` lista Fornecedores, Compras e Comissões em `ADMIN_V2_EXPANDED_ITEMS`, só visível após um clique extra em "Mais". Isso é a metade inteira do Fluxo 1 (Produto→Fornecedor→Compra) começando invisível.

**P0-3 — Links de Relatórios para o Catálogo existem mas não funcionam ("correção fantasma").**
`app/admin/relatorios/_components/RelatoriosContent.tsx` — as listas Top Produtos, Sem Giro, Curva ABC e Cobertura de Estoque linkam para `/admin/catalogo?produto=<id>` via `adminCatalogoProdutoQuery(id)`. Mas `app/admin/catalogo/page.tsx:61-71` (tipo `SearchParams`) **não reconhece o parâmetro `produto`** — só `q, status, origem, categoria, marca, fornecedor, estoque, imagem, page`. Não existe página de detalhe de produto (`CatalogoTable.tsx:400-402` tem um comentário admitindo isso: *"Não existe tela de detalhe do produto (`/admin/catalogo/[id]` nunca foi criada)."*). O clique leva à lista inteira e não filtrada, sem indicação de erro — dá a falsa impressão de que o problema (achado antigo RM-03) foi resolvido, quando só foi parcialmente resolvido (Vendas e Divergência de Estoque funcionam corretamente; Catálogo não).

### P1 — quebram fluxos importantes ou geram confusão

**P1-1 — Produto cadastrado não oferece caminho para comprá-lo.**
`components/gerente/produtos/ProdutoFormModal.tsx:532-620` — tela de sucesso só tem "Ajustar estoque" e "Imprimir etiqueta". O campo `fornecedorId` do formulário (`ProdutoForm.tsx:207`) é só metadado — não gera nenhuma ação de compra.

**P1-2 — Deep-link Fornecedor→Nova OC só ajuda quem já está em Fornecedores.**
`app/gerente/fornecedores/FornecedoresListClient.tsx:328-341` (G-03) funciona bem, mas não existe o caminho inverso (de Produto para Compras) nem qualquer indicação, na ficha do Produto, de quantidade em OC aberta ou histórico de compras daquele item.

**P1-3 — Confirmação de venda fiado não menciona o título gerado.**
`app/caixa/server/caixaVendas.impl.ts:416` retorna `contasRecebeId`, mas nenhuma UI do PDV o consome (confirmado em `CaixaPageClient.tsx` e no tipo `caixaActionTypes.ts:103`, só usado em teste). O operador termina a venda sem nenhum sinal "título a receber criado: R$ X" — só descobre depois, indiretamente, abrindo a ficha do cliente.

**P1-4 — Dashboard é puramente informativo.**
`app/admin/dashboard/page.tsx` — KPIs, gráficos, "pedidos recentes" (que já linkam corretamente para a venda, G-06) e o card de estoque baixo (que leva a `/admin/estoque` sem filtro, aba Saldos). **Nenhum CTA aponta para "registrar entrada de mercadoria" ou "importar NF-e"** — a própria tela que todo operador vê primeiro ao logar não ajuda a resolver a pergunta que motivou esta auditoria.

**P1-5 — Zero breadcrumb em todo o sistema.**
Busca por "Breadcrumb" no código não retorna nenhum componente de hierarquia (só ocorrências não relacionadas de terminologia do Sentry). A orientação "onde estou" depende só do item ativo na sidebar (`aria-current="page"`) e do título/subtítulo da própria página — nenhuma cadeia tipo "Estoque › Importar NF-e › Conferência". Isso pesa mais nos três fluxos multi-etapa reais do sistema (importação de NF-e, recebimento, transferências), onde o operador pode se perder ao voltar ou recarregar a página no meio do processo.

**P1-6 — Três sistemas de toast paralelos, com sucesso condicional e silêncio em 3 telas.**
Existem `AdminToastViewport.tsx`, `GerenteToastViewport.tsx` e `CaixaToastViewport.tsx`, cada um com fila própria. Em `lib/hooks/useGerenteMutation.ts:32-46`, o toast de sucesso só dispara **se o chamador passar `successMessage`** (opt-in), enquanto o de erro é sempre disparado (assimetria por desenho). Três telas chamam essa hook sem `successMessage`, terminando em silêncio no caminho feliz: `ImprimirEtiquetasPageClient.tsx`, `RecebimentoGerentePageClient.tsx`, `TransferenciasGerentePageClient.tsx`. Vários pontos do admin usam `router.refresh()` isolado sem toast (`CategoriasProdutosContent.tsx:94,112,127`, `ComissoesContent.tsx:137`, `SuspensaoContent.tsx:33`) — um teste (`CatalogoPublicacaoActions.behavior.test.tsx:103`) documenta isso como intencional, mas ainda deixa o operador sem confirmação textual em ações que ele mesmo disparou.

### P2 — melhorias relevantes de UX

- **P2-1** — Loading states inconsistentes: só `app/admin/catalogo/loading.tsx` tem skeleton dedicado; Estoque, Vendas, Financeiro, Relatórios, Compras e Fornecedores no lado `admin/` (server components) não têm `loading.tsx` próprio nem passam `loading=` ao `DataTable` — ficam sem feedback visual em filtros. O lado `gerente/` (client components) é consistente, sempre usa o skeleton do `DataTable`.
- **P2-2** — Comprovante de fechamento de caixa (`CaixaFechamentoReciboModal.tsx:88-99`) só tem "Imprimir"/"Fechar" — sem CTA explícito de próximo passo.
- **P2-3** — Kardex→Auditoria filtra por tipo de evento (`AJUSTE_ESTOQUE`), não pelo produto específico — o operador ainda precisa localizar a linha na lista filtrada. Já documentado como limitação conhecida pelo próprio time (`KardexSheet.tsx:25-31`).
- **P2-4** — EmptyState de Estoque (saldos) e de outras telas de consulta/histórico é passivo, sem sugestão de ação, ao contrário das telas de cadastro (Clientes, Fornecedores, Catálogo etc.), que sempre oferecem CTA.
- **P2-5** — Nomenclatura menu↔título divergente em dois pontos: "Visão geral" (menu) vs. "Dashboard comercial" (título, `adminChineseUiLabels.ts:69`); "Compras" (menu) vs. "Ordens de compra" (título, `pt.json:949`).

### P3 — polish visual e melhorias futuras

- **P3-1** — Sem primitiva compartilhada de Dialog/Sheet; sheets de detalhe (`VendaDetailSheet`, `KardexSheet`, `DocumentoFiscalDetailSheet`, `ComissoesDetailSheet`) são implementações independentes. O detalhe de Ordem de Compra (`OcDetalheModal.tsx`) quebra o padrão "detalhe = Sheet" usando Modal.
- **P3-2** — i18n hardcoded pt-BR em componentes do caixa (achado da auditoria anterior, `CaixaRailTurnoSummary.tsx`, comprovantes) — não reverificado nesta rodada, provavelmente ainda pendente.

---

## 4. Benchmark Bling

Fonte: documentação pública oficial (`ajuda.bling.com.br`), artigos "Como inserir uma Nota de Entrada de produtos?" e "Como realizar o check-in de recebimentos de nota de entrada no Bling", lidos na íntegra em 2026-09-18. Isto **não é uma comparação visual** — é a jornada documentada oficialmente pelo próprio fabricante para o operador final.

| Dimensão | Bling (documentado) | Jinlong (código atual) | Diferença — é um problema? |
|---|---|---|---|
| Rótulo de entrada | Menu **"Estoque › Notas Fiscais de Entrada"** — usa literalmente a frase que o lojista fala | Aba genérica "Importar NF-e", 4ª de 5, dentro de "Estoque" | **Sim.** Mesma profundidade de clique, mas o Bling nomeia a etapa com o vocabulário do cliente; o Jinlong nomeia com vocabulário técnico ("Importar") |
| Nudge proativo | Após importar o XML, o sistema oferece imediatamente o botão "Conferir produtos" — o operador não precisa saber que o próximo passo existe | Depois de importar, a conferência é uma seção da mesma tela — funciona, mas não há esse "empurrão" explícito nomeado | Diferença pequena, mas reforça o padrão "a UI aponta o próximo passo" que falta em outros pontos do Jinlong (dashboard, pós-salvar produto) |
| Conferência: aceitar "como veio" | **Ação deliberada e nomeada**: "Check-in em lote" — separado da conferência item a item, precisa ser escolhido conscientemente | **Corrigido nesta base de código** (ver seção 10): campo nasce vazio até contagem real — hoje equivalente em espírito ao modelo do Bling | Já não é mais diferença — **item resolvido, não incluir em roadmap** |
| Divergência de recebimento | Fluxo estruturado: tipo do problema (faltando/danificado/incorreto/recusado) → ação de negócio (gerar crédito ao fornecedor / gerar nota de devolução / nenhuma ação) | Campo de observação de divergência livre, sem workflow de ação de negócio associado | **Sim, diferença relevante.** Não é urgente, mas é uma lacuna real de processo — divergência hoje vira só um registro, não uma ação (estornar, gerar crédito) |
| Auditoria da conferência | Histórico de ações + "Resumo de conferências" anexado ao próprio documento, imprimível | Auditoria existe como módulo separado (`/admin/auditoria`), hoje já linkada ao Kardex nos dois sentidos | Diferença de local (anexado ao documento vs. módulo separado), não de existência — impacto operacional baixo já que o link cruzado funciona |
| Lançamento de estoque | Ação final explícita e nomeada ("Lançar estoque"), com opção configurável de automação para quem já confia no processo | `confirmarImportacaoNfe` — também é uma etapa final explícita, mas sem opção de automação configurável | Diferença pequena; automação opcional é um "nice to have", não bloqueador |
| Vínculo Pedido de Compra ↔ Nota de Entrada | Vínculo nos dois sentidos (automático na importação de XML e manual), com status "Total"/"Parcial" visíveis | Vínculo **opcional e unidirecional** (Recebimento consome Compras via campo hidden `ordem_compra_id`, mas Compras não aponta para Recebimento nem para Importar NF-e) — commits S8/RM-14 | **Sim, diferença relevante e já mapeada** como decisão de produto pendente na auditoria anterior (Sprint 8) — o Bling mostra que essa unificação é possível e é considerada básica num ERP maduro |
| Pagamento ao fornecedor | Campo de pagamento dentro do próprio formulário da nota, alimentando direto o contas a pagar | Pagamento é um passo separado, fora da tela de Importar NF-e | Diferença de arquitetura — não avaliar como "errado" sem decisão de produto; hoje o Jinlong mantém Financeiro como módulo único de verdade para pagamentos, o que tem mérito próprio (evita duplicar lógica de contas a pagar em 3 telas) |

**Conclusão do benchmark:** a arquitetura de dados do Jinlong (RPCs atômicas, idempotência por caminho, `movimentos_estoque_log` como fonte única) é, pelo que está documentado publicamente, pelo menos tão rigorosa quanto a do Bling — possivelmente mais auditável no nível de banco. A diferença real e mensurável está inteiramente em **nomenclatura de entrada** e **vínculo entre os três caminhos de recebimento**, exatamente os dois pontos já identificados nas seções 1 e 3. Isso é uma boa notícia: não é preciso redesenhar nada estrutural para fechar a maior parte da distância até o "parece um ERP maduro".

---

## 5. Matriz de gaps

| # | Problema | Impacto operacional | Evidência | Prioridade |
|---|---|---|---|---|
| 1 | Nenhum rótulo de menu fala "nota fiscal"/"NF-e"/"entrada" | Cliente não encontra a operação que motivou a visita | `adminV2SidebarNav.ts`, `estoqueHubNav.ts:19` | **P0** |
| 2 | Fornecedores/Compras/Comissões em "Mais" colapsado | Metade do fluxo de suprimentos invisível por padrão | `SidebarNav.tsx:44`, `adminV2SidebarNav.ts:88-92` | **P0** |
| 3 | Links de Relatórios→Catálogo não funcionam | Falsa sensação de correção; investigação de produto mais vendido morre num clique | `RelatoriosContent.tsx`, `app/admin/catalogo/page.tsx:61-71` | **P0** |
| 4 | Produto sem CTA para comprar | Fluxo 1 termina em beco sem saída após cadastro | `ProdutoFormModal.tsx:532-620` | P1 |
| 5 | Venda fiado sem confirmação de título gerado | Operador não sabe se o crédito foi lançado | `caixaVendas.impl.ts:416` | P1 |
| 6 | Dashboard sem CTA de ação operacional | Primeira tela do sistema não ajuda a resolver a dúvida do cliente | `app/admin/dashboard/page.tsx` | P1 |
| 7 | Zero breadcrumb no sistema | Perda de contexto em fluxos multi-etapa | busca por "Breadcrumb" sem resultado relevante | P1 |
| 8 | 3 sistemas de toast + sucesso opt-in | 3 telas terminam em silêncio no caminho feliz | `useGerenteMutation.ts:32-46` | P1 |
| 9 | Loading inconsistente admin vs. gerente | Sem feedback visual em filtros de Vendas/Financeiro/Relatórios | ausência de `loading.tsx`/`loading=` | P2 |
| 10 | Comprovante de fechamento sem CTA de próximo passo | Próximo passo inferido, não indicado | `CaixaFechamentoReciboModal.tsx:88-99` | P2 |
| 11 | Kardex→Auditoria filtra por tipo, não por produto | Investigação exige busca manual na lista filtrada | `KardexSheet.tsx:25-31` | P2 |
| 12 | Nomenclatura menu≠título (Dashboard, Compras) | Quebra previsibilidade "cliquei em X, vejo X" | `adminChineseUiLabels.ts:69`, `pt.json:949` | P2 |
| 13 | Sem Dialog/Sheet compartilhado; Compras quebra padrão | Consistência visual/manutenção, não bloqueia operação | `OcDetalheModal.tsx` vs. demais sheets | P3 |
| 14 | Divergência de recebimento sem workflow de ação de negócio (vs. Bling) | Divergência vira registro, não ação (estorno/crédito) | benchmark Bling, seção 4 | P2 |
| 15 | Vínculo Compras↔Recebimento↔NF-e opcional e parcial | Risco residual de duplicidade de lançamento entre caminhos | commits S8/RM-14; ADR-008 | P1 (decisão de produto) |

---

## 6. P0 — podem impedir ou comprometer a operação

1. Nenhum rótulo de navegação contém "nota fiscal"/"NF-e"/"entrada" (item 1 da matriz).
2. Fornecedores/Compras/Comissões escondidos em menu colapsado por padrão (item 2).
3. Links de Relatórios para Catálogo existem mas não funcionam — correção fantasma (item 3).

## 7. P1 — quebram fluxos importantes ou geram confusão

4. Produto sem CTA para comprar (item 4).
5. Venda fiado sem confirmação de título a receber gerado (item 5).
6. Dashboard sem CTA de ação operacional (item 6).
7. Zero breadcrumb no sistema (item 7).
8. Toast de sucesso opcional — 3 telas terminam em silêncio (item 8).
9. Vínculo Compras↔Recebimento↔NF-e ainda opcional/parcial — risco de duplicidade entre caminhos (item 15, requer decisão de produto antes de qualquer código).

## 8. P2 — melhorias relevantes de UX

10. Loading inconsistente entre admin e gerente (item 9).
11. Comprovante de fechamento sem CTA de próximo passo (item 10).
12. Kardex→Auditoria só filtra por tipo, não por produto (item 11).
13. Nomenclatura menu≠título em Dashboard e Compras (item 12).
14. Divergência de recebimento sem workflow de ação de negócio, ao contrário do Bling (item 14).
15. EmptyState passivo em telas de consulta/histórico (Estoque saldos, Caixas, Relatórios).

## 9. P3 — polish visual e melhorias futuras

16. Ausência de primitiva compartilhada de Dialog/Sheet; Compras quebra o padrão (item 13).
17. i18n hardcoded pt-BR em comprovantes do caixa (herdado da auditoria anterior, não reverificado).
18. Automação opcional de "lançar estoque ao finalizar conferência" (paridade com Bling, não bloqueador).

---

## 10. O que deve ser preservado

Estes pontos já funcionam bem e **não devem ser tocados ou redesenhados** — só copiados como padrão para o resto do sistema:

- **Tela pós-salvo do cadastro de Produto** (`ProdutoFormModal.tsx`) — CTAs explícitos, é o melhor padrão de "e agora?" do sistema hoje.
- **Conferência de NF-e — bug de pré-preenchimento CORRIGIDO.** Verificado nesta auditoria: `valorInicialQtdConferida` (`ImportarNfePageClient.tsx:77-81`) retorna `null` quando `quantidade_conferida` do servidor é `null`, e `aplicarConferencia` (linhas 146-158) só popula o campo quando o valor não é nulo. O campo nasce vazio até o operador contar de verdade — a semântica "esperado ≠ conferido" está correta hoje, e hoje o padrão é equivalente em espírito ao "check-in manual vs. check-in em lote" do Bling. Este item era **P0** na auditoria de 2026-09-17 e está resolvido.
- **Vínculo cruzado Kardex ↔ Auditoria** — funcional nos dois sentidos (`KardexSheet.tsx:32-35,140-147`, `AuditoriaTimeline.tsx:290-303`).
- **Deep-link "Repor" (estoque crítico → recebimento pré-selecionado)** — ponta a ponta, com teste dedicado (`EstoqueTable.tsx:162-179`, `app/admin/estoque/recebimento/page.tsx:62-69`).
- **Cliente visível e vinculável no PDV** (`CaixaOperadorContextBar.tsx:37-51`) — CTA na área principal, não mais escondido em atalho.
- **Recibo de venda fiado mostrando o nome do cliente** (`CaixaReciboModal.tsx:254-256`).
- **Saldo em aberto do cliente → Financeiro filtrado por `cliente_id` exato**, não por nome (corrigido no mesmo dia, commit `5999e1dd`, após bug real de homônimos).
- **Financeiro → link de volta para a venda de origem** (`ContasReceberTable.tsx:73-81`).
- **Divergência de Estoque → Kardex via `onClick` direto** — o padrão mais robusto de "relatório acionável" do sistema hoje (não depende de página de destino ler query param).
- **Fechamento de caixa**: RPC atômica, alçada de gerente, "blind closure", histórico acessível via menu principal sem `adminOnly`.
- **Confirmações destrutivas 100% migradas** para modais do próprio app — zero `window.confirm`/`window.prompt`/`window.alert` restantes em código de produção (`N-01`, `N-02`, `N-03`, `G-10`).
- **Arquitetura de 3 caminhos de entrada de estoque (NF-e/OC/manual)** — é uma decisão em estágios documentada (`ADR-008`, comentário de migração), não um acidente. Não desmontar ou unificar sem decisão de produto explícita.

---

## 11. O que pode ser corrigido sem mudar regra de negócio

Todos os itens abaixo são navegação, rótulo, CTA ou feedback — não tocam RPC, schema ou regra de negócio:

1. Mover Fornecedores e Compras para fora do menu colapsado "Mais" (Comissões pode ficar, é uso menos frequente).
2. Acrescentar/reforçar a palavra "nota fiscal" na navegação de Estoque — ex.: renomear a aba "Importar NF-e" para algo como "Nota fiscal de entrada" ou adicionar essa frase como rótulo secundário visível sem precisar do hint.
3. CTA no Dashboard apontando para "Importar NF-e" / "Registrar recebimento", ao lado do já existente "Relatórios".
4. CTA "Comprar este produto" (ou "Nova OC com este produto") na tela pós-salvo de Produto.
5. Corrigir `/admin/catalogo` para ler `?produto=` — ou, mais simples e mais alinhado ao padrão que já funciona bem em Divergência de Estoque, trocar os links de Top Produtos/Sem Giro/Curva ABC/Cobertura de Estoque por `onClick` que abre o mesmo modal/drawer de edição do Catálogo.
6. Toast explícito "Título a receber gerado: R$ X" ao finalizar venda fiado no PDV, consumindo o `contasRecebeId` que a RPC já retorna.
7. Tornar `successMessage` obrigatório (ou com fallback genérico) em `useGerenteMutation`, eliminando o silêncio nas 3 telas afetadas.
8. CTA de próximo passo explícito no comprovante de fechamento de caixa (ex.: "Abrir novo turno" / "Ver histórico").
9. Alinhar nomenclatura: título da página de Dashboard e de Compras devem bater com o rótulo do menu que levou até ali.
10. EmptyState acionável em Estoque (saldos) — sugerir "ajustar filtro" ou "novo recebimento".
11. Padronizar loading states no lado `admin/` usando o mesmo padrão de `Skeleton` via `DataTable` já usado no lado `gerente/`.

## 12. O que exige decisão de produto

1. **Unificação/vínculo formal entre os 3 caminhos de entrada de estoque** (NF-e, Ordem de Compra, Recebimento manual). O benchmark Bling reforça que isso é esperado num ERP maduro (vínculo Nota↔Pedido nos dois sentidos, com status "Total"/"Parcial"). A auditoria anterior já propôs isso como "Sprint 8" (reunião, não código) — ainda pendente.
2. **Workflow de ação de negócio para divergências de recebimento** (gerar crédito ao fornecedor / gerar nota de devolução / nenhuma ação) — hoje o Jinlong só registra a divergência como texto livre; decidir se vale a pena estruturar esse fluxo como o Bling faz.
3. **Ponto de entrada de navegação para Implantação/Diagnóstico do Caixa** (perfil ADMIN) — pendência já registrada na auditoria anterior, ainda sem decisão.
4. **Adoção de um componente Breadcrumb/Stepper padrão** para os 3 fluxos multi-etapa reais do sistema (importação de NF-e, recebimento, transferências) — decisão de arquitetura de front-end, não uma correção pontual.
5. **Cadastro rápido de cliente no PDV** — hoje bloqueado por `entity-ssot.mdc`; confirmar se a regra continua válida.

---

## 13. Roadmap UX — sprints pequenas, incrementais e reversíveis

Ordem: descoberta > continuidade > clareza > consistência > polish.

**Sprint 1 — Descoberta (o problema que motivou a missão)**
Sair da "Mais" (Fornecedores/Compras) + CTA de entrada de mercadoria no Dashboard + reforçar "nota fiscal" na nomenclatura de Estoque. Risco baixo, maior impacto direto na queixa do cliente.

**Sprint 2 — Continuidade (corrigir a correção fantasma)**
Consertar os links de Relatórios→Catálogo (ler `?produto=` ou trocar por `onClick` como já funciona em Divergência de Estoque). Risco baixo, dado já existe nos DTOs.

**Sprint 3 — Continuidade**
CTA "Comprar este produto" pós-salvo de Produto + toast de "título a receber gerado" no PDV. Risco baixo, backend já retorna os dados necessários.

**Sprint 4 — Clareza**
Eliminar telas silenciosas (`successMessage` obrigatório/fallback) + CTA de próximo passo no comprovante de fechamento de caixa.

**Sprint 5 — Consistência**
Breadcrumb/Stepper simples para os 3 fluxos multi-etapa — **só depois** da decisão de produto do item 12.1 (não formalizar visualmente uma unificação de vocabulário que ainda não foi decidida).

**Sprint 6 — Consistência**
Padronizar loading states no admin + alinhar nomenclatura menu↔título (Dashboard, Compras).

**Sprint 7 — Decisão de produto (não é sprint de código)**
Reunião para decidir vínculo formal Compras↔Recebimento↔NF-e e o workflow de divergência de recebimento, usando o modelo Bling como referência de "o que um ERP maduro faz aqui", não como especificação a copiar.

**Sprint 8 — Polish**
Dialog/Sheet compartilhado (unificar `OcDetalheModal` ao padrão de Sheet); i18n hardcoded nos comprovantes do caixa.

---

## 14. Teste do operador

Lista de tarefas para dar a alguém que nunca viu o Jinlong, sem qualquer explicação prévia, medindo tempo e se precisou perguntar algo:

1. "Você recebeu uma mercadoria com uma nota fiscal do fornecedor. Registre essa entrada e deixe o estoque atualizado." *(mede: achou "Importar NF-e" sem ajuda? — hipótese: falha ou demora, é o achado P0-1)*
2. "Cadastre um produto novo chamado 'Teste X' e, em seguida, crie um pedido de compra dele para um fornecedor." *(mede: achou Compras sem ajuda? — hipótese: falha, é o achado P0-2)*
3. "Venda esse produto para um cliente qualquer, à vista, no caixa." *(mede: fluxo básico do PDV — hipótese: sucesso)*
4. "Venda outro produto a prazo (fiado) para um cliente cadastrado. Depois, confirme que foi gerado algum valor a receber." *(mede: confirmação pós-venda — hipótese: falha na confirmação, sucesso ao checar depois na ficha do cliente)*
5. "Um produto está com estoque baixo. Encontre esse produto e resolva a reposição." *(mede: Estoque→Repor — hipótese: sucesso, é um dos pontos já corrigidos)*
6. "Descubra por que o saldo de um produto específico mudou nos últimos dias." *(mede: Kardex — hipótese: sucesso)*
7. "Feche o caixa do turno atual e depois veja o histórico de fechamentos." *(mede: fechamento + histórico — hipótese: sucesso)*
8. "Encontre o produto mais vendido do mês nos relatórios e abra a ficha completa dele." *(mede: Relatórios→Catálogo — hipótese: falha, é o achado P0-3)*
9. "Encontre um cliente que tenha algum valor em aberto e veja os detalhes financeiros dessa dívida." *(mede: Cliente→Financeiro — hipótese: sucesso)*

Métrica sugerida: tempo até concluir cada tarefa sem ajuda externa + número de tarefas que exigiram pergunta a alguém da equipe. As hipóteses acima já refletem o resultado esperado segundo a evidência de código desta auditoria — rodar o teste com uma pessoa real serve para confirmar (ou refutar) essas previsões antes de priorizar o roadmap da seção 13.

---

## Respostas objetivas

**Por que o cliente sentiu falta de fluxo?**
Porque a navegação não fala a língua do operador (nenhum rótulo diz "nota fiscal"), metade do ERP relacionado a suprimentos está escondida atrás de um menu colapsado, e a primeira tela que qualquer usuário vê (o dashboard) não aponta para nenhuma ação operacional concreta. Isso não é impressão — é mensurável: a pergunta exata do cliente ("onde boto a nota fiscal de entrada?") não tem resposta em menos de 2-3 cliques cegos hoje.

**Quais são os principais gargalos?**
(1) nomenclatura de navegação que não usa o vocabulário do lojista; (2) funcionalidades operacionais inteiras escondidas atrás de um toggle colapsado; (3) telas que terminam sem indicar — ou pior, indicando errado — o próximo passo (silêncio pós-ação, link que parece certo mas não funciona).

**Qual fluxo precisa ser tratado primeiro?**
Entrada de mercadoria com nota fiscal (Fluxos 2 e 3). É literalmente o fluxo que gerou esta missão, concentra os três P0 mais graves (rótulo ausente, Compras escondido, e o risco de duplicidade residual entre os 3 caminhos de recebimento) e é a primeira impressão operacional de qualquer cliente novo.

**Quanto disso é navegação/UX e quanto é ausência real de funcionalidade?**
Esmagadoramente navegação/UX. Dos 18 problemas priorizados nas seções 6-9, apenas 2 (item 15/P1 e o workflow de divergência do item 14/P2) são lacunas que dependem de decisão de produto antes de qualquer código — todo o resto é rótulo, posição de menu, link não verificado ou ausência de feedback sobre dados e RPCs que já existem e já funcionam corretamente.

**O Jinlong precisa de redesign visual ou principalmente de reorganização da experiência?**
Reorganização da experiência. Nenhum problema P0 ou P1 encontrado nesta investigação tem causa em cor, espaçamento, tipografia ou componente visual — todos têm causa em nomenclatura, posição na navegação, link não fechado ou ausência de confirmação pós-ação. O benchmark Bling reforça essa leitura: a diferença relevante não está em como as telas do Bling se parecem, está em como os rótulos e os vínculos entre documentos são nomeados.

**Qual deve ser a próxima sprint?**
Sprint 1 da seção 13 — tirar Fornecedores/Compras do menu colapsado, adicionar um CTA de entrada de mercadoria no dashboard, e reforçar a palavra "nota fiscal" na nomenclatura do hub de Estoque. É a mudança de menor risco técnico (só navegação e rótulo, zero RPC/schema) com maior impacto direto na queixa específica que o cliente relatou.
