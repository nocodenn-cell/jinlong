\# Auditoria e Plano de RemoÃ§Ã£o do MÃ³dulo Fiado



\## Estado atual (evidÃªncias)



\*\*DecisÃ£o de produto jÃ¡ aplicada no banco:\*\* migration \[`246\_remover\_venda\_fiado.sql`](backend/supabase/migrations/246\_remover\_venda\_fiado.sql) rejeita `FIADO` na RPC `finalizar\_venda\_transacional\_canonica\_v4` e adiciona CHECK em `vendas` / `vendas\_pagamentos` barrando `FIADO`.



\*\*PDV hoje:\*\* apenas 4 formas em \[`finalizarVendaValidation.ts`](pdv-importados/app/caixa/finalizarVendaValidation.ts): `DINHEIRO`, `PIX`, `CARTAO\_DEBITO`, `CARTAO\_CREDITO`. Sem FIADO/CREDIARIO no seletor.



\*\*O que ainda existe:\*\* subsistema manual de contas a receber (`contas\_receber` + `liquidacoes\_receber` + RPC `registrar\_liquidacao\_receber`), UI de crediÃ¡rio/limite em clientes, telas financeiro com listagem AR, espelho `venda\_finance\_context` com ramo FIADO, filtro morto `CREDIARIO` em relatÃ³rios.



\*\*Escopo confirmado:\*\* remoÃ§Ã£o total â€” eliminar AR, crediÃ¡rio, limite de crÃ©dito e todas as referÃªncias visÃ­veis/ocultas.



```mermaid

flowchart LR

&#x20; subgraph removed \[Ja removido]

&#x20;   PDV\[PDV 4 formas] --> RPCv4\[finalizar\_venda v4]

&#x20;   RPCv4 -->|FIADO bloqueado| Block\[CHECK migration 246]

&#x20; end

&#x20; subgraph remains \[Ainda presente]

&#x20;   Manual\[criarTituloReceber] --> CR\[(contas\_receber)]

&#x20;   CR --> AdminUI\["/admin/financeiro read-only"]

&#x20; CR --> View\[v\_clientes\_gerente.saldo\_crediario]

&#x20;   View --> ClientesUI\[ClientesListClient orfao]

&#x20;   Orphan\[FinanceiroGerentePageClient] -->|liquidarTitulo| RPC\[registrar\_liquidacao\_receber]

&#x20; end

```



\---



\## 1. LocalizaÃ§Ã£o â€” Arquivos encontrados



\### AplicaÃ§Ã£o produÃ§Ã£o (`pdv-importados`)



| Ãrea | Arquivos |

|------|----------|

| \*\*Financeiro / AR\*\* | \[`app/admin/financeiro/page.tsx`](pdv-importados/app/admin/financeiro/page.tsx), \[`\_components/ContasReceberTable.tsx`](pdv-importados/app/admin/financeiro/\_components/ContasReceberTable.tsx), \[`\_components/FinanceiroPanels.tsx`](pdv-importados/app/admin/financeiro/\_components/FinanceiroPanels.tsx), \[`app/gerente/financeiro/FinanceiroGerentePageClient.tsx`](pdv-importados/app/gerente/financeiro/FinanceiroGerentePageClient.tsx), \[`app/gerente/financeiro/actions.ts`](pdv-importados/app/gerente/financeiro/actions.ts), \[`actions.validation.ts`](pdv-importados/app/gerente/financeiro/actions.validation.ts), \[`actions.validation.test.ts`](pdv-importados/app/gerente/financeiro/actions.validation.test.ts), \[`lib/gerente/financeiroTitulosServer.ts`](pdv-importados/lib/gerente/financeiroTitulosServer.ts) |

| \*\*Clientes / crediÃ¡rio\*\* | \[`app/gerente/clientes/ClientesListClient.tsx`](pdv-importados/app/gerente/clientes/ClientesListClient.tsx), \[`ClienteEditarModal.tsx`](pdv-importados/app/gerente/clientes/ClienteEditarModal.tsx), \[`actions.ts`](pdv-importados/app/gerente/clientes/actions.ts) |

