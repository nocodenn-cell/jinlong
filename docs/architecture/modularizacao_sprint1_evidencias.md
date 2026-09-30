# Modularização — Sprint 1: evidências, correções e diagnóstico

Escopo: tarefas 0.3 (guards), 0.5 (investigações read-only) e 0.6 (spike descartável) do plano de modularização.
Base de comparação: `HEAD` = `1a677893` (extraído com `git archive` para um diretório temporário, fora do repo).

**Decisão de governança (2026-09-30): o Feature Freeze do piloto continua vigente** — ver seção 8.

## 1. Correções ao registro da auditoria anterior

| Afirmação anterior | Evidência atual | Situação |
|---|---|---|
| `shared/pricing/types.ts` seria duplicação de `shared-core/src/pricing/types.ts` | O arquivo já é um **shim de re-export** (`export type {…} from '../../shared-core/src/pricing/types'`). Não havia duplicação | **Corrigido. Não conta como duplicação removida** |
| 29 imports `lib → app` | 29 = `lib` (8) + `components` (21 arquivos). Hoje `lib→app` = 5 arquivos (3 tipos movidos no Sprint 1); `components→app` = 27 imports em 19 arquivos; `components/ui→app` = 2 | Corrigido |
| 96 imports de `@shared-core/navigation/routes` | 96 incluía 16 arquivos de teste. **84 arquivos não-teste**, todos em `pdv-importados`; `pdv-local` não importa | Corrigido |
| `ProdutoRepositoryPort` é implementado por `criarProdutoComEstoqueInicialRpc` | **Falso.** Não há implementador de `ProdutoRepositoryPort.createWithDefaultEstoque` em lugar nenhum | Corrigido (ver D-11) |
| "Duas famílias de portas de Produto" seriam dois caminhos de criação | Só há um caminho de criação em produção (`ProductWriter`). A "família antiga" (`core/services/produtoService.ts` + `ProdutoRepositoryPort`) **não tem chamador de produção** | Corrigido (ver D-11) |
| Na Sprint 1 foram "removidas duplicações" `1.3` pricing types | Removidas de fato: `shared/cart/totals.ts` e `shared/cart/types.ts` (sem importadores) e as declarações duplicadas de `StatusPublicacao`/`OrigemProduto` (passaram a re-exportar) | Escopo real registrado |

## 2. Tarefa 0.3 — guard de congelamento

Arquivo: `scripts/boundary-ratchet-guard.mjs`; baseline: `scripts/boundary-ratchet.baseline.json`; script `npm run guard:ratchet` (incluído em `guard:all`, portanto roda no CI). O CI passou a disparar também para mudanças em `shared/**` e `scripts/**` (`ci-pdv-importados.yml` e `required-checks-fallback.yml`).

Baseline gravada (contagens):

| Regra | Baseline | Meta |
|---|---|---|
| `lib-to-app` (arquivos de `lib` importando `@/app/…`) | 5 (inalterado na continuação; ver seção 9) | 0 |
| `ui-to-app` (`components/ui`) | 2 | 0 |
| `components-to-app` | 27 imports / 19 arquivos | só tipos → 0 |
| `shared-to-apps` (`shared/` raiz importando apps) | 0 | 0 |
| `routes-coupling` (arquivos importando `navigation/routes`) | 84 | 0 |
| `direct-from` (`.from('<tabela de domínio>')` em `app/` e `lib/`, por arquivo e tabela) | 109 usos em 61 pares arquivo+tabela | só decresce |
| `duplicates` | StatusPublicacao 1 · OrigemProduto 1 · mensagemErroParaUsuario 2 · unified-logger 2 | 1 cada |

Teste automatizado: `scripts/boundary-ratchet-guard.test.mjs` (`node --test`, 7 casos contra uma árvore fixture via `BOUNDARY_RATCHET_ROOT`), exposto como `npm run guard:ratchet:test` e também incluído em `guard:all` (caminho real do CI: passo "Architecture Lock" de `ci-pdv-importados.yml`).

Comportamento: piorar uma contagem ou criar par novo falha; melhorar avisa para rodar `--update` (que recusa regressões sem `--allow-growth`). Prova de funcionamento: um arquivo temporário com `@/app/…` e `.from('produtos')` em `lib/` fez o guard falhar com exit 1 (`lib-to-app 0→1`, `direct-from …|produtos 0→1`); o arquivo foi removido e o guard voltou a OK.

