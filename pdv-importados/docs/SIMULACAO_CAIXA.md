# Simulação manual de compra no Caixa

Guia rápido para testar o fluxo de venda no `/caixa` usando o seed demo (`027_seed_produtos_demo_importados_zh.sql`) e os incrementos de atacado (`076_seed_preco_atacado_demo.sql`).

> Pré-requisitos no Supabase do ambiente em uso:
> - `027_seed_produtos_demo_importados_zh.sql` (catálogo + estoque)
> - `033_preco_atacado_catalogo.sql` (coluna `preco_atacado` + `quantidade_minima_atacado_padrao`)
> - `076_seed_preco_atacado_demo.sql` (preços atacado para os cenários abaixo)

---

## Como adicionar produto no caixa

- Foco no campo "Código de barras, nome ou categoria…" (atalho `Ctrl+B`).
- Digite o código de barras (ou parte do nome) e pressione `Enter`.
- Cada `Enter` adiciona 1 unidade. Se o mesmo produto já estiver no carrinho, a quantidade soma automaticamente (agregação por produto).
- Ajuste a quantidade clicando no número do item (use teclas ↑/↓ ou digite — os passos agora são inteiros).

---

## Catálogo demo (15 produtos)

| # | Código de barras | Nome | Categoria | Preço | Estoque | Mín | Origem | NF |
|---|------------------|------|-----------|------:|--------:|----:|--------|----|
| 01 | `7898512340001` | 不锈钢保温杯500ml · Garrafa térmica inox 500ml | Casa e utilidades | R$ 89,90 | 40 | 5 | china_manual | Não |
| 02 | `7898512340002` | 日式拉面碗套装（4件）· Conjunto tigelas estilo ramen | Cozinha e mesa | R$ 45,00 | 25 | 4 | china_manual | Não |
| 03 | `7898512340003` | USB-C快充数据线2米 · Cabo USB-C 2m | Acessórios eletrônicos | R$ 22,50 | 120 | 20 | china_manual | Não |
| 04 | `7898512340004` | 迷你桌面加湿器 · Umidificador USB de mesa | Casa e utilidades | R$ 68,00 | 15 | 3 | china_manual | **Sim** |
| 05 | `7898512340005` | 天然竹筷10双装 · Hashis bambu 10 pares | Cozinha e mesa | R$ 12,90 | 200 | 30 | china_manual | Não |
| 06 | `7898512340006` | 旅行收纳袋三件套 · Organizadores de viagem 3 peças | Casa e utilidades | R$ 34,90 | 35 | 5 | china_manual | Não |
| 07 | `7898512340007` | LED护眼台灯可调光 · Luminária LED mesa regulável | Acessórios eletrônicos | R$ 125,00 | 12 | 2 | china_manual | **Sim** |
| 08 | `7898512340008` | 陶瓷马克杯对杯 · Canecas cerâmica par | Cozinha e mesa | R$ 39,90 | 48 | 8 | china_manual | Não |
| 09 | `7898512340009` | 铝合金手机支架 · Suporte celular alumínio | Acessórios eletrônicos | R$ 19,90 | 90 | 15 | china_manual | Não |
| 10 | `7898512340010` | 网红辣条组合包 · Pacote snacks picantes | Lanches e snacks | R$ 15,50 | 60 | 10 | china_manual | Não |
| 11 | `7898512340011` | 茉莉花茶包25袋 · Chá de jasmim 25 sachês | Bebidas | R$ 24,90 | 80 | 12 | china_manual | Não |
| 12 | `7898512340012` | 气泡水蜜桃味500ml · Água gaseificada pêssego 500ml | Bebidas | R$ 6,50 | 150 | 24 | brasil_nf | **Sim** |
| 13 | `7898512340013` | 无线蓝牙耳机充电盒 · Fones Bluetooth com case | Acessórios eletrônicos | R$ 189,00 | 22 | 4 | china_manual | **Sim** |
| 14 | `7898512340014` | 硅胶折叠水壶 · Chaleira silicone retrátil | Cozinha e mesa | R$ 79,00 | 18 | 3 | china_manual | Não |
| 15 | `7898512340015` | 免洗洗手液500ml · Álcool em gel 500ml | Casa e utilidades | R$ 18,90 | 70 | 10 | brasil_sem_nf | Não |

---

## Produtos com regra de atacado

Configurados via `076_seed_preco_atacado_demo.sql`. O caixa aplica `preco_atacado` automaticamente quando a quantidade do produto no carrinho atinge `pdv_config.quantidade_minima_atacado_padrao` (default **6**).

