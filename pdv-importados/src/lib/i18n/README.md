# Traduções (fonte única)

Editar **somente** os JSON desta pasta. Não criar arquivos de tradução em `messages/` ou outros caminhos.

| Arquivo     | Idioma                          |
|-------------|----------------------------------|
| `pt.json`   | Português (operador BR)         |
| `zh.json`   | 普通话 — mandarim simplificado   |
| `zh-HK.json`| 廣東話 — cantonês / tradicional  |

- `getMessages.ts` importa `pt.json`, `zh.json` e `zh-HK.json` em runtime.
- Use o namespace **`comum`** (não `common`) para textos genéricos.
- **Toda chave presente em `pt.json` deve existir em `zh.json` e `zh-HK.json`** — chaves faltando podem causar fallback incorreto ou erros em tempo de execução.