Limite conhecido: a regra `direct-from` é textual (regex em `.from('tabela')`); não enxerga acesso por variável ou helper.

## 3. Tarefa 0.5 — investigações

| ID | Conclusão (com evidência) | Status |
|---|---|---|
| **D-04** `mensagemErroUsuario` | As duas versões exportam as mesmas 5 funções. A da web (`pdv-importados/shared`, 421 l.) é superconjunto: acrescenta `MAPA_NEGOCIO_PT_ZH` e `MAPA_SECAO_PT_ZH`. Teste diferencial com 208 entradas (104 textos × pt/zh): 10 divergem, **todas** em mensagens de negócio que a web traduz/repassa e a versão da raiz (usada pelo desktop) troca pela mensagem genérica. Oficial recomendada: a da web | Fechada |
| **D-05** Freeze | `docs/FEATURE_FREEZE_PILOTO.md`: vale "até encerramento da Fase 4"; `docs/piloto-d0/README.md` (2026-08-27/31) diz que o freeze permanece. Refatoração de núcleo (`finalizar_venda_*`, pricing, multi-authority caixa) está **OUT**. Decisão do responsável em 2026-09-30: **freeze vigente até decisão posterior documentada**; a ausência de documento de encerramento não o revoga | **Fechada: freeze vigente** |
| **D-06** `PricingService` | Não é código morto simples. `scripts/pricing-rpc-guard.mjs` o **proíbe em runtime online** e o **permite** em `pdv-local/src` (exceção declarada); `pricingServiceGuards.test.ts` garante que só trata PROMOÇÃO manual. Nenhum import de produção em `pdv-local/src` (só comentário em teste). Remover exige alterar guard e teste | Fechada |
| **D-07** `check-entity-ssot-boundary` | É guard de **allowlist por prefixo de caminho e símbolo**, não ratchet de contagem. Por isso o ratchet foi criado à parte | Fechada |
| **D-08** `routes.ts` | `scripts/route-guard.mjs:14` e `scripts/check-routes-invariant.mjs:12` **fixam o caminho** `shared-core/navigation/routes.ts`; mover o arquivo exige alterar os dois. `pdv-local` não importa. Importadores: `app/admin` 54, `app/gerente` 10, `lib/navigation` 6, `components/ui` 5, `app/auth` 4, `components/gerente` 3, `app/login` 1, `app/caixa` 1 | Fechada |
| **D-09** `rpc-gate-guard` | Só controla **quais RPCs de venda** podem ser chamadas e por quem (v2/v3 proibidas; v4 só em `caixaVendas.impl.ts`). **Não** cobre escrita em `estoque`/`caixas.saldo_atual`. A v4 baixa estoque via `decrementar_estoque_seguro`, mas `cancelar_venda_transacional` e `devolver_ou_trocar_venda` fazem `UPDATE public.estoque` e `UPDATE public.caixas` direto. Há 36 migrations com `UPDATE estoque` e 26 com `UPDATE caixas`; funções escritoras de estoque incluem `ajustar_estoque_manual`, `baixar_estoque_venda`, `decrementar_estoque_seguro`, `importar_nfe_transacao`, `confirmar_remessa_entrada`, `transferir_estoque_seguro`. Logo **não existe "API única de escrita do Inventory"**: a recomendação C do plano precisa ser reformulada como "lista explícita de funções escritoras permitidas" | Fechada |
| **D-10** RLS | Estado final medido com `SELECT` em `pg_policies` no Postgres **local** do Supabase (container `supabase_db_fastproduct`, porta 54322; 372 das 373 migrations do repo aplicadas — falta só `20260929130000_descontos_venda_exige_pagamento_dinheiro.sql`, que não contém `policy`). **132 policies** em `public`; as 76 tabelas de `public` têm RLS habilitado (0 sem). Por predicado: **62 subquery inline em `usuarios`** (47%), **44 só `auth.uid()`**, **13 helpers `auth_usuario_*`** (10%), 8 outros (7 `auth.role()='authenticated'` e 1 função `auth_pode_ver_produto_gerencial`), 5 `true` (`gtin_lookup_cache` ×3, `marcas`, `system_alerts`). Nenhuma policy mistura helper e inline. Conclusão: a maior parte do isolamento por loja está **inline**; só 13 policies usam helper, o que encarece qualquer migração futura de `loja_id`/`empresa_id`. Limite: é o estado do repositório aplicado localmente, **não** uma leitura de produção | Fechada |
| **D-11** Criação de produto | `gerente/produtos/actions.ts` já cria via `createProductWriter` (comentário e uso). `ProdutoRepositoryPort.createWithDefaultEstoque`, `criarProdutoComEstoque`, `publicarProdutoCatalogo`, `inativarProdutoCatalogo` de `core/services/produtoService.ts` **não têm chamador nem implementador**; o `alternarAtivoProduto` de `actions.ts` é outra função. De `core/ports/produto.ts` só os tipos (`StatusPublicacao`, `NovoProdutoInput`) têm uso. Logo a tarefa 1.8 do plano vira "remover código morto + mover `NovoProdutoInput`", risco baixo (mas o guard `check-entity-ssot` cita `produtoService.ts` como nome de arquivo permitido) | Fechada |
| **D-12** Leitura de produto no PDV | O PDV usa read model próprio: `caixaCatalogo.impl.ts` (`produtos.select('*')` com filtro de vendabilidade + `regras_preco` + `categorias`), `caixaConsultaRapida.impl.ts`, `caixaPrecoAutoritativoServer.ts` (RPC `calcular_preco_produto`). `ProductReader.getIdentityById` não tem consumidor de produção. Recomendação: **manter** o read model do PDV (caminho quente) fora do contrato e congelado pelo ratchet | Fechada (decisão de performance permanece do produto) |
| **D-13** CI | Antes do Sprint 1 o CI não rodava typecheck/testes do `shared-core` isolado: `turbo … --filter=pdv-importados` resolve só o pacote `pdv-importados` (verificado com `--dry=json`). O typecheck isolado do `shared-core` **já falhava na base** (4 erros em specs). Passo adicionado ao CI | Fechada |

