# Auditoria Hermes v1 — Índice de Tickets (SEC / DAT / FLX / BR / CA / TB-01)

> 📎 **DOCUMENTO HISTÓRICO — rodada 1 de 3.** Deixou de ser "fila de correção".
> A §"Ordem de execução recomendada" abaixo foi **superada** por: v2 → v3 → consolidação R1.
> **Fila única de execução vigente:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` (Pacotes 0–6).
> **Reclassificações posteriores:** FLX-02 deixou de ser P0 e virou decisão de escopo comercial;
> TB-05 (rodada 3) entrou como P0 novo; as 3 decisões pedidas à direção aqui foram resolvidas
> pelas ADRs 001–007 em 2026-08-04. O conteúdo por ticket permanece válido como evidência.

**Data:** 2026-08-04
**Auditor:** Hermes (Chief of Staff / Release Manager)
**Escopo:** `C:\fastproduct` — backend (239 migrations Supabase), `pdv-importados` (Next.js), `pdv-local`, `shared-core`
**Regra de emissão:** somente `bug`, `regra faltante`, `inconsistência`, `risco técnico`, `falha operacional`. Nenhum ticket de "melhoria".

## Fontes de evidência

| Fonte | Caminho |
|---|---|
| Migrations | `backend/supabase/migrations/*.sql` |
| **Schema real de produção** | `backend/docs/auditoria/supabase-migration-repair-20260802/remote_schema.sql` (UTF-16LE, dump 2026-08-02 19:08) |
| Status de migrations aplicadas | mesma pasta, `migration_status_current.txt` |
| PDV / Admin | `pdv-importados/app/**` |

> O dump de produção é o achado mais valioso desta auditoria: permite comparar **o que o repositório diz** com **o que está de fato no banco**. Três tickets P0 saem exatamente dessa divergência.

## Sumário executivo

| Prioridade | Qtd | Tickets |
|---|---|---|
| **P0** | 5 | SEC-01, SEC-02, DAT-01, FLX-01, FLX-02 |
| **P1** | 6 | BR-01, BR-02, BR-03, DAT-02, DAT-03, FLX-03 |
| **P2** | 3 | BR-04, CA-01, TB-01 |

**Veredito de Go-Live:** BLOQUEADO. Os cinco P0 são de segurança, integridade e continuidade fiscal — nenhum é contornável por processo manual.

### Cobertura da auditoria

| # | Auditoria solicitada | Status |
|---|---|---|
| 1 | Regras de negócio ausentes | Coberta — BR-01..04 |
| 2 | Cálculos | Coberta — CA-01 (baixa incidência; ver nota) |
| 3 | Tela → Backend | **Parcial** — TB-01; ver "Lacunas" |
| 4 | Segurança e permissões | Coberta — SEC-01, SEC-02 |
| 5 | Integridade de dados | Coberta — DAT-01..03 |
| 6 | Fluxos críticos | Coberta — FLX-01..03 |

## Arquivos desta auditoria

| Arquivo | Conteúdo |
|---|---|
| `tickets_P0_seguranca.md` | SEC-01, SEC-02 |
| `tickets_P0_integridade.md` | DAT-01, FLX-01 |
| `tickets_P0_fluxo_fiscal.md` | Mapa de fluxo + FLX-02 |
| `tickets_P1_regras_negocio.md` | BR-01, BR-02, BR-03 |
| `tickets_P1_P2_restantes.md` | FLX-03, DAT-02, DAT-03, BR-04, CA-01, TB-01 |

---

## O que foi verificado e está SÃO

Registro explícito — auditoria que só aponta defeito não serve para decidir. Estes pontos foram investigados e **não** geraram ticket, com evidência:

- **Autoridade de cálculo no backend.** A RPC v4 **recalcula** `total_bruto`, `total_desconto` e `total_liquido` a partir dos itens e **rejeita** o payload do cliente se divergir mais de 0,02 (`272_reconciliacao_bl1_...:268-271`). O frontend não é autoritativo em valores. Este é o desenho correto.
- **Arredondamento monetário unificado.** `public.round_abnt(numeric, integer)` no SQL e `core/money/roundAbnt.ts` no TS são explicitamente alinhados (meio-para-longe-de-zero), com o TS documentando a equivalência e trazendo fallback para runtime sem `Intl.roundingMode`. Não há divergência de arredondamento.
- **Nenhum `SECURITY DEFINER` sem `search_path`.** Varredura no dump de produção: zero funções `SECURITY DEFINER` sem `SET search_path`. O vetor clássico de hijack está fechado.
- **RLS praticamente universal.** Das tabelas criadas nas migrations, apenas uma está descoberta (DAT-03).
- **Nenhum uso de `SERVICE_ROLE` em código de cliente.** Varredura em `app/`, `components/`, `core/`: zero ocorrências.
- **Seeds demo não contaminaram produção.** `027_seed_produtos_demo_importados_zh.sql` insere IDs fixos (`d1c0d100-...`); busca por esses IDs no dump de produção retorna zero. Os dados demo **não** estão no banco real.
- **Espinha transacional da venda.** Caixa→Venda→Pagamento→Estoque→Financeiro é atômica, com lock otimista (`version`), idempotência e trigger de imutabilidade. Ponto forte real.
- **Bloqueio de estoque insuficiente existe.** `ESTOQUE_INSUFICIENTE` é levantado em `decrementar_estoque_seguro` e `TRANSFERENCIA_ESTOQUE_INSUFICIENTE` nas transferências.
- **Cancelamento estorna estoque.** `050_cancelar_venda_transacional.sql` faz `FOR UPDATE` + devolução da quantidade ao estoque na mesma transação.
- **Histórico de preço é automático.** Trigger `trg_historico_precos_produto` (`20260709184734_259_...:76-77`) — alteração de preço é auditada por trigger, não depende da aplicação lembrar.
- **Integridade referencial do núcleo está íntegra** (verificado no dump de produção, 2026-08-04). Confirma que FLX-01 é uma **exceção isolada**, não um padrão sistêmico:

  | Tabela | Constraints em produção |
  |---|---|
  | `itens_venda` | FK → `vendas` (DEFERRABLE), FK → `produtos`, FK → `regras_preco` (`ON DELETE SET NULL`) |
  | `vendas_pagamentos` | FK → `vendas` (`ON DELETE CASCADE`) + `UNIQUE (venda_id, forma_pagamento)` |
  | `contas_receber` | FK → `clientes`, `lojas`, `vendas` |
  | `estoque` | FK → `lojas`, `produtos` |
  | `caixas` | FK → `lojas`, `usuarios` |
  | **`estoque_baixas`** | **apenas PK — nenhuma FK** ← ver FLX-01 |

- **Duplicidade de cadastro está protegida.** `produtos_codigo_barras_key UNIQUE (codigo_barras)` (GTIN) e `clientes_loja_documento_unique UNIQUE (loja_id, documento) WHERE documento IS NOT NULL` — este último confirma que a migration `20260710212628_266` **aplicou corretamente** em produção (contraste útil com SEC-02). Também há `idx_doc_fiscal_unique_venda_tipo` prevenindo documento fiscal duplicado por venda.

---

## Lacunas desta auditoria (honestidade metodológica)

Não afirmo cobertura total. O que **não** foi possível concluir:

1. **Auditoria 3 (Tela→Backend) ficou parcial.** Rendeu apenas TB-01. Três subagentes foram interrompidos por `HTTP 429` (rate limit) antes de emitir relatório; recuperei a investigação bruta dos transcripts e completei manualmente as auditorias de maior severidade (segurança, dados, fluxo), priorizando risco sobre cobertura. Um varrimento campo-a-campo de todos os formulários **continua pendente**.
2. **Auditoria 5 sobre dados vivos não foi feita.** Não há acesso ao banco de produção. Auditei o **schema** (via dump de 2026-08-02) e os scripts. Afirmações do tipo "existem N registros órfãos" exigiriam query em produção — os tickets DAT tratam da *ausência de guardas* que permite órfãos, não de sua contagem.
3. **O dump tem 2 dias.** Gerado em 2026-08-02 19:08; auditoria em 2026-08-04. Mudanças posteriores não estão refletidas.

**Query de verificação recomendada antes de agir** (roda em produção, somente leitura):

```sql
-- Órfãos em estoque_baixas (dimensiona FLX-01 antes de criar as FKs)
SELECT count(*) FILTER (WHERE v.id IS NULL) AS sem_venda,
       count(*) FILTER (WHERE p.id IS NULL) AS sem_produto
FROM public.estoque_baixas eb
LEFT JOIN public.vendas   v ON v.id = eb.venda_id
LEFT JOIN public.produtos p ON p.id = eb.produto_id;

-- Confirma DAT-01 (esperado: 100% em zero)
SELECT count(*) AS total, count(*) FILTER (WHERE quantidade = 0) AS zerados
FROM public.estoque_baixas;

-- Confirma SEC-02 (esperado hoje: contém OPERADOR)
SELECT pg_get_functiondef(oid) LIKE '%''OPERADOR''%' AS ainda_permite_operador
FROM pg_proc WHERE proname = 'criar_produto_com_estoque_inicial';
```

---

## Ordem de execução recomendada para o Claude Code

Sequenciada por dependência e risco, não por numeração:

| Ordem | Ticket | Porquê nesta posição |
|---|---|---|
| 1 | **SEC-01** | Correção isolada, sem dependência, fecha superfície exposta a `anon`. Começar pelo mais barato e mais grave. |
| 2 | **SEC-02** + TB-01 | Mesma correção resolve os dois. **Investigar a causa do drift antes de corrigir** — se a guarda idempotente engoliu a falha, outras migrations podem ter o mesmo defeito. |
| 3 | **DAT-01** + CA-01 | Mesma migration. Rodar a query de confirmação antes. |
| 4 | **FLX-01** | Depende de DAT-01 estar resolvido e de conhecer a contagem de órfãos. Usar `NOT VALID` + `VALIDATE`. |
| 5 | **FLX-02** | **Bloqueado por decisão executiva** — não é tarefa de engenharia até a direção escolher (a) ou (b). Registrar em ADR-E. |
| 6 | BR-01, BR-03, FLX-03, DAT-02, DAT-03 | P1, após os P0. BR-01 também exige decisão de produto (remover vs. implementar). |
| 7 | BR-02, BR-04 | Acoplados às decisões de FLX-02 e de produto. |

### Decisões que precisam da direção, não do Claude Code

Três tickets **não** são executáveis sem deliberação prévia:

- **FLX-02** — Go-Live com ou sem emissão fiscal? Determina se BR-02 sobe para P0.
- **BR-01** — Limite de crédito: remover o campo ou implementar o enforcement?
- **BR-04** — Reabertura de caixa: vedar ou oferecer ajuste pós-fechamento controlado?

---

## Nota de governança (Chief of Staff)

Dois dos cinco P0 (**SEC-02** e **FLX-02**) compartilham a mesma patologia, e ela é mais séria que qualquer bug individual desta lista: **o sistema reportou sucesso sobre controles que não existiam.** O cron fiscal registrou 1.440 execuções bem-sucedidas por dia durante meses sem emitir uma única requisição HTTP. A migration de revogação do OPERADOR consta aplicada e não teve efeito.

Corrigir os dez tickets sem tratar essa patologia deixa o projeto exposto ao mesmo modo de falha na próxima rodada. A contramedida estrutural é uma só: **teste de CI que reconstrói o schema do zero e o compara com o dump de produção**, mais verificação de efeito (não de execução) para migrations com guarda idempotente.

Aplicando a **Regra de Evidência** do Jinlong: os controles cobertos por SEC-02 e FLX-02 estavam classificados como concluídos sem evidência verificável. O status correto de ambos, até prova em contrário no banco, é **"Em Implementação"**.

