# Alinhamento de Ambientes — 2026-08-20 (véspera de treinamento)

Diagnóstico, testes e ações executadas a pedido do usuário antes do treinamento do 1º cliente.
Regra seguida: **somente diagnóstico/documentação em produção, exceto a correção crítica
autorizada explicitamente pelo usuário** (ver seção 2). Nenhum dado de teste foi gerado em
produção — toda validação funcional (venda, devolução, cancelamento, caixa) rodou no ambiente
local (Docker) com usuários `e2e-*@localhost.test` dedicados.

## Veredito final

## ✅ APROVADO PARA TREINAMENTO — com uma pendência de publicação, não de qualidade

Os três pontos funcionais pedidos foram comprovados PASS com evidência técnica e visual real
(ver seção 11): **UI de vendas** (listagem/detalhe/devolução/cancelamento no Chrome real),
**regra de atacado** (funciona quando configurada) e **alerta de venda pendente** (timeout
deliberado de 30s, reconciliação sempre correta). Backend financeiro e RLS seguem aprovados
(gates da rodada anterior, banco local limpo, não repetidos aqui).

O bug real encontrado durante o teste da UI (recibo de cancelamento com valor errado após
devolução parcial) está **corrigido, testado automaticamente (12/12 testes de regressão,
incluindo prova de que os testes detectam a regressão) e re-confirmado visualmente no Chrome
real** — o recibo agora mostra "Total estornado: R$ 67,50", não mais R$ 112,50. Ver seção 11
(tabela) e seção 12 (separação produção vs. local).

**A única coisa que falta não é qualidade — é publicação:** a correção existe apenas nesta
worktree local (4 arquivos de código-fonte + 3 arquivos de teste novos), sem commit, sem push,
sem deploy. **Produção continua sem essa correção específica do recibo** (a migration de banco
crítica já está em produção desde a rodada anterior — isso é outra coisa, ver seção 12). Não
fiz commit/push/deploy porque você pediu explicitamente para não fazer sem autorização. Proposta
de mensagem de commit ao final da seção 6.

## Resumo executivo

| Área | Status | Observação |
|---|---|---|
| `origin/main` | ✅ | HEAD = `ae7e1af5` ("feat: fechamento pré-treinamento 2026-08-20") |
| Worktrees/branches | ✅ | Limpo — worktrees restantes são de outras sessões ativas (ver seção 1) |
| Banco de dados produção | ✅ (corrigido) | Migration crítica de cancelamento estava faltando — **aplicada em produção durante este alinhamento**, ver seção 2 |
| Banco de dados local (Docker) | ✅ 314/314 | Reset limpo + seed, testado do zero |
| Gate financeiro | ✅ 6/6 | `npm run test:financial -w fastproduct-backend`, banco limpo |
| Gate RLS | ✅ 42/42 | `npm run test:rls-scope -w fastproduct-backend`, banco limpo |
| App dev (typecheck/build) | ✅ | `npm ci` + typecheck limpo + `npm run build` exit 0 |
| Vercel produção | ✅ | Deploy no SHA correto, `/api/health` respondendo |
| Staging | ✅ (não existe) | Confirmado: não há ambiente de staging separado |
| Fluxo manual completo (login/caixa/venda/suprimento/fechamento) | ✅ | Testado local, ponta a ponta, ver seção 8 |
| Cenário crítico (devolução parcial + cancelamento) — backend | ✅ | Estorno correto (saldo restante, não 100%), ver seção 8 |
| UI `/admin/vendas` (listagem/detalhe/devolução/cancelamento) | ✅ | Validado visualmente no Chrome real, ver seção 11 item 1 |
| Recibo de cancelamento pós-devolução parcial | 🟡 corrigido, não re-verificado | Bug real encontrado e corrigido no código, sem deploy — ver seção 11 item 1b |
| Regra de preço de atacado | ✅ | Funciona corretamente quando configurada, ver seção 11 item 2 |
| Alertas "venda pendente de confirmação" | ✅ | Timeout de 30s deliberado, reconciliação sempre correta, ver seção 11 item 3 |

---

## 1. Worktrees e branches

**Descoberta inicial importante:** a missão presumia que "o branch atual" (deste próprio
worktree de trabalho) deveria estar em `main` no SHA `ae7e1af5`. Isso não corresponde a como
o Claude Code opera — cada tarefa roda em um worktree dedicado, em branch próprio
(`claude/alinhamento-ambientes-85e4f3`). O problema real encontrado foi outro: **este worktree
estava 12 commits atrás de `origin/main`, faltando 43 migrations** (271 vs 314 arquivos),
incluindo toda a onda "P0 Integração Go-Live" e a correção de cancelamento. Corrigido via
`git reset --hard origin/main` (autorizado pelo usuário) — HEAD agora é `ae7e1af5`, 314
migrations.

