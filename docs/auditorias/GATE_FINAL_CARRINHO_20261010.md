# Gate final — sprint do carrinho (2026-10-10)

Branch: `sprint/correcao-carrinho-20261010`  
Base: `sprint/go-live-01` @ `64a0f5b1`  
HEAD do gate: ver o commit deste arquivo.  
Sem banco remoto, sem migration, sem deploy, sem merge.

## 1. Escopo dos commits

`git diff --name-only 64a0f5b1..HEAD` (antes deste relatório) contém só:

- `shared-core/src/stores/unifiedCartStore.ts`
- `shared-core/src/stores/unifiedCartStore.spec.ts`
- `pdv-importados/app/caixa/CaixaCarrinhoAuthSync.tsx`
- `pdv-importados/app/caixa/carrinhoIsolamento.behavior.test.ts`
- `pdv-importados/app/caixa/carrinhoStore.behavior.test.ts`
- `pdv-importados/vitest.config.ts`
- `pdv-local/src/App.tsx`
- `pdv-local/src/stores/cartStore.behavior.test.ts`
- `pdv-local/src/stores/cartStore.isolation.test.ts`
- `pdv-local/src/stores/cartStore.test.ts`
- `pdv-local/package.json`
- `docs/auditorias/RELATORIO_CORRECAO_CARRINHO_20261010.md`

Worktrees e arquivos soltos (`_wt-*`, `AGENTS.md`, `_wt-ci-repro-tools/`, `_wt-ci-repro-synckey.txt`) continuam untracked. Não entram em nenhum commit da sprint.

| SHA | Conteúdo |
|---|---|
| `05e8258a` | Store: operador, loja, reidratação sem dono, agregação compatível, quantidade |
| `613641d3` | Ligação da loja no caixa web e no desktop |
| `ca634ff3` | Spec de idempotência no runner web; import de tipo no teste desktop |
| `01885d4e` | Relatório da correção; cobertura desktop sem `--exclude` do carrinho |
| `cca2a9e8` | SHA desse relatório |

Diff de `App.tsx` contra a base: só `bindLojaCarrinhoDesktop` e `setLojaId`. Nenhuma linha dos erros de TypeScript abaixo.

## 2. Matriz de testes

| Prova | Comando / evidência | Resultado |
|---|---|---|
| Isolamento de operador, loja, reidratação sem dono, primeira loja, quantidade, desconto, atacado/varejo, limpeza | `carrinhoIsolamento.behavior.test.ts` + `carrinhoStore.behavior.test.ts` + `unifiedCartStore.spec.ts` | 38 testes no lote web de carrinho, dentro dos **88/88** do lote web deste gate |
| Checkout, saldo de pagamento, contrato v4 | `finalizarVendaValidation.test.ts`, `caixaPagamentoSaldo.test.ts`, `contrato-finalizar-venda-v4.test.ts` | incluídos nos **88/88** |
| Desktop (store, isolamento, preço local, demais) | `npm test` em `pdv-local` | **63/63** |
| Typecheck do domínio compartilhado | `npm run typecheck` em `shared-core` | exit 0 |
| Typecheck oficial do desktop | `tsc -p tsconfig.typecheck.json` (`App.tsx` excluído, igual na base) | exit 0 |
| Typecheck solto do desktop | `tsc -p tsconfig.json` | **4 erros**, classificados na seção 3 |
| ESLint com o config do web | `npx eslint --no-ignore -c .eslintrc.json --resolve-plugins-relative-to .` nos arquivos do store e do caixa | exit 0, sem aviso |
| Build Next.js | `npm run build` em `pdv-importados` | **exit 0** na segunda execução (seção 4). Typecheck do Next passou (`Checking validity of types` seguido de geração das 19 páginas estáticas). `/caixa` no manifesto: 49.6 kB |
| Fiscais de produto | `produtosFiscalEdicao.integration.test.ts` | **4/4 falham**, classificados na seção 5 |
| Dois operadores no navegador, reload real, troca de loja na UI | — | **Pendente.** Não houve sessão autenticada neste gate. Não é homologação de tela. |

O lote web deste gate (`88`) junta os 38 de carrinho/idempotência com os 50 de finalização, saldo e contrato. Desktop `63` inclui os 11 da store.

## 3. Quatro erros de TypeScript do desktop

`npx tsc --noEmit -p pdv-local/tsconfig.json` (config que **inclui** `App.tsx`):

| Linha | Código | O que o compilador diz |
|---|---|---|
| `App.tsx:157` | TS2322 | `ItemCarrinho[]` do store não cabe em `ItemVenda[]`: `resultado` pode ser `undefined` |
| `App.tsx:776` | TS18048 | `item.resultado` possivelmente `undefined` (`precoOriginal`) |
| `App.tsx:780` | TS18048 | o mesmo em `precoUnitario * quantidade` |
| `App.tsx:783` | TS18048 | o mesmo em `tipoPreco === 'ATACADO'` |

Causa: `useDesktopCartStore()` devolve o `ItemCarrinho` de `unifiedCartStore`, cujo `resultado` já era opcional na base (`git show 64a0f5b1` mostra `resultado?:`). `usePdvLocalVendaCaixaFlow` declara `ItemVenda.resultado` obrigatório. A UI desenha `item.resultado` sem estreitamento. `git blame` aponta a linha 157 para `f16581093` (2026-04-23) e as linhas 776–783 para `bc87a15c` (2026-03-20). Nenhuma é commit desta sprint.

Impacto: o script oficial `npm run typecheck` do desktop **exclui** `App.tsx` desde a base (`tsconfig.typecheck.json`). O build Next não compila esse pacote. Em runtime o `normalizarItemCarrinho` preenche `resultado` ao adicionar item; o erro é de tipo, não um caminho novo de preço. Não bloqueia o PR do carrinho. Não foi “corrigido” aqui porque seria mudança fora do gate.