| \*\*Fiscal (compartilhado â€” manter)\*\* | \[`app/gerente/financeiro/documento/\[id]/DocumentoFiscalDetalheClient.tsx`](pdv-importados/app/gerente/financeiro/documento/\[id]/DocumentoFiscalDetalheClient.tsx), \[`lib/fiscalEventTimeline.ts`](pdv-importados/app/gerente/financeiro/lib/fiscalEventTimeline.ts) |

| \*\*Contas a pagar (manter)\*\* | \[`app/gerente/financeiro/contas-pagar/\*`](pdv-importados/app/gerente/financeiro/contas-pagar/) |

| \*\*RelatÃ³rios\*\* | \[`app/gerente/relatorios/vendas/RelatorioVendasClient.tsx`](pdv-importados/app/gerente/relatorios/vendas/RelatorioVendasClient.tsx) (filtro `CREDIARIO`) |

| \*\*PDV (revalidate legado)\*\* | \[`app/caixa/server/caixaVendas.impl.ts`](pdv-importados/app/caixa/server/caixaVendas.impl.ts) L122, L388 â€” `revalidatePath('/gerente/financeiro')` |

| \*\*NavegaÃ§Ã£o\*\* | \[`lib/navigation/adminV2SidebarNav.ts`](pdv-importados/lib/navigation/adminV2SidebarNav.ts), \[`adminSidebarNav.ts`](pdv-importados/lib/navigation/adminSidebarNav.ts), \[`gerenteNavUi.ts`](pdv-importados/lib/navigation/gerenteNavUi.ts), \[`shared-core/navigation/routes.ts`](shared-core/navigation/routes.ts) |

| \*\*i18n\*\* | \[`src/lib/i18n/pt.json`](pdv-importados/src/lib/i18n/pt.json), \[`zh.json`](pdv-importados/src/lib/i18n/zh.json) â€” chaves `clientes.em\_crediario`, `field\_limite\_crediario`, `gerente.financeiro\_stub.\*` |

| \*\*Tipos\*\* | \[`lib/supabase/database.types.ts`](pdv-importados/lib/supabase/database.types.ts) â€” `contas\_receber`, `liquidacoes\_receber`, `venda\_finance\_context`, `registrar\_liquidacao\_receber` |

| \*\*PermissÃµes\*\* | \[`lib/admin/policy/adminPolicy.ts`](pdv-importados/lib/admin/policy/adminPolicy.ts) â€” `sensitive:financeiro` |

| \*\*E2E\*\* | \[`e2e/sync-fluxo-gerente.spec.ts`](pdv-importados/e2e/sync-fluxo-gerente.spec.ts) L202â€“210 |

| \*\*Docs app\*\* | \[`docs/SECURITY\_ARCHITECTURE.md`](pdv-importados/docs/SECURITY\_ARCHITECTURE.md) |



\### Backend / banco



| Artefato | Arquivo origem |

|----------|----------------|

| Tabelas `clientes`, `contas\_receber`, `liquidacoes\_receber` | \[`035\_fiado\_fiscal\_stub.sql`](backend/supabase/migrations/035\_fiado\_fiscal\_stub.sql) |

| RLS multi-tenant + RPC v2 | \[`112\_clientes\_contas\_receber\_loja\_isolamento.sql`](backend/supabase/migrations/112\_clientes\_contas\_receber\_loja\_isolamento.sql) |

| View `v\_clientes\_gerente` + `saldo\_crediario` | \[`253\_clientes\_tipo\_endereco\_e\_view\_gerente.sql`](backend/supabase/migrations/253\_clientes\_tipo\_endereco\_e\_view\_gerente.sql) |

| Espelho `venda\_finance\_context` + triggers FIADO | \[`252\_venda\_finance\_context\_mirror.sql`](backend/supabase/migrations/252\_venda\_finance\_context\_mirror.sql) |

| Bloqueio venda FIADO | \[`246\_remover\_venda\_fiado.sql`](backend/supabase/migrations/246\_remover\_venda\_fiado.sql) |

| DROP tabelas legadas | \[`245\_remover\_venda\_fiado.sql`](backend/supabase/migrations/20260620222629\_245\_remover\_venda\_fiado.sql) |

