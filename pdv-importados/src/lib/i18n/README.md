# Traduções (fonte única)

Editar **somente** os JSON desta pasta. Não criar arquivos de tradução em `messages/` ou outros caminhos.

| Arquivo     | Idioma                          |
|-------------|----------------------------------|
| `pt.json`   | Português (operador BR)         |
| `zh.json`   | 普通话 — mandarim simplificado   |

- `getMessages.ts` importa `pt.json` e `zh.json` em runtime.
- O namespace `admin` foi introduzido nos JSONs para unificar a fonte de textos do `/admin` com o restante da aplicação.
- Durante a transição, `lib/i18n/adminChineseUiLabels.ts` usa dual-read:
  1) tenta `getMessages().admin`
  2) fallback para dicionário legado inline (compatibilidade).
- Use `getMessagesWithFallback(...)` quando a origem do idioma for incerta (fallback estável entre zh/pt).
- Use o namespace **`comum`** (não `common`) para textos genéricos.
- **Toda chave presente em `pt.json` deve existir em `zh.json`** — chaves faltando podem causar fallback incorreto ou erros em tempo de execução.
