# Backup e restauração sem depender de PITR — 2026-11-05

**Premissa:** não se assume que PITR esteja habilitado no projeto `jinlong` (`kbabmewnahysfvlybiak`). Este plano funciona com dump lógico, independentemente de PITR.

**Status:** o procedimento de dump e restauração foi **testado** em contêiner descartável. A execução em produção **não foi feita** e exige autorização expressa do dono (é leitura, mas usa credenciais de banco e gera arquivo com dados pessoais).

## 1. O que é verificado manualmente (ação do dono, no painel Supabase)

Painel → projeto `jinlong` → **Database → Backups**:

1. PITR habilitado? Sim / Não.
2. Retenção (dias) e último backup diário (data e hora).
3. Se houver PITR, anotar a janela restaurável.

Resultado registrado no chamado antes de qualquer migration em produção. Sem essa informação, a aplicação em produção **não é autorizada**.

## 2. Backup lógico antes de qualquer migration (obrigatório)

Executar **somente leitura** com a string de conexão guardada no gerenciador de senhas (nunca colar em chat ou no repositório):

```bash
PGURL="$PROD_DB_URL"   # do gerenciador de senhas; não imprimir
pg_dump "$PGURL" -Fc --no-owner --no-acl -f "backup_jinlong_$(date +%Y%m%d%H%M).dump"
pg_restore --list "backup_jinlong_<data>.dump" > /dev/null && echo "dump legível"
sha256sum "backup_jinlong_<data>.dump" > "backup_jinlong_<data>.sha256"
```

Guardar o `.dump` e o `.sha256` fora do repositório, em local com acesso restrito. Anotar no chamado: data, hora (Brasília), tamanho, hash e quem executou.

Se o `pg_dump` falhar por versão, usar a versão compatível com o servidor (PostgreSQL 17).

## 3. Teste de restauração (obrigatório antes da produção)

Restaurar em banco **separado e vazio** (nunca no de produção):

```bash
docker exec <contêiner-descartável> createdb -U supabase_admin restore_test   # ou outro banco vazio
cat backup_jinlong_<data>.dump | docker exec -i <contêiner-descartável> sh -c 'cat > /tmp/b.dump'
MSYS_NO_PATHCONV=1 docker exec <contêiner-descartável> pg_restore -U supabase_admin -d restore_test --no-owner --no-acl /tmp/b.dump
```

Critérios de aceitação:
- contagens de linhas das tabelas-chave iguais às da origem (`usuarios`, `usuario_vinculos`, `lojas`, `empresas`, `saas.assinaturas`, `internal.usuarios_admin_corte_backup`);
- número de funções em `public`, `internal` e `saas` igual ao da origem;
- erros só de extensões específicas da plataforma (ex.: `pg_cron`, que não existe no contêiner).

### Resultado do teste (contêiner descartável, dados sintéticos)

| Item | Origem | Restaurado |
|---|---|---|
| usuarios | 1 | 1 |
| usuario_vinculos | 1 | 1 |
| lojas | 2 | 2 |
| empresas | 2 | 2 |
| saas.assinaturas | 1 | 1 |
| funções (public, internal, saas) | 405 | 405 |
| erros no `pg_restore` | — | 7, todos de `pg_cron`/extensão não presente no contêiner |

**Limitação:** o conjunto de dados é sintético e pequeno. O teste prova o **procedimento**, não o tempo de restauração de um banco real.

## 4. Quando a restauração completa é necessária

- Corrupção de dados detectada após a aplicação de uma migration.
- Falha de aplicação que deixou o banco em estado inconsistente.

Restaurar **em banco novo** e comparar antes de substituir qualquer coisa. A substituição de produção exige autorização do dono e janela de manutenção.

## 5. Limitações

- Sem PITR, a perda máxima aceitável é o intervalo entre o backup lógico e o incidente. Por isso o dump é feito imediatamente antes de cada aplicação.
- O dump contém dados pessoais (clientes, usuários). Tratar como dado sensível: armazenamento restrito, retenção definida pelo dono, descarte registrado.
- A restauração não recupera eventos externos: tokens revogados, mensagens enviadas, pagamentos feitos no provedor. Ver `RECUPERACAO_ACESSO_TOKENS.md`.