| Ãndices AR | \[`223\_indices\_fks\_sem\_cobertura.sql`](backend/supabase/migrations/223\_indices\_fks\_sem\_cobertura.sql), \[`222\_drop\_indices\_duplicados.sql`](backend/supabase/migrations/222\_drop\_indices\_duplicados.sql) |

| RLS initplan | \[`224\_rls\_initplan\_wrap\_auth\_select.sql`](backend/supabase/migrations/224\_rls\_initplan\_wrap\_auth\_select.sql) |

| Grants | \[`255\_grant\_baseline\_tabelas\_authenticated.sql`](backend/supabase/migrations/255\_grant\_baseline\_tabelas\_authenticated.sql) |

| `devolucoes` ainda aceita FIADO | \[`059\_cancelar\_venda\_split\_e\_auditoria\_nao\_dinheiro.sql`](backend/supabase/migrations/059\_cancelar\_venda\_split\_e\_auditoria\_nao\_dinheiro.sql) |

| Smoke / testes | \[`smoke\_rls\_painel\_gerente.sql`](backend/supabase/scripts/smoke\_rls\_painel\_gerente.sql), \[`smoke\_item4\_integracao\_recebimento\_financeiro\_fiscal.sql`](backend/supabase/scripts/smoke\_item4\_integracao\_recebimento\_financeiro\_fiscal.sql), \[`test-rls-scope.mjs`](backend/scripts/test-rls-scope.mjs), \[`p0-rls-rest-smoke.mjs`](backend/scripts/p0-rls-rest-smoke.mjs) |



\### DocumentaÃ§Ã£o / protÃ³tipos (nÃ£o runtime)



\- Docs raiz: \[`AUDITORIA\_DRIFT\_PRODUCAO\_REPOSITORIO.md`](AUDITORIA\_DRIFT\_PRODUCAO\_REPOSITORIO.md), \[`docs/FEATURE\_FREEZE\_PILOTO.md`](docs/FEATURE\_FREEZE\_PILOTO.md), \[`docs/AUTHORIZATION\_MATRIX.md`](docs/AUTHORIZATION\_MATRIX.md), \[`docs/GOVERNANCA\_PMO\_JINLONG.md`](docs/GOVERNANCA\_PMO\_JINLONG.md), etc.

\- Jinlong (untracked): \[`Jinlong/Arquitetura.md`](Jinlong/Arquitetura.md), \[`Jinlong/PDV.md`](Jinlong/PDV.md) â€” descrevem fluxo PRAZO â†’ `contas\_receber` \*\*desatualizado\*\*

\- ProtÃ³tipos: `jinlong layout 20-05/ui\_kits/clientes-page/\*`, `relatorio-vendas-page/\*`, `prototipo/\*` (\~20 arquivos)



\### Termos buscados sem ocorrÃªncia no cÃ³digo



`conta\_cliente`, `venda\_prazo`, `pagamento posterior`, `credito\_cliente`, `recebimento\_fiado` â€” \*\*zero matches\*\*.



\### `pdv-local`



\*\*Zero referÃªncias\*\* a fiado/crediÃ¡rio/contas\_receber.



\---



\## 2. Interface â€” Onde Fiado/CrediÃ¡rio aparece hoje



| MÃ³dulo | Aparece? | EvidÃªncia |

|--------|----------|-----------|

| \*\*PDV\*\* | NÃ£o (forma fiado) | `FORMAS\_PAGAMENTO\_CAIXA` sem FIADO |

| \*\*Menu Gerente\*\* | Indireto | Item "Financeiro" â†’ `/admin/financeiro` (AR + fiscal) |

| \*\*Financeiro\*\* | Sim | `/admin/financeiro` â€” KPIs e tabela `contas\_receber` |

| \*\*Cadastro Clientes\*\* | Sim (Ã³rfÃ£o) | `ClientesListClient` â€” coluna saldo crediÃ¡rio, limite, badge "em crediÃ¡rio aberto". \*\*Sem `page.tsx`\*\*; `/gerente/clientes` redireciona para `/admin/catalogo` |

