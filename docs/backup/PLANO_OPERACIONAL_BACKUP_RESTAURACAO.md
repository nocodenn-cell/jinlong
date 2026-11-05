# Plano operacional de backup e restauração

Base: scripts e documentação já existentes no repositório. Esta etapa não executou backup de produção, não contratou serviço e não alterou o plano Supabase.

## 1. O que existe no repositório

| Arquivo | Função | Limitação |
|---|---|---|
| `backup.sh` (raiz) | `pg_dump -Fc` com retenção local de 7 dias em `/var/backups/fastproduct` | Sem criptografia, sem SHA-256, sem envio externo, sem registro de sucesso/falha. |
| `backend/scripts/backup-age-postgres.sh` | Dump com criptografia `age` em fluxo, sem dump em claro no disco, usando Postgres 17 descartável em Docker | Depende de Docker disponível; não conecta direto ao Supabase. Testado conforme `docs/auditorias/GO-LIVE-02-*`. |
| `backend/scripts/backup-ro-postgres.sh` + `sql/backup-ro-criar.sql` | Usuário somente leitura para dump | Precisa de credencial e de liberação no Supabase. |
| `backend/scripts/fiscal-janela-postgres.sh` | Janela fiscal com restore descartável | Específico para o módulo fiscal. |
| `docs/runbooks/BACKUP_RESTORE_CANONICO.md` | Runbook | Declara **RPO diário não garantido** no plano atual. |
| `docs/auditorias/GO-LIVE-02-*.md` | Relatórios de backup criptografado e restauração | Registram PASS em ambiente local. Não comprovam rotina em produção. |

**Documentação informa:** plano Free do Supabase, sem PITR, sem backup programado comprovado. A **consulta de plano/backup pela API não foi feita nesta etapa**; confirmar no painel.

**Pasta `backup/` do relatório anterior** (`backup_pgdump.sh`, `restore_isolado.sh`) **não está no repositório**. Usar os scripts acima como base.

## 2. Estratégia proposta

| Item | Proposta |
|---|---|
| Frequência | Diária, janela de baixa carga (ex.: 03:00 BRT). Adicional antes de cada migration em produção. |
| Formato | `pg_dump -Fc` (custom) com `--no-owner --no-privileges` para restauração portátil. |
| Criptografia | `age` com chave pública; chave privada **fora** do projeto e fora do mesmo host (cofre de senhas). |
| Integridade | SHA-256 do arquivo cifrado e do dump em claro (quando gerado); registro em `backup_manifest.json`. |
| Retenção | 7 diárias, 4 semanais, 12 mensais. Ajustar ao espaço disponível. |
| Armazenamento externo | Ao menos um destino fora do projeto/provedor: disco externo rotativo **ou** storage de objetos com versão. |
| Registro | Log estruturado (sucesso/falha, duração, tamanho, SHA-256). |
| Alerta | Falha ou ausência de backup do dia dispara notificação (e-mail/Slack) — o que for disponível sem custo. |
| Restauração de teste | Mensal (e antes de cada migration de risco): restore em Postgres descartável, contagem de tabelas, policies, functions e triggers iguais à origem, SHA-256 anotado. |
| Controle de acesso | Usuário de backup somente leitura; credencial em variável de ambiente ou cofre; nunca em repositório (`gitleaks` já existe). |

## 3. RPO e RTO propostos

| Cenário | RPO | RTO |
|---|---|---|
| Plano atual (Free, sem rotina comprovada) | **Indefinido** (até 24 h na melhor hipótese, sem garantia) | Indefinido |
| Após rotina diária automatizada (sem custo extra) | 24 h | 4 h (restauração em Postgres próprio + reapontar app) |
| Com PITR (plano pago do Supabase) | Minutos | 1–2 h |

O RPO de 24 h é o máximo aceitável para a operação atual **somente depois** de a rotina rodar com alerta e teste mensal. Antes disso, o RPO é **desconhecido** e é esse o risco principal.

## 4. O que pode ser automatizado sem custo adicional

- `pg_dump` diário em máquina própria ou runner agendado, usando `backup-ro-postgres.sh`.
- Cifragem com `age` (software livre).
- SHA-256 e manifesto.
- Cópia para disco externo ou pasta sincronizada com versionamento.
- Teste de restauração mensal com Docker local (já validado no GO-LIVE-02).
- Alerta por e-mail via script (se houver SMTP existente).

## 5. Limitações que exigem infraestrutura ou contratação

- Backup com PITR e restauração de ponto no tempo: exige upgrade de plano Supabase (decisão e compra do usuário).
- Destino geograficamente separado com SLA: exige storage contratado.
- Execução contra produção: exige credencial de usuário read-only e autorização explícita.

## 6. Procedimento de recuperação (resumo)

1. Declarar incidente e congelar escritas (modo manutenção do PDV, se aplicável).
2. Identificar o último backup íntegro (SHA-256 confere).
3. Decifrar em ambiente isolado.
4. Restaurar em Postgres novo; comparar contagens e policies com o manifesto.
5. Validar fluxos críticos (venda, caixa, fechamento) em homologação com esse restore.
6. Só então promover, com aprovação de quem responde pelo negócio.

Não restaurar por cima de produção sem plano de reconciliação das vendas feitas após o último backup (o PDV offline pode ter dados pendentes no SQLite local — preservar esses dados).

## 7. Pendências de autorização

- Credencial do usuário de backup (read-only) e destino externo.
- Confirmação do plano Supabase e de backups automáticos no painel.
- Decisão de upgrade (compra do usuário).
- Chave privada `age` e senha de cofre.
