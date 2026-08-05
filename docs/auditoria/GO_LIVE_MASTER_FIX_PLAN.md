# GO-LIVE MASTER FIX PLAN — Catálogo de Achados F1–F6.1

> 🔶 **DOCUMENTO SUBORDINADO — não é fila de execução** (reclassificado em 2026-08-05)
>
> Este documento **deixou de ser** "pacote executivo para Claude Code". Existiam duas filas
> paralelas endereçadas ao mesmo agente; a ambiguidade foi eliminada.
>
> | | |
> |---|---|
> | **Fila oficial única de execução** | `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` (Pacotes 0–6) |
> | **Autoridade normativa** | `docs/ARQUITETURA_REGRAS_NEGOCIO.md` (35 RNs, 7 ADRs) |
> | **Papel deste arquivo** | **Catálogo de achados e evidência** da série F1–F6.1 |
>
> Os itens F foram absorvidos pelo guia: **F3-001, F1-01, F1-02, F1-04, F1-06** no novo
> **Pacote 0**; **F1-07, F1-08, F6-PER-001** no **Pacote 1**; **F6-CMP-001, F6.1-VEN-001,
> RC-001, RC-002** no **Pacote 6**. As §§2 e 5 abaixo (ordem de implementação) estão
> **revogadas** — a ordem vigente é a do guia. O detalhe por item permanece válido e é
> a referência de "como corrigir".
>
> Consolidação de F1, F2, F2B, F3, F5, F6 e F6.1. **Não são novas auditorias** — mapa dos
> achados já confirmados. Gerado por Hermes (2026-08-03). Nenhum código foi alterado.

**Legenda de prioridade:** P0 = Bloqueador Go-Live · P1 = Funcionalidade necessária · P2 = Melhoria pós-Go-Live.
**Responsável sugerido:** BE=Backend · FE=Frontend · DAT=Dados/Banco · FISC=Fiscal · SEC=Segurança.
**Status:** todos `OPEN`.

---

## 1. Matriz consolidada de problemas

