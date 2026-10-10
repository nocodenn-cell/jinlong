# Relatório — correção do carrinho (2026-10-10)

Branch: `sprint/correcao-carrinho-20261010`  
Base: `sprint/go-live-01` @ `64a0f5b1`  
Ambiente: local. Sem Supabase remoto, sem migration, sem deploy, sem merge.

## 1. Problemas reproduzidos

| Evidência | Resultado nesta sessão |
|---|---|
| Suíte web do carrinho (`carrinhoStore.behavior.test.ts`) | **16/16 verdes antes de qualquer correção.** O relato “110 aprovados, 12 reprovados” não apareceu nesta suíte. |
| Spec de idempotência `unifiedCartStore.spec.ts` | **Não era coletada** pelo Vitest web. O `include` só pega `../shared-core/src/**/*.test.ts`, e o arquivo pedia `@vitest-environment jsdom` sem o pacote `jsdom` no web. |
| Testes desktop do carrinho | **Bloqueados** antes da correção: `Cannot find module '@vitejs/plugin-react-swc'`. `@tauri-apps/api` e `@sentry/browser` também estavam ausentes em `node_modules`, embora constem do `package.json` / lockfile. |
| Typecheck oficial do desktop (`tsconfig.typecheck.json`) | **5 erros**, todos de módulo ausente (`@tauri-apps/api/core` ×3, `@sentry/browser`, `scope` implícito `any` em `sentry.ts`). Os “17 erros” não se repetiram. |
| Adoção de cupom sem dono | **Confirmada no código**, não por teste vermelho. `setCartOwnerForSession` com `cartOwnerUserId === null` carimbava o próximo operador e **mantinha os itens**. O teste legado exige isso para cupom ainda em memória; o buraco é a reidratação do `localStorage`. |
| Loja fora do contexto | **Confirmada.** O store persistia só `cartOwnerUserId`. Troca de loja não descartava itens. O desktop não chamava vínculo nenhum. |
| Agregação só por `produtoId` | **Confirmada.** `mergeItemByProdutoId` somava qualquer linha do mesmo produto, inclusive desconto manual diferente. VAREJO+ATACADO do mesmo produto **deve** continuar somando, porque o recálculo de faixa depende disso. |
| Quantidade ≤ 0 | Já removia a linha (web e store). Quantidade não finita (`NaN`) **não** caía nesse ramo (`NaN <= 0` é falso) e podia gravar quantidade inválida. |
| Métodos de desconto de gerente no desktop | **Não faltam.** `pdv-local/src/stores/cartStore.ts` reexporta o store único, que já tem `aplicarDescontoGerente` e `setMaxDescontoGerentePercentual`. O desktop não chegava a executar o teste. |

A suíte web inteira, depois das correções: **2350 aprovados, 4 reprovados, 1 skipped** (374 arquivos). As 4 falhas são `produtosFiscalEdicao.integration.test.ts` (RPC real, lista vazia no Postgres local). Não tocam o carrinho.

Desktop inteiro, depois de instalar as dependências já declaradas: **63/63**.

## 2. Problemas descartados

- **Dois stores divergentes em runtime.** `pdv-importados/stores/carrinhoStore.ts` e `pdv-local/src/stores/cartStore.ts` são reexports de `shared-core/src/stores/unifiedCartStore.ts`. Não há segunda implementação de totais. A matemática de gerente continua em `shared-core/src/managerDiscount/policy.ts` (`aplicarDescontoGerenteSobreTotal`). O caixa web aplica essa função sobre estado React (token de gerente não sobrevive a F5); o desktop grava no store. Unificar os dois lugares seria refatoração do `CaixaPageClient`, fora do que quebrou.
- **Exigir token dentro do store para “desconto não autorizado”.** O teto já é `clampPercentualDesconto`. A senha/token é da UI (desktop exige `validar_gerente_sync_cmd`) e do servidor na finalização. Obrigar token no store quebraria os testes de teto e criaria um segundo portão de autorização.
- **Apagar o cupom em memória só porque o dono ainda é `null`.** O scan chama `setCartOwnerForSession` e em seguida adiciona o item. Reivindicar esse cupom na mesma sessão é o comportamento legado correto. O descarte vale para a **reidratação** sem dono.
- **Os 12 testes vermelhos e os 17 erros de TypeScript do relato.** Não reproduzidos neste HEAD. Não foram “corrigidos” por falta de evidência.
- **Alterar só o identificador do dono.** Rejeitado. Dono diferente zera itens; loja diferente também; cupom reidratado sem dono não é adotado.