Havia **16 worktrees registrados** no total (não apenas os 2 citados na missão), a maioria
com trabalho não commitado real de outras sessões ativas. Ações tomadas:

- Removido (desregistrado) o worktree `pricing-test-origin-main` (HEAD destacado, sem
  alterações). **Pendência:** o Windows não conseguiu apagar a pasta física (arquivo em uso);
  ela contém `_stash-clone-aninhado-21-05.patch` (45KB) que parece um patch salvo
  intencionalmente — **não apagado**, requer decisão manual do usuário (revisar o patch antes
  de excluir `C:\fastproduct\.claude\worktrees\pricing-test-origin-main`).
- `printing-test-origin-main` (citado na missão) **não existe** — provavelmente já removido
  antes desta sessão.
- Deletadas **10 branches locais** já mergeadas em `origin/main` sem uso: `_merge-test`,
  `backup-ui-migration-status`, `chore/missao3-consolidacao-jinlong`, `chore/sentry-canonical`,
  `consol-sim`, `hotfix/chart-imports`, `release/claude-consolidation`, `ui-lock/login-migration`,
  `merge/consolidacao`, `release/admin-auth-stable-v1` (as duas últimas via `-D`, pois o Git
  não tinha certeza local por causa do remote-tracking, mas conteúdo já confirmado mergeado).
- `git worktree prune` executado — nada mais a limpar.
- **Não tocados:** os outros 13 worktrees (incluindo `C:/fastproduct` principal, em
  `codex/ap-payments-reconciliation`) e o branch local `main` (que está desatualizado/divergente
  de `origin/main` — 2 commits próprios + 12 atrás — não deve ser usado como referência). Esses
  worktrees pertencem a outras sessões/tarefas ativas e não são "lixo temporário".

## 2. Banco de dados — Produção (`kbabmewnahysfvlybiak.supabase.co`)

Comparação `mcp__supabase__list_migrations` (313 migrations antes da correção) vs. os 314
arquivos em `backend/supabase/migrations/` no repositório:

- **Drift de versão (não de conteúdo, já existente antes deste alinhamento):** as migrations
  `devolver_ou_trocar_venda_retorna_itens` e `fix_anon_grant_drift_devolver_ou_trocar_venda`
  foram aplicadas manualmente em produção com versão diferente da do repositório
  (`20260820102925`/`20260820103048` em vez de `20260820120000`/`20260820120100`). Mesmo
  conteúdo, numeração trocada. **Não mexido** — por decisão do usuário, deixado como está.
- **🔴 CRÍTICO encontrado:** `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`
  — a correção de `cancelar_venda_transacional` (evita duplo estorno/dupla reposição de estoque
  quando uma venda tem devolução parcial seguida de cancelamento total) — **não estava aplicada
  em produção**. Era exatamente o cenário do item 8 da missão original.

**Ação tomada (autorizada explicitamente pelo usuário nesta conversa, com justificativa registrada):**

1. Capturada e salva a definição *anterior* de `public.cancelar_venda_transacional` em
   `rollback_cancelar_venda_transacional_pre_20260820150000.sql` (scratchpad da sessão) —
   permite reversão imediata via `CREATE OR REPLACE FUNCTION` se necessário (ver seção 9).
2. Confirmada a existência das 5 tabelas de que a correção depende
   (`venda_pos_venda_operacoes`, `estoque_reposicoes_devolucao`,
   `estoque_reposicoes_cancelamento`, `movimentos_estoque_log`, `vendas_canceladas_auditoria`).
3. Migration aplicada via `mcp__supabase__apply_migration` — `{"success":true}`.
4. Verificado por inspeção estática (sem gerar vendas/cancelamentos reais em produção, para não
   poluir a baseline): o comentário da função e o corpo agora contêm a lógica corrigida
   (`v_ja_devolvido_total`, `v_ja_reposto_qtd`) — confirmado via `pg_get_functiondef`.
5. Registrada em `list_migrations` como versão `20260820233832` (timestamp de aplicação, não
   `20260820150000` do arquivo) — **mesmo padrão de drift de numeração das 2 migrations
   anteriores**, documentado aqui para reconciliação futura (`supabase db pull` vai reportar essa
   divergência de versão; o conteúdo está correto).

**A lógica corrigida foi validada funcionalmente ponta a ponta no ambiente local** (mesma SQL,
mesmo comportamento) — ver seção 8. Não rodei o cenário completo em produção para não poluir a
baseline de "0 vendas/0 logins".

**Security advisors (produção):** 79 achados, **zero ERROR, zero tabela com RLS desligado**. 75
warnings são todas sobre funções `SECURITY DEFINER`/`search_path` (débito técnico já conhecido).
4 infos são tabelas com RLS ligado mas sem policy (bloqueiam acesso, não expõem dado). Nada
bloqueante para o treinamento.

## 3. Banco de dados local (Docker)

