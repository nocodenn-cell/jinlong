# Sprint 0 — evidências (2026-10-08)

> Escopo: código + documentação. **Nada foi aplicado, limpo ou alterado no Supabase de produção**
> (`jinlong.app`). O único acesso a produção foi **leitura** (dump e consultas de catálogo).

## 1. Backup e restauração

| Item | Resultado |
|---|---|
| Causa da falha do backup diário | O fluxo JIT/PAM (acesso temporário) é bloqueado pelo lado do Supabase; o secret `SUPABASE_ACCESS_TOKEN` não existe |
| Correção | `backup-scheduled.yml` usa `supabase db dump --linked` quando o secret existe; sem ele cai no JIT com aviso |
| Manifesto | Gerado do **próprio dump** (`backup-manifest.mjs`), não de consulta separada |
| Dump real de produção (somente leitura) | roles + schema + data gerados localmente (fora do git) |
| Restore em Supabase local descartável | 87/87 tabelas com contagem idêntica; 152/163/53/3 objetos (funções/políticas/triggers/…) idênticos; 14 `auth.users`; ~8 s |
| Contagens críticas | vendas 258, caixas 56, produtos 155, usuários 11, auth.users 14 |

Achados do ensaio (corrigidos em `restore-drill.sh`): (1) restore em imagem Postgres crua falha em
`auth`/`storage` → filtro de dados (`filter-data-dump.mjs`); (2) CHECK `NOT VALID` é validado no `COPY`
→ drop/re-add durante a carga; (3) triggers → `session_replication_role=replica`.

**RPO continua NÃO GARANTIDO** até o dono criar o secret `SUPABASE_ACCESS_TOKEN` (PAT gratuito) e
rodar: backup → restore drill → monitor de frescor. Detalhes: `docs/runbooks/BACKUP_RESTORE_CANONICO.md`.

## 2. Limpeza de dados de teste

Script `backend/scripts/limpeza-dados-teste-d0.sql` + `docs/runbooks/LIMPEZA_DADOS_TESTE_D0.md`.
Ensaiado em cópia isolada: vendas 258→0, caixas 56→0, kardex rebaseado, 0 FKs órfãs, divergência
de ledger 40→0, cadastros preservados, reexecução idempotente, guarda de dados reais testada.
**Não executado em produção** (exige autorização específica posterior).

## 3. Migrations pendentes

8 migrations (20261007161220 … 20261007190000) analisadas, aplicadas uma a uma e em replay completo
(400 migrations) **somente localmente**: 8/8 ok. Compatibilidade código×schema: 67/69 RPCs existem;
faltam 2 + 1 tabela, todas criadas por essas migrations. Plano e rollback:
`docs/runbooks/PLANO_MIGRATIONS_PENDENTES_2026-10-08.md`. **Não aplicadas em produção.**

## 4. Build e testes

| Verificação | Resultado |
|---|---|
| Build (`next build`) | Corrigido: `next/font/google` (rede) trocado por `@fontsource` self-hosted |
| Typecheck / lint | verdes |
| Guards (`guard:all`, incluindo novo `guard:no-prod-target`) | verdes |
| Testes RLS (`test-rls-scope`) em stack local | verdes |
| Gate financeiro (PGlite) | 16/16 e 1/1 (após `.gitattributes` LF) |
| Suítes SQL do repositório em replay local | verdes; 1 teste desatualizado corrigido (`d0-remessa-positive…`, usa `estoque_minimo` real) |
| E2E Playwright (`caixa-venda`, `caixa-fluxos-criticos`) | **falhou localmente (2/2), não provado** — ver §6 |

Bloqueio de teste contra produção: novo `scripts/no-prod-target-guard.mjs` (em `guard:all`) reprova
qualquer teste que cite o ref de produção ou host `*.supabase.co` real; o E2E já tinha guard de runtime.

Dependências para rodar localmente: Docker, Supabase CLI, Node 20, `npx playwright install chromium`;
no Windows, `core.autocrlf` é neutralizado para SQL/shell por `.gitattributes`.

## 5. Riscos residuais

1. Backup diário segue vermelho até o secret `SUPABASE_ACCESS_TOKEN` existir (ação humana).
2. Job `migration-remote-drift` (não obrigatório) fica vermelho até as 8 migrations irem a produção.
3. Produção continua com dados de teste até autorização da limpeza; 36+15 produtos de teste,
   clientes/fornecedores a conferir; saldo físico precisa de contagem.
4. Fiscal permanece stub honesto (D0).
5. Teste na máquina da loja (leitor, impressora, caixa) segue como gate separado:
   `docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md`.

## 6. E2E

Executado em build de produção local apontando para o stack Supabase isolado (nunca produção).
Login do gerente/operador funcionou, mas **2 de 2 specs falharam** (`caixa-venda`, `caixa-fluxos-criticos`):
o estado do turno do PDV ficou em "loading" por 40 s em `ensureCaixaAberto`, sem erro no log do servidor.
**Não validado localmente — registrado como BLOQUEADO/NÃO PROVADO**, sem mascarar. Causa provável: dados/config
de loja ausentes no stack local; o job E2E do CI (`ci-pdv-importados.yml`) segue sendo o gate real e
deve ser conferido no PR. Pendente: investigar o estado "loading" do turno com seed completo.
