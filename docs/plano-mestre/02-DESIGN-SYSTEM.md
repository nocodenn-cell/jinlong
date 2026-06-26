# Pilar 2 — Design System

> Define **tokens, componentes, estados, temas, tipografia e espaçamentos**.
> Não descreve regras de negócio (ver [Pilar 4](./04-MODULOS.md)).

Princípio mestre: **é proibida a criação de componentes duplicados**. Sempre
evoluir os componentes existentes. **Nunca usar cores fixas — sempre tokens.**

## 1. Sistema de Tokens

Toda cor, espaçamento, tipografia e raio são consumidos via **tokens**, nunca
valores literais.

### Fonte dos tokens no código (`pdv-importados/styles/`)

| Camada | Arquivo | Papel |
|--------|---------|-------|
| Primitivos | `styles/tokens/base.css` | Paleta crua (jade, gold, imperial-red, night/neutros) |
| Semânticos | `styles/tokens/semantic.css` | Significado contextual (success/warning/danger, texto, borda)¹ |
| Componente | `styles/tokens/component.css` | Tokens por componente |
| Tema | `styles/tokens/theme.css`, `theme-oriental.css` | Superfície/texto/borda/acento do tema **ativo** |
| Índice | `styles/tokens/index.css` | Agrega as camadas |
| Bridge Tailwind | `tailwind.config.js` | Expõe tokens como classes (`bg-primary`, `text-jl-fg-1`, …) |

> ¹ **Divergência conhecida:** `semantic.css` ainda referencia a paleta escura
> legada (`--color-night-950`, `--color-text-primary` claro sobre escuro). Os
> tokens de superfície/texto **ativos** vêm de `theme-oriental.css` (tema claro).
> Tratar `semantic.css` como legado em retirada; não adicionar dependências novas
> a ele sem migrar para o tema claro.

### Cores (tokens canônicos)

| Papel | Cor | Token (tema claro ativo) |
|-------|-----|--------------------------|
| Primária | Azul (Bling) | `--accent` (`#2563eb`), classe `primary` |
| Secundária | Cinza | `secondary` / `--jl-fg-2` |
| Sucesso | Verde-água (jade) | `success` / `--color-dragon-jade-*` |
| Aviso | Laranja (gold) | `warning` / `--color-dragon-gold-*` |
| Erro | Vermelho suave | `destructive` / `--color-dragon-imperial-red-*` |
| Fundo claro | Branco | `--surface` (`#ffffff`) |
| Fundo suave | Cinza claro | `--surface-soft` (`#f8fafc`) |
| Fundo escuro | Grafite | não utilizado — sistema é tema único claro (sem tema escuro) |

**Tokens de superfície JinLong** (hierarquia de cards), expostos no Tailwind como
`jl-*`: `surface-base`, `surface-elev`, `surface-soft`, `border-1/2`,
`fg-1/2/3`, `accent`, e a família `card-l1/l2/l3` (tiers de elevação).

> Nunca utilizar cores fixas. Sempre utilizar tokens. Criar nova paleta é proibido.

### Espaçamentos

Usar **apenas** a escala oficial. Valores arbitrários são proibidos.

```
4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64
```

### Tipografia

Hierarquia única, mesma escala em toda a aplicação:

```
Display · H1 · H2 · H3 · H4 · Body · Small · Caption
```

Alterar a tipografia é proibido.

### Ícones

Biblioteca **única**, mesmo tamanho, mesmo alinhamento, mesmo espaçamento.
Ver `pdv-importados/components/icons`.

### Raio / elevação

