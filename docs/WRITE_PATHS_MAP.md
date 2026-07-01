# WRITE PATHS MAP — Writes Diretos em Tabelas Críticas

> **Natureza:** documentação de discovery, mantida à mão (best-effort). **Não é
> lida pelo CI** e **não participa do enforcement**. O enforcement é o guard
> `scripts/authority-guard.mjs` (detector literal + allowlist estática). Este
> arquivo apenas lista, para leitura humana, os writes diretos conhecidos.

**Tabelas críticas:** `caixas`, `movimentos_caixa`, `estoque`, `clientes`, `fornecedores`.

**Como o guard funciona (resumo):** procura `.from('<tabela crítica>')` seguido de
`.insert/.update/.upsert/.delete` nos diretórios de produção (`pdv-importados/`,
`backend/supabase/functions/`). Um match que não esteja na `ALLOWLIST` estática
quebra o CI. Nada além disso — sem análise de alias, indireção ou classificação.

---

## Writes diretos conhecidos (todos na allowlist do guard)

| arquivo:linha | tabela · operação | domínio | fase de remoção |
|---|---|---|---|
| `pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts:103` | `caixas.insert` | Caixa | Fase 1 |
| `backend/supabase/functions/sync-outbox/index.ts:459` | `caixas.insert` | Caixa | Fase 1 |
| `backend/supabase/functions/sync-outbox/index.ts:525` | `caixas.update` | Caixa | Fase 1 |
| `pdv-importados/app/gerente/estoque/actions.ts:87` | `estoque.insert` | Estoque | Fase 2 |
| `pdv-importados/lib/adapters/supabase/produtoRepository.ts:79` | `estoque.insert` | Estoque | Fase 2 |
| `pdv-importados/app/gerente/produtos/actions.ts:640` | `estoque.delete` | Estoque | Fase 2 |
| `pdv-importados/app/gerente/clientes/actions.ts:152` | `clientes.update` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/clientes/actions.ts:172` | `clientes.insert` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/clientes/actions.ts:242` | `clientes.update` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/clientes/actions.ts:260` | `clientes.delete` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/financeiro/actions.ts:34` | `clientes.insert` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/fornecedores/actions.ts:140` | `fornecedores.update` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/fornecedores/actions.ts:147` | `fornecedores.insert` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/fornecedores/actions.ts:191` | `fornecedores.delete` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/fornecedores/actions.ts:213` | `fornecedores.update` | Cadastros | Fase 4 |
| `pdv-importados/app/gerente/fornecedores/actions.ts:247` | `fornecedores.delete` | Cadastros | Fase 4 |

`movimentos_caixa`: nenhum write direto conhecido. Não está na allowlist — qualquer
write direto futuro quebra o CI.

## Observações (fora do enforcement)

- Esta lista é best-effort e mantida manualmente; a rede de segurança é o guard,
  que quebra o CI para qualquer novo write direto mesmo que não conste aqui.
- Writes escondidos atrás de camadas de indireção (helpers/repositórios) **não**
  são detectados nesta fase — o guard é intencionalmente literal e simples.
- Triggers/functions SQL com side effects de escrita não são varridos (só código TS).
- Autorização (RLS TS vs SQL) e as correções por domínio (RPC única de caixa,
  constraint `quantidade >= 0`, dedupe de `criarCliente`, etc.) são fases futuras,
  fora do escopo desta iteração.