| Código de barras | Nome | Varejo | Atacado (≥ 6 un.) | Δ |
|------------------|------|------:|-----------------:|----:|
| `7898512340010` | Pacote snacks picantes | R$ 15,50 | R$ 12,40 | −20 % |
| `7898512340011` | Chá de jasmim 25 sachês | R$ 24,90 | R$ 19,90 | −20 % |
| `7898512340012` | Água gaseificada pêssego 500ml | R$ 6,50 | R$ 5,20 | −20 % |
| `7898512340005` | Hashis bambu 10 pares | R$ 12,90 | R$ 9,90 | −23 % |
| `7898512340009` | Suporte celular alumínio | R$ 19,90 | R$ 14,90 | −25 % |
| `7898512340003` | Cabo USB-C 2m | R$ 22,50 | R$ 17,90 | −20 % |

---

## Cenários de simulação

### Cenário 1 — Venda simples em DINHEIRO

- Adicione: `7898512340010` (snacks) × 2 + `7898512340012` (água) × 3.
- Total esperado: `2 × 15,50 + 3 × 6,50 = R$ 50,50`.
- Pagamento: `Dinheiro 50,50`.
- Finalize com `F4` ou clique em "Finalizar venda".
- Confira em `/gerente/vendas` se a venda aparece com status `CONCLUIDA`.

### Cenário 2 — Split de pagamento (DINHEIRO + PIX)

- Adicione: `7898512340007` (luminária) × 1 + `7898512340009` (suporte) × 2.
- Total esperado: `125,00 + 2 × 19,90 = R$ 164,80`.
- Pagamento split: `Dinheiro 80,00 + PIX 84,80`.
- Finalize. Soma das parcelas precisa bater exatamente com o total líquido.
- Pré-requisito: `USE_UNIFIED_SALES_FLOW=true` no ambiente. Se estiver `false`, o caixa bloqueia split com mensagem clara.

### Cenário 3 — Desconto de gerente

- Adicione: `7898512340013` (fones) × 1 → R$ 189,00.
- Clique em "Desconto gerente", autentique como gerente e aplique 10%.
- Total esperado: `189,00 − 18,90 = R$ 170,10`.
- Pagamento: `PIX 170,10`. Finalize.
- Verifique no banco que `desconto_gerente_token` foi enviado e validado.

### Cenário 4 — Cancelamento de venda

- Repita Cenário 1 ou 2.
- Vá em `/gerente/vendas/{id}` e clique em "Cancelar venda" com motivo (mín. 2 caracteres).
- Confira:
  - Status volta para `CANCELADA`.
  - Estoque dos itens é estornado.
  - Movimentação financeira reverte.

### Cenário 5 — Estoque baixo / abaixo do mínimo

- Adicione `7898512340007` (luminária, mín=2, estoque=12) × 11.
- Após adicionar, o caixa deve mostrar aviso "estoque abaixo do mínimo" (12 − 11 = 1 < mín 2).
- Útil para validar UX de aviso sem bloquear venda.

### Cenário 6 — Produto sem NF (origem alternativa)

- Use `7898512340015` (álcool gel, `brasil_sem_nf`).
- Confira badge de origem na linha do carrinho.
- Útil para validar rótulos `Sem NF` e relatórios filtrados por origem.

### Cenário 7 — Mistura de origens

- Adicione 1 unidade de cada origem:
  - `7898512340010` (china_manual, sem NF)
  - `7898512340012` (brasil_nf, com NF)
  - `7898512340015` (brasil_sem_nf)
- Total: `15,50 + 6,50 + 18,90 = R$ 40,90`.
- Pagamento: `Cartão Débito 40,90`.
- Útil para validar segmentação fiscal e relatórios por origem.

### Cenário 8 — Disparo automático de atacado

Valida a regra "ao atingir 6 unidades do mesmo produto, troca para `preco_atacado`".

- Limpe o carrinho com "Novo cupom".
- Adicione `7898512340010` (snacks) **5 vezes** (ou edite a quantidade para 5).
  - Esperado: linha com `5 × R$ 15,50 = R$ 77,50`, badge **Varejo**.
- Adicione mais 1 unidade do mesmo produto (total 6).
  - Esperado: linha **inteira** recalculada para `6 × R$ 12,40 = R$ 74,40`, badge muda para **Atacado**.
  - O total geral deve cair em relação ao passo anterior, mesmo com mais 1 unidade — sinal claro do atacado disparou.
- Adicione mais 4 unidades (total 10).
  - Esperado: `10 × R$ 12,40 = R$ 124,00`, ainda **Atacado**.
