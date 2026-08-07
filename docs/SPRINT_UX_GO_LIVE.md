# Sprint UI/UX — Experiência pronta para Go-Live

**Início:** 2026-08-07
**Branch:** `feat/sprint-ux-go-live`
**Escopo exclusivo:** interface e experiência de uso. **Nenhuma correção de backend, banco ou infraestrutura**, exceto regressão crítica.
**Base:** `docs/AUDITORIA_UI_UX_JINLONG.md` (auditoria das 41 telas) + `docs/AUDITORIA_POS_ONDA_2.md`.

---

## 0. Sprint anterior — encerrada

| Onda | Entrega | Estado |
|---|---|---|
| 1 | Seletor de candidatos na busca do PDV + estoque na linha do carrinho | ✅ |
| 2 | `PaginationBar`, drill-down de KPI, XLSX morto removido, `loading.tsx` por rota | ✅ 4/5 |
| 2.5 | P0 de identidade resolvido, `guard:rpc` reverdecido, organização do repositório | ✅ |

Relatório: `docs/FECHAMENTO_ONDA_2_5.md`. **P0: 0 · P1: 2 · P2: 7**, todos com responsável.

### Sequenciamento desta branch

`feat/sprint-ux-go-live` sai de `chore/node22-alignment` (PR #257), **não de `main`** — a #257 ainda não foi mergeada e carrega os 31 commits das Ondas 1–2.5. Sair de `main` agora descartaria essa base.

**Assim que a #257 mergear:** `git rebase origin/main` nesta branch. Como o histórico já contém aqueles commits, o rebase será limpo. A partir daí, escopo único de verdade.

---

## 1. Prioridades da sprint

Em ordem de impacto operacional, derivadas da auditoria.

### P1 — Clareza operacional (era a Onda 3)

| # | Item | Tela | Por quê |
|---|---|---|---|
| 1.1 | **Atalhos visíveis nos botões do PDV** | `/caixa` | F1–F12 e Ctrl+Z existem e são bons, mas nenhum botão exibe sua tecla. O operador novo só descobre abrindo F1 — e não sabe que F1 existe. Ataca direto a meta "vender sem treinamento longo" |
| 1.2 | **`FiscalSection` colapsada por padrão** | Cadastro de produto | 6 campos fiscais (NCM, CFOP, CSOSN, CEST, CST PIS/COFINS) que ninguém preenche no piloto ocupam o caminho até "Salvar" |
| 1.3 | **Painel de capacidades do perfil** | `/admin/funcionarios` | Hoje se atribui "GERENTE" sem ver o que se está concedendo. Somente leitura, derivado de `AUTHORIZATION_MATRIX.md`. **Não cria permissão nova** |
| 1.4 | **`type: 'daterange'` no `FilterBar`** | DS | Pré-requisito de 1.5. Hoje `FilterDef` só tem `pills`/`select`/`search`, e por isso relatórios e dashboard rolaram filtro próprio |
| 1.5 | **Migrar filtros fora do padrão para `FilterBar`** | funcionários, comissões, auditoria, relatórios | Filtro de funcionários é `useState` em memória: não reflete na URL, não sobrevive a refresh nem a compartilhamento de link |

### P2 — Fluxo e cliques

| # | Item | Tela | Por quê |
|---|---|---|---|
| 2.1 | **"Adicionar ao carrinho" na Consulta Rápida (F3)** | `/caixa` | Fluxo atual: F3 → digita código → lê → Esc → foca busca → **digita o mesmo código de novo**. Dobra a digitação num gesto frequente em atacado |
| 2.2 | **Realce da linha recém-adicionada** | `/caixa` | Em rajada de scan o operador não distingue "entrou 1" de "entrou 2 do mesmo". `onItemAdded` já entrega o `itemId` |
| 2.3 | **Faixas de atacado no fluxo pós-salvar** | Cadastro de produto | Hoje: salvar → reabrir → editar. Reduz de 4 cliques + rebusca para 1 |
| 2.4 | **Ícone de código de barras no campo de busca** | `/caixa` | Afordância. O campo único que aceita código *ou* nome está correto — falta sinalizar que aceita leitura óptica |

### P3 — Consistência do Design System

| # | Item | Por quê |
|---|---|---|
| 3.1 | **Sidebar do admin em drawer abaixo de `lg`** | `AdminV2Shell` empilha logo (112px) + 12 itens CORE + SISTEMA **acima** do conteúdo em <1024px. Sem hamburger. Confirmar antes se o admin roda em tablet |
| 3.2 | **Migrar `GerenteTable` → `DataTable`** | funcionários, contas a pagar, compras — terceiro padrão de tabela vivo. Uma tela por PR |
| 3.3 | **Adotar `CrudListShell`** oportunisticamente | Catálogo, vendas, financeiro, clientes, fornecedores remontam a ordem toolbar→bulk→tabela→footer à mão |
| 3.4 | **Lint barrando `jl-*` e cor crua em arquivo novo** | Congela a entropia dos 5 vocabulários de estilo sem exigir redesign |

### Acessibilidade

Transversal, não uma fase separada. `DataTable` já tem `aria-sort`/`aria-rowcount`; `CaixaSearchBar` ganhou contrato de combobox na Onda 1. Aplicar o mesmo rigor a cada item acima, com foco em: rótulo acessível em ação por ícone, `aria-current` em navegação, ordem de foco em modal, e contraste dos chips que carregam significado operacional.

> `docs/AUDITORIA_CONSISTENCIA_VISUAL.md` tem `P0-01` em aberto: `--accent` quebrado por conflito de cascata faz `hover:bg-accent` não aplicar cor em botões `outline`/`ghost`. É correção de token, ~15 min, e cabe nesta sprint.

---

## 2. Fora de escopo

- Backend, banco, migrations, RPC, RLS, ADR — **inclusive** os itens P1/P2 herdados (ID-02, ID-08, B-2…B-6). Têm dono na frente de backend.
- PRs #258, #187, #131 — todas de backend/RLS/fiscal.
- Redesign visual amplo e unificação total de tokens — congelados por `FEATURE_FREEZE_PILOTO.md`; exigem exceção do sponsor.
- Recortes de relatório por vendedor/produto/categoria/pagamento — exigem sobrecarga de RPC.
- Perfis Financeiro/Estoque/Vendedor separados — exigem RLS nova.
- Paginação real em contas a receber — exige revisão da ADR-010.

---

## 3. Critério de aprovação por item

Mantido da auditoria. Antes de implementar, o item precisa responder sim a:

1. Reduz tempo operacional?
2. Reduz quantidade de cliques?
3. Melhora o entendimento do usuário?
4. Mantém a arquitetura?
5. Evita duplicação?
6. Facilita manutenção?

E aos invariantes desta sprint:

- Nenhuma regra de negócio no frontend.
- Nenhum contrato duplicado.
- Correções incrementais e reversíveis, uma tela por vez.
- `next build` a cada ciclo — não só `typecheck` (o build pega export nomeado em `page.tsx`, que o typecheck não pega).

## 4. Definition of done

| Gate | Exigência |
|---|---|
| typecheck · build · lint | verdes |
| Testes | verdes, com cobertura nova para comportamento novo |
| Guards | 9/9 |
| Auditoria | item marcado com evidência no doc de origem |
| Verificação visual | declarada explicitamente quando não for possível (o admin exige sessão autenticada e o único ambiente é produção) |
