# Auditoria de mods, skills, hooks, agentes e MCPs para o Claude Code (claudemod.com)

Data: 2026-10-14 · Escopo: ferramentas de desenvolvimento do Jinlong ERP + PDV (este repositório).
Nenhuma alteração no código do produto, no banco ou em produção. Nenhum merge na `main`.

## 1. Resumo

| Recurso | Decisão | Motivo principal |
| --- | --- | --- |
| **Context Lens** | **Instalado** (cópia auditada, fixada no commit) | Zero rede/processo/arquivo, zero tokens no modelo; mostra a ocupação do contexto e quantos turnos faltam até a compactação |
| **Launch Codes** | **Instalado** (cópia auditada, fixada no commit) | Bloqueia `supabase db reset`, `vercel --prod`, `git push --force`, `git reset --hard`, `TRUNCATE/DROP` via psql, `curl \| sh`; fail-closed; zero rede |
| Secret Redactor | **Não instalado** | O repositório indicado (`aidojo/secret-redactor`) **não existe** (HTTP 404; a organização `aidojo` tem 0 repositórios públicos). Não há código para auditar |
| GitHub CI Status | **Não instalado** | Mesmo caso: `aidojo/gh-ci-status` não existe. E o app desktop já monitora CI do PR (Auto-fix, `ccd_pr`) |
| PR Tracker | **Não instalado** | `aidojo/cc-pr-tracker` não existe; a implementação homônima (`sezaakgun/cc-pr-tracker`) roda `gh` a cada 60 s, usa `afplay`/`open` (macOS) e duplica o monitor de PR do app desktop |
| Everything Claude Code (ECC) | **Não instalado** | Framework completo: 71 agentes, 311 skills, 97 comandos, 27 hooks; ~15 mil tokens/sessão só de descrições; duplica quase tudo que já está instalado |
| Context Engineering Kit (CEK) | **Não instalado** | 13 plugins, ~89 skills/agentes (~3,7 mil tokens/sessão); sobreposição alta com skills existentes; sem ganho comprovável para o Jinlong |

## 2. Configuração atual auditada

**Versões (Windows 11, PowerShell 7.6.6, Node 24.19, git 2.55, gh 2.100):**

- Claude Code do **app desktop**: `2.1.295` (`%APPDATA%\Claude\claude-code\2.1.295\…\claude.exe`), que é o que roda as sessões do app.
- Claude Code do **PATH** (`npm`, usado no terminal): `2.1.283`. Defasado, mas carrega os mods instalados (verificado nos logs de debug).

**Instalado antes desta auditoria (preservado sem alterações):**

- Plugins de usuário: `typesafe@typesafe-ai`, `frontend-design@claude-plugins-official`.
- Plugins sincronizados do claude.ai: `engineering`, `security-guidance` (hooks de revisão de segurança em edição/commit/push/Stop), `desktop-commander`, `zapier`, `cloudinary`, `figma`, `data`, `design`, `datadog`, `prisma`, `productivity`.
- Skills da organização (`anthropic-skills:*`): `code-reviewer`, `security-review`, `architect-review`, `erp-domain-auditor`, `migration-auditor`, `qa-test-designer`, `release-manager`, `root-cause-investigator`, `staff-engineer` etc.; nove delas desligadas em `skillOverrides`.
- Agente de projeto: `.claude/agents/production-debugger.md`.
- MCPs relevantes: Supabase, Vercel, GitKraken, navegador do app.
- Instruções de projeto: **não há `CLAUDE.md`** no repositório nem em `~/.claude`. Existe `AGENTS.md` no checkout principal (branch `loop/ux-caixa-gold-token`), mas não na `main`.
- CI: `secret-scan.yml` (gitleaks em PR e push na `main`), CIs de backend/pdv-importados/pdv-local, release e backups.

**Achados de segurança na configuração encontrada (2 corrigido e 1 parcialmente mitigado em §8; a leitura indireta de segredos continua aberta):**

