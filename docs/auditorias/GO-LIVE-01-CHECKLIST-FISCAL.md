# GO-LIVE 01 — Checklist da janela fiscal

Execução em produção: **NO-GO** até autorização explícita.  
Ensaio local em 2026-10-10: `npm run test:fiscal-p0-pre-req` **PASS**. Motor: PostgreSQL embarcado (PGlite 0.3.14), dois bancos descartáveis. O daemon do Docker não estava ativo; nenhum banco remoto foi aberto. O dump lógico copiou linhas e `pg_get_functiondef` da origem para o banco restaurado.

Alvo futuro, se autorizado: `kbabmewnahysfvlybiak`. Staging `tarxrbxddcwvjkimkbnr` não é ensaio.

## Snapshot antes de aplicar

Guardar a saída destas leituras fora do Git, com o horário. Não guardar `pg_get_functiondef` para usar como rollback.

1. `max(version)` de `supabase_migrations.schema_migrations`.
2. `count(*)` de `public.documentos_fiscais_pendentes`.
3. Existência de `auth.uid()`, `auth.role()`, `documentos_fiscais_pendentes`, `documentos_fiscais_eventos`, `documentos_fiscais_dlq`, `usuarios.ativo`, `caixas.loja_id`.
4. `has_function_privilege` de `anon`, `authenticated` e `service_role` nas quatro RPCs.
5. `INSERT` de `authenticated` e `anon` em `documentos_fiscais_pendentes`.
6. Dump lógico restaurado num Postgres descartável, com a mesma contagem da fila. Sem esse restore, a janela não começa.

## Aplicação

Uma transação, via `bundleFiscalP0` em `backend/scripts/fiscal-p0-janela.mjs`:

1. `20261009220000_fiscal_rpc_isola_loja.sql`
2. `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql`, sem o `BEGIN`/`COMMIT` próprios

O bundle abre `BEGIN` e fecha `COMMIT`. Erro em qualquer ponto desfaz os dois arquivos.

## Validação depois

| Leitura | Parar se |
|---|---|
| `internal.fiscal_sessao_privilegiada()` | ausente |
| `fiscal_cancelar_documento(uuid, text)` | ausente |
| `fiscal_sessao_privilegiada` no corpo das três RPCs que já existiam | ausente |
| `current_user <> 'postgres'` nesses corpos | presente |
| `FISCAL_CANCELAR_LOJA` em `fiscal_cancelar_documento` | ausente |
| `EXECUTE` de `anon` nas quatro | verdadeiro |
| `INSERT` de `authenticated` na fila | presente |
| `count(*)` da fila | diferente do snapshot, sem chamada real no meio |

Não chamar as RPCs contra os documentos de produção para “provar” a janela.

## Critérios de interrupção

Parar e não continuar se qualquer item abaixo acontecer:

- o pré-check de objeto falha
- o dump não restaura a mesma contagem
- o bundle termina com erro
- `anon` consegue `EXECUTE`
- a contagem da fila muda durante o DDL
- o corpo novo ainda contém `current_user <> 'postgres'`
- alguém pede para reaplicar `20261007161220` ou um `pg_get_functiondef` anterior

## Recuperação

- Transação abortada: não há o que reverter. As funções anteriores continuam.
- Apply commitado e a função segura some: reaplicar somente `20261009220000_fiscal_rpc_isola_loja.sql`. Qualquer outro texto é `RECOVERY_RECUSA_SQL_NAO_CANONICO`.
- Dado de documento alterado por uso real depois do apply: restaurar o backup lógico da janela num Postgres novo. Não corrigir dado trocando corpo de função.
- Reinstalar o corpo vulnerável não é rollback.