| Prio | ID | Problema (objetivo) | Origem | Área | Arquivos prováveis | Depende | Resp | Status |
|---|---|---|---|---|---|---|---|---|
| P1 | F2-PROD-003 / F2-FOR-001 | 0 fornecedores cadastrados → **Compras inoperante**. ⚠️ Rebaixado de P0: por **ADR-006** produto sem fornecedor é vendável; o bloqueio é do fluxo de compra, não do cadastro nem da venda | F2 | Fornecedor | `app/gerente/fornecedores/actions.ts` | F3 | DAT/BE | OPEN |
| P0 | F1-01 | 7/7 lojas sem CNPJ/razão/IE/endereço → nenhuma NFC-e emitida | F1 | Fiscal | `lojas` · `/admin/implantacao` | — | FISC | OPEN |
| P0 | F1-02 | `auto_enqueue_fiscal=false` default → fiscal desligado na origem | F1 | Fiscal | `provisionamentoDefaults.ts` · `pdv_config` | F1-01 | FISC/BE | OPEN |
| P1 | F1-03 | 105/113 produtos sem NCM; CSOSN 400 presumido. ⚠️ Rebaixado de P0 e **reescopado por ADR-002**: NCM bloqueia a **emissão fiscal**, nunca cadastro/publicação/venda. Vira P0 apenas se FLX-02 decidir "Go-Live com fiscal" | F1 | Fiscal | `produtos` · família `fiscal_*` | F2B-03 · FLX-02 | FISC/BE | OPEN |
| P0 | F1-04 | 5/7 lojas sem `pdv_config` (sem desconto/sangria/tributos) | F1 | Config | `pdv_config` · wizard provisionamento | F1-01 | BE | OPEN |
| P0 | F1-05 | Formas de pagamento hardcoded (enum em código, sem tabela) | F1 | Financeiro | `app/caixa/finalizarVendaValidation.ts` | — | BE | OPEN |
| P0 | F1-06 | `atualizarConfiguracao` sem whitelist, sem loja_id, sem `atualizado_por` | F1 | Config | `app/gerente/configuracoes/actions.ts` | F1-04 | BE | OPEN |
| P0 | F1-07 | GERENTE=DONO=ADMIN em 22/23 recursos (sensíveis liberados) | F1 | Segurança | `lib/admin/policy/adminPolicy.ts` | F1-08 | SEC | OPEN |
| P0 | F1-08 | 9 rotas `/admin` fora da policy (config, suspensao, etc.); fallback=allow | F1 | Segurança | `adminPolicy.ts` · middleware | F1-07 | SEC | OPEN |
| P1 | F2B-03 | NCM oculto por padrão (2 cliques + `modoCompleto=false`) → é a **causa** de F1-03. Correção é de **visibilidade do campo**, não de obrigatoriedade (ADR-002) | F2B | Produto/Fiscal | `ProdutoFormModal.tsx` · `ProdutoForm.tsx` | F1-03 | FE | OPEN |
| P0 | F3-001 | Base 100% teste (113 prod, 56 vendas, 39 caixas, 12 users fake) | F3 | Release | DB limpeza (staging) | — | DAT | OPEN |
| P0 | F6.1-REL-001 | Indicadores calculam sobre base 100% teste (F3) | F6.1 | Dados | `app/admin/dashboard` · `relatorios` | F3-001 | DAT | OPEN |
| P0 | F6.1-VEN-001 | KPI Vendas Admin soma só página visível (cursor, sem total) → info falsa | F6.1 | Vendas | `app/admin/vendas/page.tsx` · `buscarVendasPaginadasAction` | F3-001 | BE/FE | OPEN |
| P0 | F6-CMP-001 | `% comissão` existe no banco mas sem campo/action → não persiste | F6 | Funcionário | `FuncionarioEditarModal.tsx` · `actions.ts` | — | BE/FE | OPEN |
| P0 | F6-PER-001 | Rotas `configuracoes`/`suspensao` fora de `RESOURCE_PROFILES` | F6 | Segurança | `lib/admin/policy/adminPolicy.ts` | F1-08 | SEC | OPEN |
| P1 | F2-PROD-001 | 82 publicados sem categoria | F2 | Produto | `ProdutoFormModal.tsx` · `statusPublicacao.ts` | F6.1-PROD-001 | BE/FE | OPEN |
| P1 | F2-PROD-002 | 99 publicados sem marca | F2 | Produto | `form/sections/Classificacao` | — | BE/FE | OPEN |
| P1 | F2-PROD-004 | 66 sem custo / 70 sem atacado | F2 | Produto | `PrecosSection.tsx` | F1-13 | BE/FE | OPEN |
| P1 | F2-PROD-005 | 1 produto com margem negativa (varejo<custo) | F2 | Produto | `PrecosSection.tsx` | F2-PROD-004 | BE/FE | OPEN |
| P1 | F2-PROD-006 | 8 nomes duplicados (PDV confunde itens) | F2 | Produto | `app/gerente/produtos/actions.ts` | — | BE | OPEN |
| P1 | F2-PROD-007 | 68 publicados sem saldo (à venda mas indisponível) | F2 | Estoque | `estoqueInicialCadastro.ts` · PDV | F3-001 | BE/FE | OPEN |
| P1 | F2-USR-001 | 5 contas DONO (excesso de privilégio em seed) | F2 | Segurança | `adminPolicy.ts` · seed | F3-001 | SEC/DAT | OPEN |
| P1 | F1-12 | 13 produtos com gatilho atacado=0 → atacado dispara sempre | F1 | Produto | `precosAtacadoActions.ts` | F2-PROD-004 | BE | OPEN |
| P1 | F6-INF-001 | Config PDV vazia renderiza sem aviso (5/7 lojas) | F6 | Config | `ConfiguracoesContent.tsx` | F1-04 | FE | OPEN |
| P1 | F6-AUD-001 | Ações de cadastro não gravam trilha (conecta F5) | F6 | Auditoria | `app/*/actions.ts` | F5-VAL-01..04 | BE | OPEN |
| P1 | F6.1-VEN-002 | Devolução sem tabela de trilha dedicada | F6.1 | Vendas | `VendaDetalhe*` · action | F5-VAL-15 | BE | OPEN |
| P1 | F6.1-PROD-001 | Obrigatoriedade categoria/NCM inconsistente Catálogo↔PDV | F6.1 | Produto | `ProdutoFormModal` · `statusPublicacao` | F2-PROD-001 | BE/FE | OPEN |
| P2 | F2-PROD-008 | 2 inativos vendidos (regra PDV) | F2 | Produto | `app/caixa/*` | — | BE | OPEN |
| P2 | F2-PROD-009 | 7 categorias inativas (2 prod assoc) | F2 | Categoria | `categorias-produtos/*` | — | BE | OPEN |
| P2 | F2-PROD-010 | Histórico de preço vazio (0 regs) | F2 | Auditoria | `PrecosSection.tsx` · `historico_precos_produto` | F5-VAL-04 | BE | OPEN |
| P2 | F2-CLI-001 | Base de cliente insuficiente (1) p/ validar duplicidade | F2 | Cliente | `app/admin/clientes/actions.ts` | F3-001 | DAT | OPEN |
| P2 | F1-09/10/11 | 3 fontes de verdade; 4 chaves nunca lidas; `pricing_config_versions` órfã | F1 | Config | `configuracoes_gerais` · `pdv_config` | F1-04/06 | BE | OPEN |
| P2 | F1-13/15 | 66 sem custo; 1 atacado>varejo; 1 custo>venda | F1 | Produto | `PrecosSection.tsx` | F2-PROD-004 | BE | OPEN |
| P2 | F1-16 | `gerente_senha_bcrypt` nulo em 1 loja (auth gerencial indefinida) | F1 | Segurança | `pdv_config` | F1-04 | BE | OPEN |
| P2 | F2B-01/02 | Campos Categoria/Fornecedor/Marca sem `<label>`; obrigatórios só visuais | F2B | A11y | `ProdutoFormModal.tsx` | — | FE | OPEN |
| P2 | F5-VAL-01..15 | Validação em runtime de trilha (15 eventos, 0 falha confirmada) | F5 | Auditoria | `PLANO_VALIDACAO_F5_RUNTIME.md` | — | QA | OPEN |
| P2 | F6-VAL-001 | Varredura global de botões sem implementação | F6 | QA | `scripts/check-entity-ssot-boundary.mjs` | — | QA | OPEN |