1. `.claude/settings.local.json`, que apesar do nome **é versionado no git**, liberava `Bash(cat .env.local)` e `Read(//c//**)`, ou seja, o agente pode ler segredos locais sem perguntar. Isso é exatamente o que o "Secret Redactor" prometia mitigar.
2. A mesma lista libera `mcp__…__apply_migration` e `mcp__…__execute_sql` (Supabase), `Bash(npx supabase *)` e `Bash(git push *)`, sem confirmação.
3. `claude.ps1` (versionado na raiz) aponta o Claude Code para um Ollama local (`qwen2.5-coder:3b`); sem segredo, mas fora do padrão do projeto.

## 3. Catálogo claudemod.com: itens priorizados

O catálogo tem 172 itens (12 mods, 26 skills, 42 MCPs, 10 comandos, 12 agentes, 16 harnesses, 14 hooks, 15 plugins, 15 configs, 10 plugins de IDE). "Mods" são plugins cujo comportamento é TypeScript executado **dentro do processo** do Claude Code (function hooks), **sem sandbox**: têm as mesmas permissões da sessão.

### 3.1 Secret Redactor, GitHub CI Status e PR Tracker (AI Dojo)

- Os três links do catálogo apontam para `github.com/aidojo/*`, que retornam 404 (`gh api repos/aidojo/…`). A organização existe (desde 2015) mas tem 0 repositórios públicos. Os cartões foram "adicionados há 7–8 dias" com estrelas exibidas, mas o código não é verificável.
- **Risco:** um repositório que aparecer depois com esse nome pode não ser o original (sequestro de nome). **Não instalar a partir desses links.**
- Alternativa avaliada para o PR Tracker: `sezaakgun/cc-pr-tracker` (MIT, 737 linhas). Roda `gh` (GraphQL) a cada 60 s por PR, injeta notas no contexto do Claude a cada mudança (custo de tokens), usa `afplay`/`open`/`xdg-open` (sem equivalente no Windows) e `cmux`. **Duplica** o monitor de PR/CI do app desktop. Rejeitado.
- GitHub CI Status: hoje já é coberto pelo monitor de PR do app desktop e por `gh pr checks <n> --watch`.

### 3.2 Launch Codes: instalado

- Fonte real: `OneWave-AI/claude-code-mods`, pasta `launch-codes`, commit `e6da26c` (2026-10-03), MIT. O catálogo o lista sob o card "Burn Meter"/OneWave e também sob AI Dojo (link quebrado).
- Código: `classify.ts` (209 linhas, função pura de classificação), `register.tsx` (214), `fx.ts` (101, sirene WAV e listras). `claude plugin validate`: eventos `session.start`, `tool.call{Bash}`, `command.run`, `ui.render`. Chamadas: `$.audio`, `$.clock`, `$.ui`, `$.state`, `$.command`. **Sem rede, sem processos, sem arquivos, sem chamada de modelo.**
- Exige Claude Code ≥ 2.1.287 segundo o README; o app roda 2.1.295. No 2.1.283 o módulo também carrega.
- Comportamento: hook `tool.call` com `.catch` que **nega** em caso de erro (fail-closed); o código expira em 30 s.

### 3.3 Context Lens: instalado

- Fonte: `Arunjay4213/claude-mods`, pasta `plugins/context-lens`, commit `d4fffd7` (2026-09-15), MIT.
- `claude plugin validate`: eventos `session.start`, `turn.complete`, `session.compact`, `command.run{clear, context-lens}`, `ui.*`. Chamadas: `$.session.usage`, `$.ui.*`, `$.command.register`. **Sem rede, processos, arquivos ou injeção no contexto do modelo.**
- Não instalados do mesmo marketplace: `quota-meter`, `token-ledger` e `budget-guard`. O app desktop já mostra uso/limites, e o `budget-guard` recusa chamadas de ferramenta (risco de interromper trabalho longo).

## 4. Everything Claude Code × Context Engineering Kit × o que já existe

