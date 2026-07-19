# Padrão de consumo i18n (borda → shared-core)

| Campo | Valor |
|--------|--------|
| **Missão** | 5.2d — Padrão de adoção i18n |
| **Data** | 2026-07-18 |
| **Pré-requisitos** | 5.2a (inventário) · 5.2b (núcleo) · 5.2c (catalogAdapter + login) |
| **Prova de conceito** | `app/login` + `src/lib/i18n/catalogAdapter.ts` |
| **ADRs** | [ADR-005 §6](../adr/ADR-005-fronteiras-dominio-shared-core.md) |
| **Escopo** | Documento reutilizável — **não** move catálogos, **não** migra telas, **não** instala lib, **não** altera runtime |

---

## 1. Propósito

Padronizar como telas e actions futuras consomem mensagens UI e códigos de erro, alinhadas ao núcleo:

```
sessão / cookie (legado pt|zh)
  → resolveLocale()          // shared-core → AppLocale BCP 47
  → catalogAdapter (borda)   // carrega JSON legado + resolveMessage
  → UI / Action              // só strings já resolvidas (ou keys estáveis)
```

**Referência viva:** Login (`getMessagesForLocaleInput` → `LoginForm` com `messages` + `locale`).

**Não é:** big-bang de tradução, next-intl, prefixo de URL, nem mover `pt.json`/`zh.json` para o core nesta trilha.

---

## 2. Camadas e responsabilidades

| Camada | Pacote / pasta | Faz | Não faz |
|--------|----------------|-----|---------|
| **Núcleo locale** | `shared-core/src/locale` | `AppLocale`, `resolveLocale`, bridge `pt`↔`pt-BR` | Carregar JSON |
| **Núcleo i18n** | `shared-core/src/i18n` | `resolveMessage`, `fallbackLocaleChain` | React, Next, cookies |
| **Núcleo formatting** | `shared-core/src/formatting` | `formatMoney` / `formatDate` / `formatNumber` | Tradução de labels |
| **Adapter (borda)** | `pdv-importados/src/lib/i18n/catalogAdapter.ts` | Bridge sessão→catálogo; `getMessagesForLocaleInput`, `tApp` | Regras de domínio |
| **Legado (coexiste)** | `getMessages`, `useTranslations`, JSON | Telas ainda não migradas | Código **novo** de produto |
| **UI / Action** | `app/**` | Consome bundle ou `tApp`; mapeia error code → mensagem | Hardcode de copy em fluxo novo |

```
┌─────────────────────────────────────────────────────────────┐
│ Server Component / Action                                   │
│ cookie | usuarios.idioma_preferido | input desconhecido     │
└───────────────────────────┬─────────────────────────────────┘
                            │ getMessagesForLocaleInput(input)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ catalogAdapter (borda)                                      │
│ resolveLocale → AppLocale                                   │
│ toLegacyIdioma → getMessages(pt|zh)  // tipagem Mensagens   │
│ resolveMessage(catalogs, locale, key) // fallback ADR-005   │
└───────────────────────────┬─────────────────────────────────┘
                            │ { locale, legacyIdioma, messages }
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ UI (RSC ou Client)                                          │
│ m.login.entrar · data-locale={locale} · formatMoney(...)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Como uma tela consome mensagens

### 3.1 Caminho canônico (código novo / piloto)

**Server Component** resolve o bundle e passa props tipadas — espelho do login:

```ts
// page.tsx (Server Component)
import { cookies } from 'next/headers'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'

export default async function MinhaPage() {
  const cookieStore = await cookies()
  const idioma = cookieStore.get('idioma_preferido')?.value
  // ou: idioma da sessão (usuarios.idioma_preferido) quando disponível
  const { messages, locale } = getMessagesForLocaleInput(idioma)

  return <MinhaClient messages={messages} locale={locale} />
}
```

**Client** só renderiza strings do bundle (sem importar JSON nem `resolveLocale`):

```tsx
// MinhaClient.tsx
'use client'
import type { Mensagens } from '@/i18n/getMessages'
import type { AppLocale } from '@shared-core/src/i18n'

type Props = { messages: Mensagens; locale: AppLocale }