`supabase db reset --local` executado com sucesso: **314/314 migrations reaplicadas do zero**
+ seed determinístico, sem erros (só NOTICEs esperados de objetos idempotentes sendo recriados).
Stack confirmada (`supabase status` — API `:54321`, DB `:54322`, Studio `:54323`).

- `npm run test:financial -w fastproduct-backend` → **6/6 suítes PASS** (idempotency-correlation,
  sale-totals-invariant, ar-receipts-reconciliation, ap-payments-reconciliation,
  financial-adversarial-gates, commission-concurrency).
- `npm run test:rls-scope -w fastproduct-backend` → **42/42 regras PASS**, incluindo
  especificamente `RPC cancelar_venda_transacional negado a OPERADOR` (a função corrigida na
  seção 2 continua exigindo GERENTE/DONO/ADMIN).

## 4. App — Desenvolvimento (localhost)

Worktree aponta para `ae7e1af5` (seção 1). `node_modules` não existia neste worktree (nunca
tinha rodado `npm ci` aqui) — isso derrubava o typecheck com erros enganosos do tipo "Cannot
find module 'lucide-react'" (dependência ausente, não erro de tipo real). Após `npm ci` na raiz:

- `npm run typecheck -w pdv-importados` → **limpo, sem erros**.
- `npm run build -w pdv-importados` → **sucesso (exit code 0)**, todas as rotas
  (admin, caixa, gerente, auth, APIs) geradas normalmente.

**Achado de tooling (não é bug de produto):** rodar `next dev` sobre uma pasta `.next` que já
tinha um `next build` corrompe o build (falta `BUILD_ID`) e `next start` para de funcionar —
tive que apagar `.next` e rebuildar. Se isso acontecer com você: `rm -rf pdv-importados/.next`
e rode `npm run build` de novo antes de `npm start`.

Login OPERADOR e GERENTE testados manualmente com sucesso via `npm run seed:dev-users`
(usuários `e2e-operador@localhost.test` / `e2e-gerente@localhost.test`) — ver seção 8.

## 5. App — Produção (Vercel)

Confirmado via `https://pdv-importados.vercel.app/api/health`:

```json
{"deploymentId":"dpl_212CCisLJfEXeCFH4PLd6uNNktYQ","gitSha":"ae7e1af5565190c36c176a94a2b240dcfa379392"}
```

SHA bate exatamente com `ae7e1af5`. Login em produção **não testado** (evitado deliberadamente
para não gerar entradas reais na baseline de "0 logins" antes do treinamento — toda a validação
funcional rodou local, ver seção 8).

## 6. Staging

Confirmado (consistente com conhecimento prévio do projeto): **não existe ambiente de staging
separado**. Um único projeto Supabase (`kbabmewnahysfvlybiak`) serve produção, Preview e E2E.
Não há nada adicional a alinhar aqui.

## 7. Documentação

Este arquivo. Critérios de sucesso da missão original conferidos item a item nas seções acima.

## 8. Validação manual — ambiente local (Docker + `npm run build` + `npm start`)

Rodada 100% no ambiente local, com o app rodando em modo produção (`next start`, não `next dev`)
contra o Supabase Docker local recém-resetado. Usuários de teste criados via
`npm run seed:dev-users` (`e2e-operador@localhost.test`, `e2e-gerente@localhost.test`).

**Fluxo padrão — tudo ✅ (rodada 1, ver histórico completo abaixo):**

1. Login OPERADOR — ok.
2. Abertura de caixa, fundo R$ 100,00 — ok.
3. Venda varejo (1 unidade, R$ 22,50) + recibo impresso — ok, sem duplicidade.
4. Venda 5 unidades do mesmo produto — ok, sem duplicidade (preço de atacado não aplicado
   porque o produto não tinha faixa configurada — ver seção 11, item 2).
5. Suprimento de R$ 50,00 + comprovante — ok.
6. Fechamento de caixa: **Sistema R$ 285,00 = Contado R$ 285,00, diferença R$ 0,00** — ok.
   Nenhum placeholder `[NÚMERO CTO]` em nenhum recibo (confirmado também por busca no
   código-fonte: a string não existe mais em `pdv-importados/`).

**Cenário crítico da migration (devolução parcial + cancelamento):**

Venda de teste com 3 unidades (R$ 67,50) → devolução parcial de 1 unidade → cancelamento total
da venda, logado como GERENTE (a RPC exige esse nível de permissão, confirmado pelo gate RLS).

| Etapa | Resultado |
|---|---|
| Devolução de 1×R$22,50 | `valor_estornado: 22.50`, `valor_caixa_estornado: 22.50`, venda continua `CONCLUIDA` |
| Cancelamento da venda (2 unidades restantes) | **`valor_estornado: 45.00`** — não R$ 67,50 |
| Reposição de estoque | 1 unidade pela devolução + 2 pela cancelamento = 3 (total vendido, sem duplicar) |
| Fundo do caixa após as duas operações | R$ 352,50 → R$ 330,00 (devolução) → **R$ 285,00** (cancelamento) — bate exatamente com 3 vendas líquidas − a venda cancelada |