| \*\*RelatÃ³rios\*\* | Sim (filtro morto) | `RelatorioVendasClient` â€” opÃ§Ã£o `CREDIARIO` (DB nunca usou esse valor) |

| \*\*ConfiguraÃ§Ãµes\*\* | NÃ£o | Sem referÃªncias |

| \*\*Formas de Pagamento\*\* | NÃ£o no PDV | Hardcoded nas 4 formas |

| \*\*Dashboard\*\* | NÃ£o | Sem widgets fiado |

| \*\*PermissÃµes\*\* | Indireto | `sensitive:financeiro` cobre rota AR |



\*\*ConfusÃ£o de nomenclatura:\*\* "Recebimento" no menu = estoque/remessa (\[`/admin/estoque/recebimento`](pdv-importados/app/admin/estoque/recebimento/page.tsx)), \*\*nÃ£o\*\* recebimento de fiado.



\---



\## 3. Fluxo atual (real vs documentado)



\### Fluxo documentado (desatualizado â€” `Jinlong/Arquitetura.md`)



`forma\_pagamento = PRAZO` â†’ `INSERT contas\_receber` na finalizaÃ§Ã£o â†’ painel financeiro â†’ baixa.



\### Fluxo real hoje



1\. \*\*SeleÃ§Ã£o pagamento (PDV):\*\* operador escolhe 1 das 4 formas â†’ `finalizarVendaCaixa` â†’ RPC v4.

2\. \*\*GeraÃ§Ã£o venda:\*\* FIADO rejeitado com `FINALIZAR\_VENDA\_CANONICA\_FIADO\_DESABILITADO` + CHECK DB.

3\. \*\*Financeiro:\*\* \*\*nenhum\*\* `INSERT` automÃ¡tico em `contas\_receber` em nenhuma migration de finalizaÃ§Ã£o.

4\. \*\*Contas a receber:\*\* apenas via server action `criarTituloReceber` (\[`actions.ts`](pdv-importados/app/gerente/financeiro/actions.ts) L55â€“94) â€” UI em `FinanceiroGerentePageClient` \*\*sem rota montada\*\*.

5\. \*\*Listagem:\*\* `/admin/financeiro` via `fetchContasReceberListagem` â€” \*\*somente leitura\*\*.

6\. \*\*HistÃ³rico:\*\* tabela `liquidacoes\_receber` existe; \*\*sem UI de histÃ³rico\*\* no admin.

7\. \*\*Baixa:\*\* RPC `registrar\_liquidacao\_receber` + action `liquidarTitulo` â€” UI sÃ³ no componente Ã³rfÃ£o `FinanceiroGerentePageClient`.



\*\*ConclusÃ£o:\*\* o fluxo fiado ponta-a-ponta \*\*nÃ£o opera\*\*; restam fragmentos de AR manual e branding crediÃ¡rio.



\---



\## 4. DependÃªncias



```mermaid

flowchart TD

&#x20; UI\_Admin\["/admin/financeiro"] --> FTS\[financeiroTitulosServer]

&#x20; FTS --> CR\[(contas\_receber)]

&#x20; UI\_Orphan\[FinanceiroGerentePageClient] --> Actions\[financeiro/actions]

&#x20; Actions --> CR

&#x20; Actions --> RPC\[registrar\_liquidacao\_receber]

&#x20; RPC --> LR\[(liquidacoes\_receber)]

&#x20; RPC --> CR

&#x20; ClientesUI --> View\[v\_clientes\_gerente]

&#x20; View --> CR

&#x20; View --> CL\[(clientes.limite\_credito)]

&#x20; VFC\[venda\_finance\_context] --> CR

&#x20; VFC --> VP\[vendas\_pagamentos trigger]

&#x20; Caixa\[caixaVendas.impl] -->|revalidatePath| FinanceiroRoute

```



| DependÃªncia | Tipo | Uso fiado |

|-------------|------|-----------|

| `contas\_receber` | Tabela | Core AR â€” criada no stub fiado |

| `liquidacoes\_receber` | Tabela | Baixa de tÃ­tulos |

