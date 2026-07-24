# RELATÓRIO DE RECONCILIAÇÃO — Repositório vs Banco (Descontos)

**Data**: 2026-07-24
**Escopo**: Pré-requisito para MVF #2 (motivo de desconto na RPC de finalização)
**Banco investigado**: projeto Supabase `jinlong` (`kbabmewnahysfvlybiak`, região `sa-east-1`, `ACTIVE_HEALTHY`)
**Método**: consulta direta ao banco em execução (`pg_get_functiondef`, `information_schema`, `supabase_migrations.schema_migrations`) + inspeção do repositório.

> **Conclusão executiva**: Há divergência relevante entre repositório e banco no **schema da tabela `descontos_venda`** e no **modelo de versionamento de migrations**. A função `finalizar_venda_transacional_canonica_v4` está alinhada entre repo e banco, mas **ambos** carregam o mesmo defeito (token reutilizável + sem auditoria de desconto de gerente). Conforme a regra definida, **a implementação da migration foi interrompida** até decisão sobre a reconciliação.

---

## Respostas objetivas às 5 perguntas

### 1. A migration 113 realmente não está aplicada no banco-alvo?

**Correto — os efeitos de schema da 113 NÃO estão no banco.**

Evidência:
- `descontos_venda` no banco tem **apenas 4 colunas**: `venda_id`, `gerente_id`, `desconto_percentual`, `desconto_valor`.
- A migration `113_descontos_venda_auditoria_operador.sql` (repo) adiciona `operador_id` e `aplicado_em` — **ausentes** no banco.
- `supabase_migrations.schema_migrations` não contém nenhuma entrada com nome contendo `113` de auditoria de descontos (a única `113` rastreada é `20260618011821_113_rls_audit_fixes`, que é outra coisa — RLS, não colunas).

Ou seja: a coluna de auditoria que o documento congelado assumiu como existente **não existe** no banco de Go-Live.

### 2. Qual banco é o ambiente oficial de Go-Live?

**Muito provavelmente o projeto `jinlong` (`kbabmewnahysfvlybiak`).**

Evidência:
- É o único projeto **ativo** da organização (`ageguard` está `INACTIVE` e é outro produto).
- Nome corresponde ao cliente do repositório (diretórios `Jinlong`, `jinlong layout 20-05`).
- A migration mais recente rastreada é `20260719032927_implantacao_checklist_go_live` — indica preparação explícita de Go-Live.
- Região `sa-east-1` (Brasil), coerente com PDV fiscal brasileiro (NFC-e).

**Ressalva**: não há confirmação documental de que este é *produção* vs *staging de Go-Live*. Recomenda-se o dono confirmar formalmente antes de qualquer DDL.

### 3. O repositório está atrás do banco, ou o banco atrás do repositório?

**Divergência bidirecional (não é um simples “um atrás do outro”).**

- O banco tem **32 migrations rastreadas**, a mais antiga é `20260707183145_258_produtos_localizacao_nome_reduzido`. O banco foi **baselined (~258)**: tudo antes de 258 foi consolidado num schema-semente e **não** aparece individualmente em `schema_migrations`.
- O repositório tem **216 arquivos**: **32 com timestamp** (`2026*.sql`, batem 1:1 com as 32 rastreadas no banco) + **184 de numeração simples** (`002`…`271`, o baseline histórico não rastreado).
- Portanto:
  - **Banco “à frente”** nas áreas em que só tem o baseline consolidado (não dá para reproduzir o histórico fino a partir dele).
  - **Repo “à frente”** por conter os 184 arquivos legados de numeração simples que o banco não rastreia individualmente.
  - As 32 timestamped estão **sincronizadas** repo↔banco.

### 4. A RPC v4 em produção é idêntica à do repositório?

**Sim, na função em si — e é justamente aí que mora o problema.**

Evidência (banco em execução):
- Assinatura: 19 parâmetros, idêntica ao repo `268_reconcile_finalizar_venda_v4_single_overload.sql`
  (`… p_desconto_gerente_token, p_desconto_gerente_percentual, … p_cliente_id uuid`).
- `has_passo5` (INSERT em `descontos_venda`) = **false**
- `INSERT INTO descontos_venda` presente = **não** (`position(...) = 0`)
- `UPDATE tokens_desconto_gerente SET usado` presente = **não** (`position(...) = 0`)
- `contas_receber` presente = **true**, `ensure_venda_evento_registrado` presente = **true**

Isso corresponde **exatamente** ao corpo do arquivo repo `268_reconcile…`. Não há diff funcional relevante repo↔banco na v4.

