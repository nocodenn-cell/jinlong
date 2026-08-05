# Auditoria Hermes v2 — Vereditos e Fila de Correção

**Data:** 2026-08-04 (rodada 2)
**Escopo:** 7 frentes, incluindo a nova **Auditoria 7 — Fonte Única da Verdade (SSoT)**
**Natureza:** somente leitura. Nenhum arquivo de código foi alterado.
**Base de evidência:** `remote_schema.sql` (dump de produção, 2026-08-02 19:08, UTF-16LE) + 239 migrations + `pdv-importados/`

> Esta rodada usa **veredito obrigatório** por hipótese. `DESCARTADO` não gera ticket, mas fica registrado como evidência de que foi investigado — para que a próxima auditoria não refaça o mesmo trabalho.

## Placar de vereditos

| Veredito | Qtd |
|---|---|
| **CONFIRMADO** | 6 |
| **RISCO** | 3 |
| **DESCARTADO** | 9 |

Tickets novos desta rodada: **9** (6 CONFIRMADO + 3 RISCO). Somados aos 14 da rodada 1 → **23 tickets**, com dois deles (SEC-02, FLX-01) tendo severidade **elevada** pela nova evidência.

---

# MUDANÇAS EM TICKETS DA RODADA 1

## SEC-02 — severidade ampliada (era P0, continua P0, mas o escopo dobrou)

**Veredito:** CONFIRMADO — e **pior que o dimensionado**.

A migration `20260730093000_revoga_operador_cadastro_produto_pdv.sql` tem **duas** partes independentes, e **ambas** falharam silenciosamente em produção:

1. **Parte 1** — remover `'OPERADOR'` de `criar_produto_com_estoque_inicial` → **não aplicada** (já reportado).
2. **Parte 2** (novo achado) — remover a exceção de estoque inicial para OPERADOR em `ajustar_estoque_manual` → **também não aplicada**.

Evidência da parte 2:
- Esperado: `20260730093000_...sql:94-120` substitui o bloco por `IF v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN`
- Real em produção: `remote_schema.sql:88-93` (overload de 7 args) mantém integralmente:
  ```sql
  v_estoque_inicial := p_motivo_codigo = 'ACERTO_INVENTARIO'
    AND COALESCE(BTRIM(p_observacao), '') = 'Estoque inicial no cadastro de produto';
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN')
     AND NOT (v_perfil = 'OPERADOR' AND v_estoque_inicial) THEN
  ```

**Consequência prática:** um OPERADOR pode alterar saldo de estoque diretamente via RPC, desde que envie `p_motivo_codigo='ACERTO_INVENTARIO'` e a observação exata `'Estoque inicial no cadastro de produto'`. A autorização depende de **uma string literal** enviada pelo cliente — o gate é trivialmente satisfeito por quem chama a RPC diretamente.

**Critério de aceite adicional:** ambas as partes verificadas em produção via `pg_get_functiondef`, não apenas o registro de migration aplicada.

## FLX-01 — contexto reforçado

**Veredito:** CONFIRMADO — e agora sabemos que é **exceção isolada**, não padrão.

Verificação de FKs no dump: `itens_venda`, `vendas_pagamentos`, `contas_receber`, `estoque` e `caixas` têm integridade referencial completa. Apenas `estoque_baixas` está sem nenhuma FK. Isso **aumenta** a prioridade relativa (é um outlier num sistema que acerta em todo o resto) e **reduz** o esforço (correção pontual).

---

# ÍNDICE DA RODADA 2

| Arquivo | Conteúdo |
|---|---|
| `01_tickets_confirmados.md` | SSOT-01, SSOT-02, FLX-04 |
| `02_tickets_risco.md` | SSOT-03, SSOT-04, SSOT-05 |
| `03_descartados.md` | DESC-01 a DESC-09 (evidência de investigação) |

## Tickets novos

| ID | Título | Cat. | Veredito | Prio |
|---|---|---|---|---|
| **SSOT-01** | `ajustar_estoque_manual` autoriza OPERADOR por string literal do cliente | Segurança | CONFIRMADO | **P0** |
| **SSOT-02** | Migrations com guarda `pg_get_functiondef` falham silenciosamente (3 arquivos) | Operação | CONFIRMADO | P1 |
| **FLX-04** | `receber_ordem_compra` credita estoque sem conferência | Regra Ausente | CONFIRMADO | P1 |
| **SSOT-03** | Dashboard (TS/fuso do servidor) vs Relatórios (SQL/fuso configurável) | Inconsistência | RISCO | P1 |
| **SSOT-04** | Caminhos de escrita em estoque sem kardex | Inconsistência | RISCO | P1 |
| **SSOT-05** | Autorização em 3 camadas, backend mais permissivo que a tela | Segurança | RISCO | P2 |