**Total acionável:** 39 itens · **P0: 11** · **P1: 16** · **P2: 12**.
*(Reclassificação de 2026-08-05: F1-03, F2B-03, F2-PROD-003/F2-FOR-001 e F1-05 saíram de P0
para P1 por ADR-002/ADR-006 e por FLX-02 ser decisão de escopo, não bloqueio de código.)*

**Onde cada item é executado:** ver mapa de absorção no cabeçalho e §6 do
`docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`.

---

## 2. Ordem recomendada de implementação — 🚫 REVOGADA

> **Revogada em 2026-08-05.** A ordem de execução vigente é a dos **Pacotes 0–6** do
> `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`. As §§2 e 5 deste arquivo permanecem apenas como
> registro histórico do raciocínio de priorização da série F, que foi incorporado ao guia.
> **Não executar a partir daqui.**

### BLOQUEADORES GO-LIVE (P0) — devem ser zerados antes de abrir a loja
Itens que impedem confiança operacional: dados de teste, indicadores incorretos,
configuração fiscal/segurança crítica ausente, qualquer risco fiscal.

| Grupo | IDs | Dependências |
|---|---|---|
| **Dados** | F3-001, F6.1-REL-001 | F3-001 precede tudo o que lê base real |
| **Fiscal** | F1-01, F1-02, F1-03, F2B-03 | F1-01 (CNPJ) habilita emissão; F2B-03 garante NCM no cadastro |
| **Config/Segurança** | F1-04, F1-05, F1-06, F1-07, F1-08, F6-PER-001 | F1-08 precede F6-PER-001 (mesma `RESOURCE_PROFILES`) |
| **Cadastro/Operação** | F2-PROD-003/F2-FOR-001, F6-CMP-001, F6.1-VEN-001 | F2-FOR-001 libera Compras; F6.1-VEN-001 corrige KPI |

