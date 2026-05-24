# Dragon UI — Design System Boundary

## Três zonas visuais

O projeto tem **três contextos visuais distintos**, cada um com regras próprias.

```
┌─────────────────────────────────────────────────────────────┐
│  ZONA 1: PDV Operacional (app/caixa/)                       │
│  Design system: Dragon UI / Jin Long COMPLETO               │
│  Tema: dark exclusivo · tokens jl-* obrigatórios            │
│  Componentes canônicos: components/caixa/ + components/ui/  │
│  Enforcement: ESLint warn em violações de token             │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  ZONA 2: Gerente / Backoffice (app/gerente/)                 │
│  Design system: Dragon UI PARCIAL                           │
│  Tema: dark com tokens jl-* (101 ocorrências confirmadas)   │
│  Resíduo legacy: 9 violações slate/gray (mínimo)            │
│  Status: 90%+ conforme, migração gradual em curso           │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  ZONA 3: Admin Dashboard (app/admin/)                        │
│  Design system: LIGHT SEPARADO (Tailwind puro, sem jl-)     │
│  Tema: light (bg-white, text-slate-*, border-slate-*)       │
│  Status: ISENTO das regras Dragon UI                        │
│  Responsável: não faz parte do PDV operacional              │
└─────────────────────────────────────────────────────────────┘
```

---

## Regras de isolamento

### ✅ Permitido
- Componentes de `components/ui/` são compartilhados entre Zonas 1 e 2
- Componentes de `components/gerente/` usam tokens jl- normalmente
- `GerenteLayoutShell` pode co-existir com Dragon UI

### ❌ Proibido
- Importar componentes `app/admin/` em `app/caixa/` ou `app/gerente/`
- Usar classes light (`bg-white`, `text-black`) no PDV operacional
- Usar classes dark (`bg-jl-surface-base`) no admin dashboard
- Criar um quarto design system sem aprovação explícita

---

## Drift silencioso — como prevenir

O maior risco é um desenvolvedor adicionar um componente ao gerente usando classes do admin (text-slate-*, border-slate-200) sem perceber a violação.

**Prevenção ativa:**
1. ESLint `warn` em `app/gerente/` e `components/gerente/` para text-slate-[3-9], bg-slate-[89], border-slate-[4-9]
2. Ao criar componente em `app/gerente/`, sempre verificar se o token jl- existe antes de usar Tailwind direto
3. O `/design-system audit` detecta e reporta violações por zona

---

## Componentes compartilháveis

| Componente | Zona 1 | Zona 2 | Zona 3 |
|---|---|---|---|
| `<SectionLabel>` | ✅ | ✅ | ⚠️ (checar contraste light) |
| `<DragonCard>` | ✅ | ✅ | ❌ |
| `<DragonEmptyState>` | ✅ | ✅ | ❌ |
| `<DragonStatusBadge>` | ✅ | ✅ | ❌ |
| `<DragonFeedbackBanner>` | ✅ | ✅ | ❌ |
| `<DragonOuroLoader>` | ✅ | ✅ | ❌ |
| `<Button variant="secondary">` | ✅ | ✅ | ❌ |
| `<GerenteTable>` | ❌ | ✅ | ❌ |
| `<GerenteStatusBadge>` | ❌ | ✅ | ❌ |

---

## Estratégia de evolução

**Gerente Zona 2:** Migrar as 9 violações restantes na próxima oportunidade (são todas em arquivos editados frequentemente). Não bloquear PRs, mas reportar no `/design-system audit`.

**Admin Zona 3:** Sem plano de migração para Dragon UI no curto prazo. Se o admin crescer significativamente, avaliar criação de design system light explícito ou migração para Dragon UI com tema light.