| `clientes` + `limite\_credito` | Tabela/coluna | Limite crediÃ¡rio |

| `v\_clientes\_gerente` | View | `saldo\_crediario` computado |

| `registrar\_liquidacao\_receber` | RPC | Baixa atÃ´mica |

| `venda\_finance\_context` | Tabela + triggers | Ramo `origem\_pagamento = FIADO` (morto pÃ³s-246) |

| `criarTituloReceber`, `liquidarTitulo` | Server Actions | Mutations AR |

| `fetchContasReceberListagem` | Server lib | Listagem admin |

| `documentos\_fiscais\_pendentes` | Tabela | \*\*Compartilhada\*\* â€” mesma migration 035, \*\*nÃ£o Ã© fiado\*\* |

| `devolucoes.forma\_pagamento` CHECK | Constraint | Ainda lista `FIADO` (legado histÃ³rico) |



\---



\## 5. Banco de dados â€” Exclusivo vs compartilhado



\### Exclusivo ao Fiado/AR (remover)



\- Tabelas: `contas\_receber`, `liquidacoes\_receber`

\- RPC: `registrar\_liquidacao\_receber`

\- View: `v\_clientes\_gerente` (ou recriar sem `saldo\_crediario`)

\- Coluna: `clientes.limite\_credito`

\- Tabela espelho: `venda\_finance\_context` + funÃ§Ã£o `sincronizar\_finance\_context\_venda` + triggers `trg\_finance\_context\_\*`

\- Ãndices: `idx\_cr\_\*`, `idx\_contas\_receber\_\*`, `idx\_liquidacoes\_receber\_\*`

\- Policies RLS: `contas\_receber\_\*`, `liquidacoes\_\*`

\- CHECK legado: `vendas\_forma\_pagamento\_check` (035) ainda lista FIADO â€” redundante com 246



\### Compartilhado (manter, ajustar se necessÃ¡rio)



\- `clientes` â€” tabela usada sÃ³ pelo mÃ³dulo fiado hoje no app; \*\*avaliar drop total\*\* ou manter esqueleto sem `limite\_credito` para CRM futuro

\- `documentos\_fiscais\_pendentes` â€” fiscal, \*\*nÃ£o remover\*\*

\- `devolucoes` â€” remover `FIADO` do CHECK (limpeza semÃ¢ntica)

\- Migrations histÃ³ricas â€” \*\*nÃ£o editar\*\*; criar nova migration de remoÃ§Ã£o



\### Enums PostgreSQL



Nenhum. DomÃ­nios sÃ£o `text` + `CHECK`.



\---



\## 6. Impacto da remoÃ§Ã£o (por dependÃªncia)



| Item | AÃ§Ã£o | Motivo |

|------|------|--------|

| Venda FIADO no PDV | \*\*JÃ¡ removida\*\* | Migration 246 |

| `/admin/financeiro` (parte AR) | \*\*Remover/substituir\*\* | Listagem sÃ³ de `contas\_receber` |

| `/admin/financeiro` (fila fiscal) | \*\*Manter\*\* | NÃ£o Ã© fiado; refatorar pÃ¡gina para sÃ³ fiscal ou renomear menu |

| `FinanceiroGerentePageClient` | \*\*Remover\*\* | Ã“rfÃ£o; funcionalidade AR |

| `gerente/clientes/\*` | \*\*Remover\*\* | Ã“rfÃ£o; crediÃ¡rio exclusivo |

| `contas\_receber` / `liquidacoes\_receber` | \*\*Remover\*\* | Escopo total |

| `clientes` tabela | \*\*Remover ou esvaziar\*\* | Zero uso fora fiado no app atual |

| `v\_clientes\_gerente` | \*\*Remover\*\* | Depende de AR |

| `venda\_finance\_context` | \*\*Remover\*\* | App nÃ£o consulta; ramo FIADO morto |

| Filtro `CREDIARIO` relatÃ³rio | \*\*Remover\*\* | Filtro morto |

| `revalidatePath('/gerente/financeiro')` no caixa | \*\*Remover\*\* | Side-effect sem propÃ³sito |

