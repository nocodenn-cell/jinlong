# Prontidão Focus NFe — Fase C / Gate C2.5: Investigação de Tributação (sem implementação)

**Data:** 2026-09-02
**Escopo:** investigação pura, conforme instruído. **Nenhum código alterado, nenhuma migration criada, nenhum dado corrigido.** Consulta feita contra o Postgres local efêmero (o mesmo ambiente do Gate C1.5, ainda de pé — containers `supabase_*_fastproduct`).

**Limitação metodológica declarada, crítica para interpretar os números abaixo:** este ambiente local tem **20 produtos no total** — não é uma cópia de produção nem uma amostra representativa do catálogo real da Jinlong. É `seed.sql` (dados de desenvolvimento) somado a alguns registros de teste criados por mim mesmo nas sessões anteriores desta missão (Gate C1.5, Onda C2/C2.5 — ex.: "Produto snapshot fiscal", "Produto Prova Destinatario"). **Os números de distribuição abaixo NÃO representam o catálogo real de produção** — não tenho acesso a produção nesta sessão, nem deveria ter. O que É confiável aqui é o **schema** (colunas, constraints, defaults) — que é compartilhado entre este ambiente e produção — não os valores específicos de cada linha.

---

## REGIME

**SIMPLES_NACIONAL** — único valor encontrado em `pdv_config.regime_tributario` no ambiente local (1 linha, a loja seed `LOJA_MATRIZ`). É também o `DEFAULT` da coluna desde a migration `209`. **Confiança: alta para o default/schema; não confirmado para a loja real de produção** (mesma ressalva acima).

## ICMS ORIGEM

**BLOCKED — `icms_origem` ausente.** Confirmado por inspeção direta e completa de `\d public.produtos` (39 colunas listadas, nenhuma chamada `icms_origem` nem equivalente). Isso é um fato de **schema**, não de dado — vale para produção também, com certeza total (o schema é o mesmo).

**Achado relevante, não solução automática**: existe uma coluna `produtos.origem` (`CHECK IN ('china_manual','brasil_nf','brasil_sem_nf')`) — mas é um conceito **operacional diferente** (canal de aquisição/compra do produto dentro do Jinlong), não o código fiscal ICMS de origem (0–8) que a Focus exige. Distribuição local (mesma ressalva de não-representatividade): `china_manual`=13, `brasil_sem_nf`=6, `brasil_nf`=1.

Há uma relação conceitual plausível (`china_manual` provavelmente implica alguma das origens "estrangeira" — `1`/`2`/`6`/`7`; `brasil_nf`/`brasil_sem_nf` provavelmente implicam alguma "nacional" — `0`/`3`/`4`/`5`/`8`), **mas não é uma correspondência 1:1 segura**: a Focus distingue "nacional com >40% de conteúdo estrangeiro" de "nacional com <40%", e "estrangeira com/sem similar nacional" — nenhuma dessas nuances existe no campo `origem` atual. **Não proponho essa derivação automática** — seria inventar uma regra fiscal que ninguém confirmou.

### Menor correção arquitetural proposta (design apenas — nada implementado)

| Aspecto | Proposta |
|---|---|
| **Ownership** | `produtos` (confirmado, não só suposição) — é atributo intrínseco da mercadoria, mesma categoria de NCM/CFOP/CSOSN/CEST, todos já em `produtos` |
| **Coluna** | `icms_origem text`, nullable — mesmo padrão de `csosn`/`cest`/`ncm`/`cfop_produto` já existentes na mesma tabela |
| **Constraint** | `CHECK (icms_origem IS NULL OR icms_origem IN ('0','1','2','3','4','5','6','7','8'))` — mesmo padrão de `chk_produto_ncm_formato`/`chk_produto_cest_formato` já existentes |
| **Valores/default** | **Nenhum default.** Ao contrário de `csosn`/`cst_pis`/`cst_cofins` (que têm defaults seguros para Simples Nacional/isento), não existe valor universal seguro para `icms_origem` — a loja vende importados, então `'0'` (nacional) como default seria especificamente errado, exatamente como você apontou |
| **UI necessária** | Novo campo em `FiscalSection.tsx` (formulário de produto) — select com os 9 valores confirmados. Poderia sugerir (não auto-preencher) um valor inicial baseado em `origem` existente, mas a decisão final precisa ser humana |
| **Snapshot (C1)** | Precisaria ser adicionado ao `jsonb_build_object` do PASSO 9 da RPC de venda (mesmo lugar de `ncm`/`cfop`/etc.) — migration nova, não feita nesta investigação |
| **Compatibilidade com produtos existentes** | Segura — coluna nova nullable com `ADD COLUMN IF NOT EXISTS`, mesmo padrão das migrations 209/210, zero risco a queries/linhas existentes |
| **Estratégia para dados antigos** | Sem default = todos os produtos existentes ficam `NULL` até revisão humana. Proponho (design, não implementado) um índice parcial `idx_produtos_sem_icms_origem` espelhando o já existente `idx_produtos_sem_ncm`, para dar ao gerente uma lista de produtos pendentes de classificação. Emissão deve falhar fechada (não adivinhar) para qualquer produto com `icms_origem IS NULL`, mesmo padrão já usado para NCM ausente |

