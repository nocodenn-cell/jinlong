# Sprint UX/UI e Inteligência de Produto — Jinlong (2026-11-27)

| Campo | Valor |
|---|---|
| Base | `main` @ `d257977b` (branch `claude/jinlong-ux-ui-sprint-3de923`) |
| Escopo | `pdv-importados/` (ERP web + PDV web). PDV desktop (`pdv-local`) fora do escopo |
| Método | Leitura de código com evidência `arquivo:linha`, cruzamento com as migrations (códigos de erro reais) e reverificação dos achados da auditoria Bling (`docs/AUDITORIA_UX_FLUXOS_BENCHMARK_BLING.md`, 2026-09-18) |
| Referências | Bling, Omie e Tiny como padrão de maturidade (pendências do dia na home, erro que diz o que fazer, confirmação destrutiva no próprio sistema). Nenhuma funcionalidade copiada |
| Restrições respeitadas | Sem migration, sem produção, sem dependência nova, sem funcionalidade duplicada. Design System (`DragonModal`, `Button`, `SectionCard`, tokens) e SSoT (leitores do financeiro, ADR-010) preservados |

---

## 1. O que já estava resolvido (não refazer)

A auditoria Bling de setembro listava três P0 de navegação. Todos estão resolvidos no código atual:

| Achado de 2026-09 | Estado hoje | Evidência |
|---|---|---|
| Nenhum menu falava "nota fiscal/entrada" | Menu por jornada: Hoje, Vender, Abastecer (compra → recebimento → NF-e → etiquetas), Estoque, Produtos, Dinheiro, Análises | `lib/navigation/adminV2SidebarNav.ts:55-130` |
| Sem busca global | Command palette (`Ctrl+K`) com testes | `components/ui/admin-v2/CommandPalette.tsx` |
| Fornecedores/Compras escondidos em "Mais" | Viraram abas de "Abastecer" | `adminV2SidebarNav.ts:74-86` |
| Link Relatórios → Catálogo "fantasma" | Helper `adminCatalogoProdutoQuery` removido | sem ocorrências em `app/`/`lib/` |
| 3 telas terminavam em silêncio (toast opt-in) | As três emitem toast de sucesso | `RecebimentoGerentePageClient.tsx:226`, `TransferenciasGerentePageClient.tsx:116`, `ImprimirEtiquetasPageClient.tsx:159,206` |

O PDV também já tem base madura: atalhos com fonte única (`app/caixa/caixaAtalhos.ts`, F1–F12, Alt+letra, 1–4 para forma de pagamento), ajuda F1 gerada do mesmo mapa, troca de operador com PIN e bloqueio por inatividade.

---

## 2. Diagnóstico priorizado

### P0 — quebra a operação

Nenhum P0 novo de UX. Os P0 abertos do projeto são operacionais (migrations em produção, senha do gerente, formulário do site) e estão no `PROXIMOS_PASSOS.md`.

### P1 — gera retrabalho, erro ou perda de confiança

| # | Problema | Evidência | Quem sofre | Estado |
|---|---|---|---|---|
| P1-1 | **Caixa responde "Não foi possível concluir. Tente novamente." para erros que nunca vão passar.** 13 códigos do banco caíam no texto genérico: forma de pagamento sem conta financeira, estorno sem caixa aberto ou com mais de um caixa aberto, venda já cancelada, sem permissão, motivo obrigatório, caixa em uso por outro operador, fechamento repetido com outro valor, sessão expirada no fechamento. O operador repete a ação, chama o suporte ou desiste da venda | `app/caixa/server/caixaErroOperador.ts` (antes: só 11 casos mapeados); códigos em `backend/supabase/migrations/20261107110000_d5_…sql:29`, `20261107120000_d2_…sql:56-60`, `20261023200000_pdv_troca_operador_caixa.sql:269`, `20260902100200_…sql:103`, `20261119120100_…sql:73`. Já constava no backlog (P2, "mensagens genéricas no caixa") | Operador, vendedor | **Corrigido nesta sprint** |
| P1-2 | **A tela "Hoje" promete "Pendências e alertas do dia" e não mostra nenhuma pendência financeira.** Conta a pagar vencida ou vencendo hoje e conta a receber vencida só aparecem se o dono abrir Dinheiro, escolher a aba e filtrar (3–4 cliques). Bling/Omie/Tiny abrem com "contas do dia" | `adminV2SidebarNav.ts:62` (hint), `app/admin/dashboard/page.tsx` (só vendas, estoque baixo, atividades) | Dono, gerente | **Corrigido nesta sprint** |
| P1-3 | Fiado no caixa: a tela aceita finalizar com saldo pendente. O escopo do primeiro cliente é sem fiado | `app/caixa/CaixaPageClient.tsx:1113-1120` | Operador, dono | Decisão de produto (já no backlog) |

