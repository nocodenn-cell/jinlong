# WRITE PATHS MAP — Grafo de Autoridade de Escrita (Tabelas Críticas)

> **Natureza:** observação / *debug* apenas. Este documento **NÃO participa do
> enforcement** e **não é lido pelo CI**. Quem decide passagem de CI é o scanner
> `scripts/authority-guard.mjs` rodando sobre o **código vivo** (*code-as-truth*).
> Se este mapa divergir do código, **o código vence**.

## Definição do artefato

- Este mapa é um **snapshot best-effort e verificável por máquina** — nunca uma
  "fonte de verdade parcial".
- **Origem do dado:** as linhas `confirmed` são geradas pelo scanner
  (`node scripts/authority-guard.mjs --report`); as `suspected` vêm de análise de
  indireção/inspeção e ainda não são confirmadas como write direto.
- Cada linha carrega: **origem**, **tipo/autoridade**, **domínio**, **confidence**.

**Last verified by scan:** `2026-07-01` · fonte: `node scripts/authority-guard.mjs --report`

**Tabelas críticas:** `caixas`, `movimentos_caixa`, `estoque`, `clientes`, `fornecedores`.

## Modelo — Write Authority Graph (norte evolutivo)

O sistema deixa de raciocinar como "detecção de inserts" e passa a classificar
cada escrita num **grafo de autoridade**. Eixos de classificação (emitidos pelo
`--report`):

- **origem**: `client` · `rpc` · `worker` · `trigger` (SQL, ainda não varrido).
- **domínio**: Caixa · Estoque · Cadastros · Fiscal.
- **autoridade**: `direct` (write direto no código) · `indirect` (via função que
  encapsula o write — indireção nível 1) · `async` (worker/edge/fila) ·
  `rpc-allowed` (caminho permitido — **NÃO trusted**).
- **confidence**: `confirmed` (scanner) · `suspected` (indireção/inspeção).

> **RPC não é trusted.** Uma RPC é apenas um *allowed path* estrutural; pode
> falhar logicamente mesmo sendo permitida. A atribuição de RPC serve para
> observabilidade e futuras regras de single-caller — nunca confere confiança.

---

## Caixa — `caixas`, `movimentos_caixa`

Estado: **dois escritores** para `caixas` (colapsar em `abrir_caixa_atomicamente`
na Fase 1). `movimentos_caixa` **não tem write direto** e é **hard-fail** no guard
(domínio financeiro não tolera fail-soft permanente).

| origem | autoridade | confidence | domínio | nota |
|---|---|---|---|---|
| `pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts:103` (`abrirCaixaOperadorImpl`) | direct `caixas.insert` | confirmed | Caixa | read-then-insert, **sem lock transacional** |
| `backend/supabase/functions/sync-outbox/index.ts:459` (`ensureCaixaAberto`) | async `caixas.insert` | confirmed | Caixa | writer paralelo (worker) |
| `backend/supabase/functions/sync-outbox/index.ts:525` | async `caixas.update` | confirmed | Caixa | status via worker |
| `pdv-importados/app/caixa/actions.ts:129` | indirect via `abrirCaixaOperadorImpl()` | suspected | Caixa | chamador (indireção nível 1) |
| `pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts:143` | rpc-allowed `fechar_caixa_atomico` | confirmed | Caixa | fechamento atômico (não trusted) |
| `movimentos_caixa` (qualquer origem) | — | confirmed (ausência) | Caixa | zero write direto; **hard-fail** |

## Estoque — `estoque`

RPCs canônicas existem, mas restam writes diretos + indiretos via repositório
(objetivo Fase 2: zero write direto + constraint `quantidade >= 0`).

