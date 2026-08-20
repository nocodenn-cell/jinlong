# Comunicado — Promoções Automáticas Ainda Não Existem

**Data:** 2026-08-20
**Público:** equipe comercial/implantação, para alinhar expectativa com o cliente antes/durante o treinamento
**Origem:** achado do teste de preço atacado/varejo de 2026-08-20 (`docs/TESTE_ATACADO_VAREJO_2026-08-20.md`)

---

## O que existe hoje

O sistema resolve automaticamente, na hora da venda, **dois** tipos de preço por produto:

1. **Varejo** — o preço padrão do produto.
2. **Atacado** — um preço menor, aplicado automaticamente quando a quantidade vendida atinge um mínimo configurado (por faixa específica do produto, ou por um mínimo padrão da loja). Isso já foi testado e confirmado funcionando corretamente, inclusive com múltiplas faixas (ex.: 3+ unidades = um preço, 10+ = um preço menor ainda).

Além disso, o **gerente** pode aplicar um **desconto manual** numa venda, dentro de um limite configurado — isso é uma ação humana, autorizada por senha/token do gerente, não uma "promoção" automática.

## O que NÃO existe hoje

**Promoções automáticas por regra** (ex.: "10% off em todos os produtos da categoria X até dia Y", "compre 2 leve 3", "desconto automático em produto específico por período") — **não estão implementadas na engine de preço**, nem no sistema web nem no aplicativo desktop offline.

Existe uma tabela no banco de dados (`regras_preco`) preparada para guardar esse tipo de regra no futuro, e existe até uma coluna na venda para registrar qual promoção foi aplicada — mas **nenhum caminho do sistema lê essa tabela automaticamente durante uma venda hoje**. Se alguém cadastrar uma "promoção" nessa tabela (por exemplo, através de uma tela administrativa que futuramente venha a existir), ela **não terá efeito nenhum** na venda — o sistema vai continuar cobrando o preço de varejo ou atacado normalmente, ignorando a regra cadastrada.

Isso é uma decisão arquitetural conhecida e documentada internamente (ver histórico do item "BL-2" no backlog técnico) — não é um bug, é uma funcionalidade que ainda está no roadmap, planejada mas não construída.

## Por que isso importa para o treinamento de amanhã

Se o cliente perguntar "dá para cadastrar uma promoção de fim de semana que baixa o preço automaticamente sozinha?", a resposta correta é: **"ainda não — hoje o sistema tem preço de varejo e atacado por quantidade, e desconto manual do gerente; promoções automáticas por regra estão no roadmap, sem data definida ainda."**

Evite prometer ou demonstrar qualquer coisa que sugira promoção automática funcionando — a demonstração vai simplesmente não fazer nada (o preço não muda), o que pode ser confuso ou gerar uma expectativa que o sistema não cumpre hoje.

## O que o operador/gerente deve fazer, na prática, se quiser dar um desconto pontual

Usar o **desconto manual do gerente** (token/senha), dentro do limite configurado — essa é a ferramenta disponível hoje para qualquer desconto que não seja o preço de atacado automático por quantidade.

---

**Documentos relacionados:** `docs/TESTE_ATACADO_VAREJO_2026-08-20.md` (evidência técnica completa), `docs/BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md` (item BL-2, promoções automáticas planejadas).
