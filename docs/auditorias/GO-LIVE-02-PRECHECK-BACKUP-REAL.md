# GO-LIVE 02 — pré-checagem do backup real

Data: 2026-10-10. Branch `sprint/go-live-01`. Nenhum dado de produção foi lido ou extraído. A role abaixo não foi criada no banco remoto.

## 1. Criptografia

Inspeção somente leitura, sem privilégio de administrador:

| Verificação | Resultado |
|---|---|
| Volumes | Somente `C:` (cerca de 623 GB livres em 951 GB) |
| Sessão elevada | Não |
| `manage-bde -status C:` | Acesso negado |
| `Win32_EncryptableVolume` e registro de Device Encryption | Sem status legível |

Criptografia efetiva do destino local: **pendente**. Não foi criada, alterada nem desativada nenhuma proteção.

### Solução recomendada

Não gravar o dump em claro no disco. Duas camadas, nesta ordem:

1. Cifrar o arquivo com `age` antes de ele tocar o disco, como já previsto em `docs/runbooks/BACKUP_RESTORE_CANONICO.md`. A chave privada fica fora do Git e fora do log.
2. Se o arquivo precisar permanecer em disco, um volume VHD dedicado com BitLocker, criado só depois de autorização elevada. Este passo não foi executado.

Confirmar a proteção antes de qualquer dado real:

- `age`: o arquivo começa com o cabeçalho de criptografia e não contém SQL legível. A decifragem ocorre só no Postgres descartável.
- BitLocker, em prompt elevado: Protection On e conversão completa. Não executar a listagem de protetores; ela exibe a chave de recuperação.

## 2. Escopo

### A. Backup operacional da aplicação

Mínimo para reconstruir a operação do Jinlong em outro Postgres:

- tabelas `public` de cadastro, venda, estoque, financeiro e caixa
- fila `documentos_fiscais_pendentes`, DLQ e eventos fiscais
- funções RPC fiscais, inclusive `internal.fiscal_sessao_privilegiada`
- constraints, índices e triggers dessas tabelas
- policies RLS e grants de `anon`, `authenticated` e `service_role`

Uma role com `SELECT` e sem `BYPASSRLS` não entrega este escopo. O ensaio mostrou uma linha visível onde o dono enxerga duas.

### B. Backup lógico completo

Além de A: `roles`, `auth`, `storage`, extensões, schemas geridos pelo Supabase e ACLs de objetos cujo dono não é a role de backup. O caminho documentado (`roles.sql`, `schema.sql`, `data.sql`) usa o dono via Management API e o token administrativo. Isso não é menor privilégio e não substitui a role desta pré-checagem.

Objetos que a role restrita não extrai:

- linhas ocultas por RLS
- corpos e ACLs que `pg_dump` só emite com `row_security` desligado
- schemas `auth` e `storage` quando o cliente local é mais antigo que o remoto; o filtro atual carrega só `auth.users` e `auth.identities`
- constraints `NOT VALID`, que o restore isolado remove antes do `COPY` e recria depois

Um dump que termina com sucesso sob `--enable-row-security` é backup parcial. Não é recuperação integral.

## 3. Role temporária

SQL versionado e não executado no remoto:

- `backend/scripts/sql/backup-ro-criar.sql`
- `backend/scripts/sql/backup-ro-verificar.sql`
- `backend/scripts/sql/backup-ro-revogar.sql`

A role tem `LOGIN`, `CONNECT` e `USAGE` em `public`, `SELECT` nas tabelas e nenhum privilégio de escrita, schema, `SUPERUSER`, `CREATEROLE`, `CREATEDB` ou `BYPASSRLS`. Sem token da Management API.

Limitação comprovada: o dono da tabela e o superusuário passam por RLS; uma role comum não. `pg_dump` sem `--enable-row-security` falha. Com a flag, o arquivo contém só as linhas da loja visível. Funções e policies continuam dependentes do dump feito pelo dono.

## 4. Procedimento Docker

`backend/scripts/backup-ro-postgres.sh`, imagem `postgres:17-alpine` já presente. Sem instalação global, sem porta publicada, sem senha na linha de comando. No ensaio a autenticação é `trust` dentro do container. Em produção a senha entra por `PGPASSFILE` montado, arquivo fora do Git, apagado ao fim.

Cliente e servidor do ensaio: PostgreSQL 17.11. Executar pelo Git Bash. O `bash` do WSL desta máquina não enxerga o Docker.

## 5. Ensaio sintético

PostgreSQL 17 descartável, dados sintéticos, containers removidos ao fim.

| Prova | Resultado |
|---|---|
| Privilégio da role | Sem superuser, bypass, createdb, createrole ou escrita |
| `INSERT` | Negado |
| `SELECT` em duas lojas | 1 linha em cada sessão |
| `pg_dump` sem row security | Bloqueado pelo RLS |
| `pg_dump` com `--enable-row-security` | 1 linha |
| Dump do dono restaurado | 2 vendas, 2 itens de fila, função presente |
| Restauração do dump restrito | 1 venda |
| Revogação | Conexão seguinte negada |

Dump bem-sucedido da role: 1 linha. Dump completo do dono: 2 vendas e a fila. São resultados diferentes.

## 6. Autorização humana ainda necessária

1. Confirmar criptografia do volume ou custodiar a chave `age` fora do Git.
2. Criar a role no banco de produção e revogá-la ao fim, se o objetivo for só leitura operacional.
3. Autorizar por escrito um dump lógico completo, feito pelo dono, se o objetivo for recuperação integral.
4. A janela fiscal continua fora desta pré-checagem.

## 7. Riscos residuais

- Destino em claro no `C:` enquanto a criptografia não for comprovada.
- Tratar dump com RLS como backup completo e perder a outra loja.
- Usar o token da CLI no lugar da role e ampliar o privilégio sem registro.
- Restaurar por cima do banco de origem.

## 8. Decisão

**NO-GO** para o backup real. Os mecanismos locais passaram. Falta criptografia comprovada e autorização humana para a credencial e para a extração.