| Capacidade | Já instalado | ECC | CEK |
| --- | --- | --- | --- |
| Revisão de código | `code-review`, `engineering:code-review`, `anthropic-skills:code-reviewer` | agentes `code-reviewer`, `security-reviewer` + skills | plugin `review` (10 agentes) |
| Segurança | `security-review`, plugin `security-guidance` (hooks), gitleaks no CI | `security-review`, AgentShield | — |
| TDD / testes | `engineering:testing-strategy`, `qa-test-designer` | `tdd-workflow`, `e2e-testing` | plugin `tdd` |
| Arquitetura/planejamento | `architect-review`, `engineering:architecture`, `system-design`, agente Plan | agentes `planner`, `architect` | `sdd`, `fpf`, `ddd` |
| Git/PR | nativo + GitKraken MCP + monitor de PR do app | comandos | plugin `git` |
| Domínio ERP/fiscal | `erp-domain-auditor`, `migration-auditor` | — | — |
| Autoria de skills/hooks | `plugin-authoring`, `skill-creator` | — | `customaize-agent` |

**ECC (`affaan-m/ECC` v2.2.3).** Plugin único `ecc@ecc`: 71 agentes, 311 skills, 97 comandos, 27 hooks no perfil padrão (10 `PreToolUse`, 8 `Stop`, 2 `SessionStart`…), dependências Node (`ajv`, `js-yaml`, `sql.js`, `@iarna/toml`), mais um produto pago (GitHub App). O próprio README alerta para mirrors maliciosos. Custo estimado: **~15 mil tokens por sessão** só nas descrições, mais latência de Node em cada chamada de ferramenta, e conflito direto com os hooks do `security-guidance`. Contraria a regra "não instalar frameworks completos". **Rejeitado.** Os 4 agentes listados à parte no catálogo (`ecc-agent-*`) também duplicam skills existentes.

**CEK (`NeoLabHQ/context-engineering-kit`, commit `23e2428`).** Granular (13 plugins), sem dependências, mas: ~89 skills/agentes (~3,7 mil tokens/sessão se tudo for instalado), o plugin `reflexion` adiciona hooks `Stop`/`UserPromptSubmit` via `bun` (ausente nesta máquina), e `tech-stack`/`ddd`/`mcp` **reescrevem o CLAUDE.md**, o que fere a regra de preservar instruções. A sobreposição com o que já existe é alta e não há ganho comprovável. **Rejeitado**; se no futuro faltar um fluxo de especificação, avaliar só `sdd` isoladamente.

## 5. Outros itens do catálogo considerados

- **Supabase MCP**: já conectado. **Vercel**: MCP já conectado. **GitHub MCP**: disponível via plugin `engineering`, pendente de autorização.
- **TDD Guard**: bloqueia edição sem teste falhando e chama um modelo a cada edição (custo e atrito altos em um projeto com muito código legado). Não recomendado agora.
- **Trail of Bits skills**: boas, mas sobrepõem `security-review`/`security-guidance`; reavaliar só se houver uma auditoria de segurança dedicada.
- **ccusage, Burn Meter, cctop, Claude Statuspane**: o app desktop já mostra custo e uso.

## 6. Riscos dos itens instalados e mitigação

| Risco | Mitigação aplicada |
| --- | --- |
| Código de terceiros dentro do processo, sem sandbox | Código lido integralmente, `plugin validate` sem rede/processo/arquivo |
| Atualização silenciosa trazendo código novo | Instalado de **cópia local fixada** (`~/.claude/vendor/jinlong-vetted`, com `PROVENANCE.md`), não do GitHub; só muda com nova auditoria |
| Launch Codes só intercepta a ferramenta **Bash** | Documentado: comandos via ferramenta **PowerShell** e MCP (`apply_migration`, `execute_sql`, deploy Vercel) **não** passam por ele (ver §8) |
| Launch Codes não cobre `supabase db push` | Testado e confirmado; ver regra `ask` proposta em §8 |
| API de function hooks é "early access" | Remoção em 1 comando (§7); falha do mod nega o comando (fail-closed) em vez de liberar |
| Conflito com hooks existentes | Nenhum: eventos distintos dos hooks shell do `security-guidance`; 0 erros no log de debug |

