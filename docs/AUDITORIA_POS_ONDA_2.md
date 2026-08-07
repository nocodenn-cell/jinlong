# Auditoria pós-Onda 2 — Jīn Lóng

**Data:** 2026-08-07
**Escopo:** fechamento da Onda 2 + varredura de duplicação, contratos e código morto em `pdv-importados`.
**Restrição respeitada:** nenhuma alteração em `shared-core`, migration, RPC, ADR ou fluxo transacional.
**Objetivo declarado:** estabilidade para Go-Live — não expansão de escopo.

Complementa `docs/AUDITORIA_UI_UX_JINLONG.md`. Achados de cor/token continuam em `docs/AUDITORIA_CONSISTENCIA_VISUAL.md`.

---

## 1. Alterações realizadas

### 1.1 Fechamento da Onda 2

| # | Item | Estado |
|---|---|---|
| 1 | `PaginationBar` — validação de código morto e testes | ✅ |
| 2 | KPI de período — resolver link falso | ✅ (decisão: sem link, backlog aberto) |
| 3 | Financeiro — avaliar 200→500 e documentar filtros | ✅ (decisão: **não** elevar; aviso agora é acionável) |
| 4 | Varredura pós-onda | ✅ (este documento) |

### 1.2 Correção de erro introduzido na Onda 2 — link falso de período

Na Onda 2 afirmei que `7D` (dashboard) e `7d` (vendas) eram equivalentes. **Não são.** Prova executada:

```
agora            2026-08-07T18:30:00Z
dashboard 7D  -> 2026-08-01T03:00:00Z   (hoje−6 às 00:00)
vendas    7d  -> 2026-07-31T18:30:00Z   (agora − 168h)
DIFERENÇA     -> 8,5 horas
```

O drill-down de `7D` era exatamente o "link falso" que a diretriz proíbe. **Corrigido:** apenas `TODAY → hoje` permanece linkado (início idêntico: meia-noite de hoje nos dois lados). `7D` e `30D` ficam estáticos.

Guarda criada: `app/admin/dashboard/periodoDrilldown.test.ts` (4 testes) replica a regra da tela de vendas e falha se alguém reintroduzir um mapeamento que não bate.

### 1.3 Bug de rótulo encontrado na investigação — P1 corrigido

`app/admin/vendas/page.tsx` rotulava a pílula do filtro `mes` com `admin.dashboard.period30d` = **"30 dias"**, enquanto `periodoInicio('mes')` calcula o **mês corrente a partir do dia 1**. No dia 3 do mês, o filtro rotulado "30 dias" retornava 3 dias de venda.

A mesma tela já usava o rótulo certo no chip removível (`vendas_periodo_label_mes` = "Mês atual") — ou seja, a tela **se contradizia**. Corrigido para a chave existente; nenhuma chave nova criada.

> Este achado é a razão pela qual o item 2 valeu a pena: a investigação do link falso expôs um filtro que mentia para o usuário na tela de vendas.

### 1.4 Financeiro — decisão baseada em dado de produção

Consulta somente-leitura em produção:

| Métrica | Valor |
|---|---|
| `contas_receber` — total de títulos | **0** |
| `contas_receber` — abertos/parciais | **0** |
| Tamanho da tabela | 128 kB |
| Limite atual da listagem | 200 (teto do reader: 500) |

**Decisão: não elevar 200 → 500.** Não há um único registro; a mudança teria benefício mensurável zero e ainda assim aumentaria o payload quando os dados chegarem. Elevar limite sem evidência é o oposto de previsibilidade.

**Gatilho para revisitar:** quando `contas_receber` com status `ABERTO`/`PARCIAL` passar de ~150 títulos numa loja. Aí a discussão é paginação real (ADR-010), não teto maior.

