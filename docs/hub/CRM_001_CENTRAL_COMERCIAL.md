# CRM-001 · Central Comercial Jinlong

Sprint P0 de 2026-11-20. Branch `claude/jinlong-crm-central-60545f`. **Nada foi aplicado em produção**: nem a migration, nem o deploy do hub.

## 1. Diagnóstico inicial (Fase A)

| Item | Situação encontrada |
|---|---|
| App | `hub/` (Next.js 15, projeto Vercel próprio `nature-code-hub`, domínio `hub.jinlong.app`). App separado do ERP e do site. |
| Telas publicadas (capturas enviadas) | Painel (6 cartões + funil de 6 status), Central de Conversão (testes grátis), Leads (lista com 4 filtros, sem paginação), Lojas contratadas. |
| Banco (produção `kbabmewnahysfvlybiak`, leitura) | `commercial_leads` (2 leads, ambos `novo`), `commercial_lead_events` (0), `commercial_customers` (0), `commercial_admins` (1). Growth-001 aplicada (RPCs `commercial_*`). `registrar_lead_comercial` **não** está em produção (formulário do site ainda quebrado; ver P0 do `PROXIMOS_PASSOS.md`). |
| Autenticação | Login Supabase no servidor; cookies `httpOnly`; papel único "admin" (`is_commercial_admin`). Sem service role. |
| RLS | Ativo em todas as `commercial_*`. Admin vê tudo; `anon` sem leitura. |
| Catálogo de preços | `saas.planos`: BASICO, ATACADO, REDE, FISCAL — **todos com `preco_placeholder = true`**. Não há condição comercial oficial definitiva. |
| CI | Nenhum workflow cobria `hub/`. A prova de RLS (`hub/scripts/rls-test.sh`) só rodava à mão. |
| Princípios de Engenharia / Especificação de Alterações | Não versionados no repositório (já registrado em `docs/governance/GITHUB_WORKFLOW.md`). Usados os critérios de lá: SSoT, hexagonal, boundaries, segurança no servidor. |

## 2. Matriz de funcionalidades

| Funcionalidade | Antes | Agora |
|---|---|---|
| Dashboard com indicadores reais | 6 cartões, sem filtros | 12 indicadores da coorte (total, novos, qualificação, oportunidades abertas, demos agendadas, propostas enviadas, convertidos, perdidos, taxa, 1º atendimento, receita potencial, testes grátis); filtros período/origem/responsável/produto; conversão por origem, campanha (UTM) e responsável; motivos de perda; alerta "sem acompanhamento". Cada cartão leva à lista que o compõe. |
| Gestão de leads | Lista simples, 4 filtros, limite 500 | Busca (nome, empresa, contato, e-mail, cidade, protocolo), filtros etapa/responsável/origem/produto/período, **paginação** com total exato, cadastro manual com bloqueio de duplicado, edição (telefone, e-mail, cidade/UF, segmento, funcionários, unidades, observações, próximo contato), atribuição. |
| Pipeline Kanban | Não existia | Etapas configuráveis (Novo → Qualificação → Primeiro contato → Demonstração → Proposta enviada → Negociação → Convertido / Perdido), arrastar e soltar + seletor acessível, valor e próxima atividade no cartão, motivo obrigatório para perder/reabrir. |
| Transições válidas | Qualquer status por PATCH | Só pela RPC `commercial_lead_mover`: sem saída de Convertido; Convertido só por conversão; Perdido exige motivo; reabrir exige justificativa; etapa desativada recusada. |
| Agenda e follow-up | Campo "próximo contato" (só testes grátis) | Atividades (ligação, reunião, demonstração, retorno, tarefa, prazo) com responsável; atrasadas/hoje/7 dias; concluir com resultado (vira contato no histórico); alerta de oportunidades paradas. **Sem envio automático.** |
| Histórico de interações | Nota/contato/status | + atribuição, edição (só nomes de campos), atividade, proposta; autor de cada registro. |
| WhatsApp / e-mail | Não havia | Links `wa.me` e `mailto:` abertos pela pessoa. Nenhuma integração de envio (não há API autorizada). |
| Propostas | Não existia | Versões por lead; plano/adicionais só do catálogo `saas.planos` (valor de tabela calculado pelo banco, aviso de preço provisório); valor negociado digitado; validade ≤ 180 dias; estados rascunho → enviada → em negociação → recusada/expirada/cancelada; enviar/negociar avança o lead. |
| Conversão em cliente | PATCH "contratado" criava cliente | Só gestor, exige proposta enviada/em negociação, confirmação e registro do aceite; mesmo lead (id preservado); bloqueia cliente duplicado (mesmo contato ou mesma loja/produto); outras propostas abertas são canceladas. Teste grátis continua pela Central. Sem cobrança. |
| Equipe e permissões | Um papel | Gestor × vendedor no banco. Vendedor vê só os seus leads e os sem responsável; não converte, não vê clientes nem auditoria. Tela de equipe e de etapas (gestor). |
| Auditoria | Não havia | `commercial_audit` append-only por trigger em leads, propostas, atividades, clientes, etapas e equipe: ator, campos, valores **não pessoais**. |
| Campanhas / origem | `utm_*` gravados, não usados | Origem (site, teste grátis, indicação, prospecção, evento, WhatsApp, outro) e campanha nos filtros e relatórios. |
| Empresas como entidade própria | — | **Não criado** (decisão abaixo). |

## 3. Arquitetura

