# GO-LIVE 02 — pipeline de backup cifrado

Data: 2026-10-10. Branch `sprint/go-live-01`. PostgreSQL 17.11 e dados sintéticos. Nenhum acesso a produção ou staging.

## Arquitetura

```text
pg_dump -Fc (stdout)
  → age -r <chave pública> (stdin)
  → backup.dump.age
  → age -d -i <chave privada> (stdout)
  → pg_restore (stdin) em Postgres 17 vazio
```

O formato customizado do PostgreSQL 17 restaura por pipe numa carga completa. O destino descartável remove o schema `public` vazio antes do `pg_restore`, e o dump o recria. O SQL em claro não vira arquivo. O `docker cp` não lê `/dev/shm`; o ciphertext passa por `/tmp` dentro do container e essa cópia é apagada em seguida.

`age` não está no PATH do Windows. O script não instala nada na máquina: o pacote Alpine `age` 1.3.2 entra só no container `postgres:17-alpine`, que já é Alpine 3.24. O `apk` dessa imagem não aceita `--no-cache`.

## Como executar

Pelo Git Bash. O `bash` do WSL não enxerga o Docker.

```text
backend/scripts/backup-age-postgres.sh
node backend/scripts/backup-age-postgres.test.mjs
```

O script recusa ambiente com URL Supabase, não publica porta e apaga containers e o diretório temporário ao sair, inclusive quando uma etapa falha.

## Chaves

Cada execução gera um par sintético com `age-keygen` e o apaga no final. A chave privada fica em `keys/` e o `.age` em `cipher/`. Nada disso entra no Git.

Para o backup real, o operador:

1. Gera o par numa máquina offline.
2. Guarda a chave pública onde o backup cifra (`BACKUP_AGE_PUBLIC_KEY`, já prevista no runbook).
3. Guarda a chave privada em cofre ou mídia offline, separada dos arquivos `.age`.
4. Não coloca a privada no repositório, no log, nem no mesmo diretório do artefato.

Perder a chave privada torna o backup ilegível. O `age` não tem recuperação.

## Resultado do ensaio

| Prova | Resultado |
|---|---|
| Backup cifrado | PASS |
| SQL ou dump em claro persistido | PASS (ausente) |
| Descriptografia em fluxo | PASS |
| Restauração PostgreSQL 17 | PASS |
| Integridade dos dados | PASS |
| Fila fiscal | PASS |
| Chave incorreta | acesso negado |
| Arquivo adulterado | restauração recusada |
| Falha intermediária | container removido |
| Segredo no log | ausente |
| Falha de `pg_dump` mascarada pelo `age` | não; `pipefail` preservou o erro |

Evidência sanitizada, artefato já apagado:

```json
{"age":"v1.3.2","pg":"17.11","cipher_bytes":6903,"cipher_sha256":"6248d48fb5c10d547e9b18df651715e8217baa587934f262d1077a5528a2ad24","plaintext_persisted":false,"pipefail_preservado":true,"chave_incorreta_negada":true,"adulterado_negado":true,"limpeza":true,"lojas":2,"vendas":2,"fila":2,"funcao_igual":true,"policies":2,"lojas_distintas":2,"segredo_no_log":false}
```

O destino ficou com 2 lojas, 2 vendas, 2 itens de fila com status sintético de erro, 2 policies e a função fiscal igual à origem. As duas lojas vieram porque o dump local usa o superusuário. Uma role só de `SELECT`, sem `BYPASSRLS`, não produz este arquivo.

## Recuperação

1. Conferir o SHA-256 do `.age` antes de decifrar.
2. Subir um PostgreSQL 17 vazio, sem porta publicada.
3. Decifrar em fluxo para `pg_restore`. Não gravar o SQL.
4. Contar tabelas, fila, policies e a função. Código zero sem essas contagens não aprova o restore.
5. Apagar a cópia da chave privada usada na sessão.

## Limitações em relação ao Supabase

Este ensaio cobre o schema `public` sintético: tabelas, dados, função, policies e fila. Não inclui `auth`, `storage`, roles geridas pela plataforma, extensões nem objetos fora de `public`. O workflow existente ainda grava SQL e só depois cifra; este pipeline não grava o SQL. Nenhum dos dois substitui sozinho um backup lógico completo do projeto Supabase.

## Autorização humana

1. Gerar e custodiar a chave `age` real.
2. Autorizar por escrito a extração de produção e o diretório do `.age`, fora do Git.
3. Decidir a credencial: dono, para o dump completo, ou a role restrita, que entrega só as linhas visíveis pelo RLS.
4. A janela fiscal continua fora deste pipeline.

## Decisão

**GO** para solicitar o backup real. **NO-GO** para executá-lo até a chave real estar custodiada e a extração estar autorizada por escrito.