**Pendentes:** D-01, D-02 e D-03 são decisões arquiteturais **futuras** e não bloqueiam o Sprint 1 (seção 8). Nada relacionado a elas foi implementado.

## 4. Tarefa 0.6 — spike descartável (fora do repo)

Local: `…/scratchpad/spike-obs` e `…/scratchpad/spike-core`. Instalação **real** via `npm install` (sem reutilizar `node_modules` do monorepo).

**A) `result` + `observability` como pacote-fonte (`exports` apontando para `.ts`) e um consumidor "Sistema B" (`file:../pkg`)**

| Verificação | Resultado |
|---|---|
| install do pacote / do consumidor | OK (11 s / 5 s) |
| `tsc --noEmit` no pacote | OK (após corrigir barrel) |
| `vitest` no pacote (2 arquivos, 7 testes) | 7 passaram |
| `tsc` no consumidor (moduleResolution `bundler`) | OK |
| `vitest` no consumidor | 2 passaram |
| `tsx src/main.ts` no consumidor | OK |
| `node src/main.ts` (Node puro) | **Falha** (`ERR_MODULE_NOT_FOUND`): imports sem extensão não resolvem fora de bundler/tsx |

Achados: (1) `shared-core/src/observability/index.ts` é **UTF-16LE com BOM** e só reexporta `./vendaTrace` (código específico de venda), não expõe `runActionWithObservability`/`logFailure`; (2) o default de `runActionWithObservability` é uma mensagem fixa **em português**; (3) pacote-fonte serve a consumidores com bundler (Next/Vite/vitest/tsx), mas **não** a Node puro nem a Deno (Edge Functions) sem build ou imports com extensão. Não verificado: `next build` e Tauri com `transpilePackages`.

**B) `shared-core` inteiro copiado e instalado isolado** (cópia fiel, sem `node_modules`):
- `npm install` instala só `zustand` e `typescript`.
- Typecheck isolado: 37 erros. 32 são `Cannot find module 'vitest'` (o pacote não declara `vitest` como devDependency; hoje depende do hoisting do monorepo). Os outros 5 desapareceram ao adicionar `vitest`, exceto 1 que permaneceu: `setImmediate` não encontrado em `pdv/scan-pipeline-test-helpers.ts` (falta `@types/node`).
- Com `vitest` adicionado: 205 testes passam; 1 arquivo de teste falha por `react` ausente (peer de `zustand`, usado por `stores/unifiedCartStore`) e há um erro não tratado por `jsdom` ausente.

