# N1 — Proteção do preço de custo (`produtos.preco_custo` / `preco_custo_medio`)

Decisão de produto: **opção B — restringir o acesso**. Objetivo: o OPERADOR executa o PDV por inteiro sem acesso não autorizado ao custo de aquisição, inclusive por chamadas diretas à API.

## 1. Problema (reproduzido)

`produtos_leitura` (RLS) libera SELECT de linhas a qualquer perfil da loja e o GRANT de tabela libera **todas as colunas** ao papel `authenticated`, que é **o mesmo papel de banco para OPERADOR, GERENTE, DONO e ADMIN**. RLS controla linhas, não colunas: o OPERADOR lia `preco_custo` dos 16/16 produtos pela API. Segundo vazamento encontrado na análise: `system_alerts` (SELECT = `true`, inclusive entre lojas) guardava `custo_unitario_snap` no detalhe dos alertas de margem negativa.

## 2. Mapa de consumidores de `preco_custo`

### 2.1 Banco (produção e stack local têm o mesmo conjunto — verificado por catálogo)

| Objeto | Tipo | Precisa do custo? | Como fica |
|---|---|---|---|
| `finalizar_venda_transacional_canonica_v4_unscoped` (PDV) | DEFINER | **Sim** (grava `itens_venda.custo_unitario_snap`; **já ignora** o valor enviado pelo app) | Inalterado — lê como dono |
| `criar_produto_com_estoque_inicial`, `atualizar_produto_com_faixa_atacado`, `importar_nfe_transacao`, `confirmar_importacao_nfe` | DEFINER | Sim | Inalterados |
| `registrar_historico_preco_produto`, `trg_fn_produtos_margem`, `trg_fn_precos_atacado_margem`, `trg_fn_regras_preco_margem` (triggers) | DEFINER | Sim | Inalterados |
| `internal.resolver_comissao_itens_venda` | DEFINER | Sim | Inalterado |
| `dashboard_gerente_resumo`, `relatorio_resumo_executivo_periodo`, `relatorio_margem_por_venda_periodo`, `relatorio_produtos_sem_giro_periodo` | **INVOKER** | Sim (margem/DRE/capital parado) | **Alterados**: leem o custo da view `produtos_custos` (LEFT JOIN) |
| views / matviews / policies com `preco_custo` | — | — | Nenhum |
| `itens_venda.custo_unitario_snap`, `historico_precos_produto`, `importacoes_nfe_itens.custo_unitario` | tabelas | Sim (gerencial) | Já protegidas por RLS gerencial; OPERADOR vê 0 linhas (testado) |
| `system_alerts.detalhe` (custo no alerta) | tabela | Não | Policy → gerencial da loja; alerta novo **não grava custo** |

### 2.2 Aplicação (`pdv-importados`)

| Consumidor | Categoria | Precisa do custo? | Como fica |
|---|---|---|---|
| `app/admin/produtos/productReader.ts` (catálogo, edição, "cadastro completo") | catálogo | Sim (GERENTE+) | Colunas sem custo + `anexarCustosProdutos` (view) |
| `app/gerente/produtos/actions.ts` (importação CSV; snapshot/rollback) | importação | Sim (preserva custo ao reescrever) | Custo via view; **erro de leitura aborta a linha** (nunca "custo nulo") |
| `app/gerente/estoque/importar-nfe/actions.ts` (busca de produto, conferência NF-e) | compras/importação | Sim (custo atual vs. NF) | Custo via view; embed `produtos(preco_custo)` removido |
| `lib/adapters/gtin/historicoInternoLookup.ts` | catálogo (sugestão de cadastro) | Sim | Custo via view |
| `app/gerente/relatorios/sem-giro/actions.ts` | relatórios | Sim (capital parado) | Vem da RPC (já corrigida) — sem mudança no app |
| `app/admin/relatorios/*` (margem, DRE) | relatórios | Sim | Vem das RPCs — sem mudança |
| `app/caixa/server/caixaCatalogo.impl.ts` (**PDV**: busca/código de barras) | PDV | **Não** | `select('*')` → `PRODUTO_COLS` (sem custo) |
| `app/caixa/server/caixaPrecoAutoritativoServer.ts` (**PDV**: revalida preço) | PDV | **Não** (o banco grava o snapshot) | Deixa de ler custo; `custoUnitarioSnap = null` |
| `app/caixa/server/registrarAlertasLevesVenda.ts` (**PDV**: alerta margem negativa) | PDV | Não no app | Alerta calculado **no banco**: `pdv_registrar_alertas_margem_venda(venda)` |
| `app/caixa/server/caixaConsultaRapida.impl.ts` (**PDV**: margem % na consulta rápida) | PDV | Só para exibir margem | Custo via view: **OPERADOR → sem custo → sem margem %**; GERENTE+ mantém |
| Offline / sincronização | — | — | Sem catálogo offline no cliente; `sync-outbox` e `pdv-local` não referenciam custo (verificado) |
| `shared-core` (tipos/validação de produto) | domínio | Tipos | Sem acesso a dados |
| `backend/supabase/scripts/ops_*.mjs`, `backend/scripts/*.test.*` | operação/testes | Sim | Rodam como `service_role`/`postgres` — sem efeito |

