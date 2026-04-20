# Smoke manual — navegadores chineses (360/QQ)

Este checklist valida renderização e UX i18n no admin/gerente em navegadores chineses antes de Go/No-Go.

## Pré-condições

- Build e deploy já validados no CI (`build-and-test` + smoke pós-deploy).
- Usuário de teste gerente configurado no ambiente alvo.
- Idioma disponível no header (`PT`, `普通话`, `廣東話`).

## Roteiro de smoke (360 e QQ Browser)

Executar o mesmo roteiro em ambos os navegadores:

1. Login com usuário gerente.
2. Ir para `/admin/dashboard`.
3. Trocar idioma para `普通话` e atualizar a página.
4. Validar:
   - textos principais em chinês (`主控台`, `生意看板`);
   - navegação lateral sem truncamento crítico;
   - botões de idioma visíveis e clicáveis;
   - troca de página (`/gerente/produtos`, `/gerente/estoque`) mantém idioma.
5. Em `/gerente/produtos`, provocar erro de validação (preço `0`) e verificar mensagem em chinês (`数据无效` / `資料無效`).
6. Repetir com `廣東話` (`zh-HK`) e validar persistência após refresh.

## Evidências (preencher no PR)

- Browser: `360 Browser`
  - Versão:
  - OS:
  - Resultado: `PASS` / `FAIL`
  - Evidências (screenshots/video/log):
  - Observações:

- Browser: `QQ Browser`
  - Versão:
  - OS:
  - Resultado: `PASS` / `FAIL`
  - Evidências (screenshots/video/log):
  - Observações:

## Critério de aprovação

- Ambos os navegadores com resultado `PASS` no roteiro acima.
- Sem regressão visual severa (layout quebrado, botão inacessível, texto ilegível).
- Idioma persistente após refresh no admin e no gerente.