### P2 — atrito e inconsistência

| # | Problema | Evidência | Estado |
|---|---|---|---|
| P2-1 | **Confirmações destrutivas com `window.confirm`/`window.alert` do navegador** em 9 pontos (excluir regra/meta de comissão, aprovar/pagar comissões, inativar conta financeira, remover lançamentos de importação, cancelar assinatura). O diálogo nativo mostra o domínio no título, tem botões no idioma do navegador (operador chinês vê "OK/Cancel" numa tela em zh), não destaca a ação perigosa e foge do tema. Erro de inativar conta aparecia em `alert()` | `FinanceiroContas.tsx:177,186`, `FechamentoClient.tsx:35`, `MetasComissaoClient.tsx:102`, `RegrasComissaoClient.tsx:179`, `LancamentosSecao.tsx:62`, `MercadoriasSecao.tsx:118`, `ResumoSecao.tsx:119`, `AssinaturaContent.tsx:156` | **Corrigido nesta sprint** |
| P2-2 | Restavam 8 confirmações nativas (`globalThis.confirm`/`confirm`): `ConfirmActionButton`, descarte em `ClienteEditarModal` e `FornecedorEditarModal`, exclusão em lote de fornecedores, reprocessar documento fiscal, resetar PIN da equipe e **excluir venda no PDV** | `ConfirmActionButton.tsx`, `ClienteEditarModal.tsx:98`, `FornecedorEditarModal.tsx:47`, `FornecedoresListClient.tsx:209`, `DocumentoFiscalDetalheClient.tsx:141`, `MeuPinClient.tsx:103`, `CaixaPageClient.tsx:808` | **Corrigido na onda A** |
| P2-3 | "Contas a receber vencidas" não tinha filtro na listagem: o atalho da tela Hoje levava à aba "A receber" sem filtro | `lib/gerente/financeiroTitulosServer.ts:49-66` | **Corrigido na onda A** (`vencidos=1`) |
| P2-4 | Carregamento genérico: só `admin/loading.tsx` e `admin/dashboard/loading.tsx`; Vendas, Financeiro, Estoque e Relatórios usam o skeleton genérico do admin | `find app/admin -name loading.tsx` | Próxima onda |
| P2-5 | Grade do carrinho do PDV em 1280–1366 px pode rolar na horizontal | backlog P2 | Próxima onda (precisa de teste visual) |
| P2-6 | Texto de "Meu PIN do caixa" diz que o PIN serve para entrar; no web ele só desbloqueia o próprio caixa. No PDV desktop pode servir para entrar (o texto cita "próxima sincronização do PDV") | `src/lib/i18n/pt.json` (`meu_pin.subtitulo`), `app/caixa/server/caixaTrocaOperador.impl.ts:11,85-127` | Confirmar com o dono antes de mudar |

### P3 — acabamento

- P3-1: textos do novo card "Pendências do dia" estão no próprio componente (padrão comum no admin, ex. `ImprimirEtiquetasPageClient`). Migrar para o dicionário quando o dashboard migrar.
- P3-2: o diálogo nativo ainda é usado em testes E2E de outros fluxos? Verificado: só `e2e/comissao-modulo.spec.ts` dependia dele (ajustado).