Conclusão do spike: a afirmação "externos ⊆ {zustand}" é verdadeira para **imports de produção** mas o pacote **não é autossuficiente**: faltam `vitest`, `@types/node` e `jsdom` como devDependencies e `react` como peer (via `zustand`). Isso entra como pré-requisito de 4.4/4.7. O spike roda fora do repositório (scratchpad da sessão), não é versionado e não é reprodutível a partir do repo.

## 5. Resultado dos gates (repo, após as mudanças)

| Gate | Resultado |
|---|---|
| `npm run guard:all` (core, pdv, routes, rpc, pricing, deps, migrations, domain, **ratchet**, **ratchet:test (7 casos)**, entity-ssot) | **Passou** (exit 0) |
| `check:vendabilidade`, `check:pdv-invariant-boundary` | Passaram |
| `shared-core` typecheck + testes (via turbo) | Passaram (32 arquivos, 221 testes) |
| Web: `lint` | Passou (0 erros; 1 warning em `e2e/caixa-pagamento-atalhos.spec.ts`, arquivo não tocado) |
| Web: `typecheck` | Passou |
| Web: `vitest` | 282 arquivos / 1731 testes passaram; **1 suíte falha** (abaixo) |
| `check:routes` | **Falha** (19 violações) — idêntica na base; fora do `guard:all` e do CI |
| Desktop: `tsc --noEmit` | **Falha** (8 erros) — idênticos na base |
| Desktop: `vitest` | **Não executou** (`Cannot find module '@vitejs/plugin-react-swc'`) |
| Backend: `deno check` | **Não executou** (Deno local não lê lockfile v5 de `fiscal-worker/deno.lock`) |
| Web `next build`, E2E (Playwright), `cargo`, testes SQL/RLS (exigem Supabase local) | **Não executados** |

## 6. Classificação das falhas

**Regressões introduzidas pelo Sprint 1:** nenhuma detectada nos gates executados.

**Pré-existentes (comprovadas na base `1a677893`):**
- `check:routes`: mesmas 19 violações (listas idênticas linha a linha).
- Desktop `tsc`: mesmos 8 erros. 4 são `@tauri-apps/api/core` não encontrado (ambiental, abaixo); 4 são de código: `ItemCarrinho[]` não atribuível a `ItemVenda[]` e 3× `item.resultado` possivelmente `undefined` em `src/App.tsx`. A causa é a divergência entre `ItemCarrinho.resultado?` (opcional, `shared-core/src/stores/unifiedCartStore.ts:25`) e `ItemVenda.resultado` obrigatório (`usePdvLocalVendaCaixaFlow.ts:7`). Não independem do Tauri. Introdução exata não determinada (o store foi tocado pela última vez em `0ba769f6`, 2026-09-01). **Não corrigido**, conforme pedido.
- Web `productUpdater.semRpc.integracao.test.ts`: mesma falha na base (`Expected 3 parts in JWT; got 1`).

**Ambientais:**
- `@tauri-apps/api` declarado em `pdv-local/package.json` mas não instalado (só `@tauri-apps/cli-win32-x64-msvc` existe em `node_modules`).
- `@vitejs/plugin-react-swc` ausente (desktop vitest não inicia).
- Teste de integração web: exige Supabase local em `127.0.0.1:54321` e chave de serviço; o fallback é o literal `MOCK_SERVICE_ROLE_KEY_DO_NOT_COMMIT`. Observação de qualidade: sem o ambiente, a suíte **falha** em vez de ser pulada (a documentação do próprio teste fala em `describe.skip` sem a variável).
- Deno local incompatível com lockfile v5.

Observação: rodar `deno check` modificou `deno.lock` na raiz; o arquivo foi restaurado com `git checkout -- deno.lock`.

## 7. Escopo do Sprint 1: realizado × adiado

| Tarefa | Estado |
|---|---|
| 0.1, 0.2 baseline e CI do shared-core | Feito |
| 0.3 guards de congelamento (+ teste + CI) | Feito |
| 0.5 investigações D-04…D-13 | Feito (D-01/02/03 são futuras; D-05 decidida) |
| 0.6 spike | Feito (fora do repo) |
| 1.1, 1.2 remoção de `shared/cart/*` | Feito |
| 1.3 (somente tipos) `StatusPublicacao`/`OrigemProduto` | Feito |
| 1.4 tipo de forma de pagamento de AP | Feito |
| 1.5 localização de `PerfilUsuario` | Feito |
| 2.1 tipos de `lib` que apontavam para `app` | **Parcial**: `VendaDetalhe` e `OrigemProduto` resolvidos; resta `lib/caixa/reciboTypes.ts → FinalizarVendaInput` (deriva do schema zod em `app/caixa/finalizarVendaValidation.ts`; mexer nele toca a validação da venda, **congelada pelo freeze**) |
| 2.2 tipos do feed de atividades | Feito |
| 2.8 comentários do shared-core | Feito |
| 4.0 manifesto | Feito |
| 4.1, 4.2 convenção de teste e CI do shared-core | Feito |