**A correção funciona corretamente**: o estorno do cancelamento respeitou o valor já devolvido
(45,00 = 67,50 − 22,50), e o estoque não foi reposto em dobro. Executado via chamada direta e
autenticada da RPC (mesmo caminho que a UI usa, mesmo JWT de sessão do GERENTE), já que nesse
momento a tela `/admin/vendas` ainda não tinha sido validada no Chrome real.

**Rodada 2 — validação visual completa no Chrome real do usuário (após pedido explícito de
comprovação):** login GERENTE → `/admin/vendas` carregou perfeitamente (listagem, KPIs,
detalhe da venda com histórico de devolução visível) → devolução parcial de 2 de 5 unidades
(R$ 45,00) via UI → cancelamento das 3 restantes via UI. **Aqui apareceu um bug real**: o
comprovante impresso mostrou "Total estornado: R$ 112,50" (o total ORIGINAL da venda) em vez de
R$ 67,50 (o saldo restante, que era o valor correto — confirmado em
`vendas_canceladas_auditoria.valor_estornado = 67.50` e no saldo do caixa, que caiu exatamente
os R$ 67,50). Causa raiz, correção e evidência completas na seção 11, item 1b.

Depois disso o Chrome do usuário caiu (provável sobrecarga: Docker + `next start` + Chrome
rodando juntos). A validação da regra de atacado (item 2) e a repetição dos alertas de venda
pendente (item 3) foram concluídas com sucesso numa aba de navegador substituta antes da queda
e depois dela — ver seção 11 para o detalhe de cada uma.

**Rodada 3 — regressão automatizada + reconfirmação visual (após pedido de fechamento técnico):**
escrevi e rodei 3 arquivos de teste novos (12 testes) cobrindo a cadeia inteira do bug (RPC →
server action → componente do recibo) com casos de controle (sem devolução prévia, valor
ausente/inválido, erro da RPC, perfil sem permissão). Provei que os testes realmente detectam a
regressão: revertendo a correção via `git stash`, 6 dos 12 testes falham exatamente nos pontos
esperados (o mais direto: `expected 112.5 to be 67.5`); restaurada a correção, 12/12 voltam a
passar. Rodei também toda a suíte de `app/caixa` + `app/gerente/vendas` (30 arquivos, 137
testes) — nenhuma regressão em recibos de venda, suprimento ou fechamento. Typecheck e
`npm run build` limpos de novo. Com o Chrome reconectado, repeti o cenário exato pedido — venda
de 5 unidades por R$ 112,50 → devolução de 2 unidades (R$ 45,00) → cancelamento das 3 restantes
— e o recibo mostrou **"Total estornado: R$ 67,50"**, confirmado visualmente (screenshot) e no
banco (`vendas_canceladas_auditoria.valor_estornado = 67.50`, reposição de estoque 2+3=5 sem
duplicar). Detalhe completo na seção 11.

## 9. Rollback da migration aplicada em produção

Script completo salvo em (scratchpad da sessão, fora do repositório):
`rollback_cancelar_venda_transacional_pre_20260820150000.sql`. Contém a definição original da
função `cancelar_venda_transacional`, pronta para reaplicar via `apply_migration`/`execute_sql`
caso a correção cause algum problema em produção antes/durante o treinamento.

## 10. Pendências para o usuário

1. **Autorizar (ou não) commit/push/deploy do fix do recibo** — está corrigido, testado
   (automatizado + visual), mas só nesta worktree local. Mensagem de commit proposta na seção 13.
2. Apagar (ou não) a pasta física `pricing-test-origin-main` e seu patch salvo — recomendação:
   preservar por enquanto, não é urgente (seção 11, item 5).
3. Revisar se as faixas de atacado reais do catálogo do cliente ficam dentro do limite de 10% de
   desconto sem aprovação gerencial (seção 11, item 2b) — se não, operadores vão precisar de
   validação de gerente a cada venda de atacado durante o treinamento.
4. Se quiser, validar login real em produção — deliberadamente não testado nesta sessão para
   manter a baseline "0 vendas/0 logins".

## 11. Tabela de verificação — pontos pedidos nesta rodada