## 7. Instalação (como foi feita) e rollback

```powershell
# 1. Backup
Copy-Item ~/.claude/settings.json ~/.claude/settings.json.backup-pre-mods-2026-10-14
# 2. Marketplace local com cópias auditadas
#    ~/.claude/vendor/jinlong-vetted/{.claude-plugin/marketplace.json, context-lens/, launch-codes/, PROVENANCE.md}
claude plugin validate  "$HOME\.claude\vendor\jinlong-vetted"
claude plugin marketplace add "$HOME\.claude\vendor\jinlong-vetted"
# 3. Menor risco primeiro
claude plugin install context-lens@jinlong-vetted --scope user
claude plugin install launch-codes@jinlong-vetted --scope user
```

Diferença em `~/.claude/settings.json`: somente duas entradas em `enabledPlugins` e o marketplace `jinlong-vetted` em `extraKnownMarketplaces`. Nada foi removido.

Rollback:

```powershell
claude plugin uninstall launch-codes@jinlong-vetted
claude plugin uninstall context-lens@jinlong-vetted
claude plugin marketplace remove jinlong-vetted
```

## 8. Reforço de permissões

**Aplicado em 2026-10-14** (8.1 e 8.2, aprovados pelo responsável) em `.claude/settings.local.json`, tanto nesta branch quanto no checkout principal. Backups em `~/.claude/backups/settings.local.{main,worktree}.backup-pre-hardening-2026-10-14.json`. Nenhuma outra regra foi alterada, e a ordem das existentes foi preservada.

1. **Proteger segredos locais** (substituto real do Secret Redactor): removido `Bash(cat .env.local)` do `allow` e adicionado
   `"deny": ["Read(**/.env)", "Read(**/.env.local)", "Read(**/.env.*.local)", "Read(**/.env.production)"]`.
2. **Confirmar operações de banco/produção** (cobre o que o Launch Codes não vê): retirado `apply_migration` do `allow` e adicionado
   `"ask": ["Bash(npx supabase db push*)", "Bash(supabase db push*)", "PowerShell(npx supabase db push*)", "PowerShell(supabase db push*)", "mcp__93d8e0ff-3306-4cc0-8b34-9d8a9750000d__apply_migration"]`.
   `ask` tem precedência sobre o `allow` amplo `Bash(npx supabase *)`, que foi mantido.

Validação (sessões headless no Claude Code 2.1.295):

- Com um `.env.local` falso (valor-canário), `Read` foi **negado mesmo em `bypassPermissions`** ("denied by your permission settings"). O arquivo falso foi apagado em seguida.
- `npx supabase db push --help`, com `--allowedTools Bash`, passou a **pedir confirmação** e não executou.

**Segunda rodada, aplicada em 2026-10-14** após a revisão do PR #554 e aprovada pelo responsável. Backups em `~/.claude/backups/settings.local.{main,worktree}.backup-pre-hardening2-2026-10-14.json`.

3. **`execute_sql` → `ask`** (saiu do `allow`). SQL arbitrário no Supabase passa a pedir confirmação. O mesmo conector tem nomes diferentes no app desktop (`mcp__93d8e0ff-3306-4cc0-8b34-9d8a9750000d__*`) e no CLI (`mcp__claude_ai_Supabase__*`), por isso `execute_sql` e `apply_migration` estão em `ask` com os dois nomes.
4. **`git push` → `ask`**: `Bash(git push*)`, `Bash(git -C * push*)` e os equivalentes em PowerShell. Saíram do `allow` o `Bash(git push *)` e o push fixo de `fix/pdv-sonar-build-unblock`. Push para a `main` dispara o deploy da Vercel, e o secret scan só roda depois.
5. **Supabase CLI.** O `allow` amplo `Bash(npx supabase *)` foi trocado por regras só de leitura e geração local: `--version`, `status`, `projects list`, `migration list`, `migration new`, `gen types`. Entraram em `ask` `migration up` e `migration repair` (Bash e PowerShell, com e sem `npx`), somando-se ao `db push` da primeira rodada. Qualquer outro subcomando cai no prompt padrão.

