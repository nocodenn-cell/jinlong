# Relatório final — Sprint UX-IA-01 (Relatórios gerenciais, navegação e i18n)

Data: 2026-10-09 · Escopo: navegação, relatórios, i18n PT-BR/中文 e pendências de segurança. Não inclui Multiempresa/Multiloja.

## 1. PRs mergeados (em `main`)

| PR | Conteúdo | SHA do merge |
|---|---|---|
| #507 | Integração do site comercial (corrige Vercel rootdir) | `19f05be5` |
| #509 | Sidebar com 9 destinos + Abrir PDV | `a5aa7103` |
| #510 | Hubs Vendas/Compras/Pessoas + barra única de Relatórios | `b83b0554` |
| #511 | Links contextuais Funcionários→Comissões, atalhos em Configurações | `dfa78b7b` |
| #512 | Busca Ctrl+K (destinos e ações) | `f3decab2` |
| #513 | Docs: homologação, investigação de autorização, equivalência | `1a735936` |
| #514 | Conteúdo do relatório clássico migrado para as views executivas | `ce46596f` |
| #515 | Financeiro: barra agrupada (9→7 controles) | `473238ee` |
| #516 | **GO-LIVE só DONO/ADMIN (trigger no banco)** — migration aplicada em produção com autorização | `05fdaa5d` |
| #517 | Diagnóstico do Caixa só DONO/ADMIN + guarda na Server Action | `e4a225a8` |
| #518 | Erro de permissão correto no Diagnóstico | `70cf417b` |
| #519 | **Aposenta o relatório clássico; margem em intervalo (R5-b)**; redirects `?tab=`→`?view=` | `bec8a261` |
| #520 | **i18n dos painéis executivos (PT/中文)** | `b943b548` |

| #521 | **RPC do Diagnóstico só DONO/ADMIN** — migration aplicada em produção com autorização expressa | `c18a99de` |
| #523 | Registro do par de versão da migration do #521 (`migration-human-gates.json`) | `d94be565` |

Aberto, não mergeado: **#491** (branch de trabalho do usuário, intocado).

## 2. CI e testes

- Checks obrigatórios (6) verdes em #519 e #520 antes do merge; #519 no commit `374642e2`, #520 no `97b9f9f8`.
- `tsc` e `eslint`: limpos. Vitest nas áreas tocadas: verde. Suíte completa (pdv-importados): 2291 ok; 4 falhas em `produtosFiscalEdicao.integration.test.ts` — **pré-existentes e não relacionadas** (ativam apenas com Postgres local + `.env.local`; não rodam no CI).
- Review automático (Codex): #519 teve 4 achados P2 — todos tratados (e2e atualizado; "lista parcial" independente da fatia; piso marcado como conservador com devoluções; fuso ≠ São Paulo mostra só o teto). #520: sem achados. #521: 1 achado P2 (senhas do seed) corrigido no próprio PR.
- Testes novos relevantes: margem em intervalo (6 cenários, incl. custo ausente e lista truncada), redirects `?tab=`/rota nua (preservam `de/ate`), i18n ZH (nenhum texto PT do dicionário vaza nas 4 views, com dados cheios e vazios).

## 3. Homologação (stack local, dados fictícios)

- **Cálculos independentes × views** (SQL direto no Postgres local vs. telas): faturamento R$ 1.240,92 (8 vendas), cancelamento 11,1%, descontos R$ 17,98, CMV R$ 489,60 bruto − R$ 13,60 de itens devolvidos = R$ 476,00 (igual à DRE), devolução R$ 37,80 (a devolução de R$ 89,90 pertence a venda cancelada e, por desenho, não entra). Cliente a prazo (R$ 189,00 com R$ 89,00 pagos) e desconto autorizado por token de gerente: conferidos (ver `CONFERENCIA_VALORES_CLASSICO_X_VIEWS.md` §6).
- **Margem em intervalo:** `R$ 675,52 a R$ 727,12` com 1 venda sem custo (R$ 51,60), em PT e 中文.
- **Redirects legados:** `?tab=margem&de=…&ate=…` → `view=dre-financeiro` com datas preservadas; rota nua → `view=vendas-caixas`; nenhum link da sidebar aponta para a rota sem `view`.
- **Visual PT/中文, desktop e mobile 375 px:** 4 views + Visão Geral em 中文 sem texto PT de interface (restam apenas dados: nomes de produto/cliente, e o rótulo secundário bilíngue da sidebar, por desenho). Corrigido no caminho: overflow horizontal de 14 px no mobile (MetricCard) e truncamento do teto da faixa de margem.
- **Perfis:** GO-LIVE — smoke de 13 checks (GERENTE bloqueado, DONO autoriza, OPERADOR sem acesso) sem regressão. Diagnóstico (RPC) — OPERADOR 403, DONO 200, ADMIN 200; GERENTE 200 antes do #521 e 403 depois (local); em produção, corrigido no catálogo. Rotas de tela: política `adminPolicy` coberta por testes unitários.

## 4. Achados novos desta rodada (não silenciados)