| # | Pendência | Causa raiz | Correção | Teste executado | Evidência | Veredito |
|---|---|---|---|---|---|---|
| 1 | UI de `/admin/vendas` não renderizava no navegador de automação da sessão anterior | Peculiaridade do ambiente de automação (Browser pane interno) — o servidor sempre entregou HTML completo e correto (confirmado via `fetch()` direto, 128ms) e nenhuma query ficou presa no Postgres | Nenhuma no app. Reconectei ao Chrome real do usuário | Login GERENTE → `/admin/vendas` → listagem (6 vendas) → abrir detalhe → devolver 2 de 5 unidades → cancelar as 3 restantes → timeline/valores/status atualizados em tempo real | Screenshots de cada etapa (listagem, detalhe com "devolvido 2", comprovante de devolução R$45,00, modal de cancelamento, comprovante final) | **PASS** — UI funciona; revelou o bug 1b (abaixo) |
| 1b | *(achado durante o teste acima, não pedido originalmente)* Recibo de cancelamento mostra o valor **original** da venda (R$112,50) em vez do valor **realmente estornado** (R$67,50) quando há devolução parcial prévia | `VendaCancelarModal.tsx` montava o comprovante com `vendaAtiva.total_liquido` (total da venda) em vez de `valorEstornado` (retorno da RPC `cancelar_venda_transacional`); a cadeia `cancelarVendaImpl → CancelarVendaResult → cancelarVendaGerenteAction` descartava esse campo desde sempre — invisível até hoje porque sem devolução prévia os dois valores coincidem | Corrigida: `valorEstornado` propagado por toda a cadeia (4 arquivos: `caixaVendas.impl.ts`, `caixaActionTypes.ts`, `gerente/vendas/actions.ts`, `VendaCancelarModal.tsx`). **3 arquivos de teste de regressão novos, 12 testes** — provado que detectam a regressão (revertendo o fix, 6/12 falham exatamente no ponto certo) | Reproduzido ao vivo (venda 82ad0d34 → R$112,50 errado); corrigido; 12/12 testes novos PASS; 137/137 testes de `app/caixa`+`app/gerente/vendas` sem regressão; typecheck e build limpos; **repetido visualmente no Chrome real** (venda 04dd460f: 5un R$112,50 → devolução 2un R$45,00 → cancelamento 3un) | Screenshot do bug original + screenshot do recibo corrigido ("Total estornado: R$ 67,50") + saída dos 3 arquivos de teste + query SQL confirmando ledger e estoque + diff da correção | **CORRIGIDO, TESTADO (AUTOMATIZADO + VISUAL), NÃO IMPLANTADO** — código só nesta worktree local, sem commit/push/deploy (seção 12) |
| 2 | Venda de 5 unidades manteve preço de varejo em vez de atacado | Confirmado objetivamente: **nenhum produto do catálogo local tinha faixa de atacado configurada** (`precos_atacado` vazio) — não é falha do PDV | Não aplicável ao código. Criei uma faixa de teste (produto de teste, 3+ unidades) no banco local | Duas vendas via UI real: 5un a R$18,00 (colidiu com a trava de desconto, ver 2b) e 3un a R$21,00, finalizada com sucesso | Screenshots com badge "Atacado", preço riscado R$22,50→R$21,00, total R$63,00, recibo com "[ATACADO]" | **PASS** — atacado funciona corretamente quando configurado |
| 2b | *(achado colateral)* Desconto de atacado de 20% foi bloqueado, exigindo aprovação de gerente | Comportamento **correto e intencional**: migration `limite_desconto_manual_itens` trata a diferença varejo↔atacado como desconto manual sujeito a limite de 10% sem token de gerente | Nenhuma — não é bug. Recomendação de configuração: se as faixas reais do cliente tiverem desconto >10%, operadores vão pedir aprovação a cada venda de atacado | Mesmo teste do item 2 (tentativa com R$18,00/un, 20% de desconto) | Mensagem de erro capturada + reconciliação confirmando venda não gravada + banco sem registro órfão | **PASS** (comportamento correto, documentado para configuração real) |
| 3 | Alertas de "venda pendente de confirmação" apareceram 3 vezes durante os testes | Confirmado no código-fonte: `CaixaPageClient.tsx` usa `Promise.race` entre a chamada real de finalização e um timer de `FINALIZACAO_TIMEOUT_MS = 30_000` (30s) — mecanismo deliberado de tolerância a latência de rede, com caminho de reconciliação explícito ("Verificar venda") já implementado e documentado em comentário no próprio código | Nenhuma necessária — mecanismo funciona como projetado | 3 ocorrências reais (ambiente local sob carga pesada: Docker + dev server + múltiplas ferramentas rodando juntas) verificadas uma a uma via "Verificar venda" | 2 casos: confirmou venda registrada, sem duplicidade (contagem = 1 no banco). 1 caso: confirmou venda **não** registrada (rejeitada pela trava do item 2b) e liberou o carrinho para nova tentativa, sem estado travado | **PASS** — reconciliação sempre correta, nunca houve duplicidade nem estado preso |
| 4 | Esclarecer "migration aplicada em produção" | — | — | Reconfirmado agora (fresco, não é da rodada anterior): `pg_get_functiondef` mostra `v_ja_devolvido_total`/`v_ja_reposto_qtd` e o comentário correto na função em produção; `list_migrations` mostra a migration registrada. **SHA testado:** `ae7e1af5` (local + Vercel). **Migrations locais:** 314/314 via `supabase db reset --local` completo. **Nenhuma execução destrutiva em produção:** todas as chamadas contra o Supabase de produção nesta sessão (incluindo a rodada atual) foram leitura (`list_migrations`, `get_project_url`, `execute_sql` com `SELECT`, `get_advisors`) exceto uma única `apply_migration` contendo somente `CREATE OR REPLACE FUNCTION` + `COMMENT ON FUNCTION` + `NOTIFY` dentro de `BEGIN/COMMIT` — sem `DROP`/`DELETE`/`TRUNCATE`/`UPDATE` de dados. Nenhuma venda de teste foi criada em produção | Query fresca de `pg_get_functiondef` + `list_migrations` (reproduzida nesta rodada) | **PASS** |
| 5 | Pasta `pricing-test-origin-main` / patch salvo | Não é lixo: o patch (999 linhas, 9 arquivos) contém (a) um tema visual "dragão dourado" para a tela de caixa (`CaixaHeader`/`CaixaFooter`/etc.) ainda não aplicado — as classes CSS (`dragon-glass-backdrop` etc.) já existem no repo e são usadas no admin/gerente, mas nunca foram estendidas ao PDV; e (b) duas melhorias pequenas de produto/estoque (invalidação de cache extra ao criar produto + estoque mínimo padrão configurável em vez de hardcoded `0`) | Nenhuma correção — decisão do usuário. O patch está **desatualizado**: um dos arquivos-alvo (`lib/adapters/supabase/produtoRepository.ts`) não existe mais na estrutura atual do código, então não aplicaria limpo hoje | Inspecionei o patch completo (`git diff` embutido) e comparei cada mudança contra o código atual | Trechos do diff citados acima; confirmação de que `dragon-glass-backdrop` existe no repo mas não em `CaixaHeader.tsx`; confirmação de que `produtoRepository.ts` não existe mais | **NÃO É URGENTE** — preservar até revisão humana; não descartar sem olhar |

