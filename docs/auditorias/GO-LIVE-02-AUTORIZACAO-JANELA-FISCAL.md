# GO-LIVE 02 — Autorização da janela fiscal

Data: 2026-10-10.  
PR: https://github.com/nocodenn-cell/fastproduct/pull/535  
Branch: `sprint/go-live-01`.

Este texto pede uma decisão. Não executa dump, migration nem deploy. Não contém senha, token nem dado fiscal.

## Operações que exigem autorização

1. Dump lógico somente leitura de produção `kbabmewnahysfvlybiak`, no dia da janela.
2. Restaurar esse dump num Postgres 17 novo e descartável, fora de produção e de staging.
3. `COMMIT` em produção, numa transação, de apenas:
   - `backend/supabase/migrations/20261009220000_fiscal_rpc_isola_loja.sql`
   - `backend/supabase/migrations/20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` sem o `BEGIN`/`COMMIT` interno
4. Pausar o worker fiscal durante essa transação.

Fora desta autorização: merge na `main`, deploy, `20261010120000`, `20261007161220` e a série financeira/caixa/NF-e.

## Dados acessados

O dump lê o catálogo e as linhas necessárias para restaurar. Isso inclui a fila `documentos_fiscais_pendentes` e as tabelas de que as funções dependem. O ensaio de hoje não lê essas linhas: usa só UUID sintético `00000000-0000-4000-8000-*`.

No dia autorizado, o relatório guarda contagem, hora UTC e SHA-256 dos arquivos. Não guarda XML, nome, documento nem payload.

## Onde o backup real fica

Fora do Git, num diretório escolhido pelo operador, em disco criptografado. O script `backend/scripts/fiscal-janela-postgres.sh` não aponta para produção: recusa host `supabase.co` e os refs de produção e staging, grava o ensaio sintético em diretório temporário e apaga esse diretório ao sair.

O dump real, quando autorizado, segue `docs/runbooks/BACKUP_RESTORE_CANONICO.md` (`supabase db dump --linked`) com saída nesse diretório externo.

## Proteção e descarte

- Sem cópia para pasta sincronizada, issue ou PR.
- Apagar `roles.sql`, `schema.sql` e `data.sql` no mesmo dia, depois do pós-check.
- Derrubar o Postgres descartável e o volume.
- O ensaio sintético já se descarta sozinho (`docker rm -f` dos containers `jinlong-fiscal-src` e `jinlong-fiscal-dst`, mais `rm -rf` do temporário).

## Indisponibilidade

A troca das funções é uma transação curta. No volume visto em 2026-10-08 (schema cerca de 890 KB e dados cerca de 2,5 MB), o restore de prova levou 7,8 s. A transação de produção deve ficar abaixo de um minuto. A janela humana recomendada é de 30 minutos, cobrindo dump, restore de prova, `COMMIT` e pós-check. A loja não precisa fechar; o worker fiscal fica pausado durante o `COMMIT`.

## Riscos residuais

- As três RPCs atuais continuam com o predicado morto até o `COMMIT`.
- `fiscal_cancelar_documento` continua ausente até lá, e a tela já chama essa assinatura.
- `INSERT` de `authenticated` na fila continua aberto até `20261007163200`.
- RPO diário não está garantido. Sem o dump do dia, não há restore de dados.
- RPO diário não está garantido. Sem o dump do dia, não há restore de dados de produção. O ensaio sintético em Postgres 17 passou; isso não substitui o dump real.
- `fiscal_marcar_cancelado` não entra nesta janela.

## Interromper se

- O dump não restaura com as mesmas contagens de tabelas, policies, functions e triggers.
- O pré-check do `GO-LIVE-01-CHECKLIST-FISCAL.md` falha.
- A contagem da fila muda por causa do DDL.
- `anon` consegue executar alguma das quatro RPCs.
- Gerente de outra loja não recebe `FISCAL_REPROCESSO_LOJA` ou `FISCAL_CANCELAR_LOJA`.
- Qualquer arquivo além dos dois acima entra no `COMMIT`.

## Recuperação

| Perda | Ação |
|---|---|
| Transação que não commitou | `ROLLBACK`. Nada a reparar no ledger. |
| Função segura perdida depois do commit | Reaplicar só `20261009220000`. Outro SQL é recusado. |
| Linha alterada por chamada real | Restaurar o dump do dia num Postgres novo. Não recolocar o corpo vulnerável. |
| Venda ou documento depois da hora do dump | Reprocessar outbox e fila a partir dessa hora. |

## Testes obrigatórios depois do COMMIT

No catálogo de produção, sem listar linhas:

- `internal.fiscal_sessao_privilegiada()` existe.
- `fiscal_cancelar_documento(uuid, text)` existe.
- `anon` não executa as quatro RPCs.
- `INSERT` de `authenticated` na fila é zero.
- `COUNT(*)` da fila igual ao snapshot de antes do DDL.
- Uma chamada de outra loja, feita e desfeita na mesma transação de teste, recebe o código de loja.
- `service_role` continua podendo enfileirar.

Assinaturas que o app publicado já usa e que a janela não muda: `fiscal_cancelar_documento(p_documento_id, p_justificativa)`, `fiscal_reprocessar_documento(p_documento_id)` e `fiscal_enfileirar_documento_venda(p_venda_id, p_tipo_doc, p_payload)` sem `p_loja_id`.

## Decisão pedida

**GO CONDICIONAL para solicitar** esta autorização.

**NO-GO para executar** o dump e o `COMMIT` até a autorização escrita. O script sintético em Postgres 17 já passou. No dia, o dump real ainda precisa ser restaurado num Postgres descartável antes do `COMMIT` em produção.
