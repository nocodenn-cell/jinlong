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

**Caixa (Fase 1 concluída):** `caixas` é **RPC-only**. Abertura via
`abrir_caixa_atomico` (web `authenticated` + sync `service_role`, id explícito
idempotente); fechamento via `fechar_caixa_atomico` (web) e `fechar_caixa_pdv_atomico`
(sync, idempotente com `o_ja_fechado`). Invariante de banco: índice único parcial
`caixas_operador_unico_aberto` (máx. 1 caixa ABERTO por operador). Não há write
direto em `caixas`, e a tabela **não está na allowlist** → qualquer write direto
reintroduzido quebra o CI.

**Estoque (Fase 2 concluída):** `estoque` é **RPC-only**. Saldo via
`decrementar_estoque_seguro` / `ajustar_estoque_manual` / `transferencia_segura`
(todas escopadas em `(loja_id, produto_id)`); criação de linha via
`garantir_linha_estoque` (idempotente); remoção via cascade da FK
`estoque_produto_id_fkey ON DELETE CASCADE` ao excluir o produto. Invariante de
banco: CHECK `estoque_quantidade_nao_negativa (quantidade_atual >= 0)`. `estoque`
**não está na allowlist** → qualquer write direto reintroduzido quebra o CI.

`movimentos_caixa`: nenhum write direto conhecido. Não está na allowlist — qualquer
write direto futuro quebra o CI.

## Observações (fora do enforcement)

- Esta lista é best-effort e mantida manualmente; a rede de segurança é o guard,
  que quebra o CI para qualquer novo write direto mesmo que não conste aqui.
- Writes escondidos atrás de camadas de indireção (helpers/repositórios) **não**
  são detectados nesta fase — o guard é intencionalmente literal e simples.
- Triggers/functions SQL com side effects de escrita não são varridos (só código TS).
- Autorização (RLS TS vs SQL) e as correções por domínio ainda pendentes
  (constraint `quantidade >= 0` + writes de estoque na Fase 2, dedupe de
  `criarCliente` na Fase 4, etc.) são fases futuras. A Fase 1 (writer único de
  caixa) já está concluída.