**Sobre o item 1b:** a correção é mínima, cirúrgica, e diretamente rastreada até a causa raiz —
troca a fonte de um único valor exibido no recibo, sem tocar em nenhuma lógica financeira (o
backend sempre esteve certo). Agora tem prova automatizada (12 testes, com prova de que
detectam a regressão) e prova visual (Chrome real, screenshot). Nenhum dado já registrado no
banco (local ou produção) está incorreto — o problema era só o texto impresso do comprovante.
**O que falta não é verificação — é a decisão de publicar** (seção 12).

## 12. Produção vs. local — separação explícita (sem ambiguidade)

| | Migration crítica do cancelamento (backend) | Fix do recibo (frontend, item 1b) |
|---|---|---|
| **Nome/ID exato** | `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql` (arquivo do repo) | Sem migration — são 4 arquivos `.ts`/`.tsx` de código de aplicação |
| **Projeto Supabase / ambiente alvo** | `kbabmewnahysfvlybiak` (produção — é o único projeto Supabase do sistema; não existe staging separado, ver seção 6) | N/A (não é banco de dados) |
| **Horário da aplicação em produção** | Registrada em `list_migrations` com versão `20260820233832` (o timestamp que a ferramenta `apply_migration` atribuiu no momento da aplicação, na rodada anterior desta sessão — mesmo padrão de drift de numeração das outras 2 migrations já existentes, seção 2) | **Nunca aplicado a nenhum ambiente remoto** — não há "horário de aplicação" porque não foi implantado |
| **Evidência de presença no histórico remoto** | `mcp__supabase__list_migrations` (reconfirmado nesta rodada) lista a entrada `20260820233832`; `pg_get_functiondef` mostra a lógica corrigida (`v_ja_devolvido_total`, `v_ja_reposto_qtd`) na função ao vivo em produção | Nenhuma — os 4 arquivos existem só no disco desta worktree (`git status`, seção 13) |
| **Status** | ✅ **Em produção**, comprovada | 🟡 **Só local**, comprovada, não publicada |

**Diferença entre o SHA implantado em produção e o código local não implantado:** o Vercel de
produção está no commit `ae7e1af5` (confirmado via `/api/health` — `gitSha:
ae7e1af5565190c36c176a94a2b240dcfa379392`), que já contém a migration crítica do cancelamento
(aplicada ao banco, tabela acima) mas **não contém e não pode conter** o fix do recibo — esse
fix foi escrito *depois* de `ae7e1af5`, só nesta worktree, nunca commitado. Ou seja: hoje,
**produção tem o backend corrigido mas o recibo do frontend ainda mostraria o valor errado** se
alguém cancelasse uma venda com devolução parcial prévia em produção agora mesmo. Isso só muda
quando o fix do recibo for commitado, mergeado e deployado — nenhuma dessas três coisas
aconteceu.

