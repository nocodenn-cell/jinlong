# Backup diário — diagnóstico do `PAM authentication failed` (2026-10-08)

Estado: **RPO NÃO GARANTIDO** (0 de 30 runs de `backup-scheduled` com sucesso). Sem alteração de secret feita por automação.

## O que os logs provam (run 37782422401)

| Etapa | Resultado | Conclusão |
|---|---|---|
| PAT `SUPABASE_BACKUP_JIT_PAT` | 44 caracteres, sem espaço em branco | formato `sbp_`+40 compatível; não é erro de colagem |
| `PUT /v1/projects/{ref}/database/jit` | 2xx ("JIT autorizado") | a API de Management aceita o token |
| `GET .../database/jit` | HTTP 200 com `postgres` + `0.0.0.0/0` + expiração | o grant existe e a rede é permitida |
| Pooler `aws-0-sa-east-1` | `tenant/user ... not found` | host errado para este tenant (esperado) |
| Pooler `aws-1-sa-east-1` | **tenant RESOLVIDO**, `PAM authentication failed for user "postgres"` | **a credencial é recusada no plano de dados** |
| Pooler `aws-2/3` | DNS inexistente | irrelevante |

Portanto **não** é: host errado, rede, grant ausente, espaço no token nem indisponibilidade.
O PAM do pooler recusa o par (usuário `postgres` + token como senha) mesmo com o grant gravado.

## Hipóteses, da mais para a menos provável (nenhuma confirmada sem o secret)

1. **O dono do PAT não é o `user_id` do grant.** O workflow concede JIT ao `vars.SUPABASE_BACKUP_USER_ID`
   (PUT) mas autentica com o PAT. Se o PAT pertence a outra conta, a API aceita (tem permissão de
   gerenciar) e o PAM recusa.
2. **PAT revogado/de outra organização** que ainda consegue chamar a API do projeto por herança de permissão
   (menos provável: o GET devolveu 200).
3. **Propagação do grant ao Supavisor** mais lenta que os 15 s de espera do workflow (o workflow já testa isso).
4. **JIT não habilitado para o papel `postgres` neste plano (Free)**: o PUT/GET aceitam, mas o PAM não honra.
   Se esta for a causa, o caminho JIT é inviável no plano atual e é preciso outra estratégia
   (ver "Alternativas").

## Qual secret/variável corrigir e onde é usado

| Item | Tipo | Usado em |
|---|---|---|
| `SUPABASE_BACKUP_JIT_PAT` | secret do GitHub | `backup-scheduled.yml` (PUT/GET JIT e senha do pooler), e demais workflows de backup |
| `SUPABASE_BACKUP_USER_ID` | variable do GitHub | `backup-scheduled.yml`, corpo do PUT (`user_id`) |
| `SUPABASE_PROJECT_REF` / `SUPABASE_PROJECT_REGION` | env do workflow | montagem do usuário `postgres.<ref>` e do host do pooler |

## Como validar sem expor credenciais (ação sua)

```bash
export SUPABASE_BACKUP_JIT_PAT='…'              # mesmo valor do secret; não grave em arquivo
export SUPABASE_PROJECT_REF='kbabmewnahysfvlybiak'
export SUPABASE_BACKUP_USER_ID='<valor de vars.SUPABASE_BACKUP_USER_ID>'
bash scripts/backup-jit-diagnose.sh
```

O script só faz leituras (GET) e um `select 1`; imprime código HTTP, comprimento e veredito, nunca o token.
O passo 5 (conexão) só passa com um grant ativo (janela de 10 min): dispare o workflow
`backup-scheduled` manualmente e rode o script durante a janela, ou conceda pelo painel.

Leitura do resultado:

- Passo 2 ≠ 200 → PAT inválido/expirado: gerar novo PAT (hipótese 2).
- Passo 3/4 apontando divergência de usuário → alinhar `SUPABASE_BACKUP_USER_ID` ao dono do PAT, ou gerar o PAT
  na conta correta (hipótese 1).
- Tudo coerente e passo 5 falha → hipóteses 3/4: abrir ticket de suporte Supabase citando "JIT/PAM no pooler,
  plano Free" e considerar as alternativas.

## Alternativas se o JIT não for viável no plano atual

- Senha do banco do projeto (Settings → Database) em secret dedicado, conexão pelo pooler em modo sessão, sem JIT;
  exige rotação consciente da senha — **decisão sua**.
- Upgrade para plano com backups gerenciados/PITR.
- `supabase db dump` via CLI com `SUPABASE_ACCESS_TOKEN` (caminho já citado no runbook canônico).

## Critério de aceite

Um run verde de `backup-scheduled` com artefato cifrado, `Backup freshness monitor` passando (< 25 h) e um
restore drill do artefato **de produção**. Enquanto isso, o gate `BACKUP_PRODUCTION_PENDING` permanece.

## Lacuna de escopo a tratar na Ordem 2

O restore documentado carrega `public`, `auth.users` e `auth.identities` e filtra o resto de `auth` e `storage`.
Arquivos/imagens do Storage não estão cobertos por este backup: declarar recuperação completa só após
incluir (ou backupear à parte) os objetos do Storage.