export function MinhaClient({ messages: m, locale }: Props) {
  return (
    <section data-locale={locale}>
      <h1>{m.clientes.titulo}</h1>
    </section>
  )
}
```

### 3.2 Chave pontual (toasts, erros mapeados, labels dinâmicos)

Quando a UI não precisa do objeto `Mensagens` inteiro:

| API (borda) | Uso |
|-------------|-----|
| `tApp(input, 'namespace.chave')` | Só o texto final |
| `resolveAppMessage(input, key)` | Texto + `resolvedLocale` + `missing` (telemetria / dev) |

`input` = cookie, `idioma_preferido`, ou `AppLocale` já conhecido. O adapter normaliza via `resolveLocale`.

### 3.3 Server Action

1. Autentica / lê preferência de idioma da sessão.  
2. Executa port/policy (domínio devolve **code** ou resultado tipado — ver §5).  
3. Na borda: `tApp(idioma, 'erros.cliente.nome_invalido')` (ou namespace estável) → devolve string ao client.  
4. **Não** passar catálogo inteiro no wire se um toast basta.

### 3.4 Interpolação

Manter `fmtTemplate` (`{{chave}}`) na borda enquanto os JSON legados usarem esse formato. Domínio **não** monta frase com placeholders de UI; no máximo devolve params tipados (`{ nome }`) para a borda interpolar.

### 3.5 Formatação (não é i18n de catálogo)

Código novo de dinheiro/data/número:

```ts
import { formatMoney, formatDateTime } from '@shared-core/src/formatting'
```

Usar `locale` do bundle (`AppLocale`). **Não** misturar `toLocaleString` ad hoc com locale hardcoded em fluxo novo. Moeda operacional continua BRL até trilha de `currency/` (documentado no inventário).

---

## 4. Política de fallback

### 4.1 Cadeia oficial (ADR-005)

```
requested locale → pt-BR → key
```

Implementação: `fallbackLocaleChain` + `resolveMessage` em `@fastproduct/shared-core/src/i18n`.

| Situação | Resultado |
|----------|-----------|
| Chave existe no locale pedido | String do locale; `missing: false` |
| Chave só em `pt-BR` (ex.: `en-US` sem catálogo) | String PT; `resolvedLocale: 'pt-BR'` |
| Pedido já é `pt-BR` e falta chave | Devolve a **própria key**; `missing: true` |
| Input inválido / vazio | `resolveLocale` → `pt-BR` |

### 4.2 Locales suportados

| `AppLocale` | Catálogo hoje (via adapter) |
|-------------|----------------------------|
| `pt-BR` | `getMessages('pt')` |
| `zh-CN` | `getMessages('zh')` |
| `en-US` | **Omitido** no `CatalogMap` → herda `pt-BR` até existir tradução |

### 4.3 Bridge legado (DB / cookie)

| Persistido / cookie | `AppLocale` | `toLegacyIdioma` (APIs antigas) |
|---------------------|-------------|-------------------------------|
| `pt` | `pt-BR` | `pt` |
| `zh`, `zh-HK` | `zh-CN` | `zh` |
| `en-US` / `en` | `en-US` | `pt` (mensagens PT até catálogo EN) |

**Não alterar** coluna `idioma_preferido` sem plano dedicado. A bridge vive na borda + `shared-core/locale`.

### 4.4 Missing key

- Produção: mostrar a key é aceitável (visível e rastreável); preferir log/dev flag se `missing === true`.  
- **Proibido** em código novo: silenciar com string vazia ou inventar PT hardcoded quando a key deveria existir no catálogo.

---

## 5. Erro de domínio vs mensagem de UI

Regra ADR-005: **nenhum domínio conhece idioma**.

| Camada | Emite | Exemplo |
|--------|-------|---------|
| **Policy / port (shared-core)** | Código estável + params opcionais | `{ code: 'CUSTOMER_NAME_INVALID' }` ou key canônica `customers.validation.nome_invalido` |
| **Adapter / Action (borda)** | Resolve code → string no locale da sessão | `tApp(idioma, 'clientes.erros.nome_invalido')` |
| **UI** | Exibe string já resolvida (toast, `role="alert"`) | Sem `if (locale === 'zh')` |

### 5.1 Estado transitório (dívida aceita)

Policies de customers ainda devolvem **string PT legada** (congelada na migração 5.1). Isso **não** é o padrão para código novo de domínio:

| Aceito (legado / migração em curso) | Alvo (código novo) |
|-------------------------------------|--------------------|
| `error: 'Nome inválido.'` na policy | `code: 'CUSTOMER_NAME_INVALID'` |
| `mensagemErroUsuario` com mapa zh ad hoc | Catálogo + `resolveMessage` / `tApp` |
| Literais PT em LoginForm (erros auth ainda mistos) | Namespace `login.*` / `erros.auth.*` no próximo PR do fluxo |

Ao tocar um domínio já no shared-core: **preferir** introduzir code/key na mesma mudança que altera a mensagem; não expandir literais PT novos.

### 5.2 Separação mental

```
Domínio:  "o que falhou"     → code / result tipado
Borda:    "como dizer isso"  → catálogo + locale
UI:       "onde mostrar"     → layout / a11y
```

---

## 6. Regra para código novo

### Obrigatório

1. Resolver locale com `resolveLocale` / `getMessagesForLocaleInput` — **não** ramificar `if (idioma === 'zh')` para copy.  
2. Labels e copy de fluxo novo via catálogo (`messages.*` ou `tApp`).  
3. Fallback só pela política do núcleo (`resolveMessage`).  
4. Formatting novo via `@shared-core/src/formatting`.  
5. Domínio novo: codes/keys; resolução na borda.  
6. Manter DEC-007: sem next-intl / sem prefixo de URL até ADR dedicado.

### Proibido (em PR de feature nova)

- Instalar biblioteca i18n “só para esta tela”.  
- Segundo dicionário inline (estilo `adminChineseUiLabels`) ou flag env de copy.  
- Mover JSON para shared-core “de passagem”.  
- Big-bang: migrar namespaces inteiros sem piloto.  
- `LanguageProvider` default `'pt'` **desalinhado** da sessão — se o client precisar de context, hidratar a partir do mesmo `locale`/`messages` do servidor.

### Legado permitido (não expandir)

| API | Quando usar |
|-----|-------------|
| `getMessages(idioma)` | Tela ainda não migrada; manutenção mínima |
| `useTranslations()` | Client legado; ao tocar o arquivo, preferir props do adapter |
| `getMessagesWithFallback` | Só se o caller ainda não puder importar `catalogAdapter` |
| Literais PT em actions antigas | Congelar; não copiar o padrão |

---

## 7. Estratégia de migração gradual

### 7.1 Princípios

1. **Um fluxo por PR** (ou missão) — login já é o piloto (5.2c).  
2. **Comportamento observável idêntico** (mesmas chaves / mesmos textos PT-ZH).  
3. Catálogos JSON permanecem na app até missão explícita de relocação.  
4. Coexistência longa: legado e adapter na mesma pasta `src/lib/i18n`.  
5. Não exigir `en-US` completo para migrar um namespace.

### 7.2 Ordem sugerida de consumidores

Alinhada ao inventário 5.2a; ajustar se risco de regressão for maior:

| Ordem | Fluxo | Notas |
|------:|-------|--------|
| ✅ | **Login** | Feito (5.2c) — labels via bundle; erros auth ainda mistos (dívida) |
| 2 | LanguageToggle + persistência | Garantir um único caminho sessão ↔ `AppLocale` |
| 3 | Caixa / PDV header | Alto volume operacional |
| 4 | Admin shell / nav | `admin` / `admin_ui` |
| 5 | Clientes | Domínio já no core — bom para error-code bridge |
| 6 | Catálogo / estoque | Volume de strings |
| 7 | Relatórios | + `formatting` + timezone loja |
| 8 | Financeiro | Money display |

### 7.3 Receita por tela

1. Identificar fonte atual de idioma (cookie vs `loadAdminContext` vs `LanguageProvider`).  
2. Trocar carga para `getMessagesForLocaleInput` no Server Component (ou Action).  
3. Passar `{ messages, locale }` aos clients; remover imports diretos de JSON.  
4. Substituir literais tocados por chaves existentes; **só** adicionar chave se já houver paridade PT/ZH.  
5. Smoke PT + ZH; se `en-US` no input, confirmar fallback PT.  
6. **Não** remover `getMessages` global nem `useTranslations` no mesmo PR.

### 7.4 Error codes (onda paralela)

| Fase | Entrega |
|------|---------|
| A | Congelar strings PT nas policies (já feito em customers) |
| B | Introduzir `code` + manter string legada no result (compat) |
| C | Borda mapeia `code` → `tApp`; UI deixa de depender do literal |
| D | Remover string da policy quando todos os callers usarem code |

### 7.5 Deprecações planejadas (não nesta missão)

- `adminChineseUiLabels` + `NEXT_PUBLIC_ADMIN_CHINESE_UI`  
- Dual context (`LanguageProvider` vs sessão) sem sync  
- Comentários stale em `getMessagesWithFallback`

---

## 8. Checklist (copiar por PR)

### Antes

- [ ] Fluxo/piloto identificado (uma superfície)  
- [ ] Fonte de idioma mapeada (cookie / DB / prop)  
- [ ] Chaves necessárias existem em `pt.json` **e** `zh.json` (ou fallback consciente)  
- [ ] Escopo: sem mover catálogo, sem lib nova, sem redesign  

### Implementação

- [ ] Server: `getMessagesForLocaleInput` (ou `tApp` / `resolveAppMessage`)  
- [ ] Client: props `messages` + `locale` (`AppLocale`); `data-locale` quando útil  
- [ ] Sem `if (zh)` para copy  
- [ ] Formatting novo via shared-core  
- [ ] Domínio tocado: code/key — não literal PT novo  

### Aceite

- [ ] PT e ZH visualmente equivalentes ao antes  
- [ ] Input inválido / `en-US` → texto PT (fallback)  
- [ ] Testes do adapter / núcleo verdes se a borda mudou  
- [ ] `getMessages` legado intacto para o resto do app  

---

## 9. Anti-padrões

| Anti-padrão | Por quê | Fazer em vez disso |
|-------------|---------|-------------------|
| Domínio retorna frase no idioma do user | Viola ADR-005 | Code + resolve na borda |
| `getMessages('pt')` fixo em tela “internacionalizada” | Ignora sessão | `getMessagesForLocaleInput(sessão)` |
| Terceiro JSON / Record bilíngue no componente | Terceira fonte de verdade | Chave no catálogo existente |
| Migrar 24 namespaces num PR | Risco e review inviável | Um fluxo (§7) |
| Instalar next-intl “só no admin” | Quebra DEC-007 / dual stack | Adapter + núcleo atuais |
| `missing` → `''` | Esconde bug de chave | Devolver key; corrigir catálogo |

---

## 10. GO / NO-GO

| Critério | Status |
|----------|--------|
| Consumo canônico documentado (RSC → adapter → UI) | OK |
| Fallback `requested → pt-BR → key` explícito | OK |
| Regra para código novo vs legado coexistente | OK |
| Separação erro de domínio × mensagem UI | OK |
| Migração gradual com ordem e checklist | OK |
| Referência viva (login 5.2c) citada | OK |
| Mover catálogos / migrar telas / lib / runtime nesta missão | **NO-GO** (fora de escopo) |

| Decisão | Resultado |
|---------|-----------|
| Adotar este doc como padrão oficial para consumidores futuros | **GO** |
| Big-bang de telas ou next-intl agora | **NO-GO** |
| Alterar schema `idioma_preferido` nesta missão | **NO-GO** |

---

## Referências

- Inventário: [inventario_i18n.md](./inventario_i18n.md)  
- Migração de domínio: [padrao_migracao_dominio.md](./padrao_migracao_dominio.md)  
- Núcleo: `shared-core/src/{i18n,locale,formatting}`  
- Adapter: `pdv-importados/src/lib/i18n/catalogAdapter.ts`  
- Piloto: `pdv-importados/app/login/page.tsx`, `LoginForm.tsx`  
- Catálogos (fonte de migração): `pdv-importados/src/lib/i18n/{pt,zh}.json`  
- ADR: [ADR-005 §6](../adr/ADR-005-fronteiras-dominio-shared-core.md)  

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Padrão de consumo / adoção i18n | 2026-07-18 |