## 3. Solução escolhida (menor complexidade que fecha todos os caminhos)

1. **Privilégio de coluna**: `REVOKE SELECT ON produtos FROM anon, authenticated` + `GRANT SELECT (todas as colunas **exceto** `preco_custo`, `preco_custo_medio`)`. Nenhum `select`, `select *`, `order`/`filter` por custo, embed ou `RETURNING` sobre `produtos` lê o custo (erro 42501). Funções/triggers DEFINER e `service_role` seguem lendo.
2. **View de dono `produtos_custos`** (`security_invoker = off`): `produtos` ⋈ `usuarios` com `ativo` e `perfil IN (GERENTE, DONO, ADMIN)` e `(ADMIN OR usuarios.loja_id = produtos.loja_id)` — a **autorização por perfil de aplicação** está no próprio objeto, usando `auth.uid()`. OPERADOR e usuário desativado (token ainda válido) → 0 linhas; GERENTE/DONO só a própria loja (mesmo escopo de `produtos_leitura`: um DONO de outra loja já não enxerga as linhas do produto); ADMIN todas. É a única via de leitura do custo para usuários autenticados.
3. **4 funções INVOKER** passam a juntar `produtos_custos` (LEFT JOIN): GERENTE/DONO/ADMIN → resultado **idêntico** (comparado antes × depois, 4 funções × 4 perfis, todos IDÊNTICOS); OPERADOR → custo nulo.
4. **`system_alerts`**: SELECT só para gerencial da loja; alerta de margem negativa vira RPC no banco (`void` — sem oráculo de custo —, serializada por venda com advisory lock, sem custo no detalhe).
5. **PDV**: não lê mais custo; o snapshot já era do banco.

### Por que não as alternativas

- **View sem custo + manter a tabela legível**: não resolve — o OPERADOR continua consultando `produtos`. (Alerta do enunciado.)
- **`security_invoker` por si só**: o papel de banco é o mesmo para todos os perfis; não implementa autorização por perfil de aplicação. Por isso a view usa a junção com `usuarios`.
- **GRANT por papel por perfil** (papéis de banco distintos): exigiria mudar a emissão de JWT/`role` de toda a plataforma.
- **Tabela separada de custos**: mover a coluna quebraria triggers, RPCs DEFINER, histórico e todos os leitores; custo/risco muito maiores.

## 4. Migrations (duas fases — sem janela de quebra)

- **Fase A (aditiva) `20261009180000_protege_preco_custo_operador.sql`**: (1) view `produtos_custos`; (2) reescrita das 4 funções INVOKER **a partir da definição vigente** (a de produção pode diferir do repositório — de fato difere em `dashboard_gerente_resumo`), com asserções que **abortam sem alterar nada**; (3) policy de `system_alerts`; (4) RPC `pdv_registrar_alertas_margem_venda`. **Não revoga nada**: funciona com o app antigo e com o novo.
- **Fase B (fechamento) `20261009180001_revoga_leitura_direta_preco_custo.sql`**: `REVOKE SELECT` em `produtos` + `GRANT SELECT` só nas colunas sem custo (lista calculada dinamicamente). **Só depois do deploy do app novo.**

**Dry-run contra as definições de PRODUÇÃO (somente leitura, 2026-10-09):** as 4 funções passam nas asserções (1 junção nova, 0 referências antigas). Conjunto de consumidores em produção = o do repositório (mesmas 9 funções DEFINER, mesmas 4 INVOKER, sem views/policies com custo).

## 5. Testes adversariais e evidências (stack local, banco recriado do zero com `supabase db reset` — mesmo caminho do CI)