| `FEATURE\_FREEZE` ("Contas a receber IN") | \*\*Atualizar doc\*\* | Contradiz novo escopo |

| Contas a pagar | \*\*Permanecer\*\* | MÃ³dulo independente |

| `documentos\_fiscais\_pendentes` | \*\*Permanecer\*\* | Fiscal |

| Smoke tests AR | \*\*Substituir\*\* | Remover cenÃ¡rios fiado |

| ProtÃ³tipos `jinlong layout 20-05` | \*\*Remover\*\* (opcional P2) | NÃ£o afeta produÃ§Ã£o |

| `pdv-local` | \*\*Sem impacto\*\* | Sem referÃªncias |



\*\*Risco de quebra em outros mÃ³dulos:\*\* baixo para PDV/vendas/estoque. MÃ©dio para rota `/admin/financeiro` (precisa redefinir como pÃ¡gina fiscal). E2E `sync-fluxo-gerente.spec.ts` quebra se nÃ£o atualizado.



\---



\## 7. Plano de remoÃ§Ã£o incremental



\### Fase 1 â€” Ocultar da interface (baixo risco)



\- Remover item AR da pÃ¡gina \[`admin/financeiro/page.tsx`](pdv-importados/app/admin/financeiro/page.tsx): KPIs de tÃ­tulos, `ContasReceberTable`, filtros de tÃ­tulos.

\- Manter apenas painel de fila fiscal (`documentos\_fiscais\_pendentes`).

\- Renomear menu de "Financeiro e fiscal" para "Fiscal" em \[`adminV2SidebarNav.ts`](pdv-importados/lib/navigation/adminV2SidebarNav.ts).

\- Remover filtro `CREDIARIO` de \[`RelatorioVendasClient.tsx`](pdv-importados/app/gerente/relatorios/vendas/RelatorioVendasClient.tsx).

\- Remover chaves i18n crediÃ¡rio/financeiro\_stub de `pt.json` / `zh.json`.



\### Fase 2 â€” Remover acesso por rotas



\- Avaliar se \[`ROUTES.admin.financeiro`](shared-core/navigation/routes.ts) vira `ROUTES.admin.fiscal` ou permanece com conteÃºdo sÃ³ fiscal.

\- Remover redirect legado `financeiro` se pÃ¡gina mudar de propÃ³sito.

\- Remover `revalidatePath('/gerente/financeiro')` de \[`caixaVendas.impl.ts`](pdv-importados/app/caixa/server/caixaVendas.impl.ts).

\- Atualizar E2E \[`sync-fluxo-gerente.spec.ts`](pdv-importados/e2e/sync-fluxo-gerente.spec.ts) para nova rota fiscal.



\### Fase 3 â€” Eliminar regras de negÃ³cio



\- Deletar server actions AR: `criarTituloReceber`, `liquidarTitulo`, `criarCliente` (se clientes for removido) em \[`financeiro/actions.ts`](pdv-importados/app/gerente/financeiro/actions.ts).

\- Deletar mÃ³dulo \[`gerente/clientes/`](pdv-importados/app/gerente/clientes/) inteiro.

\- Deletar \[`financeiroTitulosServer.ts`](pdv-importados/lib/gerente/financeiroTitulosServer.ts) (queries AR).

\- Manter actions fiscais (`enfileirarDocFiscalStub`, `reprocessarDocumentoFiscal`) â€” mover para mÃ³dulo fiscal dedicado.

\- Remover validaÃ§Ãµes/tests: `actions.validation.ts` (partes AR), `actions.validation.test.ts`.



\### Fase 4 â€” Eliminar cÃ³digo morto



\- Deletar \[`FinanceiroGerentePageClient.tsx`](pdv-importados/app/gerente/financeiro/FinanceiroGerentePageClient.tsx) (\~755 linhas).

\- Deletar \[`ContasReceberTable.tsx`](pdv-importados/app/admin/financeiro/\_components/ContasReceberTable.tsx).

\- Simplificar \[`FinanceiroPanels.tsx`](pdv-importados/app/admin/financeiro/\_components/FinanceiroPanels.tsx) para sÃ³ fiscal.

