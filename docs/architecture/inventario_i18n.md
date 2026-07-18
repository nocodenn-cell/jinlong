# Inventário / auditoria i18n — estado atual e evolução

| Campo | Valor |
|--------|--------|
| **Missão** | 5.2a — Auditoria i18n existente |
| **Data** | 2026-07-18 |
| **Pré-requisito** | Missão 5.1 (customers + padrão de migração) |
| **ADR** | [ADR-005 §6](../adr/ADR-005-fronteiras-dominio-shared-core.md) · roadmap [Missão 5.2](../roadmap/missao5_fundacao_internacionalizavel.md) |
| **Escopo** | Diagnóstico + proposta — **não** adiciona idiomas, libs, UI nem migra strings |

---

## 1. Diagnóstico executivo

O app **já opera bilíngue PT/ZH** com catálogos grandes e paridade de chaves, persistência em `usuarios.idioma_preferido`, e formatação parcial via `Intl` + locale derivado. Porém a arquitetura é **legado de borda** (`Idioma = 'pt' | 'zh'`), não o núcleo BCP 47 previsto no ADR-005 (`pt-BR` / `zh-CN` / `en-US`).

| Dimensão | Estado hoje | Gap vs alvo 5.2 |
|----------|-------------|-----------------|
| Catálogos UI | `pt.json` + `zh.json` (~2013 strings cada, **0 chaves faltando** entre si) | Falta `en-US`; destino final é shared-core |
| Locale runtime | Tags curtas `pt` / `zh` | Bridge BCP 47 incompleta / não canônica |
| Fallback | Desconhecido → `pt` | Alvo: `requested → pt-BR → key` |
| Formatting | Money/date misturam locale do user e hardcode `pt-BR` / `BRL` | Extrair para `shared-core/formatting` |
| Domínio / errors | Muitas strings PT em actions, policies, `mensagemErroUsuario` | Domínio não deve “conhecer idioma” (ADR-005) |
| Cobertura UI | ~95/251 TSX usam `getMessages` / `useTranslations` | Resto: hardcoded ou parcial |

**Veredito:** base sólida para evoluir; **não** reescrever catálogos do zero. Tratar JSON atual como **fonte de migração**.

---

## 2. Fonte dos catálogos PT / ZH

| Arquivo | Papel |
|---------|--------|
| `pdv-importados/src/lib/i18n/pt.json` | Catálogo português (fonte tipada / SSoT de chaves) |
| `pdv-importados/src/lib/i18n/zh.json` | Catálogo chinês simplificado (paridade de chaves com PT) |

**Namespaces top-level (24):**  
`dashboard`, `relatorios`, `relatorios_sem_giro`, `produtos`, `precos`, `gerente`, `estoque`, `compras`, `caixa`, `pdv`, `admin`, `brand`, `login`, `cadastro_comum`, `categorias_produtos`, `categorias_financeiras`, `fornecedores`, `contas_pagar`, `relatorios_estoque`, `relatorios_vendas`, `configuracoes`, `clientes`, `comum`, `admin_ui`.

**Pós-processamento:** `getMessages.ts` faz `mergeCadastroComum` — mescla `cadastro_comum` em `categorias_produtos` / `categorias_financeiras`.

**Legado paralelo (deprecated):** `lib/i18n/adminChineseUiLabels.ts` — dicionário bilíngue inline + flag `NEXT_PUBLIC_ADMIN_CHINESE_UI`; comentário aponta `getMessages(...).admin` / `admin_ui` como fonte principal.

**Interpolação:** `fmtTemplate` (`{{chave}}`) em `src/lib/i18n/fmtTemplate.ts`.

---

## 3. Carregamento

```
usuarios.idioma_preferido (DB)
  → normalizeIdioma() → Idioma 'pt' | 'zh'
    → getMessages(idioma) | getMessagesWithFallback(unknown)
      → objeto Mensagens (typeof pt)
```

| API | Onde | Notas |
|-----|------|--------|
| `getMessages(idioma)` | Server Components / clients com idioma da sessão | Import estático dos JSON |
| `getMessagesWithFallback` | Normaliza input desconhecido → `getMessages` | Fallback efetivo = **pt** |
| `useTranslations()` | Client + `LanguageProvider` | Resolve chave por path; **não** usa mergeCadastroComum |
| `LanguageProvider` / `useLanguage` | Client context | Estado local default `'pt'` — **paralelo** à sessão DB |
| `setIdiomaAction` | Toggle admin/gerente | UPDATE `idioma_preferido` + `revalidatePath('/admin','layout')` |
| Caixa `idioma/actions` | Toggle PDV | Fluxo espelho no operador |

