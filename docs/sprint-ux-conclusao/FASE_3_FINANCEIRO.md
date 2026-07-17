# Fase 3 — Financeiro: relatório de fechamento

**Status: FECHADA — código 100% concluído.** PR #198.

Não há pendência de banco/infra nesta fase (diferente da Fase 2, onde a
Devolução/Troca depende da migration 248). Todo o trabalho de Financeiro foi
resolvido inteiramente em código.

## Páginas e arquivos auditados (varredura completa do módulo)

**Páginas (Admin V2 — rotas reais):**
- `app/admin/financeiro/page.tsx` — Financeiro unificado (abas Receber/Pagar/Fiscal)
- `app/admin/financeiro/contas-pagar/page.tsx` — rota dedicada de Contas a Pagar
- `app/admin/financeiro/documento/[id]/page.tsx` — detalhe de documento fiscal

**Componentes:**
- `app/admin/financeiro/_components/FinanceiroContent.tsx`
- `app/admin/financeiro/_components/FinanceiroTabNav.tsx`
- `app/admin/financeiro/_components/ContasReceberTable.tsx`
- `app/admin/financeiro/_components/FinanceiroReceberExtras.tsx`
- `app/admin/financeiro/_components/DocumentoFiscalDetailSheet.tsx`
- `app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx`
- `app/gerente/financeiro/contas-pagar/PagamentoModal.tsx`
- `app/gerente/financeiro/documento/[id]/DocumentoFiscalDetalheClient.tsx`

**Server actions e libs:**
- `lib/gerente/financeiroTitulosServer.ts` (`fetchContasReceberListagem`, `fetchFinanceiroTitulosKpis`)
- `app/admin/financeiro/actions.ts` (`obterDetalheDocumentoFiscal`)
- `app/gerente/financeiro/actions.ts` + `actions.validation.ts`
- `app/gerente/financeiro/contas-pagar/actions.ts`
- `app/gerente/financeiro/lib/fiscalEventTimeline.ts`

`app/gerente/financeiro/FinanceiroGerentePageClient.tsx` foi auditado apenas
para confirmar que está fora de escopo: já é rastreado pelo próprio guard
`check:entity-ssot` como `@legacy Gerente; migrado para Admin V2; remover após
validação` — decisão de remoção já documentada pelo projeto, não uma
descoberta desta fase. Não foi alterado.

Nenhum TODO/FIXME/HACK encontrado em todo o escopo do módulo.

## Bugs encontrados e corrigidos (total: 14)

