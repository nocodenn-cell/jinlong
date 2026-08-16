# Promoção — hardening de produtos (isolamento por loja, autoria, atacado)

Procedimento de promoção seletiva das **cinco** migrations desta entrega.
Nada aqui deve ser executado sem autorização explícita para produção.

## 1. Por que não `supabase db push`

`db push` aplica **tudo** que está no diretório de migrations e não consta em
`supabase_migrations.schema_migrations`. Entre a última migration rastreada em
produção e estas cinco existem ~25 migrations do lote financeiro/comissões
(10–14/08) que **não fazem parte desta entrega** e cuja promoção não está
autorizada.

Além disso, `db push --dry-run` falha antes mesmo de listar, com
`LegacyDbPushMissingLocalError`: o tracking remoto tem versões cujos nomes de
arquivo não existem localmente (drift histórico). A saída sugerida pela CLI
(`migration repair --status reverted`) reescreve o histórico remoto e está
vetada.

Portanto a promoção é **seletiva**, via Management API
(`apply_migration`), uma migration por vez, na ordem abaixo.

## 2. Migrations desta entrega, em ordem

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `20260816135000_reconcilia_produtos_codigo_interno.sql` | Reconcilia 4 colunas de `produtos` que existem em produção sem migration canônica; converge `preco_custo_medio` para `numeric(10,2)` |
| 2 | `20260816140000_rls_produtos_historico_isolamento_por_loja.sql` | Isolamento por loja em `produtos`/`historico_precos_produto`; remove `caixa_policy`/`painel_policy`; recria a RPC de listagem com as 17 colunas |
| 3 | `20260816141000_criar_produto_autoria_atomica.sql` | Autoria na mesma transação; idempotência com advisory lock e escopo de loja |
| 4 | `20260816142000_indices_fks_autoria_produtos.sql` | Índices parciais nas 3 FKs de autoria |
| 5 | `20260816143000_atualizar_produto_com_faixa_atacado.sql` | RPC transacional produto + faixa; ator explícito no histórico |

A ordem importa: a #2 recria a RPC de listagem lendo `quantidade_gatilho_atacado`,
coluna garantida pela #1; a #5 depende das colunas de autoria já existentes.

## 3. Sequência app ↔ banco

A aplicação foi feita para tolerar **as duas ordens**, então não há janela de
quebra:

| Estado | Comportamento |
|---|---|
| App novo, banco antigo | `defaultUpdateRow` detecta a RPC ausente (`PGRST202`/`42883`) e cai no `UPDATE` direto — igual ao comportamento anterior, sem transacionalidade da faixa |
| Banco novo, app antigo | App antigo faz `UPDATE` direto + sincroniza a faixa em duas etapas, como sempre fez; a RPC simplesmente não é chamada |
| App novo, banco novo | Caminho transacional completo |

Recomendado: **banco primeiro, app depois** — encurta o tempo em degradação.
Mas publicar o app antes não quebra nada, e o rollback do app também não.

### Follow-up de autoria (`registrarCriadoPor`)

Permanece de propósito enquanto a migration #3 não estiver promovida: hoje ele
é o único caminho que preenche `criado_por` em produção. Depois da promoção ele
passa a ser inofensivo (a guarda `criado_por IS NULL` faz o `UPDATE` não
encontrar linha) e pode ser removido em entrega separada. **Não remover antes.**

## 4. Pré-condições verificáveis

Rodar antes de qualquer aplicação:

```bash
backend/scripts/promover-hardening-produtos.mjs --check
```

Verifica, somente com leitura:

1. as cinco migrations **não** constam em `schema_migrations`;
2. nenhuma migration de comissões/pagamentos seria afetada;
3. o schema de produção ainda casa com o clone validado (assinatura da RPC de
   listagem, tipo de `preco_custo_medio`, policies existentes);
4. existe backup manual recente (o projeto é free tier — **sem backup
   automático**; ver §6).

## 5. Aplicação

```bash
# imprime exatamente o que faria, sem executar
backend/scripts/promover-hardening-produtos.mjs --plan

# aplica (exige --confirmo-producao; recusa qualquer arquivo fora da lista)
backend/scripts/promover-hardening-produtos.mjs --apply --confirmo-producao
```

O script recusa-se a aplicar qualquer arquivo que não esteja na lista fixa de
cinco, e para no primeiro erro.

## 6. Backup

O projeto está no plano **free**, que não tem backup automático (verificado em
2026-08-16 via `get_organization` + docs). Antes de aplicar:

```bash
npx supabase db dump --linked -f schema_pre_hardening.sql
npx supabase db dump --linked --data-only -f data_pre_hardening.sql
```

Guardar fora do repositório — o dump de dados contém dados reais de cliente.

## 7. Recuperação

As migrations são majoritariamente aditivas. O que **não** é trivialmente
reversível:

| Mudança | Reversão |
|---|---|
| `DROP POLICY caixa_policy/painel_policy` | Recriar a partir do texto registrado em `docs/RLS_POLICY_DIAGNOSTIC.md` |
| `produtos_leitura`/`produtos_escrita` | Recriar as versões antigas (guardadas no mesmo documento) |
| RPC de listagem (DROP + CREATE) | O corpo anterior está no dump de schema pré-deploy |
| `preco_custo_medio` → `numeric(10,2)` | Já era `numeric(10,2)` em produção: no-op lá |
| Índices | `DROP INDEX` |
| Colunas reconciliadas | Já existiam em produção: no-op lá |

Recuperação de dados não se aplica: nenhuma migration altera linhas de negócio
(só `UPDATE ... WHERE loja_id IS NULL` no backfill, que em produção não casa
com nenhuma linha, pois a coluna já é `NOT NULL`).

## 8. Validação pós-deploy

```bash
backend/scripts/promover-hardening-produtos.mjs --verify
```

E, para comportamento em runtime, o smoke — **que cria e apaga dados** e por
isso **só roda em localhost** (o script recusa qualquer outra URL):

```bash
node backend/scripts/rls-produtos-tenant-rest-smoke.mjs
```