## CSOSN

Distribuição local (ressalva de não-representatividade já declarada): `400` → 19 produtos, `900` → 1 produto. `400` é o `DEFAULT` da coluna desde a migration 210 — a distribuição observada reflete majoritariamente esse default nunca alterado pelos dados de seed/teste, não uma decisão real de catálogo.

## PIS

Distribuição local: `07` → 19, `01` → 1. `07` é o `DEFAULT` da coluna (mesma ressalva).

## COFINS

Distribuição local: `07` → 19, `01` → 1. `07` é o `DEFAULT` da coluna (mesma ressalva).

## NCM/CFOP/UNIDADE/CEST — completude

| Campo | Local (20 produtos) | Observação |
|---|---|---|
| NCM | 1 com valor, **19 sem** | Confirma o achado da Fase A: `idx_produtos_sem_ncm` existe precisamente porque isso acontece — não é exclusivo deste ambiente de teste |
| CFOP | 1 com valor, **19 sem** | `cfop_produto` é opcional por design (cai no `pdv_config.cfop_padrao`) — "ausente" aqui não é necessariamente um problema, é o fallback funcionando como projetado |
| Unidade | **20/20 com valor** (`UN`) | Coluna `NOT NULL DEFAULT 'UN'` — sempre presente por construção do schema, em produção também (não é um campo que pode faltar) |
| CEST | 1 com valor, **19 sem** | Campo condicional ("só quando aplicável") — ausência não é necessariamente gap |

## PRIMEIRO CENÁRIO FISCAL

Com base nos **defaults do schema** (não nos 20 registros de teste, que são artefato desta sessão): `regime_tributario = SIMPLES_NACIONAL` + `csosn = '400'` + `cst_pis = '07'` + `cst_cofins = '07'` é o cenário que o próprio schema do Jinlong já assume como padrão para todo produto novo. Isso é consistente com "PDV de varejo simples, Simples Nacional, mercadoria não sujeita a tributação diferenciada" — plausivelmente o cenário real do primeiro cliente, mas **não confirmado contra catálogo de produção real** (fora do alcance desta sessão).

**Mesmo neste cenário mais simples possível, `icms_origem` continua bloqueando** — é um campo obrigatório pela Focus independente do CSOSN/CST usado, e não existe em nenhum produto (schema nem dado).

## ALTERAÇÕES NECESSÁRIAS (mínimas, não implementadas)

1. Migration aditiva: `produtos.icms_origem` (proposta completa acima) — não criada nesta investigação.
2. Migration aditiva: incluir `icms_origem` no snapshot C1 (PASSO 9 da RPC de venda) — depende da migration 1.
3. Confirmar contra a Focus (`ItemNotaFiscalXML.html`, seção de tributação) os nomes de campo restantes do grupo ICMS além de `icms_origem`/`icms_situacao_tributaria` (ex.: existe um `icms_valor`/base de cálculo obrigatório mesmo para CSOSN 400, que é "não tributada"? Não confirmado ainda).
4. Decisão de produto: qual regra realmente deriva `icms_origem` por produto (revisão manual via nova UI, ou herança de `origem` com confirmação humana por percentual de conteúdo importado).
5. PIX: decisão de produto sobre modalidade operacional (dinâmico/estático/automático) — confirmado por inspeção do schema (`formas_pagamento` não tem nenhuma coluna de modalidade) que o sistema hoje **não tem como saber** qual modalidade cada loja usa, mesmo que perguntássemos ao operador manualmente sem mudar o schema.

## RESPOSTAS FOCUS

**Continua BLOCKED** — nenhum JSON de exemplo foi fornecido nesta rodada (só a confirmação, já registrada no gate anterior, de que 200 sozinho não determina o estado e de que os 6 rótulos de estado existem). Nada mudou aqui desde o último relatório.

## GATE

Campo fiscal obrigatório do primeiro cenário sem origem legítima: **`icms_origem`** — confirmado ausente do schema inteiro, não é dúvida de dado, é fato de código.

## C2.5 GATE: BLOCKED

Parado. Não iniciei C3, não criei migration, não chamei a Focus, não alterei produção. Aguardando decisão sobre a proposta de `icms_origem` (ownership/coluna/constraint/estratégia, acima) e o restante do grupo de tributação/exemplos de resposta.