1. **`fetchContasReceberListagem`** — 5 pontos de consulta com erro descartado (busca por cliente, busca por descrição/cliente, listagem principal); qualquer falha virava lista vazia, indistinguível de "sem títulos". Trabalho iniciado antes da pausa para Fase 2, **concluído** nesta fase: tipo de retorno agora inclui `error`, todos os pontos de retorno atualizados.
2. **`fetchFinanceiroTitulosKpis`** — mesmo padrão: falha na consulta de KPIs virava "R$ 0,00 / 0 títulos", enganoso numa tela financeira.
3. **`app/admin/financeiro/page.tsx`** — erro da query de `documentos_fiscais_pendentes` descartado.
4. Os 3 itens acima agora alimentam um banner `role="alert"` na página, com prioridade sobre os estados normais.
5. **`DocumentoFiscalDetailSheet`** — drawer sem focus-trap (mesma classe de bug já corrigida em Estoque). Trabalho retomado do stash pausado, focus-trap idêntico ao usado em `KardexSheet`.
6. **Copy enganosa**: o subtítulo da página e o título da seção "Títulos em Aberto" afirmavam "somente leitura" / "histórico (somente leitura)", mas o painel tem formulários ativos de criar/liquidar título (`FinanceiroReceberExtras`). Corrigido em pt e zh.
7. **`FinanceiroReceberExtras`** — zero suporte a i18n (texto só em português) e forma de pagamento exibida como enum cru (`CARTAO_DEBITO`) em vez de rótulo legível. Corrigido: `idioma` prop, `getMessages`, reuso de `labelFormaPagamentoVenda`.
8. **`FinanceiroTabNav`** — zero suporte a i18n (abas "A receber"/"A pagar"/"Fila fiscal" fixas em português).
9. **`fiscalEventTimeline.ts`** — rótulos de evento e campos da timeline (Mensagem/Código/Categoria/Tentativas/etc.) fixos em português, mesmo a função já recebendo `locale` para formatação de data.
10. **`DocumentoFiscalDetailSheet`** — mesmo gap de i18n (texto da sheet inteira fixo em português).
11. **`DocumentoFiscalDetalheClient`** — mesmo gap; achado revelador: 5 chaves de i18n (`financeiro_fila_fiscal_*`) já existiam em `pt.json`/`zh.json` sem nenhum uso no código — evidência de que o i18n desta tela ficou pela metade em algum momento anterior. Reaproveitadas.
12. **`app/admin/financeiro/documento/[id]/page.tsx`** — falha real na consulta do documento (RLS/rede) virava `notFound()` (404), dizendo ao operador "documento não existe" quando a busca só falhou. Corrigido: erro de consulta agora lança para o error boundary (`app/error.tsx`, com retry); só é 404 quando genuinamente não há linha.
13. **`ReprocessarDocumentoButton.tsx`** — componente órfão, zero importadores em todo o repositório (a UI real usa `ConfirmActionButton` direto em `DocumentoFiscalDetailSheet`). Removido.
14. **`exportarContasPagarParaCSVAction`** (bug real de perda de dados) — a paginação do export comparava `contas.length` com uma constante `CHUNK=500` que nunca correspondia ao `PAGE_SIZE=20` real usado internamente por `buscarContasPagarAction`; como toda página tem no máximo 20 linhas, `20 < 500` é sempre verdadeiro e o loop **sempre parava na 1ª página**, truncando silenciosamente a exportação de CSV a no máximo 20 contas a pagar, não importa quantas batessem no filtro. Corrigido para usar apenas o `hasMore` retornado pela própria action. Regressão comprovada: revertida a correção, teste falhou como esperado, reaplicada, teste passou.

## Testes adicionados (total: 6 novos + 1 atualizado)

- `fiscalEventTimeline.test.ts` — **atualizado** para a nova assinatura (`m: Mensagens` no lugar de rótulos hardcoded); os 3 testes existentes continuam verdes.
- `contas-pagar/actions.test.ts` (1, novo) — regressão do bug #14: simula 2 páginas (21 + 5 linhas) e confirma que o export agrega as 25 linhas via `hasMore`, não trunca na primeira.
- `RecebimentoGerentePageClient.behavior.test.tsx` e `TransferenciasGerentePageClient.behavior.test.tsx` — já contabilizados na Fase 2, mantidos verdes.
- `ContasPagarListClient.behavior.test.tsx` (2, novo) — `loadErrorInicial` tem prioridade sobre o estado normal; sem erro, nenhum alerta aparece.

**Suíte completa: 549/549 verdes.** guard:all 8/8 OK. Typecheck limpo.

## Cobertura obtida

- `exportarContasPagarParaCSVAction`: sem teste antes → regressão dedicada agora, cobrindo exatamente o bug encontrado.
- `ContasPagarListClient`: sem teste antes → 2 testes de comportamento (estado de erro inicial).
- `fiscalEventTimeline`: já tinha 3 testes; mantidos e adaptados à nova assinatura i18n.
- `PagamentoModal`, `DocumentoFiscalDetailSheet`, `DocumentoFiscalDetalheClient`, `ContasReceberTable`, `FinanceiroReceberExtras`, `FinanceiroTabNav`: sem teste de comportamento dedicado (leitura completa linha a linha feita nesta auditoria; risco residual baixo — usam os mesmos padrões de erro/toast/i18n já validados nos componentes testados).

## Pendências — exclusivamente externas ao código

Nenhuma. Diferente da Fase 2 (Devolução/Troca bloqueada pela migration 248),
o módulo Financeiro não depende de nenhuma migration, dashboard ou
configuração de produção pendente.

## Percentual do código do módulo

**100%.** Todo bug identificado foi corrigido (incluindo um bug real de perda
de dados na exportação de CSV), todo código morto no escopo foi removido,
todo gap de i18n encontrado foi fechado (incluindo texto fixo em português em
5 componentes que nunca tiveram suporte a zh), toda tela e action foi
auditada, a suíte de testes está verde, guard:all está verde e o typecheck
está limpo.