## 4. Build Next.js

Primeira execução, com `node_modules` incompleto: falhou ao resolver `@fontsource/noto-sans-sc` e `@fontsource/cinzel`. Os dois pacotes já estão em `pdv-importados/package.json` (`^5.3.0`) e no lockfile (`5.3.0`). `npm install -w pdv-importados` acrescentou 2 pacotes. O lockfile não mudou.

Segunda execução: compilou em 80s, validou tipos, gerou 19 páginas estáticas, exit 0. O aviso do Sentry sobre `disableLogger` / `instrumentation-client.ts` e o browserslist desatualizado apareceram e não derrubaram o build. Não são desta sprint.

## 5. Quatro testes fiscais

Arquivo intocado pela sprint: `pdv-importados/app/admin/produtos/produtosFiscalEdicao.integration.test.ts`. `productReader.ts` não importa o carrinho.

Ambiente desta máquina: `SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_URL` em `.env.local` apontam para `127.0.0.1:54321`. Não é o projeto remoto.

Reexecução neste gate: 4 falhas, todas em `buscarLinhaViaRpc` linha 135, `expected 0 to be greater than 0`. O insert via `service_role` chegou a devolver id (senão o teste lançaria `setup: criar produto falhou` antes). A RPC `list_produtos_gerente_filtrados` respondeu `ok: true` com lista vazia. O `WHERE` dessa função (migration `20260902150000`) só devolve linha se `auth_usuario_eh_admin()` ou se `p_loja_id` é a loja de `auth.uid()`. O teste assina um JWT local com o segredo padrão do Supabase CLI e o usuário `22222222-2222-4222-8222-222222222222`.

Leitura local, sem escrita: esse id existe em `usuarios` como `GERENTE` da loja matriz e existe em `auth.users`. Depois do `afterEach`, produtos com nome `C2.8 TS%` restantes: **0**. O teste não deixou lixo.

Conclusão: a lista vazia é o sintoma que o próprio arquivo descreve quando o chamador não entra como esse gerente (`auth.uid()` não casa com a loja). Não há diff de carrinho, de mapper ou da RPC neste branch. Não é regressão do cupom. Também não é um verde mascarado: o teste continua vermelho e o motivo está no harness de identidade local, não num `skip`.

## 6. Contratos pedidos no gate

Cobertos por teste de store, com ids fictícios:

- Operador B não herda cupom do operador A.
- O mesmo operador, com o mesmo dono e a mesma loja, recupera itens e a chave de idempotência.
- Reidratação com itens e sem dono não é adotada no próximo `setCartOwnerForSession`.
- Cupom ainda só em memória, sem o sinal de reidratação, continua com quem autenticar na mesma sessão.
- Primeira loja (`null` → id) não apaga a venda. Loja diferente apaga itens e a chave, e mantém o operador.
- Mesmo preço automático agrega. Desconto manual diferente não agrega. Varejo + atacado do mesmo produto agregam para o recálculo de faixa.
- Quantidade 0 ou negativa sai da linha. `NaN` e quantidade não positiva em `adicionarItem` não entram.
- Desconto de gerente dentro do teto grava token e total. Acima do teto corta. Zero zera o token.
- `limparCarrinho` zera itens, dono, loja e chave (finalizar e cancelar usam esse caminho).

O caixa web calcula o desconto de gerente com `aplicarDescontoGerenteSobreTotal` (a mesma política do store). Os 50 testes de finalização, saldo e contrato v4 passaram neste gate.

## 7. ESLint do shared-core

O pacote `shared-core` não tem `.eslintrc` nem script `lint`. A tentativa anterior, a partir de `pdv-importados` com caminho `../shared-core/...` e sem `-c`, caiu no parser padrão e acusou `Unexpected token as` / `PricingContext`. Isso é arquivo fora da raiz do ESLint, não defeito do fonte.

Neste gate o mesmo arquivo foi lintado com o config que o web já usa, sem desligar regra:

`npx eslint --no-ignore -c .eslintrc.json --resolve-plugins-relative-to .`

Alvos: `unifiedCartStore.ts`, `unifiedCartStore.spec.ts`, `CaixaCarrinhoAuthSync.tsx`, `carrinhoIsolamento.behavior.test.ts`, `carrinhoStore.behavior.test.ts`. Exit 0.

## 8. Riscos residuais

- Ensaio manual no navegador não foi feito. Um bug só de ordem entre `onAuthStateChange` e a tela não aparece no teste de store.
- Cupom antigo no `localStorage` sem dono é descartado no próximo login web. Efeito desejado, uma vez.
- Os 4 erros de `App.tsx` seguem fora do typecheck oficial.
- Os 4 testes fiscais seguem vermelhos neste Postgres local até o JWT de teste autenticar como o gerente semeado.
- `npm install` deste gate só materializou pacotes já pinados (fontes web; o desktop tinha sido instalado na sprint). Lockfile intacto. Não commitado porque não houve mudança de manifesto.

## 9. Decisão

**GO para abrir o PR. NO-GO para merge.**

Os gates automáticos do carrinho passaram: testes de store, checkout e pagamento, typecheck do `shared-core`, typecheck oficial do desktop, ESLint com o config certo, e o build Next após restaurar dependências já declaradas. Os quatro erros de `App.tsx` e os quatro testes fiscais não vêm deste diff.

O merge espera revisão e o ensaio manual ainda pendente: operador A bipa, recarrega, operador B no mesmo navegador não vê o cupom; a primeira loja não apaga a venda; a troca de loja apaga. Sem essa passagem na tela, o PR não deve ser mergeado.