**Executado no lugar:** o aviso de truncagem virou acionável. Antes dizia só `"(resultado truncado)"`; agora diz quantos está mostrando e o que fazer — `"Mostrando os {{n}} mais recentes. Para alcançar os demais, filtre por busca, cliente ou vencimento."` (pt e zh). Os filtros já existem; o que faltava era apontá-los.

### 1.5 Consolidações e limpeza

| Alteração | Motivo |
|---|---|
| `clampPage` → `components/ui/PaginationBar.tsx` | Contrato irmão da barra (quem lê `?page=` e quem a renderiza precisam concordar). Removidas 3 cópias locais. |
| Chave i18n `relatorios_filtro_xlsx` removida (pt+zh) | **Dívida que eu criei** na Onda 2 ao remover o botão XLSX e deixar o rótulo órfão. |
| `periodoVendasEquivalente` movida para `dashboardUtils.ts` | `page.tsx` do App Router só aceita os exports do contrato de rota — export nomeado quebrava o `next build`. |
| Variáveis `cn` e `lk` órfãs removidas | Sobras das migrações desta onda. |

---

## 2. Validação da PaginationBar (item 1)

### 2.1 Código morto — limpo

`grep` por `function PageLink|function PageNumber|function pageWindow|<PageLink|<PageNumber` fora do DS: **nenhuma ocorrência**. As três telas consomem só `components/ui/PaginationBar`.

### 2.2 Regressão visual — houve mudança, e ela é uma correção

Descrever a migração como "sem regressão visual" seria impreciso. Houve convergência deliberada, e ela **conserta dois hovers quebrados**:

| Tela | Hover antes | Resultado real | Depois |
|---|---|---|---|
| Catálogo | `bg-[var(--color-surface-elevated)]` | **Token nunca definido** em nenhum CSS do projeto → hover não aplicava nada | `--color-surface-soft` (slate-50) ✅ |
| Vendas | `bg-jl-surface-elev` | Resolve para `--color-surface` (#ffffff) — branco sobre card branco, sem contraste | `--color-surface-soft` ✅ |
| Estoque | `bg-[var(--color-surface-soft)]` | Funcionava | Idêntico |

Mesmo padrão do `P0-01` de `AUDITORIA_CONSISTENCIA_VISUAL.md`: token quebrado que falha em silêncio, sem erro em console.

Deltas intencionais restantes: raio 8px → 6px (catálogo, vendas) e corpo 11px → 12px (vendas, agora `text-caption`). `--color-border-secondary` é alias de `--color-border` — cor idêntica.

### 2.3 Testes das telas migradas

`components/ui/PaginationBar.behavior.test.tsx` — 10 testes: modo numerado (não renderiza com 1 página, desabilita nas pontas, `aria-current`, preserva filtros via `pageHref`), modo cursor (sem números, `hasMore` governa) e `pageWindow` (elipse, limites).

**Não verificado em navegador** — mesma razão das ondas anteriores: o admin exige sessão autenticada e o único ambiente Supabase é produção.

---

## 3. Testes executados

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | ✅ 0 erros |
| `next build` | ✅ compila |
| `next lint` | ✅ 0 warnings |
| Suíte completa | ✅ **937 testes / 170 arquivos** |
| Cobertura acrescentada nesta rodada | 4 (`periodoDrilldown`) |
| `guard:core` · `guard:pdv` · `guard:routes` · `guard:pricing` · `guard:deps` · `guard:domain` · `check:entity-ssot` | ✅ |
| `guard:rpc` | ❌ **pré-existente** — ver §4 |

> `next build` pegou um erro que `tsc` não pega (export nomeado em `page.tsx`). Confirma a nota de `project-jinlong`: rodar `next build` a cada ciclo, não só typecheck.

---

## 4. Riscos encontrados

### P0 — nenhum novo

### P1

**[P1-A] Resíduo de teste em produção — 5 lojas fantasma, 3 com usuário vinculado**

> ⚠️ **Reclassificado para P0 em 2026-08-07.** A auditoria de identidade (`docs/AUDITORIA_IDENTIDADE_PRODUCAO.md`) mostrou que o risco é maior do que descrito aqui. Os 3 usuários têm perfil **`DONO`**, e as policies `vendas_select_dono_todas_lojas` / `estoque_select_dono_todas_lojas` concedem leitura de **todas as lojas** a qualquer `DONO`, sem escopo. Não é "operar sobre estoque vazio" — é leitura das vendas e do estoque reais da Matriz. Some-se uma 4ª conta `DONO` de teste na própria Matriz (`e2e-dono@localhost.test`), não detectada nesta rodada.

Consulta em produção:

| Loja | Usuários | Estoque | Caixas |
|---|---|---|---|
| Matriz | 9 | 113 | 39 |
| Probe 1784431715968 | **1** | 0 | 0 |
| Probe 1784431787527 | **1** | 0 | 0 |
| Smoke Homolog 1784432057537 | **1** | 0 | 0 |
| Smoke Homolog 1784431993511 / 1784431560866 | 0 | 0 | 0 |
| Filial demo | 0 | 0 | 0 |

Só Matriz é operacional. As demais vieram de smoke tests e probes contra produção (não há staging — `project-infra-topologia-ambientes`).

**Por que é risco e não sujeira:** um usuário de teste vinculado a loja vazia consegue autenticar. `getUsuarioAtual()` devolve aquele `loja_id`, e todo o PDV passa a operar sobre um estoque inexistente — busca sem resultado, venda falhando na finalização. Conecta com o item já pendente em `GO_LIVE_RESUMO_EXECUTIVO.md` ("banir contas de teste em produção").

**Não executei remoção** — é ação destrutiva em produção e precisa da sua autorização explícita. Sugestão: desativar os 3 usuários antes do Go-Live; as lojas sem usuário são inertes e podem esperar.

**[P1-B] `guard:rpc` vermelho — pré-existente, inalterado**

`caixaFormasPagamento.impl.ts` aparece como caller duplicado de `finalizar_venda_transacional_canonica_v4`. Reproduzido em árvore limpa com `git stash` antes da Onda 1. Nada nas Ondas 1–2 tocou o fluxo de finalização. Precisa de análise própria — é o núcleo transacional congelado.

### P2

**[P2-A] `app/gerente` não é código morto — é a camada de actions viva do admin**

**41 arquivos** de `app/admin/*` importam de `app/gerente/*` (actions, tipos e até componentes-cliente inteiros: `ClientesListClient`, `ComprasGerentePageClient`).

`AUDITORIA_CONSISTENCIA_VISUAL.md` §0 descreve `app/gerente` como "árvore morta em produção" — verdade quanto a **rotas** (só 2 `page.tsx`, ambos redirect), mas falso quanto a **código**. Isso importa: tratar como morto convida a remoções que quebrariam o admin inteiro.

Não é para refatorar agora. É para **corrigir a descrição** e não agir sobre a premissa errada.

**[P2-B] Design System depende de uma tela**

`components/ui/admin-v2/AdminV2UtilityBar.tsx:7` importa `@/app/gerente/idioma/LanguageToggle`. Inversão de dependência: o DS deveria ser folha. Único caso — `components/ui` está limpo no resto, e `app/caixa` não importa de `app/admin` nem de `app/gerente`.

**[P2-C] Contratos duplicados fora do escopo desta onda**

| Contrato | Cópias | Onde |
|---|---|---|
| `UUID_RE` | **7** | `auditoria/actions`, `catalogo/page`, `estoque/actions`, `estoque/page`, `financeiro/actions`, `vendas/actions`, `caixa/server/caixaCatalogo.impl` |
| `oneOf<T>` | 4 | `auditoria`, `catalogo`, `estoque`, `vendas` (pages) |
| Cálculo de período | 2 | `dashboardUtils.getPeriodRange` × `vendas/page.periodoInicio` |

**Uma das 7 cópias de `UUID_RE` foi criada por mim** na Onda 1 (`caixaCatalogo.impl.ts`). Não consolidei porque o consumo cruza `app/admin` e `app/caixa` — criar um utilitário compartilhado às pressas produziria o import cross-boundary que este documento audita. Fica registrado, não escondido.

**[P2-D] Divergência teórica de loja no estoque exibido** — mantida documentada conforme sua orientação (R3). A UI deriva loja de `usuarios.loja_id`; a finalização, de `caixas.loja_id`. Convergem por construção hoje. Só divergem se `usuarios.loja_id` mudar no meio de um turno. **Sem ticket de observabilidade** — a probabilidade é baixa e instrumentar exigiria evento novo. Reavaliar se o multi-loja sair do escopo do piloto.

---

## 5. Dívida técnica criada

| Item | Estado |
|---|---|
| Chave i18n `relatorios_filtro_xlsx` órfã (Onda 2) | ✅ **removida nesta rodada** |
| 7ª cópia de `UUID_RE` (Onda 1) | ⚠️ **em aberto** — registrada em P2-C |
| `MAX_CANDIDATOS_BUSCA = 8` sem cobertura de teto | ⚠️ menor — se a busca casar 200 produtos, o operador vê 8 sem saber que há mais. Aceitável: o objetivo é escolher, não navegar o catálogo. Registrado. |

Nenhuma outra dívida. As duas ondas removeram mais código do que adicionaram em duplicação: −117 linhas de paginação, −3 cópias de `clampPage`, −1 botão morto.

---

## 6. Próximas decisões necessárias

| # | Decisão | Recomendação | Bloqueia Go-Live? |
|---|---|---|---|
| 1 | Desativar os 3 usuários de teste vinculados a lojas fantasma | **Sim, antes do Go-Live.** Ação destrutiva — precisa da sua autorização | **Sim** (P1-A) |
| 2 | Investigar `guard:rpc` (caller duplicado v4) | Análise própria, fora de UI | Provavelmente (P1-B) |
| 3 | Fonte única de período entre dashboard e vendas | **Backlog.** Só então o KPI de 7D/30D vira link | Não |
| 4 | Paginação real em contas a receber (ADR-010) | **Backlog**, com gatilho em ~150 títulos abertos | Não |
| 5 | Corrigir a descrição de `app/gerente` em `AUDITORIA_CONSISTENCIA_VISUAL.md` | Edição de documento | Não |

### Sobre a decisão 3 — por que não fiz a Opção A

A opção "criar filtro oficial de 30 dias em `/admin/vendas`" foi avaliada contra os seus próprios critérios (reutilizar contrato, não duplicar lógica de datas, centralizar regra de período). Fazer isso **corretamente** significa extrair uma fonte única de período consumida pelas duas telas — porque hoje já existem duas implementações divergentes, e adicionar um `case` em vendas aumentaria a duplicação em vez de reduzi-la.

Isso muda o significado de parâmetros de URL do dashboard, que é a tela principal do dono, a poucos dias do Go-Live. **O custo excede o benefício agora**: o ganho é um clique a menos em dois cards; o risco é regressão na tela mais visível. Mantido sem link, backlog aberto — exatamente a saída que você previu.

---

## 7. Critério de conclusão

| Critério | Estado |
|---|---|
| Testes verdes | ✅ 937/937 |
| Build/lint verdes | ✅ |
| Guards avaliados | ✅ 7 OK, 1 falha pré-existente isolada e documentada |
| Documentação atualizada | ✅ este documento + correções em `AUDITORIA_UI_UX_JINLONG.md` |
| Riscos classificados P0/P1/P2 | ✅ 0 P0 · 2 P1 · 4 P2 |

**Onda 2 fechada.** Nenhuma refatoração ampla executada; todas as alterações são locais e reversíveis por arquivo.