**Import path alias:** `@/i18n/*` → `src/lib/i18n/*`; `@/idioma/*` → `src/lib/idioma/*`.

**DEC-007:** sem next-intl, sem prefixo de URL — mantido.

---

## 4. Fallback

| Situação | Comportamento atual |
|----------|---------------------|
| `idioma` inválido / ausente | `normalizeIdioma` → `'pt'` |
| Valor `zh-HK` | Mapeado para `'zh'` |
| Chave ausente em `useTranslations` | Devolve a **própria key** (string path) |
| `getMessages` | Catálogo completo tipado — chave inexistente = erro TS em uso tipado; runtime depende do acesso |

**Comentário stale** em `getMessagesWithFallback` (“fallback chinês”) **não** corresponde ao código (sempre normaliza para pt/zh e default pt).

**Alvo ADR-005:** `requested locale → pt-BR → key` (e, para en-US parcial, herdar pt-BR até traduzir).

---

## 5. Locale atual (modelo)

| Conceito | Representação |
|----------|----------------|
| Preferência persistida | `usuarios.idioma_preferido` (`string`; normalizado para `pt` \| `zh`) |
| Tipo app | `export type Idioma = 'pt' \| 'zh'` |
| Toggle UI | Labels `PT` / `普通话` |
| BCP 47 (parcial) | `localeFromIdioma`: `pt`→`pt-BR`, `zh`→`zh-CN` |
| `html lang` | `htmlLangFromIdioma` — mesmo mapeamento |
| en-US | **Inexistente** |
| País/região separado | **Não modelado** (idioma e locale de formatação acoplados via bridge) |

Sessão admin: `loadAdminContext` / `sessionConsistency` lê `idioma_preferido` e aplica `normalizeIdioma`.

---

## 6. Formatação monetária e data

### Dinheiro

| Helper | Locale / moeda | Risco |
|--------|----------------|-------|
| `formatBRL(value, locale?)` | Default `pt-BR`, `currency: 'BRL'` | Moeda **fixada BRL** mesmo se locale = zh-CN |
| `formatDecimalBRL` / `parseBRL` / `filterBRLChars` | Hardcode `pt-BR` e vírgula decimal | Input sempre estilo BR |
| `fmtGerenteBRL(value, locale)` | Usa locale do user + ainda BRL | OK para display bilíngue de número; moeda não internacionaliza |
| `fmtQuantidadeEstoque` | `pt-BR` fixo | Quantidade ignora idioma da sessão |

### Data / hora / fuso

| Área | Comportamento |
|------|----------------|
| `lib/format/datetime.ts` | `toLocaleString(locale)` / `toLocaleDateString` — locale da sessão (bom) |
| Relatórios | `RELATORIO_TZ_PADRAO = 'America/Sao_Paulo'`; override via env / `relatorio_settings.timezone` |
| Dashboard parse | Default tz `America/Sao_Paulo` |

**Alvo:** `shared-core/formatting` + `timezone` (fuso da loja) separados de tradução.

---

## 7. Mensagens de erro e strings fora do catálogo

### Erros

| Fonte | Idioma |
|-------|--------|
| `shared/mensagemErroUsuario` (via `lib/errors`) | PT + mapa de tradução **zh** para padrões conhecidos (login, validação produto, estoque, …) |
| Server Actions / policies | PT hardcoded (ex.: customers `Nome inválido.`, LGPD) |
| Auth guards | PT (`Faça login…`) |

Policies de domínio no shared-core **retornam PT** hoje — aceitável no spike 5.1; na 5.2 devem migrar para **error codes / keys** resolvidos na borda.

### UI fora do catálogo (amostras)

| Local | Exemplo |
|-------|---------|
| `app/admin/clientes/page.tsx` | `subtitle="Cadastro e gestão de clientes"` (título usa `m.clientes`) |
| Actions / toasts | Mistura `getMessages` e literais PT |
| ~156 TSX em app+components | Sem `getMessages` / `useTranslations` |

Cobertura aproximada: **~38%** dos TSX (app+components) passam pelo catálogo.

### Acoplamentos críticos

| Acoplamento | Impacto |
|-------------|---------|
| `Idioma` curto em DB + código | Bloqueia en-US sem bridge |
| Dois caminhos client: sessão DB vs `LanguageProvider` | Risco de divergência se context for usado sem sync |
| `useTranslations` vs `getMessages` (merge cadastro) | Paridade de namespaces pode divergir |
| `adminChineseUiLabels` + flag env | Terceira fonte de copy admin |
| Money sempre BRL | Locale zh muda só separadores, não moeda |
| Domínio (customers) com string PT | Viola “domínio não conhece idioma” até codes |