### FUNCIONALIDADES NECESSÁRIAS (P1) — impactam operação real
| Grupo | IDs | Dependências |
|---|---|---|
| **Comissão/Permissão** | F6-CMP-001 (já P0), F2-USR-001 | F3-001 (limpar seed) precede F2-USR-001 |
| **Qualidade de cadastro** | F2-PROD-001/002/004/005/006/007, F1-12, F6.1-PROD-001 | F6.1-PROD-001 unifica regra com F2-PROD-001 |
| **Auditoria** | F6-AUD-001, F6.1-VEN-002 | dependem de F5-VAL-01..04/15 (validação) |
| **Config UX** | F6-INF-001 | depende de F1-04 (pdv_config existe) |

### MELHORIAS PÓS GO-LIVE (P2) — importantes, não impeditivos
F2-PROD-008/009/010 · F2-CLI-001 · F1-09/10/11/13/15/16 · F2B-01/02 · F5-VAL-* · F6-VAL-001.
Executar após o primeiro cliente real, com dados reais para validar.

---

## 3. Detalhe por item — "como corrigir"

Cada item: **Problema atual → Resultado esperado → Critérios de aceite → Arquivos**.
Esta seção **permanece vigente** e é a referência de conteúdo para os itens F absorvidos
pelos Pacotes 0, 1 e 6 do guia. Detalhe completo só para os itens de maior severidade.

### Itens de maior severidade

#### F3-001 — Limpeza de dados de teste
- **Problema:** base 100% seed/teste (113 prod, 56 vendas, 39 caixas, 12 users fake, 2 NF mock, 5 lojas `PROBE_/SMOKE_`).
- **Resultado:** ambiente limpo + dados reais populados (1 Dono, operadores, fornecedores, produtos via NF-e/CSV, clientes).
- **Aceite:** query de contagem retorna 0 para padrões `QA|SMOKE|CTR|TX|E2E|Probe|Demo|PROBE_|SMOKE_`; ao menos 1 Dono real ativo; `fornecedores` ≥1; `produtos` só reais. Rodar em staging primeiro, com backup.
- **Arquivos:** `scripts/` de limpeza + ordem FK (F3 §5).

#### F1-01 — Identificação fiscal da loja
- **Problema:** `lojas.cnpj/razao_social/inscricao_estadual/endereco` = null em 7/7.
- **Resultado:** loja de produção com dados fiscais preenchidos e travados (NOT NULL p/ ativas não-teste).
- **Aceite:** `SELECT count(*) FROM lojas WHERE ativo AND cnpj IS NULL` = 0; emitir com loja incompleta falha antes da SEFAZ.
- **Arquivos:** `lojas` (migration constraint) · `/admin/implantacao` (gate).

#### F1-02 — Auto-enfileiramento fiscal
- **Problema:** `pdv_config.auto_enqueue_fiscal=false` (default em `provisionamentoDefaults.ts:7`, teste fixa `false`).
- **Resultado:** default `true` p/ lojas com emissão; campo exposto na UI de Configurações.
- **Aceite:** venda concluída gera registro na fila fiscal sem intervenção manual; atualizar `provisionamentoDefaults.test.ts`.
- **Arquivos:** `app/admin/provisionamento/provisionamentoDefaults.ts` · `ConfiguracoesContent.tsx`.

#### F1-03 + F2B-03 — NCM visível no cadastro; exigência **só** na emissão (ADR-002)
> ⚠️ **Reescopado em 2026-08-05 por ADR-002.** A redação original mandava *"bloquear Publicar
> sem NCM"* — o oposto da decisão aprovada da direção: *"Cadastro, publicação, venda, pedido e
> recebimento **não** verificam NCM."* A ADR prevalece. Ver `FRN-01`.
- **Problema:** 105/113 sem NCM; campo fiscal oculto (2 cliques + `modoCompleto=false` no cadastro novo).
- **Resultado:** NCM **visível** no nível 1 do formulário (reduz a origem do problema);
  `fiscal_enfileirar_documento_venda` recusa/parqueia o documento sem NCM com erro claro.
