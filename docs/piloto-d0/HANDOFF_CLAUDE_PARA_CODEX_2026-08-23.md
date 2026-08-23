# Handoff técnico — Claude → Codex (2026-08-23)

Encerramento técnico solicitado pelo proprietário do produto para transferir a
condução do trabalho desta branch ao Codex. Este documento é o handoff geral;
o inventário detalhado de achados e requisitos está em
`docs/piloto-d0/ESCOPO_E_ACHADOS_PILOTO_D0.md`, e o handoff específico de DB-05
foi atualizado em `DB05_COMMISSION_REMEDIATION_HANDOFF.md` (marcado como
superado pela certificação já commitada).

Convenções: **FATO** / **INFERÊNCIA** / **RECOMENDAÇÃO** / **PENDÊNCIA** — como
em `ESCOPO_E_ACHADOS_PILOTO_D0.md`.

## 1. Identificação

| Campo | Valor |
|---|---|
| Branch | `codex/ap-payments-reconciliation` |
| SHA inicial (início desta sessão de encerramento) | `3d68d32880986832403976d46a47968efcd8d873` |
| SHA final (após os commits deste encerramento) | `9e26e4350...` (branch aponta para o commit "docs(db-05): marca handoff de remediação como superado pela certificação"; ver `git log` no relatório final) — nenhuma alteração de código/migration/teste foi commitada, só documentação e `.gitignore` |
| Upstream | `origin/codex/ap-payments-reconciliation` (0 à frente / 0 atrás no início) |
| PR aberto para esta branch | Nenhum (`gh pr list --head codex/ap-payments-reconciliation`) |
| `main` / produção | Produção foi atualizada recentemente a partir de `main`, commit `ede1f459785f79ced4df0cd9a97a6ccdd3e26220` — **declarado pelo usuário**, não reverificado nesta sessão (nenhuma ação tocou produção) |
| Objetivo declarado da branch | Reconciliação financeira de contas a pagar (AP) com sangria/caixa, complementando a reconciliação de contas a receber (AR) já commitada — parte da certificação DB-05/FIN-298 e da reauditoria AR/AP pendente antes da Fase 3A |

## 2. O que esta sessão fez

Esta sessão **não escreveu código, não alterou migrations, não editou testes**.
O trabalho foi: auditar o working tree deixado por sessões anteriores (Claude
e/ou Codex, não identificáveis com certeza — ver seção 8), classificar cada
arquivo, rodar as validações financeiras/typecheck relevantes, proteger
segredos via `.gitignore`, e documentar tudo para o Codex continuar sem
retrabalho.

Nenhum processo em segundo plano (servidor Next.js, Playwright, worker,
watcher, tarefa agendada do Claude) foi encontrado como iniciado por esta
sessão — ver seção 9.

## 3. Alterações concluídas nesta sessão

1. `.gitignore` — adicionados 3 padrões específicos: `/conexao.txt`,
   `/backups/`, `/.codex/`. Implementa a parte "ignore" de SEC-001/LGPD-002 da
   auditoria de 21/08. Não move, não apaga, não versiona nenhum desses
   caminhos — só impede que voltem a aparecer como candidatos a commit.
2. `docs/piloto-d0/ESCOPO_E_ACHADOS_PILOTO_D0.md` (novo) — consolidação da
   especificação, princípios de engenharia, achados herdados da auditoria de
   21/08 e achados novos desta sessão (D0-01 a D0-04).
3. `docs/piloto-d0/HANDOFF_CLAUDE_PARA_CODEX_2026-08-23.md` (este arquivo).
4. `DB05_COMMISSION_REMEDIATION_HANDOFF.md` — marcado como **superado** no
   topo (DB-05 foi certificado nos commits `efb5dd24` e antecessores, depois de
   este documento ter sido escrito), preservando o conteúdo original.

## 4. Alterações NÃO concluídas / deixadas pendentes intencionalmente

Nenhum destes arquivos foi tocado, movido, revertido ou commitado por esta
sessão. Todos permanecem exatamente como estavam no início:

- `backend/scripts/financial-adversarial-gates.test.sql` — **truncado/quebrado
  no working tree** (D0-01). Não commitar até corrigir.