### Backlog registrado (fora do escopo; não corrigido)
1. `lib/caixa/reciboTypes.ts → app/caixa/finalizarVendaValidation` (bloqueado pelo freeze).
2. Desktop: `ItemCarrinho.resultado?` × `ItemVenda.resultado` obrigatório (4 erros de `tsc`, pré-existentes).
3. `check:routes` com 19 violações, fora do `guard:all` e do CI.
4. Teste de integração web que falha em vez de ser pulado sem Supabase local.
5. `shared-core/package.json` sem `vitest`, `@types/node`, `jsdom` (devDependencies) e `react` (peer).
6. `shared-core/src/observability/index.ts` em UTF-16LE, exportando só `vendaTrace`; mensagem padrão de `runActionWithObservability` fixa em português.
7. `rpc-gate-guard` não cobre escrita em `estoque`/`caixas.saldo_atual`; não existe lista de funções escritoras permitidas.
8. ~~Código morto `produtoService.ts`~~ — removido na continuação (seção 9).
9. Duplicatas restantes congeladas pelo ratchet: `mensagemErroUsuario` (2); `PricingService` (guardado por guard e teste). `unified-logger` passou a 1 implementação (seção 9).
10. Observação de segurança (não avaliada como defeito): `gtin_lookup_cache` permite INSERT/UPDATE a qualquer `authenticated` com predicado `true`.
11. Desktop: `@tauri-apps/api` e `@vitejs/plugin-react-swc` não instalados neste ambiente; Deno local não lê lockfile v5.

## 8. Decisões de governança e decisões futuras

**D-05 — Feature Freeze do piloto: VIGENTE.** Decisão de 2026-09-30: o freeze continua vigente até decisão posterior **documentada**. A ausência de um documento de encerramento não autoriza removê-lo. Consequência: refatoração de `finalizar_venda_*`, pricing e caixa, e a Fase 3 de escrita de caixa/financeiro/produto, permanecem bloqueadas.

**Decisões arquiteturais futuras (não iniciadas, nada implementado):**
- **D-01** — qual é o próximo produto Natural Code real e do que ele precisa (define a ordem da Fase 5).
- **D-02** — como distribuir ativos com parte em SQL, dado o ADR-011 (um único diretório de migrations).
- **D-03** — modelo de distribuição dos ativos (workspace, registry privado ou repositório por ativo).

## 9. Continuação após as decisões de 2026-09-30 (D-01, D-02, D-05)

**Decisões:** D-01 — não existe segundo produto real; sem extração agressiva nem abstração especulativa; avançar só até o limite da Fase 2; a prova de reutilização externa fica condicionada a um Sistema B real. D-02 — SQL do Jinlong permanece no hospedeiro; nada de migrations/RPCs/RLS como ativos; fronteiras por contratos/adapters com dependências SQL documentadas. D-05 — freeze vigente: não alterar `finalizar_venda_*`, preço nem caixa.

**Feito (sem tocar caixa, preço ou `finalizar_venda_*`):**
- 1.8 (código morto): removidos `core/services/produtoService.ts` e `ProdutoRepositoryPort` (zero chamadores e zero implementadores); `core/ports/produto.ts` mantém os tipos de entrada. O guard `check-entity-ssot-boundary` deixou de citar o arquivo inexistente.
- 1.7 (logger): `pdv-importados/shared/unified-logger.ts` virou shim de `shared/unified-logger.ts`. A única diferença entre as cópias eram casts de tipo (`as unknown as T`), e a versão da raiz, pura e sem `Deno`/`process`, é a mesma usada pelo desktop e pelas Edge Functions.
- 2.5 (parcial): tipo `FinanceiroTabId` movido para `lib/navigation/financeiroTabId.ts`. `LanguageToggle` **não** foi movido: ele chama a server action `setIdiomaAction` do produto; movê-lo só deslocaria o acoplamento e injetar a action por props seria abstração sem necessidade. Fica como exceção documentada (`components/ui/admin-v2/AdminV2UtilityBar.tsx`).
- 2.6: tipos `ProdutoGerenteRow`, `OpcoesFiltrosProdutos`, `ProdutoAutoria`, `FilaStatusPayload` e `HealthPayload` movidos para `lib/` (os arquivos originais reexportam). `components → app`: 27 → 14 imports.
- 4.3 (guard de independência do `shared-core`): nova regra `shared-core-externals` no ratchet (externos por arquivos distintos e imports relativos que escapam do pacote). Baseline: `externo:zustand` em 1 arquivo, 0 escapes. Arquivos `*.config.ts` são ignorados.
- D-02: `docs/architecture/dependencias_sql_por_contrato.md` (tabelas, views e RPCs por adapter; existência confirmada por `SELECT` no catálogo local).

