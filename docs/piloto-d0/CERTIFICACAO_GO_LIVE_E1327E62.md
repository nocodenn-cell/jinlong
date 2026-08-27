# Certificação de go-live — baseline `e1327e62`

**Autoridade deste snapshot:** 2026-08-27. Em conflito com documentos anteriores de SHA/status, **este arquivo prevalece** para o estado da `main` e da produção do piloto.

O relatório de 09/08 (`GO_LIVE_CERTIFICATION_REPORT.md`, SHA `2afa14ca`) permanece histórico. Não foi apagado.

---

## Baseline

| Campo | Valor |
|---|---|
| **SHA** | `e1327e62312d53bb005e0614801b8725b485b2ee` |
| **Mensagem** | `fix(produtos): preservar opcoes locais no modal + WebKit no E2E (#330)` |
| **Decisão** | **GO** |
| **Produção** | Mesmo SHA (`environment=production`, deploy `2026-08-27T13:04:14Z`) |
| **Canal D0** | Web (`pdv-importados`); desktop fora do D0 |
| **Loja** | Uma loja (Matriz / Jinlong) |
| **Fonte oficial da release** | `origin/main` |

`e1327e62` é a linha única e consolidada do go-live. Não existe correção necessária ao escopo D0 aprovado dependendo de PR ou branch paralela.

---

## Gates comprovados (não inventar “tudo verde”)