- **Aceite:** (a) NCM aparece sem cliques extras no cadastro novo; (b) enfileiramento sem NCM
  falha na fronteira fiscal; (c) **teste de regressão** provando que publicar e vender **não**
  são bloqueados por NCM ausente.
- **Arquivos:** `components/gerente/produtos/ProdutoFormModal.tsx:135` · `ProdutoForm.tsx:183` · família `fiscal_*`.

#### F1-04 — pdv_config para toda loja ativa
- **Problema:** 5/7 lojas sem linha `pdv_config` (sem desconto/sangria/tributos).
- **Resultado:** `pdv_config` criado na mesma TX de criação da loja (defaults prontos no wizard).
- **Aceite:** `COUNT(lojas ativas) = COUNT(pdv_config)`.
- **Arquivos:** wizard provisionamento · gate de implantação.

#### F1-05 — Formas de pagamento parametrizáveis
- **Problema:** enum fixo em `finalizarVendaValidation.ts:11-16`; tabelas `formas_pagamento`/`contas_financeiras` não existem.
- **Resultado:** tabela `formas_pagamento` por loja (nome, tipo, taxa%, prazo, ativo); validação lê do cadastro.
- **Aceite:** adicionar nova forma sem tocar código; manter 4 atuais como seed.
- ⚠️ **Restrição de contrato:** **fiado permanece fora do escopo do piloto D0** — é requisito
  negativo do contrato, removido pelas migrations `246_remover_venda_fiado` e
  `284_devolucoes_remove_fiado`. A parametrização **não** pode reintroduzi-lo.
- **Arquivos:** `app/caixa/finalizarVendaValidation.ts` · migration `formas_pagamento`.

#### F1-06 — atualizarConfiguracao segura
- **Problema:** chave livre, sem `loja_id`, sem `atualizado_por` (`configuracoes_gerais` global).
- **Resultado:** whitelist de chaves + validação de tipo; `loja_id` (ou migrar p/ `pdv_config`); gravar `atualizado_por`.
- **Aceite:** chave fora da whitelist rejeitada; alteração na Loja A não afeta Loja B; `atualizado_por` preenchido.
- **Arquivos:** `app/gerente/configuracoes/actions.ts:15-30`.

#### F1-07 + F1-08 + F6-PER-001 — Matriz de permissão
- **Problema:** 22/23 recursos `ALL_ADMIN_PROFILES` (GERENTE=DONO=ADMIN, sensíveis liberados); 9 rotas `/admin` fora de `RESOURCE_PROFILES` (config, suspensao); fallback = allow.
- **Resultado:** recursos `sensitive:financeiro`/`comissoes`/`configuracoes`/`suspensao` → `['DONO','ADMIN']`; mapear 9 rotas; **fallback vira `deny`**.
- **Aceite:** sessão GERENTE recebe `deny` em recursos financeiros; teste que enumera `app/admin/*` e falha se rota não declarada.
- **Arquivos:** `lib/admin/policy/adminPolicy.ts:55-88` (22/23) · `:66-80` (9 rotas) · `:90-95` (fallback) · middleware.

#### F2-PROD-003 / F2-FOR-001 — Fornecedor para o fluxo de Compras (P1)
> ⚠️ **Reescopado em 2026-08-05 por ADR-006.** *"Produto pode existir sem fornecedor. Venda
> permanece permitida. Processos de compra exigem fornecedor."* Logo: **não** exigir fornecedor
> no cadastro de produto e **não** tratar produto sem fornecedor como pendência de venda.
> Ver também **Pacote 3** do guia (TB-05/ADR-001), que dá `loja_id` a `fornecedores`.
- **Problema:** `fornecedores` vazia → Ordem de Compra, recebimento e importação de NF-e de
  compra ficam inoperantes (os quatro processos que ADR-006 lista como exigindo fornecedor).
