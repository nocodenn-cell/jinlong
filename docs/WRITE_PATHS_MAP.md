# WRITE PATHS MAP — Tabelas Críticas do ERP

> **Natureza deste documento:** observação / *discovery* apenas. Ele **não
> carrega política** e **não é consumido pelo CI**. O enforcement vive em
> `scripts/authority-guard.mjs`. Aqui só registramos *o que existe*.
>
> **Definição:** este mapa é um **snapshot best-effort e verificável por
> máquina** — não "incompleto por design". As linhas `confirmed` são
> reproduzíveis pelo scanner; as `suspected` foram encontradas por
> inspeção/grep e ainda não confirmadas pelo scanner.

**Last verified by scan:** `2026-07-01` via `node scripts/authority-guard.mjs --report`

**Tabelas críticas:** `caixas`, `movimentos_caixa`, `estoque`, `clientes`, `fornecedores`.

**Legenda**
- **tipo**: `direct-DB` (`.from(tabela).insert/update/upsert/delete`) · `RPC` (caminho sancionado) · `async-worker` (edge function / fila).
- **confidence**: `confirmed` (detectado pelo scanner) · `suspected` (inferido, não confirmado pelo scanner).
- **snapshot**: `frozen` = já consta na ALLOWLIST do guard (bypass tolerado até a fase de correção) · `sancionado` = RPC, caminho correto.

---

## Caixa — `caixas`, `movimentos_caixa`

Estado atual: **dois escritores independentes** abrem/atualizam `caixas`
(objetivo da Fase 1 é colapsar em um único writer via `abrir_caixa_atomicamente`).
`movimentos_caixa` não tem write direto detectado — hoje é RPC-only.

| origem | tipo | confidence | snapshot | domínio | nota |
|---|---|---|---|---|---|
| `pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts:103` (`abrirCaixaOperadorImpl`) | direct-DB `caixas.insert` | confirmed | frozen | Caixa | read-then-insert, **sem lock transacional** |
| `backend/supabase/functions/sync-outbox/index.ts:459` (`ensureCaixaAberto`) | direct-DB `caixas.insert` | confirmed | frozen | Caixa | writer paralelo (offline→sync) |
| `backend/supabase/functions/sync-outbox/index.ts:525` | direct-DB `caixas.update` | confirmed | frozen | Caixa | atualização de status |
| `pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts:143` | RPC `fechar_caixa_atomico` | confirmed | sancionado | Caixa | fechamento já é atômico |
| `movimentos_caixa` (qualquer origem) | — | confirmed (ausência) | — | Caixa | nenhum write direto; RPC-only. Guard em **modo soft/warn** para absorver site não mapeado |

## Estoque — `estoque`

RPCs canônicas já existem (`decrementar_estoque_seguro`, `ajustar_estoque_manual`,
`transferencia_segura`), mas restam writes diretos (objetivo da Fase 2: zero write
direto + constraint `quantidade >= 0`).

| origem | tipo | confidence | snapshot | domínio | nota |
|---|---|---|---|---|---|
| `pdv-importados/app/gerente/estoque/actions.ts:87` | direct-DB `estoque.insert` | confirmed | frozen | Estoque | criação de linha de estoque |
| `pdv-importados/lib/adapters/supabase/produtoRepository.ts:79` | direct-DB `estoque.insert` | confirmed | frozen | Estoque | estoque inicial na criação de produto |
| `pdv-importados/app/gerente/produtos/actions.ts:640` | direct-DB `estoque.delete` | confirmed | frozen | Estoque | remoção junto com produto |
| `pdv-importados/app/gerente/estoque/actions.ts:52` | RPC `ajustar_estoque_manual` | confirmed | sancionado | Estoque | ajuste manual correto |
| `backend/supabase/functions/sync-outbox/index.ts:611` | RPC `decrementar_estoque_seguro` | confirmed | sancionado | Estoque | baixa canônica (FOR UPDATE + version) |

