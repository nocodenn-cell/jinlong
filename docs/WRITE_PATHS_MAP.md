# WRITE PATHS MAP — Writes Diretos em Tabelas Críticas

> **Natureza:** documentação de discovery, mantida à mão (best-effort). **Não é
> lida pelo CI** e **não participa do enforcement**. O enforcement é o guard
> `scripts/authority-guard.mjs` (detector literal + allowlist estática). Este
> arquivo lista, para leitura humana, os writes diretos conhecidos no snapshot
> atual de `recovery/consolidacao`.

**Tabelas críticas:** `caixas`, `movimentos_caixa`, `estoque`, `clientes`, `fornecedores`.

**Como o guard funciona (resumo):** procura `.from('<tabela crítica>')` seguido de
`.insert/.update/.upsert/.delete` em `pdv-importados/` e `backend/supabase/functions/`.
Um match fora da `ALLOWLIST` quebra o CI (`guard:all`). Detector literal — não cobre
helpers indiretos, repositórios genéricos nem triggers SQL.

---

## Writes diretos conhecidos (snapshot recovery — todos na allowlist)

| arquivo:linha | tabela · operação | domínio | notas |
|---|---|---|---|
| `pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts:103` | `caixas.insert` | Caixa web | Abertura de caixa pelo operador |
| `backend/supabase/functions/sync-outbox/index.ts:500` | `caixas.insert` | Sync PDV local | Materializa caixa por id do evento outbox |
| `pdv-importados/lib/adapters/supabase/produtoRepository.ts:79` | `estoque.insert` | Produtos | Linha inicial ao criar produto |
| `pdv-importados/app/gerente/estoque/actions.ts:87` | `estoque.insert` | Estoque | Garantir linha de estoque para produto |
| `pdv-importados/app/gerente/produtos/actions.ts:640` | `estoque.delete` | Produtos | Remoção de linha ao excluir produto |
| `pdv-importados/app/gerente/clientes/actions.ts:152` | `clientes.update` | Cadastros | Edição |
| `pdv-importados/app/gerente/clientes/actions.ts:172` | `clientes.insert` | Cadastros | Criação |
| `pdv-importados/app/gerente/clientes/actions.ts:242` | `clientes.update` | Cadastros | Anonimização LGPD |
| `pdv-importados/app/gerente/clientes/actions.ts:260` | `clientes.delete` | Cadastros | Exclusão sem histórico financeiro |
| `pdv-importados/app/gerente/financeiro/actions.ts:34` | `clientes.insert` | Financeiro | Cliente rápido no fluxo financeiro |
| `pdv-importados/app/gerente/fornecedores/actions.ts:140` | `fornecedores.update` | Cadastros | Edição |
| `pdv-importados/app/gerente/fornecedores/actions.ts:147` | `fornecedores.insert` | Cadastros | Criação |
| `pdv-importados/app/gerente/fornecedores/actions.ts:191` | `fornecedores.delete` | Cadastros | Exclusão unitária |
| `pdv-importados/app/gerente/fornecedores/actions.ts:213` | `fornecedores.update` | Cadastros | Ativar/inativar em lote |
| `pdv-importados/app/gerente/fornecedores/actions.ts:247` | `fornecedores.delete` | Cadastros | Exclusão em lote |

## Domínios com RPC parcial (fora da allowlist por design futuro)

| Domínio | Estado atual | Fechamento / leitura |
|---|---|---|
| **Caixa** | Abertura web: write direto; fechamento: `fechar_caixa_atomico` RPC | Leituras `.select` em vários `caixa/server/*` — não violam o guard |
| **Estoque** | Criação/remoção de linha: writes diretos; saldo: RPCs (`decrementar_estoque_seguro`, transferências, etc.) | Ajustes de quantidade via RPC |
| **movimentos_caixa** | Nenhum write direto conhecido em TS | Qualquer write futuro quebra o CI |

## Observações (fora do enforcement)

- Esta lista é best-effort; a rede de segurança é o guard, que falha para qualquer
  write novo mesmo que não conste aqui.
- Writes via indireção (helpers, repositórios genéricos) **não** são detectados.
- Testes (`*.test.ts`, `*.spec.ts`) e `e2e/` são excluídos da varredura.
- Migração futura para RPC-only: remover write no código **e** entrada na allowlist.