**Equivalência de versão — `20260820150000` (repo) ≡ `20260820233832` (produção), mesma migration,
não é drift de conteúdo:** o arquivo do repositório
`backend/supabase/migrations/20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`
foi aplicado a produção via `mcp__supabase__apply_migration`, que registra a versão como o
*timestamp em que a chamada foi feita*, não o timestamp do nome do arquivo — por isso a entrada
em `supabase_migrations.schema_migrations` (visível via `list_migrations`) ficou com a versão
`20260820233832` em vez de `20260820150000`. **O conteúdo é idêntico** (mesmo `CREATE OR REPLACE
FUNCTION`, confirmado por `pg_get_functiondef` mostrando exatamente `v_ja_devolvido_total` e
`v_ja_reposto_qtd`) — só o número de versão no ledger diverge do nome do arquivo. Isso é o
**mesmo padrão já existente antes desta sessão** para as 2 migrations anteriores do mesmo dia
(`20260820120000`→`20260820102925` e `20260820120100`→`20260820103048`, seção 2) — não é uma
inconsistência nova nem um sinal de que o conteúdo divergiu; é um efeito colateral conhecido de
como essa ferramenta de aplicação numera migrations aplicadas fora do fluxo normal de
`supabase db push`. Uma futura reconciliação (`supabase db pull` ou correção manual do ledger)
pode alinhar os números sem nenhum risco, já que o SQL em si é idêntico.

## 13. Estado do Git — revisão completa

```
On branch claude/alinhamento-ambientes-85e4f3
HEAD: ae7e1af5 (sem commits novos — só working tree modificado)

Changes not staged for commit:
  modified:   .claude/scheduled_tasks.lock          (lock interno do harness — não tocar)
  modified:   pdv-importados/app/caixa/caixaActionTypes.ts
  modified:   pdv-importados/app/caixa/server/caixaVendas.impl.ts
  modified:   pdv-importados/app/gerente/vendas/VendaCancelarModal.tsx
  modified:   pdv-importados/app/gerente/vendas/actions.ts

Untracked files:
  docs/ALINHAMENTO_AMBIENTES_2026-08-20.md          (este relatório)
  pdv-importados/app/caixa/server/cancelarVendaValorEstornado.test.ts
  pdv-importados/app/gerente/vendas/cancelarVendaGerenteAction.test.ts
  pdv-importados/app/gerente/vendas/VendaCancelarModal.behavior.test.tsx
```

`.claude/scheduled_tasks.lock` é um arquivo de lock interno do Claude Code (sessionId/pid/timestamp),
modificado automaticamente ao iniciar esta sessão — não tem relação com o bugfix, não contém
segredos, e não deveria entrar em nenhum commit relacionado ao fix. Os 4 arquivos de código +
3 de teste + o relatório são exatamente e apenas o que está documentado neste documento —
revisei o diff completo de cada um (seção 11) e não há nada acidental, nenhum segredo, nenhum
arquivo temporário.

**Não fiz commit, push, merge nem deploy** — apenas a investigação e a correção no disco, como
pedido.

**Proposta de mensagem de commit** (para quando você autorizar):

```
fix(vendas): recibo de cancelamento usa o valor realmente estornado, não o total da venda

Antes: VendaCancelarModal montava o comprovante com vendaAtiva.total_liquido — correto
quando não havia devolução prévia, mas errado desde que cancelar_venda_transacional passou
a descontar devoluções já registradas (migration 20260820150000). Agora valorEstornado é
propagado por toda a cadeia (cancelarVendaImpl -> CancelarVendaResult ->
cancelarVendaGerenteAction -> VendaCancelarModal) até o recibo.

12 testes de regressão novos (cancelarVendaValorEstornado.test.ts,
cancelarVendaGerenteAction.test.ts, VendaCancelarModal.behavior.test.tsx), confirmados
contra a regressão via git stash. Verificado visualmente no Chrome real.
```

## 14. Tarefa em segundo plano "parada" — investigação

A notificação dizia respeito ao processo `npm start` (servidor de produção local) que eu havia
iniciado logo após aplicar o fix, na rodada anterior. Achados:

- O log do processo mostra que ele **subiu com sucesso** ("Ready in 2.8s") e só registrou um
  erro esperado (`Failed to find Server Action ...` — a aba do navegador ainda tinha carregado
  o HTML/JS do build *anterior* ao fix; isso é normal ao trocar de build com uma aba já aberta).
- **Não há registro de conclusão** porque o processo foi encerrado externamente — o Docker
  (`supabase_db_fastproduct` etc.) mostrava "Up 8 minutes" no início desta rodada, ou seja, os
  containers (e provavelmente o processo Node junto) foram reiniciados quando a sessão anterior
  terminou/reiniciou. Confirmei isso testando a porta 3000: `curl` retornava conexão recusada.
- **Essa tarefa não era necessária para nenhuma evidência já apresentada** — todas as
  evidências da rodada anterior (screenshots, queries SQL) foram capturadas enquanto o servidor
  estava de pé, antes do encerramento.