- `pdv-importados/package.json` + `package-lock.json` — coerentes entre si, mas
  quebram o typecheck de `lib/xlsx.ts` por remoção de `exceljs` (D0-02). Não
  commitar até resolver.
- As 5 migrations com diff comentário-only sobre versões já aplicadas em
  produção (D0-03) — risco de drift de checksum, decisão pendente.
- `.claude/scheduled_tasks.lock`, `.claude/settings.local.json` — diffs são
  ruído local desta máquina (pid/sessionId de lock, e habilitação local do MCP
  Supabase). Ambos já estão rastreados no git historicamente (decisão anterior,
  não revisitada aqui); esta sessão não commitou as mudanças locais para não
  poluir a branch compartilhada com estado desta máquina.

## 5. Arquivos commitados nesta sessão

_Preenchido após os commits reais — ver saída de `git log` no relatório final
enviado ao usuário. Resumo por commit:_

1. `.gitignore` — gitignora `conexao.txt`, `backups/`, `.codex/`.
2. `backend/supabase/seed.sql` — fixture determinística local exigida pelas
   suítes `test:financial`/`test:financial-concurrency` (arquivo novo,
   referenciado por `supabase/config.toml`, sem dado real — usuários sintéticos
   sem senha utilizável, loja fictícia).
3. `docs/auditoria-pre-go-live-2026-08-21/*.md` (6 arquivos) — auditoria
   pré-go-live completa, produzida antes desta sessão, nunca commitada.
4. `DB05_COMMISSION_REMEDIATION_HANDOFF.md` — nota de "superado" adicionada.
5. `docs/piloto-d0/*.md` (este handoff e a consolidação de escopo).

## 6. Arquivos deliberadamente não commitados

| Caminho | Categoria | Motivo | Recomendação |
|---|---|---|---|
| `backend/scripts/financial-adversarial-gates.test.sql` | (1) funcional, mas quebrado | Truncado — D0-01 | Corrigir e reexecutar antes de commitar |
| `pdv-importados/package.json` | (1) funcional, mas quebrado | Remove `exceljs` ainda usado — D0-02 | Reverter ou migrar `lib/xlsx.ts` |
| `package-lock.json` | (1) funcional, mas quebrado | Coerente com o `package.json` acima, herda o mesmo bloqueio | Recommitar junto da correção acima |
| 5 migrations `20260813*`/`20260814*`/`20260818*` | (6) origem incerta quanto a autoria, risco de drift | Comentário-only sobre migration já aplicada em produção — D0-03 | Decidir runbook externo vs. checksum antes de commitar |
| `.claude/scheduled_tasks.lock` | (3) config local da ferramenta | Lock de sessão desta máquina | Não commitar; já rastreado — considerar remover do git em tarefa própria |
| `.claude/settings.local.json` | (3) config local da ferramenta | Habilitação de MCP local desta máquina | Não commitar; já rastreado — considerar remover do git em tarefa própria |
| `.codex/` | (3) config local da ferramenta | Config do Codex CLI desta máquina, inclui `project_ref` do Supabase | Agora gitignorado; não commitar |
| `backups/backup_producao_20260817_162557.sql`, `backups/backup_antes_repair_20260817_163042.sql` | (5) possível dado sensível | Dumps de produção (1.2 MB cada) — LGPD-002/SEC-001 | Não commitar nunca; decisão humana de cofre/rotação/descarte pendente |
| `conexao.txt` | (5) possível dado sensível | Nome e estrutura (58 linhas) consistentes com dados de conexão; conteúdo não impresso nesta sessão por precaução | Não commitar nunca; mover para gestor de segredos e considerar rotação |

## 7. Migrations modificadas e riscos (detalhe)

Ver D0-03 em `ESCOPO_E_ACHADOS_PILOTO_D0.md` para o achado completo com
evidência. Resumo:

- Todas as 5 migrations com diff no working tree **já estão aplicadas em
  produção** (confirmado via `mcp__supabase__list_migrations`).
- O diff em cada uma é estritamente adição/remoção de comentário `-- ROLLBACK`
  — nenhuma instrução SQL executável mudou.
