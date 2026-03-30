# AI Guidelines: documentacao vs regra ativa

Este diretorio guarda **documentacao de referencia** para colaboracao com IA.
Os arquivos aqui nao sao interpretados automaticamente pelo Cursor como regras obrigatorias.

## Diferenca importante

- Documentacao (este diretorio):
  - serve como guia de processo, templates e contexto;
  - depende de leitura explicita durante a sessao.

- Regra ativa (`.cursor/rules/*.mdc`):
  - e carregada automaticamente pelo Cursor;
  - influencia o comportamento do agente durante implementacao.

## Fonte de verdade operacional

Para comportamento automatico do agente, considerar sempre:

- `.cursor/rules/governance.mdc`
- `.cursor/rules/security.mdc`

Quando houver divergencia entre este diretorio e `.cursor/rules`, prevalece `.cursor/rules`.
