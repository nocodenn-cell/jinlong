# PALM V1 — pedidos assistidos

Módulo no Next.js existente (`pdv-importados`), branch `cursor/palm-v1-pedidos-assistidos-6e92`.

Não houve deploy, merge, PR, alteração de Supabase remoto nem aplicação destas migrations no projeto compartilhado com jinlong.app. A integração Focus NFe e as migrations fiscais da GO-LIVE 02 não foram editadas.

## O que entrou

- `/palm/vendas` e `/palm/estoque`, online, em português e chinês.
- Pedido assistido em `vendas_em_espera` com `origem = PALM`. A espera tradicional continua `origem = CAIXA`.
- Preço só pela RPC `calcular_preco_produto`. O celular não envia preço.
- Estoque no celular é leitura. O envio com saldo insuficiente não grava o pedido e não mexe em `estoque`. A baixa segue apenas em `finalizar_venda_transacional_canonica_v4`, depois que o caixa assume e finaliza.
- Idempotência por `client_request_id`. Um operador assume; o segundo recebe `pedido_ja_assumido`.
- Seção isolada no PDV (`PalmPedidosCaixaSection` + `usePalmPedidosCaixa`). Assumir preenche o cupom, marca a origem e reprecifica pelo contrato do caixa. Finalizar e abandonar usam o fluxo que já existia.

## Perfil

Não foi criado perfil `VENDEDOR` (decisão em aberto, fora deste módulo). Quem usa o PALM é o perfil já autenticado da loja da sessão: `OPERADOR`, `GERENTE`, `DONO` ou `ADMIN`. A loja não vem do cliente.

## Câmera

`BarcodeDetector` quando o aparelho oferece. Senão, `@zxing/browser@0.1.5` com `@zxing/library@0.21.3`, carregado só ao abrir a câmera. A série 0.2.x pede `@zxing/library` com Node `>= 24`; este repositório declara Node `>= 20 < 25` e o ambiente local é Node 22. Leituras repetidas do mesmo código são ignoradas por 1500 ms. Permissão negada e aparelho sem leitor caem na busca manual.

Câmera em aparelho físico: não executada.

## Migrations

Criadas, não aplicadas em nenhum projeto remoto:

- `backend/supabase/migrations/20261012150000_palm_v1_isolamento_preco_sessao.sql`
- `backend/supabase/migrations/20261012150100_palm_v1_pedidos_assistidos.sql`

Aplicação local: só no Postgres isolado do teste (PGlite 0.3.14, PostgreSQL 17.5), via `node --test scripts/palm-v1-pedidos.integration.test.mjs`. O rollback manual está no cabeçalho da segunda migration. `ENABLE ROW LEVEL SECURITY` foi incluído porque `FORCE` sozinho não liga a RLS.

## Testes executados nesta entrega

Aprovados:

- `npm run typecheck -w pdv-importados` — exit 0
- `npx eslint` nos arquivos do PALM e do caixa tocados — exit 0
- Vitest direcionado (30 testes, 8 arquivos) — exit 0, incluindo paridade PT/ZH, política de `/palm`, regressão da espera do caixa e render das views
- `node scripts/pricing-rpc-guard.mjs` — OK
- `npm run check:entity-ssot -w pdv-importados` — OK
- Integração PGlite — 1 teste, 0 falhas. Cobre preço da sessão, loja alheia, usuário inativo, RLS, idempotência, estoque que não baixa, espera tradicional, segundo operador e auditoria

Não executados (não contam como aprovados):

- Corrida simultânea em duas conexões. O PGlite deste teste usa uma sessão. O segundo claim depois do commit foi rejeitado.
- Navegador autenticado em 360, 390, 430, 768 e 1024 px. Não há `.env.local` e o app não foi ligado a Supabase remoto.
- Câmera e aparelho físico.
- Suíte Vitest completa do monorepo.

## Validação manual

1. Aplicar as duas migrations somente num banco de homologação que não seja o projeto de jinlong.app.
2. Entrar como operador da loja A em `/palm/vendas`. Buscar um produto, conferir varejo, atacado e mínimo, montar o pedido e enviar.
3. Repetir o envio com a mesma aba: não pode nascer um segundo pedido.
4. No `/caixa` da mesma loja, assumir o pedido, ver o aviso se o preço mudou, e finalizar pelo botão oficial.
5. Confirmar no kardex que o saldo baixou uma vez.
6. Com outro operador da mesma loja, o pedido já assumido não pode ser assumido de novo.
7. Operador da loja B não vê o pedido.
8. Em `/palm/estoque`, o saldo aparece como texto. Não há campo para editá-lo.
9. Trocar o idioma para chinês e repetir a leitura das duas telas.

## Recomendação

GO CONDICIONAL para homologação isolada. NO-GO para produção e para o projeto Supabase compartilhado com jinlong.app.

A próxima ação menor é aplicar as migrations nesse banco isolado e percorrer o roteiro acima com um celular real.