---

## 3. Proposta de UX (princípios aplicados)

1. **Erro diz o motivo e a saída.** Erro transitório: "tente novamente". Erro de regra: o que aconteceu + o que fazer + quem resolve ("peça ao gerente para configurar em Dinheiro › Contas e saldos").
2. **A primeira tela responde "o que preciso fazer hoje?".** Cada pendência é um atalho já filtrado (1 clique). Sem pendência, a tela diz isso; consulta que falhou some da lista em vez de mostrar zero falso.
3. **Ação destrutiva confirma dentro do sistema**, no idioma da tela, com o botão perigoso em vermelho, Escape/clique fora = cancelar e foco preso no diálogo.

Por perfil:

| Perfil | Ganho desta sprint |
|---|---|
| Operador/vendedor | Erros do caixa com instrução clara (pt e zh) |
| Gerente | Pendências do dia na primeira tela; confirmações consistentes em comissões, importações e financeiro |
| Dono/administrador | Visão de contas vencidas sem navegar; cancelamento de assinatura com confirmação clara |

---

## 4. Implementado nesta sprint

| Melhoria | Arquivos | Testes |
|---|---|---|
| Mensagens acionáveis para 13 códigos do caixa (pt + zh), específicas antes das genéricas | `app/caixa/server/caixaErroOperador.ts` | `caixaErroOperador.test.ts` (+15 casos, 30 no total) |
| `useConfirmDialog` (confirmar + avisar) sobre `DragonModal` e `Button` | `components/ui/useConfirmDialog.tsx` | `useConfirmDialog.behavior.test.tsx` (7) |
| 9 `window.confirm`/`alert` trocados pelo diálogo do DS | `FinanceiroContas.tsx`, `FechamentoClient.tsx`, `MetasComissaoClient.tsx`, `RegrasComissaoClient.tsx`, `LancamentosSecao.tsx`, `MercadoriasSecao.tsx`, `ResumoSecao.tsx`, `AssinaturaContent.tsx` | E2E `comissao-modulo.spec.ts` ajustado para clicar em `confirm-dialog-confirmar` |
| Card "Pendências do dia" (pagar vencidas, receber vencidas, pagar vencendo hoje) com atalhos filtrados | `app/admin/dashboard/_components/PendenciasHojeCard.tsx`, `app/admin/dashboard/pendenciasHoje.ts`, `app/admin/dashboard/page.tsx` | `pendenciasHoje.test.ts` (4) |
| Contagem pelos leitores do financeiro (SSoT, ADR-010): status em aberto viraram constantes únicas; leitor de recebíveis passou a usar um único `from('contas_receber')` | `payableReader.ts` (`PAYABLE_STATUS_EM_ABERTO`, `contarContasPagarEmAberto`), `receivableReader.ts` (`RECEBER_STATUS_EM_ABERTO`, `contarRecebiveisVencidos`), `financeiroTitulosServer.ts` | baseline do ratchet: `direct-from` 3 → 1 no leitor |

O card roda em paralelo com as consultas que a tela já fazia (mesmo `Promise.all`), só com contagens `head: true`: não traz linhas e não muda o tempo de carga de forma perceptível.

---

### Onda A (2026-11-28)