## 3. Causa raiz

1. **Vazamento entre operadores.** `setCartOwnerForSession` tratava “sem dono” como cupom legado e só trocava o id. Um `localStorage` com itens e `cartOwnerUserId: null` (sessão anterior ao carimbo, ou limpeza incompleta) era entregue ao próximo login.
2. **Vazamento entre lojas.** Não existia `cartLojaId`. O mesmo operador, ou o desktop ao sincronizar outro `loja_id`, continuava com os itens da loja anterior. A chave de idempotência da venda iria junto.
3. **Agregação cega.** A chave era só `produtoId`. Desconto manual ou promoção com preço diferente era absorvido pela linha já existente (a quantidade subia e o preço da primeira linha valia para as unidades novas).
4. **Quantidade não finita.** O guarda era só `quantidade <= 0`.
5. **Infra de teste.** Dependências do workspace `pdv-local` não estavam instaladas; a spec de idempotência estava fora do `include` e marcada como `jsdom`; `cartStore.test.ts` importava `ItemCarrinhoComPreco` como valor, mas o módulo só faz `export { type ... }`.

## 4. Arquivos alterados

- `shared-core/src/stores/unifiedCartStore.ts`
- `pdv-importados/app/caixa/CaixaCarrinhoAuthSync.tsx`
- `pdv-importados/app/caixa/carrinhoIsolamento.behavior.test.ts` (novo)
- `pdv-importados/app/caixa/carrinhoStore.behavior.test.ts`
- `pdv-importados/vitest.config.ts`
- `pdv-local/src/App.tsx`
- `pdv-local/src/stores/cartStore.behavior.test.ts`
- `pdv-local/src/stores/cartStore.isolation.test.ts` (novo)
- `pdv-local/src/stores/cartStore.test.ts`
- `pdv-local/package.json` (cobertura deixa de ignorar os testes do carrinho)
- `shared-core/src/stores/unifiedCartStore.spec.ts` (só o cabeçalho de ambiente)

## 5. Justificativa arquitetural

O store único permanece a fonte do cupom. A política de gerente não foi duplicada.

O vínculo de sessão agora tem duas chaves persistidas: operador e loja.

- Logout (`userId === null`) zera o cupom, como antes.
- Operador diferente zera itens, totais e a chave de idempotência, e grava o novo dono. Não reatribui os itens.
- Reidratação com itens e sem dono arma um sinal consumido no próximo `setCartOwnerForSession`. O próximo operador não herda o cupom. Na mesma execução, sem esse sinal, o carimbo ainda preserva o que o operador acabou de bipar.
- Loja `null` ou ausente não dispara troca (a leitura da loja pode falhar; o cupom não cai por isso). A primeira loja conhecida só carimba. Loja diferente zera itens e a chave de idempotência, e mantém o operador.
- O caixa web aplica o operador na hora e a loja em seguida (`usuarios.loja_id`, com o mesmo fallback `LOJA_MATRIZ_ID` do servidor). Uma resposta atrasada de outro login é ignorada. O desktop chama `setCartLojaForSession` quando o catálogo traz `loja_id`. O desktop não tem operador; por isso não chama `setCartOwnerForSession` e **não** apaga a recuperação de queda de energia.
- Agregação: duas linhas automáticas (`VAREJO`/`ATACADO`) do mesmo produto e das mesmas variantes continuam uma linha só, para o recálculo de atacado. `MANUAL`/`PROMOCAO` só entram na mesma linha se tipo e preço unitário coincidirem.

## 6. Testes antes / depois

Antes (sem editar código de produção):

- Web `carrinhoStore.behavior.test.ts`: 16/16.
- Spec de idempotência: não executada pelo runner web.
- Desktop: startup error, módulo `@vitejs/plugin-react-swc` ausente.
- `tsc -p pdv-local/tsconfig.typecheck.json`: 5 erros de módulo ausente.