- **Hexagonal / boundaries**: regras de negócio no banco (RPCs `SECURITY DEFINER` com checagem de papel); `lib/crm.ts` e `lib/model.ts` são domínio puro e testável; `lib/repo.ts` é o adaptador REST (porta `Repo`) com um adaptador em memória para dados fictícios; páginas e server actions só orquestram. O hub continua sem importar ERP/PDV e sem tocar tabelas fora de `commercial_*` (teste `isolamento`).
- **SSoT**: uma tabela de leads, um histórico, uma tabela de clientes (única por lead). Etapas viram `commercial_stages` com os **mesmos códigos** já gravados — nenhum lead muda. Preço vem só de `saas.planos` via `internal.commercial_valor_tabela` (a mesma função da Central). Nada de segunda fonte.
- **Empresa**: o lead já carrega a empresa (`store`, cidade/UF, funcionários, unidades) e o teste grátis aponta para `public.empresas`. Uma tabela nova de empresas criaria segunda verdade com o ERP. Em vez disso: detecção de duplicidade (contato, e-mail, loja) no cadastro, na ficha e na conversão. Se o produto precisar de "conta com vários contatos", vira decisão própria.
- **Segurança**: autorização no servidor e no banco, nunca por botão escondido. `authenticated` perdeu `UPDATE(status)` e `INSERT` em clientes; etapa, responsável, dados, agenda, proposta, conversão, equipe e etapas só por RPC. Lead fora do escopo do vendedor responde "não encontrado" (não revela existência). Nenhum endpoint público novo; `anon` sem acesso às tabelas e RPCs novas.
- **LGPD**: auditoria e histórico de edição guardam só o **nome** dos campos pessoais. Dados fictícios no modo demonstração.

## 4. Implementação

| Arquivo | O quê |
|---|---|
| `hub/supabase/20261120120000_commercial_crm.sql` | Migration (aditiva, idempotente, com verificação final). Fica fora de `backend/supabase/migrations/` de propósito: nenhum pipeline a aplica. |
| `hub/supabase/rollback/20261120120000_commercial_crm.rollback.sql` | Rollback (com aviso de perda de dados e exportação prévia). |
| `hub/supabase/test/crm_test.sql` | Prova de RLS, isolamento gestor × vendedor × não membro × anon, transições, agenda, propostas, conversão sem duplicidade, etapas e auditoria. |
| `hub/lib/crm.ts`, `hub/lib/model.ts` | Domínio: tipos, validação, indicadores, alertas, agenda, duplicidade, mensagens. |
| `hub/lib/repo.ts`, `hub/lib/auth.ts`, `hub/lib/session.ts` | Adaptador REST/RPC; papel verificado no banco (`commercial_meu_papel`, com queda para `is_commercial_admin` antes da migration); `requireMember` / `requireGestor`. |
| `hub/app/page.tsx`, `pipeline/`, `leads/`, `agenda/`, `equipe/` | Telas. Central de Conversão e Clientes passam a exigir gestor. |
| `.github/workflows/ci-hub.yml` | CI novo: typecheck, vitest, build, e prova de banco em Postgres de serviço. |

## 5. Testes executados (2026-11-20)

| Teste | Resultado |
|---|---|
| `npx tsc --noEmit` (hub) | OK |
| `npx vitest run` (hub) | 62/62 (5 arquivos; 20 novos em `crm.test.ts`) |
| `HUB_DEMO_DATA=ficticio next build` | OK (13 rotas) |
| `hub/scripts/rls-test.sh` em Postgres 15 descartável (Docker) | RLS hub OK · Central de Conversão OK · CRM OK · rollback + reaplicação OK |
| Validação visual (modo fictício, 1440 px e 375 px) | Sem erro de console; sem rolagem horizontal no celular; Kanban abre o diálogo de motivo ao mover para Perdido e a ação chega ao servidor |

Capturas (dados **fictícios**): `docs/qa/evidencias/crm-001/`.

**Não testado**: escrita ponta a ponta contra um Supabase real (PostgREST + Auth), porque exige aplicar a migration num projeto. As regras estão provadas no banco (SQL) e o contrato REST nos testes unitários; falta o ensaio em homologação.

## 6. Ordem de liberação (exige autorização do dono)

1. Aplicar a migration no homolog (`yvdilcmxyjafnnsfdtam`) e rodar `crm_test.sql` lá (dentro de transação com rollback, ou num branch).
2. Ensaiar o hub desta branch contra o homolog com uma conta gestor e uma vendedor.
3. Produção: copiar a migration para `backend/supabase/migrations/` num PR com `deploy-prod:aprovado`, aplicar **antes** do deploy do hub. O admin atual vira gestor automaticamente.
4. Deploy do hub.

## 7. Situação

**Concluído (em código, testado localmente)**: modelo de dados + RLS + auditoria; dashboard com indicadores rastreáveis; gestão de leads com paginação, edição e atribuição; Kanban com transições validadas e motivo de perda; agenda e alertas; propostas com preço só do catálogo; conversão sem duplicidade; equipe e etapas; CI do hub.

**Pendente**:
- Aplicar em homolog e ensaiar com contas reais; depois produção (itens 1–4 acima).
- Preços oficiais: `saas.planos` está todo marcado como provisório. As propostas mostram o aviso; a definição é do dono.
- Relatórios exportáveis (CSV) e gráficos de tendência no tempo: não feitos (prioridade foi o fluxo completo).
- Convite/criação de usuário pela tela: a conta precisa existir no Supabase Auth (a tela de equipe só vincula).

**Bloqueado / fora do escopo**:
- Integração de envio por WhatsApp/e-mail: não há API nem autorização; só links abertos pela pessoa.
- Leads do site em produção: o formulário segue quebrado até `registrar_lead_comercial` (#676/#677) ser decidido e aplicado — sem isso, só entram leads de teste grátis e manuais.