\- Remover protÃ³tipos crediÃ¡rio em `jinlong layout 20-05/ui\_kits/clientes-page/` e mocks `CREDIARIO`.

\- Atualizar docs: `FEATURE\_FREEZE`, `AUTHORIZATION\_MATRIX`, `SECURITY\_ARCHITECTURE`, `Jinlong/\*.md`.

\- Regenerar \[`database.types.ts`](pdv-importados/lib/supabase/database.types.ts) apÃ³s migration.



\### Fase 5 â€” Remover estruturas do banco



Nova migration (ex.: `257\_remover\_modulo\_fiado\_ar.sql`):



```sql

\-- Ordem segura (dependÃªncias FK):

DROP TRIGGER IF EXISTS trg\_finance\_context\_conta ON contas\_receber;

DROP TRIGGER IF EXISTS trg\_finance\_context\_pagamento ON vendas\_pagamentos;

DROP TABLE IF EXISTS venda\_finance\_context CASCADE;

DROP FUNCTION IF EXISTS sincronizar\_finance\_context\_venda(uuid);

DROP FUNCTION IF EXISTS registrar\_liquidacao\_receber(uuid, numeric, text, text);

DROP TABLE IF EXISTS liquidacoes\_receber CASCADE;

DROP TABLE IF EXISTS contas\_receber CASCADE;

DROP VIEW IF EXISTS v\_clientes\_gerente;

\-- Opcional: DROP TABLE clientes CASCADE se confirmado zero uso futuro

ALTER TABLE clientes DROP COLUMN IF EXISTS limite\_credito; -- ou DROP TABLE clientes

\-- Limpeza semÃ¢ntica:

ALTER TABLE devolucoes DROP CONSTRAINT IF EXISTS devolucoes\_forma\_pagamento\_check;

ALTER TABLE devolucoes ADD CONSTRAINT devolucoes\_forma\_pagamento\_check

&#x20; CHECK (forma\_pagamento IN ('DINHEIRO','PIX','CARTAO\_DEBITO','CARTAO\_CREDITO'));

```



\*\*PrÃ©-requisitos Fase 5:\*\*

\- Verificar em produÃ§Ã£o: `SELECT count(\*) FROM contas\_receber WHERE status IN ('ABERTO','PARCIAL')` â€” se > 0, exigir migraÃ§Ã£o/quitacao de dados antes do DROP.

\- Backup/export de `contas\_receber` + `liquidacoes\_receber` para auditoria.

\- Atualizar smoke scripts e \[`test-rls-scope.mjs`](backend/scripts/test-rls-scope.mjs).



\---



\## 8. RegressÃµes â€” Riscos e validaÃ§Ãµes



\### Riscos



| Risco | Severidade | MitigaÃ§Ã£o |

|-------|------------|-----------|

| Perda de dados AR em aberto | Alta | Export + confirmaÃ§Ã£o antes Fase 5 |

| PÃ¡gina financeiro fica sÃ³ fiscal sem UX clara | MÃ©dia | Renomear menu/rota na Fase 1 |

| E2E gerente quebra | MÃ©dia | Atualizar `sync-fluxo-gerente.spec.ts` |

| Drift migrations prod vs repo | Alta | Aplicar nova migration em homolog antes prod |

| `documentos\_fiscais\_pendentes` acidentalmente removido | Alta | NÃ£o incluir no DROP CASCADE de AR |

| RelatÃ³rio vendas sem filtro crediÃ¡rio | Baixa | RemoÃ§Ã£o segura (filtro jÃ¡ morto) |



\### MÃ³dulos afetados



\- Admin financeiro/fiscal

\- Gerente clientes (removido)

\- Caixa (apenas revalidatePath)

\- RelatÃ³rios vendas (filtro)

\- Backend RLS/smoke tests



\### Testes necessÃ¡rios



\- Unit: remover/atualizar `actions.validation.test.ts`

\- E2E: fluxo gerente financeiro â†’ fiscal

\- Smoke SQL: `smoke\_rls\_painel\_gerente.sql` sem `contas\_receber`