`backend/scripts/n1-preco-custo-authz-smoke.mjs` (**novo gate no CI**; 36 checks no CI, 40 com `ADMIN_EMAIL`): OPERADOR — `select=preco_custo`, `preco_custo_medio`, `*`, `id,nome,preco_custo` → 403; filtrar/ordenar por custo → 403; embed `itens_venda→produtos(preco_custo)` → 403; `produtos_custos` → 0 linhas; histórico/NF-e/`custo_unitario_snap`/`system_alerts` → 0 linhas; RPCs de relatório sem custo; `dashboard_gerente_resumo` → 403; UPDATE de custo sem efeito; **anon** → 401. GERENTE/DONO/ADMIN — não leem a coluna direto mas leem pela view; **isolamento entre lojas** (GERENTE/DONO não veem custo da outra loja; ADMIN vê ambas). **PDV**: OPERADOR conclui venda com `custo_unitario_snap` enviado nulo, o banco grava o snapshot correto, o alerta de margem negativa nasce sem custo, 5 chamadas concorrentes geram exatamente 1 alerta e o GERENTE o enxerga; **GERENTE desativado** com token válido vê 0 linhas na view.

Também: UI real (GERENTE) — catálogo, edição ("Preço de custo 38,00" carregado pela view, salvar 39,00 persistiu), DRE; UI real (OPERADOR) — login, busca por código de barras, venda concluída ("Venda registrada… Estoque atualizado"), snapshot de custo gravado pelo banco; testes de integração com banco real (`produtosFiscalEdicao`, `productUpdater.*`) passam; `test:rls-scope` 44/44; smokes anteriores (GO-LIVE 13 checks, Diagnóstico) sem regressão; `database.types.ts` regenerado com a CLI fixada do CI (2.116.0) e idêntico ao banco recriado.

**Guarda estática permanente** (`pdv-importados/tests/n1-preco-custo-guard.test.ts`, roda no `build-and-test`): falha se qualquer código voltar a fazer `from('produtos').select` com `preco_custo`, `*` ou vazio, listar custo em constantes de colunas, embutir custo em embeds, ou se o PDV tocar `preco_custo` fora da view. Validada com violação artificial (falha como esperado).

## 6. Impactos operacionais

- **OPERADOR**: PDV sem mudança perceptível, **exceto** a margem % da "consulta rápida" (só aparece se a configuração `show_margin_visual` estiver ligada **e** o usuário for gerencial). Isso é intencional: a margem revelaria o custo.
- **GERENTE/DONO/ADMIN**: nenhuma mudança visível. DONO continua limitado à própria loja (como antes na escrita).
- **Futuro**: coluna nova em `produtos` precisa de `GRANT SELECT (col) TO anon, authenticated` (o smoke e a guarda estática acusam). Quem usar `select('*')` em `produtos` passa a ver erro 42501 (comportamento desejado).
- **Performance**: a view faz 1 junção com `usuarios` por consulta (índice por PK); sem função por linha.
- **Observação preexistente (fora do N1)**: localmente `atualizar_produto_com_faixa_atacado` está só para `service_role`; em produção também tem `authenticated`. Drift de ACL entre repositório e produção — registrar para auditoria de drift.

## 7. Rollback

- **Fase B**: `GRANT SELECT ON public.produtos TO anon, authenticated; NOTIFY pgrst, 'reload schema';` (cabeçalho da migration).
- **Fase A**: bloco SQL no cabeçalho — a reescrita das 4 funções é **exatamente invertível** (remove o `LEFT JOIN … produtos_custos` e troca `pc.preco_custo` → `p.preco_custo`; testada em transação: volta a 3/3/2/3 referências, igual à produção), recria a policy antiga de `system_alerts`, remove a RPC e (por último) a view.
- O app novo lê o custo pela view; reverter o app só é necessário se a view for removida.

## 8. Produção — autorização necessária (NÃO executada)

**Sim, há necessidade de autorização expressa para aplicar as duas migrations em produção.** Sequência recomendada, sem janela de erro:

1. **Fase A** (aditiva) via MCP, com a pré-checagem do dry-run acima e registro do par de versão em `migration-human-gates.json`. Verificar: `produtos_custos` existe; 4 funções com `pc.preco_custo`; policy `system_alerts_select_gerencial`; GERENTE continua vendo catálogo/DRE (app antigo).
2. **Merge do PR + deploy do app novo** (Vercel) e verificação READY.
3. **Fase B** (fechamento) via MCP. Verificar por catálogo: `information_schema.column_privileges` sem SELECT de `authenticated`/`anon` em `preco_custo`/`preco_custo_medio`; GERENTE abre catálogo/edição e DRE; OPERADOR vende.
4. Se algo falhar: rollback da fase B (1 comando) reabre a leitura imediatamente.

Observação: o merge do PR em `main` **não** aplica migrations em produção (aplicação é manual via MCP, como no #516/#521); mesmo assim, o app novo depende da fase A — **não fazer o deploy do app novo antes da fase A**.