## Cobertura por frente

| # | Frente | Resultado |
|---|---|---|
| 1 | Regras de negócio | FLX-04 novo; BR-01..04 (rodada 1) |
| 2 | Cálculos | SSOT-03; DESC-03 |
| 3 | Tela ↔ Backend | **ainda parcial** — ver lacuna abaixo |
| 4 | Segurança | SSOT-01, SSOT-05; DESC-09 |
| 5 | Dados | DESC-06, DESC-07, DESC-08 |
| 6 | Fluxos críticos | **FLX-04 fecha o elo Compra→Recebimento**, não auditado na rodada 1 |
| 7 | **SSoT (nova)** | SSOT-01..05; DESC-01, DESC-02, DESC-04 |

---

## Fila consolidada — ordem de execução

Integrando as duas rodadas. Ordenada por dependência e risco:

| # | Ticket | Observação |
|---|---|---|
| 1 | **SEC-02 + SSOT-01 + TB-01** | **Uma única migration resolve os três.** SSOT-01 é a parte 2 da mesma migration falha. Verificar o efeito em produção, não o registro. |
| 2 | **SEC-01** | Isolado, sem dependência. Resolver junto reduz o escopo de SSOT-04. |
| 3 | **DAT-01 + CA-01** | Mesma migration. Desbloqueia a verificação de SSOT-04. |
| 4 | **FLX-01** | Após DAT-01. `NOT VALID` + `VALIDATE`. |
| 5 | **SSOT-02** | CI de verificação de efeito — impede a recorrência dos itens 1–4. |
| 6 | **FLX-02** | **Bloqueado por decisão executiva.** |
| 7 | SSOT-03, SSOT-04, FLX-04, BR-01, BR-03, FLX-03, DAT-02, DAT-03 | P1 |
| 8 | SSOT-05, BR-02, BR-04 | P2 / dependentes de decisão |

### Decisões pendentes da direção

| Decisão | Bloqueia |
|---|---|
| Go-Live com ou sem emissão fiscal? | FLX-02; define se BR-02 vira P0 |
| Limite de crédito: remover campo ou implementar enforcement? | BR-01 |
| Conferência de recebimento: estender a OC ou migrar OC para `remessas`? | FLX-04 |
| Reabertura de caixa: vedar ou ajuste controlado? | BR-04 |

---

## Lacunas desta rodada

1. **Auditoria 3 (Tela ↔ Campo) segue parcial.** Priorizei SSoT, segurança e o elo Compra→Recebimento — que tinham maior densidade de risco não explorado. O varrimento campo-a-campo dos formulários (`/admin/catalogo`, `/admin/clientes`, `/admin/fornecedores`, `/admin/financeiro`) **continua pendente** e é o candidato natural à rodada 3.
2. **Sem acesso a dados vivos.** Tudo foi auditado sobre schema e código. SSOT-03 e SSOT-04 estão como RISCO precisamente por isso.
3. **Dump com 2 dias** (2026-08-02 19:08).

---

## Nota de governança (Chief of Staff)

A rodada 1 identificou a patologia: *o sistema reporta sucesso sobre controles que não existem*. A rodada 2 **delimitou sua extensão** — e a notícia é boa.

O padrão de falha está confinado a **3 migrations** com patch textual, das quais **1 falhou**. As demais vias de aplicação (DDL direto, `CREATE OR REPLACE` completo, criação de índice) aplicaram corretamente, comprovado por amostragem em produção. Não há corrupção sistêmica do registro de migrations.

Mas o caso que falhou concentra dois P0 (`SEC-02` + `SSOT-01`), porque a migration carregava duas revogações de permissão e ambas caíram juntas. É a materialização exata do risco de agrupar controles de segurança numa aplicação frágil.

O que recomendo registrar como decisão executiva, além das quatro pendentes: **migrations que alteram gate de autorização não usam patch textual** — usam `CREATE OR REPLACE` com corpo completo, e o critério de aceite é a verificação do efeito em produção (`pg_get_functiondef`), nunca o registro em `schema_migrations`.

Aplicando a Regra de Evidência: SEC-02, SSOT-01 e FLX-02 estavam classificados como resolvidos sem evidência verificável. Status correto de todos: **"Em Implementação"**.