**Histórico do defeito**: a migration `243_finalizar_venda_canonica_v4_captura.sql` **tinha** o PASSO 5 (marcava token como usado + inseria em `descontos_venda`). A reconcile posterior `268_reconcile…` reescreveu o corpo e **removeu** esse bloco. Como 268 é a última definição, o banco herdou a versão sem auditoria.

### 5. O bug do token reutilizável existe no repo, no banco, ou em ambos?

**Em ambos.**

- **Repo**: `268_reconcile…` (última definição da v4) não contém `UPDATE tokens_desconto_gerente SET usado = true`.
- **Banco**: `pg_get_functiondef` confirma ausência do mesmo `UPDATE` (marcador = 0).
- **Impacto estrutural**: um token de desconto de gerente **nunca é consumido** → pode ser reutilizado indefinidamente. Além disso, **nenhum** desconto de gerente gera linha em `descontos_venda` → sem trilha de auditoria.
- Estado atual de dados no banco: `tokens_desconto_gerente` = 2 linhas, **2 com `usado = false`**; `descontos_venda` = 2 linhas (legado). Baixo volume — janela boa para corrigir antes de operação real.

---

## Matriz de divergência

| Item | Repositório (efetivo) | Banco `jinlong` | Diverge? | Relevante p/ MVF #2 |
|---|---|---|---|---|
| `descontos_venda` colunas | 002 (4 cols) + 113 (+operador_id, +aplicado_em) | **4 cols** (só 002) | **SIM** | **SIM** |
| v4 — INSERT `descontos_venda` | Ausente (268) | Ausente | Não | SIM (precisa ser criado) |
| v4 — marca token `usado` | Ausente (268) | Ausente | Não | SIM (bug de segurança) |
| v4 — assinatura/lógica geral | 19 args (268) | 19 args | Não | — |
| Modelo de migrations | 32 timestamped + 184 legado | 32 rastreadas (baseline ~258) | **SIM** | Indireto |

---

## Por que a implementação foi interrompida

A regra acordada: *“Se houver divergência, interrompa a implementação e entregue primeiro um relatório de reconciliação antes de qualquer migration.”*

Há divergência relevante e concreta:

1. **`descontos_venda` no banco não tem `operador_id`/`aplicado_em`.** Qualquer migration que insira nessas colunas (como o documento congelado assumia) **falharia** contra o banco de Go-Live.
2. **O modelo de versionamento diverge** (baseline no banco vs 184 arquivos legado no repo). Escrever “a próxima migration” sem alinhar o esquema de nomes/timestamps pode gerar migration não aplicada ou fora de ordem.

Escrever a correção da v4 agora arriscaria uma DDL inconsistente no ambiente de Go-Live.

---

## Recomendação de reconciliação (antes de qualquer migration)

1. **Confirmar formalmente** que `jinlong` é o alvo de Go-Live (e se é produção ou staging).
2. **Decidir a fonte de verdade do schema**: adotar o banco baselined como referência e escrever a nova migration **contra o estado real** (`descontos_venda` = 4 colunas), não contra o repo legado.
3. **Escrever a migration MVF #2 como timestamped** (padrão das 32 rastreadas), fazendo `ADD COLUMN IF NOT EXISTS` para ser idempotente independentemente de 113 ter rodado ou não. Incluir, no mesmo passo, `operador_id`/`aplicado_em` se a auditoria completa for desejada.
4. **Tratar o bug do token reutilizável** explicitamente: a correção da v4 deve (a) marcar `tokens_desconto_gerente.usado = true`, (b) inserir em `descontos_venda` com `motivo`, preservando SSOT e a assinatura de 19→21 args (2 novos params com DEFAULT).
5. Só então aplicar via pipeline oficial e revalidar com `pg_get_functiondef`.

---

## Evidências brutas (consultas executadas)

- `SELECT … pg_get_function_arguments/functiondef … WHERE proname='finalizar_venda_transacional_canonica_v4'`
  → `has_descontos_insert=0`, `has_token_mark=0`, `has_passo5=false`, `has_contas_receber=true`, 19 args.
- `information_schema.columns` em `descontos_venda` → 4 colunas.
- `supabase_migrations.schema_migrations` → 32 linhas; earliest `20260707183145_258_…`; nenhuma `113` de auditoria de descontos.
- `descontos_venda`=2 linhas; `tokens_desconto_gerente`=2 linhas, 2 `usado=false`.
- Repo: 216 `.sql` (32 timestamped, 184 legado); dois arquivos “268”; dois arquivos “113”.

---

**Status**: 🟡 AGUARDANDO DECISÃO DE RECONCILIAÇÃO — nenhuma migration de descontos escrita/aplicada.