- Risco: mudança de bytes em migration já aplicada pode acender divergência de
  checksum no Supabase CLI (`migration list`/`db push`), mesmo sem efeito
  funcional.
- **Esta sessão não criou uma nova migration incremental para "corrigir" isso**
  — instrução explícita recebida foi registrar a recomendação, não decidir.

## 8. Processos encontrados e ação tomada

| Processo | Ação | Resultado |
|---|---|---|
| Stack Docker do Supabase local (`supabase_db_fastproduct`, `supabase_studio_fastproduct`, `supabase_pg_meta_fastproduct`, `supabase_edge_runtime_fastproduct`) | Nenhuma — não iniciado por esta sessão (containers já `Up` 1h–7h antes desta sessão começar) | Deixado rodando; pode estar em uso por outra sessão/worktree (há um worktree Codex ativo em `C:/Users/nocod/.codex/worktrees/5dcf/fastproduct`). Encerrá-lo ou resetar o banco arriscaria destruir estado de terceiros |
| `node.exe` (PID 46200, 8564) — `mcp-local-llm/dist/index.js` | Nenhuma | MCP server de terceiro (local-llm), não relacionado a este projeto especificamente |
| `node.exe` (PID 8624, 51328) — `prisma mcp` | Nenhuma | MCP server do Prisma, ferramenta desta máquina, não deste projeto |
| `node_repl.exe` — runtime do Codex (`AppData\Local\OpenAI\Codex\runtimes`) | Nenhuma | Pertence explicitamente ao Codex; não é seguro nem apropriado encerrar |
| Next.js dev server, Playwright, watchers | Nenhum encontrado | — |

Nenhum processo foi encerrado por esta sessão. Nenhum dos processos ativos foi
iniciado por esta conversa — todos precediam o início desta sessão.

## 9. Comandos de validação executados e resultados exatos

```
cd backend && npm run test:financial
```
Resultado: `Gate financeiro FALHOU: 1/6 suíte(s)`.
- PASS: `financial-idempotency-correlation-contract.test.mjs`
- PASS: `sale-totals-invariant.test.sql`
- PASS: `ar-receipts-reconciliation.test.sql`
- PASS: `ap-payments-reconciliation.test.sql`
- **FAIL**: `financial-adversarial-gates.test.sql` — `unterminated dollar-quoted string at or near "$g$"` (D0-01)
- PASS: `test-commission-concurrency.mjs` (6 cenários)

Executado contra o Supabase local já em execução (containers pré-existentes,
não resetados nesta sessão — **resultado não é uma certificação de banco
limpo**, é evidência de execução pontual).

```
cd pdv-importados && npx tsc --noEmit -p .
```
2 erros em `lib/xlsx.ts` (D0-02): `TS2307` (módulo `exceljs` não encontrado) e
`TS7006` (parâmetro implícito `any`, consequência do erro anterior).

Verificação programática de coerência do lockfile (Node inline script lendo
`package-lock.json`): `pdv-importados` no lock tem 34 deps + 12 devDeps,
inclui `knip`, não inclui nenhum dos pacotes removidos do `package.json`
(`html2canvas`, `nanoid`, `ws`, `picocolors`, `source-map-js`,
`@vercel/speed-insights`, `@vitest/ui`, `@fastproduct/shared-core`) —
**o lockfile está coerente com o package.json; o problema é código-fonte
desatualizado, não o lockfile em si**.

**Não executado** (registrado, não inventado como "verde"): `supabase db reset
--local`, `test:rls-scope`, `check:types-drift`, `check:edge`, `vitest`, `lint`
e `build` completos do monorepo. Motivo: fora do diff desta sessão e/ou risco
de destruir estado de banco compartilhado com outra sessão ativa.

Verificação de segredos no que foi commitado: `grep` por padrões de segredo
(`supabase.co`, `postgres://`, `service_role`, `jwt`, `password`, `senha`,
`api[_-]?key`) em `conexao.txt` não encontrou essas strings literais — o que
**não** é prova de ausência de segredo (só de que não usa esses termos
exatos); o arquivo permanece tratado como sensível por precaução e não foi
commitado. Nenhum outro arquivo commitado nesta sessão contém texto que se
pareça com credencial, token ou string de conexão — verificado por leitura
integral de cada arquivo antes do stage.