## Cadastros — `clientes`, `fornecedores`

`clientes` tem **writer duplicado** (`criarCliente` no financeiro + CRUD direto em
`clientes/actions.ts`). Objetivo da Fase 4: 1 writer lógico por entidade.

| origem | tipo | confidence | snapshot | domínio | nota |
|---|---|---|---|---|---|
| `pdv-importados/app/gerente/financeiro/actions.ts:34` (`criarCliente`) | direct-DB `clientes.insert` | confirmed | frozen | Cadastros | writer A |
| `pdv-importados/app/gerente/clientes/actions.ts:152` | direct-DB `clientes.update` | confirmed | frozen | Cadastros | writer B (CRUD) |
| `pdv-importados/app/gerente/clientes/actions.ts:172` | direct-DB `clientes.insert` | confirmed | frozen | Cadastros | writer B (CRUD) |
| `pdv-importados/app/gerente/clientes/actions.ts:242` | direct-DB `clientes.update` | confirmed | frozen | Cadastros | writer B (CRUD) |
| `pdv-importados/app/gerente/clientes/actions.ts:260` | direct-DB `clientes.delete` | confirmed | frozen | Cadastros | writer B (CRUD) |
| `pdv-importados/app/gerente/fornecedores/actions.ts:140/147/191/213/247` | direct-DB `fornecedores.update/insert/delete` | confirmed | frozen | Cadastros | CRUD direto |
| `pdv-importados/app/gerente/financeiro/FinanceiroGerentePageClient.tsx:197` | wrapper-call `criarCliente()` | suspected | — | Cadastros | chamador do wrapper (indireto) |

## NFe / Fiscal

Já contido: importação de NFe roteada por RPC; enfileiramento fiscal via
`sync-outbox`, com **consumidor único** `fiscal-worker`. Objetivo da Fase 5:
guard leve garantindo *single worker model* (nenhuma nova origem de escrita fiscal).

| origem | tipo | confidence | snapshot | domínio | nota |
|---|---|---|---|---|---|
| `pdv-importados/app/gerente/estoque/importar-nfe/actions.ts:282` | RPC `importar_nfe_transacao` | confirmed | sancionado | Cadastros/Fiscal | NFe não escreve tabelas finais direto |
| `backend/supabase/functions/fiscal-worker/index.ts` | async-worker | suspected | — | Fiscal | consumidor único de documentos fiscais |

## Auth / RLS (registrado apenas — Fase 3)

Divergência entre TS e SQL para autorização de perfil. Fonte de verdade
**escolhida: SQL RLS canônica** (a implementar na Fase 3, não nesta iteração).

| origem | tipo | confidence | domínio | nota |
|---|---|---|---|---|
| RLS: `perfil IN ('GERENTE','DONO','ADMIN')` inline em várias policies (ex.: `backend/supabase/migrations/045_caixa_movimentacoes_transacionais.sql`) | policy | suspected | Auth | não há `fn_usuario_tem_perfil_gerencial()` única |
| `pdv-importados/lib/auth/painelGerencial.ts`, `pdv-importados/lib/admin/context/adminContext.ts` | TS | suspected | Auth | espelho da regra em TS (a virar mirror verificado por teste) |

---

## Gaps conhecidos / suspeitos (incompletude explícita)

Este mapa é *best-effort*. O guard, não este arquivo, é a rede de segurança:
qualquer novo write direto quebra o CI mesmo que não esteja listado aqui.

- Writes escondidos atrás de mais de uma camada de indireção (helpers/repos além dos `WRITE_WRAPPERS` conhecidos) podem não aparecer como `confirmed`.
- Triggers/functions SQL com *side effects* de escrita em tabelas críticas não são varridos pelo scanner de código TS (varredura SQL fica para iteração futura).
- `movimentos_caixa` está em modo **soft** no guard: se um site pré-existente não mapeado surgir, ele gera *warning* (não quebra) até um ciclo limpo confirmar zero avisos.
