# AI Guidelines: documentação vs regra ativa

Este diretório guarda **só a explicação** de como trabalhamos com IA no monorepo (sem templates genéricos duplicados — removidos para reduzir ruído).

## Diferença importante

- **Documentação aqui e em `docs/*.md`:** guia de processo; depende de leitura explícita.
- **Regra ativa (`.cursor/rules/*.mdc`):** carregada automaticamente pelo Cursor.

## Fonte de verdade operacional

1. `.cursor/rules/governance.mdc`
2. `.cursor/rules/security.mdc`
3. Prompt único para sessões autônomas: **`docs/CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md`**

Em conflito entre `docs/` e `.cursor/rules`, prevalece **`.cursor/rules`**.

**Contexto do app web (opcional):** `pdv-importados/.cursorrules` (identidade produto + árvore de pastas).