Raio via `--radius` (`borderRadius` no Tailwind: `lg/md/sm`). Elevação por
**tier** (ver `VISUAL_PHILOSOPHY.md` — "uma ferramenta dominante de separação
visual por componente").

## 2. Componentes

Catálogo único. Todos os módulos reutilizam os mesmos componentes:

```
Button · IconButton · Card · Input · Select · Combobox · Checkbox · Switch ·
Radio · Textarea · Badge · Avatar · Tooltip · Dialog · Drawer · Tabs · Table ·
Pagination · Toast · Alert · EmptyState · Skeleton · Spinner · Breadcrumb ·
FilterBar · SearchBar
```

### Mapa para o código (`pdv-importados/components/ui/`)

| Componente | Status | Arquivo / nota |
|------------|--------|----------------|
| Button / IconButton | ✅ | `button.tsx`, `button-tokenized.tsx` |
| Card | ✅ | `card.tsx` (+ tiers `jl-card-l*`) |
| Input / Textarea | ✅ | `input.tsx` |
| Select / Combobox | ⏳ | consolidar em `components/ui` (evitar duplicatas em forms) |
| Checkbox / Switch / Radio | ⏳ | padronizar em `components/ui` |
| Badge | ✅ | `badge.tsx`, `badges.tsx` (consolidar os dois) |
| Dialog / Drawer | ✅ | `DragonModal.tsx` |
| Tabs | ⏳ | ModuleTabs do shell |
| Table | ✅ | `DataTable.tsx` |
| Pagination | ⏳ | acoplar ao `DataTable` |
| Toast / Alert | ⏳ | padronizar superfície de feedback |
| EmptyState | ⏳ | criar componente único |
| Skeleton / Spinner | ✅ | `skeleton.tsx` |
| FilterBar / SearchBar | ✅ | `FilterBar.tsx` |
| Cards de métrica | ✅ | `MetricCard.tsx`, `StatCard.tsx` |

> Itens ⏳ existem dispersos ou ainda não unificados. **Antes de criar qualquer
> componente novo, verifique se já existe** em `components/ui` — havendo, evolua-o.
> `badge.tsx` + `badges.tsx` são candidatos a consolidação (proibição de duplicatas).

## 3. Estados dos Componentes

Todo componente deve possuir, com o **mesmo padrão visual**:

`Default · Hover · Focus · Active · Disabled · Loading · Error · Success`

## 4. Estados das Páginas

| Estado | Apresentação |
|--------|--------------|
| Loading | Skeleton (`skeleton.tsx`). |
| Empty | Mensagem amigável + botão de ação (EmptyState). |
| Error | Descrição + botão "Tentar novamente". |
| Dados | Estado normal. |

## 5. Temas

| Tema | Uso | Contraste |
|------|-----|-----------|
| Claro | **Único tema do sistema** (administrativo e PDV) | Maior contraste |

**Contrato vigente e definitivo:** o sistema usa **tema único claro** ("cara de
Bling") — tanto no administrativo quanto no PDV. O modo escuro foi **aposentado
na Fase 0 — Layout Compiler** (`theme.config.ts`: `ACTIVE_THEME = 'classico'`;
`tailwind.config.js` usa um seletor `darkMode` que nunca casa no DOM).

> **Roadmap de tema escuro: removido.** O PDV permanece em tema único claro, sem
> previsão de escuro — decisão final registrada em
> [ADR-PDV-002](../adr/ADR-PDV-tema-escuro.md) (Rejeitado). As cores continuam
> vindo de **tokens** (sem cor fixa) por higiene de design — não como preparo
> para escuro. **Não** usar utilitárias `dark:`. Um eventual tema escuro futuro
> exigiria um **novo** ADR.

## 6. Internacionalização (i18n)

**Toda string usa i18n.** É proibido texto fixo dentro de componentes.

- Implementação: `src/lib/i18n` — `pt.json` (Português) e `zh.json` (Chinês).
- API: `useTranslations.ts`, `LanguageContext.tsx`, `getMessages.ts`.
- Regra: **toda chave em `pt.json` deve existir em `zh.json`**. Namespace de
  textos genéricos é `comum` (não `common`).
- Arquitetura preparada para novos idiomas (adicionar novo JSON + registrar).

## 7. Referências

- `pdv-importados/README_DESIGN_SYSTEM.md` — guia do design system.
- `pdv-importados/DESIGN_SYSTEM_STORYBOOK.md` — Storybook.
- `pdv-importados/DESIGN_TOKENS_MIGRATION_STATUS.md` — status da migração de tokens.
- `pdv-importados/VISUAL_PHILOSOPHY.md` — "Quiet Power".