- Reduza a quantidade para 5 pelo input.
  - Esperado: linha volta para `5 × R$ 15,50 = R$ 77,50`, badge volta para **Varejo**.
- Finalize a venda no melhor preço (10 unidades atacado) com PIX.
- Confira no banco que `vendas_itens.tipo_preco = 'ATACADO'` e `preco_unitario = 12.40` no produto correspondente.

> Mistura útil: adicione 7 × `7898512340012` (água, atacado em R$ 5,20) + 6 × `7898512340005` (hashis, atacado em R$ 9,90) e veja a coluna **Tipo** mostrando **Atacado** em ambos.

### Cenário 9 — Idempotência (duplo Enter / duplo clique em "Finalizar venda")

Valida que pressionar "Finalizar venda" duas vezes em sequência (rede lenta, duplo clique, retry) **não** cria duas vendas.

Pré-requisito: `USE_UNIFIED_SALES_FLOW=true` (sem isso, cada finalização gera UUID novo e não há proteção idempotente).

Passos:

1. Adicione `7898512340007` (luminária) × 1 → R$ 125,00.
2. Defina pagamento `PIX 125,00`.
3. Pressione "Finalizar venda" **duas vezes seguidas** rapidamente (ou dê duplo Enter no botão), antes do toast de sucesso aparecer.
   - Em caso de rede lenta, abra o DevTools → Network → throttling "Slow 3G" para reproduzir com mais facilidade.
4. Esperado:
   - Toast de sucesso aparece **uma única vez**.
   - Em `/gerente/vendas` aparece **apenas 1 venda** com o total esperado.
   - Estoque cai apenas **1 vez** (de 12 para 11 no produto 07).
5. Conferência rápida no banco:

```sql
-- Deve existir apenas 1 venda com a chave de idempotência da última tentativa.
SELECT id, status, total_liquido, idempotency_key, criado_em
FROM vendas
ORDER BY criado_em DESC
LIMIT 3;
```

Notas técnicas:

- O client mantém um `vendaIdempotenciaRef` (UUID estável) entre tentativas até a venda concluir; ele só zera após sucesso ou em "Novo cupom".
- O servidor passa esse UUID como `p_venda_id` na RPC canônica (`finalizar_venda_transacional_canonica_v3`), que é idempotente por essa chave.
- Para verificar o cenário "negativo": defina `USE_UNIFIED_SALES_FLOW=false` no `.env.local` e tente novamente — a proteção some e dois cliques podem virar duas vendas (o `env:check` em produção bloqueia esse caminho).

---

## Atalhos úteis no caixa

- `Enter` — adicionar item (após escanear/digitar código).
- `Ctrl+B` — focar no campo de busca.
- `F4` — finalizar venda.
- `Novo cupom` — limpar carrinho.
- Botão "Sangria (−)" e "Suprimento (+)" — movimentos de caixa.

---

## Conferência rápida no banco (Supabase)

```sql
-- últimas 5 vendas
SELECT id, status, total_liquido, forma_pagamento, criado_em
FROM vendas
ORDER BY criado_em DESC
LIMIT 5;

-- itens da última venda
SELECT v.id AS venda_id, vi.produto_id, p.nome, vi.quantidade,
       vi.preco_unitario, vi.tipo_preco
FROM vendas v
JOIN vendas_itens vi ON vi.venda_id = v.id
JOIN produtos p ON p.id = vi.produto_id
WHERE v.id = (SELECT id FROM vendas ORDER BY criado_em DESC LIMIT 1);

-- estoque de um produto pelo código
SELECT p.nome, e.quantidade_atual, e.estoque_minimo
FROM produtos p
JOIN estoque e ON e.produto_id = p.id
WHERE p.codigo_barras = '7898512340010';

-- conferir quais produtos têm preço atacado configurado e o gatilho atual
SELECT p.codigo_barras, p.nome, p.preco_varejo, p.preco_atacado,
       (SELECT quantidade_minima_atacado_padrao FROM pdv_config WHERE id = 1) AS qtde_min_atacado
FROM produtos p
WHERE p.preco_atacado IS NOT NULL
ORDER BY p.codigo_barras;

-- conferir tipo_preco aplicado em uma venda específica
SELECT v.id, vi.produto_id, p.nome, vi.quantidade,
       vi.preco_unitario, vi.tipo_preco
FROM vendas v
JOIN vendas_itens vi ON vi.venda_id = v.id
JOIN produtos p ON p.id = vi.produto_id
WHERE v.id = 'COLE_O_VENDA_ID_AQUI';
```