---

## 8. Componentes / fluxos críticos (piloto 5.2)

Ordem sugerida para piloto de locale BCP 47 (sem redesenhar UI):

1. **Login** — `login` namespace + erros auth  
2. **Caixa / PDV** — `caixa`, `pdv` (alto volume operacional)  
3. **LanguageToggle** + persistência `idioma_preferido`  
4. **Admin shell** — `admin` / `admin_ui` / nav  
5. **Clientes** — já no padrão de domínio; bom para error-code bridge  
6. **Catálogo / estoque** — volume de strings; segundo lote  
7. **Relatórios** — timezone + date formatting  
8. **Financeiro** — money display + labels

---

## 9. Proposta de migração → `pt-BR`, `zh-CN`, `en-US`

Alinhada a ADR-005 §6 e DEC-007 (sem next-intl / sem prefixo URL no D0).

### 9.1 Princípios

1. **Um núcleo** em `@fastproduct/shared-core` (`i18n/`, `locale/`, `formatting/`, `timezone/`).  
2. JSON `pt.json` / `zh.json` = **fonte de migração**, não destino eterno.  
3. Bridge na borda: `pt`↔`pt-BR`, `zh`↔`zh-CN`; DB pode continuar curto até migração de coluna.  
4. **Formatting ≠ translation.**  
5. Domínios emitem **codes**; app resolve mensagem.  
6. Sem instalar next-intl nesta trilha (salvo ADR futuro).

### 9.2 Fases sugeridas

| Fase | Entrega | Código de produto? |
|------|---------|-------------------|
| **5.2a** (esta) | Inventário / auditoria | Não |
| **5.2b** | Scaffold `shared-core` i18n/locale/formatting + tipos BCP 47 + bridge `Idioma`→locale | **Feito** — `@shared-core/src/{locale,i18n,formatting}` |
| **5.2c** | Catalog loader: `pt-BR` (from pt), `zh-CN` (from zh), `en-US` (estrutura; fallback pt-BR) | Sim — sem exigir tradução completa EN |
| **5.2d** | Piloto 1 fluxo (login **ou** caixa header+toggle) usando API nova | Sim — UI sem redesign |
| **5.2e** | Money/date novos paths via `formatting`; timezone loja documentado | Sim — gradual |
| **5.2f+** | Migrar namespaces; error codes em customers; deprecar `adminChineseUiLabels` / dual context | Incremental |

### 9.3 Modelo alvo (resumo)

```
UI / Action
  → resolveLocale(session) → 'pt-BR' | 'zh-CN' | 'en-US'
  → t(key) / getCatalog(locale)     // fallback: locale → pt-BR → key
  → formatMoney(amount, { currency, locale })
  → formatDateTime(value, { locale, timeZone })
```

| Locale | Origem inicial |
|--------|----------------|
| `pt-BR` | Conteúdo atual `pt.json` |
| `zh-CN` | Conteúdo atual `zh.json` |
| `en-US` | Estrutura + fallback pt-BR (tradução sob demanda) |

### 9.4 O que explicitamente não fazer agora

- Adicionar botão EN no toggle  
- Instalar biblioteca i18n  
- Migrar massivamente strings  
- Alterar schema de `idioma_preferido` sem plano  
- Reescrever UI  

---

## 10. GO / NO-GO

| Critério | Status |
|----------|--------|
| Catálogos PT/ZH mapeados e paritários | OK |
| Carregamento / fallback / locale documentados | OK |
| Formatting + timezone + erros + acoplamentos | OK |
| Proposta pt-BR / zh-CN / en-US alinhada ADR-005 | OK |
| Criar runtime / traduzir EN / mudar UI nesta missão | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Prosseguir scaffold i18n no shared-core (5.2b) | **GO** |
| Big-bang de tradução ou next-intl agora | **NO-GO** |

---

## Referências

- Catálogos: `pdv-importados/src/lib/i18n/{pt,zh}.json`  
- APIs: `getMessages.ts`, `useTranslations.ts`, `normalizeIdioma.ts`, `localeFromIdioma.ts`  
- Money/date: `lib/format/money.ts`, `datetime.ts`, `gerenteValues.ts`  
- TZ: `lib/relatorios/periodoRelatorio.ts`, `getRelatorioTimezone.ts`  
- Erros: `shared/mensagemErroUsuario` (+ testes zh)  
- Padrão domínio: [padrao_migracao_dominio.md](./padrao_migracao_dominio.md)  

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Auditoria i18n + proposta migração BCP 47 | 2026-07-18 |