Validação (headless, Claude Code 2.1.295, com o Bash liberado explicitamente via `--allowedTools` para provar que o `ask` tem precedência): `git push --dry-run origin HEAD`, `git -C . push --dry-run origin HEAD`, `npx supabase migration up --help` e `npx supabase migration repair --help` e `execute_sql` com `select 1` **pediram confirmação e não executaram**. Controles: `npx supabase --version` e `list_projects` rodaram sem prompt.

**Lacuna que continua aberta:** leitura indireta de segredos. Regras `Read` não se aplicam a buscas pelo shell: um `grep -r SUPABASE .` a partir da raiz lê o `.env.local` sem citá-lo, e `Get-Content .env.local` no PowerShell cai só no prompt normal. Só um sandbox no nível do sistema operacional garante o bloqueio; avaliar o sandbox do Claude Code para os arquivos `.env*`.

**Ainda não aplicado:**

3. **Atualizar o CLI do terminal** de 2.1.283 para a versão do app (`npm i -g @anthropic-ai/claude-code`).
4. **Criar um `CLAUDE.md` mínimo** a partir do `AGENTS.md` (padrões Sonar já definidos), para que as sessões na `main` recebam as mesmas regras.

## 9. Validação e demonstração no fluxo Jinlong

**Carga dos módulos** (`claude -p … --debug-file`, Claude Code 2.1.295):

```
hooks module context-lens@jinlong-vetted loaded (worker, environment 1, tier user)
hooks module launch-codes@jinlong-vetted loaded (worker, environment 2, tier user)
plugin.register: context-lens … admitted
plugin.register: launch-codes … admitted
$.command.register (launch-codes): /launch-codes listed
```

Custo medido: `session.start` 261 ms (2.1.295) / 1,7 s na primeira carga (2.1.283); `turn.complete` do Context Lens ~140 ms por turno. Nenhum token adicionado ao contexto do modelo.

**Classificador do Launch Codes contra comandos reais do projeto:**

| Comando | Resultado |
| --- | --- |
| `npx supabase db reset` / `--linked` | **bloqueia** |
| `psql "$DB_URL" -c "TRUNCATE vendas"` | **bloqueia** |
| `vercel --prod`, `npx vercel deploy --prod` | **bloqueia** |
| `git push --force origin main` | **bloqueia** |
| `git reset --hard origin/main`, `git -C … reset --hard HEAD` | **bloqueia** |
| `rm -rf backend/supabase/migrations` | **bloqueia** |
| `curl … \| bash` | **bloqueia** |
| `rm -rf pdv-importados/.next`, `npm run build`, `gh pr checks`, `git push -u origin claude/…`, `git push --force-with-lease`, `psql … select` | livre |
| `npx supabase db push` | **livre (lacuna, ver §8.2)** |

**Teste ponta a ponta** (repositório descartável com alteração não commitada, sessão headless com `--permission-mode bypassPermissions`, pedindo `git reset --hard HEAD`): o comando foi **negado** ("no one was there to enter the code"), o modelo não tentou contornar e o arquivo manteve o trabalho não commitado. Ou seja, o bloqueio vale mesmo com permissões totalmente liberadas.

**Como ajuda no dia a dia:**

- Launch Codes: na sessão interativa, ao pedir "reseta o banco local e refaz as migrations", aparece o painel RED ALERT com um código de 4 caracteres; o comando só roda se você digitar o código e escolher LAUNCH. Para conferir um comando sem executar nada: `/launch-codes test <comando>`.
- Context Lens: a linha fixa mostra a ocupação da janela e o crescimento por turno, útil em auditorias longas (como as de migrations e RPCs fiscais) para decidir quando abrir uma nova sessão em vez de deixar compactar. `/context-lens` abre o painel por categoria e `/context-lens refresh` faz a contagem exata.