**Não feito, e por quê (gates que dependem de decisão):**
| Item | Motivo |
|---|---|
| 1.6 unificar `mensagemErroUsuario` | **Bloqueado pelo D-05 (decisão 2026-09-30):** a unificação muda mensagens observáveis no desktop/offline (10 de 208 entradas divergem — D-04). **Pendência do freeze**: retomar só quando o freeze for encerrado por decisão documentada; a versão oficial indicada pela D-04 é a da web |
| 1.9, 1.10, 1.11 (`PricingService`, `roundAbnt`) e G3 (`derivarFaixaAtacado`) | Preço: freeze |
| 2.3, 2.1 restante (`reciboTypes → FinalizarVendaInput`), G2 | Caixa/validação de venda: freeze |
| 2.5 `LanguageToggle`, G4/G5 (adapters em `lib`, wrapper de sugestão) | Sem ganho sem abstração nova ou sem Fase 3 |
| Fase 3 (contratos como fronteira real), Fase 4.4+, Fase 5 | Além do limite da Fase 2 definido por D-01; Fase 3 também envolve escrita de caixa/financeiro |

`lib → app` permanece em 5 arquivos, por: `reciboTypes` (caixa), `fetchPdvStateSnapshot.internal` (caixa), `criarProdutoComEstoqueInicialRpc` (helper de faixa de atacado = preço), `financeiroTitulosServer` (adapter em `app/`, Fase 3) e `cadastroSugestaoClient` (wrapper cliente de server action, direção legítima).

**Verificação da continuação:** `guard:all` exit 0 (ratchet com 9 testes); `shared-core` 221 testes; web lint (0 erros), typecheck e 1731 testes passando; **`next build` da web passou** (com `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` fictícios); mesmas falhas pré-existentes da base (1 suíte de integração web, 8 erros de `tsc` no desktop, 19 violações de `check:routes`).

## 10. Fase 2.7 concluída (autorizada em 2026-09-30)

- `shared-core/navigation/routes.ts` foi movido (`git mv`, 100% de similaridade) para `pdv-importados/lib/navigation/routes.ts`. O diretório `shared-core/navigation` deixou de existir; o `shared-core` não contém mais rotas do Jinlong.
- 97 arquivos tiveram só o texto do import alterado de `@shared-core/navigation/routes` para `@/lib/navigation/routes` (79 em `app`, 10 em `components`, 7 em `lib`, 1 em `tests`), **incluindo** `app/caixa/caixaPainelGestao.ts` (uma única linha de import; lógica do caixa intocada). O diff fora da movimentação é só: imports, 2 caminhos em guards, 1 caminho em `tests/pilares-integracao.matrix.test.ts`, 2 comentários de e2e e 3 referências em `inventario_frontend_boundary.md`.
- Guards atualizados: `scripts/route-guard.mjs` e `scripts/check-routes-invariant.mjs` passam a ler o novo caminho; o ratchet trava a reaparição do arquivo e do alias antigo (`routes-coupling`: 84 → 0; teste novo, 10 casos).
- Validação: `guard:all` exit 0; `shared-core` 221 testes; web lint/typecheck, 1731 testes e `next build`; `check:routes` com as **mesmas 19 violações** da base, arquivos e trechos idênticos (comparação linha a linha); desktop com os mesmos 8 erros de `tsc` e sem importar `routes`.
- Referências históricas ao caminho antigo em relatórios datados (`CORRECOES_ESTABILIZACAO.md`, `docs/AUDITORIA_*.md`, `docs/INVESTIGACAO_E2E_SYNC_FLUXO_GERENTE.md`, `Jinlong/decisoes/*`) foram mantidas como registro histórico.