| origem | autoridade | confidence | domínio | nota |
|---|---|---|---|---|
| `pdv-importados/app/gerente/estoque/actions.ts:87` | direct `estoque.insert` | confirmed | Estoque | criação de linha |
| `pdv-importados/lib/adapters/supabase/produtoRepository.ts:79` | direct `estoque.insert` | confirmed | Estoque | estoque inicial (repo) |
| `pdv-importados/app/gerente/produtos/actions.ts:640` | direct `estoque.delete` | confirmed | Estoque | remoção junto ao produto |
| `pdv-importados/app/gerente/produtos/actions.ts` (L122/227/460/486/508/682) | indirect via `createProdutoRepository()` | suspected | Estoque | callers do repo (indireção nível 1) |
| `pdv-importados/app/gerente/estoque/actions.ts:52` | rpc-allowed `ajustar_estoque_manual` | confirmed | Estoque | ajuste (não trusted) |
| `backend/supabase/functions/sync-outbox/index.ts:611` | rpc-allowed `decrementar_estoque_seguro` | confirmed | Estoque | baixa canônica (não trusted) |

## Cadastros — `clientes`, `fornecedores`

`clientes` tem **writer duplicado** (`criarCliente` + CRUD direto). Objetivo Fase 4:
1 writer lógico por entidade; NFe via camada de domínio.

| origem | autoridade | confidence | domínio | nota |
|---|---|---|---|---|
| `pdv-importados/app/gerente/financeiro/actions.ts:34` (`criarCliente`) | direct `clientes.insert` | confirmed | Cadastros | writer A |
| `pdv-importados/app/gerente/clientes/actions.ts:152/172/242/260` | direct `clientes.update/insert/delete` | confirmed | Cadastros | writer B (CRUD) |
| `pdv-importados/app/gerente/fornecedores/actions.ts:140/147/191/213/247` | direct `fornecedores.update/insert/delete` | confirmed | Cadastros | CRUD |
| `.../FinanceiroGerentePageClient.tsx:197`, `.../ClienteEditarModal.tsx:150`, `.../ClientesListClient.tsx:145` | indirect via `criarCliente()` / `salvarClienteAction()` / `excluirClienteAction()` | suspected | Cadastros | chamadores (indireção nível 1) |
| `.../FornecedorEditarModal.tsx:163`, `.../FornecedoresListClient.tsx:157/187/202` | indirect via `salvar/excluir/bulk*FornecedorAction()` | suspected | Cadastros | chamadores (indireção nível 1) |

## NFe / Fiscal

Contido: NFe via RPC; enfileiramento fiscal por `sync-outbox`, consumidor único
`fiscal-worker` (Fase 5: guard leve garantindo *single worker model*).

| origem | autoridade | confidence | domínio | nota |
|---|---|---|---|---|
| `pdv-importados/app/gerente/estoque/importar-nfe/actions.ts:282` | rpc-allowed `importar_nfe_transacao` | confirmed | Cadastros/Fiscal | não escreve tabelas finais direto |
| `backend/supabase/functions/fiscal-worker/index.ts` | async worker | suspected | Fiscal | consumidor único de documentos fiscais |

## Auth / RLS (registrado apenas — Fase 3)

Fonte de verdade escolhida: **SQL RLS canônica** (implementar na Fase 3).

| origem | tipo | confidence | domínio | nota |
|---|---|---|---|---|
| RLS `perfil IN ('GERENTE','DONO','ADMIN')` inline (ex.: `backend/supabase/migrations/045_*.sql`) | policy | suspected | Auth | sem `fn_usuario_tem_perfil_gerencial()` única |
| `pdv-importados/lib/auth/painelGerencial.ts`, `.../lib/admin/context/adminContext.ts` | TS | suspected | Auth | espelho a virar mirror verificado por teste |

---

## Gaps conhecidos (incompletude explícita)

O guard, não este mapa, é a rede de segurança: qualquer novo write direto quebra o
CI mesmo sem constar aqui. A detecção é *code-as-truth* e propositalmente
over-inclusiva; falsos positivos resolvem-se por grandfather/refino, nunca
enfraquecendo para match literal.

- **Indireção > nível 1** (service → service → service → db) ainda não é coberta; hoje resolvemos nível 1 (função que encapsula o write → chamadores).
- **Triggers/functions SQL** com side effects de escrita não são varridos pelo scanner de código TS (varredura SQL fica para iteração futura — eixo `trigger` do grafo).
- Wrappers com nomes muito genéricos (≤ 3 chars) são ignorados na derivação de write-functions para evitar ruído.
