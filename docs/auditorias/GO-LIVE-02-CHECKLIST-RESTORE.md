# GO-LIVE 02 — Checklist do ensaio de restauração

Data: 2026-10-10.  
Este roteiro não autoriza dump de produção. Sem autorização explícita do dono, parar no passo 0.

O runbook de formato continua em `docs/runbooks/BACKUP_RESTORE_CANONICO.md`. O drill versionado é `backend/scripts/restore-drill.sh`. Os ensaios desta sprint recusam os refs `kbabmewnahysfvlybiak` e `tarxrbxddcwvjkimkbnr` (`backend/scripts/fiscal-p0-janela.mjs`).

## 0. Porta de autorização

- [ ] Há autorização escrita para um dump lógico de produção, somente leitura, no dia do ensaio.
- [ ] O destino é um Postgres novo e descartável. Não é produção, não é staging, não é um projeto Supabase compartilhado.
- [ ] Os arquivos do dump ficam fora do Git e fora de pasta sincronizada com terceiros.
- [ ] Não há cópia de `data.sql` para laptop sem disco criptografado e prazo de apagar.

Se qualquer item falhar, o ensaio não começa.

## 1. Destino

- [ ] `docker info` responde. Se o daemon estiver parado, registrar o bloqueio e não alterar o serviço do Docker Desktop nesta máquina.
- [ ] Subir só um container descartável, por exemplo `postgres:17-alpine`, com volume anônimo e senha local gerada na hora.
- [ ] A connection string não contém `supabase.co` nem os refs acima.
- [ ] `psql` no destino executa `SELECT current_database()` e o nome não é o projeto de produção.

## 2. Origem, quando autorizada

- [ ] `supabase db dump --linked` gera `roles.sql`, `schema.sql` e `data.sql`.
- [ ] O comando é somente leitura na origem. Nenhum `apply_migration`, `db push` ou `db reset` aponta para produção ou staging.
- [ ] Anotar tamanho dos três arquivos, hora UTC e SHA-256. Não colar o conteúdo no relatório.

## 3. Restauração

- [ ] `backend/scripts/restore-drill.sh` aponta o `PSQL` para o container descartável.
- [ ] O script termina sem erro.
- [ ] Contagem de tabelas `public` no destino igual à contagem lida na origem no mesmo instante.
- [ ] Contagem de policies, functions e triggers anotada. Divergência interrompe o ensaio.

## 4. O que conferir no destino, sem abrir dado pessoal

Usar só catálogo e contagens. Não selecionar nome, documento, XML ou payload fiscal.

- [ ] `to_regprocedure` de `fiscal_reprocessar_documento(uuid)`, `fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)`, `fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb)`.
- [ ] `fiscal_cancelar_documento(uuid, text)` e `internal.fiscal_sessao_privilegiada()` seguem ausentes até a janela fiscal deste ensaio.
- [ ] `has_function_privilege('anon', 'cancelar_venda_transacional(uuid, text, uuid)', 'EXECUTE')` é falso.
- [ ] `caixas.loja_id` é `NOT NULL` e o default ainda é o UUID piloto, até `20261010120000`.
- [ ] `COUNT(*)` de `documentos_fiscais_pendentes` igual à origem. Não listar linhas.
- [ ] RLS da fila fiscal está ligada. As policies de loja existem.

## 5. Janela fiscal só no destino

Depois do restore, e só no Postgres descartável:

- [ ] Pré-check do `docs/auditorias/GO-LIVE-01-CHECKLIST-FISCAL.md`.
- [ ] Aplicar numa transação `20261009220000` e, em seguida, o corpo de `20261007163200` sem o `BEGIN`/`COMMIT` interno.
- [ ] Falha injetada (`SELECT 1/0`) antes do `COMMIT` deixa o predicado antigo no lugar.
- [ ] Segunda aplicação não muda a contagem da fila.
- [ ] `anon` não executa as quatro RPCs. Gerente de outra loja recebe `FISCAL_*_LOJA`. Usuário inativo é negado. `service_role` enfileira.
- [ ] Não aplicar `20261007161220` depois.

## 6. Encerramento do ensaio

- [ ] Derrubar o container e o volume.
- [ ] Apagar `roles.sql`, `schema.sql` e `data.sql` do disco local.
- [ ] Registrar no relatório: hora, SHA-256, contagens e o resultado PASS ou FAIL. Sem amostra de linha.