\- PDV: finalizar venda com 4 formas (regressÃ£o â€” nÃ£o deve mudar)

\- RLS: `p0-rls-rest-smoke.mjs` sem endpoints AR

\- Build: `pdv-importados` typecheck apÃ³s regenerar types



\### ValidaÃ§Ãµes manuais



\- Menu admin nÃ£o exibe crediÃ¡rio/limite/tÃ­tulos

\- `/admin/financeiro` (ou `/admin/fiscal`) mostra sÃ³ fila fiscal

\- PDV finaliza venda normalmente

\- Contas a pagar (`/gerente/financeiro/contas-pagar`) intactas

\- Busca global por `fiado|crediario|contas\_receber|limite\_credito` retorna zero em `pdv-importados/`



\---



\## 9. ClassificaÃ§Ã£o final P0â€“P3



\### P0 â€” Remover imediatamente



\- Filtro `CREDIARIO` em \[`RelatorioVendasClient.tsx`](pdv-importados/app/gerente/relatorios/vendas/RelatorioVendasClient.tsx)

\- UI crediÃ¡rio: `saldo\_crediario`, `limite\_crediario`, badges em \[`ClientesListClient.tsx`](pdv-importados/app/gerente/clientes/ClientesListClient.tsx) / \[`ClienteEditarModal.tsx`](pdv-importados/app/gerente/clientes/ClienteEditarModal.tsx)

\- Listagem AR em \[`/admin/financeiro`](pdv-importados/app/admin/financeiro/page.tsx)

\- Server actions `criarTituloReceber`, `liquidarTitulo`

\- i18n crediÃ¡rio (`em\_crediario`, `field\_limite\_crediario`, `financeiro\_stub`)

\- `revalidatePath('/gerente/financeiro')` no caixa



\### P1 â€” Remover apÃ³s validaÃ§Ã£o (homolog + backup dados)



\- Tabelas `contas\_receber`, `liquidacoes\_receber`

\- RPC `registrar\_liquidacao\_receber`

\- View `v\_clientes\_gerente`

\- Coluna `clientes.limite\_credito` ou tabela `clientes` inteira

\- `venda\_finance\_context` + triggers

\- Componentes Ã³rfÃ£os: `FinanceiroGerentePageClient`, `financeiroTitulosServer.ts`

\- Smoke tests e scripts RLS de AR

\- AtualizaÃ§Ã£o de `FEATURE\_FREEZE` e docs de governanÃ§a



\### P2 â€” Legado temporÃ¡rio (pode permanecer curto prazo)



\- Migrations histÃ³ricas (`035`, `051`, `025`, etc.) â€” imutÃ¡veis; superseded por nova migration

\- CHECK `devolucoes` com FIADO â€” limpar na Fase 5

\- ProtÃ³tipos `jinlong layout 20-05/` â€” nÃ£o afetam runtime

\- `vendas\_forma\_pagamento\_check` (035) com FIADO â€” redundante com 246



\### P3 â€” Monitorar



\- Drift produÃ§Ã£o vs repo (\[`AUDITORIA\_DRIFT\_PRODUCAO\_REPOSITORIO.md`](AUDITORIA\_DRIFT\_PRODUCAO\_REPOSITORIO.md)) â€” `venda\_finance\_context` ausente em prod

\- Dados histÃ³ricos `vendas` com `forma\_pagamento` legada (prod reporta 0 FIADO)

\- `pdv-local` â€” sem impacto, monitorar se sync-outbox tentar FIADO



\---



\## Ordem de execuÃ§Ã£o recomendada



1\. \*\*Fase 1\*\* (1 PR) â€” ocultar UI + i18n + filtro relatÃ³rio

2\. \*\*Fase 2\*\* (1 PR) â€” rotas, revalidate, E2E

3\. \*\*Fase 3â€“4\*\* (1 PR) â€” deletar cÃ³digo morto e actions

4\. \*\*ValidaÃ§Ã£o homolog\*\* â€” backup AR, smoke PDV + fiscal + contas a pagar

5\. \*\*Fase 5\*\* (1 PR backend) â€” migration DROP + regenerar types + atualizar smoke scripts

