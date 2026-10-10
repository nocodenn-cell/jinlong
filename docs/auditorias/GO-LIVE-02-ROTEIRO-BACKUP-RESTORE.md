# GO-LIVE 02 — Roteiro curto de backup, restore e validação

Head: `b9670099`. Este texto não autoriza a execução contra produção.

O relatório da operação guarda hora UTC, código de saída, SHA-256 dos arquivos e contagens. Não guarda connection string, token, senha, chave `age`, XML, nome nem payload.

## 1. Ensaio, sem produção

Estes comandos já passaram em dados sintéticos. Nenhum aponta para Supabase.

```text
npm run test:backup-restore-isolado -w fastproduct-backend
npm run test:backup-age -w fastproduct-backend
npm run test:fiscal-drill-plano -w fastproduct-backend
npm run test:fiscal-p0-pre-req -w fastproduct-backend
```

Com Docker local e Git Bash, ainda sem rede de produção:

```text
bash backend/scripts/backup-age-postgres.sh
bash backend/scripts/fiscal-janela-postgres.sh
```

`backup-age-postgres.sh` cifra um `pg_dump` sintético com `age` 1.3.2 dentro de Postgres 17 descartável, restaura por pipe e apaga container, chave e diretório temporário. Não publica porta e não contém host `supabase.co`.

`fiscal-janela-postgres.sh` aplica a janela fiscal sintética e imprime contagens. Sem daemon, sai 2. Não é o restore do dump de produção.

Os dois são ensaio. Passar aqui não é backup real nem recuperação integral do projeto Supabase.

## 2. Backup real

Só depois de autorização escrita que nomeie o projeto e o dia. O caminho já exercido em 2026-10-08 é o de `docs/runbooks/BACKUP_RESTORE_CANONICO.md`:

```text
supabase db dump --linked
```

A saída (`roles.sql`, `schema.sql`, `data.sql`) fica fora do Git, em disco criptografado. O token de acesso fica no secret manager da máquina. Não entra no comando versionado nem no relatório.

`backup-age-postgres.sh` não substitui este passo: ele não lê produção.

## 3. Restore isolado

O `PSQL` aponta só para um Postgres descartável, nunca para produção nem staging. O cabeçalho de `restore-drill.sh` mostra a forma da variável. O valor não vai para o relatório.

```text
bash backend/scripts/restore-drill.sh <diretório-com-os-tres-sql>
```

O script filtra a carga para `public`, `auth.users` e `auth.identities`, trata `CHECK ... NOT VALID` e imprime contagens. Conferir tabela, policy, function e trigger contra a origem. Divergência interrompe. Apagar os SQL e o Postgres descartável no mesmo dia, depois do pós-check.

## 4. O que este roteiro não faz

Não aplica migration. Não faz `migration repair`. Não faz deploy. Não mergeia. Não abre a janela fiscal nem o lote `20261007*`. Cada uma dessas operações pede o dump e o restore deste roteiro no mesmo dia, em autorização própria, conforme `GO-LIVE-02-CHECKLIST-AUTORIZACAO.md`.
