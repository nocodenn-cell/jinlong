# Encerramento formal — Sprint backup/restore via Temporary Access/JIT (itens 18–21)

> **Atualização de status — 2026-10-15 (verificada com `gh run list`; o texto abaixo, de 2026-09-07, fica como histórico e não foi alterado).**
>
> - O bloqueio descrito aqui era do **caminho JIT/PAM**. O workflow `Backup automatico (item 19)` (`backup-scheduled.yml`) hoje usa `supabase db dump` via CLI (os passos de JIT aparecem como `skipped` no run). A troca veio no Sprint 0 (PR [#501](https://github.com/nocodenn-cell/fastproduct/pull/501), mesclado em `main` em 2026-10-08).
> - Execuções agendadas do workflow, todas `success`: 2026-10-09, 10, 11, 12, 13, 14 e 15 (a mais recente: [38725776712](https://github.com/nocodenn-cell/fastproduct/actions/runs/38725776712)). As de 2026-10-04 a 2026-10-08 ainda falharam.
> - `Backup freshness monitor` também ficou `success` de 2026-10-10 a 2026-10-15 (última: [38739034502](https://github.com/nocodenn-cell/fastproduct/actions/runs/38739034502)).
> - Etapas do run de 2026-10-15 com sucesso: dump (roles/schema/data), manifesto de sanidade, cifragem `age`, checksum SHA-256 e publicação do artifact.
> - **Itens 18 e 19: backup agendado e cifrado em execução, por outro caminho que não o JIT.** O `EXTERNAL-BLOCKER-SUPABASE-JIT` continua sem solução na Supabase, mas deixou de bloquear o backup.
> - **Itens 20 e 21 (restore drill e RPO/RTO) seguem sem prova em CI:** o workflow `Restore drill (item 20)` não tem nenhuma execução registrada. Existe um ensaio de restore **local** (Sprint 0, 2026-10-08, 87/87 tabelas com contagem idêntica; ver `docs/piloto-d0/SPRINT0_EVIDENCIAS_2026-10-08.md` §1), mas RTO não foi cronometrado formalmente neste registro.
> - Não verificado aqui: o conteúdo do artifact nem a restaurabilidade de um dump publicado pelo agendamento.

**Data:** 2026-09-07
**Status:** **20/24 itens do Plano Mestre de Fechamento dos Gaps concluídos. Itens 18–21
permanecem BLOCKED por dependência externa da Supabase (Temporary Access/JIT/Supavisor).**
**Não declarar 24/24.** Nenhum backup real foi produzido. Nenhum restore real foi comprovado.

---

## 1. O que foi concluído

PR [#389](https://github.com/nocodenn-cell/fastproduct/pull/389) implementou a arquitetura completa
(workflow `backup-scheduled.yml`, workflow `backup-restore-test.yml`, cifragem `age`, checksum
SHA-256, publicação de artifact) para os itens 18–20 do Plano Mestre, e o restante do plano (20/24
itens) foi concluído em sprints anteriores. **A implementação de código está completa e correta na
medida do que foi possível validar** — o bloqueio não está no workflow, está numa dependência
externa da plataforma Supabase, descrita abaixo.

## 2. O que está BLOCKED e por quê

Itens **18, 19, 20 e 21** (backup automatizado, restore drill isolado, e a medição de RPO/RTO que
depende de um restore real) dependem de uma conexão Postgres real via **Temporary Access/JIT** da
Supabase — o mecanismo oficial documentado para autenticar uma GitHub Action sem senha permanente
de banco. Essa conexão nunca foi estabelecida com sucesso: toda tentativa termina em

```
FATAL: PAM authentication failed for user "postgres"
```

contra `aws-1-sa-east-1.pooler.supabase.com` — o cluster correto do projeto `kbabmewnahysfvlybiak`
(confirmado por reconhecer o tenant; `aws-0` responde `tenant/user ... not found`, cluster errado).

## 3. O que foi investigado (evidência, não suposição)

Toda hipótese abaixo foi testada com evidência direta — reproduzida ao vivo, contra a documentação
oficial e/ou o OpenAPI spec atual da Supabase, ou contra logs server-side (`supavisor_logs` via
MCP `query_logs`) — nunca por suposição.

| # | Área investigada | Método | Resultado |
|---|---|---|---|
| 1 | Escopo do PAT (`Database JIT: Read` → `Read-write`) | Confirmado contra o OpenAPI spec ao vivo (`x-fga-permissions: database_jit_write` no `PUT`) | Necessário; corrigido pelo usuário (rotação do PAT `ci-backup-jit-v2`) |
| 2 | `user_id` (`SUPABASE_BACKUP_USER_ID`) | `GET /database/jit` autenticado feito manualmente pelo dono do PAT, comparado ao valor configurado | Correto — descartado |
| 3 | Campo `user_roles` vs `roles` no corpo do `PUT` | Testado ao vivo: `user_roles` → HTTP 400; `roles` → HTTP 200 | Corrigido ([#391](https://github.com/nocodenn-cell/fastproduct/pull/391)) |
| 4 | Valor `jit=on` vs `jit=true` na connection string | Doc oficial ao vivo (`supabase.com/docs/guides/platform/temporary-access`), aplicado | Corrigido ([#392](https://github.com/nocodenn-cell/fastproduct/pull/392)) — necessário, não suficiente |
| 5 | `allowed_networks`/CIDR ausente no grant | `0.0.0.0/0` explícito, persistência confirmada via `GET` | Sem efeito no erro — descartado, mantido como hardening ([#395](https://github.com/nocodenn-cell/fastproduct/pull/395)) |
| 6 | Host do pooler escolhido por `pg_isready` (`aws-0` vs `aws-1`) | DNS puro provou clusters diferentes (ELBs distintos); descoberta reescrita para testar autenticação real por candidato | `aws-1` é o cluster correto — muda a classe do erro, de "tenant not found" para "PAM auth failed" ([#396](https://github.com/nocodenn-cell/fastproduct/pull/396)) |
| 7 | `Enforce SSL on incoming connections` | Verificado no Dashboard pelo dono do projeto | ON — descartado |
| 8 | Toggle de projeto `Temporary Access` (`state: enabled/disabled/unavailable`) | Verificado no Dashboard pelo dono do projeto | Habilitado — descartado |
| 9 | Espaço em branco/nova linha no valor do PAT (secret do GitHub) | Diagnóstico seguro (comprimento + regex, nunca imprime o valor): 44 caracteres, sem espaço | Descartado ([#397](https://github.com/nocodenn-cell/fastproduct/pull/397)) |
| 10 | Caractere reservado não percent-encoded na URI `postgres://user:PAT@host/...` | Percent-encoding (`jq @uri`) aplicado ao PAT antes de embutir na URI | Erro idêntico antes/depois — descartado ([#397](https://github.com/nocodenn-cell/fastproduct/pull/397)) |
| 11 | Propagação atrasada entre a API de Management (plano de controle) e o Supavisor (plano de dados) | Espera de 15s entre a confirmação do grant (`GET`) e a primeira tentativa real de conexão | Erro idêntico — descartado ([#398](https://github.com/nocodenn-cell/fastproduct/pull/398)) |

## 4. Erro final, reproduzível de forma estável

```
aws-0-sa-east-1.pooler.supabase.com → FATAL: (ENOTFOUND) tenant/user postgres.kbabmewnahysfvlybiak not found
aws-1-sa-east-1.pooler.supabase.com → FATAL: PAM authentication failed for user "postgres"
```

`aws-1` reconhece o tenant (prova de host/região/projeto/roteamento corretos) mas rejeita, na
camada PAM, o mesmo PAT que: (a) autoriza o grant via `PUT /database/jit` (HTTP 200); (b) confirma
o grant via `GET /database/jit` (HTTP 200, `user_id`/`role`/`expires_at`/`allowed_networks`
corretos); (c) é o PAT que o dono do projeto usou para fazer o `GET` de verificação manual que
confirmou o `user_id`.

## 5. Runs de referência (GitHub Actions, `backup-scheduled.yml`)

| Run | O que mudou antes desta run | Resultado |
|---|---|---|
| [33915353500](https://github.com/nocodenn-cell/fastproduct/actions/runs/33915353500) | Baseline, PAT `Database JIT: Read` | `HTTP 403` no `PUT` |
| [34119579765](https://github.com/nocodenn-cell/fastproduct/actions/runs/34119579765) | PAT rotacionado para `Read-write` | `HTTP 400 roles: expected array` (campo `user_roles`) |
| [34120079170](https://github.com/nocodenn-cell/fastproduct/actions/runs/34120079170) | #391 (`roles`) | `tenant/user not found` (`jit=on`, `aws-0`) |
| [34120736171](https://github.com/nocodenn-cell/fastproduct/actions/runs/34120736171) | #392 (`jit=true`) | `tenant/user not found` (`aws-0`, sem `allowed_networks`) |
| [34122262013](https://github.com/nocodenn-cell/fastproduct/actions/runs/34122262013) | #395 (`allowed_networks=0.0.0.0/0`, confirmado via GET) | `tenant/user not found` (`aws-0`, discovery ainda por `pg_isready`) |
| [34122946170](https://github.com/nocodenn-cell/fastproduct/actions/runs/34122946170) | #396 (discovery por autenticação real) | **Breakthrough**: `aws-0` → tenant not found; `aws-1` → `PAM authentication failed` |
| [34150294418](https://github.com/nocodenn-cell/fastproduct/actions/runs/34150294418) | #397 (percent-encoding + diagnóstico de espaço em branco) | Mesmo erro em `aws-1`; sem espaço em branco no PAT (44 caracteres) |
| [34150700813](https://github.com/nocodenn-cell/fastproduct/actions/runs/34150700813) | #398 (espera de 15s por propagação) | Mesmo erro em `aws-1` |

## 6. PRs desta investigação (todos mesclados em `main`, todos verificados via CI antes do merge)

| PR | Correção | SHA de merge |
|---|---|---|
| [#389](https://github.com/nocodenn-cell/fastproduct/pull/389) | Implementação original (itens 18–20) | `74e7dd8f0e0adf4bc1fd57e0ffc6aca30e9a03ee` |
| [#391](https://github.com/nocodenn-cell/fastproduct/pull/391) | Campo `roles` (não `user_roles`) no corpo do `PUT` | `41193cde5bb50e5fe2a4b003a9c625cb1d02f52d` |
| [#392](https://github.com/nocodenn-cell/fastproduct/pull/392) | `jit=true` (não `jit=on`) na connection string | `2ff1c7cee73b2e7768317e81569c4243f49c4b5d` |
| [#395](https://github.com/nocodenn-cell/fastproduct/pull/395) | `allowed_networks` explícito (`0.0.0.0/0`) + `GET` de diagnóstico | `20857e9d9328a4cfec5c269e571f505c2ddef85f` |
| [#396](https://github.com/nocodenn-cell/fastproduct/pull/396) | Descoberta do host do pooler por autenticação real, não `pg_isready` | `48f0dd63462e6d360443d1bbc0b14ebc3a2dd411` |
| [#397](https://github.com/nocodenn-cell/fastproduct/pull/397) | Percent-encoding do PAT + diagnóstico seguro de espaço em branco | `f829e570854a250f287fbdde73713a5a8c8b5baf` |
| [#398](https://github.com/nocodenn-cell/fastproduct/pull/398) | Espera de 15s por propagação do grant ao Supavisor | `62043026109a475c1cb9bee44001443e6114d050` |

Todas as correções de código acima são reais, corrigem defeitos genuínos do workflow (confirmados
por antes/depois empírico) e permanecem em `main` — não são revertidas por este encerramento. O
que resta bloqueado é especificamente a camada de autenticação PAM do Supavisor durante uma sessão
de Temporary Access, algo fora do alcance de qualquer mudança no workflow.

## 7. Pendência registrada

**`EXTERNAL-BLOCKER-SUPABASE-JIT`** — bloqueio externo, dependente da plataforma Supabase
(Temporary Access/JIT/Supavisor, feature `[Beta]` na especificação OpenAPI oficial
`v1-get-jit-access-config`/`v1-update-jit-access-config`). Retomar itens 18–21 por um dos dois
caminhos:

1. **Suporte oficial da Supabase**: abrir ticket anexando a evidência da seção 3–6 deste documento
   (grant confirmado via API, PAM rejeitando o mesmo token, cluster correto identificado). Verificar
   também, antes de abrir o ticket, se a regra "naturecode / nocodenn@gmail.com" no Dashboard
   (Database Settings → Temporary Access) já reflete `0.0.0.0/0` após as ~8 execuções desta
   investigação, ou se ainda mostra a restrição de IP original — evidência adicional de possível
   dessincronia entre a API de Management e o que o Supavisor de fato aplica.
2. **Mudança deliberada de arquitetura de backup**: avaliar o mecanismo nativo de backups
   gerenciados da Supabase (`GET/PUT /v1/projects/{ref}/database/backups*`, escopo
   `backups_read`/`backups_write` — API real, confirmada no OpenAPI spec, sem depender de
   Temporary Access/JIT) como substituto ou complemento à arquitetura atual — decisão de produto,
   não decidida nesta sprint.

Nenhuma das duas ações foi executada nesta sessão — ambas exigem decisão humana explícita
(abertura de ticket com dados do projeto, ou mudança de arquitetura aprovada separadamente) fora
do escopo deste encerramento documental.

## 8. Veredito

```
Itens do Plano Mestre    → 20/24 DONE
Itens 18–21              → BLOCKED (EXTERNAL-BLOCKER-SUPABASE-JIT)
Backup real produzido    → NÃO
Restore real comprovado  → NÃO
24/24                    → NÃO DECLARADO
Pendência registrada     → EXTERNAL-BLOCKER-SUPABASE-JIT (retomar via suporte Supabase ou
                            mudança de arquitetura — decisão humana futura)
```

SPRINT ENCERRADA — 18–21 PERMANECEM BLOCKED.