| Melhoria | Arquivos | Testes |
|---|---|---|
| Filtro "Só vencidos" em Dinheiro › A receber (`?vencidos=1`), com pílula na barra de filtros e chip removível; atalho da tela Hoje aponta para ele. Mesma regra de `contarRecebiveisVencidos` | `shared-core/src/financial/contracts.ts` (campo opcional), `receivableReader.ts`, `financeiroTitulosServer.ts`, `app/admin/financeiro/page.tsx`, `pendenciasHoje.ts`, `pt.json`/`zh.json` | `receivableReader.test.ts` (+2) |
| `ConfirmActionButton` sobre o diálogo do DS (preserva `submit` com `requestSubmit`) | `components/gerente/ConfirmActionButton.tsx` | `ConfirmActionButton.behavior.test.tsx` (3) |
| Descarte de alterações (cliente, fornecedor), exclusão em lote de fornecedores, reprocessar documento fiscal e resetar PIN no diálogo do DS | `ClienteEditarModal.tsx`, `FornecedorEditarModal.tsx`, `FornecedoresListClient.tsx`, `DocumentoFiscalDetalheClient.tsx`, `MeuPinClient.tsx` | suítes existentes |
| PDV: "Excluir venda" usa o `CaixaConfirmModal` do caixa, com foco inicial em Cancelar (Enter acidental não apaga o cupom) | `app/caixa/CaixaPageClient.tsx` | suíte do caixa |

Resultado: nenhum `confirm`/`alert` nativo em `app/` e `components/`.

## 5. Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| CA-1 | Nenhum dos 13 códigos listados devolve o texto genérico, em pt e zh | `caixaErroOperador.test.ts` |
| CA-2 | Estorno sem caixa aberto não é confundido com "caixa fechado ao finalizar"; saldo insuficiente continua sugerindo suprimento | idem |
| CA-3 | Nenhum `confirm`/`alert` nativo (`window.`, `globalThis.` ou sem prefixo) em `app/` e `components/` | `grep -rn "window\.confirm\|window\.alert" app components` |
| CA-4 | Confirmar só executa após clique no botão; Cancelar, Escape e clique fora não executam; botões em zh quando o texto é zh | `useConfirmDialog.behavior.test.tsx` |
| CA-5 | Tela Hoje mostra cada pendência > 0 com link filtrado; sem pendência mostra "Nada pendente"; consulta com erro não vira zero | `pendenciasHoje.test.ts` |
| CA-6 | Contagens usam as mesmas regras da listagem (status em aberto + `vencimento < hoje`) | `pendenciasHoje.test.ts` (filtros conferidos) |
| CA-7 | Guardas de arquitetura, typecheck, lint e build passam | seção 6 |

---

## 6. Evidências de validação

Executado localmente no worktree:

- `npm run typecheck` (pdv-importados): sem erros.
- `eslint` nos arquivos alterados: 0 erros (1 aviso antigo de `<img>` em `AssinaturaContent.tsx`).
- `npm run guard:all`: todas OK (core, pdv-flow, rotas, rpc, pricing, deps, migrations, domínio, ratchet, no-prod-target, entity-ssot).
- Testes direcionados: dashboard, financeiro, `lib/gerente`, comissões, importações, assinatura, caixa: todos passando.
- Suíte completa (`vitest run`): 465 arquivos / 2936 testes passando, 1 falha por tempo limite em `tests/nextConfigSecurityHeaders.test.ts` sob carga (passa isolado em 3,5 s; não tocamos em `next.config.js`).
- `next build`: compilado com sucesso, 21 páginas estáticas geradas; `/admin/dashboard` 81 kB.

Não verificado: comportamento na tela real com dados (não havia ambiente com login e dados nesta sessão), E2E Playwright (exige stack E2E isolada).

---

## 7. Plano incremental (próximas ondas)

| Onda | Itens | Custo | Depende de |
|---|---|---|---|
| A | Concluída em 2026-11-28 (P2-2 e P2-3) | Baixo | — |
| B | P2-4 skeletons por rota (Vendas, Financeiro, Estoque, Relatórios); P2-5 grade do carrinho em 1280–1366 px com teste visual | Baixo/médio | Ambiente com dados para captura |
| C | Pendências adicionais na tela Hoje: NF-e importada sem conferência, pedido de compra atrasado, caixa aberto há mais de 12 h | Médio | Confirmar leitores e RLS por perfil |
| D | P1-3 fiado e P2-6 texto do PIN | Baixo | Decisão do dono |