| # | Achado | Risco | Estado |
|---|---|---|---|
| N1 | **Reclassificado após análise (2026-10-09).** Primeira leitura: "RPCs de relatório sem guard de perfil". Verificação no catálogo de produção e no stack local: as 7 RPCs `relatorio_*` de leitura são **SECURITY INVOKER** (`prosecdef=false`) — respeitam o RLS do chamador e **não ampliam** o que o OPERADOR já lê direto das tabelas; as RPCs SECURITY DEFINER (`relatorio_consistencia_vendas*`) já são protegidas (REVOKE / `RELATORIO_CONSISTENCIA_PERFIL`). Um guard nas RPCs seria cosmético e **não fecharia** a exposição. A exposição real é de **RLS/colunas**: o OPERADOR da loja lê `produtos.preco_custo` (16/16 linhas no seed) e `vendas` da própria loja via REST; `itens_venda` vem vazio para ele. `anon` não lê nada (0 linhas). | **Baixo–médio** (custo de produto visível a perfil de caixa; sem acesso a outras lojas) | **ABERTO — decisão de produto.** Não dá para resolver só com GRANT por coluna: o papel de banco é `authenticated` para todos os perfis. Opções: (a) aceitar (operador de loja conhece o custo); (b) tirar `preco_custo` do SELECT do PDV via view/RPC sem custo e restringir a coluna (exige regressão do PDV e do catálogo). Sem alteração de produção feita. |
| N2 | RPC financeira fixa `America/Sao_Paulo`; o relatório usa o fuso configurado. | Baixo (hoje ambos = São Paulo) | Mitigado na UI (fuso ≠ SP → só o teto). Alinhar o RPC exige migration. |
| N3 | Piso da margem não desconta devolução por venda (RPC não expõe). | Baixo | Piso é conservador e sinalizado na tela ("piso conservador (há devoluções)"). |

## 5. Segurança: `go_autorizado` e RPC do Diagnóstico

- **`go_autorizado` / `go_autorizado_por`:** RESOLVIDO e **verificado em produção** (consulta somente-leitura em 2026-10-09: `trg_implantacao_checklists_proteger_go`, `BEFORE INSERT OR UPDATE`, habilitado, SECURITY DEFINER). Evidência local da correção: smoke de 13 checks.
- **RPC `pdv_diagnostico_pre_producao` aceitando GERENTE no banco:** **RESOLVIDO em produção** (2026-10-09, com autorização expressa). #521 mergeado (`c18a99de`); migration aplicada via MCP (versão remota `20261009115256`). Pré-check: guard antigo 1x; pós-aplicação: guard `DONO, ADMIN` 1x, grants inalterados (consulta de catálogo). Prova funcional (GERENTE 200 → 403) feita no stack local; **não** foi exercitada com login real em produção. Rollback no cabeçalho da migration.

## 6. Ambiente local

- Next.js (preview `pdv-dev`) parado; `supabase stop` executado (volumes preservados, não apagados); `pdv-importados/.env.local` (criado hoje para a homologação, só URL/chaves do stack local) removido; senha de homologação local apagada do scratchpad; outros stacks Docker (`trial-sbx-0b`, `jinlong-s1`) não pertencem a esta sprint e não foram tocados.
- Aba do navegador devolvida a `https://jinlong.app` (redireciona para `/login`).
- Nenhuma credencial em commits: varredura por JWT no repo só encontra o token de exemplo público de `.env.test` (pré-existente); gitleaks verde nos PRs.

## 7. Produção — merge × deploy verificado

- #519 (`bec8a261`): deploy `dpl_FajKU4TT…` **READY** (production). `/login` 200; `/admin/relatorios` sem sessão → 307 para login (esperado).
- #520 (`b943b548`): deploy `dpl_HkSaNGiN…` **READY** (production, alias `www.jinlong.app`, `aliasError: null`). `/login` 200; `/admin/relatorios` sem sessão → 307 para login. A renderização autenticada em produção **não** foi exercitada (sem credenciais reais, por regra); a verificação funcional foi feita no stack local.
- Migrations aplicadas em produção nesta sprint, ambas com autorização expressa: #516 (trigger do GO-LIVE) e #521 (guard do Diagnóstico).

## 8. Pendências, responsáveis e próximos passos

| Pendência | Responsável | Próximo passo |
|---|---|---|
| N1 — decidir sobre `produtos.preco_custo` legível por OPERADOR (aceitar ou isolar via view/RPC) | Dono do produto + Backend | Decisão; se (b), PR com view do PDV sem custo + regressão do PDV/catálogo |
| Revisão de termos financeiros em 中文 | Falante nativo / negócio | Revisar `lib/i18n/execTexts.ts` |
| Ambiente Supabase isolado para previews do ERP | Infra | Criar projeto isolado (auth + dados fictícios) antes de reabilitar previews |
| Cmd+K no Mac e leitor de tela | QA | Testar em dispositivo real |
| Limpeza das chaves `relatorios_tab_*` e labels clássicos órfãos | Frontend | PR de limpeza de dicionário |

## 9. Decisão

**GO COM RESSALVA** para encerrar a sprint de navegação/relatórios/i18n: funcionalidades previstas entregues e verificadas, gates cumpridos, achados de autorização do GO-LIVE e do Diagnóstico encerrados em produção. A ressalva é o **N1 (aberto, baixo–médio, decisão de produto sobre `preco_custo`)** — resolver ou aceitar formalmente antes de iniciar Multiempresa/Multiloja.

## 10. Adendo (2026-10-09) — verificações posteriores ao relatório

- **Smoke do #521 reexecutado de ponta a ponta** no stack local com `PROVISION_PASSWORDS=1` (correção do achado do Codex): OPERADOR 403, GERENTE 403, DONO 200, ADMIN 200 — 4/4.
- **N1 reclassificado** (ver §4): análise de catálogo em produção e leitura direta como OPERADOR no stack local mostram que o problema não está nas RPCs de relatório.
- Stack local reiniciado para esta análise e encerrado novamente ao final.