- **Não considerei nada concluído sem registro** — por isso reiniciei o servidor do zero
  (`npm start` novo, rodada atual) antes de fazer qualquer teste visual novo, e revalidei tudo
  do zero nesta rodada (build limpo, servidor no ar, testes visuais repetidos).
- Rodar de novo era seguro e necessário (para os testes desta rodada) — foi feito.

## 15. Tabela final

| Requisito | Teste automatizado | Teste visual | Ambiente | Evidência | PASS/FAIL |
|---|---|---|---|---|---|
| Gate financeiro (6 suítes) | `npm run test:financial -w fastproduct-backend` | — | Local, banco resetado | Rodada anterior — não repetido | **PASS** |
| Gate RLS (42 regras) | `npm run test:rls-scope -w fastproduct-backend` | — | Local, banco resetado | Rodada anterior — não repetido | **PASS** |
| Cancelamento respeita devolução prévia (backend) | Coberto indiretamente pelos 12 testes abaixo + gate financeiro | Sim — venda 3un R$67,50 → devolução 1un → cancelamento R$45,00 | Local (RPC direta) e Chrome real | `valor_estornado` no banco + comprovante na tela | **PASS** |
| **Recibo mostra o valor certo (não o total original)** | **12/12 testes novos** (`cancelarVendaValorEstornado.test.ts` 6, `cancelarVendaGerenteAction.test.ts` 3, `VendaCancelarModal.behavior.test.tsx` 3) — regressão comprovada via `git stash` (6/12 falham sem o fix) | **Sim** — venda 04dd460f: 5un R$112,50 → devolução 2un R$45,00 → cancelamento 3un | Local (Docker + `next build` + `next start`), Chrome real | Executado e observado ao vivo no Chrome real (texto capturado via get_page_text: "Total estornado / R$ 67,50"); screenshot exibido inline no histórico da ferramenta durante a execução — não localizei o arquivo salvo em disco pela extensão do Chrome para versionar, então não foi incluído no commit (ver seção 16) + saída dos testes + query SQL | **PASS** |
| Nenhuma regressão em recibos de venda/suprimento/fechamento | 137/137 testes (`app/caixa` + `app/gerente/vendas`, 30 arquivos) | Sim — fluxo completo rodada 1 (varejo, atacado, suprimento, fechamento) | Local | Saída da suíte + screenshots rodada 1 | **PASS** |
| UI `/admin/vendas` (listagem/detalhe/devolução/cancelamento) | N/A (é validação de UI) | Sim — Chrome real, fluxo completo | Local, Chrome real | Screenshots de cada etapa | **PASS** |
| Preço de atacado aplicado corretamente | N/A | Sim — 5un R$18,00 e 3un R$21,00 | Local, Chrome real | Screenshots com badge "Atacado" | **PASS** |
| Alerta "venda pendente" reconcilia sem duplicidade | N/A | Sim — 4 ocorrências reais ao longo da sessão, cada uma verificada | Local, Chrome real e Browser pane | Screenshots + contagem no banco | **PASS** |
| Typecheck | `npm run typecheck -w pdv-importados` | — | Local | Saída limpa (2x, antes e depois dos testes novos) | **PASS** |
| Build de produção | `npm run build -w pdv-importados` | — | Local | Exit 0 (2x) | **PASS** |
| Migration crítica em produção | `list_migrations` + `pg_get_functiondef` | N/A (banco, não UI) | **Produção** (`kbabmewnahysfvlybiak`) | Reconfirmado nesta rodada | **PASS** |
| Fix do recibo em produção | N/A | N/A | **Produção** | **Não aplicável — não implantado** | **N/A (pendente de autorização)** |

**Condição do usuário para "APROVADO PARA TREINAMENTO" sem ressalvas** ("teste de regressão
verde" + "recibo corrigido confirmado visualmente") — **ambas atendidas**. A única ressalva que
resta é operacional, não técnica: o fix existe só localmente até você autorizar publicá-lo.

## 16. Sobre o screenshot do recibo corrigido

O recibo com "Total estornado: R$ 67,50" foi capturado e apareceu inline no histórico desta
sessão durante a execução do teste visual (rodada 3). Não contém nenhum dado sensível — é uma
tela do PDV local com dados de teste (`e2e-*@localhost.test`, produto de teste, valores
fictícios), sem credenciais, tokens ou informação real de cliente visível. Não localizei o
arquivo de imagem salvo em disco pela extensão do Chrome para poder versioná-lo numa pasta de
evidências, então **não foi incluído no commit** — a execução está referenciada em detalhe nas
seções 8 e 11 (texto exato capturado da página: "VENDA CANCELADA … Total estornado R$ 67,50 …
Cancelado por Gerente E2E"), o que é reproduzível a qualquer momento repetindo o cenário descrito.