- **Resultado:** ≥1 fornecedor ativo por loja; Compras operante.
- **Aceite:** `fornecedores` ≥1 ativo; Compras seleciona fornecedor; validação de CNPJ na criação;
  **nenhum** bloqueio de cadastro, publicação ou venda de produto por fornecedor ausente.
- **Arquivos:** `app/gerente/fornecedores/actions.ts` · `FornecedorQuickField.tsx`.

#### F6-CMP-001 — Comissão % persiste
- **Problema:** `usuarios.comissao_percentual` existe (CHECK 0-100) mas `FuncionarioEditarModal` e `actions.ts` não o incluem.
- **Resultado:** campo `% comissão` (0-100) visível e gravado; `carregarResumoComissoes` usa valor real.
- **Aceite:** editar funcionário grava `comissao_percentual`; resumo de comissões reflete valor.
- **Arquivos:** `app/admin/funcionarios/FuncionarioEditarModal.tsx` · `actions.ts:31-45,230-238`.

#### F6.1-VEN-001 — KPI Vendas Admin correto
- **Problema:** `app/admin/vendas/page.tsx:146-161` soma `reduce(vendasDaPagina)`; `buscarVendasPaginadasAction` retorna `hasMore` (cursor, sem total) → "Faturado" subestima o período.
- **Resultado:** agregação server-side por período (faturamento total, qtd vendas, cancelamentos, ticket médio).
- **Aceite:** KPI validado com (a) <1 página, (b) múltiplas páginas, (c) filtro de período, (d) vendas canceladas, (e) comparação com `SELECT sum(total_liquido)` no banco.
- **Arquivos:** `app/admin/vendas/page.tsx` · `buscarVendasPaginadasAction`.

### P1 — FUNCIONALIDADES (resumo → ticket original)
- **F2-PROD-001/002/004/005/006/007**, **F1-12**, **F6.1-PROD-001** → `GO_LIVE_TICKETS_F2_CADASTROS.md` + `GO_LIVE_TICKETS_F6_1_EXPANSAO.md`.
- **F2-USR-001** → `GO_LIVE_TICKETS_F2_CADASTROS.md`.
- **F6-INF-001** → `GO_LIVE_TICKETS_F6_COHERENCIA.md`.
- **F6-AUD-001**, **F6.1-VEN-002** → dependem de `PLANO_VALIDACAO_F5_RUNTIME.md` (F5-VAL-01..04/15).

### P2 — MELHORIAS → tickets originais (F2/F1/F2B/F5/F6). Executar pós-primeiro-cliente.

---

## 4. Dependências entre tickets

```
F3-001 (limpar teste)
 ├─> F6.1-REL-001 (indicadores reais)
 ├─> F6.1-VEN-001 (KPI sobre base real)
 ├─> F2-USR-001 (reter 1 Dono real)
 ├─> F2-PROD-007 (estoque real)
 └─> F2-CLI-001 (clientes reais)

F1-01 (CNPJ loja)
 └─> F1-02 (auto_enqueue) ─> emissão fiscal funciona
 └─> F1-03 (NCM) + F2B-03 (NCM visível) ─> nota emitida sem rejeição

F1-04 (pdv_config p/ toda loja)
 ├─> F6-INF-001 (aviso PDV ausente)
 ├─> F1-06 (config por loja)
 └─> F1-09/10/11 (consolidar fontes)

F1-08 (9 rotas mapeadas) ─> F6-PER-001 (config/suspensao na policy)
 └─> F1-07 (perfis diferenciados) ─> matriz de permissão completa

F5-VAL-01..04 (validar trilha cadastro/preço)
 └─> F6-AUD-001 (cadastro grava trilha)
F5-VAL-15 (validar devolução)
 └─> F6.1-VEN-002 (devolução com trilha)

F2-PROD-001 (categoria obrigatória p/ publicar)
 └─> F6.1-PROD-001 (regra única Catálogo↔PDV)
F2-PROD-004 (custo/atacado)
 ├─> F2-PROD-005 (margem negativa)
 └─> F1-12 (gatilho atacado)

F2-FOR-001 (fornecedor) ─> libera Compras (recebimento com origem)
```

