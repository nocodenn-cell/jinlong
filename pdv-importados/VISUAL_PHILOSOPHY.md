# Filosofia Visual — FastProduct / Jīn Lóng

## Quiet Power

Alta densidade. Baixo ruído. Precisão operacional.

O sistema é um **terminal operacional de varejo** — um cockpit, não um painel de marketing.
Cada pixel serve a uma função. Cada elemento comunica estado, não decoração.

---

## O sistema É

- Terminal operacional de varejo
- Cockpit de gestão contínua
- Monitor institucional
- Software de alta frequência de uso

## O sistema NÃO É

- Dashboard de crypto
- SaaS marketing page
- Cyberpunk showcase
- Glassmorphism showcase
- App de consumidor final

---

## Regra de Ouro

**Cada componente usa UMA ferramenta dominante de separação visual.**

| Componente       | Ferramenta dominante      |
|------------------|---------------------------|
| Card painel      | Tonalidade (Elev-1 shadow)|
| Modal / Drawer   | Elevação (Elev-2 shadow)  |
| Dropdown         | Elevação (Elev-2 shadow)  |
| Toolbar          | Contraste de superfície   |
| KPI crítico      | Acento lateral (tier 1)   |
| KPI operacional  | Border semântica (tier 2) |
| Tabela           | Densidade + alinhamento   |
| Estado crítico   | Cor semântica             |
| Ações na tabela  | Opacity fade on hover     |

**Nunca combinar:** border forte + shadow forte + blur + gradient + glow

---

## Regras Canônicas

### Motion
- Somente feedback funcional
- Transições: `duration-150` para estados, `duration-200` para layout
- Proibido: animações contínuas, loops decorativos, pulsos sem significado de estado

### Cor
- Cor comunica **estado**, não decoração
- `amber` → acento primário, alerta operacional
- `emerald` → sucesso, positivo, pago
- `red` → erro, crítico, cancelado
- `sky / violet` → categorias, tipos de entidade
- Proibido: cor para "deixar bonito"

### Shadows
- Usadas para **profundidade**, nunca para espetáculo
- `--jl-elev-1` → superfícies de painel (cards, painéis laterais)
- `--jl-elev-2` → modais, dropdowns (camada acima dos painéis)
- Proibido: `shadow-2xl`, `shadow-lg` soltos, múltiplas shadows empilhadas

### Borders
- Somente **divisão semântica**
- Borders genéricas (`border border-jl-border-1`) são proibidas sobre `dragon-glass-card` — o Elev-1 shadow já define a borda
- Borders **semânticas** são permitidas: `border-amber-400/40` (prioridade), `border-red-400/45` (perigo)

### Tipografia
- Principal ferramenta de hierarquia
- Escala: `text-[26px]` KPI crítico → `text-xl` KPI operacional → `text-sm` dados → `text-xs` metadados → `text-[11px]` contexto → `text-[9px]` mono timestamps
- `tabular-nums` em **todos** os valores numéricos
- `tracking-[0.07em] uppercase` em labels de coluna
- `font-mono` em IDs, timestamps, códigos

### Dados nas tabelas
- Hierarquia de peso de coluna:
  - **Primary** (`priority: 'primary'`): `text-jl-fg-1 font-medium` — valor, produto, cliente, nome
  - **Secondary** (`priority: 'secondary'`): `text-jl-fg-2` — datas, status, tipo (padrão)
  - **Contextual** (`priority: 'contextual'`): `text-jl-fg-3 text-[11px]` — IDs, caixa, operador, metadata
- Ações: `gerente-row-actions` (opacity 0 → 1 on tr:hover)
- Colunas numéricas: sempre `text-right tabular-nums`

---

## Sistema de Elevação

```
Elev-0  superfície base       bg-jl-surface-base          z: 0
Elev-1  cards / painéis       dragon-glass-card            z: 10  shadow: --jl-elev-1
Elev-2  modais / dropdowns    dragon-elev-2                z: 50  shadow: --jl-elev-2
```

Regras:
- Uma superfície nunca usa ferramentas de **dois níveis** ao mesmo tempo
- Modal sobre card: `dragon-elev-2`, não `dragon-glass-card + shadow-xl`
- Dropdown sobre header: `dragon-elev-2`, não `bg + border + shadow`

---

## Hierarquia de MetricCards

```
tier=1  KPI crítico      faixa âmbar lateral + border âmbar + valor bold 26px
tier=2  KPI operacional  border sutil + valor semibold 20px (padrão)
tier=3  KPI compacto     layout horizontal, ícone + label à esq, valor à dir
```

---

## O que é Proibido

- Gradientes grandes como decoração
- Blur pesado (backdrop-filter em superfícies sólidas)
- Glassmorphism forte (blur + transparency sem propósito funcional)
- Animações contínuas sem estado operacional
- Neon / glow decorativo
- Shadows gigantes fora do sistema de elevação
- Charts decorativos (somente dados operacionais)
- Efeitos hover exagerados (scale, transform, glow)
- Cores fora da paleta semântica para "variar"

---

## Tokens de referência

```css
/* Elevação */
--jl-elev-1: 0 0 0 1px rgba(255,255,255,0.055), 0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04);
--jl-elev-2: 0 0 0 1px rgba(255,255,255,0.09), 0 8px 28px rgba(0,0,0,0.52), 0 2px 6px rgba(0,0,0,0.24);

/* Hierarquia de card */
--jl-card-l1-bg:     rgba(15, 23, 42, 0.92)      /* tier 1 */
--jl-card-l1-border: rgba(251, 191, 36, 0.16)
--jl-card-l2-bg:     rgba(15, 23, 42, 0.55)      /* tier 2 */
--jl-card-l2-border: rgba(148, 163, 184, 0.16)
--jl-card-l3-bg:     rgba(15, 23, 42, 0.28)      /* tier 3 */
--jl-card-l3-border: rgba(71, 85, 105, 0.22)
```