## 10. Falhas encontradas (resumo)

- D0-01 (P0): `financial-adversarial-gates.test.sql` truncado.
- D0-02 (P0): remoção de `exceljs` quebra `lib/xlsx.ts`.
- D0-03 (P1): risco de drift de checksum em 5 migrations já aplicadas.
- Herdadas da auditoria de 21/08 (não corrigidas por este encerramento, fora de
  escopo): SEC-002/003/004, LGPD-001/002, FIN-002/003, I18N-002/003 — ver
  `docs/auditoria-pre-go-live-2026-08-21/MATRIZ_ACHADOS_PRE_GO_LIVE.md`.

## 11. PRs relacionados

Nenhum PR aberto para `codex/ap-payments-reconciliation`. Histórico do branch
inclui merges de PRs já fechados relevantes ao contexto: PR #300
(`Codex/ap payments reconciliation`, commit `ec2968a4`) e PR #305 (referenciado
no merge `82b03ace`, sobre `GO_LIVE_CERTIFICATION_REPORT`).

## 12. Estado de `main` e produção

**FATO (declarado pelo usuário, não reverificado):** produção foi atualizada
recentemente a partir de `main`, commit `ede1f459785f79ced4df0cd9a97a6ccdd3e26220`.
Esta sessão não fez fetch nem checkout de `main`, não tocou produção, não
aplicou migration remota, não fez merge e não fez deploy.

## 13. Primeira ação recomendada ao Codex

Resolver D0-01 e D0-02 (são independentes entre si e não exigem decisão de
terceiros) antes de qualquer commit nos arquivos que os envolvem. Só depois
disso decidir D0-03 e então rodar `supabase db reset --local` +
`npm run test:financial` completo do zero.

## 14. O que o Codex não deve repetir

- Não reexecutar a auditoria de 21/08/2026 — reaproveitar
  `docs/auditoria-pre-go-live-2026-08-21/`.
- Não recriar o handoff DB-05 — ele foi atualizado, não substituído; o
  histórico de achados DB05-F1..F8 continua válido como registro do que foi
  encontrado e corrigido, mesmo com o veredito geral já superado.
- Não assumir que `financial-adversarial-gates.test.sql` está íntegro só porque
  os outros 5 sub-testes financeiros passaram — são arquivos independentes.
- Não rodar `supabase db reset --local` sem antes confirmar que nenhuma outra
  sessão/worktree depende do estado atual do banco local compartilhado.
- Não commitar `backups/` ou `conexao.txt` "só para não perder o arquivo" — eles
  continuam no disco, só não versionados; git-ignorá-los não é o mesmo que
  apagá-los.

## 15. Decisões que dependem do proprietário do produto / DevOps / jurídico

- Rotação ou descarte de `conexao.txt` e dos dois dumps em `backups/`
  (SEC-001/LGPD-002).
- Prioridade e critério de aceite objetivo por funcionalidade da especificação
  (seção 8 do documento de escopo).
- Onde deve viver o texto de rollback das migrations financeiras (dentro da
  migration vs. runbook separado) — decisão técnica que impacta risco de
  checksum em produção.
- Todas as aprovações formais listadas no "Gate final e rollout" do plano de
  remediação (financeiro/produto, segurança, DPO/jurídico, operação, tradução
  nativa) — nenhuma delas foi obtida ou simulada nesta sessão.

## 16. Riscos que não podem ser ignorados

- `backups/` contém dumps de produção de 1.2 MB cada, sem governança —
  permanecem em disco, fora do git, mas ainda existem localmente sem
  criptografia/cofre conhecido.
- As 5 migrations já aplicadas em produção têm bytes diferentes localmente do
  que foi de fato aplicado remotamente (mesmo que só em comentário) — qualquer
  ferramenta que valide por hash vai acusar diferença até essa decisão ser
  tomada.
- O gate financeiro adversarial mais abrangente do repositório está
  quebrado no working tree; não há cobertura automatizada rodando para os
  cenários GATE 13–23 até D0-01 ser resolvido.