**Regra de bloqueio para execução:** não iniciar item filho antes do pai. P0 fiscal
(F1-01→F1-02→F1-03/F2B-03) é o caminho crítico — sem ele, nenhuma venda emite nota.

---

## 5. Ordem final sugerida para execução — 🚫 REVOGADA (ver §2)

Justificativa técnica: **caminho fiscal primeiro** (sem ele nada é emitido), depois
**dados/segurança** (base limpa + acesso controlado), depois **cadastro operacional**
(fornecedor/comissão), e por fim **qualidade de dados** (P1) e **melhorias** (P2).

1. **F3-001** — limpar base de teste + popular real. *Base de tudo; sem isso, qualquer
   validação de KPI/auditoria é sobre lixo.* (DAT)
2. **F1-01** — CNPJ/razão/IE/endereço da loja. *Habilita emissão fiscal.* (FISC)
3. **F1-02** — `auto_enqueue_fiscal=true` + UI. *Liga a fila fiscal.* (FISC/BE)
4. **F1-03 + F2B-03** — NCM obrigatório e visível no cadastro. *Evita rejeição SEFAZ.* (FISC/FE)
5. **F1-04** — `pdv_config` para toda loja ativa. *Desconto/sangria/tributos definidos.* (BE)
6. **F1-05** — tabela `formas_pagamento`. *Operação real (fiado, parcelado) sem deploy.* (BE)
7. **F1-06** — `atualizarConfiguracao` com whitelist + loja_id + `atualizado_por`. *SSOT/tenancy.* (BE)
8. **F1-08 → F6-PER-001 → F1-07** — mapear 9 rotas, fallback deny, perfis diferenciados.
   *Fecha acesso a config/suspensao/financeiro.* (SEC)
9. **F2-PROD-003 / F2-FOR-001** — cadastrar ≥1 fornecedor real. *Libera Compras/reposição.* (DAT/BE)
10. **F6-CMP-001** — campo `% comissão` persiste. *Fecha Comissões operacionalmente.* (BE/FE)
11. **F6.1-VEN-001** — KPI Vendas Admin por período (server-side). *Indicador confiável.* (BE/FE)
12. **F6.1-REL-001** — selar indicadores sobre base real (já coberto por F3-001). *Validação.* (DAT)
13. **F2-PROD-001/002/004/005/006/007 + F1-12 + F6.1-PROD-001** — qualidade de cadastro
    (categoria, marca, custo, margem, nomes, estoque, gatilho atacado, regra única). *P1.* (BE/FE)
14. **F2-USR-001** — reter 1 Dono real, inativar seed. *Segurança de acesso.* (SEC/DAT)
15. **F6-INF-001** — aviso de PDV sem config. *UX fiscal.* (FE)
16. **F6-AUD-001 + F6.1-VEN-002** — após F5-VAL-01..04/15: cadastro + devolução com trilha. *Auditoria.* (BE)
17. **P2 em lote** — F2-PROD-008/009/010 · F2-CLI-001 · F1-09/10/11/13/15/16 · F2B-01/02 ·
    F5-VAL-* · F6-VAL-001. *Pós-primeiro-cliente.* (BE/FE/QA)

**Validação final (Definition of Done do Go-Live):**
- `lojas` ativa com CNPJ + `pdv_config` + `auto_enqueue_fiscal=true`.
- 0 registros de padrão de teste em qualquer tabela operacional.
- Toda rota `/admin` declarada em `RESOURCE_PROFILES`; GERENTE recebe `deny` em financeiro.
- `fornecedores` ≥1; `usuarios.comissao_percentual` gravável; KPI de vendas bate com `sum` do banco.
- NF-e de teste emitida em staging com sucesso (happy path fiscal fechado).

➡️ **Fila oficial de execução:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` (Pacotes 0–6).
➡️ **Autoridade normativa:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md`.
➡️ Tickets detalhados: `tickets/GO_LIVE_TICKETS_F{2,5,6,6_1}_*.md`.
➡️ Validação de trilha: `PLANO_VALIDACAO_F5_RUNTIME.md`.