Depois (`npm install -w pdv-local`, lockfile inalterado):

- Web carrinho (behavior + isolamento + spec): **38/38**.
- Desktop carrinho (totais + behavior + isolamento): **11/11**.
- Desktop completo: **63/63**.
- `finalizarVendaValidation`, `caixaPagamentoSaldo`, `contrato-finalizar-venda-v4`: **50/50**.
- `recalcularPrecoItemLocal`: incluído nos 10 testes do lote desktop de preço + isolamento, verde.
- `shared-core` typecheck: verde.
- Typecheck oficial do desktop: verde.
- Web completo: **2350 passou / 4 falhou / 1 skipped**. As 4 falhas são a integração fiscal de produto contra Postgres local, anterior a este trabalho.
- Lint dos arquivos web alterados: sem achado. ESLint do pacote web não parseia `shared-core` (erro de parser pré-existente ao apontar o config para fora do pacote).
- Build Next: **não executado.** A mudança é store + um client component já coberto por typecheck do `shared-core` e pelos testes acima.

## 7. Erros remanescentes

- `npx tsc -p pdv-local/tsconfig.json` (inclui `App.tsx`, que o script oficial **exclui**): 4 erros pré-existentes.
  - `App.tsx(157)`: `ItemCarrinho[]` do store ( `resultado` opcional ) não cabe em `ItemVenda[]`.
  - `App.tsx(776, 780, 783)`: `item.resultado` possivelmente `undefined`.
- `produtosFiscalEdicao.integration.test.ts`: 4 falhas por lista vazia no Postgres local. Fora do carrinho.
- Ensaio manual no navegador com dois logins reais **não foi feito** nesta sessão (sem sessão de homologação aberta).

## 8. Riscos de regressão

- Cupom antigo no `localStorage` **sem** `cartOwnerUserId` e com itens é descartado no próximo login web. É o efeito de segurança. Quem estava no meio de uma venda nesse formato perde o cupom uma vez. Cupom com dono igual ao login continua.
- A primeira vez que a loja é gravada no cupom não apaga a venda. A partir daí, mudar `loja_id` apaga. Um operador movido de loja no cadastro perde o cupom local — correto para não vender item da loja A na loja B.
- Falha ao ler `usuarios.loja_id` não troca a loja e não apaga o cupom. Se a leitura falhar sempre, o isolamento de loja no web não arma até a próxima leitura bem-sucedida. O isolamento de operador continua.
- Linha `MANUAL` deixa de absorver um novo bip do mesmo produto. O operador vê duas linhas. O atacado automático não muda: varejo + atacado do mesmo produto ainda somam, e o caixa segue reprecificando.
- `limparCarrinho` zera também `cartLojaId`. O próximo `setCartOwnerForSession` da sessão regrava a loja sem apagar itens incluídos depois da limpeza.

## 9. Commits

| SHA | Mensagem |
|---|---|
| `05e8258a` | `fix(carrinho): isola operador e loja e nao agrega desconto incompativel` |
| `613641d3` | `fix(carrinho): aplica a loja da sessao no caixa web e no desktop` |
| `ca634ff3` | `test(carrinho): recoloca a spec de idempotencia no runner web` |
| `01885d4e` | `docs(auditoria): registra a correcao do carrinho e a cobertura desktop` |

Não houve push nem merge.

## 10. Decisão para a sprint de performance

**GO condicional.**

O contrato do carrinho que estava frouxo (dono, loja, reidratação sem dono, agregação com desconto diferente, quantidade não finita, runner desktop) está coberto por teste e não precisa bloquear performance em catálogo, lista ou render.

**Não otimizar** `unifiedCartStore`, a hidratação do Zustand nem `CaixaCarrinhoAuthSync` até um ensaio manual: operador A bipa, recarrega, operador B entra no mesmo navegador e não vê os itens; em seguida a mesma sessão muda a loja e o cupom some. Sem esse ensaio, um cache ou um `skipHydration` novo pode reabrir o vazamento.

Os 4 testes fiscais de integração e os 4 erros de `App.tsx` fora do typecheck oficial não são desta correção e não justificam segurar o resto da sprint.