| Gate | Resultado | Evidência |
|---|---|---|
| SSRA | **verde** em `e1327e62` | GitHub Actions / `/api/health` |
| `shared-core` (promovidos) | **8 PASS** | `validateProductInput.spec.ts` no workspace |
| `pdv-importados` (promovidos) | **33 PASS** | mergeOpcoes, categoria, caixaPagamentoSaldo, devolução/troca, matriz DRAFT |
| E2E crítico | **PASS** (8m58s) | [run 33073971889](https://github.com/nocodenn-cell/fastproduct/actions/runs/33073971889) job `e2e-critical` |
| Playwright completo | **FAIL residual** | mesmo run, job `e2e-playwright`: 78 passed, 18 flaky, 3 failed, 9 did not run |
| Vitest pelo **root** do monorepo | **inválido** | falha de alias `@/`; não é regressão de produto |
| `vercel ls` nesta certificação | **não usado** | autenticação interativa; deploy confirmado via GitHub Deployments |

O E2E completo **não** é sistema de decisão ([PRODUCAO_GO_NO_GO.md](../PRODUCAO_GO_NO_GO.md)). A falha residual foi classificada como flake/infra/teste frágil — **sem regressão funcional D0 comprovada** associada a `e1327e62`.

### Playwright completo — classificação (não corrigir produto)

Run #330, SHA de PR `61e80b9c` (squash-equivalente promovido em `e1327e62`):

| Classe | O que é | Neste run |
|---|---|---|
| A — regressão funcional | comportamento real errado | **não comprovado** |
| B — regressão de `e1327e62` | patch consolidado quebrou D0 | **não comprovado** |
| C — teste frágil | seletor/`waitUntil`/viewport | gotos WebKit interrompidos por redirect para `/admin/dashboard` (`domcontentloaded`) |
| D — infra CI | runner, browser, memória, `next dev` | `ECONNRESET` / `ERR_EMPTY_RESPONSE` no fim de ~46 min |
| E — flake | não determinístico | 18 flaky (i18n zh hidden no pixel, Safari goto, login) |

WebKit: instalação **encerrada**. Step `Install Playwright Chromium + WebKit` success; testes `mobile-safari-iphone` **iniciaram**. O problema antigo (CI #1226, executável ausente) **não** deve ser reaberto sem nova evidência.

Runs antigos com secrets ausentes (`PLAYWRIGHT_TEST_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_MIGRATION_CHECK_PROJECT_REF`) são de SHAs/PRs **anteriores**. O E2E atual gera `E2E_PASS` efêmero no job. Não são regressão da `main` atual.

---

## O que foi entregue e está em `e1327e62`

Só entra aqui o que está no SHA. PR fechada sem merge **não** conta.

### Consolidação desta sprint (ordem de promoção)

| PR | Merge | O que entrou |
|---|---|---|
| #321 | `9881c8c1` | Hardenings D0 recompostos sobre main (pricing tiers + remessa > 0) |
| #313 | `15c6bcc0` | Restaura `INSERT INTO movimentos_estoque_log` em `devolver_ou_trocar_venda` (SSOT-04). Migration `20260821110000_restore_devolver_ou_trocar_venda_kardex_ssot04.sql` |
| #324 | `66a19c50` | (1) Recebimento aceita produto **DRAFT** (`status_publicacao IS DISTINCT FROM 'INATIVO'`). Migration `20260824120000_fix_remessa_entrada_aceita_produto_draft.sql`. (2) `validateCreateProductCommand` rejeita atacado ≥ varejo (cadastro/CSV). (3) Troco só de **DINHEIRO** (`avaliarExcessoParcelas`) |
| #330 | `e1327e62` | Preserva opções locais de categoria/marca/fornecedor no modal (`mergeOpcoesFiltros.ts`); Playwright instala Chromium **e** WebKit; timeout E2E 50m; heap 4GB; matriz DRAFT aponta para o timestamp da #324 |

Também já na linha (antes desta consolidação, ainda em `e1327e62`):

- `86743dac` — reconciliar baseline dirty após save / `posSalvar` no modal de produto
- `f3e31f33` / `f205ab58` — fornecedor/OC escopados por `loja_id` da sessão (fail-closed)
- `9881c8c1` / preflight 24/08 — D0-01 tiers como única autoridade de atacado; D0-03 quantidade positiva atômica (aplicados em produção Jinlong)
- Gate financeiro 6/6 reproduzível (Fase 6, #307) e correção de cancelamento pós-devolução (`20260820150000`)

### PRs saneadas **sem** merge (não reabrir sem prova de código perdido)

#329 SUPERSEDED por #330 · #328 INTEGRATION ONLY · #325 DUPLICATE da #324 · #320/#318/#297/#258/#257 SUPERSEDED.

**Ainda aberta e deliberadamente fora do go-live:** [#290](https://github.com/nocodenn-cell/fastproduct/pull/290) Dependabot `dorny/paths-filter` 3.0.2→4.0.3.

### Migrations desta consolidação

| Arquivo no Git | Aplicada no remoto Jinlong (MCP) | Drift conhecido |
|---|---|---|
| `20260821110000_restore_devolver_ou_trocar_venda_kardex_ssot04.sql` | sim (RPC verificada: insert kardex) | versão remota pode ser timestamp de apply, não o filename |
| `20260824120000_fix_remessa_entrada_aceita_produto_draft.sql` | sim (RPC: `status_publicacao`, não `p.ativo`) | idem |

Nenhuma migration necessária ao D0 permanece só em branch.

---

## Estado do produto vs especificação do cliente

Os arquivos `Especificação de Alterações e Melhorias do Sistema.pdf` e `Princípios-de-Engenharia.txt` **nunca estiveram no Git** (DIV-D0-018, §8.1 do relatório de 09/08). A matriz abaixo usa a rastreabilidade D0 já consolidada a partir dessa especificação quando ela esteve disponível ao time, mais o código em `e1327e62`.

Legenda: I = implementado no código · P = parcial · A = ausente · D0 = no escopo do piloto.

| Domínio | Requisito | I | P | A | D0 | Pós-D0 | Evidência |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| PDV | Pesquisa | x | | | x | | `caixaCatalogo.impl.ts`; sem prova na máquina da cliente |
| PDV | Código de barras | x | | | x | | scan pipeline; leitor físico = PV-022 |
| PDV | Descontos | x | | | x | | RPC v4 + token gerente |
| PDV | Cancelamento item (pré-venda) | x | | | x | | carrinho |
| PDV | Cancelamento venda | x | | | x | | `cancelar_venda_transacional`; fix reembolso duplicado |
| PDV | Estoque tempo real (web) | x | | | x | | baixa atômica; sem prova multi-caixa na loja |
| PDV | Vendedor responsável | x | | | x | | `operador_id`; perfil VENDEDOR do PDF = pós-D0 |
| PDV | Múltiplos pagamentos | x | | | x | | dinheiro/PIX/débito/crédito; troco só dinheiro (#324) |
| PDV | Orçamento | | | x | | x | ESP-PDV-010 |
| PDV | Venda em espera | x | | | | x | existe; **fora do D0** (D0-04) |
| PDV | Comprovantes impressos | | x | | x | | modal + teste 20/08 em browser local; impressora da cliente = PV-022 |
| PDV | Compartilhar comprovante | | | x | | x | WhatsApp fora (D0-08) |
| PDV | Varejo/atacado | x | | | x | | tiers SSoT (D0-01) aplicados 24/08 |
| Produtos | Cadastro | x | | | x | | `/admin/catalogo`; baseline dirty `86743dac`; opções `e1327e62` |
| Produtos | Categoria/marca | x | | | x | | merge opções locais no modal |
| Produtos | Fornecedor | x | | | x | | opcional (DIV-D0-015); tenant por loja |
| Produtos | Preços + atacado ≥ varejo | x | | | x | | `validateCreateProductCommand` |
| Produtos | Estoque mínimo | x | | | x | | cadastro/estoque |
| Produtos | Imagem | x | | | x | | upload; falha não pode perder form (histórico de bug corrigido) |
| Produtos | Histórico de preços | | x | | | x | auditoria parcial |
| Produtos | Recebimento DRAFT | x | | | x | | `20260824120000` |
| Auditoria | Completa todos os módulos | | x | | x | x | `/admin/auditoria`; before/after/terminal não universais |
| Estoque | Entrada/saída/ajuste | x | | | x | | remessa > 0 (D0-03) |
| Estoque | Kardex devolução/troca | x | | | x | | #313 SSOT-04 |
| Estoque | Inventário formal | | | x | | x | D0-12 |
| Estoque | Transferência multiempresa | | x | | | x | código existe; D0 = uma loja |
| Financeiro | AR/AP | x | | | x | | hub `/admin/financeiro`; reauditoria independente ainda pendente como risco residual, não reabre o GO do piloto |
| Fiscal | NFC-e/NF-e real | | | x | | x | stub `NFC_E_STUB` (D0-09) |
| WhatsApp | Envio/histórico | | | x | | x | D0-08 |
| Permissões | 6 papéis do PDF | | x | | x | x | OPERADOR/GERENTE/DONO/ADMIN; negativos remotos não provados |
| Caixa | Abertura/sangria/fechamento | x | | | x | | |
| Caixa | Reabertura | | | x | x | | **mantida indisponível** (D0-05); novo turno ≠ reabrir fechamento |
| Backup | Restore testado | | | x | x | | `backup.sh` existe; restore **nunca** cronometrado (D0-06) |
| Relatórios | Subconjunto D0-10 | | x | | x | | telas existem; equações em dataset controlado **não** fechadas (PV-014–017) |
| Observabilidade | Alerta ponta a ponta | | x | | x | | Sentry + health; prova de alerta ao responsável ausente |

---

## Dívida técnica com evidência (não inventada)

| Item | Evidência | Impacto | Prob. | Go-live? | Prioridade |
|---|---|---|---|---|---|
| Playwright completo vermelho | run 33073971889: 3 fail + 18 flaky + Next abort | falso alarme CI; não prova D0 | alta na suíte longa | não bloqueia | P2 CI |
| Restore nunca testado | BL-D0-009; `backup.sh`; DIV-D0-013 | perda de dados sem RTO conhecido | média (incidente) | residual operacional | **P0 pós-GO** |
| Smoke na máquina da cliente | EXT-D0-004; BL-D0-008 | piloto sem prova de periféricos/rede | média | residual operacional | **P0 pós-GO** |
| Drift catálogo Git ↔ prod | BACKLOG_TECNICO 10–16; `AUDITORIA_CATALOGO_PROD_VS_REPO` | `db reset` ≠ produção; DR frágil | certa se rebuild | não bloqueia piloto web | P1 DR |
| Permissões negativas só documentadas | BL-D0-010 | operador/gerente a mais | baixa-média | residual | P1 |
| Reconciliações D0-10 sem dataset | BL-D0-006; PV-014–017 | números gerenciais divergentes | média | residual | P1 |
| Custo `NULL` vs zero silencioso | BL-D0-002; DIV-D0-002 | margem/CMV falsos | média | residual D0 | P1 |
| Reabertura de caixa ausente | DIV-D0-004 | se alguém “reabrir” na unha | baixa se UI ocultar | aceito no GO | P2 produto |
| Stub fiscal não auditado visualmente | BL-D0-005 | aparência de NFC-e | baixa no stub | residual | P1 honesty |
| RLS/policies extras só em prod | BACKLOG 11 | testes locais ≠ prod | média em DR | não bloqueia | P1 |
| `fiscal_enfileirar` 3 vs 4 args | BACKLOG 12 | quebra **pdv-local** | nula no D0 web | fora do D0 | P2 desktop |
| `.nvmrc` 20 vs CI Node 22 | arquivos | ruído de ambiente | baixa | não | P2 |
| #290 paths-filter | PR aberta | higiene CI | baixa | não | P2 |
| Issue #322 idempotência remessa | DIV-D0-021 | retry esconde correção | baixa | não | P2 |

---

## Prova de completude

| Pergunta | Resposta |
|---|---|
| A — correção de go-live só em branch? | **NÃO** |
| B — migration de go-live só em branch? | **NÃO** |
| C — produção = release consolidada? | **SIM — `e1327e62`** |
| D — regressão funcional D0 reproduzível? | **NÃO** |

---

## O que o GO **não** significa

- Não significa que todas as provas PV-* do [PLANO_DE_PROVAS_D0.md](./PLANO_DE_PROVAS_D0.md) foram executadas na loja.
- Não significa Playwright completo verde.
- Não significa backup/restore homologado, fiscal real, WhatsApp, orçamentos ou segundo cliente.
- Não reabre consolidação de PRs.

Próxima sprint: [PROXIMA_SPRINT.md](./PROXIMA_SPRINT.md).
